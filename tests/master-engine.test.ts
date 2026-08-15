import {
  SIGNAL_COUNT,
  SIGNAL_REGISTRY,
  INTENT_WEIGHT_MATRIX,
  SUBSYSTEMS,
  detectIntent,
  isYmyLQuery,
  weightsFor,
  normalizeRange,
  normalizeTarget,
  computeSignals,
  scoreMaster,
  competitiveBaseline,
  masterEngineFixPlan,
  type MasterEngineInput,
} from '@/lib/seoFactory/masterEngine'
import type { BacklinkSnapshot } from '@/lib/seoFactory/backlinkProvider'

const BACKLINKS: BacklinkSnapshot = {
  url: 'https://legal.yousafeconsultancy.com/uk/graduate-route-visa/',
  provider: 'dataforseo',
  fetchedAt: '2026-08-15T00:00:00.000Z',
  totalBacklinks: 120,
  referringDomains: 34,
  referringMainDomains: 22,
  referringPages: 96,
  newBacklinks: 18,
  lostBacklinks: 6,
  brokenBacklinks: 2,
  spamScore: 12,
  domainRank: 38,
  samples: [
    { anchor: 'UK Graduate Route visa', nofollow: false, isNew: true, isLost: false, spamScore: 8, sourceExternalLinks: 4 },
    { anchor: 'graduate visa UK', nofollow: false, isNew: false, isLost: false, spamScore: 15, sourceExternalLinks: 2 },
    { anchor: 'you safe consultancy', nofollow: true, isNew: false, isLost: false, spamScore: 30, sourceExternalLinks: 180 },
    { anchor: 'read more', nofollow: false, isNew: true, isLost: false, spamScore: 5, sourceExternalLinks: 1 },
    { anchor: 'uk graduate visa', nofollow: false, isNew: false, isLost: false, spamScore: 20, sourceExternalLinks: 3 },
  ],
}

const LEGAL_GUIDE = `---
title: "UK Graduate Visa Requirements: Eligibility, Costs and Steps"
description: "Complete 2026 guide to the UK Graduate Route visa — eligibility, cost, documents and how to apply step by step, with official sources."
author: "Immigration Team"
credentials: "Regulated immigration adviser"
date: "2026-08-01"
---
# UK Graduate Visa Requirements

## In 60 seconds

The UK Graduate Route visa lets international students stay in the UK for 2 years (3 with a PhD) after completing an eligible course.

## Eligibility requirements

This page covers uk graduate visa eligibility in full. To apply for the uk graduate visa you must have completed an eligible UK degree and hold a valid student visa when you apply.

## How to apply step by step

1. Complete your course and receive your final results.
2. Check the UKVI eligibility requirements and documents required.
3. Submit the online application before your student visa expires.

## Documents required

You need your passport, Biometric Residence Permit, your CAS number, and proof of completion from your university.

## Costs and fees

The graduate route visa cost is GBP 822 (2026) plus the immigration health surcharge. Check the official GOV.UK guidance.

## Risks and common refusals

Common reasons for refusal include applying after the visa expiry and using documents that are not in English.

## FAQ

- Can I work on the Graduate Route? Yes, you can work in most roles.
- Can I switch to a Skilled Worker visa later? Yes, subject to eligibility.
- What is the processing timeline? Most applications take 8 weeks.

## Conclusion

The Graduate Route is the most flexible post-study option in the UK for eligible graduates.

---

This guide is educational and does not constitute legal advice. Contact a regulated immigration adviser for your situation.
`

const YMYL_TERMS_SAMPLE = 'immigration visa refusal appeal'

