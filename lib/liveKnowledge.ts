/**
 * Fetches the live central knowledge supplement maintained on the main
 * YouSafe site. The fetch is deliberately bounded: live knowledge is a
 * supplement, so a slow marketing origin must never hold the assistant open.
 */

const DEFAULT_URL = 'https://yousafeconsultancy.com/assistant-knowledge.json'
const CACHE_TTL_SECONDS = 300
const LIVE_FETCH_TIMEOUT_MS = 1_200
const NEGATIVE_CACHE_MS = 20_000

type LiveKbPayload = {
  version?: string
  markdown?: string
  sections?: Array<{ title?: string; body?: string }>
}

type LiveCache = {
  value: string | null
  expiresAt: number
}

let liveCache: LiveCache | null = null
let liveInFlight: Promise<string | null> | null = null

function parsePayload(data: LiveKbPayload): string | null {
  if (typeof data.markdown === 'string' && data.markdown.trim().length > 0) {
    return data.markdown.trim()
  }

  if (Array.isArray(data.sections)) {
    const merged = data.sections
      .map(section => {
        const title = section?.title?.trim()
        const body = section?.body?.trim()
        if (!body) return null
        return title ? `## ${title}\n${body}` : body
      })
      .filter((s): s is string => Boolean(s))
      .join('\n\n')
    if (merged.length > 0) return merged
  }

  return null
}

async function refreshLiveKnowledge(url: string): Promise<string | null> {
  const stale = liveCache?.value ?? null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LIVE_FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore — `cf` is Cloudflare Workers-specific
      cf: { cacheTtl: CACHE_TTL_SECONDS, cacheEverything: true },
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })

    if (!res.ok) {
      console.warn('[liveKnowledge] non-OK response:', res.status)
      liveCache = { value: stale, expiresAt: Date.now() + NEGATIVE_CACHE_MS }
      return stale
    }

    let data: LiveKbPayload
    try {
      data = await res.json() as LiveKbPayload
    } catch {
      console.warn('[liveKnowledge] response was not JSON')
      liveCache = { value: stale, expiresAt: Date.now() + NEGATIVE_CACHE_MS }
      return stale
    }

    const value = parsePayload(data)
    liveCache = {
      value,
      expiresAt: Date.now() + CACHE_TTL_SECONDS * 1000,
    }
    return value
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'AbortError'
    console.warn(
      timedOut ? '[liveKnowledge] fetch timed out' : '[liveKnowledge] fetch failed:',
      timedOut ? `${LIVE_FETCH_TIMEOUT_MS}ms` : err instanceof Error ? err.message : err,
    )
    liveCache = { value: stale, expiresAt: Date.now() + NEGATIVE_CACHE_MS }
    return stale
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchLiveKnowledge(): Promise<string | null> {
  const now = Date.now()
  if (liveCache && liveCache.expiresAt > now) return liveCache.value
  if (liveInFlight) return liveInFlight

  const url = process.env.SYSTEM_ASSISTANT_KB_URL?.trim() || DEFAULT_URL
  liveInFlight = refreshLiveKnowledge(url).finally(() => {
    liveInFlight = null
  })
  return liveInFlight
}

export function resetLiveKnowledgeCache(): void {
  liveCache = null
  liveInFlight = null
}
