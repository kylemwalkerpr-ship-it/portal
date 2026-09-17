import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { resolveGscDayWindow } from '@/lib/gscAnalytics'
import {
  dropJunkGscRows,
  GSC_VISIBILITY_SCAN_SELECT,
  loadPersistedGscWindow,
  loadPersistedGscWindowScan,
  type GscWindowScan,
} from '@/lib/seoFactory/gscRows'
import { buildGscVisibilitySummary, classifyPersistedGscRow } from '@/lib/seoFactory/gscVisibility'
import { isJunkQuery } from '@/lib/seoFactory/queryNoise'

/**
 * Columns the limited diagnostic row list has always returned. The measurement
 * scan reads them too, so deriving the diagnostics from the same resolved scan
 * does not change the response row shape.
 */
const PERFORMANCE_ROW_SELECT = `${GSC_VISIBILITY_SCAN_SELECT}, country, device, synced_at`

/**
 * GET /api/content-studio/gsc/performance
 * Reads persisted seo_gsc_rows only — never calls Google.
 * Falls back to the latest stored window when the rolling UTC window is empty
 * so CTR-harvest jobs are not starved between syncs.
 * Junk (PDF filenames, brand navigational) is dropped at the read boundary.
 *
 * P1 measurement integrity: the bounded FULL-WINDOW scan is the PRIMARY read
 * and the limited diagnostic row list (junk-free, `limit` rows, each row
 * carrying an additive `visibilityClass`) is derived from that SAME resolved
 * scan/window — one window, one resolution, so the summary and the diagnostics
 * cannot disagree about which window they describe. The summary carries raw /
 * qualified / off-mission / junk / deep-tail over the whole scanned persisted
 * window, with an explicit scope (cap, exact window count when known, unscanned
 * rows, complete/truncated, fallback, range). The route never serializes the
 * whole scan: raw rows stay persisted and diagnosable in `seo_gsc_rows`, and
 * the summary is derived from them server-side.
 *
 * If the measurement scan fails the route does NOT blank the panel: it falls
 * back to the persisted display read (`visibility: null` plus an explicit
 * `visibilityError` / `visibilityWarning`) so previously working diagnostics
 * keep working while the missing measurement stays visible.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const sp = request.nextUrl.searchParams
    const siteUrl = sp.get('siteUrl') || process.env.GSC_SITE_URL || null
    const daysRaw = Number(sp.get('days') || '90')
    const startOverride = sp.get('startDate') || undefined
    const endOverride = sp.get('endDate') || undefined
    const limit = Math.min(500, Math.max(1, Number(sp.get('limit') || '100') || 100))
    const range = resolveGscDayWindow(daysRaw, startOverride, endOverride)

    // Primary read: one bounded full-window scan (raw rows preserved, never
    // serialized) that resolves the window and its latest-stored fallback once.
    let scan: GscWindowScan
    try {
      scan = await loadPersistedGscWindowScan(auth.db, {
        siteUrl,
        startDate: range.startDate,
        endDate: range.endDate,
        select: PERFORMANCE_ROW_SELECT,
      })
    } catch (err) {
      // Measurement unavailable — degrade to the shipped diagnostic read
      // instead of blanking the panel, and say so explicitly.
      const message = err instanceof Error ? err.message : 'visibility scan failed'
      const persisted = await loadPersistedGscWindow(auth.db, {
        siteUrl,
        startDate: range.startDate,
        endDate: range.endDate,
        limit,
        select: PERFORMANCE_ROW_SELECT,
      })
      const rows = persisted.rows
        .filter((row) => !isJunkQuery(String(row.query || '')))
        .map((row) => ({ ...row, visibilityClass: classifyPersistedGscRow(row) }))
      return NextResponse.json({
        ok: true,
        range: { ...range, startDate: persisted.range.startDate, endDate: persisted.range.endDate },
        requestedRange: range,
        usedFallback: persisted.usedFallback,
        siteUrl,
        rows,
        rowCount: rows.length,
        visibility: null,
        visibilityError: message.slice(0, 240),
        visibilityWarning:
          'Visibility measurement unavailable — showing persisted diagnostic rows only. The full-window visibility summary could not be read.',
      })
    }

    // Belt-and-suspenders: never surface Pacific-PDF / yousafe brand rows.
    // Classification is additive: the limited diagnostic list keeps its shape
    // and ordering (the scan's deterministic full-window order), and each row
    // gains its derived visibility class. The list stays limited — the scan is
    // never serialized.
    const rows = dropJunkGscRows(scan.rows)
      .slice(0, limit)
      .map((row) => ({ ...row, visibilityClass: classifyPersistedGscRow(row) }))

    const visibility = buildGscVisibilitySummary({
      rows: scan.rows,
      scan,
      displayLimit: limit,
      windowDays: range.days ?? daysRaw,
    })

    return NextResponse.json({
      ok: true,
      range: { ...range, startDate: scan.range.startDate, endDate: scan.range.endDate },
      requestedRange: range,
      usedFallback: scan.usedFallback,
      siteUrl,
      rows,
      rowCount: rows.length,
      visibility,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'GSC performance read failed'
    return NextResponse.json({ error: message.slice(0, 240) }, { status: 502 })
  }
}
