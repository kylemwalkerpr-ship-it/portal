-- SEO Master Engine — schema for the master planner layer
-- Covers: immigrant life-cycle ontology, daily knowledge intel,
--         cluster plans, engine run audit trail, engine config.
-- Idempotent: safe to re-run.

-- ── 1. Life-cycle ontology ──────────────────────────────────────────────────
-- One row per (stage × country). Stage = journey step (intent → settlement),
-- country ∈ {US, UK, CA, AU}. Holds search-intent mix, YMYL sensitivity,
-- marketplace service mapping, recommended content types and seed keywords.
CREATE TABLE IF NOT EXISTS public.seo_lifecycle_stages (
  id TEXT PRIMARY KEY,                 -- e.g. 'intent|us'
  stage TEXT NOT NULL,                 -- journey step key, e.g. 'intent'
  stage_label TEXT NOT NULL,           -- human label, e.g. 'Intent to move'
  country TEXT NOT NULL CHECK (country IN ('US', 'UK', 'CA', 'AU')),
  phase TEXT NOT NULL CHECK (phase IN ('awareness', 'consideration', 'decision', 'settlement', 'loyalty')),
  funnel TEXT NOT NULL DEFAULT 'top' CHECK (funnel IN ('top', 'middle', 'bottom')),
  ymyl_level TEXT NOT NULL DEFAULT 'high' CHECK (ymyl_level IN ('low', 'medium', 'high', 'critical')),
  intent_mix JSONB NOT NULL DEFAULT '{}',   -- { informational: n, commercial: n, transactional: n, navigational: n }
  services TEXT[] NOT NULL DEFAULT '{}',    -- marketplace category ids mapped to this stage
  content_types TEXT[] NOT NULL DEFAULT '{}', -- regional_page | blog_post | casework | marketplace_landing | faq_hub
  seed_keywords TEXT[] NOT NULL DEFAULT '{}',
  statutory_anchors TEXT[] NOT NULL DEFAULT '{}', -- INA / IRPA / UK Immigration Rules / Migration Act refs
  priority INT NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. Knowledge intel (daily ingestion target) ─────────────────────────────
-- Fresh intelligence consumed by the planner: government policy feeds,
-- Google Search Central guidance, trend signals, competitor intel.
CREATE TABLE IF NOT EXISTS public.seo_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,                -- e.g. 'uscis-news' | 'home-office' | 'ircc' | 'home-affairs' | 'google-search-central' | 'gsc-signals'
  source_label TEXT,
  kind TEXT NOT NULL DEFAULT 'policy' CHECK (kind IN ('policy', 'guidance', 'trend', 'competitor', 'signal', 'manual')),
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  ai_summary TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  countries TEXT[] NOT NULL DEFAULT '{}',
  stages TEXT[] NOT NULL DEFAULT '{}',      -- lifecycle stage keys touched
  confidence NUMERIC(3, 2) NOT NULL DEFAULT 0.8,
  published_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  dedupe_key TEXT,                          -- normalized url for upsert
  UNIQUE (dedupe_key)
);

-- ── 3. Cluster plans (master planner output) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.seo_cluster_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id TEXT NOT NULL UNIQUE,     -- deterministic from primary term stem
  primary_term TEXT NOT NULL,
  related_terms TEXT[] NOT NULL DEFAULT '{}',
  stage TEXT NOT NULL,
  country TEXT NOT NULL CHECK (country IN ('US', 'UK', 'CA', 'AU')),
  intent TEXT NOT NULL DEFAULT 'informational',
  opportunity_score NUMERIC(6, 2) NOT NULL DEFAULT 0,
  est_monthly_impressions NUMERIC(12, 2) NOT NULL DEFAULT 0,
  est_monthly_clicks NUMERIC(12, 2) NOT NULL DEFAULT 0,
  position NUMERIC(6, 2),
  ctr NUMERIC(6, 4),
  plan JSONB NOT NULL DEFAULT '{}',    -- { pillar, spokes[], interlinks[], distribution[], compliance{} }
  compliance_score NUMERIC(5, 2) NOT NULL DEFAULT 0,  -- AEO/GEO/YMYL readiness 0–100
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'briefed', 'launched', 'done', 'skipped')),
  rationale TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 4. Engine run audit trail (verifiable / accountable) ────────────────────
CREATE TABLE IF NOT EXISTS public.seo_engine_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('knowledge', 'plan', 'daily', 'manual')),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'partial', 'failed')),
  triggered_by TEXT NOT NULL DEFAULT 'cron',
  summary JSONB NOT NULL DEFAULT '{}',     -- { ingested: n, planned: n, skipped: n, ... }
  errors TEXT[] NOT NULL DEFAULT '{}',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

-- ── 5. Engine config (sources registry, intervals) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.seo_engine_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_seo_knowledge_fetched ON public.seo_knowledge (fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_seo_knowledge_source ON public.seo_knowledge (source);
CREATE INDEX IF NOT EXISTS idx_seo_knowledge_countries ON public.seo_knowledge USING GIN (countries);
CREATE INDEX IF NOT EXISTS idx_seo_cluster_plans_score ON public.seo_cluster_plans (opportunity_score DESC);
CREATE INDEX IF NOT EXISTS idx_seo_cluster_plans_stage ON public.seo_cluster_plans (stage, country);
CREATE INDEX IF NOT EXISTS idx_seo_engine_runs_started ON public.seo_engine_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_seo_lifecycle_country ON public.seo_lifecycle_stages (country);

-- RLS
ALTER TABLE public.seo_lifecycle_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_cluster_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_engine_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_engine_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Engine full access" ON public.seo_lifecycle_stages;
CREATE POLICY "Engine full access" ON public.seo_lifecycle_stages FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Engine full access" ON public.seo_knowledge;
CREATE POLICY "Engine full access" ON public.seo_knowledge FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Engine full access" ON public.seo_cluster_plans;
CREATE POLICY "Engine full access" ON public.seo_cluster_plans FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Engine full access" ON public.seo_engine_runs;
CREATE POLICY "Engine full access" ON public.seo_engine_runs FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Engine full access" ON public.seo_engine_config;
CREATE POLICY "Engine full access" ON public.seo_engine_config FOR ALL USING (true) WITH CHECK (true);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_seo_engine_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_seo_lifecycle_updated ON public.seo_lifecycle_stages;
CREATE TRIGGER trg_seo_lifecycle_updated BEFORE UPDATE ON public.seo_lifecycle_stages
  FOR EACH ROW EXECUTE FUNCTION public.update_seo_engine_updated_at();

DROP TRIGGER IF EXISTS trg_seo_cluster_plans_updated ON public.seo_cluster_plans;
CREATE TRIGGER trg_seo_cluster_plans_updated BEFORE UPDATE ON public.seo_cluster_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_seo_engine_updated_at();
