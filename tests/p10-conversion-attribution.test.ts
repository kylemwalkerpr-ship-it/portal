/// <reference types="jest" />
/**
 * P10 conversion attribution — contract + behaviour.
 *
 * Proves the properties the foundation claims, in the order they matter:
 *  1. the migration's storage-level truth (append-only ledger, consent as a
 *     precondition of existence, service-role-only, no PII/fingerprint columns);
 *  2. consent denied/unknown performs no analytics write and issues no identity;
 *  3. attribution state is derived by ONE shared rule: a real business event with
 *     no consented identity is unknown_source, a consented session whose source is
 *     unknown is session_only (consent proven, acquisition NOT), and attributed is
 *     reserved for a KNOWN acquisition source — so a session identity can never
 *     inflate the attributed paid-event count;
 *  4. deterministic idempotency (replay/double-click, duplicate order callback,
 *     duplicate refund) never double-credits one order;
 *  5. a browser cannot declare a business event (attribution route AND the
 *     pre-existing Marketplace collector);
 *  6. cross-domain handoff links sessions only with a valid signed, unexpired,
 *     single-use token — and fails closed with no secret;
 *  7. an expired identity cannot attribute a later order;
 *  8. refund lifecycle appends without erasing the paid event;
 *  9. historical orders cannot be retroactively attributed (no backfill surface).
 *
 * These are wiring/behaviour proofs only. Nothing here can claim P10 PASS: a real
 * production business event must be observed for that.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

jest.mock('@/lib/supabase', () => ({ createSupabaseAdminClient: jest.fn() }))
jest.mock('@/lib/portalAuth', () => ({
  requireAdminUser: jest.fn(),
  requirePortalUser: jest.fn(),
}))

import { createSupabaseAdminClient } from '@/lib/supabase'
import { requireAdminUser, requirePortalUser } from '@/lib/portalAuth'
import {
  ANALYTICS_CONSENT_COOKIE,
  ATTRIBUTION_COOKIE,
  ATTRIBUTION_HANDOFF_COOKIE,
  ATTRIBUTION_SESSION_TTL_SECONDS,
  ATTRIBUTION_SOURCE_COOKIE,
  ATTRIBUTION_STATES,
  P10_CROSS_DOMAIN_HANDOFF,
  P10_PILOT,
  deriveAttributionState,
  isKnownSourceClass,
} from '@/lib/attribution/contract'
import { attributionCaptureCookies, readCookieValue } from '@/lib/attribution/cookies'
import {
  bindBusinessEvent,
  issueAttributionSession,
  linkHandoffSession,
  loadConversionCoverage,
  recordClientEvent,
  resolveAttributionSession,
  resolveStoredConsent,
  revokeAttributionSession,
} from '@/lib/attribution/engine'
import { HANDOFF_SECRET_ENV, mintHandoffToken, resolveHandoffSecret, sha256Hex } from '@/lib/attribution/identity'
import { classifyAttributionSource, classifyBusinessCluster } from '@/lib/attribution/source'
import { isTrackingQueryKey, stripTrackingParams } from '@/lib/trackingParams'
import { createP10FakeDb } from './helpers/p10AttributionFakeDb'
import { POST as attributionSessionPOST } from '@/app/api/attribution/session/route'
import { POST as attributionEventsPOST } from '@/app/api/attribution/events/route'
import { GET as attributionReportGET } from '@/app/api/admin/analytics/conversion-attribution/route'
import { POST as orderCancelPOST } from '@/app/api/orders/[id]/cancel/route'
import { POST as marketplaceEventsPOST } from '@/app/api/marketplace/search-events/route'

const ROOT = join(__dirname, '..')
const MIGRATION_PATH = join(ROOT, 'supabase', 'migrations', '20260922120000_p10_conversion_attribution.sql')
const migration = () => readFileSync(MIGRATION_PATH, 'utf8')
const engineSource = () => readFileSync(join(ROOT, 'lib', 'attribution', 'engine.ts'), 'utf8')
const clientSource = () => readFileSync(join(ROOT, 'lib', 'attribution', 'client.ts'), 'utf8')
const attributionClientSource = () => readFileSync(join(ROOT, 'components', 'AttributionClient.tsx'), 'utf8')
const middlewareSource = () => readFileSync(join(ROOT, 'middleware.ts'), 'utf8')

const SESSION_TOKEN = 'a'.repeat(43)
const OTHER_TOKEN = 'b'.repeat(43)
const HANDOFF_SECRET = 'p10-test-handoff-secret-0123456789abcdef'
const FIXED_NOW = Date.parse('2026-09-22T12:00:00.000Z')

function jsonRequest(url: string, body: unknown, cookies?: Record<string, string>, headers: Record<string, string> = {}) {
  const cookieHeader = cookies
    ? Object.entries(cookies).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('; ')
    : ''
  return new Request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://portal.yousafeconsultancy.com',
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

function seedSession(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    identity_hash: overrides.identity_hash ?? 'hash-placeholder',
    consent_state: 'granted',
    first_source_class: 'organic_search',
    first_source_detail: { engine: 'google' },
    first_landing_host: 'usa.yousafeconsultancy.com',
    first_landing_path: '/guides/f-1',
    first_seen_at: new Date(FIXED_NOW - 1000).toISOString(),
    last_seen_at: new Date(FIXED_NOW - 1000).toISOString(),
    expires_at: new Date(FIXED_NOW + ATTRIBUTION_SESSION_TTL_SECONDS * 1000).toISOString(),
    revoked_at: null,
    revocation_reason: null,
    ...overrides,
  }
}

describe('P10-A1 migration contract (storage-level truth)', () => {
  it('makes analytics consent a precondition of a stored attribution identity', () => {
    const sql = migration()
    expect(sql).toContain('create table if not exists public.conversion_attribution_sessions')
    expect(sql).toContain("consent_state text not null default 'granted' check (consent_state = 'granted')")
    expect(sql).toContain(
      "attribution_state text not null check (attribution_state in ('attributed', 'session_only', 'unknown_source'))",
    )
    // Storage-level state shapes. `attributed` requires a KNOWN source class, so a
    // consented session whose acquisition source is unknown can only be
    // session_only — it is structurally impossible to store it as attributed.
    expect(sql).toContain(
      "attribution_state = 'attributed'\n      and session_id is not null\n      and source_class is not null\n      and source_class <> 'unknown'",
    )
    expect(sql).toContain(
      "attribution_state = 'session_only'\n      and session_id is not null\n      and source_class is not null\n      and source_class = 'unknown'",
    )
    expect(sql).toContain("(attribution_state = 'unknown_source' and session_id is null and source_class is null)")
  })

  it('stores no IP address, user agent, email, profile id, Clerk id or fingerprint', () => {
    // Column-level check only: strip `--` comments and the `comment on ... ;`
    // documentation statements (which legitimately NAME the things we refuse to store).
    const sql = migration()
      .replace(/--[^\n]*/g, ' ')
      .replace(/comment on [\s\S]*?;/gi, ' ')
      .toLowerCase()
    for (const forbidden of [
      'ip_address',
      'ip_country',
      'user_agent',
      'email',
      'clerk_user_id',
      'profile_id',
      'fingerprint',
      'device_id',
    ]) {
      expect(sql).not.toContain(forbidden)
    }
    // The only identity material is a one-way hash of the browser token.
    expect(migration()).toContain("identity_hash text not null check (identity_hash ~ '^[0-9a-f]{64}$')")
  })

  it('keeps the ledger append-only', () => {
    const sql = migration()
    expect(sql).toContain('create trigger conversion_events_no_update')
    expect(sql).toContain('before update or delete on public.conversion_events')
    expect(sql).toContain("raise exception 'conversion_events is append-only; record a new lifecycle event instead of %', tg_op")
    expect(sql).toContain("set search_path = ''")
    // The event table is not even granted UPDATE/DELETE.
    expect(sql).toContain('grant select, insert on table public.conversion_events to service_role;')
    expect(sql).not.toMatch(/grant[^;]*update[^;]*on table public\.conversion_events/)
  })

  it('refuses a browser-declared business event at the storage layer too', () => {
    const sql = migration()
    expect(sql).toContain("event_type in ('landing', 'cta_click', 'lead_created', 'order_paid', 'order_refunded', 'order_cancelled')")
    expect(sql).toContain("event_type in ('landing', 'cta_click')\n      and observation = 'client_declared'")
    expect(sql).toContain("event_type in ('lead_created', 'order_paid', 'order_refunded', 'order_cancelled')\n      and observation = 'server_observed'")
    expect(sql).toContain('and subject_type is not null')
    expect(sql).toContain('and amount_cents is null')
  })

  it('stores consent as observed: unknown is the default and granted is never inferred', () => {
    const sql = migration()
    // Scope the column assertion to the EVENTS table: the sessions table keeps
    // its own granted-only precondition (a session row exists only for a
    // granted visitor), while the event ledger must not hard-code granted.
    const eventsStart = sql.indexOf('create table if not exists public.conversion_events')
    const eventsEnd = sql.indexOf('create unique index if not exists conversion_events_event_key_key')
    expect(eventsStart).toBeGreaterThan(-1)
    const eventsTable = sql.slice(eventsStart, eventsEnd)
    expect(eventsTable).toContain(
      "consent_state text not null default 'unknown' check (consent_state in ('granted', 'denied', 'unknown'))",
    )
    expect(eventsTable).not.toContain("consent_state text not null default 'granted'")
    // The session precondition is untouched.
    expect(sql).toContain("consent_state text not null default 'granted' check (consent_state = 'granted')")
    // Client-declared events and session-bound business events (attributed OR
    // session_only — the session itself is the consent evidence) require granted...
    expect(sql).toContain("(observation = 'client_declared' and consent_state = 'granted')")
    expect(sql).toContain(
      "and attribution_state in ('attributed', 'session_only')\n      and consent_state = 'granted'",
    )
    // ...and an unknown_source business event is unknown unless the call site
    // records HOW it observed a granted/denied decision.
    expect(sql).toContain("(observation = 'server_observed' and attribution_state = 'unknown_source' and consent_state = 'unknown')")
    expect(sql).toContain("nullif(btrim(evidence ->> 'consent_evidence'), '') is not null")
    // The read-only proof view can separate consented from un-evidenced events,
    // and separates KNOWN-source attributed paid events from session_only ones.
    expect(sql).toContain('consent_granted_events')
    expect(sql).toContain('consent_unknown_events')
    expect(sql).toContain('as session_only_paid_events')
    expect(sql).toContain("and attribution_state = 'attributed'\n      and source_class is not null\n      and source_class <> 'unknown'")
  })

  it('scopes every new object to service_role and exposes one read-only proof view', () => {
    const sql = migration()
    expect(sql).toMatch(/revoke all privileges on table public\.conversion_attribution_sessions from public, anon, authenticated;/)
    expect(sql).toMatch(/revoke all privileges on table public\.conversion_attribution_links from public, anon, authenticated;/)
    expect(sql).toMatch(/revoke all privileges on table public\.conversion_events from public, anon, authenticated;/)
    expect(sql).toContain('create or replace view public.p10_conversion_chain_coverage')
    expect(sql).toContain('with (security_invoker = true)')
    expect(sql).toContain('revoke all on table public.p10_conversion_chain_coverage from public, anon, authenticated;')
    expect(sql).toContain('grant select on table public.p10_conversion_chain_coverage to service_role;')
    expect(sql).toContain("no_observed_business_events")
  })

  it('enforces single-use handoff nonces and deterministic event idempotency', () => {
    const sql = migration()
    expect(sql).toContain('create unique index if not exists conversion_events_event_key_key')
    expect(sql).toContain('create unique index if not exists conversion_attribution_links_nonce_key')
    expect(sql).toContain('create unique index if not exists conversion_attribution_sessions_identity_key')
    // No retroactive backfill path exists in the migration.
    expect(sql.toLowerCase()).not.toContain('update public.conversion_events')
    expect(sql.toLowerCase()).not.toContain('alter table public.orders')
  })
})

