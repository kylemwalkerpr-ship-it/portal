/**
 * tests/forecast-divergence.test.ts
 *
 * Locks down every divergence rule so the PublishLedger chip never silently
 * regresses:
 *   - missing forecast → missing
 *   - missing GSC observation → unknown
 *   - forecast up, trend up → agree
 *   - forecast down, trend down → agree
 *   - forecast flat, trend flat → agree
 *   - < 0.3 slot movement → flat → agree (jitter does not trigger chips)
 *   - forecast up, trend down → disagree
 *   - forecast down, trend up → disagree
 *   - magnitude is the slot count the model expects to move.
 */
import {
  computeDivergence,
  directionFromForecastVsObserved,
} from '@/lib/seoFactory/forecastDivergence'

describe('forecastDivergence · directionFromForecastVsObserved', () => {
  it('returns up when projected position is lower (better) than baseline', () => {
    expect(directionFromForecastVsObserved(4, 8)).toBe('up')
  })
  it('returns down when projected position is higher (worse) than baseline', () => {
    expect(directionFromForecastVsObserved(12, 7)).toBe('down')
  })
  it('returns flat when within ±0.3 slot jitter', () => {
    expect(directionFromForecastVsObserved(7.2, 7)).toBe('flat')
    expect(directionFromForecastVsObserved(6.8, 7)).toBe('flat')
    expect(directionFromForecastVsObserved(7.0, 7.0)).toBe('flat')
  })
  it('returns unknown when either input is null', () => {
    expect(directionFromForecastVsObserved(null, 7)).toBe('unknown')
    expect(directionFromForecastVsObserved(5, null)).toBe('unknown')
  })
})

describe('forecastDivergence · computeDivergence', () => {
  const base = {
    url: 'https://example.com/us/student-visa/',
    topic: 'student visa us',
    forecastProbabilityTop10: 0.7,
    forecastRunDate: '2026-07-22',
  }

  it('returns missing when there is no forecast projection', () => {
    const v = computeDivergence({
      url: base.url,
      topic: base.topic,
      observedPosition: 8,
      forecastProjection60: null,
      forecastProbabilityTop10: null,
      forecastRunDate: null,
      trendDirection: 'up',
    })
    expect(v.status).toBe('missing')
    expect(v.magnitude).toBeNull()
  })

  it('returns unknown when observed position is null', () => {
    const v = computeDivergence({
      url: base.url,
      topic: base.topic,
      observedPosition: null,
      forecastProjection60: 5,
      forecastProbabilityTop10: 0.6,
      forecastRunDate: '2026-07-22',
      trendDirection: 'unknown',
    })
    expect(v.status).toBe('unknown')
  })

  it('returns agree when forecast up matches trend up', () => {
    const v = computeDivergence({
      url: base.url,
      topic: base.topic,
      observedPosition: 8,
      forecastProjection60: 4,
      forecastProbabilityTop10: base.forecastProbabilityTop10,
      forecastRunDate: base.forecastRunDate,
      trendDirection: 'up',
    })
    expect(v.status).toBe('agree')
    expect(v.forecastDirection).toBe('up')
    expect(v.magnitude).toBeCloseTo(4) // 8 - 4 = +4 slots
    expect(v.note).toMatch(/up/i)
  })

  it('returns agree when forecast down matches trend down', () => {
    const v = computeDivergence({
      ...base,
      observedPosition: 5,
      forecastProjection60: 11,
      forecastProbabilityTop10: base.forecastProbabilityTop10,
      forecastRunDate: base.forecastRunDate,
      trendDirection: 'down',
      url: base.url,
    } as any)
    expect(v.status).toBe('agree')
    expect(v.forecastDirection).toBe('down')
  })

  it('returns disagree when forecast up but trend down (the red badge case)', () => {
    const v = computeDivergence({
      url: base.url,
      topic: base.topic,
      observedPosition: 7,
      forecastProjection60: 4,
      forecastProbabilityTop10: base.forecastProbabilityTop10,
      forecastRunDate: base.forecastRunDate,
      trendDirection: 'down',
    })
    expect(v.status).toBe('disagree')
    expect(v.forecastDirection).toBe('up')
    expect(v.note).toMatch(/forecast/i)
  })

  it('returns disagree when forecast down but trend up (drift on a winners slide)', () => {
    const v = computeDivergence({
      url: base.url,
      topic: base.topic,
      observedPosition: 6,
      forecastProjection60: 10,
      forecastProbabilityTop10: base.forecastProbabilityTop10,
      forecastRunDate: base.forecastRunDate,
      trendDirection: 'up',
    })
    expect(v.status).toBe('disagree')
    expect(v.forecastDirection).toBe('down')
  })

  it('returns agree (flat) when movements stay inside the 0.3-slot band', () => {
    const v = computeDivergence({
      url: base.url,
      topic: base.topic,
      observedPosition: 7,
      forecastProjection60: 7.15,
      forecastProbabilityTop10: base.forecastProbabilityTop10,
      forecastRunDate: base.forecastRunDate,
      trendDirection: 'flat',
    })
    expect(v.status).toBe('agree')
    expect(v.forecastDirection).toBe('flat')
  })
})
