/**
 * One persisted GSC query×page sync, shared by the manual admin route and the
 * scheduled daily engine run.
 *
 * The measurement contract is explicit because "zero rows processed" must never
 * be ambiguous:
 *   live        — configured, fetched rows, upserted (snapshot best-effort)
 *   empty       — configured live query that legitimately returned zero rows
 *   unavailable — credentials/property missing; NO DB writes, NO snapshot
 *   failed      — fetch/upsert actually threw; callers must not report success
 *
 * Freshness contract: `syncedAt` is stamped ONLY when rows were successfully
 * persisted (live/empty). Unavailable/failed carry `syncedAt: null` plus an
 * `attemptedAt` for attempt recency — a failed attempt must never look fresh.
 *
 * The DB client is injected by the caller (admin request client or the cron's
 * service-role client) — this module never authenticates an HTTP route.
 */

import { fetchQueryPageRows, resolveGscDayWindow } from '@/lib/gscAnalytics'
import { upsertSeoGscRows } from './gscRows'
import { saveSnapshotVersion } from './gscHistory'

export type GscPersistStatus = 'live' | 'empty' | 'unavailable' | 'failed'

export interface GscPersistRange {
  startDate: string
  endDate: string
  days: number
}

export interface GscPersistResult {
  status: GscPersistStatus
  ok: boolean
  rowsProcessed: number
  range: GscPersistRange
  siteUrl: string | null
  /** Completion of a successful persistence only; null when unavailable/failed. */
  syncedAt: string | null
  /** When this persistence attempt ran — recency evidence even on failure. */
  attemptedAt: string
  warnings: string[]
  error?: string
}

export interface GscPersistOptions {
  days?: number
  siteUrl?: string | null
}

type GscUpsertDb = Parameters<typeof upsertSeoGscRows>[0]

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

export async function persistGscQueryPageRows(
  db: GscUpsertDb,
  opts: GscPersistOptions = {},
): Promise<GscPersistResult> {
  const days = Number(opts.days) || 90
  const expectedRange = resolveGscDayWindow(days)
  const attemptedAt = new Date().toISOString()

  let fetched: Awaited<ReturnType<typeof fetchQueryPageRows>>
  try {
    fetched = await fetchQueryPageRows({ days, siteUrl: opts.siteUrl })
  } catch (err) {
    return {
      status: 'failed',
      ok: false,
      rowsProcessed: 0,
      range: expectedRange,
      siteUrl: opts.siteUrl ?? null,
      syncedAt: null,
      attemptedAt,
      warnings: [],
      error: errorMessage(err, 'GSC fetch failed'),
    }
  }

  if (!fetched.configured) {
    return {
      status: 'unavailable',
      ok: false,
      rowsProcessed: 0,
      range: fetched.range,
      siteUrl: fetched.siteUrl,
      syncedAt: null,
      attemptedAt,
      warnings: fetched.warnings,
    }
  }

  const warnings = [...fetched.warnings]
  try {
    const { upserted } = await upsertSeoGscRows(db, fetched.rows)
    if (fetched.siteUrl) {
      try {
        await saveSnapshotVersion(
          fetched.siteUrl,
          fetched.range.endDate,
          fetched.rows.length,
          JSON.stringify({
            rows: fetched.rows.map((r) => ({
              keys: [r.query, r.page],
              clicks: r.clicks,
              impressions: r.impressions,
              ctr: r.ctr,
              position: r.position,
            })),
          }),
        )
      } catch (snapErr) {
        /* snapshot is best-effort; rows are the source of truth */
        warnings.push(`snapshot version not saved: ${errorMessage(snapErr, 'failed')}`)
      }
    }
    return {
      status: fetched.rows.length === 0 ? 'empty' : 'live',
      ok: true,
      rowsProcessed: upserted,
      range: fetched.range,
      siteUrl: fetched.siteUrl,
      syncedAt: new Date().toISOString(),
      attemptedAt,
      warnings,
    }
  } catch (err) {
    return {
      status: 'failed',
      ok: false,
      rowsProcessed: 0,
      range: fetched.range,
      siteUrl: fetched.siteUrl,
      syncedAt: null,
      attemptedAt,
      warnings,
      error: errorMessage(err, 'GSC upsert failed'),
    }
  }
}