describe('P10 privacy: no PII or fingerprint enters anonymous attribution storage', () => {
  /** Strip `//` and block comments so only executable source is inspected. */
  function codeOnly(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/[^\n]*/gm, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
  }

  it('never reads or stores an IP, user agent, email, profile id, Clerk id or fingerprint', () => {
    const files = [
      'lib/attribution/engine.ts',
      'lib/attribution/cookies.ts',
      'lib/attribution/source.ts',
      'lib/attribution/http.ts',
      'lib/attribution/identity.ts',
      'lib/attribution/client.ts',
      'lib/attribution/contract.ts',
      'app/api/attribution/session/route.ts',
      'app/api/attribution/events/route.ts',
      'app/api/admin/analytics/conversion-attribution/route.ts',
    ]
    const forbidden = [
      'user-agent',
      'user_agent',
      'x-forwarded-for',
      'cf-connecting-ip',
      'ip_address',
      'ip_country',
      'fingerprint',
      'device_id',
      'clerk',
      'profile_id',
      'email',
    ]
    const violations: string[] = []
    for (const file of files) {
      const code = codeOnly(readFileSync(join(ROOT, file), 'utf8')).toLowerCase()
      for (const term of forbidden) {
        if (code.includes(term)) violations.push(`${file}:${term}`)
      }
    }
    expect(violations).toEqual([])
  })

  it('keeps anonymous attribution evidence free of personal identifiers at runtime', async () => {
    const fake = createP10FakeDb()
    await bindBusinessEvent(fake.client, {
      eventType: 'lead_created',
      subjectType: 'inquiry',
      subjectId: 'inquiry-durable-1',
      occurredAt: '2026-09-22T11:00:00.000Z',
      token: null,
      evidence: { verification: 'inquiry_row_persisted', country: 'US', case_type: 'f1' },
    })
    const [event] = fake.rows('conversion_events')
    // Durable business object ids only; the anonymous ledger gets no person.
    expect(event.subject_type).toBe('inquiry')
    expect(event.subject_id).toBe('inquiry-durable-1')
    expect(JSON.stringify(event)).not.toMatch(/ip_address|ip_country|user[_-]?agent|@|fingerprint|device_id|clerk|profile_id/i)
  })
})

describe('P10 source + cluster classification keeps unknown unknown', () => {
  it('classifies only real navigation evidence', () => {
    // Known acquisition signals: campaign, organic search, referral, internal.
    expect(classifyAttributionSource({ referrer: 'https://www.google.com/', host: 'usa.yousafeconsultancy.com', path: '/guides/f-1' }))
      .toMatchObject({ source_class: 'organic_search', source_detail: { engine: 'google' } })
    expect(classifyAttributionSource({ host: 'market.yousafeconsultancy.com', path: '/', campaign: { medium: 'cpc', click_id_kind: 'gclid' } }))
      .toMatchObject({ source_class: 'campaign' })
    expect(classifyAttributionSource({ host: 'portal.yousafeconsultancy.com', path: '/', referrer: 'https://legal.yousafeconsultancy.com/guides' }))
      .toMatchObject({ source_class: 'internal' })
    expect(classifyAttributionSource({ referrer: 'https://somereferrer.example/' }))
      .toMatchObject({ source_class: 'referral', source_detail: { referrer_host: 'somereferrer.example' } })
    // No signals at all → unknown, and the full referrer URL is never retained.
    expect(classifyAttributionSource({})).toMatchObject({ source_class: 'unknown', source_detail: {} })
    expect(JSON.stringify(classifyAttributionSource({ referrer: 'https://www.google.com/search?q=private+query' })))
      .not.toContain('private')
  })

  it('never infers direct acquisition from landing host/path alone', () => {
    // Landing host/path prove WHERE a visitor landed, never HOW they arrived. A
    // missing referrer can be caused by privacy settings, a Referrer-Policy
    // header or browser behaviour, so it can never prove typed/bookmark/direct
    // navigation. `direct` stays vocabulary-reserved and is never derived.
    expect(classifyAttributionSource({ host: 'portal.yousafeconsultancy.com', path: '/dashboard' }))
      .toMatchObject({
        source_class: 'unknown',
        source_detail: {},
        // ...while the landing context is still retained for continuity context.
        landing_host: 'portal.yousafeconsultancy.com',
        landing_path: '/dashboard',
      })
    expect(classifyAttributionSource({ host: 'market.yousafeconsultancy.com', path: '/' }))
      .toMatchObject({ source_class: 'unknown', landing_host: 'market.yousafeconsultancy.com', landing_path: '/' })
    expect(classifyAttributionSource({ host: 'portal.yousafeconsultancy.com' }))
      .toMatchObject({ source_class: 'unknown', landing_path: null })
    expect(classifyAttributionSource({ path: '/dashboard' }))
      .toMatchObject({ source_class: 'unknown', landing_host: null, landing_path: '/dashboard' })

    // Malformed, non-http, protocol-relative and blank referrers carry no
    // evidence: host/path present still means unknown, not direct.
    for (const referrer of ['', '   ', 'not a url', 'ftp://example.com/guide', 'javascript:alert(1)', '//example.com']) {
      expect(classifyAttributionSource({ host: 'portal.yousafeconsultancy.com', path: '/dashboard', referrer }))
        .toMatchObject({
          source_class: 'unknown',
          landing_host: 'portal.yousafeconsultancy.com',
          landing_path: '/dashboard',
        })
    }

    // `direct` is reserved vocabulary only: no classifier input produces it.
    expect([
      classifyAttributionSource({}).source_class,
      classifyAttributionSource({ host: 'portal.yousafeconsultancy.com', path: '/' }).source_class,
      classifyAttributionSource({ host: 'portal.yousafeconsultancy.com', referrer: 'not a url' }).source_class,
    ]).toEqual(['unknown', 'unknown', 'unknown'])
    expect(isKnownSourceClass('direct')).toBe(true)
  })

  it('maps only documented signals to a strategic cluster', () => {
    expect(classifyBusinessCluster({ caseType: 'f1' })).toBe(P10_PILOT.cluster)
    expect(classifyBusinessCluster({ caseType: 'opt' })).toBe(P10_PILOT.cluster)
    expect(classifyBusinessCluster({ productText: 'USA F-1 OPT I-765 Application Preparation Pack' })).toBe(P10_PILOT.cluster)
    expect(classifyBusinessCluster({ productText: 'Australia Subclass 485 visa review' })).toBe('au_485')
    // Unrelated commercial text stays unclassified instead of being guessed.
    expect(classifyBusinessCluster({ productText: 'Company registration and trademark filing' })).toBeNull()
    expect(classifyBusinessCluster({ caseType: 'h1b' })).toBeNull()
  })
})

