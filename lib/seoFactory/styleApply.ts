/**
 * Deterministic style-apply: find the quoted phrase in the document and
 * replace it with the suggestion. Fuzzy on whitespace/quotes/case so the
 * review model does not have to match markdown exactly.
 */

function escapeRegExp(s: string): string {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeQuote(s: string): string {
  const words = String(s || '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\*+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
  const out: string[] = []
  for (const w of words) {
    if (out.length && out[out.length - 1].toLowerCase() === w.toLowerCase()) continue
    out.push(w)
  }
  return out.join(' ')
}

function quotePattern(quote: string): RegExp | null {
  const n = normalizeQuote(quote)
  if (!n) return null
  const words = n.split(' ').filter(Boolean)
  if (!words.length) return null
  const body = words.map((w) => `\\*{0,2}${escapeRegExp(w.replace(/^[*_]+|[*_]+$/g, ''))}\\*{0,2}`).join('\\s+')
  try {
    return new RegExp(body, 'gi')
  } catch {
    return null
  }
}

export function applyQuotedStyleFixes(
  content: string,
  items: Array<{ quote?: string; suggestion?: string }>,
): { content: string; applied: number } {
  let next = String(content || '')
  let applied = 0
  for (const it of items || []) {
    const quote = normalizeQuote(it.quote || '')
    const suggestion = String(it.suggestion || '').trim()
    if (!quote || !suggestion || quote === suggestion) continue
    if (next.includes(String(it.quote || '')) && String(it.quote) !== suggestion) {
      const before = next
      next = next.split(String(it.quote)).join(suggestion)
      if (next !== before) {
        applied++
        continue
      }
    }
    const re = quotePattern(quote)
    if (!re) continue
    const before = next
    next = next.replace(re, () => suggestion)
    if (next !== before) applied++
  }
  return { content: next, applied }
}
