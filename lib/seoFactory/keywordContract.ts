/** One canonical keyword contract for audit, editor, approval, and shipping. */
import { KEYWORD_REQUIREMENTS, partitionKeywords } from '@/lib/seoEngine/planner'

export interface KeywordContract {
  requiredShortKeywords: string[]
  requiredLongTailKeywords: string[]
  backfilled: boolean
}

export function resolveKeywordContract(input: {
  primaryKeyword?: string | null
  topic?: string | null
  requiredShortKeywords?: unknown
  requiredLongTailKeywords?: unknown
}): KeywordContract {
  const short = Array.isArray(input.requiredShortKeywords)
    ? input.requiredShortKeywords.map(String).map((term) => term.trim()).filter(Boolean)
    : []
  const longTail = Array.isArray(input.requiredLongTailKeywords)
    ? input.requiredLongTailKeywords.map(String).map((term) => term.trim()).filter(Boolean)
    : []
  const primary = String(input.primaryKeyword || input.topic || '').trim()
  if (short.length >= KEYWORD_REQUIREMENTS.SHORT_MIN && longTail.length >= KEYWORD_REQUIREMENTS.LONG_TAIL_MIN) {
    return { requiredShortKeywords: short, requiredLongTailKeywords: longTail, backfilled: false }
  }
  const partition = partitionKeywords([...short, ...longTail], primary)
  return {
    requiredShortKeywords: partition.short,
    requiredLongTailKeywords: partition.longTail,
    backfilled: true,
  }
}
