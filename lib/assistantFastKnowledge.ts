import {
  loadCuratedCoreKbChunks,
  rankChunks,
  resetMessengerKbCache,
  shouldUseDeepNetworkKnowledge,
  type KnowledgeChunk,
} from '@/lib/messengerSiteKnowledge'

/** The fast path shares the same curated public corpus as substantive turns. */
export function loadAssistantCoreKnowledge(): KnowledgeChunk[] {
  return loadCuratedCoreKbChunks()
}

export function rankAssistantCoreKnowledge(query: string, limit = 6): KnowledgeChunk[] {
  return rankChunks(loadAssistantCoreKnowledge(), query, limit)
}

export { shouldUseDeepNetworkKnowledge }

export function resetAssistantCoreKnowledgeCache(): void {
  resetMessengerKbCache()
}
