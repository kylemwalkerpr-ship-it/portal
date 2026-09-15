const runSeoFactoryPipeline = jest.fn()
const resolvePipelineWritingContract = jest.fn()
let persistedPatch: Record<string, unknown> | null = null
let filters: Record<string, unknown> = {}

jest.mock('@/lib/seoFactory/pipeline', () => ({ runSeoFactoryPipeline: (...args: unknown[]) => runSeoFactoryPipeline(...args) }))
jest.mock('@/lib/seoFactory/pipelineStream', () => ({ runSeoFactoryPipelineStream: jest.fn() }))
jest.mock('@/lib/seoFactory/pipelineContract', () => ({
  resolvePipelineWritingContract: (...args: unknown[]) => resolvePipelineWritingContract(...args),
}))
jest.mock('@/lib/supabase', () => ({
  createSupabaseAdminClient: () => ({
    from: () => {
      const q: any = {
        update: jest.fn((patch: Record<string, unknown>) => { persistedPatch = patch; return q }),
        eq: jest.fn((key:string,value:unknown) => { filters[key]=value; return q }),
        in: jest.fn(() => q), select: jest.fn(() => q),
        maybeSingle: jest.fn(async () => ({ data:{ id:'job-1' }, error:null })),
        single: jest.fn(async () => ({ data:{ audit_json:{} }, error:null })),
      }
      return q
    },
  }),
}))

import {
  markCoherentDeskCompleted,
  markCoherentDeskRunning,
} from '@/lib/seoFactory/contentStudioExecutionContext'
import { runContentStudioPipeline } from '@/lib/seoFactory/contentStudioPipeline'

const contract: any = {
  contractId:'wc_contract_12345678901234567890', contractHash:'a'.repeat(64), contractVersion:2,
  opportunity:{ id:'opp-1' }, evidenceHash:'b'.repeat(64), brief:{}, evidence:[], primaryKeyword:'x', contentType:'legal_guide',
}
const request: any = {
  writingContractRequired:true, existingJobId:'job-1', contractId:contract.contractId,
  contractHash:contract.contractHash, opportunityId:'opp-1', topic:'x', primaryKeyword:'x',
  region:'US', contentType:'legal_guide',
}

beforeEach(() => {
  jest.clearAllMocks(); persistedPatch=null; filters={}
  resolvePipelineWritingContract.mockResolvedValue({ contract, input:request })
})

describe('contract runner failure recovery', () => {
  it('persists the accepted draft and stops at revision_required when a later provider stage fails', async () => {
    runSeoFactoryPipeline.mockImplementation(async () => {
      markCoherentDeskRunning()
      markCoherentDeskCompleted('ACCEPTED DRAFT MUST SURVIVE')
      throw new Error('provider failed after accepted draft')
    })

    await expect(runContentStudioPipeline(request)).rejects.toThrow(/provider failed/i)
    expect(persistedPatch).toEqual(expect.objectContaining({
      status:'failed', execution_stage:'revision_required', content:'ACCEPTED DRAFT MUST SURVIVE',
    }))
    expect(filters).toEqual(expect.objectContaining({
      id:'job-1', opportunity_id:'opp-1', contract_id:contract.contractId, contract_hash:contract.contractHash,
    }))
  })

  it('does not fabricate content when failure occurs before an accepted draft exists', async () => {
    runSeoFactoryPipeline.mockImplementation(async () => {
      markCoherentDeskRunning()
      throw new Error('provider unavailable before draft')
    })
    await expect(runContentStudioPipeline(request)).rejects.toThrow(/provider unavailable/i)
    expect(persistedPatch).toEqual(expect.objectContaining({ status:'failed' }))
    expect(persistedPatch).not.toHaveProperty('content')
  })
})
