-- Adds the optional `country` column to profiles. Used by the consultant
-- dashboard to show student country alongside each order, and by the admin
-- user editor. Idempotent.
alter table profiles add column if not exists country text;
