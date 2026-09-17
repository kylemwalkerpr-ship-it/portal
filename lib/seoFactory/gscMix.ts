/**
 * GSC mix — raw vs qualified vs off-mission vs junk vs deep-tail aggregates.
 *
 * GSC totals (impressions / clicks / CTR / position) are polluted by junk
 * queries: quoted official-PDF strings, `userNNNN` CMS slugs, `pacific.edu/sites`
 * file paths. Those rows sit at positions 1–10 with 0 clicks and inflate the
 * impression count while dragging the average position down — so a property can
 * look like "10.3K impressions at pos 31" when it is really a handful of
 * eligible queries buried at pos 50 plus a mountain of PDF noise.
 *
 * P1 measurement integrity extends the split to REAL-but-off-mission demand
 * (campus housing / lifestyle with no immigration-document anchor): it is
 * neither junk nor demand. This module re-aggregates the SAME rows with ONE
 * classifier (`classifyGscVisibility` from queryNoise.ts) and produces:
 *
 *   - `totals`  — RAW, every row, pollution included (the mix reconciles)
 *   - `qualified` — on-mission signal-bearing rows ONLY. The only aggregate
 *     that demand / SERP / strike-distance / plays may read.
 *   - `offMission` — observable, non-actionable demand (impressions + share)
 *   - `junk` / `deepTail` — pollution + negligible-signal shares (rowCount too)
 *   - recommended plays / strike-distance rows derived from QUALIFIED rows only
 *
 * `eligible` is kept as a documented compatibility alias for `qualified`
 * (same object) so pre-P1 callers/tests keep reading a correct number.
 *
 * Contract compatibility: every P1 addition (`source`, `rowCount`,
 * `qualified`, `offMission` and the extra bucket metrics) is OPTIONAL on the
 * exported `GscMix`, so a pre-P1 snapshot/fixture — `eligible` totals plus
 * `junk` / `deepTail` `{ impressions, share }` — stays assignable. Readers of a
 * `GscMix` therefore take `qualified` when present and fall back to the
 * `eligible` alias, and treat a missing `offMission` share as 0.
 * `computeGscMix` never returns that legacy shape: it returns
 * `ComputedGscMix`, which populates every field and full bucket metric.
 *
 * Aggregate-only callers (no per-query breakdown) are pass-through: with no
 * query text to classify there is nothing to filter, so the aggregate is
 * treated as qualified. That is a documented limitation of the aggregate-only
 * path, not a claim that the impressions were measured as on-mission.
 *
 * Deterministic and pure — no network, no AI. Consumed by the Master Engine
 * SERP subsystem, rankingModel `scoreDemand`, authority scoring, and the
 * Master Engine feed (`gscMix` contract).
 */
import { classifyGscVisibility, type GscVisibilityClass } from './queryNoise'

export interface GscMixQueryRow {
  term?: string
  url?: string
  impressions?: number
  clicks?: number
  ctr?: number
  position?: number
}

export interface GscMixTotals {
  clicks: number
  impressions: number
  ctr: number
  position: number
}

/** One visibility bucket: raw metrics + share of the raw window + row count. */
export interface GscMixBucket extends GscMixTotals {
  /** Bucket impressions ÷ raw totals impressions (0 when the raw window is empty). */
  share: number
  /** Rows that landed in this bucket. */
  rowCount: number
}

/**
 * Backward-compatible view of the pre-P1 `eligible` bucket: the raw totals
 * always existed, while `share` / `rowCount` are additive P1 metrics.
 */
export interface GscMixTotalsView extends GscMixTotals {
  share?: number
  rowCount?: number
}

/**
 * Backward-compatible view of the pre-P1 `junk` / `deepTail` buckets (and of
 * the additive `offMission`): they always shipped `impressions` + `share`,
 * while `clicks` / `ctr` / `position` / `rowCount` are additive P1 metrics.
 */
export interface GscMixShareBucketView {
  impressions: number
  share: number
  clicks?: number
  ctr?: number
  position?: number
  rowCount?: number
}

export interface GscMixStrike {
  url: string
  impressions: number
  position: number
  ctr: number
}

export type GscMixPlay =
  | 'strike_distance'
  | 'click_proven'
  | 'deep_demand_build'
  | 'page1_defend'
  | 'improve_eligible_rank'
  | 'fix_ctr'

export interface GscMixPlayEntry {
  play: GscMixPlay
  url?: string
  term?: string
  reason: string
}

export type GscMixSource = 'rows' | 'aggregate'

