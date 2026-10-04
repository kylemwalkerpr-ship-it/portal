import { createSupabaseAdminClient } from '@/lib/supabase'
import { handleOptions, jsonWithCors } from '@/lib/cors'
import { sendEmail } from '@/lib/email'
import { safetyGuard } from '@/lib/safety'
import { readAttributionToken } from '@/lib/attribution/cookies'
import { bindBusinessEvent } from '@/lib/attribution/engine'
import { classifyBusinessCluster } from '@/lib/attribution/source'
import {
  MAX_INQUIRY_BODY_BYTES,
  MAX_ANSWERS_BYTES,
  MAX_META_BYTES,
  INQUIRY_EMAIL_LIMIT_PER_HOUR,
  INQUIRY_IP_LIMIT_PER_HOUR,
  boundedObject,
  byteLength,
  clientIp,
  hashClientKey,
  isUuid,
  singleLine,
} from '@/lib/inquiryGuards'

const ACTIVE_STATUS_CAP = 10


type InquiryBody = {
  email?: string
  full_name?: string
  phone?: string
  country?: string
  case_type?: string
  case_type_label?: string
  urgency?: string
  recommended_tier?: string
  answers?: Record<string, unknown>
  meta?: Record<string, unknown>
  source?: string
  target_attorney_id?: string // attorneys.id when posted from an attorney profile
  // Legacy caseworks form payload — accept the nested `contact` shape too.
  contact?: { full_name?: string; email?: string; phone?: string; notes?: string }
  website?: string // honeypot from legacy form
}

const escapeHtml = (v: string): string =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const LEAD_ALERT_EMAIL = (): string => process.env.LEAD_ALERT_EMAIL || 'admin@yousafeconsultancy.com'

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
const clean = (v: unknown, max = 1000): string => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export async function OPTIONS(req: Request) {
  return handleOptions(req)
}

