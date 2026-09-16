/**
 * Content-generation AI provider for Content Studio / SEO Factory.
 *
 * COMMISSIONED POLICY (P2, 2026-09-15, registry-derived):
 *   1. Grok 4.6 (`grok`, api.x.ai/v1 / SuperGrok) — retained xAI transport.
 *   2. DeepSeek V4.1 Flash (`deepseek-v41-flash`, https://api.deepseek.com/v1
 *      ONLY, upstream model id `deepseek-flash`) — first-party transport.
 *
 * Exactly these two providers may register or execute; `adapterFor` is the
 * only transport factory. The retired hosts (Entrim / NVIDIA / Baseten /
 * Parasail / Run BiOS / OpenAI / Cloudflare / Groq / Gemini / OpenRouter /
 * DeepSeek.com aliases) were purged in P3 (2026-09-16): their transports no
 * longer exist in this module. A legacy/unknown pin is a typed
 * selection-required failure (`ProviderSelectionRequiredError`, 409) with
 * ZERO outbound requests — no redirect, no break-glass restore, no
 * cross-provider fallback.
 *
 * Owner model: when `aiProvider` names a commissioned pin (or a Grok alias),
 * the call stays on that provider — no capacity cascade to another backend.
 * Empty/'auto' resolves to the lane default (Grok 4.6).
 */

import { qualityPromptBlock } from './seoFactory/contentQualityGate'
import {
  canonicalizeRunbiosPin,
  isRunbiosPin,
  runbiosSlot,
  RUNBIOS_SLOTS,
} from './runbiosCatalog'
import {
  decodeJwtSubject,
  grokInferenceBaseUrl,
  isXaiDeveloperApiKey,
  superGrokProxyHeaders,
  XAI_CLI_CHAT_PROXY_BASE_URL,
} from './xaiGrokTransport'
import {
  COMMISSIONED_PROVIDERS,
  ProviderSelectionRequiredError,
  adapterFor,
  isCommissionedPin,
  resolveExecutionProvider,
  type CommissionedProviderPin,
  type ContentProviderAdapter,
  type StudioLane,
} from './contentAiRegistry'

/** Default output budget — long-form guides need ~2k words (~3–4k tokens). */
const DEFAULT_MAX_TOKENS = 8192
const DEFAULT_TEMPERATURE = 0.65

/** Legacy Entrim Qwen pin aliases. Retained only because the exported legacy
 *  `resolveAiProviderPin` alias map still names them for callers/tests; they
 *  are NOT executable — no Entrim transport remains in this module. */
export const ENTRIM_QWEN_LABEL = 'entrim-qwen-27b'
export const ENTRIM_QWEN_MODEL = 'Qwen/Qwen3.6-27B'

/**
 * COMMISSIONED PROVIDER POLICY (P2, 2026-09-15) — registry-derived.
 *
 * The registry owns provider identity; this module may only register or
 * execute `COMMISSIONED_PROVIDERS` through `adapterFor`. Every retired
 * transport in this file is inert: it is unreachable from the registration
 * tables, and a legacy/unknown pin fails closed with a typed
 * selection-required error before any configuration or network work.
 */
/** All commissioned adapters (registration is code-level, not env-gated). */
function commissionedAdapters(opts: ContentAiOptions): Map<CommissionedProviderPin, ContentProviderAdapter> {
  const adapters = new Map<CommissionedProviderPin, ContentProviderAdapter>()
  for (const provider of COMMISSIONED_PROVIDERS) {
    adapters.set(provider.pin, adapterFor(provider.pin, opts))
  }
  return adapters
}

/**
 * Runtime registration introspection (design §3.2, §11): the registered
 * completer and stream-candidate pins, independent of env/keys. Retired
 * transports can never appear because they are never passed to `adapterFor`.
 */
export function registeredContentProviderPins(): { completers: string[]; streamCandidates: string[] } {
  const adapters = commissionedAdapters({ system: '', prompt: '' })
  const completers: string[] = []
  const streamCandidates: string[] = []
  for (const provider of COMMISSIONED_PROVIDERS) {
    const adapter = adapters.get(provider.pin)
    if (adapter && typeof adapter.complete === 'function') completers.push(provider.pin)
    if (adapter && typeof adapter.stream === 'function') streamCandidates.push(provider.pin)
  }
  return { completers, streamCandidates }
}

/**
 * Execution doors carry no lane parameter. Every lane default is Grok, so the
 * canonical registry selector runs with a fixed internal lane instead of this
 * module maintaining a second provider-selection policy.
 */
const EXECUTION_SELECTION_LANE: StudioLane = 'draft'

/** Configured commissioned pins, for operator-facing failure diagnostics. */
function configuredCommissionedPins(): string[] {
  return COMMISSIONED_PROVIDERS.filter((provider) => provider.isConfigured()).map((provider) => provider.pin)
}

/** Failed-closed diagnostic when the selected commissioned pin has no credential. */
function commissionedNotConfiguredError(pin: CommissionedProviderPin): Error {
  const provider = COMMISSIONED_PROVIDERS.find((candidate) => candidate.pin === pin)
  const keyEnvs = provider?.keyEnvs.join(' or ') || 'the provider credential'
  const configured = configuredCommissionedPins().join(', ') || 'none'
  return new Error(
    `Selected AI provider "${pin}" is not configured. ` +
    `Set ${keyEnvs} in the environment or the AI Key Vault (Command Center → Configure). ` +
    `Currently configured commissioned providers: ${configured}.`,
  )
}

/**
 * The single commissioned adapter for this execution (exclusive owner).
 * Takes the ALREADY-resolved pin: the doors resolve selection before any
 * vault/OAuth work, then pass the resolved pin here so it is never resolved
 * a second time after refresh.
 */
function commissionedAdapterFor(pin: CommissionedProviderPin, opts: ContentAiOptions): ContentProviderAdapter {
  const adapter = adapterFor(pin, opts)
  if (!adapter.isConfigured()) throw commissionedNotConfiguredError(pin)
  return adapter
}
/**
 * Org tokens-per-minute ceiling. Providers that meter each request as
 * prompt + max_tokens against a shared org TPM allowance (Run BiOS: 200k)
 * hard-reject any single request above it — "retrying will not help".
 * Keep every outgoing request safely under the limit:
 *   1. clamp max_tokens so estimate + max_tokens fits the budget;
 *   2. fail fast with a clear error if the prompt alone cannot fit.
 * Default leaves a safety margin under the 200k org limit for estimate
 * error; CONTENT_AI_REQUEST_TOKEN_LIMIT overrides for other org tiers.
 */
export function requestTokenBudget(): number {
  const raw = Number.parseInt(process.env.CONTENT_AI_REQUEST_TOKEN_LIMIT || '', 10)
  return raw > 0 ? raw : 195_000
}

/** Rough token estimate (chars/4) for a system+user prompt pair. */
export function estimatePromptTokens(system: string | undefined, prompt: string): number {
  return Math.ceil(((system || '').length + (prompt || '').length) / 4)
}

/**
 * Clamp max_tokens so the estimated request stays under the org TPM budget.
 * Throws when the prompt alone leaves no room for a minimal completion —
 * that request can never succeed and must fail fast (not retry).
 */
export function clampMaxTokensToBudget(
  maxTokens: number,
  system: string | undefined,
  prompt: string,
  label?: string,
): number {
  const budget = requestTokenBudget()
  const est = estimatePromptTokens(system, prompt)
  if (est + maxTokens <= budget) return maxTokens
  const clamped = budget - est
  if (clamped < 512) {
    throw new Error(
      `${label || 'content AI'} prompt exceeds org token limit (estimated ~${est.toLocaleString()} tokens, budget ${budget.toLocaleString()}) — reduce the prompt size`,
    )
  }
  console.warn(
    `[contentAi] ${label || 'provider'} max_tokens clamped ${maxTokens} → ${clamped} to stay under the ${budget.toLocaleString()} token request limit (prompt est. ~${est.toLocaleString()})`,
  )
  return clamped
}

export interface ContentAiResult {
  text: string
  provider: string
  model: string
}

export interface ContentAiOptions {
  system: string
  prompt: string
  maxTokens?: number
  temperature?: number
  /** Admin-chosen provider pin (e.g. 'grok', 'openai', 'nvidia-deepseek', 'auto'). */
  aiProvider?: string
  /** Override the provider's default model (e.g. 'gpt-5.6-terra' for Research). */
  model?: string
  /** Per-call deadline override (ms). Brief generation uses 45s; depth
   *  rescue uses the default 180s. When unset, COMPLETE_TIMEOUT_MS applies. */
  timeoutMs?: number
  /** Exclusive pin: only the selected provider may serve this request — no
   *  cascade fallback to other backends. Used by the Research/Plan brief so
   *  OpenAI ChatGPT alone is responsible (2026-08 policy). When true and the
   *  pinned provider fails or is unconfigured, the call throws instead of
   *  silently shipping a brief drafted by baseten/nvidia/cloudflare. */
  exclusive?: boolean
  /** With exclusive: true, still fall through to the rest of the chain when
   *  the pinned provider fails with a TRANSIENT infrastructure error (529
   *  overload, upstream timeout, request abort). A capacity hiccup must not
   *  fail a review sweep — the fix ships via the next provider. Auth/model/
   *  contract errors keep failing loudly. Reviewer (callAiFix) opts in. */
  cascadeOnCapacity?: boolean
  /** Skip the universal quality contract (the prose-writing rules block).
   *  Lane-2 scoring modules (contentQuality / semanticNlp / eeatTrust /
   *  competitiveGap / localSeo) emit structured JSON judgments, not articles,
   *  so the ~4k-token writing contract is pure dead weight there — it also
   *  pushes those calls over Groq's 8k TPM free-tier limit. */
  skipQualityContract?: boolean
  /**
   * Force thinking OFF on the first completion (DeepSeek/GLM chat_template_kwargs).
   * Latency-sensitive JSON lanes (style-review) must not burn the token budget on
   * chain-of-thought. OpenAI never receives thinking flags.
   */
  disableThinking?: boolean
  /** Override reasoning budget. Draft Grok stays low on long outputs; the
   *  Master Engine pair sends Grok high + Parasail GLM medium. */
  reasoningEffort?: 'low' | 'medium' | 'high'
  /**
   * Honor `timeoutMs` exactly — do not raise it to the Grok 180s drafting
   * floor. Visibility audits and other bounded pings must fail fast.
   */
  strictTimeout?: boolean
  /**
   * Abort the upstream provider fetch when this signal fires (client
   * disconnect, cancellation). Stops an abandoned stream from generating
   * the full article into memory after the consumer is gone.
   */
  signal?: AbortSignal
  /** Content type so the quality contract can pick blog vs guide shape. */
  contentType?: string
}

/** Streaming token/chunk from generateContentTextStream. */
export type ContentAiStreamEvent =
  | { type: 'provider'; provider: string; model: string }
  | { type: 'delta'; text: string }
  | { type: 'done'; text: string; provider: string; model: string }

type OpenAiCompat = {
  label: string
  baseURL: string
  apiKey: string
  model: string
  /** Extra JSON fields on the chat.completions body (e.g. NVIDIA chat_template_kwargs). */
  extraBody?: Record<string, unknown>
  topP?: number
  /** Cap max_tokens for this provider (NVIDIA allows 16384). */
  maxTokensCap?: number
  /**
   * Separate reasoning budget for NVIDIA NIM reasoning models (the documented
   * `reasoning_budget` body field from NVIDIA's own integration example).
   * Thinking-mode models otherwise burn max_completion_tokens on
   * reasoning_content first, truncating the article with finish_reason:'length'.
   * A dedicated budget keeps reasoning bounded so content keeps its headroom.
   */
  reasoningBudget?: number
}