/**
 * Backward-compatible GSC mix contract (persisted snapshots + report fixtures).
 *
 * P1 added `source`, `rowCount`, `qualified`, `offMission` and full bucket
 * metrics on top of the pre-P1 `{ totals, eligible, junk, deepTail, … }` shape,
 * so every P1 field is OPTIONAL here: a legacy snapshot stays valid. Readers
 * must take `qualified` when present and fall back to the `eligible` alias
 * (same object when computed), and treat a missing `offMission` share as 0.
 * `computeGscMix` never returns this legacy shape — see `ComputedGscMix`.
 */
export interface GscMix {
  windowDays: number
  /** Where the mix came from: classified rows, or an unfilterable aggregate. */
  source?: GscMixSource
  /** Rows that were classified (0 for the aggregate-only pass-through). */
  rowCount?: number
  /** RAW totals over every row — includes junk and off-mission. */
  totals: GscMixTotals
  /** Documented compatibility alias for `qualified` (same object). */
  eligible: GscMixTotalsView
  /** On-mission, signal-bearing rows — the only actionable aggregate. */
  qualified?: GscMixBucket
  /** Real demand outside the mission: observable, never actionable. */
  offMission?: GscMixShareBucketView
  junk: GscMixShareBucketView
  deepTail: GscMixShareBucketView
  recommendedPlays: GscMixPlayEntry[]
  strikeDistance: GscMixStrike[]
}

/**
 * What `computeGscMix` actually returns: every P1 field populated and full
 * bucket metrics on all four buckets. Kept separate from the
 * backward-compatible `GscMix` so production callers keep exact types while
 * legacy snapshots remain assignable.
 */
export interface ComputedGscMix extends GscMix {
  source: GscMixSource
  rowCount: number
  eligible: GscMixBucket
  qualified: GscMixBucket
  offMission: GscMixBucket
  junk: GscMixBucket
  deepTail: GscMixBucket
}

export interface GscMixInput {
  /** Per-query breakdown. When present it is the source of truth for the mix. */
  queries?: GscMixQueryRow[]
  /** Alias for `queries` — the masterEngine / rankingModel gsc shape calls the
   *  breakdown `queryRows` (their `queries` field is a count). One classifier,
   *  one mix computation, whatever the caller names the rows. */
  queryRows?: GscMixQueryRow[]
  /** Aggregate fallbacks (used when `queries` is absent or empty). */
  impressions?: number
  clicks?: number
  ctr?: number
  position?: number
  windowDays?: number
}

