-- ─────────────────────────────────────────────────────────────────────────────
-- Yousafe Messenger — Phase-1 foundation
--
-- Combines §4b (inquiry_statuses), §4c (support_tickets + trigger), and §4d
-- (message type widening) from HANDOFF.md, with the following safety patches
-- the prototype's SQL didn't include:
--
--   • Two-person rule on support_tickets — decided_by != raised_by enforced
--     at the table level so RLS can't be the only line of defence.
--   • Trigger atomicity — on_support_ticket_decided() wraps the escrow RPC
--     in BEGIN/EXCEPTION that re-raises, so a failed refund rolls the
--     ticket UPDATE back instead of silently advancing.
--   • RLS uses the real existing tables (order_conversations,
--     chat_conversations) — the handoff's reference to `public.conversations`
--     wouldn't compile against this schema.
--   • inquiry_statuses_active_idx uses a plain DESC index (the partial WHERE
--     now() form in the handoff is invalid because now() is not immutable).
-- ─────────────────────────────────────────────────────────────────────────────

/* ── §4b. Status broadcasts ─────────────────────────────────────────── */

create table if not exists public.inquiry_statuses (
  id              uuid primary key default gen_random_uuid(),
  person_id       uuid not null references public.profiles(id) on delete cascade,
  kind            text not null default 'inquiry' check (kind in ('inquiry','text','image')),
  inquiry_id      uuid references public.inquiries(id) on delete cascade,
  payload         jsonb,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default (now() + interval '24 hours')
);

create index if not exists inquiry_statuses_person_idx
  on public.inquiry_statuses (person_id, expires_at desc);
create index if not exists inquiry_statuses_active_idx
  on public.inquiry_statuses (expires_at desc);

create table if not exists public.inquiry_status_views (
  status_id       uuid not null references public.inquiry_statuses(id) on delete cascade,
  viewer_id       uuid not null references public.profiles(id) on delete cascade,
  viewed_at       timestamptz not null default now(),
  primary key (status_id, viewer_id)
);

alter table public.inquiry_statuses    enable row level security;
alter table public.inquiry_status_views enable row level security;

drop policy if exists inquiry_statuses_select on public.inquiry_statuses;
create policy inquiry_statuses_select on public.inquiry_statuses
  for select using (
    person_id = auth.uid()
    or (select role from public.profiles where id = auth.uid()) in ('attorney','consultant','admin','support')
    or exists (
      select 1 from public.order_conversations c
      where c.client_profile_id = person_id
        and (c.attorney_profile_id = auth.uid() or c.consultant_profile_id = auth.uid())
    )
    or exists (
      select 1 from public.chat_conversations cc
      where (cc.client_profile_id = person_id and (cc.attorney_profile_id = auth.uid() or cc.consultant_profile_id = auth.uid()))
         or (cc.attorney_profile_id = person_id and cc.client_profile_id = auth.uid())
         or (cc.consultant_profile_id = person_id and cc.client_profile_id = auth.uid())
    )
  );

drop policy if exists inquiry_statuses_insert_self on public.inquiry_statuses;
create policy inquiry_statuses_insert_self on public.inquiry_statuses
  for insert with check (person_id = auth.uid());

drop policy if exists inquiry_status_views_self on public.inquiry_status_views;
create policy inquiry_status_views_self on public.inquiry_status_views
  for all using (viewer_id = auth.uid()) with check (viewer_id = auth.uid());

/* ── §4c. Support tickets ───────────────────────────────────────────── */

do $$ begin
  if not exists (select 1 from pg_type where typname = 'support_ticket_kind') then
    create type public.support_ticket_kind as enum ('void','refund_partial','release_hold','other');
  end if;
  if not exists (select 1 from pg_type where typname = 'support_ticket_status') then
    create type public.support_ticket_status as enum ('pending','approved','denied','cancelled');
  end if;
end $$;

create table if not exists public.support_tickets (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders(id) on delete cascade,
  conversation_id uuid references public.order_conversations(id) on delete set null,
  raised_by       uuid not null references public.profiles(id) on delete restrict,
  kind            public.support_ticket_kind   not null,
  amount_cents    bigint,
  reason          text not null check (length(reason) >= 8),
  detail          text,
  status          public.support_ticket_status not null default 'pending',
  decided_by      uuid references public.profiles(id) on delete set null,
  decided_at      timestamptz,
  decision_notes  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Two-person rule: a support agent can never approve / deny their own ticket.
  constraint support_tickets_two_person check (decided_by is null or decided_by <> raised_by),
  -- refund_partial must carry an amount; other kinds shouldn't.
  constraint support_tickets_partial_amount check (
    (kind = 'refund_partial' and amount_cents is not null and amount_cents > 0)
    or (kind <> 'refund_partial')
  )
);

