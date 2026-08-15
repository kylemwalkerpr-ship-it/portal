/**
 * MASTER SEO ENGINE — adaptive learning half.
 *
 * The static engine (masterEngine.ts) scores with a fixed intent-conditioned
 * weight matrix. This module makes the weights LEARN from real outcomes:
 *
 *   1. `fitLogistic` — dependency-free logistic regression (gradient ascent
 *      with L2) that maps subsystem scores → P(top-10) for an intent class.
 *   2. `adaptWeights` — per-intent: fit on historical rows, derive learned
 *      subsystem weights from coefficient importance, then BLEND with the
 *      prior matrix by sample confidence (alpha = n/(n+10)). Few samples →
 *      keep the prior; many samples → trust the data.
 *   3. `learnFromOutcome` — a single-outcome reward update (exponentially
 *      weighted) so the engine responds to the most recent result without
 *      waiting for a batch retrain. Low scores that preceded a good outcome
 *      get upweighted; high scores that preceded a bad outcome get downweighted.
 *   4. Diagnostics — accuracy, Brier score, calibration, feature stability
 *      (bootstrap) so a "governance layer" can see when the model is drifting
 *      and needs retraining rather than trusting learned weights blindly.
 *
 * Everything is deterministic and dependency-free (pure TS + Math) so it runs
 * in the Worker and in unit tests without an ML runtime.
 */
import { INTENT_WEIGHT_MATRIX, SUBSYSTEMS, type IntentId, type SubsystemId } from './masterEngine'

// ═══ Types ═════════════════════════════════════════════════════════════════

export interface HistoricalOutcome {
  intent: IntentId
  /** Optional outcome timestamp (ISO) — lets the reward nudge pick the most
   *  recent per-publish result. Falls back to array order when absent. */
  at?: string
  /** 0–1 normalized subsystem scores for the page at evaluation time. */
  subsystemScores: Partial<Record<SubsystemId, number>>
  /** Real measured outcome after publish. */
  outcome: {
    /** Whether the page reached the top 10 for its primary query. */
    top10?: boolean
    /** Average GSC position (lower = better). */
    position?: number
    clicks?: number
    impressions?: number
  }
}

export interface LearnedModel {
  intent: IntentId
  /** Learned coefficients per subsystem (order = SUBSYSTEMS). */
  coefficients: number[]
  intercept: number
  /** |coef| normalized → sums to 1 across subsystems. */
  importance: Record<SubsystemId, number>
  /** Blended weights actually used by the engine (prior α blend). */
  weights: Record<SubsystemId, number>
  /** 0..1 — how much we trust the learned fit (n/(n+10)). */
  confidence: number
  n: number
  diagnostics: {
    accuracy: number | null
    brier: number | null
    calibration: number | null
    /** Mean |coefficient| stability across bootstrap folds (1 = perfectly stable). */
    stability: number | null
  }
}

export interface LearnReport {
  models: LearnedModel[]
  driftWarnings: string[]
  generatedAt: string
}

// ═══ Logistic regression (gradient ascent + L2) ═════════════════════════════

const sigmoid = (z: number): number => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))))

export function fitLogistic(
  X: number[][],
  y: number[],
  opts: { lr?: number; iters?: number; l2?: number } = {},
): { coef: number[]; intercept: number } {
  const n = X.length
  if (n === 0) return { coef: [], intercept: 0 }
  const d = X[0].length
  const lr = opts.lr ?? 0.25
  const iters = opts.iters ?? 300
  const l2 = opts.l2 ?? 0.01
  let w = new Array(d).fill(0) as number[]
  let b = 0

  for (let iter = 0; iter < iters; iter++) {
    const grad = new Array(d).fill(0) as number[]
    let gradB = 0
    for (let i = 0; i < n; i++) {
      const xi = X[i]
      let z = b
      for (let j = 0; j < d; j++) z += w[j] * xi[j]
      const h = sigmoid(z)
      const err = y[i] - h
      for (let j = 0; j < d; j++) grad[j] += xi[j] * err
      gradB += err
    }
    for (let j = 0; j < d; j++) {
      // L2 regularization pulls weights toward 0 (shrinks noise coefficients)
      w[j] += lr * (grad[j] / n - l2 * w[j])
    }
    b += lr * (gradB / n)
  }
  return { coef: w, intercept: b }
}

// ═══ Bootstrap stability ═══════════════════════════════════════════════════