function num(v: number | null | undefined): number {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function emptyBucket(share = 0): GscMixBucket {
  return { clicks: 0, impressions: 0, ctr: 0, position: 0, share, rowCount: 0 }
}

/**
 * RAW totals + one bucket per visibility class. When no per-query breakdown is
 * supplied the aggregate is passed through as qualified (nothing to classify)
 * with 0 junk / off-mission / deep-tail share — so callers that never pass
 * `queries` behave exactly as before. Always returns the fully populated
 * `ComputedGscMix`: `source`, `rowCount`, `qualified` and `offMission` plus the
 * full bucket metrics (`clicks` / `ctr` / `position` / `share` / `rowCount`) are
 * present at runtime — the optional fields on `GscMix` only exist to accept
 * pre-P1 snapshots.
 */
export function computeGscMix(gsc: GscMixInput = {}): ComputedGscMix {
  const windowDays = num(gsc.windowDays) || 28
  const rows = (gsc.queryRows?.length ? gsc.queryRows : gsc.queries || []).filter(Boolean)

  if (!rows.length) {
    // Documented limitation: an aggregate-only caller ships no query text, so
    // there is nothing to classify. The aggregate is passed through as
    // QUALIFIED (and therefore also as the `eligible` alias) with zero junk /
    // off-mission / deep-tail shares — exactly the pre-P1 behaviour.
    const impressions = num(gsc.impressions)
    const clicks = num(gsc.clicks)
    const ctr = impressions > 0 ? (num(gsc.ctr) || clicks / impressions) : 0
    const position = num(gsc.position)
    const totals: GscMixTotals = { clicks, impressions, ctr, position }
    const qualified: GscMixBucket = { ...totals, share: impressions > 0 ? 1 : 0, rowCount: 0 }
    return {
      windowDays,
      source: 'aggregate',
      rowCount: 0,
      totals,
      eligible: qualified,
      qualified,
      offMission: emptyBucket(),
      junk: emptyBucket(),
      deepTail: emptyBucket(),
      recommendedPlays: [],
      strikeDistance: [],
    }
  }

  const classified = rows.map((q) => {
    const impressions = num(q.impressions)
    const clicks = num(q.clicks)
    const position = num(q.position)
    const cls: GscVisibilityClass = classifyGscVisibility(String(q.term || q.url || ''), {
      impressions,
      position,
      clicks,
    })
    return { q, impressions, clicks, position, cls }
  })

  const totalImpressions = classified.reduce((a, r) => a + r.impressions, 0)
  const totalClicks = classified.reduce((a, r) => a + r.clicks, 0)
  const totalPosWeighted = classified.reduce((a, r) => a + r.impressions * r.position, 0)
  const totals: GscMixTotals = {
    clicks: totalClicks,
    impressions: totalImpressions,
    ctr: totalImpressions > 0 ? totalClicks / totalImpressions : 0,
    position: totalImpressions > 0 ? totalPosWeighted / totalImpressions : 0,
  }

  const aggregate = (cls: GscVisibilityClass): GscMixBucket => {
    const rowsOf = classified.filter((r) => r.cls === cls)
    const impressions = rowsOf.reduce((a, r) => a + r.impressions, 0)
    const clicks = rowsOf.reduce((a, r) => a + r.clicks, 0)
    const posWeighted = rowsOf.reduce((a, r) => a + r.impressions * r.position, 0)
    return {
      clicks,
      impressions,
      ctr: impressions > 0 ? clicks / impressions : 0,
      position: impressions > 0 ? posWeighted / impressions : 0,
      share: totalImpressions > 0 ? impressions / totalImpressions : 0,
      rowCount: rowsOf.length,
    }
  }

  // Only QUALIFIED rows may drive plays / strike distance / demand. Off-mission
  // and deep-tail impressions stay observable but never become an action.
  const qualified = aggregate('qualified')
  const offMission = aggregate('off_mission')
  const junk = aggregate('junk')
  const deepTail = aggregate('deep_tail')

  // ── Recommended plays ──────────────────────────────────────────────────────
  const recommendedPlays: GscMixPlayEntry[] = []
  const strikeDistance: GscMixStrike[] = []

  if (qualified.impressions > 0 && qualified.position > 0) {
    if (qualified.position > 20) {
      // A deep eligible rank is a RANK problem, never a CTR problem (on-curve).
      recommendedPlays.push({
        play: 'improve_eligible_rank',
        reason: `Qualified queries average #${qualified.position.toFixed(1)} — rank problem, not CTR`,
      })
    } else {
      const expected = expectedCtrAt(qualified.position)
      if (expected != null && qualified.ctr < expected * 0.8) {
        recommendedPlays.push({
          play: 'fix_ctr',
          reason: `Qualified queries at #${qualified.position.toFixed(1)} earn ${(qualified.ctr * 100).toFixed(1)}% CTR vs ~${(expected * 100).toFixed(1)}% expected — title/intent problem`,
        })
      }
    }
  }

  for (const r of classified) {
    if (r.cls !== 'qualified') continue
    const url = String(r.q.url || r.q.term || '')
    const ctr = r.impressions > 0 ? r.clicks / r.impressions : 0
    if (r.position >= 8 && r.position <= 14 && r.impressions >= 30) {
      strikeDistance.push({ url, impressions: r.impressions, position: r.position, ctr })
      recommendedPlays.push({
        play: 'strike_distance',
        url,
        reason: `#${r.position.toFixed(1)} with ${r.impressions} impressions — expand existing owner, no sibling`,
      })
    } else if (r.clicks >= 3 && r.position <= 12) {
      recommendedPlays.push({
        play: 'click_proven',
        url,
        reason: `${r.clicks} clicks at #${r.position.toFixed(1)} — defend + CTR polish (title/meta only)`,
      })
    } else if (r.impressions >= 80 && r.position >= 20) {
      recommendedPlays.push({
        play: 'deep_demand_build',
        url,
        reason: `${r.impressions} impressions at #${r.position.toFixed(1)} — only if an owner URL already exists`,
      })
    } else if (r.position <= 8 && r.impressions >= 20) {
      recommendedPlays.push({
        play: 'page1_defend',
        url,
        reason: `page-1 at #${r.position.toFixed(1)} — hold, do not spawn a new page`,
      })
    }
  }

  return {
    windowDays,
    source: 'rows',
    rowCount: rows.length,
    totals,
    // Documented compatibility alias — the SAME object, so pre-P1 callers that
    // read `eligible` now read qualified-only numbers.
    eligible: qualified,
    qualified,
    offMission,
    junk,
    deepTail,
    recommendedPlays,
    strikeDistance,
  }
}

/** Expected CTR curve — mirrors observedSignals.expectedCtrForPosition. */
function expectedCtrAt(position: number): number | null {
  if (position <= 3) return 0.12
  if (position <= 10) return 0.05
  if (position <= 20) return 0.025
  return 0.01
}

/** Junk-share penalty factor: a property drowning in PDF queries cannot look healthy. */
export function junkSharePenalty(share: number): number {
  return 1 - Math.min(0.6, Math.max(0, share))
}
