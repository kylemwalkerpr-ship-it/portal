import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'

const ALLOWED = new Set(['impression', 'click', 'save', 'share', 'purchase'])

export async function POST(req: Request) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const body = await req.json().catch(() => ({}))

  // ── Batched impressions ────────────────────────────────────────────
  // The browse page used to fire ONE request PER VISIBLE GIG (20 Worker
  // invocations × ~6 DB ops each, per page view) — a serious CPU-budget
  // drain. Batched: one request, two bulk writes, no per-row counter
  // churn and no rank recompute (impressions feed rank via the periodic
  // recompute from gig_metric_events, the source of truth).
  if (Array.isArray(body.gig_ids) && String(body.event_type || '') === 'impression') {
    const ids = Array.from(new Set(body.gig_ids.filter((g: unknown) => typeof g === 'string' && g))).slice(0, 60) as string[]
    if (ids.length === 0) return fail('Invalid metric event.', 422)
    await auth.db.from('gig_metric_events').insert(
      ids.map((gig_id) => ({ gig_id, actor_id: auth.profileId, event_type: 'impression' })),
    )
    await auth.db.from('gig_metrics').upsert(
      ids.map((gig_id) => ({ gig_id })),
      { onConflict: 'gig_id', ignoreDuplicates: true },
    )
    return ok({ tracked: ids.length })
  }

  const gigId = String(body.gig_id || '')
  const eventType = String(body.event_type || '')
  if (!gigId || !ALLOWED.has(eventType)) return fail('Invalid metric event.', 422)

  await auth.db.from('gig_metric_events').insert({ gig_id: gigId, actor_id: auth.profileId, event_type: eventType })
  await auth.db.from('gig_metrics').upsert({ gig_id: gigId }, { onConflict: 'gig_id', ignoreDuplicates: true })

  const column = eventType === 'impression'
    ? 'impressions'
    : eventType === 'click'
      ? 'clicks'
      : eventType === 'save'
        ? 'saves'
        : eventType === 'share'
          ? 'share_count'
          : null

  if (column) {
    const { data: current } = await auth.db.from('gig_metrics').select(column).eq('gig_id', gigId).single()
    await auth.db.from('gig_metrics').update({ [column]: Number(current?.[column] || 0) + 1, last_computed_at: new Date().toISOString() }).eq('gig_id', gigId)
  }

  try {
    await auth.db.rpc('recompute_gig_rank', { target_gig: gigId })
  } catch {
    // Metrics should never block the user action.
  }
  return ok({ tracked: true })
}
