/**
 * P9 — a backlink target may become `won` ONLY from a live verification that
 * fetched the claimed third-party page and found a real anchor href to the
 * target's OWN persisted destination URL.
 *
 * Covers: URL/prospect/estate validation, the persisted-destination binding,
 * the outbound-fetch safety controls (per-hop validation, DNS resolution of
 * every hop BEFORE it is requested, redirect-to-private/cross-domain refusal,
 * bounded hop count), the bounded HTML body (content type, declared length,
 * streaming cap), the positive proof path (evidence row + durable won
 * pointers), every negative lane (plain-text URL, commented-out anchor,
 * script-serialized URL, wrong href, dead page, network failure), outreach
 * provenance binding, evidence-persistence failure (no proof ⇒ no win),
 * idempotency, and the admin-only route.
 */
jest.mock('@/lib/supabase', () => ({ createSupabaseAdminClient: jest.fn() }))
jest.mock('@/lib/portalAuth', () => ({ requireAdminUser: jest.fn() }))

import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { requireAdminUser } from '@/lib/portalAuth'
import {
  BACKLINK_VERIFICATION_METHOD,
  DESTINATION_LIVE_METHOD,
  MAX_BACKLINK_BODY_BYTES,
  MAX_BACKLINK_REDIRECT_HOPS,
  checkDestinationLive,
  isPrivateOrLocalHost,
  isYouSafeOwnedHost,
  listBacklinkVerifications,
  observeBacklinkAnchorFacts,
  observeBacklinkPageFacts,
  resolvePersistedDestination,
  validateBacklinkSourceUrl,
  validateEstateTargetUrl,
  validateFetchHopUrl,
  verifyBacklinkClaim,
} from '@/lib/seoFactory/backlinkVerification'
import {
  isIpLiteral,
  isPrivateOrReservedAddress,
  resolveHostAddresses,
} from '@/lib/seoFactory/hostResolution'
import { POST as verifyPOST, GET as verifyGET } from '@/app/api/seo-engine/backlink/verify/route'
import { createP9FakeDb, type P9FakeRow } from './helpers/p9BacklinkFakeDb'

const SOURCE = 'https://www.ilw.com/articles/immigration-news.shtm'
const SOURCE_ROOTS = 'https://ilw.com/articles/immigration-news.shtm'
const TARGET = 'https://legal.yousafeconsultancy.com/us/student-visas/'
const OTHER_ESTATE_PAGE = 'https://legal.yousafeconsultancy.com/us/other-guide/'
/** The third-party placement surface — NEVER the destination. */
const PLACEMENT_SURFACE = 'https://www.ilw.com/submit-a-guest-post'
const OTHER_PROSPECT = 'https://www.other-prospect.example/articles/guest-post'

const createSupabaseAdminClientMock = jest.mocked(createSupabaseAdminClient)
const requireAdminUserMock = jest.mocked(requireAdminUser)

function targetRow(overrides: P9FakeRow = {}): P9FakeRow {
  return {
    id: 'target-1',
    domain: 'ilw.com',
    status: 'sent',
    target_url: PLACEMENT_SURFACE,
    destination_url: TARGET,
    won_at: null,
    won_verified_at: null,
    won_verification_id: null,
    won_backlink_url: null,
    last_touched_at: '2026-09-01T00:00:00.000Z',
    ...overrides,
  }
}

function installDb(
  targets: P9FakeRow[] = [targetRow()],
  options: { failEvidenceInsert?: string; outreach?: P9FakeRow[] } = {},
) {
  const db = createP9FakeDb(
    {
      seo_backlink_targets: targets,
      seo_backlink_verifications: [],
      seo_backlink_outreach: options.outreach || [],
    },
    options.failEvidenceInsert ? { failInsert: { seo_backlink_verifications: options.failEvidenceInsert } } : {},
  )
  createSupabaseAdminClientMock.mockReturnValue(db.client as never)
  return db
}

interface FakeResponse {
  status?: number
  headers?: Record<string, string>
  /** Single UTF-8 body chunk. */
  body?: string
  /** Byte-exact chunks, streamed in order (for the body-cap paths). */
  chunks?: Uint8Array[]
  /** Expose no body stream at all (only a declared length can bound it). */
  noStream?: boolean
  /** Do not invent a Content-Type header for this response. */
  noContentType?: boolean
  /** The URL the runtime reports (should be the requested one). */
  reportedUrl?: string
  throwError?: boolean
}

/**
 * Scripted fetch: each URL maps to one response (or a queue consumed in order).
 * Any request for an unscripted URL throws, so a test can prove a blocked hop
 * was never fetched.
 */
function installFetchScript(routes: Record<string, FakeResponse | FakeResponse[]>) {
  const queues = new Map<string, FakeResponse[]>()
  for (const [url, value] of Object.entries(routes)) {
    queues.set(url, Array.isArray(value) ? [...value] : [value])
  }
  const calls: string[] = []
  const fetchMock = jest.fn(async (input: unknown) => {
    const url = String(input)
    calls.push(url)
    const queue = queues.get(url)
    if (!queue || !queue.length) throw new Error(`no scripted response for ${url}`)
    const script = queue.length > 1 ? (queue.shift() as FakeResponse) : queue[0]
    if (script.throwError) throw new Error('network down')

    const status = script.status ?? 200
    const headers = new Map(
      Object.entries(script.headers || {}).map(([key, value]) => [key.toLowerCase(), value]),
    )
    if (status >= 200 && status < 300 && !script.noContentType && !headers.has('content-type')) {
      headers.set('content-type', 'text/html; charset=utf-8')
    }
    const text = script.body ?? ''
    const bytes = script.chunks ? undefined : new TextEncoder().encode(text)
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of script.chunks || (bytes ? [bytes] : [])) controller.enqueue(chunk)
        controller.close()
      },
    })
    return {
      ok: status >= 200 && status < 300,
      status,
      url: script.reportedUrl === undefined ? url : script.reportedUrl,
      headers: { get: (name: string) => headers.get(String(name).toLowerCase()) ?? null },
      body: script.noStream ? null : stream,
      text: async () => text,
    }
  })
  global.fetch = fetchMock as unknown as typeof fetch
  return Object.assign(fetchMock, { calls })
}

/** Scripted host resolver: public fixture address unless a host says otherwise. */
function scriptedResolver(byHost: Record<string, string[] | 'fail'> = {}) {
  return jest.fn(async (host: string) => {
    const entry = host in byHost ? byHost[host] : ['93.184.216.34']
    if (entry === 'fail') return { ok: false, addresses: [] as string[], reason: `"${host}" could not be resolved` }
    return { ok: true, addresses: [...entry] }
  })
}

