/**
 * POST /api/attribution/events
 *
 * The browser collector. It accepts exactly two event types — `landing` and
 * `cta_click` — and requires an active consented first-party session.
 *
 * Business event types (`lead_created`, `order_paid`, `order_refunded`,
 * `order_cancelled`) are refused here with 422 and are refused again by the
 * database CHECK constraint, so client code cannot declare payment or conversion
 * success even if this route is edited by mistake. This preserves the existing
 * Marketplace rule that a public browser collector never writes a conversion.
 */
import { fail, ok } from '@/lib/apiEnvelope'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { CLIENT_DECLARABLE_EVENT_TYPES, isAttributionEventType, isBusinessEventType } from '@/lib/attribution/contract'
import { readAttributionToken } from '@/lib/attribution/cookies'
import { recordClientEvent, sanitizeCtaId } from '@/lib/attribution/engine'
import { ATTRIBUTION_CROSS_ORIGIN_MESSAGE, isCrossOriginRequest, readBoundedJson } from '@/lib/attribution/http'

export async function POST(req: Request) {
  if (isCrossOriginRequest(req)) return fail(ATTRIBUTION_CROSS_ORIGIN_MESSAGE, 403)

  const body = await readBoundedJson(req)
  const eventType = String(body.event_type ?? '')

  if (!isAttributionEventType(eventType)) return fail('Unknown attribution event type.', 422)
  if (isBusinessEventType(eventType)) {
    return fail(
      'Business events are server-observed only; a browser cannot declare a lead, order, payment or refund.',
      422,
    )
  }
  if (!(CLIENT_DECLARABLE_EVENT_TYPES as readonly string[]).includes(eventType)) {
    return fail('Event type is not client-declarable.', 422)
  }

  const token = readAttributionToken(req)
  if (!token) {
    // No consented identity: nothing to write, and no identifier is invented to
    // work around it. The visit's acquisition source stays unknown by design.
    return ok({ tracked: false, reason: 'no_consented_session' })
  }

  const db = createSupabaseAdminClient()
  const result = await recordClientEvent(db, {
    token,
    eventType,
    ctaId: eventType === 'cta_click' ? sanitizeCtaId(body.cta_id) : null,
  })

  if (result.status === 'not_recorded') {
    if (result.reason === 'unavailable') return fail('Attribution store unavailable.', 503)
    // consent_required / session_inactive / invalid_event are all "do not track".
    return ok({ tracked: false, reason: result.reason }, {}, { deduped: false })
  }
  return ok({ tracked: true, deduped: result.deduped })
}
