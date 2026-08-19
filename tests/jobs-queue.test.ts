import { queueClearConfirmCopy, queueClearSpec } from '@/lib/seoFactory/jobsQueue'

describe('queueClearSpec', () => {
  it('targets pending drafts only', () => {
    expect(queueClearSpec('clear_drafts')).toEqual({ statuses: ['pending'], staleBefore: null })
  })

  it('targets failed jobs only', () => {
    expect(queueClearSpec('clear_failed')).toEqual({ statuses: ['failed'], staleBefore: null })
  })

  it('targets drafting/pending rows idle for 30 minutes', () => {
    const now = Date.parse('2026-08-18T21:00:00.000Z')
    const spec = queueClearSpec('clear_stuck', now)
    expect(spec.statuses).toEqual(['drafting', 'pending'])
    expect(spec.staleBefore).toBe('2026-08-18T20:30:00.000Z')
  })
})

describe('queueClearConfirmCopy', () => {
  it('never says "confirm clear failed" (reads as an error)', () => {
    const copy = queueClearConfirmCopy('clear_failed', 62)
    expect(copy).toBe('Click again to confirm abandoning 62 failed jobs.')
    expect(copy.toLowerCase()).not.toMatch(/confirm clear failed/)
  })

  it('singularizes a one-job bucket', () => {
    expect(queueClearConfirmCopy('clear_drafts', 1)).toBe(
      'Click again to confirm abandoning 1 queued draft.',
    )
  })
})
