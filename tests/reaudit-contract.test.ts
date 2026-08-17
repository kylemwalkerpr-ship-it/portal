/**
 * Unit tests for the extracted re-audit response contract.
 *
 * `evaluateReauditContract` is the pure core of the POST + PATCH handlers in
 * app/api/content-studio/reaudit/route.ts — it runs the quality gate, locates
 * inline annotations, merges quality + audit warnings, applies the Google
 * depth gate, and computes shipReady. Testing it directly (no route, no AI,
 * no DB) locks in the exact response shape the editor renders:
 *
 *   warningsData merge   quality + audit warnings, deduped, quality preferred
 *   shipReady            quality.ok && depthGate.ok — warnings never block
 *   depthGate            reports the true blocker ("100/100 but depth-blocked")
 *   annotations          every blocker + warning gets a fixable inline anchor
 */

import { evaluateReauditContract, checkDepthGate, capAnnotations, depthMediationPlan } from '@/lib/seoFactory/reauditContract'
import type { InlineAnnotation } from '@/lib/seoFactory/inlineAnnotations'
import { countBodyWords } from '@/lib/seoFactory/contentDepth'

function ann(code: string, n = 1): InlineAnnotation[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${code}-${i}`, line: 1, col: 1, endLine: 1, endCol: 1, length: 0,
    severity: 'warning', code, message: code, fix: 'fix', highlightedText: '',
  }))
}

const DISCLAIMER = 'This guide is for educational purposes only and does not constitute legal advice.'

/** Sentence-opener bank for the fixture generator. The repetition detector
 *  keys on the first 12 chars of each sentence and blocks at ≥7 repeats, so
 *  every opener has a distinct 12-char prefix and the generator picks openers
 *  with a step coprime to the bank length — no opener can exceed 4 uses across
 *  the largest fixture (well under the 5-warning / 7-blocker thresholds). */
const OPENERS = [
  'Applicants should first', 'The department publishes', 'Each visa category',
  'Your documents must', 'Processing starts once', 'A complete package',
  'Refusal letters explain', 'Applicants who appeal', 'Fees vary by',
  'The online portal', 'Officers look for', 'Many applicants miss',
  'Check the expiry date', 'Translations should be', 'Biometric slots fill',
  'Contact the authority', 'Read the refusal notice', 'Renewals begin early',
  'Evidence of support', 'Interview questions cover', 'Passport validity matters',
  'The application form', 'Country specific rules', 'Dependants follow different',
  'Financial proof must', 'Copies of originals', 'The reference number',
  'Tracking is available', 'Decision letters arrive', 'Appeals have deadlines',
  'New rules take effect', 'The fee schedule shows', 'Sponsors need to',
  'Work permits link', 'Family applications include', 'Officers may request',
  'Additional information speeds', 'The checklist helps', 'Every page needs',
  'Dates must match', 'Signatures are required', 'Waiting times vary',
  'Preparing the application takes', 'The case officer considers',
  'Applicants should always verify', 'Photographs must meet',
  'Employers often need to', 'Schools require proof',
  'The embassy schedules interviews', 'Reasons for refusal include',
  'Applicants can sometimes', 'The process normally takes',
  'Officers check the dates', 'Extra evidence may be',
  'Travellers should carry', 'The guidance covers',
  'Applicants with dependants', 'Medical checks are',
  'Previous refusals are', 'The decision is based',
  'Renewal paperwork includes', 'Fees are paid',
  'Applicants must attend', 'The timeline depends on',
  'Evidence is checked against', 'The form asks for',
]

/** Distinct filler clauses — combined with the opener bank they produce
 *  thousands of distinct sentences, so the fixture reads like real prose.
 *  Tails reuse freely (the detector keys on openings, not endings). */
const TAILS = [
  'before any documents are submitted',
  'according to the official guidance published on the government website',
  'when the application package is complete and correctly signed',
  'after the fee is paid and the biometric appointment is booked',
  'unless a specific exception applies to your personal situation',
  'while the department reviews the evidence that was provided',
  'as soon as the reference number is issued after submission',
  'if the officer decides that the requirements have been met',
  'before the current permission expires and a gap appears in the record',
  'with the correct forms downloaded from the official portal',
  'because outdated information leads to avoidable mistakes',
  'so that the case is assessed on its own merits',
  'when supporting evidence clearly matches the answers on the form',
  'even though published processing times change without notice',
  'unless the applicant provides certified translations for every document',
  'after the decision letter arrives and any appeal window is noted',
  'if the applicant keeps certified copies of everything submitted',
  'before travel dates are confirmed with the employer or school',
  'while the file is assigned to an officer for assessment',
  'when the applicant responds quickly to any request for more information',
]

/** Global sentence counter — strictly increasing, so every sentence in the
 *  document is unique. Openers step by 5 (coprime with the 64-entry bank) and
 *  tails by 3 (coprime with 20), so no opener is reused within a paragraph
 *  and no full sentence is ever emitted twice. */
let sentenceCounter = 0

/** Build one paragraph of N globally-unique sentences. */
function buildParagraph(sentenceCount = 6): string {
  return Array.from({ length: sentenceCount }, () => {
    const opener = OPENERS[(sentenceCounter * 5) % OPENERS.length]
    const tail = TAILS[(sentenceCounter * 3) % TAILS.length]
    sentenceCounter += 1
    return `${opener} ${tail}.`
  }).join(' ')
}

/** Full guide: 8 sections × 4 paragraphs × 6 sentences ≈ 2400 body words
 *  (within the 2200–2800 pillar band). */
const SECTIONS: Array<{ h2: string }> = [
  { h2: 'Eligibility' },
  { h2: 'Required documents' },
  { h2: 'Filing steps' },
  { h2: 'Processing times' },
  { h2: 'Common mistakes' },
  { h2: 'Risks and refusals' },
  { h2: 'After you file' },
  { h2: 'Official resources' },
]

/** Build a legal guide that clears the quality gate AND the Google depth floor
 *  (≥2200 body words). `keep` trims sections for the thin variant, which keeps
 *  ALL structural elements (4+ H2s, FAQ, TL;DR, sources, disclaimer) but drops
 *  under the depth floor. */
function buildPassingArticle(keep = SECTIONS.length): string {
  sentenceCounter = 0
  const sections = SECTIONS.slice(0, keep)
  const body = sections
    .map((s) => `## ${s.h2}\n\n${[0, 1, 2, 3].map(() => buildParagraph()).join('\n\n')}`)
    .join('\n\n')
  return `---
title: US visa renewal guide for 2026 applicants
description: Complete guide to renewing your US visa with eligibility, documents, steps, timelines, and official sources.
primaryKeyword: us visa renewal
canonicalUrl: https://legal.yousafeconsultancy.com/us/visa-renewal/
ogImage: /og-image.png
robots: index,follow
---

# US visa renewal guide for 2026 applicants

## In 60 seconds
- Check which visa category applies to your situation
- Gather passport, proof of identity, and supporting documents
- File before your current visa expires and keep your reference number

Official guidance, forms, and fee schedules are published at uscis.gov for US cases and at the equivalent authority for other jurisdictions, so always verify the current position against the official source before you act.

${body}

## FAQ

### Can I renew before my current visa expires?
Yes, and you should. Most categories allow you to apply before the expiry date, and starting early protects you if processing takes longer than expected. Check the specific rules for your visa type on the official website.

### What happens if my application is refused?
The refusal notice explains the reasons for the decision. Depending on the category, you may be able to request an administrative review, appeal, or submit a new application with stronger evidence. Each case is assessed on its own merits.

### Do I need a lawyer to apply?
No, but professional advice can help when your circumstances are complex or a previous application was refused. A qualified immigration professional can review your documents and point out risks before you file.

---

${DISCLAIMER}
`
}

