/**
 * Normalized GSC query×page rows — persist so dashboards do not re-hit Google.
 */

import { collapseParaphraseDemand } from '@/lib/seoEngine/coverageIntent'
import { isJunkQuery, sanitizeDemandTerm } from './queryNoise'

export type GscMetricRow = {
  query: string
  page: string
  clicks: number
  impressions: number
  ctr: number
  position: number
  country?: string
  device?: string
  startDate: string
  endDate: string
  siteUrl: string
}

export function gscRowUniqueKey(row: Pick<GscMetricRow, 'siteUrl' | 'query' | 'page' | 'startDate' | 'endDate'>): string {
  return [row.siteUrl, row.query, row.page, row.startDate, row.endDate].join('\u0001')
}

export function normalizeGscMetricRow(
  raw: { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number },
  ctx: { siteUrl: string; startDate: string; endDate: string; country?: string; device?: string },
): GscMetricRow | null {
  const query = String(raw?.keys?.[0] || '').trim()
  const page = String(raw?.keys?.[1] || '').trim()
  if (!query || !page) return null
  const clicks = Number(raw.clicks) || 0
  const impressions = Number(raw.impressions) || 0
  const ctr = Number(raw.ctr) || 0
  const position = Number(raw.position) || 0
  return {
    query,
    page,
    clicks,
    impressions,
    ctr,
    position,
    country: ctx.country,
    device: ctx.device,
    startDate: ctx.startDate,
    endDate: ctx.endDate,
    siteUrl: ctx.siteUrl,
  }
}

/** Last write wins for the unique window key. */
export function dedupeGscMetricRows(rows: GscMetricRow[]): GscMetricRow[] {
  const map = new Map<string, GscMetricRow>()
  for (const row of rows) {
    map.set(gscRowUniqueKey(row), row)
  }
  return [...map.values()]
}

export async function paginateGscDimensionPages(
  fetchPage: (startRow: number, rowLimit: number) => Promise<Array<{ keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }>>,
  opts?: { pageSize?: number; maxRows?: number },
): Promise<Array<{ keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }>> {
  const pageSize = Math.min(25_000, Math.max(1, opts?.pageSize ?? 5_000))
  const maxRows = Math.min(25_000, Math.max(pageSize, opts?.maxRows ?? 25_000))
  const out: Array<{ keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }> = []
  let startRow = 0
  while (out.length < maxRows) {
    const chunk = await fetchPage(startRow, Math.min(pageSize, maxRows - out.length))
    if (!chunk.length) break
    out.push(...chunk)
    if (chunk.length < pageSize) break
    startRow += chunk.length
  }
  return out.slice(0, maxRows)
}

type SeoGscInsert = {
  site_url: string
  query: string
  page: string
  clicks: number
  impressions: number
  ctr: number
  position: number
  country: string | null
  device: string | null
  start_date: string
  end_date: string
  synced_at: string
}

export function toSeoGscInsert(row: GscMetricRow, syncedAt = new Date().toISOString()): SeoGscInsert {
  return {
    site_url: row.siteUrl,
    query: row.query,
    page: row.page,
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
    country: row.country || null,
    device: row.device || null,
    start_date: row.startDate,
    end_date: row.endDate,
    synced_at: syncedAt,
  }
}

export async function upsertSeoGscRows(
  db: { from: (table: string) => { upsert: (rows: SeoGscInsert[], opts: { onConflict: string }) => PromiseLike<{ error: { message: string } | null }> } },
  rows: GscMetricRow[],
): Promise<{ upserted: number }> {
  const unique = dedupeGscMetricRows(rows)
  if (!unique.length) return { upserted: 0 }
  const payload = unique.map((r) => toSeoGscInsert(r))
  const { error } = await db.from('seo_gsc_rows').upsert(payload, {
    onConflict: 'site_url,query,page,start_date,end_date',
  })
  if (error) throw new Error(error.message)
  return { upserted: payload.length }
}

