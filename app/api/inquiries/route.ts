import { createSupabaseAdminClient } from '@/lib/supabase'
import { handleOptions, jsonWithCors } from '@/lib/cors'


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
    })
    .select('id, access_token')
    .single()

  if (error || !inquiry) {
    console.error('[inquiries] insert failed', error?.message)
    return jsonWithCors(req, { error: 'Could not save your inquiry. Please try again.' }, 500)
  }

  return jsonWithCors(req, { id: inquiry.id, access_token: inquiry.access_token, ok: true }, 200)
}