const positiveHtml = (href = TARGET) =>
  `<html><head><link rel="canonical" href="${SOURCE}"><meta name="robots" content="index,follow"></head>` +
  `<body><article><p>Our partner guide <a href="${href}" rel="nofollow noopener">YouSafe student visas</a> explains it.</p></article></body></html>`

function evidenceInserts(db: ReturnType<typeof installDb>) {
  return db.insertsFor('seo_backlink_verifications')
}

function targetUpdates(db: ReturnType<typeof installDb>) {
  return db.updatesFor('seo_backlink_targets')
}

function verifyInput(overrides: Record<string, unknown> = {}) {
  return {
    targetId: 'target-1',
    sourceUrl: SOURCE,
    requestedTargetUrl: TARGET,
    actor: 'admin@portal',
    now: '2026-09-21T10:00:00.000Z',
    resolveHostAddresses: scriptedResolver(),
    checkDestinationLive: async (url: string) => ({
      current: true,
      status: 200,
      finalUrl: url,
      method: DESTINATION_LIVE_METHOD,
      error: null,
    }),
    ...overrides,
  }
}

let warnSpy: jest.SpyInstance

beforeEach(() => {
  jest.clearAllMocks()
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  warnSpy.mockRestore()
})

describe('A) claimed-source validation', () => {
  it('accepts an absolute http(s) page on the prospect domain or a subdomain', () => {
    for (const url of ['https://www.ilw.com/x', 'https://blog.ilw.com/x', 'http://ilw.com/x']) {
      const validation = validateBacklinkSourceUrl(url, 'ilw.com')
      expect(validation.ok).toBe(true)
      expect(validation.host).toBe(new URL(url).hostname)
    }
  })

  it('refuses relative, non-http and lookalike-suffix sources', () => {
    expect(validateBacklinkSourceUrl('ilw.com/x', 'ilw.com').reason).toMatch(/absolute/)
    expect(validateBacklinkSourceUrl('ftp://ilw.com/x', 'ilw.com').reason).toMatch(/http\(s\)/)
    expect(validateBacklinkSourceUrl('https://notilw.com/x', 'ilw.com').reason).toMatch(/does not match/)
    expect(validateBacklinkSourceUrl('', 'ilw.com').reason).toMatch(/required/)
    expect(validateBacklinkSourceUrl(SOURCE, '').reason).toMatch(/prospect domain is required/)
  })

  it('refuses a YouSafe-owned source, whatever the prospect domain says', () => {
    const validation = validateBacklinkSourceUrl('https://legal.yousafeconsultancy.com/us/student-visas/', 'yousafeconsultancy.com')
    expect(validation.ok).toBe(false)
    expect(validation.reason).toMatch(/third-party page, not the YouSafe estate/)
    expect(isYouSafeOwnedHost('blog.yousafeconsultancy.com')).toBe(true)
    expect(isYouSafeOwnedHost('market.yousafeconsultancy.com')).toBe(true)
    expect(isYouSafeOwnedHost('notyousafeconsultancy.com')).toBe(false)
  })

  it('refuses localhost and private-IP literals', () => {
    for (const host of ['localhost', '127.0.0.1', '10.1.2.3', '172.16.5.4', '192.168.0.9', '169.254.1.1', '::1', 'fc00::1', 'fe80::1']) {
      expect(isPrivateOrLocalHost(host)).toBe(true)
    }
    for (const host of ['ilw.com', 'www.ilw.com', '8.8.8.8', '2606:4700::1111']) {
      expect(isPrivateOrLocalHost(host)).toBe(false)
    }
    expect(validateBacklinkSourceUrl('http://localhost:3000/x', 'localhost').ok).toBe(false)
    expect(validateBacklinkSourceUrl('http://192.168.1.10/x', '192.168.1.10').ok).toBe(false)
    expect(validateBacklinkSourceUrl('http://[::1]/x', '::1').ok).toBe(false)
  })

  it('applies the SAME rule to every redirect hop before it is fetched', () => {
    expect(validateFetchHopUrl(SOURCE, 'ilw.com').ok).toBe(true)
    expect(validateFetchHopUrl(OTHER_PROSPECT, 'ilw.com').reason).toMatch(/does not match the prospect domain/)
    expect(validateFetchHopUrl('https://legal.yousafeconsultancy.com/x', 'yousafeconsultancy.com').reason).toMatch(
      /third-party page, not the YouSafe estate/,
    )
    expect(validateFetchHopUrl('http://169.254.169.254/latest/meta-data/', '169.254.169.254').reason).toMatch(
      /localhost\/private address/,
    )
    expect(validateFetchHopUrl('mailto:editor@ilw.com', 'ilw.com').ok).toBe(false)
  })
})

describe('B) linked-destination validation', () => {
  it('accepts only exact HOST_PUBLIC estate hosts over https', () => {
    expect(validateEstateTargetUrl(TARGET).ok).toBe(true)
    expect(validateEstateTargetUrl('https://market.yousafeconsultancy.com/categories/study-permits').ok).toBe(true)
    expect(validateEstateTargetUrl('http://legal.yousafeconsultancy.com/us/x/').reason).toMatch(/https/)
    expect(validateEstateTargetUrl('https://sub.legal.yousafeconsultancy.com/us/x/').reason).toMatch(/not a HOST_PUBLIC/)
    expect(validateEstateTargetUrl('https://evil.example.com/x').reason).toMatch(/not a HOST_PUBLIC/)
    expect(validateEstateTargetUrl('').reason).toMatch(/required/)
  })

  it('binds the destination to the target row and refuses a substituted URL', async () => {
    const bound = await resolvePersistedDestination(TARGET, TARGET)
    expect(bound.ok).toBe(true)
    expect(bound.url).toBe(TARGET)
    // A restatement that normalizes to the same canonical is the same claim.
    const restated = await resolvePersistedDestination(TARGET, 'https://legal.yousafeconsultancy.com/us/student-visas')
    expect(restated.ok).toBe(true)
    expect(restated.url).toBe(TARGET)
    // A different YouSafe canonical is a claim the target row never made.
    const substituted = await resolvePersistedDestination(TARGET, OTHER_ESTATE_PAGE)
    expect(substituted.ok).toBe(false)
    expect(substituted.reason).toMatch(/does not match the destination_url persisted on this target/)
    // A target with no persisted destination has nothing to verify against.
    const missing = await resolvePersistedDestination(null)
    expect(missing.ok).toBe(false)
    expect(missing.reason).toMatch(/no persisted destination_url/)
    // The persisted value must itself be an owned estate canonical.
    const offEstate = await resolvePersistedDestination('https://evil.example.com/x')
    expect(offEstate.ok).toBe(false)
    expect(offEstate.reason).toMatch(/not a HOST_PUBLIC/)
  })
})

