/**
 * GSC mix — eligible vs junk vs deep-tail aggregates.
 *
 * GSC totals (impressions / clicks / CTR / position) are polluted by junk
 * queries: quoted official-PDF strings, `userNNNN` CMS slugs, `pacific.edu/sites`
 * file paths. Those rows sit at positions 1–10 with 0 clicks and inflate the
 * impression count while dragging the average position down — so a property can
 * look like "10.3K impressions at pos 31" when it is really a handful of
 * eligible queries buried at pos 50 plus a mountain of PDF noise.
 *
 * This module re-aggregates the SAME rows with ONE classifier
 * (`classifyGscQuery` from queryNoise.ts) and produces:
 *
 *   - eligible-only totals (the only numbers demand/SERP scoring may use)
 *   - junk share + deep-tail share (the penalty + visibility report)
 *   - recommended plays (improve eligible rank vs fix CTR, strike-distance, …)
 *   - strike-distance rows (pos 8–14, impressions ≥ 30, eligible)
 *
 * Deterministic and pure — no network, no AI. Consumed by the Master Engine
 * SERP subsystem, rankingModel `scoreDemand`, authority scoring, and the
 * Master Engine feed (`gscMix` contract).
 */
import { classifyGscQuery, type GscQueryClass } from './queryNoise'

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

export interface GscMix {
  windowDays: number
  totals: GscMixTotals
  eligible: GscMixTotals
  junk: { impressions: number; share: number }
  deepTail: { impressions: number; share: number }
  recommendedPlays: GscMixPlayEntry[]
  strikeDistance: GscMixStrike[]
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

const EMPTY_TOTALS: GscMixTotals = { clicks: 0, impressions: 0, ctr: 0, position: 0 }

function num(v: number | null | undefined): number {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * Eligible-only SERP aggregates + junk/deep-tail shares. When no per-query
 * breakdown is supplied, the aggregate is passed through untouched (nothing to
 * filter) with a 0 junk share — so callers that never pass `queries` behave
 * exactly as before.
 */
export function computeGscMix(gsc: GscMixInput = {}): GscMix {
  const windowDays = num(gsc.windowDays) || 28
  const rows = (gsc.queryRows?.length ? gsc.queryRows : gsc.queries || []).filter(Boolean)

  if (!rows.length) {
    const impressions = num(gsc.impressions)
    const clicks = num(gsc.clicks)
    const ctr = impressions > 0 ? (num(gsc.ctr) || clicks / impressions) : 0
    const position = num(gsc.position)
    const totals: GscMixTotals = { clicks, impressions, ctr, position }
    return {
      windowDays,
      totals,
      eligible: totals,
      junk: { impressions: 0, share: 0 },
      deepTail: { impressions: 0, share: 0 },
      recommendedPlays: [],
      strikeDistance: [],
    }
  }

  const classified = rows.map((q) => {
    const impressions = num(q.impressions)
    const clicks = num(q.clicks)
    const position = num(q.position)
    const cls: GscQueryClass = classifyGscQuery(String(q.term || q.url || ''), {
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

  const aggregate = (cls: GscQueryClass): GscMixTotals => {
    const rowsOf = classified.filter((r) => r.cls === cls)
    const impressions = rowsOf.reduce((a, r) => a + r.impressions, 0)
    const clicks = rowsOf.reduce((a, r) => a + r.clicks, 0)
    const posWeighted = rowsOf.reduce((a, r) => a + r.impressions * r.position, 0)
    return {
      clicks,
      impressions,
      ctr: impressions > 0 ? clicks / impressions : 0,
      position: impressions > 0 ? posWeighted / impressions : 0,
    }
  }

  const eligible = aggregate('eligible')
  const junk = aggregate('junk')
  const deepTail = aggregate('deep_tail')

  const junkShare = totalImpressions > 0 ? junk.impressions / totalImpressions : 0
  const deepTailShare = totalImpressions > 0 ? deepTail.impressions / totalImpressions : 0

  // ── Recommended plays ──────────────────────────────────────────────────────
  const recommendedPlays: GscMixPlayEntry[] = []
  const strikeDistance: GscMixStrike[] = []

  if (eligible.impressions > 0 && eligible.position > 0) {
    if (eligible.position > 20) {
      // A deep eligible rank is a RANK problem, never a CTR problem (on-curve).
      recommendedPlays.push({
        play: 'improve_eligible_rank',
        reason: `Eligible queries average #${eligible.position.toFixed(1)} — rank problem, not CTR`,
      })
    } else {
      const expected = expectedCtrAt(eligible.position)
      if (expected != null && eligible.ctr < expected * 0.8) {
        recommendedPlays.push({
          play: 'fix_ctr',
          reason: `Eligible queries at #${eligible.position.toFixed(1)} earn ${(eligible.ctr * 100).toFixed(1)}% CTR vs ~${(expected * 100).toFixed(1)}% expected — title/intent problem`,
        })
      }
    }
  }

  for (const r of classified) {
    if (r.cls !== 'eligible') continue
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
    totals,
    eligible,
    junk: { impressions: junk.impressions, share: junkShare },
    deepTail: { impressions: deepTail.impressions, share: deepTailShare },
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
