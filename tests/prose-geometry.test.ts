/**
 * Model-free prose geometry: burstiness, trigram variety, cohesion holds.
 * No scorer LLM. Guides may be flatter than blogs. Severe adjacent-H2
 * overlap is the only ship hold.
 */
import {
  coefficientOfVariation,
  evaluateProseGeometry,
  proseSentenceWordCounts,
  trigramUniqueRatio,
} from '@/lib/seoFactory/proseGeometry'
import { evaluateContentQuality } from '@/lib/seoFactory/contentQualityGate'
import { isHarperProseFinding } from '@/lib/seoFactory/harperLane'

const MILL =
  'Applicants must confirm the current student visa documents rule on the official government site before they file the petition and they must gather identity evidence that matches those instructions without relying on a forum checklist from last year.'

function millGuide(opts?: { faqHeading?: string; extra?: string }): string {
  const faqQ = opts?.faqHeading || 'What should you prepare first?'
  return `---
title: Student visa documents checklist 2026
description: Practical checklist of student visa documents with official sources.
primaryKeyword: student visa documents
---

# Student visa documents checklist 2026

## In 60 seconds
- Confirm the exact form list on the official site
- Gather bank statements before you file
- Check processing times so you do not miss a deadline

You need a clear document set before you file.

## Eligibility
${MILL}

## Documents
${MILL}

${opts?.extra || ''}

## FAQ
### ${faqQ}
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
`
}

describe('coefficientOfVariation / sentence band', () => {
  it('is ~0 for identical lengths and high when short and long mix', () => {
    expect(coefficientOfVariation([12, 12, 12, 12, 12, 12])).toBeLessThan(0.05)
    expect(coefficientOfVariation([5, 6, 28, 7, 22, 9, 31, 8])).toBeGreaterThan(0.5)
  })

  it('ignores packing blobs over 60 words', () => {
    const blob = Array.from({ length: 80 }, (_, i) => `detail${i}`).join(' ')
    const counts = proseSentenceWordCounts(`You file now. ${blob}. Short next.`)
    expect(counts.every((n) => n <= 60)).toBe(true)
  })
})

describe('trigramUniqueRatio', () => {
  it('drops when the same three-word loop is pasted', () => {
    const loop = 'confirm the current rule on the official site before you file. '.repeat(24)
    const { ratio, tokens } = trigramUniqueRatio(loop)
    expect(tokens).toBeGreaterThanOrEqual(200)
    expect(ratio).toBeLessThan(0.2)
  })
})

describe('evaluateProseGeometry — cohesion hold', () => {
  it('blocks adjacent H2s that are mill-glued copies', () => {
    const r = evaluateProseGeometry(millGuide(), { contentType: 'legal_guide', indexable: true })
    expect(r.findings.some((f) => f.code === 'adjacent_section_overlap_severe' && f.severity === 'blocker')).toBe(true)
  })

  it('warns when a FAQ question restates an H2', () => {
    const r = evaluateProseGeometry(millGuide({ faqHeading: 'Documents' }), {
      contentType: 'legal_guide',
      indexable: true,
    })
    expect(r.findings.some((f) => f.code === 'faq_duplicates_h2')).toBe(true)
  })

  it('warns on uniform mill sentence length (guide floor 0.16)', () => {
    const verbs = [
      'Submit', 'Record', 'Compare', 'Replace', 'Collect', 'Verify', 'Attach', 'Review',
      'Store', 'Update', 'Print', 'Scan', 'Label', 'Date', 'Seal', 'File',
    ]
    const uniform = verbs
      .map((v) => `${v} the supporting evidence packet before the consular window closes today.`)
      .join(' ')
    const r = evaluateProseGeometry(`# Guide\n\n${uniform}\n`, { contentType: 'legal_guide', indexable: true })
    expect(r.sentenceCount).toBeGreaterThanOrEqual(12)
    expect(r.burstinessCv).toBeLessThan(0.16)
    expect(r.findings.some((f) => f.code === 'low_sentence_burstiness')).toBe(true)
  })

  it('uses a stricter burstiness floor on blogs than on guides', () => {
    const mixed = [
      'You file when the list matches.',
      'Officers then compare each dated artefact against the live instruction rather than a printout.',
      'Keep the passport current.',
      'Bank windows, school letters, and identity pages expire on different clocks that you have to track yourself.',
      'Stop collecting extras.',
      'A stale forum PDF is not a substitute for the issuing agency page you opened this morning.',
      'Write the form numbers down.',
      'Treat every supporting letter as a dated object with its own replacement rule before the interview.',
      'File the packet.',
      'The next action is a receipt you keep until the decision lands in the portal.',
      'Check the fee.',
      'Processing estimates move with the season so you verify them the week you actually submit.',
    ].join(' ')
    const blog = evaluateProseGeometry(`# Essay\n\n${mixed}\n`, { contentType: 'blog_post', indexable: true })
    const guide = evaluateProseGeometry(`# Guide\n\n${mixed}\n`, { contentType: 'legal_guide', indexable: true })
    expect(blog.burstinessCv).toBeGreaterThan(0.16)
    expect(guide.findings.some((f) => f.code === 'low_sentence_burstiness')).toBe(false)
  })

  it('does not evaluate non-indexable drafts', () => {
    const r = evaluateProseGeometry(millGuide(), { contentType: 'legal_guide', indexable: false })
    expect(r.findings).toEqual([])
  })
})

describe('evaluateContentQuality wires geometry into Audit', () => {
  it('ships a hold for mill-glued adjacent H2s', () => {
    const r = evaluateContentQuality({
      content: millGuide(),
      contentType: 'legal_guide',
      primaryKeyword: 'student visa documents',
      indexable: true,
    })
    expect(r.blockers.some((b) => b.code === 'adjacent_section_overlap_severe')).toBe(true)
    expect(r.ok).toBe(false)
  })

  it('allows a developed 5-sentence paragraph on a legal guide (no 180-char chop)', () => {
    const process =
      'When you start a student visa file you already know the form list will change, so you treat the official page as the source of truth. Passport validity, bank-statement windows, and school letters all sit on that list. Each one has a different expiry logic that you check against live instructions. You write the current form numbers into your checklist. A stale PDF from a forum thread is not a substitute for the issuing agency.'
    const risks =
      'Missing pages delay a case more often than a late fee. Officers compare dates, not intentions, and a bank window that closed last month will not cover a file you submit today. Replace expired letters before the interview. Keep a receipt. File only when every named artefact is current.'
    const content = millGuide({ extra: `## Process\n${process}\n\n## Risks\n${risks}\n` })
      .replace(MILL, 'Eligibility depends on a valid passport, a school offer, and funds that match the live list.')
      .replace(MILL, 'Keep identity pages, bank windows, and school letters in one dated folder.')
    const r = evaluateContentQuality({
      content,
      contentType: 'legal_guide',
      primaryKeyword: 'student visa documents',
      indexable: true,
    })
    expect(r.warnings.some((w) => w.code === 'wall_of_text')).toBe(false)
    expect(r.blockers.some((b) => b.code === 'adjacent_section_overlap_severe')).toBe(false)
  })

  it('lets Harper rewrite geometry findings in existing prose', () => {
    expect(isHarperProseFinding('adjacent_section_overlap_severe')).toBe(true)
    expect(isHarperProseFinding('low_sentence_burstiness')).toBe(true)
    expect(isHarperProseFinding('low_trigram_variety')).toBe(true)
    expect(isHarperProseFinding('faq_duplicates_h2')).toBe(true)
  })
})
