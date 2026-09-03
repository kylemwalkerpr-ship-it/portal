/**
 * Deterministic style-apply fallback when the review model cannot emit an
 * EditorPatch (quota, cascade, malformed JSON). Replaces exact quotes only.
 * Idempotent: a second pass finds no quote and applies 0.
 */
export function applyQuotedStyleFixes(
  content: string,
  items: Array<{ quote?: string; suggestion?: string }>,
): { content: string; applied: number } {
  let next = String(content || '')
  let applied = 0
  for (const it of items || []) {
    const quote = String(it.quote || '').trim()
    const suggestion = String(it.suggestion || '').trim()
    if (!quote || !suggestion || quote === suggestion) continue
    if (!next.includes(quote)) continue
    next = next.replace(quote, suggestion)
    applied++
  }
  return { content: next, applied }
}