type GscDb = {
  from: (table: string) => {
    select: (cols: string, opts?: { count?: 'exact'; head?: boolean }) => any
  }
}

/** Over-fetch so `limit` is eligible rows after junk drop, not raw GSC rows. */
const JUNK_OVERFETCH = 8
const JUNK_OVERFETCH_CAP = 5_000

export function dropJunkGscRows<T extends { query?: unknown }>(rows: T[]): T[] {
  return rows.filter((row) => !isJunkQuery(String(row.query || '')))
}

function overFetchLimit(limit: number): number {
  const n = Math.max(1, limit)
  return Math.min(JUNK_OVERFETCH_CAP, Math.max(n, n * JUNK_OVERFETCH))
}

/**
 * Read persisted seo_gsc_rows for a window. When the rolling UTC window has
 * not been synced yet (0 rows), fall back to the latest stored window so
 * Discover/CTR harvest is not starved of real impressions.
 */
export async function loadPersistedGscWindow(
  db: GscDb,
  opts: {
    siteUrl: string | null
    startDate: string
    endDate: string
    limit: number
    select?: string
  },
): Promise<{
  rows: Array<Record<string, unknown>>
  rowCount: number
  range: { startDate: string; endDate: string }
  usedFallback: boolean
}> {
  const select = opts.select || 'query, page, clicks, impressions, ctr, position, start_date, end_date'
  const applySite = (q: any) => (opts.siteUrl ? q.eq('site_url', opts.siteUrl) : q)
  const fetchLimit = overFetchLimit(opts.limit)

  let q = applySite(
    db.from('seo_gsc_rows').select(select).eq('start_date', opts.startDate).eq('end_date', opts.endDate),
  )
    .order('impressions', { ascending: false })
    .limit(fetchLimit)
  const first = await q
  if (first.error) throw new Error(first.error.message)
  const firstRaw = (first.data || []) as Array<Record<string, unknown>>
  if (firstRaw.length > 0) {
    const eligible = dropJunkGscRows(firstRaw).slice(0, opts.limit)
    return {
      rows: eligible,
      rowCount: eligible.length,
      range: { startDate: opts.startDate, endDate: opts.endDate },
      usedFallback: false,
    }
  }

  let latestQ = applySite(db.from('seo_gsc_rows').select('start_date, end_date')).order('end_date', { ascending: false }).limit(1)
  const latest = await latestQ
  if (latest.error) throw new Error(latest.error.message)
  const latestRow = latest.data?.[0] as { start_date?: string; end_date?: string } | undefined
  if (!latestRow?.start_date || !latestRow?.end_date) {
    return { rows: [], rowCount: 0, range: { startDate: opts.startDate, endDate: opts.endDate }, usedFallback: false }
  }

  let q2 = applySite(
    db.from('seo_gsc_rows').select(select).eq('start_date', latestRow.start_date).eq('end_date', latestRow.end_date),
  )
    .order('impressions', { ascending: false })
    .limit(fetchLimit)
  const second = await q2
  if (second.error) throw new Error(second.error.message)
  const fallbackRows = dropJunkGscRows((second.data || []) as Array<Record<string, unknown>>).slice(0, opts.limit)
  return {
    rows: fallbackRows,
    rowCount: fallbackRows.length,
    range: { startDate: latestRow.start_date, endDate: latestRow.end_date },
    usedFallback: fallbackRows.length > 0,
  }
}