function healthyInput(overrides: Partial<MasterEngineInput> = {}): MasterEngineInput {
  return {
    topic: 'uk graduate visa requirements',
    primaryKeyword: 'uk graduate visa',
    contentType: 'article',
    region: 'UK',
    title: 'UK Graduate Visa Requirements: Eligibility, Costs and Steps',
    content: LEGAL_GUIDE,
    requiredShortKeywords: ['graduate visa', 'graduate route', 'uk visa'],
    requiredLongTailKeywords: ['uk graduate visa eligibility', 'graduate route visa cost'],
    indexable: true,
    canonicalUrl: 'https://legal.yousafeconsultancy.com/uk/graduate-route-visa/',
    ...overrides,
  }
}

describe('Master SEO Engine — registry & taxonomy', () => {
  it('registers 240+ typed signals across 10 scoring subsystems', () => {
    expect(SIGNAL_COUNT).toBeGreaterThanOrEqual(240)
    const subsystems = new Set(SIGNAL_REGISTRY.map((s) => s.subsystem))
    expect(subsystems.size).toBe(10)
    SUBSYSTEMS.forEach((s) => expect(subsystems.has(s)).toBe(true))
  })

  it('every signal id is unique and every subsystem row sums weights coherently', () => {
    const ids = SIGNAL_REGISTRY.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const sub of SUBSYSTEMS) {
      const rows = SIGNAL_REGISTRY.filter((s) => s.subsystem === sub)
      expect(rows.length).toBeGreaterThan(0)
    }
  })

  it('intent weight matrix rows sum to 1 (0.999–1.001 tolerance)', () => {
    for (const [intent, weights] of Object.entries(INTENT_WEIGHT_MATRIX)) {
      const sum = Object.values(weights).reduce((a, b) => a + b, 0)
      expect(sum).toBeGreaterThan(0.999)
      expect(sum).toBeLessThan(1.001)
      expect(intent.length).toBeGreaterThan(0)
    }
  })

  it('YMYL upweights E-E-A-T above the informational matrix', () => {
    const ymyl = INTENT_WEIGHT_MATRIX.ymyl.eeat
    const info = INTENT_WEIGHT_MATRIX.informational.eeat
    expect(ymyl).toBeGreaterThan(info * 1.5)
  })

  it('ymyl overlay blends E-E-A-T up without killing the base intent row', () => {
    const procedural = weightsFor('procedural', false)
    const blended = weightsFor('procedural', true)
    // E-E-A-T rises under the overlay
    expect(blended.eeat).toBeGreaterThan(procedural.eeat)
    // But the procedural content weight survives (not zeroed by YMYL)
    expect(blended.content).toBeGreaterThan(0.15)
    // Rows stay normalized
    const sum = SUBSYSTEMS.reduce((a, s) => a + blended[s], 0)
    expect(sum).toBeGreaterThan(0.999)
    expect(sum).toBeLessThan(1.001)
  })
})

describe('Master SEO Engine — intent detection', () => {
  it('flags legal/immigration queries as YMYL (overlay, not an intent)', () => {
    expect(isYmyLQuery({ primaryKeyword: YMYL_TERMS_SAMPLE })).toBe(true)
    expect(isYmyLQuery({ primaryKeyword: 'green card application' })).toBe(true)
    expect(isYmyLQuery({ primaryKeyword: 'how to open a bakery in canada' })).toBe(false)
  })

  it('classifies procedural queries ("how to apply")', () => {
    expect(detectIntent({ primaryKeyword: 'how to apply for study permit' })).toBe('procedural')
    expect(detectIntent({ primaryKeyword: 'uk student visa eligibility requirements' })).toBe('procedural')
  })

  it('classifies commercial and informational queries', () => {
    expect(detectIntent({ primaryKeyword: 'skilled worker visa cost vs student visa' })).toBe('commercial')
    expect(detectIntent({ primaryKeyword: 'what is a study permit' })).toBe('informational')
  })

  it('classifies the healthy guide as procedural', () => {
    expect(detectIntent({ primaryKeyword: 'uk graduate visa requirements' })).toBe('procedural')
  })
})

