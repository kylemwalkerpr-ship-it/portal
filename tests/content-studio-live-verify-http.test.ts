import { NextRequest } from 'next/server'
import {
  artifactContentHash,
  publicationBodyHash,
  type PersistedPublicationManifest,
} from '@/lib/seoFactory/publicationProof'

const reconcilePublicationDeployment = jest.fn()
const submitUrlsToIndexNow = jest.fn(async (_urls: string[]) => ({ host:'indexnow', status:'ok' }))

jest.mock('@/lib/portalAuth', () => ({ requireAdminUser: jest.fn(async () => ({ profileId:'admin-1' })) }))
jest.mock('@/lib/indexNow', () => ({ submitUrlsToIndexNow: (urls: string[]) => submitUrlsToIndexNow(urls) }))
jest.mock('@/lib/seoFactory/publicationMonitor', () => ({
  reconcilePublicationDeployment: (jobId: string) => reconcilePublicationDeployment(jobId),
}))
jest.mock('@/lib/seoFactory/liveAudit', () => ({
  auditLiveHtml: jest.fn(() => ({ score:90, humanScore:90, wordCount:320 })),
}))

type LookupResult = { data: { contract_id: string | null } | null; error: { message: string } | null }
let contractLookup: LookupResult
const updatePatches: Array<Record<string, unknown>> = []

const db: any = {
  from: jest.fn((_table: string) => {
    let selected = ''
    const q: any = {
      select: jest.fn((value: string) => { selected = value; return q }),
      eq: jest.fn(() => q),
      update: jest.fn((patch: Record<string, unknown>) => { updatePatches.push({ ...patch }); return q }),
      single: jest.fn(async () => selected.includes('event_log')
        ? { data:{ event_log:[] }, error:null }
        : { data:{ audit_json:{} }, error:null }),
      maybeSingle: jest.fn(async () => selected.includes('contract_id')
        ? contractLookup
        : { data:{ audit_json:{} }, error:null }),
      then(resolve: (value: any) => void) { resolve({ data:null, error:null }) },
    }
    return q
  }),
}
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn(() => db) }))

const canonical = 'https://market.yousafeconsultancy.com/articles/opt-timing/'
const marker = 'csrev_expected_marker'
const LIVE_BODY = 'F-1 OPT timing guide '.repeat(20).trim()
const APPROVED_ARTIFACT = `export const metadata = { other: { "content-studio-revision": "${marker}" } };\n${LIVE_BODY}`

function proof(overrides: Partial<PersistedPublicationManifest> = {}): PersistedPublicationManifest {
  return {
    schemaVersion:2, jobId:'job-1', contractId:'wc_1', contractHash:'hash-1', opportunityId:'opp-1',
    repoOwner:'kylemwalkerpr-ship-it', repoName:'portal', path:'app/articles/opt-timing/page.tsx', canonical,
    expectedMarker:marker,
    approvedContentHash:artifactContentHash(LIVE_BODY),
    approvedArtifactHash:artifactContentHash(APPROVED_ARTIFACT),
    approvedBodyHash:publicationBodyHash(LIVE_BODY),
    approvedAt:'2026-09-14T00:00:00Z', approvalActor:'admin',
    prNumber:77, approvedHeadSha:'approved-head', mergeSha:'merge-sha', deploymentRunId:'900',
    deploymentCommitSha:'deployed-sha', deploymentWorkflowId:273970987,
    deploymentWorkflowPath:'.github/workflows/deploy.yml', deploymentJobId:'901', deploymentEnvironment:'not configured',
    lineageVerified:true, liveVerifiedAt:null, ...overrides,
  }
}

function html(opts: { marker?: string; canonical?: string | null; robots?: string; body?: string } = {}) {
  const body = opts.body ?? LIVE_BODY
  const canonicalTag = opts.canonical === null ? '' : `<link rel="canonical" href="${opts.canonical ?? canonical}">`
  const robots = opts.robots ? `<meta name="robots" content="${opts.robots}">` : ''
  return `<!doctype html><html><head>${canonicalTag}${robots}<meta name="content-studio-revision" content="${opts.marker ?? marker}"></head><body><article>${body}</article></body></html>`
}

type LiveHttp = { status?: number; finalUrl?: string; body?: string; headers?: Record<string,string> }
let liveHttp: LiveHttp

function installFetch() {
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/sitemap.xml')) {
      return { status:200, ok:true, url, headers:new Headers(), text:async () => '' } as any
    }
    if (url === canonical) {
      const headers = new Headers(liveHttp.headers || {})
      return {
        status:liveHttp.status ?? 200,
        ok:(liveHttp.status ?? 200) >= 200 && (liveHttp.status ?? 200) < 300,
        url:liveHttp.finalUrl ?? canonical,
        headers,
        text:async () => liveHttp.body ?? html(),
      } as any
    }
    throw new Error(`unexpected fetch ${url} ${init?.method || 'GET'}`)
  }) as any
}

async function verify() {
  const { POST } = await import('@/app/api/content-studio/verify-published/route')
  const res = await POST(new NextRequest('http://localhost/api/content-studio/verify-published', {
    method:'POST', headers:{'content-type':'application/json'},
    body:JSON.stringify({ canonicalUrl:canonical, jobId:'job-1' }),
  }))
  return { status:res.status, json:await res.json() as any }
}

