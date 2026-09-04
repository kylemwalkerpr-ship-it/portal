/**
 * Bounded targeted audit–editor loop (implementation brief §5).
 *
 * Pure orchestration: the caller (route/tests) supplies the deterministic
 * evaluator, optional deterministic repair, and the AI patch provider. The
 * loop itself performs no I/O, never ships, never regenerates the document,
 * and never relaxes a gate. It stops on:
 *
 *  - zero blocking/warning findings            → 'cleared'
 *  - human_only findings                       → 'held_for_review'
 *  - budget exhausted / stalled rounds         → 'held_for_review'
 *  - provider failure                          → 'provider_failed'
 *  - patch rejected (validation/preservation)  → the previous document stays
 *    authoritative; two consecutive rejections hold for review.
 */

import { blocksShip, repairClassFor } from './contentQualityPlaybook'
import { MISSING_OUTLINE_SECTION_CODE } from './outlineCompletion'
import type { ContentSpec } from './contentSpec'
import { validateContentSpec } from './contentSpec'
import { PLAYBOOK_VERSION } from './contentQualityPlaybook'
import { applyEditorPatch, parseEditorPatch, type EditorPatch } from './editorPatch'
import { computeDocumentFingerprint } from './documentFingerprint'

export type LoopSeverity = 'format_blocker' | 'blocker' | 'warning' | 'info' | 'pass'

export type LoopFinding = {
  code: string
  severity: LoopSeverity
  message?: string
  /** Operator-facing fix guidance (may carry a deterministic prescription). */
  fix?: string
}

export type LoopBudget = { maxAiPasses: number; maxDeterministicRepasses: number; stallRounds: number }

/** One named budget — conservative initial values per brief §5.2. */
export const CONTENT_LOOP_BUDGET: LoopBudget = {
  maxAiPasses: 3,
  maxDeterministicRepasses: 3,
  stallRounds: 2,
} as const

export type AuditEditorLoopInput = {
  content: string
  spec: ContentSpec
  playbookVersion?: string
  budget?: Partial<LoopBudget>
}

export type AuditEditorRound = {
  round: number
  beforeHash: string
  openFindings: LoopFinding[]
  deterministicRepairs: string[]
  aiRequest?: { findingCodes: string[]; permittedAnchors: string[] }
  aiResult?: 'applied' | 'rejected_preservation' | 'provider_failure' | 'held'
  afterHash: string
  progress: { blockersReduced: boolean; fingerprintPreserved: boolean }
}

export type AuditEditorLoopResult = {
  content: string
  status: 'cleared' | 'held_for_review' | 'provider_failed'
  rounds: AuditEditorRound[]
  leftoverCodes: string[]
  /**
   * Registered non-blocking findings still present on the returned content
   * (shipEffect 'allow_with_flag' | 'advisory'). Reported for the desk; these
   * never block ship and never trigger another AI pass.
   */
  advisoryCodes: string[]
  specVersion: string
  playbookVersion: string
  stopReason:
    | 'no_open_findings'
    | 'human_only_findings'
    | 'budget_exhausted'
    | 'stalled'
    | 'provider_failed'
    | 'patch_rejected_twice'
    | 'spec_invalid'
    | 'outline_completion_failed'
}

export type AuditEditorLoopDeps = {
  /** Complete deterministic gate stack: quality + audit + depth + links + Ahrefs. */
  evaluate: (content: string) => LoopFinding[]
  /** Deterministic, idempotent repairs (normalizeEditorDocument etc.). */
  deterministicRepair?: (content: string, findings: LoopFinding[]) => { content: string; repairs: string[] }
  /** AI provider: builds and applies a structured EditorPatch. Null = provider failure. */
  requestEditorPatch?: (req: {
    content: string
    findings: LoopFinding[]
    permittedAnchors: string[]
    spec: ContentSpec
  }) => Promise<EditorPatch | null>
}

const OPEN_SEVERITIES: ReadonlySet<LoopSeverity> = new Set(['format_blocker', 'blocker', 'warning'])

/**
 * Findings the loop must act on. Registry `shipEffect` is authoritative:
 * `allow_with_flag` / `advisory` codes are reported but never keep the loop
 * open, because no edit can honestly clear them (a synthesized keyword has no
 * demand evidence to write toward). Previously shipEffect existed only in the
 * registry and no runtime code read it, so these advisory warnings consumed
 * every AI pass and the loop always ended 'stalled' with the same codes.
 */
function isHumanOnly(code: string): boolean {
  try {
    return repairClassFor(code) === 'human_only'
  } catch {
    return false
  }
}

