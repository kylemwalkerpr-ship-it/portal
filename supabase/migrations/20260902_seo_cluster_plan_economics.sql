-- ============================================================================
-- 20260902_seo_cluster_plan_economics.sql
--
-- PLAN CARD ECONOMICS (closes the planner-card gap)
--
-- runRankingPassForPlans now persists, per cluster plan:
--   title_candidates jsonb  — TitleLab reader-facing H1 candidates (top 3)
--   action_type text        — v4 funnel verb: funnel_new | funnel_revenue |
--                             funnel_climb | authority_anchor | kill_or_merge
--   expected_revenue jsonb  — { usdPerMonth, note } honest CTR-based estimate
--
-- The Discover/Planner cards and ⚡ Brief handoff read these columns, so the
-- 💷 ~$/mo badge and funnel badge are backed by persisted data instead of
-- aspirational UI fields.
-- ============================================================================

ALTER TABLE public.seo_cluster_plans
  ADD COLUMN IF NOT EXISTS title_candidates JSONB;

ALTER TABLE public.seo_cluster_plans
  ADD COLUMN IF NOT EXISTS action_type TEXT;

ALTER TABLE public.seo_cluster_plans
  ADD COLUMN IF NOT EXISTS expected_revenue JSONB;

COMMENT ON COLUMN public.seo_cluster_plans.title_candidates IS
  'TitleLab-generated H1 candidates (top 3), persisted by runRankingPassForPlans.';
COMMENT ON COLUMN public.seo_cluster_plans.action_type IS
  'V4 funnel verb (funnel_new | funnel_revenue | funnel_climb | authority_anchor | kill_or_merge).';
COMMENT ON COLUMN public.seo_cluster_plans.expected_revenue IS
  'Honest USD/month estimate { usdPerMonth, note } = impressions x dCTR x intentCVR x price.';