-- =============================================================================
-- gsc_connection.sql
--
-- Server-side store for the Google Search Console OAuth connection used by the
-- admin dashboard's Search & Traffic tab. Single row. The in-app "Connect
-- Search Console" flow (/api/admin/analytics/gsc/connect → /callback) writes
-- the refresh_token + detected site_url; client_id/client_secret are seeded
-- out-of-band. RLS is ON with no policies, so only the service-role key
-- (server) can read it — credentials never reach the browser.
-- =============================================================================

create table if not exists public.gsc_connection (
  id              integer primary key default 1,
  client_id       text,
  client_secret   text,
  refresh_token   text,
  site_url        text,
  connected_email text,
  connected_at    timestamptz,
  constraint gsc_connection_singleton check (id = 1)
);

alter table public.gsc_connection enable row level security;

notify pgrst, 'reload schema';
