/**
 * lib/seoFactory/forecastDivergence.ts
 *
 * Pure, deterministic forecaster-vs-GSC divergence calculator. Kept
 * dependency-free so a unit test (tests/forecast-divergence.test.ts) can lock
 * in every rule without spinning up the Supabase / GSC clients.
 *
 * Conventions (must stay in sync with app/api/content-studio/position-trend):
 *   - `direction` of 'up' means position number got SMALLER — i.e. the URL
 *     improved in the SERPs. 'down' means position number GREW (worse).
 *   - The forecast projection's "direction" follows the same rule: a lower
 *     `projectedPosition` than the current observation is an 'up'.
 *
 * Inputs are intentionally lightweight: the route that calls into this module
 * is responsible for resolving the canonical URL → topic → latest forecast
 * row. The helper only computes.
 */
export type Direction = 'up' | 'down' | 'flat' | 'unknown'

export interface DivergenceObservation {
  url: string
  topic: string | null
  observedPosition: number | null
  forecastProjection60: number | null
  forecastProbabilityTop10: number | null
  forecastRunDate: string | null
  trendDirection: Direction
}

export interface DivergenceVerdict {
  status: 'agree' | 'disagree' | 'missing' | 'unknown'
  note: string
  magnitude: number | null
  forecastDirection: Direction
}

/** Direction implied by forecast projection vs the current observation. */
export function directionFromForecastVsObserved(
  projection: number | null,
  baseline: number | null,
): Direction {
  if (projection == null || baseline == null) return 'unknown'
  // 0.3 mirrors the position-trend endpoint threshold — anything tighter is
  // noisy and we don't want to false-alarm on tiny within-window jitter.
  const diff = projection - baseline
  if (Math.abs(diff) < 0.3) return 'flat'
  return diff < 0 ? 'up' : 'down'
}

/**
 * Compare the model's reward forecast (projected direction) against the
 * real-world GSC trend direction.
 *
 *   agree      → forecast and reality move the same way (or both flat).
 *   disagree   → forecast says we'll improve but reality is worsening, or
 *                 vice versa. This is the divergence we surface as a red
 *                 badge; the admin should decide whether it's a content
 *                 problem, a Google update, or a ranking-model drift.
 *   missing    → no forecast row persisted for this URL's topic yet.
 *   unknown    → inputs are too sparse to conclude (no current position or
 *                 trend direction was measurable by GSC).
 */
export function computeDivergence(
  obs: DivergenceObservation,
): DivergenceVerdict {
  const forecastDirection = directionFromForecastVsObserved(
    obs.forecastProjection60,
    obs.observedPosition,
  )

  // Magnitude: how big is the projected movement vs the current baseline?
  // Positive = forecast expects we move up the SERP by N positions.
  const magnitude =
    obs.forecastProjection60 != null && obs.observedPosition != null
      ? Number((obs.observedPosition - obs.forecastProjection60).toFixed(2))
      : null

  if (obs.forecastProjection60 == null) {
    return {
      status: 'missing',
      note: 'No 60-day forecast has been persisted for this topic yet.',
      magnitude,
      forecastDirection,
    }
  }

  if (
    obs.observedPosition == null ||
    obs.trendDirection === 'unknown' ||
    forecastDirection === 'unknown'
  ) {
    return {
      status: 'unknown',
      note:
        'Not enough GSC data yet to confirm or refute the forecast direction.',
      magnitude,
      forecastDirection,
    }
  }

  if (forecastDirection === obs.trendDirection) {
    const move = forecastDirection === 'flat' ? 'stable' : forecastDirection
    const sign = move === 'up' ? '↑' : move === 'down' ? '↓' : '↔'
    return {
      status: 'agree',
      note: `Forecast ↔ GSC ${sign} ${move}${magnitude != null ? ` (≈${Math.abs(magnitude)} slots)` : ''}.`,
      magnitude,
      forecastDirection,
    }
  }

  // Disagreement: forecast says one direction, GSC moved the other way.
  const fcWord = forecastDirection === 'up' ? 'rises' : forecastDirection === 'down' ? 'falls' : 'flat'
  const trWord = obs.trendDirection === 'up' ? 'rising' : obs.trendDirection === 'down' ? 'falling' : 'flat'
  return {
    status: 'disagree',
    note: `Forecast expects position to ${fcWord} (${obs.forecastProjection60?.toFixed(1)}) but GSC is currently ${trWord}. Review before citing.`,
    magnitude,
    forecastDirection,
  }
}
