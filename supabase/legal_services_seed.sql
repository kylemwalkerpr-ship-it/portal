-- Seed the four MyCaseworks (legal vertical) tier services so the storefront
-- and the intake wizard land on a non-empty catalogue from day one. Idempotent
-- via NOT EXISTS guards keyed on title — re-running this is a no-op.
--
-- Prereq: supabase/portal_verticals.sql must run first so the `vertical`
-- column exists on services.
--
-- Pricing here matches the public tier pricing on legal.yousafeconsultancy.com/services.
-- The admin can adjust any of these in the dashboard after seeding.

insert into services (title, category, price, currency, delivery_days, is_active, vertical)
select 'Legal Document Prep — Basic', 'Document Preparation', 99, 'usd', 5, true, 'legal'
where not exists (
  select 1 from services where title = 'Legal Document Prep — Basic' and vertical = 'legal'
);

insert into services (title, category, price, currency, delivery_days, is_active, vertical)
select 'Legal Document Prep + Attorney Review — Essential', 'Attorney Review', 299, 'usd', 7, true, 'legal'
where not exists (
  select 1 from services where title = 'Legal Document Prep + Attorney Review — Essential' and vertical = 'legal'
);

insert into services (title, category, price, currency, delivery_days, is_active, vertical)
select 'Document Prep + Live Consultation — Enhanced', 'Attorney Review', 599, 'usd', 7, true, 'legal'
where not exists (
  select 1 from services where title = 'Document Prep + Live Consultation — Enhanced' and vertical = 'legal'
);

insert into services (title, category, price, currency, delivery_days, is_active, vertical)
select 'Full Attorney Engagement — Professional', 'Attorney Engagement', 999, 'usd', 5, true, 'legal'
where not exists (
  select 1 from services where title = 'Full Attorney Engagement — Professional' and vertical = 'legal'
);
