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
import { assertContentDepth, countBodyWords, depthSpecForType } from './contentDepth'
import { buildDepthAppendPrompt, extractH2Titles } from './prompts'

export type ReauditResponse = {
  ok: boolean; score: number; summary: string
  /** Master Engine gaps the AI fix targeted, in priority order (fix_all /
   *  fix_warnings only). Lets the editor show what the fix was aimed at. */
  enginePriorities?: Array<{ priority: number; subsystem: string; action: string; effort: string; lift: number; confidence: number }>
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
  /** Every quality + link blocker with a remediation. The editor must list
   *  these even when they have no inline evidence, so nothing blocks ship
   *  without a Fix path. */
  blockersData?: Array<{ code: string; message: string; fix?: string }>
  /** Live link-audit findings (placeholder / dead / unverified internal links). */
  linkAudit?: Array<{ code: string; severity: 'blocker' | 'warning'; url: string; message: string; status?: number }>
  /** Depth-mediation plan — tells the editor how far below the floor the
   *  draft is and whether an append-only expansion can clear it (fix_depth). */
  depthMediation?: DepthMediationPlan
}

/**
 * Depth-mediation plan — the pure, testable description of how to clear the
 * Google depth floor AND the word_count_target warning. The editor renders
 * this as "Expand to depth floor" when a draft is below minWords, or "Expand
 * to target depth" when it meets the floor but still sits under the target
 * (the word_count_target warning — e.g. 2380/2200–2500). The fix_depth PATCH
 * action executes the same plan (append-only: preserves everything that
 * passes and adds new H2 sections until the GOAL clears). Returns ok=true
 * when the goal is met so callers can skip AI expansion entirely.
 */
export type DepthMediationPlan = {
  /** True when the draft already meets the goal — nothing to expand. */
  ok: boolean
  message: string
  currentWords: number
  minWords: number
  targetWords: number
  maxWords: number
  /** What we are expanding toward: minWords when below the floor, else
   *  targetWords (clears the word_count_target warning). */
  goalWords: number
  /** True when the hard floor is already met (only the target warning
   *  remains). Lets the UI label the button "target" vs "floor". */
  floorMet: boolean
  /** Word gap to the goal (goalWords - currentWords, ≥0). */
  deficit: number
  /** Append-only expansion prompt (only when !ok). */
  prompt?: string
}

export function depthMediationPlan(
  content: string,
  contentType?: string,
  primaryKeyword?: string,
  region?: string,
): DepthMediationPlan {
  const spec = depthSpecForType(contentType || 'legal_guide')
  const currentWords = countBodyWords(content)
  const floorMet = currentWords >= spec.minWords
  const goalWords = floorMet ? spec.targetWords : spec.minWords
  const deficit = Math.max(0, goalWords - currentWords)
  if (deficit === 0) {
    return {
      ok: true,
      message: floorMet ? 'Depth target met' : 'Depth floor met',
      currentWords,
      minWords: spec.minWords,
      targetWords: spec.targetWords,
      maxWords: spec.maxWords,
      goalWords,
      floorMet,
      deficit: 0,
    }
  }
  const prompt = buildDepthAppendPrompt({
    primaryKeyword: primaryKeyword || 'guide',
    region: region || 'US',
    // The append prompt computes its deficit from minWords — pass the goal so
    // it demands enough new words to clear the floor OR the target warning.
    minWords: goalWords,
    maxWords: spec.maxWords,
    currentWords,
    existingH2s: extractH2Titles(content),
    draftExcerpt: content,
  })
  return {
    ok: false,
    message: floorMet
      ? `Meets the ${spec.minWords}-word floor but under target ~${spec.targetWords} (${currentWords}/${spec.targetWords}). Append-only expansion will add new H2 sections until the target clears.`
      : `Below Google-depth floor: ${currentWords} body words (min ${spec.minWords}, target ~${spec.targetWords}). Append-only expansion will add new H2 sections until the floor clears.`,
    currentWords,
    minWords: spec.minWords,
    targetWords: spec.targetWords,
    maxWords: spec.maxWords,
    goalWords,
    floorMet,
    deficit,
    prompt,
  }
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
  region?: string
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
  blockersData: Array<{ code: string; message: string; fix?: string }>
  /** Depth-mediation plan — floor numbers + deficit so the editor can show
   *  "1813/2200 words" and offer the append-only Expand-to-floor action. */
  depthMediation: DepthMediationPlan
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
  const { content, contentType, primaryKeyword, indexable, requiredShortKeywords, requiredLongTailKeywords, region } = input

  const result = evaluateContentQuality({
    content,
    contentType,
    primaryKeyword,
    indexable,
    requiredShortKeywords,
    requiredLongTailKeywords,
    region,
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
  const blockersData = result.blockers.map((b) => ({
    code: b.code,
    message: b.message,
    fix: b.fix || 'Apply the mechanical repair or Fix blockers.',
  }))
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
    blockersData,
    depthMediation: depthMediationPlan(content, contentType, primaryKeyword),
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
