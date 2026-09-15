jest.mock('@/lib/portalAuth', () => ({
  requireAdminUser: jest.fn(async () => ({ profileId: 'admin-1', profile: { clerk_user_id: 'admin-1' } })),
}))
jest.mock('@/lib/supabase', () => ({ createSupabaseAdminClient: jest.fn() }))
jest.mock('@/lib/seoFactory/pipelineContract', () => {
  const actual = jest.requireActual('@/lib/seoFactory/pipelineContract')
  return { ...actual, resolvePipelineWritingContract: jest.fn() }
})
jest.mock('@/lib/seoFactory/pipeline', () => ({ runSeoFactoryPipeline: jest.fn() }))
jest.mock('@/lib/seoFactory/pipelineStream', () => ({ runSeoFactoryPipelineStream: jest.fn() }))
jest.mock('@/lib/seoFactory/ownership', () => ({ resolveOwner: jest.fn() }))
jest.mock('@/app/api/seo-factory/generate-stream/legacy', () => ({ POST: jest.fn() }))

import { createSupabaseAdminClient } from '@/lib/supabase'
import { resolvePipelineWritingContract } from '@/lib/seoFactory/pipelineContract'
import { runSeoFactoryPipelineStream } from '@/lib/seoFactory/pipelineStream'
import { resolveOwner } from '@/lib/seoFactory/ownership'
import { markCoherentDeskCompleted, markCoherentDeskRunning } from '@/lib/seoFactory/contentStudioExecutionContext'
import { POST } from '@/app/api/seo-factory/generate-stream/route'
import { POST as legacyPOST } from '@/app/api/seo-factory/generate-stream/legacy'

const jobId = '00000000-0000-0000-0000-000000000011'
const ownership = {
  host: 'legal',
  repo: 'caseworks',
  filePath: 'app/us/f1-opt-timing/page.tsx',
  canonicalUrl: 'https://legal.yousafeconsultancy.com/us/f1-opt-timing/',
}
const contract = {
  contractId: 'contract-ui-1',
  contractHash: 'contract-hash-ui-1',
  opportunity: { id: 'opp-ui-1', jurisdiction: 'US' },
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
  evidence: [], evidenceHash: 'evidence-ui-1', sourceHealth: {}, researchGaps: [], researchRunId: 'run-ui-1',
  requestedModel: null, contractVersion: 1, createdAt: '2026-09-15T00:00:00.000Z',
} as any

function makeDb() {
  let owner: string | null = null
  let attempt = 0
  let expiresAt: string | null = null
  const db: any = {
    rpc: jest.fn(async (fn: string, args: Record<string, any>) => {
      if (fn === 'claim_content_studio_execution') {
        owner = String(args.p_execution_owner)
        attempt += 1
        expiresAt = new Date(Date.now() + 900_000).toISOString()
        return { data: [{ execution_owner: owner, execution_attempt: attempt, execution_lease_expires_at: expiresAt }], error: null }
      }
      if (fn === 'renew_content_studio_execution') {
        const valid = owner === args.p_execution_owner && attempt === args.p_execution_attempt
        return { data: valid ? [{ execution_lease_expires_at: expiresAt }] : [], error: null }
      }
      if (fn === 'check_content_studio_execution') {
        return { data: owner === args.p_execution_owner && attempt === args.p_execution_attempt, error: null }
      }
      return { data: false, error: null }
    }),
    from: jest.fn(() => {
      let selected = ''
      const q: any = {}
      q.select = jest.fn((value: string) => { selected = value; return q })
      for (const method of ['update', 'eq', 'in', 'gt']) q[method] = jest.fn(() => q)
      q.maybeSingle = jest.fn(async () => {
        if (selected === 'contract_id') return { data: { contract_id: contract.contractId }, error: null }
        if (selected === 'audit_json') return { data: { id: jobId, audit_json: {} }, error: null }
        return { data: { id: jobId }, error: null }
      })
      return q
    }),
  }
  return db
}

describe('normal Studio UI contract boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
    jest.mocked(createSupabaseAdminClient).mockReturnValue(makeDb())
    jest.mocked(resolveOwner).mockResolvedValue({ ...ownership, blockers: [], warnings: [], indexable: true, contentType: contract.contentType } as any)
    jest.mocked(resolvePipelineWritingContract).mockImplementation(async (input: any) => ({
      input: {
        ...input,
        writingContractRequired: true,
        existingJobId: jobId,
        topic: contract.reader.primaryQuestion,
        title: contract.metadata.title,
        primaryKeyword: contract.primaryKeyword,
        region: 'US',
        contentType: contract.contentType,
      },
      contract,
    }))
    jest.mocked(runSeoFactoryPipelineStream).mockImplementation(async function* () {
      markCoherentDeskRunning()
      yield { type: 'progress', stage: 'draft', message: 'contract-bound draft started' } as any
      markCoherentDeskCompleted('accepted content')
      yield {
        type: 'final',
        result: {
          jobId,
          model: 'test-model',
          provider: 'test-provider',
          content: 'accepted content',
          audit: { blockers: [] },
          ship: null,
          shipError: null,
        },
      } as any
    })
  })

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
  })

  test('existingJobId alone is enough to require the persisted writing contract', async () => {
    const request = new Request('http://localhost/api/seo-factory/generate-stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        existingJobId: jobId,
        topic: contract.reader.primaryQuestion,
        title: contract.metadata.title,
        primaryKeyword: contract.primaryKeyword,
        region: 'US',
        contentType: contract.contentType,
        // Deliberately no contractId, contractHash, or writingContractRequired.
      }),
    })

    const response = await POST(request)
    expect(response.status).toBe(200)
    const text = await response.text()
    expect(text).toContain('Contract verified')
    expect(text).toContain('contract-bound draft started')
    expect(text).toContain('"type":"final"')
    expect(jest.mocked(legacyPOST)).not.toHaveBeenCalled()
    expect(jest.mocked(resolvePipelineWritingContract)).toHaveBeenCalledWith(expect.objectContaining({
      existingJobId: jobId,
      writingContractRequired: true,
    }))
  })
})
