jest.mock('@/lib/supabase', () => ({ createSupabaseAdminClient: jest.fn() }))
jest.mock('@/lib/seoFactory/pipelineContract', () => ({
  resolvePipelineWritingContract: jest.fn(),
}))
jest.mock('@/lib/seoFactory/pipeline', () => ({ runSeoFactoryPipeline: jest.fn() }))
jest.mock('@/lib/seoFactory/pipelineStream', () => ({ runSeoFactoryPipelineStream: jest.fn() }))
jest.mock('@/lib/seoFactory/ownership', () => {
  const actual = jest.requireActual('@/lib/seoFactory/ownership')
  return { ...actual, resolveOwner: jest.fn() }
})
jest.mock('@/lib/seoFactory/broadCreateFreeze', () => ({
  assertBroadCreateDestinationAllowed: jest.fn(async () => undefined),
}))


import { createSupabaseAdminClient } from '@/lib/supabase'
import { resolvePipelineWritingContract } from '@/lib/seoFactory/pipelineContract'
import { runSeoFactoryPipelineStream } from '@/lib/seoFactory/pipelineStream'
import { resolveOwner } from '@/lib/seoFactory/ownership'
import { runContentStudioPipelineStream } from '@/lib/seoFactory/contentStudioPipeline'
import {
  assertIsolatedAuthoringAllowed,
  markCoherentDeskCompleted,
  markCoherentDeskRunning,
} from '@/lib/seoFactory/contentStudioExecutionContext'
import { CONTENT_STUDIO_LEASE_RENEW_MS } from '@/lib/seoFactory/writingContractStore'

const jobId = '00000000-0000-0000-0000-000000000001'
const ownership = {
  host: 'legal',
  repo: 'caseworks',
  filePath: 'app/us/f1-opt-timing/page.tsx',
  canonicalUrl: 'https://legal.yousafeconsultancy.com/us/f1-opt-timing/',
}
const contract = {
  contractId: 'contract-1',
  contractHash: 'hash-1',
  opportunity: { id: 'opp-1', jurisdiction: 'US' },
  ownership,
  contentType: 'legal_guide',
  primaryKeyword: 'f-1 opt timing',
  metadata: { title: 'F-1 OPT Timing Guide', targetSlug: 'f1-opt-timing', tone: 'educational' },
  reader: { audience: 'F-1 students', primaryQuestion: 'When should an F-1 student apply for OPT?' },
  brief: {
    thesis: 'OPT timing depends on the permitted filing window and the student’s facts.',
    takeaways: ['Confirm the current filing window before filing.'],
    lede: 'Timing mistakes can delay an otherwise valid OPT application.',
    faqQuestions: ['When can I file Form I-765?'],
    unresolved: [],
    outline: [
      { heading: 'Timing', purpose: 'Explain the filing window', format: 'prose', coverTopics: ['filing window'] },
      { heading: 'Documents', purpose: 'List timing evidence', format: 'checklist', coverTopics: ['evidence'] },
    ],
  },
  queryCoverage: { requiredShortKeywords: [], requiredLongTailKeywords: [], shortKeywordTerms: [], longTailKeywordTerms: [] },
  wordBudget: { minWords: 800, targetWords: 1000, maxWords: 1300 },
  links: { sources: [], interlinks: [] },
  evidence: [],
  evidenceHash: 'evidence-1',
  sourceHealth: {},
  researchGaps: [],
  researchRunId: 'run-1',
  requestedModel: null,
  contractVersion: 1,
  createdAt: '2026-09-15T00:00:00.000Z',
} as any

const request = {
  writingContractRequired: true,
  existingJobId: jobId,
  topic: contract.reader.primaryQuestion,
  title: contract.metadata.title,
  primaryKeyword: contract.primaryKeyword,
  region: 'US',
  contentType: contract.contentType,
  userId: 'admin',
} as any

type LeaseState = {
  owner: string | null
  attempt: number
  expiresAt: string | null
}

function future(ms = 15 * 60 * 1000) {
  return new Date(Date.now() + ms).toISOString()
}

function makeDb(lease: LeaseState) {
  const db: any = {
    rpc: jest.fn(async (fn: string, args: Record<string, any>) => {
      if (fn === 'claim_content_studio_execution') {
        const expired = !lease.expiresAt || Date.parse(lease.expiresAt) <= Date.now()
        if (lease.owner && !expired) return { data: [], error: null }
        lease.owner = String(args.p_execution_owner)
        lease.attempt += 1
        lease.expiresAt = future()
        return { data: [{ execution_owner: lease.owner, execution_attempt: lease.attempt, execution_lease_expires_at: lease.expiresAt }], error: null }
      }
      if (fn === 'renew_content_studio_execution') {
        const current = lease.owner === args.p_execution_owner
          && lease.attempt === args.p_execution_attempt
          && Boolean(lease.expiresAt && Date.parse(lease.expiresAt) > Date.now())
        if (!current) return { data: [], error: null }
        lease.expiresAt = future()
        return { data: [{ execution_lease_expires_at: lease.expiresAt }], error: null }
      }
      if (fn === 'check_content_studio_execution') {
        return {
          data: lease.owner === args.p_execution_owner
            && lease.attempt === args.p_execution_attempt
            && Boolean(lease.expiresAt && Date.parse(lease.expiresAt) > Date.now()),
          error: null,
        }
      }
      if (fn === 'release_content_studio_execution') {
        const current = lease.owner === args.p_execution_owner && lease.attempt === args.p_execution_attempt
        if (current) { lease.owner = null; lease.expiresAt = null }
        return { data: current, error: null }
      }
      throw new Error(`unexpected rpc ${fn}`)
    }),
    from: jest.fn(() => {
      const q: any = {}
      for (const method of ['update', 'eq', 'in', 'gt', 'select']) q[method] = jest.fn(() => q)
      q.maybeSingle = jest.fn(async () => ({ data: { id: jobId, audit_json: {} }, error: null }))
      return q
    }),
  }
  return db
}

