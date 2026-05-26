-- Storage bucket + read policy for paid template downloads.
--
-- All template files live in the private `templates` bucket. The
-- public-facing portal NEVER reads from this bucket with the anon key
-- (no RLS policy grants anonymous SELECT). Instead, the worker uses
-- the service role to mint short-lived signed URLs server-side only
-- AFTER it has verified that the requesting user paid for the slug
-- in question (see app/api/templates/download/[slug]).
--
-- File layout inside the bucket:
--   <slug>/<filename>      e.g. us-f1-student-visa-ds160-i20-pack/pack.zip
-- One delivery file per slug. Multi-file packs ship as a .zip.

INSERT INTO storage.buckets (id, name, public)
VALUES ('templates', 'templates', false)
ON CONFLICT (id) DO NOTHING;

-- Defense in depth: revoke any default anon/auth select policies.
-- Server-side signed URLs do not require an RLS-allowed SELECT on
-- storage.objects, so leaving the bucket policy-less keeps it tight.
DROP POLICY IF EXISTS "Public read templates" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated read templates" ON storage.objects;
