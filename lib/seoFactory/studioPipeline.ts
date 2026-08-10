/**
 * Canonical Content Studio pipeline.
 *
 * Mirrors the ideology of a research dissertation without academic jargon.
 * Each stage maps to a real SEO workflow:
 *
 * I   Discover — scan all signals, find gaps & opportunities (GSC, radar, insights)
 * II  Research — keywords, search intent, topical authority, competitor landscape
 * III Plan     — brief, target audience, structure, interlinks
 * IV  Draft    — AI generation, pipeline jobs, live stream
 * V   Review   — quality gate, compliance audit, re-audit, fix blockers
 * VI  Approve  — PR, merge to main, deploy monitor
 * VII Track    — publication ledger, canonical verification, GSC position tracking
 */
export type StudioStage = 'discover' | 'research' | 'plan' | 'draft' | 'review' | 'approve' | 'track'

export const DISSERTATION_STAGES: readonly StudioStage[] = [
  'discover', 'research', 'plan', 'draft', 'review', 'approve', 'track',
] as const

/**
 * Old URLs remain valid, but resolve to the chapter that owns the old surface.
 * v1 academic labels (question/brief/defend/publish) map forward;
 * v0 legacy tokens (insights/identify/create/etc.) also resolve.
 *
 * NOTE: the old first-stage key 'research' is deliberately NOT aliased — it
 * collides with the new second-stage canonical key. Old ?tab=research URLs
 * now land on II · Research (keywords & intent), which is the closest
 * semantic match. Users who want the old first stage should use ?tab=discover.
 */
export const LEGACY_STAGE_ALIASES: Readonly<Record<string, StudioStage>> = {
  // v0 legacy tokens
  insights: 'discover', identify: 'discover', survey: 'discover', operations: 'discover',
  define: 'research', investigate: 'research',
  create: 'plan', brief: 'plan', question: 'research',
  write: 'draft', pipeline: 'draft', queue: 'draft',
  // v1 academic labels → new canonical keys
  defend: 'review',
  publish: 'track',
}

export function isStudioStage(value: string | null | undefined): value is StudioStage {
  return !!value && (DISSERTATION_STAGES as readonly string[]).includes(value)
}

export function resolveStudioStage(value: string | null | undefined): StudioStage {
  if (value && LEGACY_STAGE_ALIASES[value]) return LEGACY_STAGE_ALIASES[value]
  return isStudioStage(value) ? value : 'discover'
}

export function stageIndex(stage: StudioStage): number {
  return DISSERTATION_STAGES.indexOf(stage)
}

export function isStageAtOrBefore(stage: StudioStage, availableThrough: StudioStage): boolean {
  return stageIndex(stage) <= stageIndex(availableThrough)
}

/**
 * Return the furthest requested stage whose prerequisite is available, walking
 * backward through the dissertation rather than jumping to an unrelated view.
 */
export function nearestAvailableStage(
  requested: StudioStage,
  available: Readonly<Partial<Record<StudioStage, boolean>>>,
): StudioStage {
  for (let index = Math.min(stageIndex(requested), DISSERTATION_STAGES.length - 1); index >= 0; index -= 1) {
    const candidate = DISSERTATION_STAGES[index]
    if (available[candidate] !== false) return candidate
  }
  return 'discover'
}

/**
 * Keep cannibalization winner/loser selection deterministic when an operator
 * changes the winner after pages have already been inspected. The previous
 * winner becomes a loser, while the newly selected winner is removed from the
 * loser set.
 */
export function transferCompetingWinner(
  previousWinner: string | null | undefined,
  nextWinner: string,
  currentLosers: ReadonlySet<string>,
): { winner: string; losers: Set<string> } {
  const losers = new Set(currentLosers)
  if (previousWinner && previousWinner !== nextWinner) losers.add(previousWinner)
  losers.delete(nextWinner)
  return { winner: nextWinner, losers }
}