describe('P10 consent is a precondition, not a formality', () => {
  it('issues no identity and performs no analytics write when consent is denied', async () => {
    const fake = createP10FakeDb()
    jest.mocked(createSupabaseAdminClient).mockReturnValue(fake.client as never)

    const response = await attributionSessionPOST(
      jsonRequest('https://portal.yousafeconsultancy.com/api/attribution/session', { consent: 'denied' }),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.data).toMatchObject({ consent: 'denied', tracking: false, attribution: null, source_class: 'unknown' })
    expect(fake.writes).toHaveLength(0)
    // Every attribution cookie is cleared on the way out.
    const setCookie = response.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain(ATTRIBUTION_COOKIE)
    expect(setCookie).toContain('Max-Age=0')
  })

  it('revokes an existing identity when consent is withdrawn', async () => {
    const identityHash = await sha256Hex(SESSION_TOKEN)
    const fake = createP10FakeDb({
      conversion_attribution_sessions: [seedSession({ identity_hash: identityHash })],
    })
    jest.mocked(createSupabaseAdminClient).mockReturnValue(fake.client as never)

    await attributionSessionPOST(
      jsonRequest(
        'https://portal.yousafeconsultancy.com/api/attribution/session',
        { consent: 'denied' },
        { [ATTRIBUTION_COOKIE]: SESSION_TOKEN },
      ),
    )

    expect(fake.rows('conversion_attribution_sessions')[0].revoked_at).toBeTruthy()
    expect(fake.rows('conversion_attribution_sessions')[0].revocation_reason).toBe('consent_withdrawn')
    expect(fake.writes.every((write) => write.table !== 'conversion_events')).toBe(true)
  })

  it('stores nothing when consent is merely unknown', async () => {
    const fake = createP10FakeDb()
    jest.mocked(createSupabaseAdminClient).mockReturnValue(fake.client as never)
    const response = await attributionSessionPOST(
      jsonRequest('https://portal.yousafeconsultancy.com/api/attribution/session', {}),
    )
    expect((await response.json()).data.tracking).toBe(false)
    expect(fake.writes).toHaveLength(0)
  })

  it('refuses cross-origin session creation outright', async () => {
    const fake = createP10FakeDb()
    jest.mocked(createSupabaseAdminClient).mockReturnValue(fake.client as never)
    const response = await attributionSessionPOST(
      jsonRequest(
        'https://portal.yousafeconsultancy.com/api/attribution/session',
        { consent: 'granted' },
        undefined,
        { origin: 'https://evil.example' },
      ),
    )
    expect(response.status).toBe(403)
    expect(fake.writes).toHaveLength(0)
  })

  it('issues an opaque httpOnly identity only after explicit consent', async () => {
    const fake = createP10FakeDb()
    jest.mocked(createSupabaseAdminClient).mockReturnValue(fake.client as never)
    const response = await attributionSessionPOST(
      jsonRequest(
        'https://portal.yousafeconsultancy.com/api/attribution/session',
        {
          consent: 'granted',
          landing: { host: 'usa.yousafeconsultancy.com', path: '/guides/f-1' },
          referrer: 'https://www.google.com/',
        },
      ),
    )
    const payload = await response.json()
    const setCookie = response.headers.get('set-cookie') ?? ''

    expect(response.status).toBe(200)
    expect(payload.data).toMatchObject({ tracking: true })
    expect(payload.data.attribution.source_class).toBe('organic_search')
    // A known navigation signal means the session is attributed.
    expect(payload.data.attribution.attribution_state).toBe('attributed')
    expect(setCookie).toContain(`${ATTRIBUTION_COOKIE}=`)
    expect(setCookie).toContain('HttpOnly')
    // The raw token never reaches the database — only its SHA-256 does.
    const stored = fake.rows('conversion_attribution_sessions')[0]
    const token = readCookieValue(setCookie, ATTRIBUTION_COOKIE)
    expect(token).toBeTruthy()
    expect(stored.identity_hash).toBe(await sha256Hex(String(token)))
    expect(JSON.stringify(stored)).not.toContain(String(token))
  })

  it('issues a consented session whose state is session_only when no acquisition signal exists', async () => {
    const fake = createP10FakeDb()
    jest.mocked(createSupabaseAdminClient).mockReturnValue(fake.client as never)
    const response = await attributionSessionPOST(
      jsonRequest(
        'https://portal.yousafeconsultancy.com/api/attribution/session',
        // Granted consent with no host, path, referrer or campaign: the identity
        // exists (continuity + consent) but the acquisition source is unknown.
        { consent: 'granted' },
      ),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.data).toMatchObject({
      tracking: true,
      attribution: { source_class: 'unknown', attribution_state: 'session_only' },
    })
    // Consent is still genuinely granted; the session row proves it.
    expect(fake.rows('conversion_attribution_sessions')).toHaveLength(1)
    expect(fake.rows('conversion_attribution_sessions')[0]).toMatchObject({
      consent_state: 'granted',
      first_source_class: 'unknown',
    })
  })

  it('does not promote the session bootstrap request Referer header into acquisition evidence', async () => {
    // Browser fetches to /api/attribution/session carry the current page in the
    // HTTP Referer header even when document.referrer is empty. The explicit
    // client referrer:null means "no acquisition referrer observed" and must
    // win over that transport-level self-referrer.
    const fake = createP10FakeDb()
    jest.mocked(createSupabaseAdminClient).mockReturnValue(fake.client as never)
    const response = await attributionSessionPOST(
      jsonRequest(
        'https://market.yousafeconsultancy.com/api/attribution/session',
        {
          consent: 'granted',
          landing: { host: 'market.yousafeconsultancy.com', path: '/gigs/f1-review' },
          referrer: null,
        },
        undefined,
        {
          origin: 'https://market.yousafeconsultancy.com',
          referer: 'https://market.yousafeconsultancy.com/gigs/f1-review',
        },
      ),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.data).toMatchObject({
      tracking: true,
      attribution: { source_class: 'unknown', attribution_state: 'session_only' },
    })
    expect(fake.rows('conversion_attribution_sessions')[0]).toMatchObject({
      first_source_class: 'unknown',
      first_source_detail: {},
    })
  })

  it('keeps a session with landing context but no source evidence session_only end to end', async () => {
    // RELEASE BLOCKER regression: landing host/path used to be classified as
    // `direct`, so a privacy-reduced referrer silently became "typed/bookmark
    // acquisition". A real landing host/path with no campaign and no usable
    // referrer must stay `unknown`.
    const fake = createP10FakeDb()
    jest.mocked(createSupabaseAdminClient).mockReturnValue(fake.client as never)
    const response = await attributionSessionPOST(
      jsonRequest(
        'https://portal.yousafeconsultancy.com/api/attribution/session',
        { consent: 'granted', landing: { host: 'portal.yousafeconsultancy.com', path: '/dashboard' } },
      ),
    )
    const payload = await response.json()
    const token = readCookieValue(response.headers.get('set-cookie') ?? '', ATTRIBUTION_COOKIE)

    expect(response.status).toBe(200)
    expect(payload.data).toMatchObject({
      tracking: true,
      attribution: { source_class: 'unknown', attribution_state: 'session_only' },
    })
    const [session] = fake.rows('conversion_attribution_sessions')
    expect(session).toMatchObject({
      first_source_class: 'unknown',
      first_source_detail: {},
      // The landing context is retained as context, not as acquisition evidence.
      first_landing_host: 'portal.yousafeconsultancy.com',
      first_landing_path: '/dashboard',
    })
    expect(token).toBeTruthy()

    // A paid order bound to that exact session stays session_only, keeps consent
    // granted, and can never inflate the attributed paid-event count.
    const paid = await bindBusinessEvent(fake.client, {
      eventType: 'order_paid',
      subjectType: 'order',
      subjectId: 'order-landing-context-only',
      amountCents: 8800,
      currency: 'usd',
      cluster: 'us_f1_opt',
      occurredAt: '2026-09-22T11:30:00.000Z',
      token: String(token),
    })
    expect(paid.status).toBe('recorded')
    const [event] = fake.rows('conversion_events')
    expect(event).toMatchObject({
      attribution_state: 'session_only',
      source_class: 'unknown',
      consent_state: 'granted',
      session_id: session.id,
    })

    const coverage = await loadConversionCoverage(fake.client, { cluster: 'us_f1_opt', now: FIXED_NOW })
    expect(coverage.paid_event_states).toMatchObject({ attributed: 0, session_only: 1, unknown_source: 0 })
    expect(coverage.clusters[0]).toMatchObject({ paid_events: 1, attributed_paid_events: 0, session_only_paid_events: 1 })
  })
})