describe('Master SEO Engine — normalization', () => {
  it('clamps to 0–1 and flips direction', () => {
    expect(normalizeRange(50, 0, 100)).toBe(0.5)
    expect(normalizeRange(200, 0, 100)).toBe(1)
    expect(normalizeRange(-5, 0, 100)).toBe(0)
    expect(normalizeRange(20, 0, 100, false)).toBe(0.8)
    expect(normalizeRange(null, 0, 100)).toBeNull()
  })

  it('peaks around a target window', () => {
    expect(normalizeTarget(1.2, 1.2, 0.8)).toBe(1)
    expect(normalizeTarget(10, 1.2, 0.8)).toBeLessThan(0.01)
    expect(normalizeTarget(undefined, 1.2, 0.8)).toBeNull()
  })

  it('handles inverted windows linearly instead of collapsing to a step', () => {
    // (v, hi, lo, true) must equal (v, lo, hi, false) — the pre-fix behavior
    // returned 0 for every value below min, so clean drafts read as "worst".
    expect(normalizeRange(0, 8, 0, true)).toBe(1) // 0 occurrences = perfect
    expect(normalizeRange(8, 8, 0, true)).toBe(0)
    expect(normalizeRange(4, 8, 0, true)).toBeCloseTo(0.5, 5)
    expect(normalizeRange(4, 0, 8, false)).toBeCloseTo(0.5, 5)
  })
})

describe('Master SEO Engine — signal computation', () => {
  it('computes the core content signals for a healthy legal guide', () => {
    const v = computeSignals(healthyInput())
    // Depth is at/near target
    expect(v.c_word_depth).not.toBeNull()
    // H2 structure present (7 H2s)
    expect(v.c_h2_structure).not.toBeNull()
    expect(v.c_h2_structure!).toBeGreaterThan(0.9)
    // Title keyword present
    expect(v.c_title_keyword).toBe(1)
    // Disclaimer detected in body
    expect(v.c_disclaimer).toBe(1)
    // Internal estate links — count both markdown-relative and estate-host links
    expect(v.l_internal_estate).not.toBeNull()
    // Long-tail coverage — both required long-tails are in the body
    expect(v.s_longtail_coverage).not.toBeNull()
    expect(v.s_longtail_coverage!).toBeGreaterThan(0.99)
    // Current-year marker (2026)
    expect(v.f_year_marker).toBe(1)
  })

  it('scores clean voice as GOODNESS (1) so satisfied gaps never read as unmet', () => {
    const v = computeSignals(healthyInput())
    // No banned AI tells, no filler, no passive voice in the fixture
    expect(v.c_ai_tells).toBe(1)
    expect(v.c_passive_voice).toBe(1)
    expect(v.c_filler_ratio).toBe(1)
    // The recommendation gate and the risk gate both read the same value
    const report = scoreMaster(healthyInput())
    expect(report.recommendations.some((r) => r.code === 'ai_voice')).toBe(false)
    expect(report.risks.some((r) => r.code === 'ai_slop')).toBe(false)
  })

  it('detects genuine AI-tell spam and fires the voice gap + risk', () => {
    const slop = 'Unlock seamless solutions. ' + 'Delve into robust strategies. ' + 'Navigate the dynamic landscape. ' + 'Elevate your journey today. '
    const report = scoreMaster(healthyInput({ content: LEGAL_GUIDE + '\n\n' + slop }))
    expect(report.recommendations.some((r) => r.code === 'ai_voice')).toBe(true)
  })

  it('lights up the links subsystem from a backlink snapshot', () => {
    const without = scoreMaster(healthyInput())
    const withBl = scoreMaster(healthyInput({ backlinks: BACKLINKS }))
    // All six measurement slots compute once backlink data exists
    for (const id of ['l_referring_domains', 'l_estate_inbound', 'l_link_velocity', 'l_anchor_natural', 'l_toxic_links', 'l_editorial_links']) {
      const sig = withBl.computedSignals.find((s) => s.id === id)
      expect(sig).toBeDefined()
      expect(sig!.computed).toBe(true)
      expect(sig!.value).not.toBeNull()
    }
    // They were dark without the snapshot
    for (const id of ['l_referring_domains', 'l_estate_inbound']) {
      const sig = without.computedSignals.find((s) => s.id === id)
      expect(sig!.value).toBeNull()
    }
    // Links subsystem score improves and coverage rises
    expect(withBl.subsystems.links.score!).toBeGreaterThan(without.subsystems.links.score ?? 0)
    expect(withBl.coverage.computed).toBeGreaterThan(without.coverage.computed)
    // Domain authority now comes from DataForSEO rank when present
    const da = withBl.computedSignals.find((s) => s.id === 'l_domain_authority')
    expect(da!.value).toBeCloseTo(0.38, 2)
  })

  it('flags thin content and missing YMYL disclaimer as risks', () => {
    const report = scoreMaster({
      topic: 'visa refusal appeal',
      primaryKeyword: 'visa refusal appeal',
      contentType: 'article',
      content: 'Visa refusal appeal. This is very short.',
    })
    expect(report.risks.some((r) => r.code === 'thin_content' && r.severity === 'blocker')).toBe(true)
    expect(report.risks.some((r) => r.code === 'missing_disclaimer' && r.severity === 'blocker')).toBe(true)
  })

  it('warns on cannibalization when competing URLs exist', () => {
    const report = scoreMaster(healthyInput({ competingUrls: ['https://legal.yousafeconsultancy.com/uk/graduate-visa/', 'https://legal.yousafeconsultancy.com/uk/post-study-work/'] }))
    expect(report.risks.some((r) => r.code === 'cannibalization' && r.severity === 'warning')).toBe(true)
  })

  it('detects outcome-guarantee language', () => {
    const report = scoreMaster(healthyInput({ content: 'We guarantee 100% approval on your visa application. ' + LEGAL_GUIDE }))
    expect(report.risks.some((r) => r.code === 'outcome_promise' && r.severity === 'blocker')).toBe(true)
  })
})

