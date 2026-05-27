import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'
import {
  ALLOWED_INQUIRY_FIELDS,
  polishInquiryField,
  type InquiryContext,
  type InquiryField,
} from '@/lib/inquirySuggest'

// AI polish endpoint for student inquiry intake. Reshapes the student's
// own draft text into clear prose for an attorney — does NOT invent facts.
// Body: { field: 'case_description' | 'notes', context: InquiryContext, hint?: string }
export async function POST(req: Request) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  // Clients/students are the primary callers, but attorneys / consultants
  // can also use this when responding to inquiries on their own dashboards.
  if (!['client', 'attorney', 'consultant', 'admin'].includes(auth.role)) {
    return fail('Forbidden.', 403)
  }

  const body = await req.json().catch(() => ({}))
  const field = String(body.field || '') as InquiryField
  if (!ALLOWED_INQUIRY_FIELDS.includes(field)) {
    return fail(`Field "${field}" is not AI-editable.`, 400)
  }
  const hint = typeof body.hint === 'string' ? body.hint : ''
  const ctxRaw = (body.context && typeof body.context === 'object') ? body.context as Record<string, unknown> : {}
  const ctx: InquiryContext = {
    country: typeof ctxRaw.country === 'string' ? ctxRaw.country.slice(0, 80) : null,
    case_type: typeof ctxRaw.case_type === 'string' ? ctxRaw.case_type.slice(0, 80) : null,
    question_label: typeof ctxRaw.question_label === 'string' ? ctxRaw.question_label.slice(0, 240) : null,
    question_help: typeof ctxRaw.question_help === 'string' ? ctxRaw.question_help.slice(0, 480) : null,
    draft: typeof ctxRaw.draft === 'string' ? ctxRaw.draft.slice(0, 4000) : '',
  }

  const result = await polishInquiryField(field, ctx, hint)
  if (result.ok === false) return fail(result.message, result.status)
  return ok({ field, value: result.value })
}
