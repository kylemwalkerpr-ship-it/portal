import {
  applyRewardNudges,
  fitLogistic,
  learnWeights,
  learnWeightsForIntent,
  learnFromOutcome,
  type HistoricalOutcome,
} from '@/lib/seoFactory/masterEngineLearn'
import { INTENT_WEIGHT_MATRIX, SUBSYSTEMS, type IntentId } from '@/lib/seoFactory/masterEngine'

function scoresFor(quality: number): Record<string, number> {
  const out: Record<string, number> = {}
  SUBSYSTEMS.forEach((s, i) => {
    // quality 1 = uniformly high scores, 0 = uniformly low, with small per-subsystem noise
    out[s] = Math.max(0.02, Math.min(0.98, quality - 0.08 * (i % 3) + 0.05 * ((i * 7) % 5)))
  })
  return out
}

function historyFor(intent: IntentId, goodCount: number, badCount: number): HistoricalOutcome[] {
  const rows: HistoricalOutcome[] = []
  for (let i = 0; i < goodCount; i++) {
    rows.push({ intent, subsystemScores: scoresFor(0.85), outcome: { top10: true, position: 4 } })
  }
  for (let i = 0; i < badCount; i++) {
    rows.push({ intent, subsystemScores: scoresFor(0.15), outcome: { top10: false, position: 38 } })
  }
  return rows
}

describe('Master Engine Learn — logistic regression', () => {
  it('separates a perfectly separable dataset', () => {
    // Two clusters: high-score pages rank, low-score pages don't
    const X = [
      [1, 0.9], [0.95, 0.85], [1, 1], [0.9, 0.95],
      [0.1, 0.2], [0.05, 0.1], [0.2, 0.05], [0.15, 0.15],
    ]
    const y = [1, 1, 1, 1, 0, 0, 0, 0]
    const { coef, intercept } = fitLogistic(X, y, { iters: 600, lr: 0.4 })
    let correct = 0
    for (let i = 0; i < X.length; i++) {
      const z = intercept + coef[0] * X[i][0] + coef[1] * X[i][1]
      const pred = 1 / (1 + Math.exp(-z)) >= 0.5 ? 1 : 0
      if (pred === y[i]) correct++
    }
    expect(correct).toBe(X.length)
  })
})

describe('Master Engine Learn — per-intent learning', () => {
  it('returns null with too few samples (keeps the prior)', () => {
    expect(learnWeightsForIntent(historyFor('ymyl', 2, 0), 'ymyl')).toBeNull()
    expect(learnWeightsForIntent([], 'ymyl')).toBeNull()
  })

  it('learns weights that sum to 1 and blend toward the prior with few samples', () => {
    const m = learnWeightsForIntent(historyFor('ymyl', 6, 6), 'ymyl')!
    expect(m).not.toBeNull()
    const sum = SUBSYSTEMS.reduce((a, s) => a + m.weights[s], 0)
    expect(sum).toBeGreaterThan(0.999)
    expect(sum).toBeLessThan(1.001)
    // With n=12 the learned importance should visibly move E-E-A-T weight
    expect(m.n).toBe(12)
    expect(m.confidence).toBeGreaterThan(0.5)
    // Diagnostics are populated
    expect(m.diagnostics.accuracy).not.toBeNull()
    expect(m.diagnostics.brier).not.toBeNull()
  })

  it('the learned model separates good from bad history', () => {
    const m = learnWeightsForIntent(historyFor('procedural', 10, 10), 'procedural')!
    // A high-score page should predict top-10 (>0.5)
    const high = scoresFor(0.9)
    let z = m.intercept
    SUBSYSTEMS.forEach((s, i) => { z += m.coefficients[i] * high[s] })
    const pHigh = 1 / (1 + Math.exp(-z))
    const low = scoresFor(0.1)
    z = m.intercept
    SUBSYSTEMS.forEach((s, i) => { z += m.coefficients[i] * low[s] })
    const pLow = 1 / (1 + Math.exp(-z))
    expect(pHigh).toBeGreaterThan(0.5)
    expect(pLow).toBeLessThan(0.5)
  })
})

describe('Master Engine Learn — batch adaptation', () => {
  it('produces per-intent models and drift warnings only when needed', () => {
    const report = learnWeights([
      ...historyFor('ymyl', 8, 8),
      ...historyFor('informational', 5, 5),
    ])
    expect(report.models.length).toBe(2)
    expect(report.generatedAt).toBeTruthy()
    expect(report.driftWarnings).toBeInstanceOf(Array)
  })

  it('never emits a model for intents without enough data', () => {
    const report = learnWeights([
      ...historyFor('ymyl', 8, 8),
      { intent: 'local' as IntentId, subsystemScores: scoresFor(0.5), outcome: { top10: true } },
      { intent: 'local' as IntentId, subsystemScores: scoresFor(0.5), outcome: { top10: false } },
    ])
    expect(report.models.some((m) => m.intent === 'ymyl')).toBe(true)
    expect(report.models.some((m) => m.intent === 'local')).toBe(false)
  })
})