/**
 * AI Key Vault overlay — admin-pasted keys (lib/aiKeyVault) are pushed into
 * this module-level map by refreshAiVault() / withVaultEnv(). env() consults
 * the overlay first so vault keys win over Worker secrets, then falls back to
 * process.env — existing deployments keep working untouched.
 */
let vaultOverlay: Record<string, string> | null = null

/**
 * Caller-injected overlay (explicit operator/test injection via
 * `setVaultOverlay`). It wins over vault-derived values and survives
 * `refreshAiVault()` until it is replaced or cleared with
 * `setVaultOverlay(null)`. Production code never injects an overlay; vault
 * refreshes only update the vault-derived layer.
 */
let injectedVaultOverlay: Record<string, string> | null = null

/** Replace the active vault overlay (explicit injection; see above). */
export function setVaultOverlay(overlay: Record<string, string> | null): void {
  injectedVaultOverlay = overlay
  vaultOverlay = overlay
}

/** Merge keys into the vault-derived overlay without marking them injected. */
function mergeVaultOverlay(overlay: Record<string, string>): void {
  vaultOverlay = { ...(vaultOverlay || {}), ...overlay }
}

/**
 * Refresh the AI Key Vault overlay from Supabase (lib/aiKeyVault). Returns the
 * env names that became available from the vault (or [] when the vault is
 * unreachable — the chain then continues on env vars only).
 */
export async function refreshAiVault(): Promise<string[]> {
  try {
    const vault = await import('@/lib/aiKeyVault')
    // Persist/migrate the drafting default before building the overlay. If the
    // order is reversed, this request keeps the previous provider in memory
    // and only the next request sees the new default.
    try {
      const ensureDefault = vault.ensureDraftDefaultSettings || vault.ensureParasailDefaultSettings
      if (typeof ensureDefault === 'function') await ensureDefault()
    } catch {
      /* settings persist is best-effort */
    }
    const overlay = await vault.buildVaultEnvOverrides(true)
    try {
      if (typeof vault.getAiSettings === 'function') {
        const { ensureSuperGrokAccessToken, overlayGrokAuth } = await import('@/lib/xaiSuperGrokOAuth')
        // Grok CLI parity: a live SuperGrok session (device login) beats a
        // console XAI_API_KEY. Team API credits are a different product —
        // they are fallback only when SuperGrok is not connected.
        const oauth = await ensureSuperGrokAccessToken()
        Object.assign(overlay, overlayGrokAuth(overlay, oauth))
      }
    } catch (oauthErr) {
      console.warn(
        '[contentAi] SuperGrok OAuth overlay skipped',
        oauthErr instanceof Error ? oauthErr.message : oauthErr,
      )
    }
    vaultOverlay = injectedVaultOverlay ? { ...overlay, ...injectedVaultOverlay } : overlay
    return Object.keys(vaultOverlay).filter((k) => /_(?:API_KEY|TOKEN|AUTH)$/.test(k))
  } catch (e) {
    console.warn(
      '[contentAi] vault overlay unavailable (is ai_provider_keys migrated?) — env vars only',
      e instanceof Error ? e.message : e,
    )
    vaultOverlay = injectedVaultOverlay
    return []
  }
}

/**
 * Run `fn` with a temporary overlay: base vault keys merged with `extra`,
 * then restore whatever overlay was active before.
 */
export async function withVaultEnv<T>(
  extra: Record<string, string>,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = vaultOverlay
  await refreshAiVault()
  vaultOverlay = { ...vaultOverlay, ...extra }
  try {
    return await fn()
  } finally {
    vaultOverlay = prev
  }
}

function env(name: string): string {
  if (vaultOverlay) {
    const v = (vaultOverlay[name] || '').trim()
    if (v) return v
    // Global default model (ai_settings.default_model) applies to the
    // OpenAI-compatible endpoints admins tune most.
    if (name === 'OPENAI_MODEL' || name === 'CUSTOM_AI_MODEL') {
      const dm = (vaultOverlay['CONTENT_AI_DEFAULT_MODEL'] || '').trim()
      if (dm) return dm
    }
  }
  return (process.env[name] || '').trim()
}

/**
 * Vault-aware env lookup for provider credentials/endpoints. The configurator
 * (AI Key Vault in Supabase) wins over Worker secrets (process.env) — every
 * provider key / model / base-URL read must go through this so an admin-pasted
 * key is honored before the deployed env.
 */
export function contentAiEnv(name: string): string {
  return env(name)
}

/** Workers AI daily-neuron exhaustion is permanent until the quota resets. */
function isDailyQuotaError(value: unknown): boolean {
  const message = value instanceof Error ? value.message : String(value || '')
  return /daily free allocation|used up.*(?:daily )?allocation|free allocation.*neurons|neurons.*upgrade|account limited|error code\s*[:=]?\s*(3036|4006)/i.test(message)
}

/** xAI's subscription proxy uses this exact 402 diagnosis when the
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

/** 524s and exhausted quotas should not be retried against the same provider. */
function isNoRetryProviderError(value: unknown): boolean {
  const message = value instanceof Error ? value.message : String(value || '')
  return /\b524\b|gateway timeout|upstream.*timeout|timed out/i.test(message) || isDailyQuotaError(message)
}

/** Cloudflare 522 from the SuperGrok self-host transport is transient.
 * Check it before the generic "timed out" no-retry rule because the
 * operator-facing 522 diagnostic intentionally contains that phrase. */
export function isRetryableProviderFailure(value: unknown): boolean {
  const message = value instanceof Error ? value.message : String(value || '')
  if (/\b522\b/.test(message)) return true
  if (isNoRetryProviderError(message)) return false
  return /\b(429|502|503|504|524|529)\b|UNAVAILABLE|overload|high.demand|rate.?limit|gateway.timeout|ResourceExhausted|empty content|empty response/i.test(message)
}

/** Keep provider diagnostics useful without surfacing auth/token fingerprints. */
function formatProviderFailure(label: string, status: number, body: string): string {
  const grokFailure = /^grok(?:\s|$)/i.test(label)
  if (grokFailure && (status === 402 || isGrokBuildUsageExhausted(body))) {
    if (isSuperGrokSubscriptionMode() || isGrokBuildUsageExhausted(body)) {
      return `${label} ${status}: Grok Build usage balance exhausted for the connected SuperGrok account. Check Grok Settings → Usage for the reset time or add Extra Usage Credits; reconnecting SuperGrok will not restore usage`
    }
    return `${label} ${status}: xAI developer API billing or credit limit reached; check xAI API billing/credits`
  }
  if (grokFailure && status === 522) {
    return `${label} ${status}: Grok upstream timed out before a result returned; this is a transport timeout, not proof that OAuth is disconnected or that a quota reset is required`
  }
  if (isDailyQuotaError(body)) {
    return `${label} ${status}: daily Workers AI free allocation exhausted; retry after the UTC quota reset or configure paid Workers AI`
  }
  if (status === 524 || /gateway timeout|upstream.*timeout/i.test(body)) {
    return `${label} ${status}: upstream gateway timeout; try again later or use another configured provider`
  }
  return `${label} ${status}: ${body.slice(0, 400)}`
}

/**
 * Provider retries are opt-in. A retry consumes another Worker subrequest and
 * the ordered fallback chain already provides resilience for transient errors.
 * Set CONTENT_AI_RETRY=1 only on a plan with sufficient subrequest headroom.
 */
async function withRetry<T>(name: string, fn: () => Promise<T>): Promise<T> {
  // Retry by default with exponential backoff; set CONTENT_AI_RETRY=0 to disable.
  // NVIDIA 550B-class models (Nemotron) routinely hit transient 503 capacity
  // limits — 3 retries with growing backoff gives the worker time to drain.
  const retryEnv = Number(process.env.CONTENT_AI_RETRY)
  const maxAttempts = isNaN(retryEnv) ? 4 : Math.max(1, retryEnv)
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // 529 = NVIDIA "Service temporarily overloaded" (verified live). It is
      // recoverable — a short pause often drains the worker — so it retries
      // with backoff like 503/429 before the cascade moves to the next host.
      const retryable = isRetryableProviderFailure(msg)
      if (!retryable || attempt >= maxAttempts || /Too many subrequest/i.test(msg)) { console.warn(`[contentAi] ${name} non-retryable: ${msg.slice(0,120)}`); throw e }
      // Exponential backoff: 1.5s → 3s → 6s (with ±20% jitter)
      const baseMs = 1500 * 2 ** (attempt - 1)
      const jitter = baseMs * (0.8 + Math.random() * 0.4)
      console.warn(`[contentAi] ${name} transient attempt ${attempt}/${maxAttempts} (${msg.slice(0, 100)}); retry ${Math.round(jitter)}ms`)
      await new Promise((r) => setTimeout(r, jitter))
    }
  }
  throw new Error(`${name} failed without a response`)
}

function resolveMaxTokens(p: OpenAiCompat | null | undefined, opts: ContentAiOptions): number {
  const requested = opts.maxTokens ?? (p?.maxTokensCap ?? DEFAULT_MAX_TOKENS)
  if (p?.maxTokensCap) return Math.min(requested, p.maxTokensCap)
  return requested
}

function extractMessageText(content: unknown): string {
  if (typeof content === 'string') return content.trim()
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part
        if (part && typeof part === 'object' && 'text' in part) {
          return String((part as { text?: string }).text || '')
        }
        return ''
      })
      .join('')
      .trim()
  }
  return ''
}

/**
 * Detect a model restart in a continuation response.
 *
 * A genuine continuation starts mid-prose (no H1, no frontmatter block).
 * A restart emits a new `---` frontmatter block or a new `# H1` heading
 * near the start of the response — signs the model ignored the CONTINUE
 * instruction and wrote a fresh article instead of appending.
 */
