import { computeEditorMetrics, type EditorSeoHint } from './editorMetrics'
import { evaluateContentQuality } from './seoFactory/contentQualityGate'
import { contentFingerprint } from './seoFactory/currentGate'
import type { HarperLintSummary } from './harperBrowser'

export type EditorialSnapshot = ReturnType<typeof measureEditorial>
export function measureEditorial(content: string, hint: EditorSeoHint, grammar: HarperLintSummary | null) {
  const metrics = computeEditorMetrics(content, [], hint)
  const quality = evaluateContentQuality({ content, ...hint })
  return {
    fingerprint: contentFingerprint(content), grammar, metrics,
    voice: quality.humanScore,
    findings: [...quality.blockers, ...quality.warnings].map(f => ({ code: f.code, message: f.message, fix: f.fix })),
    blockers: quality.blockers.map(f => f.code),
  }
}

export function editorialTargetsMet(s: EditorialSnapshot): boolean {
  return s.grammar !== null && s.grammar.score === 100 && s.grammar.errors === 0
    && s.grammar.suggestions === 0 && s.metrics.seo.score === 100
    && s.metrics.readability.pass && s.voice === 100 && s.blockers.length === 0
}

/** No metric may be traded away to improve another. Flesch uses its audience floor. */
export function editorialRegression(before: EditorialSnapshot, after: EditorialSnapshot): boolean {
  return !after.grammar || (before.grammar !== null && after.grammar.score < before.grammar.score)
    || after.metrics.seo.score < before.metrics.seo.score || after.voice < before.voice
    || Math.min(after.metrics.readability.score, after.metrics.readability.target)
      < Math.min(before.metrics.readability.score, before.metrics.readability.target)
    || after.blockers.some(code => !before.blockers.includes(code))
}

export type EditorialResult = {
  content: string; snapshot: EditorialSnapshot; rounds: number
  status: 'cleared' | 'held'; reason: string
}

/** Browser owns Harper; the model receives its fresh findings and proposes a patch.
 * No self-reported model score is accepted. The caller runs the ship gate last. */
export async function superviseEditorial(input: {
  content: string; hint: EditorSeoHint; signal?: AbortSignal
}, deps: {
  grammar: (content: string) => Promise<HarperLintSummary | null>
  autofix: (content: string) => Promise<{ content: string }>
  review: (content: string, snapshot: EditorialSnapshot) => Promise<{ content: string; clean: boolean }>
  progress?: (message: string) => void
}): Promise<EditorialResult> {
  let content = input.content
  let snapshot = measureEditorial(content, input.hint, await deps.grammar(content))
  let rounds = 0
  const result = (status: EditorialResult['status'], reason: string): EditorialResult => ({ content, snapshot, rounds, status, reason })
  const aborted = () => { if (input.signal?.aborted) throw new Error('Editorial review cancelled') }
  const seen = new Set([content])
  for (let round = 0; round < 3; round++) {
    aborted()
    if (!snapshot.grammar) return result('held', 'Harper is unavailable or there is too little prose to evaluate.')
    deps.progress?.(`Editorial review ${round + 1}/3: grammar, readability, SEO and voice`)
    const fixed = await deps.autofix(content)
    aborted()
    if (fixed.content !== content) {
      const checked = measureEditorial(fixed.content, input.hint, await deps.grammar(fixed.content))
      if (!editorialRegression(snapshot, checked)) { content = fixed.content; snapshot = checked }
    }
    let candidate: { content: string; clean: boolean }
    try { candidate = await deps.review(content, snapshot) }
    catch (error) { aborted(); return result('held', error instanceof Error ? error.message : 'Editorial model unavailable') }
    aborted()
    rounds++
    if (candidate.content === content) {
      return candidate.clean && editorialTargetsMet(snapshot)
        ? result('cleared', 'Editorial targets met; final ship audit required.')
        : result('held', 'Review stalled with outstanding editorial findings; no scores were overridden.')
    }
    const checked = measureEditorial(candidate.content, input.hint, await deps.grammar(candidate.content))
    aborted()
    if (editorialRegression(snapshot, checked)) return result('held', 'Revision regressed a measured metric; previous text retained.')
    if (seen.has(candidate.content)) return result('held', 'Revision cycle detected; previous text retained.')
    seen.add(candidate.content)
    content = candidate.content
    snapshot = checked
  }
  return result('held', 'Three editorial passes completed; remaining issues need review.')
}
