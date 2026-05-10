-- Auto-close inquiries that have been silent for too long with no accepted
-- offer. Keeps the attorney queue from accumulating dead leads.
--
-- Requires the pg_cron extension. On Supabase Pro+ this is preinstalled;
-- enable it with:
--   create extension if not exists pg_cron;
-- (run as the postgres role; no-op if already enabled).

create extension if not exists pg_cron;

-- Drop any prior version of the same job so re-running this migration is safe.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'close-stale-inquiries') then
    perform cron.unschedule('close-stale-inquiries');
  end if;
end $$;

-- Daily at 03:00 UTC: close inquiries that:
--   - are still 'open' or 'engaged' (not converted, closed, or cancelled)
--   - haven't been touched (updated_at) in 14 days
--   - have no offer that the client has already accepted
select cron.schedule(
  'close-stale-inquiries',
  '0 3 * * *',
  $job$
    update public.inquiries i
       set status = 'closed',
           updated_at = now()
     where i.status in ('open', 'engaged')
       and i.updated_at < now() - interval '14 days'
       and not exists (
         select 1 from public.attorney_offers o
          where o.inquiry_id = i.id and o.status = 'accepted'
       );

    -- Also expire offers whose expires_at is in the past and that are still
    -- in 'sent' state (frees up the inquiry's attorney to send a fresh one).
    update public.attorney_offers
       set status = 'expired', decided_at = now()
     where status = 'sent'
       and expires_at is not null
       and expires_at < now();
  $job$
);
