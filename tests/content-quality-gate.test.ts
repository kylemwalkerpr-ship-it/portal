/**
 * Voice / tone / human quality gates — unattended ships cannot bypass.
 */
import {
  evaluateContentQuality,
  assertQualityGate,
} from '@/lib/seoFactory/contentQualityGate'
import { auditContent, meetsShipQuality } from '@/lib/seoFactory/audit'

const solidBody = Array.from({ length: 1900 }, (_, i) => `detail${i}`).join(' ')

function guide(bodyExtra: string, opts?: { title?: string; keyword?: string }) {
  const title = opts?.title || 'Student visa documents checklist 2026'
  const kw = opts?.keyword || 'student visa documents'
  return `---
title: ${title}
description: Practical checklist of student visa documents, timelines, and risks with official sources for applicants.
primaryKeyword: ${kw}
robots: index,follow
---

# ${title}

## In 60 seconds
- Confirm the exact form list for your route on the official site
- Gather bank statements and identity documents before you file
- Check processing times so you do not miss a deadline

You need a clear document set before you file. ${bodyExtra}

## Eligibility steps
You confirm which route applies, then you collect evidence that matches the rules on https://www.uscis.gov/ .

## Documents checklist
Passport, financial proof, and school letters usually sit on the list. Verify live requirements.

## Common risks
Missing pages or stale bank statements often delay a case.

## FAQ
### What should you prepare first?
You start with identity documents and the official form list for your category.

### How long does filing take?
Processing times change; check the agency site for the current estimate.

### What if something is missing?
You pause filing until the evidence set is complete rather than guessing.

### Can family members apply with you?
Dependents follow separate rules; read the official page for your route.

## Sources
- https://www.uscis.gov/

This guide is educational only, not legal advice. Consult an attorney for your situation.

${solidBody}
`
}