function bootstrapStability(X: number[][], y: number[], folds = 6, seed = 42): number | null {
  const n = X.length
  if (n < 4) return null
  // Deterministic pseudo-random (mulberry32)
  let s = seed
  const rand = () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const coefSets: number[][] = []
  for (let f = 0; f < folds; f++) {
    const idx = Array.from({ length: n }, () => Math.floor(rand() * n))
    const Xf = idx.map((i) => X[i])
    const yf = idx.map((i) => y[i])
    const { coef } = fitLogistic(Xf, yf, { iters: 120 })
    coefSets.push(coef)
  }
  const d = X[0].length
  let total = 0
  let count = 0
  for (let j = 0; j < d; j++) {
    const vals = coefSets.map((c) => c[j] ?? 0)
    const mean = vals.reduce((a, v) => a + v, 0) / vals.length
    if (mean === 0) continue
    const relStd = Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length) / Math.abs(mean)
    total += Math.max(0, 1 - relStd)
    count++
  }
  return count ? total / count : null
}

// ═══ Per-intent learning ═══════════════════════════════════════════════════

function softmaxImportance(coef: number[]): Record<SubsystemId, number> {
  const abs = coef.map((c) => Math.abs(c))
  const max = Math.max(...abs, 1e-9)
  const exp = abs.map((a) => Math.exp(a - max))
  const sum = exp.reduce((a, b) => a + b, 0) || 1
  const out = {} as Record<SubsystemId, number>
  SUBSYSTEMS.forEach((s, i) => {
    out[s] = exp[i] / sum
  })
  return out
}

/** Blend learned importance with the intent prior: alpha = n/(n+10). */
function blendWeights(
  intent: IntentId,
  learned: Record<SubsystemId, number>,
  n: number,
): Record<SubsystemId, number> {
  const alpha = n / (n + 10)
  const prior = INTENT_WEIGHT_MATRIX[intent]
  const out = {} as Record<SubsystemId, number>
  let sum = 0
  for (const s of SUBSYSTEMS) {
    out[s] = (1 - alpha) * prior[s] + alpha * learned[s]
    sum += out[s]
  }
  // Renormalize to 1 so downstream math stays consistent.
  for (const s of SUBSYSTEMS) out[s] = out[s] / sum
  return out
}

export function learnWeightsForIntent(
  rows: HistoricalOutcome[],
  intent: IntentId,
): LearnedModel | null {
  const data = rows.filter((r) => r.intent === intent && r.outcome.top10 != null)
  const n = data.length
  if (n < 3) return null // not enough signal — keep the prior

  const X: number[][] = []
  const y: number[] = []
  for (const r of data) {
    X.push(SUBSYSTEMS.map((s) => r.subsystemScores[s] ?? 0))
    y.push(r.outcome.top10 ? 1 : 0)
  }
  const { coef, intercept } = fitLogistic(X, y)
  const importance = softmaxImportance(coef)
  const weights = blendWeights(intent, importance, n)

  // Diagnostics
  const baseRate = y.reduce((a, b) => a + b, 0) / n
  let correct = 0
  let brier = 0
  let calSum = 0
  for (let i = 0; i < n; i++) {
    let z = intercept
    for (let j = 0; j < SUBSYSTEMS.length; j++) z += coef[j] * X[i][j]
    const p = sigmoid(z)
    const pred = p >= 0.5 ? 1 : 0
    if (pred === y[i]) correct++
    brier += (p - y[i]) ** 2
    calSum += p
  }
  const accuracy = correct / n
  const brierScore = brier / n
  const calibration = Math.min(1, Math.abs(calSum / n - baseRate) * 3)

  return {
    intent,
    coefficients: coef,
    intercept,
    importance,
    weights,
    confidence: n / (n + 10),
    n,
    diagnostics: {
      accuracy: Math.round(accuracy * 1000) / 1000,
      brier: Math.round(brierScore * 1000) / 1000,
      calibration: Math.round((1 - calibration) * 1000) / 1000,
      stability: bootstrapStability(X, y),
    },
  }
}

// ═══ Batch adaptation + governance ═════════════════════════════════════════

