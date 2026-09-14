import { describe, expect, it } from '@jest/globals'
import { xaiGrokRouterBaseUrl } from '@/lib/xaiGrokTransport'

/**
 * Regression: the Portal Worker must not route SuperGrok OAuth inference back
 * through its own public custom-domain hostname. Cloudflare can return 522 for
 * same-Worker custom-domain fetches before the xAI subscription proxy is ever
 * reached.
 */
describe('SuperGrok transport routing', () => {
  it('does not default OAuth inference to the Portal custom-domain self-fetch', () => {
    const previous = process.env.XAI_GROK_ROUTER_BASE_URL
    delete process.env.XAI_GROK_ROUTER_BASE_URL
    try {
      expect(xaiGrokRouterBaseUrl()).not.toBe(
        'https://portal.yousafeconsultancy.com/api/internal/xai-grok',
      )
    } finally {
      if (previous == null) delete process.env.XAI_GROK_ROUTER_BASE_URL
      else process.env.XAI_GROK_ROUTER_BASE_URL = previous
    }
  })
})
