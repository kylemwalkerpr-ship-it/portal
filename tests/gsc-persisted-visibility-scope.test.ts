/**
 * P1 measurement integrity — scope truthfulness of the bounded persisted scan.
 *
 * Two failure modes would silently turn the full-window visibility summary into
 * a lie, so both are locked here:
 *
 *   1. an UNKNOWN exact window count (the head-count read fails or the backend
 *      cannot count) must never report `complete: true`;
 *   2. a scan that can exceed the PostgREST page limit must page
 *      deterministically in offsets instead of trusting one huge `limit`, and
 *      it must say so when the row cap stopped it short.
 *
 * No network, no Supabase client: the read is exercised through a stub matching
 * the seo_gsc_rows chain the route uses (this one implements `range`, so the
 * offset paging path is the one under test).
 */
import {
  GSC_VISIBILITY_SCAN_CAP,
  GSC_VISIBILITY_SCAN_SELECT,
  loadPersistedGscWindowScan,
} from '@/lib/seoFactory/gscRows'
import { buildGscVisibilitySummary } from '@/lib/seoFactory/gscVisibility'

type FakeRow = Record<string, unknown>

const WINDOW = { siteUrl: null, startDate: '2026-06-09', endDate: '2026-09-06' }

/**
 * Range-capable stub: records every offset page it is asked for, plus the
 * order chain each page was requested with (a page's offsets are only stable
 * when the ordering is deterministic).
 */
function pagedDb(rows: FakeRow[], count: number | null) {
  const offsets: Array<[number, number]> = []
  const orders: Array<Array<[string, boolean]>> = []
  const db = {
    from: () => {
      let isHead = false
      const order: Array<[string, boolean]> = []
      const api = {
        select: (_cols: string, opts?: { count?: 'exact'; head?: boolean }) => {
          isHead = opts?.head === true
          return api
        },
        eq: () => api,
        order: (column: string, opts?: { ascending?: boolean }) => {
          order.push([column, opts?.ascending !== false])
          return api
        },
        limit: () => api,
        range: (from: number, to: number) => {
          offsets.push([from, to])
          return api
        },
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
          if (isHead) return Promise.resolve({ count, data: null, error: null }).then(resolve, reject)
          orders.push(order.map((o) => [...o] as [string, boolean]))
          const last = offsets[offsets.length - 1] ?? [0, rows.length - 1]
          return Promise.resolve({ data: rows.slice(last[0], last[1] + 1), error: null }).then(resolve, reject)
        },
      }
      return api
    },
  }
  return { db: db as never, offsets, orders }
}

const qualifiedRow = (i: number): FakeRow => ({
  query: `canada study permit document checklist ${i}`,
  page: `https://legal.yousafeconsultancy.com/ca/checklist/${i}/`,
  clicks: 0,
  impressions: 1,
  ctr: 0,
  position: 20,
})

describe('persisted scan scope — unknown exact count', () => {
  it('never reports complete when the exact window count is unknown', async () => {
    const rows = [qualifiedRow(1), qualifiedRow(2), qualifiedRow(3), qualifiedRow(4)]
    const { db } = pagedDb(rows, null)

    const scan = await loadPersistedGscWindowScan(db, WINDOW)
    expect(scan.rows).toHaveLength(4)
    expect(scan.scannedRows).toBe(4)
    expect(scan.countKnown).toBe(false)
    expect(scan.windowRowCount).toBeNull()
    expect(scan.unscannedRows).toBeNull()
    expect(scan.truncated).toBe(false)
    // Unknown count can never be a complete measurement, however tidy the read.
    expect(scan.complete).toBe(false)
    expect(scan.cap).toBe(GSC_VISIBILITY_SCAN_CAP)

    const summary = buildGscVisibilitySummary({ rows: scan.rows, scan, displayLimit: 40 })
    expect(summary.measurement).toBe('query_rows')
    expect(summary.scope.countKnown).toBe(false)
    expect(summary.scope.windowRowCount).toBeNull()
    expect(summary.scope.complete).toBe(false)
    expect(summary.scope.unscannedRows).toBeNull()
    expect(summary.scope.caveat).toMatch(/partial/i)
    expect(summary.scope.caveat).toMatch(/exact window row count unavailable/i)
    // The rows that WERE read are still measured honestly.
    expect(summary.qualified.impressions).toBe(4)
    expect(summary.totals.impressions).toBe(4)
  })

  it('flags cap saturation as truncated even when the exact count is unknown', async () => {
    const rows = [qualifiedRow(1), qualifiedRow(2), qualifiedRow(3)]
    const { db } = pagedDb(rows, null)

    const scan = await loadPersistedGscWindowScan(db, { ...WINDOW, cap: 3, pageSize: 2 })
    expect(scan.scannedRows).toBe(3)
    expect(scan.countKnown).toBe(false)
    expect(scan.truncated).toBe(true)
    expect(scan.complete).toBe(false)
    expect(scan.unscannedRows).toBeNull()
  })
})

