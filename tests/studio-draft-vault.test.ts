import { lastUpdatedJobs } from '@/lib/studioDraftVault'

describe('lastUpdatedJobs — Drafting file vault ordering', () => {
  const job = (id: string, updated_at: string, created_at = updated_at) => ({ id, title: id, updated_at, created_at })

  it('returns empty for empty input', () => {
    expect(lastUpdatedJobs([], 10)).toEqual([])
  })

  it('sorts by updated_at descending and caps at limit', () => {
    const jobs = [
      job('a', '2026-01-01T00:00:00Z'),
      job('b', '2026-03-01T00:00:00Z'),
      job('c', '2026-02-01T00:00:00Z'),
      job('d', '2026-04-01T00:00:00Z'),
    ]
    expect(lastUpdatedJobs(jobs, 3).map((j) => j.id)).toEqual(['d', 'b', 'c'])
  })

  it('falls back to created_at when updated_at is missing', () => {
    const jobs = [
      { id: 'old', title: 'old', updated_at: null, created_at: '2026-01-01T00:00:00Z' },
      { id: 'new', title: 'new', updated_at: undefined, created_at: '2026-05-01T00:00:00Z' },
    ]
    expect(lastUpdatedJobs(jobs, 10).map((j) => j.id)).toEqual(['new', 'old'])
  })

  it('defaults to 10', () => {
    const jobs = Array.from({ length: 15 }, (_, i) =>
      job(String(i), `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`),
    )
    expect(lastUpdatedJobs(jobs).map((j) => j.id)).toHaveLength(10)
    expect(lastUpdatedJobs(jobs)[0].id).toBe('14')
  })
})
