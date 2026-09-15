const mockJsonRunner = jest.fn(async () => ({
  ok: true, content: 'accepted content', plan: {}, audit: {}, ship: null, shipError: null,
  shipMode: 'none', provider: 'test-provider', model: 'test-model', attempts: 1,
  gsc: { source: 'none', mode: 'none', primaryKeywords: [], opportunityKeywords: [], warnings: [] },
  jobId: 'job-1',
}))
const mockRawStream = jest.fn(async function* () {
  throw new Error('raw stream persistence must not run for contracted SSE')
})

jest.mock('@/lib/seoFactory/contentStudioPipelineCore', () => ({
  runContentStudioPipeline: (input: any) => mockJsonRunner(input),
  runContentStudioPipelineStream: (input: any) => mockRawStream(input),
}))
jest.mock('@/lib/seoFactory/writingContractStore', () => ({
  runWithContentStudioRecoveryClaim: (fn: () => any) => fn(),
}))

import { runContentStudioPipelineStream } from '@/lib/seoFactory/contentStudioPipeline'

describe('contracted SSE persistence boundary', () => {
  it('uses the fenced JSON producer instead of the legacy stream with raw early job updates', async () => {
    const events: any[] = []
    for await (const event of runContentStudioPipelineStream({ existingJobId: 'job-1' } as any)) events.push(event)
    expect(mockRawStream).not.toHaveBeenCalled()
    expect(mockJsonRunner).toHaveBeenCalledWith(expect.objectContaining({ existingJobId: 'job-1' }))
    expect(events.some((event) => event.type === 'job' && event.jobId === 'job-1')).toBe(true)
    expect(events.some((event) => event.type === 'final' && event.result.jobId === 'job-1')).toBe(true)
  })
})