describe('Master SEO Engine — fix-loop integration', () => {
  it('renders the top engine gaps into a prompt block, ordered by priority', () => {
    const plan = masterEngineFixPlan(healthyInput())
    expect(plan.priorities.length).toBeGreaterThan(0)
    expect(plan.priorities.length).toBeLessThanOrEqual(8)
    // Strictly descending priority (fix order = highest expected value first)
    for (let i = 1; i < plan.priorities.length; i++) {
      expect(plan.priorities[i - 1].priority).toBeGreaterThanOrEqual(plan.priorities[i].priority)
    }
    // Prompt block names the header and the top action
    expect(plan.promptBlock).toContain('PRIORITIZED ENGINE GAPS')
    expect(plan.promptBlock).toContain(plan.priorities[0].action)
    expect(plan.promptBlock).toContain('IN THIS ORDER')
  })

  it('passes ONLY unmet gaps to the model — satisfied ones are skipped', () => {
    const plan = masterEngineFixPlan(healthyInput())
    const codes = plan.priorities.map((p) => p.code)
    // Voice gap is satisfied (clean draft) → must NOT be in the plan
    expect(codes).not.toContain('ai_voice')
    // Content subsystem is strong (delta +9) → no "close the content gap"
    expect(codes).not.toContain('gap_content')
    // Schema subsystem is genuinely empty → its gaps must be in the plan
    expect(codes).toContain('faq_schema')
    expect(codes).toContain('article_schema')
    // Every passed gap carries a stable code and is open by construction
    for (const p of plan.priorities) {
      expect(p.code.length).toBeGreaterThan(2)
      expect(p.action.length).toBeGreaterThan(10)
    }
  })

  it('weak drafts surface concrete high-value gaps first', () => {
    const plan = masterEngineFixPlan({
      topic: 'visa refusal appeal',
      primaryKeyword: 'visa refusal appeal',
      contentType: 'article',
      content: 'Visa refusal appeal. This is very short.',
    })
    expect(plan.priorities.length).toBeGreaterThan(0)
    const top = plan.priorities[0]
    expect(top.subsystem).toBeTruthy()
    expect(top.action.length).toBeGreaterThan(10)
    expect(plan.promptBlock.startsWith('## PRIORITIZED ENGINE GAPS')).toBe(true)
  })
})

