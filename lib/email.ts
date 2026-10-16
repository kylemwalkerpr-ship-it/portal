// Thin Resend wrapper. The key is a Worker secret (`RESEND_API_KEY`); see
// wrangler.toml for the deploy notes. Sender domain `yousafeconsultancy.com`
// is already verified in Resend (originally provisioned for caseworks).

import { renderEmailLayout } from './emailLayout'

const DEFAULT_FROM = 'YouSafe Consultancy <noreply@yousafeconsultancy.com>'

type SendArgs = {
  to: string
  subject: string
  html: string
  from?: string
}

/**
 * RFC 2606 / 6761 reserved domains (example.com, *.test, *.invalid, ...) and
 * placeholder provider addresses never receive mail. Sending to them only
 * bounces and hurts sender reputation, so E2E/test accounts are skipped.
 */
export function isReservedTestEmail(value: unknown): boolean {
  if (typeof value !== 'string') return true
  const email = value.trim().toLowerCase()
  const at = email.lastIndexOf('@')
  if (at < 1) return true
  const domain = email.slice(at + 1)
  if (['example.com', 'example.net', 'example.org'].includes(domain)) return true
  if (/\.(example|test|invalid|localhost)$/.test(domain) || ['example', 'test', 'invalid', 'localhost'].includes(domain)) return true
  return false
}