describe('P10 business events are server observed and honestly unknown when unattributed', () => {
  it('records a real paid order with attribution_state=unknown_source when no identity exists', async () => {
    const fake = createP10FakeDb()
    const result = await bindBusinessEvent(fake.client, {
      eventType: 'order_paid',
      subjectType: 'order',
      subjectId: 'order-1234',
      amountCents: 12900,
      currency: 'usd',
      cluster: 'us_f1_opt',
      occurredAt: '2026-09-22T11:00:00.000Z',
      token: null,
    })

    expect(result).toMatchObject({ status: 'recorded', deduped: false })
    const [event] = fake.rows('conversion_events')
    expect(event).toMatchObject({
      event_type: 'order_paid',
      observation: 'server_observed',
      // RELEASE BLOCKER regression: an unattributed paid order is NEVER stored
      // as consent granted. Consent is unknown because nothing evidenced it.
      consent_state: 'unknown',
      attribution_state: 'unknown_source',
      session_id: null,
      source_class: null,
      amount_cents: 12900,
      currency: 'usd',
      subject_type: 'order',
      subject_id: 'order-1234',
      event_key: 'order_paid:v1:order:order-1234',
    })
    expect((event.evidence as Record<string, unknown>).consent_evidence).toBeUndefined()
    // No PII or fingerprint can appear in the stored event/evidence either.
    expect(JSON.stringify(event)).not.toMatch(/ip_address|ip_country|user[_-]?agent|@|fingerprint|device_id|clerk|profile_id/i)
  })

  it('attributes the paid order when the browser presented an active consented session', async () => {
    const identityHash = await sha256Hex(SESSION_TOKEN)
    const fake = createP10FakeDb({
      conversion_attribution_sessions: [seedSession({ identity_hash: identityHash, first_source_class: 'campaign' })],
    })
    const result = await bindBusinessEvent(fake.client, {
      eventType: 'order_paid',
      subjectType: 'order',
      subjectId: 'order-attributed',
      amountCents: 5000,
      currency: 'usd',
      occurredAt: '2026-09-22T11:05:00.000Z',
      token: SESSION_TOKEN,
    })
    expect(result.status).toBe('recorded')
    const [event] = fake.rows('conversion_events')
    expect(event.attribution_state).toBe('attributed')
    // A consented session is the evidence: an attributed event is granted.
    expect(event.consent_state).toBe('granted')
    expect(event.session_id).toBe('11111111-1111-4111-8111-111111111111')
    expect(event.source_class).toBe('campaign')
  })

  it('never upgrades an unattributed business event to granted without named evidence', async () => {
    // The pure truth model first: no session + no named evidence = unknown.
    expect(resolveStoredConsent({ hasSession: false })).toEqual({ consentState: 'unknown', consentEvidence: null })
    expect(resolveStoredConsent({ hasSession: false, consentState: 'granted' }))
      .toEqual({ consentState: 'unknown', consentEvidence: null })
    expect(resolveStoredConsent({ hasSession: false, consentState: 'granted', consentEvidence: '   ' }))
      .toEqual({ consentState: 'unknown', consentEvidence: null })
    expect(resolveStoredConsent({ hasSession: false, consentState: 'maybe', consentEvidence: 'cookie' }))
      .toEqual({ consentState: 'unknown', consentEvidence: null })
    expect(resolveStoredConsent({ hasSession: false, consentState: 'denied', consentEvidence: 'browser_consent_cookie' }))
      .toEqual({ consentState: 'denied', consentEvidence: 'browser_consent_cookie' })
    expect(resolveStoredConsent({ hasSession: true, consentState: 'denied' }))
      .toEqual({ consentState: 'granted', consentEvidence: null })

    const fake = createP10FakeDb()
    const base = {
      eventType: 'order_paid' as const,
      subjectType: 'order' as const,
      subjectId: 'order-consent-1',
      amountCents: 1000,
      currency: 'usd',
      occurredAt: '2026-09-22T11:00:00.000Z',
      token: null,
    }
    // A call site that merely says "granted" without saying HOW is downgraded.
    await bindBusinessEvent(fake.client, { ...base, consentState: 'granted' })
    expect(fake.rows('conversion_events')[0]).toMatchObject({
      attribution_state: 'unknown_source',
      consent_state: 'unknown',
    })
    // Explicit, named trusted evidence is stored as observed.
    await bindBusinessEvent(fake.client, {
      ...base,
      subjectId: 'order-consent-2',
      consentState: 'granted',
      consentEvidence: 'browser_consent_cookie',
    })
    const [granted] = fake.rows('conversion_events').filter((row) => row.subject_id === 'order-consent-2')
    expect(granted).toMatchObject({ attribution_state: 'unknown_source', consent_state: 'granted' })
    expect((granted.evidence as Record<string, unknown>).consent_evidence).toBe('browser_consent_cookie')
  })

  it('refuses a subject id that is not a durable business object id', async () => {
    const fake = createP10FakeDb()
    // An email (or any personal identifier) can never become a subject id.
    expect(await bindBusinessEvent(fake.client, {
      eventType: 'order_paid',
      subjectType: 'order',
      subjectId: 'buyer@example.com',
      amountCents: 100,
      currency: 'usd',
      occurredAt: '2026-09-22T11:00:00.000Z',
    })).toMatchObject({ status: 'not_recorded', reason: 'invalid_subject' })
    expect(fake.rows('conversion_events')).toHaveLength(0)
  })

  it('never stores a business event without a durable subject or an observed time', async () => {
    const fake = createP10FakeDb()
    expect(await bindBusinessEvent(fake.client, {
      eventType: 'order_paid',
      subjectType: 'order',
      subjectId: '',
      occurredAt: '2026-09-22T11:00:00.000Z',
    })).toMatchObject({ status: 'not_recorded', reason: 'invalid_subject' })

    // A missing observed time is how a historical order would silently become a
    // fresh conversion — so it is refused instead of defaulting to "now".
    expect(await bindBusinessEvent(fake.client, {
      eventType: 'order_paid',
      subjectType: 'order',
      subjectId: 'order-no-time',
      occurredAt: null,
    })).toMatchObject({ status: 'not_recorded', reason: 'invalid_event', detail: 'occurred_at is required.' })
    expect(fake.rows('conversion_events')).toHaveLength(0)
  })

  it('refuses a browser-declared business event and never touches the database', async () => {
    const fake = createP10FakeDb()
    const createClient = jest.mocked(createSupabaseAdminClient)
    createClient.mockClear()
    createClient.mockReturnValue(fake.client as never)

    const forged = await attributionEventsPOST(
      jsonRequest(
        'https://portal.yousafeconsultancy.com/api/attribution/events',
        { event_type: 'order_paid', subject_id: 'order-1234', amount_cents: 99999 },
        { [ATTRIBUTION_COOKIE]: SESSION_TOKEN },
      ),
    )
    expect(forged.status).toBe(422)
    expect((await forged.json()).error.message).toMatch(/server-observed only/)
    expect(createClient).not.toHaveBeenCalled()
    expect(fake.writes).toHaveLength(0)

    const forgedLead = await attributionEventsPOST(
      jsonRequest(
        'https://portal.yousafeconsultancy.com/api/attribution/events',
        { event_type: 'lead_created', subject_id: 'inquiry-1' },
        { [ATTRIBUTION_COOKIE]: SESSION_TOKEN },
      ),
    )
    expect(forgedLead.status).toBe(422)
    expect(fake.writes).toHaveLength(0)
  })

  it('preserves the existing Marketplace rejection of browser-declared conversions', async () => {
    const fake = createP10FakeDb()
    jest.mocked(createSupabaseAdminClient).mockReturnValue(fake.client as never)
    const response = await marketplaceEventsPOST(
      jsonRequest(
        'https://market.yousafeconsultancy.com/api/marketplace/search-events',
        { event_type: 'conversion', session_id: 'browser-session-1234', parent_search_event_id: 'x' },
        undefined,
        { origin: 'https://market.yousafeconsultancy.com' },
      ),
    )
    expect(response.status).toBe(422)
    expect(fake.rows('marketplace_search_events')).toHaveLength(0)
  })
})

/**
 * The release blocker this block closes: a consented attribution session whose
 * `first_source_class` is `unknown` was persisted as `attributed` and counted by
 * `p10_conversion_chain_coverage.attributed_paid_events`. A session identity
 * proves continuity and consent — never acquisition.
 */
