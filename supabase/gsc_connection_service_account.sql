-- =============================================================================
-- gsc_connection_service_account.sql
--
-- Lets a team connect Search Console with a pasted service-account JSON key
-- (no Google OAuth client needed): the "Service account" tab in the connect
-- modal POSTs { siteUrl, serviceAccountKey } and the key is stored here,
-- server-side, alongside the OAuth fields. gscAuth.getGscAccess() prefers the
-- stored key so the pasted credential actually mints tokens at runtime.
-- RLS is ON with no policies, so only the service-role key (server) can read
-- it — the key never reaches the browser after the paste.
-- =============================================================================

alter table public.gsc_connection
  add column if not exists service_account_key text;

notify pgrst, 'reload schema';
