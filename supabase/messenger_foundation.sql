-- ─────────────────────────────────────────────────────────────────────────────
-- Yousafe Messenger — Phase-1 foundation (schema-corrected)
--
-- The prototype's HANDOFF.md assumed `order_conversations` exists with
-- `client_profile_id` / `attorney_profile_id` / `consultant_profile_id`
-- columns, and that `order_messages` carries `conversation_id`, `type`,
-- `attachment_*`, and `ref_*` columns. Neither is true in this database.
-- The real shape (verified live via information_schema):
--
--   conversations          (id, participant_a, participant_b, context_kind,
--                           context_id, status, …)
--   conversation_messages  (id, conversation_id, sender_id, type, body,
--                           attachment_url, attachment_name, ref_offer_id,
--                           ref_order_id, ref_inquiry_id, ref_message_id,
--                           metadata, created_at)  — sender_id IS NOT NULL
--   order_messages         (id, order_id, sender_id, sender_role, body, …)
--                          — no type column, no conversation_id
--
-- This migration is the corrected rewrite:
--
--   • support_tickets.conversation_id → references conversations(id)
--   • inquiry_statuses RLS uses conversations.participant_a/_b with the
--     correct context_kind filter, not the handoff's invented columns
--   • on_support_ticket_decided() inserts into conversation_messages (which
--     has the carrier columns the prototype expects) and tolerates a NULL
--     conversation_id by skipping the system-message insert
--   • conversation_messages.sender_id is made nullable so system rows can
--     be authored by the platform itself
--   • conversation_messages.type CHECK is widened to include 'inquiry' and
--     'offer_request' alongside the existing types
--   • escrow RPCs (refund_order_full, refund_order_partial,
--     release_escrow_now) are NOT yet implemented in this schema — added
--     as RAISE-NOTICE stubs so the trigger fires safely. Replace the stub
--     bodies with the real escrow logic when escrow_system_v2.sql lands.
--   • Two-person rule (decided_by != raised_by) enforced via table CHECK
--   • Trigger atomicity: escrow RPC call wrapped in BEGIN/EXCEPTION that
--     re-raises so a failed refund rolls the ticket UPDATE back
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
      select 1 from public.conversations c
      where (c.participant_a = person_id and c.participant_b = auth.uid())
         or (c.participant_b = person_id and c.participant_a = auth.uid())
    )
  );

drop policy if exists inquiry_statuses_insert_self on public.inquiry_statuses;
create policy inquiry_statuses_insert_self on public.inquiry_statuses
  for insert with check (person_id = auth.uid());

drop policy if exists inquiry_status_views_self on public.inquiry_status_views;
create policy inquiry_status_views_self on public.inquiry_status_views
  for all using (viewer_id = auth.uid()) with check (viewer_id = auth.uid());

/* ── §4d. Widen conversation_messages.type + make sender nullable ───── */

-- Make sender_id nullable so the platform itself can author system messages
-- (e.g. the support-ticket trigger). RLS already gates inserts; nullability
-- is the right shape for system-authored rows.
alter table public.conversation_messages
  alter column sender_id drop not null;

-- Drop the existing CHECK constraint and re-add it with the new message
-- types from §4d ('inquiry', 'offer_request') alongside the existing ones.
do $$
declare
  conname text;
begin
  select tc.constraint_name into conname
  from information_schema.table_constraints tc
  where tc.table_schema = 'public'
    and tc.table_name = 'conversation_messages'
    and tc.constraint_type = 'CHECK'
    and exists (
      select 1 from information_schema.check_constraints cc
      where cc.constraint_name = tc.constraint_name
        and cc.check_clause ilike '%type%'
    )
  limit 1;

  if conname is not null then
    execute format('alter table public.conversation_messages drop constraint %I', conname);
  end if;

  alter table public.conversation_messages
    add constraint conversation_messages_type_check
    check (type in ('text','attachment','offer','offer_request','inquiry','order_event','inquiry_event','system'));
end $$;

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
  conversation_id uuid references public.conversations(id) on delete set null,
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
  constraint support_tickets_two_person check (decided_by is null or decided_by <> raised_by),
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
    if not exists (select 1 from pg_trigger where tgname = 'support_tickets_updated_trg') then
      create trigger support_tickets_updated_trg
        before update on public.support_tickets
        for each row execute function public.handle_updated_at();
    end if;
  end if;
end $$;

alter table public.support_tickets enable row level security;

drop policy if exists support_tickets_read   on public.support_tickets;
drop policy if exists support_tickets_create on public.support_tickets;
drop policy if exists support_tickets_decide on public.support_tickets;

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
    decided_by = auth.uid()
  );

/* ── Escrow RPC stubs ───────────────────────────────────────────────────
   The real refund/release functions belong in escrow_system_v2.sql. Until
   that ships, install RAISE-NOTICE stubs so the trigger fires safely
   instead of erroring with "function does not exist". Replace these
   bodies with the production implementation when ready — signature must
   stay (uuid) / (uuid, bigint). */

create or replace function public.refund_order_full(p_order_id uuid)
returns void language plpgsql security definer as $$
begin
  raise notice 'refund_order_full(%) — stub, awaiting escrow_system_v2.sql', p_order_id;
end $$;

create or replace function public.refund_order_partial(p_order_id uuid, p_amount_cents bigint)
returns void language plpgsql security definer as $$
begin
  raise notice 'refund_order_partial(%, %) — stub, awaiting escrow_system_v2.sql', p_order_id, p_amount_cents;
end $$;

create or replace function public.release_escrow_now(p_order_id uuid)
returns void language plpgsql security definer as $$
begin
  raise notice 'release_escrow_now(%) — stub, awaiting escrow_system_v2.sql', p_order_id;
end $$;

/* Trigger: pending → approved/denied fires the escrow RPC (stubbed for
   now) and drops a system message into the conversation_messages table.
   Wrapped in a sub-block so RPC failure rolls back the UPDATE. */

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
      insert into public.conversation_messages
        (conversation_id, sender_id, type, body, ref_order_id, created_at)
      values
        (new.conversation_id, null, 'system', sys_body, new.order_id, now());
    end if;
  end if;
  return new;
end $$ language plpgsql security definer;

drop trigger if exists support_tickets_decide_trigger on public.support_tickets;
create trigger support_tickets_decide_trigger
  after update on public.support_tickets
  for each row execute function public.on_support_ticket_decided();
