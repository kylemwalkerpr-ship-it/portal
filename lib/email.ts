// Thin Resend wrapper. The key is a Worker secret (`RESEND_API_KEY`); see
// wrangler.toml for the deploy notes. Sender domain `yousafeconsultancy.com`
// is already verified in Resend (originally provisioned for caseworks).

const DEFAULT_FROM = 'YouSafe Consultancy <noreply@yousafeconsultancy.com>'

type SendArgs = {
  to: string
  subject: string
  html: string
  from?: string
}

export async function sendEmail({ to, subject, html, from = DEFAULT_FROM }: SendArgs): Promise<void> {
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
}

export function attorneyApprovalEmail(fullName: string): { subject: string; html: string } {
  const greeting = fullName ? `Hello ${escapeHtml(fullName)},` : 'Hello,'
  return {
    subject: 'Your YouSafe attorney application is approved',
    html: `
<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111;">
  <p>${greeting}</p>
  <p>Your application to join the YouSafe attorney panel has been approved. You can now sign in and access the attorney dashboard:</p>
  <p><a href="https://portal.yousafeconsultancy.com/sign-in/attorney">portal.yousafeconsultancy.com/sign-in/attorney</a></p>
  <p>Welcome aboard.</p>
  <p>— YouSafe Consultancy</p>
</body></html>`.trim(),
  }
}

export function attorneyDeclineEmail(fullName: string): { subject: string; html: string } {
  const greeting = fullName ? `Hello ${escapeHtml(fullName)},` : 'Hello,'
  return {
    subject: 'Update on your YouSafe attorney application',
    html: `
<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111;">
  <p>${greeting}</p>
  <p>Thank you for applying to join the YouSafe attorney panel. After review, we are unable to accept your application at this time.</p>
  <p>If you believe this is in error or would like to discuss, contact <a href="mailto:support@yousafeconsultancy.com">support@yousafeconsultancy.com</a>.</p>
  <p>— YouSafe Consultancy</p>
</body></html>`.trim(),
  }
}

function escapeHtml(value: string): string {
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
  return {
    subject: `An attorney is reviewing your ${args.caseLabel || 'inquiry'}`,
    html: `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111">
<p>${greeting}</p>
<p><strong>${escapeHtml(args.attorneyName)}</strong> just opened your inquiry on MyCaseworks and sent you a message.</p>
<p><a href="${inquiryUrl(args.inquiryId)}">Open the conversation →</a></p>
<p>Other attorneys may also respond. You can compare offers and pick the one you want to engage.</p>
<p>— YouSafe Consultancy</p>
</body></html>`,
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
  return {
    subject: `New offer from ${args.attorneyName}`,
    html: `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111">
<p>${greeting}</p>
<p><strong>${escapeHtml(args.attorneyName)}</strong> sent you a custom offer:</p>
<p style="font-size:16px;margin:16px 0;padding:12px 16px;background:#f5f5f5;border-radius:8px">
<strong>${escapeHtml(args.offerTitle)}</strong><br>
Attorney fee: $${args.attorneyFee.toFixed(2)}<br>
Platform fee: $${args.platformFee.toFixed(2)}<br>
<strong>You pay: $${total.toFixed(2)}</strong>
</p>
<p>The attorney's fee is paid in full to them. The platform fee is shown separately and routed to MyCaseworks (per ABA Rule 5.4).</p>
<p><a href="${inquiryUrl(args.inquiryId)}">Review and accept →</a></p>
<p>— YouSafe Consultancy</p>
</body></html>`,
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
  return {
    subject: `Your offer was accepted`,
    html: `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111">
<p>${greeting}</p>
<p>${client} accepted your offer "<strong>${escapeHtml(args.offerTitle)}</strong>".</p>
<p>The full attorney fee of <strong>$${args.attorneyFee.toFixed(2)}</strong> will be transferred to your Stripe Connect account once Stripe settles the payment (typically 1–2 business days).</p>
<p><a href="${inquiryUrl(args.inquiryId)}">Open the engagement →</a></p>
<p>— YouSafe Consultancy</p>
</body></html>`,
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
  return {
    subject: `Your offer was declined`,
    html: `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111">
<p>${greeting}</p>
<p>${client} declined your offer "<strong>${escapeHtml(args.offerTitle)}</strong>". They may still be considering offers from other attorneys.</p>
<p><a href="${inquiryUrl(args.inquiryId)}">Open the conversation →</a></p>
<p>— YouSafe Consultancy</p>
</body></html>`,
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
  return {
    subject: `New message from ${args.clientName || 'a client'}`,
    html: `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111">
<p>${greeting}</p>
<p>${client} replied on an inquiry you're engaged with:</p>
<blockquote style="border-left:3px solid #ccc;margin:12px 0;padding-left:12px;color:#444">${escapeHtml(args.preview.slice(0, 240))}${args.preview.length > 240 ? '…' : ''}</blockquote>
<p><a href="${inquiryUrl(args.inquiryId)}">Open the conversation →</a></p>
<p>— YouSafe Consultancy</p>
</body></html>`,
  }
}
