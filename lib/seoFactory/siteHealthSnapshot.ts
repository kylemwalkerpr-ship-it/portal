/**
 * SITE HEALTH SNAPSHOT — the persistence + feed layer between the Content
 * Studio Operations audit and the Master SEO Engine.
 *
 * `runFullSiteHealthCheck` scans the estate repos (orphan / noindex / thin /
 * sitemap drift). Persisting that result lets `scoreMaster` light up the
 * technical + links signals it could otherwise never see without re-scanning
 * GitHub on every score:
 *
 *   · t_sitemap_membership  ← inSitemap
 *   · t_crawl_depth         ← crawlDepth
 *   · l_orphan_risk         ← orphan / inboundLinks (estate-wide, not draft-only)
 *   · t_noindex_absent      ← noindex (source-level)
 *   · t_indexable           ← indexable
 *   · t_soft404             ← words (< 400 thin page)
 *
 * Write path:  persistSiteHealthSnapshot(report)   (called by the audit)
 * Read path :  getSiteHealthFacts(url) / loadAllSiteHealthFacts() / attach
 */
import { createClient } from '@supabase/supabase-js'
import { resolveSupabaseKey } from '@/lib/supabaseKey'
import type { SiteHealthPage } from './siteHealth'
import type { MasterEngineInput } from './masterEngine'

export interface SiteHealthFacts {
  url: string
  repo: string
  host: string
  path: string
  title: string
  indexable: boolean
  noindex: boolean
  words: number
  inboundLinks: number
  orphan: boolean
  inSitemap: boolean | null
  crawlDepth: number
}

/** Structural slice of FullSiteHealthReport.sitemapDiffs (avoids a runtime import cycle). */
export interface SiteHealthSitemapDiffLike {
  repo: string
  liveReachable: boolean
  missing?: string[]
}

/** Structural slice of FullSiteHealthReport the persistence step needs. */
export interface SiteHealthReportLike {
  pages: SiteHealthPage[]
  sitemapDiffs?: SiteHealthSitemapDiffLike[]
}

/** host + pathname, trailing slash trimmed — the engine/snapshot match key.
 *  Strips the `www.` prefix so a bare-domain and www-prefixed URL collapse to
 *  the same key — mirroring the scan's own normalizeUrl (siteHealth.ts), which
 *  already strips `www.` when building page URLs. */
export function normalizePageUrl(u: string): string {
  try {
    const p = new URL(u)
    return p.host.toLowerCase().replace(/^www\./, '') + (p.pathname.replace(/\/+$/, '') || '/')
  } catch {
    return (u || '').replace(/\/+$/, '').toLowerCase().replace(/^www\./, '')
  }
}

/** Clicks from home, proxied by URL path-segment depth. */
export function crawlDepthForUrl(url: string): number {
  try {
    return new URL(url).pathname.split('/').filter(Boolean).length
  } catch {
    return (url || '').split('/').filter(Boolean).length
  }
}

/** True when the URL is the site root (homepage) — never an orphan. */
function isRoot(url: string): boolean {
  try {
    return (new URL(url).pathname.replace(/\/+$/, '') || '/') === '/'
  } catch {
    return false
  }
}

/**
 * Pure per-page fact derivation from a full scan + sitemap diffs. `pages`
 * should already carry real inboundLinks (see siteHealth.enrichInboundLinks).
 */
export function deriveSiteHealthFacts(
  pages: SiteHealthPage[],
  sitemapDiffs: SiteHealthSitemapDiffLike[] = [],
): SiteHealthFacts[] {
  const missingByRepo = new Map<string, Set<string>>()
  const reachableByRepo = new Map<string, boolean>()
  for (const d of sitemapDiffs) {
    missingByRepo.set(d.repo, new Set((d.missing || []).map(normalizePageUrl)))
    reachableByRepo.set(d.repo, Boolean(d.liveReachable))
  }
  return pages.map((p) => {
    const reachable = reachableByRepo.get(p.repo)
    const missing = missingByRepo.get(p.repo)
    let inSitemap: boolean | null = null
    if (reachable === true && missing) inSitemap = !missing.has(normalizePageUrl(p.url))
    const inbound = p.inboundLinks ?? 0
    return {
      url: p.url,
      repo: p.repo,
      host: p.host,
      path: p.path,
      title: p.title,
      indexable: p.indexable !== false,
      noindex: p.noindex === true,
      words: p.words ?? 0,
      inboundLinks: inbound,
      orphan: inbound === 0 && !isRoot(p.url),
      inSitemap,
      crawlDepth: crawlDepthForUrl(p.url),
    }
  })
}

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, resolveSupabaseKey()!)
}

