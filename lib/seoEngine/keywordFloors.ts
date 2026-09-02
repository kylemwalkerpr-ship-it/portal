/**
 * keywordFloors — UI-side twin of the brief route's keyword floor guarantee.
 *
 * The Brief/GComposer keyword FIELD is seeded from radar/plan suggestions,
 * which can carry as few as 3 short-tail terms — the panel then shows
 * "! 3/5 short-tail" long before any brief is built (and it looks like the
 * brief generator failed). This pure helper fills the plain list up to the
 * contract floors (≥5 short ≤3 words, ≥4 long-tail ≥4 words) using
 * deterministic, grammatical templates derived from the primary keyword's
 * own word windows — the same strategy the pipeline partitioner uses.
 * Pure + dependency-free so any client seeder can use it.
 */

const SHORT_FLOOR = 5
const LONG_FLOOR = 4
const MODIFIERS = ['requirements', 'checklist', 'cost', 'process', 'eligibility', 'timeline', 'fees']

function classify(term: string): 'short' | 'long' {
  return term.trim().split(/\s+/).length <= 3 ? 'short' : 'long'
}

/** Short heads derived from the primary keyword's own contiguous windows
 *  (leading 1–2 words, trailing 2–3 words) — never invents off-topic terms. */
function shortHeadCandidates(primaryWords: string[]): string[] {
  const out: string[] = []
  const push = (words: string[]) => {
    const w = words.join(' ').toLowerCase().trim()
    if (w && w.split(/\s+/).length <= 3) out.push(w)
  }
  push(primaryWords.slice(0, 1))
  push(primaryWords.slice(0, 2))
  push(primaryWords.slice(-3))
  push(primaryWords.slice(-2))
  for (const mod of MODIFIERS) {
    push([primaryWords[0], mod])
  }
  return out.filter(Boolean)
}

/** Fill a plain operator/plan keyword list up to the ≥5 short / ≥4 long-tail
 *  contract floors. Deterministic, deduped, never returns below the floors
 *  (unless the primary itself is unusable). */
export function ensureKeywordFloors(terms: string[], primaryTerm = ''): string[] {
  const primary = String(primaryTerm || '').trim().toLowerCase()
  const primaryWords = primary.split(/\s+/).filter(Boolean)
  const seen = new Set<string>()
  const shorts: string[] = []
  const longs: string[] = []
  const add = (t: string, floor: number, arr: string[], cap: number) => {
    const norm = t.trim().toLowerCase().replace(/\s+/g, ' ')
    if (!norm || norm.length < 3 || seen.has(norm)) return
    if (norm === primary) return
    seen.add(norm)
    arr.push(norm)
  }
  for (const raw of terms || []) {
    const t = String(raw || '').trim()
    if (!t) continue
    add(t, SHORT_FLOOR, classify(t) === 'short' ? shorts : longs, 0)
  }

  // Short floor fill from the primary's own word windows + natural modifiers.
  if (shorts.length < SHORT_FLOOR && primaryWords.length) {
    const heads = shortHeadCandidates(primaryWords)
    for (const head of heads) {
      if (shorts.length >= SHORT_FLOOR) break
      for (const mod of [head, `${head} ${MODIFIERS[0]}`, `${head} ${MODIFIERS[4]}`, `${head} ${MODIFIERS[1]}`, `${head} ${MODIFIERS[5]}`]) {
        if (shorts.length >= SHORT_FLOOR) break
        const candidate = `${head} ${mod}`.split(/\s+/).length <= 3 ? mod : head
        if (classify(candidate) === 'short') add(candidate, SHORT_FLOOR, shorts, SHORT_FLOOR + 8)
      }
    }
  }
  // Last resort: plain "primary word" heads.
  for (const head of shortHeadCandidates(primaryWords)) {
    if (shorts.length >= SHORT_FLOOR) break
    if (classify(head) === 'short') add(head, SHORT_FLOOR, shorts, SHORT_FLOOR + 8)
  }

  // Long-tail floor fill — natural reader questions/phrases, never mashups.
  if (longs.length < LONG_FLOOR) {
    const bases = [shorts[0] || primary, primary].filter(Boolean)
    const templates = [
      (b: string) => `how to apply for ${b}`,
      (b: string) => `how long does the ${b} take`,
      (b: string) => `documents required for ${b}`,
      (b: string) => `can i work while waiting for ${b} approval`,
      (b: string) => `difference between types of ${b}`,
    ]
    for (const base of bases) {
      for (const tpl of templates) {
        if (longs.length >= LONG_FLOOR) break
        const candidate = tpl(base)
        if (classify(candidate) === 'long') add(candidate, LONG_FLOOR, longs, LONG_FLOOR + 6)
      }
    }
  }

  return [...shorts, ...longs]
}