export async function sendEmail({ to, subject, html, from = DEFAULT_FROM }: SendArgs): Promise<'sent' | 'skipped'> {
  if (isReservedTestEmail(to)) {
    console.log('[email] skipped reserved/test address')
    return 'skipped'
  }
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error('[email] RESEND_API_KEY missing — skipping send to', to)
    throw new Error('Email provider is not configured.')
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Resend ${res.status}: ${text}`)
  }
  return 'sent'
}

/** Sent right after a provider submits the short application. */
export function providerApplicationReceivedEmail(args: {
  fullName: string
  lane: 'attorney' | 'consultant'
  licensed: boolean
  /** Consultants may apply without a credential; default true for older callers. */
  hasCredential?: boolean
}): { subject: string; html: string } {
  const name = escapeHtml(args.fullName || 'there')
  const verify = args.licensed
    ? 'We are now verifying your licence with your bar / regulator.'
    : args.hasCredential === false
      ? 'We are now reviewing your application.'
      : 'We are now verifying your credential with the issuing body.'
  const subject = args.lane === 'attorney'
    ? 'We received your YouSafe attorney application'
    : 'We received your YouSafe consultant application'
  return {
    subject,
    html: renderEmailLayout({
      preheader: subject,
      signer: 'The YouSafe team',
      bodyHtml: `<p>Hi ${name},</p>
<p>Thanks for applying to join YouSafe. Your application is <strong>under review</strong>.</p>
<ol>
  <li>Account created ✓</li>
  <li>Application submitted ✓</li>
  <li><strong>Under review</strong>: ${verify} This usually takes 1–2 business days.</li>
  <li>Approval and profile: once approved you'll get an email and can finish your public profile (practice areas, languages, capacity, bio).</li>
</ol>
<p>You can check or update your application at any time:
<a href="https://portal.yousafeconsultancy.com/dashboard">portal.yousafeconsultancy.com/dashboard</a></p>
<p>Questions? Reply to <a href="mailto:support@yousafeconsultancy.com">support@yousafeconsultancy.com</a>.</p>`,
      cta: { label: 'Open your dashboard', href: 'https://portal.yousafeconsultancy.com/dashboard' },
    }),
  }
}

export function attorneyApprovalEmail(fullName: string): { subject: string; html: string } {
  const greeting = fullName ? `Hello ${escapeHtml(fullName)},` : 'Hello,'
  const subject = 'Your YouSafe attorney application is approved'
  return {
    subject,
    html: renderEmailLayout({
      preheader: subject,
      bodyHtml: `<p>${greeting}</p>
<p>Your application to join the YouSafe attorney panel has been approved. You can now sign in and access the attorney dashboard.</p>
<p><strong>Next step:</strong> finish your public profile (practice areas, languages, capacity, bio) so clients can find you:
<a href="https://portal.yousafeconsultancy.com/dashboard/attorney/intake">complete your profile</a>.</p>
<p>Welcome aboard.</p>`,
      cta: {
        label: 'Sign in to your YouSafe attorney dashboard',
        href: 'https://market.yousafeconsultancy.com/?ys_sign_in=1&intent=attorney&return_to=https%3A%2F%2Fportal.yousafeconsultancy.com%2Fdashboard',
      },
    }),
  }
}

export function attorneyDeclineEmail(fullName: string): { subject: string; html: string } {
  const greeting = fullName ? `Hello ${escapeHtml(fullName)},` : 'Hello,'
  const subject = 'Update on your YouSafe attorney application'
  return {
    subject,
    html: renderEmailLayout({
      preheader: subject,
      bodyHtml: `<p>${greeting}</p>
<p>Thank you for applying to join the YouSafe attorney panel. After review, we are unable to accept your application at this time.</p>
<p>If you believe this is in error or would like to discuss, contact <a href="mailto:support@yousafeconsultancy.com">support@yousafeconsultancy.com</a>.</p>`,
    }),
  }
}

export function consultantApprovalEmail(fullName: string): { subject: string; html: string } {
  const greeting = fullName ? `Hello ${escapeHtml(fullName)},` : 'Hello,'
  const subject = 'Your YouSafe consultant application is approved'
  return {
    subject,
    html: renderEmailLayout({
      preheader: subject,
      bodyHtml: `<p>${greeting}</p>
<p>Your application to join the YouSafe consultant panel has been approved. You can now sign in, publish your profile, and start taking work:</p>
<p><a href="https://portal.yousafeconsultancy.com/dashboard">portal.yousafeconsultancy.com/dashboard</a></p>
<p><strong>Next step:</strong> finish your public profile (specialties, languages, capacity, bio) so clients can find you:
<a href="https://portal.yousafeconsultancy.com/dashboard/consultant/intake">complete your profile</a>.</p>
<p>Welcome aboard.</p>`,
      cta: { label: 'Complete your profile', href: 'https://portal.yousafeconsultancy.com/dashboard/consultant/intake' },
    }),
  }
}

export function consultantDeclineEmail(fullName: string): { subject: string; html: string } {
  const greeting = fullName ? `Hello ${escapeHtml(fullName)},` : 'Hello,'
  const subject = 'Update on your YouSafe consultant application'
  return {
    subject,
    html: renderEmailLayout({
      preheader: subject,
      bodyHtml: `<p>${greeting}</p>
<p>Thank you for applying to join the YouSafe consultant panel. After review, we are unable to accept your application at this time.</p>
<p>If you believe this is in error or would like to discuss, contact <a href="mailto:support@yousafeconsultancy.com">support@yousafeconsultancy.com</a>.</p>`,
    }),
  }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const PORTAL_URL = 'https://portal.yousafeconsultancy.com'

function inquiryUrl(id: string): string {
  return `${PORTAL_URL}/dashboard?inquiry=${id}`
}

// ── Inquiry pipeline emails ────────────────────────────────────────────────

export function inquiryAttorneyEngagedEmail(args: {
  clientName: string | null
  attorneyName: string
  caseLabel: string
  inquiryId: string
}): { subject: string; html: string } {
  const greeting = args.clientName ? `Hello ${escapeHtml(args.clientName)},` : 'Hello,'
  const subject = `An attorney is reviewing your ${args.caseLabel || 'inquiry'}`
  return {
    subject,
    html: renderEmailLayout({
      preheader: subject,
      bodyHtml: `<p>${greeting}</p>
<p><strong>${escapeHtml(args.attorneyName)}</strong> just opened your inquiry on MyCaseworks and sent you a message.</p>
<p>Other attorneys may also respond. You can compare offers and pick the one you want to engage.</p>`,
      cta: { label: 'Open the conversation', href: inquiryUrl(args.inquiryId) },
    }),
  }
}

export function inquiryNewOfferEmail(args: {
  clientName: string | null
  attorneyName: string
  offerTitle: string
  attorneyFee: number
  platformFee: number
  inquiryId: string
}): { subject: string; html: string } {
  const greeting = args.clientName ? `Hello ${escapeHtml(args.clientName)},` : 'Hello,'
  const total = args.attorneyFee + args.platformFee
  const subject = `New offer from ${args.attorneyName}`
  return {
    subject,
    html: renderEmailLayout({
      preheader: subject,
      bodyHtml: `<p>${greeting}</p>
<p><strong>${escapeHtml(args.attorneyName)}</strong> sent you a custom offer:</p>
<div style="font-size:16px;margin:16px 0;padding:14px 18px;background:#eef3ee;border:1px solid #d6e2d8;border-radius:8px">
<strong>${escapeHtml(args.offerTitle)}</strong><br>
Attorney fee: $${args.attorneyFee.toFixed(2)}<br>
Platform fee: $${args.platformFee.toFixed(2)}<br>
<strong>You pay: $${total.toFixed(2)}</strong>
</div>
<p>The attorney's fee is paid in full to them. The platform fee is shown separately and routed to MyCaseworks (per ABA Rule 5.4).</p>`,
      cta: { label: 'Review and accept', href: inquiryUrl(args.inquiryId) },
    }),
  }
}