/**
 * P1 measurement integrity — bounded FULL-WINDOW scan of persisted rows.
 *
 * `loadPersistedGscWindow` above keeps its display semantics (junk dropped,
 * `limit` eligible rows) and is deliberately untouched. MEASUREMENT cannot use
 * that slice: a top-40 read used as the denominator turns topical pollution
 * into an invisible rounding error. This helper reads the persisted window for
 * measurement only:
 *
 *   - an EXACT count (`count: 'exact', head: true`) for the resolved window;
 *   - a bounded scan capped at `GSC_VISIBILITY_SCAN_CAP` (25 000, aligned to the
 *     upstream Search Analytics cap), paged deterministically through PostgREST
 *     page limits instead of trusting one huge `limit`;
 *   - the same latest-stored-window fallback as the display loader;
 *   - a TRUTHFUL scope: `complete` is false whenever the exact count is unknown
 *     or rows were left unscanned, so a bounded read can never masquerade as the
 *     whole window.
 *
 * Raw rows are returned as stored — classification happens later and is
 * derived, never destructive.
 */
export const GSC_VISIBILITY_SCAN_CAP = 25_000
/** PostgREST/Supabase default page limit — page deterministically under it. */
export const GSC_VISIBILITY_SCAN_PAGE_SIZE = 1_000

export const GSC_VISIBILITY_SCAN_SELECT =
  'query, page, clicks, impressions, ctr, position, start_date, end_date, site_url'

/**
 * M3 — deterministic TOTAL order for the paged scan.
 *
 * `impressions` alone is not a total order: equal-impression rows come back in
 * whatever order PostgREST happens to produce, so `range(offset, …)` paging can
 * duplicate one row and skip another, silently losing rows from a "full window"
 * measurement. Highest impressions stay first (a capped scan keeps the material
 * part of the mix), then the row's unique-key fields break every tie — the
 * window is already fixed by the `start_date`/`end_date` filters, and
 * `GSC_VISIBILITY_SCAN_SELECT` carries the rest of the key (`site_url`, `query`,
 * `page`). PostgREST applies these as a single stable `order=` chain.
 */
export const GSC_VISIBILITY_SCAN_ORDER: ReadonlyArray<readonly [string, boolean]> = [
  ['impressions', false],
  ['site_url', true],
  ['query', true],
  ['page', true],
]

export type GscWindowScan = {
  rows: Array<Record<string, unknown>>
  scannedRows: number
  /** Exact persisted row count for the resolved window, when it could be read. */
  windowRowCount: number | null
  countKnown: boolean
  /** windowRowCount − scannedRows when the exact count is known, else null. */
  unscannedRows: number | null
  truncated: boolean
  /** True only with a known exact count and nothing left unscanned. */
  complete: boolean
  cap: number
  usedFallback: boolean
  range: { startDate: string; endDate: string }
}

type ScanDb = {
  from: (table: string) => {
    select: (cols: string, opts?: { count?: 'exact'; head?: boolean }) => any
  }
}

type ScanPage = {
  rows: Array<Record<string, unknown>>
  /** True when the builder supports offset paging (`range`). */
  paged: boolean
}

/** Exact row count for one stored window; null when the backend cannot say. */
async function exactWindowRowCount(
  db: ScanDb,
  siteUrl: string | null,
  startDate: string,
  endDate: string,
): Promise<number | null> {
  let q = db
    .from('seo_gsc_rows')
    .select('query', { count: 'exact', head: true })
    .eq('start_date', startDate)
    .eq('end_date', endDate)
  if (siteUrl) q = q.eq('site_url', siteUrl)
  const res = await q
  if (res?.error) throw new Error(res.error.message)
  const count = res?.count
  return typeof count === 'number' && Number.isFinite(count) ? count : null
}

/** Latest stored window (probed with the same fallback rule as the loader). */
async function latestStoredWindow(
  db: ScanDb,
  siteUrl: string | null,
): Promise<{ startDate: string; endDate: string } | null> {
  let q = db.from('seo_gsc_rows').select('start_date, end_date')
  if (siteUrl) q = q.eq('site_url', siteUrl)
  const res = await q.order('end_date', { ascending: false }).limit(1)
  if (res?.error) throw new Error(res.error.message)
  const row = res?.data?.[0] as { start_date?: string; end_date?: string } | undefined
  if (!row?.start_date || !row?.end_date) return null
  return { startDate: row.start_date, endDate: row.end_date }
}

