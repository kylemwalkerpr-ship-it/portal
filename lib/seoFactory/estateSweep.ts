/**
 * lib/seoFactory/estateSweep.ts — Estate-wide thin-content scanner.
 *
 * Scans every URL in every subdomain's sitemap, fetches the rendered page,
 * counts visible body words, and flags pages below the content-depth floor
 * for automatic expansion via the Content Studio pipeline.
 *
 * Runs as part of the daily War Room cycle so thin pages are continuously
 * thickened until every indexable page meets the depth floor.
 */

import { minWordsForType, targetWordsForType, countBodyWords } from '@/lib/seoFactory/contentDepth'
import { checkContentDepth } from '@/lib/seoFactory/contentDepth'
import { HOST_PUBLIC, type OwnerHost } from '@/lib/seoFactory/ownership'
import { runSeoFactoryPipeline, type RequestedShipMode } from '@/lib/seoFactory/pipeline'
import { createSupabaseAdminClient } from '@/lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────

export interface ThinPage {
  /** Full URL of the detected thin page */
  url: string
  /** Host name (used to determine content type) */
  host: OwnerHost | string
  /** Path portion of URL (used to match ownership) */
  path: string
  /** Current word count */
  currentWords: number
  /** Required minimum word count for this content type */
  minWords: number
  /** Target word count for this content type */
  targetWords: number
  /** Word deficit from minimum threshold */
  deficit: number
  /** Inferred content type */
  contentType: string
  /** Keyword / title extracted from page or path */
  guessedKeyword: string
  /** Suggested region based on subdomain */
  region: string
  /** Whether the sweep thinks this page can be expanded */
  expandable: boolean
}

export interface SweepResult {
  scannedHosts: string[]
  totalUrls: number
  thinPages: ThinPage[]
  expanded: ThinPage[]
  failed: Array<{ url: string; error: string }>
  warnings: string[]
  ranAt: string
}

// ── Sitemap fetcher ─────────────────────────────────────────────────────────

/** All hosts to sweep (excluding portal — it's a noindex members area). */
const SWEEP_HOSTS = [
  'yousafeconsultancy.com',
  'usa.yousafeconsultancy.com',
  'ca.yousafeconsultancy.com',
  'uk.yousafeconsultancy.com',
  'au.yousafeconsultancy.com',
  'legal.yousafeconsultancy.com',
  'market.yousafeconsultancy.com',
]

const SITEMAP_TIMEOUT = 15_000
const PAGE_TIMEOUT = 10_000
const MAX_URLS_PER_HOST = 200 // Budget: don't DOS our own estate

function extractLocs(xml: string): string[] {
  const out: string[] = []
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) out.push(m[1])
  return out
}

async function fetchSitemapUrls(host: string): Promise<string[]> {
  try {
    const r = await fetch(`https://${host}/sitemap.xml`, {
      signal: AbortSignal.timeout(SITEMAP_TIMEOUT),
    })
    if (!r.ok) return []
    const xml = await r.text()
    let locs = extractLocs(xml)
    // Sitemap index? Resolve child sitemaps (one level).
    if (xml.includes('<sitemapindex')) {
      const children = locs.slice(0, 8)
      locs = []
      for (const child of children) {
        try {
          const cr = await fetch(child, { signal: AbortSignal.timeout(SITEMAP_TIMEOUT) })
          if (cr.ok) locs.push(...extractLocs(await cr.text()))
        } catch { /* skip */ }
      }
    }
    // Keep only same-host URLs
    return locs
      .filter(u => {
        try { return new URL(u).host === host } catch { return false }
      })
      .slice(0, MAX_URLS_PER_HOST)
  } catch {
    return []
  }
}

// ── Word-count estimation ───────────────────────────────────────────────────

/**
 * Fetch a page and count visible body words.
 * Strips <script>, <style>, <nav>, <header>, <footer>, and all HTML tags
 * so the count approximates real prose content.
 */
async function fetchWordCount(url: string): Promise<{ wordCount: number; html: string }> {
  const r = await fetch(url, { signal: AbortSignal.timeout(PAGE_TIMEOUT) })
  if (!r.ok) return { wordCount: 0, html: '' }
  let html = await r.text()
  // Strip script, style, nav, header, footer, svg — not prose
  html = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ') // remaining tags
  // Collapse whitespace
  const text = html.replace(/\s+/g, ' ').trim()
  const wordCount = text ? text.split(/\s+/).filter(w => w.length > 1).length : 0
  return { wordCount, html: text.slice(0, 500) }
}

// ── Content type inference ──────────────────────────────────────────────────

