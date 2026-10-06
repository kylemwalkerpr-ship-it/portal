-- Curated marketplace gig overview (buyer-facing prose), distinct from
-- pitch/tagline (card/snippet) and description (long-form listing body).
-- The public gig page renders this as a standalone Overview — never by
-- bolting pitch/seo_description onto About as an "AI summary".

alter table public.gigs
  add column if not exists ai_overview text;

comment on column public.gigs.ai_overview is
  'Curated buyer-facing service overview (who it is for, what is included, outcomes). Standalone prose; not a pitch/meta appendage.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'gigs_ai_overview_len'
      and conrelid = 'public.gigs'::regclass
  ) then
    alter table public.gigs
      add constraint gigs_ai_overview_len
      check (ai_overview is null or char_length(btrim(ai_overview)) between 120 and 900);
  end if;
end $$;
