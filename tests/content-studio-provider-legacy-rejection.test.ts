/**
 * Legacy pin rejection at every route boundary — FROZEN CONTRACT (Plan Task 1,
 * activated at P2; design §3.1, §3.6, §6, §11).
 *
 * A legacy/non-commissioned pin must fail closed at every execution route with
 * HTTP 409, `code:'selection_required'`, and
 * `execution_stage:'provider_selection_required'`, and it must make ZERO
 * outbound provider requests. The vault/settings/test/health surfaces must
 * reject retired provider ids entirely (unknown-provider failure) and list only
 * the two commissioned providers.
 *
 * Route-level mocks isolate each door; the `generateContentText` mock throws
 * the real `ProviderSelectionRequiredError` class for legacy pins (and resolves
 * for commissioned pins), so a route that silently coerces a legacy pin to Grok
 * (today's behavior) fails these assertions until the P2 flip lands.
 */
import { NextRequest } from 'next/server'

const mockLegacyPins = new Set([
  'entrim-deepseek',
  'entrim-qwen-27b',
  'nvidia-deepseek',
  'baseten-deepseek',
  'parasail-deepseek',
  'runbios-glm-53-flash',
  'openai',
  'deepseek-flash',
  'deepseek',
  'custom',
])

function mockSelectionError(legacyValue: string): Error {
  const mod = jest.requireActual('@/lib/contentAiRegistry') as {
    ProviderSelectionRequiredError?: new (...args: unknown[]) => Error
  }
  const Ctor = mod.ProviderSelectionRequiredError
  const error = (typeof Ctor === 'function'
    ? Object.create(Ctor.prototype)
    : new Error()) as Error & { code?: string; status?: number; legacyValue?: string }
  error.name = 'ProviderSelectionRequiredError'
  error.message = `AI provider "${legacyValue}" is legacy and requires explicit re-selection`
  error.code = 'selection_required'
  error.status = 409
  error.legacyValue = legacyValue
  return error
}

const mockFetch = jest.fn(async () => {
  throw new Error('outbound provider request is forbidden for a legacy pin')
})
global.fetch = mockFetch as unknown as typeof fetch

jest.mock('@/lib/portalAuth', () => ({
  requireAdminUser: jest.fn(async () => ({ profileId: 'admin-1' })),
}))

jest.mock('@/lib/aiKeyVault', () => {
  const actual = jest.requireActual('@/lib/aiKeyVault')
  return {
    ...actual,
    buildVaultEnvOverrides: jest.fn(async () => ({})),
    getAiSettings: jest.fn(async () => ({})),
    setAiSetting: jest.fn(async () => undefined),
    deleteAiSetting: jest.fn(async () => undefined),
    ensureDraftDefaultSettings: jest.fn(async () => undefined),
    ensureParasailDefaultSettings: jest.fn(async () => undefined),
    listVaultStatus: jest.fn(async () => []),
    upsertVaultKey: jest.fn(async () => ({ provider: 'x', api_key: null, base_url: null, model: null })),
    deleteVaultKey: jest.fn(async () => undefined),
    purgeAllVaultKeys: jest.fn(async () => 0),
    purgeGroupVaultKeys: jest.fn(async () => 0),
    maskKey: jest.fn((key: string) => `***${String(key).slice(-4)}`),
  }
})

jest.mock('@/lib/contentAiProvider', () => {
  const actual = jest.requireActual('@/lib/contentAiProvider')
  const generateContentText = jest.fn(async (opts: { aiProvider?: string | null } | undefined) => {
    const pin = String(opts?.aiProvider || '').trim().toLowerCase()
    if (mockLegacyPins.has(pin)) throw mockSelectionError(pin)
    return { text: 'MOCK-COMMISSIONED-RESPONSE', provider: pin || 'grok', model: pin === 'deepseek-v41-flash' ? 'deepseek-flash' : 'grok-4.6' }
  })
  const generateContentTextStream = jest.fn(() => (async function* () {
    throw mockSelectionError('stream')
  })())
  return {
    ...actual,
    generateContentText,
    generateContentTextStream,
    refreshAiVault: jest.fn(async () => []),
  }
})

