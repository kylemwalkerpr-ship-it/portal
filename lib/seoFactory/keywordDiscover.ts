/**
 * $0 keyword discovery: GSC queries + public search suggestions + manual seeds.
 * No volume, CPC, or keyword-difficulty numbers.
 */

export type KeywordSource = 'gsc' | 'suggest' | 'manual' | 'serp'

export type KeywordCandidate = {
  id: string
  keyword: string
  normalized: string
  source: KeywordSource
  sources: KeywordSource[]
  seed?: string
}

/** Generic expand templates — domain extras come from `modifiers` config. */
export const DEFAULT_EXPAND_TEMPLATES = [
  '{seed}',
  'how {seed}',
  'what {seed}',
  'when {seed}',
  'where {seed}',
  'why {seed}',
  '{seed} requirements',
  '{seed} eligibility',
  '{seed} cost',
  '{seed} fees',
  '{seed} processing time',
  '{seed} documents',
  '{seed} application',
  '{seed} checklist',
  '{seed} mistakes',
  '{seed} 2026',
] as const

export function normalizeKeyword(raw: string): string {
  return String(raw || '')
    .normalize('NFKC')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function displayKeyword(raw: string): string {
  return String(raw || '').normalize('NFKC').replace(/\s+/g, ' ').trim()
}

function candidateId(normalized: string): string {
  return `kw_${normalized.replace(/\s+/g, '_').slice(0, 80)}`
}

export function expandSeedTemplates(
  seed: string,
  templates: readonly string[] = DEFAULT_EXPAND_TEMPLATES,
  extraModifiers: string[] = [],
): KeywordCandidate[] {
  const display = displayKeyword(seed)
  const n = normalizeKeyword(seed)
  if (!n) return []
  const phrases = new Set<string>()
  for (const t of templates) phrases.add(t.replace(/\{seed\}/g, display))
  for (const mod of extraModifiers) {
    const m = displayKeyword(mod)
    if (!m) continue
    phrases.add(`${display} ${m}`)
  }
  const out: KeywordCandidate[] = []
  for (const phrase of phrases) {
    const normalized = normalizeKeyword(phrase)
    if (!normalized) continue
    out.push({
      id: candidateId(normalized),
      keyword: displayKeyword(phrase),
      normalized,
      source: 'manual',
      sources: ['manual'],
      seed: display,
    })
  }
  return out
}

export function alphabetSeeds(seed: string, letters = 'abcdefghijklmnopqrstuvwxyz'): string[] {
  const display = displayKeyword(seed)
  if (!display) return []
  return [...letters].map((ch) => `${display} ${ch}`)
}

export function mergeKeywordCandidates(groups: KeywordCandidate[][]): KeywordCandidate[] {
  const map = new Map<string, KeywordCandidate>()
  const rank: Record<KeywordSource, number> = { gsc: 0, suggest: 1, manual: 2, serp: 3 }
  for (const group of groups) {
    for (const item of group) {
      const key = item.normalized
      const prev = map.get(key)
      if (!prev) {
        map.set(key, { ...item, sources: [...new Set(item.sources)] })
        continue
      }
      const sources = [...new Set([...prev.sources, ...item.sources])]
      const source = sources.slice().sort((a, b) => rank[a] - rank[b])[0]
      map.set(key, {
        ...prev,
        keyword: prev.source === 'gsc' ? prev.keyword : item.source === 'gsc' ? item.keyword : prev.keyword,
        source,
        sources,
        seed: prev.seed || item.seed,
      })
    }
  }
  return [...map.values()].sort((a, b) => a.normalized.localeCompare(b.normalized))
}

export function candidatesFromGscQueries(
  queries: string[],
  seed?: string,
): KeywordCandidate[] {
  const seedN = seed ? normalizeKeyword(seed) : ''
  const out: KeywordCandidate[] = []
  for (const q of queries) {
    const keyword = displayKeyword(q)
    const normalized = normalizeKeyword(q)
    if (!normalized) continue
    if (seedN && !normalized.includes(seedN) && !seedN.split(' ').every((w) => normalized.includes(w))) continue
    out.push({
      id: candidateId(normalized),
      keyword,
      normalized,
      source: 'gsc',
      sources: ['gsc'],
      seed: seed ? displayKeyword(seed) : undefined,
    })
  }
  return out
}

export function candidatesFromSuggestions(
  suggestions: string[],
  seed?: string,
): KeywordCandidate[] {
  const out: KeywordCandidate[] = []
  for (const s of suggestions) {
    const keyword = displayKeyword(s)
    const normalized = normalizeKeyword(s)
    if (!normalized) continue
    out.push({
      id: candidateId(normalized),
      keyword,
      normalized,
      source: 'suggest',
      sources: ['suggest'],
      seed: seed ? displayKeyword(seed) : undefined,
    })
  }
  return out
}

type SuggestCacheEntry = { at: number; phrases: string[] }
const suggestCache = new Map<string, SuggestCacheEntry>()
const SUGGEST_TTL_MS = 24 * 60 * 60 * 1000

export function resetSuggestCache(): void {
  suggestCache.clear()
}

export async function fetchGoogleSuggestions(
  q: string,
  opts?: { fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<string[]> {
  const key = normalizeKeyword(q)
  if (!key) return []
  const hit = suggestCache.get(key)
  if (hit && Date.now() - hit.at < SUGGEST_TTL_MS) return hit.phrases
  const fetchImpl = opts?.fetchImpl || fetch
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts?.timeoutMs ?? 2500)
  try {
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=en&q=${encodeURIComponent(q)}`
    const res = await fetchImpl(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
    if (!res.ok) return []
    const json = (await res.json()) as unknown
    const list = Array.isArray(json) && Array.isArray(json[1]) ? json[1].map(String) : []
    const phrases = list.map(displayKeyword).filter(Boolean).slice(0, 12)
    suggestCache.set(key, { at: Date.now(), phrases })
    return phrases
  } catch {
    return []
  } finally {
    clearTimeout(timer)
  }
}

export async function discoverKeywords(opts: {
  seed: string
  gscQueries?: string[]
  modifiers?: string[]
  includeAlphabet?: boolean
  templates?: readonly string[]
  fetchImpl?: typeof fetch
  maxSuggestCalls?: number
}): Promise<{ candidates: KeywordCandidate[]; suggestOk: boolean; suggestCalls: number }> {
  const seed = displayKeyword(opts.seed)
  const templates = opts.templates || DEFAULT_EXPAND_TEMPLATES
  const manual = expandSeedTemplates(seed, templates, opts.modifiers || [])
  const gsc = candidatesFromGscQueries(opts.gscQueries || [], seed)

  const suggestSeeds = [seed]
  if (opts.includeAlphabet) suggestSeeds.push(...alphabetSeeds(seed).slice(0, 8))
  const maxCalls = Math.max(1, opts.maxSuggestCalls ?? 6)
  let suggestOk = true
  let suggestCalls = 0
  const suggested: string[] = []
  for (const q of suggestSeeds.slice(0, maxCalls)) {
    suggestCalls++
    const before = suggested.length
    const got = await fetchGoogleSuggestions(q, { fetchImpl: opts.fetchImpl })
    if (!got.length && before === suggested.length) {
      /* empty is fine; network throw already swallowed */
    }
    suggested.push(...got)
  }
  if (suggestCalls > 0 && suggested.length === 0 && (opts.fetchImpl || true)) {
    // still ok — empty suggestions must not fail discovery
    suggestOk = true
  }
  const suggest = candidatesFromSuggestions(suggested, seed)
  return {
    candidates: mergeKeywordCandidates([gsc, suggest, manual]),
    suggestOk,
    suggestCalls,
  }
}
