export const YQAA_LIVE_WEB_SOURCE_KEYS = new Set([
  'xai:web_search',
  'cloudflare:browser_search',
])

export function isYqaaLiveWebSourceKey(value: unknown): boolean {
  return typeof value === 'string' && YQAA_LIVE_WEB_SOURCE_KEYS.has(value)
}
