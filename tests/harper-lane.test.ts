import {
  HARPER_IDENTITY_NON_NEGOTIABLE,
  harperActionableBlockers,
  harperDeferredLane,
  harperSeoFails,
  harperSeoScore,
  isHarperProseFinding,
  isHarperProseSeoFail,
  partitionHarperFindings,
} from '@/lib/seoFactory/harperLane'
import { applyEditorialRevision } from '@/lib/seoFactory/editorialRevision'
import { editorialReportReady } from '@/lib/seoFactory/editorialGate'
import { buildHarperSupervisionPacket, editorialTargetsMet, measureEditorial } from '@/lib/editorialSupervisor'

describe('harperLane — Harper is prose-only', () => {
  it('does not treat outline, primary identity, or owner URL as Harper-actionable', () => {
    expect(isHarperProseFinding('missing_outline_section')).toBe(false)
    expect(isHarperProseFinding('keyword')).toBe(false)
    expect(isHarperProseFinding('ownership')).toBe(false)
    expect(isHarperProseFinding('cannibalization_exact_match')).toBe(false)
    expect(isHarperProseFinding('insufficient_short_keywords')).toBe(false)
    expect(isHarperProseFinding('missing_faq')).toBe(false)
    expect(isHarperProseFinding('structure_h2')).toBe(false)
    expect(isHarperProseFinding('ai_slop')).toBe(true)
    expect(isHarperProseFinding('missing_short_keyword')).toBe(true)
  })

  it('routes leftover codes to the honest owner', () => {
    expect(harperDeferredLane('missing_outline_section')).toBe('structural')
    expect(harperDeferredLane('insufficient_short_keywords')).toBe('brief')
    expect(harperDeferredLane('ownership')).toBe('human')
    expect(harperDeferredLane('cannibalization_high_overlap')).toBe('human')
  })

  it('keeps structural SEO fails out of Harper\'s SEO lane', () => {
    expect(isHarperProseSeoFail('Primary keyword missing from H1')).toBe(false)
    expect(isHarperProseSeoFail('Only 2 H2 sections (need ≥4)')).toBe(false)
    expect(isHarperProseSeoFail('Missing FAQ section')).toBe(false)
    expect(isHarperProseSeoFail('Missing Sources section')).toBe(false)
    expect(isHarperProseSeoFail('No meta description yet')).toBe(false)
    expect(isHarperProseSeoFail('Only 1 URLs (need ≥2)')).toBe(false)
    expect(isHarperProseSeoFail('Opening does not answer the primary keyword early')).toBe(true)
    expect(isHarperProseSeoFail('Only 1/5 demand keywords present')).toBe(true)
  })

  it('scores Harper SEO as 100 when the only leftovers are structural', () => {
    const score = harperSeoScore({
      pass: ['Primary keyword answered in the opening', '4 H2 sections'],
      fail: ['Primary keyword missing from H1', 'Missing FAQ section', 'No meta description yet'],
    })
    expect(score).toBe(100)
    expect(harperSeoFails([
      'Primary keyword missing from H1',
      'Opening does not answer the primary keyword early',
    ])).toEqual(['Opening does not answer the primary keyword early'])
    expect(harperSeoScore({
      pass: ['Primary keyword answered in the opening'],
      fail: ['Only 1/5 demand keywords present', 'Missing FAQ section'],
    })).toBeLessThan(100)
  })

  it('partitions quality findings so Harper never sees outline / owner / brief floors', () => {
    const { prose, deferred } = partitionHarperFindings([
      { code: 'ai_slop', message: 'Cut the cliché.', fix: 'Rewrite plainly.' },
      { code: 'missing_outline_section', message: 'Worked Example is missing.', fix: 'Insert ## Worked Example' },
      { code: 'ownership', message: 'Owner URL blocked.', fix: 'Change keyword or expand owner.' },
      { code: 'insufficient_short_keywords', message: 'Brief supplied 2 shorts.' },
    ])
    expect(prose.map((f) => f.code)).toEqual(['ai_slop'])
    expect(deferred.map((d) => d.code).sort()).toEqual([
      'insufficient_short_keywords',
      'missing_outline_section',
      'ownership',
    ])
    expect(harperActionableBlockers([
      'missing_outline_section',
      'ai_slop',
      'ownership',
    ])).toEqual(['ai_slop'])
  })
})