describe('evaluateReauditContract — response contract', () => {
  it('returns shipReady=true only when BOTH quality and depth gates pass', () => {
    const full = buildPassingArticle()
    expect(countBodyWords(full)).toBeGreaterThanOrEqual(2200)

    const result = evaluateReauditContract({
      content: full,
      contentType: 'legal_guide',
      primaryKeyword: 'us visa renewal',
      indexable: true,
    })

    expect(result.ok).toBe(true)
    expect(result.depthGate).toEqual({ ok: true, message: 'Depth floor met' })
    expect(result.shipReady).toBe(true)
    expect(result.blockers).toBe(0)
    expect(result.blockersData).toEqual([])
  })

  it('reports depthGate=false and shipReady=false for thin content even when the quality gate passes', () => {
    // Same article but with only the first 3 sections — keeps ALL structural
    // elements (4+ H2s, FAQ, TL;DR, sources, disclaimer) so quality passes,
    // but lands under the 2200-word legal-guide depth floor. This is the exact
    // "100/100 but ship refused" failure mode the editor must surface.
    const thin = buildPassingArticle(3)

    const result = evaluateReauditContract({
      content: thin,
      contentType: 'legal_guide',
      primaryKeyword: 'us visa renewal',
      indexable: true,
    })

    expect(countBodyWords(thin)).toBeLessThan(2200)
    expect(result.depthGate.ok).toBe(false)
    expect(result.depthGate.message).toMatch(/Google|depth|Below|min/i)
    // Quality is clean (no tone/voice/compliance blockers) but depth blocks ship.
    expect(result.ok).toBe(true)
    expect(result.shipReady).toBe(false)
  })

  it('carries quality-gate AND audit warnings into warningsData with zero code duplicates', () => {
    // Draft with a quality warning (tone_whilst) plus audit indexability
    // warnings (schema_article, meta_description, ai_answer_block…). The merge
    // must surface BOTH families so every warning is AI-fixable in the editor.
    const blog = `---
title: US visa update guide for 2026 applicants
description: ${'A concrete meta description with enough characters to hit the audit band for this test case. '.repeat(2).trim()}
primaryKeyword: us visa update
canonicalUrl: https://legal.yousafeconsultancy.com/us/visa-update/
ogImage: /og-image.png
robots: index,follow
---

# US visa update guide for 2026 applicants

## In 60 seconds
- Check the current official guidance at uscis.gov
- Confirm which category applies before filing

${Array.from(
  { length: 8 },
  (_, i) => `## Section ${i + 1}

The official guidance at uscis.gov explains the eligibility criteria that apply to this category. Applicants should review the current requirements carefully whilst preparing documentation, because the rules change frequently and outdated information can cause costly mistakes. Gather a valid passport, proof of identity, and supporting documents, and consult a qualified immigration professional when your circumstances are complex. No outcome is ever guaranteed and each case is assessed on its own merits.`,
).join('\n\n')}

---

${DISCLAIMER}
`

    const result = evaluateReauditContract({
      content: blog,
      contentType: 'blog_summary',
      primaryKeyword: 'us visa update',
      indexable: true,
    })

    const codes = result.warningsData.map((w) => w.code)
    // Quality-gate family (voice/tone) surfaces…
    expect(codes).toContain('tone_whilst')
    // …alongside audit indexability family.
    expect(codes).toContain('schema_article')
    expect(codes).toContain('meta_description')
    // Zero duplicate codes — merge is code-keyed; count agrees with the array.
    expect(new Set(codes).size).toBe(codes.length)
    expect(result.warnings).toBe(result.warningsData.length)

    // Audit-only warnings are ALSO annotated, so the issues panel shows a
    // per-warning AI Fix button for each (not just the Fix-all sweep). The
    // cap must never starve a distinct code — even when a blocker fans out
    // many repeat annotations.
    const auditAnnCodes = result.annotations
      .filter((a) => a.severity === 'warning')
      .map((a) => a.code)
    expect(auditAnnCodes).toContain('meta_description')
    expect(auditAnnCodes).toContain('schema_article')
    expect(auditAnnCodes).toContain('internal_links')
    for (const code of ['meta_description', 'schema_article', 'internal_links']) {
      const a = result.annotations.find((x) => x.code === code)
      // Every audit-warning annotation carries remediation + an anchor.
      expect(a).toBeDefined()
      expect(a!.fix.length).toBeGreaterThan(0)
      expect(a!.line).toBeGreaterThan(0)
    }
  })

  it('lists every quality blocker in blockersData with a fix so the editor can resolve it', () => {
    const short = `---
title: Hi
description: Too short
---

# Hi

A sentence.
`
    const result = evaluateReauditContract({
      content: short,
      contentType: 'legal_guide',
      primaryKeyword: 'student visa',
      indexable: true,
    })
    expect(result.ok).toBe(false)
    expect(result.blockersData.length).toBeGreaterThan(0)
    expect(result.blockersData.every((b) => b.code && b.message && b.fix)).toBe(true)
    expect(result.annotations.some((a) => a.severity === 'blocker')).toBe(true)
  })

  it('locates inline annotations for blockers and evidence-less warnings', () => {
    const draft = `---
title: Guaranteed Visa Approval
description: ${'A concrete meta description with enough characters to hit the audit band for this test case. '.repeat(2).trim()}
primaryKeyword: visa approval
robots: index,follow
---

# Guaranteed Visa Approval

## In 60 seconds
- Get approved fast with our exclusive insider route
- Guaranteed visa approval within 30 days

## The promise
We guarantee your visa approval. Our team ensures you will be approved no matter what. We promise success and a guaranteed visa outcome.

---

${DISCLAIMER}
`

    const result = evaluateReauditContract({
      content: draft,
      contentType: 'legal_guide',
      primaryKeyword: 'visa approval',
      indexable: true,
    })

    // Outcome-promise language is a hard blocker → annotation present.
    expect(result.blockers).toBeGreaterThan(0)
    expect(result.shipReady).toBe(false)
    expect(result.annotations.length).toBeGreaterThan(0)
    expect(result.annotations.some((a) => a.severity === 'blocker')).toBe(true)
    // Every annotation is anchored inside the draft.
    for (const a of result.annotations) {
      expect(a.line).toBeGreaterThan(0)
      expect(a.fix.length).toBeGreaterThan(0)
    }
  })

  it('non-indexable drafts are not forced through the YMYL disclaimer blocker', () => {
    const gig = `---
title: Visa Document Review Gig
description: ${'A concrete meta description with enough characters to hit the audit band for this test case. '.repeat(2).trim()}
primaryKeyword: visa document review
robots: noindex,follow
---

# Visa Document Review Gig

## What you get
A careful review of your visa documents with clear, practical feedback on missing items and common errors. Every application is assessed on its own merits and the outcome can never be known in advance.

## How it works
Send your documents, receive a detailed review within 48 hours, and get a checklist of anything you need to correct before filing. This service is for document feedback only.

## What we check
Passports, proof of identity, supporting letters, and translations are reviewed against the official guidance published at uscis.gov. Each document is checked for validity, consistency of names, and completeness of the information an officer is likely to examine.

## Common errors we catch
Expired passports, mismatched names between forms, missing translations, and unsupported financial claims are the most frequent problems. The review flags each issue with a plain-language explanation of why it matters and how to fix it before you file.

## Turnaround and format
Feedback arrives within 48 hours as a clear checklist with line references. You keep full control of your application and decide what to change; the reviewer never submits anything on your behalf.

## What counts as a complete package
A complete package pairs every claim on the form with a matching piece of evidence. Income claims need bank statements or payslips, employment needs a letter on headed paper, and family relationships need civil documents such as a marriage certificate or birth certificate. Where a document is in another language, a certified translation is required alongside it.

## How the review is delivered
Each finding is listed with the exact section of the document it refers to and a suggested correction. You receive a summary page and a detailed line-by-line report, and you can ask one follow-up round of questions after delivery at no extra cost.

## Who this is for
The service suits applicants preparing a visa application for the first time, students renewing a study permit, and families sponsoring relatives. It is also useful when a previous application was refused and you want a second pair of eyes on the corrected package before you reapply. The reviewer works with the documents you have and does not assume any particular case type.

## What we do not do
The reviewer does not draft your forms, contact the government on your behalf, or advise on which visa category to choose. Those steps are yours to complete, and a qualified immigration professional is the right person to ask for legal advice about your specific circumstances.

## What happens next
After you place the order, you upload your documents through the secure portal. The reviewer confirms receipt, completes the review within 48 hours, and delivers the report with a checklist of recommended corrections. You keep full control of your application and decide what to change; the reviewer never submits anything on your behalf.

## FAQ
### Is this legal advice?
No. The service is a document review for completeness and consistency. A qualified immigration professional can provide legal advice about your specific case.
### Will you file for me?
No, the reviewer does not file anything. You receive feedback and make your own decisions about what to submit.
`

    const result = evaluateReauditContract({
      content: gig,
      contentType: 'marketplace_gig',
      primaryKeyword: 'visa document review',
      indexable: false,
    })

    // Gig tier (min 500 words) + indexable=false → no disclaimer blocker, no
    // depth blocker; a clean contract.
    expect(result.ok).toBe(true)
    expect(result.depthGate.ok).toBe(true)
    expect(result.shipReady).toBe(true)
  })
})

