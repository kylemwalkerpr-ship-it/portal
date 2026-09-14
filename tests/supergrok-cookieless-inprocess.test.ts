import { readFileSync } from 'node:fs'
import {
  isXaiGrokRouterBaseUrl,
  invokeXaiGrokRouter,
} from '@/lib/xaiGrokRouter'
import { xaiGrokRouterBaseUrl } from '@/lib/xaiGrokTransport'

describe('SuperGrok cookieless Worker transport', () => {
  it('allowlists the internal xAI shim in Clerk middleware so Bearer callers are not rejected as anonymous', () => {
    const middleware = readFileSync('middleware.ts', 'utf8')
    expect(middleware).toMatch(/\/api\/internal\/xai-grok\(\.\*\)/)
    expect(middleware).toMatch(/mandatory Bearer|Bearer OAuth|cookieless/i)
  })

  it('detects the Portal-owned router base URL', () => {
    expect(isXaiGrokRouterBaseUrl(xaiGrokRouterBaseUrl())).toBe(true)
    expect(isXaiGrokRouterBaseUrl('https://api.x.ai/v1')).toBe(false)
    expect(isXaiGrokRouterBaseUrl('https://example.com/api/internal/xai-grok')).toBe(true)
  })

  it('Content Studio prefers in-process router invocation over public self-fetch', () => {
    const source = readFileSync('lib/contentAiProvider.ts', 'utf8')
    expect(source).toMatch(/invokeXaiGrokRouter/)
    expect(source).toMatch(/async function grokRouterFetch/)
    expect(source).toMatch(/grokRouterFetch\(\s*'responses'/)
  })

  it('Messenger auth reuses overlayGrokAuth so SuperGrok uses the same router as Studio', () => {
    const source = readFileSync('lib/messengerAi.ts', 'utf8')
    expect(source).toMatch(/overlayGrokAuth/)
    expect(source).toMatch(/invokeXaiGrokRouter/)
    expect(source).toMatch(/forceRefreshSuperGrokAccessToken/)
  })

  it('rejects anonymous in-process router calls without a Bearer credential', async () => {
    const response = await invokeXaiGrokRouter({
      method: 'POST',
      path: 'responses',
      body: JSON.stringify({ model: 'grok-4.6', input: [] }),
    })
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({ error: 'Missing xAI bearer credential' })
  })
})
