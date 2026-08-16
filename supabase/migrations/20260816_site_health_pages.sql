-- ============================================================================
-- 20260816_site_health_pages.sql
--
-- SITE HEALTH → MASTER SEO ENGINE FEED
--
-- The Content Studio Operations Site Health audit (runFullSiteHealthCheck)
-- scans the estate repos and classifies orphan pages, noindex pages, thin
-- pages and sitemap drift. Those findings are now persisted here so the
-- Master SEO Engine (masterEngine.ts) can read them without re-scanning
-- GitHub on every score — lighting up the t_sitemap_membership,
-- t_crawl_depth, l_orphan_risk, t_noindex_absent and t_soft404 signals.
--
-- Writes: lib/seoFactory/siteHealthSnapshot.persistSiteHealthSnapshot
-- Reads : lib/seoFactory/siteHealthSnapshot.getSiteHealthFacts / loadAll
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.site_health_pages (
  url_key       TEXT PRIMARY KEY,          -- normalized host+pathname key (match key)
  url           TEXT NOT NULL,             -- full canonical URL from the scan
  repo          TEXT NOT NULL,             -- caseworks | yousafe-consultancy | portal
  host          TEXT,
  path          TEXT,
  title         TEXT,
  indexable     BOOLEAN NOT NULL DEFAULT TRUE,
  noindex       BOOLEAN NOT NULL DEFAULT FALSE,
  words         INTEGER NOT NULL DEFAULT 0,
  inbound_links INTEGER NOT NULL DEFAULT 0,
  orphan        BOOLEAN NOT NULL DEFAULT FALSE,
  in_sitemap    BOOLEAN,                   -- NULL = sitemap unreachable / unknown
  crawl_depth   INTEGER NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_site_health_pages_url
  ON public.site_health_pages (url);
CREATE INDEX IF NOT EXISTS idx_site_health_pages_repo
  ON public.site_health_pages (repo);
CREATE INDEX IF NOT EXISTS idx_site_health_pages_orphan
  ON public.site_health_pages (orphan) WHERE orphan = TRUE;