describe('P10 acquisition truth: a consented session is never mistaken for a known source', () => {
  it('derives exactly one state vocabulary for the browser and business paths', () => {
    // No session at all: nothing traces the conversion.
    expect(deriveAttributionState({ hasSession: false, sourceClass: null })).toBe('unknown_source')
    expect(deriveAttributionState({ hasSession: false, sourceClass: 'organic_search' })).toBe('unknown_source')
    // Session + unknown/absent source: continuity and consent proven, acquisition NOT.
    expect(deriveAttributionState({ hasSession: true, sourceClass: 'unknown' })).toBe('session_only')
    expect(deriveAttributionState({ hasSession: true, sourceClass: null })).toBe('session_only')
    expect(deriveAttributionState({ hasSession: true, sourceClass: undefined })).toBe('session_only')
    // Session + a KNOWN source only.
    for (const known of ['organic_search', 'campaign', 'referral', 'direct', 'internal'] as const) {
      expect(deriveAttributionState({ hasSession: true, sourceClass: known })).toBe('attributed')
    }
    expect(ATTRIBUTION_STATES).toEqual(['attributed', 'session_only', 'unknown_source'])
    expect(isKnownSourceClass('unknown')).toBe(false)
    expect(isKnownSourceClass(null)).toBe(false)
    expect(isKnownSourceClass('referral')).toBe(true)
  })

  it('stores an unknown-source paid order as session_only with consent still granted', async () => {
    const identityHash = await sha256Hex(SESSION_TOKEN)
    const fake = createP10FakeDb({
      conversion_attribution_sessions: [
        seedSession({ identity_hash: identityHash, first_source_class: 'unknown', first_source_detail: {} }),
      ],
    })
    const result = await bindBusinessEvent(fake.client, {
      eventType: 'order_paid',
      subjectType: 'order',
      subjectId: 'order-session-only',
      amountCents: 4200,
      currency: 'usd',
      occurredAt: '2026-09-22T11:10:00.000Z',
      token: SESSION_TOKEN,
    })

    expect(result.status).toBe('recorded')
    const [event] = fake.rows('conversion_events')
    expect(event).toMatchObject({
      attribution_state: 'session_only',
      session_id: '11111111-1111-4111-8111-111111111111',
      source_class: 'unknown',
      // Consent truth is unchanged by the source being unknown: the session row
      // can only exist for a visitor who granted analytics consent.
      consent_state: 'granted',
      observation: 'server_observed',
      amount_cents: 4200,
    })
  })

  it('stores unknown-source browser events as session_only too, never as attributed', async () => {
    const identityHash = await sha256Hex(SESSION_TOKEN)
    const fake = createP10FakeDb({
      conversion_attribution_sessions: [seedSession({ identity_hash: identityHash, first_source_class: 'unknown' })],
    })

    expect(await recordClientEvent(fake.client, { token: SESSION_TOKEN, eventType: 'landing', now: FIXED_NOW }))
      .toMatchObject({ status: 'recorded' })
    expect(await recordClientEvent(fake.client, {
      token: SESSION_TOKEN,
      eventType: 'cta_click',
      ctaId: 'gig_order_cta:gig-1',
      now: FIXED_NOW,
    })).toMatchObject({ status: 'recorded' })

    expect(fake.rows('conversion_events')).toHaveLength(2)
    for (const event of fake.rows('conversion_events')) {
      expect(event).toMatchObject({
        attribution_state: 'session_only',
        source_class: 'unknown',
        consent_state: 'granted',
        observation: 'client_declared',
      })
    }
  })

  it('counts a session_only paid event as session_only and never as attributed', async () => {
    const fake = createP10FakeDb({
      conversion_attribution_sessions: [
        seedSession({
          identity_hash: await sha256Hex(SESSION_TOKEN),
          first_source_class: 'unknown',
          first_source_detail: {},
        }),
        seedSession({
          id: '44444444-4444-4444-8444-444444444444',
          identity_hash: await sha256Hex(OTHER_TOKEN),
          first_source_class: 'organic_search',
          first_source_detail: { engine: 'google' },
        }),
      ],
    })
    const paid = (subjectId: string, token: string | null) =>
      bindBusinessEvent(fake.client, {
        eventType: 'order_paid',
        subjectType: 'order',
        subjectId,
        amountCents: 9900,
        currency: 'usd',
        cluster: 'us_f1_opt',
        occurredAt: '2026-09-22T11:20:00.000Z',
        token,
      })

    await paid('order-known-source', OTHER_TOKEN) // attributed (known source)
    await paid('order-session-only', SESSION_TOKEN) // session_only (unknown source)
    await paid('order-no-session', null) // unknown_source (no session at all)

    const coverage = await loadConversionCoverage(fake.client, { cluster: 'us_f1_opt', now: FIXED_NOW })
    expect(coverage.paid_event_states).toEqual({
      attributed: 1,
      session_only: 1,
      unknown_source: 1,
      stale_view: false,
    })
    const [row] = coverage.clusters
    expect(row).toMatchObject({
      cluster: 'us_f1_opt',
      paid_events: 3,
      attributed_paid_events: 1,
      session_only_paid_events: 1,
      unknown_source_paid_events: 1,
    })
    // The invariant in one line: the three states partition every paid event, and
    // no unknown-source row can inflate the attributed count.
    expect(Number(row.attributed_paid_events) + Number(row.session_only_paid_events) + Number(row.unknown_source_paid_events))
      .toBe(Number(row.paid_events))
  })

  it('refuses at storage level every state shape the migration refuses', async () => {
    const fake = createP10FakeDb()
    const base = {
      event_key: 'shape-check-1',
      event_type: 'order_paid',
      observation: 'server_observed',
      consent_state: 'granted',
      subject_type: 'order',
      subject_id: 'order-shape',
    }
    const insert = (row: Record<string, unknown>) =>
      fake.client.from('conversion_events').insert(row).select('id').single()

    // A session whose acquisition source is unknown can never be `attributed`.
    expect((await insert({ ...base, attribution_state: 'attributed', session_id: 'session-1', source_class: 'unknown' })).error?.code)
      .toBe('23514')
    // `session_only` requires the session (continuity) it claims.
    expect((await insert({ ...base, attribution_state: 'session_only', session_id: null, source_class: 'unknown' })).error?.code)
      .toBe('23514')
    // `unknown_source` means no session and no source.
    expect((await insert({ ...base, attribution_state: 'unknown_source', session_id: 'session-1', source_class: null })).error?.code)
      .toBe('23514')
    // A session-bound event without granted consent is refused (session = consent).
    expect((await insert({
      ...base,
      attribution_state: 'session_only',
      session_id: 'session-1',
      source_class: 'unknown',
      consent_state: 'unknown',
    })).error?.code).toBe('23514')
    expect(fake.rows('conversion_events')).toHaveLength(0)

    // The truthful shape is accepted, at both ends of the vocabulary.
    expect((await insert({ ...base, attribution_state: 'session_only', session_id: 'session-1', source_class: 'unknown' })).error)
      .toBeNull()
    expect((await insert({
      ...base,
      event_key: 'shape-check-2',
      attribution_state: 'attributed',
      session_id: 'session-1',
      source_class: 'campaign',
    })).error).toBeNull()
    expect(fake.rows('conversion_events').map((row) => row.attribution_state)).toEqual(['session_only', 'attributed'])
  })

  it('reports a stale coverage view instead of silently folding session_only into attributed', async () => {
    const fake = createP10FakeDb()
    // A deployed view that predates `session_only_paid_events` still reports the
    // old (inflating) columns; the report must say so rather than look healthy.
    const staleViewDb = {
      from: (table: string) =>
        table === 'p10_conversion_chain_coverage'
          ? {
              select: async () => ({
                data: [
                  {
                    cluster: 'us_f1_opt',
                    paid_events: 1,
                    attributed_paid_events: 1,
                    unknown_source_paid_events: 0,
                  },
                ],
                error: null,
              }),
            }
          : fake.client.from(table),
    }

    const coverage = await loadConversionCoverage(staleViewDb as never, { now: FIXED_NOW })
    expect(coverage.paid_event_states.stale_view).toBe(true)
    expect(coverage.measurement_state).toBe('observed_business_events_present')
    expect(coverage.program_pass_claimed).toBe(false)
  })
})

