const mockJsonRunner = jest.fn(async (_input: any) => ({
  ok: true, content: 'accepted content', plan: {}, audit: {}, ship: null, shipError: null,
  shipMode: 'none', provider: 'test-provider', model: 'test-model', attempts: 1,
  gsc: { source: 'none', mode: 'none', primaryKeywords: [], opportunityKeywords: [], warnings: [] },
  jobId: 'job-1',
}))
const mockRawStream = jest.fn(async function* (_input: any) {
  yield { type: 'progress', stage: 'draft', message: 'contract-bound draft started' } as any
  yield { type: 'final', result: await mockJsonRunner(_input) } as any
})

jest.mock('@/lib/seoFactory/contentStudioPipelineCore', () => ({
  runContentStudioPipeline: (input: any) => mockJsonRunner(input),
  runContentStudioPipelineStream: (input: any) => mockRawStream(input),
}))
jest.mock('@/lib/seoFactory/writingContractStore', () => ({
  runWithContentStudioRecoveryClaim: (fn: () => any) => fn(),
}))

import { runContentStudioPipelineStream } from '@/lib/seoFactory/contentStudioPipeline'
import { fenceStreamContentJobsClient } from '@/lib/seoFactory/streamContentJobFence'
import {
  createContentStudioExecutionState,
  runInContentStudioExecution,
} from '@/lib/seoFactory/contentStudioExecutionContext'

type Row = {
  id: string
  opportunity_id: string
  contract_id: string
  contract_hash: string
  execution_owner: string
  execution_attempt: number
  execution_lease_expires_at: string
  status: string
  [key: string]: unknown
}

type Trace = { patch: Record<string, unknown>; filters: Array<{ op: 'eq' | 'gt'; key: string; value: unknown }> }

function future() { return new Date(Date.now() + 15 * 60 * 1000).toISOString() }

function fakeClient(row: Row, options: { compatibilityFailures?: number } = {}) {
  let compatibilityFailures = Number(options.compatibilityFailures || 0)
  const traces: Trace[] = []
  const client: any = {
    from: jest.fn((table: string) => {
      if (table !== 'content_jobs') throw new Error(`unexpected table ${table}`)
      let patch: Record<string, unknown> = {}
      const filters: Trace['filters'] = []
      const q: any = {
        update: jest.fn((next: Record<string, unknown>) => { patch = { ...next }; return q }),
        insert: jest.fn(() => q),
        upsert: jest.fn(() => q),
        delete: jest.fn(() => q),
        eq: jest.fn((key: string, value: unknown) => { filters.push({ op: 'eq', key, value }); return q }),
        gt: jest.fn((key: string, value: unknown) => { filters.push({ op: 'gt', key, value }); return q }),
        select: jest.fn(() => q),
        then: (resolve: (value: any) => any, reject?: (reason: unknown) => any) => {
          traces.push({ patch: { ...patch }, filters: [...filters] })
          if (compatibilityFailures > 0 && Object.prototype.hasOwnProperty.call(patch, 'event_log')) {
            compatibilityFailures -= 1
            return Promise.resolve({ data: null, error: { message: 'column event_log does not exist' } }).then(resolve, reject)
          }
          const matches = filters.every((filter) => {
            if (filter.op === 'eq') return row[filter.key] === filter.value
            const actual = Date.parse(String(row[filter.key] || ''))
            const threshold = Date.parse(String(filter.value || ''))
            return Number.isFinite(actual) && Number.isFinite(threshold) && actual > threshold
          })
          if (matches) Object.assign(row, patch)
          return Promise.resolve({ data: matches ? [{ id: row.id }] : [], error: null }).then(resolve, reject)
        },
      }
      return q
    }),
  }
  return { client, traces }
}

function strictState(owner = 'worker-a', attempt = 1) {
  return createContentStudioExecutionState(true, {
    contractId: 'contract-1',
    contractHash: 'hash-1',
    opportunityId: 'opp-1',
    executionJobId: 'job-1',
    executionOwner: owner,
    executionAttempt: attempt,
    executionLeaseExpiresAt: future(),
  })
}

