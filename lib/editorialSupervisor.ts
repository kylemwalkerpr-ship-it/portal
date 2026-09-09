import { computeEditorMetrics, type EditorSeoHint } from './editorMetrics'
import { evaluateContentQuality } from './seoFactory/contentQualityGate'
import { contentFingerprint } from './seoFactory/currentGate'
import type { HarperLintSummary } from './harperBrowser'

export const EDITORIAL_MAX_PASSES = 5

export type EditorialSnapshot = ReturnType<typeof measureEditorial>
export type EditorialLane = 'grammar' | 'seo' | 'ai_write' | 'flesch'
export type EditorialDirective = {
  id: string
  lane: EditorialLane
  severity: 'required' | 'advisory'
  instruction: string
  evidence?: string
  suggestedFix?: string
}

/**
 * Machine-readable supervisory packet handed to the review model. Harper is
 * the authority for language findings; deterministic SEO, human-voice and
 * Flesch measurements are co-gates. The model is an executor, never a scorer.
 */
export type HarperSupervisionPacket = {
  version: 1
  fingerprint: string
  targets: { grammar: 100; seo: 100; aiWrite: 100; flesch: number }
  current: {
    grammar: number | null
    grammarErrors: number | null
    grammarSuggestions: number | null
    seo: number
    aiWrite: number
    flesch: number
  }
  unmet: EditorialLane[]
  directives: EditorialDirective[]
  nonNegotiables: string[]
}

export function measureEditorial(content: string, hint: EditorSeoHint, grammar: HarperLintSummary | null) {
  const metrics = computeEditorMetrics(content, [], hint)
  const quality = evaluateContentQuality({ content, ...hint })
  return {
    fingerprint: contentFingerprint(content),
    grammar,
    metrics,
    voice: quality.humanScore,
    findings: [
      ...quality.blockers.map(f => ({ code: f.code, severity: 'blocker' as const, message: f.message, fix: f.fix })),
      ...quality.warnings.map(f => ({ code: f.code, severity: 'warning' as const, message: f.message, fix: f.fix })),
    ],
    blockers: quality.blockers.map(f => f.code),
  }
}

export function buildHarperSupervisionPacket(s: EditorialSnapshot): HarperSupervisionPacket {
  const directives: EditorialDirective[] = []
  let serial = 0
  const add = (
    lane: EditorialLane,
    severity: EditorialDirective['severity'],
    instruction: string,
    evidence?: string,
    suggestedFix?: string,
  ) => {
    serial += 1
    directives.push({
      id: `harper-${lane}-${String(serial).padStart(3, '0')}`,
      lane,
      severity,
      instruction: String(instruction || '').slice(0, 500),
      ...(evidence ? { evidence: String(evidence).slice(0, 240) } : {}),
      ...(suggestedFix ? { suggestedFix: String(suggestedFix).slice(0, 240) } : {}),
    })
  }

  for (const item of s.grammar?.items || []) {
    add(
      'grammar',
      'required',
      item.message || `Correct the ${item.kind || 'language'} issue without changing meaning.`,
      item.problem,
      item.fix,
    )
  }

  for (const fail of s.metrics.seo.fail || []) {
    add('seo', 'required', fail)
  }
  for (const warn of (s.metrics.seo.warn || []).slice(0, 12)) {
    add('seo', 'advisory', warn)
  }

  // Quality findings are the human/AI-write supervisor's concrete evidence.
  // Structural findings may be impossible for this prose-only patch lane; the
  // model must not fabricate markup to clear them and the outer Audit & Fix
  // loop remains authoritative for those cases.
  for (const finding of s.findings.slice(0, 24)) {
    add(
      'ai_write',
      finding.severity === 'blocker' ? 'required' : 'advisory',
      finding.fix || finding.message,
      `[${finding.code}] ${finding.message}`,
    )
  }
  if (s.voice < 100 && !s.findings.length) {
    add('ai_write', 'required', 'Make the prose more natural, specific and human without adding facts, anecdotes or claims that are not already supported.')
  }

  if (!s.metrics.readability.pass) {
    const fixes = s.metrics.readability.fixes || []
    if (fixes.length) {
      for (const fix of fixes.slice(0, 12)) {
        add('flesch', 'required', fix.reason, fix.quote, fix.suggestion)
      }
    } else {
      add(
        'flesch',
        'required',
        `Raise Flesch Reading Ease from ${s.metrics.readability.score} to at least ${s.metrics.readability.target} using shorter sentences and plain English while preserving legal/technical meaning.`,
      )
    }
  }

  const unmet: EditorialLane[] = []
  if (!s.grammar || s.grammar.score !== 100 || s.grammar.errors !== 0 || s.grammar.suggestions !== 0) unmet.push('grammar')
  if (s.metrics.seo.score !== 100) unmet.push('seo')
  if (s.voice !== 100 || s.blockers.length > 0) unmet.push('ai_write')
  if (!s.metrics.readability.pass) unmet.push('flesch')

  return {
    version: 1,
    fingerprint: s.fingerprint,
    targets: {
      grammar: 100,
      seo: 100,
      aiWrite: 100,
      flesch: s.metrics.readability.target,
    },
    current: {
      grammar: s.grammar?.score ?? null,
      grammarErrors: s.grammar?.errors ?? null,
      grammarSuggestions: s.grammar?.suggestions ?? null,
      seo: s.metrics.seo.score,
      aiWrite: s.voice,
      flesch: s.metrics.readability.score,
    },
    unmet,
    directives,
    nonNegotiables: [
      'Harper/deterministic findings are instructions to act on, not optional suggestions or text to debate.',
      'Do not trade one lane down to improve another: grammar, SEO, AI-write/human voice and Flesch must all be preserved or improved.',
      'Fix the prose that causes a finding; never claim, estimate or self-report a score. The supervisor remeasures the exact returned draft.',
      'Preserve facts, citations, URLs, numbers, official names, legal qualifications, metadata and document structure unless the outer structural audit explicitly authorizes a change.',
      'Never stuff keywords, invent personal experience, add unsupported facts, or simplify away legal/technical meaning to chase a metric.',
    ],
  }
}

