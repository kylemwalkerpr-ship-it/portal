/**
 * P1 qualified-visibility UI contract — the existing SEO Intelligence surface
 * (also mounted as `studio-discover-evidence` inside Content Studio Discover)
 * must expose the route's FULL-WINDOW `visibility` summary as three explicitly
 * labeled metrics: Raw visibility, Qualified visibility, Off-mission visibility.
 *
 * The numbers come from `response.visibility` (computed server-side over the
 * whole scanned persisted window) — never from the limited diagnostic row slice
 * the GSC tab renders. A bounded or unknown-count scan (`scope.complete` false)
 * must never be presented as a complete measurement.
 */
import fs from 'node:fs'
import path from 'node:path'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  FORBIDDEN_SEO_COLUMNS,
  gscWindowStats,
  OPPORTUNITY_TABLE_COLUMNS,
  SEO_INTEL_NAV,
  SeoIntelVisibilityStrip,
  VISIBILITY_METRIC_LABELS,
  formatMetricCount,
  visibilityMeasurementNote,
  visibilityMetrics,
} from '@/components/design/seo-intelligence-dashboard'
import type { SeoIntelVisibilitySummary } from '@/components/design/seo-intelligence-dashboard'

const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), 'utf8')

const bucket = (impressions: number, share: number, clicks = 0) => ({
  impressions,
  clicks,
  ctr: impressions > 0 ? clicks / impressions : 0,
  position: 12,
  share,
  rowCount: 1,
})

/** Full-window summary fixture: 12,000 scanned rows, display slice limited to 40. */
const windowSummary = (
  overrides: Partial<SeoIntelVisibilitySummary> = {},
  scope: Partial<NonNullable<SeoIntelVisibilitySummary['scope']>> = {},
): SeoIntelVisibilitySummary => ({
  measurement: 'query_rows',
  windowDays: 90,
  rowCount: 12_000,
  totals: { clicks: 4_800, impressions: 1_000_000, ctr: 0.0048, position: 18.5 },
  qualified: bucket(250_000, 0.25, 3_000),
  offMission: bucket(500_000, 0.5, 1_500),
  junk: bucket(200_000, 0.2, 200),
  deepTail: bucket(50_000, 0.05, 100),
  ...overrides,
  scope: {
    displayLimit: 40,
    persistedRows: 12_000,
    scannedRows: 12_000,
    windowRowCount: 12_000,
    countKnown: true,
    unscannedRows: 0,
    complete: true,
    truncated: false,
    cap: 50_000,
    usedFallback: false,
    range: { startDate: '2026-06-01', endDate: '2026-08-30' },
    caveat: null,
    ...scope,
  },
})

const renderStrip = (visibility: SeoIntelVisibilitySummary | null) =>
  renderToStaticMarkup(React.createElement(SeoIntelVisibilityStrip, { visibility }))

describe('Phase 10 SEO intelligence dashboard contract', () => {
  it('uses the spec navigation and never shows Volume, KD, or CPC columns', () => {
    expect(SEO_INTEL_NAV).toEqual(['overview', 'opportunities', 'topics', 'content', 'links', 'keywords', 'gsc'])
    expect(OPPORTUNITY_TABLE_COLUMNS).toEqual([
      'Opportunity', 'Action', 'Score', 'Confidence', 'Impressions', 'Position', 'CTR', 'Coverage',
    ])
    for (const banned of FORBIDDEN_SEO_COLUMNS) {
      expect(OPPORTUNITY_TABLE_COLUMNS as readonly string[]).not.toContain(banned)
    }
  })

  it('keeps the scored-opportunity table first-party (no paid metrics) when a Brief CTA is added beside it', () => {
    expect(OPPORTUNITY_TABLE_COLUMNS).not.toContain('Brief')
    expect(OPPORTUNITY_TABLE_COLUMNS).not.toContain('Volume')
  })
})

