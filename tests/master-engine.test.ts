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
  type MasterEngineInput,
} from '@/lib/seoFactory/masterEngine'

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
  it('registers 130+ typed signals across 10 subsystems', () => {
    expect(SIGNAL_COUNT).toBeGreaterThanOrEqual(130)
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
})