/**
 * Bounded, deterministically paged scan of one stored window. Rows are read in
 * a deterministic total order (`GSC_VISIBILITY_SCAN_ORDER`): highest impression
 * rows first, so a capped scan keeps the material part of the mix, with a
 * unique-key tie-break so offsets cannot drift between pages — the scope flags
 * are what keep the bounded read honest.
 */
async function scanStoredWindow(
  db: ScanDb,
  opts: {
    siteUrl: string | null
    startDate: string
    endDate: string
    select: string
    cap: number
    pageSize: number
    knownCount: number | null
  },
): Promise<ScanPage> {
  const rows: Array<Record<string, unknown>> = []
  let offset = 0
  let paged: boolean | null = null
  const makeQuery = () => {
    let q = db
      .from('seo_gsc_rows')
      .select(opts.select)
      .eq('start_date', opts.startDate)
      .eq('end_date', opts.endDate)
    if (opts.siteUrl) q = q.eq('site_url', opts.siteUrl)
    // Every page is requested with the SAME order chain, or a range-based page
    // could re-read (or skip) rows that tie on the primary sort key.
    for (const [column, ascending] of GSC_VISIBILITY_SCAN_ORDER) {
      q = q.order(column, { ascending })
    }
    return q
  }

  while (rows.length < opts.cap) {
    let q = makeQuery()
    if (paged == null) paged = typeof q?.range === 'function'
    // With `range` we page in deterministic offsets; a builder without offset
    // support (test doubles) can only take one bounded cap-sized request.
    const want = paged ? Math.min(opts.pageSize, opts.cap - rows.length) : opts.cap
    q = paged ? q.range(offset, offset + want - 1) : q.limit(want)
    const res = await q
    if (res?.error) throw new Error(res.error.message)
    const chunk = (res?.data || []) as Array<Record<string, unknown>>
    if (!chunk.length) break
    rows.push(...chunk)
    // Without offsets a second request would re-read the same page.
    if (!paged) break
    if (chunk.length < want) break
    if (opts.knownCount != null && rows.length >= Math.min(opts.knownCount, opts.cap)) break
    offset += chunk.length
  }

  return { rows: rows.slice(0, opts.cap), paged: paged === true }
}