describe('P1 qualified visibility on the existing Discover surface', () => {
  it('exposes exactly three explicitly labeled metrics: raw, qualified, off-mission', () => {
    expect(VISIBILITY_METRIC_LABELS).toEqual([
      'Raw visibility',
      'Qualified visibility',
      'Off-mission visibility',
    ])
    expect(visibilityMetrics(windowSummary()).map((m) => m.label)).toEqual([
      ...VISIBILITY_METRIC_LABELS,
    ])

    const html = renderStrip(windowSummary())
    for (const label of VISIBILITY_METRIC_LABELS) expect(html).toContain(label)
    expect(html).toContain('data-testid="seo-visibility-mix"')
  })

  it('sources the metrics from the full-window visibility summary, not the limited diagnostic row slice', () => {
    // `scope.displayLimit` is the 40-row diagnostic slice the GSC tab renders —
    // it cannot shrink the measurement.
    const summary = windowSummary({}, { displayLimit: 40 })
    const metrics = visibilityMetrics(summary)

    expect(metrics[0].value).toBe('1,000,000') // visibility.totals.impressions (raw, whole window)
    expect(metrics[1].value).toBe('250,000') // visibility.qualified.impressions
    expect(metrics[2].value).toBe('500,000') // visibility.offMission.impressions
    expect(metrics[1].sub).toContain('25.0%') // share of RAW impressions
    expect(metrics[2].sub).toContain('50.0%')

    const html = renderStrip(summary)
    expect(html).toContain('1,000,000')
    expect(html).toContain('250,000')
    expect(html).toContain('500,000')
  })

  it('reports a complete full-window measurement as complete, with no caveat', () => {
    const summary = windowSummary()
    const html = renderStrip(summary)

    expect(visibilityMeasurementNote(summary)).toBeNull()
    expect(html).toContain('data-complete="true"')
    expect(html).toContain('Complete measurement')
    expect(html).not.toContain('seo-visibility-scope-caveat')
    expect(html).not.toContain('Incomplete measurement')
  })

  it('truthfully flags scope.complete=false and surfaces the server caveat verbatim', () => {
    const caveat =
      'Partial measurement: 5,000 of 12,000 persisted row(s) scanned (7,000 unscanned, cap 5,000).'
    const summary = windowSummary(
      {},
      { complete: false, truncated: true, scannedRows: 5_000, unscannedRows: 7_000, cap: 5_000, caveat },
    )

    expect(visibilityMeasurementNote(summary)).toBe(caveat)

    const html = renderStrip(summary)
    expect(html).toContain('data-complete="false"')
    expect(html).toContain('Incomplete measurement')
    expect(html).not.toContain('Complete measurement')
    expect(html).toContain('seo-visibility-scope-caveat')
    expect(html).toContain(caveat)
  })

  it('falls back to an explicit incomplete statement when the payload carries no caveat text', () => {
    const truncated = windowSummary({}, { complete: false, truncated: true, caveat: null })
    const truncatedNote = visibilityMeasurementNote(truncated)
    expect(truncatedNote).toMatch(/partial measurement/i)
    expect(truncatedNote).toMatch(/incomplete|truncated/i)
    expect(renderStrip(truncated)).toContain(truncatedNote as string)

    const unknownCount = windowSummary(
      {},
      { complete: false, countKnown: false, windowRowCount: null, unscannedRows: null, caveat: null },
    )
    const unknownNote = visibilityMeasurementNote(unknownCount)
    expect(unknownNote).toMatch(/partial measurement/i)
    expect(unknownNote).toMatch(/incomplete/i)
    const unknownHtml = renderStrip(unknownCount)
    expect(unknownHtml).toContain('data-complete="false"')
    expect(unknownHtml).toContain(unknownNote as string)
  })

  it('renders nothing when the performance response has no visibility summary', () => {
    expect(renderStrip(null)).toBe('')
    expect(visibilityMeasurementNote(null)).toBeNull()
  })
})

describe('Discover surface wiring stays on the existing component', () => {
  const source = read('components/design/seo-intelligence-dashboard.tsx')

  it('feeds the strip from the performance response visibility summary', () => {
    expect(source).toMatch(/<SeoIntelVisibilityStrip[^/>]*visibility=\{gsc\??\.visibility\}/)
  })

  it('keeps the limited diagnostic GSC table and its own row source intact', () => {
    expect(source).toContain("['Query', 'Page', 'Clicks', 'Impressions', 'CTR', 'Position']")
    expect(source).toMatch(/\(gsc\?\.rows \|\| \[\]\)/)
  })
})

/**
 * M4 — the slice-derived surface must stop calling the limited display rows
 * persisted-window truth. Window-level clicks/impressions/rows come from the
 * full-window `visibility` summary when the route provides it; the `rows` array
 * stays what it is — a limited, junk-free diagnostic slice for the GSC table.
 */
