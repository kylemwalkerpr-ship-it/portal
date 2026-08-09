-- SEO Master Engine v2 — auto-interlink graph, LLM visibility audits,
-- compliance gate enforcement. Idempotent: safe to re-run.

-- ── 1. Auto-interlink graph ─────────────────────────────────────────────────
-- Every generated/planned edge the engine recommends or applies.
CREATE TABLE IF NOT EXISTS public.seo_interlinks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_slug TEXT NOT NULL,                -- the page being linked FROM
  target_url TEXT NOT NULL,                 -- canonical URL linked TO
  target_host TEXT NOT NULL,                -- estate host (legal/usa/uk/ca/au/apex/market)
  anchor_text TEXT NOT NULL,
  context_h2 TEXT,                          -- heading where the link belongs
  reason TEXT NOT NULL DEFAULT 'ontology_neighbor' CHECK (reason IN ('ontology_neighbor', 'marketplace_cta', 'cluster_related', 'journey_next', 'journey_prev', 'cross_country', 'manual')),
  score NUMERIC(4, 3) NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'applied', 'skipped')),
  source TEXT NOT NULL DEFAULT 'engine',
  cluster_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_at TIMESTAMPTZ,
  UNIQUE (source_slug, target_url)
);

-- ── 2. LLM / AEO visibility audits ──────────────────────────────────────────
-- Prompt-level audits: ask an LLM to answer a query, then check whether the
-- estate was cited. This is the GEO/LLM share-of-voice tracker.
CREATE TABLE IF NOT EXISTS public.seo_llm_visibility (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT NOT NULL,
  engine TEXT NOT NULL,                     -- 'deepseek' | 'grok' | 'openai' | ... (provider label)
  model TEXT,
  cited BOOLEAN NOT NULL DEFAULT false,
  cited_urls TEXT[] NOT NULL DEFAULT '{}',
  brand_mentions TEXT[] NOT NULL DEFAULT '{}',
  snippet TEXT,                             -- LLM answer excerpt (truncated)
  response TEXT,                            -- full answer (truncated for storage)
  stage TEXT,                               -- lifecycle stage if tagged
  country TEXT,
  raw_score NUMERIC(4, 3),                  -- 0..1 share-of-voice score
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 3. Compliance gate runs ─────────────────────────────────────────────────
-- Every draft/plan that ran the AEO/GEO/YMYL compliance gate, with verdict.
CREATE TABLE IF NOT EXISTS public.seo_gate_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type TEXT NOT NULL CHECK (subject_type IN ('plan', 'draft', 'job', 'brief')),
  subject_id TEXT,
  cluster_id TEXT,
  stage TEXT,
  country TEXT,
  score NUMERIC(5, 2) NOT NULL,
  passed BOOLEAN NOT NULL,
  threshold NUMERIC(5, 2) NOT NULL,
  by_category JSONB NOT NULL DEFAULT '{}',  -- { aeo: {met,total}, geo: ..., ymyl: ..., tech: ... }
  blockers TEXT[] NOT NULL DEFAULT '{}',    -- missing required checks
  signals JSONB NOT NULL DEFAULT '{}',      -- raw evidence signals
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_seo_interlinks_source ON public.seo_interlinks (source_slug);
CREATE INDEX IF NOT EXISTS idx_seo_interlinks_target ON public.seo_interlinks (target_url);
CREATE INDEX IF NOT EXISTS idx_seo_interlinks_status ON public.seo_interlinks (status);
CREATE INDEX IF NOT EXISTS idx_seo_llm_vis_created ON public.seo_llm_visibility (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_seo_llm_vis_cited ON public.seo_llm_visibility (cited);
CREATE INDEX IF NOT EXISTS idx_seo_llm_vis_query ON public.seo_llm_visibility (query);
CREATE INDEX IF NOT EXISTS idx_seo_gate_runs_created ON public.seo_gate_runs (created_at DESC);

-- RLS
ALTER TABLE public.seo_interlinks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_llm_visibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_gate_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Engine v2 full access" ON public.seo_interlinks;
CREATE POLICY "Engine v2 full access" ON public.seo_interlinks FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Engine v2 full access" ON public.seo_llm_visibility;
CREATE POLICY "Engine v2 full access" ON public.seo_llm_visibility FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Engine v2 full access" ON public.seo_gate_runs;
CREATE POLICY "Engine v2 full access" ON public.seo_gate_runs FOR ALL USING (true) WITH CHECK (true);
