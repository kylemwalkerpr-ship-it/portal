/**
 * Task 5 (P2-C) — provider persistence contract.
 *
 * Proves the durable job projection/update path persists the requested pin
 * (`ai_provider`), the actual commissioned pin/model (`actual_provider` /
 * `actual_model`), `provider_error_class`, and the bounded
 * `audit_json.provider.attempts` lineage — AND that every writer still works
 * when the additive provider-parity migration is intentionally unapplied
 * (absent-column compatibility retry, exactly like PR #200).
 *
 * Never asserts or persists prompts, API keys, auth tokens, or request bodies.
 */
import { ProviderDestinationViolationError, ProviderSelectionRequiredError } from '@/lib/contentAiRegistry'

type UpdateOp = { table: string; row: Record<string, unknown> }
const mockUpdateOps: UpdateOp[] = []
const mockUpdateErrors: Array<{ message: string }> = []
let mockSelectData: Record<string, unknown> | null = { id: 'job-1', content: null, word_count: null }

const mockBuilder = (table: string) => {
  const state: {
    action: 'select' | 'update' | 'insert'
    row: Record<string, unknown> | null
    filters: Array<[string, unknown]>
  } = { action: 'select', row: null, filters: [] }
  const finish = () => {
    if (table === 'content_jobs' && state.action === 'update') {
      mockUpdateOps.push({ table, row: state.row || {} })
      const error = mockUpdateErrors.shift() || null
      return { data: error ? null : { id: 'updated-1' }, error }
    }
    if (table === 'content_jobs' && state.action === 'insert') {
      return { data: { id: 'inserted-123' }, error: null }
    }
    return { data: mockSelectData, error: null }
  }
  const chain: Record<string, unknown> = {
    select: () => chain,
    update: (row: Record<string, unknown>) => { state.action = 'update'; state.row = row; return chain },
    insert: (row: Record<string, unknown>) => { state.action = 'insert'; state.row = row; return chain },
    eq: (key: string, value: unknown) => { state.filters.push([key, value]); return chain },
    in: () => chain,
    neq: () => chain,
    gt: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => finish(),
    single: async () => finish(),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(finish()).then(resolve, reject),
  }
  return chain
}

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ from: (table: string) => mockBuilder(table) })),
}))

const mockRpc = jest.fn(async (fn: string) => {
  if (fn === 'claim_content_studio_execution') {
    return {
      data: [{
        execution_owner: 'persist-owner',
        execution_attempt: 1,
        execution_lease_expires_at: new Date(Date.now() + 900_000).toISOString(),
      }],
      error: null,
    }
  }
  if (fn === 'check_content_studio_execution') return { data: true, error: null }
  if (fn === 'renew_content_studio_execution') return { data: [{ execution_lease_expires_at: new Date(Date.now() + 900_000).toISOString() }], error: null }
  if (fn === 'release_content_studio_execution') return { data: true, error: null }
  return { data: null, error: { message: `unexpected rpc ${fn}` } }
})

jest.mock('@/lib/supabase', () => ({
  createSupabaseAdminClient: jest.fn(() => ({
    from: (table: string) => mockBuilder(table),
    rpc: (...args: unknown[]) => mockRpc(...(args as [string])),
  })),
}))

// ── storedJobExecution ──────────────────────────────────────────────────────
const mockRunSeoFactoryPipeline = jest.fn(async (...args: unknown[]) => ({ ok: true, args }))
const mockRunContentStudioPipeline = jest.fn(async (...args: unknown[]) => ({ ok: true, args }))
jest.mock('@/lib/seoFactory/pipeline', () => ({
  runSeoFactoryPipeline: (...args: unknown[]) => mockRunSeoFactoryPipeline(...args),
}))
jest.mock('@/lib/seoFactory/contentStudioPipeline', () => ({
  runContentStudioPipeline: (...args: unknown[]) => mockRunContentStudioPipeline(...args),
  runContentStudioPipelineStream: jest.fn(),
}))