describe('C) the persisted destination is the only authority', () => {
  it('verifies against the persisted destination when the request does not restate it', async () => {
    const db = installDb()
    installFetchScript({ [SOURCE]: { body: positiveHtml(TARGET) } })

    const result = await verifyBacklinkClaim(verifyInput({ requestedTargetUrl: null }))

    expect(result.ok).toBe(true)
    expect(result.verdict).toBe('verified')
    expect(result.targetUrl).toBe(TARGET)
    expect(evidenceInserts(db)[0].rows[0].target_url).toBe(TARGET)
    expect(targetUpdates(db)).toHaveLength(1)
  })

  it('refuses a request that tries to choose a different YouSafe URL', async () => {
    const db = installDb()
    const fetchMock = installFetchScript({
      [SOURCE]: { body: positiveHtml(OTHER_ESTATE_PAGE) },
      [TARGET]: { body: '<html><body>live destination</body></html>' },
    })

    const result = await verifyBacklinkClaim(verifyInput({ requestedTargetUrl: OTHER_ESTATE_PAGE }))

    expect(result.ok).toBe(false)
    expect(result.verdict).toBeNull()
    expect(result.reason).toMatch(/does not match the destination_url persisted on this target/)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(evidenceInserts(db)).toHaveLength(0)
    expect(targetUpdates(db)).toHaveLength(0)
  })

  it('cannot win a target with no persisted destination, and never fetches for it', async () => {
    const db = installDb([targetRow({ destination_url: null })])
    const fetchMock = installFetchScript({ [SOURCE]: { body: positiveHtml() } })

    const result = await verifyBacklinkClaim(verifyInput())

    expect(result.ok).toBe(false)
    expect(result.verdict).toBeNull()
    expect(result.reason).toMatch(/no persisted destination_url/)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(evidenceInserts(db)).toHaveLength(0)
    expect(targetUpdates(db)).toHaveLength(0)
    expect(db.rows('seo_backlink_targets')[0]).toMatchObject({ status: 'sent', won_verified_at: null })
  })

  it('uses destination_url, not the third-party target_url placement surface', async () => {
    const db = installDb()
    installFetchScript({ [SOURCE]: { body: positiveHtml(PLACEMENT_SURFACE) } })

    const result = await verifyBacklinkClaim(verifyInput({ requestedTargetUrl: null }))

    // The page links to the placement surface only: no anchor to the estate.
    expect(result.verdict).toBe('absent')
    expect(result.linkPresent).toBe(false)
    expect(evidenceInserts(db)[0].rows[0].target_url).toBe(TARGET)
    expect(targetUpdates(db)).toHaveLength(0)
  })
})

describe('D) outbound-fetch safety: DNS and redirects', () => {
  it('refuses a hop whose hostname resolves to a private address, without fetching it', async () => {
    const db = installDb()
    const fetchMock = installFetchScript({ [SOURCE]: { body: positiveHtml() } })
    const resolver = scriptedResolver({ 'www.ilw.com': ['10.1.2.3'] })

    const result = await verifyBacklinkClaim(verifyInput({ resolveHostAddresses: resolver }))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.verdict).toBe('unavailable')
    expect(result.linkPresent).toBe(false)
    expect(result.transitionedToWon).toBe(false)
    expect(result.reason).toMatch(/resolves to a private\/reserved address \(10\.1\.2\.3\)/)
    const evidence = evidenceInserts(db)[0].rows[0]
    expect(evidence).toMatchObject({ verdict: 'unavailable', link_present: false, source_http_status: null })
    expect(evidence.evidence).toMatchObject({
      blockedUrl: SOURCE,
      resolvedHosts: [{ host: 'www.ilw.com', addresses: ['10.1.2.3'] }],
    })
    expect(targetUpdates(db)).toHaveLength(0)
  })

  it('refuses a hostname that fails to resolve at all (fail closed, no fetch)', async () => {
    const db = installDb()
    const fetchMock = installFetchScript({ [SOURCE]: { body: positiveHtml() } })

    const result = await verifyBacklinkClaim(
      verifyInput({ resolveHostAddresses: scriptedResolver({ 'www.ilw.com': 'fail' }) }),
    )

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.verdict).toBe('unavailable')
    expect(result.reason).toMatch(/could not be resolved/)
    expect(evidenceInserts(db)[0].rows[0].verdict).toBe('unavailable')
    expect(targetUpdates(db)).toHaveLength(0)
  })

  it('refuses a resolver answer set that contains one private address', async () => {
    const db = installDb()
    const fetchMock = installFetchScript({ [SOURCE]: { body: positiveHtml() } })

    const result = await verifyBacklinkClaim(
      verifyInput({ resolveHostAddresses: scriptedResolver({ 'www.ilw.com': ['93.184.216.34', '::ffff:127.0.0.1'] }) }),
    )

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.verdict).toBe('unavailable')
    expect(result.reason).toMatch(/private\/reserved address/)
    expect(targetUpdates(db)).toHaveLength(0)
  })

  it('refuses a redirect to a private host literal BEFORE fetching it', async () => {
    const db = installDb()
    const fetchMock = installFetchScript({
      [SOURCE]: { status: 302, headers: { location: 'http://127.0.0.1/admin' } },
    })

    const result = await verifyBacklinkClaim(verifyInput())

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.calls).toEqual([SOURCE])
    expect(result.verdict).toBe('unavailable')
    expect(result.blockedUrl).toBe('http://127.0.0.1/admin')
    expect(result.reason).toMatch(/localhost\/private address/)
    const evidence = evidenceInserts(db)[0].rows[0]
    // The redirect itself was observed: that status is real evidence, not a 200.
    expect(evidence).toMatchObject({ verdict: 'unavailable', source_http_status: 302, source_final_url: SOURCE })
    expect(evidence.evidence).toMatchObject({
      redirectChain: [{ from: SOURCE, status: 302, to: 'http://127.0.0.1/admin' }],
      blockedUrl: 'http://127.0.0.1/admin',
    })
    expect(targetUpdates(db)).toHaveLength(0)
  })

  it('refuses a redirect onto a prospect subdomain that resolves to link-local metadata', async () => {
    const db = installDb()
    const metadata = 'https://internal.ilw.com/latest/meta-data/'
    const fetchMock = installFetchScript({
      [SOURCE]: { status: 302, headers: { location: metadata } },
    })

    const result = await verifyBacklinkClaim(
      verifyInput({ resolveHostAddresses: scriptedResolver({ 'internal.ilw.com': ['169.254.169.254'] }) }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.verdict).toBe('unavailable')
    expect(result.blockedUrl).toBe(metadata)
    expect(result.reason).toMatch(/169\.254\.169\.254/)
    expect(targetUpdates(db)).toHaveLength(0)
  })

  it('refuses a cross-domain redirect before following it', async () => {
    const db = installDb()
    const fetchMock = installFetchScript({
      [SOURCE]: { status: 301, headers: { location: OTHER_PROSPECT } },
    })

    const result = await verifyBacklinkClaim(verifyInput())

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.verdict).toBe('unavailable')
    expect(result.linkPresent).toBe(false)
    expect(result.observedHref).toBeNull()
    expect(result.reason).toMatch(/does not match the prospect domain/)
    const evidence = evidenceInserts(db)[0].rows[0]
    expect(evidence.link_present).toBe(false)
    expect(evidence.observed_href).toBeNull()
    expect(evidence.source_http_status).toBe(301)
    expect(evidence.evidence).toMatchObject({ redirectLeftProspect: true, blockedUrl: OTHER_PROSPECT })
    expect(targetUpdates(db)).toHaveLength(0)
  })

  it('refuses a redirect into the YouSafe estate itself', async () => {
    const db = installDb()
    const fetchMock = installFetchScript({
      [SOURCE]: { status: 307, headers: { location: TARGET } },
    })

    const result = await verifyBacklinkClaim(verifyInput())

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.verdict).toBe('unavailable')
    expect(result.reason).toMatch(/third-party page, not the YouSafe estate/)
    expect(targetUpdates(db)).toHaveLength(0)
  })

  it('bounds the redirect chain instead of following it without limit', async () => {
    const db = installDb()
    const hopUrls = Array.from({ length: MAX_BACKLINK_REDIRECT_HOPS + 1 }, (_, index) =>
      index === 0 ? SOURCE : `https://www.ilw.com/hop-${index}`,
    )
    const routes: Record<string, FakeResponse> = {}
    hopUrls.forEach((url, index) => {
      routes[url] = { status: 302, headers: { location: hopUrls[index + 1] || `${url}-forever` } }
    })
    const fetchMock = installFetchScript(routes)

    const result = await verifyBacklinkClaim(verifyInput())

    expect(fetchMock.calls).toHaveLength(MAX_BACKLINK_REDIRECT_HOPS + 1)
    expect(result.verdict).toBe('unavailable')
    expect(result.reason).toMatch(/exceeded 3 redirects/)
    expect(evidenceInserts(db)[0].rows[0].verdict).toBe('unavailable')
    expect(targetUpdates(db)).toHaveLength(0)
  })

  it('still follows a same-prospect redirect and records the hop', async () => {
    const db = installDb()
    installFetchScript({
      [SOURCE]: { status: 301, headers: { location: SOURCE_ROOTS } },
      [SOURCE_ROOTS]: { body: positiveHtml() },
    })

    const result = await verifyBacklinkClaim(verifyInput())

    expect(result.verdict).toBe('verified')
    expect(result.transitionedToWon).toBe(true)
    expect(result.sourceFinalUrl).toBe(SOURCE_ROOTS)
    const evidence = evidenceInserts(db)[0].rows[0]
    expect(evidence.source_final_url).toBe(SOURCE_ROOTS)
    expect(evidence.evidence).toMatchObject({
      redirectLeftProspect: false,
      redirectChain: [{ from: SOURCE, status: 301, to: SOURCE_ROOTS }],
    })
    expect(targetUpdates(db)).toHaveLength(1)
    expect(targetUpdates(db)[0].patch.won_backlink_url).toBe(SOURCE_ROOTS)
  })
})

