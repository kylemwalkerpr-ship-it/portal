/**
 * POST /api/content-studio/gsc/index-coverage
 *
 * URL Inspection is quota-limited measurement, not an estate-wide coverage
 * total. A fetch run inventories public candidates cheaply, rotates a bounded
 * sample, persists every successful observation, and records attempt metadata.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { detectGscAuthMode, getGscAccess } from '@/lib/gscAuth'
import {
  fetchGscIndexCoverage,
  prioritizeIndexCoverageUrls,
  type GscIndexCoverageResult,
  type GscIndexIssue,
} from '@/lib/gscIndexCoverage'
import {
  collectEstatePageInventory,
  indexUrlKey,
} from '@/lib/seoFactory/indexCoverageFixes'
import type { SiteHealthPage, SiteHealthScope } from '@/lib/seoFactory/siteHealth'

export const runtime = 'nodejs'

export type IndexCoverageRow = GscIndexIssue & {
  repo?: string | null
  path?: string | null
  title?: string | null
  words?: number | null
}

type PriorInspection = { url: string; inspected_at: string | null }

type CacheResult = { ok: true } | { ok: false; error: string }

async function cacheRows(
  rows: IndexCoverageRow[],
  siteUrl: string | null,
  inspectedAt: string,
): Promise<CacheResult> {
  if (!rows.length) return { ok: true }
  try {
    const db = createSupabaseAdminClient()
    const payload = rows.map((r) => ({
      url: r.url,
      site_url: siteUrl,
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
      inspected_at: inspectedAt,
    }))
    const { error } = await db.from('gsc_index_coverage').upsert(payload, { onConflict: 'url' })
    return error ? { ok: false, error: error.message } : { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'coverage cache write failed' }
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

async function readPriorInspections(): Promise<PriorInspection[]> {
  try {
    const db = createSupabaseAdminClient()
    const { data, error } = await db
      .from('gsc_index_coverage')
      .select('url,inspected_at')
      .order('inspected_at', { ascending: true })
      .limit(5000)
    return error ? [] : ((data ?? []) as PriorInspection[])
  } catch {
    return []
  }
}

async function readLatestScan(): Promise<Record<string, unknown> | null> {
  try {
    const db = createSupabaseAdminClient()
    const query = db.from('seo_engine_runs').select('status,summary,errors,started_at,finished_at').eq('kind', 'manual').contains('summary', { measurementKind: 'index-coverage' }).order('started_at', { ascending: false }).limit(1)
    const { data, error } = await query
    return error || !Array.isArray(data) || !data.length ? null : data[0] as Record<string, unknown>
  } catch {
    return null
  }
}

async function recordScanAttempt(
  result: Pick<GscIndexCoverageResult, 'state' | 'requested' | 'attempted' | 'inspected' | 'failed' | 'skipped' | 'errors' | 'siteUrl' | 'attemptedAt' | 'completedAt' | 'successfulAt'>,
  extra: { candidateCount: number; scope: SiteHealthScope; maxUrls: number; cached: boolean },
): Promise<CacheResult> {
  try {
    const status = result.state === 'complete' ? 'success' : result.state === 'partial' ? 'partial' : 'failed'
    const db = createSupabaseAdminClient()
    const { error } = await db.from('seo_engine_runs').insert({
      kind: 'manual',
      status,
      triggered_by: 'content-studio',
      started_at: result.attemptedAt,
      finished_at: result.completedAt ?? new Date().toISOString(),
      summary: {
        measurementKind: 'index-coverage',
        measurementState: result.state,
        attemptedAt: result.attemptedAt,
        completedAt: result.completedAt,
        successfulAt: result.successfulAt,
        siteUrl: result.siteUrl,
        candidateCount: extra.candidateCount,
        requestedUrlCount: result.requested,
        attemptedUrlCount: result.attempted,
        inspectedUrlCount: result.inspected,
        failedCount: result.failed,
        skippedCount: result.skipped,
        scope: extra.scope,
        maxUrls: extra.maxUrls,
        selectionStrategy: 'never-inspected-first_then_oldest-inspected',
        cachePersisted: extra.cached,
      },
      errors: result.errors.slice(0, 20).map((e) => `${e.url}: ${e.error}`),
    })
    return error ? { ok: false, error: error.message } : { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'scan metadata write failed' }
  }
}

function scopeFrom(value: unknown): SiteHealthScope {
  return value === 'caseworks' || value === 'yousafe-consultancy' || value === 'portal' ? value : 'all'
}

function joinObservation(issue: GscIndexIssue, byKey: Map<string, SiteHealthPage>): IndexCoverageRow {
  const page = byKey.get(indexUrlKey(issue.url))
  return {
    ...issue,
    repo: page?.repo ?? null,
    path: page?.path ?? null,
    title: page?.title ?? null,
    words: page?.words ?? null,
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/content-studio/gsc/index-coverage',
    actions: ['fetch', 'list'],
    note: 'Samples GSC URL Inspection truth and caches successful per-URL observations. It is not an estate-wide GSC coverage total.',
  })
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const body = (await request.json().catch(() => ({}))) as {
      action?: string
      scope?: SiteHealthScope
      maxUrls?: number
    }

    if (body.action === 'list') {
      const [cached, scan] = await Promise.all([readCache(), readLatestScan()])
      return NextResponse.json({ ok: true, source: 'cache', issues: cached, scan, generatedAt: new Date().toISOString() })
    }

    const scope = scopeFrom(body.scope)
    const maxUrls = Math.max(1, Math.min(50, Math.floor(body.maxUrls ?? 50)))
    const attemptedAt = new Date().toISOString()

    // Fail before repository inventory work when no usable provider access exists.
    // A configured credential bundle that cannot mint access is a failure;
    // genuinely absent configuration is unavailable.
    const authMode = await detectGscAuthMode()
    const access = await getGscAccess()
    if (!access?.accessToken || !access.siteUrl) {
      const state = authMode ? 'failed' as const : 'unavailable' as const
      const unavailable: GscIndexCoverageResult = {
        state, observations: [], issues: [], requested: 0,
        attempted: 0, inspected: 0, failed: state === 'failed' ? 1 : 0, skipped: 0,
        errors: state === 'failed' ? [{ url: '', error: `GSC ${authMode} access resolution failed` }] : [],
        configured: Boolean(authMode), siteUrl: access?.siteUrl ?? null,
        attemptedAt, completedAt: state === 'failed' ? new Date().toISOString() : null, successfulAt: null,
      }
      const recorded = await recordScanAttempt(unavailable, { candidateCount: 0, scope, maxUrls, cached: false })
      return NextResponse.json(
        { ok: false, source: 'live', ...unavailable, cached: false, recorded: recorded.ok },
        { status: state === 'failed' ? 502 : 503 },
      )
    }

    // Three tree reads at most. Page blobs are fetched later only by the fix flow.
    const pages = await collectEstatePageInventory(scope)
    if (!pages.length) {
      const failed: GscIndexCoverageResult = {
        state: 'failed', observations: [], issues: [], requested: 0,
        attempted: 0, inspected: 0, failed: 0, skipped: 0,
        configured: true, siteUrl: access.siteUrl,
        attemptedAt, completedAt: new Date().toISOString(), successfulAt: null,
        errors: [{ url: '', error: 'Estate inventory returned no public candidates' }],
      }
      const recorded = await recordScanAttempt(failed, { candidateCount: 0, scope, maxUrls, cached: false })
      return NextResponse.json({ ok: false, source: 'live', ...failed, cached: false, recorded: recorded.ok }, { status: 502 })
    }

    const byKey = new Map<string, SiteHealthPage>()
    for (const page of pages) byKey.set(indexUrlKey(page.url), page)
    const prior = await readPriorInspections()
    const candidates = [...new Set(pages.map((p) => p.url))]
    const sample = prioritizeIndexCoverageUrls(
      candidates,
      prior.map((row) => ({ url: row.url, inspectedAt: row.inspected_at })),
      maxUrls,
    )
    const result = await fetchGscIndexCoverage(sample, { maxUrls: sample.length, access })
    const observations = result.observations.map((row) => joinObservation(row, byKey))
    const issues = result.issues.map((row) => joinObservation(row, byKey))

    let cache: CacheResult = { ok: true }
    if (observations.length > 0) {
      cache = await cacheRows(observations, result.siteUrl, result.successfulAt ?? result.completedAt ?? attemptedAt)
    }
    const recorded = await recordScanAttempt(result, {
      candidateCount: candidates.length,
      scope,
      maxUrls,
      cached: cache.ok && observations.length > 0,
    })

    if (!cache.ok) {
      return NextResponse.json({
        ok: false,
        source: 'live',
        ...result,
        observations,
        issues,
        scannedPages: pages.length,
        cached: false,
        cacheError: 'error' in cache ? cache.error : 'coverage cache write failed',
        recorded: recorded.ok,
      }, { status: 500 })
    }

    const status = result.state === 'partial' ? 206 : result.state === 'failed' ? 502 : 200
    return NextResponse.json({
      ok: result.state === 'complete' || result.state === 'partial',
      source: 'live',
      ...result,
      observations,
      issues,
      scannedPages: pages.length,
      cached: observations.length > 0,
      recorded: recorded.ok,
      generatedAt: new Date().toISOString(),
    }, { status })
  } catch (err) {
    console.error('[content-studio/gsc/index-coverage]', err)
    return NextResponse.json(
      { ok: false, state: 'failed', error: err instanceof Error ? err.message : 'Index coverage fetch failed' },
      { status: 500 },
    )
  }
}