// ── contentStudioPipelineCore strict failure path ───────────────────────────
const mockResolvePipelineWritingContract = jest.fn()
jest.mock('@/lib/seoFactory/pipelineContract', () => ({
  resolvePipelineWritingContract: (...args: unknown[]) => mockResolvePipelineWritingContract(...args),
}))
jest.mock('@/lib/seoFactory/pipelineStream', () => ({ runSeoFactoryPipelineStream: jest.fn() }))
const mockResolveOwner = jest.fn(async (..._args: unknown[]) => ({
  host: 'legal', repo: 'caseworks', filePath: 'app/x/page.tsx',
  canonicalUrl: 'https://legal.yousafeconsultancy.com/x/', indexable: true,
  blockers: [], warnings: [], contentType: 'legal_guide',
}))
jest.mock('@/lib/seoFactory/ownership', () => ({
  resolveOwner: (...args: unknown[]) => mockResolveOwner(...args),
  assertPlanRepoConsistency: jest.fn(),
}))

// ── suggestBriefContractCore attach ─────────────────────────────────────────
jest.mock('@/lib/seoFactory/tinyfishAdapter', () => ({
  collectTinyfishResearch: jest.fn(async (input: { query: string }) => ({
    state: 'empty', reason: 'no observations', observations: [], gaps: ['No TinyFish observations'],
    query: input.query, queriedAt: '2026-09-15T00:00:00.000Z', runId: 'tf-run', checkpointId: 'tf-checkpoint',
  })),
}))
jest.mock('@/lib/seoFactory/researchEvidenceStore', () => ({
  persistResearchEvidence: jest.fn(async () => []),
  verifyContractEvidenceRows: jest.fn(async () => undefined),
}))
const mockPersistWritingContract = jest.fn(async (...args: any[]) => args[1])
const mockAttachWritingContractToJob = jest.fn(async (..._args: any[]) => undefined)
jest.mock('@/lib/seoFactory/writingContractStore', () => {
  const actual = jest.requireActual('@/lib/seoFactory/writingContractStore')
  return {
    ...actual,
    reserveOpportunityJob: jest.fn(async () => ({
      jobId: 'job-provider-persist', reused: false, ownsReservation: true,
      identity: { id: 'opp-provider-persist', normalizedTopic: 'f 1 options', jurisdiction: 'us', readerIntent: 'general', action: 'new' },
    })),
    loadJobWritingContract: jest.fn(async () => null),
    nextWritingContractVersion: jest.fn(async () => 1),
    persistWritingContract: (...args: any[]) => mockPersistWritingContract(...args),
    attachWritingContractToJob: (...args: any[]) => mockAttachWritingContractToJob(...args),
    releaseOpportunityReservation: jest.fn(async () => true),
  }
})

import {
  appendProviderAttempt,
  mapPipelineJobRow,
  persistPipelineJob,
  PROVIDER_ATTEMPT_LIMIT,
  providerAttemptRecord,
  type PipelineJobPersistInput,
} from '@/lib/seoFactory/persistContentJob'
import { providerErrorClassFor, runContentStudioPipeline } from '@/lib/seoFactory/contentStudioPipelineCore'
import {
  createContentStudioExecutionState,
  markCoherentDeskCompleted,
  markCoherentDeskRunning,
  runInContentStudioExecution,
} from '@/lib/seoFactory/contentStudioExecutionContext'
import { runStoredContentJob } from '@/lib/seoFactory/storedJobExecution'
import { startSuggestBriefContract, finalizeSuggestBriefContract } from '@/lib/seoFactory/suggestBriefContract'
import type { SeoFactoryAudit } from '@/lib/seoFactory/audit'
import type { OwnerPlan } from '@/lib/seoFactory/ownership'

