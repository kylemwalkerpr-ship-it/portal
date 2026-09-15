import { NextRequest } from 'next/server'

const runThroughline = jest.fn()
const runFactoryMaskedDenoise = jest.fn()
const loadWritingContract = jest.fn()
const claimContentStudioExecution = jest.fn()
const assertContentStudioExecution = jest.fn()
const releaseContentStudioExecution = jest.fn()
let updatePatch: Record<string, unknown> | null = null
let filters: Record<string, unknown> = {}

jest.mock('@/lib/portalAuth', () => ({ requireAdminUser: jest.fn(async () => ({ profileId:'admin-1' })) }))
jest.mock('@/lib/seoFactory/throughline', () => ({ runThroughline: (...args: unknown[]) => runThroughline(...args) }))
jest.mock('@/lib/seoFactory/maskedDenoise', () => ({ runFactoryMaskedDenoise: (...args: unknown[]) => runFactoryMaskedDenoise(...args) }))
jest.mock('@/lib/contentAiProvider', () => ({ generateContentText: jest.fn() }))
jest.mock('@/lib/seoFactory/writingContractStore', () => ({
  WritingContractMismatchError: class WritingContractMismatchError extends Error {},
  runWithContentStudioRecoveryClaim: (fn: () => unknown) => fn(),
  loadWritingContract: (...args: unknown[]) => loadWritingContract(...args),
  claimContentStudioExecution: (...args: unknown[]) => claimContentStudioExecution(...args),
  assertContentStudioExecution: (...args: unknown[]) => assertContentStudioExecution(...args),
  releaseContentStudioExecution: (...args: unknown[]) => releaseContentStudioExecution(...args),
}))
jest.mock('@/lib/supabase', () => ({
  createSupabaseAdminClient: () => ({
    from: () => {
      const q: any = {
        select: jest.fn(() => q),
        update: jest.fn((patch:Record<string,unknown>) => { updatePatch=patch; return q }),
        eq: jest.fn((key:string,value:unknown) => { filters[key]=value; return q }),
        gt: jest.fn((key:string,value:unknown) => { filters[key]=value; return q }),
        single: jest.fn(async () => ({ data:{
          id:'job-1', content:ACCEPTED, audit_json:{ shipReady:true }, opportunity_id:'opp-1',
          contract_id:'wc_1', contract_version:2, contract_hash:'hash-1', evidence_hash:'evidence-1',
        }, error:null })),
        maybeSingle: jest.fn(async () => ({ data:{id:'job-1'}, error:null })),
      }
      return q
    },
  }),
}))

const ACCEPTED = Array.from({length:70}, (_,i)=>`word${i}`).join(' ')
const CONTRACT: any = {
  contractId:'wc_1', contractHash:'hash-1', contractVersion:2, evidenceHash:'evidence-1',
  opportunity:{id:'opp-1', jurisdiction:'US'}, contentType:'legal_guide', primaryKeyword:'F-1 OPT timing',
  brief:{ thesis:'F-1 students must plan OPT timing around the filing window and their program completion date.' },
  queryCoverage:{ requiredShortKeywords:[], requiredLongTailKeywords:[], shortKeywordTerms:[], longTailKeywordTerms:[] },
  wordBudget:{ minWords:40, targetWords:70, maxWords:200 },
  ownership:{ host:'legal', repo:'caseworks', filePath:'app/opt/page.tsx', canonicalUrl:'https://legal.yousafeconsultancy.com/opt/' },
  requestedModel:null,
}

beforeEach(() => {
  jest.clearAllMocks(); updatePatch=null; filters={}
  loadWritingContract.mockResolvedValue(CONTRACT)
  claimContentStudioExecution.mockResolvedValue({
    owner:'revision-owner', attempt:3, leaseExpiresAt:new Date(Date.now()+900_000).toISOString(),
  })
  assertContentStudioExecution.mockResolvedValue(undefined)
  releaseContentStudioExecution.mockResolvedValue(true)
})

describe('POST /api/content-studio/author-revise contracted revision', () => {
  it('returns the accepted draft unchanged and records revision_required when candidate is rejected', async () => {
    runThroughline.mockResolvedValue({ rejected:true, reason:'changed material amount', content:'DAMAGING CANDIDATE' })
    const { POST } = await import('@/app/api/content-studio/author-revise/route')
    const res = await POST(new NextRequest('http://localhost/api/content-studio/author-revise', {
      method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({
        jobId:'job-1', contractId:'wc_1', contractHash:'hash-1', content:ACCEPTED,
      }),
    }))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.content).toBe(ACCEPTED)
    expect(body.rejected).toBe(true)
    expect(runFactoryMaskedDenoise).not.toHaveBeenCalled()
    expect(updatePatch).toEqual(expect.objectContaining({ execution_stage:'revision_required' }))
    expect(filters).toEqual(expect.objectContaining({
      id:'job-1', opportunity_id:'opp-1', contract_id:'wc_1', contract_hash:'hash-1',
      execution_owner:'revision-owner', execution_attempt:3,
    }))
    expect(assertContentStudioExecution).toHaveBeenCalled()
    expect(releaseContentStudioExecution).toHaveBeenCalledWith(expect.anything(), {
      jobId:'job-1', owner:'revision-owner', attempt:3,
    })
  })

  it('rejects a stale client draft before claiming a revision lease or model stage', async () => {
    const { POST } = await import('@/app/api/content-studio/author-revise/route')
    const res = await POST(new NextRequest('http://localhost/api/content-studio/author-revise', {
      method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({
        jobId:'job-1', contractId:'wc_1', contractHash:'hash-1', content:'stale draft from another tab',
      }),
    }))
    expect(res.status).toBe(409)
    expect(runThroughline).not.toHaveBeenCalled()
    expect(claimContentStudioExecution).not.toHaveBeenCalled()
  })

  it('rejects a client review model that conflicts with the immutable contract model', async () => {
    loadWritingContract.mockResolvedValueOnce({ ...CONTRACT, requestedModel:'grok' })
    const { POST } = await import('@/app/api/content-studio/author-revise/route')
    const res = await POST(new NextRequest('http://localhost/api/content-studio/author-revise', {
      method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({
        jobId:'job-1', contractId:'wc_1', contractHash:'hash-1', content:ACCEPTED, reviewModel:'openai',
      }),
    }))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual(expect.objectContaining({ error:expect.stringMatching(/review model conflicts/i) }))
    expect(claimContentStudioExecution).not.toHaveBeenCalled()
  })
})