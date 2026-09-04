export type StyleItem = {
  category: string
  quote: string
  issue: string
  suggestion: string
}

function asItem(it: unknown): StyleItem | null {
  if (!it || typeof it !== 'object') return null
  const rec = it as Record<string, unknown>
  if (typeof rec.quote !== 'string' || typeof rec.issue !== 'string') return null
  return {
    category: String(rec.category || 'style').slice(0, 24),
    quote: String(rec.quote || '').slice(0, 160),
    issue: String(rec.issue || '').slice(0, 240),
    suggestion: String(rec.suggestion || '').slice(0, 320),
  }
}

function fromObject(obj: unknown): { items: StyleItem[] } | null {
  if (!obj || typeof obj !== 'object') return null
  const itemsRaw = (obj as { items?: unknown }).items
  if (!Array.isArray(itemsRaw)) return null
  const items = itemsRaw.map(asItem).filter((it): it is StyleItem => Boolean(it)).slice(0, 10)
  return { items }
}

function stripFence(raw: string): string {
  let t = String(raw || '').trim()
  t = t.replace(/^```(?:json|JSON)?\s*/i, '')
  t = t.replace(/\s*```[\s\S]*$/i, '')
  return t.trim()
}

function tryParseSlice(t: string): { items: StyleItem[] } | null {
  const start = t.indexOf('{')
  if (start === -1) return null
  const end = t.lastIndexOf('}')
  if (end <= start) return null
  try {
    return fromObject(JSON.parse(t.slice(start, end + 1)))
  } catch {
    // Truncated or extra braces — walk closing braces from first `{`.
    let depth = 0
    for (let i = start; i < t.length; i++) {
      const ch = t[i]
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) {
          try {
            return fromObject(JSON.parse(t.slice(start, i + 1)))
          } catch {
            return null
          }
        }
      }
    }
    return null
  }
}

/** Parse a style-review model payload. Tolerates markdown fences and trailing prose. */
export function parseStyleJson(raw: string): { items: StyleItem[] } | null {
  const t = String(raw || '').trim()
  if (!t) return null
  const unfenced = stripFence(t)
  for (const cand of [unfenced, t]) {
    try {
      const direct = fromObject(JSON.parse(cand))
      if (direct) return direct
    } catch {
      /* slice below */
    }
    const sliced = tryParseSlice(cand)
    if (sliced) return sliced
  }
  return null
}