describe('capAnnotations (payload bound that never starves a finding code)', () => {
  it('keeps every distinct code even when one code floods past the cap', () => {
    // outcome_promise-style flood: 40 repeats of one code + 3 singleton audit
    // codes appended after it. The cap must keep all 4 distinct codes.
    const list = [...ann('outcome_promise', 40), ...ann('meta_description'), ...ann('schema_article'), ...ann('internal_links')]
    const capped = capAnnotations(list, 20)
    const codes = new Set(capped.map((a) => a.code))
    expect(codes).toEqual(new Set(['outcome_promise', 'meta_description', 'schema_article', 'internal_links']))
  })

  it('caps repeat annotations per code so the panel stays scannable', () => {
    const list = [...ann('outcome_promise', 40), ...ann('meta_description'), ...ann('schema_article'), ...ann('internal_links')]
    const capped = capAnnotations(list, 60)
    // 4 distinct + at most 3 total per code → 1 + 2 extra repeats + 3 singles.
    const perCode = new Map<string, number>()
    for (const a of capped) perCode.set(a.code, (perCode.get(a.code) || 0) + 1)
    expect(perCode.get('outcome_promise')).toBe(3)
    expect(perCode.get('meta_description')).toBe(1)
    expect(capped.length).toBe(6)
  })

  it('keeps all distinct codes when they alone exceed the cap (soft bound)', () => {
    const list = [...ann('a'), ...ann('b'), ...ann('c'), ...ann('d')]
    const capped = capAnnotations(list, 2)
    expect(capped.length).toBe(4) // never below the distinct count
  })
})

