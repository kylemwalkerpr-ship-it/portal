import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'
import { getChatProvider } from '@/lib/chatProvider'

// AI-assisted COMPLIANCE GUIDANCE. Strictly read-only:
// - The model is forbidden from generating values for any compliance
//   field. It cannot draft a bar number, an insurance carrier, a
//   jurisdiction list, or anything else that would be a factual
//   credential claim.
// - The only outputs the model produces are explanations of what the
//   field requires, who issues it, where to find it, and a verbatim
//   recipe of steps the seller should take with their own real
//   documents. No fabricated identifiers, no fabricated URLs.
//
// Two modes:
//   { mode: 'explain', itemId } → 2–4 sentence plain-language
//     explanation of what the field is and where the seller's real
//     value lives (e.g. "Your bar admission card; lookups vary by
//     state — search '<state> attorney lookup'"). NEVER invents
//     specifics.
//   { mode: 'checklist', credentialType, jurisdictions } → a list
//     of documents the seller will eventually need to upload, in
//     plain language. Each bullet is generic to the credential
//     type — not personalised with fabricated identifiers.

const ALLOWED_ITEMS = new Set([
  'email', 'phone', 'two_factor', 'application', 'credential_type',
  'bar_number', 'malpractice', 'jurisdictions', 'payout', 'accepting',
])

const ITEM_BRIEFS: Record<string, { attorney: string; consultant: string }> = {
  email: {
    attorney: 'Email verification — the verification link YouSafe sent at signup. Explain what to do if they never received it (check spam, request resend from the dashboard). Do NOT generate the link or any verification code.',
    consultant: 'Email verification — the verification link YouSafe sent at signup. Explain what to do if they never received it (check spam, request resend). Do NOT generate the link or any verification code.',
  },
  phone: {
    attorney: 'Phone verification — confirms the seller controls a phone number where YouSafe can reach them for SMS notifications and two-factor auth (TOTP recommended on top). Explain: open the Phone verification card on this page, enter their number with country code, enter the 6-digit SMS code, done. Note SMS rates vary by carrier. Do NOT generate a phone number or verification code.',
    consultant: 'Phone verification — confirms the seller controls a phone number where YouSafe can reach them for SMS notifications and two-factor auth (TOTP recommended on top). Explain: open the Phone verification card on this page, enter their number with country code, enter the 6-digit SMS code, done. Note SMS rates vary by carrier. Do NOT generate a phone number or verification code.',
  },
  two_factor: {
    attorney: 'Two-factor authentication via authenticator app (TOTP) — Google Authenticator, 1Password, Authy, etc. Explain: open the Two-factor card on this page, scan the QR with their app, type the 6-digit code, save the backup codes shown ONCE. Strongly recommended for attorneys because access to client documents requires elevated protection. Do NOT generate a TOTP secret, QR code, or backup codes.',
    consultant: 'Two-factor authentication via authenticator app (TOTP) — Google Authenticator, 1Password, Authy, etc. Explain: open the Two-factor card on this page, scan the QR with their app, type the 6-digit code, save the backup codes shown ONCE. Strongly recommended for consultants because access to client documents requires elevated protection. Do NOT generate a TOTP secret, QR code, or backup codes.',
  },
  application: {
    attorney: 'Attorney application status — the seller submitted an application that an admin reviews manually. Explain that "Pending admin review" means a human is checking the materials, typical turnaround 1–3 business days. If "Not started", direct them to /dashboard/attorney/intake.',
    consultant: 'Consultant application status — the seller submitted an application that an admin reviews manually, checking their stated credentials and experience. Explain that "Pending admin review" means a human is verifying the materials, typical turnaround 1–3 business days. If "Not started", direct them to /dashboard/consultant/intake.',
  },
  credential_type: {
    attorney: 'Credential type — the legal-services category the attorney is admitted to practice in: J.D. (US bar admission), barrister/solicitor (UK), advocate (CA). Explain the difference and that the seller picks the ONE they hold. Do NOT recommend a specific value.',
    consultant: 'Credential type — professional certification, degree, or affiliation that establishes credibility (e.g. MBA, certified career coach, licensed teacher, notary public). Explain that the seller must pick credentials they actually hold. Do NOT recommend a specific value.',
  },
  bar_number: {
    attorney: 'Bar / roll number — a unique identifier issued by the bar association the attorney is admitted to. Explain where it lives on their bar admission card / membership letter, and that public lookup tools vary by jurisdiction ("search <jurisdiction> attorney lookup" or "<state> bar attorney search"). Do NOT generate a number, do NOT guess what their lookup URL is. If they don\'t have one yet, point them to the bar association in their jurisdiction.',
    consultant: 'Membership / certification number — issued by their credentialing body, university, or professional association. Explain where it usually appears on their certificate or renewal letter. Do NOT generate a number.',
  },
  malpractice: {
    attorney: 'Malpractice / professional liability insurance — required disclosure. Explain that the seller needs the carrier name + policy number + coverage limits, all from their declarations page. The disclosure is for verification only; YouSafe does not publish the details to buyers. Do NOT generate a carrier or policy number.',
    consultant: 'Errors & omissions insurance — equivalent to attorney malpractice insurance. Carrier + policy number + coverage limits from the declarations page. Do NOT generate any of these values.',
  },
  jurisdictions: {
    attorney: 'Jurisdictions — the bars / courts the attorney is admitted to practice in. Must match the bar admissions on file; listing a jurisdiction they\'re NOT admitted to is unauthorized practice of law and a grounds for removal. Direct them to set this on /dashboard/profile. Do NOT recommend specific jurisdictions.',
    consultant: 'Countries / regions — where the consultant primarily works with clients. For example: United States, Canada, United Kingdom. Explain that they should only list regions they actually serve. Do NOT recommend specific countries.',
  },
  payout: {
    attorney: 'Payout setup — currently manual via admin. Explain that earnings are released through admin once an order is approved by the buyer; no bank details are needed today. Do NOT promise dates.',
    consultant: 'Same as attorney — manual payouts via admin.',
  },
  accepting: {
    attorney: 'Accepting new clients — a visibility toggle. When paused, the profile is hidden from buyer search results and existing gigs go to draft. Explain that this is the right control for vacation / capacity limits. Found on /dashboard/profile.',
    consultant: 'Same as attorney — visibility toggle controlling whether new buyers can find / order from the seller. Found on /dashboard/profile.',
  },
}