describe('E) bounded body and resource limits', () => {
  it('refuses a page that declares a body beyond the verification cap', async () => {
    const db = installDb()
    installFetchScript({
      [SOURCE]: { headers: { 'content-length': String(MAX_BACKLINK_BODY_BYTES + 1) }, body: positiveHtml() },
    })

    const result = await verifyBacklinkClaim(verifyInput())

    expect(result.verdict).toBe('unavailable')
    expect(result.linkPresent).toBe(false)
    expect(result.reason).toMatch(/beyond the 2097152-byte verification limit/)
    const evidence = evidenceInserts(db)[0].rows[0]
    expect(evidence).toMatchObject({ verdict: 'unavailable', source_http_status: 200 })
    expect(evidence.evidence).toMatchObject({ declaredContentLength: MAX_BACKLINK_BODY_BYTES + 1, bytesRead: null })
    expect(targetUpdates(db)).toHaveLength(0)
  })

  it('stops reading a streaming body that crosses the cap (even when it carries a real anchor)', async () => {
    const db = installDb()
    const padding = new Uint8Array(MAX_BACKLINK_BODY_BYTES + 64).fill(0x20)
    const anchor = new TextEncoder().encode(positiveHtml())
    installFetchScript({
      [SOURCE]: { chunks: [padding, anchor] },
    })

    const result = await verifyBacklinkClaim(verifyInput())

    expect(result.verdict).toBe('unavailable')
    expect(result.linkPresent).toBe(false)
    expect(result.observedHref).toBeNull()
    expect(result.reason).toMatch(/exceeded the 2097152-byte verification limit/)
    const evidence = evidenceInserts(db)[0].rows[0]
    expect(evidence).toMatchObject({ verdict: 'unavailable', observed_href: null, link_present: false })
    expect(Number((evidence.evidence as Record<string, unknown>).bytesRead)).toBeGreaterThan(MAX_BACKLINK_BODY_BYTES)
    expect(targetUpdates(db)).toHaveLength(0)
  })

  it('reads a legal HTML body under the cap', async () => {
    const db = installDb()
    const filler = '<!-- filler -->'.repeat(4_000)
    installFetchScript({ [SOURCE]: { body: `<html><body>${filler}${positiveHtml()}</body></html>` } })

    const result = await verifyBacklinkClaim(verifyInput())

    expect(result.verdict).toBe('verified')
    expect(targetUpdates(db)).toHaveLength(1)
  })

  it('refuses a body that is not HTML when the content type is observable', async () => {
    const db = installDb()
    installFetchScript({ [SOURCE]: { headers: { 'content-type': 'application/pdf' }, body: positiveHtml() } })

    const result = await verifyBacklinkClaim(verifyInput())

    expect(result.verdict).toBe('unavailable')
    expect(result.reason).toMatch(/not an HTML document \(content-type application\/pdf\)/)
    expect(evidenceInserts(db)[0].rows[0].evidence).toMatchObject({ contentType: 'application/pdf' })
    expect(targetUpdates(db)).toHaveLength(0)
  })

  it('refuses a response with neither a stream nor a provable body length', async () => {
    const db = installDb()
    installFetchScript({ [SOURCE]: { noStream: true, body: positiveHtml() } })

    const result = await verifyBacklinkClaim(verifyInput())

    expect(result.verdict).toBe('unavailable')
    expect(result.reason).toMatch(/could not be read within the verification body limit/)
    expect(targetUpdates(db)).toHaveLength(0)
  })

  it('reads a streamless body only when its declared length proves it fits', async () => {
    const db = installDb()
    const html = positiveHtml()
    installFetchScript({
      [SOURCE]: {
        noStream: true,
        body: html,
        headers: { 'content-length': String(new TextEncoder().encode(html).byteLength) },
      },
    })

    const result = await verifyBacklinkClaim(verifyInput())

    expect(result.verdict).toBe('verified')
    expect(targetUpdates(db)).toHaveLength(1)
  })
})

