/**
 * Briefing-stage placeability — live CRS calculator + AU processing-time jobs
 * stuffed unplaceable mill long-tails ("is it possible to express entry
 * canada crs calculator", "how to apply for australia student visa
 * processing time") because the partitioner used the same apply-for templates
 * on every primary. Audit then could not unstuff them without rewriting.
 *
 * The brief must never emit those mashups. Apply-for long-tails stay legal
 * for real apply-targets (uk spouse visa).
 */
import {
  isFabricatedSyntheticTerm,
  isUnplaceableCoverageTerm,
  mergeBriefKeywords,
  partitionKeywords,
} from '@/lib/seoEngine/planner'
import {
  isApplyTargetPrimary,
  keywordContractForDraft,
  rejectFragmentKeyword,
  resolveKeywordContract,
} from '@/lib/seoFactory/keywordContract'

const CRS = 'express entry canada crs calculator'
const AU = 'australia student visa processing time'
const VISA = 'uk spouse visa'

describe('isApplyTargetPrimary', () => {
  it('is false for calculators, processing-time clocks, and templates', () => {
    expect(isApplyTargetPrimary(CRS)).toBe(false)
    expect(isApplyTargetPrimary(AU)).toBe(false)
    expect(isApplyTargetPrimary('green card timeline')).toBe(false)
    expect(isApplyTargetPrimary('statement of purpose letter template')).toBe(false)
  })

  it('is true for visas / permits / petitions a reader applies for', () => {
    expect(isApplyTargetPrimary(VISA)).toBe(true)
    expect(isApplyTargetPrimary('how to apply for a green card')).toBe(true)
    expect(isApplyTargetPrimary('canada study permit')).toBe(true)
  })
})

