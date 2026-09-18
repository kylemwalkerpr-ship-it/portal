/**
 * P1 measurement integrity — full-window visibility summary (persisted rows).
 *
 * The persisted read that feeds the summary is bounded, but never SILENTLY
 * partial: `windowRowCount` (exact count for the resolved window) +
 * `truncated`/`complete` + `unscannedRows` make the scope explicit, and the
 * summary itself is computed over the whole scanned window — not over the
 * display slice the UI renders.
 *
 * No network, no Supabase client: the read is exercised through a stub matching
 * the seo_gsc_rows chain the route uses.
 */
import { GSC_VISIBILITY_SCAN_CAP, loadPersistedGscWindowScan } from '@/lib/seoFactory/gscRows'
import { annotatePersistedGscRows, buildGscVisibilitySummary } from '@/lib/seoFactory/gscVisibility'

type FakeRow = Record<string, unknown>

/** seo_gsc_rows chain stub: scan rows, exact count, latest-window probe. */
function stubDb(input: {
  window: FakeRow[]
  count?: number | null
  fallbackCount?: number | null
  latest?: { start_date: string; end_date: string } | null
  fallbackWindow?: FakeRow[]
}) {
  let scanIndex = 0
  let countIndex = 0
  return {
    from: () => {
      let cols = ''
      let opts: { count?: 'exact'; head?: boolean } | undefined
      const api = {
        select: (c: string, o?: { count?: 'exact'; head?: boolean }) => {
          cols = c
          opts = o
          return api
        },
        eq: () => api,
        order: () => api,
        limit: () => api,
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
          let result: { data?: unknown; count?: number | null; error: null }
          if (cols === 'start_date, end_date') {
            result = { data: input.latest ? [input.latest] : [], error: null }
          } else if (opts?.head) {
            const n = countIndex === 0 ? input.count : input.fallbackCount ?? input.count
            countIndex += 1
            result = { count: n ?? null, data: null, error: null }
          } else {
            const rows = scanIndex === 0 ? input.window : input.fallbackWindow ?? input.window
            scanIndex += 1
            result = { data: rows, error: null }
          }
          return Promise.resolve(result).then(resolve, reject)
        },
      }
      return api
    },
  } as never
}

const WINDOW = { siteUrl: null, startDate: '2026-06-09', endDate: '2026-09-06' }

