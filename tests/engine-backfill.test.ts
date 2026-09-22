import { matureRunDate } from '@/lib/seoEngine/engineBackfill'
import { draftOutreachMessage } from '@/lib/seoEngine/backlinkEngine'
import type { BacklinkTarget } from '@/lib/seoEngine/backlinkEngine'

describe('engineBackfill · matureRunDate', () => {
  it('backs a 30-day horizon to the date that matures today', () => {
    expect(matureRunDate('2026-08-19', 30)).toBe('2026-07-20')
    expect(matureRunDate('2026-08-19', 60)).toBe('2026-06-20')
    expect(matureRunDate('2026-08-19', 90)).toBe('2026-05-21')
  })
})

describe('backlink outreach · template path', () => {
  it('drafts a shippable email without calling the AI cascade', async () => {
    const target: BacklinkTarget = {
      id: 't1',
      domain: 'uscis.gov',
      target_url: 'https://www.uscis.gov/',
      destination_url: null,
      title: 'USCIS',
      kind: 'gov',
      lane: 'editorial',
      authority_score: 95,
      authority_score_basis: 'legacy_internal',
      traffic_estimate: null,
      contact_name: null,
      contact_email: null,
      contact_handle: null,
      countries: ['US'],
      stages: ['work', 'visa'],
      topics: ['h-1b'],
      rationale: 'Direct policy source.',
      status: 'identified',
      first_seen_at: '2026-08-19T00:00:00.000Z',
      last_touched_at: '2026-08-19T00:00:00.000Z',
      won_at: null,
      lost_at: null,
      won_backlink_url: null,
      won_verified_at: null,
      won_verification_id: null,
      notes: null,
    }
    const draft = await draftOutreachMessage({ target, skipAi: true })
    expect(draft.model).toBe('template')
    expect(draft.subject.toLowerCase()).toContain('uscis.gov')
    expect(draft.body.length).toBeGreaterThan(80)
    expect(draft.body).toContain('YouSafe')
  })
})
