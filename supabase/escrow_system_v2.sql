-- =============================================================================
-- escrow_system_v2.sql
-- Full automated escrow infrastructure: milestones, scope changes, auto-release,
-- audit trail, partial releases. Mirrors every state to the client/student lane.
-- Idempotent — safe to run multiple times.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extended escrow status taxonomy
--    Old: held | released | refunded
--    New: held | partial_released | released | disputed | frozen | refunded
-- ---------------------------------------------------------------------------
do $$
begin
  -- Drop old check constraint if present
  if exists (
    select 1 from pg_constraint where conname = 'orders_escrow_status_check'
  ) then
    alter table public.orders drop constraint orders_escrow_status_check;
  end if;
exception when others then null;
end $$;

do $$
begin
  alter table public.orders
    add constraint orders_escrow_status_check
    check (escrow_status is null or escrow_status in (
      'held','partial_released','released','disputed','frozen','refunded'
    ));
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Extend orders table with escrow lifecycle fields
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists escrow_amount             numeric(12,2),  -- current held amount (may differ from total_amount after scope adjustments)
  add column if not exists escrow_released_amount    numeric(12,2) default 0,
  add column if not exists escrow_refunded_amount    numeric(12,2) default 0,
  add column if not exists escrow_disputed_at        timestamptz,
  add column if not exists escrow_dispute_reason     text,
  add column if not exists escrow_frozen_at          timestamptz,
  add column if not exists escrow_frozen_by          uuid references public.profiles(id) on delete set null,
  add column if not exists escrow_frozen_reason      text,
  add column if not exists auto_release_eligible_at  timestamptz,  -- set when status becomes completed; release fires at this time
  add column if not exists auto_release_cancelled_by uuid references public.profiles(id) on delete set null;

-- Backfill escrow_amount from total_amount for existing rows (idempotent — only fills nulls)
update public.orders
   set escrow_amount = total_amount
 where escrow_amount is null
   and total_amount is not null;

-- ---------------------------------------------------------------------------
-- 3. Milestones (for milestone-based payments / staged delivery)
-- ---------------------------------------------------------------------------
create table if not exists public.order_milestones (
  id                       uuid primary key default gen_random_uuid(),
  order_id                 uuid not null references public.orders(id) on delete cascade,
  sequence                 integer not null,                 -- 1, 2, 3 …
  title                    text not null,
  description              text,
  amount                   numeric(12,2) not null check (amount >= 0),
  due_date                 timestamptz,
  status                   text not null default 'pending'
                           check (status in ('pending','in_progress','submitted','approved','rejected','released','cancelled')),
  submitted_at             timestamptz,
  approved_at              timestamptz,
  approved_by              uuid references public.profiles(id) on delete set null,
  rejected_at              timestamptz,
  rejection_reason         text,
  released_at              timestamptz,
  released_amount          numeric(12,2),
  released_by              uuid references public.profiles(id) on delete set null,
  stripe_transfer_id       text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (order_id, sequence)
);

create index if not exists order_milestones_order_idx on public.order_milestones (order_id, sequence);
create index if not exists order_milestones_status_idx on public.order_milestones (status, due_date) where status in ('pending','in_progress','submitted');