beforeEach(() => {
  jest.clearAllMocks()
  updatePatches.length = 0
  contractLookup = { data:{ contract_id:'wc_1' }, error:null }
  delete process.env.CLOUDFLARE_ZONE_ID
  delete process.env.CF_ZONE_ID
  delete process.env.CLOUDFLARE_API_TOKEN
  delete process.env.CF_API_TOKEN
  liveHttp = { status:200, finalUrl:canonical, body:html() }
  installFetch()
  reconcilePublicationDeployment.mockResolvedValue({ ok:true, phase:'deployed', proof:proof(), reason:'verified deployment' })
})

describe('HTTP live publication proof', () => {
  it.each([
    ['stale marker', html({ marker:'csrev_stale' }), /revision marker/i],
    ['missing canonical', html({ canonical:null }), /canonical/i],
    ['wrong canonical', html({ canonical:'https://market.yousafeconsultancy.com/articles/other/' }), /canonical/i],
    ['meta noindex', html({ robots:'noindex,follow' }), /noindex/i],
    ['empty article shell', html({ body:' ' }), /article body/i],
  ])('rejects %s', async (_label, responseBody, reason) => {
    liveHttp.body = responseBody
    const out = await verify()
    expect(out.status).toBe(200)
    expect(out.json.result.ok).toBe(false)
    expect(String(out.json.result.error)).toMatch(reason as RegExp)
    expect(out.json.result.publicationPhase).not.toBe('live_verified')
  })

  it('rejects X-Robots-Tag noindex even when HTML meta robots is indexable', async () => {
    liveHttp.headers = { 'x-robots-tag':'noindex' }
    const out = await verify()
    expect(out.json.result.ok).toBe(false)
    expect(out.json.result.hasNoIndex).toBe(true)
    expect(String(out.json.result.error)).toMatch(/noindex/i)
  })

  it('rejects a redirect that lands on a different article even when that page claims the requested canonical', async () => {
    liveHttp.finalUrl = 'https://market.yousafeconsultancy.com/articles/other/'
    liveHttp.body = html()
    const out = await verify()
    expect(out.json.result.ok).toBe(false)
    expect(String(out.json.result.error)).toMatch(/redirect|response url|canonical/i)
  })

  it('rejects missing durable deployment proof', async () => {
    reconcilePublicationDeployment.mockResolvedValue({ ok:false, phase:'deployment_pending', proof:null, reason:'authorized deployment not found' })
    const out = await verify()
    expect(out.json.result.ok).toBe(false)
    expect(String(out.json.result.error)).toMatch(/authorized deployment not found/i)
  })

  it('rejects mismatched deployment lineage even if a proof object is supplied', async () => {
    reconcilePublicationDeployment.mockResolvedValue({
      ok:true, phase:'deployed', proof:proof({ lineageVerified:false, deploymentCommitSha:'wrong-deploy' }), reason:'bad proof',
    })
    const out = await verify()
    expect(out.json.result.ok).toBe(false)
    expect(String(out.json.result.error)).toMatch(/lineage|ancestry/i)
  })

  it('rejects changed article prose even when the old revision marker is retained', async () => {
    liveHttp.body = html({ body: `${LIVE_BODY} Approval is guaranteed for every applicant.` })
    const out = await verify()
    expect(out.json.result.ok).toBe(false)
    expect(String(out.json.result.error)).toMatch(/body.*digest|body.*differs/i)
  })

  it('fails closed when the supplied job lookup errors instead of downgrading to legacy verification', async () => {
    contractLookup = { data:null, error:{ message:'transient contract lookup failure' } }
    const out = await verify()
    expect(out.json.result.ok).toBe(false)
    expect(String(out.json.result.error)).toMatch(/job|lookup|transient contract lookup failure/i)
    expect(reconcilePublicationDeployment).not.toHaveBeenCalled()
    expect(updatePatches.some((patch) => patch.live_status === 'verified')).toBe(false)
  })

  it('fails closed when the supplied job does not exist instead of downgrading to legacy verification', async () => {
    contractLookup = { data:null, error:null }
    const out = await verify()
    expect(out.json.result.ok).toBe(false)
    expect(String(out.json.result.error)).toMatch(/job.*not found|lookup/i)
    expect(reconcilePublicationDeployment).not.toHaveBeenCalled()
    expect(updatePatches.some((patch) => patch.live_status === 'verified')).toBe(false)
  })

  it('keeps legacy verification only after a successful positive job read establishes an uncontracted job', async () => {
    contractLookup = { data:{ contract_id:null }, error:null }
    const out = await verify()
    expect(out.json.result.ok).toBe(true)
    expect(out.json.result.publicationPhase).toBeNull()
    expect(reconcilePublicationDeployment).not.toHaveBeenCalled()
    expect(updatePatches.some((patch) => patch.live_status === 'verified')).toBe(true)
  })

  it('accepts only the matching marker/canonical/indexability/body plus durable deployment proof', async () => {
    const out = await verify()
    expect(out.json.result.ok).toBe(true)
    expect(out.json.result.publicationPhase).toBe('live_verified')
    expect(out.json.result.lineageVerified).toBe(true)
  })
})
