-- GSC Index Coverage — persisted snapshot of URL Inspection results.
--
-- The GSC URL Inspection API is quota-limited, so the Content Studio caches
-- the per-URL indexing verdict here and refreshes it on demand instead of
-- re-inspecting the whole estate on every dashboard load. The reader
-- (lib/gscIndexCoverage.ts) writes it; the Indexing tab + fix resolver
-- (lib/seoFactory/indexCoverageFixes.ts) read it.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.gsc_index_coverage (
  url TEXT PRIMARY KEY,                 -- normalized canonical URL
  site_url TEXT,                        -- GSC property inspected against
  indexed BOOLEAN NOT NULL DEFAULT FALSE,
  reason_code TEXT,                     -- machine-readable GscIndexReasonCode
  reason TEXT,                          -- human-readable reason
  fix_action TEXT,                      -- GscFixAction
  fix_label TEXT,                       -- short Fix button label
  auto_fix BOOLEAN NOT NULL DEFAULT FALSE,
  coverage_state TEXT,
  verdict TEXT,
  indexing_state TEXT,                  -- BLOCKED_BY_META_TAG / HTTP_HEADER / ...
  page_fetch_state TEXT,                -- SOFT_404 / NOT_FOUND / SERVER_ERROR / ...
  robots_txt_state TEXT,                -- ALLOWED / DISALLOWED
  google_canonical TEXT,
  user_canonical TEXT,
  last_crawl_time TIMESTAMPTZ,
  -- estate join so the resolver can fix without re-scanning GitHub trees
  repo TEXT,
  path TEXT,
  title TEXT,
  words INTEGER,
  inspected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gsc_index_coverage_not_indexed
  ON public.gsc_index_coverage (indexed)
  WHERE indexed = FALSE;

COMMENT ON TABLE public.gsc_index_coverage IS
  'GSC URL Inspection snapshot — why each estate page is (not) indexed, cached to respect the inspection API quota.';

-- Server-only table: the service-role client bypasses RLS; no client access.
ALTER TABLE public.gsc_index_coverage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.gsc_index_coverage FROM anon, authenticated;
DROP POLICY IF EXISTS "No direct client access" ON public.gsc_index_coverage;
CREATE POLICY "No direct client access" ON public.gsc_index_coverage
  FOR ALL USING (false) WITH CHECK (false);
