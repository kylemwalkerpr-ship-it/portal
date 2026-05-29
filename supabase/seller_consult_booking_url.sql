-- Add the `consult_booking_url` column to both seller tables.
--
-- The portal already has full wiring for this field — the attorney + consultant
-- profile editors expose it as an EditableField, the GET routes SELECT it, the
-- PATCH routes whitelist + validate it (must look like an https URL or null),
-- and the public seller page renders it as a "Book free consult" button.
-- But the column was never actually added to either `attorneys` or
-- `consultants`, so every GET on those tables errored on the missing column.
-- PostgREST returned `data: null` and the editor displayed empty placeholders
-- for tagline / intro / bio — even though those fields ARE saved correctly,
-- because the whole row was missing from the GET response.
--
-- Adding the column is the minimum-change fix; removing it from the SELECT
-- strings would mean touching 8+ files and ripping out a working feature.
--
-- Idempotent / safe to re-run.

alter table public.attorneys
  add column if not exists consult_booking_url text;

alter table public.consultants
  add column if not exists consult_booking_url text;
