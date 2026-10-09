-- message_attachments_private_oct2026.sql
-- Applied to production 2026-10-09 via Supabase MCP apply_migration
-- (name: message_attachments_private_oct2026), AFTER the portal deploy that
-- serves attachments through /api/messages/attachments/[id] (participant
-- check + short-lived signed URL). Idempotent: safe to re-run.
--
-- 1) Bucket becomes private, with limits matching the upload routes
--    (app/api/messages/conversations/[id]/attach and the admin variant):
--    25 MB max; images, PDF, Word, Excel, text/CSV, audio (voice notes send
--    'audio/webm;codecs=opus', hence audio/*). application/octet-stream is
--    kept because the routes accept files whose browser type is empty.
update storage.buckets
   set public = false,
       file_size_limit = 26214400,
       allowed_mime_types = array[
         'image/jpeg','image/png','image/webp','image/gif',
         'application/pdf',
         'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'text/plain','text/csv',
         'audio/*',
         'application/octet-stream'
       ]
 where id = 'message-attachments';

-- 2) Legacy rows stored a public object URL. Point them at the
--    participant-checked proxy instead (the object path stays in
--    metadata.storage_path, which the proxy uses).
update public.conversation_messages
   set attachment_url = '/api/messages/attachments/' || id::text
 where attachment_url like '%/storage/v1/object/public/message-attachments/%';