jest.mock('@/lib/seoFactory/writingContractStore', () => {
  class mockWritingContractMismatchError extends Error {}
  return {
    WritingContractMismatchError: mockWritingContractMismatchError,
    runWithContentStudioRecoveryClaim: (fn: () => unknown) => fn(),
    loadWritingContract: jest.fn(async () => ({
      contractId: 'wc_1',
      contractHash: 'hash-1',
      contractVersion: 1,
      evidenceHash: 'evidence-1',
      opportunity: { id: 'opp-1' },
      requestedModel: null,
      contentType: 'legal_guide',
      primaryKeyword: 'F-1 OPT timing',
      brief: { thesis: 'F-1 students must plan OPT timing around the filing window.' },
      queryCoverage: { requiredShortKeywords: [], requiredLongTailKeywords: [], shortKeywordTerms: [], longTailKeywordTerms: [] },
      wordBudget: { minWords: 40, targetWords: 70, maxWords: 200 },
      ownership: { host: 'legal', repo: 'caseworks', filePath: 'app/opt/page.tsx', canonicalUrl: 'https://legal.yousafeconsultancy.com/opt/' },
    })),
    claimContentStudioExecution: jest.fn(async () => ({
      owner: 'legacy-owner', attempt: 1, leaseExpiresAt: new Date(Date.now() + 900_000).toISOString(),
    })),
    assertContentStudioExecution: jest.fn(async () => undefined),
    releaseContentStudioExecution: jest.fn(async () => true),
  }
})

jest.mock('@/lib/seoFactory/storedJobExecution', () => ({
  runStoredContentJob: jest.fn(async () => {
    throw mockSelectionError('entrim-deepseek')
  }),
}))

jest.mock('@/app/api/content-studio/jobs/legacy', () => ({
  GET: jest.fn(),
  POST: jest.fn(),
  PATCH: jest.fn(async () => new Response(JSON.stringify({ ok: false, error: 'legacy path reached' }), { status: 200 })),
}))

jest.mock('@/lib/supabase', () => ({
  createSupabaseAdminClient: () => ({
    from: () => {
      const query: Record<string, unknown> = {}
      query.select = jest.fn(() => query)
      query.update = jest.fn(() => query)
      query.eq = jest.fn(() => query)
      query.gt = jest.fn(() => query)
      query.single = jest.fn(async () => ({ data: mockAuthorReviseJob, error: null }))
      query.maybeSingle = jest.fn(async () => ({ data: mockAuthorReviseJob, error: null }))
      return query
    },
  }),
}))

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: () => {
      const query: Record<string, unknown> = {}
      query.select = jest.fn(() => query)
      query.update = jest.fn(() => query)
      query.eq = jest.fn(() => query)
      query.gt = jest.fn(() => query)
      query.single = jest.fn(async () => ({ data: mockLegacyJob, error: null }))
      query.maybeSingle = jest.fn(async () => ({ data: mockLegacyJob, error: null }))
      return query
    },
  })),
}))

jest.mock('@/lib/seoFactory/throughline', () => ({
  runThroughline: jest.fn(async ({ generateText }: { generateText?: (system: string, prompt: string) => Promise<string> }) => {
    if (typeof generateText === 'function') await generateText('system', 'prompt')
    return { rejected: false, content: 'REVISED-CONTENT', reason: undefined }
  }),
}))

jest.mock('@/lib/seoFactory/maskedDenoise', () => ({
  runFactoryMaskedDenoise: jest.fn(async () => ({ applied: false, content: 'REVISED-CONTENT' })),
}))

jest.mock('@/lib/editorialSupervisor', () => ({
  measureEditorial: jest.fn(() => ({})),
  buildHarperSupervisionPacket: jest.fn(() => ({
    directives: [], pending: [], unmet: [], deferred: [], fingerprint: 'supervision-fp',
  })),
}))

jest.mock('@/lib/seoFactory/currentGate', () => ({
  contentFingerprint: jest.fn(() => 'draft-fp'),
}))

