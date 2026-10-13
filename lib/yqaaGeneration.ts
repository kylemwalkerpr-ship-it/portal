import { adapterFor, DEEPSEEK_V41_FLASH_PIN, resolveDeepseekFirstPartyApiKey, type CommissionedProviderPin } from '@/lib/contentAiRegistry'
import { callSystemSuperGrok, type SystemAssistantTurn } from '@/lib/superGrokAssistant'
import { refreshAiVault } from '@/lib/contentAiProviderCore'

export type YqaaProvider = 'grok' | 'deepseek-v41-flash'
export type YqaaFailureKind = 'timeout' | 'network' | 'rate_limit' | 'server_error' | 'authentication' | 'configuration' | 'invalid_output' | 'other'
export type YqaaFallbackEvidence = { kind: YqaaFailureKind; status: number | null; eligible: boolean }
export type YqaaGenerationResult = { text: string; provider: YqaaProvider; model: string; fallback: boolean; failureEvidence?: YqaaFallbackEvidence }
export type YqaaProviderEnvironment = Readonly<Record<string, string | undefined>>
const GROK_GENERATION_BUDGET_MS = 26_000
const COMPACT_RECOVERY_RESERVE_MS = 9_000

function waitForAbortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason || new DOMException('Aborted', 'AbortError'))
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', onAbort)
    const onAbort = () => {
      cleanup()
      reject(signal.reason || new DOMException('Aborted', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
    work.then((value) => { cleanup(); resolve(value) }, (error) => { cleanup(); reject(error) })
  })
}

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
  const errorName = error instanceof Error ? error.name : ''
  const statusMatch = message.match(/(?:status\s*[=:]?\s*|responses=|chat=)(\d{3})/i)
  const status = statusMatch ? Number(statusMatch[1]) : null
  let kind: YqaaFailureKind = 'other'
  if (status === 408 || /AbortError|TimeoutError/i.test(errorName) || /AbortError|timed? ?out|timeout/i.test(message)) kind = 'timeout'
  else if (status === 401 || status === 403 || /unauthorized|forbidden|auth/i.test(message)) kind = 'authentication'
  else if (status === 429 || /rate.?limit|too many requests/i.test(message)) kind = 'rate_limit'
  else if ((status !== null && (status === 409 || status === 425 || status >= 500)) || /unavailable|capacity|overload/i.test(message)) kind = 'server_error'
  else if (/network|fetch failed|ECONN|socket/i.test(message)) kind = 'network'
  else if (/not configured|credential/i.test(message)) kind = 'configuration'
  else if (/empty|no content|invalid response/i.test(message)) kind = 'invalid_output'
  return { kind, status, eligible: ['timeout', 'network', 'rate_limit', 'server_error'].includes(kind) }
}

async function generateWithProvider(provider: YqaaProvider, system: string, turns: SystemAssistantTurn[], signal?: AbortSignal, timeoutMs?: number): Promise<{ text: string; model: string }> {
  if (provider === 'grok') {
    const result = await callSystemSuperGrok(system, turns, { signal, timeoutMs })
    return { text: result.text, model: result.model }
  }
  const adapter = adapterFor(DEEPSEEK_V41_FLASH_PIN as CommissionedProviderPin, {
    system,
    prompt: turns.map((turn) => `${turn.role.toUpperCase()}:\n${turn.content}`).join('\n\n'),
    maxTokens: 1200,
    temperature: 0.2,
    timeoutMs: Math.max(1, Math.min(10_000, timeoutMs ?? 10_000)),
    strictTimeout: true,
    disableThinking: true,
    exclusive: true,
    skipQualityContract: true,
    signal,
  })
  const result = await adapter.complete()
  const text = result.text.trim()
  if (!text) throw new Error('DeepSeek returned empty content')
  return { text, model: result.model }
}

function compactGrokRecoverySystem(system: string): string {
  const value = String(system || '')
  if (value.length <= 10_000) return value
  // Preserve the opening policy/canonical contract and the newest evidence /
  // turn-specific constraints at the end. This retry exists only after the
  // full-prompt Grok path has already failed transiently.
  return `${value.slice(0, 5_000)}\n\n[Recovery prompt compacted after transient provider failure.]\n\n${value.slice(-5_000)}`
}

/** Provider-neutral YQAA answer seam. Grok remains default; fallback needs an exact server pin. */
export async function generateYqaaAnswer(system: string, turns: SystemAssistantTurn[], options: { signal?: AbortSignal } = {}): Promise<YqaaGenerationResult> {
  const selection = configuredYqaaProviders()
  const startedAt = Date.now()
  const deadlineAt = startedAt + GROK_GENERATION_BUDGET_MS
  const controller = new AbortController()
  const abortForParent = () => controller.abort(options.signal?.reason)
  if (options.signal?.aborted) abortForParent()
  else options.signal?.addEventListener('abort', abortForParent, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('YQAA model budget exhausted', 'AbortError')), GROK_GENERATION_BUDGET_MS)
  const remainingMs = () => Math.max(0, deadlineAt - Date.now())
  try {
    if (controller.signal.aborted) throw options.signal?.reason || new DOMException('Aborted', 'AbortError')
    try {
      const primaryBudget = Math.min(
        GROK_GENERATION_BUDGET_MS - COMPACT_RECOVERY_RESERVE_MS,
        Math.max(1, remainingMs() - COMPACT_RECOVERY_RESERVE_MS),
      )
      const generated = await generateWithProvider(selection.primary, system, turns, controller.signal, primaryBudget)
      return { ...generated, provider: selection.primary, fallback: false }
    } catch (error) {
      if (controller.signal.aborted) throw error
      const evidence = classifyYqaaProviderFailure(error)
      if (!evidence.eligible) throw error

      // A transient Grok timeout is common on evidence-heavy live-research
      // turns. Give the commissioned primary one compact recovery attempt before
      // crossing providers. This also keeps YQAA operational when the optional
      // DeepSeek credential has not been provisioned.
      try {
        const recoveryBudget = Math.min(COMPACT_RECOVERY_RESERVE_MS, remainingMs())
        if (recoveryBudget <= 0) throw error
        const recovered = await generateWithProvider('grok', compactGrokRecoverySystem(system), turns, controller.signal, recoveryBudget)
        return { ...recovered, provider: 'grok', fallback: false, failureEvidence: evidence }
      } catch (recoveryError) {
        if (controller.signal.aborted) throw recoveryError
        const recoveryEvidence = classifyYqaaProviderFailure(recoveryError)
        if (!selection.fallback || !recoveryEvidence.eligible) throw recoveryError

        // The commissioned DeepSeek adapter is vault-aware, but YQAA normally
        // reaches Grok without initializing the Content Studio vault. Hydrate it
        // only now, then execute DeepSeek only when a real first-party credential
        // exists. Never turn a missing optional fallback key into the visitor's
        // final error when the actual failure was Grok.
        const fallbackBudget = remainingMs()
        if (fallbackBudget <= 0 || controller.signal.aborted) throw recoveryError
        await waitForAbortable(refreshAiVault(), controller.signal)
        if (controller.signal.aborted || remainingMs() <= 0) throw recoveryError
        if (!resolveDeepseekFirstPartyApiKey()) throw recoveryError
        const generated = await generateWithProvider(selection.fallback, system, turns, controller.signal, remainingMs())
        return { ...generated, provider: selection.fallback, fallback: true, failureEvidence: recoveryEvidence }
      }
    }
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', abortForParent)
  }
}
