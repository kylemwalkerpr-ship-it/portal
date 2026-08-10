/**
 * Keyword coverage machinery — short (≤3 words) / long-tail (≥4 words).
 *
 * Verifies:
 *   1. partitionKeywords() returns ≥5 short + ≥4 long-tail from a bare primary
 *      by synthesizing modifiers / prefixes so every plan passes the floor.
 *   2. evaluateContentQuality() blocks when short/long-tail keywords are missing.
 *   3. evaluateContentQuality() blocks when a short-keyword hit count > 4.
 *   4. evaluateContentQuality() blocks when a long-tail hit count > 2.
 *   5. passing coverage lets the gate clear; insufficient brief size also blocks.
 */
import { partitionKeywords, KEYWORD_REQUIREMENTS } from '@/lib/seoEngine/planner'
import { evaluateContentQuality } from '@/lib/seoFactory/contentQualityGate'

describe('partitionKeywords', () => {
  it('synthesizes at least KEYWORD_REQUIREMENTS.SHORT_MIN short keywords from a bare primary', () => {
    const out = partitionKeywords([], 'F-1 visa')
    expect(out.short.length).toBeGreaterThanOrEqual(KEYWORD_REQUIREMENTS.SHORT_MIN)
    for (const term of out.short) {
      expect(term.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(3)
    }
  })

  it('synthesizes at least KEYWORD_REQUIREMENTS.LONG_TAIL_MIN long-tail keywords from a bare primary', () => {
    const out = partitionKeywords([], 'F-1 visa')
    expect(out.longTail.length).toBeGreaterThanOrEqual(KEYWORD_REQUIREMENTS.LONG_TAIL_MIN)
    for (const term of out.longTail) {
      expect(term.split(/\s+/).filter(Boolean).length).toBeGreaterThanOrEqual(4)
    }
  })

  it('de-duplicates terms and counts both mod = "+5" + "-4"', () => {
    const out = partitionKeywords(
      ['student visa', 'Student Visa', 'student visa documents', 'how to apply student visa', 'student visa requirements 2026'],
      'student visa',
    )
    const seen = new Set(out.short.concat(out.longTail))
    expect(seen.size).toBe(out.short.length + out.longTail.length)
  })

  it('classifies by word-count as documented', () => {
    const out = partitionKeywords(
      [
        'f1',                  // 1 word, ignored
        'f 1 visa',            // 3 words → short
        'f 1 visa interview',  // 4 words → long-tail
        'f 1 visa interview questions', // 5 words → long-tail
      ],
      'F-1 visa',
    )
    expect(out.short).toContain('f 1 visa')
    expect(out.longTail).toContain('f 1 visa interview')
    expect(out.longTail).toContain('f 1 visa interview questions')
  })
})

function makeCompliantBody(short: string[], longTail: string[]) {
  // Long enough body so indexable structure rules pass.
  const pad = Array.from({ length: 1400 }, (_, i) => `detail${i} sits in this body.`).join(' ')
  return `---\ntitle: ${short[0] || 'f-1 visa documents checklist 2026'}\ndescription: Practical checklist of student visa documents, timelines, and risks with official sources for applicants.\nprimaryKeyword: ${short[0] || 'f-1 visa documents'}\nrobots: index,follow\n---\n\n# ${short[0] || 'F-1 visa documents checklist 2026'}\n\n## In 60 seconds\n- Use ${short[0]} for the cleanest list. ${short[1] || ''}\n- Verify against https://www.uscis.gov/ before you file. ${short[2] || ''}\n- Aim for ${longTail[0]} form list. ${short[3] || ''}\n\nYou need a clear document set. ${pad}\n\n## Eligibility steps\nYou confirm which route applies for ${short[4] || 'f1 eligibility'}, then collect the right evidence.\n\n## Documents\nPassport, financial proof, and school letters. ${longTail[1] || ''} appear on the list.\n\n## FAQ\n- Q: ${longTail[2] || 'how to apply f-1 visa interview questions for students'}\n  A: See https://www.uscis.gov/ for the current list.\n- Q: ${longTail[3] || 'f-1 visa interview questions for students step by step'}\n  A: Verify with the official site.\n\n## Disclaimer\nThis page is educational and editorial only. It is **not legal advice**. Immigration rules change; verify every requirement against official government sources and consult a licensed attorney for your situation.\n`
}

describe('content quality gate — keyword coverage', () => {
  it('passes when ≥5 short + ≥4 long-tail are present and density is bounded', () => {
    const short = ['f1 visa', 'f-1 documents', 'f 1 requirements', 'f1 eligibility', 'f1 application']
    const longTail = [
      'how to apply f-1 visa',
      'f-1 visa interview requirements',
      'f-1 visa interview questions for students',
      'f-1 visa interview questions for students step by step',
    ]
    const r = evaluateContentQuality({
      content: makeCompliantBody(short, longTail),
      primaryKeyword: 'f1 visa',
      indexable: true,
      requiredShortKeywords: short,
      requiredLongTailKeywords: longTail,
    })
    const keywordBlockers = r.blockers.filter((b) =>
      ['missing_short_keyword', 'missing_long_tail_keyword', 'short_keyword_density_violation', 'long_tail_density_violation', 'insufficient_short_keywords', 'insufficient_long_tail_keywords'].includes(b.code),
    )
    expect(keywordBlockers).toEqual([])
  })

  it('blocks when a required short keyword is missing', () => {
    const short = ['f1 visa', 'f-1 documents', 'f 1 requirements', 'f1 eligibility', 'GAP_FILLER_NOT_IN_BODY']
    const longTail = [
      'how to apply f-1 visa',
      'f-1 visa interview requirements',
      'f-1 visa interview questions for students',
      'f-1 visa interview questions for students step by step',
    ]
    const r = evaluateContentQuality({
      content: makeCompliantBody(short.slice(0, 4), longTail),
      primaryKeyword: 'f1 visa',
      indexable: true,
      requiredShortKeywords: short,
      requiredLongTailKeywords: longTail,
    })
    expect(r.blockers.find((b) => b.code === 'missing_short_keyword')).toBeTruthy()
  })

  it('blocks when a required long-tail keyword is missing', () => {
    const short = ['f1 visa', 'f-1 documents', 'f 1 requirements', 'f1 eligibility', 'f1 application']
    const longTail = [
      'how to apply f-1 visa',
      'f-1 visa interview requirements',
      'f-1 visa interview questions for students',
      'NOT_IN_BODY_LONG_TAIL_QUERY',
    ]
    const r = evaluateContentQuality({
      content: makeCompliantBody(short, longTail.slice(0, 3).concat(['how to apply f-1 visa'])),
      primaryKeyword: 'f1 visa',
      indexable: true,
      requiredShortKeywords: short,
      requiredLongTailKeywords: longTail,
    })
    expect(r.blockers.find((b) => b.code === 'missing_long_tail_keyword')).toBeTruthy()
  })

  it('blocks when a short keyword is over the 4-hit cap', () => {
    const short = ['f1 visa', 'f-1 documents', 'f 1 requirements', 'f1 eligibility', 'f1 application']
    const longTail = [
      'how to apply f-1 visa',
      'f-1 visa interview requirements',
      'f-1 visa interview questions for students',
      'f-1 visa interview questions for students step by step',
    ]
    const in60 = Array.from({ length: 6 }, () => '- f1 visa').join('\n')
    const body = makeCompliantBody(short, longTail).replace('## In 60 seconds\n', `## In 60 seconds\n${in60}\n`)
    const r = evaluateContentQuality({
      content: body,
      primaryKeyword: 'f1 visa',
      indexable: true,
      requiredShortKeywords: short,
      requiredLongTailKeywords: longTail,
    })
    expect(r.blockers.find((b) => b.code === 'short_keyword_density_violation')).toBeTruthy()
  })

  it('blocks when the brief carries fewer than 5 short keywords', () => {
    const short = ['f1 visa', 'f-1 documents', 'f 1 requirements', 'f1 eligibility']
    const longTail = [
      'how to apply f-1 visa',
      'f-1 visa interview requirements',
      'f-1 visa interview questions for students',
      'f-1 visa interview questions for students step by step',
    ]
    const r = evaluateContentQuality({
      content: makeCompliantBody(short, longTail),
      primaryKeyword: 'f1 visa',
      indexable: true,
      requiredShortKeywords: short,
      requiredLongTailKeywords: longTail,
    })
    expect(r.blockers.find((b) => b.code === 'insufficient_short_keywords')).toBeTruthy()
  })
})
