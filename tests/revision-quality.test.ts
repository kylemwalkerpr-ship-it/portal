import { validateRevisionQuality } from '@/lib/seoFactory/revisionQuality'
import type { SeoFactoryAudit } from '@/lib/seoFactory/audit'

const base: SeoFactoryAudit = {
  score: 90, grade: 'A', blockers: [], warnings: [], passes: [],
  indexableRecommended: true, llmsRecommended: true, wordCount: 1200, humanScore: 90,
}
const finding = (code: string) => ({ code, severity: 'blocker' as const, message: code })

describe('revision quality acceptance', () => {
  it('rejects a new blocker even when the aggregate score improves', () => {
    expect(validateRevisionQuality(base, { ...base, score: 95, blockers: [finding('keyword_stuffing')] }).ok).toBe(false)
  })
  it('rejects worse prose even if SEO improves', () => {
    expect(validateRevisionQuality(base, { ...base, score: 95, humanScore: 70 }).ok).toBe(false)
  })
  it('keeps a passing score when a rewrite loses SEO points', () => {
    expect(validateRevisionQuality(base, { ...base, score: 60 }).ok).toBe(false)
  })
  it('accepts a revision that removes an existing blocker without losing quality', () => {
    expect(validateRevisionQuality({ ...base, blockers: [finding('keyword_stuffing')] }, base).ok).toBe(true)
  })
  it('does not let additional occurrences of an existing blocker slip through', () => {
    expect(validateRevisionQuality(
      { ...base, blockers: [finding('missing_outline_section')] },
      { ...base, blockers: [finding('missing_outline_section'), finding('missing_outline_section')] },
    ).ok).toBe(false)
  })
})

it('rejects lost coverage hidden behind an existing aggregate keyword blocker', () => {
  const audit = { ...base, blockers: [finding('missing_short_keyword')] }
  expect(validateRevisionQuality(audit, audit, {
    original: '---\nkeywords: passport\n---\nKeep your passport with the application.', revised: '---\nkeywords: passport\n---\nKeep the application together.',
    requiredKeywords: ['passport', 'bank statement'],
  }).ok).toBe(false)
})
