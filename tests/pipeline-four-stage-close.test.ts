/**
 * Pipeline four-stage close — regression test for the GLM 5.3 run that was
 * killed mid-flight (TPM abort). The deterministic repair pass must close
 * the three recurring gate issues on a single run of a deliberately bad
 * draft, without another LLM round-trip:
 *
 *   1. tldr_format_invalid — paragraph TL;DR instead of bullets
 *   2. ahrefs_meta_too_long — 161-char meta description
 *   3. unverified_internal_link — 5 hallucinated /us/fake-* estate links
 *
 * Plus FAQ Path D: bare ### question headings with no JSON-LD must produce
 * a FAQPage schema block.
 */
import { applyDeterministicRepairs } from '../lib/seoFactory/editorialScaffold'
import { evaluateContentQuality } from '../lib/seoFactory/contentQualityGate'
import { metaDescriptionLength } from '../lib/seoFactory/ahrefsIssues'

// 161 characters exactly — one over the Ahrefs ceiling.
const META_161 =
  'Every requirement, fee, timeline and common refusal reason for the F-1 student visa application, written for international students who are applying from India this year.'

describe('pipeline four-stage close — one deterministic pass clears the recurring gates', () => {
  const draft = `---
title: "F-1 Student Visa Guide: Requirements, Costs and Timeline"
description: ${JSON.stringify(META_161)}
region: US
---

# F-1 Student Visa Guide: Requirements, Costs and Timeline

The F-1 visa is the primary student route for international study in the United States. This guide walks through each step of the process.

## In 60 seconds

Apply to a SEVP-certified school first, pay the SEVIS fee before your interview, and bring your I-20 and proof of funding to the consulate. Processing times vary by embassy so book the earliest appointment you can. Never misrepresent your intent to return home after graduation.

## Eligibility

You need an admission offer from a SEVP-certified school before you can apply. See the [F-1 requirements](/us/fake-f1-requirements) and the [funding rules](/us/fake-funding-rules). Many applicants also read our [interview guide](/us/fake-interview-guide) and the [SEVIS fee explainer](/us/fake-sevis-fee) plus the [wait time tracker](/us/fake-wait-times).

## Documents

Gather your I-20, passport, financial evidence and admission letter before scheduling the interview appointment.

## FAQ

### How long does the F-1 visa take?

Processing varies by embassy and season, but booking early avoids the worst delays.

### Can I work on an F-1 visa?

On-campus work is allowed; off-campus work requires authorization such as CPT or OPT.

### What is the SEVIS fee?

A one-time fee paid before the visa interview to register in the student tracking system.

## Sources

- USCIS official guidance
`

  it('fixture actually trips all three gates before repair', () => {
    const before = evaluateContentQuality({
      content: draft,
      contentType: 'legal_guide',
      primaryKeyword: 'f-1 student visa',
      region: 'US',
      indexable: true,
    })
    const codes = new Set(before.findings.map((f) => f.code))
    expect(codes.has('tldr_format_invalid')).toBe(true)
    expect(codes.has('ahrefs_meta_too_long')).toBe(true)
  })

  it('after applyDeterministicRepairs the quality gate has zero of the three codes and FAQPage schema exists', () => {
    const out = applyDeterministicRepairs({
      content: draft,
      title: 'F-1 Student Visa Guide: Requirements, Costs and Timeline',
      primaryKeyword: 'f-1 student visa',
      region: 'US',
      indexable: true,
      contentType: 'legal_guide',
    })

    const TRIPLES = ['tldr_format_invalid', 'ahrefs_meta_too_long', 'unverified_internal_link']
    const quality = evaluateContentQuality({
      content: out.content,
      contentType: 'legal_guide',
      primaryKeyword: 'f-1 student visa',
      region: 'US',
      indexable: true,
    })

    const offenders = quality.findings.filter((f) => TRIPLES.includes(f.code))
    expect(offenders).toHaveLength(0)

    // FAQ Path D: ### questions with no JSON-LD in the source must yield a FAQPage block.
    expect(out.content).toMatch(/"@type"\s*:\s*"FAQPage"/i)

    // TL;DR is bullet-form now, not the original paragraph.
    const tldr = out.content.match(/##\s+In 60 seconds[ \t]*\r?\n([\s\S]*?)(?=\n##\s|$)/i)
    expect(tldr).toBeTruthy()
    expect((tldr![1].match(/^[-*+]\s+\S/gm) || []).length).toBeGreaterThanOrEqual(3)

    // Meta clamped inside the Ahrefs band.
    const desc = out.content.match(/^description:\s*(.+)$/m)
    expect(desc).toBeTruthy()
    expect(metaDescriptionLength(desc![1])).toBeLessThanOrEqual(160)

    // No hallucinated estate-relative links survive.
    expect(out.content).not.toMatch(/\]\(\/us\/fake-/)
  })
})
