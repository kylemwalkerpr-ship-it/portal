import {
  loadCuratedKbChunks,
  rankChunks,
  resetMessengerKbCache,
  shouldUseDeepNetworkKnowledge,
  type KnowledgeChunk,
} from '@/lib/messengerSiteKnowledge'

/**
 * Tiny, always-safe core used for generic/platform questions. This deliberately
 * excludes the multi-megabyte crawled network corpus so cold requests do not
 * parse the whole estate just to answer a greeting or explain YouSafe.
 */
export function loadAssistantCoreKnowledge(): KnowledgeChunk[] {
  return loadCuratedKbChunks(undefined, true)
}

export function rankAssistantCoreKnowledge(query: string, limit = 6): KnowledgeChunk[] {
  const all = loadAssistantCoreKnowledge()
  const authority = all.filter((chunk) => /network-authority/i.test(chunk.id + chunk.source))
  const ranked = rankChunks(all, query, limit)
  const merged: KnowledgeChunk[] = []
  const seen = new Set<string>()
  for (const chunk of [...authority, ...ranked]) {
    if (seen.has(chunk.id)) continue
    seen.add(chunk.id)
    merged.push(chunk)
    if (merged.length >= limit) break
  }
  return merged
}

/**
 * Deep estate retrieval is reserved for questions whose answer can genuinely
 * depend on a regional/service/article page. Platform mechanics and generic
 * brand questions stay on the small core path.
 */
export { shouldUseDeepNetworkKnowledge }

export function resetAssistantCoreKnowledgeCache(): void {
  resetMessengerKbCache()
}