describe('partitioner does not mill unplaceable long-tails', () => {
  it('CRS calculator: no apply-for / is-it-possible mashups, still meets the floor', () => {
    const p = partitionKeywords([], CRS)
    expect(p.longTail.length).toBeGreaterThanOrEqual(4)
    expect(p.short.length).toBeGreaterThanOrEqual(5)
    for (const term of [...p.short, ...p.longTail]) {
      expect(isUnplaceableCoverageTerm(term)).toBe(false)
      expect(rejectFragmentKeyword(term, CRS)).toBe(false)
    }
    expect(p.longTail.some((t) => t.startsWith('how to apply for '))).toBe(false)
    expect(p.longTail.some((t) => t.startsWith('is it possible to '))).toBe(false)
    expect(p.longTail.some((t) => t.startsWith('do you need '))).toBe(false)
    expect(p.short).not.toContain('express')
    expect(p.short).toContain('express entry')
    expect(p.short).toContain('crs calculator')
    expect(p.longTail.some((t) => t === 'what is the express entry canada crs calculator' || t === 'how the express entry canada crs calculator works')).toBe(true)
  })

  it('AU processing time: no apply-for mashups, no australia student fragment', () => {
    const p = partitionKeywords([], AU)
    expect(p.longTail.length).toBeGreaterThanOrEqual(4)
    expect(p.short.length).toBeGreaterThanOrEqual(5)
    for (const term of [...p.short, ...p.longTail]) {
      expect(isUnplaceableCoverageTerm(term)).toBe(false)
      expect(rejectFragmentKeyword(term, AU)).toBe(false)
    }
    expect(p.short).not.toContain('australia student')
    expect(p.short).not.toContain('processing time')
    expect(p.longTail.some((t) => t.startsWith('how to apply for '))).toBe(false)
    expect(p.longTail.some((t) => t.startsWith('is it possible to '))).toBe(false)
  })

  it('uk spouse visa still receives how to apply for {primary}', () => {
    const p = partitionKeywords([], VISA)
    expect(p.longTail.some((t) => t.startsWith('how to apply for uk spouse visa'))).toBe(true)
    expect(p.longTail.some((t) => t.startsWith('is it possible to '))).toBe(false)
  })

  it('Canada spousal processing time: no canada spousal fragment, no apply-for mashup', () => {
    const pk = 'canada spousal sponsorship processing time'
    expect(isApplyTargetPrimary(pk)).toBe(false)
    expect(rejectFragmentKeyword('canada spousal', pk)).toBe(true)
    expect(rejectFragmentKeyword('processing time', pk)).toBe(true)
    const p = partitionKeywords([], pk)
    expect(p.short).not.toContain('canada spousal')
    expect(p.short).not.toContain('processing time')
    expect(p.longTail.some((t) => t.startsWith('how to apply for '))).toBe(false)
    expect(p.longTail.some((t) => t.startsWith('is it possible to '))).toBe(false)
    expect(p.short.length).toBeGreaterThanOrEqual(5)
    expect(p.longTail.length).toBeGreaterThanOrEqual(4)
  })

  it('business plan writing service: hired services are not apply-targets', () => {
    const pk = 'business plan writing service'
    expect(isApplyTargetPrimary(pk)).toBe(false)
    expect(rejectFragmentKeyword('writing service', pk)).toBe(true)
    const p = partitionKeywords([], pk)
    expect(p.short).not.toContain('writing service')
    expect(p.short).not.toContain('business plan application')
    expect(p.longTail.some((t) => t.startsWith('how to apply for '))).toBe(false)
    expect(p.longTail.some((t) => t.startsWith('is it possible to '))).toBe(false)
    expect(p.longTail.length).toBeGreaterThanOrEqual(4)
  })

  it('cheapest personal statement editing service: no apply-for mill, no cheapest personal fragment', () => {
    const pk = 'cheapest personal statement editing service'
    expect(isApplyTargetPrimary(pk)).toBe(false)
    expect(rejectFragmentKeyword('cheapest personal', pk)).toBe(true)
    expect(rejectFragmentKeyword('cheapest personal application', pk)).toBe(true)
    expect(rejectFragmentKeyword('editing service', pk)).toBe(true)
    expect(isUnplaceableCoverageTerm(`how to apply for ${pk}`)).toBe(true)
    expect(isUnplaceableCoverageTerm(`is it possible to ${pk}`)).toBe(true)
    expect(isUnplaceableCoverageTerm(`cost of applying for ${pk}`)).toBe(true)
    const p = partitionKeywords([], pk)
    expect(p.short).not.toContain('cheapest personal')
    expect(p.short).not.toContain('cheapest personal application')
    expect(p.longTail.some((t) => t.startsWith('how to apply for '))).toBe(false)
    expect(p.longTail.some((t) => t.startsWith('is it possible to '))).toBe(false)
    expect(p.longTail.length).toBeGreaterThanOrEqual(4)
    expect(p.short.length).toBeGreaterThanOrEqual(5)
  })

  it('fulbright application help: help is not an apply-target and doubled application is dropped', () => {
    const pk = 'fulbright application help'
    expect(isApplyTargetPrimary(pk)).toBe(false)
    expect(rejectFragmentKeyword('fulbright application application', pk)).toBe(true)
    expect(rejectFragmentKeyword('application help', pk)).toBe(true)
    expect(isUnplaceableCoverageTerm(`how to apply for ${pk}`)).toBe(true)
    const p = partitionKeywords([], pk)
    expect(p.short).not.toContain('fulbright application application')
    expect(p.short).not.toContain('application help')
    expect(p.longTail.some((t) => t.startsWith('how to apply for '))).toBe(false)
    expect(p.longTail.some((t) => t.startsWith('is it possible to '))).toBe(false)
    expect(p.longTail.length).toBeGreaterThanOrEqual(4)
    expect(p.short.length).toBeGreaterThanOrEqual(5)
  })

  it('how-to apply primaries do not glue "requirements and timeline" onto the query', () => {
    const pk = 'how to apply for a green card'
    expect(isApplyTargetPrimary(pk)).toBe(true)
    const p = partitionKeywords([], pk)
    expect(p.longTail).not.toContain(`${pk} requirements and timeline`)
    expect(p.longTail.some((t) => t === `${pk} step by step` || t === `${pk} in 2026`)).toBe(true)
    expect(p.longTail.some((t) => t.startsWith('how to apply for how to apply for'))).toBe(false)
  })
})