describe('P10 deterministic idempotency', () => {
  async function activeSessionFake() {
    const identityHash = await sha256Hex(SESSION_TOKEN)
    return createP10FakeDb({
      conversion_attribution_sessions: [seedSession({ identity_hash: identityHash })],
    })
  }

  it('records a landing once and a double-clicked CTA once per day', async () => {
    const fake = await activeSessionFake()

    const first = await recordClientEvent(fake.client, { token: SESSION_TOKEN, eventType: 'landing' })
    const replay = await recordClientEvent(fake.client, { token: SESSION_TOKEN, eventType: 'landing' })
    expect(first).toMatchObject({ status: 'recorded', deduped: false })
    expect(replay).toMatchObject({ status: 'recorded', deduped: true, id: (first as { id: string }).id })

    await recordClientEvent(fake.client, { token: SESSION_TOKEN, eventType: 'cta_click', ctaId: 'gig_order_cta:gig-1' })
    const doubleClick = await recordClientEvent(fake.client, { token: SESSION_TOKEN, eventType: 'cta_click', ctaId: 'gig_order_cta:gig-1' })
    expect(doubleClick).toMatchObject({ status: 'recorded', deduped: true })

    await recordClientEvent(fake.client, { token: SESSION_TOKEN, eventType: 'cta_click', ctaId: 'gig_order_cta:gig-2' })

    const events = fake.rows('conversion_events')
    expect(events.filter((event) => event.event_type === 'landing')).toHaveLength(1)
    expect(events.filter((event) => event.event_type === 'cta_click')).toHaveLength(2)
    expect(events.every((event) => event.observation === 'client_declared')).toBe(true)
    expect(events.every((event) => event.subject_type === null && event.amount_cents === null)).toBe(true)
  })

  it('never double-credits an order when the same paid callback arrives twice', async () => {
    const fake = createP10FakeDb()
    const order = {
      eventType: 'order_paid' as const,
      subjectType: 'order' as const,
      subjectId: 'order-webhook-1',
      amountCents: 19900,
      currency: 'usd',
      occurredAt: '2026-09-22T10:00:00.000Z',
    }
    const first = await bindBusinessEvent(fake.client, order)
    const retry = await bindBusinessEvent(fake.client, order)
    const webhookRetry = await bindBusinessEvent(fake.client, { ...order, evidence: { gateway: 'authorizenet' } })

    expect(first).toMatchObject({ status: 'recorded', deduped: false })
    expect(retry).toMatchObject({ status: 'recorded', deduped: true })
    expect(webhookRetry).toMatchObject({ status: 'recorded', deduped: true })
    expect(fake.rows('conversion_events')).toHaveLength(1)
  })

  it('reports unavailable instead of pretending a write happened when the ledger is absent', async () => {
    const fake = createP10FakeDb({}, { missingTables: ['conversion_events'] })
    const result = await bindBusinessEvent(fake.client, {
      eventType: 'order_paid',
      subjectType: 'order',
      subjectId: 'order-missing-table',
      amountCents: 100,
      currency: 'usd',
      occurredAt: '2026-09-22T10:00:00.000Z',
    })
    expect(result).toMatchObject({ status: 'not_recorded', reason: 'unavailable' })
    // Nothing was silently dropped OR invented: the ledger rejected the write.
    expect(fake.rows('conversion_events')).toHaveLength(0)
  })

  it('still records a real business event (as unknown_source) when only the identity store is absent', async () => {
    const fake = createP10FakeDb({}, { missingTables: ['conversion_attribution_sessions'] })
    const result = await bindBusinessEvent(fake.client, {
      eventType: 'order_paid',
      subjectType: 'order',
      subjectId: 'order-no-identity-store',
      amountCents: 100,
      currency: 'usd',
      occurredAt: '2026-09-22T10:00:00.000Z',
      token: SESSION_TOKEN,
    })
    // A real captured payment is never dropped because analytics storage is down,
    // and it is never falsely attributed either.
    expect(result).toMatchObject({ status: 'recorded' })
    expect(fake.rows('conversion_events')[0]).toMatchObject({
      attribution_state: 'unknown_source',
      consent_state: 'unknown',
      session_id: null,
      subject_id: 'order-no-identity-store',
    })
  })
})

describe('P10 cross-domain handoff links rather than merges', () => {
  const parentId = '22222222-2222-4222-8222-222222222222'

  it('fails closed when no signing secret is configured', async () => {
    expect(resolveHandoffSecret({})).toBeNull()
    expect(resolveHandoffSecret({ [HANDOFF_SECRET_ENV]: 'too-short' })).toBeNull()
    const fake = createP10FakeDb()
    const result = await linkHandoffSession(fake.client, {
      childToken: 'child-token-0123456789abcdefghij',
      handoffToken: 'v1.abc.def',
      secret: null,
    })
    expect(result).toMatchObject({ status: 'not_linked', reason: 'unavailable', detail: 'secret_unavailable' })
  })

  it('links a child session to the parent named by a valid token, exactly once', async () => {
    const childHash = await sha256Hex(SESSION_TOKEN)
    const fake = createP10FakeDb({
      conversion_attribution_sessions: [
        seedSession({ identity_hash: childHash, id: '33333333-3333-4333-8333-333333333333' }),
        seedSession({ identity_hash: await sha256Hex(OTHER_TOKEN), id: parentId }),
      ],
    })
    const token = await mintHandoffToken(HANDOFF_SECRET, { sessionId: parentId, nonce: 'nonce-0123456789abcdef', host: 'market.yousafeconsultancy.com', now: FIXED_NOW })

    const linked = await linkHandoffSession(fake.client, { childToken: SESSION_TOKEN, handoffToken: token, secret: HANDOFF_SECRET, now: FIXED_NOW + 1000 })
    expect(linked).toMatchObject({ status: 'linked', childSessionId: '33333333-3333-4333-8333-333333333333', parentSessionId: parentId })

    // Replaying the same handoff URL cannot create a second edge.
    const replay = await linkHandoffSession(fake.client, { childToken: SESSION_TOKEN, handoffToken: token, secret: HANDOFF_SECRET, now: FIXED_NOW + 2000 })
    expect(replay).toMatchObject({ status: 'not_linked', reason: 'replay' })
    expect(fake.rows('conversion_attribution_links')).toHaveLength(1)
    expect(fake.rows('conversion_attribution_links')[0]).toMatchObject({ child_session_id: '33333333-3333-4333-8333-333333333333', parent_session_id: parentId })
  })

  it('rejects a tampered signature and an expired token', async () => {
    const childHash = await sha256Hex(SESSION_TOKEN)
    const fake = createP10FakeDb({
      conversion_attribution_sessions: [
        seedSession({ identity_hash: childHash }),
        seedSession({ identity_hash: await sha256Hex(OTHER_TOKEN), id: parentId }),
      ],
    })
    const token = await mintHandoffToken(HANDOFF_SECRET, { sessionId: parentId, now: FIXED_NOW, ttlSeconds: 60 })
    const tampered = `${token.slice(0, -4)}AAAA`

    expect(await linkHandoffSession(fake.client, { childToken: SESSION_TOKEN, handoffToken: tampered, secret: HANDOFF_SECRET, now: FIXED_NOW }))
      .toMatchObject({ status: 'not_linked', detail: 'signature' })
    expect(await linkHandoffSession(fake.client, { childToken: SESSION_TOKEN, handoffToken: token, secret: HANDOFF_SECRET, now: FIXED_NOW + 61_000 }))
      .toMatchObject({ status: 'not_linked', detail: 'expired' })
    expect(fake.rows('conversion_attribution_links')).toHaveLength(0)
  })

  it('consumes the handoff cookie through the session route', async () => {
    process.env[HANDOFF_SECRET_ENV] = HANDOFF_SECRET
    try {
      const childHash = await sha256Hex(SESSION_TOKEN)
      const fake = createP10FakeDb({
        conversion_attribution_sessions: [
          seedSession({ identity_hash: childHash }),
          seedSession({ identity_hash: await sha256Hex(OTHER_TOKEN), id: parentId }),
        ],
      })
      jest.mocked(createSupabaseAdminClient).mockReturnValue(fake.client as never)
      const token = await mintHandoffToken(HANDOFF_SECRET, { sessionId: parentId, nonce: 'route-nonce-0123456789' })

      const response = await attributionSessionPOST(
        jsonRequest(
          'https://portal.yousafeconsultancy.com/api/attribution/session',
          { consent: 'granted', landing: { host: 'portal.yousafeconsultancy.com', path: '/' } },
          { [ATTRIBUTION_COOKIE]: SESSION_TOKEN, [ATTRIBUTION_HANDOFF_COOKIE]: token },
        ),
      )
      const payload = await response.json()
      expect(payload.data.handoff).toMatchObject({ linked: true })
      expect(fake.rows('conversion_attribution_links')).toHaveLength(1)
      // The one-hop cookie cannot be replayed after it is consumed.
      expect(response.headers.get('set-cookie') ?? '').toContain(ATTRIBUTION_HANDOFF_COOKIE)
    } finally {
      delete process.env[HANDOFF_SECRET_ENV]
    }
  })
})