export function inquiryOfferAcceptedEmail(args: {
  attorneyName: string | null
  clientName: string | null
  offerTitle: string
  attorneyFee: number
  inquiryId: string
}): { subject: string; html: string } {
  const greeting = args.attorneyName ? `Hello ${escapeHtml(args.attorneyName)},` : 'Hello,'
  const client = args.clientName ? escapeHtml(args.clientName) : 'A client'
  const subject = `Your offer was accepted`
  return {
    subject,
    html: renderEmailLayout({
      preheader: subject,
      bodyHtml: `<p>${greeting}</p>
<p>${client} accepted your offer "<strong>${escapeHtml(args.offerTitle)}</strong>".</p>
<p>The full attorney fee of <strong>$${args.attorneyFee.toFixed(2)}</strong> will be transferred to your connected account once the payment settles (typically 1–2 business days).</p>`,
      cta: { label: 'Open the engagement', href: inquiryUrl(args.inquiryId) },
    }),
  }
}

export function inquiryOfferDeclinedEmail(args: {
  attorneyName: string | null
  clientName: string | null
  offerTitle: string
  inquiryId: string
}): { subject: string; html: string } {
  const greeting = args.attorneyName ? `Hello ${escapeHtml(args.attorneyName)},` : 'Hello,'
  const client = args.clientName ? escapeHtml(args.clientName) : 'The client'
  const subject = `Your offer was declined`
  return {
    subject,
    html: renderEmailLayout({
      preheader: subject,
      bodyHtml: `<p>${greeting}</p>
<p>${client} declined your offer "<strong>${escapeHtml(args.offerTitle)}</strong>". They may still be considering offers from other attorneys.</p>`,
      cta: { label: 'Open the conversation', href: inquiryUrl(args.inquiryId) },
    }),
  }
}

export function inquiryClientMessageEmail(args: {
  attorneyName: string | null
  clientName: string | null
  preview: string
  inquiryId: string
}): { subject: string; html: string } {
  const greeting = args.attorneyName ? `Hello ${escapeHtml(args.attorneyName)},` : 'Hello,'
  const client = args.clientName ? escapeHtml(args.clientName) : 'The client'
  const subject = `New message from ${args.clientName || 'a client'}`
  return {
    subject,
    html: renderEmailLayout({
      preheader: subject,
      bodyHtml: `<p>${greeting}</p>
<p>${client} replied on an inquiry you're engaged with:</p>
<blockquote style="border-left:3px solid #9db8a4;margin:12px 0 16px 0;padding-left:14px;color:#44575a">${escapeHtml(args.preview.slice(0, 240))}${args.preview.length > 240 ? '…' : ''}</blockquote>`,
      cta: { label: 'Open the conversation', href: inquiryUrl(args.inquiryId) },
    }),
  }
}

