-- ============================================================================
-- 20260817_site_health_rls.sql
--
-- SITE HEALTH → MASTER SEO ENGINE FEED — RLS fix
--
-- `site_health_pages` was created with Row-Level Security ENABLED but no
-- permissive policy, which made the snapshot invisible to the anon/legacy key
-- the runtime falls back to when the service-role key is the new `sb_secret_`
-- format (rejected by supabase-js v2). With zero policies, Postgres denies
-- every non-service-role read, so the engine backfill saw an empty table even
-- after the audit persisted 399 rows.
--
-- The snapshot is written by the admin Site Health audit and read by the
-- engine backfill — both server-side, with access gated at the route level
-- (Clerk admin). This permissive policy therefore mirrors `content_jobs` and
-- the other engine tables, so the anon fallback key can read/write exactly as
-- the existing code expects.
--
-- Safe to re-run.
-- ============================================================================

ALTER TABLE public.site_health_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Site health full access" ON public.site_health_pages;
CREATE POLICY "Site health full access" ON public.site_health_pages
  FOR ALL
  USING (true)
  WITH CHECK (true);
