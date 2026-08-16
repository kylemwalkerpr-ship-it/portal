/**
 * POST /api/content-studio/gsc/index-coverage
 *
 * Reads WHY estate pages are (not) indexed from the GSC URL Inspection API:
 *   action: 'fetch' → scan the estate → inspect each URL → classify the reason
 *                     → join to the source file → cache to gsc_index_coverage
 *   action: 'list'  → return the cached snapshot (fast, no live inspection)
 *
 * GET → endpoint info.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { fetchGscIndexCoverage, type GscIndexIssue } from '@/lib/gscIndexCoverage'
import {
  collectEstatePages,
  indexUrlKey,
  type IndexFixItem,
} from '@/lib/seoFactory/indexCoverageFixes'
import type { SiteHealthPage } from '@/lib/seoFactory/siteHealth'

export const runtime = 'nodejs'

export type IndexCoverageRow = GscIndexIssue & {
  repo?: string | null
  path?: string | null
  title?: string | null
  words?: number | null
}

async function cacheRows(rows: IndexCoverageRow[]): Promise<boolean> {
  try {
    const db = createSupabaseAdminClient()
    const now = new Date().toISOString()
    const payload = rows.map((r) => ({
      url: r.url,
      site_url: null,
      indexed: r.indexed,
      reason_code: r.reasonCode,
      reason: r.reason,
      fix_action: r.fixAction,
      fix_label: r.fixLabel,
      auto_fix: r.autoFix,
      coverage_state: r.coverageState,
      verdict: r.verdict,
      indexing_state: r.indexingState,
      page_fetch_state: r.pageFetchState,
      robots_txt_state: r.robotsTxtState,
      google_canonical: r.googleCanonical,
      user_canonical: r.userCanonical,
      last_crawl_time: r.lastCrawlTime,
      repo: r.repo ?? null,
      path: r.path ?? null,
      title: r.title ?? null,
      words: r.words ?? null,
      inspected_at: now,
    }))
    const { error } = await db.from('gsc_index_coverage').upsert(payload, { onConflict: 'url' })
    return !error
  } catch {
    return false
  }
}

async function readCache(): Promise<IndexCoverageRow[]> {
  try {
    const db = createSupabaseAdminClient()
    const { data, error } = await db
      .from('gsc_index_coverage')
      .select('*')
      .eq('indexed', false)
      .order('inspected_at', { ascending: false })
      .limit(500)
    if (error || !data) return []
    return (data as any[]).map((d) => ({
      url: d.url,
      indexed: Boolean(d.indexed),
      reasonCode: d.reason_code ?? 'UNKNOWN',
      reason: d.reason ?? 'Unknown',
      fixAction: (d.fix_action ?? 'MANUAL') as GscIndexIssue['fixAction'],
      fixLabel: d.fix_label ?? 'Review',
      autoFix: Boolean(d.auto_fix),
      coverageState: d.coverage_state ?? null,
      verdict: d.verdict ?? null,
      indexingState: d.indexing_state ?? null,
      pageFetchState: d.page_fetch_state ?? null,
      robotsTxtState: d.robots_txt_state ?? null,
      googleCanonical: d.google_canonical ?? null,
      userCanonical: d.user_canonical ?? null,
      sitemaps: [],
      referringUrls: [],
      lastCrawlTime: d.last_crawl_time ?? null,
      repo: d.repo ?? null,
      path: d.path ?? null,
      title: d.title ?? null,
      words: d.words ?? null,
    }))
  } catch {
    return []
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/content-studio/gsc/index-coverage',
    actions: ['fetch', 'list'],
    note: 'Reads GSC URL Inspection verdicts (why a page is not indexed) and caches them to gsc_index_coverage.',
  })
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const body = (await request.json().catch(() => ({}))) as {
      action?: string
      scope?: 'all' | 'caseworks' | 'yousafe-consultancy' | 'portal'
      maxUrls?: number
    }

    if (body.action === 'list') {
      const cached = await readCache()
      return NextResponse.json({ ok: true, source: 'cache', issues: cached, generatedAt: new Date().toISOString() })
    }

    // Default: fetch — scan the estate, inspect each URL, classify, cache.
    const scope = body.scope === 'caseworks' || body.scope === 'yousafe-consultancy' || body.scope === 'portal' ? body.scope : 'all'
    const pages: SiteHealthPage[] = await collectEstatePages(scope)
    const byKey = new Map<string, SiteHealthPage>()
    for (const p of pages) byKey.set(indexUrlKey(p.url), p)

    const urls = [...new Set(pages.map((p) => p.url))].sort()
    const result = await fetchGscIndexCoverage(urls, { maxUrls: body.maxUrls ?? 250 })

    const rows: IndexCoverageRow[] = result.issues.map((issue) => {
      const page = byKey.get(indexUrlKey(issue.url))
      return {
        ...issue,
        repo: page?.repo ?? null,
        path: page?.path ?? null,
        title: page?.title ?? null,
        words: page?.words ?? null,
      }
    })

    const cached = await cacheRows(rows)

    return NextResponse.json({
      ok: true,
      source: 'live',
      configured: result.configured,
      inspected: result.inspected,
      skipped: result.skipped,
      scannedPages: pages.length,
      issues: rows,
      errors: result.errors,
      cached,
      generatedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[content-studio/gsc/index-coverage]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Index coverage fetch failed' },
      { status: 500 },
    )
  }
}
