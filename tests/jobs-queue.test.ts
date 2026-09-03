import {
  asQueueUiFilter,
  queueClearConfirmCopy,
  queueClearSpec,
  queueDeleteConfirmCopy,
  queueFilterForJobStatus,
  queueJobsListPath,
  queueListStatusParam,
  queueMatchedCount,
  queueTabCount,
} from '@/lib/seoFactory/jobsQueue'

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

describe('asQueueUiFilter', () => {
  it('keeps desk filters and drops job statuses the queue UI does not have', () => {
    expect(asQueueUiFilter('failed')).toBe('failed')
    expect(asQueueUiFilter('all')).toBe('all')
    expect(asQueueUiFilter('stuck')).toBe('stuck')
    expect(asQueueUiFilter('closed')).toBe('all')
    expect(asQueueUiFilter('publishing')).toBe('all')
  })
})

describe('queueFilterForJobStatus', () => {
  it('opens PR Ready after a shipped draft so the job does not vanish from Drafting', () => {
    expect(queueFilterForJobStatus('pr_created')).toBe('pr_created')
    expect(queueFilterForJobStatus('publishing')).toBe('pr_created')
    expect(queueFilterForJobStatus('drafting')).toBe('drafting')
    expect(queueFilterForJobStatus('failed')).toBe('failed')
    expect(queueFilterForJobStatus('merged')).toBe('merged')
  })
})

describe('queue list filter vs window', () => {
  const summary = { total: 233, pending: 0, drafting: 1, publishing: 0, pr_created: 0, merged: 113, failed: 62, closed: 57 }
  const window = { total: 100, pending: 0, drafting: 1, failed: 0, stuck: 0, pr_created: 0, merged: 99 }

  it('asks the API for failed rows instead of filtering the latest mixed window', () => {
    expect(queueListStatusParam('failed')).toBe('failed')
    expect(queueListStatusParam('all')).toBeNull()
    expect(queueListStatusParam('stuck')).toBe('drafting,pending')
    expect(queueJobsListPath({ limit: 100, filter: 'failed' })).toBe('/api/content-studio/jobs?limit=100&status=failed')
  })

  it('shows the table failed count on the tab even when the loaded window has none', () => {
    expect(queueTabCount('failed', summary, window)).toBe(62)
    expect(queueTabCount('all', summary, window)).toBe(233)
    expect(queueTabCount('merged', summary, window)).toBe(113)
    expect(queueMatchedCount('failed', { failed: 62, merged: 113 }, 233)).toBe(62)
  })

  it('arms a real delete confirm, not abandon', () => {
    expect(queueDeleteConfirmCopy(62)).toBe('Click again to permanently delete 62 jobs from the queue.')
  })
})
