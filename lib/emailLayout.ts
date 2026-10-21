// Shared YouSafe "v11" email layout (Kyle-approved canonical design, 2026-10-16).
// Source of truth: B&O Desk templates/html/_canonical.html. Transactional mail
// uses this layout WITHOUT the rule-28 solicitation / outreach opt-out lines.
//
// Images are hosted on the landing site (Resend sends plain HTML here, no CID).
// They must exist under https://yousafeconsultancy.com/email/ before go-live:
// band-v10.jpg, logo-email.png, icon-web-v8.png, icon-phone-v8.png.

export const EMAIL_ASSET_BASE = 'https://yousafeconsultancy.com/email'

export const EMAIL_ASSETS = {
  band: `${EMAIL_ASSET_BASE}/band-v10.jpg`,
  logo: `${EMAIL_ASSET_BASE}/logo-email.png`,
  iconWeb: `${EMAIL_ASSET_BASE}/icon-web-v8.png`,
  iconPhone: `${EMAIL_ASSET_BASE}/icon-phone-v8.png`,
} as const

export const BYLINE = 'Walking beside you, with dignity and care, from your first form to the place you call home'

export type EmailLayoutArgs = {
  /** Trusted, already-escaped HTML for the message body. */
  bodyHtml: string
  /** Optional single primary call to action. Label and href are escaped here. */
  cta?: { label: string; href: string }
  /** Name shown under "Yours truly,". Defaults to "YouSafe Consultancy". */
  signer?: string
  /** Signer photo URL. Defaults to the YouSafe logo. */
  signerImage?: string
  /** Trusted HTML small-print lines placed in the footer (disclaimers, unsubscribe). */
  footerHtml?: string[]
  /** Hidden inbox preview text. */
  preheader?: string
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const P = 'margin:0 0 16px 0;'

/** Applies v11 body typography to bare <p>, <ol>, <ul>, <blockquote> tags. */
function styleBody(html: string): string {
  return html
    .replace(/<p>/g, `<p style="${P}">`)
    .replace(/<ol>/g, '<ol style="margin:0 0 16px 0;padding-left:22px;">')
    .replace(/<ul>/g, '<ul style="margin:0 0 16px 0;padding-left:22px;">')
    .replace(/<a href=/g, '<a style="color:#3a6b52;" href=')
}

export function renderEmailLayout(args: EmailLayoutArgs): string {
  const signer = esc(args.signer ?? 'YouSafe Consultancy')
  const signerImage = esc(args.signerImage ?? EMAIL_ASSETS.logo)
  const signerOrg = signer === 'YouSafe Consultancy'
    ? '<div style="height:6px;line-height:6px;font-size:0;">&nbsp;</div>'
    : '<p style="margin:2px 0 6px 0;font-size:13px;line-height:1.4;color:#596b67;font-family:Helvetica,Arial,sans-serif;">YouSafe Consultancy</p>'
  const preheader = esc(args.preheader ?? 'YouSafe Consultancy')
  const cta = args.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:36px 0 36px 0;"><tr><td align="left" bgcolor="#397657" style="border-radius:8px;background-color:#397657;"><a class="ys-cta" href="${esc(args.cta.href)}" target="_blank" style="display:inline-block;background-color:#397657;color:#ffffff;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1.3;padding:14px 26px;border-radius:8px;text-decoration:none;">${esc(args.cta.label)}&nbsp;&rarr;</a></td></tr></table>`
    : '<div style="height:20px;line-height:20px;font-size:0;">&nbsp;</div>'
  const small = (args.footerHtml ?? [])
    .map((l) => `<p style="margin:0 0 6px 0;font-size:12px;line-height:1.6;color:#596b67;font-family:Helvetica,Arial,sans-serif;">${l}</p>`)
    .join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<title>YouSafe Consultancy</title>
<style type="text/css">
  @media only screen and (max-width:620px) { .ys-card { width:100% !important; } .ys-pad { padding-left:22px !important; padding-right:22px !important; } .ys-outer { padding:0 !important; } .ys-cta { font-size:14px !important; padding:13px 18px !important; } .ys-band img { width:100% !important; height:auto !important; } }
</style>
</head>
<body style="margin:0;padding:0;background-color:#e8efe9;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#e8efe9;">${preheader}&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#e8efe9" style="background-color:#e8efe9;">
<tr><td align="center" class="ys-outer" style="padding:32px 12px 40px 12px;">
<table role="presentation" class="ys-card" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#fffdf8" style="width:100%;max-width:600px;background-color:#fffdf8;border:3px solid #9db8a4;border-radius:10px;overflow:hidden;">
<tr><td class="ys-band" style="padding:0;font-size:0;line-height:0;"><img src="${EMAIL_ASSETS.band}" alt="" width="600" height="180" style="display:block;width:600px;max-width:100%;height:auto;border:0;" /></td></tr>
<tr><td class="ys-pad" style="padding:6px 44px 0 44px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle" width="52" style="width:52px;padding:0 14px 0 0;"><a href="https://yousafeconsultancy.com/" style="text-decoration:none;border:0;"><img src="${EMAIL_ASSETS.logo}" alt="YouSafe Consultancy" width="52" height="52" style="display:block;width:52px;height:52px;border:0;" /></a></td>
<td valign="middle" style="font-family:Helvetica,Arial,sans-serif;"><p style="margin:0;font-size:15px;line-height:1.3;font-weight:700;color:#28543f;letter-spacing:0.2px;">YouSafe Consultancy</p><p style="margin:4px 0 0 0;font-size:14px;line-height:1.4;font-style:italic;color:#a8566a;letter-spacing:0.3px;font-family:'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif;">${BYLINE}</p></td>
</tr></table>
</td></tr>
<tr><td class="ys-pad" style="padding:22px 44px 0 44px;"><div style="height:1px;line-height:1px;font-size:0;background-color:#e3ebe2;">&nbsp;</div></td></tr>
<tr><td class="ys-pad" style="padding:30px 44px 36px 44px;word-wrap:break-word;">
<div style="font-size:17px;line-height:1.65;color:#1d3039;font-family:Georgia,'Times New Roman',serif;">${styleBody(args.bodyHtml)}</div>
${cta}
<p style="margin:0 0 6px 0;font-size:15px;line-height:1.7;color:#1d2433;font-family:Georgia,'Times New Roman',serif;">Yours truly,</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 0 0;"><tr>
<td valign="middle" width="64" style="width:64px;padding:0 14px 0 0;"><img src="${signerImage}" alt="${signer}" width="64" height="64" style="display:block;width:64px;height:64px;border:0;border-radius:32px;" /></td>
<td valign="middle"><p style="margin:0;font-size:17px;line-height:1.4;color:#1d3039;font-family:Georgia,'Times New Roman',serif;"><strong>${signer}</strong></p>${signerOrg}
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="20" valign="middle" style="padding:0 8px 6px 0;width:20px;"><a href="https://www.yousafeconsultancy.com" style="text-decoration:none;border:0;"><img src="${EMAIL_ASSETS.iconWeb}" alt="Website" width="20" height="20" style="display:block;width:20px;height:20px;border:0;" /></a></td><td valign="middle" style="padding:0 0 6px 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;"><a href="https://www.yousafeconsultancy.com" style="color:#3a6b52;text-decoration:none;">www.yousafeconsultancy.com</a></td></tr>
<tr><td width="20" valign="middle" style="padding:0 8px 0 0;width:20px;"><a href="tel:+17572027249" style="text-decoration:none;border:0;"><img src="${EMAIL_ASSETS.iconPhone}" alt="Phone" width="20" height="20" style="display:block;width:20px;height:20px;border:0;" /></a></td><td valign="middle" style="font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;"><a href="tel:+17572027249" style="color:#3a6b52;text-decoration:none;">+1 (757) 202-7249</a></td></tr></table>
</td>
</tr></table>
</td></tr>
<tr><td class="ys-pad" style="padding:24px 44px 28px 44px;background-color:#eef3ee;">
<p style="margin:0 0 14px 0;font-size:14px;line-height:1.5;color:#596b67;font-style:italic;font-family:'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif;">&ldquo;A journey of a thousand miles starts with a single step.&rdquo;&nbsp;&mdash;&nbsp;Laozi</p>
${small}<p style="margin:0;font-size:12px;line-height:1.6;color:#596b67;font-family:Helvetica,Arial,sans-serif;">YouSafe Consultancy · 906 Donne Court, Virginia Beach, VA 23462, USA</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}
