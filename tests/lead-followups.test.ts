import fs from 'fs'
import path from 'path'
import {
  buildFollowupEmail,
  dueStep,
  readFollowups,
  suggestedReview,
  unsubscribeUrl,
  FOLLOWUP_SOURCE,
} from '@/lib/leadFollowups'

const H = 3600_000
const now = new Date('2026-10-05T12:00:00Z')
const ago = (hours: number) => new Date(now.getTime() - hours * H).toISOString()

describe('lead follow-up timing', () => {
  it('sends nothing before 24h', () => {
    expect(dueStep(ago(23), {}, now)).toBeNull()
  })
  it('sends the first touch from 24h', () => {
    expect(dueStep(ago(25), {}, now)).toBe('h24')
  })
  it('sends the first touch only once', () => {
    expect(dueStep(ago(30), { h24: ago(5) }, now)).toBeNull()
  })
  it('sends the second touch from 72h', () => {
    expect(dueStep(ago(73), { h24: ago(48) }, now)).toBe('h72')
  })
  it('never sends a third touch or anything after 7 days', () => {
    expect(dueStep(ago(100), { h24: ago(76), h72: ago(20) }, now)).toBeNull()
    expect(dueStep(ago(24 * 8), {}, now)).toBeNull()
  })
  it('respects an unsubscribe', () => {
    expect(dueStep(ago(25), { opted_out: ago(1) }, now)).toBeNull()
  })
  it('reads followups defensively', () => {
    expect(readFollowups(null)).toEqual({})
    expect(readFollowups({ followups: { h24: 'x' } })).toEqual({ h24: 'x' })
  })
})

describe('suggested review', () => {
  it('offers the I-765 review only for post-completion OPT', () => {
    expect(suggestedReview('US', 'opt', { opt_type: 'post_opt' })?.href).toContain('review-i765-opt-application-before-filing')
    expect(suggestedReview('US', 'opt', { opt_type: 'stem_opt' })).toBeNull()
    expect(suggestedReview('US', 'opt', { opt_type: 'pre_opt' })).toBeNull()
  })
  it('offers the reinstatement review only to students out of status', () => {
    expect(suggestedReview('US', 'f1', { status_now: 'reinstate' })?.href).toContain('provide-immigration-expert-lawyer-services')
    expect(suggestedReview('US', 'f1', { status_now: 'pre_visa' })).toBeNull()
  })
  it('offers nothing outside the US', () => {
    expect(suggestedReview('CA', 'opt', { opt_type: 'post_opt' })).toBeNull()
  })
})

describe('follow-up email', () => {
  const base = { fullName: 'Ana <b>Lima</b>', caseLabel: 'OPT', pendingOffers: 0, review: null, unsubscribeUrl: unsubscribeUrl('11111111-1111-1111-1111-111111111111', 'abcdef0123456789') }
  it('carries the disclaimer and an unsubscribe link', () => {
    const { html } = buildFollowupEmail({ ...base, step: 'h24' })
    expect(html).toContain('not a law firm')
    expect(html).toContain('/api/marketplace/lead-unsubscribe?id=11111111-1111-1111-1111-111111111111&amp;t=abcdef0123456789')
  })
  it('escapes the lead name', () => {
    const { html } = buildFollowupEmail({ ...base, step: 'h24' })
    expect(html).not.toContain('<b>')
  })
  it('mentions a waiting offer when there is one', () => {
    expect(buildFollowupEmail({ ...base, step: 'h24', pendingOffers: 1 }).subject).toMatch(/offer waiting/)
  })
  it('includes the suggested review only on the 72h touch when provided', () => {
    const review = suggestedReview('US', 'opt', { opt_type: 'post_opt' })
    expect(buildFollowupEmail({ ...base, step: 'h72', review }).html).toContain('$249')
    expect(buildFollowupEmail({ ...base, step: 'h72' }).html).toContain('last reminder')
  })
})

describe('wiring', () => {
  const root = path.join(__dirname, '..')
  it('the cron route is Bearer-protected, scoped to get-matched leads and claims before sending', () => {
    const src = fs.readFileSync(path.join(root, 'app/api/cron/lead-followups/route.ts'), 'utf8')
    expect(src).toContain('CRON_SECRET')
    expect(src).toContain("eq('source', FOLLOWUP_SOURCE)")
    expect(FOLLOWUP_SOURCE).toBe('market:get-matched')
    expect(src.indexOf('.is(`meta->followups->>${step}`, null)')).toBeLessThan(src.indexOf('await sendEmail('))
  })
  it('the get-matched intake still posts with the followed-up source', () => {
    expect(fs.readFileSync(path.join(root, 'components/marketplace/GetMatchedClient.tsx'), 'utf8')).toContain('source="market:get-matched"')
  })
  it('an hourly workflow calls the route', () => {
    const wf = fs.readFileSync(path.join(root, '.github/workflows/lead-followups.yml'), 'utf8')
    expect(wf).toContain('/api/cron/lead-followups')
    expect(wf).toContain('secrets.CRON_SECRET')
  })
})