describe('Harper packet defers identity / structure', () => {
  const hint = { contentType: 'article', primaryKeyword: 'student visa guide' }
  const cleanGrammar = { score: 100, errors: 0, suggestions: 0, items: [] }
  const body = `# Student visa guide

## In 60 seconds

Students must check the current official requirements before applying.

## Eligibility

Applicants must hold a valid offer and provide the required documents.

## Documents

Keep the passport and offer letter together.

## FAQ

### Can requirements change?

Yes. Check the official source.`

  it('does not hand Harper outline, owner URL, or H1-primary as mustApply directives', () => {
    const base = measureEditorial(body, hint, cleanGrammar)
    const snapshot = {
      ...base,
      blockers: ['missing_outline_section', 'ownership', 'ai_slop'],
      findings: [
        { code: 'missing_outline_section', severity: 'blocker' as const, message: 'Worked Example missing.', fix: 'Insert the H2.' },
        { code: 'ownership', severity: 'blocker' as const, message: 'Owner URL blocked.', fix: 'Change the owner URL.' },
        { code: 'ai_slop', severity: 'blocker' as const, message: 'Robotic phrasing.', fix: 'Rewrite plainly.' },
      ],
      metrics: {
        ...base.metrics,
        seo: {
          ...base.metrics.seo,
          score: 40,
          fail: [
            'Primary keyword missing from H1',
            'Missing FAQ section',
            'Opening does not answer the primary keyword early',
          ],
        },
      },
    }
    const packet = buildHarperSupervisionPacket(snapshot as any)
    expect(packet.directives.some((d) => /missing_outline_section|ownership|Insert the H2|Change the owner URL|Primary keyword missing from H1|Missing FAQ section/i.test(`${d.instruction} ${d.evidence || ''}`))).toBe(false)
    expect(packet.directives.some((d) => d.lane === 'ai_write' && /Rewrite plainly/i.test(d.instruction))).toBe(true)
    expect(packet.directives.some((d) => d.lane === 'seo' && /Opening does not answer/i.test(d.instruction))).toBe(true)
    expect(packet.deferred.map((d) => d.code).sort()).toEqual(['missing_outline_section', 'ownership'])
    expect(packet.deferred.find((d) => d.code === 'ownership')?.lane).toBe('human')
    expect(packet.deferred.find((d) => d.code === 'missing_outline_section')?.lane).toBe('structural')
    expect(packet.nonNegotiables).toContain(HARPER_IDENTITY_NON_NEGOTIABLE)
    expect(packet.unmet).toContain('ai_write')
    expect(packet.unmet).toContain('seo')
  })

  it('treats Harper targets as met when only structural / identity blockers remain', () => {
    const base = measureEditorial(body, hint, cleanGrammar)
    const snapshot = {
      ...base,
      voice: 80,
      blockers: ['missing_outline_section', 'ownership'],
      findings: [
        { code: 'missing_outline_section', severity: 'blocker' as const, message: 'Worked Example missing.' },
        { code: 'ownership', severity: 'blocker' as const, message: 'Owner URL blocked.' },
      ],
      metrics: {
        ...base.metrics,
        seo: {
          pass: ['Primary keyword answered in the opening'],
          fail: ['Primary keyword missing from H1', 'Missing Sources section'],
          warn: [],
          score: 33,
        },
        readability: { ...base.metrics.readability, pass: true, score: 70, target: 55 },
      },
    }
    expect(editorialTargetsMet(snapshot as any)).toBe(true)
    const packet = buildHarperSupervisionPacket(snapshot as any)
    expect(packet.current.seo).toBe(100)
    expect(packet.unmet).toEqual([])
    expect(packet.directives.filter((d) => d.mustApply)).toEqual([])
  })
})

