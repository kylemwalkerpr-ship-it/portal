/**
 * Follow-up emails for free /get-matched intake leads who have not created an
 * account yet. Two touches only: about 24h and about 72h after the intake.
 *
 * Rules (kept here so the cron route and tests share one source of truth):
 *  - Only source 'market:get-matched' leads that are still open.
 *  - Never email someone who already has an account, has accepted an offer,
 *    unsubscribed, or used a reserved test address.
 *  - Each touch is recorded in inquiries.meta.followups so it is sent once.
 *  - The 72h touch suggests a fixed-fee review only when the intake answers
 *    clearly match a listing with a confirmed, delivering provider.
 */

export const FOLLOWUP_SOURCE = 'market:get-matched'
export const MARKET_URL = 'https://market.yousafeconsultancy.com'

export type FollowupStep = 'h24' | 'h72'

const HOUR = 60 * 60 * 1000

/** Age windows: the first touch at 24h, the second at 72h. Older leads get nothing new. */
export const STEP_WINDOWS: Record<FollowupStep, { minHours: number; maxHours: number }> = {
  h24: { minHours: 24, maxHours: 72 },
  h72: { minHours: 72, maxHours: 7 * 24 },
}

export interface FollowupMeta {
  h24?: string
  h72?: string
  opted_out?: string
}

export function readFollowups(meta: unknown): FollowupMeta {
  if (!meta || typeof meta !== 'object') return {}
  const f = (meta as Record<string, unknown>).followups
  return f && typeof f === 'object' ? (f as FollowupMeta) : {}
}

/** Which touch (if any) is due for a lead created at `createdAt`. */
export function dueStep(createdAt: string | Date, followups: FollowupMeta, now: Date = new Date()): FollowupStep | null {
  if (followups.opted_out) return null
  const ageHours = (now.getTime() - new Date(createdAt).getTime()) / HOUR
  if (!Number.isFinite(ageHours)) return null
  const inWindow = (s: FollowupStep) => ageHours >= STEP_WINDOWS[s].minHours && ageHours < STEP_WINDOWS[s].maxHours
  if (!followups.h72 && inWindow('h72')) return 'h72'
  if (!followups.h24 && !followups.h72 && inWindow('h24')) return 'h24'
  return null
}

export interface SuggestedReview {
  title: string
  priceLabel: string
  href: string
}

/** Fixed-fee review that clearly fits the intake answers, or null. */
export function suggestedReview(country: string | null, caseType: string | null, answers: unknown): SuggestedReview | null {
  const a = (answers && typeof answers === 'object' ? answers : {}) as Record<string, unknown>
  if (country !== 'US') return null
  if (caseType === 'opt' && a.opt_type === 'post_opt') {
    return {
      title: 'Post-completion OPT I-765 review by a US attorney',
      priceLabel: '$249',
      href: `${MARKET_URL}/gigs/review-i765-opt-application-before-filing`,
    }
  }
  if (caseType === 'f1' && a.status_now === 'reinstate') {
    return {
      title: 'F-1 reinstatement file review by a US attorney',
      priceLabel: '$395',
      href: `${MARKET_URL}/gigs/provide-immigration-expert-lawyer-services`,
    }
  }
  return null
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

export interface FollowupEmailInput {
  step: FollowupStep
  fullName: string
  caseLabel: string | null
  pendingOffers: number
  review: SuggestedReview | null
  unsubscribeUrl: string
}

export function signUpUrl(): string {
  return `${MARKET_URL}/?ys_sign_up=1&intent=client`
}

export function buildFollowupEmail(input: FollowupEmailInput): { subject: string; html: string } {
  const name = esc(input.fullName.split(' ')[0] || 'there')
  const caseLabel = esc(input.caseLabel || 'your case')
  const signUp = esc(signUpUrl())
  const offerLine =
    input.pendingOffers > 0
      ? `<p><strong>A provider has already sent you a fixed-fee offer.</strong> Create a free account with this email address to read it and reply.</p>`
      : `<p>Providers are reviewing it now. Create a free account with this email address so you can see offers and reply the moment one arrives.</p>`

  let subject: string
  let body: string
  if (input.step === 'h24') {
    subject = input.pendingOffers > 0 ? 'You have an offer waiting on your case' : 'Your case: one quick step'
    body = `<p>Hi ${name},</p>
<p>Yesterday you told us about ${caseLabel}.</p>
${offerLine}
<p><a href="${signUp}" style="display:inline-block;background:#3c3b6e;color:#fff;padding:10px 20px;border-radius:999px;text-decoration:none;font-weight:600">Create my free account</a></p>
<p>Nothing is charged until you accept an offer, and payment is held in escrow until you approve the work.</p>`
  } else {
    subject = input.pendingOffers > 0 ? 'Your offer is still waiting' : 'Still need help with your case?'
    const review = input.review
      ? `<p>If you'd rather not wait, there is a fixed-fee option that fits what you described: <a href="${esc(input.review.href)}">${esc(input.review.title)}</a>, ${esc(input.review.priceLabel)}. You can order it directly.</p>`
      : ''
    body = `<p>Hi ${name},</p>
<p>A few days ago you told us about ${caseLabel}.</p>
${offerLine}
${review}
<p><a href="${signUp}" style="display:inline-block;background:#3c3b6e;color:#fff;padding:10px 20px;border-radius:999px;text-decoration:none;font-weight:600">Create my free account</a></p>
<p>This is the last reminder we'll send about this request.</p>`
  }

  const html = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;line-height:1.55">
${body}
<p style="color:#555;font-size:12px">YouSafe Consultancy provides document preparation and education services and operates a marketplace. It is not a law firm and does not guarantee any visa, permit, or application outcome.</p>
<p style="color:#555;font-size:12px">You're getting this because you submitted a free case intake on market.yousafeconsultancy.com. <a href="${esc(input.unsubscribeUrl)}">Stop these reminders</a>.</p>
</body></html>`
  return { subject, html }
}

export function unsubscribeUrl(inquiryId: string, accessToken: string): string {
  return `${MARKET_URL}/api/marketplace/lead-unsubscribe?id=${encodeURIComponent(inquiryId)}&t=${encodeURIComponent(accessToken)}`
}
