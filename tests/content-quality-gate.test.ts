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
