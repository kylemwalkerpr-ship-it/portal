import {
  decodeJwtSubject,
  grokInferenceBaseUrl,
  isPortalGrokSelfShimUrl,
  isXaiDeveloperApiKey,
  superGrokProxyHeaders,
  XAI_CLI_CHAT_PROXY_BASE_URL,
  XAI_GROK_CLIENT_VERSION,
  XAI_PUBLIC_API_BASE_URL,
  xaiUpstreamBaseForToken,
} from '@/lib/xaiGrokTransport'

describe('xAI Grok transport routing', () => {
  it('keeps developer API keys on api.x.ai', () => {
    expect(isXaiDeveloperApiKey('xai-team-key')).toBe(true)
    expect(xaiUpstreamBaseForToken('xai-team-key')).toBe(XAI_PUBLIC_API_BASE_URL)
  })

  it('routes OAuth session tokens through the Grok CLI subscription proxy only as a last-resort upstream', () => {
    expect(isXaiDeveloperApiKey('eyJ.oauth.jwt')).toBe(false)
    expect(xaiUpstreamBaseForToken('eyJ.oauth.jwt')).toBe(XAI_CLI_CHAT_PROXY_BASE_URL)
  })

  it('sends SuperGrok inference to api.x.ai like YQAA, never the Portal self-shim', () => {
    expect(grokInferenceBaseUrl('oauth-session-token')).toBe(XAI_PUBLIC_API_BASE_URL)
    expect(grokInferenceBaseUrl(
      'oauth-session-token',
      'https://portal.yousafeconsultancy.com/api/internal/xai-grok',
    )).toBe(XAI_PUBLIC_API_BASE_URL)
    expect(isPortalGrokSelfShimUrl('https://portal.yousafeconsultancy.com/api/internal/xai-grok/responses')).toBe(true)
  })

  it('rewrites a leftover Portal self-shim URL even for developer keys', () => {
    expect(grokInferenceBaseUrl('xai-team-key', 'https://api.x.ai/v1')).toBe(XAI_PUBLIC_API_BASE_URL)
    expect(grokInferenceBaseUrl(
      'xai-team-key',
      'https://portal.yousafeconsultancy.com/api/internal/xai-grok',
    )).toBe(XAI_PUBLIC_API_BASE_URL)
  })

  it('sends the client metadata required by the subscription proxy', () => {
    const headers = superGrokProxyHeaders('grok-4.6')
    expect(headers['X-XAI-Token-Auth']).toBe('xai-grok-cli')
    expect(headers['x-authenticateresponse']).toBe('authenticate-response')
    expect(headers['x-grok-client-version']).toBe(XAI_GROK_CLIENT_VERSION)
    expect(headers['x-grok-client-identifier']).toBe('grok-shell')
    expect(headers['x-grok-client-mode']).toBe('headless')
    expect(headers['x-grok-model-override']).toBe('grok-4.6')
  })

  it('can recover the OAuth subject for the proxy user headers', () => {
    const encode = (value: object) => Buffer.from(JSON.stringify(value))
      .toString('base64url')
    const token = `${encode({ alg: 'none' })}.${encode({ sub: 'user-123' })}.signature`
    expect(decodeJwtSubject(token)).toBe('user-123')
    expect(decodeJwtSubject('not-a-jwt')).toBeNull()
  })
})
