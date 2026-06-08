-- ══════════════════════════════════════════════════════════════════════════════
-- inquiry_offer_cleanup_cron.sql
--
-- Replaces the bare-SQL close-stale-inquiries cron with a proper PL/pgSQL
-- function that also expires consultant_offers and unified chat offers.
-- Logs results to admin_audit_log (same pattern as escrow_auto_release_cron.sql).
--
-- Runs daily at 03:00 UTC.
-- Idempotent — safe to re-run.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Ensure pg_cron is available ──────────────────────────────────────────
create extension if not exists pg_cron;

-- ── 2. Combined cleanup function ────────────────────────────────────────────
-- Steps:
--   1. Close stale inquiries (open/engaged, untouched 14d, no accepted offer)
--   2. Expire attorney_offers past their expires_at
--   3. Expire consultant_offers past their expires_at
--   4. Expire unified chat offers past their expires_at
--   5. Log a summary row to admin_audit_log
create or replace function public.cron_cleanup_inquiries_and_offers()
returns jsonb
language plpgsql
as $$
declare
  v_start           timestamptz := now();
  v_inquiries_closed      integer := 0;
  v_attorney_offers_expired  integer := 0;
  v_consultant_offers_expired integer := 0;
  v_unified_offers_expired   integer := 0;
begin
  -- Step 1: Close stale inquiries (original logic from inquiry_cleanup_cron.sql)
  update public.inquiries i
     set status = 'closed',
         updated_at = now()
   where i.status in ('open', 'engaged')
     and i.updated_at < now() - interval '14 days'
     and not exists (
       select 1 from public.attorney_offers o
        where o.inquiry_id = i.id and o.status = 'accepted'
     );
  GET DIAGNOSTICS v_inquiries_closed = ROW_COUNT;

  -- Step 2: Expire attorney_offers past their expires_at
  update public.attorney_offers
     set status = 'expired',
         decided_at = now()
   where status = 'sent'
     and expires_at is not null
     and expires_at < now();
  GET DIAGNOSTICS v_attorney_offers_expired = ROW_COUNT;

  -- Step 3: Expire consultant_offers past their expires_at
  update public.consultant_offers
     set status = 'expired',
         decided_at = now()
   where status = 'sent'
     and expires_at is not null
     and expires_at < now();
  GET DIAGNOSTICS v_consultant_offers_expired = ROW_COUNT;

  -- Step 4: Expire unified chat offers past their expires_at
  update public.offers
     set status = 'expired',
         updated_at = now()
   where status = 'pending'
     and expires_at is not null
     and expires_at < now();
  GET DIAGNOSTICS v_unified_offers_expired = ROW_COUNT;

  -- Step 5: Audit log entry
  begin
    insert into public.admin_audit_log (admin_id, action_type, target_table, payload_snapshot, reason)
    values (
      null,  -- system action
      'cron_cleanup_inquiries_offers',
      'inquiries',
      jsonb_build_object(
        'inquiries_closed',        v_inquiries_closed,
        'attorney_offers_expired', v_attorney_offers_expired,
        'consultant_offers_expired', v_consultant_offers_expired,
        'unified_offers_expired',  v_unified_offers_expired,
        'processed_at',            v_start
      ),
      'Daily stale inquiry & expired offer cleanup'
    );
  exception when others then
    -- Non-critical — audit log is best-effort
  end;

  return jsonb_build_object(
    'inquiries_closed',        v_inquiries_closed,
    'attorney_offers_expired', v_attorney_offers_expired,
    'consultant_offers_expired', v_consultant_offers_expired,
    'unified_offers_expired',  v_unified_offers_expired,
    'processed_at',            v_start
  );
end;
$$;

-- ── 3. Schedule the job ────────────────────────────────────────────────────
-- Replaces the old close-stale-inquiries job. Runs daily at 03:00 UTC.
do $cron$
begin
  -- Drop the old bare-SQL job if it still exists
  if exists (select 1 from cron.job where jobname = 'close-stale-inquiries') then
    perform cron.unschedule('close-stale-inquiries');
  end if;

  -- Also drop any prior version of our new job so re-running is safe
  if exists (select 1 from cron.job where jobname = 'cleanup-inquiries-offers') then
    perform cron.unschedule('cleanup-inquiries-offers');
  end if;

  perform cron.schedule(
    'cleanup-inquiries-offers',
    '0 3 * * *',         -- every day at 03:00 UTC
    $$ select public.cron_cleanup_inquiries_and_offers(); $$
  );
end $cron$;

-- ── 4. Notify pgrst to reload schema cache ──────────────────────────────────
notify pgrst, 'reload schema';
