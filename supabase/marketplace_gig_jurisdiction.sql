-- ─────────────────────────────────────────────────────────────────────────────
-- Marketplace · gigs.jurisdiction
--
-- Adds a first-class jurisdiction field on gigs so a single attorney/consultant
-- licensed in multiple countries can post differently-scoped gigs, and the
-- public marketplace landing can partition featured briefs by the gig's own
-- jurisdiction rather than the provider's profile country.
--
-- - Column is nullable initially so existing gigs keep working.
-- - Backfilled from profiles.country using the same normalization the app uses
--   (US / USA / United States → 'us'; UK / GB / GBR / United Kingdom → 'uk';
--   CA / CAN / Canada → 'ca').
-- - CHECK constraint enforces a closed set when present.
-- - Index supports the (status, jurisdiction, rank_score desc) browse path.
-- ─────────────────────────────────────────────────────────────────────────────

alter table if exists public.gigs
  add column if not exists jurisdiction text;

do $$
begin
  if not exists (
    select 1 from information_schema.check_constraints
    where constraint_schema = 'public' and constraint_name = 'gigs_jurisdiction_check'
  ) then
    alter table public.gigs
      add constraint gigs_jurisdiction_check
      check (jurisdiction is null or jurisdiction in ('us', 'uk', 'ca'));
  end if;
end$$;

-- Backfill from provider profile country for existing rows.
update public.gigs g
set jurisdiction = case
  when upper(coalesce(p.country, '')) in ('US', 'USA', 'UNITED STATES') then 'us'
  when upper(coalesce(p.country, '')) in ('UK', 'GB', 'GBR', 'UNITED KINGDOM') then 'uk'
  when upper(coalesce(p.country, '')) in ('CA', 'CAN', 'CANADA') then 'ca'
  else null
end
from public.profiles p
where g.provider_id = p.id
  and g.jurisdiction is null;

create index if not exists gigs_jurisdiction_idx
  on public.gigs (status, jurisdiction, rank_score desc);
