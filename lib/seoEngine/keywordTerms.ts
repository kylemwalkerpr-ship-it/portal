/**
 * Keyword provenance primitives — dependency-free on purpose.
 *
 * The quality gate, the partitioner, and the job contract all need to agree on
 * where a required keyword came from. This module holds only types + pure
 * helpers so `contentQualityGate` can import it without dragging Supabase /
 * engineAi (and their bundle weight) into the Worker.
 */

/**
 * Where a required keyword came from.
 *
 * - `demand`      — a real query supplied by GSC / Ubersuggest / the planner
 *                   brief, or typed by an operator. Enforceable: if the draft
 *                   does not cover it, the draft is off-topic.
 * - `synthesized` — produced by the partitioner's template backfill purely to
 *                   satisfy the `KEYWORD_REQUIREMENTS` count floors. NOT
 *                   evidence of real search demand, so the quality gate must
 *                   not hard-block a draft for omitting it.
 */
export type KeywordSource = 'demand' | 'synthesized'

export interface KeywordTerm {
  term: string
  source: KeywordSource
}

/** Terms whose provenance is unknown default to `demand` (caller-supplied). */
export function keywordTermList(
  terms: Array<string | KeywordTerm> | undefined | null,
  fallback: KeywordSource = 'demand',
): KeywordTerm[] {
  return (terms || [])
    .map((entry) => (typeof entry === 'string'
      ? { term: entry, source: fallback }
      : { term: String(entry?.term ?? ''), source: entry?.source ?? fallback }))
    .map(({ term, source }) => ({ term: term.trim(), source }))
    .filter((entry) => Boolean(entry.term))
}

/** Provenance lookup for a keyword array, keyed by lowercased term. */
export function keywordSourceMap(terms: KeywordTerm[]): Map<string, KeywordSource> {
  const map = new Map<string, KeywordSource>()
  for (const { term, source } of terms) {
    const key = term.toLowerCase()
    // First writer wins: a real demand term is never downgraded by a
    // synthesized duplicate.
    if (!map.has(key)) map.set(key, source)
  }
  return map
}

/**
 * Resolve the provenance of a flat keyword array against optional per-term
 * metadata. Terms without metadata are treated as real demand so callers that
 * never supply provenance keep the strict pre-provenance behavior.
 */
export function resolveTermSources(
  terms: string[],
  provenance?: KeywordTerm[] | null,
): KeywordTerm[] {
  const known = keywordSourceMap(keywordTermList(provenance || []))
  return terms.map((term) => ({
    term,
    source: known.get(term.toLowerCase()) ?? 'demand',
  }))
}
