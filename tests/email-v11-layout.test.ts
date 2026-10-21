import { renderEmailLayout, EMAIL_ASSETS } from '@/lib/emailLayout'
import { attorneyApprovalEmail, inquiryNewOfferEmail } from '@/lib/email'

describe('v11 email layout', () => {
  it('renders the approved brand elements', () => {
    const html = renderEmailLayout({ bodyHtml: '<p>Hi</p>', cta: { label: 'Go', href: 'https://x.test/?a=1&b=2' } })
    expect(html).toContain('border:3px solid #9db8a4')
    expect(html).toContain('background-color:#e8efe9')
    expect(html).toContain('Walking beside you, with dignity and care, from your first form to the place you call home')
    expect(html).toContain('Yours truly,')
    expect(html).toContain('tel:+17572027249')
    expect(html).toContain('www.yousafeconsultancy.com')
    expect(html).toContain('A journey of a thousand miles starts with a single step.')
    expect(html).toContain(EMAIL_ASSETS.band)
    expect(html).toContain('href="https://x.test/?a=1&amp;b=2"')
  })
  it('keeps outreach-only rule-28 and opt-out lines out of transactional mail', () => {
    const html = attorneyApprovalEmail('Ada').html
    expect(html).not.toMatch(/not legal advice|reply STOP|Unsubscribe/i)
  })
  it('escapes CTA labels and keeps template content', () => {
    const html = renderEmailLayout({ bodyHtml: '', cta: { label: '<b>x</b>', href: '#' } })
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;')
    expect(inquiryNewOfferEmail({ clientName: 'M', attorneyName: 'A', offerTitle: 'T', attorneyFee: 1, platformFee: 2, inquiryId: 'i' }).html).toContain('You pay: $3.00')
  })
})
