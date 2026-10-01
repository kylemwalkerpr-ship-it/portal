import { adapterFor, DEEPSEEK_V41_FLASH_PIN, type CommissionedProviderPin } from '@/lib/contentAiRegistry'
import { callSystemSuperGrok, type SystemAssistantTurn } from '@/lib/superGrokAssistant'
import { refreshAiVault } from '@/lib/contentAiProviderCore'

export type YqaaProvider = 'grok' | 'deepseek-v41-flash'
export type YqaaFailureKind = 'timeout' | 'network' | 'rate_limit' | 'server_error' | 'authentication' | 'configuration' | 'invalid_output' | 'other'
export type YqaaFallbackEvidence = { kind: YqaaFailureKind; status: number | null; eligible: boolean }
export type YqaaGenerationResult = { text: string; provider: YqaaProvider; model: string; fallback: boolean; failureEvidence?: YqaaFallbackEvidence }
export type YqaaProviderEnvironment = Readonly<Record<string, string | undefined>>

/** Stable public response label; provider identity stays in server telemetry only. */
export function publicYqaaProviderLabel(): string { return 'system-ai' }

export function configuredYqaaProviders(env: YqaaProviderEnvironment = process.env): { primary: 'grok'; fallback: YqaaProvider | null } {
  const primaryRaw = env.YQAA_PRIMARY_PROVIDER?.trim() || 'grok'
  if (primaryRaw !== 'grok') throw new Error('Grok must remain the YQAA primary provider')
  const fallbackRaw = env.YQAA_FALLBACK_PROVIDER?.trim() || ''
  if (fallbackRaw && fallbackRaw !== DEEPSEEK_V41_FLASH_PIN) throw new Error('Invalid YQAA fallback provider pin')
  return { primary: 'grok', fallback: fallbackRaw ? DEEPSEEK_V41_FLASH_PIN : null }
}

export function classifyYqaaProviderFailure(error: unknown): YqaaFallbackEvidence {
  const message = error instanceof Error ? error.message : String(error || '')
  const statusMatch = message.match(/(?:status\s*[=:]?\s*|responses=|chat=)(\d{3})/i)
  const status = statusMatch ? Number(statusMatch[1]) : null
  let kind: YqaaFailureKind = 'other'
  if (status === 408 || /AbortError|timed? ?out|timeout/i.test(message)) kind = 'timeout'
  else if (status === 401 || status === 403 || /unauthorized|forbidden|auth/i.test(message)) kind = 'authentication'
  else if (status === 429 || /rate.?limit|too many requests/i.test(message)) kind = 'rate_limit'
  else if ((status !== null && (status === 409 || status === 425 || status >= 500)) || /unavailable|capacity|overload/i.test(message)) kind = 'server_error'
  else if (/network|fetch failed|ECONN|socket/i.test(message)) kind = 'network'
  else if (/not configured|credential/i.test(message)) kind = 'configuration'
  else if (/empty|no content|invalid response/i.test(message)) kind = 'invalid_output'
  return { kind, status, eligible: ['timeout', 'network', 'rate_limit', 'server_error'].includes(kind) }
}

async function generateWithProvider(provider: YqaaProvider, system: string, turns: SystemAssistantTurn[]): Promise<{ text: string; model: string }> {
  if (provider === 'grok') {
    const result = await callSystemSuperGrok(system, turns)
    return { text: result.text, model: result.model }
  }
  const adapter = adapterFor(DEEPSEEK_V41_FLASH_PIN as CommissionedProviderPin, {
    system,
    prompt: turns.map((turn) => `${turn.role.toUpperCase()}:\n${turn.content}`).join('\n\n'),
    maxTokens: 1200,
    temperature: 0.2,
    timeoutMs: 10_000,
    strictTimeout: true,
    disableThinking: true,
    exclusive: true,
    skipQualityContract: true,
  })
  const result = await adapter.complete()
  const text = result.text.trim()
  if (!text) throw new Error('DeepSeek returned empty content')
  return { text, model: result.model }
}

/** Provider-neutral YQAA answer seam. Grok remains default; fallback needs an exact server pin. */
export async function generateYqaaAnswer(system: string, turns: SystemAssistantTurn[]): Promise<YqaaGenerationResult> {
  const selection = configuredYqaaProviders()
  try {
    const generated = await generateWithProvider(selection.primary, system, turns)
    return { ...generated, provider: selection.primary, fallback: false }
  } catch (error) {
    const evidence = classifyYqaaProviderFailure(error)
    if (!selection.fallback || !evidence.eligible) throw error

    // YQAA's primary Grok path has its own auth resolver, but the commissioned
    // DeepSeek adapter reads credentials through contentAiEnv(). Hydrate that
    // vault overlay only when an eligible fallback is actually needed so the
    // normal Grok path pays no vault-read latency tax.
    await refreshAiVault()
    const generated = await generateWithProvider(selection.fallback, system, turns)
    return { ...generated, provider: selection.fallback, fallback: true, failureEvidence: evidence }
  }
}
