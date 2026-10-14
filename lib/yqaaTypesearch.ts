import { getCloudflareContext } from '@opennextjs/cloudflare'

export type TypesearchArticle = { url: string; title: string; excerpt: string }

/** Only article-read excerpts qualify; headline relevance alone is not evidence. */
export async function searchYqaaTypesearch(query: string, domains: string[] | undefined, signal?: AbortSignal): Promise<TypesearchArticle[]> {
  let bindings: Record<string, string | undefined> = {}
  try { bindings = getCloudflareContext().env as unknown as typeof bindings } catch { /* local execution */ }
  const key = bindings.TYPESEARCH_API_KEY || process.env.TYPESEARCH_API_KEY
  if (!key || signal?.aborted || query.trim().length < 2) return []
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, 1800)
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  try {
    const work = (async (): Promise<TypesearchArticle[]> => {
      const response = await fetch('https://api.typesearch.ai/v1/search', {
        method: 'POST', redirect: 'manual', signal: controller.signal,
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.slice(0, 200), include_domains: domains?.slice(0, 20),
          mode: 'normal', max_results: 3, highlights: true, max_tokens: 2000, fresh: true, days: null }),
      })
      if (!response.ok || !response.body) return []
      reader = response.body.getReader()
      let size = 0, text = ''
      const decoder = new TextDecoder()
      while (true) {
        const part = await reader.read()
        if (part.done) break
        size += part.value.byteLength
        if (size > 100_000 || controller.signal.aborted) return []
        text += decoder.decode(part.value, { stream: true })
      }
      const data = JSON.parse(text + decoder.decode())
      if (data.incomplete === true || data.cached_at || data.found !== true || !Array.isArray(data.results) || data.results.length > 3) return []
      return data.results.flatMap((row: any) => {
        if (typeof row?.url !== 'string' || typeof row.title !== 'string' ||
          !Number.isFinite(row.read?.probability) || row.read.probability < 0.65 || row.read.probability > 1 ||
          !Array.isArray(row.highlights) || !row.highlights.length ||
          !row.highlights.every((x: unknown) => typeof x === 'string')) return []
        const excerpt = row.highlights[0].trim().split(/\s+/).slice(0, 25).join(' ').slice(0, 1000)
        return excerpt.length >= 25 ? [{ url: row.url, title: row.title.slice(0, 240), excerpt }] : []
      })
    })()
    const stopped = new Promise<TypesearchArticle[]>((resolve) => controller.signal.addEventListener('abort', () => resolve([]), { once: true }))
    return await Promise.race([work, stopped])
  } catch { return [] } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', abort)
    void reader?.cancel().catch(() => {})
  }
}