/**
 * Non-blocking AND machine-owned: no edit can honestly clear it, and it does
 * not need a human either. `human_only` non-blocking findings (e.g.
 * `unverified_internal_link`) are NOT advisory in this sense — a person must
 * still verify them, so they stay in the open set and hold for review.
 */
function isUnclearableAdvisory(code: string): boolean {
  return !blocksShip(code) && !isHumanOnly(code)
}

function openFindings(findings: LoopFinding[]): LoopFinding[] {
  return (findings || []).filter((f) => OPEN_SEVERITIES.has(f.severity) && !isUnclearableAdvisory(f.code))
}

/** Advisory findings that remain after the loop — surfaced, never retried. */
function advisoryFindings(findings: LoopFinding[]): LoopFinding[] {
  return (findings || []).filter((f) => OPEN_SEVERITIES.has(f.severity) && isUnclearableAdvisory(f.code))
}

/** Advisory codes the REGISTRY says a writer CAN fix (repairClass targeted_ai).
 *  These never block ship, but they owe the operator one honest AI attempt —
 *  without this, missing_synthesized_* / untrusted_external_link style timers
 *  are permanently unfixable even though the playbook labels them writable. */
function advisoryTargetedFindings(findings: LoopFinding[]): LoopFinding[] {
  return advisoryFindings(findings).filter((f) => {
    try {
      return repairClassFor(f.code) === 'targeted_ai'
    } catch {
      return false
    }
  })
}

/** Findings only a human can resolve — never sent to a model. */
function humanOnlyCodes(findings: LoopFinding[]): string[] {
  return findings
    .filter((f) => {
      try {
        return repairClassFor(f.code) === 'human_only'
      } catch {
        return false
      }
    })
    .map((f) => f.code)
}

