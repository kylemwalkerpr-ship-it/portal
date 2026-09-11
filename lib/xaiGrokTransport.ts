/**
 * xAI transport routing for the two different Grok credential products.
 *
 * SuperGrok / Grok subscription OAuth tokens are session credentials and must
 * be sent through the Grok CLI chat proxy. Developer `xai-...` API keys remain
 * on the metered public API. Keeping this distinction in one module prevents a
 * valid SuperGrok session from being charged/evaluated as API-team spend.
 */

export const XAI_PUBLIC_API_BASE_URL = 'https://api.x.ai/v1'
export const XAI_CLI_CHAT_PROXY_BASE_URL = 'https://cli-chat-proxy.grok.com/v1'

/**
 * Current lockstep Grok Build / Grok CLI client version. The subscription
 * proxy enforces a minimum client version and returns HTTP 426 when omitted or
 * stale. Keep this pinned to a released xai-org/grok-build version.
 */
export const XAI_GROK_CLIENT_VERSION = '1.0.24'

export const XAI_GROK_TOKEN_AUTH = 'xai-grok-cli'
export const XAI_GROK_CLIENT_IDENTIFIER = 'grok-shell'
export const XAI_GROK_CLIENT_MODE = 'headless'

/**
 * Portal-owned transport shim. Server-side callers keep using the normal
 * OpenAI-compatible `/responses` and `/chat/completions` paths; this shim
 * decides whether to forward to the SuperGrok subscription proxy or the
 * developer API based on the credential type and injects the required CLI
 * metadata only for subscription OAuth traffic.
 */
export const XAI_GROK_ROUTER_BASE_URL_DEFAULT =
  'https://portal.yousafeconsultancy.com/api/internal/xai-grok'

export function xaiGrokRouterBaseUrl(): string {
  return (
    process.env.XAI_GROK_ROUTER_BASE_URL?.trim() ||
    XAI_GROK_ROUTER_BASE_URL_DEFAULT
  ).replace(/\/+$/, '')
}

export function isXaiDeveloperApiKey(token: string): boolean {
  return /^xai-/i.test(String(token || '').trim())
}

export function xaiUpstreamBaseForToken(token: string): string {
  return isXaiDeveloperApiKey(token)
    ? XAI_PUBLIC_API_BASE_URL
    : XAI_CLI_CHAT_PROXY_BASE_URL
}

export function decodeJwtSubject(token: string): string | null {
  const parts = String(token || '').split('.')
  if (parts.length !== 3) return null
  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const raw = typeof atob === 'function'
      ? atob(padded)
      : Buffer.from(padded, 'base64').toString('binary')
    const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0))
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as { sub?: unknown }
    return typeof payload.sub === 'string' && payload.sub.trim() ? payload.sub.trim() : null
  } catch {
    return null
  }
}

export function superGrokProxyHeaders(model?: string | null): Record<string, string> {
  const resolvedModel = String(model || '').trim() || 'grok-4.6'
  return {
    'X-XAI-Token-Auth': XAI_GROK_TOKEN_AUTH,
    'x-authenticateresponse': 'authenticate-response',
    'x-grok-client-version': XAI_GROK_CLIENT_VERSION,
    'x-grok-client-identifier': XAI_GROK_CLIENT_IDENTIFIER,
    'x-grok-client-mode': XAI_GROK_CLIENT_MODE,
    'x-grok-model-override': resolvedModel,
  }
}
