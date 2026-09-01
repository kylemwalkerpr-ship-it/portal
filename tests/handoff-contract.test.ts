/**
 * Phase D — plan→composer handoff regression tests.
 *
 * Locking in the drafter-contract surface for mission economics + CTR titles:
 *
 *  1. evaluateReauditContract adds a `title_filler` WARNING (never a block)
 *     when the H1 / frontmatter title reads as generic filler, and omits it
 *     for a concrete TitleLab-style title.
 *  2. buildFactoryUserPrompt renders the MISSION ECONOMICS + TITLE CONTRACT
 *     blocks ONLY when marketplaceCta / titleCandidate are supplied — absent
 *     options leave every existing prompt string byte-identical.
 *  3. isFillerTitle smoke — the exact template-filler string ship today is
 *     caught deterministically.
 *
 * The composer wiring itself (applyBrief mapping + fire-and-forget priceBand)
 * lives in a client component; per the Phase D brief it is asserted here via
 * string/type only, never by mounting React.
 */
import { isFillerTitle } from '@/lib/seoEngine/titleLab'
import { buildFactoryUserPrompt } from '@/lib/seoFactory/prompts'
import { evaluateReauditContract } from '@/lib/seoFactory/reauditContract'

const DISCLAIMER = 'This guide is for educational purposes only and does not constitute legal advice.'

const FILLER_DOC = `---
title: "Updated Requirements and Guidance for 2026"
description: A concrete meta description with enough characters to reach the audit band for this fixture case.
primaryKeyword: uk spouse visa
region: UK
robots: index,follow
---

# Updated Requirements and Guidance for 2026

## In 60 seconds

- UK spouse visa applicants must prove a genuine relationship and a minimum income.
- Processing times are published by the Home Office and change frequently.

## Eligibility

You must provide proof of income, accommodation in the UK, and a genuine, subsisting relationship with your partner.

## Documents

A valid passport, proof of savings, and a certified translation of your marriage certificate are required for submission.

## Application steps

Complete the online form, pay the fee, book biometrics, and attend an appointment at the visa application centre.

## Costs

Fees are set by the Home Office; the exact amount depends on your route and application channel.

## FAQ

**Do I need a consultant to apply?** Most applicants find the process easier with a regulated immigration adviser, but it is not a legal requirement.

## Sources

- https://www.gov.uk/uk-family-visa/partner-visa

---

${DISCLAIMER}
`

const CONCRETE_DOC = `---
title: "UK Spouse Visa Application Checklist for Families: Cost & Timeline"
description: A concrete meta description with enough characters to reach the audit band for this fixture case.
primaryKeyword: uk spouse visa
region: UK
robots: index,follow
---

# UK Spouse Visa Application Checklist for Families: Cost & Timeline

## In 60 seconds

- UK spouse visa applicants must prove a genuine relationship and a minimum income.
- Processing times are published by the Home Office and change frequently.

## Eligibility

You must provide proof of income, accommodation in the UK, and a genuine, subsisting relationship with your partner.

## Documents

A valid passport, proof of savings, and a certified translation of your marriage certificate are required for submission.

## Application steps

Complete the online form, pay the fee, book biometrics, and attend an appointment at the visa application centre.

## FAQ

**Do I need a consultant to apply?** Most applicants find the process easier with a regulated immigration adviser, but it is not a legal requirement.

---

${DISCLAIMER}
`

describe('Phase D · title_filler advisory (WARNING only, never a block)', () => {
  it('flags a filler H1/frontmatter title with a title_filler warning', () => {
    const result = evaluateReauditContract({
      content: FILLER_DOC,
      contentType: 'legal_guide',
      primaryKeyword: 'uk spouse visa',
      indexable: true,
    })
    const finding = result.warningsData.find((w) => w.code === 'title_filler')
    expect(finding).toBeDefined()
    expect(finding!.severity).toBe('warning')
    expect(finding!.message).toContain('Updated Requirements and Guidance for 2026')
    expect(finding!.fix).toContain('UK Spouse Visa Application Checklist for Families: Cost & Timeline')
    // Deduped: exactly one entry across quality + audit + advisory warnings.
    expect(result.warningsData.filter((w) => w.code === 'title_filler').length).toBe(1)
    expect(result.warnings).toBe(result.warningsData.length)
  })

  it('does NOT flag a concrete TitleLab-style title', () => {
    const result = evaluateReauditContract({
      content: CONCRETE_DOC,
      contentType: 'legal_guide',
      primaryKeyword: 'uk spouse visa',
      indexable: true,
    })
    expect(result.warningsData.some((w) => w.code === 'title_filler')).toBe(false)
  })

  it('isFillerTitle smoke: template filler is caught, concrete title is not', () => {
    expect(isFillerTitle('Updated Requirements and Guidance for 2026')).toBe(true)
    expect(isFillerTitle('UK Spouse Visa Application Checklist for Families: Cost & Timeline')).toBe(false)
  })
})

