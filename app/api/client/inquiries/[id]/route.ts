import { requireClient } from '@/lib/clientAuth'
import { ok, fail } from '@/lib/apiEnvelope'
import { safetyGuard } from '@/lib/safety'
// intake-questions (~1k lines of static question data) is lazy-loaded at the
// point of use to keep its evaluation cost off the worker cold-start path.

// Returns the inquiry + a per-attorney thread structure:
//   threads: [{ attorney_id, attorney_profile_id, attorney_name, messages, offers }]
// plus client-side messages (interleaved into threads on the frontend).
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { ctx, error, status } = await requireClient()
  if (!ctx) return Response.json({ error }, { status })

  const { id } = await context.params

  const { data: inquiry } = await ctx.db
    .from('inquiries')
    .select('id, email, full_name, country, case_type, case_type_label, urgency, recommended_tier, answers, status, claimed_by_attorney_id, claimed_at, client_profile_id, created_at')
    .eq('id', id)
    .single()

  if (!inquiry) return Response.json({ error: 'Inquiry not found.' }, { status: 404 })

  const ownsByProfile = inquiry.client_profile_id === ctx.profileId
  const ownsByEmail = inquiry.email === ctx.email
  if (!ownsByProfile && !ownsByEmail) {
    return Response.json({ error: 'Forbidden.' }, { status: 403 })
  }
  if (!ownsByProfile && ownsByEmail) {
    await ctx.db.from('inquiries').update({ client_profile_id: ctx.profileId }).eq('id', id)
  }

  const [{ data: messages }, { data: offers }] = await Promise.all([
    ctx.db
      .from('inquiry_messages')
      .select('id, sender_role, sender_profile_id, body, created_at')
      .eq('inquiry_id', id)
      .order('created_at', { ascending: true }),
    ctx.db
      .from('attorney_offers')
      .select('id, attorney_id, attorney_profile_id, title, description, price, platform_fee, platform_fee_percent_snapshot, currency, delivery_days, status, expires_at, decided_at, order_id, created_at')
      .eq('inquiry_id', id)
      .order('created_at', { ascending: false }),
  ])

  // Group attorney messages + offers by attorney_profile_id. Client messages
  // are kept on the inquiry root; each thread shows them interleaved.
  const attorneyProfileIds = new Set<string>()
  for (const m of messages ?? []) {
    if (m.sender_role === 'attorney' && m.sender_profile_id) attorneyProfileIds.add(m.sender_profile_id)
  }
  for (const o of offers ?? []) {
    if (o.attorney_profile_id) attorneyProfileIds.add(o.attorney_profile_id)
  }

  const ids = Array.from(attorneyProfileIds)
  let attorneyProfilesById = new Map<string, { full_name: string | null; email: string | null }>()
  if (ids.length > 0) {
    const { data: profiles } = await ctx.db
      .from('profiles')
      .select('id, full_name, email')
      .in('id', ids)
    for (const p of profiles ?? []) {
      attorneyProfilesById.set(p.id, { full_name: p.full_name, email: p.email })
    }
  }

  const threadsMap = new Map<string, { attorney_profile_id: string; attorney_name: string; messages: typeof messages; offers: any[] }>()
  for (const apid of ids) {
    const prof = attorneyProfilesById.get(apid)
    threadsMap.set(apid, {
      attorney_profile_id: apid,
      attorney_name: prof?.full_name || prof?.email?.split('@')[0] || 'Attorney',
      messages: [],
      offers: [],
    })
  }

  const clientMessages: typeof messages = []
  const systemMessages: typeof messages = []
  for (const m of messages ?? []) {
    if (m.sender_role === 'client') clientMessages.push(m)
    else if (m.sender_role === 'system') systemMessages.push(m)
    else if (m.sender_role === 'attorney' && m.sender_profile_id) {
      threadsMap.get(m.sender_profile_id)?.messages.push(m)
    }
  }
  for (const o of offers ?? []) {
    if (o.attorney_profile_id) threadsMap.get(o.attorney_profile_id)?.offers.push({ ...o, source_type: 'attorney_offer' })
  }

  const threads = Array.from(threadsMap.values()).sort((a, b) => a.attorney_name.localeCompare(b.attorney_name))

  return Response.json({
    inquiry,
    threads,
    client_messages: clientMessages,
    system_messages: systemMessages,
  })
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const { ctx, error, status } = await requireClient()
  if (!ctx) return Response.json({ error }, { status })

  const { id } = await context.params

  const { data: inquiry } = await ctx.db
    .from('inquiries')
    .select('id, email, client_profile_id, country, case_type, case_type_label, urgency, recommended_tier, answers, status, archived_at, target_attorney_profile_id, created_at, updated_at')
    .eq('id', id)
    .single()

  if (!inquiry) return fail('Inquiry not found.', 404)

  const owns = inquiry.client_profile_id === ctx.profileId || inquiry.email === ctx.email
  if (!owns) return fail('Forbidden.', 403)

  if (inquiry.archived_at) return fail('Inquiry is archived.', 409, { reason: 'archived' })
  if (inquiry.status === 'converted') return fail('Inquiry has been converted to an order.', 409, { reason: 'converted' })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return fail('Invalid JSON.', 400)
  }

  const updates: Record<string, unknown> = {}
  const answers: Record<string, unknown> = { ...(inquiry.answers as Record<string, unknown> || {}) }

  if ('country' in body) {
    const v = typeof body.country === 'string' ? body.country.trim().toUpperCase().slice(0, 4) : ''
    if (v) updates.country = v
  }

  if ('case_type' in body) {
    const v = typeof body.case_type === 'string' ? body.case_type.trim().slice(0, 80) : ''
    if (v) updates.case_type = v
  }

  if ('case_type_label' in body) {
    const v = typeof body.case_type_label === 'string' ? body.case_type_label.trim().slice(0, 200) : ''
    updates.case_type_label = v || null
  }

  if ('urgency' in body) {
    const v = typeof body.urgency === 'string' ? body.urgency.trim().slice(0, 60) : ''
    updates.urgency = v || null
  }

  if ('target_attorney_profile_id' in body) {
    updates.target_attorney_profile_id = typeof body.target_attorney_profile_id === 'string' ? body.target_attorney_profile_id : null
  }

  if ('headline' in body) {
    const v = typeof body.headline === 'string' ? body.headline.trim().slice(0, 120) : ''
    if (v.length > 0 && v.length < 5) return fail('Headline must be at least 5 characters.', 422)
    if (v) answers._headline = v
    else delete answers._headline
  }

  if ('summary' in body) {
    const v = typeof body.summary === 'string' ? body.summary.trim().slice(0, 400) : ''
    answers._summary = v || undefined
  }

  if ('answers' in body && body.answers && typeof body.answers === 'object') {
    const newAnswers = body.answers as Record<string, unknown>
    for (const [k, v] of Object.entries(newAnswers)) {
      if (!k.startsWith('_')) {
        answers[k] = v
      }
    }
  }

  const headline = typeof answers._headline === 'string' ? answers._headline : ''
  const summary = typeof answers._summary === 'string' ? answers._summary : ''
  const scanText = `${headline} ${summary}`.trim()
  if (scanText) {
    const s = safetyGuard(scanText)
    if (!s.ok) {
      return fail(s.error || 'Message blocked by safety filter.', 422, { violations: s.violations })
    }
  }

  updates.answers = answers

  const countryChanged = 'country' in updates
  const caseTypeChanged = 'case_type' in updates
  const answersChanged = 'answers' in updates

  if (countryChanged || caseTypeChanged || answersChanged) {
    const newCountry = (updates.country || inquiry.country) as string
    const newCaseType = (updates.case_type || inquiry.case_type) as string
    const { recommendTier } = await import('@/lib/intake-questions')
    const tier = recommendTier(newCountry as any, newCaseType, answers as any)
    updates.recommended_tier = tier.tier
  }

  updates.updated_at = new Date().toISOString()

  const { data: updated, error: updErr } = await ctx.db
    .from('inquiries')
    .update(updates)
    .eq('id', id)
    .select('id, case_type_label, case_type, country, urgency, recommended_tier, status, claimed_by_attorney_id, claimed_at, source, archived_at, archived_by_role, archived_reason, answers, created_at, updated_at')
    .single()

  if (updErr || !updated) {
    return fail(updErr?.message || 'Update failed.', 500)
  }

  const { data: statusRow } = await ctx.db
    .from('inquiry_statuses')
    .select('id')
    .eq('inquiry_id', id)
    .maybeSingle()

  if (statusRow) {
    await ctx.db
      .from('inquiry_statuses')
      .update({
        payload: {
          country_flag: updated.country,
          case_type_label: updated.case_type_label,
          urgency: (updated.answers as any)?.urgency,
          tier: updated.recommended_tier,
          headline: (updated.answers as any)?._headline,
        },
      })
      .eq('inquiry_id', id)
  }

  return ok({ inquiry: updated })
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { ctx, error, status } = await requireClient()
  if (!ctx) return Response.json({ error }, { status })

  const { id } = await context.params

  const { data: inquiry } = await ctx.db
    .from('inquiries')
    .select('id, email, client_profile_id')
    .eq('id', id)
    .single()

  if (!inquiry) return fail('Inquiry not found.', 404)

  const owns = inquiry.client_profile_id === ctx.profileId || inquiry.email === ctx.email
  if (!owns) return fail('Forbidden.', 403)

  const { count: orderCount, error: orderErr } = await ctx.db
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('source_inquiry_id', id)

  if (orderErr) {
    console.error('[client/inquiries] order pre-flight error', orderErr.message)
    return fail('Could not verify order link.', 500)
  }

  if ((orderCount ?? 0) > 0) {
    return fail('This inquiry produced an order; archive it instead.', 409, { reason: 'order_exists' })
  }

  const { error: delErr } = await ctx.db
    .from('inquiries')
    .delete()
    .eq('id', id)

  if (delErr) {
    const code = (delErr as any).code
    if (code === '23503' || code === 'P0001') {
      return fail('This inquiry produced an order; archive it instead.', 409, { reason: 'order_exists' })
    }
    return fail(delErr.message, 500)
  }

  return ok({ deleted: true })
}
