-- Keyword provenance: distinguish real search demand from partitioner backfill.
--
-- required_short_keywords / required_long_tail_keywords mix two very different
-- things: real queries (GSC / Ubersuggest / operator-typed) and template filler
-- the partitioner synthesized purely to satisfy the >=5 short / >=4 long-tail
-- count floors. The quality gate must hard-block an uncovered demand query (the
-- draft is off-topic) but only warn on an uncovered synthesized term, which is
-- no evidence of demand at all.
--
-- These columns persist the per-term provenance so a re-audit or an approve that
-- re-reads the row does not silently downgrade every term back to `demand` and
-- resurrect the false blockers. Shape: [{"term": "...", "source": "demand" |
-- "synthesized"}]. Additive with a safe default, so existing rows stay readable
-- and pre-provenance behavior (everything enforced as demand) is preserved.

ALTER TABLE public.content_jobs
  ADD COLUMN IF NOT EXISTS short_keyword_terms JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS long_tail_keyword_terms JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.content_jobs.short_keyword_terms
  IS 'Per-term provenance for required_short_keywords: [{"term","source"}] where source is demand|synthesized. Uncovered synthesized terms warn instead of blocking the ship.';
COMMENT ON COLUMN public.content_jobs.long_tail_keyword_terms
  IS 'Per-term provenance for required_long_tail_keywords: [{"term","source"}] where source is demand|synthesized. Uncovered synthesized terms warn instead of blocking the ship.';