describe('F) positive live proof ⇒ evidence row + won', () => {
  it('records the full evidence row and writes the durable won pointers', async () => {
    const db = installDb()
    const fetchMock = installFetchScript({ [SOURCE]: { body: positiveHtml() } })
    const resolver = scriptedResolver()

    const result = await verifyBacklinkClaim(verifyInput({ resolveHostAddresses: resolver }))

    expect(fetchMock).toHaveBeenCalledWith(SOURCE, expect.objectContaining({ redirect: 'manual' }))
    expect(resolver).toHaveBeenCalledWith('www.ilw.com')
    expect(result.ok).toBe(true)
    expect(result.verdict).toBe('verified')
    expect(result.linkPresent).toBe(true)
    expect(result.transitionedToWon).toBe(true)
    expect(result.targetStatus).toBe('won')
    expect(result.observedHref).toBe(TARGET)
    expect(result.targetUrl).toBe(TARGET)

    const inserts = evidenceInserts(db)
    expect(inserts).toHaveLength(1)
    const evidence = inserts[0].rows[0]
    expect(evidence).toMatchObject({
      target_id: 'target-1',
      outreach_id: null,
      backlink_url: SOURCE,
      target_url: TARGET,
      source_domain: 'www.ilw.com',
      source_http_status: 200,
      link_present: true,
      observed_href: TARGET,
      page_canonical_url: SOURCE,
      page_indexable: true,
      verdict: 'verified',
      verified_at: '2026-09-21T10:00:00.000Z',
      method: BACKLINK_VERIFICATION_METHOD,
      verifier: 'admin@portal',
    })
    expect(String(evidence.anchor_text)).toContain('YouSafe student visas')
    expect(evidence.rel_attributes).toEqual(['nofollow', 'noopener'])
    expect(String(evidence.anchor_context)).toContain('YouSafe student visas')
    expect(evidence.id).toBe(result.verificationId)
    expect(evidence.evidence).toMatchObject({
      claimedSource: SOURCE,
      observedFinalSource: { url: SOURCE, host: 'www.ilw.com' },
      persistedDestination: { url: TARGET, source: 'target_row', ownership: expect.any(String) },
      destinationLive: {
        checked: true,
        current: true,
        status: 200,
        finalUrl: TARGET,
        method: DESTINATION_LIVE_METHOD,
        error: null,
      },
      destination: { url: TARGET, source: 'target_row', ownership: expect.any(String) },
      resolvedHosts: [{ host: 'www.ilw.com', addresses: ['93.184.216.34'] }],
      bodyLimitBytes: MAX_BACKLINK_BODY_BYTES,
    })

    const updates = targetUpdates(db)
    expect(updates).toHaveLength(1)
    expect(updates[0].patch).toMatchObject({
      status: 'won',
      won_at: '2026-09-21T10:00:00.000Z',
      won_verified_at: '2026-09-21T10:00:00.000Z',
      won_verification_id: result.verificationId,
      won_backlink_url: SOURCE,
      // The row restates the exact destination the proof was bound to, which is
      // what the DB guard re-proves.
      destination_url: TARGET,
    })
    // The transition is a compare-and-set: it can never overwrite an existing win.
    expect(updates[0].filters).toEqual([
      { op: 'eq', column: 'id', value: 'target-1' },
      { op: 'neq', column: 'status', value: 'won' },
    ])
  })

  it('records rel/text/canonical/indexability only when they are observable', async () => {
    const db = installDb()
    installFetchScript({
      [SOURCE]: { body: `<html><body><a href="${TARGET}">  Study   permits </a></body></html>` },
    })
    await verifyBacklinkClaim(verifyInput())
    const evidence = evidenceInserts(db)[0].rows[0]
    expect(evidence.anchor_text).toBe('Study permits')
    expect(evidence.rel_attributes).toEqual([])
    // No canonical and no robots directive on the page: NULL, never invented.
    expect(evidence.page_canonical_url).toBeNull()
    expect(evidence.page_indexable).toBeNull()
  })

  it('marks the page non-indexable from a robots meta or an X-Robots-Tag header', () => {
    expect(observeBacklinkPageFacts('<meta name="robots" content="noindex,nofollow">', SOURCE, null)).toEqual({
      canonicalUrl: null,
      indexable: false,
    })
    expect(observeBacklinkPageFacts('<html></html>', SOURCE, 'noindex, noarchive')).toEqual({
      canonicalUrl: null,
      indexable: false,
    })
    expect(observeBacklinkPageFacts('<html></html>', SOURCE, null)).toEqual({ canonicalUrl: null, indexable: null })
    // Serialized payloads are never read as directives.
    expect(
      observeBacklinkPageFacts('<script>const s = \'<meta name="robots" content="noindex">\'</script>', SOURCE, null),
    ).toEqual({ canonicalUrl: null, indexable: null })
  })

  it('never anchors on hrefs inside prose, comments, scripts or JSON', () => {
    for (const html of [
      `<p>Read ${TARGET} for details.</p>`,
      `<!-- <a href="${TARGET}">x</a> -->`,
      `<script>const a = '<a href="${TARGET}">x</a>'</script>`,
      `{"link":"${TARGET}"}`,
    ]) {
      expect(observeBacklinkAnchorFacts(html, TARGET).rel).toBeNull()
    }
  })
})

