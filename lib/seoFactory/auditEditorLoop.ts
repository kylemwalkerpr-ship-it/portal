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

import { repairClassFor } from './contentQualityPlaybook'
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

function openFindings(findings: LoopFinding[]): LoopFinding[] {
  return (findings || []).filter((f) => OPEN_SEVERITIES.has(f.severity))
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
      rounds.push({
        round, beforeHash, openFindings: [], deterministicRepairs: [],
        afterHash: beforeHash, progress: { blockersReduced: false, fingerprintPreserved: true },
      })
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
    const targeted = findings.filter((f) => {
      try {
        return repairClassFor(f.code) === 'targeted_ai'
      } catch {
        return false
      }
    })
    if (!targeted.length || !deps.requestEditorPatch) {
      rounds.push({
        round, beforeHash, openFindings: findings, deterministicRepairs: repairs,
        afterHash: beforeHash, progress: { blockersReduced: false, fingerprintPreserved: true },
      })
      status = 'held_for_review'
      stopReason = 'human_only_findings'
      leftoverCodes = findings.map((f) => f.code)
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
        stopReason = 'patch_rejected_twice'
        leftoverCodes = findings.map((f) => f.code)
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
    specVersion: input.spec.version,
    playbookVersion,
    stopReason,
  }
}

// Local alias keeps the exported type names aligned with the brief.
type AuditEditorInput = AuditEditorLoopInput
