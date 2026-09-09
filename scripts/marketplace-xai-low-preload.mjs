const nativeFetch = globalThis.fetch.bind(globalThis)

/**
 * One-time Marketplace migration shim.
 *
 * The legacy rewrite script already knows how to call xAI Chat Completions,
 * but predates Grok 4.6 reasoning controls. When the migration runner selects
 * SuperGrok OAuth, preload this module so every xAI chat request explicitly
 * uses low reasoning. No credentials are logged or persisted here.
 */
globalThis.fetch = async function marketplaceXaiLowReasoningFetch(input, init = undefined) {
  const url = typeof input === 'string' ? input : String(input?.url || input || '')
  if (
    url.includes('api.x.ai') &&
    url.includes('/chat/completions') &&
    typeof init?.body === 'string'
  ) {
    try {
      const body = JSON.parse(init.body)
      if (String(body?.model || '').startsWith('grok-4.')) {
        body.reasoning_effort = String(process.env.MARKETPLACE_XAI_REASONING || 'low')
        return nativeFetch(input, { ...init, body: JSON.stringify(body) })
      }
    } catch {
      // If the body is not JSON, leave the original request untouched.
    }
  }
  return nativeFetch(input, init)
}
