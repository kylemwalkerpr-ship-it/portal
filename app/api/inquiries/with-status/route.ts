import { ok, fail } from '@/lib/apiEnvelope'
import { requireClient } from '@/lib/clientAuth'
import { safetyGuard } from '@/lib/safety'
import { recommendTier } from '@/lib/intake-questions'

const ACTIVE_STATUS_CAP = 10

function clean(value: unknown, max = 1000): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export async function POST(req: Request) {
  const auth = await requireClient()
  if (auth.error) return fail(auth.error, auth.status || 400)
  const { ctx } = auth
  if (!ctx) return fail('Unauthorized.', 401)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return fail('Invalid JSON.', 400)
  }

  const country = clean(body.country, 4).toUpperCase() || null
  const caseType = clean(body.case_type, 80) || null
  const caseTypeLabel = clean(body.case_type_label, 200) || null
  const headline = clean(body.headline, 120)
  const summary = clean(body.summary, 400)
  const answers = (body.answers && typeof body.answers === 'object' ? body.answers : {}) as Record<string, unknown>

  if (!country) return fail('Country is required.', 422)
  if (!caseType) return fail('Case type is required.', 422)
  if (headline.length < 5) return fail('Headline must be at least 5 characters.', 422)

  // Safety filter on headline + summary
  const scanText = `${headline} ${summary}`.trim()
  if (scanText) {
    const s = safetyGuard(scanText)
    if (!s.ok) {
      return fail(s.error || 'Message blocked by safety filter.', 422, { violations: s.violations })
    }
  }

  // 10-active-statuses cap
  const { count: activeCount } = await ctx.db
    .from('inquiry_statuses')
    .select('id', { count: 'exact', head: true })
    .eq('person_id', ctx.profileId)
    .gt('expires_at', new Date().toISOString())

  if ((activeCount ?? 0) >= ACTIVE_STATUS_CAP) {
    return fail(
      `You already have ${ACTIVE_STATUS_CAP} active inquiry broadcasts. Wait for some to expire (24h) or close an existing one before posting another.`,
      429,
    )
  }

  const tier = recommendTier(country as any, caseType, answers as any)

  // Insert inquiry
  const { data: inquiry, error: inquiryErr } = await ctx.db
    .from('inquiries')
    .insert({
      client_profile_id: ctx.profileId,
      email: ctx.email,
      full_name: ctx.fullName,
      country,
      case_type: caseType,
      case_type_label: caseTypeLabel,
      urgency: clean(answers.urgency as string, 60) || null,
      recommended_tier: tier.tier,
      answers,
      source: 'messenger_composer',
    })
    .select('id')
    .single()

  if (inquiryErr || !inquiry) {
    return fail(inquiryErr?.message || 'Could not save inquiry.', 500)
  }

  // Insert status broadcast (atomic: delete inquiry if this fails)
  const { data: statusRow, error: statusErr } = await ctx.db
    .from('inquiry_statuses')
    .insert({
      person_id: ctx.profileId,
      kind: 'inquiry',
      inquiry_id: inquiry.id,
      payload: {
        country_flag: country,
        case_type_label: caseTypeLabel,
        urgency: answers.urgency,
        tier: tier.tier,
        headline,
      },
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    .select('id')
    .single()

  if (statusErr || !statusRow) {
    // Rollback: delete the inquiry row to keep atomic
    await ctx.db.from('inquiries').delete().eq('id', inquiry.id)
    return fail(statusErr?.message || 'Could not publish status broadcast.', 500)
  }

  return ok({ inquiry_id: inquiry.id, status_id: statusRow.id })
}