describe('P10 expiry, refund lifecycle and non-backfill', () => {
  it('does not attribute an order to an expired identity', async () => {
    const identityHash = await sha256Hex(SESSION_TOKEN)
    const fake = createP10FakeDb({
      conversion_attribution_sessions: [
        seedSession({
          identity_hash: identityHash,
          expires_at: new Date(FIXED_NOW - 60_000).toISOString(),
        }),
      ],
    })
    expect(await resolveAttributionSession(fake.client, SESSION_TOKEN, FIXED_NOW)).toMatchObject({ status: 'expired' })
    expect(await recordClientEvent(fake.client, { token: SESSION_TOKEN, eventType: 'landing', now: FIXED_NOW }))
      .toMatchObject({ status: 'not_recorded', reason: 'session_inactive' })

    const bound = await bindBusinessEvent(fake.client, {
      eventType: 'order_paid',
      subjectType: 'order',
      subjectId: 'order-after-expiry',
      amountCents: 2500,
      currency: 'usd',
      occurredAt: new Date(FIXED_NOW).toISOString(),
      token: SESSION_TOKEN,
      now: FIXED_NOW,
    })
    expect(bound.status).toBe('recorded')
    const [event] = fake.rows('conversion_events')
    expect(event).toMatchObject({ attribution_state: 'unknown_source', consent_state: 'unknown', session_id: null })
    expect((event.evidence as Record<string, unknown>).attribution_identity_state).toBe('expired')
  })

  it('appends refund and cancellation rows without erasing the paid event', async () => {
    const fake = createP10FakeDb()
    await bindBusinessEvent(fake.client, {
      eventType: 'order_paid',
      subjectType: 'order',
      subjectId: 'order-refund-lifecycle',
      amountCents: 30000,
      currency: 'usd',
      cluster: 'us_f1_opt',
      occurredAt: '2026-09-20T09:00:00.000Z',
    })
    await bindBusinessEvent(fake.client, {
      eventType: 'order_refunded',
      subjectType: 'order',
      subjectId: 'order-refund-lifecycle',
      amountCents: 10000,
      currency: 'usd',
      cluster: 'us_f1_opt',
      occurredAt: '2026-09-21T09:00:00.000Z',
      lifecycleRef: 'escrow-10000',
    })
    await bindBusinessEvent(fake.client, {
      eventType: 'order_refunded',
      subjectType: 'order',
      subjectId: 'order-refund-lifecycle',
      amountCents: 20000,
      currency: 'usd',
      cluster: 'us_f1_opt',
      occurredAt: '2026-09-22T09:00:00.000Z',
      lifecycleRef: 'escrow-30000',
    })
    await bindBusinessEvent(fake.client, {
      eventType: 'order_cancelled',
      subjectType: 'order',
      subjectId: 'order-refund-lifecycle',
      occurredAt: '2026-09-22T10:00:00.000Z',
    })

    const events = fake.rows('conversion_events')
    expect(events.map((event) => event.event_type)).toEqual(['order_paid', 'order_refunded', 'order_refunded', 'order_cancelled'])
    // Lifecycle coherence: the cancellation carried no cluster of its own, so it
    // inherits the one already evidenced for this order instead of inventing one.
    expect(events[3].cluster).toBe('us_f1_opt')
    // The append-only ledger is never mutated: no update/delete writes at all.
    expect(fake.writes.some((write) => write.table === 'conversion_events' && write.kind === 'update')).toBe(false)

    const coverage = await loadConversionCoverage(fake.client, { cluster: 'us_f1_opt', now: FIXED_NOW })
    expect(coverage.measurement_state).toBe('observed_business_events_present')
    const [row] = coverage.clusters
    expect(row).toMatchObject({
      cluster: 'us_f1_opt',
      paid_events: 1,
      refund_events: 2,
      cancelled_events: 1,
      unknown_source_paid_events: 1,
      attributed_paid_events: 0,
      consent_granted_events: 0,
      consent_unknown_events: 4,
      paid_amount_cents: 30000,
      refunded_amount_cents: 30000,
    })
    expect(coverage.program_pass_claimed).toBe(false)
  })

  it('exposes no retroactive backfill surface for historical orders', () => {
    const source = engineSource()
    expect(source).not.toMatch(/export async function backfill/i)
    expect(source).not.toMatch(/from\('orders'\)/)
    expect(source).not.toMatch(/from\('order_events'\)/)
    expect(source).not.toMatch(/from\('inquiries'\)/)
    expect(source).toContain('There is intentionally NO backfill entry point')
    // The load-bearing await: without it a rejecting insert escapes the
    // try/catch as an unhandled rejection of bindBusinessEvent and a paid order
    // fails on telemetry. This pin exists because that regression was proven by
    // a deliberate removal (7 failures across the P10 + order-cancel battery).
    expect(source).toContain('return await insertWithDedupe(')
  })

  it('reports "no observed business events" and never claims the program gate', async () => {
    const fake = createP10FakeDb()
    const coverage = await loadConversionCoverage(fake.client, { now: FIXED_NOW })
    expect(coverage.measurement_state).toBe('no_observed_business_events')
    expect(coverage.observed_business_events).toBe(0)
    expect(coverage.program_pass_claimed).toBe(false)
  })
})

describe('P10 read-only admin proof surface', () => {
  it('reports the locked pilot, stored coverage and an explicit non-PASS', async () => {
    const fake = createP10FakeDb()
    jest.mocked(requireAdminUser).mockResolvedValue({
      db: fake.client,
      profile: { id: 'profile-1', role: 'admin' },
      profileId: 'profile-1',
      role: 'admin',
    } as never)

    const response = await attributionReportGET(
      new Request('https://portal.yousafeconsultancy.com/api/admin/analytics/conversion-attribution'),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.data.pilot).toMatchObject({
      cluster: 'us_f1_opt',
      meaningful_event: 'order_paid',
      supporting_event: 'lead_created',
    })
    expect(payload.data.program_pass_claimed).toBe(false)
    expect(payload.data.measurement_state).toBe('no_observed_business_events')
    // The cross-domain EMITTER adapter is not shipped, and the proof surface
    // says so instead of implying cross-domain continuity is complete.
    expect(payload.data.cross_domain_handoff).toMatchObject({
      emitter_shipped: P10_CROSS_DOMAIN_HANDOFF.emitter_shipped,
      state: 'emitter_adapter_pending',
    })
    expect(payload.data.cross_domain_handoff.emitter_shipped).toBe(false)
  })

  it('requires an admin session', async () => {
    jest.mocked(requireAdminUser).mockResolvedValue({ error: 'Forbidden', status: 403 } as never)
    const response = await attributionReportGET(
      new Request('https://portal.yousafeconsultancy.com/api/admin/analytics/conversion-attribution'),
    )
    expect(response.status).toBe(403)
  })

  it('exposes the same paid-event state fields as the coverage view', async () => {
    const fake = createP10FakeDb({
      conversion_attribution_sessions: [
        seedSession({ identity_hash: await sha256Hex(SESSION_TOKEN), first_source_class: 'unknown', first_source_detail: {} }),
      ],
    })
    await bindBusinessEvent(fake.client, {
      eventType: 'order_paid',
      subjectType: 'order',
      subjectId: 'order-admin-session-only',
      amountCents: 12000,
      currency: 'usd',
      cluster: 'us_f1_opt',
      occurredAt: '2026-09-22T11:30:00.000Z',
      token: SESSION_TOKEN,
    })
    jest.mocked(requireAdminUser).mockResolvedValue({
      db: fake.client,
      profile: { id: 'profile-1', role: 'admin' },
      profileId: 'profile-1',
      role: 'admin',
    } as never)

    const response = await attributionReportGET(
      new Request('https://portal.yousafeconsultancy.com/api/admin/analytics/conversion-attribution'),
    )
    const payload = await response.json()
    const [cluster] = payload.data.clusters

    expect(response.status).toBe(200)
    // The proof surface names the same three states the SQL view and the fake DB
    // helper expose, and the attributed count is not inflated by the session.
    expect(payload.data.clusters[0]).toMatchObject({
      attributed_paid_events: 0,
      session_only_paid_events: 1,
      unknown_source_paid_events: 0,
    })
    expect(payload.data.paid_event_states).toEqual({
      attributed: 0,
      session_only: 1,
      unknown_source: 0,
      stale_view: false,
    })
    expect(cluster.paid_events).toBe(1)
    expect(payload.data.program_pass_claimed).toBe(false)
  })
})

/**
 * The release-blocking invariant: attribution is telemetry and is never allowed
 * to fail a business path. These tests deliberately use a database client that
 * has NO attribution surface at all (`from()` returns a bare object), which is
 * the harshest form of "the ledger is not usable" — a missing migration, a
 * partial/mocked client or a transport failure all look like this to the caller.
 * Nothing here enriches a mock to hide the invariant: the mocks are made WORSE
 * on purpose and the public contracts must still hold.
 */
