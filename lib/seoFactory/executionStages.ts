/**
 * Content Studio execution stage plus independent editorial / publication /
 * verification states. Do not overload one legacy status column.
 */

export type ExecutionStage =
  | 'discovered'
  | 'researching'
  | 'evidence_ready'
  | 'brief_ready'
  | 'drafting'
  | 'editorial_review'
  | 'ready_for_approval'
  | 'approved'
  | 'pr_open'
  | 'checks_passed'
  | 'merged'
  | 'deploying'
  | 'live_verified'
  | 'measuring'
  | 'needs_research'
  | 'brief_invalid'
  | 'revision_required'
  | 'blocked_supply'
  | 'ci_failed'
  | 'deployment_failed'
  | 'verification_failed'

export type StageTransition = {
  from: ExecutionStage | null
  to: ExecutionStage
  actor: string
  reason: string
  inputHash?: string
  outputHash?: string
  attempt: number
  at: string
}

export function recordStageTransition(input: Omit<StageTransition, 'at'>): StageTransition {
  return { ...input, at: new Date().toISOString() }
}

export function isRecoverableStop(stage: ExecutionStage): boolean {
  return (
    stage === 'needs_research' ||
    stage === 'brief_invalid' ||
    stage === 'revision_required' ||
    stage === 'blocked_supply' ||
    stage === 'ci_failed' ||
    stage === 'deployment_failed' ||
    stage === 'verification_failed'
  )
}
