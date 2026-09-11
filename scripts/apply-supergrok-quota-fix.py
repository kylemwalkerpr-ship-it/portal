from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


provider_path = Path("lib/contentAiProvider.ts")
text = provider_path.read_text()

old = """/** 524s and exhausted quotas should not be retried against the same provider. */
function isNoRetryProviderError(value: unknown): boolean {"""
new = """/** xAI's subscription proxy uses this exact 402 diagnosis when the
 * connected SuperGrok account is authenticated but its Grok Build allowance
 * cannot serve another inference request. Keep this distinct from developer
 * API team credits: the recovery actions are different. */
export function isGrokBuildUsageExhausted(value: unknown): boolean {
  const message = value instanceof Error ? value.message : String(value || '')
  return /grok build usage balance exhausted|grok build.*usage.*(?:balance|quota).*exhausted|usage balance exhausted/i.test(message)
}

function isSuperGrokSubscriptionMode(): boolean {
  return env('XAI_AUTH_MODE').toLowerCase() === 'supergrok'
}

function grokQuotaGuidance(value: unknown): string {
  if (!isPaymentOrQuotaFailure(value) && !isGrokBuildUsageExhausted(value)) return ''
  if (isSuperGrokSubscriptionMode() || isGrokBuildUsageExhausted(value)) {
    return ' The connected SuperGrok account is authenticated, but its Grok Build usage balance is exhausted. Check Grok Settings → Usage for the reset time or add Extra Usage Credits. Reconnecting SuperGrok will not restore usage.'
  }
  return ' The xAI developer API key has hit a billing or credit limit. Check xAI API billing/credits or connect SuperGrok.'
}

/** 524s and exhausted quotas should not be retried against the same provider. */
function isNoRetryProviderError(value: unknown): boolean {"""
text = replace_once(text, old, new, "insert Grok Build quota helpers")

old = """/** Keep provider diagnostics useful without surfacing auth/token fingerprints. */
function formatProviderFailure(label: string, status: number, body: string): string {
  if (isDailyQuotaError(body)) {
    return `${label} ${status}: daily Workers AI free allocation exhausted; retry after the UTC quota reset or configure paid Workers AI`
  }
  if (status === 524 || /gateway timeout|upstream.*timeout/i.test(body)) {
    return `${label} ${status}: upstream gateway timeout; try again later or use another configured provider`
  }
  return `${label} ${status}: ${body.slice(0, 400)}`
}"""
new = """/** Keep provider diagnostics useful without surfacing auth/token fingerprints. */
function formatProviderFailure(label: string, status: number, body: string): string {
  const grokFailure = /^grok(?:\\s|$)/i.test(label)
  if (grokFailure && (status === 402 || isGrokBuildUsageExhausted(body))) {
    if (isSuperGrokSubscriptionMode() || isGrokBuildUsageExhausted(body)) {
      return `${label} ${status}: Grok Build usage balance exhausted for the connected SuperGrok account. Check Grok Settings → Usage for the reset time or add Extra Usage Credits; reconnecting SuperGrok will not restore usage`
    }
    return `${label} ${status}: xAI developer API billing or credit limit reached; check xAI API billing/credits`
  }
  if (grokFailure && status === 522) {
    return `${label} ${status}: SuperGrok subscription proxy timed out before xAI returned a result; this is a transport timeout, not proof that OAuth is disconnected or that a quota reset is required`
  }
  if (isDailyQuotaError(body)) {
    return `${label} ${status}: daily Workers AI free allocation exhausted; retry after the UTC quota reset or configure paid Workers AI`
  }
  if (status === 524 || /gateway timeout|upstream.*timeout/i.test(body)) {
    return `${label} ${status}: upstream gateway timeout; try again later or use another configured provider`
  }
  return `${label} ${status}: ${body.slice(0, 400)}`
}"""
text = replace_once(text, old, new, "normalize Grok HTTP failures")

