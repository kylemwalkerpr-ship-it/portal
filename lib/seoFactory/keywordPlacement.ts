const STRUCTURAL_H2 = /^(overview|introduction|intro|conclusion|key takeaways|takeaways|summary|faq|frequently asked questions|common questions|next steps)$/i

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2)
}

function headingOverlapScore(keyword: string, heading: string): number {
  const kwTok = tokens(keyword)
  const hTok = new Set(tokens(heading))
  if (!kwTok.length || !hTok.size) return 0
  let hits = 0
  for (const t of kwTok) if (hTok.has(t)) hits += 1
  return hits
}

function pickFallbackH2(h2s: string[]): string {
  const nonStructural = h2s.find((h) => !STRUCTURAL_H2.test(h.trim()))
  if (nonStructural) return nonStructural
  const faq = h2s.find((h) => /faq|frequently asked/i.test(h))
  if (faq) return faq
  return h2s[h2s.length - 1] || ''
}

/**
 * Assign every keyword to an H2. Keeps previous mappings when the heading
 * still exists. Unmapped terms prefer token overlap, then the first
 * non-structural H2, then FAQ, then the last heading.
 */
export function autoMapKeywordsToH2s(
  kwList: string[],
  h2s: string[],
  prevMap: Record<string, string> = {},
): Record<string, string> {
  const headingSet = new Set(h2s)
  const fallback = pickFallbackH2(h2s)
  const next: Record<string, string> = {}
  for (const kw of kwList) {
    const prev = prevMap[kw]
    if (prev && headingSet.has(prev)) {
      next[kw] = prev
      continue
    }
    if (!h2s.length) continue
    let best = fallback
    let bestScore = 0
    for (const h of h2s) {
      const score = headingOverlapScore(kw, h)
      if (score > bestScore) {
        bestScore = score
        best = h
      }
    }
    if (best) next[kw] = best
  }
  return next
}