const plan: OwnerPlan = {
  matched: null, matchScore: 0, host: 'usa', repo: 'yousafe-consultancy',
  filePath: 'usa/content/from/f-1-visa.md', canonicalUrl: 'https://usa.example/f-1-visa/', indexable: true,
  action: 'publish', intentClass: 'procedural', contentType: 'regional_from', warnings: [], blockers: [],
  ymy: false, routingSource: 'standing_rules',
}
const audit: SeoFactoryAudit = {
  score: 82, grade: 'B', blockers: [], warnings: [], passes: [], indexableRecommended: true,
  llmsRecommended: true, wordCount: 850,
}
const baseInput = (over: Partial<PipelineJobPersistInput> = {}): PipelineJobPersistInput => ({
  existingJobId: null, userId: 'admin', title: 'F-1 Visa Guide', topic: 'f-1 visa',
  primaryKeyword: 'f-1 student visa', region: 'US', contentType: 'regional_from', tone: 'educational',
  plan, content: 'Long enough draft body. '.repeat(60), shipResult: null, shipError: null, shipMode: 'pr',
  provider: 'grok', model: 'grok-4.6', attempts: 2, minAudit: 65, audit,
  gscBrief: { source: 'snapshot', mode: 'snapshot', primaryKeywords: [] },
  requiredShortKeywords: [], requiredLongTailKeywords: [], shortKeywordTerms: [], longTailKeywordTerms: [],
  competingUrls: [], eventLog: null, rescueStats: null, cluster: null,
  ...over,
})

beforeEach(() => {
  mockUpdateOps.length = 0
  mockUpdateErrors.length = 0
  mockSelectData = { id: 'job-1', content: null, word_count: null }
  jest.clearAllMocks()
  mockRunSeoFactoryPipeline.mockReset()
  mockRunSeoFactoryPipeline.mockImplementation(async () => ({ ok: true, args: [] }))
  mockRunContentStudioPipeline.mockReset()
  mockRunContentStudioPipeline.mockImplementation(async () => ({ ok: true, args: [] }))
})

describe('mapPipelineJobRow — requested vs actual provider durability', () => {
  it('writes ai_provider as the requested pin and actual_provider as the commissioned runtime', () => {
    const row = mapPipelineJobRow(baseInput({ ownerProvider: 'deepseek-v41-flash', provider: 'grok', model: 'grok-4.6', attempts: 2 }))
    expect(row.ai_provider).toBe('deepseek-v41-flash')
    expect(row.actual_provider).toBe('grok')
    expect(row.provider_error_class).toBeNull()
    const provider = (row.audit_json as Record<string, any>).provider
    expect(provider.requested).toBe('deepseek-v41-flash')
    expect(provider.actual).toBe('grok')
    expect(provider.requestedModel).toBe('deepseek-flash')
    expect(provider.actualModel).toBe('grok-4.6')
    expect(provider.attempts).toEqual([
      { stage: 'draft', attempt: null, outcome: 'ok', failureClass: null, at: expect.any(String) },
    ])
  })

  it('never records a retired/unknown runtime as the actual provider and never writes a null actual_provider', () => {
    const row = mapPipelineJobRow(baseInput({ ownerProvider: 'entrim-deepseek', provider: 'nvidia-deepseek', model: 'deepseek-ai/x' }))
    expect(row).not.toHaveProperty('actual_provider')
    expect(row.ai_provider).toBe('entrim-deepseek')
    const provider = (row.audit_json as Record<string, any>).provider
    expect(provider).not.toHaveProperty('actual')
    expect(provider.attempts).toEqual([])
  })

  it('preserves a prior known producer/model and bounded attempts when no new completion exists', () => {
    const priorAttempts = [
      { stage: 'draft', attempt: 2, outcome: 'ok', failureClass: null, at: '2026-09-15T00:00:00.000Z' },
    ]
    const row = mapPipelineJobRow(baseInput({
      ownerProvider: 'entrim-deepseek',
      provider: 'nvidia-deepseek',
      model: 'deepseek-ai/x',
      priorAuditJson: {
        provider: {
          requested: 'entrim-deepseek', actual: 'entrim-deepseek',
          requestedModel: null, actualModel: 'deepseek-ai/DeepSeek-V4-Flash',
          attempts: priorAttempts,
        },
      },
    }))
    expect(row).not.toHaveProperty('actual_provider')
    const provider = (row.audit_json as Record<string, any>).provider
    expect(provider.actual).toBe('entrim-deepseek')
    expect(provider.actualModel).toBe('deepseek-ai/DeepSeek-V4-Flash')
    expect(provider.attempts).toEqual(priorAttempts)
  })

  it('records the first-party DeepSeek pin and upstream model exactly', () => {
    const row = mapPipelineJobRow(baseInput({ ownerProvider: 'deepseek-v41-flash', provider: 'deepseek-v41-flash', model: 'deepseek-flash', attempts: 1 }))
    expect(row.actual_provider).toBe('deepseek-v41-flash')
    const provider = (row.audit_json as Record<string, any>).provider
    expect(provider.actualModel).toBe('deepseek-flash')
    expect(provider.requestedModel).toBe('deepseek-flash')
  })
})

