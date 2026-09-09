-- =============================================================================
-- client_order_cancellation.sql
--
-- Client-initiated cancellation of genuinely *unstarted* orders, with an
-- atomic, exactly-once financial settlement:
--
--   lock order row (FOR UPDATE)
--     -> verify ownership + eligibility (status, progress, escrow, milestones,
--        provider earnings, disputes/freeze, prior refunds)
--     -> credit the owning client's wallet exactly once (wallet ledger
--        convention: metadata kind:'refund', same as lib/wallet.refundToWallet)
--     -> zero escrow + mark escrow refunded
--     -> cancel provider earnings ('owed'/'releasable' -> 'cancelled') so no
--        payout can ever fire
--     -> cancel open milestones / pending scope changes / auto-release
--     -> write order_events + order_status_history + escrow_events audit trail,
--        and a best-effort append-only canonical_ledger 'refund' credit
--
-- The caller is /api/orders/[id]/cancel which uses the service-role admin
-- client. The RPC is SECURITY DEFINER but EXECUTE is revoked from every
-- non-service role, and the function itself re-verifies that p_caller_id is
-- the order's owning client — it can never be coaxed into refunding someone
-- else's order.
--
-- Money units follow the rest of the schema:
--   orders.amount_paid                 = integer CENTS (captured amount)
--   orders.total_amount / escrow_*     = numeric DOLLARS
--   orders.refunded_amount             = numeric DOLLARS (cumulative)
--   wallet ledger amount_cents         = integer CENTS
--
-- On success the whole function commits as ONE transaction. On any failure
-- (wrong caller, not unstarted, work evidence, a raising wallet_credit, an
-- unavailable column, ...) nothing has been written and nothing is refunded —
-- we never fabricate a refund for an inconsistent monetary state.
--
-- Deployment: run in the Supabase SQL editor (or via the migration apply
-- script) BEFORE enabling the UI. Until it ships, /api/orders/[id]/cancel
-- returns 501 with `deploy_required: true` — the API never falls back to a
-- non-atomic multi-step refund.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Ensure the status-history table exists. It is referenced by
--    lib/checkoutOrders.ts and consultant/admin routes but its DDL is not in
--    every migration set; IF NOT EXISTS keeps this idempotent and safe.
-- ---------------------------------------------------------------------------
create table if not exists public.order_status_history (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders(id) on delete cascade,
  from_status    text,
  to_status      text not null,
  changed_by_id  uuid references public.profiles(id) on delete set null,
  note           text,
  created_at     timestamptz not null default now()
);

