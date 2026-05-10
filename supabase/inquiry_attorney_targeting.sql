-- Allow a student to submit an inquiry from an attorney's profile so the
-- inquiry is delivered directly to that attorney (still visible to the rest of
-- the panel as a backup, but flagged "directly addressed to you").
alter table public.inquiries add column if not exists target_attorney_profile_id uuid references public.profiles(id) on delete set null;
create index if not exists inquiries_target_attorney_idx on public.inquiries(target_attorney_profile_id);
