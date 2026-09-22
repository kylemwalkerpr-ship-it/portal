/**
 * GET /api/admin/analytics/conversion-attribution
 *
 * Read-only P10 proof surface. Answers three questions with stored evidence only:
 *   1. Is the chain instrumented? (event counts by type and by cluster)
 *   2. Is anything real being observed? (`measurement_state`)
 *   3. How much of it is attributed versus honestly unknown? `paid_event_states`
 *      and every cluster row separate KNOWN-source `attributed_paid_events` from
 *      `session_only_paid_events` (consented session, acquisition still unknown)
 *      and `unknown_source_paid_events` (no traceable session). A session-bound
 *      paid event with an unknown source can never inflate the attributed count.
 *
 * `program_pass_claimed` is always literally `false`. Wiring is not a business
 * event: only a real observed event can move the program gate, and that is
 * decided from stored rows, never from this route's own output.
 */
import { fail, ok } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'
import {
  ATTRIBUTION_CONTRACT_VERSION,
  P10_CROSS_DOMAIN_HANDOFF,
  P10_MEANINGFUL_EVENT_DEFINITION,
  P10_PILOT,
} from '@/lib/attribution/contract'
import { loadConversionCoverage } from '@/lib/attribution/engine'

export async function GET(req: Request) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const cluster = new URL(req.url).searchParams.get('cluster')
  const coverage = await loadConversionCoverage(auth.db, { cluster })

  return ok({
    contract_version: ATTRIBUTION_CONTRACT_VERSION,
    pilot: {
      cluster: P10_PILOT.cluster,
      label: P10_PILOT.label,
      meaningful_event: P10_PILOT.meaningful_event,
      supporting_event: P10_PILOT.supporting_event,
      definition: P10_MEANINGFUL_EVENT_DEFINITION,
    },
    measurement_state: coverage.measurement_state,
    observed_business_events: coverage.observed_business_events,
    paid_event_states: coverage.paid_event_states,
    clusters: coverage.clusters,
    sessions: coverage.sessions,
    measured_at: coverage.measured_at,
    detail: coverage.detail ?? null,
    // Truthful shipping state: the cross-domain EMITTER adapter is not
    // implemented, so this surface cannot claim cross-domain continuity.
    cross_domain_handoff: {
      emitter_shipped: P10_CROSS_DOMAIN_HANDOFF.emitter_shipped,
      state: P10_CROSS_DOMAIN_HANDOFF.state,
      detail: P10_CROSS_DOMAIN_HANDOFF.detail,
    },
    // Literal: this foundation cannot assert program PASS. A real production
    // business event, observed over time, is required and is not claimed here.
    program_pass_claimed: false,
  })
}