describe('provider attempt metadata — bounded, truncated, allowlisted (design §4.3)', () => {
  it('keeps only the bounded window, dropping the oldest records', () => {
    let attempts: unknown = []
    for (let index = 1; index <= PROVIDER_ATTEMPT_LIMIT + 5; index += 1) {
      attempts = appendProviderAttempt(attempts, { stage: `stage-${index}`, attempt: index, outcome: 'ok', at: '2026-09-15T00:00:00.000Z' })
    }
    const list = attempts as Array<{ stage: string }>
    expect(list).toHaveLength(PROVIDER_ATTEMPT_LIMIT)
    expect(list[0].stage).toBe('stage-6')
    expect(list[list.length - 1].stage).toBe(`stage-${PROVIDER_ATTEMPT_LIMIT + 5}`)
  })

  it('allowlists fields and can never carry prompts, keys, or request bodies', () => {
    const record = providerAttemptRecord({
      stage: 'draft', attempt: 3, outcome: 'error', failureClass: 'timeout', at: '2026-09-15T00:00:00.000Z',
      prompt: 'SECRET PROMPT', apiKey: 'sk-live-secret', body: '{"request":true}', authorization: 'Bearer secret',
    } as any)
    expect(record).not.toBeNull()
    expect(Object.keys(record as object).sort()).toEqual(['at', 'attempt', 'failureClass', 'outcome', 'stage'])
    const serialized = JSON.stringify(record)
    expect(serialized).not.toMatch(/SECRET PROMPT|sk-live-secret|Bearer secret/)
  })

  it('truncates overlong stage/failureClass metadata', () => {
    const record = providerAttemptRecord({
      stage: 's'.repeat(500), attempt: 1, outcome: 'error', failureClass: 'f'.repeat(500), at: '2026-09-15T00:00:00.000Z',
    })
    expect((record as { stage: string }).stage.length).toBeLessThanOrEqual(32)
    expect((record as { failureClass: string }).failureClass.length).toBeLessThanOrEqual(32)
  })

  it('drops malformed prior entries and non-object junk', () => {
    const cleaned = appendProviderAttempt(
      [{ stage: 'draft', attempt: 1, outcome: 'ok', at: '2026-09-15T00:00:00.000Z' }, 'junk', null, { prompt: 'x' }],
      { stage: 'draft', attempt: 2, outcome: 'ok', at: '2026-09-15T00:00:00.000Z' },
    )
    expect(cleaned).toHaveLength(2)
    expect(cleaned.every((entry) => typeof entry.stage === 'string')).toBe(true)
  })
})

describe('absent-column compatibility — migration intentionally unapplied', () => {
  it('retries the durable write without the provider-parity columns when they do not exist', async () => {
    mockUpdateErrors.push({ message: 'column "actual_provider" of relation "content_jobs" does not exist' })
    const jobId = await persistPipelineJob(baseInput({ existingJobId: 'early-1' }))
    expect(jobId).toBe('early-1')

    const durableWrites = mockUpdateOps.filter((op) => op.table === 'content_jobs' && 'title' in op.row)
    expect(durableWrites).toHaveLength(2)
    expect(durableWrites[0].row).toHaveProperty('actual_provider', 'grok')
    expect(durableWrites[0].row).toHaveProperty('provider_error_class', null)
    expect(durableWrites[1].row).not.toHaveProperty('actual_provider')
    expect(durableWrites[1].row).not.toHaveProperty('provider_error_class')
    expect(durableWrites[1].row).toHaveProperty('ai_provider', 'grok')
  })

  it('does not retry or strip when the write succeeds', async () => {
    const jobId = await persistPipelineJob(baseInput({ existingJobId: 'early-1' }))
    expect(jobId).toBe('early-1')
    const durableWrites = mockUpdateOps.filter((op) => op.table === 'content_jobs' && 'title' in op.row)
    expect(durableWrites).toHaveLength(1)
    expect(durableWrites[0].row).toHaveProperty('actual_provider', 'grok')
  })
})

