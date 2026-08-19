/**
 * Base-URL hardening — a provider base-URL override that isn't an http(s) URL
 * must fall back to the provider's known-good endpoint instead of producing a
 * fetch "Invalid URL" (2026-08: Baseten shipped
 * "Invalid URL: <key>/chat/completions" when BASETEN_BASE_URL held a pasted
 * key rather than a URL).
 */
import {
  getBasetenProvider,
  getBasetenDeepseekProProvider,
  getBasetenGlmFastProvider,
} from '@/lib/contentAiProvider'

describe('content AI · base URL hardening', () => {
  const keys = ['BASETEN_API_KEY', 'BASETEN_BASE_URL'] as const
  const saved: Record<string, string | undefined> = {}

  beforeAll(() => {
    for (const k of keys) saved[k] = process.env[k]
  })

  afterEach(() => {
    for (const k of keys) {
      if (saved[k] == null) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  it('falls back to the known-good Baseten endpoint when BASETEN_BASE_URL is not a URL', () => {
    process.env.BASETEN_API_KEY = 'test-baseten-key'
    process.env.BASETEN_BASE_URL = 'isHSjNYZ.am3yEGVZDgBG6oPqgvfScTvRde9SulMZ'

    expect(getBasetenProvider()?.baseURL).toBe('https://inference.baseten.co/v1')
    expect(getBasetenDeepseekProProvider()?.baseURL).toBe('https://inference.baseten.co/v1')
    expect(getBasetenGlmFastProvider()?.baseURL).toBe('https://inference.baseten.co/v1')
  })

  it('honors a valid https override and strips the trailing slash', () => {
    process.env.BASETEN_API_KEY = 'test-baseten-key'
    process.env.BASETEN_BASE_URL = 'https://inference.baseten.co/v1/'

    expect(getBasetenProvider()?.baseURL).toBe('https://inference.baseten.co/v1')
  })
})