jest.mock('@/app/api/content-studio/suggest-brief/core', () => ({
  POST: jest.fn(async () => new Response(JSON.stringify({
    ok: true,
    sealedBrief: { thesis: 'sealed' },
  }), { status: 200, headers: { 'content-type': 'application/json' } })),
}))

jest.mock('@/lib/seoFactory/suggestBriefContract', () => ({
  OpportunityAlreadyReservedError: class mockOpportunityAlreadyReservedError extends Error {},
  failSuggestBriefContract: jest.fn(async () => undefined),
  finalizeSuggestBriefContract: jest.fn(async () => ({ contractId: 'wc_1', contractVersion: 1, contractHash: 'hash-1', evidenceHash: 'e', opportunity: { id: 'opp-1' } })),
  startSuggestBriefContract: jest.fn(async () => ({
    tinyfish: { observations: [] },
    reservation: { jobId: 'job-1' },
  })),
  tinyfishPromptBlock: jest.fn(() => ''),
}))

jest.mock('@/lib/seoEngine/researchDemand', () => ({
  resolveBriefRegion: jest.fn(() => ({ region: 'US' })),
}))

jest.mock('@/lib/seoFactory/pipeline', () => ({
  runSeoFactoryPipeline: jest.fn(async (input: { aiProvider?: string }) => {
    if (input?.aiProvider && mockLegacyPins.has(String(input.aiProvider).toLowerCase())) {
      throw mockSelectionError(String(input.aiProvider))
    }
    return { ok: true, jobId: 'job-1', content: 'draft', plan: {}, audit: { blockers: [], warnings: [] }, ship: null, shipError: null, shipMode: 'pr', gsc: {}, provider: 'grok', model: 'grok-4.6', attempts: 1 }
  }),
}))

jest.mock('@/lib/seoFactory/contentStudioPipeline', () => ({
  runContentStudioPipeline: jest.fn(async () => ({ ok: true, jobId: 'job-1', content: 'draft', plan: {}, audit: { blockers: [], warnings: [] }, ship: null, shipError: null, shipMode: 'pr', gsc: {}, provider: 'grok', model: 'grok-4.6', attempts: 1 })),
  runContentStudioPipelineStream: jest.fn(() => (async function* () {
    yield { type: 'progress', stage: 'generate', message: 'drafting' }
    yield { type: 'final', ok: true }
  })()),
}))

jest.mock('@/lib/seoFactory/masterEngineFeed', () => ({
  assembleMasterEngineFeed: jest.fn(async () => null),
}))

jest.mock('@/app/api/seo-factory/generate-stream/legacy', () => ({
  POST: jest.fn(async () => new Response('legacy-stream', { status: 200 })),
}))

jest.mock('@/lib/gscAuth', () => ({
  detectGscAuthMode: jest.fn(async () => null),
  getGscAccess: jest.fn(async () => null),
}))

jest.mock('@/lib/gscConfig', () => ({
  getGscConfig: jest.fn(async () => ({ clientId: '', clientSecret: '', refreshToken: '', siteUrl: null })),
}))

jest.mock('@/lib/seoDataLoaders', () => ({
  loadStrategiesIndex: jest.fn(async () => ({ documents: [{}], ownershipRows: 1, updatedAt: 'now' })),
  loadStrategyPromptPack: jest.fn(async () => ({ standingRules: [{}] })),
}))

import {
  generateContentText as mockedGenerateContentText,
} from '@/lib/contentAiProvider'
import { upsertVaultKey, setAiSetting } from '@/lib/aiKeyVault'
import { runSeoFactoryPipeline } from '@/lib/seoFactory/pipeline'
import { runContentStudioPipelineStream } from '@/lib/seoFactory/contentStudioPipeline'

const LONG_CONTENT = Array.from({ length: 70 }, (_, index) => `word${index}`).join(' ')

const mockAuthorReviseJob = {
  id: 'job-legacy',
  content: LONG_CONTENT,
  audit_json: { shipReady: true },
  opportunity_id: 'opp-1',
  contract_id: 'wc_1',
  contract_version: 1,
  contract_hash: 'hash-1',
  evidence_hash: 'evidence-1',
}

