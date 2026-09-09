/**
 * Fetches the live central knowledge supplement maintained on the main
 * YouSafe site. The system-wide SuperGrok assistant consumes this alongside
 * the curated Messenger/site KB and exact inquiry-origin page context.
 *
 * The fetch is cached at the Cloudflare edge for ~5 minutes. If the marketing
 * site is unavailable, callers continue with the curated/static knowledge.
 */

const DEFAULT_URL = 'https://yousafeconsultancy.com/assistant-knowledge.json'
const CACHE_TTL_SECONDS = 300

type LiveKbPayload = {
  version?: string
  markdown?: string
  sections?: Array<{ title?: string; body?: string }>
}

export async function fetchLiveKnowledge(): Promise<string | null> {
  const url = process.env.SYSTEM_ASSISTANT_KB_URL?.trim() || DEFAULT_URL

  let res: Response
  try {
    res = await fetch(url, {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore — `cf` is Cloudflare Workers-specific
      cf: { cacheTtl: CACHE_TTL_SECONDS, cacheEverything: true },
      headers: { Accept: 'application/json' },
    })
  } catch (err) {
    console.warn('[liveKnowledge] fetch failed:', err instanceof Error ? err.message : err)
    return null
  }

  if (!res.ok) {
    console.warn('[liveKnowledge] non-OK response:', res.status)
    return null
  }

  let data: LiveKbPayload
  try {
    data = await res.json() as LiveKbPayload
  } catch {
    console.warn('[liveKnowledge] response was not JSON')
    return null
  }

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
