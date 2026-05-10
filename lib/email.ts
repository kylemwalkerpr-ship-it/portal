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