describe('G) negative and unavailable lanes never win', () => {
  it('records an absent verdict when the live page has no real anchor', async () => {
    const db = installDb()
    installFetchScript({ [SOURCE]: { body: `<html><body><p>See ${TARGET} in our prose.</p></body></html>` } })

    const result = await verifyBacklinkClaim(verifyInput())

    expect(result.ok).toBe(true)
    expect(result.verdict).toBe('absent')
    expect(result.linkPresent).toBe(false)
    expect(result.transitionedToWon).toBe(false)
    expect(evidenceInserts(db)[0].rows[0]).toMatchObject({
      link_present: false,
      observed_href: null,
      verdict: 'absent',
      source_http_status: 200,
    })
    expect(targetUpdates(db)).toHaveLength(0)
  })

  it('records absent for a real anchor to a DIFFERENT YouSafe page (exact href only)', async () => {
    const db = installDb()
    installFetchScript({ [SOURCE]: { body: positiveHtml(OTHER_ESTATE_PAGE) } })
    const result = await verifyBacklinkClaim(verifyInput({ requestedTargetUrl: null }))
    expect(result.verdict).toBe('absent')
    expect(result.linkPresent).toBe(false)
    expect(evidenceInserts(db)[0].rows[0].observed_href).toBeNull()
    expect(targetUpdates(db)).toHaveLength(0)
  })

  it('records unavailable (with the real HTTP status) when the page is dead', async () => {
    const db = installDb()
    installFetchScript({ [SOURCE]: { status: 404, body: 'not found' } })
    const result = await verifyBacklinkClaim(verifyInput())
    expect(result.ok).toBe(true)
    expect(result.verdict).toBe('unavailable')
    expect(result.sourceHttpStatus).toBe(404)
    expect(result.linkPresent).toBe(false)
    expect(evidenceInserts(db)[0].rows[0]).toMatchObject({
      verdict: 'unavailable',
      source_http_status: 404,
      link_present: false,
    })
    expect(targetUpdates(db)).toHaveLength(0)
  })

  it('records unavailable (status NULL, never a fabricated 200) on a network failure', async () => {
    const db = installDb()
    installFetchScript({ [SOURCE]: { throwError: true } })
    const result = await verifyBacklinkClaim(verifyInput())
    expect(result.verdict).toBe('unavailable')
    expect(result.sourceHttpStatus).toBeNull()
    const evidence = evidenceInserts(db)[0].rows[0]
    expect(evidence.source_http_status).toBeNull()
    expect(String((evidence.evidence as Record<string, unknown>).fetchError)).toMatch(/network down/)
    expect(targetUpdates(db)).toHaveLength(0)
  })

  it('never writes a lost status on a negative check', async () => {
    const db = installDb()
    installFetchScript({ [SOURCE]: { body: '<html><body>nothing here</body></html>' } })
    await verifyBacklinkClaim(verifyInput())
    await verifyBacklinkClaim(verifyInput({ requestedTargetUrl: null, now: '2026-09-21T11:00:00.000Z' }))
    for (const write of db.writes) {
      expect(JSON.stringify(write.patch ?? write.rows)).not.toContain('lost')
    }
    expect(db.updatesFor('seo_backlink_outreach')).toHaveLength(0)
    expect(db.rows('seo_backlink_targets')[0]).toMatchObject({ status: 'sent', won_verified_at: null })
  })
})

describe('H) no durable evidence ⇒ no win', () => {
  it('does not transition the target when the evidence insert fails', async () => {
    const db = installDb([targetRow()], { failEvidenceInsert: 'permission denied for table seo_backlink_verifications' })
    installFetchScript({ [SOURCE]: { body: positiveHtml() } })

    const result = await verifyBacklinkClaim(verifyInput())

    expect(result.ok).toBe(false)
    expect(result.verdict).toBe('verified')
    expect(result.evidencePersisted).toBe(false)
    expect(result.transitionedToWon).toBe(false)
    expect(result.verificationId).toBeNull()
    expect(result.error).toMatch(/permission denied/)
    expect(targetUpdates(db)).toHaveLength(0)
  })
})

describe('I) rejected claims are never fetched and never recorded', () => {
  it('performs no fetch and appends no evidence for an off-prospect source', async () => {
    const db = installDb()
    const fetchMock = installFetchScript({ [SOURCE]: { body: positiveHtml() } })
    const result = await verifyBacklinkClaim(verifyInput({ sourceUrl: 'https://evil.example.com/post' }))
    expect(result.ok).toBe(false)
    expect(result.verdict).toBeNull()
    expect(result.reason).toMatch(/does not match the prospect domain/)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(evidenceInserts(db)).toHaveLength(0)
  })

  it('performs no fetch for a non-estate destination or an unknown target', async () => {
    const db = installDb([targetRow({ destination_url: 'https://evil.example.com/x' })])
    const fetchMock = installFetchScript({ [SOURCE]: { body: positiveHtml() } })
    const offEstate = await verifyBacklinkClaim(verifyInput())
    expect(offEstate.reason).toMatch(/not a HOST_PUBLIC/)
    const unknown = await verifyBacklinkClaim(verifyInput({ targetId: 'missing-target' }))
    expect(unknown.reason).toBe('backlink target not found')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(evidenceInserts(db)).toHaveLength(0)
  })
})


describe('J0) destination currentness gates a win without erasing backlink truth', () => {
  it('records a verified backlink but withholds won when the persisted destination redirects', async () => {
    const db = installDb()
    installFetchScript({ [SOURCE]: { body: positiveHtml() } })

    const result = await verifyBacklinkClaim(
      verifyInput({
        checkDestinationLive: async () => ({
          current: false,
          status: 301,
          finalUrl: OTHER_ESTATE_PAGE,
          method: DESTINATION_LIVE_METHOD,
          error: 'the persisted destination redirects to a different estate URL',
        }),
      }),
    )

    expect(result.ok).toBe(true)
    expect(result.verdict).toBe('verified')
    expect(result.linkPresent).toBe(true)
    expect(result.destinationCurrent).toBe(false)
    expect(result.transitionedToWon).toBe(false)
    expect(result.reason).toMatch(/persisted destination redirects/)
    expect(targetUpdates(db)).toHaveLength(0)

    const evidence = evidenceInserts(db)[0].rows[0]
    expect(evidence).toMatchObject({
      verdict: 'verified',
      link_present: true,
      source_final_url: SOURCE,
    })
    expect(evidence.evidence).toMatchObject({
      claimedSource: SOURCE,
      observedFinalSource: { url: SOURCE },
      persistedDestination: { url: TARGET },
      destinationLive: {
        checked: true,
        current: false,
        status: 301,
        finalUrl: OTHER_ESTATE_PAGE,
        method: DESTINATION_LIVE_METHOD,
      },
    })
  })

  it('checks the owned destination with no redirect-follow and cancels the body', async () => {
    const liveFetch = installFetchScript({ [TARGET]: { status: 200, body: '<html>ok</html>' } })
    const live = await checkDestinationLive(TARGET)
    expect(live).toEqual({
      current: true,
      status: 200,
      finalUrl: TARGET,
      method: DESTINATION_LIVE_METHOD,
      error: null,
    })
    expect(liveFetch).toHaveBeenCalledTimes(1)

    installFetchScript({ [TARGET]: { status: 302, headers: { location: OTHER_ESTATE_PAGE } } })
    const redirected = await checkDestinationLive(TARGET)
    expect(redirected).toMatchObject({
      current: false,
      status: 302,
      finalUrl: OTHER_ESTATE_PAGE,
      method: DESTINATION_LIVE_METHOD,
    })
    expect(redirected.error).toMatch(/redirects/)
  })
})