describe('strict persistence — real fenced execution attempt, preserved prior lineage', () => {
  it('appends the fenced execution attempt (never the refinement count) and preserves prior attempts', async () => {
    mockSelectData = {
      id: 'job-1',
      content: 'Long enough draft body. '.repeat(60),
      word_count: 850,
      audit_json: {
        score: 80,
        provider: {
          requested: 'deepseek-v41-flash', actual: 'deepseek-v41-flash',
          requestedModel: 'deepseek-flash', actualModel: 'deepseek-flash',
          pinSource: 'contract',
          attempts: [{ stage: 'draft', attempt: 1, outcome: 'ok', failureClass: null, at: '2026-09-15T00:00:00.000Z' }],
        },
      },
    }
    const state = createContentStudioExecutionState(true, {
      contractId: 'contract-provider-persist',
      contractHash: 'hash-provider-persist',
      opportunityId: 'opp-provider-persist',
      requestedModel: 'deepseek-v41-flash',
      executionJobId: 'job-1',
      executionOwner: 'persist-owner',
      executionAttempt: 6,
      executionLeaseExpiresAt: new Date(Date.now() + 900_000).toISOString(),
    })
    const jobId = await runInContentStudioExecution(state, () => persistPipelineJob(baseInput({
      existingJobId: 'job-1',
      ownerProvider: 'deepseek-v41-flash',
      provider: 'deepseek-v41-flash',
      model: 'deepseek-flash',
      attempts: 12,
    })))
    expect(jobId).toBe('job-1')
    const row = mockUpdateOps.filter((op) => 'title' in op.row).pop()!.row
    expect(row.actual_provider).toBe('deepseek-v41-flash')
    expect(row.requested_model).toBe('deepseek-flash')
    const provider = (row.audit_json as Record<string, any>).provider
    expect(provider.attempts).toHaveLength(2)
    expect(provider.attempts[0].attempt).toBe(1)
    expect(provider.attempts[1]).toMatchObject({ stage: 'draft', attempt: 6, outcome: 'ok' })
    expect(provider.attempts[1].attempt).not.toBe(12)
  })
})

describe('providerErrorClassFor — design §4.2 failure taxonomy', () => {
  it.each([
    [new Error('401 Unauthorized: invalid api key'), 'auth'],
    [new Error('403 Forbidden: authentication failed'), 'auth'],
    [new Error('402 Payment Required: credit limit reached'), 'quota'],
    [new Error('429 Too Many Requests: rate limit exceeded'), 'rate_limit'],
    [new Error('upstream timed out after 180s'), 'timeout'],
    [new Error('provider returned empty content'), 'empty'],
    [new Error('output was truncated (token limit) - trying next provider'), 'unusable_generation'],
    [new Error('malformed JSON response from provider'), 'malformed'],
    [new Error('fetch failed: econnreset'), 'unavailable'],
    [new ProviderSelectionRequiredError('entrim-deepseek'), 'selection_required'],
    [new ProviderDestinationViolationError('https://evil.example/v1', 'api.deepseek.com'), 'destination_violation'],
    [new Error('strict Content Studio ownership drift'), null],
  ])('classifies %s', (error, expected) => {
    expect(providerErrorClassFor(error)).toBe(expected)
  })
})