function looksLikeFullRestart(previousText: string, continuationText: string): boolean {
  const prior = previousText.replace(/^---[\s\S]*?---/, '').replace(/\s+/g, ' ').trim()
  // YAML-only / empty prior: a new H1 or frontmatter IS the first article, not a restart.
  if (prior.length < 80) return false
  const head = continuationText.trimStart().slice(0, 300)
  // New frontmatter block — the strongest restart signal.
  // Match a line that is exactly `---` (same pattern as
  // stripDuplicateArticleCopy's restart detection) followed within 120
  // chars by a `title:` field.
  if (/^---\s*$/m.test(head) && /title\s*[:=]/im.test(head)) return true
  // New H1 heading at the very start — the model began a fresh article.
  // Only flag this when the previous text does NOT end mid-prose (which
  // would be a genuine continuation that happens to start a new section).
  if (/^#\s+[A-Z]/.test(head) && !previousText.endsWith('\n') && previousText.length > 0) return true
  // The continuation opens with a ## heading right after a non-prose boundary
  // (e.g. the previous text ended with a code fence or JSON-LD close).
  if (/^##\s+/.test(head) && !previousText.endsWith('\n') && previousText.length > 0) return true
  return false
}

/** DeepSeek-family streams that burn the token budget on reasoning_content
 *  finish with `length` and zero article text. Continuing that 5× keeps the
 *  UI at 0 chars for minutes. Treat it as empty, not as a real truncation. */
export function isReasoningOnlyTruncation(accumulated: string): boolean {
  const body = String(accumulated || '')
    .replace(/^---[\s\S]*?---/, '')
    .replace(/\s+/g, ' ')
    .trim()
  return body.length < 80
}

/** Build a continuation prompt that resumes a draft cut off at the token cap. */
function buildContinuationPrompt(partial: string): string {
  const trimmed = partial.trim()
  // Send the LAST ~400 words (not a fixed char count) so the model sees the
  // actual ending of the draft — the place it must continue from. A fixed
  // 2200-char window lands in the MIDDLE of a long article and invites a
  // full restart because the model cannot see where the text stops.
  const words = trimmed.split(/\s+/)
  const tailWords = words.slice(-400).join(' ')
  const tail = tailWords || trimmed.slice(-2200)
  return (
    'CONTINUE WRITING THE DRAFT BELOW. The previous response was cut off at the token limit. ' +
    'Continue from exactly where it stopped and COMPLETE the remaining sections of the original outline. ' +
    'Do NOT repeat any text already present. Return ONLY the continuation — no new title, no front matter, ' +
    'no new H1, no re-introduction, and no closing summary of the whole piece unless the outline asked for one. ' +
    'You MUST continue from the last sentence below — do NOT start a new article.\n\n' +
    'END OF DRAFT SO FAR (last ~400 words — continue from here):\n' +
    (tail || '(no draft text was produced — restart the full write but keep it within the token budget)')
  )
}

/** Reasoning-capable models accept max_completion_tokens + reasoning_content. */
export function isReasoningModelId(model: string): boolean {
  return /^(gpt-5|o[0-9]|o1|o3|o4|deepseek|z-ai\/glm|zai-org\/glm|glm-5\.3|parasail-(?:deepseek|glm)|nemotron|grok)/i.test(model)
}

/** Unpaid / quota / billing failures across developer APIs and subscription-backed Grok Build. */
export function isPaymentOrQuotaFailure(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '')
  return /insufficient_quota|unpaid|payment.?required|\b402\b|billing|past.?due|credit.?exhausted|requires.?payment|account.?not.?funded|quota.?exceeded|exceeded.?your.?current.?quota|You exceeded your current quota|permission-denied|spending.?limit|monthly.?spending|used all available credits|purchase more credits|raise yo|usage.?balance.?exhausted|grok.?build.*exhausted/i.test(msg)
}

/** Pull final prose out of an xAI / OpenAI Responses payload. */
export function extractResponsesText(json: unknown): string {
  if (!json || typeof json !== 'object') return ''
  const rec = json as Record<string, unknown>
  if (typeof rec.output_text === 'string' && rec.output_text.trim()) return rec.output_text.trim()
  const parts: string[] = []
  const output = Array.isArray(rec.output) ? rec.output : []
  for (const item of output) {
    if (!item || typeof item !== 'object') continue
    const content = (item as { content?: unknown }).content
    if (!Array.isArray(content)) continue
    for (const block of content) {
      if (!block || typeof block !== 'object') continue
      const b = block as { type?: string; text?: unknown }
      if ((b.type === 'output_text' || b.type === 'text') && typeof b.text === 'string') {
        parts.push(b.text)
      }
    }
  }
  if (parts.length) return parts.join('').trim()
  const choices = rec.choices
  if (Array.isArray(choices) && choices[0] && typeof choices[0] === 'object') {
    const message = (choices[0] as { message?: { content?: unknown } }).message
    return extractMessageText(message?.content)
  }
  return ''
}

/** Node fetch (undici) kills idle responses at 300s unless headersTimeout is raised. */
function undiciDispatcher(timeoutMs: number): unknown {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const undici = require('undici') as { Agent?: new (opts: Record<string, number>) => unknown }
    if (typeof undici.Agent !== 'function') return undefined
    return new undici.Agent({
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
      connectTimeout: 30_000,
    })
  } catch {
    return undefined
  }
}

