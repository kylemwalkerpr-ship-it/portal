/**
 * Synthesized-keyword hygiene — regression for the 2026-09-01 systemic defect
 * where "missing_synthesized_*" warnings could NEVER be resolved:
 *
 *  1. The partitioner fabricated unplaceable phrases ("requirements for a
 *     estimated tax payment help" — broken article; "…checklist and timeline",
 *     "…in 2026 explained" — machine-only). No writer will ever produce them
 *     verbatim, so the advisory warning was permanent by construction.
 *  2. Every fix path then refused them: the loop classed them unclearable and
 *     the deterministic repair refuses to weave keywords.
 *
 * With the templates tightened to natural phrases the warning becomes
 * placeable; markers keep legacy fabricated strings typed `synthesized`.
 */
import { partitionKeywords, isFabricatedSyntheticTerm } from '@/lib/seoEngine/planner'

describe('synthesized long-tail templates are placeable English', () => {
  const templates = partitionKeywords([], 'estimated tax payment help')

  it('never emits the broken-article construction ("for a estimated")', () => {
    expect(templates.longTailTerms.some((t) => /\ba (?:estimated|international|student|visa)/.test(t.term))).toBe(false)
    expect(templates.longTailTerms.some((t) => /for a [a-z]/.test(t.term))).toBe(false)
  })

  it('never emits the machine-only suffix markers', () => {
    for (const marker of [' in 2026 explained', 'checklist and timeline', 'requirements explained by an expert']) {
      expect(templates.longTailTerms.some((t) => t.term.includes(marker))).toBe(false)
    }
  })

  it('fills the long-tail floor with ≥4-word natural queries', () => {
    const longTail = templates.longTailTerms.map((t) => t.term)
    expect(longTail.length).toBeGreaterThanOrEqual(4)
    for (const term of longTail) {
      expect(term.split(/\s+/).length).toBeGreaterThanOrEqual(4)
      expect(term).not.toMatch(/\bof a\b|\bfor a\b|\ba a\b/i)
    }
  })
})

describe('fabrication markers keep legacy strings classified synthesized', () => {
  it('flags only strings the old generator could have made', () => {
    expect(isFabricatedSyntheticTerm('requirements for a estimated tax payment help')).toBe(true)
    expect(isFabricatedSyntheticTerm('estimated tax payment help in 2026 explained')).toBe(true)
    expect(isFabricatedSyntheticTerm('estimated tax payment help checklist and timeline')).toBe(true)
    expect(isFabricatedSyntheticTerm('do you need a estimated tax payment help')).toBe(true)
    // Natural queries are never flagged.
    expect(isFabricatedSyntheticTerm('how to pay estimated taxes while on a student visa')).toBe(false)
    expect(isFabricatedSyntheticTerm('estimated tax payment help for international students')).toBe(false)
  })
})