const mockLegacyJob = {
  id: 'job-legacy',
  ai_provider: 'entrim-deepseek',
  status: 'draft',
  content: Array.from({ length: 70 }, (_, index) => `word${index}`).join(' '),
  audit_json: {},
  opportunity_id: 'opp-1',
  contract_id: 'wc_1',
  contract_hash: 'hash-1',
  target_repo: 'kylemwalkerpr-ship-it/portal',
  pr_number: null,
}

const ENV_KEYS = ['GITHUB_TOKEN', 'CONTENT_STUDIO_GITHUB_TOKEN', 'XAI_API_KEY', 'DEEPSEEK_API_KEY'] as const
const savedEnv: Record<string, string | undefined> = {}

beforeAll(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key]
})

beforeEach(() => {
  jest.clearAllMocks()
  for (const key of ENV_KEYS) delete process.env[key]
})

afterAll(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] == null) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
})

function expectSelectionRequired(status: number, body: Record<string, unknown>) {
  expect(status).toBe(409)
  expect(body).toMatchObject({
    code: 'selection_required',
    execution_stage: 'provider_selection_required',
  })
}

describe('legacy pin rejection — Content Studio execution routes', () => {
  it('jobs PATCH regenerate rejects a legacy owner pin before any stored-job execution', async () => {
    const { PATCH } = await import('@/app/api/content-studio/jobs/route')
    const response = await PATCH(new NextRequest('http://localhost/api/content-studio/jobs', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'job-legacy', action: 'regenerate' }),
    }))
    const body = await response.json() as Record<string, unknown>
    expectSelectionRequired(response.status, body)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('author-revise rejects a legacy reviewModel before any revision authoring', async () => {
    const { POST } = await import('@/app/api/content-studio/author-revise/route')
    const response = await POST(new NextRequest('http://localhost/api/content-studio/author-revise', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jobId: 'job-legacy', contractId: 'wc_1', contractHash: 'hash-1',
        content: LONG_CONTENT, reviewModel: 'entrim-deepseek',
      }),
    }))
    const body = await response.json() as Record<string, unknown>
    expectSelectionRequired(response.status, body)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('editorial-review rejects a legacy reviewModel', async () => {
    const { POST } = await import('@/app/api/content-studio/editorial-review/route')
    const response = await POST(new NextRequest('http://localhost/api/content-studio/editorial-review', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        content: LONG_CONTENT,
        grammar: { items: [], fingerprint: 'draft-fp', sourceCharacters: LONG_CONTENT.length },
        reviewModel: 'entrim-qwen-27b',
      }),
    }))
    const body = await response.json() as Record<string, unknown>
    expectSelectionRequired(response.status, body)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('style-review rejects a legacy reviewModel instead of silently pinning Grok', async () => {
    const { POST } = await import('@/app/api/content-studio/style-review/route')
    const response = await POST(new NextRequest('http://localhost/api/content-studio/style-review', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: LONG_CONTENT, reviewModel: 'entrim-deepseek' }),
    }))
    const body = await response.json() as Record<string, unknown>
    expectSelectionRequired(response.status, body)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('reaudit PATCH rejects a legacy reviewModel before any fix pass', async () => {
    const { PATCH } = await import('@/app/api/content-studio/reaudit/route')
    const response = await PATCH(new NextRequest('http://localhost/api/content-studio/reaudit', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'fix_all',
        content: `# F-1 OPT timing guide\n\n${LONG_CONTENT}`,
        annotations: [{ code: 'missing_disclaimer', severity: 'blocker', message: 'Add the disclaimer', line: 1, highlightedText: 'word0', fix: 'Add disclaimer' }],
        reviewModel: 'nvidia-deepseek',
      }),
    }))
    const body = await response.json() as Record<string, unknown>
    expectSelectionRequired(response.status, body)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('suggest-brief rejects a legacy aiProvider before the brief core runs', async () => {
    const core = jest.requireMock('@/app/api/content-studio/suggest-brief/core') as { POST: jest.Mock }
    const { POST } = await import('@/app/api/content-studio/suggest-brief/route')
    const response = await POST(new NextRequest('http://localhost/api/content-studio/suggest-brief', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ topic: 'F-1 OPT timing', aiProvider: 'entrim-deepseek' }),
    }))
    const body = await response.json() as Record<string, unknown>
    expectSelectionRequired(response.status, body)
    expect(core.POST).not.toHaveBeenCalled()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('seo-factory/generate rejects a legacy aiProvider before any pipeline runs', async () => {
    const { POST } = await import('@/app/api/seo-factory/generate/route')
    const response = await POST(new NextRequest('http://localhost/api/seo-factory/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ topic: 'F-1 OPT timing', aiProvider: 'baseten-deepseek' }),
    }))
    const body = await response.json() as Record<string, unknown>
    expectSelectionRequired(response.status, body)
    if ((runSeoFactoryPipeline as jest.Mock).mock.calls.length > 0) {
      // If a route implementation delegates instead of pre-validating, the
      // pipeline mock rejects with the same typed error and the route maps it.
      expect(mockFetch).not.toHaveBeenCalled()
    }
  })

  it('seo-factory/generate-stream rejects a legacy aiProvider with 409 before opening the SSE stream', async () => {
    const { POST } = await import('@/app/api/seo-factory/generate-stream/route')
    const response = await POST(new NextRequest('http://localhost/api/seo-factory/generate-stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ topic: 'F-1 OPT timing', aiProvider: 'entrim-deepseek', contractId: 'wc_1', contractHash: 'hash-1', writingContractRequired: true }),
    }))
    // Pre-P2 the route returns an open SSE stream here; cancel it so the
    // heartbeat timer does not outlive the assertion failure.
    if (response.status !== 409 && response.body) await response.body.cancel().catch(() => undefined)
    expect(response.status).toBe(409)
    const body = await response.json() as Record<string, unknown>
    expect(body).toMatchObject({
      code: 'selection_required',
      execution_stage: 'provider_selection_required',
    })
    expect(runContentStudioPipelineStream).not.toHaveBeenCalled()
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('legacy pin rejection — vault / settings / test / health surfaces', () => {
  it('ai-keys PUT rejects a retired provider id and writes nothing', async () => {
    const { PUT } = await import('@/app/api/seo-factory/ai-keys/route')
    const response = await PUT(new NextRequest('http://localhost/api/seo-factory/ai-keys', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'entrim-deepseek', apiKey: 'sk-test' }),
    }))
    expect(response.status).toBe(400)
    expect(upsertVaultKey).not.toHaveBeenCalled()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('ai-keys settings rejects a retired defaultProvider and writes nothing', async () => {
    const { POST } = await import('@/app/api/seo-factory/ai-keys/settings/route')
    const response = await POST(new NextRequest('http://localhost/api/seo-factory/ai-keys/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ defaultProvider: 'entrim-qwen-27b' }),
    }))
    expect(response.status).toBe(400)
    expect(setAiSetting).not.toHaveBeenCalled()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('ai-keys test rejects a retired provider id with zero outbound probes', async () => {
    const { POST } = await import('@/app/api/seo-factory/ai-keys/test/route')
    const response = await POST(new NextRequest('http://localhost/api/seo-factory/ai-keys/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'entrim-deepseek' }),
    }))
    expect(response.status).toBe(400)
    expect(mockedGenerateContentText).not.toHaveBeenCalled()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('seo-factory/health lists exactly the two commissioned providers and no retired row', async () => {
    const { GET } = await import('@/app/api/seo-factory/health/route')
    const response = await GET()
    const body = await response.json() as { checks: Array<{ id: string; label: string }> }
    const aiChecks = body.checks.filter((check) => check.id.startsWith('ai_'))
    const providerIds = aiChecks.map((check) => check.id).filter((id) => id !== 'ai_fallbacks').sort()
    expect(providerIds).toEqual(['ai_deepseek-v41-flash', 'ai_grok'])
    expect(body.checks.every((check) => !/entrim|nvidia|baseten|parasail|runbios|aihubmix/i.test(`${check.id} ${check.label}`))).toBe(true)
  })
})
