/**
 * POST /api/attribution/session
 *
 * Starts, resumes or withdraws the visitor's first-party attribution identity.
 *
 * Consent semantics (the whole point of this route):
 *  - `granted` → issue/resume an opaque httpOnly identity cookie and classify the
 *    first touch from real navigation evidence only (campaign / organic_search /
 *    referral / internal / unknown). Landing host/path are retained as CONTEXT
 *    and are never acquisition evidence: `direct` is vocabulary-reserved and is
 *    never derived from a missing referrer (privacy settings / Referrer-Policy /
 *    browser behaviour can all remove it). A granted visitor whose navigation
 *    carries no acquisition signal gets a consented session with
 *    `attribution_state = 'session_only'`: the identity proves continuity and
 *    consent, NOT where the visitor came from.
 *  - `denied`  → perform NO analytics write, clear every attribution cookie and
 *    revoke any identity this browser already had. The acquisition source stays
 *    unknown; it is never smuggled through another mechanism.
 *  - unknown   → treated exactly like `denied` for storage (nothing persisted),
 *    without revoking, because an explicit rejection was not given.
 *
 * Cross-domain continuity is a LINK, not a merge: a signed, short-lived, single-use
 * handoff token (see lib/attribution/identity.ts) connects this session to the
 * session that handed off. The token is never trusted without signature + expiry
 * verification, and handoff is disabled entirely when no signing secret is set.
 */
import { fail, ok } from '@/lib/apiEnvelope'
import { createSupabaseAdminClient } from '@/lib/supabase'
import {
  ATTRIBUTION_COOKIE,
  ATTRIBUTION_HANDOFF_COOKIE,
  ATTRIBUTION_SESSION_TTL_SECONDS,
  ATTRIBUTION_SOURCE_COOKIE,
  deriveAttributionState,
} from '@/lib/attribution/contract'
import { buildAttributionSessionCookie, expiredCookie, readConsent, readHandoffToken, readRequestCookie, readSourceCookie } from '@/lib/attribution/cookies'
import {
  issueAttributionSession,
  linkHandoffSession,
  resolveAttributionSession,
  revokeAttributionSession,
  type AttributionSessionRow,
} from '@/lib/attribution/engine'
import { ATTRIBUTION_CROSS_ORIGIN_MESSAGE, isCrossOriginRequest, readBoundedJson } from '@/lib/attribution/http'
import { randomToken, resolveHandoffSecret } from '@/lib/attribution/identity'
import { classifyAttributionSource, parseConsent, readCampaignFromUrl, type CampaignCapture } from '@/lib/attribution/source'

function clearAttributionCookies(): string[] {
  return [
    expiredCookie(ATTRIBUTION_COOKIE),
    expiredCookie(ATTRIBUTION_HANDOFF_COOKIE, { httpOnly: false }),
    expiredCookie(ATTRIBUTION_SOURCE_COOKIE, { httpOnly: false }),
  ]
}

