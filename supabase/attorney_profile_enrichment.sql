-- Fiverr-style profile fields for attorneys: headshot, tagline, languages,
-- years of experience, education, specialties, free-consult flag, starting
-- price, optional intro video and a longer intro/byline distinct from `bio`.
--
-- Plus a public Supabase Storage bucket for headshots.

alter table public.attorneys add column if not exists headshot_url text;
alter table public.attorneys add column if not exists headshot_path text;
alter table public.attorneys add column if not exists tagline text;
alter table public.attorneys add column if not exists intro text;
alter table public.attorneys add column if not exists languages text[];
alter table public.attorneys add column if not exists years_experience integer;
alter table public.attorneys add column if not exists education text;
alter table public.attorneys add column if not exists specialties text[];
alter table public.attorneys add column if not exists offers_free_consult boolean default false;
alter table public.attorneys add column if not exists starting_price numeric(12,2);
alter table public.attorneys add column if not exists video_intro_url text;
alter table public.attorneys add column if not exists timezone text;

-- Public storage bucket so headshot URLs render without signed-URL roundtrips.
-- Writes happen via the service-role admin client in the API; no RLS needed.
insert into storage.buckets (id, name, public)
values ('attorney-headshots', 'attorney-headshots', true)
on conflict (id) do nothing;