old = """/** Unpaid / quota / billing failures — SuperGrok is the studio-wide second option. */
export function isPaymentOrQuotaFailure(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '')
  return /insufficient_quota|unpaid|payment.?required|\\b402\\b|billing|past.?due|credit.?exhausted|requires.?payment|account.?not.?funded|quota.?exceeded|exceeded.?your.?current.?quota|You exceeded your current quota|permission-denied|spending.?limit|monthly.?spending|used all available credits|purchase more credits|raise yo/i.test(msg)
}"""
new = """/** Unpaid / quota / billing failures across developer APIs and subscription-backed Grok Build. */
export function isPaymentOrQuotaFailure(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '')
  return /insufficient_quota|unpaid|payment.?required|\\b402\\b|billing|past.?due|credit.?exhausted|requires.?payment|account.?not.?funded|quota.?exceeded|exceeded.?your.?current.?quota|You exceeded your current quota|permission-denied|spending.?limit|monthly.?spending|used all available credits|purchase more credits|raise yo|usage.?balance.?exhausted|grok.?build.*exhausted/i.test(msg)
}

function quotaFailureSummary(errors: string[]): { note: string; nextStep: string } {
  if (errors.some(isGrokBuildUsageExhausted)) {
    return {
      note: ' Grok Build usage balance is exhausted for the connected SuperGrok account. Check Grok Settings → Usage for the reset time or add Extra Usage Credits.',
      nextStep: ' Configure another provider or retry after the Grok Build usage reset.',
    }
  }
  if (errors.some(isDailyQuotaError)) {
    return {
      note: ' Cloudflare Workers AI daily free allocation is exhausted; it will not recover through retries.',
      nextStep: ' Configure another provider or retry after the UTC quota reset.',
    }
  }
  if (errors.some((error) => isPaymentOrQuotaFailure(error))) {
    return {
      note: ' A provider billing or quota limit was reached.',
      nextStep: ' Configure another provider or retry after that provider restores capacity.',
    }
  }
  return {
    note: '',
    nextStep: ' Retry the request or configure another provider.',
  }
}"""
text = replace_once(text, old, new, "classify subscription usage exhaustion")

old = """        const err = ev.error && typeof ev.error === 'object'
          ? String((ev.error as { message?: string }).message || 'stream failed')
          : 'grok stream failed'
        throw new Error(`grok: ${err}`)"""
new = """        const err = ev.error && typeof ev.error === 'object'
          ? String((ev.error as { message?: string }).message || 'stream failed')
          : 'grok stream failed'
        throw new Error(
          isGrokBuildUsageExhausted(err)
            ? formatProviderFailure('grok', 402, err)
            : `grok: ${err}`,
        )"""
text = replace_once(text, old, new, "normalize Grok SSE quota failure")

old = """        const grokQuotaHint =
          prefer === 'grok' && isPaymentOrQuotaFailure(e)
            ? ' A SuperGrok chat subscription is not xAI API team credits (api.x.ai). Raise the API spend limit or pin Entrim DeepSeek/Qwen. '
            : ' Check the API key and model in repo secrets or the AI Key Vault (Command Center → Configure). '
"""
new = """        const grokQuotaHint =
          prefer === 'grok' && isPaymentOrQuotaFailure(e)
            ? grokQuotaGuidance(e)
            : ' Check the API key and model in repo secrets or the AI Key Vault (Command Center → Configure). '
"""
text = replace_once(text, old, new, "replace non-stream Grok quota guidance")

old = """            const grokQuotaHint =
              prefer === 'grok' && isPaymentOrQuotaFailure(e)
                ? ' A SuperGrok chat subscription is not xAI API team credits (api.x.ai). Raise the API spend limit or pin Entrim DeepSeek/Qwen.'
                : ''
"""
new = """            const grokQuotaHint =
              prefer === 'grok' && isPaymentOrQuotaFailure(e)
                ? grokQuotaGuidance(e)
                : ''
"""
text = replace_once(text, old, new, "replace stream Grok quota guidance")

old = """  const quotaNote = errors.some(isDailyQuotaError)
    ? ' Cloudflare Workers AI daily free allocation is exhausted; it will not recover through retries.'
    : ''
  throw new Error(
    `All content AI providers failed. ${errors.map((e) => e.slice(0, 180)).join(' | ')}.${quotaNote} Configure another provider or retry after the affected quota resets.`,
  )"""
new = """  const failureSummary = quotaFailureSummary(errors)
  throw new Error(
    `All content AI providers failed. ${errors.map((e) => e.slice(0, 180)).join(' | ')}.${failureSummary.note}${failureSummary.nextStep}`,
  )"""
text = replace_once(text, old, new, "replace non-stream final failure summary")

old = """  const quotaNote = errors.some(isDailyQuotaError)
    ? ' Cloudflare Workers AI daily free allocation is exhausted; it will not recover through retries.'
    : ''
  throw new Error(
    errors.length
      ? `All content AI stream providers failed. ${errors.map((e) => e.slice(0, 180)).join(' | ')}.${quotaNote} Configure another provider or retry after the affected quota resets.`
      : 'No live content AI provider configured for streaming — the live policy (Entrim + Grok) requires ENTRIM_API_KEY / XAI_API_KEY.',
  )"""
new = """  const failureSummary = quotaFailureSummary(errors)
  throw new Error(
    errors.length
      ? `All content AI stream providers failed. ${errors.map((e) => e.slice(0, 180)).join(' | ')}.${failureSummary.note}${failureSummary.nextStep}`
      : 'No live content AI provider configured for streaming — the live policy (Entrim + Grok) requires ENTRIM_API_KEY / XAI_API_KEY.',
  )"""
text = replace_once(text, old, new, "replace stream final failure summary")

provider_path.write_text(text)


test_path = Path("tests/grok-responses-brief.test.ts")
test = test_path.read_text()

old = """  generateContentText,
  grokModelId,
  grokRequestLimits,
  isPaymentOrQuotaFailure,"""