describe('J) outreach provenance must belong to the target', () => {
  it('refuses an outreach_id that belongs to another target (nothing persisted)', async () => {
    const db = installDb([targetRow()], {
      outreach: [{ id: 'outreach-other', target_id: 'target-2' }],
    })
    const fetchMock = installFetchScript({ [SOURCE]: { body: positiveHtml() } })

    const result = await verifyBacklinkClaim(verifyInput({ outreachId: 'outreach-other' }))

    expect(result.ok).toBe(false)
    expect(result.verdict).toBeNull()
    expect(result.reason).toMatch(/does not belong to this backlink target/)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(evidenceInserts(db)).toHaveLength(0)
    expect(targetUpdates(db)).toHaveLength(0)
  })

  it('refuses an outreach_id that does not exist at all', async () => {
    const db = installDb()
    const fetchMock = installFetchScript({ [SOURCE]: { body: positiveHtml() } })
    const result = await verifyBacklinkClaim(verifyInput({ outreachId: 'outreach-missing' }))
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/cannot be recorded as provenance/)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(evidenceInserts(db)).toHaveLength(0)
  })

  it('persists a provenance outreach_id only when it belongs to this target', async () => {
    const db = installDb([targetRow()], { outreach: [{ id: 'outreach-1', target_id: 'target-1' }] })
    installFetchScript({ [SOURCE]: { body: positiveHtml() } })

    const result = await verifyBacklinkClaim(verifyInput({ outreachId: 'outreach-1' }))

    expect(result.verdict).toBe('verified')
    expect(evidenceInserts(db)[0].rows[0].outreach_id).toBe('outreach-1')
    expect(targetUpdates(db)).toHaveLength(1)
  })
})

describe('K) idempotency and the evidence trail', () => {
  it('appends evidence but never re-writes an already won target', async () => {
    const db = installDb([
      targetRow({
        status: 'won',
        won_at: '2026-09-01T00:00:00.000Z',
        won_verified_at: '2026-09-01T00:00:00.000Z',
        won_verification_id: 'verification-earlier',
        won_backlink_url: SOURCE,
      }),
    ])
    installFetchScript({ [SOURCE]: { body: positiveHtml() } })

    const result = await verifyBacklinkClaim(verifyInput())

    expect(result.ok).toBe(true)
    expect(result.transitionedToWon).toBe(false)
    expect(result.reason).toBe('already won')
    expect(result.targetStatus).toBe('won')
    expect(evidenceInserts(db)).toHaveLength(1)
    // The fenced UPDATE is issued but matches ZERO rows (`.neq('status','won')`),
    // so the existing win and its proof pointers are untouched.
    for (const update of targetUpdates(db)) expect(update.rows).toHaveLength(0)
    expect(db.rows('seo_backlink_targets')[0]).toMatchObject({
      won_verification_id: 'verification-earlier',
      won_at: '2026-09-01T00:00:00.000Z',
      won_verified_at: '2026-09-01T00:00:00.000Z',
    })
  })

  it('lists the append-only trail for one target only', async () => {
    const db = installDb()
    installFetchScript({ [SOURCE]: { body: positiveHtml() } })
    await verifyBacklinkClaim(verifyInput())
    const trail = await listBacklinkVerifications('target-1')
    expect(trail).toHaveLength(1)
    expect(trail[0].target_id).toBe('target-1')
    expect(await listBacklinkVerifications('other-target')).toHaveLength(0)
    expect(db.selects.some((select) => select.table === 'seo_backlink_verifications')).toBe(true)
  })
})