function inferContentTypeFromUrl(url: string): { contentType: string; guessedKeyword: string; region: string } {
  let path: string
  try { path = new URL(url).pathname.replace(/\/+$/, '') || '/' } catch { path = '/' }
  const host = new URL(url).hostname

  // Determine region from host
  let region = 'US'
  if (/uk\./.test(host)) region = 'UK'
  else if (/ca\./.test(host)) region = 'CA'
  else if (/au\./.test(host)) region = 'AU'
  else if (/legal\./.test(host)) region = 'US'
  else if (/market\./.test(host)) region = 'US'

  // Extract keyword from path
  const segments = path.split('/').filter(Boolean)
  const last = segments[segments.length - 1] || ''

  // Content type from path pattern
  if (/\/blog\//.test(path)) return { contentType: 'blog_summary', guessedKeyword: last.replace(/-/g, ' '), region }
  if (/\/guide\//.test(path)) return { contentType: 'legal_guide', guessedKeyword: last.replace(/-/g, ' '), region }
  if (/\/from\//.test(path)) return { contentType: 'regional_from', guessedKeyword: `from ${last.replace(/-/g, ' ')}`, region }
  if (/\/universities\//.test(path)) return { contentType: 'regional_university', guessedKeyword: last.replace(/-/g, ' '), region }
  if (/\/services/.test(path)) return { contentType: 'regional_page', guessedKeyword: 'services', region }
  if (/\/faqs/.test(path)) return { contentType: 'regional_page', guessedKeyword: 'faqs', region }
  if (/\/about/.test(path)) return { contentType: 'regional_page', guessedKeyword: 'about', region }
  if (/\/book/.test(path)) return { contentType: 'regional_page', guessedKeyword: 'book consultation', region }
  if (/\/contact/.test(path)) return { contentType: 'regional_page', guessedKeyword: 'contact', region }
  if (/\/support/.test(path)) return { contentType: 'regional_page', guessedKeyword: 'support', region }
  if (/\/resources/.test(path)) return { contentType: 'regional_page', guessedKeyword: 'resources', region }
  if (/\/privacy/.test(path)) return { contentType: 'regional_page', guessedKeyword: 'privacy policy', region }
  if (/\/terms/.test(path)) return { contentType: 'regional_page', guessedKeyword: 'terms of service', region }
  if (/\/refund/.test(path)) return { contentType: 'regional_page', guessedKeyword: 'refund policy', region }

  return { contentType: 'legal_guide', guessedKeyword: last.replace(/-/g, ' ') || path.replace(/\//g, ' ').trim(), region }
}

// ── Core sweep ──────────────────────────────────────────────────────────────

/**
 * Run an estate-wide sweep: fetch all sitemaps, check every URL's word count,
 * and return a ranked list of thin pages.
 */
export async function runEstateSweep(): Promise<SweepResult> {
  const warnings: string[] = []
  const thinPages: ThinPage[] = []
  const totalUrls: string[] = []

  for (const host of SWEEP_HOSTS) {
    const urls = await fetchSitemapUrls(host)
    totalUrls.push(...urls)
    warnings.push(`${host}: ${urls.length} URLs`)

    for (const url of urls) {
      let wordCount: number
      try {
        const result = await fetchWordCount(url)
        wordCount = result.wordCount
        if (wordCount === 0) continue // couldn't fetch
      } catch {
        continue // skip on network error
      }

      const { contentType, guessedKeyword, region } = inferContentTypeFromUrl(url)
      const minWords = minWordsForType(contentType)
      const targetWords = targetWordsForType(contentType)

      // De minimis: utility pages (privacy, terms, refund, contact) have
      // inherently thin content — only flag if below absolute thin floor.
      const isUtilityPage = /privacy|terms|refund|contact/.test(url)
      // Service/hub pages (services, about, book, faqs, support, resources) are
      // hand-crafted Next.js page.tsx files. The Content Studio creates content
      // files (.md/.mdx), not page.tsx, so these cannot be expanded by the
      // pipeline without rewriting the entire page. Exclude from expansion.
      const isHandCraftedNextPage = /\/services\/?$|\/about\/?$|\/book\/?$|\/faqs\/?$|\/support\/?$|\/resources\/?$/.test(url)
      const urlPath = new URL(url).pathname
      const isHubPage = /\/guide\/[^/]+$/.test(url) || /\/guide\/?$/.test(url) || urlPath === '/' || urlPath === ''
      const effectiveMin = isUtilityPage ? Math.floor(minWords * 0.5) : minWords

      if (wordCount < effectiveMin) {
        thinPages.push({
          url,
          host: host.includes('yousafeconsultancy.com') && !host.includes('.')
            ? 'apex' : host.split('.')[0] as OwnerHost,
          path: urlPath,
          currentWords: wordCount,
          minWords: effectiveMin,
          targetWords,
          deficit: effectiveMin - wordCount,
          contentType,
          guessedKeyword,
          region,
          expandable: !isUtilityPage && !isHandCraftedNextPage && !isHubPage && wordCount >= 200,
        })
      }
    }
  }

  // Sort by deficit descending (thinnest first)
  thinPages.sort((a, b) => b.deficit - a.deficit)

  return {
    scannedHosts: [...SWEEP_HOSTS],
    totalUrls: totalUrls.length,
    thinPages,
    expanded: [],
    failed: [],
    warnings,
    ranAt: new Date().toISOString(),
  }
}

// ── Thin-page expansion ─────────────────────────────────────────────────────

/**
 * Expand a thin page by running it through the Content Studio pipeline.
 * Uses the guessed keyword and region to trigger a regeneration that replaces
 * the thin content with deeper, more authoritative content.
 */
export async function expandThinPage(
  page: ThinPage,
  opts?: {
    shipMode?: RequestedShipMode
    dryRun?: boolean
    userId?: string
  },
): Promise<{ ok: boolean; error?: string; wordCount?: number; canonicalUrl?: string; jobId?: string }> {
  try {
    const shipMode = opts?.shipMode ?? 'merge'
    const dryRun = opts?.dryRun ?? false

    const result = await runSeoFactoryPipeline({
      topic: page.guessedKeyword,
      title: page.guessedKeyword,
      primaryKeyword: page.guessedKeyword,
      region: page.region,
      contentType: page.contentType,
      tone: 'educational',
      shipMode,
      dryRun,
      minAuditScore: 65,
      maxRefine: 4,
      opportunityAction: 'expand_or_build',
      writeHint: [
        `PLAY estate_sweep (thin page expansion).`,
        `Current page at ${page.url} has only ${page.currentWords} body words`,
        `(floor ${page.minWords}). Expand to ≥${page.targetWords} words with:`,
        `step-by-step procedures, official source citations, document checklists,`,
        `eligibility requirements, timelines, and 4–6 FAQs with full answers.`,
        `Maintain the same intent — do not drift to a different topic.`,
        `Replace thin content with comprehensive coverage.`,
      ].join(' '),
      userId: opts?.userId ?? 'system:estate-sweep',
    })

    if (result.ship?.status === 'deployed' || result.ship?.status === 'merged') {
      return {
        ok: true,
        wordCount: result.audit.wordCount,
        canonicalUrl: result.plan.canonicalUrl,
        jobId: result.jobId,
      }
    }

    if (result.ship?.status === 'pr_created') {
      return {
        ok: true,
        wordCount: result.audit.wordCount,
        canonicalUrl: result.plan.canonicalUrl,
        jobId: result.jobId,
      }
    }

    return {
      ok: false,
      error: result.shipError || `Pipeline completed but no ship: ${result.ship?.status || 'none'}`,
      jobId: result.jobId,
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Expansion failed',
    }
  }
}

/**
 * Run a full sweep + expand thin pages, returning the sweep results.
 * Designed to be called from the daily War Room or the estate-sweep API.
 */
export async function runSweepAndExpand(opts?: {
  limit?: number
  shipMode?: RequestedShipMode
  dryRun?: boolean
  minWordsFloor?: number
}): Promise<SweepResult> {
  const limit = Math.min(10, Math.max(1, opts?.limit ?? 3))
  const sweep = await runEstateSweep()

  // Only expand pages that are below floor but have some content
  const candidates = sweep.thinPages.filter(p => p.expandable).slice(0, limit)

  for (const page of candidates) {
    try {
      const result = await expandThinPage(page, {
        shipMode: opts?.shipMode ?? 'merge',
        dryRun: opts?.dryRun,
        userId: 'system:estate-sweep',
      })
      if (result.ok) {
        sweep.expanded.push(page)
      } else {
        sweep.failed.push({ url: page.url, error: result.error || 'unknown' })
      }
    } catch (e) {
      sweep.failed.push({ url: page.url, error: e instanceof Error ? e.message : 'unknown' })
    }
  }

  return sweep
}

// ── Daily War Room integration ──────────────────────────────────────────────

/**
 * Select thin pages from the estate sweep, sorted by urgency.
 * Called by the daily War Room to add thin-page expansions to the batch.
 */
export async function selectThinPagesForExpansion(opts?: {
  limit?: number
  minDeficit?: number
}): Promise<ThinPage[]> {
  const limit = opts?.limit ?? 5
  const minDeficit = opts?.minDeficit ?? 100

  const sweep = await runEstateSweep()
  return sweep.thinPages
    .filter(p => p.expandable && p.deficit >= minDeficit)
    .slice(0, limit)
}
