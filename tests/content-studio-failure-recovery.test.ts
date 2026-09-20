const runSeoFactoryPipeline = jest.fn()
const resolvePipelineWritingContract = jest.fn()
const resolveOwner = jest.fn()
let persistedPatch: Record<string, unknown> | null = null
let filters: Record<string, unknown> = {}
let lease = { owner: '', attempt: 0, expiresAt: '' }

jest.mock('@/lib/seoFactory/pipeline', () => ({ runSeoFactoryPipeline: (...args: unknown[]) => runSeoFactoryPipeline(...args) }))
jest.mock('@/lib/seoFactory/pipelineStream', () => ({ runSeoFactoryPipelineStream: jest.fn() }))
jest.mock('@/lib/seoFactory/pipelineContract', () => ({
  resolvePipelineWritingContract: (...args: unknown[]) => resolvePipelineWritingContract(...args),
}))
jest.mock('@/lib/seoFactory/ownership', () => {
  const actual = jest.requireActual('@/lib/seoFactory/ownership')
  return { ...actual, resolveOwner: (...args: unknown[]) => resolveOwner(...args) }
})
jest.mock('@/lib/seoFactory/broadCreateFreeze', () => ({
  assertBroadCreateDestinationAllowed: jest.fn(async () => undefined),
}))

jest.mock('@/lib/supabase', () => ({
  createSupabaseAdminClient: () => ({
    rpc: jest.fn(async (fn:string,args:Record<string,any>) => {
      if (fn === 'claim_content_studio_execution') {
        lease.owner = String(args.p_execution_owner)
        lease.attempt += 1
        lease.expiresAt = new Date(Date.now() + 900_000).toISOString()
        return { data:[{ execution_owner:lease.owner, execution_attempt:lease.attempt, execution_lease_expires_at:lease.expiresAt }], error:null }
      }
      if (fn === 'check_content_studio_execution') {
        return { data: lease.owner === args.p_execution_owner && lease.attempt === args.p_execution_attempt, error:null }
      }
      if (fn === 'renew_content_studio_execution') {
        return { data:[{ execution_lease_expires_at:lease.expiresAt }], error:null }
      }
      if (fn === 'release_content_studio_execution') return { data:true, error:null }
      throw new Error(`unexpected rpc ${fn}`)
    }),
    from: () => {
      const q: any = {
        update: jest.fn((patch: Record<string, unknown>) => { persistedPatch = patch; return q }),
        eq: jest.fn((key:string,value:unknown) => { filters[key]=value; return q }),
        gt: jest.fn(() => q),
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

const ownership = {
  host:'legal', repo:'caseworks', filePath:'app/x/page.tsx', canonicalUrl:'https://legal.yousafeconsultancy.com/x/',
}
const contract: any = {
  contractId:'wc_contract_12345678901234567890', contractHash:'a'.repeat(64), contractVersion:2,
  opportunity:{ id:'opp-1', jurisdiction:'US' }, evidenceHash:'b'.repeat(64),
  brief:{ thesis:'A supported thesis', takeaways:[], faqQuestions:[], lede:'Supported lede', unresolved:[], outline:[] },
  evidence:[], primaryKeyword:'x', contentType:'legal_guide', ownership,
  metadata:{ targetSlug:'x', title:'X' }, requestedModel:null,
}
const request: any = {
  writingContractRequired:true, existingJobId:'job-1', contractId:contract.contractId,
  contractHash:contract.contractHash, opportunityId:'opp-1', topic:'x', primaryKeyword:'x',
  region:'US', contentType:'legal_guide',
}

beforeEach(() => {
  jest.clearAllMocks(); persistedPatch=null; filters={}; lease={ owner:'', attempt:0, expiresAt:'' }
  resolvePipelineWritingContract.mockResolvedValue({ contract, input:request })
  resolveOwner.mockResolvedValue({ ...ownership, blockers:[], warnings:[], indexable:true, contentType:'legal_guide', action:'expand', routingSource:'registry_owner_url', matched:{ id:1, owner_url:ownership.canonicalUrl, status:'confirmed', action:'expand', notes:'' } })
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
      execution_owner:expect.any(String), execution_attempt:1,
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