const RAW_ROWS: FakeRow[] = [
  {
    query: '"2026-2027 stockton room and meal plan rates final.pdf" pacific.edu/sites/default/files/users/user2983',
    page: 'https://example.com/pdf',
    clicks: 0,
    impressions: 2000,
    ctr: 0,
    position: 3,
  },
  {
    query: 'university of the pacific student housing',
    page: 'https://example.com/housing',
    clicks: 0,
    impressions: 900,
    ctr: 0,
    position: 9.8,
  },
  {
    query: 'canada study permit processing time',
    page: 'https://legal.yousafeconsultancy.com/ca/study-permit/',
    clicks: 4,
    impressions: 248,
    ctr: 0.016,
    position: 10.2,
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

describe('persisted GSC visibility measurement', () => {
  it('preserves every raw row and classifies it (junk / off_mission / qualified / deep_tail)', () => {
    const annotated = annotatePersistedGscRows(RAW_ROWS)
    expect(annotated).toHaveLength(RAW_ROWS.length)
    expect(annotated.map((row) => row.visibilityClass)).toEqual(['junk', 'off_mission', 'qualified', 'deep_tail'])
    // Raw rows survive untouched — classification never filters them away.
    expect(annotated[0].query).toBe(RAW_ROWS[0].query)
    expect(annotated[1].page).toBe(RAW_ROWS[1].page)
  })

  it('summarizes the FULL persisted window, independent of any display limit', async () => {
    const scan = await loadPersistedGscWindowScan(stubDb({ window: RAW_ROWS, count: RAW_ROWS.length }), WINDOW)
    const summary = buildGscVisibilitySummary({ rows: scan.rows, scan, displayLimit: 1, windowDays: 90 })

    expect(scan.scannedRows).toBe(RAW_ROWS.length)
    expect(scan.windowRowCount).toBe(RAW_ROWS.length)
    expect(scan.truncated).toBe(false)
    expect(scan.complete).toBe(true)
    expect(scan.usedFallback).toBe(false)
    expect(scan.range).toEqual({ startDate: WINDOW.startDate, endDate: WINDOW.endDate })

    // Raw stays raw (every bucket reconciles back to it).
    expect(summary.totals.impressions).toBe(3153)
    expect(summary.qualified.impressions).toBe(248)
    expect(summary.offMission.impressions).toBe(900)
    expect(summary.junk.impressions).toBe(2000)
    expect(summary.deepTail.impressions).toBe(5)
    expect(summary.measurement).toBe('query_rows')
    expect(summary.rowCount).toBe(RAW_ROWS.length)

    expect(summary.scope.displayLimit).toBe(1)
    expect(summary.scope.persistedRows).toBe(RAW_ROWS.length)
    expect(summary.scope.windowRowCount).toBe(RAW_ROWS.length)
    expect(summary.scope.unscannedRows).toBe(0)
    expect(summary.scope.complete).toBe(true)
    expect(summary.scope.truncated).toBe(false)

    // The display limit cannot change a single measurement.
    const wide = buildGscVisibilitySummary({ rows: scan.rows, scan, displayLimit: 500, windowDays: 90 })
    expect(wide.totals.impressions).toBe(summary.totals.impressions)
    expect(wide.qualified.impressions).toBe(summary.qualified.impressions)
    expect(wide.offMission.impressions).toBe(summary.offMission.impressions)
  })

  it('flags a bounded scan as truncated + incomplete instead of reporting a silently partial mix', async () => {
    const big: FakeRow[] = Array.from({ length: GSC_VISIBILITY_SCAN_CAP }, (_, i) => ({
      query: `canada study permit document checklist ${i}`,
      page: `https://legal.yousafeconsultancy.com/ca/checklist/${i}/`,
      clicks: 0,
      impressions: 1,
      ctr: 0,
      position: 20,
    }))
    const scan = await loadPersistedGscWindowScan(
      stubDb({ window: big, count: GSC_VISIBILITY_SCAN_CAP + 25 }),
      WINDOW,
    )

    expect(scan.scannedRows).toBe(GSC_VISIBILITY_SCAN_CAP)
    expect(scan.windowRowCount).toBe(GSC_VISIBILITY_SCAN_CAP + 25)
    expect(scan.truncated).toBe(true)
    expect(scan.complete).toBe(false)

    const summary = buildGscVisibilitySummary({ rows: scan.rows, scan, displayLimit: 100 })
    expect(summary.scope.persistedRows).toBe(GSC_VISIBILITY_SCAN_CAP)
    expect(summary.scope.windowRowCount).toBe(GSC_VISIBILITY_SCAN_CAP + 25)
    expect(summary.scope.unscannedRows).toBe(25)
    expect(summary.scope.truncated).toBe(true)
    expect(summary.scope.complete).toBe(false)
    // Highest-impression rows are kept first, so a bounded scan keeps the
    // material part of the mix — but the flags prove it is not the whole window.
    expect(summary.qualified.impressions).toBe(GSC_VISIBILITY_SCAN_CAP)
  })

  it('keeps the PR #224 production residual observable: real campus demand off-mission, Pacific fiscal-year artifact junk', () => {
    const residual: FakeRow[] = [
      {
        query: 'student rentals near university of south carolina',
        page: 'https://example.com/sc-rentals',
        clicks: 1,
        impressions: 320,
        ctr: 0.003,
        position: 8,
      },
      {
        query: 'student rentals near florida international university',
        page: 'https://example.com/fiu-rentals',
        clicks: 0,
        impressions: 210,
        ctr: 0,
        position: 11,
      },
      {
        query: 'student living university of south carolina',
        page: 'https://example.com/sc-living',
        clicks: 0,
        impressions: 180,
        ctr: 0,
        position: 9,
      },
      {
        query: 'international student storage cornell',
        page: 'https://example.com/cornell-storage',
        clicks: 0,
        impressions: 140,
        ctr: 0,
        position: 12,
      },
      {
        query: 'is warwick safe for international students',
        page: 'https://example.com/warwick-safety',
        clicks: 0,
        impressions: 90,
        ctr: 0,
        position: 14,
      },
      {
        query: '"fy27_stk_housing_rates" pacific',
        page: 'https://pacific.edu/sites/default/files/users/user2983',
        clicks: 0,
        impressions: 400,
        ctr: 0,
        position: 3,
      },
    ]

    const annotated = annotatePersistedGscRows(residual)
    expect(annotated).toHaveLength(residual.length)
    expect(annotated.map((row) => row.visibilityClass)).toEqual([
      'off_mission',
      'off_mission',
      'off_mission',
      'off_mission',
      'off_mission',
      'junk',
    ])

    const summary = buildGscVisibilitySummary({ rows: residual, displayLimit: 2, windowDays: 90 })
    // Raw observations are preserved and reconcile back to the window totals.
    expect(summary.rowCount).toBe(residual.length)
    expect(summary.offMission.rowCount).toBe(5)
    expect(summary.junk.rowCount).toBe(1)
    expect(summary.qualified.rowCount).toBe(0)
    expect(summary.totals.impressions).toBe(1340)
    expect(summary.offMission.impressions).toBe(940)
    expect(summary.junk.impressions).toBe(400)
    expect(summary.offMission.impressions + summary.junk.impressions).toBe(summary.totals.impressions)
  })

  it('keeps the estate self-brand query `you safe` observable as junk, never as qualified demand', () => {
    // PR #224 production proof (brand leak): the spaced self-brand query
    // surfaced as an actionable opportunity. It must stay a RAW observation —
    // counted in the junk bucket — while prose containing "you safe" keeps its
    // genuine classification.
    const rows: FakeRow[] = [
      {
        query: 'you safe',
        page: 'https://legal.yousafeconsultancy.com/',
        clicks: 0,
        impressions: 1200,
        ctr: 0,
        position: 2,
      },
      {
        query: 'are you safe to travel on a visa',
        page: 'https://legal.yousafeconsultancy.com/uk/travel-while-on-visa/',
        clicks: 1,
        impressions: 400,
        ctr: 0.003,
        position: 9,
      },
    ]

    const annotated = annotatePersistedGscRows(rows)
    expect(annotated).toHaveLength(rows.length)
    expect(annotated.map((row) => row.visibilityClass)).toEqual(['junk', 'qualified'])
    // Raw rows stay raw: the brand observation is preserved for measurement.
    expect(annotated[0].query).toBe('you safe')
    expect(annotated[1].query).toBe('are you safe to travel on a visa')

    const summary = buildGscVisibilitySummary({ rows, displayLimit: 100, windowDays: 90 })
    expect(summary.rowCount).toBe(2)
    expect(summary.totals.impressions).toBe(1600)
    expect(summary.junk.rowCount).toBe(1)
    expect(summary.junk.impressions).toBe(1200)
    expect(summary.qualified.rowCount).toBe(1)
    expect(summary.qualified.impressions).toBe(400)
    expect(summary.offMission.rowCount).toBe(0)
  })

  it('keeps bounded self-brand navigational rows observable as junk, never as qualified demand', () => {
    // Review finding: the exact spaced brand was junk, but `you safe portal`
    // still scored. Raw observations are preserved — counted in the junk
    // bucket — while brand-like prose keeps its genuine classification.
    const rows: FakeRow[] = [
      {
        query: 'you safe portal',
        page: 'https://legal.yousafeconsultancy.com/portal/',
        clicks: 0,
        impressions: 700,
        ctr: 0,
        position: 3,
      },
      {
        query: 'you safe to travel on a student visa',
        page: 'https://legal.yousafeconsultancy.com/uk/travel-while-on-visa/',
        clicks: 1,
        impressions: 300,
        ctr: 0.003,
        position: 11,
      },
    ]

    const annotated = annotatePersistedGscRows(rows)
    expect(annotated.map((row) => row.visibilityClass)).toEqual(['junk', 'qualified'])
    // Raw rows stay raw: the brand observation is preserved for measurement.
    expect(annotated[0].query).toBe('you safe portal')

    const summary = buildGscVisibilitySummary({ rows, displayLimit: 100, windowDays: 90 })
    expect(summary.rowCount).toBe(2)
    expect(summary.totals.impressions).toBe(1000)
    expect(summary.junk.rowCount).toBe(1)
    expect(summary.junk.impressions).toBe(700)
    expect(summary.qualified.rowCount).toBe(1)
    expect(summary.qualified.impressions).toBe(300)
    expect(summary.offMission.rowCount).toBe(0)
  })

  it('qualifies natural-length mission-safety questions and living-cost demand, keeping housing lifestyle off-mission', () => {
    // Final review findings: mission-safety questions longer than the
    // pasted-text guard are real demand (qualified), and `student living` is
    // only campus lifestyle when housing/lodging context is present.
    const rows: FakeRow[] = [
      {
        query: 'is it safe for international students to work in the uk',
        page: 'https://legal.yousafeconsultancy.com/uk/work-while-on-visa/',
        clicks: 3,
        impressions: 420,
        ctr: 0.007,
        position: 7,
      },
      {
        query: 'student living expenses canada',
        page: 'https://legal.yousafeconsultancy.com/ca/living-costs/',
        clicks: 1,
        impressions: 180,
        ctr: 0.006,
        position: 11,
      },
      {
        query: 'student living university of south carolina',
        page: 'https://example.com/sc-living',
        clicks: 0,
        impressions: 150,
        ctr: 0,
        position: 9,
      },
      {
        query: 'you safe login',
        page: 'https://legal.yousafeconsultancy.com/login/',
        clicks: 0,
        impressions: 800,
        ctr: 0,
        position: 3,
      },
    ]

    const annotated = annotatePersistedGscRows(rows)
    expect(annotated).toHaveLength(rows.length)
    expect(annotated.map((row) => row.visibilityClass)).toEqual(['qualified', 'qualified', 'off_mission', 'junk'])
    // Raw rows stay raw, including the two self-brand/off-mission observations.
    expect(annotated[2].query).toBe('student living university of south carolina')
    expect(annotated[3].query).toBe('you safe login')

    const summary = buildGscVisibilitySummary({ rows, displayLimit: 100, windowDays: 90 })
    expect(summary.rowCount).toBe(4)
    expect(summary.totals.impressions).toBe(1550)
    expect(summary.qualified.rowCount).toBe(2)
    expect(summary.qualified.impressions).toBe(600)
    expect(summary.offMission.rowCount).toBe(1)
    expect(summary.offMission.impressions).toBe(150)
    expect(summary.junk.rowCount).toBe(1)
    expect(summary.junk.impressions).toBe(800)
    expect(summary.qualified.rowCount + summary.offMission.rowCount + summary.junk.rowCount).toBe(summary.rowCount)
  })

  it('keeps opt-out / opt-in process rows observable as off-mission, never qualified', () => {
    // Diff review finding: the `on opt` anchor matched the ordinary verb
    // inside "opt out" / "opt-in", so dining/housing process rows were
    // summarised as qualified demand. They stay raw and observable, but must
    // land in the off-mission bucket; only the status phrase qualifies.
    const rows: FakeRow[] = [
      {
        query: 'meal plan information on opt out',
        page: 'https://example.com/dining-opt-out-info',
        clicks: 0,
        impressions: 320,
        ctr: 0,
        position: 6,
      },
      {
        query: 'student housing details on opt-in',
        page: 'https://example.com/housing-opt-in',
        clicks: 1,
        impressions: 140,
        ctr: 0.007,
        position: 12,
      },
      {
        query: 'is it safe for international students on opt',
        page: 'https://legal.yousafeconsultancy.com/us/opt/',
        clicks: 2,
        impressions: 260,
        ctr: 0.008,
        position: 8,
      },
    ]

    const annotated = annotatePersistedGscRows(rows)
    expect(annotated.map((row) => row.visibilityClass)).toEqual(['off_mission', 'off_mission', 'qualified'])
    // Raw observations are preserved exactly as GSC reported them.
    expect(annotated.map((row) => row.query)).toEqual([
      'meal plan information on opt out',
      'student housing details on opt-in',
      'is it safe for international students on opt',
    ])

    const summary = buildGscVisibilitySummary({ rows, displayLimit: 100, windowDays: 90 })
    expect(summary.rowCount).toBe(3)
    expect(summary.qualified.rowCount).toBe(1)
    expect(summary.qualified.impressions).toBe(260)
    expect(summary.offMission.rowCount).toBe(2)
    expect(summary.offMission.impressions).toBe(460)
    expect(summary.junk.rowCount).toBe(0)
    expect(summary.qualified.rowCount + summary.offMission.rowCount + summary.junk.rowCount).toBe(summary.rowCount)
  })

  it('keeps the latest-stored-window fallback semantics for an unsynced rolling window', async () => {
    const scan = await loadPersistedGscWindowScan(
      stubDb({
        window: [],
        count: 0,
        fallbackCount: RAW_ROWS.length,
        latest: { start_date: '2026-06-01', end_date: '2026-08-29' },
        fallbackWindow: RAW_ROWS,
      }),
      WINDOW,
    )

    expect(scan.usedFallback).toBe(true)
    expect(scan.range).toEqual({ startDate: '2026-06-01', endDate: '2026-08-29' })
    expect(scan.scannedRows).toBe(RAW_ROWS.length)
    expect(scan.windowRowCount).toBe(RAW_ROWS.length)
    expect(scan.complete).toBe(true)
    expect(scan.rows).toHaveLength(RAW_ROWS.length)

    const summary = buildGscVisibilitySummary({ rows: scan.rows, scan, displayLimit: 100 })
    expect(summary.scope.usedFallback).toBe(true)
    expect(summary.scope.range.endDate).toBe('2026-08-29')
    expect(summary.qualified.impressions).toBe(248)
    expect(summary.offMission.impressions).toBe(900)
  })

  it('reports an empty store honestly (no rows, no fabricated shares)', async () => {
    const scan = await loadPersistedGscWindowScan(stubDb({ window: [], count: 0, latest: null }), WINDOW)
    expect(scan.rows).toHaveLength(0)
    expect(scan.usedFallback).toBe(false)
    expect(scan.windowRowCount).toBe(0)
    expect(scan.complete).toBe(true)
    expect(scan.truncated).toBe(false)

    const summary = buildGscVisibilitySummary({ rows: scan.rows, scan, displayLimit: 100 })
    expect(summary.rowCount).toBe(0)
    expect(summary.totals.impressions).toBe(0)
    expect(summary.qualified.impressions).toBe(0)
    expect(summary.offMission.share).toBe(0)
    expect(summary.junk.share).toBe(0)
  })

  /**
   * M6 — fail closed on a rows/scan mismatch.
   *
   * `scan.scannedRows` is the scope the summary claims. If the caller hands in
   * a different number of rows (a filtered, truncated or stale array) the mix
   * is NOT a measurement of that scope, so `complete` must be false with an
   * explicit caveat — never a tidy-looking `complete: true` over the wrong rows.
   * Throwing is deliberately avoided: the honest rows still measure something.
   */
  it('fails closed when the rows array does not match the scan scope', () => {
    const rows = RAW_ROWS.slice(0, 2)
    const summary = buildGscVisibilitySummary({
      rows,
      scan: {
        scannedRows: 6,
        windowRowCount: 6,
        countKnown: true,
        truncated: false,
        complete: true,
        cap: GSC_VISIBILITY_SCAN_CAP,
        usedFallback: false,
        range: { startDate: WINDOW.startDate, endDate: WINDOW.endDate },
      },
      displayLimit: 100,
    })

    expect(summary.scope.rowMismatch).toBe(true)
    expect(summary.scope.complete).toBe(false)
    expect(summary.scope.caveat).toMatch(/partial measurement/i)
    expect(summary.scope.caveat).toMatch(/2 row\(s\) provided for a scan of 6/)
    // The rows it did receive are still measured honestly — no throw, no blank.
    expect(summary.rowCount).toBe(2)
    expect(summary.totals.impressions).toBe(2900)
    expect(summary.offMission.impressions).toBe(900)

    // A matching array stays complete (the guard only fires on a mismatch).
    const matched = buildGscVisibilitySummary({
      rows: RAW_ROWS,
      scan: {
        scannedRows: RAW_ROWS.length,
        windowRowCount: RAW_ROWS.length,
        countKnown: true,
        truncated: false,
        complete: true,
        cap: GSC_VISIBILITY_SCAN_CAP,
        usedFallback: false,
        range: { startDate: WINDOW.startDate, endDate: WINDOW.endDate },
      },
      displayLimit: 100,
    })
    expect(matched.scope.rowMismatch).toBe(false)
    expect(matched.scope.complete).toBe(true)
    expect(matched.scope.caveat).toBeNull()
  })
})
