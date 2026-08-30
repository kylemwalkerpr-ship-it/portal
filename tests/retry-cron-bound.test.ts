/**
 * retry-cron-bound — regression test for the content-studio-retry 15-minute
 * cancellation (GitHub Actions runs cancelled at timeout-minutes with the
 * curl still waiting on the Worker).
 *
 * Proves:
 *   1. throwIfAborted fires for an aborted signal and is a no-op otherwise.
 *   2. The abort message classifies as 'timeout' via the retry route's
 *      classifyTextFailure regex, so an aborted pipeline requeues through
 *      the normal backoff ladder.
 *   3. parseRetryDeadlineMs enforces the 60s..14min window with a 12-minute
 *      default — always inside the workflow's 15-minute hard wall.
 *   4. runSeoFactoryPipeline with an already-aborted signal throws before
 *      any AI provider call (no planning, no generation, no ship).
 */
import { throwIfAborted, runSeoFactoryPipeline } from '../lib/seoFactory/pipeline'
import { parseRetryDeadlineMs } from '../lib/seoFactory/retryDeadline'

// Mirror of the route's classifyTextFailure timeout branch — if either side
// drifts, an aborted run would be misclassified and pollute the War Room.
const ROUTE_TIMEOUT_RE = /timeout|abort|deadline|ETIMEDOUT/i

jest.mock('../lib/contentAiProvider', () => ({
  generateContentText: jest.fn().mockResolvedValue({ text: '', provider: 'mock', model: 'mock' }),
}))

describe('throwIfAborted (pipeline.ts)', () => {
  it('throws a timeout-classified error for an aborted signal', () => {
    const controller = new AbortController()
    controller.abort()
    expect(() => throwIfAborted(controller.signal, 'refine pass 1')).toThrow(
      /Pipeline aborted at refine pass 1: retry deadline exceeded/,
    )
    const msg = (() => {
      try {
        throwIfAborted(controller.signal, 'ship')
      } catch (e) {
        return e instanceof Error ? e.message : String(e)
      }
      return ''
    })()
    expect(ROUTE_TIMEOUT_RE.test(msg)).toBe(true)
  })

  it('is a no-op for undefined signal and a live signal', () => {
    expect(() => throwIfAborted(undefined, 'ship')).not.toThrow()
    expect(() => throwIfAborted(new AbortController().signal, 'ship')).not.toThrow()
  })
})

describe('parseRetryDeadlineMs (content-studio-retry route)', () => {
  it('defaults to 12 minutes', () => {
    expect(parseRetryDeadlineMs(undefined)).toBe(12 * 60_000)
    expect(parseRetryDeadlineMs('')).toBe(12 * 60_000)
    expect(parseRetryDeadlineMs('not-a-number')).toBe(12 * 60_000)
  })

  it('accepts values in the 60s..14min window', () => {
    expect(parseRetryDeadlineMs('60000')).toBe(60_000)
    expect(parseRetryDeadlineMs('300000')).toBe(300_000)
    expect(parseRetryDeadlineMs(String(14 * 60_000))).toBe(14 * 60_000)
  })

  it('rejects values outside the window (never past the 15-min workflow wall)', () => {
    expect(parseRetryDeadlineMs('10000')).toBe(12 * 60_000)
    expect(parseRetryDeadlineMs(String(15 * 60_000))).toBe(12 * 60_000)
    expect(parseRetryDeadlineMs('999999999')).toBe(12 * 60_000)
  })
})

describe('runSeoFactoryPipeline deadline abort', () => {
  it('throws before any AI call when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      runSeoFactoryPipeline({
        topic: 'uk student visa requirements 2026',
        title: 'UK Student Visa Requirements 2026',
        primaryKeyword: 'uk student visa requirements',
        region: 'UK',
        signal: controller.signal,
      }),
    ).rejects.toThrow(/Pipeline aborted at start: retry deadline exceeded/)
  })
})
