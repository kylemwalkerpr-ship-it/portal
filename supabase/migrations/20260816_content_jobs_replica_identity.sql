-- Enable REPLICA IDENTITY FULL on content_jobs for reliable Supabase Realtime.
-- Without this, UPDATE/DELETE events may not carry the full old row data.
-- The Content Studio already subscribes via subscribeToTable('content_jobs', ...)
-- in admin-content-studio.tsx line ~5184.

ALTER TABLE public.content_jobs REPLICA IDENTITY FULL;
