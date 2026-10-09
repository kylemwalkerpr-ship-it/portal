-- Bucket for messenger attachments (paperclip uploads + voice notes).
--
-- Run in Supabase SQL editor once. Idempotent — re-running is safe.
--
-- PRIVATE since 2026-10-09 (see message_attachments_private_oct2026.sql).
-- Message rows store /api/messages/attachments/<message id>; that route
-- checks the caller is a conversation participant (or support/admin) and
-- redirects to a short-lived signed URL. Never use getPublicUrl here.
insert into storage.buckets (id, name, public)
values ('message-attachments', 'message-attachments', false)
on conflict (id) do update set public = false;

-- Allow any authenticated participant of the conversation to upload.
-- The endpoint already enforces participant-ownership before calling
-- storage.upload, so this RLS is mainly a defence-in-depth check.
create policy if not exists "message_attachments_authenticated_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'message-attachments'
    and auth.role() = 'authenticated'
  );

-- No public read policy: reads go through service-role signed URLs only.
drop policy if exists "message_attachments_public_read" on storage.objects;
