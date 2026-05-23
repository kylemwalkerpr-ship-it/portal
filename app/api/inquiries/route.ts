import { createSupabaseAdminClient } from '@/lib/supabase'
import { handleOptions, jsonWithCors } from '@/lib/cors'
import { sendEmail } from '@/lib/email'
import { safetyGuard } from '@/lib/safety'

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

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
const clean = (v: unknown, max = 1000): string => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export async function OPTIONS(req: Request) {
  return handleOptions(req)
}

export async function POST(req: Request) {
  let body: InquiryBody
  try {
    body = (await req.json()) as InquiryBody
  } catch {
    return jsonWithCors(req, { error: 'Invalid JSON.' }, 400)
  }

  // Honeypot — silently accept and drop.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return jsonWithCors(req, { ok: true }, 200)
  }

  const email = clean(body.email || body.contact?.email, 200).toLowerCase()
  const fullName = clean(body.full_name || body.contact?.full_name, 200)
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

  const answers = (body.answers && typeof body.answers === 'object' ? body.answers : {}) as Record<string, unknown>
  const metaIn = (body.meta && typeof body.meta === 'object' ? body.meta : {}) as Record<string, unknown>

  // Capture some request-level context for debugging / analytics.
  const meta = {
    ...metaIn,
    referer: req.headers.get('referer') ?? null,
    ua: req.headers.get('user-agent') ?? null,
    ip_country: req.headers.get('cf-ipcountry') ?? null,
  }
  if (body.contact?.notes) {
    answers['_intake_notes'] = clean(body.contact.notes, 4000)
  }

  const db = createSupabaseAdminClient()

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
        const greeting = attorney.full_name ? `Hello ${attorney.full_name},` : 'Hello,'
        await sendEmail({
          to: attorney.email,
          subject: `Direct inquiry from ${fullName}`,
          html: `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111">
<p>${greeting}</p>
<p><strong>${fullName}</strong> just sent you a direct inquiry from your YouSafe profile.</p>
<p><strong>Case type:</strong> ${caseLabel ?? caseType ?? 'Not specified'}</p>
${urgency ? `<p><strong>Urgency:</strong> ${urgency}</p>` : ''}
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