/** One-shot OpenAI-compatible chat completion fetch (complete + continuation). */
async function openAiCompatFetch(
  p: OpenAiCompat,
  opts: ContentAiOptions,
  userContent: string,
  patch?: { disableThinking?: boolean },
): Promise<{ text: string; finishReason?: string | null }> {
  const url = p.baseURL.replace(/\/$/, '') + '/chat/completions'
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${p.apiKey}`,
  }
  // OpenRouter free-tier attribution (same as chatProvider)
  if (p.label === 'openrouter') {
    headers['HTTP-Referer'] = 'https://portal.yousafeconsultancy.com'
    headers['X-Title'] = 'YouSafe Content Studio'
  }
  // Org TPM guard: prompt + max_tokens must stay under the org token budget
  // (Run BiOS rejects any single request above its 200k TPM allowance).
  const maxTokens = clampMaxTokensToBudget(resolveMaxTokens(p, opts), opts.system, userContent, p.label)
  // NVIDIA's MiniMax and Nemotron lanes follow NVIDIA's OpenAI-compatible
  // examples: max_tokens, temperature, top_p, and an explicit stream mode.
  // OpenAI/o-series providers use max_completion_tokens instead.
  const isNvidiaNemotron = p.label === 'nvidia-nemotron'
  const isNvidiaMinimax = p.label === 'nvidia-minimax'
  const isReasoningModel = isReasoningModelId(p.model) && !isNvidiaNemotron && !isNvidiaMinimax
  // Only apply opts.model override for OpenAI / custom providers (where the
  // model name is meaningful). Non-OpenAI providers (NVIDIA, Baseten, Groq,
  // Gemini, etc.) always use their own p.model so an OpenAI-specific model
  // like 'gpt-5.6-sol' doesn't break the cascade.
  const effectiveModel = opts.model && (p.label === 'openai' || p.label === 'custom') ? opts.model : p.model
  const body: Record<string, unknown> = {
    model: effectiveModel,
    // NVIDIA's non-streaming example is explicit about the transport mode;
    // keep this path deterministic even when an OpenAI-compatible server has a
    // different default.
    stream: false,
    ...(isReasoningModel || isNvidiaNemotron || isNvidiaMinimax ? { temperature: opts.temperature ?? (isNvidiaNemotron ? 1 : isNvidiaMinimax ? 1 : DEFAULT_TEMPERATURE) } : {}),
    ...(isReasoningModel ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens }),
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: userContent },
    ],
    ...(p.topP != null && !isReasoningModel ? { top_p: p.topP } : {}),
    // Separate reasoning budget keeps thinking ON without starving content.
    ...(p.reasoningBudget != null ? { reasoning_budget: p.reasoningBudget } : {}),
    ...(p.extraBody || {}),
  }
  // GLM 5.3 Flash cannot disable thinking. Default host effort is `max`,
  // which burns 30–90s before the first prose token. Pin `low` unless the
  // caller asked for high (Master Engine harmony). `medium` maps to `high`
  // because the model only accepts low | high | max.
  if (isRunbiosPin(p.label) && (runbiosSlot(p.label)?.reasoningLow || p.label === 'runbios-glm-53-flash')) {
    const want = opts.reasoningEffort
    body.reasoning_effort =
      want === 'high' || want === 'medium' ? 'high' : 'low'
  }
  // Empty-content rescue OR caller opts.disableThinking: force thinking OFF.
  // Entrim DeepSeek ships WITHOUT extraBody — the old path only mutated
  // chat_template_kwargs when it already existed, so Flash kept thinking ON
  // and burned style-review's 35s budget on reasoning_content.
  // Always CREATE kwargs for non-OpenAI hosts (stream path already does this).
  // OpenAI rejects enable_thinking / chat_template_kwargs — never send them.
  const shouldDisableThinking = Boolean(patch?.disableThinking || opts.disableThinking)
  if (shouldDisableThinking) {
    if (p.label !== 'openai') {
      body.chat_template_kwargs = {
        ...((body.chat_template_kwargs as Record<string, unknown> | undefined) || {}),
        // DeepSeek-family templates read `thinking`; GLM/Nemotron read
        // `enable_thinking`. Neutralize BOTH.
        thinking: false,
        enable_thinking: false,
      }
    }
    delete body.reasoning_budget
    // Parasail Pro ships extraBody.reasoning_effort. Leaving it on the
    // rescue re-ask makes disableThinking a no-op — the second call still
    // spends the budget on reasoning_content and the reviewer returns 0
    // countable words. Pin the lowest effort instead of deleting it
    // (absent effort can default higher on some hosts).
    if (typeof body.reasoning_effort === 'string') {
      body.reasoning_effort = 'low'
    }
    if (isRunbiosPin(p.label)) {
      body.reasoning_effort = 'low'
    }
    // Only CUSTOM OpenAI-compatible endpoints accept a top-level
    // enable_thinking flag. OpenAI itself REJECTS it (400 "Unknown
    // parameter: enable_thinking") — never send this flag to OpenAI.
    if (!p.extraBody && p.label === 'custom') body.enable_thinking = false
  }
  // Per-fetch deadline — a hung upstream must fail fast so the cascade can
  // move on instead of burning the whole per-candidate budget. A caller-supplied
  // timeoutMs (the reviewer passes a larger one) overrides the global 120s
  // default so a slow-but-funded host gets real headroom; the abort is then
  // normalized to the friendly "timed out after Ns" message above.
  const fetchDefault =
    Number.parseInt(process.env.CONTENT_AI_FETCH_TIMEOUT_MS || '120000', 10) || 120_000
  const runbiosFloor =
    Number.parseInt(process.env.CONTENT_AI_RUNBIOS_TIMEOUT_MS || '600000', 10) || 600_000
  const timeoutMs =
    isRunbiosPin(p.label)
      ? Math.max(opts.timeoutMs ?? 0, Math.max(180_000, runbiosFloor))
      : opts.timeoutMs != null
        ? Math.max(2_000, opts.timeoutMs)
        : fetchDefault
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let raceTimer: ReturnType<typeof setTimeout> | undefined
  let res: Response
  const dispatcher = undiciDispatcher(timeoutMs)
  try {
    res = await Promise.race([
      fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
        // Node/undici defaults headersTimeout to 300s. GLM Flash drafts
        // routinely exceed that; without this the socket dies as "fetch failed".
        ...(dispatcher ? { dispatcher } : {}),
      } as RequestInit),
      new Promise<never>((_, reject) => {
        raceTimer = setTimeout(
          () => reject(new Error(`${p.label} timed out after ${Math.round(timeoutMs / 1000)}s`)),
          timeoutMs,
        )
      }),
    ])
  } catch (e) {
    // The abort timer and the friendly timeout reject at the same instant;
    // the raw AbortError ("The operation was aborted") usually wins the race
    // and leaks to the UI. Normalize it so callers see the readable timeout.
    if (e instanceof Error && (e.name === 'AbortError' || /abort/i.test(e.message))) {
      throw new Error(`${p.label} timed out after ${Math.round(timeoutMs / 1000)}s`)
    }
    throw e
  } finally {
    // Clear BOTH timers so a hung fetch that resolves via abort does not leave
    // a pending handle behind (jest/workers flag it as an open handle).
    clearTimeout(timer)
    if (raceTimer) clearTimeout(raceTimer)
  }
  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    throw new Error(formatProviderFailure(p.label, res.status, errBody))
  }
  const json = (await res.json()) as {
    choices?: Array<{
      message?: { content?: unknown; reasoning_content?: string }
      finish_reason?: string
    }>
  }
  const choice = json.choices?.[0]
  // Consume ONLY final prose. Reasoning models return the chain in
  // reasoning_content and the answer in content — reasoning must never
  // become the article. If content is absent the model failed to answer.
  return { text: extractMessageText(choice?.message?.content), finishReason: choice?.finish_reason }
}

/**
 * Resolve the model id actually sent to a provider.
 *
 * A request-level `opts.model` wins over the provider default ONLY when it is
 * a real API id (contains a host slash, or is a GPT-5.6 alias). Bare pins are
 * NOT model ids and must never be sent as the model — they fall back to the
 * provider default.
 */
export function resolveEffectiveModel(p: OpenAiCompat, opts: ContentAiOptions): string {
  const requested = String(opts.model || '').trim()
  if (!requested) return p.model
  const isRealModelId = requested.includes('/') || GPT_ALIAS_RE.test(requested)
  if (!isRealModelId) return p.model
  if (p.label === 'openai' || p.label === 'custom') {
    return requested.replace(/^gpt-5\.6$/i, 'gpt-5.6-sol')
  }
  return requested
}

export async function openAiCompatibleComplete(
  p: OpenAiCompat,
  opts: ContentAiOptions,
): Promise<ContentAiResult> {
  // gpt-5.6 bare → gpt-5.6-sol (GPT-5.6 flagship alias).
  // Terra = strong/balanced, Luna = efficient/high-volume.
  // opts.model (a real API id) overrides the provider default — including
  // NVIDIA/Baseten, which previously ignored it and used the env secret.
  const model = resolveEffectiveModel(p, opts)
  const patched = { ...p, model }
  const startedAt = Date.now()
  try {
    return await withRetry(p.label, async () => {
    // A cut-off completion is recoverable: continue from the partial text ONCE
    // on the same provider instead of bouncing to the next (which usually hits
    // the same shared cap and is what made whole cascades fail on long guides).
    const first = await openAiCompatFetch(patched, opts, opts.prompt)
    let text = first.text
    let finishReason = first.finishReason
    // Reasoning models (DeepSeek V4 Flash / Nemotron / GLM) occasionally spend
    // the ENTIRE budget on reasoning_content and emit no final prose. Re-ask
    // the same prompt with thinking OFF so the model is forced to write the
    // article text instead of bouncing the whole cascade.
    if (!text.trim() && isReasoningModelId(model)) {
      const plain = await openAiCompatFetch(patched, opts, opts.prompt, { disableThinking: true })
      text = plain.text
      finishReason = plain.finishReason
    }
    let restartRejected = false
    if (finishReason === 'length' && text.trim()) {
      // 2026-08-11: raised from 1→3 continuation attempts — long legal
      // guides routinely need multiple continuations after hitting the
      // model's per-response token cap.
      for (let c = 0; c < 3 && finishReason === 'length'; c++) {
        const cont = await openAiCompatFetch(patched, opts, buildContinuationPrompt(text))
        // Restart guard: if the continuation produced a full new article
        // (new H1 + frontmatter), the model ignored the CONTINUE instruction.
        // Reject the restart outright — keep the previous text and stop
        // continuing, because further restarts will not recover the deficit.
        if (looksLikeFullRestart(text, cont.text)) {
          // The draft is as complete as this provider can make it within the
          // token budget. Treat it as FINAL: do NOT fall through to the
          // truncated-throw below, which would cascade to the next provider
          // or (worse) make withRetry re-run this same provider — whose
          // fresh response is exactly the restart we just rejected, getting
          // concatenated as a "clean" first attempt. The pipeline's
          // depth-rescue / refine passes top up the deficit instead.
          restartRejected = true
          break
        }
        text = (text + '\n\n' + cont.text).trim()
        // Continuation joins are an echo vector: a model that restarts the
        // article mid-response produces draft + copy concatenated. Dedupe
        // deterministically after every join (lazy import — no cycle).
        try {
          const { stripDuplicateArticleCopy } = await import('@/lib/seoFactory/editorialScaffold')
          const deduped = stripDuplicateArticleCopy(text)
          if (deduped.removed) text = deduped.content
        } catch { /* best-effort */ }
        finishReason = cont.finishReason
      }
    }
      if (!text) throw new Error(`${p.label} returned empty content`)
      // Still cut off after the continuation — cascade to the next provider.
      // A restart-rejected draft is intentionally final; never cascade it.
      if (finishReason === 'length' && !restartRejected) {
        throw new Error(`${p.label} output was truncated (token limit) — trying next provider`)
      }
      return { text, provider: p.label, model }
    })
  } finally {
    // Watch latency: a slow host is a signal the reviewer fetch deadline needs
    // raising (or the host is unhealthy). Surfaced in Worker logs.
    const elapsedSec = Math.round((Date.now() - startedAt) / 1000)
    if (elapsedSec >= 60) {
      console.warn(`[contentAi] ${p.label} completion took ${elapsedSec}s — slow host (reviewer fetch headroom may need raising)`)
    }
  }
}

/** True when Grok can run: SuperGrok OAuth overlay or an XAI_API_KEY. */
export function isGrokConfigured(): boolean {
  return Boolean(env('XAI_API_KEY'))
}

/** UI / pin aliases that are not xAI model ids. "grok" must never be sent. */
const GROK_MODEL_ALIASES = new Set([
  'grok',
  'xai',
  'supergrok',
  'super-grok',
  'grok-latest',
  'grok-4',
])

/** Resolve the xAI model id. The reviewer pin is "grok"; the API wants grok-4.6. */
export function grokModelId(opts?: { model?: string } | null): string {
  const fallback = env('XAI_MODEL') || 'grok-4.6'
  const requested = String(opts?.model || '').trim()
  if (!requested) return fallback
  if (GROK_MODEL_ALIASES.has(requested.toLowerCase())) return fallback
  if (/^grok[-_.]/i.test(requested)) return requested
  return fallback
}

/** Grok 4.6 default reasoning is HIGH and counts against max_output_tokens.
 *  Drafts were sending 16384 + high effort, then timing out or returning
 *  empty/incomplete so the stream cascade moved to GLM. Cap output and
 *  drop effort so prose actually arrives. */
export function grokRequestLimits(
  maxTokens?: number,
  effort?: 'low' | 'medium' | 'high',
  opts?: { disableThinking?: boolean },
): {
  maxOutputTokens: number
  reasoningEffort: 'low' | 'medium' | 'high'
} {
  const requested = Math.max(256, maxTokens ?? DEFAULT_MAX_TOKENS)
  // Latency JSON lanes (style-review) pass disableThinking — force low effort
  // so Grok does not burn the abort budget on HIGH reasoning.
  if (opts?.disableThinking) {
    return {
      maxOutputTokens: Math.min(requested, 8192),
      reasoningEffort: 'low',
    }
  }
  if (effort === 'high' || effort === 'medium' || effort === 'low') {
    return {
      maxOutputTokens: Math.min(requested, effort === 'high' ? 4096 : 8192),
      reasoningEffort: effort,
    }
  }
  return {
    maxOutputTokens: Math.min(requested, 8192),
    reasoningEffort: requested >= 4000 ? 'low' : 'medium',
  }
}

function grokAuthHeader(): { apiKey: string; baseURL: string } {
  const apiKey = env('XAI_API_KEY')
  if (!apiKey) {
    throw new Error(
      'Grok is not configured. Connect SuperGrok in Content Studio → Configure, or set XAI_API_KEY.',
    )
  }
  return {
    apiKey,
    baseURL: grokInferenceBaseUrl(apiKey, env('XAI_BASE_URL')),
  }
}

const GROK_STUDIO_CONV_ID = 'yousafe-content-studio'

function grokRequestHeaders(
  apiKey: string,
  model: string,
  opts: { stream?: boolean; cliProxy?: boolean },
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    'x-grok-conv-id': GROK_STUDIO_CONV_ID,
  }
  if (opts.stream) headers.Accept = 'text/event-stream'
  if (opts.cliProxy) {
    Object.assign(headers, superGrokProxyHeaders(model))
    const userId = decodeJwtSubject(apiKey)
    if (userId) {
      headers['x-userid'] = userId
      headers['x-grok-user-id'] = userId
    }
  }
  return headers
}

/** api.x.ai treated a SuperGrok session as a metered team key — try CLI proxy. */
function shouldFallbackToCliProxy(status: number, body: string, apiKey: string): boolean {
  if (isXaiDeveloperApiKey(apiKey)) return false
  if (!isSuperGrokSubscriptionMode()) return false
  if (isGrokBuildUsageExhausted(body)) return false
  if (status !== 402 && status !== 403) return false
  return /personal-team-blocked|spending-limit|used all available credits|monthly spending|purchase more credits/i.test(body)
}

/**
 * SuperGrok / Grok 4.6 primary transport: xAI Responses API.
 * Chat Completions is a fallback only — OAuth subscription tokens and
 * grok-4.6 reasoning output land on /v1/responses, not /chat/completions.
 *
 * SuperGrok calls api.x.ai directly (YQAA parity). The Portal self-shim is
 * not on the happy path. A 401 force-refreshes the session once; a 402/403
 * "personal-team-blocked" retries cli-chat-proxy directly from the Worker
 * (never via the public Portal hostname).
 */
async function grokOpenResponses(
  opts: ContentAiOptions,
  userContent: string,
  stream: boolean,
): Promise<{ res: Response; model: string }> {
  let { apiKey, baseURL } = grokAuthHeader()
  const model = grokModelId(opts)
  const limits = grokRequestLimits(opts.maxTokens, opts.reasoningEffort, { disableThinking: opts.disableThinking })
  const timeoutMs = opts.strictTimeout && opts.timeoutMs != null
    ? Math.max(2_000, opts.timeoutMs)
    : Math.max(
      opts.timeoutMs ?? 0,
      deadlineForProvider('grok', opts.timeoutMs, opts.strictTimeout === true),
      Number.parseInt(process.env.CONTENT_AI_FETCH_TIMEOUT_MS || '180000', 10) || 180_000,
    )
  const payload: Record<string, unknown> = {
    model,
    input: [
      { role: 'system', content: opts.system },
      { role: 'user', content: userContent },
    ],
    store: false,
    max_output_tokens: limits.maxOutputTokens,
    reasoning: { effort: limits.reasoningEffort },
  }
  if (stream) payload.stream = true
  const body = JSON.stringify(payload)

  const post = async (urlBase: string, key: string, cliProxy: boolean) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await fetch(`${urlBase}/responses`, {
        method: 'POST',
        headers: grokRequestHeaders(key, model, { stream, cliProxy }),
        body,
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }
  }

  let res = await post(baseURL, apiKey, false)

  if (res.status === 401 && isSuperGrokSubscriptionMode() && !isXaiDeveloperApiKey(apiKey)) {
    const { forceRefreshSuperGrokAccessToken, overlayGrokAuth } = await import('@/lib/xaiSuperGrokOAuth')
    const refreshed = await forceRefreshSuperGrokAccessToken()
    if (refreshed?.accessToken) {
      try { await res.body?.cancel() } catch { /* best effort */ }
      apiKey = refreshed.accessToken
      const overlay = { ...(vaultOverlay || {}) }
      mergeVaultOverlay(overlayGrokAuth(overlay, refreshed))
      res = await post(baseURL, apiKey, false)
    }
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    if (shouldFallbackToCliProxy(res.status, errBody, apiKey)) {
      res = await post(XAI_CLI_CHAT_PROXY_BASE_URL, apiKey, true)
      if (!res.ok) {
        const proxyBody = await res.text().catch(() => '')
        throw new Error(formatProviderFailure('grok', res.status, proxyBody))
      }
      return { res, model }
    }
    throw new Error(formatProviderFailure('grok', res.status, errBody))
  }
  return { res, model }
}

async function grokResponsesFetch(
  opts: ContentAiOptions,
  userContent: string,
): Promise<{ text: string; finishReason?: string | null; model: string }> {
  const { res, model } = await grokOpenResponses(opts, userContent, false)
  const json = await res.json() as Record<string, unknown>
  const text = extractResponsesText(json)
  const status = typeof json.status === 'string' ? json.status : null
  const incompleteReason = json.incomplete_details && typeof json.incomplete_details === 'object'
    ? String((json.incomplete_details as { reason?: string }).reason || '')
    : ''
  return {
    text,
    finishReason: status === 'incomplete' ? (incompleteReason || 'length') : status,
    model,
  }
}

export async function* grokResponsesStream(opts: ContentAiOptions): AsyncGenerator<ContentAiStreamEvent> {
  const model = grokModelId(opts)
  const limits = grokRequestLimits(opts.maxTokens, opts.reasoningEffort, { disableThinking: opts.disableThinking })
  yield { type: 'provider', provider: 'grok', model: `${model} · ${limits.reasoningEffort} effort` }
  const { res } = await grokOpenResponses(opts, opts.prompt, true)
  if (!res.body) throw new Error('grok stream returned no body')
  let full = ''
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const chunks = buf.split(/\n\n/)
    buf = chunks.pop() || ''
    for (const chunk of chunks) {
      const dataLine = chunk.split(/\r?\n/).find((l) => l.startsWith('data:'))
      if (!dataLine) continue
      const payload = dataLine.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      let ev: Record<string, unknown>
      try { ev = JSON.parse(payload) as Record<string, unknown> } catch { continue }
      const type = String(ev.type || '')
      if (type === 'response.output_text.delta' || type === 'response.text.delta') {
        const delta = typeof ev.delta === 'string' ? ev.delta : ''
        if (delta) {
          full += delta
          yield { type: 'delta', text: delta }
        }
      } else if (type === 'response.failed' || type === 'error') {
        const err = ev.error && typeof ev.error === 'object'
          ? String((ev.error as { message?: string }).message || 'stream failed')
          : 'grok stream failed'
        throw new Error(
          isGrokBuildUsageExhausted(err)
            ? formatProviderFailure('grok', 402, err)
            : `grok: ${err}`,
        )
      } else if (type === 'response.completed' && ev.response) {
        const rest = extractResponsesText(ev.response)
        if (rest && rest.length > full.length) full = rest
      }
    }
  }
  if (!full.trim()) throw new Error('grok stream returned empty content')
  yield { type: 'done', text: full.trim(), provider: 'grok', model }
}

export async function grokComplete(opts: ContentAiOptions): Promise<ContentAiResult> {
  const model = grokModelId(opts)
  return withRetry('grok', async () => {
    let text = ''
    let finishReason: string | null | undefined
    let usedModel = model
    try {
      const first = await grokResponsesFetch(opts, opts.prompt)
      text = first.text
      finishReason = first.finishReason
      usedModel = first.model
    } catch (responsesErr) {
      const msg = responsesErr instanceof Error ? responsesErr.message : String(responsesErr)
      // Responses is required for SuperGrok OAuth; chat completions is only
      // useful for console API keys. Retry chat if Responses is missing/404.
      if (!/ 404[:\s]|not found|unknown endpoint/i.test(msg)) throw responsesErr
      const p = listOpenAiFallbackProviders().find((x) => x.label === 'grok')
      if (!p) throw responsesErr
      const chat = await openAiCompatFetch({ ...p, model }, opts, opts.prompt)
      text = chat.text
      finishReason = chat.finishReason
    }
    const words = text.trim().split(/\s+/).filter(Boolean).length
    if (!text.trim()) {
      throw new Error(
        `grok returned empty content` +
          (finishReason ? ` (finish=${finishReason})` : '') +
          ` — high-reasoning drafts were eating the token budget; retry uses low effort + 8k cap`,
      )
    }
    let restartRejected = false
    if ((finishReason === 'length' || finishReason === 'max_output_tokens') && words < 400) {
      for (let c = 0; c < 2 && (finishReason === 'length' || finishReason === 'max_output_tokens'); c++) {
        try {
          const cont = await grokResponsesFetch(opts, buildContinuationPrompt(text))
          // Same restart guard as the OpenAI-compatible path: if Grok
          // restarted the article instead of appending, stop continuing and
          // treat the prior draft as final (no cascade / withRetry re-run —
          // a re-run would return exactly the restart we just rejected).
          if (looksLikeFullRestart(text, cont.text)) {
            restartRejected = true
            break
          }
          text = `${text}\n\n${cont.text}`.trim()
          try {
            const { stripDuplicateArticleCopy } = await import('@/lib/seoFactory/editorialScaffold')
            const deduped = stripDuplicateArticleCopy(text)
            if (deduped.removed) text = deduped.content
          } catch { /* best-effort */ }
          finishReason = cont.finishReason
        } catch {
          break
        }
      }
    }
    // Keep a substantial incomplete draft instead of cascading away from Grok.
    if (text.trim().split(/\s+/).filter(Boolean).length >= 400 || restartRejected) {
      return { text, provider: 'grok', model: usedModel }
    }
    if ((finishReason === 'length' || finishReason === 'max_output_tokens') && !restartRejected) {
      throw new Error('grok output was truncated (token limit) — trying next provider')
    }
    return { text, provider: 'grok', model: usedModel }
  })
}

/** Parasail keys are issued as `psk-…`. A key pasted into another provider
 *  slot must still route to api.parasail.io — never OpenAI / DeepSeek.com. */
export function looksLikeParasailKey(value: string): boolean {
  return /^psk-/i.test(String(value || '').trim())
}

/**
 * Parse OpenAI-compatible SSE body and yield text deltas.
 * Handles `data: {...}` lines and `[DONE]`.
 */
/** Lightweight peek at an SSE chunk's finish_reason without full validation. */
function parseChoiceFinishReason(payload: string): { finish_reason?: string | null } | null {
  try {
    const parsed = JSON.parse(payload) as {
      choices?: Array<{ finish_reason?: string | null }>
    }
    return parsed.choices?.[0] ?? null
  } catch {
    return null
  }
}

/** Transient HTTP overloads worth a bounded backoff before the provider
 *  cascade gives up on a host: NVIDIA 529 "Service temporarily overloaded"
 *  (verified live), 503 capacity, 429 rate limits, 524 gateways. */
const TRANSIENT_STREAM_ERROR_RE =
  /\b(529|503|429|524)\b|overload|high.demand|rate.?limit|UNAVAILABLE|ResourceExhausted/i

/**
 * Re-open an SSE stream with bounded exponential backoff on transient
 * overload errors (NVIDIA 529 / 503 / 429 / 524). A 529 often drains in a
 * second or two — retrying keeps the request on the intended host instead of
 * bouncing the whole cascade. After retries the error propagates and the
 * ordered cascade moves to the next provider, so an overloaded NVIDIA never
 * fails the job outright. Non-transient errors (auth 401/403, model 404,
 * subrequest-limit) propagate immediately.
 */
export async function fetchStreamWithRetry(
  open: () => Promise<Response>,
  maxAttempts = 3,
): Promise<{ res: Response; attempts: number }> {
  const envVal = Number(process.env.CONTENT_AI_STREAM_RETRY)
  const attempts = isNaN(envVal) ? Math.max(1, maxAttempts) : Math.max(1, envVal)
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return { res: await open(), attempts: attempt }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const transient = TRANSIENT_STREAM_ERROR_RE.test(msg)
      if (attempt >= attempts || !transient || /Too many subrequest/i.test(msg)) throw e
      // Exponential backoff: 1s → 2s → 4s (with ±20% jitter)
      const baseMs = 1000 * 2 ** (attempt - 1)
      const jitter = baseMs * (0.8 + Math.random() * 0.4)
      await new Promise((r) => setTimeout(r, jitter))
    }
  }
  throw new Error('stream retries exhausted')
}

async function* parseOpenAiSse(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const raw of lines) {
        const line = raw.trim()
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (!payload || payload === '[DONE]') continue
        // A mid-stream finish_reason:'length' means the model hit its token
        // cap before finishing — never treat that as a complete draft. Throw
        // so the provider cascade tries the next provider instead of shipping
        // truncated prose (or a chain-of-thought stub). This must live OUTSIDE
        // the per-chunk catch below (which skips malformed SSE) so the error
        // actually propagates to the cascade.
        const choiceRaw = parseChoiceFinishReason(payload)
        try {
          const json = JSON.parse(payload) as {
            choices?: Array<{
              delta?: { content?: string; reasoning_content?: string }
              message?: { content?: string; reasoning_content?: string }
              text?: string
            }>
            response?: string
          }
          // Consume ONLY final prose. With thinking enabled the stream first
          // emits reasoning_content deltas (the chain of thought) and then
          // content deltas (the answer). Reasoning must NEVER be streamed into
          // the article — it is not final prose. If a stream ends with zero
          // content deltas, openAiCompatibleStream throws 'empty content' and
          // the provider cascade moves on, which is the correct signal that
          // the model burned its budget on thinking.
          const choice = json.choices?.[0]
          const delta =
            choice?.delta?.content ||
            choice?.message?.content ||
            choice?.text ||
            (typeof json.response === 'string' ? json.response : '')
          if (delta) yield delta
        } catch (chunkErr) {
          if (chunkErr instanceof Error && /output was truncated/.test(chunkErr.message)) throw chunkErr
          /* skip malformed SSE chunks */
        }
        // Throw AFTER yielding this chunk's prose so a last content token is
        // not discarded. Empty + length is a reasoning burn, not a draft.
        if (choiceRaw?.finish_reason === 'length') {
          throw new Error('output was truncated (token limit) — trying next provider')
        }
      }
    }
  } finally {
    // Cancel the underlying body when the stream is abandoned (provider
    // cascade switch, deadline, client disconnect). releaseLock alone lets
    // the upstream SSE keep streaming into the process and grow memory on
    // every abandoned generation — reader.cancel() propagates to the fetch
    // body so the socket is released immediately.
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

export async function* openAiCompatibleStream(
  p: OpenAiCompat,
  opts: ContentAiOptions,
): AsyncGenerator<ContentAiStreamEvent> {
  const url = p.baseURL.replace(/\/$/, '') + '/chat/completions'
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${p.apiKey}`,
  }
  if (p.label === 'openrouter') {
    headers['HTTP-Referer'] = 'https://portal.yousafeconsultancy.com'
    headers['X-Title'] = 'YouSafe Content Studio'
  }
  // Org TPM guard: prompt + max_tokens must stay under the org token budget
  // (Run BiOS rejects any single request above its 200k TPM allowance).
  const maxTokens = clampMaxTokensToBudget(resolveMaxTokens(p, opts), opts.system, opts.prompt, `${p.label} stream`)
  const isNvidiaNemotron = p.label === 'nvidia-nemotron'
  const isNvidiaMinimax = p.label === 'nvidia-minimax'
  // A real request-level model id wins over the provider default (see
  // resolveEffectiveModel) — otherwise a reviewer pinned to nvidia-deepseek
  // would stream the EOL'd env-secret model instead of the selected Flash id.
  const model = resolveEffectiveModel(p, opts)
  // Reasoning models require max_completion_tokens instead of max_tokens
  // (OpenAI rejects max_tokens on these models). DeepSeek V4 / GLM / Nemotron
  // are also reasoning-capable — they consume part of the budget on
  // reasoning_content, so they get the completion-token param for headroom.
  const isReasoningModel = isReasoningModelId(model) && !isNvidiaNemotron && !isNvidiaMinimax

  // Client disconnect / cancellation: abort the in-flight provider fetch so
  // the upstream body stops streaming into this process the moment the
  // consumer goes away (otherwise every closed tab or regenerated article
  // leaks a full background generation into memory).
  const abort = new AbortController()
  const onAbort = () => abort.abort()
  opts.signal?.addEventListener('abort', onAbort, { once: true })

  // Run BiOS GLM 5.3 Flash streams a 5–10 minute reasoning draft: Node/undici
  // kills the idle socket at 300s ("fetch failed") unless headersTimeout /
  // bodyTimeout are raised, and the Studio draft UI rides this stream path —
  // so the same dispatcher + long deadline as non-stream openAiCompatFetch
  // applies here. Other providers keep their existing behavior.
  const isRunbiosLabel =
    isRunbiosPin(p.label)
  const streamTimeoutMs = isRunbiosLabel
    ? Math.max(
        opts.timeoutMs ?? 0,
        Math.max(
          180_000,
          Number.parseInt(process.env.CONTENT_AI_RUNBIOS_TIMEOUT_MS || '600000', 10) || 600_000,
        ),
      )
    : 0
  const streamDispatcher = isRunbiosLabel ? undiciDispatcher(streamTimeoutMs) : undefined

  /** Open one SSE request for a given user prompt and return the response. */
  const streamOnce = async (userContent: string, disableThinking = false): Promise<Response> => {
    let timeoutTimer: ReturnType<typeof setTimeout> | undefined
    try {
      const res = await Promise.race([
        fetch(url, {
          method: 'POST',
          headers,
          signal: abort.signal,
          // Raise undici's 300s header/body idle limits so a long GLM draft
          // survives (see non-stream openAiCompatFetch for the same fix).
          ...(streamDispatcher ? { dispatcher: streamDispatcher } : {}),
          body: JSON.stringify({
            model,
            stream: true,
            ...(isReasoningModel || isNvidiaNemotron || isNvidiaMinimax ? { temperature: opts.temperature ?? (isNvidiaNemotron ? 1 : isNvidiaMinimax ? 1 : DEFAULT_TEMPERATURE) } : {}),
            ...(isReasoningModel ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens }),
            messages: [
              { role: 'system', content: opts.system },
              { role: 'user', content: userContent },
            ],
            ...(p.topP != null && (!isReasoningModel || isNvidiaNemotron || isNvidiaMinimax) ? { top_p: p.topP } : {}),
            // Separate reasoning budget keeps thinking ON without starving content.
            ...(p.reasoningBudget != null ? { reasoning_budget: p.reasoningBudget } : {}),
            ...(p.extraBody || {}),
            ...(p.label === 'runbios-glm-53-flash'
              ? {
                  reasoning_effort:
                    disableThinking
                      ? 'low'
                      : opts.reasoningEffort === 'high' || opts.reasoningEffort === 'medium'
                        ? 'high'
                        : 'low',
                }
              : {}),
            ...(disableThinking
              ? {
                  chat_template_kwargs: {
                    ...((p.extraBody?.chat_template_kwargs as Record<string, unknown> | undefined) || {}),
                    thinking: false,
                    enable_thinking: false,
                  },
                  reasoning_budget: undefined,
                  reasoning_effort: 'low',
                }
              : {}),
          }),
        } as RequestInit),
        ...(streamTimeoutMs
          ? [
              new Promise<never>((_, reject) => {
                timeoutTimer = setTimeout(
                  () => reject(new Error(`${p.label} stream timed out after ${Math.round(streamTimeoutMs / 1000)}s`)),
                  streamTimeoutMs,
                )
              }),
            ]
          : []),
      ]) as Response
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(formatProviderFailure(`${p.label} stream`, res.status, body))
      }
      if (!res.body) throw new Error(`${p.label} stream: empty body`)
      return res
    } catch (e) {
      // A client disconnect aborts fetch too — keep that signal distinct
      // from a provider timeout so the UI shows cancellation, not a timeout.
      if (opts.signal?.aborted) throw e
      if (e instanceof Error && (e.name === 'AbortError' || /abort/i.test(e.message))) {
        throw new Error(`${p.label} stream timed out after ${Math.round(streamTimeoutMs / 1000)}s`)
      }
      throw e
    } finally {
      if (timeoutTimer) clearTimeout(timeoutTimer)
    }
  }

  yield { type: 'provider', provider: p.label, model }
  let full = ''
  let continuations = 0
  // 2026-08-26: raised from 3→5 — Baseten/Parasail V4 Flash has a ~16k
  // effective output cap (reasoning_content eats headroom). Long guides
  // (2500+ words) need 4+ continuations. Each continuation appends ~16k tokens
  // so 5 continuations cover 80k+ tokens — more than enough for any brief.
  const MAX_CONTINUATIONS = 5
  let prompt = opts.prompt
  while (continuations <= MAX_CONTINUATIONS) {
    try {
      // Bounded backoff on transient overloads (NVIDIA 529 etc.) before the
      // cascade gives up — an overloaded NVIDIA must not fail the job outright.
      const { res: streamRes, attempts } = await fetchStreamWithRetry(() => streamOnce(prompt))
      if (attempts > 1) {
        yield { type: 'provider', provider: `${p.label} (overload retry ${attempts})`, model }
      }
      // Watch for a model restart in the SSE deltas — if the model emitted
      // a new H1/frontmatter instead of appending, stop yielding deltas and
      // break so we keep the previous draft. Detection keys off "prose seen
      // then a restart signature" so it works for both continuation attempts
      // and the withRetry-style fresh re-invocations.
      let restartDetected = false
      let deltaCount = 0
      let sawProse = full.length > 0
      // Opening-frontmatter state machine: a fresh draft starts with a `---`
      // fence and a YAML block whose keys may be kebab-case OR camelCase (the
      // pipeline schema emits `primaryKeyword:` / `contentType:` /
      // `ownerHost:`). Everything until the closing fence is scaffolding:
      // no restart checks, no prose flagging. Without this, the camelCase
      // keys flipped `sawProse` true and the closing fence read as a
      // frontmatter restart — truncating live drafts to their frontmatter
      // (46-word runs, 2026-09-02 production regression).
      let inOpeningFrontmatter = false
      let openingFenceSeen = false
      for await (const delta of parseOpenAiSse(streamRes.body)) {
        const trimmed = delta.trimStart()
        if (!restartDetected && trimmed.length > 0) {
          const head = trimmed.slice(0, 200)
          if (!openingFenceSeen && !sawProse && /^---/.test(trimmed)) {
            // First `---` of the stream opens the draft's own frontmatter.
            // The closing fence may arrive in the SAME chunk (one SSE delta
            // can carry the whole block), so check for it immediately.
            openingFenceSeen = true
            inOpeningFrontmatter = true
            if (/(^|\n)\s*---\s*(\n|$)/.test(trimmed.slice(3))) inOpeningFrontmatter = false
          } else if (inOpeningFrontmatter) {
            // Closing fence of the opening block (may share the delta with
            // key text, e.g. `ownerHost: legal\n---`). Scan the FULL delta —
            // a single SSE chunk can carry the whole frontmatter block.
            if (/(^|\n)\s*---\s*(\n|$)/.test(trimmed)) inOpeningFrontmatter = false
            // A model that skips the closing fence and jumps straight to the
            // H1 implicitly ends the block — re-arm the restart checks.
            else if (/^#\s/.test(trimmed)) inOpeningFrontmatter = false
          } else if (sawProse) {
            // A standalone `---` AFTER body prose is a frontmatter restart.
            if (head.trim() === '---') {
              restartDetected = true
              break
            }
            // A `---` + title: in the same delta after prose is a restart.
            // (The draft's OWN opening frontmatter is handled above — flagging
            // it made every Entrim stream die with "returned empty content"
            // on delta #1, 2026-09-02 production regression.)
            if (/^---\s*\n[\s\S]*title\s*[:=]/im.test(head)) {
              restartDetected = true
              break
            }
            // New title-level H1 after prose — fresh article. NOTE: this must
            // fire even when `full` ends with the '\n\n' continuation
            // separator the catch block appended — a paragraph boundary is
            // exactly where a restart begins, so `!full.endsWith('\n')` was
            // the wrong guard and let H1 restarts through (2026-09-02 regression).
            if (/^#\s+[A-Z]/.test(head)) {
              const bodySoFar = full.replace(/^---[\s\S]*?---/, '')
              const alreadyHasH1 = /^#\s+/m.test(bodySoFar.trim())
              if (alreadyHasH1 && bodySoFar.replace(/\s+/g, ' ').trim().length > 80) {
                restartDetected = true
                break
              }
            }
          }
        }
        // Prose = word text, not the frontmatter/heading scaffolding that
        // legitimately opens a draft. `#`/`-` starts and YAML key lines —
        // kebab (`primary-keyword:`) or camel (`primaryKeyword:`) — stay
        // non-prose so `sawProse` only arms the restart checks once real
        // body text flows.
        if (!sawProse && trimmed && full.length < 4000 && !inOpeningFrontmatter) {
          const isScaffold = /^[#\-]/.test(trimmed) || /^[a-zA-Z][a-zA-Z0-9_-]*\s*[:=]\s/.test(trimmed)
          if (!isScaffold) sawProse = true
        }
        full += delta
        yield { type: 'delta', text: delta }
        deltaCount++
      }
      if (restartDetected) {
        // Model restarted instead of appending — stop continuing.
        // Roll back the deltas we already appended from this attempt.
        // (Only the deltas from THIS continuation attempt, not the full text.)
        yield { type: 'provider', provider: `${p.label} (restart detected — keeping prior draft)`, model }
        break
      }
      break // success — stream completed without truncation
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const truncated = /output was truncated \(token limit\)/.test(msg)
      if (truncated && isReasoningOnlyTruncation(full)) {
        yield {
          type: 'provider',
          provider: `${p.label} (reasoning burned token budget — retrying without thinking)`,
          model,
        }
        break
      }
      if (!truncated || continuations >= MAX_CONTINUATIONS) throw e
      continuations++
      yield { type: 'provider', provider: `${p.label} (cont ${continuations}/${MAX_CONTINUATIONS})`, model }
      prompt = full.trim()
        ? buildContinuationPrompt(full)
        : opts.prompt + '\n\n(Previous attempt produced no visible text — write the complete answer now, keeping it within the token budget.)'
      // Clean paragraph break between the cut-off draft and its continuation.
      if (full.trim()) {
        full += '\n\n'
        yield { type: 'delta', text: '\n\n' }
      }
    }
  }
  // Reasoning models (DeepSeek V4 Flash / Nemotron / GLM) occasionally stream
  // ONLY reasoning_content deltas and never emit final prose. Re-open once
  // with thinking OFF so the model is forced to write the article text.
  if (!full.trim() && isReasoningModel) {
    const retryPrompt =
      opts.prompt + '\n\n(Previous attempt produced no visible text — write the complete answer now, without a reasoning chain.)'
    const { res: retryRes } = await fetchStreamWithRetry(() => streamOnce(retryPrompt, true))
    for await (const delta of parseOpenAiSse(retryRes.body)) {
      full += delta
      yield { type: 'delta', text: delta }
    }
  }
  if (!full.trim()) throw new Error(`${p.label} stream returned empty content`)
  yield { type: 'done', text: full.trim(), provider: p.label, model }
}

/**
 * Grok chat-completions fallback record. `grokComplete` uses this only for
 * the Responses-API 404 path (console API keys); no other provider remains.
 */
function listOpenAiFallbackProviders(): OpenAiCompat[] {
  const out: OpenAiCompat[] = []
  if (isGrokConfigured()) {
    out.push({
      label: 'grok',
      baseURL: grokInferenceBaseUrl(env('XAI_API_KEY'), env('XAI_BASE_URL')),
      apiKey: env('XAI_API_KEY'),
      model: env('XAI_MODEL') || 'grok-4.6',
    })
  }
  return out
}

/** Operator-facing list of the commissioned content AI backends (registry-derived). */
export function listConfiguredContentProviders(): Array<{
  id: string
  label: string
  configured: boolean
  role: 'primary' | 'fallback'
}> {
  return COMMISSIONED_PROVIDERS.map((provider) => ({
    id: provider.pin,
    label: provider.label,
    configured: provider.isConfigured(),
    role: 'primary' as const,
  }))
}

/**
 * Resolve the legacy preferred provider label for `resolveAiProviderPin`.
 *
 * The commissioned execution doors do NOT use this function — they select
 * through `resolveExecutionProvider` (registry). Kept only for the exported
 * legacy resolver; empty/unknown values resolve through the legacy configured
 * order, whose lead is Grok.
 */
function preferProvider(): string {
  const explicit = (env('CONTENT_AI_PROVIDER') || env('AI_PROVIDER') || '').toLowerCase().trim()
  if (!explicit || explicit === 'auto' || explicit === 'default' || explicit === 'primary') {
    return configuredProviderOrder()[0] || 'grok'
  }
  // GPT-5.6 model aliases in the env pin → OpenAI provider (mirrors
  // resolveAiProviderPin so both resolution paths agree).
  if (GPT_ALIAS_RE.test(explicit)) {
    return 'openai'
  }
  if (isRunbiosPin(explicit)) {
    return canonicalizeRunbiosPin(explicit)
  }
  // Aliases → NVIDIA GLM 5.2 (preferred lead on this estate).
  // GLM 5.2 wins the NVIDIA pin even when `nvidia`/`nim` are passed, because the
  // operator-visible model label is the more accurate mental model.
  if (
    explicit === 'glm' ||
    explicit === 'glm-5' ||
    explicit === 'glm-5.2' ||
    explicit === 'z-ai' ||
    explicit === 'z-ai-glm-5.2' ||
    explicit === 'nvidia-glm' ||
    explicit === 'nvidia-glm-5.2'
  ) {
    return 'nvidia-glm'
  }
  if (
    explicit === 'nemotron' ||
    explicit === 'nemotron-3-ultra' ||
    explicit === 'nvidia-nemotron'
  ) {
    return 'nvidia-nemotron'
  }
  if (
    explicit === 'minimax' ||
    explicit === 'minimax-m3' ||
    explicit === 'minimaxai/minimax-m3' ||
    explicit === 'nvidia-minimax'
  ) {
    return 'nvidia-minimax'
  }
  // Aliases → Baseten GLM 5.2 Fast (mirrors configuredProviderOrder)
  if (explicit === 'glm-fast' || explicit === 'baseten-glm' || explicit === 'baseten-glm-fast') {
    return 'baseten-glm-fast'
  }
  // Aliases → AIHubmix GLM 5.2 Fast (OpenAI-compatible aggregator route)
  if (
    explicit === 'aihubmix' ||
    explicit === 'aihubmix-glm' ||
    explicit === 'aihubmix-glm-fast' ||
    explicit === 'glm-fast-aihubmix'
  ) {
    return 'aihubmix-glm-fast'
  }
  // Aliases → Parasail (psk- key, api.parasail.io)
  if (
    explicit === 'parasail' ||
    explicit === 'parasail-deepseek' ||
    explicit === 'parasail-deepseek-v4-flash'
  ) {
    return 'parasail-deepseek'
  }
  if (
    explicit === 'parasail-deepseek-pro' ||
    explicit === 'parasail-pro' ||
    explicit === 'deepseek-v4-pro' ||
    explicit === 'deepseek-ai/deepseek-v4-pro-0813'
  ) {
    return 'parasail-deepseek-pro'
  }
  if (explicit === 'baseten-deepseek-pro') return 'baseten-deepseek-pro'
  if (explicit === 'deepseek-pro' || explicit === 'deepseek-official-pro') return 'deepseek-pro'
  if (explicit === 'deepseek-flash' || explicit === 'deepseek-official' || explicit === 'deepseek-official-flash') {
    return 'deepseek-flash'
  }
  if (explicit === 'zai-glm' || explicit === 'zai' || explicit === 'zhipu' || explicit === 'zhipu-glm') {
    return 'zai-glm'
  }
  if (
    explicit === 'parasail-glm' ||
    explicit === 'parasail-glm-52' ||
    explicit === 'parasail-glm-5.2' ||
    explicit === 'nvidia/glm-5.2-nvfp4'
  ) {
    return 'parasail-glm'
  }
  // Aliases → NVIDIA DeepSeek primary
  if (
    explicit === 'deepseek' ||
    explicit === 'deepseek-v4' ||
    explicit === 'nvidia' ||
    explicit === 'nvidia-deepseek' ||
    explicit === 'nim'
  ) {
    return 'nvidia-deepseek'
  }
  // Explicit alternate lead (cloudflare, groq, …) — still falls through to
  // DeepSeek → CF → rest after that provider in orderedCompleters.
  const allowedPins = new Set([
    'cloudflare',
    'cloudflare-ai',
    'workers-ai',
    'groq',
    'gemini',
    'openrouter',
    'openai',
    'custom',
    'xai',
    'grok',
    'nvidia-glm', // NVIDIA GLM 5.2 (z-ai/glm-5.2) — preferred NVIDIA lead
    'baseten-glm-53-flash', // Baseten GLM 5.3 Flash — fallback host
    'runbios-glm-53-flash',
    'runbios',
    'runbios-glm',
    ...RUNBIOS_SLOTS.map((s) => s.id),
    'nvidia-minimax', // NVIDIA MiniMax M3 drafting model
    'nvidia-nemotron', // NVIDIA Nemotron 3 Ultra reasoning model
    'baseten', 'baseten-deepseek', 'baseten-deepseek-pro', 'baseten-glm-fast', 'baseten-glm-53-flash',
    'aihubmix', 'aihubmix-glm', 'aihubmix-glm-fast', // AIHubmix GLM 5.2 Fast
    'parasail', 'parasail-deepseek', 'parasail-deepseek-pro', 'parasail-glm',
    'deepseek-flash', 'deepseek-pro', 'zai-glm',
    'entrim', 'entrim-deepseek',
    'nvidia-deepseek', // already aliased upstream, allowed as explicit pin
    'entrim-qwen-27b', // Entrim Qwen3.6 27B — Discover / Brief / Reviewer lanes
  ])
  if (!allowedPins.has(explicit)) {
    console.warn(
      `[contentAi] Unknown CONTENT_AI_PROVIDER="${explicit}" — using grok (the studio default)`,
    )
    return 'grok'
  }
  return explicit
}

/** Graduate Grok + Entrim families to the lead of the auto cascade — the same
 *  order DEFAULT_PROVIDER_ORDER declares (Grok first, then Entrim Qwen /
 *  DeepSeek), so AUTO prefers the paid SuperGrok subscription. */
function promoteLiveStudioLead(order: string[]): string[] {
  const lead = ['grok', 'entrim-qwen-27b', 'entrim-deepseek']
  const without = order.filter((id) => !lead.includes(id))
  return [...lead, ...without]
}

/** Parse the admin-saved order defensively (JSON or CSV). */
function configuredProviderOrder(): string[] {
  const raw = env('CONTENT_AI_PROVIDER_ORDER').trim()
  if (!raw) {
    return promoteLiveStudioLead([
      'nvidia-minimax', 'runbios-glm-53-flash', 'grok', 'nvidia-nemotron', 'nvidia-glm', 'nvidia-deepseek', 'baseten-deepseek',
      'parasail-deepseek', 'deepseek-flash', 'parasail-glm',    'baseten-glm-fast', 'baseten-glm-53-flash',
    'openai', 'cloudflare-ai', 'groq', 'gemini', 'openrouter', 'custom', 'deepseek',
      'aihubmix-glm-fast', 'parasail-deepseek-pro', 'baseten-deepseek-pro',
      'deepseek-pro', 'zai-glm',
    ])
  }
  let values: unknown = raw
  try { values = JSON.parse(raw) } catch { values = raw.split(',') }
  if (!Array.isArray(values)) return []
  const aliases: Record<string, string> = {
    glm: 'nvidia-glm', 'glm-5.2': 'nvidia-glm', 'z-ai': 'nvidia-glm',
    nemotron: 'nvidia-nemotron', 'nemotron-3-ultra': 'nvidia-nemotron',
    baseten: 'baseten-deepseek', 'baseten-deepseek': 'baseten-deepseek',
    'glm-fast': 'baseten-glm-fast', 'baseten-glm': 'baseten-glm-fast',
    runbios: 'runbios-glm-53-flash', 'runbios-glm': 'runbios-glm-53-flash',
    'glm-5.3-flash': 'runbios-glm-53-flash', 'zai-org/glm-5.3-flash': 'baseten-glm-53-flash',
    aihubmix: 'aihubmix-glm-fast', 'aihubmix-glm': 'aihubmix-glm-fast',
    'glm-fast-aihubmix': 'aihubmix-glm-fast',
    parasail: 'parasail-deepseek', 'parasail-deepseek-v4-flash': 'parasail-deepseek',
    'parasail-deepseek-pro': 'parasail-deepseek-pro', 'parasail-pro': 'parasail-deepseek-pro',
    'deepseek-v4-pro': 'parasail-deepseek-pro',
    'baseten-deepseek-pro': 'baseten-deepseek-pro',
    'deepseek-pro': 'deepseek-pro', 'deepseek-flash': 'deepseek-flash',
    entrim: 'entrim-deepseek', 'entrim-deepseek': 'entrim-deepseek',
    'entrim-deepseek-v4-flash': 'entrim-deepseek', 'entrim-deepseek-v4-flash-0731': 'entrim-deepseek',
    'entrim-qwen-27b': 'entrim-qwen-27b', 'qwen3.6-27b': 'entrim-qwen-27b', qwen: 'entrim-qwen-27b',
    'parasail-glm-52': 'parasail-glm', 'parasail-glm-5.2': 'parasail-glm',
    'nvidia/glm-5.2-nvfp4': 'parasail-glm',
    zai: 'zai-glm', zhipu: 'zai-glm',
    nvidia: 'nvidia-deepseek', nim: 'nvidia-deepseek',
    cloudflare: 'cloudflare-ai', 'workers-ai': 'cloudflare-ai', xai: 'grok',
  }
  const known = new Set([
    'runbios-glm-53-flash',
    ...RUNBIOS_SLOTS.map((s) => s.id),
    'nvidia-minimax', 'nvidia-nemotron',    'nvidia-glm', 'baseten-deepseek', 'baseten-deepseek-pro',
    'baseten-glm-fast', 'baseten-glm-53-flash', 'aihubmix-glm-fast', 'parasail-deepseek', 'parasail-deepseek-pro',
    'parasail-glm', 'nvidia-deepseek', 'deepseek-flash', 'deepseek-pro', 'zai-glm',
    'entrim-deepseek', 'entrim-qwen-27b', 'grok', 'openai', 'cloudflare-ai', 'groq', 'gemini', 'openrouter', 'custom', 'deepseek',
  ])
  const configured = [...new Set(values.map((value) => String(value).trim().toLowerCase()).filter(Boolean).map((value) => aliases[value] || value))]
  // New providers remain selectable even when an older saved order predates them.
  const merged = [...configured, ...[...known].filter((id) => !configured.includes(id))]
  return promoteLiveStudioLead(merged)
}

/**
 * Generate long-form content.
 * Default: DeepSeek (NVIDIA) → Cloudflare fallback → other free tiers.
 *
 * If the subrequest budget is exhausted mid-cascade, remaining providers are
 * skipped immediately (they would all fail the same way).
 */
/**
 * Per-attempt deadline for non-stream completions so a stalled provider can
 * never hang the caller (env CONTENT_AI_COMPLETE_TIMEOUT_MS, default 120s).
 */
const COMPLETE_TIMEOUT_MS = Math.max(
  15_000,
  Number.parseInt(process.env.CONTENT_AI_COMPLETE_TIMEOUT_MS || '180000', 10) || 180_000,
)
/** Grok 4.6 reasoning routinely needs 1–3 minutes. Callers that pass 90s
 *  (the old brief deadline) must not cut SuperGrok off mid-thought. */
const GROK_MIN_TIMEOUT_MS = Math.max(
  180_000,
  Number.parseInt(process.env.CONTENT_AI_GROK_TIMEOUT_MS || '180000', 10) || 180_000,
)
/** GLM 5.3 Flash always reasons. Low effort still often needs 3–8 minutes
 *  to finish a blog-length draft; killing at 180s left empty articles. */
const RUNBIOS_MIN_TIMEOUT_MS = Math.max(
  180_000,
  Number.parseInt(process.env.CONTENT_AI_RUNBIOS_TIMEOUT_MS || '600000', 10) || 600_000,
)

export function deadlineForProvider(label: string, requested?: number, strict = false): number {
  const base = requested ?? COMPLETE_TIMEOUT_MS
  if (strict && requested != null) return Math.max(2_000, requested)
  if (label === 'grok') return Math.max(base, GROK_MIN_TIMEOUT_MS)
  if (isRunbiosPin(label)) {
    return Math.max(base, RUNBIOS_MIN_TIMEOUT_MS)
  }
  return base
}

function withUniversalQualityContract(opts: ContentAiOptions): ContentAiOptions {
  const marker = '## MANDATORY QUALITY RULES'
  if (opts.skipQualityContract) return opts
  if (opts.system.includes(marker)) return opts
  const system = opts.system.trim()
  return {
    ...opts,
    system: system ? `${system}\n\n${qualityPromptBlock(opts.contentType)}` : qualityPromptBlock(opts.contentType),
  }
}

async function withDeadline<T>(label: string, ms: number, promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label}: timed out after ${Math.round(ms / 1000)}s`)),
          ms,
        )
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Normalize a caller-supplied provider pin into { explicit, prefer }.
 *
 * 'auto' / 'default' / 'primary' / empty are AUTO MODE: the literal string is
 * never a candidate label, so passing it through as `prefer` made
 * generateContentText throw `Selected AI provider "auto" is not configured`
 * even when providers ARE configured (2026-08 regression: suggest-keywords
 * and factory routes send aiProvider:'auto'). In auto mode we clear the
 * explicit pin ('' → cascade + fallback enabled) and resolve the best
 * configured provider through preferProvider().
 *
 * GPT model aliases ('gpt-5.6-terra' / 'gpt-5.6-sol' / 'gpt-5.6' / 'gpt-5.6-luna')
 * are also normalized: they are model names, not provider labels, so they map
 * to the OpenAI provider with a model override. This prevents the same
 * "not configured" throw when the studio forwards its GPT picker value
 * straight into the factory pipeline.
 */
const GPT_ALIAS_RE = /^gpt-5\.6(-(?:terra|sol|luna))?$/

/** Normalize a GPT-5.6 model alias to its canonical model id (bare → flagship sol). */
function gptAliasModel(pin: string): string {
  return pin === 'gpt-5.6' ? 'gpt-5.6-sol' : pin
}

export function resolveAiProviderPin(raw?: string): { explicit: string; prefer: string; model?: string } {
  const pin = (raw || '').trim().toLowerCase()
  // GPT-5.6 family aliases → OpenAI provider + model override.
  // gpt-5.6 bare → gpt-5.6-sol (GPT-5.6 flagship alias), same as the
  // request-level mapping in openAiCompatibleComplete.
  if (GPT_ALIAS_RE.test(pin) || pin === 'chatgpt' || pin === 'chatgpt-plus') {
    const model = pin === 'chatgpt' || pin === 'chatgpt-plus' ? 'gpt-5.6-sol' : gptAliasModel(pin)
    return { explicit: 'openai', prefer: 'openai', model }
  }
  if (isRunbiosPin(pin)) {
    const id = canonicalizeRunbiosPin(pin)
    return { explicit: id, prefer: id }
  }
  // Entrim Qwen3.6 27B — explicit lane pin → entrim provider with the exact
  // upstream model id (Qwen/Qwen3.6-27B), used in the Discover, Brief, and
  // Reviewer lanes (mirrors how 'grok' / 'claude-opus-5' are wired).
  if (pin === ENTRIM_QWEN_LABEL || pin === 'qwen3.6-27b' || pin === 'qwen') {
    return { explicit: ENTRIM_QWEN_LABEL, prefer: ENTRIM_QWEN_LABEL, model: ENTRIM_QWEN_MODEL }
  }
  const isAutoMode = !pin || pin === 'auto' || pin === 'default' || pin === 'primary'
  // Normalize non-GPT aliases so an explicit quick-select ('glm-fast',
  // 'baseten-glm', 'nvidia', 'nim', 'cloudflare'…) resolves to the canonical
  // provider label — otherwise the early-fail check in generateContentText
  // throws "Selected AI provider 'glm-fast' is not configured" even when the
  // backend IS configured. Mirrors the alias maps in configuredProviderOrder
  // and preferProvider so every resolution path agrees.
  const aliasMap: Record<string, string> = {
    'glm-fast': 'baseten-glm-fast',
    'baseten-glm': 'baseten-glm-fast',
    runbios: 'runbios-glm-53-flash',
    'runbios-glm': 'runbios-glm-53-flash',
    'runbios-glm-53-flash': 'runbios-glm-53-flash',
    'glm-5.3-flash': 'runbios-glm-53-flash',
    'zai-org/glm-5.3-flash': 'baseten-glm-53-flash',
    'aihubmix-glm-fast': 'aihubmix-glm-fast',
    'aihubmix-glm': 'aihubmix-glm-fast',
    'glm-fast-aihubmix': 'aihubmix-glm-fast',
    parasail: 'parasail-deepseek',
    'parasail-deepseek': 'parasail-deepseek',
    'parasail-deepseek-v4-flash': 'parasail-deepseek',
    'parasail-deepseek-pro': 'parasail-deepseek-pro',
    'parasail-pro': 'parasail-deepseek-pro',
    'deepseek-v4-pro': 'parasail-deepseek-pro',
    'deepseek-ai/deepseek-v4-pro-0813': 'parasail-deepseek-pro',
    // Raw DeepSeek V4 model ids can be forwarded as the provider pin (the
    // studio picker labels the model with its dated checkpoint id). NVIDIA's
    // catalog id is the lowercase form; the mixed-case form is what
    // Parasail/Baseten serve. Map the lowercase flash id to NVIDIA (the
    // documented default for a bare deepseek pin) so it never falls through
    // to the early-fail "not configured" throw. The pin lowercases before
    // lookup, so both cases collapse onto the lowercase key.
    'deepseek-ai/deepseek-v4-flash-0731': 'nvidia-deepseek',
    'deepseek-ai/deepseek-v4-flash': 'nvidia-deepseek',
    'baseten-deepseek-pro': 'baseten-deepseek-pro',
    'deepseek-pro': 'deepseek-pro',
    'deepseek-flash': 'deepseek-flash',
    entrim: 'entrim-deepseek', 'entrim-deepseek': 'entrim-deepseek',
    'entrim-qwen-27b': 'entrim-qwen-27b', 'qwen3.6-27b': 'entrim-qwen-27b',
    'entrim-deepseek-v4-flash': 'entrim-deepseek', 'entrim-deepseek-v4-flash-0731': 'entrim-deepseek',
    'entrim-deepseek-v4-pro': 'entrim-deepseek',
    zai: 'zai-glm',
    'zai-glm': 'zai-glm',
    zhipu: 'zai-glm',
    'parasail-glm': 'parasail-glm',
    'parasail-glm-52': 'parasail-glm',
    'parasail-glm-5.2': 'parasail-glm',
    'nvidia/glm-5.2-nvfp4': 'parasail-glm',
    glm: 'nvidia-glm',
    'glm-5': 'nvidia-glm',
    'glm-5.2': 'nvidia-glm',
    'z-ai': 'nvidia-glm',
    'z-ai-glm-5.2': 'nvidia-glm',
    'nvidia-glm-5.2': 'nvidia-glm',
    nemotron: 'nvidia-nemotron',
    'nemotron-3-ultra': 'nvidia-nemotron',
    minimax: 'nvidia-minimax',
    'minimax-m3': 'nvidia-minimax',
    'minimaxai/minimax-m3': 'nvidia-minimax',
    baseten: 'baseten-deepseek',
    deepseek: 'nvidia-deepseek',
    'deepseek-v4': 'nvidia-deepseek',
    nvidia: 'nvidia-deepseek',
    nim: 'nvidia-deepseek',
    cloudflare: 'cloudflare-ai',
    'workers-ai': 'cloudflare-ai',
    xai: 'grok',
  }
  const canonical = aliasMap[pin] || pin
  const explicit = isAutoMode ? '' : canonical
  return { explicit, prefer: explicit || preferProvider() }
}

/**
 * Generate long-form content.
 *
 * Commissioned policy (P2): exactly ONE commissioned provider serves each
 * call — the explicitly selected pin, or the Grok lane default for
 * empty/'auto'. A legacy/unknown pin throws a typed
 * `ProviderSelectionRequiredError` before any configuration or network work;
 * there is no redirect, no break-glass restore, and no cross-provider
 * fallback (Grok↔DeepSeek crossover is impossible by construction). A single
 * adapter keeps same-provider retries inside its own transport.
 */
export async function generateContentText(opts: ContentAiOptions): Promise<ContentAiResult> {
  // Ask the canonical registry selector at the very start, BEFORE any
  // configuration, vault, OAuth, or provider network work: a legacy/unknown
  // explicit pin must fail closed with ProviderSelectionRequiredError, and
  // only missing/empty/'auto' may resolve to the Grok lane default.
  const selection = resolveExecutionProvider({ requestedPin: opts.aiProvider, lane: EXECUTION_SELECTION_LANE })
  if (selection.kind === 'needs_selection') {
    throw new ProviderSelectionRequiredError(selection.legacyValue)
  }
  // Apply the latest admin provider/key settings without requiring a redeploy.
  await refreshAiVault()
  // Every provider receives the same compliance contract, including custom
  // depth-rescue systems that do not pass through the factory prompt builder.
  opts = withUniversalQualityContract(opts)

  const adapter = commissionedAdapterFor(selection.pin, opts)
  return withDeadline(
    adapter.pin,
    deadlineForProvider(adapter.pin, opts.timeoutMs, opts.strictTimeout === true),
    adapter.complete(),
  )
}

/**
 * Stream long-form content into the editor through the single commissioned
 * adapter selected for this call — the Grok Responses stream or the
 * first-party DeepSeek SSE stream. Legacy/unknown pins throw typed before any
 * network work, and there is no cross-provider streaming fallback.
 */
export async function* generateContentTextStream(
  opts: ContentAiOptions,
): AsyncGenerator<ContentAiStreamEvent> {
  // Ask the canonical registry selector at the very start, BEFORE any
  // configuration, vault, OAuth, or provider network work: a legacy/unknown
  // explicit pin must fail closed with ProviderSelectionRequiredError, and
  // only missing/empty/'auto' may resolve to the Grok lane default.
  const selection = resolveExecutionProvider({ requestedPin: opts.aiProvider, lane: EXECUTION_SELECTION_LANE })
  if (selection.kind === 'needs_selection') {
    throw new ProviderSelectionRequiredError(selection.legacyValue)
  }
  // Apply the latest admin provider/key settings before constructing candidates.
  await refreshAiVault()
  // Streaming and complete generation share one compliance contract.
  opts = withUniversalQualityContract(opts)

  const adapter = commissionedAdapterFor(selection.pin, opts)
  yield* adapter.stream()
}
