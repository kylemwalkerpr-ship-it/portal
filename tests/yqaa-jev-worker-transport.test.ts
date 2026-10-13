import { requestCompanionJev, requestJevAdvisory } from '@/lib/jevAdvisory'

const context = { query: 'How do I find public information?', evidence: [] }
const answers = {
  sufficient: { type: 'noul', noul: 0.95 },
  conflict: { type: 'noul', noul: 0.01 },
  needs_handoff: { type: 'noul', noul: 0.01 },
  market: {
    type: 'choice', choice: 'global', confidence: 0.99,
    probabilities: { usa: 0, canada: 0, uk: 0, australia: 0, global: 1, unknown: 0 },
  },
}

const adapters = [
  ['public', (fetcher: typeof fetch) => requestJevAdvisory(context, fetcher, { apiKey: 'test-key' })],
  ['companion', (fetcher: typeof fetch) => requestCompanionJev({ ...context, postureOptions: ['EDUCATE'] }, fetcher, { apiKey: 'test-key' })],
] as const

describe.each(adapters)('Jev %s Worker transport', (_name, request) => {
  it('reaches the API when the Worker rejects the unsupported error redirect mode', async () => {
    const workerFetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.redirect === 'error') {
        throw new TypeError('Invalid redirect value, must be one of "follow" or "manual"')
      }
      if (init?.redirect !== 'manual') throw new Error('Credentials must never follow redirects')
      return Response.json({ model: 'jev-latest', answers })
    }) as typeof fetch
    await expect(request(workerFetch)).resolves.toMatchObject({ available: true })
  })

  it.each([301, 302, 303, 307, 308])('rejects HTTP %i without forwarding credentials', async (status) => {
    const fetcher = jest.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, {
      status, headers: { Location: 'https://untrusted.invalid/collect' },
    })) as jest.MockedFunction<typeof fetch>
    await expect(request(fetcher)).resolves.toEqual({ available: false, reason: 'network_redirect' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