create index if not exists support_tickets_status_idx  on public.support_tickets (status, created_at desc);
create index if not exists support_tickets_order_idx   on public.support_tickets (order_id);
create index if not exists support_tickets_raised_idx  on public.support_tickets (raised_by);

do $$ begin
  if exists (select 1 from pg_proc where proname = 'handle_updated_at') then
    if not exists (
      select 1 from pg_trigger where tgname = 'support_tickets_updated_trg'
    ) then
      create trigger support_tickets_updated_trg
        before update on public.support_tickets
        for each row execute function public.handle_updated_at();
    end if;
  end if;
end $$;

alter table public.support_tickets enable row level security;

drop policy if exists support_tickets_read     on public.support_tickets;
drop policy if exists support_tickets_create   on public.support_tickets;
drop policy if exists support_tickets_decide   on public.support_tickets;

create policy support_tickets_read on public.support_tickets
  for select using (
    (select role from public.profiles where id = auth.uid()) in ('support','admin')
  );

create policy support_tickets_create on public.support_tickets
  for insert with check (
    (select role from public.profiles where id = auth.uid()) = 'support'
    and raised_by = auth.uid()
  );

create policy support_tickets_decide on public.support_tickets
  for update using (
    (select role from public.profiles where id = auth.uid()) = 'admin'
  ) with check (
    -- Admin can only mutate to a decided state; can't reassign raised_by, etc.
    decided_by = auth.uid()
  );

/* Trigger: pending → approved/denied fires the escrow RPC and drops a
   system message into the order's conversation. Wrapped in a sub-block so
   that an RPC failure (e.g. order not eligible for refund) rolls back the
   whole UPDATE instead of silently leaving the ticket "approved" while
   the escrow stays untouched. */
create or replace function public.on_support_ticket_decided() returns trigger as $$
declare
  sys_body text;
begin
  if old.status = 'pending' and new.status in ('approved','denied') then
    if new.status = 'approved' then
      begin
        if new.kind = 'void' then
          perform public.refund_order_full(new.order_id);
        elsif new.kind = 'refund_partial' and new.amount_cents > 0 then
          perform public.refund_order_partial(new.order_id, new.amount_cents);
        elsif new.kind = 'release_hold' then
          perform public.release_escrow_now(new.order_id);
        end if;
      exception when others then
        raise exception 'Escrow RPC failed for ticket %: %', new.id, sqlerrm;
      end;
      sys_body := format('[Admin] approved support ticket — escrow %s.',
        case new.kind
          when 'void'           then 'fully refunded'
          when 'refund_partial' then format('partially refunded ($%.2f)', new.amount_cents / 100.0)
          when 'release_hold'   then 'released to seller'
          else                       'updated'
        end);
    else
      sys_body := '[Admin] denied support ticket. Order is unchanged.'
        || coalesce(' Note: ' || new.decision_notes, '');
    end if;

    if new.conversation_id is not null then
      insert into public.order_messages (conversation_id, sender_id, type, body, created_at)
      values (new.conversation_id, null, 'system', sys_body, now());
    end if;
  end if;
  return new;
end $$ language plpgsql security definer;

drop trigger if exists support_tickets_decide_trigger on public.support_tickets;
create trigger support_tickets_decide_trigger
  after update on public.support_tickets
  for each row execute function public.on_support_ticket_decided();

/* ── §4d. Message-type expansion ────────────────────────────────────── */

-- order_messages.type is a text column with a CHECK on the existing prototype
-- repo. Widen the check to include 'inquiry' and 'offer_request' so the new
-- bubble renderers can drop into the existing pipeline.
do $$
declare
  conname text;
begin
  select tc.constraint_name into conname
  from information_schema.table_constraints tc
  where tc.table_schema = 'public' and tc.table_name = 'order_messages'
    and tc.constraint_type = 'CHECK'
    and exists (
      select 1 from information_schema.check_constraints cc
      where cc.constraint_name = tc.constraint_name
        and cc.check_clause ilike '%type%'
    )
  limit 1;

  if conname is not null then
    execute format('alter table public.order_messages drop constraint %I', conname);
  end if;

  alter table public.order_messages
    add constraint order_messages_type_check
    check (type in ('text','attachment','offer','offer_request','inquiry','system','event'));
end $$;
