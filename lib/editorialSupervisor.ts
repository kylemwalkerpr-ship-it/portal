import { computeEditorMetrics, type EditorSeoHint } from './editorMetrics'
import { evaluateContentQuality } from './seoFactory/contentQualityGate'
import { contentFingerprint } from './seoFactory/currentGate'
import { editorialFactsShrank } from './seoFactory/editorialRevision'
import { critiqueCohesion } from './seoFactory/cohesionCritique'
import type { HarperLintSummary } from './harperBrowser'

export const EDITORIAL_MAX_PASSES = 5
const EDITORIAL_MAX_REVIEWS = 2

export type EditorialSnapshot = ReturnType<typeof measureEditorial>
export type EditorialLane = 'grammar' | 'seo' | 'ai_write' | 'flesch' | 'style' | 'cohesion' | 'eeat'
export type EditorialDirective = {
  id: string
  lane: EditorialLane
  severity: 'required' | 'advisory'
  instruction: string
  evidence?: string
  suggestedFix?: string
  mustApply: boolean
}

/**
 * Machine-readable supervisory packet handed to the review model. Harper is
 * the authority for language findings; deterministic SEO, human-voice and
 * Flesch measurements are co-gates. The model is an executor, never a scorer.
 */
export type HarperSupervisionPacket = {
  version: 2
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
  /** Alias of required + advisory directives still open for this body. */
  pending: EditorialDirective[]
  nonNegotiables: string[]
}

export function measureEditorial(content: string, hint: EditorSeoHint, grammar: HarperLintSummary | null) {
  const metrics = computeEditorMetrics(content, [], hint)
  const quality = evaluateContentQuality({ content, ...hint })
  const cohesion = critiqueCohesion(content)
  return {
    fingerprint: contentFingerprint(content),
    grammar,
    metrics,
    voice: quality.humanScore,
    cohesion,
    findings: [
      ...quality.blockers.map(f => ({ code: f.code, severity: 'blocker' as const, message: f.message, fix: f.fix })),
      ...quality.warnings.map(f => ({ code: f.code, severity: 'warning' as const, message: f.message, fix: f.fix })),
    ],
    blockers: quality.blockers.map(f => f.code),
  }
}

/** Stable across two lints of the same leftover span (lane+kind+normalized problem). */
function harperDirectiveId(lane: string, kind: string, problem: string, message?: string): string {
  const norm = (s: string) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()
  const payload = `${norm(lane)}|${norm(kind)}|${norm(problem)}`
  void message
  let h = 0x811c9dc5
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return `harper-${norm(lane) || 'item'}-${(h >>> 0).toString(16).padStart(8, '0')}`
}

