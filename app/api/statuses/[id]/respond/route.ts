import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'
import { getOrCreateConversation } from '@/lib/conversations'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const viewerRole = auth.role
  if (!['attorney', 'consultant'].includes(viewerRole)) {
    return fail('Only attorneys and consultants can respond to inquiries.', 403)
  }

  const { id: statusId } = await params
  if (!statusId) return fail('Status ID is required.', 400)

  // Resolve status → inquiry → client_profile_id
  const { data: statusRow, error: statusErr } = await auth.db
    .from('inquiry_statuses')
    .select('id, inquiry_id, person_id')
    .eq('id', statusId)
    .single()

  if (statusErr || !statusRow) {
    return fail(statusErr?.message || 'Status not found.', 404)
  }

  // Viewer cannot respond to their own status
  if (statusRow.person_id === auth.profileId) {
    return fail('You cannot respond to your own inquiry.', 403)
  }

  const { data: inquiry, error: inquiryErr } = await auth.db
    .from('inquiries')
    .select('id, client_profile_id, country, case_type, case_type_label, urgency, recommended_tier, answers')
    .eq('id', statusRow.inquiry_id)
    .single()

  if (inquiryErr || !inquiry) {
    return fail(inquiryErr?.message || 'Inquiry not found.', 404)
  }

  const clientId = inquiry.client_profile_id
  if (!clientId) {
    return fail('Inquiry has no linked client.', 404)
  }

  // Get or create conversation
  const convId = await getOrCreateConversation(
    auth.db,
    auth.profileId,
    clientId,
    'inquiry',
    inquiry.id,
  )

  if (!convId) {
    return fail('Could not create conversation.', 500)
  }

  // Insert opening inquiry message
  const { error: msgErr } = await auth.db.from('conversation_messages').insert({
    conversation_id: convId,
    sender_id: auth.profileId,
    type: 'inquiry',
    body: inquiry.case_type_label || 'New inquiry',
    ref_inquiry_id: inquiry.id,
    metadata: {
      inquiry_id: inquiry.id,
      status_id: statusRow.id,
      country: inquiry.country,
      case_type: inquiry.case_type,
      case_type_label: inquiry.case_type_label,
      urgency: inquiry.urgency,
      recommended_tier: inquiry.recommended_tier,
      answers: inquiry.answers,
    },
  })

  if (msgErr) {
    return fail(msgErr.message || 'Could not send opening message.', 500)
  }

  return ok({ conversation_id: convId })
}