describe('Phase D · MISSION ECONOMICS + TITLE CONTRACT drafter blocks', () => {
  const base = {
    title: 'UK Spouse Visa Guide',
    topic: 'UK spouse visa',
    primaryKeyword: 'uk spouse visa',
    region: 'UK',
    contentType: 'legal_guide',
    tone: 'educational',
    gscBlock: 'GSC: none',
  }

  it('renders MISSION ECONOMICS + TITLE CONTRACT when marketplaceCta/titleCandidate are supplied', () => {
    const prompt = buildFactoryUserPrompt({
      ...base,
      marketplaceCta: {
        service: 'immigration & visa consultancy',
        slug: 'immigration-consultancy',
        priceBand: '$150–$350',
      },
      titleCandidate: 'UK Spouse Visa Application Checklist for Families: Cost & Timeline',
    })
    expect(prompt).toContain('MISSION ECONOMICS — the marketplace CTA:')
    expect(prompt).toContain('Service: immigration & visa consultancy (marketplace landing: immigration-consultancy)')
    expect(prompt).toContain('Honest price band from the brief: $150–$350')
    expect(prompt).toContain('book a consult for your specific case')
    expect(prompt).toContain('Never invent prices, tiers, or features')
    expect(prompt).toContain('TITLE CONTRACT: the H1 must carry this reader-facing title (candidate): UK Spouse Visa Application Checklist for Families: Cost & Timeline')
    expect(prompt).toContain('keep the core noun phrase')
    // Positioned after the LENGTH line, before the ONE-GO CONTRACT block.
    expect(prompt.indexOf('ONE-GO CONTRACT')).toBeGreaterThan(prompt.indexOf('MISSION ECONOMICS'))
    expect(prompt.indexOf('ONE-GO CONTRACT')).toBeGreaterThan(prompt.indexOf('LENGTH (legal guide / article'))
  })

  it('omits both blocks entirely when the options are absent (existing strings untouched)', () => {
    const prompt = buildFactoryUserPrompt({ ...base })
    expect(prompt).not.toContain('MISSION ECONOMICS')
    expect(prompt).not.toContain('TITLE CONTRACT')
    expect(prompt).not.toContain('price band')
    // The existing contract surface is byte-intact around the insertion point.
    expect(prompt).toContain('ONE-GO CONTRACT — write the ENTIRE article in this single response:')
    expect(prompt).toContain('LENGTH (legal guide / article')
  })

  it('handles a CTA without priceBand (no invented figures) and a bare titleCandidate', () => {
    const prompt = buildFactoryUserPrompt({
      ...base,
      marketplaceCta: { service: 'PR & citizenship filing support' },
      titleCandidate: 'How to Apply for UK Citizenship: Checklist & Fees',
    })
    expect(prompt).toContain('MISSION ECONOMICS')
    expect(prompt).toContain('Service: PR & citizenship filing support.')
    expect(prompt).toContain('No price band in the brief — never invent one')
    expect(prompt).toContain('TITLE CONTRACT')
  })
})
import { buildFactoryUserPrompt } from '@/lib/seoFactory/prompts'

describe('funnel economics threading into the drafter prompt', () => {
  const base = {
    title: 'Cost Guide',
    topic: 'student visa',
    primaryKeyword: 'australia student visa fees',
    region: 'AU',
    contentType: 'legal_guide',
    tone: 'educational',
    gscBlock: '',
  }
  it('pipeline prompt carries MISSION ECONOMICS + TITLE CONTRACT when supplied', () => {
    const prompt = buildFactoryUserPrompt({
      ...base,
      marketplaceCta: { service: 'Student Visa Consult', slug: 'student-visa-consult', priceBand: 'A$150–$350' },
      titleCandidate: 'Australia Student Visa Fees: Real Costs for 2026 Study',
    })
    expect(prompt).toContain('MISSION ECONOMICS')
    expect(prompt).toContain('Student Visa Consult')
    expect(prompt).toContain('A$150–$350')
    expect(prompt).toContain('TITLE CONTRACT')
    expect(prompt).toContain('Australia Student Visa Fees: Real Costs for 2026 Study')
  })

  it('omits both blocks when the mission fields are absent', () => {
    const prompt = buildFactoryUserPrompt(base)
    expect(prompt).not.toContain('MISSION ECONOMICS')
    expect(prompt).not.toContain('TITLE CONTRACT')
  })
})