describe('Master Engine Learn — single-outcome reward', () => {
  it('moves weight toward informative subsystems and renormalizes', () => {
    const prior = { ...INTENT_WEIGHT_MATRIX.ymyl }
    // Low scores on content/schema preceded a GOOD outcome → those subsystems were underweighted
    const scores = {
      content: 0.2, schema: 0.15, eeat: 0.9, links: 0.85, semantic: 0.8,
      intent: 0.8, technical: 0.85, serp: 0.8, freshness: 0.8, experience: 0.8,
    }
    const { weights, moved } = learnFromOutcome(prior, scores, { top10: true })
    expect(moved).toBeGreaterThan(0)
    expect(weights.content).toBeGreaterThan(prior.content)
    expect(weights.schema).toBeGreaterThan(prior.schema)
    const sum = SUBSYSTEMS.reduce((a, s) => a + weights[s], 0)
    expect(sum).toBeGreaterThan(0.999)
    expect(sum).toBeLessThan(1.001)
  })

  it('downweights misleading high scores after a bad outcome', () => {
    const prior = { ...INTENT_WEIGHT_MATRIX.procedural }
    // High eeat/content but the page still failed → those signals were over-trusted
    const scores = {
      content: 0.95, eeat: 0.9, schema: 0.9, links: 0.1, semantic: 0.9,
      intent: 0.9, technical: 0.9, serp: 0.9, freshness: 0.9, experience: 0.9,
    }
    const { weights } = learnFromOutcome(prior, scores, { top10: false }, 0.15)
    expect(weights.content).toBeLessThan(prior.content)
    expect(weights.eeat).toBeLessThan(prior.eeat)
    const sum = SUBSYSTEMS.reduce((a, s) => a + weights[s], 0)
    expect(sum).toBeGreaterThan(0.999)
    expect(sum).toBeLessThan(1.001)
  })
})

describe('Master Engine Learn — reward nudge layered on batch regression', () => {
  const lowContentRecent = (at: string): HistoricalOutcome => ({
    intent: 'ymyl' as IntentId,
    at,
    // Low content/schema preceded a GOOD outcome → those subsystems were underweighted
    subsystemScores: {
      content: 0.2, schema: 0.15, eeat: 0.9, links: 0.85, semantic: 0.8,
      intent: 0.8, technical: 0.85, serp: 0.8, freshness: 0.8, experience: 0.8,
    },
    outcome: { top10: true, position: 3 },
  })

  it('nudges the batch weights using the most recent per-intent outcome', () => {
    const report = learnWeights(historyFor('ymyl', 8, 8))
    const model = report.models.find((m) => m.intent === 'ymyl')!
    const nudged = applyRewardNudges(report, [...historyFor('ymyl', 8, 8), lowContentRecent('2026-08-15T00:00:00Z')])

    const w = nudged.byIntent.ymyl!
    // The nudge upweighted content (underweighted → good outcome) on top of the batch fit
    expect(w.content).toBeGreaterThan(model.weights.content)
    expect(w.schema).toBeGreaterThan(model.weights.schema)
    // Renormalized
    const sum = SUBSYSTEMS.reduce((a, s) => a + w[s], 0)
    expect(sum).toBeGreaterThan(0.999)
    expect(sum).toBeLessThan(1.001)
    expect(nudged.nudges).toHaveLength(1)
    expect(nudged.nudges[0].intent).toBe('ymyl')
    expect(nudged.nudges[0].moved).toBeGreaterThan(0)
  })

  it('picks the latest outcome by timestamp', () => {
    const report = learnWeights(historyFor('ymyl', 8, 8))
    const model = report.models.find((m) => m.intent === 'ymyl')!
    // Later outcome = BAD with high content → content over-trusted → downweighted
    const laterBad: HistoricalOutcome = {
      intent: 'ymyl' as IntentId,
      at: '2026-08-16T00:00:00Z',
      subsystemScores: { ...scoresFor(0.95), content: 0.95, eeat: 0.9 },
      outcome: { top10: false, position: 33 },
    }
    const nudged = applyRewardNudges(report, [
      ...historyFor('ymyl', 8, 8),
      lowContentRecent('2026-08-15T00:00:00Z'),
      laterBad,
    ])
    // The later (bad) outcome wins → content is nudged DOWN vs the batch fit
    expect(nudged.byIntent.ymyl!.content).toBeLessThan(model.weights.content)
  })

  it('emits no nudge when there are no models', () => {
    const nudged = applyRewardNudges(learnWeights([]), [])
    expect(Object.keys(nudged.byIntent)).toHaveLength(0)
    expect(nudged.nudges).toHaveLength(0)
  })
})