export async function loadPersistedGscWindowScan(
  db: GscDb,
  opts: {
    siteUrl: string | null
    startDate: string
    endDate: string
    cap?: number
    pageSize?: number
    select?: string
  },
): Promise<GscWindowScan> {
  const scanDb: ScanDb = db
  const cap = Math.min(GSC_VISIBILITY_SCAN_CAP, Math.max(1, Math.floor(opts.cap ?? GSC_VISIBILITY_SCAN_CAP)))
  const pageSize = Math.min(cap, Math.max(1, Math.floor(opts.pageSize ?? GSC_VISIBILITY_SCAN_PAGE_SIZE)))
  const select = opts.select || GSC_VISIBILITY_SCAN_SELECT

  const finish = (input: {
    rows: Array<Record<string, unknown>>
    windowRowCount: number | null
    countKnown: boolean
    usedFallback: boolean
    range: { startDate: string; endDate: string }
  }): GscWindowScan => {
    const scannedRows = input.rows.length
    const truncated = input.countKnown
      ? (input.windowRowCount ?? 0) > scannedRows
      : scannedRows >= cap
    return {
      rows: input.rows,
      scannedRows,
      windowRowCount: input.windowRowCount,
      countKnown: input.countKnown,
      unscannedRows:
        input.countKnown && input.windowRowCount != null
          ? Math.max(0, input.windowRowCount - scannedRows)
          : null,
      truncated,
      // Truthful completeness: a bounded scan and an unknown exact count are
      // both incomplete, whatever the rows happened to look like.
      complete: input.countKnown && !truncated,
      cap,
      usedFallback: input.usedFallback,
      range: input.range,
    }
  }

  const windowCount = await exactWindowRowCount(scanDb, opts.siteUrl, opts.startDate, opts.endDate)
  const windowCountKnown = windowCount != null
  const windowScan = await scanStoredWindow(scanDb, {
    siteUrl: opts.siteUrl,
    startDate: opts.startDate,
    endDate: opts.endDate,
    select,
    cap,
    pageSize,
    knownCount: windowCount,
  })
  // The exact count is the authority on emptiness — the display loader falls
  // back on an empty window, and measurement must agree with it.
  const windowEmpty = windowCountKnown ? windowCount === 0 : windowScan.rows.length === 0

  if (!windowEmpty) {
    return finish({
      rows: windowScan.rows,
      windowRowCount: windowCount,
      countKnown: windowCountKnown,
      usedFallback: false,
      range: { startDate: opts.startDate, endDate: opts.endDate },
    })
  }

  // Latest-stored-window fallback (preserved from the display loader): the
  // rolling window may simply not be synced yet.
  const latest = await latestStoredWindow(scanDb, opts.siteUrl)
  if (!latest) {
    return finish({
      rows: [],
      windowRowCount: windowCount,
      countKnown: windowCountKnown,
      usedFallback: false,
      range: { startDate: opts.startDate, endDate: opts.endDate },
    })
  }

  const fallbackCount = await exactWindowRowCount(scanDb, opts.siteUrl, latest.startDate, latest.endDate)
  const fallbackScan = await scanStoredWindow(scanDb, {
    siteUrl: opts.siteUrl,
    startDate: latest.startDate,
    endDate: latest.endDate,
    select,
    cap,
    pageSize,
    knownCount: fallbackCount,
  })

  if (!fallbackScan.rows.length) {
    // Nothing stored in the latest window either — report the requested window
    // honestly instead of pretending a fallback happened.
    return finish({
      rows: [],
      windowRowCount: windowCount,
      countKnown: windowCountKnown,
      usedFallback: false,
      range: { startDate: opts.startDate, endDate: opts.endDate },
    })
  }

  return finish({
    rows: fallbackScan.rows,
    windowRowCount: fallbackCount,
    countKnown: fallbackCount != null,
    usedFallback: true,
    range: latest,
  })
}

/** Query-level demand shaped from persisted query×page rows. */
export type PersistedDemandQuery = {
  term: string
  impressions: number
  clicks: number
  ctr: number
  position: number
  page?: string
}

/**
 * Collapse seo_gsc_rows (query×page) into one query per term, keeping the
 * highest-impression page. Drops PDF/URL/brand noise by default so Discover
 * does not score leaked filenames as demand. Pass a custom `isJunk` only to
 * tighten or relax the read-boundary filter.
 */
export function queriesFromPersistedGscRows(
  rows: Array<{
    query?: unknown
    page?: unknown
    impressions?: unknown
    clicks?: unknown
    ctr?: unknown
    position?: unknown
  }>,
  isJunk: (term: string) => boolean = isJunkQuery,
): PersistedDemandQuery[] {
  const best = new Map<string, PersistedDemandQuery>()
  for (const row of rows) {
    const term = sanitizeDemandTerm(String(row.query || ''))
    if (term.length < 3 || isJunk(term)) continue
    const key = term.toLowerCase()
    const next: PersistedDemandQuery = {
      term,
      impressions: Number(row.impressions) || 0,
      clicks: Number(row.clicks) || 0,
      ctr: Number(row.ctr) || 0,
      position: Number(row.position) || 0,
      page: String(row.page || '').trim() || undefined,
    }
    const prev = best.get(key)
    if (!prev || next.impressions > prev.impressions) best.set(key, next)
  }
  return collapseParaphraseDemand([...best.values()])
}

