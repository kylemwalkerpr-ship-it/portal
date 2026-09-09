/**
 * Normalized GSC query×page rows — persist so dashboards do not re-hit Google.
 */

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

  let q = applySite(
    db.from('seo_gsc_rows').select(select).eq('start_date', opts.startDate).eq('end_date', opts.endDate),
  )
    .order('impressions', { ascending: false })
    .limit(opts.limit)
  const first = await q
  if (first.error) throw new Error(first.error.message)
  const rows = (first.data || []) as Array<Record<string, unknown>>
  if (rows.length > 0) {
    return {
      rows,
      rowCount: rows.length,
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
    .limit(opts.limit)
  const second = await q2
  if (second.error) throw new Error(second.error.message)
  const fallbackRows = (second.data || []) as Array<Record<string, unknown>>
  return {
    rows: fallbackRows,
    rowCount: fallbackRows.length,
    range: { startDate: latestRow.start_date, endDate: latestRow.end_date },
    usedFallback: fallbackRows.length > 0,
  }
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
 * highest-impression page. Optional `isJunk` drops PDF/URL/brand noise so
 * Discover does not score leaked filenames as demand.
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
  isJunk: (term: string) => boolean = () => false,
): PersistedDemandQuery[] {
  const best = new Map<string, PersistedDemandQuery>()
  for (const row of rows) {
    const term = String(row.query || '').trim()
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
  return [...best.values()].sort((a, b) => b.impressions - a.impressions)
}