new = """  generateContentText,
  generateContentTextStream,
  grokModelId,
  grokRequestLimits,
  isGrokBuildUsageExhausted,
  isPaymentOrQuotaFailure,"""
test = replace_once(test, old, new, "extend Grok test imports")

old = "  const envKeys = ['XAI_API_KEY', 'XAI_MODEL', 'OPENAI_API_KEY', 'CONTENT_AI_RETRY'] as const"
new = "  const envKeys = ['XAI_API_KEY', 'XAI_MODEL', 'XAI_AUTH_MODE', 'XAI_BASE_URL', 'ENTRIM_API_KEY', 'OPENAI_API_KEY', 'CONTENT_AI_RETRY'] as const"
test = replace_once(test, old, new, "preserve quota-test env vars")

old = """    expect(isPaymentOrQuotaFailure(new Error('You exceeded your current quota'))).toBe(true)
    expect(isPaymentOrQuotaFailure(new Error('timeout'))).toBe(false)"""
new = """    expect(isPaymentOrQuotaFailure(new Error('You exceeded your current quota'))).toBe(true)
    expect(isPaymentOrQuotaFailure(new Error('API error (status 402 Payment Required): Grok Build usage balance exhausted'))).toBe(true)
    expect(isGrokBuildUsageExhausted(new Error('Grok Build usage balance exhausted'))).toBe(true)
    expect(isGrokBuildUsageExhausted(new Error('gateway timeout'))).toBe(false)
    expect(isPaymentOrQuotaFailure(new Error('timeout'))).toBe(false)"""
test = replace_once(test, old, new, "add Grok Build quota classifier coverage")

marker = "  it('a grok pin calls /v1/responses with grok-4.6 (live transport)', async () => {"
addition = """  it('reports SuperGrok Build 402 as subscription usage exhaustion, not developer API credits', async () => {
    process.env.XAI_API_KEY = 'supergrok-oauth-token'
    process.env.XAI_AUTH_MODE = 'supergrok'
    process.env.XAI_MODEL = 'grok-4.6'
    process.env.CONTENT_AI_RETRY = '1'
    delete process.env.ENTRIM_API_KEY

    global.fetch = jest.fn(async () => new Response(
      JSON.stringify({ message: 'API error (status 402 Payment Required): Grok Build usage balance exhausted' }),
      { status: 402, headers: { 'content-type': 'application/json' } },
    )) as typeof fetch

    await expect(generateContentText({
      aiProvider: 'grok',
      exclusive: true,
      system: 'Reply OK.',
      prompt: 'ok',
    })).rejects.toThrow(/Grok Build usage balance exhausted.*Grok Settings.*Usage/i)

    try {
      await generateContentText({
        aiProvider: 'grok',
        exclusive: true,
        system: 'Reply OK.',
        prompt: 'ok',
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      expect(message).not.toMatch(/not xAI API team credits|Raise the API spend limit/i)
    }
  })

  it('does not describe a SuperGrok 522 transport timeout as a quota reset', async () => {
    process.env.XAI_API_KEY = 'supergrok-oauth-token'
    process.env.XAI_AUTH_MODE = 'supergrok'
    process.env.XAI_MODEL = 'grok-4.6'
    process.env.CONTENT_AI_RETRY = '1'
    delete process.env.ENTRIM_API_KEY

    global.fetch = jest.fn(async () => new Response('error code: 522', { status: 522 })) as typeof fetch

    let message = ''
    try {
      await generateContentText({
        system: 'Reply OK.',
        prompt: 'ok',
      })
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    expect(message).toMatch(/SuperGrok subscription proxy timed out/i)
    expect(message).not.toMatch(/affected quota resets/i)
  })

  it('reports the same SuperGrok Build quota diagnosis on the streaming path', async () => {
    process.env.XAI_API_KEY = 'supergrok-oauth-token'
    process.env.XAI_AUTH_MODE = 'supergrok'
    process.env.XAI_MODEL = 'grok-4.6'
    process.env.CONTENT_AI_RETRY = '1'
    delete process.env.ENTRIM_API_KEY

    global.fetch = jest.fn(async () => new Response(
      JSON.stringify({ message: 'Grok Build usage balance exhausted' }),
      { status: 402, headers: { 'content-type': 'application/json' } },
    )) as typeof fetch

    const consume = async () => {
      for await (const _event of generateContentTextStream({
        aiProvider: 'grok',
        exclusive: true,
        system: 'Reply OK.',
        prompt: 'ok',
      })) { /* consume */ }
    }
    await expect(consume()).rejects.toThrow(/Grok Build usage balance exhausted.*Grok Settings.*Usage/i)
  })

"""
if test.count(marker) != 1:
    raise SystemExit(f"insert quota regression tests: expected one marker, found {test.count(marker)}")
test = test.replace(marker, addition + marker, 1)
test_path.write_text(test)