export function editorialTargetsMet(s: EditorialSnapshot): boolean {
  return s.grammar !== null && s.grammar.score === 100 && s.grammar.errors === 0
    && s.grammar.suggestions === 0 && s.metrics.seo.score === 100
    && s.metrics.readability.pass && s.voice === 100 && s.blockers.length === 0
}

/** No metric may be traded away to improve another. Flesch uses its audience floor. */
export function editorialRegression(before: EditorialSnapshot, after: EditorialSnapshot): boolean {
  return !after.grammar
    || (before.grammar !== null && after.grammar.score < before.grammar.score)
    || (before.grammar !== null && after.grammar.errors > before.grammar.errors)
    || after.metrics.seo.score < before.metrics.seo.score
    || after.metrics.seo.fail.length > before.metrics.seo.fail.length
    || after.voice < before.voice
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
  review: (content: string, snapshot: EditorialSnapshot, supervision: HarperSupervisionPacket) => Promise<{ content: string; clean: boolean }>
  progress?: (message: string) => void
}): Promise<EditorialResult> {
  let content = input.content
  let snapshot = measureEditorial(content, input.hint, await deps.grammar(content))
  let rounds = 0
  const result = (status: EditorialResult['status'], reason: string): EditorialResult => ({ content, snapshot, rounds, status, reason })
  const aborted = () => { if (input.signal?.aborted) throw new Error('Editorial review cancelled') }
  const seen = new Set([content])

  for (let round = 0; round < EDITORIAL_MAX_PASSES; round++) {
    aborted()
    if (!snapshot.grammar) return result('held', 'Harper is unavailable or there is too little prose to evaluate.')

    let supervision = buildHarperSupervisionPacket(snapshot)
    deps.progress?.(
      `Harper supervision ${round + 1}/${EDITORIAL_MAX_PASSES}: ${supervision.directives.length} instruction(s) across ${supervision.unmet.join(', ') || 'no remaining'} gates`,
    )

    // Deterministic Harper fixes get first right of refusal. They are applied
    // only if a fresh remeasurement proves no other gate regressed.
    const fixed = await deps.autofix(content)
    aborted()
    if (fixed.content !== content) {
      const checked = measureEditorial(fixed.content, input.hint, await deps.grammar(fixed.content))
      if (!editorialRegression(snapshot, checked)) {
        content = fixed.content
        snapshot = checked
        supervision = buildHarperSupervisionPacket(snapshot)
      }
    }

    if (editorialTargetsMet(snapshot)) {
      return result('cleared', 'Harper supervision cleared grammar, SEO, AI-write/human voice and Flesch; final ship audit required.')
    }

    let candidate: { content: string; clean: boolean }
    try {
      candidate = await deps.review(content, snapshot, supervision)
    } catch (error) {
      aborted()
      return result('held', error instanceof Error ? error.message : 'Editorial model unavailable')
    }
    aborted()
    rounds++

    if (candidate.content === content) {
      return candidate.clean && editorialTargetsMet(snapshot)
        ? result('cleared', 'Harper supervision cleared all four editorial gates; final ship audit required.')
        : result('held', `Review model returned no executable edit while ${buildHarperSupervisionPacket(snapshot).unmet.join(', ') || 'editorial'} gate(s) remain. No scores were overridden.`)
    }

    const checked = measureEditorial(candidate.content, input.hint, await deps.grammar(candidate.content))
    aborted()
    if (editorialRegression(snapshot, checked)) {
      return result('held', 'Revision regressed a Harper-supervised metric; the previous text was retained and no score was overridden.')
    }
    if (seen.has(candidate.content)) {
      return result('held', 'Revision cycle detected; the previous text was retained.')
    }
    seen.add(candidate.content)
    content = candidate.content
    snapshot = checked
  }

  const remaining = buildHarperSupervisionPacket(snapshot)
  return result(
    'held',
    `${EDITORIAL_MAX_PASSES} supervised passes completed; ${remaining.unmet.join(', ') || 'editorial'} gate(s) still need review.`,
  )
}
