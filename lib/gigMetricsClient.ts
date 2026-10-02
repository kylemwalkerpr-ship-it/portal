/**
 * Client-side gig metric beacon.
 *
 * `/api/gig-metrics/event` requires a signed-in portal user (events are
 * attributed to `actor_id`). Anonymous visitors used to POST anyway and got a
 * 401, which surfaced as a console error on every public gig page and spent a
 * Worker invocation for nothing. We now only send when Clerk's client-readable
 * `__client_uat` session hint says a session is active (absent or `0` means
 * signed out — same semantics as `clientUatMeansSignedIn` in
 * lib/clerkHandoffState.ts). Metrics never block or surface errors to users.
 */
export function hasClientSessionHint(cookieString?: string): boolean {
  const raw = cookieString ?? (typeof document !== 'undefined' ? document.cookie : '')
  if (!raw) return false
  return raw.split(';').some((part) => {
    const eq = part.indexOf('=')
    if (eq < 0) return false
    const name = part.slice(0, eq).trim().toLowerCase()
    const value = part.slice(eq + 1).trim()
    // Clerk may suffix the cookie name per instance (`__client_uat_<suffix>`).
    return (name === '__client_uat' || name.startsWith('__client_uat_')) && value !== '' && value !== '0'
  })
}

export type GigMetricBody =
  | { gig_id: string; event_type: 'impression' | 'click' | 'save' | 'share' | 'purchase' }
  | { gig_ids: string[]; event_type: 'impression' }

export function postGigMetric(body: GigMetricBody): void {
  if (!hasClientSessionHint()) return
  try {
    fetch('/api/gig-metrics/event', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {})
  } catch {
    // never surface metric failures
  }
}
