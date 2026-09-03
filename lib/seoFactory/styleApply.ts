/**
 * Deterministic style-apply: find the quoted phrase in the document and
 * replace it with the suggestion. Fuzzy on whitespace/quotes/case so the
 * review model does not have to match markdown exactly.
 *
 * Duplicate-sentence findings (quote === suggestion) collapse consecutive
 * copies of that span instead of no-oping.
 */

export type StyleFixItem = { quote?: string; suggestion?: string; category?: string; issue?: string }

function escapeRegExp(s: string): string {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeQuote(s: string): string {
  const words = String(s || '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\*+/g, ' ')
    .replace(/[_#>`]+/g, ' ')
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

function quotePattern(quote: string, flags = 'gi'): RegExp | null {
  const n = normalizeQuote(quote)
  if (!n) return null
  const words = n.split(' ').filter(Boolean)
  if (!words.length) return null
  const body = words.map((w) => `\\*{0,2}${escapeRegExp(w.replace(/^[*_]+|[*_]+$/g, ''))}\\*{0,2}`).join('\\s+')
  try {
    return new RegExp(body, flags)
  } catch {
    return null
  }
}

function collapseConsecutive(haystack: string, quote: string): string | null {
  const re = quotePattern(quote, 'gi')
  if (!re) return null
  const dup = new RegExp(`(${re.source})(?:\\s*\\1)+`, 'gi')
  const next = haystack.replace(dup, '$1')
  return next === haystack ? null : next
}

function replaceFirst(haystack: string, re: RegExp, suggestion: string): string | null {
  const flags = re.flags.replace(/g/g, '')
  const once = new RegExp(re.source, flags)
  const next = haystack.replace(once, suggestion)
  return next === haystack ? null : next
}

function replaceAll(haystack: string, re: RegExp, suggestion: string): string | null {
  const next = haystack.replace(re, suggestion)
  return next === haystack ? null : next
}

export function applyQuotedStyleFixes<T extends StyleFixItem>(
  content: string,
  items: T[],
): { content: string; applied: number; missed: T[] } {
  let next = String(content || '')
  let applied = 0
  const missed: T[] = []
  for (const it of items || []) {
    const quoteRaw = String(it.quote || '')
    const quote = normalizeQuote(quoteRaw)
    const suggestion = String(it.suggestion || '').trim()
    if (!quote) {
      missed.push(it)
      continue
    }

    const same = !suggestion || normalizeQuote(suggestion) === quote
    if (same) {
      const collapsed = collapseConsecutive(next, quote)
      if (collapsed) {
        next = collapsed
        applied++
        continue
      }
      missed.push(it)
      continue
    }

    if (next.includes(quoteRaw) && quoteRaw !== suggestion) {
      const before = next
      next = next.split(quoteRaw).join(suggestion)
      if (next !== before) {
        applied++
        continue
      }
    }

    const re = quotePattern(quote)
    if (re) {
      const global = replaceAll(next, re, suggestion)
      if (global) {
        next = global
        applied++
        continue
      }
    }

    // Truncated model quotes: try the first 10 words as an anchor.
    const words = quote.split(' ')
    if (words.length > 10) {
      const short = quotePattern(words.slice(0, 10).join(' '))
      if (short) {
        const hit = replaceFirst(next, short, suggestion)
        if (hit) {
          next = hit
          applied++
          continue
        }
      }
    }

    missed.push(it)
  }
  return { content: next, applied, missed }
}