function finalResult() {
  return {
    jobId,
    model: 'test-model',
    provider: 'test-provider',
    content: 'accepted content',
    audit: { blockers: [] },
    ship: null,
    shipError: null,
  } as any
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => { resolve = r })
  return { promise, resolve }
}

async function collect(iterator: AsyncGenerator<any>) {
  const events: any[] = []
  for await (const event of iterator) events.push(event)
  return events
}

describe('strict Content Studio SSE producer', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(resolvePipelineWritingContract).mockResolvedValue({ input: request, contract } as any)
    jest.mocked(resolveOwner).mockResolvedValue({ ...ownership, blockers: [], warnings: [], indexable: true, contentType: contract.contentType, action: 'expand', routingSource: 'registry_owner_url', matched: { id: 1, owner_url: ownership.canonicalUrl, status: 'confirmed', action: 'expand', notes: '' } } as any)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  test('keeps one ALS authoring window alive across multiple progress yields', async () => {
    const lease: LeaseState = { owner: null, attempt: 0, expiresAt: null }
    jest.mocked(createSupabaseAdminClient).mockReturnValue(makeDb(lease))
    jest.mocked(runSeoFactoryPipelineStream).mockImplementation(async function* () {
      markCoherentDeskRunning()
      assertIsolatedAuthoringAllowed()
      yield { type: 'progress', stage: 'draft', message: 'turn 1' } as any
      await Promise.resolve()
      assertIsolatedAuthoringAllowed()
      yield { type: 'progress', stage: 'draft', message: 'turn 2' } as any
      await Promise.resolve()
      assertIsolatedAuthoringAllowed()
      markCoherentDeskCompleted('accepted content')
      yield { type: 'final', result: finalResult() } as any
    })

    const events = await collect(runContentStudioPipelineStream(request))
    expect(events.map((event) => event.type)).toEqual(['progress', 'progress', 'final'])
    expect(events.filter((event) => event.type === 'error')).toEqual([])
  })

  test('renews the lease while a long model turn is still awaiting completion', async () => {
    jest.useFakeTimers()
    const lease: LeaseState = { owner: null, attempt: 0, expiresAt: null }
    const db = makeDb(lease)
    jest.mocked(createSupabaseAdminClient).mockReturnValue(db)
    const gate = deferred()
    jest.mocked(runSeoFactoryPipelineStream).mockImplementation(async function* () {
      markCoherentDeskRunning()
      yield { type: 'progress', stage: 'draft', message: 'waiting on long model turn' } as any
      await gate.promise
      assertIsolatedAuthoringAllowed()
      markCoherentDeskCompleted('accepted content')
      yield { type: 'final', result: finalResult() } as any
    })

    const iterator = runContentStudioPipelineStream(request)
    await expect(iterator.next()).resolves.toMatchObject({ value: { type: 'progress' } })
    await jest.advanceTimersByTimeAsync(CONTENT_STUDIO_LEASE_RENEW_MS + 10)
    expect(db.rpc).toHaveBeenCalledWith('renew_content_studio_execution', expect.objectContaining({ p_execution_attempt: 1 }))
    gate.resolve()
    await expect(iterator.next()).resolves.toMatchObject({ value: { type: 'final' } })
    await iterator.return(undefined)
  })

  test('rejects a second execution of the same contracted job while the first lease is current', async () => {
    const lease: LeaseState = { owner: null, attempt: 0, expiresAt: null }
    jest.mocked(createSupabaseAdminClient).mockReturnValue(makeDb(lease))
    const gate = deferred()
    jest.mocked(runSeoFactoryPipelineStream).mockImplementation(async function* () {
      markCoherentDeskRunning()
      yield { type: 'progress', stage: 'draft', message: 'first execution owns lease' } as any
      await gate.promise
      markCoherentDeskCompleted('accepted content')
      yield { type: 'final', result: finalResult() } as any
    })

    const first = runContentStudioPipelineStream(request)
    await expect(first.next()).resolves.toMatchObject({ value: { type: 'progress' } })
    const second = runContentStudioPipelineStream(request)
    await expect(second.next()).rejects.toThrow(/execution already active/i)

    gate.resolve()
    await expect(first.next()).resolves.toMatchObject({ value: { type: 'final' } })
    await first.return(undefined)
  })

  test('a stale attempt cannot persist final completion after an expired-lease takeover', async () => {
    const lease: LeaseState = { owner: null, attempt: 0, expiresAt: null }
    jest.mocked(createSupabaseAdminClient).mockReturnValue(makeDb(lease))
    const gate = deferred()
    jest.mocked(runSeoFactoryPipelineStream).mockImplementation(async function* () {
      markCoherentDeskRunning()
      yield { type: 'progress', stage: 'draft', message: 'old owner active' } as any
      await gate.promise
      markCoherentDeskCompleted('accepted content')
      yield { type: 'final', result: finalResult() } as any
    })

    const iterator = runContentStudioPipelineStream(request)
    await expect(iterator.next()).resolves.toMatchObject({ value: { type: 'progress' } })

    // Simulate expiry + a different worker atomically taking over the same job.
    lease.owner = 'new-owner'
    lease.attempt = 2
    lease.expiresAt = future()
    gate.resolve()

    const terminal = await iterator.next()
    expect(terminal.value?.type).toBe('error')
    expect(String(terminal.value?.error || '')).toMatch(/lease|ownership|execution/i)
    expect(terminal.value?.type).not.toBe('final')
  })
})