describe('live CRS/AU persisted mill lists are sealed off at resolve', () => {
  it('drops CRS mashups from the live job keyword arrays and refills the floor', () => {
    const contract = keywordContractForDraft({
      primaryKeyword: CRS,
      requiredShortKeywords: [
        'express entry',
        'express entry guide',
        'express entry requirements',
        'express entry application',
        'express entry eligibility',
        'crs calculator',
        'crs calculator guide',
      ],
      requiredLongTailKeywords: [
        CRS,
        `how to apply for ${CRS}`,
        `what is the ${CRS}`,
        `is it possible to ${CRS}`,
        `do you need ${CRS}`,
        `requirements for ${CRS}`,
        `${CRS} step by step`,
      ],
    })
    expect(contract.requiredLongTailKeywords).not.toContain(`how to apply for ${CRS}`)
    expect(contract.requiredLongTailKeywords).not.toContain(`is it possible to ${CRS}`)
    expect(contract.requiredLongTailKeywords).not.toContain(`do you need ${CRS}`)
    expect(contract.requiredLongTailKeywords).not.toContain(`requirements for ${CRS}`)
    expect(contract.requiredLongTailKeywords.length).toBeGreaterThanOrEqual(4)
    expect(contract.requiredShortKeywords).toContain('express entry')
    expect(contract.requiredShortKeywords).toContain('crs calculator')
    for (const term of [...contract.requiredShortKeywords, ...contract.requiredLongTailKeywords]) {
      expect(isUnplaceableCoverageTerm(term)).toBe(false)
    }
  })

  it('drops AU australia student / processing time fragments', () => {
    const contract = resolveKeywordContract({
      primaryKeyword: AU,
      requiredShortKeywords: [
        'australia student',
        'australia student guide',
        'processing time',
        'processing time guide',
        'student visa',
        'visa processing time',
        'australia student 2026',
      ],
      requiredLongTailKeywords: [
        AU,
        `how to apply for ${AU}`,
        `is it possible to ${AU}`,
        `what is the ${AU}`,
        `${AU} step by step`,
      ],
    })
    expect(contract.requiredShortKeywords).not.toContain('australia student')
    expect(contract.requiredShortKeywords).not.toContain('processing time')
    expect(contract.requiredLongTailKeywords).not.toContain(`how to apply for ${AU}`)
    expect(contract.requiredLongTailKeywords).not.toContain(`is it possible to ${AU}`)
    expect(contract.requiredShortKeywords.length).toBeGreaterThanOrEqual(5)
    expect(contract.requiredLongTailKeywords.length).toBeGreaterThanOrEqual(4)
  })
})

describe('mergeBriefKeywords never promotes unplaceable mill mashups', () => {
  it('skips is-it-possible even when the long-tail floor is short', () => {
    const merged = mergeBriefKeywords({
      modelShort: ['express entry', 'crs calculator'],
      modelLong: [`is it possible to ${CRS}`, `how to apply for ${CRS}`],
      primaryTerm: CRS,
    })
    expect(merged.longTail).not.toContain(`is it possible to ${CRS}`)
    expect(merged.longTail).not.toContain(`how to apply for ${CRS}`)
    expect(merged.longTail.length).toBeGreaterThanOrEqual(4)
  })
})

describe('isUnplaceableCoverageTerm flags the live mill strings', () => {
  it('flags CRS/AU mashups and truncated green-card floors', () => {
    expect(isUnplaceableCoverageTerm(`is it possible to ${CRS}`)).toBe(true)
    expect(isUnplaceableCoverageTerm(`do you need ${CRS}`)).toBe(true)
    expect(isUnplaceableCoverageTerm(`how to apply for ${CRS}`)).toBe(true)
    expect(isUnplaceableCoverageTerm(`how to apply for ${AU}`)).toBe(true)
    expect(isUnplaceableCoverageTerm('how long does the green take')).toBe(true)
    expect(isUnplaceableCoverageTerm('can i work while waiting for green approval')).toBe(true)
    expect(isUnplaceableCoverageTerm('how to apply for uk spouse visa')).toBe(false)
    expect(isFabricatedSyntheticTerm('requirements for a estimated tax payment help')).toBe(true)
  })
})
