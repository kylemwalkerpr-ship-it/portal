-- Bucket for messenger attachments (paperclip uploads + voice notes).
--
-- Run in Supabase SQL editor once. Idempotent — re-running is safe.
--
-- Created public so the public-URL the endpoint resolves at upload time
-- remains valid for the life of the message row. If we later want signed
-- URLs (e.g. for stricter ACLs on attorney-client privilege), flip
-- `public` to false and update the API to call createSignedUrl on each
-- read. Today every conversation attachment is between two participants
-- already authenticated to the same row, so the security boundary is
-- the unguessable storage path (uuid + sanitised filename), not bucket
-- visibility.
insert into storage.buckets (id, name, public)
values ('message-attachments', 'message-attachments', true)
on conflict (id) do update set public = true;

-- Allow any authenticated participant of the conversation to upload.
-- The endpoint already enforces participant-ownership before calling
-- storage.upload, so this RLS is mainly a defence-in-depth check.
create policy if not exists "message_attachments_authenticated_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'message-attachments'
    and auth.role() = 'authenticated'
  );

-- Public read so the public URLs returned by getPublicUrl() resolve in
-- the browser. Adjust if/when we move to signed URLs.
create policy if not exists "message_attachments_public_read"
  on storage.objects for select
  using (bucket_id = 'message-attachments');