export async function POST(req: Request) {
  const declaredLength = Number(req.headers.get('content-length') || '0')
  if (declaredLength > MAX_INQUIRY_BODY_BYTES) {
    return jsonWithCors(req, { error: 'Request too large.' }, 413)
  }
  let body: InquiryBody
  try {
    const raw = await req.text()
    if (byteLength(raw) > MAX_INQUIRY_BODY_BYTES) {
      return jsonWithCors(req, { error: 'Request too large.' }, 413)
    }
    body = JSON.parse(raw) as InquiryBody
  } catch {
    return jsonWithCors(req, { error: 'Invalid JSON.' }, 400)
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonWithCors(req, { error: 'Invalid JSON.' }, 400)
  }

  // Honeypot — silently accept and drop.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return jsonWithCors(req, { ok: true }, 200)
  }

  const email = clean(body.email || body.contact?.email, 200).toLowerCase()
  const fullName = singleLine(clean(body.full_name || body.contact?.full_name, 200))
  const phone = clean(body.phone || body.contact?.phone, 60)

  if (!isEmail(email)) return jsonWithCors(req, { error: 'A valid email is required.' }, 400)
  if (!fullName) return jsonWithCors(req, { error: 'Full name is required.' }, 400)

  // Safety filter on the user-visible parts of the intake — block off-platform
  // contact attempts before they hit the marketplace feed. Notes field gets
  // the same treatment as a chat message would.
  {
    const blob = [body.case_type_label, body.urgency, body.contact?.notes, (body.meta as any)?.headline, (body.meta as any)?.summary]
      .filter((v) => typeof v === 'string')
      .join(' \n ')
    if (blob.trim()) {
      const s = safetyGuard(blob)
      if (!s.ok) {
        return jsonWithCors(req, { error: s.error, violations: s.violations }, 422)
      }
    }
  }

  const country = clean(body.country, 4).toUpperCase() || null
  const caseType = clean(body.case_type, 80) || null
  const caseLabel = clean(body.case_type_label, 200) || null
  const urgency = clean(body.urgency, 60) || null
  const recommendedTier = clean(body.recommended_tier, 60) || null

  const answersIn = boundedObject(body.answers, MAX_ANSWERS_BYTES)
  const metaBounded = boundedObject(body.meta, MAX_META_BYTES)
  if (!answersIn || !metaBounded) {
    return jsonWithCors(req, { error: 'Intake answers are too large.' }, 413)
  }
  const answers = { ...answersIn } as Record<string, unknown>
  const metaIn = metaBounded as Record<string, unknown>
  if (body.target_attorney_id != null && body.target_attorney_id !== '' && !isUuid(body.target_attorney_id)) {
    return jsonWithCors(req, { error: 'Invalid attorney reference.' }, 400)
  }
  const ip = clientIp(req)
  const ipHash = ip ? await hashClientKey(ip) : null

  // Capture some request-level context for debugging / analytics.
  const meta = {
    ...metaIn,
    referer: req.headers.get('referer')?.slice(0, 500) ?? null,
    ua: req.headers.get('user-agent')?.slice(0, 300) ?? null,
    ip_country: req.headers.get('cf-ipcountry')?.slice(0, 4) ?? null,
    ip_hash: ipHash,
  }
  if (body.contact?.notes) {
    answers['_intake_notes'] = clean(body.contact.notes, 4000)
  }

  const db = createSupabaseAdminClient()

  // Abuse limits: the endpoint is public and emails the supplied address, so
  // cap submissions per email and per (hashed) client IP over a rolling hour.
  {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count: emailCount } = await db
      .from('inquiries')
      .select('id', { count: 'exact', head: true })
      .eq('email', email)
      .gte('created_at', since)
    let ipCount = 0
    if (ipHash) {
      const { count } = await db
        .from('inquiries')
        .select('id', { count: 'exact', head: true })
        .eq('meta->>ip_hash', ipHash)
        .gte('created_at', since)
      ipCount = count ?? 0
    }
    if ((emailCount ?? 0) >= INQUIRY_EMAIL_LIMIT_PER_HOUR || ipCount >= INQUIRY_IP_LIMIT_PER_HOUR) {
      return jsonWithCors(req, { error: 'Too many requests. Please wait a while before sending another inquiry.' }, 429)
    }
  }

  // If a profile already exists for this email, link it; otherwise leave null
  // and let it be backfilled on first sign-in.
  const { data: existingProfile } = await db
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  // 10-active-statuses cap per buyer (HANDOFF.md §4b). When the buyer is a
  // known profile, count current non-expired statuses and 429 if at the cap.
  // Unknown emails skip this — they can't have statuses anyway.
  if (existingProfile?.id) {
    const { count: activeCount } = await db
      .from('inquiry_statuses')
      .select('id', { count: 'exact', head: true })
      .eq('person_id', existingProfile.id)
      .gt('expires_at', new Date().toISOString())
    if ((activeCount ?? 0) >= ACTIVE_STATUS_CAP) {
      return jsonWithCors(req, {
        error: `You already have ${ACTIVE_STATUS_CAP} active inquiry broadcasts. Wait for some to expire (24h) or close an existing one before posting another.`,
      }, 429)
    }
  }

  // Resolve target attorney (when student is posting from a specific attorney's profile).
  let targetAttorneyProfileId: string | null = null
  if (body.target_attorney_id) {
    const { data: target } = await db
      .from('attorneys')
      .select('profile_id')
      .eq('id', body.target_attorney_id)
      .maybeSingle()
    targetAttorneyProfileId = target?.profile_id ?? null
  }

  const { data: inquiry, error } = await db
    .from('inquiries')
    .insert({
      client_profile_id: existingProfile?.id ?? null,
      email,
      full_name: fullName,
      phone: phone || null,
      country,
      case_type: caseType,
      case_type_label: caseLabel,
      urgency,
      recommended_tier: recommendedTier,
      answers,
      meta,
      source: clean(body.source, 60) || 'caseworks',
      target_attorney_profile_id: targetAttorneyProfileId,
    })
    .select('id, access_token')
    .single()

  if (error || !inquiry) {
    console.error('[inquiries] insert failed', error?.message)
    return jsonWithCors(req, { error: 'Could not save your inquiry. Please try again.' }, 500)
  }

  // ── P10 conversion attribution (trusted server binder) ───────────────────
  // The inquiry row above is a real, durable lead. It is recorded as a
  // server-observed business event: the browser never declares it, and when no
  // consented attribution session was presented the lead is stored with
  // attribution_state='unknown_source' instead of an invented source. The binder
  // is idempotent per inquiry id and never throws, so a telemetry problem cannot
  // fail a lead that a client is waiting on.
  await bindBusinessEvent(db, {
    eventType: 'lead_created',
    subjectType: 'inquiry',
    subjectId: inquiry.id,
    cluster: classifyBusinessCluster({ caseType }),
    occurredAt: new Date().toISOString(),
    token: readAttributionToken(req),
    evidence: {
      verification: 'inquiry_row_persisted',
      country: country ?? null,
      case_type: caseType ?? null,
      intake_source: clean(body.source, 60) || 'caseworks',
    },
  })

  // Drop a 24h status broadcast row for any buyer who has a profile so the
  // marketplace status ring lights up. Best-effort — if the table isn't
  // applied yet (migration pending) we swallow the error and keep going.
  if (existingProfile?.id) {
    try {
      await db.from('inquiry_statuses').insert({
        person_id:  existingProfile.id,
        kind:       'inquiry',
        inquiry_id: inquiry.id,
        payload: {
          country_flag:    country,
          case_type_label: caseLabel,
          urgency,
          headline:        (metaIn as any)?.headline ?? null,
        },
      })
    } catch (e) {
      console.warn('[inquiries] status broadcast skipped', (e as Error)?.message)
    }
  }

  // Lead notifications. Best-effort: an email problem must never fail a lead
  // the buyer is waiting on. General (non-targeted) inquiries previously
  // emailed nobody, so new public leads sat unseen in the table.
  {
    const safeName = escapeHtml(fullName)
    const safeCase = escapeHtml(caseLabel ?? caseType ?? 'Not specified')
    const intakeSource = clean(body.source, 60) || 'caseworks'
    if (!targetAttorneyProfileId) {
      try {
        await sendEmail({
          to: LEAD_ALERT_EMAIL(),
          subject: singleLine(`New lead: ${caseLabel ?? caseType ?? 'case inquiry'}${country ? ` (${country})` : ''}`),
          html: `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111">
<p><strong>${safeName}</strong> (${escapeHtml(email)}${phone ? `, ${escapeHtml(phone)}` : ''}) submitted a free case intake.</p>
<p><strong>Case type:</strong> ${safeCase}<br/><strong>Country:</strong> ${escapeHtml(country ?? 'Not specified')}<br/><strong>Urgency:</strong> ${escapeHtml(urgency ?? 'Not specified')}<br/><strong>Recommended tier:</strong> ${escapeHtml(recommendedTier ?? 'n/a')}<br/><strong>Source:</strong> ${escapeHtml(intakeSource)}</p>
<p><a href="https://portal.yousafeconsultancy.com/dashboard?inquiry=${inquiry.id}">Open the inquiry →</a></p>
<p>Reply with a fixed-fee offer quickly; speed to first offer is the biggest driver of conversion.</p>
</body></html>`,
        })
      } catch (e) {
        console.error('[inquiries] lead alert failed', (e as Error)?.message)
      }
    }
    try {
      await sendEmail({
        to: email,
        subject: 'We received your case: YouSafe Consultancy',
        html: `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111">
<p>Hi ${safeName},</p>
<p>Thanks for telling us about your case (${safeCase}). A provider on the YouSafe Marketplace will review it and reply with a fixed-fee offer. We'll email you as soon as they do.</p>
<p>Nothing is charged until you accept an offer, and payment is held in escrow until you approve the work.</p>
<p>Create a free account to follow replies and message your provider: <a href="https://market.yousafeconsultancy.com/?ys_sign_up=1&amp;intent=client">market.yousafeconsultancy.com</a></p>
<p style="color:#555;font-size:12px">YouSafe Consultancy provides document preparation and education services and operates a marketplace. It is not a law firm and does not guarantee any visa, permit, or application outcome.</p>
</body></html>`,
      })
    } catch (e) {
      console.error('[inquiries] buyer confirmation failed', (e as Error)?.message)
    }
  }

  // Targeted-attorney path: log a system message and send a direct email so the
  // attorney sees this in their queue immediately.
  if (targetAttorneyProfileId) {
    const { data: attorney } = await db
      .from('profiles')
      .select('email, full_name')
      .eq('id', targetAttorneyProfileId)
      .single()

    await db.from('inquiry_messages').insert({
      inquiry_id: inquiry.id,
      sender_role: 'system',
      sender_profile_id: existingProfile?.id ?? null,
      body: `${fullName} sent this inquiry directly to ${attorney?.full_name || 'you'}.`,
    })

    if (attorney?.email) {
      try {
        const inquiryUrl = `https://portal.yousafeconsultancy.com/dashboard?inquiry=${inquiry.id}`
        const greeting = attorney.full_name ? `Hello ${escapeHtml(attorney.full_name)},` : 'Hello,'
        await sendEmail({
          to: attorney.email,
          subject: `Direct inquiry from ${fullName}`,
          html: `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111">
<p>${greeting}</p>
<p><strong>${escapeHtml(fullName)}</strong> just sent you a direct inquiry from your YouSafe profile.</p>
<p><strong>Case type:</strong> ${escapeHtml(caseLabel ?? caseType ?? 'Not specified')}</p>
${urgency ? `<p><strong>Urgency:</strong> ${escapeHtml(urgency)}</p>` : ''}
<p><a href="${inquiryUrl}">Open in your inbox queue →</a></p>
<p>— YouSafe Consultancy</p>
</body></html>`,
        })
      } catch (e) {
        console.error('[inquiries] target-attorney notify failed', e)
      }
    }
  }

  return jsonWithCors(req, { id: inquiry.id, access_token: inquiry.access_token, ok: true }, 200)
}
