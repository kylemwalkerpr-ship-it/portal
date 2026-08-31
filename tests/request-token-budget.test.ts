/**
 * Org tokens-per-minute guard: no single provider request (prompt + max_tokens)
 * may exceed the org TPM allowance (Run BiOS: 200k). A request above it is
 * hard-rejected upstream — "retrying will not help" — so the provider layer
 * must clamp max_tokens to fit, and fail fast when the prompt alone can't fit.
 */
import { requestTokenBudget, estimatePromptTokens, clampMaxTokensToBudget } from '../lib/contentAiProvider'

describe('request token budget', () => {
  const budget = requestTokenBudget()

  it('defaults safely under the 200k org TPM limit', () => {
    expect(budget).toBeGreaterThan(0)
    expect(budget).toBeLessThanOrEqual(200_000)
    expect(budget).toBe(195_000)
  })

  it('honors CONTENT_AI_REQUEST_TOKEN_LIMIT override', () => {
    const prev = process.env.CONTENT_AI_REQUEST_TOKEN_LIMIT
    process.env.CONTENT_AI_REQUEST_TOKEN_LIMIT = '100000'
    try {
      expect(requestTokenBudget()).toBe(100_000)
    } finally {
      if (prev === undefined) delete process.env.CONTENT_AI_REQUEST_TOKEN_LIMIT
      else process.env.CONTENT_AI_REQUEST_TOKEN_LIMIT = prev
    }
    expect(requestTokenBudget()).toBe(budget)
  })

  it('estimates prompt tokens from system + user chars/4', () => {
    expect(estimatePromptTokens(undefined, 'abcd')).toBe(1)
    expect(estimatePromptTokens('abcd', 'abcd')).toBe(2)
    expect(estimatePromptTokens('', '')).toBe(0)
  })

  it('keeps max_tokens untouched when the request fits the budget', () => {
    const smallPrompt = 'x'.repeat(4 * 1000) // ~1k tokens
    expect(clampMaxTokensToBudget(16_384, 'system', smallPrompt)).toBe(16_384)
  })

  it('clamps max_tokens so prompt + completion stays under the budget', () => {
    // Prompt estimated at budget - 2k tokens: completion must shrink to ~2k.
    const bigPrompt = 'x'.repeat(4 * (budget - 2_000))
    const clamped = clampMaxTokensToBudget(16_384, undefined, bigPrompt)
    expect(clamped).toBe(2_000)
    expect(estimatePromptTokens(undefined, bigPrompt) + clamped).toBeLessThanOrEqual(budget)
  })

  it('throws when the prompt alone leaves no room for a completion', () => {
    // Prompt estimated at budget - 256 tokens: below the 512-token floor.
    const hugePrompt = 'x'.repeat(4 * (budget - 256))
    expect(() => clampMaxTokensToBudget(16_384, undefined, hugePrompt, 'runbios')).toThrow(
      /prompt exceeds org token limit/,
    )
  })
})