create index if not exists order_status_history_order_idx
  on public.order_status_history (order_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 1. The cancellation RPC (atomic single-transaction settlement)
-- ---------------------------------------------------------------------------
create or replace function public.client_cancel_order(
  p_order_id   uuid,
  p_caller_id  uuid,
  p_reason     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_order            public.orders;
  v_refund_cents     integer;
  v_refund_dollars   numeric(12,2);
  v_wallet_balance   integer;
  v_milestone_work   boolean;
  v_earning_paid     boolean;
  v_currency         text;
  v_wallet_currency  text;
  v_now              timestamptz := now();
begin
  if p_order_id is null then
    return jsonb_build_object('ok', false, 'code', 'bad_request', 'message', 'Order id is required.');
  end if;
  if p_caller_id is null then
    return jsonb_build_object('ok', false, 'code', 'bad_request', 'message', 'Caller id is required.');
  end if;

  -- Lock the order row; any concurrent cancellation / start / cancel race
  -- serialises on this lock. The loser sees the winner's committed state.
  select * into v_order
    from public.orders
   where id = p_order_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found', 'message', 'Order not found.');
  end if;

  -- Ownership — only the client who owns the order can cancel it.
  if v_order.client_id is distinct from p_caller_id then
    return jsonb_build_object('ok', false, 'code', 'forbidden', 'message', 'Only the owning client can cancel this order.');
  end if;

  -- Terminal states can never be resurrected / re-cancelled.
  if v_order.status in ('cancelled', 'refunded', 'completed', 'released') then
    return jsonb_build_object('ok', false, 'code', 'already_cancelled',
      'message', format('Order is already %s and cannot be cancelled.', v_order.status));
  end if;

  -- Legitimate unstarted statuses (legacy aliases included).
  if v_order.status not in ('created', 'queued', 'pending', 'new') then
    return jsonb_build_object('ok', false, 'code', 'not_unstarted',
      'message', format('Work has started on this order, so it cannot be cancelled (status %s).', v_order.status));
  end if;

  -- Do not trust a status alias alone — look for real evidence of work.
  if coalesce(v_order.progress, 0) > 0 then
    return jsonb_build_object('ok', false, 'code', 'work_started',
      'message', 'Work has started on this order, so it cannot be cancelled.');
  end if;

  if v_order.payout_status in ('transferred', 'paid', 'released') then
    return jsonb_build_object('ok', false, 'code', 'already_paid_out',
      'message', 'Funds have already been paid out, so this order cannot be cancelled.');
  end if;

  if v_order.escrow_status is distinct from 'held' then
    -- Escrow must be verified HELD: a null/refunded/partial state gives us no
    -- verified balance to reconcile, so we fail safely instead of guessing.
    return jsonb_build_object('ok', false, 'code', 'escrow_not_held',
      'message', format('Escrow must be held to cancel; current escrow status is %s.', coalesce(v_order.escrow_status::text, 'null')));
  end if;
  if coalesce(v_order.escrow_released_amount, 0) > 0 then
    return jsonb_build_object('ok', false, 'code', 'released_funds',
      'message', 'Escrow funds have already been released, so this order cannot be cancelled.');
  end if;
  if coalesce(v_order.escrow_refunded_amount, 0) > 0
     or coalesce(v_order.refunded_amount, 0) > 0
     or v_order.refund_status in ('succeeded', 'refunded', 'wallet_credit_complete')
     or v_order.cancelled_at is not null then
    return jsonb_build_object('ok', false, 'code', 'already_refunded',
      'message', 'This order has already been refunded and cannot be cancelled again.');
  end if;
  if v_order.escrow_status in ('disputed', 'frozen')
     or v_order.escrow_disputed_at is not null
     or v_order.escrow_frozen_at is not null then
    return jsonb_build_object('ok', false, 'code', 'disputed_or_frozen',
      'message', 'This order is disputed or frozen and must be resolved before it can be cancelled.');
  end if;
  if v_order.auto_release_eligible_at is not null then
    return jsonb_build_object('ok', false, 'code', 'in_auto_release',
      'message', 'This order is in the auto-release window and cannot be cancelled.');
  end if;

  -- Milestone evidence: any milestone past 'pending'/'cancelled' = work started.
  select exists(
    select 1 from public.order_milestones m
     where m.order_id = p_order_id
       and m.status not in ('pending', 'cancelled')
  ) into v_milestone_work;
  if v_milestone_work then
    return jsonb_build_object('ok', false, 'code', 'work_started',
      'message', 'Milestone work has begun on this order, so it cannot be cancelled.');
  end if;

  -- Payout evidence: any earning already releasable or paid = money moved.
  select exists(
    select 1 from public.provider_earnings e
     where e.order_id = p_order_id::text
       and e.status in ('releasable', 'paid')
  ) into v_earning_paid;
  if v_earning_paid then
    return jsonb_build_object('ok', false, 'code', 'work_started',
      'message', 'A provider payout is pending or already paid, so this order cannot be cancelled.');
  end if;

  -- ── Monetary state ──────────────────────────────────────────────────────
  -- Authoritative captured amount is amount_paid (integer cents). If it is
  -- missing/inconsistent we refuse to fabricate a refund.
  v_refund_cents := coalesce(v_order.amount_paid, 0);
  if v_refund_cents <= 0 then
    if coalesce(v_order.total_amount, 0) > 0 then
      return jsonb_build_object('ok', false, 'code', 'inconsistent_money',
        'message', 'Order has no captured amount (amount_paid) to refund — refusing to fabricate a refund.');
    end if;
    return jsonb_build_object('ok', false, 'code', 'no_funds',
      'message', 'There are no paid funds on this order to refund.');
  end if;

  -- Verified held escrow: the escrow balance MUST be positive and an EXACT
  -- cent-for-cent match of the captured amount. We never tolerate a one-cent
  -- drift, and we never fabricate a balance from a null/zero/negative value —
  -- legacy orders without a verified balance fail safely (admin reconciliation
  -- can settle them through the existing admin refund path).
  if v_order.escrow_amount is null or v_order.escrow_amount <= 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_escrow',
      'message', 'Order has no verified escrow balance to refund — failed safely without fabricating a balance.');
  end if;
  if round(v_order.escrow_amount * 100) <> v_refund_cents then
    return jsonb_build_object('ok', false, 'code', 'escrow_mismatch',
      'message', format('Escrow balance %s does not exactly match captured funds %s¢ — refusing to fabricate a refund.',
        v_order.escrow_amount, v_refund_cents));
  end if;

  -- ── Currency ─────────────────────────────────────────────────────────────
  -- The wallet ledger (wallet_nmi.sql) is USD-only, so a refund destination is
  -- only coherent when the order is verifiably USD. A NULL order currency is
  -- ambiguous (the DB 'usd' default cannot certify legacy non-USD provenance),
  -- so we reject it rather than assume; a known non-USD order is rejected too.
  v_currency := lower(trim(coalesce(v_order.currency, '')));
  if v_currency = '' then
    return jsonb_build_object('ok', false, 'code', 'currency_unknown',
      'message', 'Order currency is not recorded — refused to credit a wallet in an uncertain currency.');
  end if;
  if v_currency <> 'usd' then
    return jsonb_build_object('ok', false, 'code', 'unsupported_currency',
      'message', format('Refunds are only supported in USD; order currency is %s.', v_currency));
  end if;
  select currency into v_wallet_currency
    from public.student_wallets
   where profile_id = p_caller_id;
  if v_wallet_currency is not null and lower(trim(coalesce(v_wallet_currency, ''))) <> 'usd' then
    return jsonb_build_object('ok', false, 'code', 'wallet_currency_mismatch',
      'message', format('Wallet currency %s does not match order currency usd.', v_wallet_currency));
  end if;

  v_refund_dollars := round(v_refund_cents::numeric / 100, 2);

  -- ── 1. Credit the wallet exactly once (raises -> whole tx rolls back) ─────
  perform public.wallet_credit(
    p_profile_id   => p_caller_id,
    p_amount_cents => v_refund_cents,
    p_description  => 'Refund for cancelled order ' || coalesce(v_order.order_number, p_order_id::text),
    p_reference    => p_order_id::text,
    p_metadata     => jsonb_build_object(
      'kind', 'refund',
      'refund_method', 'wallet',
      'order_id', p_order_id,
      'cancelled_by', p_caller_id,
      'reason', p_reason
    )
  );

  select balance_cents into v_wallet_balance
    from public.student_wallets
   where profile_id = p_caller_id;
  v_wallet_balance := coalesce(v_wallet_balance, v_refund_cents);

  -- ── 2. Record cancellation + zero escrow (single UPDATE; the escrow sync  ──
  -- trigger sees escrow_status='refunded'/escrow_amount=0 and does not
  -- double-refund or double-log). ──────────────────────────────────────────
  update public.orders
     set status                = 'cancelled',
         status_updated_at     = v_now,
         cancelled_at          = v_now,
         cancelled_by          = p_caller_id,
         refunded_at           = v_now,
         refunded_amount       = coalesce(refunded_amount, 0) + v_refund_dollars,
         refund_method         = 'wallet',
         refund_status         = 'succeeded',
         wallet_credit_amount  = coalesce(wallet_credit_amount, 0) + v_refund_dollars,
         escrow_status         = 'refunded',
         escrow_amount         = 0,
         escrow_refunded_amount = coalesce(escrow_refunded_amount, 0) + v_refund_dollars,
         payout_status         = 'cancelled',
         auto_release_eligible_at = null,
         updated_at            = v_now
   where id = p_order_id;

  -- ── 3. Prevent any provider payout ─────────────────────────────────────────
  update public.provider_earnings
     set status = 'cancelled', updated_at = v_now
   where order_id = p_order_id::text
     and status in ('owed', 'releasable');

  -- ── 4. Cancel open milestones (nothing released yet, by the gates above) ──
  update public.order_milestones
     set status = 'cancelled', updated_at = v_now
   where order_id = p_order_id
     and status not in ('cancelled', 'released');

  -- ── 5. Cancel still-open scope changes ─────────────────────────────────────
  update public.order_scope_changes
     set status = 'cancelled', updated_at = v_now
   where order_id = p_order_id
     and status not in ('cancelled', 'rejected', 'approved', 'expired');

  -- ── 6. Audit / history (order_events + order_status_history + escrow_events) ─
  insert into public.order_events (order_id, actor_id, actor_role, from_status, to_status, note)
  values (p_order_id, p_caller_id, 'client', v_order.status, 'cancelled',
          coalesce(p_reason, 'Cancelled by client before work started'));

  insert into public.order_status_history (order_id, from_status, to_status, changed_by_id, note)
  values (p_order_id, v_order.status, 'cancelled', p_caller_id,
          coalesce(p_reason, 'Cancelled by client before work started'));

  insert into public.escrow_events (order_id, event_type, amount, balance_after, actor_id, actor_role, reason, metadata)
  values (p_order_id, 'refund', -1 * v_refund_dollars, 0, p_caller_id, 'client',
          coalesce(p_reason, 'Cancelled by client before work started; funds refunded to wallet'),
          jsonb_build_object('refund_cents', v_refund_cents, 'refund_method', 'wallet', 'cancelled_by', p_caller_id));

  -- ── 7. canonical_ledger (append-only, best effort) ──────────────────────────
  -- Unique (source_table, source_id) makes repeat runs no-ops; a missing
  -- table or a duplicate is swallowed — the wallet ledger is authoritative.
  begin
    insert into public.canonical_ledger (
      profile_id, counterparty_id, amount_cents, currency, balance_after_cents,
      entry_type, direction, source_table, source_id, order_id, description, metadata
    )
    select p_caller_id, null, v_refund_cents, 'usd',
           coalesce((
             select sum(case when cl.direction = 'credit' then cl.amount_cents else -cl.amount_cents end)
               from public.canonical_ledger cl
              where cl.profile_id = p_caller_id
           ), 0) + v_refund_cents,
           'refund', 'credit', 'orders', p_order_id::text, p_order_id,
           'Refund for cancelled order ' || coalesce(v_order.order_number, p_order_id::text),
           jsonb_build_object('kind', 'refund', 'method', 'wallet', 'cancelled_by', p_caller_id);
  exception
    when others then null;
  end;

  return jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'refund_cents', v_refund_cents,
    'refund_method', 'wallet',
    'wallet_balance_cents', v_wallet_balance,
    'from_status', v_order.status,
    'cancelled_at', v_now
  );
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 2. Restrict execution to the service role. No anon/authenticated caller can
--    ever invoke this directly through PostgREST.
-- ---------------------------------------------------------------------------
revoke execute on function public.client_cancel_order(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.client_cancel_order(uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Late-earnings guard: an earning must never become payable on an order
--    that was cancelled/refunded (or already shows refund evidence).
--
--    WHY: checkout/order and offers/[id]/accept create the order FIRST, then
--    credit the provider's earning in a LATER transaction (credit_earning).
--    If client cancellation commits between those two steps, the cancellation's
--    `update provider_earnings set status='cancelled'` sees no row yet — and the
--    later credit_earning would insert a fresh 'owed' earning that is payable
--    for an order that already refunded the client. This trigger closes that
--    window at the database:
--
--      BEFORE INSERT or UPDATE OF status on provider_earnings
--        - guards ONLY transitions INTO owed/releasable/paid
--          (writes INTO 'cancelled'/'refunded' — e.g. the cancellation RPC's own
--           flips — always pass and never lock the parent, so ordinary
--           cancellation is never falsely rejected)
--        - only when the earning's order_id matches a real orders row
--          (provider_earnings.order_id is TEXT; we compare o.id::text =
--          new.order_id so a legacy non-uuid value can never raise a cast error)
--        - locks that parent orders row FOR UPDATE (the SAME lock
--          client_cancel_order holds), so the decision is made on the parent's
--          committed state and serialises with cancellation
--        - rejects when the parent is cancelled/refunded or shows refund
--          evidence (refunded_amount, refund_status, escrow_refunded_amount,
--          cancelled_at). NB: auto_release_eligible_at is deliberately NOT
--          refund evidence — it is set on every completed order awaiting its
--          scheduled auto-release, and the auto-release cron legitimately
--          flips earnings to 'releasable' there, so treating it as evidence
--          would break normal payout on completed orders.
--          NOTE: 'completed'/'released' parents are NOT rejection triggers —
--          legitimate admin payout (owed->releasable->paid) on a completed
--          order must keep working.
--        - no matching parent row => legacy service/non-order earnings pass.
--
--    LOCK-ORDER / DEADLOCK CONSIDERATIONS (documented, by design):
--      client_cancel_order      : orders (FOR UPDATE) -> provider_earnings rows
--      credit_earning / release_earnings_for_order / record_payout
--                               : provider_earnings    -> orders (via trigger)
--    This is a lock-order inversion. PostgreSQL resolves it with deadlock
--    detection (SQLSTATE 40P01): the victim transaction is aborted and EVERY
--    write it made in that transaction (wallet credit, order fields, escrow
--    events, earnings) rolls back together — a deadlock can never leave a
--    partial financial mutation. Both sides are retryable/idempotent. The
--    trigger only takes the parent lock for payable-state writes on
--    order-linked earnings, keeping the window minimal.
-- ---------------------------------------------------------------------------
create or replace function public.guard_provider_earnings_payable()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_order_status   text;
  v_refund_evidence boolean;
begin
  -- Only guard transitions INTO payable states. Cancellation's own flips to
  -- 'cancelled'/'refunded' always pass and never take the parent lock.
  if new.status not in ('owed', 'releasable', 'paid') then
    return new;
  end if;

  if new.order_id is null or new.order_id = '' then
    return new; -- non-order earnings have nothing to reconcile
  end if;

  -- Lock the parent order (same lock as client_cancel_order) and judge on its
  -- live state. order_id is TEXT in provider_earnings: compare the uuid column
  -- via ::text so a legacy non-uuid value can never raise a cast error.
  select o.status,
         (coalesce(o.refunded_amount, 0) > 0
          or o.refund_status in ('succeeded', 'refunded', 'wallet_credit_complete')
          or coalesce(o.escrow_refunded_amount, 0) > 0
          or o.cancelled_at is not null)
    into v_order_status, v_refund_evidence
    from public.orders o
   where o.id::text = new.order_id
   for update;

  if not found then
    return new; -- no orders row for this earning -> legacy service convention
  end if;

  if v_order_status in ('cancelled', 'refunded') or v_refund_evidence then
    raise exception
      'ORDER_CANCELLED_EARNING_GUARD: earning (%) cannot be created or reactivated on order % because the order is % or refunded',
      new.status, new.order_id, v_order_status;
  end if;

  return new;
end;
$fn$;

drop trigger if exists provider_earnings_payable_guard on public.provider_earnings;
create trigger provider_earnings_payable_guard
  before insert or update of status on public.provider_earnings
  for each row execute function public.guard_provider_earnings_payable();

-- ---------------------------------------------------------------------------
-- 4. Reload schema cache so PostgREST exposes the new RPC to the admin client
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';