describe('contracted SSE persistence boundary', () => {
  beforeEach(() => jest.clearAllMocks())

  it('delegates to the verified streaming producer instead of substituting the JSON producer', async () => {
    const events: any[] = []
    for await (const event of runContentStudioPipelineStream({ existingJobId: 'job-1' } as any)) events.push(event)
    expect(mockRawStream).toHaveBeenCalledWith(expect.objectContaining({ existingJobId: 'job-1' }))
    expect(events.map((event) => event.type)).toEqual(['progress', 'final'])
  })

  it('fences the early strict update to the exact contract owner, attempt and live lease', async () => {
    const row: Row = {
      id: 'job-1', opportunity_id: 'opp-1', contract_id: 'contract-1', contract_hash: 'hash-1',
      execution_owner: 'worker-a', execution_attempt: 1, execution_lease_expires_at: future(), status: 'pending',
    }
    const db = fakeClient(row)
    await runInContentStudioExecution(strictState(), async () => {
      const fenced = fenceStreamContentJobsClient(db.client)
      const result = await fenced.from('content_jobs').update({ status: 'drafting' }).eq('id', 'job-1')
      expect(result.error).toBeNull()
    })
    expect(row.status).toBe('drafting')
    expect(db.traces).toHaveLength(1)
    const filters = db.traces[0].filters
    expect(filters).toEqual(expect.arrayContaining([
      { op: 'eq', key: 'id', value: 'job-1' },
      { op: 'eq', key: 'contract_id', value: 'contract-1' },
      { op: 'eq', key: 'contract_hash', value: 'hash-1' },
      { op: 'eq', key: 'opportunity_id', value: 'opp-1' },
      { op: 'eq', key: 'execution_owner', value: 'worker-a' },
      { op: 'eq', key: 'execution_attempt', value: 1 },
    ]))
    expect(filters.some((filter) => filter.op === 'gt' && filter.key === 'execution_lease_expires_at')).toBe(true)
  })

  it('runs a compatibility-column retry through the same exact fence', async () => {
    const row: Row = {
      id: 'job-1', opportunity_id: 'opp-1', contract_id: 'contract-1', contract_hash: 'hash-1',
      execution_owner: 'worker-a', execution_attempt: 1, execution_lease_expires_at: future(), status: 'pending',
    }
    const db = fakeClient(row, { compatibilityFailures: 1 })
    await runInContentStudioExecution(strictState(), async () => {
      const fenced = fenceStreamContentJobsClient(db.client)
      const first = await fenced.from('content_jobs').update({ status: 'drafting', event_log: [] }).eq('id', 'job-1')
      expect(first.error?.message).toMatch(/event_log/)
      const retry = await fenced.from('content_jobs').update({ status: 'drafting' }).eq('id', 'job-1')
      expect(retry.error).toBeNull()
    })
    expect(row.status).toBe('drafting')
    expect(db.traces).toHaveLength(2)
    for (const trace of db.traces) {
      expect(trace.filters).toEqual(expect.arrayContaining([
        { op: 'eq', key: 'execution_owner', value: 'worker-a' },
        { op: 'eq', key: 'execution_attempt', value: 1 },
      ]))
      expect(trace.filters.some((filter) => filter.op === 'gt' && filter.key === 'execution_lease_expires_at')).toBe(true)
    }
  })

  it('proves an expired/replaced worker cannot alter the replacement worker state', async () => {
    const row: Row = {
      id: 'job-1', opportunity_id: 'opp-1', contract_id: 'contract-1', contract_hash: 'hash-1',
      execution_owner: 'worker-b', execution_attempt: 2, execution_lease_expires_at: future(), status: 'processing',
    }
    const db = fakeClient(row)
    await expect(runInContentStudioExecution(strictState('worker-a', 1), async () => {
      const fenced = fenceStreamContentJobsClient(db.client)
      await fenced.from('content_jobs').update({ status: 'failed' }).eq('id', 'job-1')
    })).rejects.toThrow(/stale execution|owner\/attempt\/lease changed/i)
    expect(row).toEqual(expect.objectContaining({
      execution_owner: 'worker-b', execution_attempt: 2, status: 'processing',
    }))
  })

  it('refuses strict stream inserts rather than creating an unowned sibling row', async () => {
    const row: Row = {
      id: 'job-1', opportunity_id: 'opp-1', contract_id: 'contract-1', contract_hash: 'hash-1',
      execution_owner: 'worker-a', execution_attempt: 1, execution_lease_expires_at: future(), status: 'drafting',
    }
    const db = fakeClient(row)
    await expect(runInContentStudioExecution(strictState(), async () => {
      const fenced = fenceStreamContentJobsClient(db.client)
      fenced.from('content_jobs').insert({ status: 'drafting' })
    })).rejects.toThrow(/may not insert content_jobs/i)
    expect(row.status).toBe('drafting')
  })
})