describe('contentStudioPipelineCore — failure persistence records provider/error class', () => {
  const contractRequest = {
    writingContractRequired: true,
    existingJobId: 'job-1',
    contractId: 'contract-provider-persist',
    contractHash: 'hash-provider-persist',
    opportunityId: 'opp-provider-persist',
    topic: 'f-1 options',
    primaryKeyword: 'f-1 options',
    region: 'US',
    contentType: 'legal_guide',
  } as any
  const contract = {
    contractId: 'contract-provider-persist',
    contractHash: 'hash-provider-persist',
    contractVersion: 1,
    opportunity: { id: 'opp-provider-persist', jurisdiction: 'US' },
    ownership: { host: 'legal', repo: 'caseworks', filePath: 'app/x/page.tsx', canonicalUrl: 'https://legal.yousafeconsultancy.com/x/' },
    requestedModel: 'deepseek-v41-flash',
    primaryKeyword: 'f-1 options',
    contentType: 'legal_guide',
    metadata: { targetSlug: 'x', title: 'X' },
    brief: { outline: [] },
  } as any

  beforeEach(() => {
    mockResolvePipelineWritingContract.mockResolvedValue({ contract, input: contractRequest })
    mockSelectData = {
      id: 'job-1',
      audit_json: {
        score: 55,
        provider: {
          requested: 'deepseek-v41-flash', actual: null, requestedModel: 'deepseek-flash', actualModel: null,
          pinSource: 'contract',
          attempts: [{ stage: 'draft', attempt: 1, outcome: 'ok', failureClass: null, at: '2026-09-15T00:00:00.000Z' }],
        },
      },
    }
  })

  it('persists provider_error_class, actual provider/model, and a bounded error attempt on provider failure', async () => {
    mockRunSeoFactoryPipeline.mockImplementation(async () => {
      markCoherentDeskRunning()
      markCoherentDeskCompleted('ACCEPTED DRAFT MUST SURVIVE')
      throw new Error('429 Too Many Requests: rate limit exceeded')
    })

    await expect(runContentStudioPipeline(contractRequest)).rejects.toThrow(/rate limit/i)

    const failurePatch = mockUpdateOps
      .map((op) => op.row)
      .find((row) => row.status === 'failed')
    expect(failurePatch).toBeDefined()
    expect(failurePatch!.provider_error_class).toBe('rate_limit')
    expect(failurePatch!.actual_provider).toBe('deepseek-v41-flash')
    expect(failurePatch!.actual_model).toBe('deepseek-flash')
    const provider = (failurePatch!.audit_json as Record<string, any>).provider
    expect(provider.attempts).toHaveLength(2)
    expect(provider.attempts[1]).toEqual({
      stage: 'revision_required', attempt: 1, outcome: 'error', failureClass: 'rate_limit', at: expect.any(String),
    })
    // The persisted lineage stays allowlisted: no prompt/key/token fields exist.
    expect(Object.keys(provider.attempts[1]).sort()).toEqual(['at', 'attempt', 'failureClass', 'outcome', 'stage'])
    expect(Object.keys(provider).sort()).toEqual(['actual', 'actualModel', 'attempts', 'pinSource', 'requested', 'requestedModel'])
  })

  it('does not claim an actual provider before any accepted artifact exists', async () => {
    mockRunSeoFactoryPipeline.mockImplementation(async () => {
      markCoherentDeskRunning()
      throw new Error('401 Unauthorized: invalid api key')
    })

    await expect(runContentStudioPipeline(contractRequest)).rejects.toThrow(/Unauthorized/i)

    const failurePatch = mockUpdateOps
      .map((op) => op.row)
      .find((row) => row.status === 'failed')
    expect(failurePatch!.provider_error_class).toBe('auth')
    expect(failurePatch).not.toHaveProperty('actual_provider')
    expect(failurePatch).not.toHaveProperty('actual_model')
  })
})

describe('storedJobExecution — requested pin is carried explicitly', () => {
  it('passes the persisted requested pin into the legacy pipeline', async () => {
    await runStoredContentJob({ id: 'job-1', topic: 'f-1 options', ai_provider: 'deepseek-v41-flash' })
    expect(mockRunSeoFactoryPipeline).toHaveBeenCalledWith(expect.objectContaining({
      existingJobId: 'job-1',
      aiProvider: 'deepseek-v41-flash',
    }))
  })

  it('passes the persisted requested pin into the contracted runner', async () => {
    await runStoredContentJob({
      id: 'job-1', topic: 'f-1 options', ai_provider: 'grok',
      contract_id: 'contract-1', contract_hash: 'hash-1', opportunity_id: 'opp-1', evidence_hash: 'evidence-1',
    })
    expect(mockRunContentStudioPipeline).toHaveBeenCalledWith(expect.objectContaining({
      aiProvider: 'grok',
      writingContractRequired: true,
      contractId: 'contract-1',
    }))
  })

  it('carries a persisted legacy pin verbatim instead of defaulting it', async () => {
    await runStoredContentJob({ id: 'job-1', topic: 'f-1 options', ai_provider: 'entrim-qwen-27b' })
    expect(mockRunSeoFactoryPipeline).toHaveBeenCalledWith(expect.objectContaining({ aiProvider: 'entrim-qwen-27b' }))
  })

  it('invents no pin when the stored row has none', async () => {
    await runStoredContentJob({ id: 'job-1', topic: 'f-1 options' })
    const input = mockRunSeoFactoryPipeline.mock.calls[0][0] as Record<string, unknown>
    expect(input.aiProvider).toBeUndefined()
  })
})

