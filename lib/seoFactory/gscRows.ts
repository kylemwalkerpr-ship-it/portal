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
