import { describe, expect, it } from '@jest/globals'
import { isRetryableProviderFailure } from '@/lib/contentAiProvider'

describe('SuperGrok 522 retry classification', () => {
  it('treats Cloudflare 522 as a transient provider transport failure', () => {
    expect(
      isRetryableProviderFailure(
        new Error('grok 522: SuperGrok subscription proxy timed out before xAI returned a result'),
      ),
    ).toBe(true)
  })
})