describe('suggestBriefContractCore — requested provider/model on the job identity', () => {
  const sealedBrief = {
    thesis: 'F-1 students need a decision framework that separates status rules, timing, and evidence before choosing the next step.',
    takeaways: [
      'Students should identify the exact immigration objective before comparing any available filing path.',
      'Timing rules and documentary evidence should be checked against authoritative sources before action.',
      'A practical decision should distinguish eligibility facts from strategy choices that need individual advice.',
    ],
    lede: 'This guide gives F-1 students a structured way to compare the relevant options, timing constraints, and evidence without assuming an outcome.',
    outline: [
      { heading: 'Define the objective', purpose: 'Separate the reader goals.', bridgeFrom: '', coverTopics: ['objective'], format: 'prose' as const },
      { heading: 'Check timing', purpose: 'Explain timing checkpoints.', bridgeFrom: 'The objective determines which timing rules matter next.', coverTopics: ['timing'], format: 'prose' as const },
      { heading: 'Check evidence', purpose: 'Explain evidence checkpoints.', bridgeFrom: 'The timing analysis determines which evidence must be current.', coverTopics: ['evidence'], format: 'prose' as const },
    ],
    faqQuestions: [], unresolved: [],
  }

  it('attaches the requested commissioned pin and requested model to the reserved job', async () => {
    const session = await startSuggestBriefContract({
      topic: 'F-1 options', primaryKeyword: 'f-1 options', contentType: 'blog', region: 'US',
    })
    await finalizeSuggestBriefContract({
      session, topic: 'F-1 options', primaryKeyword: 'f-1 options', contentType: 'blog', region: 'US',
      audience: 'F-1 students', sealedBrief,
      requiredShortKeywords: [], requiredLongTailKeywords: [], shortKeywordTerms: [], longTailKeywordTerms: [],
      minWords: 800, targetWords: 1000, maxWords: 1300, sources: [], interlinks: [],
      title: 'F-1 Options', targetSlug: 'f-1-options',
      requestedModel: 'deepseek-v41-flash', actualModel: 'deepseek-flash',
      engineOk: true, ubersuggestTerms: [],
    })

    expect(mockAttachWritingContractToJob).toHaveBeenCalled()
    const identity = mockUpdateOps
      .map((op) => op.row)
      .find((row) => row.ai_provider === 'deepseek-v41-flash')
    expect(identity).toBeDefined()
    // requested_model is the commissioned registry API model, never the pin.
    expect(identity!.requested_model).toBe('deepseek-flash')
    expect(identity!.requested_model).not.toBe('deepseek-v41-flash')
    expect(identity!.actual_model).toBe('deepseek-flash')
  })

  it('does not invent a provider identity when the contract has none', async () => {
    const session = await startSuggestBriefContract({
      topic: 'F-1 options', primaryKeyword: 'f-1 options', contentType: 'blog', region: 'US',
    })
    await finalizeSuggestBriefContract({
      session, topic: 'F-1 options', primaryKeyword: 'f-1 options', contentType: 'blog', region: 'US',
      audience: 'F-1 students', sealedBrief,
      requiredShortKeywords: [], requiredLongTailKeywords: [], shortKeywordTerms: [], longTailKeywordTerms: [],
      minWords: 800, targetWords: 1000, maxWords: 1300, sources: [], interlinks: [],
      title: 'F-1 Options', targetSlug: 'f-1-options',
      engineOk: true, ubersuggestTerms: [],
    })
    expect(mockUpdateOps.some((op) => 'ai_provider' in op.row)).toBe(false)
  })
})