export function buildHarperSupervisionPacket(s: EditorialSnapshot): HarperSupervisionPacket {
  const directives: EditorialDirective[] = []
  const seenIds = new Set<string>()
  const add = (
    lane: EditorialLane,
    severity: EditorialDirective['severity'],
    instruction: string,
    evidence?: string,
    suggestedFix?: string,
    mustApply?: boolean,
    kind?: string,
  ) => {
    const apply = mustApply ?? severity === 'required'
    const id = harperDirectiveId(lane, kind || '', evidence || instruction, instruction)
    if (seenIds.has(id)) return
    seenIds.add(id)
    directives.push({
      id,
      lane,
      severity,
      mustApply: apply,
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
      true,
      item.kind,
    )
  }

  for (const item of (s.grammar?.styleItems || []).slice(0, 20)) {
    add(
      'style',
      'advisory',
      item.message || `Polish the ${item.kind || 'style'} issue without changing meaning.`,
      item.problem,
      item.fix,
      false,
      item.kind,
    )
  }

  for (const fail of s.metrics.seo.fail || []) {
    add('seo', 'required', fail, fail, undefined, true)
  }
  for (const warn of (s.metrics.seo.warn || []).slice(0, 12)) {
    add('seo', 'advisory', warn, warn, undefined, false)
  }

  // Quality findings are the human/AI-write supervisor's concrete evidence.
  // Blockers are never truncated; warnings stay advisory.
  const qualityBlockers = s.findings.filter((f) => f.severity === 'blocker')
  const qualityWarnings = s.findings.filter((f) => f.severity !== 'blocker').slice(0, 24)
  for (const finding of qualityBlockers) {
    add(
      'ai_write',
      'required',
      finding.fix || finding.message,
      `[${finding.code}] ${finding.message}`,
      finding.fix,
      true,
      finding.code,
    )
  }
  for (const finding of qualityWarnings) {
    add(
      'ai_write',
      'advisory',
      finding.fix || finding.message,
      `[${finding.code}] ${finding.message}`,
      finding.fix,
      false,
      finding.code,
    )
  }

  if (!s.metrics.readability.pass) {
    const fixes = s.metrics.readability.fixes || []
    if (fixes.length) {
      for (const fix of fixes.slice(0, 12)) {
        add('flesch', 'required', fix.reason, fix.quote, fix.suggestion, true)
      }
    } else {
      add(
        'flesch',
        'required',
        `Raise Flesch Reading Ease from ${s.metrics.readability.score} to at least ${s.metrics.readability.target} using shorter sentences and plain English while preserving legal/technical meaning.`,
        undefined,
        undefined,
        true,
      )
    }
  }

  for (const finding of s.cohesion?.findings || []) {
    add(
      'cohesion',
      'advisory',
      finding.message,
      finding.evidence,
      undefined,
      false,
      finding.code,
    )
  }

  const unmet: EditorialLane[] = []
  if (!s.grammar || s.grammar.errors > 0) unmet.push('grammar')
  if (s.metrics.seo.score !== 100) unmet.push('seo')
  if (s.blockers.length > 0 || s.voice < 55) unmet.push('ai_write')
  if (!s.metrics.readability.pass) unmet.push('flesch')

  const pending = [...directives]
  return {
    version: 2,
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
    pending,
    nonNegotiables: [
      'Harper/deterministic findings are instructions to act on, not optional suggestions or text to debate.',
      'Do not introduce new quality blockers or additional Harper grammar errors. Small Flesch or voice movement is acceptable when grammar errors fall. Leftover Style does not block ship.',
      'Fix the prose that causes a finding; never claim, estimate or self-report a score. The supervisor remeasures the exact returned draft.',
      'Preserve facts, citations, URLs, numbers, official names, legal qualifications, metadata and document structure unless the outer structural audit explicitly authorizes a change.',
      'Never stuff keywords, invent personal experience, add unsupported facts, or simplify away legal/technical meaning to chase a metric.',
      'SEO hard-fails only DEMAND keywords from the sealed brief. Synthesized floor-fill is advisory — never stuff an unplaceable phrase to chase a warning.',
      'Cover every mustApply directive id in appliedIds or waivedIds. Full-document prose rewrite is allowed; empty document is not success.',
    ],
  }
}

export function editorialTargetsMet(s: EditorialSnapshot): boolean {
  return s.grammar !== null && s.grammar.errors === 0
    && s.metrics.seo.score === 100
    && s.metrics.readability.pass && s.voice >= 55 && s.blockers.length === 0
}

/** Hold only for real safety regressions — not Flesch/voice/SEO score wobble. */
export function editorialRegression(before: EditorialSnapshot, after: EditorialSnapshot): boolean {
  if (!after.grammar) return true
  if (before.grammar !== null && after.grammar.errors > before.grammar.errors) return true
  if (after.blockers.some(code => !before.blockers.includes(code))) return true
  if (after.metrics.seo.fail.length > before.metrics.seo.fail.length) return true
  if (after.voice < before.voice - 8) return true
  const fleschDropped = before.metrics.readability.score - after.metrics.readability.score
  if (after.metrics.readability.score < after.metrics.readability.target && fleschDropped > 5) return true
  return false
}

function reviewIsUnsafe(before: EditorialSnapshot, after: EditorialSnapshot): boolean {
  if (!after.grammar) return true
  if (after.grammar.errors > (before.grammar?.errors ?? 0)) return true
  if (after.blockers.some(code => !before.blockers.includes(code))) return true
  return false
}

function remainingIds(s: EditorialSnapshot): string[] {
  return buildHarperSupervisionPacket(s).pending.map((d) => d.id)
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
  let reviews = 0
  const result = (status: EditorialResult['status'], reason: string): EditorialResult => ({ content, snapshot, rounds, status, reason })
  const aborted = () => { if (input.signal?.aborted) throw new Error('Editorial review cancelled') }
  const seen = new Set([content])

  for (let round = 0; round < EDITORIAL_MAX_PASSES; round++) {
    aborted()
    if (!snapshot.grammar) return result('held', 'Harper is unavailable or there is too little prose to evaluate.')

    let supervision = buildHarperSupervisionPacket(snapshot)
    deps.progress?.(
      `Harper supervision ${round + 1}/${EDITORIAL_MAX_PASSES}: ${supervision.pending.length} instruction(s) across ${supervision.unmet.join(', ') || 'no remaining'} gates`,
    )

    // Deterministic Harper fixes get first right of refusal. Keep them unless
    // factual tokens shrank — do not discard autofix for Flesch/voice/SEO wobble.
    const fixed = await deps.autofix(content)
    aborted()
    if (fixed.content !== content) {
      if (!editorialFactsShrank(content, fixed.content)) {
        content = fixed.content
        snapshot = measureEditorial(fixed.content, input.hint, await deps.grammar(fixed.content))
        supervision = buildHarperSupervisionPacket(snapshot)
      }
    }

    if (editorialTargetsMet(snapshot)) {
      return result('cleared', 'Harper supervision cleared grammar, SEO, AI-write/human voice and Flesch; final ship audit required.')
    }

    if (reviews >= EDITORIAL_MAX_REVIEWS) {
      const remaining = buildHarperSupervisionPacket(snapshot)
      return result(
        'held',
        `Review already ran ${EDITORIAL_MAX_REVIEWS} times; remaining directives: ${remaining.pending.map((d) => d.id).join(', ') || remaining.unmet.join(', ') || 'none'}.`,
      )
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
    reviews++

    if (candidate.content === content) {
      const remaining = buildHarperSupervisionPacket(snapshot)
      const ids = remaining.pending.map((d) => d.id)
      return candidate.clean && editorialTargetsMet(snapshot)
        ? result('cleared', 'Harper supervision cleared all four editorial gates; final ship audit required.')
        : result('held', `Review model returned no executable edit while ${remaining.unmet.join(', ') || 'editorial'} gate(s) remain (${ids.join(', ') || 'no ids'}). Empty edit is not success.`)
    }

    const checked = measureEditorial(candidate.content, input.hint, await deps.grammar(candidate.content))
    aborted()
    const grammarImproved = (checked.grammar?.errors ?? Infinity) < (snapshot.grammar?.errors ?? Infinity)
    if (reviewIsUnsafe(snapshot, checked) || (!grammarImproved && editorialRegression(snapshot, checked))) {
      const ids = remainingIds(snapshot)
      return result('held', `Revision regressed a Harper-supervised metric; the previous text was retained. Remaining directives: ${ids.join(', ') || 'none'}.`)
    }
    if (seen.has(candidate.content)) {
      return result('held', `Revision cycle detected; the previous text was retained. Remaining directives: ${remainingIds(snapshot).join(', ') || 'none'}.`)
    }
    seen.add(candidate.content)
    content = candidate.content
    snapshot = checked
  }

  const remaining = buildHarperSupervisionPacket(snapshot)
  return result(
    'held',
    `${EDITORIAL_MAX_PASSES} supervised passes completed; remaining directives: ${remaining.pending.map((d) => d.id).join(', ') || remaining.unmet.join(', ') || 'none'}.`,
  )
}