const SYSTEM_PROMPT = [
  'You are a compliance guide for an attorney/consultant marketplace.',
  'You ONLY explain what a compliance field requires, who issues it, and where the seller can find their own real value.',
  'You NEVER generate bar numbers, insurance policy numbers, jurisdiction lists, credentials, URLs to lookup tools you don\'t already have in context, or any other identifier.',
  'You never claim a seller is or isn\'t admitted to a bar/regulatory body — that\'s a factual claim only the seller can make.',
  'You never invent legal advice or claim to verify documents.',
  'Plain language. 2–4 sentences for explanations. No emoji. No markdown bullets unless explicitly asked.',
  'When the user is in checklist mode, list document names ONLY (no specifics) — e.g. "Bar admission card", "Malpractice declarations page", "Government-issued photo ID". Do NOT include policy numbers or dates.',
].join(' ')

async function callModel(system: string, user: string): Promise<string> {
  const provider = getChatProvider()
  if (!provider) {
    throw Object.assign(new Error('AI assistant is not configured. Add GROQ_API_KEY or GEMINI_API_KEY to enable.'), { status: 503 })
  }
  return await provider.reply(system, [{ role: 'user', content: user }])
}

export async function POST(req: Request) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  if (!['attorney', 'consultant'].includes(auth.role)) {
    return fail('Compliance guidance is only for attorneys and consultants.', 403)
  }
  const role = auth.role as 'attorney' | 'consultant'

  const body = await req.json().catch(() => ({}))
  const mode = String(body.mode || '')

  try {
    if (mode === 'explain') {
      const itemId = String(body.itemId || '')
      if (!ALLOWED_ITEMS.has(itemId)) return fail('Unknown compliance item.', 400)
      const brief = ITEM_BRIEFS[itemId][role]
      const userMessage = [
        `Explain the "${itemId}" compliance item for a ${role}.`,
        'Brief you must follow exactly:',
        brief,
        '',
        'Constraints:',
        '- Do NOT generate any specific identifier (bar number, policy number, URL).',
        '- Do NOT speculate about THIS seller\'s status — only generic guidance.',
        '- 2–4 sentences total. Plain prose. No headings, no markdown bullets.',
      ].join('\n')
      const reply = await callModel(SYSTEM_PROMPT, userMessage)
      return ok({ mode, itemId, text: reply.trim().slice(0, 800) })
    }

    if (mode === 'checklist') {
      // Read the seller's own credential type + jurisdictions from their
      // application/provider row — never accept these from the client
      // payload so the client can't ask "give me a checklist for
      // California" without actually being admitted to California.
      const appTable = role === 'attorney' ? 'attorney_applications' : 'consultant_applications'
      const { data: appRow } = await auth.db
        .from(appTable)
        .select('credential_type')
        .eq('profile_id', auth.profileId)
        .order('decided_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle()
      const providerTable = role === 'attorney' ? 'attorneys' : 'consultants'
      const { data: providerRow } = await auth.db
        .from(providerTable)
        .select('jurisdictions')
        .eq('profile_id', auth.profileId)
        .maybeSingle()

      const credentialType = (appRow?.credential_type || '').toString().trim()
      const jurisdictions = (providerRow?.jurisdictions || '').toString().trim()
      if (!credentialType && !jurisdictions) {
        return fail('Pick a credential type and jurisdictions on your application/profile first — the checklist is built from those.', 400)
      }
      const userMessage = [
        `Draft a document-upload checklist for a ${role}.`,
        '',
        'Their REAL credential type and jurisdictions (do not change these):',
        `- Credential type: ${credentialType || '(unspecified)'}`,
        `- Jurisdictions: ${jurisdictions || '(unspecified)'}`,
        '',
        'Output rules:',
        '- 4–7 bullets, each on its own line, each starting with "- " (hyphen + space).',
        '- Each bullet is a DOCUMENT NAME ONLY (e.g. "Bar admission card", "Malpractice declarations page", "Annual renewal certificate"). NO numbers, NO dates, NO carrier names.',
        '- Adjust to the jurisdiction in obvious ways (e.g. "Bar admission card" in the US, "Practising certificate" in the UK, "CICC R-number certificate" for Canadian consultants).',
        '- Do NOT promise that uploading these will get them approved — that\'s an admin decision.',
        '- No emoji. No headings. Return ONLY the bullets.',
      ].join('\n')
      const reply = await callModel(SYSTEM_PROMPT, userMessage)
      const bullets = reply
        .split(/\r?\n/g)
        .map((l) => l.replace(/^[\s\-•*·\d.)\]]+/, '').replace(/^["'`]+|["'`]+$/g, '').trim())
        .filter((l) => l.length >= 3 && l.length <= 140)
        .slice(0, 8)
      if (!bullets.length) return fail('Model returned no usable bullets. Try again.', 502)
      return ok({ mode, items: bullets })
    }

    return fail('Unknown mode.', 400)
  } catch (e) {
    const status = (e as { status?: number }).status
    const msg = e instanceof Error ? e.message : 'AI guidance failed.'
    return fail(msg, typeof status === 'number' ? status : 502)
  }
}
