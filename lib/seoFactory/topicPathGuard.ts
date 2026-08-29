/**
 * Ship-refuse guard: content topic vs target path last slug.
 *
 * Live defect (2026-08): an asylum article was shipped to an OPT path because
 * the pipeline only checked keyword-in-body. The slug is the strongest
 * published-signal we control — if the topic shares no significant token with
 * the target path's last segment, refuse the ship.
 */

const STOPWORDS = new Set([
  'the', 'a', 'an', 'for', 'of', 'to', 'in', 'on', 'and', 'or', 'with', 'from',
  'guide', 'complete', 'help', 'application',
])

function significantTokens(s: string): string[] {
  return String(s || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t) && !/^\d+$/.test(t))
}

export function topicPathMismatch(
  topic: string,
  primaryKeyword: string,
  filePath: string,
): string | null {
  const slug = String(filePath || '').split('/').filter(Boolean).pop() || ''
  if (!slug) return null
  const slugTokens = new Set(
    slug
      .toLowerCase()
      .split(/[-_\s]+/)
      .filter(Boolean),
  )
  if (!slugTokens.size) return null
  const topicTokens = [...significantTokens(topic), ...significantTokens(primaryKeyword)]
  if (!topicTokens.length) return null
  for (const t of topicTokens) {
    if (slugTokens.has(t)) return null
  }
  return `Content-topic mismatch: topic "${topic}" vs path ".../${slug}"`
}