describe('EditorialRevision freezes outline and identity', () => {
  const original = `---
title: Student visa
primaryKeyword: student visa guide
canonicalUrl: https://legal.yousafeconsultancy.com/us/student-visa-guide
---

# Student visa guide

See https://immi.homeaffairs.gov.au/visas and the 1624 AUD charge. Applicants must check official sources.

## Eligibility

Hold a valid offer.

## Disclaimer

This page is educational and is not legal advice.
`

  it('rejects a document rewrite that adds or renames an H2', () => {
    expect(() => applyEditorialRevision(original, {
      version: 2,
      mode: 'document',
      document: `# Student visa guide

See https://immi.homeaffairs.gov.au/visas and the 1624 AUD charge. Applicants must check official sources.

## Worked Example

A new section Harper is not allowed to add.

## Disclaimer

This page is educational and is not legal advice.
`,
      appliedIds: ['harper-grammar-deadbeef'],
      waivedIds: [],
    }, { mustApplyIds: ['harper-grammar-deadbeef'] })).toThrow(/outline H2s/i)
  })

  it('rejects a rewrite that changes the H1', () => {
    expect(() => applyEditorialRevision(original, {
      version: 2,
      mode: 'document',
      document: `# Visitor visa guide

See https://immi.homeaffairs.gov.au/visas and the 1624 AUD charge. Applicants must check official sources.

## Eligibility

Hold a valid offer.

## Disclaimer

This page is educational and is not legal advice.
`,
      appliedIds: ['harper-grammar-deadbeef'],
      waivedIds: [],
    }, { mustApplyIds: ['harper-grammar-deadbeef'] })).toThrow(/H1/i)
  })

  it('rejects a rewrite that changes primaryKeyword identity', () => {
    expect(() => applyEditorialRevision(original, {
      version: 2,
      mode: 'document',
      document: `---
title: Student visa
primaryKeyword: visitor visa
canonicalUrl: https://legal.yousafeconsultancy.com/us/student-visa-guide
---

# Student visa guide

See https://immi.homeaffairs.gov.au/visas and the 1624 AUD charge. Applicants must check official sources.

## Eligibility

Hold a valid offer.

## Disclaimer

This page is educational and is not legal advice.
`,
      appliedIds: ['harper-grammar-deadbeef'],
      waivedIds: [],
    }, { mustApplyIds: ['harper-grammar-deadbeef'] })).toThrow(/primaryKeyword/i)
  })

  it('keeps the original H2 when a sections replacement tries to rename it', () => {
    const result = applyEditorialRevision(original, {
      version: 2,
      mode: 'sections',
      sections: [{ heading: 'Eligibility', replacement: '## Process\n\nHold a valid offer and keep the 1624 AUD receipt. See https://immi.homeaffairs.gov.au/visas. Applicants must check official sources.' }],
      appliedIds: ['harper-grammar-deadbeef'],
      waivedIds: [],
    }, { mustApplyIds: ['harper-grammar-deadbeef'] })
    expect(result.content).toMatch(/^## Eligibility$/m)
    expect(result.content).not.toMatch(/^## Process$/m)
  })
})

describe('editorialReportReady uses Harper-actionable SEO', () => {
  it('clears when harperSeo is 100 even if the desk SEO score still includes structural fails', () => {
    expect(editorialReportReady({
      status: 'cleared',
      fingerprint: 'x',
      supervisor: 'harper-editorial-v1',
      grammarErrors: 0,
      seo: 40,
      harperSeo: 100,
      voice: 80,
      flesch: 70,
      fleschTarget: 55,
      reason: 'ok',
    })).toBe(true)
  })

  it('still requires seo === 100 on legacy reports without harperSeo', () => {
    expect(editorialReportReady({
      status: 'cleared',
      fingerprint: 'x',
      supervisor: 'harper-editorial-v1',
      grammarErrors: 0,
      seo: 40,
      voice: 80,
      flesch: 70,
      fleschTarget: 55,
      reason: 'ok',
    })).toBe(false)
  })
})
