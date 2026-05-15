-- =============================================================================
-- profile_preferences.sql
-- Adds preferences + notification settings to public.profiles so the student
-- (and other roles) can persist personalisation. All idempotent.
-- =============================================================================

alter table public.profiles
  add column if not exists phone           text,
  add column if not exists timezone        text,
  add column if not exists language        text default 'en',
  add column if not exists avatar_url      text,
  add column if not exists address_line1   text,
  add column if not exists address_line2   text,
  add column if not exists city            text,
  add column if not exists postal_code     text,
  add column if not exists notif_prefs     jsonb not null default '{"email_messages":true,"email_orders":true,"email_offers":true,"email_promo":false,"email_weekly_digest":false}'::jsonb,
  add column if not exists privacy_prefs   jsonb not null default '{"share_profile_with_consultants":true,"allow_analytics":true,"marketing_emails":false}'::jsonb,
  add column if not exists ui_prefs        jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
