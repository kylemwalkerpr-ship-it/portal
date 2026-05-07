/**
 * Fetches the live knowledge supplement that the marketing team maintains at
 * https://yousafeconsultancy.com/yara-knowledge.json (the path is overridable
 * with YARA_KB_URL).
 *
 * The fetch is cached at the Cloudflare edge for ~5 minutes via the
 * cloudflare-specific `cf.cacheTtl` request init option, so the actual cost
 * per chat reply is negligible. If the marketing site is down or the file is
 * malformed, we return null and the caller falls back to the static KB.
 *
 * Accepted JSON shapes:
 *
 *   { "markdown": "..." }                              // simplest
 *   { "sections": [{ "title": "...", "body": "..." }] } // structured
 *   { "markdown": "...", "version": "2026-05-07" }      // both work
 *
 * If both `markdown` and `sections` are present, `markdown` wins.
 */

const DEFAULT_URL = 'https://yousafeconsultancy.com/yara-knowledge.json'
const CACHE_TTL_SECONDS = 300

type LiveKbPayload = {
  version?: string
  markdown?: string
  sections?: Array<{ title?: string; body?: string }>
}

export async function fetchLiveKnowledge(): Promise<string | null> {
  const url = process.env.YARA_KB_URL?.trim() || DEFAULT_URL

  let res: Response
  try {
    // Cloudflare-specific cache hint. Other runtimes ignore the cf option.
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
