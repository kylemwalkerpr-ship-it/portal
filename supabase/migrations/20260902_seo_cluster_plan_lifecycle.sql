-- ============================================================================
-- 20260902_seo_cluster_plan_lifecycle.sql
--
-- PLAN ANALYSIS PERSISTENCE + LIFECYCLE (gap #4 + #5 closure)
--
-- runPlanner now persists the FULL ClusterPlan analysis (previously only the
-- score survived) so the ⚡ Brief / desk handoff reads the planner's own
-- outputs instead of re-deriving them:
--   ymyl TEXT          — YMYL classification for the cell (critical|standard…)
--   distribution JSONB — estate distribution targets [{repo,path,contentType}]
--   interlinks JSONB   — journey-neighbor / CTA / cross-country edges
--   brief TEXT         — the AI narrative brief (when draftBriefs ran)
--   compliance JSONB   — the full deterministic compliance checklist object
--
-- Lifecycle: once a cluster's stem overlaps an actually-shipped page (≥70%),
-- runPlanner flips the row to status='shipped' with shipped_at so the same
-- mission never re-ranks on the desk after publishing.
-- ============================================================================

ALTER TABLE public.seo_cluster_plans
  ADD COLUMN IF NOT EXISTS ymyl TEXT;

ALTER TABLE public.seo_cluster_plans
  ADD COLUMN IF NOT EXISTS distribution JSONB;

ALTER TABLE public.seo_cluster_plans
  ADD COLUMN IF NOT EXISTS interlinks JSONB;

ALTER TABLE public.seo_cluster_plans
  ADD COLUMN IF NOT EXISTS brief TEXT;

ALTER TABLE public.seo_cluster_plans
  ADD COLUMN IF NOT EXISTS compliance JSONB;

ALTER TABLE public.seo_cluster_plans
  ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ;

COMMENT ON COLUMN public.seo_cluster_plans.ymyl IS
  'YMYL classification for the cell (critical for visa/citizenship/family).';
COMMENT ON COLUMN public.seo_cluster_plans.distribution IS
  'Estate distribution targets [{repo,path,contentType}] from the planner.';
COMMENT ON COLUMN public.seo_cluster_plans.interlinks IS
  'Planner-derived journey-neighbor / CTA / cross-country interlink edges.';
COMMENT ON COLUMN public.seo_cluster_plans.brief IS
  'AI narrative brief for the mission (when draftBriefs=true).';
COMMENT ON COLUMN public.seo_cluster_plans.compliance IS
  'Full deterministic AEO/GEO/YMYL compliance checklist object (score column pre-dates it).';
COMMENT ON COLUMN public.seo_cluster_plans.shipped_at IS
  'Set when the cluster stem overlaps an actually-shipped page (status -> shipped).';