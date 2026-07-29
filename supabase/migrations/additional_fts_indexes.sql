-- GIN indexes for additional full-text search conversions
-- Supports .or('col.fts.query') conversions in:
--   /api/marketplace/gigs        — title, pitch, description
--   /api/attorneys/search        — tagline, bio
--   /api/admin/tickets            — reason, detail
--
-- Single-column expression indexes must match the query expression exactly.
-- PostgREST's .fts operator generates to_tsvector('english', col) — without
-- COALESCE — so the index expression must match identically.
-- NULL rows are skipped by GIN (correct — can't search for NULL).
--
-- Idempotent: safe to re-run.

-- Attorneys: natural language search columns
CREATE INDEX IF NOT EXISTS idx_attorneys_tagline_fts
  ON public.attorneys
  USING GIN (to_tsvector('english', tagline));

CREATE INDEX IF NOT EXISTS idx_attorneys_bio_fts
  ON public.attorneys
  USING GIN (to_tsvector('english', bio));

-- Support tickets: free-text reason + detail
CREATE INDEX IF NOT EXISTS idx_support_tickets_reason_fts
  ON public.support_tickets
  USING GIN (to_tsvector('english', reason));

CREATE INDEX IF NOT EXISTS idx_support_tickets_detail_fts
  ON public.support_tickets
  USING GIN (to_tsvector('english', detail));

-- Market gigs: dedicated title index (existing gigs_fts_idx is multi-column
-- and won't match single-column to_tsvector('english', title))
CREATE INDEX IF NOT EXISTS idx_gigs_title_fts
  ON public.gigs
  USING GIN (to_tsvector('english', title));

CREATE INDEX IF NOT EXISTS idx_gigs_pitch_fts
  ON public.gigs
  USING GIN (to_tsvector('english', pitch));

CREATE INDEX IF NOT EXISTS idx_gigs_description_fts
  ON public.gigs
  USING GIN (to_tsvector('english', description));

-- Orders: requirements + revision_reason (natural language prose)
CREATE INDEX IF NOT EXISTS idx_orders_requirements_fts
  ON public.orders
  USING GIN (to_tsvector('english', requirements));

CREATE INDEX IF NOT EXISTS idx_orders_revision_reason_fts
  ON public.orders
  USING GIN (to_tsvector('english', revision_reason));