describe('checkDepthGate (extracted shared depth gate)', () => {
  it('returns ok=true when the floor is met and a friendly message when not', () => {
    expect(checkDepthGate(buildPassingArticle(), 'legal_guide', true)).toEqual({
      ok: true,
      message: 'Depth floor met',
    })
    const blocked = checkDepthGate('## Short\n\nOnly a few words here.', 'legal_guide', true)
    expect(blocked.ok).toBe(false)
    expect(blocked.message.length).toBeGreaterThan(10)
  })
})

describe('depthMediationPlan (the mechanism that clears the depth floor)', () => {
  it('is included in the re-audit contract so the editor can show the deficit', () => {
    const thin = buildPassingArticle(3)
    const result = evaluateReauditContract({
      content: thin,
      contentType: 'legal_guide',
      primaryKeyword: 'us visa renewal',
      indexable: true,
    })
    expect(result.depthMediation).toBeDefined()
    expect(result.depthMediation!.ok).toBe(false)
    expect(result.depthMediation!.deficit).toBeGreaterThan(0)
    // The exact "1813/2200" case the editor strip renders.
    expect(result.depthMediation!.currentWords).toBe(countBodyWords(thin))
    expect(result.depthMediation!.minWords).toBe(2200)
    expect(result.depthMediation!.targetWords).toBe(2500)
    expect(result.depthMediation!.maxWords).toBe(2800)
    expect(result.depthMediation!.prompt).toBeTruthy()
    // Message matches the ship-gate banner text so the UI stays consistent.
    expect(result.depthMediation!.message).toContain('Below Google-depth floor')
    expect(result.depthMediation!.message).toContain('Append-only expansion')
  })

  it('returns ok=true with no prompt when the draft already meets the target', () => {
    const full = buildPassingArticle()
    const plan = depthMediationPlan(full, 'legal_guide', 'us visa renewal')
    expect(plan.ok).toBe(true)
    expect(plan.deficit).toBe(0)
    expect(plan.prompt).toBeUndefined()
    expect(plan.floorMet).toBe(true)
    expect(plan.goalWords).toBe(plan.targetWords)
    expect(plan.message).toBe('Depth target met')
  })

  it('expands toward the TARGET (not just the floor) when the draft meets the floor but sits under target — the word_count_target warning case', () => {
    // Full fixture is ~2683 words (≥ target 2500); trim sections to land a
    // draft INSIDE the 2200–2500 band so the floor passes but the target
    // warning fires (the exact "2380/2500" case the user reported).
    const between = buildPassingArticle()
    // Crop one section (~340 words) → ≈2340 words, still ≥ 2200 floor.
    const cropped = between.replace(/## Common mistakes[\s\S]*?(?=## |$)/, '')
    const plan = depthMediationPlan(cropped, 'legal_guide', 'us visa renewal', 'US')
    expect(plan.floorMet).toBe(true)      // floor clears
    expect(plan.ok).toBe(false)           // …but the plan says there is depth to add
    expect(plan.goalWords).toBe(2500)     // goal is the target, not the floor
    expect(plan.deficit).toBeGreaterThan(0)
    expect(plan.deficit).toBeLessThan(2500 - 2200)
    expect(plan.prompt).toBeTruthy()
    // Prompt demands enough words to clear the TARGET, and lists it.
    expect(plan.prompt).toContain('2500')
    expect(plan.message).toContain('under target')
    expect(plan.message).toContain('Append-only expansion')
  })

  it('returns ok=true with no prompt when the draft already meets the floor', () => {
    const full = buildPassingArticle()
    const plan = depthMediationPlan(full, 'legal_guide', 'us visa renewal')
    expect(plan.floorMet).toBe(true)
    expect(plan.ok).toBe(true)
    expect(plan.deficit).toBe(0)
    expect(plan.prompt).toBeUndefined()
  })

  it('builds an append-only expansion prompt that preserves existing sections', () => {
    const thin = buildPassingArticle(3)
    const plan = depthMediationPlan(thin, 'legal_guide', 'us visa renewal', 'US')
    expect(plan.ok).toBe(false)
    const prompt = plan.prompt || ''
    expect(prompt).toMatch(/APPEND SECTIONS ONLY \(depth rescue\)/)
    expect(prompt).toMatch(/Return ONLY new markdown H2 sections/)
    // The prompt carries the real floor/cap + the region for jurisdictional detail.
    expect(prompt).toContain('2200')
    expect(prompt).toContain('2800')
    expect(prompt).toContain('US')
    // Existing H2s are listed so the model does not duplicate them.
    expect(prompt).toContain('Eligibility')
  })

  it('uses the correct floor per content type (blog 800, regional 1200)', () => {
    const blog = buildPassingArticle(2)
    const blogPlan = depthMediationPlan(blog, 'blog_post', 'us visa update')
    expect(blogPlan.minWords).toBe(800)
    expect(blogPlan.targetWords).toBe(1200)
    expect(blogPlan.maxWords).toBe(1500)

    const regional = depthMediationPlan(blog, 'regional_page', 'texas visa')
    expect(regional.minWords).toBe(1200)
    expect(regional.targetWords).toBe(1500)
    expect(regional.maxWords).toBe(2000)
  })
})
