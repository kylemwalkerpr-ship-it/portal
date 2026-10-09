import {
  PLANNER_BRIEF_DRAFT_BUDGET_MS,
  PLANNER_BRIEF_DRAFT_TIMEOUT_MS,
  PlannerDeadlineError,
  withPlannerDeadline,
} from '@/lib/seoEngine/planner'

describe('planner brief drafting deadline', () => {
  it('keeps the drafting pass well inside the 15-minute daily cron envelope', () => {
    expect(PLANNER_BRIEF_DRAFT_TIMEOUT_MS).toBeLessThanOrEqual(60_000)
    // Worst case: the last draft starts just before the budget runs out.
    expect(PLANNER_BRIEF_DRAFT_BUDGET_MS + PLANNER_BRIEF_DRAFT_TIMEOUT_MS).toBeLessThanOrEqual(5 * 60_000)
  })

  it('rejects a hung draft at its deadline instead of waiting for the provider', async () => {
    const hung = new Promise<string>(() => { /* never settles */ })
    const started = Date.now()
    await expect(withPlannerDeadline(50, () => hung)).rejects.toBeInstanceOf(PlannerDeadlineError)
    expect(Date.now() - started).toBeLessThan(2_000)
  })

  it('passes through a draft that finishes in time', async () => {
    await expect(withPlannerDeadline(1_000, async () => 'brief')).resolves.toBe('brief')
  })

  it('passes through provider errors unchanged', async () => {
    await expect(withPlannerDeadline(1_000, async () => { throw new Error('grok 402') })).rejects.toThrow('grok 402')
  })
})