/**
 * Upsert the last Site Health scan into `site_health_pages` and prune rows the
 * scan no longer produced. Returns the number of rows written. Non-fatal — a
 * missing/migrated table logs a warning and returns 0 so the audit never
 * fails because the snapshot isn't available.
 */
export async function persistSiteHealthSnapshot(report: SiteHealthReportLike): Promise<number> {
  const facts = deriveSiteHealthFacts(report.pages, report.sitemapDiffs || [])
  if (!facts.length) return 0
  try {
    const supabase = sb()
    // One timestamp for the whole scan: the prune below deletes any row whose
    // updated_at predates it (i.e. pages the current scan no longer produced).
    const scanAt = new Date().toISOString()
    const rows = facts.map((f) => ({
      url_key: normalizePageUrl(f.url),
      url: f.url,
      repo: f.repo,
      host: f.host,
      path: f.path,
      title: f.title,
      indexable: f.indexable,
      noindex: f.noindex,
      words: f.words,
      inbound_links: f.inboundLinks,
      orphan: f.orphan,
      in_sitemap: f.inSitemap,
      crawl_depth: f.crawlDepth,
      updated_at: scanAt,
    }))
    // Upsert in chunks to stay well under the PostgREST row/body limits.
    const CHUNK = 200
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await supabase
        .from('site_health_pages')
        .upsert(rows.slice(i, i + CHUNK), { onConflict: 'url_key' })
      if (error) {
        console.warn('[site-health-snapshot] upsert failed', error.message)
        return 0
      }
    }
    // Prune pages the current scan no longer produced (stale from older runs).
    const { error: pruneErr } = await supabase
      .from('site_health_pages')
      .delete()
      .lt('updated_at', scanAt)
    if (pruneErr) console.warn('[site-health-snapshot] prune failed', pruneErr.message)
    return rows.length
  } catch (e) {
    console.warn('[site-health-snapshot] persist failed (table migrated?)', e instanceof Error ? e.message : e)
    return 0
  }
}

/** Fetch the persisted facts for one URL (normalized match). Null when absent. */
export async function getSiteHealthFacts(url: string | null | undefined): Promise<SiteHealthFacts | null> {
  if (!url) return null
  const key = normalizePageUrl(url)
  try {
    const { data, error } = await sb()
      .from('site_health_pages')
      .select('url, repo, host, path, title, indexable, noindex, words, inbound_links, orphan, in_sitemap, crawl_depth')
      .eq('url_key', key)
      .maybeSingle()
    if (error || !data) return null
    return {
      url: data.url,
      repo: data.repo,
      host: data.host ?? '',
      path: data.path ?? '',
      title: data.title ?? '',
      indexable: data.indexable !== false,
      noindex: data.noindex === true,
      words: data.words ?? 0,
      inboundLinks: data.inbound_links ?? 0,
      orphan: data.orphan === true,
      inSitemap: data.in_sitemap == null ? null : Boolean(data.in_sitemap),
      crawlDepth: data.crawl_depth ?? 0,
    }
  } catch {
    return null
  }
}

/** Load the whole snapshot keyed by normalized URL (batch consumers / backfill). */
export async function loadAllSiteHealthFacts(): Promise<Map<string, SiteHealthFacts>> {
  const out = new Map<string, SiteHealthFacts>()
  try {
    const { data, error } = await sb()
      .from('site_health_pages')
      .select('url, repo, host, path, title, indexable, noindex, words, inbound_links, orphan, in_sitemap, crawl_depth')
    if (error || !data) return out
    for (const d of data) {
      const f: SiteHealthFacts = {
        url: d.url,
        repo: d.repo,
        host: d.host ?? '',
        path: d.path ?? '',
        title: d.title ?? '',
        indexable: d.indexable !== false,
        noindex: d.noindex === true,
        words: d.words ?? 0,
        inboundLinks: d.inbound_links ?? 0,
        orphan: d.orphan === true,
        inSitemap: d.in_sitemap == null ? null : Boolean(d.in_sitemap),
        crawlDepth: d.crawl_depth ?? 0,
      }
      out.set(normalizePageUrl(f.url), f)
    }
  } catch {
    /* snapshot unavailable — engine keeps using live-HTML-only signals */
  }
  return out
}

/** Attach Site Health facts to an engine input for the given page URL (no-op when absent). */
export async function attachSiteHealthFacts(
  input: MasterEngineInput,
  url: string | null | undefined,
): Promise<MasterEngineInput> {
  const facts = await getSiteHealthFacts(url)
  if (!facts) return input
  input.siteHealth = {
    orphan: facts.orphan,
    inboundLinks: facts.inboundLinks,
    inSitemap: facts.inSitemap ?? undefined,
    noindex: facts.noindex,
    indexable: facts.indexable,
    crawlDepth: facts.crawlDepth,
    words: facts.words,
  }
  return input
}
