-- Create a private storage bucket for per-user messenger wallpapers.
-- Run via Supabase SQL Editor (Claude applies).
insert into storage.buckets (id, name, public)
values ('messenger-wallpapers', 'messenger-wallpapers', true)
on conflict (id) do nothing;

-- RLS: any authenticated user can read / write only their own folder.
create policy "users read own wallpaper"
  on storage.objects for select
  using (
    bucket_id = 'messenger-wallpapers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users upload own wallpaper"
  on storage.objects for insert
  with check (
    bucket_id = 'messenger-wallpapers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users replace own wallpaper"
  on storage.objects for update
  using (
    bucket_id = 'messenger-wallpapers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users delete own wallpaper"
  on storage.objects for delete
  using (
    bucket_id = 'messenger-wallpapers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