describe('persisted scan scope — deterministic pagination', () => {
  /**
   * M3 — offsets are only deterministic when the ORDER is deterministic.
   * Ordering by `impressions` alone leaves ties in whatever order PostgREST
   * happens to return, so two pages of a capped scan can duplicate or skip
   * rows and the "full window" measurement silently loses them.
   */
  it('applies a deterministic total order (impressions + unique-key tie-breakers) to every page', async () => {
    const rows = Array.from({ length: 6 }, (_, i) => qualifiedRow(i))
    const { db, orders } = pagedDb(rows, rows.length)

    await loadPersistedGscWindowScan(db, { ...WINDOW, cap: 6, pageSize: 2 })

    expect(orders.length).toBeGreaterThan(1)
    for (const chain of orders) {
      const columns = chain.map(([column]) => column)
      // Highest impressions first — the material part of the mix survives a cap.
      expect(chain[0]).toEqual(['impressions', false])
      expect(chain[1]).toEqual(['site_url', true])
      // Query then page: the unique-key fields that break impression ties.
      expect(columns).toContain('query')
      expect(columns).toContain('page')
      // No column is applied twice (a duplicated sort key is not a total order).
      expect(new Set(columns).size).toBe(columns.length)
    }
    // Every page must be read with the SAME order, or offsets drift between pages.
    expect(new Set(orders.map((chain) => JSON.stringify(chain))).size).toBe(1)
    // The tie-break columns must be available to the scan select.
    expect(GSC_VISIBILITY_SCAN_SELECT).toContain('site_url')
    expect(GSC_VISIBILITY_SCAN_SELECT).toContain('query')
    expect(GSC_VISIBILITY_SCAN_SELECT).toContain('page')
  })

  it('pages in offsets and reports the capped read as truncated, not complete', async () => {
    const rows = Array.from({ length: 20 }, (_, i) => qualifiedRow(i))
    const { db, offsets } = pagedDb(rows, rows.length)

    const scan = await loadPersistedGscWindowScan(db, { ...WINDOW, cap: 5, pageSize: 2 })

    expect(offsets).toEqual([
      [0, 1],
      [2, 3],
      [4, 4],
    ])
    expect(scan.scannedRows).toBe(5)
    expect(scan.windowRowCount).toBe(20)
    expect(scan.truncated).toBe(true)
    expect(scan.complete).toBe(false)
    expect(scan.unscannedRows).toBe(15)

    const summary = buildGscVisibilitySummary({ rows: scan.rows, scan, displayLimit: 1 })
    expect(summary.scope.persistedRows).toBe(5)
    expect(summary.scope.windowRowCount).toBe(20)
    expect(summary.scope.unscannedRows).toBe(15)
    expect(summary.scope.complete).toBe(false)
    expect(summary.scope.truncated).toBe(true)
    expect(summary.scope.caveat).toMatch(/5 of 20/)
    expect(summary.qualified.impressions).toBe(5)
  })

  it('pages in offsets until the exact count is reached and reports a complete measurement', async () => {
    const rows = Array.from({ length: 6 }, (_, i) => qualifiedRow(i))
    const { db, offsets } = pagedDb(rows, rows.length)

    const scan = await loadPersistedGscWindowScan(db, { ...WINDOW, cap: 10, pageSize: 2 })

    // 6 rows over three 2-row pages, then the scan stops: the exact count says
    // the window is fully read, so no empty probe page is fetched.
    expect(offsets).toEqual([
      [0, 1],
      [2, 3],
      [4, 5],
    ])
    expect(scan.scannedRows).toBe(6)
    expect(scan.windowRowCount).toBe(6)
    expect(scan.truncated).toBe(false)
    expect(scan.complete).toBe(true)
    expect(scan.unscannedRows).toBe(0)

    const summary = buildGscVisibilitySummary({ rows: scan.rows, scan, displayLimit: 40 })
    expect(summary.scope.complete).toBe(true)
    expect(summary.scope.caveat).toBeNull()
    expect(summary.qualified.impressions).toBe(6)
  })

  it('keeps the four buckets reconciling back to the raw scanned totals', async () => {
    const rows = [
      qualifiedRow(1),
      {
        query: 'university of the pacific student housing',
        page: 'https://example.com/housing',
        clicks: 0,
        impressions: 9,
        ctr: 0,
        position: 9.8,
      },
      {
        query: '"2026-2027 stockton room and meal plan rates final.pdf" pacific.edu/sites/default/files/users/user2983',
        page: 'https://example.com/pdf',
        clicks: 0,
        impressions: 7,
        ctr: 0,
        position: 3,
      },
      {
        query: 'study permit biometrics appointment ottawa',
        page: 'https://legal.yousafeconsultancy.com/ca/biometrics/',
        clicks: 0,
        impressions: 5,
        ctr: 0,
        position: 30,
      },
    ]
    const { db } = pagedDb(rows, rows.length)
    const scan = await loadPersistedGscWindowScan(db, { ...WINDOW, cap: 10, pageSize: 2 })
    const summary = buildGscVisibilitySummary({ rows: scan.rows, scan, displayLimit: 40 })

    expect(summary.qualified.impressions).toBe(1)
    expect(summary.offMission.impressions).toBe(9)
    expect(summary.junk.impressions).toBe(7)
    expect(summary.deepTail.impressions).toBe(5)
    expect(summary.totals.impressions).toBe(22)
    expect(
      summary.qualified.impressions +
        summary.offMission.impressions +
        summary.junk.impressions +
        summary.deepTail.impressions,
    ).toBe(summary.totals.impressions)
  })
})