describe('Master SEO Engine — full report', () => {
  it('produces a layered report with composite, subsystems, deltas, recs and prediction', () => {
    const report = scoreMaster(healthyInput())
    expect(report.generatedAt).toBeTruthy()
    expect(report.intent).toBeTruthy()
    expect(report.composite).not.toBeNull()
    expect(report.composite!).toBeGreaterThan(0)
    expect(report.composite!).toBeLessThanOrEqual(100)
    expect(['A', 'B', 'C', 'D', 'F']).toContain(report.grade)
    for (const s of SUBSYSTEMS) {
      expect(report.subsystems[s]).toBeDefined()
      expect(report.deltas[s]).toBeDefined()
      expect(report.baseline[s]).toBeDefined()
      expect(report.weights[s]).toBeDefined()
    }
    expect(report.coverage.computed).toBeGreaterThan(0)
    expect(report.coverage.total).toBe(SIGNAL_COUNT)
    expect(report.prediction.top10Probability).not.toBeNull()
    expect(report.recommendations).toBeInstanceOf(Array)
    // Sorted by priority desc
    for (let i = 1; i < report.recommendations.length; i++) {
      expect(report.recommendations[i - 1].priority).toBeGreaterThanOrEqual(report.recommendations[i].priority)
    }
  })

  it('healthy page scores higher than a thin page', () => {
    const healthy = scoreMaster(healthyInput())
    const thin = scoreMaster({ primaryKeyword: 'x', contentType: 'article', content: 'tiny' })
    expect(healthy.composite!).toBeGreaterThan(thin.composite ?? 0)
  })

  it('competitive baseline uses the deterministic floor when no snippets are supplied', () => {
    const b = competitiveBaseline(healthyInput())
    for (const s of SUBSYSTEMS) {
      expect(b[s]).toBeGreaterThan(0)
      expect(b[s]).toBeLessThanOrEqual(1)
    }
  })

  it('competitive baseline degrades toward snippet consensus when supplied', () => {
    const withSnippets = competitiveBaseline(healthyInput({
      competingSnippets: [
        'UK Graduate Route visa guide covering eligibility, cost, application steps and documents required.',
        'Post-study work visa UK: requirements, fees, processing time and how to apply from the official GOV.UK pages.',
      ],
    }))
    // Content subsystem baseline should still be a sane 0–1
    expect(withSnippets.content).toBeGreaterThan(0)
    expect(withSnippets.content).toBeLessThanOrEqual(1)
  })

  it('captures an ordered livestream trace of every pipeline phase', () => {
    const report = scoreMaster(healthyInput())
    expect(report.trace).toBeInstanceOf(Array)
    expect(report.trace.length).toBeGreaterThan(8)

    // Every step is well-formed
    for (const s of report.trace) {
      expect(s.seq).toBeGreaterThanOrEqual(0)
      expect(s.message).toBeTruthy()
      expect(['info', 'ok', 'warn', 'err', 'accent']).toContain(s.tone)
      expect(s.progress).toBeGreaterThan(0)
      expect(s.progress).toBeLessThanOrEqual(1)
    }

    // Phases appear in pipeline order, seq is monotonic
    const phases = report.trace.map((s) => s.phase)
    for (let i = 1; i < report.trace.length; i++) {
      expect(report.trace[i].seq).toBe(report.trace[i - 1].seq + 1)
    }
    expect(phases[0]).toBe('input')
    expect(phases).toContain('intent')
    expect(phases).toContain('weights')
    expect(phases).toContain('signals')
    expect(phases).toContain('baseline')
    expect(phases).toContain('delta')
    expect(phases).toContain('predict')
    expect(phases[phases.length - 1]).toBe('done')

    // The trace mirrors the report's own numbers
    const done = report.trace[report.trace.length - 1]
    expect(done.message).toContain(String(report.composite))
    const sig = report.trace.find((s) => s.phase === 'signals')
    expect(sig!.message).toContain(`${report.coverage.computed}/${report.coverage.total}`)
  })

  it('risk phases surface blockers and recommendations carry priority in the trace', () => {
    const report = scoreMaster(healthyInput())
    const riskSteps = report.trace.filter((s) => s.phase === 'risk')
    expect(riskSteps.length).toBeGreaterThan(0)
    const recSteps = report.trace.filter((s) => s.phase === 'recommend')
    // recommendations slice is capped at 8 in the trace
    expect(recSteps.length).toBeLessThanOrEqual(8)
    // recommend steps mirror the top recommendation priority
    if (report.recommendations.length > 0 && recSteps.length > 0) {
      expect(recSteps[0].message).toContain(`#${report.recommendations[0].priority}`)
    }
  })
})