-- ---------------------------------------------------------------------------
-- 4. Scope change requests (provider can request extra budget for out-of-scope work)
-- ---------------------------------------------------------------------------
create table if not exists public.order_scope_changes (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders(id) on delete cascade,
  requested_by        uuid references public.profiles(id) on delete set null,
  requested_by_role   text,                                 -- 'attorney','consultant','admin'
  change_type         text not null check (change_type in ('increase','decrease','milestone_add','milestone_remove')),
  amount_delta        numeric(12,2) not null,               -- positive for increase, negative for decrease
  reason              text not null,
  details             jsonb default '{}'::jsonb,            -- extra context (e.g. revision_round, scope_items)
  status              text not null default 'pending'
                      check (status in ('pending','approved','rejected','expired','cancelled')),
  client_decision_at  timestamptz,
  client_decision_by  uuid references public.profiles(id) on delete set null,
  client_reason       text,
  expires_at          timestamptz,                          -- pending requests auto-expire
  applied_at          timestamptz,                          -- when escrow_amount was actually updated
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists scope_changes_order_idx on public.order_scope_changes (order_id, created_at desc);
create index if not exists scope_changes_status_idx on public.order_scope_changes (status, expires_at) where status = 'pending';

-- ---------------------------------------------------------------------------
-- 5. Escrow events — full audit trail of every escrow state change
-- ---------------------------------------------------------------------------
create table if not exists public.escrow_events (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders(id) on delete cascade,
  event_type      text not null check (event_type in (
                    'deposit','partial_release','full_release','refund','dispute_opened',
                    'dispute_resolved','frozen','unfrozen','scope_increase','scope_decrease',
                    'milestone_released','auto_release_scheduled','auto_release_cancelled','admin_force_release'
                  )),
  amount          numeric(12,2),                           -- positive for deposits/holds, negative for releases/refunds
  balance_after   numeric(12,2),                           -- escrow balance after this event
  actor_id        uuid references public.profiles(id) on delete set null,
  actor_role      text,                                    -- 'admin','support','client','attorney','consultant','system'
  reason          text,
  metadata        jsonb default '{}'::jsonb,               -- {milestone_id, scope_change_id, stripe_transfer_id, etc.}
  created_at      timestamptz not null default now()
);

create index if not exists escrow_events_order_idx on public.escrow_events (order_id, created_at desc);
create index if not exists escrow_events_type_idx on public.escrow_events (event_type, created_at desc);

-- ---------------------------------------------------------------------------
-- 6. Auto-release configuration (per platform settings)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from public.platform_settings where id = 'default'
  ) then
    insert into public.platform_settings (id) values ('default');
  end if;
exception when others then null;
end $$;

-- Add settings columns if missing (assumed jsonb structure on platform_settings)
-- These are accessed via platform_settings.auto_release_days; default 7
alter table public.platform_settings
  add column if not exists escrow_auto_release_days integer not null default 7,
  add column if not exists escrow_auto_release_enabled boolean not null default true,
  add column if not exists escrow_dispute_freeze_days integer not null default 30;

-- ---------------------------------------------------------------------------
-- 7. Trigger: automate escrow lifecycle based on order status transitions
--    Status flow:
--      pending/queued/created → escrow held on payment
--      completed → schedule auto_release_eligible_at = now() + auto_release_days
--      released → escrow fully released (provider paid)
--      cancelled/refunded → escrow refunded
--      revision_requested → no escrow change (still held)
-- ---------------------------------------------------------------------------
create or replace function public.escrow_on_order_status_change()
returns trigger
language plpgsql
as $$
declare
  auto_days integer := 7;
  is_enabled boolean := true;
begin
  -- Only react to status changes
  if new.status is not distinct from old.status then
    return new;
  end if;

  -- Read auto-release config
  select coalesce(escrow_auto_release_days, 7),
         coalesce(escrow_auto_release_enabled, true)
    into auto_days, is_enabled
    from public.platform_settings
   where id = 'default'
   limit 1;

  -- Status: completed → schedule auto-release
  if new.status = 'completed' and (old.status is null or old.status <> 'completed') then
    if is_enabled and new.escrow_status = 'held' then
      new.auto_release_eligible_at := now() + (auto_days * interval '1 day');
      insert into public.escrow_events (order_id, event_type, amount, balance_after, actor_role, reason, metadata)
      values (new.id, 'auto_release_scheduled', null, new.escrow_amount, 'system',
              format('Order completed — auto-release in %s days', auto_days),
              jsonb_build_object('eligible_at', new.auto_release_eligible_at));
    end if;
  end if;

  -- Status: revision_requested while completed → cancel scheduled auto-release
  if new.status = 'revision_requested' and old.status = 'completed' then
    if new.auto_release_eligible_at is not null then
      insert into public.escrow_events (order_id, event_type, balance_after, actor_role, reason)
      values (new.id, 'auto_release_cancelled', new.escrow_amount, 'system',
              'Auto-release cancelled — revision requested');
      new.auto_release_eligible_at := null;
    end if;
  end if;

  -- Status: cancelled → refund the held amount
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    if new.escrow_status = 'held' and new.escrow_amount > 0 then
      new.escrow_status := 'refunded';
      new.escrow_refunded_amount := coalesce(new.escrow_refunded_amount, 0) + new.escrow_amount;
      new.escrow_amount := 0;
      insert into public.escrow_events (order_id, event_type, amount, balance_after, actor_role, reason)
      values (new.id, 'refund', -1 * coalesce(new.escrow_refunded_amount, 0), 0, 'system',
              'Order cancelled — funds refunded');
    end if;
  end if;

  -- Status: refunded → mirror to escrow
  if new.status = 'refunded' and new.escrow_status <> 'refunded' then
    new.escrow_status := 'refunded';
    if coalesce(new.escrow_amount, 0) > 0 then
      new.escrow_refunded_amount := coalesce(new.escrow_refunded_amount, 0) + new.escrow_amount;
      new.escrow_amount := 0;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists orders_escrow_status_sync on public.orders;