export function learnWeights(history: HistoricalOutcome[]): LearnReport {
  const intents = new Set(history.map((h) => h.intent))
  const models: LearnedModel[] = []
  const driftWarnings: string[] = []
  for (const intent of intents) {
    const m = learnWeightsForIntent(history, intent)
    if (!m) continue
    if (m.diagnostics.stability != null && m.diagnostics.stability < 0.4) {
      driftWarnings.push(
        `${intent}: learned weights are unstable (stability ${(m.diagnostics.stability * 100).toFixed(0)}%) — treat with caution, collect more outcomes`,
      )
    }
    if (m.diagnostics.calibration != null && m.diagnostics.calibration < 0.5) {
      driftWarnings.push(
        `${intent}: poorly calibrated (${(m.diagnostics.calibration * 100).toFixed(0)}%) — the signal model may be stale after a SERP shift`,
      )
    }
    models.push(m)
  }
  return { models, driftWarnings, generatedAt: new Date().toISOString() }
}

// ═══ Single-outcome reward update ══════════════════════════════════════════

/**
 * Immediately nudge a page's subsystem weights from ONE measured outcome.
 * Idea: subsystems that scored LOW before a GOOD outcome (or HIGH before a
 * BAD one) were probably under-/over-weighted — move weight toward the
 * informative subsystems and away from the misleading ones. Lambda controls
 * how aggressively one sample moves the needle.
 */
export function learnFromOutcome(
  weights: Record<SubsystemId, number>,
  scores: Partial<Record<SubsystemId, number>>,
  outcome: { top10?: boolean; position?: number },
  lambda = 0.12,
): { weights: Record<SubsystemId, number>; moved: number } {
  const good = outcome.top10 === true || (outcome.position != null && outcome.position <= 10)
  const next = { ...weights }
  let moved = 0
  for (const s of SUBSYSTEMS) {
    const v = scores[s]
    if (v == null) continue
    // Credit assignment (multiplicative — additive shifts invert under
    // renormalization, because the denominator shrinks faster than the target
    // subsystem's absolute drop):
    //   · GOOD outcome + LOW score  → the factor was underweighted → upweight
    //   · GOOD outcome + HIGH score → already strong, no extra credit → downweight
    //   · BAD outcome + HIGH score  → the factor was over-trusted → downweight
    //   · BAD outcome + LOW score   → no signal (missing factor ≠ causation) → leave
    const surprise = good ? 0.5 - v : v > 0.5 ? -(v - 0.5) : 0
    if (Math.abs(surprise) < 0.05) continue
    const factor = 1 + Math.max(-0.4, Math.min(0.4, surprise * lambda))
    next[s] = Math.max(0.005, next[s] * factor)
    moved++
  }
  // Renormalize
  const sum = SUBSYSTEMS.reduce((a, s) => a + next[s], 0) || 1
  for (const s of SUBSYSTEMS) next[s] = next[s] / sum
  return { weights: next, moved }
}

// ═══ Per-publish reward nudge (layered on the batch regression) ════════════

export interface RewardNudge {
  intent: IntentId
  /** Subsystems the credit-assignment actually moved (informative). */
  moved: number
  /** Weights after the reward nudge (renormalized, sums to 1). */
  weights: Record<SubsystemId, number>
}

/**
 * Layer the single-outcome reward nudge (learnFromOutcome) on top of the batch
 * regression. The batch fit learns slowly from the whole history; this nudges
 * each intent's blended weights once more using that intent's MOST RECENT
 * outcome, so a fresh publish moves the needle immediately instead of waiting
 * for the next retrain. Deterministic: same history → same result (no drift
 * from repeated runs).
 */
export function applyRewardNudges(
  report: LearnReport,
  history: HistoricalOutcome[],
  opts: { lambda?: number } = {},
): {
  byIntent: Partial<Record<IntentId, Record<SubsystemId, number>>>
  nudges: RewardNudge[]
} {
  const byIntent: Partial<Record<IntentId, Record<SubsystemId, number>>> = {}
  const nudges: RewardNudge[] = []
  for (const m of report.models) {
    let weights = m.weights
    const recent = mostRecentOutcome(history, m.intent)
    if (recent) {
      const n = learnFromOutcome(weights, recent.subsystemScores, recent.outcome, opts.lambda ?? 0.12)
      weights = n.weights
      nudges.push({ intent: m.intent, moved: n.moved, weights })
    }
    byIntent[m.intent] = weights
  }
  return { byIntent, nudges }
}

/** Newest-first: max `at` wins; absent timestamps fall back to array order. */
function mostRecentOutcome(history: HistoricalOutcome[], intent: IntentId): HistoricalOutcome | null {
  const rows = history.filter(
    (h) => h.intent === intent && (h.outcome.top10 != null || h.outcome.position != null),
  )
  if (!rows.length) return null
  return rows.reduce((best, r) => (r.at && (!best.at || r.at > best.at) ? r : best), rows[0])
}
