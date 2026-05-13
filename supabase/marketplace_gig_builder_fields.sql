alter table if exists public.gigs
  add column if not exists subcategory text,
  add column if not exists requirements text;

create index if not exists gigs_subcategory_idx on public.gigs (subcategory);
