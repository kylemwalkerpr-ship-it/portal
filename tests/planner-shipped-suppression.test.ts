/**
 * Published-topic suppression in the planner.
 *
 * A topic taken all the way to a live article must not keep surfacing as a
 * fresh opportunity: exact stem matches drop off the plan; partial overlaps
 * sink to minimal priority. Ubersuggest market-volume signals carry a
 * deliberate scoring edge over equal GSC-only signals.
 */
import { buildShippedStems, shippedOverlap } from '../lib/seoEngine/shippedCoverage'
import type { ShippedPage } from '../lib/seoEngine/shippedCoverage'

const pages: ShippedPage[] = [
  {
    url: 'https://legal.yousafeconsultancy.com/us/student-visas/f1-visa-interview-questions-2026/',
    title: 'F-1 Visa Interview Questions (2026)',
    primaryKeyword: 'f-1 visa interview questions',
    status: 'merged',
  },
  {
    url: 'https://legal.yousafeconsultancy.com/ca/study-permit-document-checklist/',
    title: 'Canada Study Permit Document Checklist',
    primaryKeyword: 'canada study permit document checklist',
    status: 'merged',
  },
]

describe('buildShippedStems', () => {
  it('stems primary keyword, title, and URL slug words', () => {
    const stems = buildShippedStems(pages)
    expect(stems.has('f-1 visa interview questions')).toBe(true)
    // slug words: f1 visa interview questions 2026 (normalized)
    expect(stems.has('f1 visa interview questions 2026')).toBe(true)
    expect(stems.has('canada study permit document checklist')).toBe(true)
  })

  it('handles pages with no url', () => {
    const stems = buildShippedStems([{ url: '', title: 'OPT Guide', primaryKeyword: null, status: 'merged' }])
    expect(stems.has('opt guide')).toBe(true)
    expect(stems.size).toBe(1)
  })
})

describe('shippedOverlap', () => {
  const stems = buildShippedStems(pages)

  it('matches an exact stem', () => {
    expect(shippedOverlap('F-1 visa interview questions', stems)).toBe('f-1 visa interview questions')
  })

  it('matches a shipped stem contained in a longer candidate', () => {
    expect(shippedOverlap('f-1 visa interview questions for Nigerians', stems)).toBeTruthy()
  })

  it('matches ≥70% token overlap ("F1 visa interview prep" vs "f-1 visa interview")', () => {
    expect(shippedOverlap('f1 visa interview prep', stems)).toBeTruthy()
  })

  it('returns null for fresh, unrelated topics', () => {
    expect(shippedOverlap('australia student visa fee', stems)).toBeNull()
    expect(shippedOverlap('uk graduate route timeline', stems)).toBeNull()
    expect(shippedOverlap('how to write a motivation letter', stems)).toBeNull()
  })

  it('returns null on an empty shipped set', () => {
    expect(shippedOverlap('f-1 visa interview questions', new Set())).toBeNull()
  })
})
