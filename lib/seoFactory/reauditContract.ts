/**
 * Re-audit response contract — the pure, testable core of the
 * /api/content-studio/reaudit route.
 *
 * POST and PATCH both assemble the same response shape:
 *
 *   ok / score / summary       → quality gate (voice · tone · compliance)
 *   annotations                → inline blockers + warnings located in the draft
 *   blockers / warnings counts → gate + audit
 *   warningsData               → quality + audit warnings merged (deduped)
 *   depthGate                  → Google depth floor (the OTHER hard ship gate)
 *   shipReady                  → BOTH gates pass — warnings never block
 *
 * Everything in this module is pure (no DB, no network, no AI) so the exact
 * contract the editor renders can be unit-tested without spinning up the route
 * or mocking providers.
 */

import { evaluateContentQuality } from './contentQualityGate'
import { auditContent } from './audit'
import { findingToAnnotations, mergeWarnings, type InlineAnnotation } from './inlineAnnotations'
import { assertContentDepth } from './contentDepth'

export type ReauditResponse = {
  ok: boolean; score: number; summary: string
  annotations: InlineAnnotation[]; blockers: number; warnings: number
  fixedContent?: string
  appliedRepairs?: string[]
  /** True when BOTH the quality gate and the Google depth floor pass — the
   *  two gates that gate ship. Warnings never block; this makes that visible. */
  shipReady?: boolean
  depthGate?: { ok: boolean; message: string }
  /** Merged quality + audit warnings (audit covers indexability: schema,
   *  meta description, internal links, AI-answer block…). Every entry is
   *  AI-fixable via the fix_warnings action. */
  warningsData?: Array<{ code: string; message: string; fix?: string }>
}

/** Google depth floor — the OTHER hard ship gate. The editor previously only
 *  ran the quality gate, so a draft could read "100/100 PASSED" while ship was
 *  refused on depth. Shared by POST + PATCH so both report the true blocker. */
export function checkDepthGate(
  content: string,
  contentType?: string,
  indexable?: boolean,
): { ok: boolean; message: string } {
  try {
    assertContentDepth({ content, contentType: contentType || 'legal_guide', indexable })
    return { ok: true, message: 'Depth floor met' }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error
        ? e.message.replace(/^Ship refused — content depth \(Google SEO floor\):\n- /, '')
        : 'Content below the Google depth floor',
    }
  }
}

export type ReauditContractInput = {
  content: string
  contentType?: string
  primaryKeyword?: string
  indexable?: boolean
  requiredShortKeywords?: string[]
  requiredLongTailKeywords?: string[]
}

/** The contract fields that POST + PATCH both return (route adds
 *  fixedContent / appliedRepairs on top when repairs were applied). */
export type ReauditContractOutput = {
  ok: boolean
  score: number
  summary: string
  annotations: InlineAnnotation[]
  blockers: number
  warnings: number
  shipReady: boolean
  depthGate: { ok: boolean; message: string }
  warningsData: Array<{ code: string; message: string; fix?: string }>
}

/**
 * Evaluate a draft and build the re-audit response contract:
 *
 *  1. quality gate  → ok / humanScore / summary + blockers + warnings
 *  2. every finding  → zero-or-more inline annotations (evidence-less
 *     warnings still get a document-level anchor so they stay fixable)
 *  3. audit          → indexability scorecard (schema, meta, internal links…);
 *     audit-only warnings are ALSO annotated so each gets a per-warning AI Fix
 *     button in the issues panel, not just the "Fix all warnings" sweep
 *  4. warningsData   → quality + audit warnings merged, quality preferred on
 *     code collisions (it carries remediation)
 *  5. depthGate      → Google depth floor
 *  6. shipReady      → quality.ok && depthGate.ok — warnings never block
 */
export function evaluateReauditContract(input: ReauditContractInput): ReauditContractOutput {
  const { content, contentType, primaryKeyword, indexable, requiredShortKeywords, requiredLongTailKeywords } = input

  const result = evaluateContentQuality({
    content,
    contentType,
    primaryKeyword,
    indexable,
    requiredShortKeywords,
    requiredLongTailKeywords,
  })

  const annotations: InlineAnnotation[] = []
  for (const b of result.blockers) annotations.push(...findingToAnnotations(content, b))
  for (const w of result.warnings) annotations.push(
    ...findingToAnnotations(content, { ...w, severity: 'warning' as const }),
  )

  // Merge quality + audit warnings so indexability warnings (schema_article,
  // schema_faq, meta_description, internal_links, ai_answer_block…) are ALSO
  // resolvable from the editor — not just the voice/tone warnings.
  const audit = auditContent({
    content,
    contentType: contentType || 'legal_guide',
    primaryKeyword,
    indexable,
  })
  // Audit-only warnings (indexability family) must ALSO get inline annotations
  // so the issues panel renders a per-warning AI Fix button for them — not
  // just the "Fix all warnings" sweep. Skip codes the quality gate already
  // annotated (blockers AND warnings) so the same finding never appears twice
  // in the panel.
  const qualityCodes = new Set([...result.blockers, ...result.warnings].map((w) => w.code))
  for (const w of audit.warnings) {
    if (qualityCodes.has(w.code)) continue
    annotations.push(...findingToAnnotations(content, { ...w, severity: 'warning' as const }))
  }
  const warningsData = mergeWarnings(result.warnings, audit.warnings)
  const depthGate = checkDepthGate(content, contentType, indexable)

  return {
    ok: result.ok,
    score: result.humanScore,
    summary: result.summary,
    // Bound the payload, but NEVER starve a distinct finding code entirely: a
    // single blocker can fan out 40+ repeat annotations (e.g. outcome_promise
    // matches every sentence), which used to push audit-only warnings past the
    // cap and out of the issues panel. Distinct codes keep a button; repeats
    // are capped per code so the panel stays scannable.
    annotations: capAnnotations(annotations, 60, 3),
    blockers: result.blockers.length,
    warnings: warningsData.length,
    shipReady: result.ok && depthGate.ok,
    depthGate,
    warningsData,
  }
}

/** Bound an annotation list while guaranteeing every distinct code keeps at
 *  least one entry. Repeat annotations of the same code are capped at
 *  `repeatsPerCode` (3) so a flooding blocker can't bury the issues panel in
 *  identical buttons. The cap is a SOFT bound: when distinct codes alone
 *  exceed it, all of them survive rather than starving a finding type. */
export function capAnnotations(list: InlineAnnotation[], cap: number, repeatsPerCode = 3): InlineAnnotation[] {
  const seen = new Set<string>()
  const first: InlineAnnotation[] = []
  const rest: InlineAnnotation[] = []
  for (const a of list) {
    if (!seen.has(a.code)) {
      seen.add(a.code)
      first.push(a)
    } else {
      rest.push(a)
    }
  }
  const out = [...first]
  const perCode = new Map<string, number>()
  for (const a of first) perCode.set(a.code, 1)
  for (const a of rest) {
    const n = perCode.get(a.code) ?? 0
    if (n >= repeatsPerCode) continue
    perCode.set(a.code, n + 1)
    out.push(a)
    if (out.length >= cap) break
  }
  return out
}
