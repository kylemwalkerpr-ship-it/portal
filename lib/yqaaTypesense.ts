import { getCloudflareContext } from '@opennextjs/cloudflare'

export type TypesenseKnowledgeRow = {
  chunk_key: string; source_key: string; title: string; body: string; source_url: string;
  site: string; jurisdiction: string; repository: string; topic_tags: string[];
  authority_tier: number; fetched_at: string; lastmod: string; section_title: string; score: number;
}

export async function searchModalYqaaKnowledge(options: {
  query: string; site: string | null; jurisdiction: string | null; limit: number; signal?: AbortSignal;
}): Promise<TypesenseKnowledgeRow[] | null> {
  let bindings: Record<string, string | undefined> = {}
  try { bindings = getCloudflareContext().env as unknown as typeof bindings } catch { /* local execution */ }
  const value = (name: string) => bindings[name] || process.env[name] || ''
  if (value('YQAA_TYPESENSE_ENABLED') !== 'true') return null
  const url = value('YQAA_TYPESENSE_URL'), token = value('YQAA_TYPESENSE_TOKEN')
  if (!token || !/^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)?\.modal\.run\/?$/i.test(url)) return null
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (options.signal?.aborted) return null
  options.signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, 2000)
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  try {
    const work = (async () => {
      const response = await fetch(`${url.replace(/\/$/, '')}/search`, {
        method: 'POST', redirect: 'manual', signal: controller.signal,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: options.query.slice(0, 2000), site: options.site,
          jurisdiction: options.jurisdiction, limit: Math.max(1, Math.min(24, options.limit)) }),
      })
      if (!response.ok || !response.body) return null
      reader = response.body.getReader()
      let bytes = 0, text = '', decoder = new TextDecoder()
      while (true) {
        const part = await reader.read()
        if (part.done) break
        bytes += part.value.byteLength
        if (bytes > 250_000) return null
        text += decoder.decode(part.value, { stream: true })
      }
      text += decoder.decode()
      const data = JSON.parse(text)
      if (!Array.isArray(data.chunks) || data.chunks.length > 24 || data.ready !== true) return null
      const rows: TypesenseKnowledgeRow[] = []
      for (const r of data.chunks) {
        if (!r || typeof r !== 'object' || typeof r.body !== 'string' || !r.body.trim() ||
          r.body.length > 5000 || typeof r.chunk_key !== 'string' || typeof r.source_key !== 'string' ||
          typeof r.source_url !== 'string' ||
          !/^(https:\/\/|repo:\/\/kylemwalkerpr-ship-it\/portal\/content\/messenger-kb\/)/i.test(r.source_url) ||
          typeof r.title !== 'string' || !Number.isFinite(r.authority_tier) ||
          r.authority_tier < 1 || r.authority_tier > 5 || !Number.isFinite(r.score) || r.score < 0 || r.score > 8 ||
          !Array.isArray(r.topic_tags) || !r.topic_tags.every((x: unknown) => typeof x === 'string')) return null
        if (options.jurisdiction && r.jurisdiction && r.jurisdiction !== 'Global' && r.jurisdiction !== options.jurisdiction) return null
        rows.push(r)
      }
      return rows
    })()
    const stopped = new Promise<null>((resolve) => controller.signal.addEventListener('abort', () => resolve(null), { once: true }))
    return await Promise.race([work, stopped])
  } catch { return null } finally {
    clearTimeout(timer); options.signal?.removeEventListener('abort', abort)
    void reader?.cancel().catch(() => {})
  }
}