export async function POST(req: Request) {
  if (isCrossOriginRequest(req)) return fail(ATTRIBUTION_CROSS_ORIGIN_MESSAGE, 403)

  const body = await readBoundedJson(req)
  const consent = parseConsent(body.consent)

  // ── 1. No consent → no analytics identity, ever ───────────────────────────
  if (consent !== 'granted') {
    const headers = new Headers()
    for (const cookie of clearAttributionCookies()) headers.append('set-cookie', cookie)
    if (consent === 'denied') {
      const existing = readRequestCookie(req, ATTRIBUTION_COOKIE)
      if (existing) {
        // A service-role client is created ONLY to withdraw an identity this
        // browser already had. A visitor who has granted nothing never causes an
        // analytics database client to be constructed for them.
        const revoked = await revokeAttributionSession(createSupabaseAdminClient(), {
          token: existing,
          reason: 'consent_withdrawn',
        })
        if (!revoked.revoked) console.error('[attribution/session] revoke failed', revoked.reason)
      }
    }
    return ok(
      { consent, tracking: false, attribution: null, source_class: 'unknown' },
      { headers },
    )
  }

  // Consent is granted: this is the only branch that may create an identity.
  const db = createSupabaseAdminClient()

  // ── 2. Classify the visit (browser-observed navigation evidence only) ─────
  const landing = body.landing && typeof body.landing === 'object' && !Array.isArray(body.landing)
    ? (body.landing as Record<string, unknown>)
    : {}
  const campaign: CampaignCapture | null = readSourceCookie(req) ?? readCampaignFromUrl(
    typeof body.landing_url === 'string' ? body.landing_url : null,
  )
  const source = classifyAttributionSource({
    host: typeof landing.host === 'string' ? landing.host : null,
    path: typeof landing.path === 'string' ? landing.path : null,
    // The page supplies `document.referrer`; the request's own Referer header is
    // our internal page, so it is only a fallback when the client sent neither.
    referrer: typeof body.referrer === 'string'
      ? body.referrer
      : (typeof landing.referrer === 'string' ? landing.referrer : req.headers.get('referer')),
    campaign,
  })

  // ── 3. Resume an existing identity, otherwise issue a new one ─────────────
  let token = readRequestCookie(req, ATTRIBUTION_COOKIE)
  let session: AttributionSessionRow | null = null
  if (token) {
    const resolved = await resolveAttributionSession(db, token)
    if (resolved.status === 'active') session = resolved.session
  }

  let issuedNew = false
  if (!session) {
    token = randomToken(32)
    const issued = await issueAttributionSession(db, { token, consent, source })
    if (issued.status === 'issued') {
      session = issued.session
      issuedNew = true
    } else {
      // A tab race can attempt the same token twice; re-resolve before failing.
      const retry = await resolveAttributionSession(db, token)
      if (retry.status === 'active') session = retry.session
      else return fail(`Attribution identity unavailable (${issued.reason}).`, 503)
    }
  }

  if (!session || !token) return fail('Attribution identity unavailable.', 503)

  // ── 4. Consume any cross-domain handoff (link, never merge) ───────────────
  const handoffToken = (typeof body.handoff === 'string' ? body.handoff : null) ?? readHandoffToken(req)
  let linked: { linked: boolean; reason?: string } = { linked: false }
  if (handoffToken) {
    const secret = resolveHandoffSecret()
    const result = await linkHandoffSession(db, { childToken: token, handoffToken, secret })
    linked = result.status === 'linked' ? { linked: true } : { linked: false, reason: result.reason }
    if (result.status !== 'linked' && result.reason !== 'same_session') {
      // Never log the token itself — only the outcome.
      console.warn('[attribution/session] handoff not linked', result.reason, result.detail ?? '')
    }
  }

  const headers = new Headers()
  headers.append('set-cookie', buildAttributionSessionCookie(token, ATTRIBUTION_SESSION_TTL_SECONDS))
  // Both one-hop cookies are consumed here.
  headers.append('set-cookie', expiredCookie(ATTRIBUTION_HANDOFF_COOKIE, { httpOnly: false }))
  headers.append('set-cookie', expiredCookie(ATTRIBUTION_SOURCE_COOKIE, { httpOnly: false }))

  return ok(
    {
      consent,
      tracking: true,
      attribution: {
        expires_at: session.expires_at,
        source_class: session.first_source_class,
        // Truthful state for this session: `attributed` only when a KNOWN source
        // class was observed; a consented session with an unknown source is
        // `session_only` (continuity/consent proven, acquisition not).
        attribution_state: deriveAttributionState({
          hasSession: true,
          sourceClass: session.first_source_class,
        }),
        issued: issuedNew,
      },
      handoff: linked,
    },
    { headers },
  )
}

/** GET reports only the browser's own consent/identity state. Never a DB read. */
export async function GET(req: Request) {
  const consent = readConsent(req)
  const hasIdentity = Boolean(readRequestCookie(req, ATTRIBUTION_COOKIE))
  return ok({
    consent,
    has_reference: false,
    tracking: consent === 'granted' && hasIdentity,
  })
}
