-- GIN indexes for full-text search on application tables
-- Used by /api/admin/consultant-applications and /api/admin/attorney-applications
-- textSearch('full_name', q, { type: 'websearch', config: 'simple' })
--
-- Without these indexes, textSearch does a sequential scan converting each row's
-- full_name to tsvector on the fly, causing slow searches at scale.
--
-- Idempotent: safe to re-run.

-- Consultant applications (config: simple — name search doesn't need stemming)
CREATE INDEX IF NOT EXISTS idx_consultant_applications_name_fts
  ON public.consultant_applications
  USING GIN (to_tsvector('simple', full_name));

-- Attorney applications (config: simple)
CREATE INDEX IF NOT EXISTS idx_attorney_applications_name_fts
  ON public.attorney_applications
  USING GIN (to_tsvector('simple', full_name));
