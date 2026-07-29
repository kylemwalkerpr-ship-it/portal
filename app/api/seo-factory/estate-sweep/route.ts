/**
 * GET/POST /api/seo-factory/estate-sweep
 *
 * Estate sweep: scans every URL across all subdomain sitemaps, detects pages
 * below the content-depth floor, and optionally expands them via the Content
 * Studio pipeline.
 *
 * GET  — dry-run sweep (no writes). Returns the ranked list of thin pages.
 * POST — sweep + expand top N thin pages through the pipeline.
 *
 * Auth: requires admin user.
 * Body (POST):
 *   limit?: number (default 3, max 10)
 *   shipMode?: 'pr' | 'merge' | 'autodeploy' (default merge)
 *   dryRun?: boolean (default false)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import {
  runEstateSweep,
  runSweepAndExpand,
  type SweepResult,
} from '@/lib/seoFactory/estateSweep'
import type { RequestedShipMode } from '@/lib/seoFactory/pipeline'

export async function GET() {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    console.log('[estate-sweep] Starting dry-run sweep...')
    const result = await runEstateSweep()

    return NextResponse.json({
      ok: true,
      source: 'live',
      dryRun: true,
      scannedHosts: result.scannedHosts.length,
      totalUrls: result.totalUrls,
      thinPagesFound: result.thinPages.length,
      thinPages: result.thinPages.slice(0, 50).map(p => ({
        url: p.url,
        currentWords: p.currentWords,
        minWords: p.minWords,
        deficit: p.deficit,
        contentType: p.contentType,
        region: p.region,
        guessedKeyword: p.guessedKeyword,
        expandable: p.expandable,
      })),
      expanded: 0,
      failed: 0,
      warnings: result.warnings,
      message: `Dry-run: scanned ${result.totalUrls} URLs · ${result.thinPages.length} thin pages detected. POST to expand.`,
    })
  } catch (err) {
    console.error('[estate-sweep]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Sweep failed' },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await request.json().catch(() => ({}))
    const limit = Math.min(10, Math.max(1, Number(body.limit) || 3))
    const requestedMode = String(body.shipMode || 'merge').toLowerCase() as RequestedShipMode
    const dryRun = Boolean(body.dryRun)

    console.log(`[estate-sweep] Starting sweep+expand (limit=${limit}, mode=${requestedMode})...`)

    const result = await runSweepAndExpand({
      limit,
      shipMode: requestedMode,
      dryRun,
    })

    return NextResponse.json({
      ok: true,
      dryRun,
      shipMode: requestedMode,
      scannedHosts: result.scannedHosts.length,
      totalUrls: result.totalUrls,
      thinPagesFound: result.thinPages.length,
      thinPages: result.thinPages.slice(0, 50).map(p => ({
        url: p.url,
        currentWords: p.currentWords,
        minWords: p.minWords,
        deficit: p.deficit,
        contentType: p.contentType,
        region: p.region,
        expandable: p.expandable,
      })),
      expanded: result.expanded.length,
      expandedUrls: result.expanded.map(p => p.url),
      failed: result.failed.length,
      failedUrls: result.failed.map(f => ({ url: f.url, error: f.error })),
      warnings: result.warnings,
      message: dryRun
        ? `Dry-run: scanned ${result.totalUrls} URLs · ${result.thinPages.length} thin · would expand top ${limit}`
        : `Sweep complete: scanned ${result.totalUrls} URLs · expanded ${result.expanded.length}/${result.thinPages.length} thin pages`,
    })
  } catch (err) {
    console.error('[estate-sweep]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Sweep failed' },
      { status: 500 },
    )
  }
}