describe('P1 window-level stats on the slice-derived surface (M4)', () => {
  const displayRows = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ query: `diagnostic ${i}`, clicks: 1, impressions: 10 }))

  it('reads window stats from the visibility summary, never from the display slice', () => {
    const stats = gscWindowStats({
      visibility: windowSummary(),
      rows: displayRows(40),
      rowCount: 40,
    })

    expect(stats.source).toBe('visibility')
    expect(stats.clicks).toBe(4_800)
    expect(stats.impressions).toBe(1_000_000)
    expect(stats.windowRowCount).toBe(12_000)
    expect(stats.scannedRowCount).toBe(12_000)
    expect(stats.diagnosticRowCount).toBe(40)
    // The number the old UI called "persisted" is the window, not the slice.
    expect(stats.statRowCount).toBe(12_000)
  })

  it('uses the scanned row count when the exact window count is unknown — still never the slice', () => {
    const stats = gscWindowStats({
      visibility: windowSummary(
        {},
        { countKnown: false, windowRowCount: null, scannedRows: 5_000, unscannedRows: null, complete: false },
      ),
      rows: displayRows(40),
      rowCount: 40,
    })

    expect(stats.source).toBe('visibility')
    expect(stats.windowRowCount).toBeNull()
    expect(stats.scannedRowCount).toBe(5_000)
    expect(stats.statRowCount).toBe(5_000)
    expect(stats.diagnosticRowCount).toBe(40)
  })

  it('falls back to the display slice only when there is no visibility summary at all', () => {
    const stats = gscWindowStats({
      visibility: null,
      rows: [{ clicks: 1, impressions: 10 }, { clicks: 0, impressions: 5 }],
      rowCount: 2,
    })

    expect(stats.source).toBe('display')
    expect(stats.clicks).toBe(1)
    expect(stats.impressions).toBe(15)
    expect(stats.windowRowCount).toBeNull()
    expect(stats.scannedRowCount).toBeNull()
    expect(stats.statRowCount).toBe(2)
  })

  it('wires the window stats into onStats and labels the slice as diagnostics', () => {
    const source = read('components/design/seo-intelligence-dashboard.tsx')

    expect(source).toMatch(/gscWindowStats\(/)
    expect(source).toMatch(/rowCount: gscStats\.statRowCount/)
    expect(source).toMatch(/clicks: gscStats\.clicks \?\? 0/)
    expect(source).toMatch(/impressions: gscStats\.impressions \?\? 0/)
    // The old copy claimed the display slice was the persisted window total.
    expect(source).not.toMatch(/gsc\?\.rowCount[^)]*\)\s*:\s*'—'\} persisted/)
    expect(source.toLowerCase()).toContain('diagnostic')
  })
})

/**
 * M7 — a metric that is absent is unknown, not zero. Only a MEASURED zero may
 * render as `0`; a missing/non-finite field renders an em dash instead of a
 * fabricated 0 that would read as "we measured no off-mission impressions".
 */
describe('P1 visibility metrics never coerce missing fields to zero (M7)', () => {
  it('renders an em dash for absent or non-finite summary fields', () => {
    expect(formatMetricCount(undefined)).toBe('—')
    expect(formatMetricCount(null)).toBe('—')
    expect(formatMetricCount('')).toBe('—')
    expect(formatMetricCount('n/a')).toBe('—')
    expect(formatMetricCount(Number.NaN)).toBe('—')
    expect(formatMetricCount(Number.POSITIVE_INFINITY)).toBe('—')

    const metrics = visibilityMetrics({
      measurement: 'query_rows',
      windowDays: 90,
      rowCount: 0,
      totals: {},
      qualified: null,
      offMission: undefined,
    })

    expect(metrics.map((m) => m.value)).toEqual(['—', '—', '—'])
    expect(metrics[1].sub).toContain('—')
    expect(metrics[1].sub).not.toMatch(/0\.0%/)
    expect(metrics[2].sub).not.toMatch(/0\.0%/)

    const html = renderStrip({
      measurement: 'query_rows',
      totals: { impressions: Number.NaN },
      qualified: {},
    })
    expect(html).toContain('—')
  })

  it('preserves a real measured zero', () => {
    const zero = { impressions: 0, clicks: 0, ctr: 0, position: 0, share: 0, rowCount: 0 }
    const metrics = visibilityMetrics(
      windowSummary({
        totals: { clicks: 0, impressions: 0, ctr: 0, position: 0 },
        qualified: zero,
        offMission: zero,
      }),
    )

    expect(metrics.map((m) => m.value)).toEqual(['0', '0', '0'])
    expect(metrics[1].sub).toContain('0.0%')
    expect(formatMetricCount(0)).toBe('0')
  })

  it('shares the server visibility contract by type-only import (no runtime server import)', () => {
    const source = read('components/design/seo-intelligence-dashboard.tsx')
    expect(source).toMatch(/import type \{[^}]*\}\s*from '@\/lib\/seoFactory\/gscVisibility'/)
    expect(source).not.toMatch(/^import (?!type)\{[^}]*\} from '@\/lib\/seoFactory\/gscVisibility'/m)
  })
})