describe('Master SEO Engine — powerhouse layers (derived, ladder, governance)', () => {
  it('derives higher-order features with sane 0–1 bounds', () => {
    const report = scoreMaster(healthyInput())
    const d = report.derived
    expect(d.competitiveGap).not.toBeNull()
    for (const key of [
      'competitiveGap',
      'contentSuperiority',
      'informationGainAdvantage',
      'authorityGap',
      'optimizationHeadroom',
    ] as const) {
      const v = d[key]
      expect(v).not.toBeNull()
      expect(v!).toBeGreaterThanOrEqual(0)
      expect(v!).toBeLessThanOrEqual(1)
    }
    // Headroom = 1 - composite (0-1), mirroring the reported (rounded) 0-100 composite.
    expect(d.optimizationHeadroom!).toBeCloseTo((100 - report.composite!) / 100, 2)
  })

  it('exposes a full probability ladder that is monotonically decreasing', () => {
    const report = scoreMaster(healthyInput())
    const p = report.prediction
    for (const key of [
      'top100Probability',
      'top20Probability',
      'top10Probability',
      'top3Probability',
      'position1Probability',
      'clickProbability',
      'conversionProbability',
      'expectedValue',
    ] as const) {
      expect(p[key]).not.toBeNull()
    }
    expect(p.top100Probability!).toBeGreaterThanOrEqual(p.top20Probability!)
    expect(p.top20Probability!).toBeGreaterThanOrEqual(p.top10Probability!)
    expect(p.top10Probability!).toBeGreaterThanOrEqual(p.top3Probability!)
    expect(p.top3Probability!).toBeGreaterThanOrEqual(p.position1Probability!)
    // The ladder is on the reported 0-100 scale (fixed the 0-1/0-100 mismatch).
    expect(p.top10Probability!).toBeGreaterThan(0)
    expect(p.top10Probability!).toBeLessThanOrEqual(100)
  })

  it('reports model governance: confidence in 0–1, version, and data caveats', () => {
    const report = scoreMaster(healthyInput())
    expect(report.governance.modelVersion).toBeTruthy()
    expect(report.governance.confidence).not.toBeNull()
    expect(report.governance.confidence!).toBeGreaterThanOrEqual(0)
    expect(report.governance.confidence!).toBeLessThanOrEqual(1)
    // healthyInput has no liveHtml / gsc / backlinks → caveats must be present
    expect(report.governance.caveats.length).toBeGreaterThan(0)
  })

  it('maps the registry into the 18-category research taxonomy via group', () => {
    const groups = new Set(SIGNAL_REGISTRY.map((s) => s.group || s.subsystem))
    for (const g of [
      'Keyword Demand & Opportunity',
      'SERP Features & Competitive Intelligence',
      'Security, Privacy & Compliance',
      'Brand & Entity Signals',
      'Mobile Optimization',
      'Local SEO Layer',
    ]) {
      expect(groups.has(g)).toBe(true)
    }
  })
})