export async function runAuditEditorLoop(
  input: AuditEditorInput,
  deps: AuditEditorLoopDeps,
): Promise<AuditEditorLoopResult> {
  const budget: LoopBudget = { ...CONTENT_LOOP_BUDGET, ...(input.budget || {}) }
  const playbookVersion = input.playbookVersion || PLAYBOOK_VERSION

  // 1. Validate ContentSpec and playbook compatibility; refuse unknown version.
  const specIssues = validateContentSpec(input.spec)
  if (specIssues.length || input.spec.version !== playbookVersion) {
    return {
      content: input.content,
      status: 'held_for_review',
      rounds: [],
      leftoverCodes: ['content_spec_invalid'],
      advisoryCodes: [],
      specVersion: String((input.spec as { version?: string })?.version ?? 'unknown'),
      playbookVersion,
      stopReason: 'spec_invalid',
    }
  }

  const rounds: AuditEditorRound[] = []
  let content = input.content
  let aiPasses = 0
  let deterministicRepasses = 0
  let stallCount = 0
  let consecutiveRejections = 0
  let status: AuditEditorLoopResult['status'] = 'held_for_review'
  let stopReason: AuditEditorLoopResult['stopReason'] = 'budget_exhausted'
  let leftoverCodes: string[] = []

  const maxRounds = budget.maxAiPasses + budget.maxDeterministicRepasses + 1

  for (let round = 1; round <= maxRounds; round++) {
    const beforeHash = computeDocumentFingerprint(content).hash
    let findings = openFindings(deps.evaluate(content))

    if (findings.length === 0) {
      // Advisory sweep (2026-09-01): non-blocking codes whose registry
      // repairClass is targeted_ai (synthesized keyword gaps, untrusted
      // external links, …) are excluded from the open set — a leftover stays
      // advisory and a leftover must never force partial blockers to repeat —
      // but the loop still owes them ONE honest AI pass when the budget is
      // untouched, so "Fix All" can genuinely clear them (the writer AI
      // places a long-tail query as an FAQ question) instead of them being
      // permanently unfixable by construction.
      const roundRecord: AuditEditorRound = {
        round, beforeHash, openFindings: [], deterministicRepairs: [],
        aiRequest: undefined, afterHash: beforeHash,
        progress: { blockersReduced: false, fingerprintPreserved: true },
      }
      const advisoryTargeted = advisoryTargetedFindings(deps.evaluate(content))
      if (deps.requestEditorPatch && aiPasses < budget.maxAiPasses && advisoryTargeted.length > 0) {
        aiPasses++
        roundRecord.aiRequest = { findingCodes: advisoryTargeted.map((f) => f.code), permittedAnchors: [] }
        let patch: EditorPatch | null = null
        try {
          patch = await deps.requestEditorPatch({ content, findings: advisoryTargeted, permittedAnchors: [], spec: input.spec })
        } catch {
          patch = null
        }
        if (patch) {
          const applied = applyEditorPatch(content, patch, {
            outstanding: advisoryTargeted.map((f) => ({ code: f.code })),
          })
          if (applied.ok) {
            const after = advisoryTargetedFindings(deps.evaluate(applied.content))
            if (after.length === 0) {
              content = applied.content
              roundRecord.aiResult = 'applied'
              roundRecord.afterHash = computeDocumentFingerprint(content).hash
              findings = openFindings(deps.evaluate(content))
              if (findings.length === 0) {
                rounds.push(roundRecord)
                status = 'cleared'
                stopReason = 'no_open_findings'
                leftoverCodes = []
                break
              }
            }
          } else {
            roundRecord.aiResult = 'rejected_preservation'
          }
        } else {
          roundRecord.aiResult = 'provider_failure'
        }
      }
      rounds.push(roundRecord)
      status = 'cleared'
      stopReason = 'no_open_findings'
      leftoverCodes = []
      break
    }

    // 6. human_only findings route straight to review — never fabricated by a model.
    const human = humanOnlyCodes(findings)
    const automatable = findings.filter((f) => !human.includes(f.code))
    // Human-only evidence must not prevent deterministic/targeted repairs for
    // the rest of the document. Hold only when human-only findings are all
    // that remain.
    if (human.length && automatable.length === 0) {
      rounds.push({
        round, beforeHash, openFindings: findings, deterministicRepairs: [],
        afterHash: beforeHash, progress: { blockersReduced: false, fingerprintPreserved: true },
      })
      status = 'held_for_review'
      stopReason = 'human_only_findings'
      leftoverCodes = findings.map((f) => f.code)
      break
    }

    // 3. Deterministic, idempotent repairs only.
    // Prefer word_count_over_max / other deterministic codes FIRST so a soft
    // overshoot is trimmed even when missing_outline_section will later hold
    // the loop (outline cannot be patched; over-max must still clear).
    let repairs: string[] = []
    if (deps.deterministicRepair && deterministicRepasses < budget.maxDeterministicRepasses) {
      const result = deps.deterministicRepair(content, findings)
      deterministicRepasses++
      if (result.content && result.content !== content) {
        content = result.content
        repairs = result.repairs
        findings = openFindings(deps.evaluate(content))
        if (findings.length === 0) {
          rounds.push({
            round, beforeHash, openFindings: [], deterministicRepairs: repairs,
            afterHash: computeDocumentFingerprint(content).hash,
            progress: { blockersReduced: true, fingerprintPreserved: true },
          })
          status = 'cleared'
          stopReason = 'no_open_findings'
          leftoverCodes = []
          break
        }
      }
    }

    // 7. Targeted AI request: only outstanding targeted_ai codes.
    // missing_outline_section cannot be fixed by EditorPatch (no new headings).
    const outlineMissing = findings.filter((f) => f.code === MISSING_OUTLINE_SECTION_CODE)
    const deterministicOpen = findings.filter((f) => {
      if (f.code === MISSING_OUTLINE_SECTION_CODE) return false
      try {
        return repairClassFor(f.code) === 'deterministic'
      } catch {
        return false
      }
    })
    const targeted = findings.filter((f) => {
      if (f.code === MISSING_OUTLINE_SECTION_CODE) return false
      try {
        return repairClassFor(f.code) === 'targeted_ai'
      } catch {
        return false
      }
    })
    // Deterministic leftovers (esp. word_count_over_max) must get another
    // pass when budget remains — do NOT abort solely on outline failure while
    // an over-max blocker is still open and repairable.
    if (
      deterministicOpen.length
      && deps.deterministicRepair
      && deterministicRepasses < budget.maxDeterministicRepasses
      && (!targeted.length || repairs.length > 0)
    ) {
      rounds.push({
        round, beforeHash, openFindings: findings, deterministicRepairs: repairs,
        afterHash: computeDocumentFingerprint(content).hash,
        progress: { blockersReduced: repairs.length > 0, fingerprintPreserved: true },
      })
      continue
    }
    if (!targeted.length || !deps.requestEditorPatch) {
      const afterHash = computeDocumentFingerprint(content).hash
      rounds.push({
        round, beforeHash, openFindings: findings, deterministicRepairs: repairs,
        afterHash, progress: { blockersReduced: repairs.length > 0, fingerprintPreserved: true },
      })
      status = 'held_for_review'
      leftoverCodes = findings.map((f) => f.code)
      const onlyDeterministic =
        leftoverCodes.length > 0
        && leftoverCodes.every((c) => {
          try {
            return repairClassFor(c) === 'deterministic' || c === MISSING_OUTLINE_SECTION_CODE
          } catch {
            return c === MISSING_OUTLINE_SECTION_CODE
          }
        })
      stopReason = outlineMissing.length
        ? 'outline_completion_failed'
        : onlyDeterministic && leftoverCodes.includes('word_count_over_max')
          ? 'budget_exhausted'
          : human.length
            ? 'human_only_findings'
            : 'budget_exhausted'
      break
    }

    const roundRecord: AuditEditorRound = {
      round,
      beforeHash,
      openFindings: findings,
      deterministicRepairs: repairs,
      aiRequest: { findingCodes: targeted.map((f) => f.code), permittedAnchors: [] },
      afterHash: beforeHash,
      progress: { blockersReduced: false, fingerprintPreserved: true },
    }

    // 7–8. Request and apply the structured patch.
    if (aiPasses >= budget.maxAiPasses) {
      roundRecord.aiResult = 'held'
      rounds.push(roundRecord)
      status = 'held_for_review'
      stopReason = 'budget_exhausted'
      leftoverCodes = findings.map((f) => f.code)
      break
    }
    aiPasses++
    let patch: EditorPatch | null = null
    try {
      patch = await deps.requestEditorPatch({ content, findings: targeted, permittedAnchors: [], spec: input.spec })
    } catch {
      patch = null
    }
    if (!patch) {
      roundRecord.aiResult = 'provider_failure'
      roundRecord.afterHash = beforeHash
      rounds.push(roundRecord)
      status = 'provider_failed'
      stopReason = 'provider_failed'
      leftoverCodes = findings.map((f) => f.code)
      break
    }

    const applied = applyEditorPatch(content, patch, {
      outstanding: targeted.map((f) => ({ code: f.code })),
    })
    if (!applied.ok) {
      consecutiveRejections++
      roundRecord.aiResult = 'rejected_preservation'
      rounds.push(roundRecord)
      if (consecutiveRejections >= 2) {
        status = 'held_for_review'
        leftoverCodes = findings.map((f) => f.code)
        // Outline gaps are not patchable — never report patch_rejected_twice
        // as the only outcome for this finding class.
        const onlyOutline = leftoverCodes.length > 0 && leftoverCodes.every((c) => c === MISSING_OUTLINE_SECTION_CODE)
        stopReason = onlyOutline ? 'outline_completion_failed' : 'patch_rejected_twice'
        break
      }
      continue
    }
    consecutiveRejections = 0

    // 9. Re-run the entire evaluation stack; record before/after progress.
    const prevBlockerCount = findings.filter((f) => f.severity === 'blocker' || f.severity === 'format_blocker').length
    content = applied.content
    const newFindings = openFindings(deps.evaluate(content))
    const newBlockerCount = newFindings.filter((f) => f.severity === 'blocker' || f.severity === 'format_blocker').length
    const fingerprintPreserved = true // applyEditorPatch enforced §5.4 invariants
    const blockersReduced = newBlockerCount < prevBlockerCount || newFindings.length < findings.length
    roundRecord.aiResult = 'applied'
    roundRecord.afterHash = computeDocumentFingerprint(content).hash
    roundRecord.progress = { blockersReduced, fingerprintPreserved }
    rounds.push(roundRecord)

    if (newFindings.length === 0) {
      status = 'cleared'
      stopReason = 'no_open_findings'
      leftoverCodes = []
      break
    }

    stallCount = blockersReduced ? 0 : stallCount + 1
    if (stallCount >= budget.stallRounds) {
      status = 'held_for_review'
      stopReason = 'stalled'
      leftoverCodes = newFindings.map((f) => f.code)
      break
    }
    findings = newFindings
  }

  if (status !== 'cleared' && !leftoverCodes.length) {
    leftoverCodes = openFindings(deps.evaluate(content)).map((f) => f.code)
  }
  return {
    content,
    status,
    rounds,
    leftoverCodes: [...new Set(leftoverCodes)],
    advisoryCodes: [...new Set(advisoryFindings(deps.evaluate(content)).map((f) => f.code))],
    specVersion: input.spec.version,
    playbookVersion,
    stopReason,
  }
}

// Local alias keeps the exported type names aligned with the brief.
type AuditEditorInput = AuditEditorLoopInput
