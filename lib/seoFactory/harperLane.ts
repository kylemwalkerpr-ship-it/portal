/**
 * Harper's honest lane vs everything it cannot change.
 *
 * Harper is a prose-only reviewer (EditorialRevision + editorialReviewPatch).
 * It must never be asked to:
 *   - add / remove / rename outline H2s or the H1
 *   - change primary-keyword identity
 *   - change owner / canonical URL
 *
 * Those belong to briefing (sealed contract), the outline-completion hop,
 * deterministic repairs, or a human. Handing them to Harper as "fix me"
 * items burns review budget on work the model is forbidden to do.
 *
 * Pure + client-safe: no planner / engineAi / node: imports.
 */

export type HarperDeferredLane = 'structural' | 'brief' | 'human'

export type HarperDeferredFinding = {
  code: string
  lane: HarperDeferredLane
  message: string
}

/**
 * Quality-gate codes Harper may rewrite in existing prose. Anything not
 * listed is deferred — default closed so a new gate cannot silently become
 * a Harper "fix me".
 */
export const HARPER_PROSE_CODES: ReadonlySet<string> = new Set([
  'outcome_promise',
  'banned_brand_phrase',
  'ai_slop',
  'ai_self_reference',
  'hype_tone',
  'keyword_stuffing',
  'inhuman_voice',
  'emdash_spam',
  'heres_spam',
  'sentence_start_repetition',
  'passive_density',
  'missing_second_person',
  'stiff_formality',
  'keyword_density_high',
  'wall_of_text',
  'missing_concrete_example',
  'adjacent_h2_echo',
  'missing_short_keyword',
  'missing_long_tail_keyword',
  'missing_synthesized_short_keyword',
  'missing_synthesized_long_tail_keyword',
  'short_keyword_density_violation',
  'long_tail_density_violation',
  'forward_reference_orphan',
  'thin_content',
  'word_count',
  'word_count_target',
  'human_voice',
])

const BRIEF_CODES: ReadonlySet<string> = new Set([
  'insufficient_short_keywords',
  'insufficient_long_tail_keywords',
  'ownership',
])

const HUMAN_CODE_RE = /^(cannibalization_|unverified_internal_link$)/

const STRUCTURAL_CODES: ReadonlySet<string> = new Set([
  'missing_outline_section',
  'missing_tldr',
  'missing_faq',
  'structure_h2',
  'h2_structure',
  'missing_disclaimer',
  'disclaimer',
  'missing_reader_path',
  'missing_visual_break',
  'heading_structure_invalid',
  'tldr_format_invalid',
  'duplicate_structural_section',
  'keyword_pasted_heading',
  'generic_current_info_heading',
  'duplicate_h2',
  'stray_article_heading',
  'ai_answer_block',
  'schema_article',
  'schema_faq',
  'title',
  'meta_description',
  'keyword',
  'citations',
  'missing_official_sources',
  'internal_links',
  'unlinked_related_guide',
  'bare_url_not_hyperlinked',
  'source_name_not_hyperlinked',
  'faq_forced_keyword',
])

/** Deterministic editor SEO fails Harper cannot clear (YAML / H1 / H2 / URLs). */
const STRUCTURAL_SEO_FAIL_RE = [
  /primary keyword missing from h1/i,
  /only \d+ h2 sections/i,
  /missing faq section/i,
  /missing sources section/i,
  /no meta description/i,
  /meta description \d+ chars/i,
  /only \d+ urls?\b/i,
]

export function isHarperProseFinding(code: string): boolean {
  return HARPER_PROSE_CODES.has(String(code || '').trim())
}

export function isHarperProseSeoFail(message: string): boolean {
  const text = String(message || '').trim()
  if (!text) return false
  return !STRUCTURAL_SEO_FAIL_RE.some((re) => re.test(text))
}

export function harperDeferredLane(code: string): HarperDeferredLane {
  const key = String(code || '').trim()
  if (key === 'ownership' || HUMAN_CODE_RE.test(key)) return 'human'
  if (BRIEF_CODES.has(key)) return 'brief'
  return 'structural'
}

export function partitionHarperFindings<T extends { code: string; message?: string; fix?: string }>(
  findings: T[],
): { prose: T[]; deferred: HarperDeferredFinding[] } {
  const prose: T[] = []
  const deferred: HarperDeferredFinding[] = []
  const seen = new Set<string>()
  for (const finding of findings || []) {
    const code = String(finding.code || '').trim()
    if (!code) continue
    if (isHarperProseFinding(code)) {
      prose.push(finding)
      continue
    }
    if (seen.has(code)) continue
    seen.add(code)
    deferred.push({
      code,
      lane: harperDeferredLane(code),
      message: String(finding.fix || finding.message || code).slice(0, 240),
    })
  }
  return { prose, deferred }
}

export function harperActionableBlockers(blockers: string[]): string[] {
  return (blockers || []).filter((code) => isHarperProseFinding(code))
}

export function harperSeoScore(seo: { pass?: string[]; fail?: string[]; score?: number }): number {
  const fail = (seo.fail || []).filter(isHarperProseSeoFail)
  if (fail.length === 0) return 100
  const pass = seo.pass || []
  return Math.max(5, Math.round((pass.length / Math.max(1, pass.length + fail.length)) * 100))
}

export function harperSeoFails(fails: string[]): string[] {
  return (fails || []).filter(isHarperProseSeoFail)
}

export const HARPER_IDENTITY_NON_NEGOTIABLE =
  'Outline H2s, the H1, primary-keyword identity, and owner/canonical URL are frozen by the brief. Never add, remove, or rename headings. Never change primaryKeyword or the owner URL. Structural leftovers belong to Audit & Fix / briefing / a human — do not attempt them.'