// ── Inquiry intake emails (app/api/inquiries) ──────────────────────────────

export function buyerCaseReceivedEmail(args: { fullName: string; caseLabel: string }): { subject: string; html: string } {
  const subject = 'We received your case: YouSafe Consultancy'
  return {
    subject,
    html: renderEmailLayout({
      preheader: subject,
      bodyHtml: `<p>Hi ${escapeHtml(args.fullName)},</p>
<p>Thanks for telling us about your case (${escapeHtml(args.caseLabel)}). A provider on the YouSafe Marketplace will review it and reply with a fixed-fee offer. We'll email you as soon as they do.</p>
<p>Nothing is charged until you accept an offer, and payment is held in escrow until you approve the work.</p>
<p>Create a free account to follow replies and message your provider: <a href="https://market.yousafeconsultancy.com/?ys_sign_up=1&amp;intent=client">market.yousafeconsultancy.com</a></p>`,
      cta: { label: 'Create a free account', href: 'https://market.yousafeconsultancy.com/?ys_sign_up=1&intent=client' },
      footerHtml: ['YouSafe Consultancy provides document preparation and education services and operates a marketplace. It is not a law firm and does not guarantee any visa, permit, or application outcome.'],
    }),
  }
}

export function leadAlertEmailHtml(args: {
  fullName: string
  email: string
  phone: string | null
  caseLabel: string
  country: string | null
  urgency: string | null
  recommendedTier: string | null
  source: string
  inquiryId: string
}): string {
  return renderEmailLayout({
    preheader: 'New lead',
    bodyHtml: `<p><strong>${escapeHtml(args.fullName)}</strong> (${escapeHtml(args.email)}${args.phone ? `, ${escapeHtml(args.phone)}` : ''}) submitted a free case intake.</p>
<p><strong>Case type:</strong> ${escapeHtml(args.caseLabel)}<br/><strong>Country:</strong> ${escapeHtml(args.country ?? 'Not specified')}<br/><strong>Urgency:</strong> ${escapeHtml(args.urgency ?? 'Not specified')}<br/><strong>Recommended tier:</strong> ${escapeHtml(args.recommendedTier ?? 'n/a')}<br/><strong>Source:</strong> ${escapeHtml(args.source)}</p>
<p>Reply with a fixed-fee offer quickly; speed to first offer is the biggest driver of conversion.</p>`,
    cta: { label: 'Open the inquiry', href: `${PORTAL_URL}/dashboard?inquiry=${args.inquiryId}` },
  })
}

export function targetAttorneyInquiryEmailHtml(args: {
  attorneyName: string | null
  fullName: string
  caseLabel: string
  urgency: string | null
  inquiryId: string
}): string {
  const greeting = args.attorneyName ? `Hello ${escapeHtml(args.attorneyName)},` : 'Hello,'
  return renderEmailLayout({
    preheader: `Direct inquiry from ${args.fullName}`,
    bodyHtml: `<p>${greeting}</p>
<p><strong>${escapeHtml(args.fullName)}</strong> just sent you a direct inquiry from your YouSafe profile.</p>
<p><strong>Case type:</strong> ${escapeHtml(args.caseLabel)}</p>
${args.urgency ? `<p><strong>Urgency:</strong> ${escapeHtml(args.urgency)}</p>` : ''}`,
    cta: { label: 'Open in your inbox queue', href: `${PORTAL_URL}/dashboard?inquiry=${args.inquiryId}` },
  })
}
