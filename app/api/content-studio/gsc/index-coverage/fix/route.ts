/**
 * POST /api/content-studio/gsc/index-coverage/fix
 *
 * Resolves "why is this page not indexed" issues surfaced by the reader:
 *   body: { urls?: string[], fixAll?: boolean, requestIndexing?: boolean }
 *
 * Joins the cached GSC verdicts to the scanned estate pages, dispatches the
 * right fix (noindex / canonical / robots.txt edits via PRs, orphan + sitemap
 * via Site Health repair), then requests re-indexing for the fixed pages.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import type { GscIndexIssue } from '@/lib/gscIndexCoverage'
import {
  collectEstatePages,
  joinIssueToPage,
  resolveIndexCoverage,
  type IndexFixItem,
} from '@/lib/seoFactory/indexCoverageFixes'

export const runtime = 'nodejs'

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/content-studio/gsc/index-coverage/fix',
    body: { urls: 'string[] (optional)', fixAll: 'boolean', requestIndexing: 'boolean (default true)' },
  })
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const body = (await request.json().catch(() => ({}))) as {
      urls?: string[]
      fixAll?: boolean
      requestIndexing?: boolean
    }

    // Load cached issues (populated by the reader's 'fetch' action).
    let issues: GscIndexIssue[] = []
    try {
      const db = createSupabaseAdminClient()
      const { data } = await db
        .from('gsc_index_coverage')
        .select('*')
        .eq('indexed', false)
        .order('inspected_at', { ascending: false })
        .limit(500)
      issues = ((data ?? []) as any[]).map((d) => ({
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
      }))
    } catch {
      issues = []
    }

    if (!issues.length) {
      return NextResponse.json({ ok: true, error: 'No cached issues — run the Index Coverage scan first', outcomes: [], summary: null })
    }

    const wanted = body.urls && body.urls.length ? new Set(body.urls.map((u) => u.trim())) : null
    const selected = wanted ? issues.filter((i) => wanted.has(i.url)) : issues

    // Join to scanned pages so fixes know the exact source file + content.
    const pages = await collectEstatePages('all')
    const items: IndexFixItem[] = []
    for (const issue of selected) {
      const joined = joinIssueToPage(issue, pages)
      if (joined) items.push(joined)
    }

    if (!items.length) {
      return NextResponse.json({
        ok: true,
        error: 'No selected issue maps to a known source file (repo path missing)',
        outcomes: [],
        summary: null,
      })
    }

    const result = await resolveIndexCoverage(items, { requestIndexing: body.requestIndexing !== false })

    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[content-studio/gsc/index-coverage/fix]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Index coverage fix failed' },
      { status: 500 },
    )
  }
}