describe('K1) Cloudflare-compatible family DNS resolution', () => {
  const noData = async (): Promise<string[]> => {
    throw Object.assign(new Error('no data'), { code: 'ENODATA' })
  }
  const notFound = async (): Promise<string[]> => {
    throw Object.assign(new Error('not found'), { code: 'ENOTFOUND' })
  }
  const hardFail = async (): Promise<string[]> => {
    throw Object.assign(new Error('servfail'), { code: 'ESERVFAIL' })
  }

  it('accepts IPv4-only when AAAA has no data', async () => {
    await expect(
      resolveHostAddresses('example.com', {
        resolve4: async () => ['93.184.216.34'],
        resolve6: noData,
      }),
    ).resolves.toEqual({ ok: true, addresses: ['93.184.216.34'] })
  })

  it('accepts IPv6-only when A has no data', async () => {
    await expect(
      resolveHostAddresses('example.com', {
        resolve4: notFound,
        resolve6: async () => ['2606:4700::1111'],
      }),
    ).resolves.toEqual({ ok: true, addresses: ['2606:4700::1111'] })
  })

  it('accepts public dual-stack and preserves both families', async () => {
    await expect(
      resolveHostAddresses('example.com', {
        resolve4: async () => ['93.184.216.34'],
        resolve6: async () => ['2606:4700::1111'],
      }),
    ).resolves.toEqual({ ok: true, addresses: ['93.184.216.34', '2606:4700::1111'] })
  })

  it('fails closed when both families have no records', async () => {
    const result = await resolveHostAddresses('example.com', { resolve4: noData, resolve6: notFound })
    expect(result.ok).toBe(false)
    expect(result.addresses).toEqual([])
    expect(result.reason).toMatch(/did not resolve/)
  })

  it('fails closed on a hard resolver error even if the other family is public', async () => {
    const result = await resolveHostAddresses('example.com', {
      resolve4: async () => ['93.184.216.34'],
      resolve6: hardFail,
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/AAAA lookup failed: servfail/)
  })

  it('fails closed if either family returns a private/reserved answer', async () => {
    const result = await resolveHostAddresses('example.com', {
      resolve4: async () => ['93.184.216.34'],
      resolve6: async () => ['::1'],
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/private\/reserved/)
  })
})

describe('L) admin-only route', () => {
  function post(body: Record<string, unknown>) {
    return new NextRequest('http://localhost/api/seo-engine/backlink/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  it('refuses unauthenticated and non-admin callers', async () => {
    requireAdminUserMock.mockResolvedValue({ error: 'Unauthorized', status: 401 } as never)
    const unauthorized = await verifyPOST(post({ target_id: 'target-1', source_url: SOURCE, target_url: TARGET }))
    expect(unauthorized.status).toBe(401)
    requireAdminUserMock.mockResolvedValue({ error: 'Forbidden', status: 403 } as never)
    const forbidden = await verifyPOST(post({ target_id: 'target-1', source_url: SOURCE, target_url: TARGET }))
    expect(forbidden.status).toBe(403)
  })

  it('rejects a missing target_id / source_url with 400 and no fetch', async () => {
    requireAdminUserMock.mockResolvedValue({ profileId: 'admin-1' } as never)
    const fetchMock = installFetchScript({ [SOURCE]: { body: positiveHtml() } })
    installDb()
    expect((await verifyPOST(post({}))).status).toBe(400)
    expect((await verifyPOST(post({ target_id: 'target-1' }))).status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('drives a real verification through the route and reports the durable win', async () => {
    requireAdminUserMock.mockResolvedValue({ profileId: 'admin-1' } as never)
    const db = installDb()
    installFetchScript({
      [SOURCE]: { body: positiveHtml() },
      [TARGET]: { body: '<html><body>live destination</body></html>' },
    })
    const response = await verifyPOST(post({ target_id: 'target-1', source_url: SOURCE, target_url: TARGET }))
    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, unknown>
    expect(body).toMatchObject({
      ok: true,
      verdict: 'verified',
      method: BACKLINK_VERIFICATION_METHOD,
      link_present: true,
      evidence_persisted: true,
      transitioned_to_won: true,
      target_status: 'won',
      target_url: TARGET,
      destination_url: TARGET,
      destination_current: true,
    })
    expect(String(body.verification_id)).not.toHaveLength(0)
    // Provenance is the AUTHENTICATED identity, never a body field.
    expect(evidenceInserts(db)[0].rows[0].verifier).toBe('admin-1')
  })

  it('ignores a caller-supplied actor and refuses a destination the target never persisted', async () => {
    requireAdminUserMock.mockResolvedValue({ profile: { email: 'real.admin@yousafeconsultancy.com' }, profileId: 'admin-1' } as never)
    const db = installDb()
    const fetchMock = installFetchScript({ [SOURCE]: { body: positiveHtml(OTHER_ESTATE_PAGE) } })

    const substituted = await verifyPOST(
      post({ target_id: 'target-1', source_url: SOURCE, destination_url: OTHER_ESTATE_PAGE }),
    )
    expect(substituted.status).toBe(400)
    expect(String(((await substituted.json()) as Record<string, unknown>).error)).toMatch(/does not match/)

    const spoofed = await verifyPOST(
      post({ target_id: 'target-1', source_url: SOURCE, target_url: TARGET, actor: 'somebody@else.example' }),
    )
    expect(spoofed.status).toBe(200)
    expect(evidenceInserts(db)[0].rows[0].verifier).toBe('real.admin@yousafeconsultancy.com')
    // Wrong anchor => no destination-currentness fetch is needed.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports a rejected claim as 400 and an unknown target as 404', async () => {
    requireAdminUserMock.mockResolvedValue({ profileId: 'admin-1' } as never)
    installDb()
    installFetchScript({ [SOURCE]: { body: positiveHtml() } })
    const rejected = await verifyPOST(
      post({ target_id: 'target-1', source_url: 'https://evil.example.com/post', target_url: TARGET }),
    )
    expect(rejected.status).toBe(400)
    const missing = await verifyPOST(post({ target_id: 'nope', source_url: SOURCE, target_url: TARGET }))
    expect(missing.status).toBe(404)
  })

  it('exposes the append-only trail through GET for admins only', async () => {
    requireAdminUserMock.mockResolvedValue({ error: 'Forbidden', status: 403 } as never)
    const denied = await verifyGET(
      new NextRequest(`http://localhost/api/seo-engine/backlink/verify?target_id=target-1`),
    )
    expect(denied.status).toBe(403)

    requireAdminUserMock.mockResolvedValue({ profileId: 'admin-1' } as never)
    installDb()
    installFetchScript({ [SOURCE]: { body: positiveHtml() } })
    await verifyBacklinkClaim(verifyInput())
    const response = await verifyGET(
      new NextRequest(`http://localhost/api/seo-engine/backlink/verify?target_id=target-1`),
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as { verifications?: unknown[] }
    expect(body.verifications).toHaveLength(1)
  })
})

describe('M) address classification (fail closed)', () => {
  it('classifies loopback, private, link-local, reserved, multicast and unspecified', () => {
    for (const address of [
      '127.0.0.1',
      '10.0.0.5',
      '172.20.3.4',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '192.0.2.10',
      '198.18.0.1',
      '224.0.0.1',
      '255.255.255.255',
      '::',
      '::1',
      'fc00::1',
      'fd12:3456::1',
      'fe80::1',
      'ff02::1',
      '::ffff:10.0.0.1',
      '::ffff:127.0.0.1',
      '::10.0.0.1',
      '2002:0a00:0001::1',
      '64:ff9b::a00:1',
      'fe80::1%en0',
    ]) {
      expect(isPrivateOrReservedAddress(address)).toBe(true)
    }
    for (const address of ['93.184.216.34', '8.8.8.8', '2606:4700:4700::1111', '2001:4860:4860::8888']) {
      expect(isPrivateOrReservedAddress(address)).toBe(false)
    }
  })

  it('refuses an address it cannot parse instead of assuming it is public', () => {
    for (const value of ['', 'not-an-address', 'example.com', '999.1.1.1', 'fe80::zz', '1.2.3', '::1::2']) {
      expect(isPrivateOrReservedAddress(value)).toBe(true)
    }
  })

  it('reads IPv6 composition forms without over-blocking public answers', () => {
    // Mapped / compatible / 6to4 / NAT64 all inherit the embedded IPv4 verdict.
    expect(isPrivateOrReservedAddress('::ffff:7f00:1')).toBe(true)
    expect(isPrivateOrReservedAddress('0:0:0:0:0:ffff:127.0.0.1')).toBe(true)
    expect(isPrivateOrReservedAddress('::ffff:93.184.216.34')).toBe(false)
    expect(isPrivateOrReservedAddress('2002:5db8:d822::1')).toBe(false)
    expect(isPrivateOrReservedAddress('64:ff9b::5db8:d822')).toBe(false)
    // Special-purpose IPv6 ranges stay refused.
    for (const address of ['2001:db8::1', '2001:0:1::1', '2001:2::1', 'fec0::1', '100::1']) {
      expect(isPrivateOrReservedAddress(address)).toBe(true)
    }
    expect(isPrivateOrReservedAddress('2001:4860:4860::8888')).toBe(false)
  })

  it('resolves a literal address without DNS and refuses private literals', async () => {
    expect(isIpLiteral('127.0.0.1')).toBe(true)
    expect(isIpLiteral('::ffff:10.0.0.1')).toBe(true)
    expect(isIpLiteral('ilw.com')).toBe(false)
    await expect(resolveHostAddresses('127.0.0.1')).resolves.toMatchObject({ ok: false })
    await expect(resolveHostAddresses('93.184.216.34')).resolves.toEqual({ ok: true, addresses: ['93.184.216.34'] })
    await expect(resolveHostAddresses('')).resolves.toMatchObject({ ok: false })
  })
})
