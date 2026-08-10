/**
 * tests/publish-ledger-metric.test.ts
 *
 * Pure-helper unit tests for the PublishLedger sparkline metric switcher.
 * Locks:
 *   - extractMetricValues selects the right field per metric.
 *   - directionForMetric treats position specially (lower slot = up).
 *   - directionForMetric treats impressions / clicks symmetrically (rising = up).
 *   - arrowForMetric flips direction for volume metrics so the UI arrow
 *     always matches the colour rule ("up" is good).
 *   - formatMetricValue shows compact thousands for large counts.
 */
import {
  extractMetricValues,
  directionForMetric,
  arrowForMetric,
  formatMetricValue,
  formatCtr,
} from '@/lib/seoFactory/publishLedgerMetric'

function pointsFixture() {
  return [
    { date: '2026-07-01', clicks: 10, impressions: 200, position: 12.5, ctr: 0.05 },
    { date: '2026-07-02', clicks: 14, impressions: 220, position: 11.0, ctr: 0.064 },
    { date: '2026-07-03', clicks: 22, impressions: 260, position: 9.5, ctr: 0.085 },
    { date: '2026-07-04', clicks: 28, impressions: 320, position: 8.0, ctr: 0.0875 },
  ]
}

describe('publishLedgerMetric · extractMetricValues', () => {
  it('returns an empty array when points is null/empty', () => {
    expect(extractMetricValues(null, 'position')).toEqual([])
    expect(extractMetricValues(undefined, 'impressions')).toEqual([])
    expect(extractMetricValues([], 'clicks')).toEqual([])
  })
  it('pulls position field when metric=position', () => {
    expect(extractMetricValues(pointsFixture(), 'position')).toEqual([12.5, 11, 9.5, 8])
  })
  it('pulls impressions when metric=impressions', () => {
    expect(extractMetricValues(pointsFixture(), 'impressions')).toEqual([200, 220, 260, 320])
  })
  it('pulls clicks when metric=clicks', () => {
    expect(extractMetricValues(pointsFixture(), 'clicks')).toEqual([10, 14, 22, 28])
  })
})

describe('publishLedgerMetric · directionForMetric · position', () => {
  it('returns up when total delta is < -0.3 slots (slot improving)', () => {
    expect(directionForMetric([12.5, 11, 9.5, 8], 'position')).toBe('up')
  })
  it('returns down when slot worsens', () => {
    expect(directionForMetric([8, 9.5, 11, 12.5], 'position')).toBe('down')
  })
  it('returns flat when within ±0.3 jitter band', () => {
    expect(directionForMetric([8.0, 8.1, 8.15, 8.0], 'position')).toBe('flat')
    expect(directionForMetric([8.0, 7.85, 7.95, 8.0], 'position')).toBe('flat')
  })
  it('returns unknown if fewer than 2 points', () => {
    expect(directionForMetric([], 'position')).toBe('unknown')
    expect(directionForMetric([12.5], 'position')).toBe('unknown')
  })
})

describe('publishLedgerMetric · directionForMetric · impressions / clicks', () => {
  it('returns up when >=5% relative volume rise', () => {
    expect(directionForMetric([100, 120, 150, 200], 'impressions')).toBe('up')
    expect(directionForMetric([10, 14, 22, 28], 'clicks')).toBe('up')
  })
  it('returns down when >=5% relative volume drop', () => {
    expect(directionForMetric([200, 180, 150, 100], 'impressions')).toBe('down')
  })
  it('returns flat inside the relative band', () => {
    expect(directionForMetric([1000, 1010, 1020, 1030], 'impressions')).toBe('flat')
  })
})

describe('publishLedgerMetric · arrowForMetric', () => {
  it('flips for position so improving shows ↑', () => {
    expect(arrowForMetric('position', -2.5)).toBe('up')
    expect(arrowForMetric('position', 2.5)).toBe('down')
  })
  it('keeps native direction for impressions / clicks', () => {
    expect(arrowForMetric('impressions', 50, 100)).toBe('up')
    expect(arrowForMetric('clicks', -10, 100)).toBe('down')
  })
  it('returns null for null delta or sub-threshold movement', () => {
    expect(arrowForMetric('impressions', 4, 100)).toBeNull()
    expect(arrowForMetric('position', null)).toBeNull()
    expect(arrowForMetric('position', 0.1)).toBeNull()
    expect(arrowForMetric('impressions', 10, 100)).not.toBeNull()
  })
})

describe('publishLedgerMetric · formatMetricValue + CTR', () => {
  it('formats position with one decimal', () => {
    expect(formatMetricValue('position', 7.234)).toBe('7.2')
    expect(formatMetricValue('position', null)).toBe('—')
  })
  it('uses compact thousands for large volume counts', () => {
    expect(formatMetricValue('impressions', 1234567)).toBe('1.2M')
    expect(formatMetricValue('clicks', 4500)).toBe('4.5k')
    expect(formatMetricValue('clicks', 950)).toBe('950')
  })
  it('formats GSC CTR fractions as percentages', () => {
    expect(formatCtr(0.0875)).toBe('8.8%')
    expect(formatCtr(0)).toBe('0.0%')
    expect(formatCtr(null)).toBe('—')
  })
})
