-- Attorney privacy control: show or hide bar / registration number on public profile.
-- Safe to re-run. Default true so existing listings that already show a number keep doing so;
-- attorneys can flip the toggle off in My Profile settings.

alter table public.attorneys
  add column if not exists show_bar_number boolean not null default true;

comment on column public.attorneys.show_bar_number is
  'When true and bar_number is set, public marketplace/API surfaces may display the bar / registration number. Attorneys can hide it without deleting the number.';

-- Optional jurisdiction label for the credential (e.g. FL, NY, SRA E&W).
-- jurisdictions already exists for practice geography; bar_state is a short
-- display label for the regulator/state that issued the number.
alter table public.attorneys
  add column if not exists bar_state text;

comment on column public.attorneys.bar_state is
  'Short jurisdiction / regulator label for bar_number (e.g. FL, NY, VA, SRA E&W, MB). Optional.';

notify pgrst, 'reload schema';
