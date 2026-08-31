/**
 * Voice / tone / human quality gates — unattended ships cannot bypass.
 */
import {
  evaluateContentQuality,
  assertQualityGate,
  assertRhythmWithinRepairRange,
} from '@/lib/seoFactory/contentQualityGate'
import { applyDeterministicRepairs } from '@/lib/seoFactory/editorialScaffold'
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
You confirm which route applies, then you collect evidence that matches the rules on [the USCIS official site](https://www.uscis.gov/) .

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
- [USCIS official site](https://www.uscis.gov/)

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

  // 2026-08-13 live-run false positive: GLM 5.2 Fast drafted compliant
  // caveats ("averages, not guarantees", "an average, not a guarantee",
  // "No outcome is ever guaranteed") that the old negation detector missed,
  // hard-blocking shipping on safe prose. All three forms must pass.
  it('allows compliant caveats: "not guarantees" / "not a guarantee" / "No outcome … guaranteed"', () => {
    const safe = guide(
      'You can check current processing times on GOV.UK, but these are averages, not guarantees. ' +
        'For a straightforward application from India this is an average, not a guarantee of a decision date. ' +
        'No outcome is ever guaranteed — an adviser helps you present the strongest application you can. ' +
        'There is no guarantee of approval and every application is decided on its own merits.',
    )
    const r = evaluateContentQuality({
      content: safe,
      contentType: 'legal_guide',
      primaryKeyword: 'dependent visa uk',
    })
    expect(r.blockers.some((b) => b.code === 'outcome_promise')).toBe(false)
  })

  it('still blocks an affirmative promise after a negated clause ("not just help … we guarantee approval")', () => {
    const promised = guide(
      'Our advisers do not just help you gather documents — we guarantee your visa approval within 30 days.',
    )
    const r = evaluateContentQuality({
      content: promised,
      contentType: 'legal_guide',
      primaryKeyword: 'dependent visa uk',
    })
    expect(r.blockers.some((b) => b.code === 'outcome_promise')).toBe(true)
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

  it('flags robotic rhythm across TL;DR list items (bullets count as prose)', () => {
    // The In 60 seconds block repeats the same opener across 5 bullets — the
    // gate must count list items so robotic bullet blocks surface as warnings
    // (and the deterministic smoothSentenceRhythm can clear them).
    const draft = guide('', {
      title: 'UK dependent visa guide 2026',
      keyword: 'uk dependent visa',
    }).replace(
      /## In 60 seconds\n[\s\S]*?\n\nYou need/,
      '## In 60 seconds\n' +
        '- The UK dependent visa allows partners to apply.\n' +
        '- The UK dependent visa requires proof of the relationship.\n' +
        '- The UK dependent visa covers children under 18.\n' +
        '- The UK dependent visa is applied for online.\n' +
        '- The UK dependent visa normally takes three weeks to process.\n\n' +
        'You need',
    )
    const r = evaluateContentQuality({
      content: draft,
      contentType: 'legal_guide',
      primaryKeyword: 'uk dependent visa',
    })
    expect(r.findings.some((f) => f.code === 'sentence_start_repetition')).toBe(true)
    const rhythm = r.findings.find((f) => f.code === 'sentence_start_repetition')
    expect(rhythm?.evidence).toContain('the uk depen')
  })

  it('aggregates a bullet and a prose sentence sharing an opener under one key', () => {
    // 3 bullets + 2 prose sentences all open "The UK dependent visa …" — the
    // marker-stripped key must let them count together (5 total → fires),
    // matching smoothSentenceRhythm's aggregation so the repair can clear it.
    const draft = guide('', {
      title: 'UK dependent visa guide 2026',
      keyword: 'uk dependent visa',
    }).replace(
      /## In 60 seconds\n[\s\S]*?\n\nYou need/,
      '## In 60 seconds\n' +
        '- The UK dependent visa allows partners to apply.\n' +
        '- The UK dependent visa requires proof of the relationship.\n' +
        '- The UK dependent visa covers children under 18.\n\n' +
        'You need a clear document set before you file. The UK dependent visa is applied for online. The UK dependent visa normally takes three weeks to process.',
    )
    const r = evaluateContentQuality({
      content: draft,
      contentType: 'legal_guide',
      primaryKeyword: 'uk dependent visa',
    })
    expect(r.findings.some((f) => f.code === 'sentence_start_repetition')).toBe(true)
  })

  it('does NOT flag a Sources list of official URLs as repeated openings', () => {
    // 2026-08-13 stored-draft scan: gov.uk sources lists shared the
    // "https://www." prefix and falsely fired sentence_start_repetition,
    // even though the deterministic repair could never (and should never)
    // rewrite a citation URL. URL lines are not prose rhythm — excluded.
    const draft = guide('', {
      title: 'UK graduate visa guide 2026',
      keyword: 'uk graduate visa',
    }).replace(
      /## Sources\n- \[USCIS official site\]\(https:\/\/www\.uscis\.gov\/\)/,
      // Anchor text differs per line; the shared "https://www." prefix lives in
      // the URL, which the rhythm scan must ignore.
      '## Sources\n' +
        '- [Graduate visa](https://www.gov.uk/graduate-visa)\n' +
        '- [Immigration Rules Appendix Graduate](https://www.gov.uk/guidance/immigration-rules/immigration-rules-appendix-graduate)\n' +
        '- [Skilled Worker visa](https://www.gov.uk/skilled-worker-visa)\n' +
        '- [Student visa](https://www.gov.uk/student-visa)\n' +
        '- [Check a UK visa](https://www.gov.uk/check-uk-visa)',
    )
    const r = evaluateContentQuality({
      content: draft,
      contentType: 'legal_guide',
      primaryKeyword: 'uk graduate visa',
    })
    expect(r.findings.some((f) => f.code === 'sentence_start_repetition')).toBe(false)
  })

  it('does NOT flag <details>/<summary> collapsible sections as repeated openings', () => {
    // 2026-08 live-run false blocker: the editorial contract wraps deep FAQs
    // in <details><summary> blocks. The gate joined the tag lines into chunks
    // that all began "<details> <summary>" and fired sentence_start_repetition
    // 7×, blocking ship after every AI edit. Tags are structure, not prose
    // rhythm — they must be stripped so only the human text is keyed.
    const qa = [
      ['What documents do you need?', 'You start with the official form list.'],
      ['How long does processing take?', 'Processing varies by service centre.'],
      ['Can dependants apply with you?', 'Dependants follow separate rules.'],
      ['What are the filing fees?', 'Fees are published each spring.'],
      ['When must biometrics be booked?', 'Book biometrics within the deadline.'],
      ['What happens after approval?', 'Approval letters arrive by post.'],
    ]
    const blocks = qa
      .map(([q, a]) => `<details>\n<summary>${q}</summary>\n${a}\n</details>`)
      .join('\n\n')
    const r = evaluateContentQuality({
      content: guide(blocks),
      contentType: 'legal_guide',
      primaryKeyword: 'student visa documents',
    })
    expect(r.findings.some((f) => f.code === 'sentence_start_repetition')).toBe(false)
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

  it('does not false-positive when guarantee and visa word are in separate sentences', () => {
    const separateSentences = guide(
      'This guide guarantees you will understand the process better. Your actual visa result depends on the consular officer alone.',
    )
    const r = evaluateContentQuality({
      content: separateSentences,
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

describe('assertRhythmWithinRepairRange (ship-time rhythm guard)', () => {
  const TAILS = [
    'allows partners to apply for the same stay.',
    'requires proof of the relationship.',
    'covers children under 18.',
    'is applied for online.',
    'normally takes three weeks to process.',
    'does not grant access to public funds.',
    'can be extended from inside the UK.',
    'needs a valid passport and biometrics.',
  ]

  // ≥8 sentences so the gate's rhythm check runs; first sentence varied so
  // the In 60 seconds block opens a different key.
  const rhythmicDraft = (count: number) =>
    `---\ntitle: "UK dependent visa guide 2026"\ncontent_type: article\nprimaryKeyword: uk dependent visa\n---\n\n` +
    `# UK dependent visa guide 2026\n\n` +
    `## In 60 seconds\n` +
    Array.from({ length: count }, (_, i) => `- The UK dependent visa ${TAILS[i % TAILS.length]}`).join('\n') +
    `\n\nYou need a clear document set before you file. Processing times change and you verify the current rules on the official site before applying. Supporting evidence must match the application. Check the official guidance before you submit anything.`

  it('passes when the deterministic repair cleared the rhythm (moderate repetition)', () => {
    // 5× bullets: the repair rewrites 4, leaving one — clears the warning.
    const draft = rhythmicDraft(5)
    const repaired = applyDeterministicRepairs({
      content: draft,
      contentType: 'article',
      primaryKeyword: 'uk dependent visa',
      title: 'UK dependent visa guide 2026',
    })
    const after = evaluateContentQuality({ content: repaired.content, contentType: 'article', primaryKeyword: 'uk dependent visa' })
    expect(after.findings.some((f) => f.code === 'sentence_start_repetition')).toBe(false)
    // Guard on the repaired content must NOT throw.
    expect(() =>
      assertRhythmWithinRepairRange({ content: repaired.content, contentType: 'article', primaryKeyword: 'uk dependent visa' }),
    ).not.toThrow()
  })

  it('iterative rhythm repair clears even extreme repetition (26×)', () => {
    // 26× bullets: the iterative smoothSentenceRhythm loop runs multiple
    // passes with rotating adverbials, clearing even extreme repetition.
    const draft = rhythmicDraft(26)
    const repaired = applyDeterministicRepairs({
      content: draft,
      contentType: 'article',
      primaryKeyword: 'uk dependent visa',
      title: 'UK dependent visa guide 2026',
    })
    const after = evaluateContentQuality({ content: repaired.content, contentType: 'article', primaryKeyword: 'uk dependent visa' })
    expect(after.findings.some((f) => f.code === 'sentence_start_repetition')).toBe(false)
    // Guard on the repaired content must NOT throw.
    expect(() =>
      assertRhythmWithinRepairRange({ content: repaired.content, contentType: 'article', primaryKeyword: 'uk dependent visa' }),
    ).not.toThrow()
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
