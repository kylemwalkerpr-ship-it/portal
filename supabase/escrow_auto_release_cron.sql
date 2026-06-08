-- ══════════════════════════════════════════════════════════════════════════════
-- escrow_auto_release_cron.sql
--
-- Daily cron job that auto-releases escrow for completed orders past their
-- auto_release_eligible_at window, then marks provider earnings as releasable
-- for each released order.
--
-- Requires pg_cron extension (pre-installed on Supabase Pro+).
-- Idempotent — safe to re-run; drops and re-creates the combined function + job.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Ensure pg_cron is available ──────────────────────────────────────────
create extension if not exists pg_cron;

-- ── 2. Combined function: release escrow + mark earnings ────────────────────
-- Steps:
--   1. Call process_escrow_auto_releases() — releases escrow for all orders
--      past their auto_release_eligible_at
--   2. Look up orders that were just released (via escrow_events in the last
--      minute) and mark their provider earnings as 'releasable'
--   3. Return a summary JSONB of what happened
create or replace function public.cron_auto_release_escrow()
returns jsonb
language plpgsql
as $$
declare
  v_start timestamptz := now();
  v_rpc_result jsonb;
  v_released_count integer := 0;
  v_released_total numeric(12,2) := 0;
  v_earnings_released integer := 0;
  v_earnings_this integer;
  v_order record;
begin
  -- Step 1: Auto-release escrow for eligible orders
  v_rpc_result := public.process_escrow_auto_releases();
  v_released_count := coalesce((v_rpc_result->>'released_count')::integer, 0);
  v_released_total := coalesce((v_rpc_result->>'released_total')::numeric, 0);

  -- Step 2: Find orders released by the RPC in the last 60 seconds
  -- and release their provider earnings
  for v_order in
    select distinct e.order_id
      from public.escrow_events e
     where e.event_type = 'full_release'
       and e.actor_role = 'system'
       and e.created_at >= v_start - interval '60 seconds'
       and e.created_at <= v_start + interval '10 seconds'
       -- Only process actual orders that have provider earnings
       and exists (
         select 1 from public.provider_earnings pe
         where pe.order_id::text = e.order_id::text
           and pe.status = 'owed'
       )
  loop
    begin
      update public.provider_earnings
         set status = 'releasable',
             released_at = now(),
             updated_at = now()
       where order_id::text = v_order.order_id::text
         and status = 'owed';

      GET DIAGNOSTICS v_earnings_this = ROW_COUNT;
      v_earnings_released := v_earnings_released + v_earnings_this;
    exception when others then
      -- Log but don't abort the sweep
      raise warning 'Failed to release earnings for order %', v_order.order_id;
    end;
  end loop;

  -- Step 3: Audit log entry — write directly to the canonical_ledger
  -- if the ledger exists (it may not on all environments)
  begin
    insert into public.admin_audit_log (admin_id, action_type, target_table, payload_snapshot, reason)
    values (
      null,  -- system action
      'cron_auto_release_escrow',
      'orders',
      jsonb_build_object(
        'released_count', v_released_count,
        'released_total', v_released_total,
        'earnings_released', v_earnings_released,
        'processed_at', v_start
      ),
      'Daily auto-release sweep'
    );
  exception when others then
    -- Non-critical — audit log is best-effort
  end;

  return jsonb_build_object(
    'released_count', v_released_count,
    'released_total', v_released_total,
    'earnings_released', v_earnings_released,
    'processed_at', v_start
  );
end;
$$;

-- ── 3. Schedule the job ────────────────────────────────────────────────────
-- Runs daily at 02:00 UTC (adjust as needed for your timezone).
-- NOTE: using $cron$ delimiters to avoid conflict with inner dollar-quoting.
do $cron$
begin
  -- Drop any prior version of the same job so re-running is safe
  if exists (select 1 from cron.job where jobname = 'escrow-auto-release') then
    perform cron.unschedule('escrow-auto-release');
  end if;

  perform cron.schedule(
    'escrow-auto-release',
    '0 2 * * *',         -- every day at 02:00 UTC
    $$ select public.cron_auto_release_escrow(); $$
  );
end $cron$;

-- ── 4. Notify pgrst to reload schema cache ──────────────────────────────────
notify pgrst, 'reload schema';