describe('evaluateContentQuality', () => {
  it('blocks AI slop and outcome promises', () => {
    const bad = guide(
      'In today\'s fast-paced world, we will guarantee your visa approval. Delve into this seamless robust process and leverage our game-changer system!!!',
    )
    const r = evaluateContentQuality({
      content: bad,
      contentType: 'legal_guide',
      primaryKeyword: 'student visa documents',
    })
    expect(r.ok).toBe(false)
    expect(r.blockers.some((b) => b.code === 'ai_slop' || b.code === 'outcome_promise' || b.code === 'hype_tone')).toBe(
      true,
    )
    expect(() =>
      assertQualityGate({
        content: bad,
        contentType: 'legal_guide',
        primaryKeyword: 'student visa documents',
      }),
    ).toThrow(/Ship refused/)
  })

  it('allows a clear disclaimer that rejects outcome guarantees', () => {
    const safe = guide(
      'This guide does not guarantee visa approval. No adviser can guarantee an outcome, so you verify the current rules and prepare evidence carefully.',
    )
    const r = evaluateContentQuality({
      content: safe,
      contentType: 'legal_guide',
      primaryKeyword: 'student visa documents',
    })
    expect(r.blockers.some((b) => b.code === 'outcome_promise')).toBe(false)
  })

  it('passes calm practitioner prose', () => {
    const good = guide(
      'You gather the checklist, confirm each form number, and file only when every item matches the official instructions.',
    )
    const r = evaluateContentQuality({
      content: good,
      contentType: 'legal_guide',
      primaryKeyword: 'student visa documents',
    })
    expect(r.ok).toBe(true)
    expect(r.humanScore).toBeGreaterThanOrEqual(60)
  })

  it('does NOT block factual non-outcome guarantees (housing rates / fee locks)', () => {
    const factual = guide(
      'The university publishes FY27 rates each spring. Rates are guaranteed for the academic year once posted. Security deposits are guaranteed refundable when no damage is found.',
    )
    const r = evaluateContentQuality({
      content: factual,
      contentType: 'legal_guide',
      primaryKeyword: 'student visa documents',
    })
    expect(r.blockers.some((b) => b.code === 'outcome_promise')).toBe(false)
  })

  it('blocks guarantee language only when coupled to an immigration outcome', () => {
    const promised = guide(
      'Our service has a guaranteed approval rate for F-1 applications. We guarantee your visa approval within 30 days.',
    )
    const r = evaluateContentQuality({
      content: promised,
      contentType: 'legal_guide',
      primaryKeyword: 'student visa documents',
    })
    expect(r.blockers.some((b) => b.code === 'outcome_promise')).toBe(true)
  })

  it('catches a promise even when an earlier factual guarantee exists', () => {
    const mixed = guide(
      'Rates are guaranteed for the academic year. Separately, we guarantee your approval for F-1 applications.',
    )
    const r = evaluateContentQuality({
      content: mixed,
      contentType: 'legal_guide',
      primaryKeyword: 'student visa documents',
    })
    expect(r.blockers.some((b) => b.code === 'outcome_promise')).toBe(true)
  })

  it('catches a promise whose outcome word is far from the guarantee word', () => {
    const longPromise = guide(
      'With our decades of experience and careful case preparation, we guarantee that the decision on your application will be favorable to you.',
    )
    const r = evaluateContentQuality({
      content: longPromise,
      contentType: 'legal_guide',
      primaryKeyword: 'student visa documents',
    })
    expect(r.blockers.some((b) => b.code === 'outcome_promise')).toBe(true)
  })

  it('still allows negated outcome mentions inside disclaimers', () => {
    const negated = guide(
      'No attorney or service can guarantee an outcome, and this page does not guarantee visa approval.',
    )
    const r = evaluateContentQuality({
      content: negated,
      contentType: 'legal_guide',
      primaryKeyword: 'student visa documents',
    })
    expect(r.blockers.some((b) => b.code === 'outcome_promise')).toBe(false)
  })

  it('still blocks explicit outcome-certainty phrases not tied to the word guarantee', () => {
    const certain = guide(
      'Choose us for a 100% approval success rate with no risk of refusal on your application.',
    )
    const r = evaluateContentQuality({
      content: certain,
      contentType: 'legal_guide',
      primaryKeyword: 'student visa documents',
    })
    expect(r.blockers.some((b) => b.code === 'outcome_promise')).toBe(true)
  })
})

describe('auditContent surfaces ownership blockers with clear remediation', () => {
  it('blocked_on_supply blocker explains the inventory requirement', () => {
    const audit = auditContent({
      content: guide('You compare the document list against the official checklist.'),
      contentType: 'marketplace_gig',
      primaryKeyword: 'hire immigration attorney f-1',
      indexable: true,
      ownershipBlockers: ['blocked_on_supply: Only ~1 service in category at audit; do not SEO empty shelf'],
    })
    const ob = audit.blockers.find((b) => b.code === 'ownership')
    expect(ob).toBeDefined()
    expect(ob!.fix).toMatch(/≥3 gigs|publishing gigs/i)
  })

  it('merge/301 blocker points to expanding the existing canonical', () => {
    const audit = auditContent({
      content: guide('You verify the official form numbers.'),
      contentType: 'legal_guide',
      primaryKeyword: 'cpt vs opt',
      indexable: true,
      ownershipBlockers: ['Registry says merge for "cpt vs opt" → expand existing canonical'],
    })
    const ob = audit.blockers.find((b) => b.code === 'ownership')
    expect(ob).toBeDefined()
    expect(ob!.fix).toMatch(/expand the existing strategy URL/i)
  })
})

describe('auditContent integrates quality', () => {
  it('meetsShipQuality false when AI voice present even if long', () => {
    const padded = guide(
      'Furthermore, it is important to note that we navigate the complexities and unlock the potential of your application with a holistic seamless approach.',
    )
    const audit = auditContent({
      content: padded,
      contentType: 'legal_guide',
      primaryKeyword: 'student visa documents',
      indexable: true,
    })
    expect(meetsShipQuality(audit)).toBe(false)
    expect(audit.blockers.length).toBeGreaterThan(0)
  })
})
