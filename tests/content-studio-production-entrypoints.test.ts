import { NextRequest } from 'next/server'

jest.mock('@/lib/portalAuth', () => ({ requireAdminUser: jest.fn(async () => ({ profileId:'admin-1' })) }))
jest.mock('@/lib/seoFactory/masterEngineFeed', () => ({ assembleMasterEngineFeed: jest.fn() }))
jest.mock('@/lib/seoFactory/pipeline', () => ({ runSeoFactoryPipeline: jest.fn() }))
jest.mock('@/lib/seoFactory/contentStudioPipeline', () => ({
  runContentStudioPipeline: jest.fn(),
  runContentStudioPipelineStream: jest.fn(),
}))
jest.mock('@/app/api/seo-factory/generate-stream/legacy', () => ({ POST: jest.fn() }))

function mocks() {
  const contract = jest.requireMock('@/lib/seoFactory/contentStudioPipeline') as {
    runContentStudioPipeline: jest.Mock
    runContentStudioPipelineStream: jest.Mock
  }
  const raw = jest.requireMock('@/lib/seoFactory/pipeline') as { runSeoFactoryPipeline: jest.Mock }
  const engine = jest.requireMock('@/lib/seoFactory/masterEngineFeed') as { assembleMasterEngineFeed: jest.Mock }
  const legacy = jest.requireMock('@/app/api/seo-factory/generate-stream/legacy') as { POST: jest.Mock }
  return { ...contract, raw:raw.runSeoFactoryPipeline, engine:engine.assembleMasterEngineFeed, legacy:legacy.POST }
}

const RESULT: any = {
  ok:true, content:'accepted draft', jobId:'job-1', provider:'test', model:'test-model', attempts:1,
  plan:{ host:'legal', repo:'caseworks', filePath:'app/us/x/page.tsx', canonicalUrl:'https://legal.yousafeconsultancy.com/us/x/', blockers:[], ymy:false, contentType:'legal_guide' },
  audit:{ score:90, grade:'A', wordCount:1000, blockers:[], warnings:[] }, ship:null, shipError:null, shipMode:'pr',
  gsc:{ source:'none', mode:'none', primaryKeywords:[], opportunityKeywords:[], warnings:[] },
}

beforeEach(() => {
  const m = mocks()
  m.runContentStudioPipeline.mockReset()
  m.runContentStudioPipelineStream.mockReset()
  m.raw.mockReset(); m.engine.mockReset(); m.legacy.mockReset()
})

function contractedBody(extra: Record<string, unknown> = {}) {
  return {
    topic:'F-1 OPT timing', jobId:'job-1', contractId:'wc_12345678901234567890',
    contractHash:'a'.repeat(64), contractVersion:2, evidenceHash:'b'.repeat(64),
    opportunityId:'opp-1', writingContractRequired:true, ...extra,
  }
}

describe('contract-bound JSON production route', () => {
  it('returns conflict before raw generation when contract/evidence validation rejects', async () => {
    const m = mocks()
    m.runContentStudioPipeline.mockRejectedValue(new Error('evidence payload mismatch'))
    const { POST } = await import('@/app/api/seo-factory/generate/route')
    const req = new NextRequest('http://localhost/api/seo-factory/generate', {
      method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(contractedBody({ evidenceHash:'tampered' })),
    })
    const res = await POST(req)
    expect(res.status).toBe(409)
    expect(m.runContentStudioPipeline).toHaveBeenCalledTimes(1)
    expect(m.raw).not.toHaveBeenCalled()
    expect(m.engine).not.toHaveBeenCalled()
  })

  it('uses only the saved-contract runner for valid contracted JSON work', async () => {
    const m = mocks(); m.runContentStudioPipeline.mockResolvedValue(RESULT)
    const { POST } = await import('@/app/api/seo-factory/generate/route')
    const res = await POST(new NextRequest('http://localhost/api/seo-factory/generate', {
      method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(contractedBody()),
    }))
    expect(res.status).toBe(200)
    expect(m.runContentStudioPipeline).toHaveBeenCalledTimes(1)
    expect(m.raw).not.toHaveBeenCalled()
    expect(m.engine).not.toHaveBeenCalled()
  })
})

describe('Content Studio compatibility JSON route', () => {
  it('rejects an uncontracted request instead of exposing the raw pipeline', async () => {
    const m = mocks()
    const { POST } = await import('@/app/api/content-studio/generate/route')
    const res = await POST(new NextRequest('http://localhost/api/content-studio/generate', {
      method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ topic:'F-1 OPT timing' }),
    }))
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ ok:false })
    expect(m.runContentStudioPipeline).not.toHaveBeenCalled()
    expect(m.raw).not.toHaveBeenCalled()
  })

  it('runs valid Content Studio requests only through the contract runner', async () => {
    const m = mocks(); m.runContentStudioPipeline.mockResolvedValue(RESULT)
    const { POST } = await import('@/app/api/content-studio/generate/route')
    const res = await POST(new NextRequest('http://localhost/api/content-studio/generate', {
      method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(contractedBody()),
    }))
    expect(res.status).toBe(200)
    expect(m.runContentStudioPipeline).toHaveBeenCalledTimes(1)
    expect(m.raw).not.toHaveBeenCalled()
  })
})

describe('contract-bound SSE production route', () => {
  it('surfaces provider failure as an SSE error without falling back to legacy transport', async () => {
    const m = mocks()
    m.runContentStudioPipelineStream.mockImplementation(() => (async function* () {
      throw new Error('provider cascade exhausted')
    })())
    const { POST } = await import('@/app/api/seo-factory/generate-stream/route')
    const res = await POST(new Request('http://localhost/api/seo-factory/generate-stream', {
      method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(contractedBody()),
    }))
    const text = await res.text()
    expect(text).toMatch(/provider cascade exhausted/)
    expect(text).toContain('[DONE]')
    expect(m.legacy).not.toHaveBeenCalled()
  })

  it('cancels the same iterator and abort signal instead of starting isolated authorship', async () => {
    const m = mocks()
    const returnSpy = jest.fn(async () => ({ done:true, value:undefined }))
    let calls = 0
    let capturedSignal: AbortSignal | undefined
    const iterator: any = {
      [Symbol.asyncIterator]() { return this },
      next: jest.fn(() => {
        calls++
        if (calls === 1) return Promise.resolve({ done:false, value:{ type:'progress', stage:'generate', message:'drafting' } })
        return new Promise(() => {})
      }),
      return: returnSpy,
    }
    m.runContentStudioPipelineStream.mockImplementation((input: any) => { capturedSignal = input.signal; return iterator })
    const { POST } = await import('@/app/api/seo-factory/generate-stream/route')
    const res = await POST(new Request('http://localhost/api/seo-factory/generate-stream', {
      method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(contractedBody()),
    }))
    const reader = res.body!.getReader()
    await reader.read()
    await reader.read()
    await reader.cancel()
    await Promise.resolve()
    expect(returnSpy).toHaveBeenCalled()
    expect(capturedSignal?.aborted).toBe(true)
    expect(m.legacy).not.toHaveBeenCalled()
  })
})