describe('P10 telemetry is non-blocking (a broken ledger can never fail a business path)', () => {
  /**
   * A DB double with no `conversion_events` / session / link surface whatsoever:
   * `from(table)` returns an empty object, so any `.insert(...)` / `.select(...)`
   * is a TypeError. Only `rpc` works (that is the money path in this repo).
   */
  function ledgerlessDb(rpcResult: unknown) {
    const touched: string[] = []
    return {
      touched,
      rpc: jest.fn(async () => rpcResult),
      from: (table: string) => {
        touched.push(table)
        return {} as Record<string, unknown>
      },
    }
  }

  it('resolves typed unavailability instead of rejecting for every public entry point', async () => {
    const db = ledgerlessDb({ data: null, error: null })
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    try {
      // Every call below is awaited DIRECTLY: a rejected promise would fail the
      // test, which is exactly the regression this guards (a returned-but-not-
      // awaited insert used to escape bindBusinessEvent's try/catch).
      await expect(bindBusinessEvent(db as never, {
        eventType: 'order_paid',
        subjectType: 'order',
        subjectId: 'order-0001',
        amountCents: 5000,
        currency: 'usd',
        occurredAt: '2026-09-22T11:00:00.000Z',
        token: SESSION_TOKEN,
      })).resolves.toMatchObject({ status: 'not_recorded', reason: 'unavailable' })

      await expect(recordClientEvent(db as never, { token: SESSION_TOKEN, eventType: 'landing' }))
        .resolves.toMatchObject({ status: 'not_recorded', reason: 'unavailable' })
      await expect(resolveAttributionSession(db as never, SESSION_TOKEN))
        .resolves.toMatchObject({ status: 'unavailable' })
      await expect(issueAttributionSession(db as never, {
        token: SESSION_TOKEN,
        consent: 'granted',
        source: classifyAttributionSource({ host: 'portal.yousafeconsultancy.com', path: '/' }),
      })).resolves.toMatchObject({ status: 'refused', reason: 'unavailable' })
      await expect(revokeAttributionSession(db as never, { token: SESSION_TOKEN, reason: 'consent_withdrawn' }))
        .resolves.toMatchObject({ revoked: false })

      const parentId = '22222222-2222-4222-8222-222222222222'
      const handoff = await mintHandoffToken(HANDOFF_SECRET, {
        sessionId: parentId,
        nonce: 'ledgerless-nonce-0123456789',
      })
      // No identity store at all: the honest answer is "no child session", again
      // as a resolved result rather than a rejection.
      await expect(linkHandoffSession(db as never, {
        childToken: SESSION_TOKEN,
        handoffToken: handoff,
        secret: HANDOFF_SECRET,
      })).resolves.toMatchObject({ status: 'not_linked', reason: 'no_child_session' })

      // A mid-flight failure (identity resolved, link table unusable) is also
      // converted into an honest "not linked / unavailable".
      const seeded = createP10FakeDb({
        conversion_attribution_sessions: [
          seedSession({ identity_hash: await sha256Hex(SESSION_TOKEN) }),
          seedSession({ identity_hash: await sha256Hex(OTHER_TOKEN), id: parentId }),
        ],
      })
      const brokenLinks = {
        from: (table: string) => table === 'conversion_attribution_links'
          ? ({} as Record<string, unknown>)
          : seeded.client.from(table),
      }
      await expect(linkHandoffSession(brokenLinks as never, {
        childToken: SESSION_TOKEN,
        handoffToken: await mintHandoffToken(HANDOFF_SECRET, { sessionId: parentId, nonce: 'broken-link-nonce-0123456789' }),
        secret: HANDOFF_SECRET,
      })).resolves.toMatchObject({ status: 'not_linked', reason: 'unavailable' })

      await expect(loadConversionCoverage(db as never)).resolves.toMatchObject({
        measurement_state: 'unavailable',
        observed_business_events: 0,
        // A wiring failure can never be reported as program PASS.
        program_pass_claimed: false,
      })
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('still cancels a real order (200 + refund payload) when the attribution ledger is unusable', async () => {
    const db = ledgerlessDb({
      data: {
        ok: true,
        refund_cents: 5000,
        refund_method: 'wallet',
        wallet_balance_cents: 12345,
        from_status: 'created',
      },
      error: null,
    })
    jest.mocked(requirePortalUser).mockResolvedValue({
      db,
      profile: { id: 'client-1', role: 'client' },
      profileId: 'client-1',
      role: 'client',
    } as never)

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const response = await orderCancelPOST(
        new Request('https://portal.yousafeconsultancy.com/api/orders/order-1/cancel', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ reason: 'Changed my mind' }),
        }),
        { params: Promise.resolve({ id: 'order-1' }) },
      )

      // Primary behaviour is untouched by telemetry: the cancellation succeeded.
      expect(response.status).toBe(200)
      expect((await response.json()).data).toMatchObject({
        order: { id: 'order-1', status: 'cancelled' },
        refund_cents: 5000,
      })
    } finally {
      errorSpy.mockRestore()
      jest.mocked(requirePortalUser).mockReset()
    }

    // The binder really was attempted against the ledger; the ledger simply was
    // not usable, so the lifecycle event is honestly reported as not recorded
    // rather than failing the cancellation.
    expect(db.touched).toContain('conversion_events')
  })
})

describe('P10 browser chain wiring', () => {
  it('emits the landing event only after the consented session bootstrap succeeds', () => {
    const source = clientSource()
    const component = attributionClientSource()

    // Root client bootstrap is actually mounted and invoked.
    expect(component).toContain('void bootstrapAttribution()')
    // The server-confirmed tracking result gates the landing edge; the browser
    // never invents a landing event before a consented session exists.
    expect(source).toContain('if (tracking) trackAttributionLanding()')
    expect(source).toContain("body: JSON.stringify({ event_type: 'landing' })")
    expect(source).toContain("credentials: 'same-origin'")
    // Source class is read from the session route's real nested response shape.
    expect(source).toContain('source_class: payload?.data?.attribution?.source_class')
  })
})

describe('P10 SEO safety', () => {
  it('treats the handoff parameter as tracking junk that can never become an indexable URL', () => {
    const source = middlewareSource()
    expect(isTrackingQueryKey('yattr')).toBe(true)
    expect(isTrackingQueryKey('utm_anything')).toBe(true)
    expect(isTrackingQueryKey('page')).toBe(false)
    // A handoff URL consolidates to the clean canonical path (301 destination).
    expect(stripTrackingParams(new URL('https://market.yousafeconsultancy.com/gigs/f1-review?yattr=v1.tok.sig&utm_source=news&page=2')))
      .toBe('/gigs/f1-review?page=2')
    expect(stripTrackingParams(new URL('https://market.yousafeconsultancy.com/gigs/f1-review'))).toBeNull()
    // The middleware delegates both the strip and the capture decision to the
    // shared pure helpers; it has no inline consent logic of its own.
    expect(source).toContain("from './lib/trackingParams'")
    expect(source).toContain('deleteTrackingQueryParams(target.searchParams)')
    expect(source).toContain("from './lib/attribution/cookies'")
    expect(source).toContain('attributionCaptureCookies(req)')
    // Capture happens on the SAME redirect that removes the parameter, so the
    // clean canonical URL is what both crawlers and browsers land on.
    expect(source.match(/withAttributionCapture\(NextResponse\.redirect\(/g)?.length).toBeGreaterThanOrEqual(4)
    // No "not denied" capture rule remains anywhere: unknown was the loophole.
    expect(source).not.toContain("readConsent(req) !== 'denied'")
  })

  it('captures neither handoff nor campaign state unless consent is explicitly granted', () => {
    const trackingUrl = 'https://market.yousafeconsultancy.com/gigs/f1-review?yattr=v1.payload.signature&utm_source=newsletter&utm_campaign=f1'
    const handoffCookie = (cookies: string[]) => cookies.some((cookie) => cookie.startsWith(`${ATTRIBUTION_HANDOFF_COOKIE}=`))
    const sourceCookie = (cookies: string[]) => cookies.some((cookie) => cookie.startsWith(`${ATTRIBUTION_SOURCE_COOKIE}=`))

    // unknown (no banner choice yet): nothing is persisted on the visitor's behalf.
    const unknown = attributionCaptureCookies(new Request(trackingUrl))
    expect(unknown).toEqual([])
    expect(handoffCookie(unknown)).toBe(false)
    expect(sourceCookie(unknown)).toBe(false)

    // denied: nothing is persisted, and the tracking parameters are still removed.
    const denied = attributionCaptureCookies(new Request(trackingUrl, {
      headers: { cookie: `${ANALYTICS_CONSENT_COOKIE}=denied` },
    }))
    expect(denied).toEqual([])

    // explicit granted: the already-consented handoff and campaign are carried.
    const granted = attributionCaptureCookies(new Request(trackingUrl, {
      headers: { cookie: `${ANALYTICS_CONSENT_COOKIE}=granted` },
    }))
    expect(handoffCookie(granted)).toBe(true)
    expect(sourceCookie(granted)).toBe(true)
    expect(granted.find((cookie) => cookie.startsWith(`${ATTRIBUTION_HANDOFF_COOKIE}=`))).toContain('Max-Age=600')

    // Whatever the consent decision, the tracking URL still consolidates to the
    // clean SEO canonical (the capture never keeps the parameter alive).
    expect(stripTrackingParams(new URL(trackingUrl))).toBe('/gigs/f1-review')
  })
})