create trigger orders_escrow_status_sync
before update on public.orders
for each row execute function public.escrow_on_order_status_change();

-- ---------------------------------------------------------------------------
-- 8. RPC: process auto-releases (called by scheduled job or admin "run now")
--    Releases escrow on all orders past their auto_release_eligible_at.
-- ---------------------------------------------------------------------------
create or replace function public.process_escrow_auto_releases()
returns jsonb
language plpgsql
as $$
declare
  released_count integer := 0;
  released_total numeric(12,2) := 0;
  o record;
begin
  for o in
    select id, escrow_amount
      from public.orders
     where auto_release_eligible_at is not null
       and auto_release_eligible_at <= now()
       and escrow_status = 'held'
       and status = 'completed'
       and auto_release_cancelled_by is null
     order by auto_release_eligible_at
     limit 500
  loop
    update public.orders
       set escrow_status = 'released',
           escrow_released_amount = coalesce(escrow_released_amount, 0) + coalesce(escrow_amount, 0),
           escrow_amount = 0,
           auto_release_eligible_at = null,
           status = 'released',
           updated_at = now()
     where id = o.id;

    insert into public.escrow_events (order_id, event_type, amount, balance_after, actor_role, reason)
    values (o.id, 'full_release', -1 * coalesce(o.escrow_amount, 0), 0, 'system',
            'Auto-release: client did not respond within the auto-release window');

    released_count := released_count + 1;
    released_total := released_total + coalesce(o.escrow_amount, 0);
  end loop;

  return jsonb_build_object(
    'released_count', released_count,
    'released_total', released_total,
    'processed_at',   now()
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. RPC: apply approved scope change (atomic — updates escrow + logs event)
-- ---------------------------------------------------------------------------
create or replace function public.apply_scope_change(p_scope_change_id uuid)
returns jsonb
language plpgsql
as $$
declare
  sc record;
  ord record;
  new_amount numeric(12,2);
begin
  -- Lock the scope change
  select * into sc
    from public.order_scope_changes
   where id = p_scope_change_id
   for update;

  if not found then return jsonb_build_object('error', 'scope_change_not_found'); end if;
  if sc.status <> 'approved' then return jsonb_build_object('error', 'scope_change_not_approved'); end if;
  if sc.applied_at is not null then return jsonb_build_object('error', 'already_applied'); end if;

  -- Lock the order and apply delta
  select * into ord from public.orders where id = sc.order_id for update;
  if not found then return jsonb_build_object('error', 'order_not_found'); end if;

  new_amount := coalesce(ord.escrow_amount, 0) + sc.amount_delta;
  if new_amount < 0 then new_amount := 0; end if;

  update public.orders
     set escrow_amount = new_amount,
         total_amount  = coalesce(total_amount, 0) + sc.amount_delta,
         updated_at = now()
   where id = sc.order_id;

  update public.order_scope_changes
     set applied_at = now(), updated_at = now()
   where id = p_scope_change_id;

  insert into public.escrow_events (order_id, event_type, amount, balance_after, actor_id, actor_role, reason, metadata)
  values (
    sc.order_id,
    case when sc.amount_delta >= 0 then 'scope_increase' else 'scope_decrease' end,
    sc.amount_delta,
    new_amount,
    sc.client_decision_by,
    'client',
    sc.reason,
    jsonb_build_object('scope_change_id', sc.id, 'change_type', sc.change_type)
  );

  return jsonb_build_object('order_id', sc.order_id, 'new_escrow_amount', new_amount);
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. RPC: release milestone (partial release of a portion of escrow)
-- ---------------------------------------------------------------------------
create or replace function public.release_milestone(p_milestone_id uuid, p_actor_id uuid)
returns jsonb
language plpgsql
as $$
declare
  ms record;
  ord record;
begin
  select * into ms from public.order_milestones where id = p_milestone_id for update;
  if not found then return jsonb_build_object('error', 'milestone_not_found'); end if;
  if ms.status not in ('approved', 'submitted') then
    return jsonb_build_object('error', 'milestone_not_releasable', 'status', ms.status);
  end if;

  select * into ord from public.orders where id = ms.order_id for update;
  if not found then return jsonb_build_object('error', 'order_not_found'); end if;
  if coalesce(ord.escrow_amount, 0) < ms.amount then
    return jsonb_build_object('error', 'insufficient_escrow', 'available', ord.escrow_amount, 'required', ms.amount);
  end if;

  -- Decrement order escrow + increment released
  update public.orders
     set escrow_amount = escrow_amount - ms.amount,
         escrow_released_amount = coalesce(escrow_released_amount, 0) + ms.amount,
         escrow_status = case
           when escrow_amount - ms.amount <= 0 then 'released'
           else 'partial_released'
         end,
         updated_at = now()
   where id = ms.order_id;

  -- Mark milestone released
  update public.order_milestones
     set status = 'released',
         released_at = now(),
         released_amount = ms.amount,
         released_by = p_actor_id,
         updated_at = now()
   where id = p_milestone_id;

  insert into public.escrow_events (order_id, event_type, amount, balance_after, actor_id, actor_role, reason, metadata)
  values (
    ms.order_id, 'milestone_released', -1 * ms.amount,
    (select escrow_amount from public.orders where id = ms.order_id),
    p_actor_id, 'admin',
    format('Milestone %s released: %s', ms.sequence, ms.title),
    jsonb_build_object('milestone_id', ms.id, 'milestone_sequence', ms.sequence)
  );

  return jsonb_build_object('milestone_id', ms.id, 'amount_released', ms.amount);
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. RPC: admin summary (counts + totals across all escrow states)
-- ---------------------------------------------------------------------------
create or replace function public.admin_escrow_summary()
returns jsonb
language plpgsql
stable
as $$
begin
  return (
    select jsonb_build_object(
      'held_count',              count(*) filter (where escrow_status = 'held'),
      'held_total',              coalesce(sum(escrow_amount) filter (where escrow_status = 'held'), 0),
      'partial_released_count',  count(*) filter (where escrow_status = 'partial_released'),
      'partial_released_total',  coalesce(sum(escrow_amount) filter (where escrow_status = 'partial_released'), 0),
      'released_count',          count(*) filter (where escrow_status = 'released'),
      'released_total',          coalesce(sum(escrow_released_amount) filter (where escrow_status = 'released'), 0),
      'disputed_count',          count(*) filter (where escrow_status = 'disputed'),
      'disputed_total',          coalesce(sum(escrow_amount) filter (where escrow_status = 'disputed'), 0),
      'frozen_count',            count(*) filter (where escrow_status = 'frozen'),
      'frozen_total',            coalesce(sum(escrow_amount) filter (where escrow_status = 'frozen'), 0),
      'refunded_count',          count(*) filter (where escrow_status = 'refunded'),
      'refunded_total',          coalesce(sum(escrow_refunded_amount) filter (where escrow_status = 'refunded'), 0),
      'auto_release_pending',    count(*) filter (where auto_release_eligible_at is not null and auto_release_eligible_at > now() and escrow_status = 'held'),
      'auto_release_ready',      count(*) filter (where auto_release_eligible_at is not null and auto_release_eligible_at <= now() and escrow_status = 'held')
    )
    from public.orders
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. Schema cache reload
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';
