/**
 * One in-flight job per region+primary. Live Canada Spousal minted six
 * drafting rows because claimDraftingJob always inserted.
 */
import { draftingDedupKey, isOpenDraftingStatus } from '@/lib/seoFactory/claimDraftingJob'

describe('draftingDedupKey', () => {
  it('normalizes region and primary so CA/ca and spacing collapse', () => {
    expect(draftingDedupKey('CA', 'canada spousal sponsorship processing time')).toBe(
      'ca::canada spousal sponsorship processing time',
    )
    expect(draftingDedupKey('ca', '  Canada Spousal Sponsorship Processing Time  ')).toBe(
      'ca::canada spousal sponsorship processing time',
    )
  })

  it('is empty when the primary is blank so we never collide untitled jobs', () => {
    expect(draftingDedupKey('CA', '')).toBe('')
    expect(draftingDedupKey('CA', '   ')).toBe('')
  })
})

describe('isOpenDraftingStatus', () => {
  it('reuses drafting/failed/pending and never merged/closed', () => {
    expect(isOpenDraftingStatus('drafting')).toBe(true)
    expect(isOpenDraftingStatus('failed')).toBe(true)
    expect(isOpenDraftingStatus('pending')).toBe(true)
    expect(isOpenDraftingStatus('merged')).toBe(false)
    expect(isOpenDraftingStatus('closed')).toBe(false)
    expect(isOpenDraftingStatus('pr_created')).toBe(false)
  })
})
