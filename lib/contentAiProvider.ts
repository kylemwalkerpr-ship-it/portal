/**
 * Content-generation AI provider for Content Studio / SEO Factory.
 *
 * DEFAULT CHAIN (hard order):
 *   1. Run BiOS GLM 5.3 Flash (draft / brief / review / engine primary)
 *   2. NVIDIA MiniMax M3, xAI Grok, NVIDIA GLM / DeepSeek → Baseten / Parasail → rest
 *   3. getChatProvider() bridge
 *
 * NVIDIA auth: NVIDIA_API_KEY | NVAPI_KEY | NVIDIA_NIM_API_KEY
 * CF auth: CLOUDFLARE_AI_TOKEN | CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID
 * Run BiOS: RUNBIOS_API_KEY → https://api.runbios.ai/v1  model glm-5.3-flash
 *
 * Override with CONTENT_AI_PROVIDER / AI_PROVIDER only if you must pin a backend.
 * Default / auto / primary → Run BiOS GLM 5.3 Flash.
 */

import { qualityPromptBlock } from './seoFactory/contentQualityGate'
import {
  canonicalizeRunbiosPin,
  isRunbiosPin,
  RUNBIOS_BASE_URL as RUNBIOS_CATALOG_BASE,
  runbiosSlot,
  RUNBIOS_SLOTS,
} from './runbiosCatalog'

const CF_AI_MODEL =
  process.env.CLOUDFLARE_AI_MODEL?.trim() ||
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast'

/** Default output budget — long-form guides need ~2k words (~3–4k tokens). */
const DEFAULT_MAX_TOKENS = 8192
/** NVIDIA DeepSeek V4 Flash via NVIDIA NIM — replaced EOL V4 Pro on 2026-08-07. */
const NVIDIA_DEEPSEEK_MAX_TOKENS = 16384
const DEFAULT_TEMPERATURE = 0.65
// Keep the cascade bounded while allowing one additional configured provider
// after a primary timeout and an exhausted quota fallback.
function maxProviderCandidates(): number {
  return Math.max(
    1,
    Math.min(10, Number.parseInt(env('CONTENT_AI_MAX_PROVIDERS') || '3', 10) || 3),
  )
}

const NVIDIA_INTEGRATE_BASE_DEFAULT = 'https://integrate.api.nvidia.com/v1'
const NVIDIA_MINIMAX_MODEL_DEFAULT = 'minimaxai/minimax-m3'
const NVIDIA_MINIMAX_MAX_TOKENS = 16384
const NVIDIA_DEEPSEEK_MODEL_DEFAULT = 'deepseek-ai/deepseek-v4-flash-0731'

/**
 * NVIDIA NIM catalog ids are ALL-LOWERCASE. The Baseten/Parasail form of the
 * same DeepSeek checkpoint is mixed-case (`deepseek-ai/DeepSeek-V4-Flash-0731`),
 * and if that string reaches integrate.api.nvidia.com NVIDIA answers "404 page
 * not found" — the model is not recognized. The vault/env model override can
 * carry either case (the admin may paste the Baseten id into the NVIDIA slot),
 * so canonicalize to the lowercase catalog form before any request leaves the
 * NVIDIA host. Verified live: lowercase 0731 → model found (529 overload),
 * mixed-case 0731 → 404. Safe for GLM / Nemotron too — every NVIDIA catalog id
 * is lowercase. */
export function canonicalizeNvidiaModelId(raw?: string | null): string {
  const id = String(raw || '').trim()
  if (!id) return NVIDIA_DEEPSEEK_MODEL_DEFAULT
  const lower = id.toLowerCase()
  // DeepSeek V4 Pro reached EOL on NVIDIA on 2026-08-07 (410 Gone) and the
  // bare `deepseek-ai/deepseek-v4-pro` id (NO -0813 suffix) is the retired
  // base checkpoint. Remap it to the live Flash checkpoint so a stale Worker
  // secret, vault model row, or pass-through id can never send the retired
  // model to integrate.api.nvidia.com again (410 regression). Pro-0813 is a
  // DIFFERENT id (live on Parasail/Baseten, not NVIDIA) and passes through.
  if (/deepseek-v4-pro(?!-0813)/i.test(lower)) return NVIDIA_DEEPSEEK_MODEL_DEFAULT
  return lower
}

/**
 * NVIDIA GLM 5.2 (z-ai/glm-5.2) — verified live against integrate.api.nvidia.com/v1
 * with NVAPI auth in 2026 Q3. Same base URL + OpenAI-compatible API as NVIDIA
 * DeepSeek, but with stronger multi-language / instruction-following in YMYL
 * contexts. Zhipu AI's GLM 5.2 family running on NVIDIA's NIM catalog.
 *
 * PROMOTED: GLM is now the preferred NVIDIA lead over DeepSeek on this
 * estate because (1) compliance-grade output on legal content and (2)
 * instruction-following are measurably stronger for our SEO briefs.
 *
 * NOTE: DeepSeek V4 Pro reached EOL 2026-08-07. Default is now
 * deepseek-v4-flash-0731 via NVIDIA and Baseten.
 */
const NVIDIA_GLM_MODEL_DEFAULT = 'z-ai/glm-5.2'
const NVIDIA_GLM_MAX_TOKENS = 16384
/** NVIDIA Nemotron 3 Ultra — retained as an explicit reasoning alternative. */
const NVIDIA_NEMOTRON_MODEL_DEFAULT = 'nvidia/nemotron-3-ultra-550b-a55b'
const NVIDIA_NEMOTRON_MAX_TOKENS = 16384
const BASETEN_BASE_URL = 'https://inference.baseten.co/v1'
const BASETEN_MODEL = 'deepseek-ai/DeepSeek-V4-Flash-0731'
const BASETEN_PRO_MODEL = 'deepseek-ai/DeepSeek-V4-Pro-0813'
/** Baseten-hosted GLM 5.2 Fast — efficient high-volume drafting partner. */
const BASETEN_GLM_MODEL = 'zai-org/GLM-5.2-Fast'
/** Baseten-hosted GLM 5.3 Flash — low-token fallback for every stage. */
const BASETEN_GLM_53_MODEL = 'zai-org/GLM-5.3-Flash'
/** AIHubmix OpenAI-compatible aggregator (aihubmix.com/v1) — GLM 5.2 Fast
 *  is served as `glm-5.2-fast-preview` (the high-speed flagship route). */
const AIHUBMIX_BASE_URL = 'https://aihubmix.com/v1'
const AIHUBMIX_GLM_MODEL = 'glm-5.2-fast-preview'
const AIHUBMIX_MAX_TOKENS = 16384
/** Parasail (api.parasail.io/v1) — OpenAI-compatible serverless. One psk-
 *  key unlocks Flash (draft), Pro-0813 (research/review), and GLM 5.2.
 *  Keys are issued as `psk-…`; a pasted psk- on another slot is recognized
 *  as Parasail and never sent to OpenAI / DeepSeek.com. */
const PARASAIL_BASE_URL = 'https://api.parasail.io/v1'
const PARASAIL_DEEPSEEK_MODEL = 'deepseek-ai/DeepSeek-V4-Flash-0731'
const PARASAIL_DEEPSEEK_PRO_MODEL = 'deepseek-ai/DeepSeek-V4-Pro-0813'
/** Entrim OpenAI-compatible endpoint (api.entrim.ai/v1). Serves FIRST-PARTY
 *  DeepSeek V4 Flash as `deepseek-ai/DeepSeek-V4-Flash` — the EXACT upstream
 *  id, no -0731 suffix. That string must be sent verbatim; never canonicalize
 *  it down to the Baseten/Parasail checkpoint forms. */
export const ENTRIM_DEEPSEEK_LABEL = 'entrim-deepseek'
/** Entrim-hosted Qwen3.8 27B — the second first-party Entrim model. The id
 *  `Qwen/Qwen3.8-27B` is sent VERBATIM to api.entrim.ai/v1 (same rule as the
 *  DeepSeek flash: Entrim serves upstream ids as-is, never canonicalize). */
export const ENTRIM_QWEN_LABEL = 'entrim-qwen-27b'
export const ENTRIM_QWEN_MODEL = 'Qwen/Qwen3.8-27B'
const ENTRIM_BASE_URL = 'https://api.entrim.ai/v1'
const ENTRIM_DEEPSEEK_MODEL = 'deepseek-ai/DeepSeek-V4-Flash'
const ENTRIM_MAX_TOKENS = 16384
const RUNBIOS_BASE_URL = RUNBIOS_CATALOG_BASE
const RUNBIOS_GLM_MODEL = 'glm-5.3-flash'
const RUNBIOS_MAX_TOKENS = 16384

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

/**
 * Pin DeepSeek V4 to the dated checkpoints. Hosts that accept a bare
 * `DeepSeek-V4-Flash` / `deepseek-v4-pro` alias will silently serve the
 * April preview (base) instead of Flash-0731 / Pro-0813.
 */
export function canonicalizeDeepseekModelId(raw?: string | null, lane: 'flash' | 'pro' = 'flash'): string {
  const id = String(raw || '').trim()
  const lower = id.toLowerCase()
  const wantsPro =
    lane === 'pro' ||
    /v4[-_.]?pro/.test(lower) ||
    /pro-0813/.test(lower)
  if (wantsPro) {
    if (/0813/.test(lower) && /deepseek-ai\//.test(lower)) {
      return /deepseek-v4-pro-0813/.test(lower) ? 'deepseek-ai/DeepSeek-V4-Pro-0813' : id
    }
    return PARASAIL_DEEPSEEK_PRO_MODEL
  }
  if (/0731/.test(lower) && /deepseek-ai\//.test(lower)) {
    return /deepseek-v4-flash-0731/.test(lower) ? 'deepseek-ai/DeepSeek-V4-Flash-0731' : id
  }
  if (/0731/.test(lower)) return PARASAIL_DEEPSEEK_MODEL
  return PARASAIL_DEEPSEEK_MODEL
}

/**
 * Strict host-lane normalizer. The legacy normalizer intentionally accepts a
 * Pro-looking value when called for a Pro lane, but that flexibility is not
 * safe for a provider slot: a stale vault value must never turn a Flash lane
 * into a Pro request (or vice versa). Only the exact dated SKU for the lane
 * is accepted; every other value falls back to that lane's default.
 */
export function canonicalizeDeepseekLaneModelId(
  raw: string | null | undefined,
  lane: 'flash' | 'pro',
): string {
  const lower = String(raw || '').trim().toLowerCase()
  if (lane === 'pro') {
    return lower === 'deepseek-ai/deepseek-v4-pro-0813'
      ? 'deepseek-ai/DeepSeek-V4-Pro-0813'
      : PARASAIL_DEEPSEEK_PRO_MODEL
  }
  return lower === 'deepseek-ai/deepseek-v4-flash-0731'
    ? PARASAIL_DEEPSEEK_MODEL
    : PARASAIL_DEEPSEEK_MODEL
}
/**
 * Parasail GLM 5.2 catalog id. `nvidia/GLM-5.2-NVFP4` 404s on api.parasail.io
 * ("Deployment doesn't exist"). NVIDIA NIM / Parasail both serve `z-ai/glm-5.2`.
 */
const PARASAIL_GLM_MODEL = 'z-ai/glm-5.2'

/** Map retired Parasail GLM ids onto the live deployment. */
export function canonicalizeParasailGlmModelId(raw?: string | null): string {
  const id = String(raw || '').trim()
  if (!id) return PARASAIL_GLM_MODEL
  const lower = id.toLowerCase()
  if (/nvfp4/.test(lower) || /nvidia\/glm-5\.2/.test(lower)) return PARASAIL_GLM_MODEL
  return id
}
const PARASAIL_MAX_TOKENS = 16384
const DEEPSEEK_OFFICIAL_BASE_URL = 'https://api.deepseek.com/v1'
const DEEPSEEK_OFFICIAL_FLASH_MODEL = 'deepseek-ai/DeepSeek-V4-Flash-0731'
const DEEPSEEK_OFFICIAL_PRO_MODEL = 'deepseek-ai/DeepSeek-V4-Pro-0813'
const ZAI_BASE_URL = 'https://api.z.ai/api/paas/v4'
const ZAI_GLM_MODEL = 'glm-5.2'
const ZAI_MAX_TOKENS = 16384
/**
 * Kept as a compatibility note for older configuration rows. Nemotron now
 * follows NVIDIA's current hosted API example and does not emit a separate
 * `reasoning_budget` field.
 */
export const NVIDIA_NEMOTRON_REASONING_BUDGET_DEFAULT = 8192
// Raised from 16384: DeepSeek V4 Flash is a reasoning model that spends part of
// the budget on reasoning_content. With thinking disabled (extraBody below) the
// full budget goes to the article, but a 32768 cap leaves headroom for long
// regional guides without tripping finish_reason:'length'.
const BASETEN_MAX_TOKENS = 32768

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

/** Replace the active vault overlay (used by refreshAiVault / withVaultEnv). */
export function setVaultOverlay(overlay: Record<string, string> | null): void {
  vaultOverlay = overlay
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
        const { ensureSuperGrokAccessToken, XAI_DEFAULT_MODEL } = await import('@/lib/xaiSuperGrokOAuth')
        // Configurator precedence: a vault XAI row (admin-pasted key) wins
        // over the SuperGrok OAuth token — the token only fills the gap when
        // no explicit XAI credential is configured.
        if (!overlay.XAI_API_KEY) {
          const oauth = await ensureSuperGrokAccessToken()
          if (oauth?.accessToken) {
            overlay.XAI_API_KEY = oauth.accessToken
            overlay.XAI_AUTH_MODE = 'supergrok'
            if (!overlay.XAI_MODEL) overlay.XAI_MODEL = XAI_DEFAULT_MODEL
          }
        }
      }
    } catch (oauthErr) {
      console.warn(
        '[contentAi] SuperGrok OAuth overlay skipped',
        oauthErr instanceof Error ? oauthErr.message : oauthErr,
      )
    }
    try {
      if (typeof vault.getAiSettings === 'function') {
        const { ensureChatgptAccessToken, CHATGPT_DEFAULT_MODEL } = await import('@/lib/chatgptOAuth')
        // Same precedence as SuperGrok: a vault OPENAI row (admin-pasted key)
        // wins over the ChatGPT Plus OAuth token. The token only fills the gap
        // when no explicit OpenAI credential is configured.
        if (!overlay.OPENAI_API_KEY) {
          const oauth = await ensureChatgptAccessToken()
          if (oauth?.accessToken) {
            overlay.OPENAI_API_KEY = oauth.accessToken
            overlay.OPENAI_AUTH_MODE = 'chatgpt-plus'
            if (!overlay.OPENAI_MODEL) overlay.OPENAI_MODEL = CHATGPT_DEFAULT_MODEL
          }
        }
      }
    } catch (oauthErr) {
      console.warn(
        '[contentAi] ChatGPT OAuth overlay skipped',
        oauthErr instanceof Error ? oauthErr.message : oauthErr,
      )
    }
    vaultOverlay = overlay
    return Object.keys(overlay).filter((k) => /_(?:API_KEY|TOKEN|AUTH)$/.test(k))
  } catch (e) {
    console.warn(
      '[contentAi] vault overlay unavailable (is ai_provider_keys migrated?) — env vars only',
      e instanceof Error ? e.message : e,
    )
    vaultOverlay = null
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

/**
 * A provider base-URL override must be an http(s) URL. The AI Key Vault or a
 * Worker secret can hold a pasted API key / truncated value in the base-URL
 * field (2026-08: Baseten shipped "Invalid URL: <key>/chat/completions" when
 * BASETEN_BASE_URL resolved to a non-URL string). Anything that isn't an
 * http(s) URL is ignored so the provider falls back to its known-good default.
 */
function validBaseUrl(raw: string, fallback: string): string {
  const v = String(raw || '').trim()
  return /^https?:\/\//i.test(v) ? v.replace(/\/+$/, '') : fallback
}

/**
 * Provider endpoints are part of the provider identity. A model-specific
 * vault row must never be able to redirect NVIDIA traffic through a stale
 * Cloudflare Worker, or redirect Baseten traffic to another host. Keep the
 * operator override only when its hostname is the provider's documented host.
 */
function providerBaseUrl(raw: string, fallback: string, allowedHosts: string[]): string {
  const candidate = validBaseUrl(raw, fallback)
  try {
    const host = new URL(candidate).hostname.toLowerCase()
    return allowedHosts.includes(host) ? candidate : fallback
  } catch {
    return fallback
  }
}

/** NVIDIA's DeepSeek lane may never inherit Nemotron, GLM, Pro, or custom IDs. */
export function canonicalizeNvidiaDeepseekModelId(raw?: string | null): string {
  const id = String(raw || '').trim().toLowerCase()
  return id === NVIDIA_DEEPSEEK_MODEL_DEFAULT ? id : NVIDIA_DEEPSEEK_MODEL_DEFAULT
}

/** NVIDIA's GLM lane may never inherit DeepSeek or Nemotron IDs. */
export function canonicalizeNvidiaGlmModelId(raw?: string | null): string {
  const id = String(raw || '').trim().toLowerCase()
  return id === 'z-ai/glm-5.2' ? id : NVIDIA_GLM_MODEL_DEFAULT
}

/** NVIDIA's MiniMax lane always uses the exact hosted catalog id. */
export function canonicalizeNvidiaMinimaxModelId(_raw?: string | null): string {
  return NVIDIA_MINIMAX_MODEL_DEFAULT
}

/** NVIDIA's Nemotron lane may never inherit DeepSeek or GLM IDs. */
export function canonicalizeNvidiaNemotronModelId(_raw?: string | null): string {
  // NVIDIA's documented deployment is case-sensitive. Do not allow a vault or
  // Worker override from another Nemotron deployment to change the request;
  // always emit the exact lowercase catalog id from NVIDIA's example.
  return NVIDIA_NEMOTRON_MODEL_DEFAULT
}

/** Workers AI daily-neuron exhaustion is permanent until the quota resets. */
function isDailyQuotaError(value: unknown): boolean {
  const message = value instanceof Error ? value.message : String(value || '')
  return /daily free allocation|used up.*(?:daily )?allocation|free allocation.*neurons|neurons.*upgrade|account limited|error code\s*[:=]?\s*(3036|4006)/i.test(message)
}

/** 524s and exhausted quotas should not be retried against the same provider. */
function isNoRetryProviderError(value: unknown): boolean {
  const message = value instanceof Error ? value.message : String(value || '')
  return /\b524\b|gateway timeout|upstream.*timeout|timed out/i.test(message) || isDailyQuotaError(message)
}

/**
 * Transient infrastructure failures — capacity overloads, upstream timeouts,
 * and request aborts ("The operation was aborted"). The pinned provider may
 * recover a moment later, so an exclusive pin with cascadeOnCapacity falls
 * through to the next provider instead of hard-failing the call. Auth
 * (401/403), model (404/410), and contract errors are NOT transient and
 * still fail loudly.
 */
function isTransientInfraError(value: unknown): boolean {
  const message = value instanceof Error ? value.message : String(value || '')
  return /\b(429|503|524|529)\b|overload|high[ ._-]?demand|rate[ ._-]?limit|too many requests|capacity|aborted|timed out|gateway timeout|upstream.*timeout|fetch failed|econnreset|etimedout|socket hang up|network error|Function id .* not found|Specified function in account .* is not found/i.test(message)
}

/** Keep provider diagnostics useful without surfacing auth/token fingerprints. */
function formatProviderFailure(label: string, status: number, body: string): string {
  if (isDailyQuotaError(body)) {
    return `${label} ${status}: daily Workers AI free allocation exhausted; retry after the UTC quota reset or configure paid Workers AI`
  }
  if (status === 524 || /gateway timeout|upstream.*timeout/i.test(body)) {
    return `${label} ${status}: upstream gateway timeout; try again later or use another configured provider`
  }
  return `${label} ${status}: ${body.slice(0, 400)}`
}

/** Resolve account + API token for Workers AI REST. */
export function resolveCloudflareAiAuth(): { accountId: string; token: string } | null {
  const accountId =
    env('CLOUDFLARE_ACCOUNT_ID') ||
    // documented account for YouSafe CF (safe public ID, not a secret)
    env('CF_ACCOUNT_ID')

  // Prefer AI-scoped tokens; allow general API token when it has Workers AI permission
  const token =
    env('CLOUDFLARE_AI_TOKEN') ||
    env('CLOUDFLARE_WORKERS_AI_TOKEN') ||
    env('CLOUDFLARE_API_TOKEN')

  if (!accountId || !token) return null
  return { accountId, token }
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
      const retryable = /\b(503|429|524|529)\b|UNAVAILABLE|overload|high.demand|rate.?limit|gateway.timeout|ResourceExhausted|empty content|empty response/i.test(msg)
      if (!retryable || attempt >= maxAttempts || /Too many subrequest/i.test(msg) || isNoRetryProviderError(msg)) { console.warn(`[contentAi] ${name} non-retryable: ${msg.slice(0,120)}`); throw e }
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

/** Build a continuation prompt that resumes a draft cut off at the token cap. */
function buildContinuationPrompt(partial: string): string {
  const tail = partial.trim().slice(-2200)
  return (
    'CONTINUE WRITING THE DRAFT BELOW. The previous response was cut off at the token limit. ' +
    'Continue from exactly where it stopped and COMPLETE the remaining sections of the original outline. ' +
    'Do NOT repeat any text already present. Return ONLY the continuation — no new title, no front matter, ' +
    'and no closing summary of the whole piece unless the outline asked for one.\n\n' +
    'DRAFT SO FAR (last 2200 chars):\n' +
    (tail || '(no draft text was produced — restart the full write but keep it within the token budget)')
  )
}

/** Reasoning-capable models accept max_completion_tokens + reasoning_content. */
export function isReasoningModelId(model: string): boolean {
  return /^(gpt-5|o[0-9]|o1|o3|o4|deepseek|z-ai\/glm|zai-org\/glm|glm-5\.3|parasail-(?:deepseek|glm)|nemotron|grok)/i.test(model)
}

/** Host says the pinned deployment is gone — retrying the same model cannot recover. */
export function isUnavailableDeploymentError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '')
  return /\b404\b|doesn't exist|isn't accessible|model_not_found|not_found|unknown model|invalid model/i.test(msg)
}

/** Unpaid / quota / billing failures — SuperGrok is the studio-wide second option. */
export function isPaymentOrQuotaFailure(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '')
  return /insufficient_quota|unpaid|payment.?required|\b402\b|billing|past.?due|credit.?exhausted|requires.?payment|account.?not.?funded|quota.?exceeded|exceeded.?your.?current.?quota|You exceeded your current quota/i.test(msg)
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
  // Empty-content rescue: re-ask the SAME prompt with thinking OFF so a
  // reasoning model that spent its whole budget on chain-of-thought is forced
  // to emit final prose instead of bouncing the entire provider cascade.
  if (patch?.disableThinking) {
    if (body.chat_template_kwargs && typeof body.chat_template_kwargs === 'object') {
      body.chat_template_kwargs = {
        ...(body.chat_template_kwargs as Record<string, unknown>),
        // DeepSeek-family templates read `thinking`; GLM/Nemotron read
        // `enable_thinking`. Neutralize BOTH so the rescue re-ask cannot
        // silently re-enable chain-of-thought and return empty again.
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
    // parameter: enable_thinking") — a GPT reasoning model that burned its
    // budget returns empty + finish_reason:length, and the disableThinking
    // re-ask must NOT send this flag to OpenAI or it hard-fails. OpenAI's
    // empty-content case is recovered by a larger completion budget (see
    // resolveMaxTokens), not by toggling a thinking flag it doesn't support.
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
    // and leaks to the UI. Normalize it so callers see the readable timeout
    // (which isTransientInfraError can also classify for cascading).
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
 * a real API id (contains a host slash like `deepseek-ai/…` / `z-ai/…`, or is
 * a GPT-5.6 alias). Bare pins (`nvidia-deepseek`, `parasail-deepseek-pro`, …)
 * are NOT model ids and must never be sent as the model — they fall back to
 * the provider default. NVIDIA ids are canonicalized to the lowercase catalog
 * form (mixed-case 404s on integrate.api.nvidia.com). Without this, a reviewer
 * pinned to `nvidia-deepseek` silently used the deployed NVIDIA_DEEPSEEK_MODEL
 * secret (defaulted to the EOL'd deepseek-v4-pro → 410 Gone) instead of the
 * Flash checkpoint the user actually selected.
 */
export function resolveEffectiveModel(p: OpenAiCompat, opts: ContentAiOptions): string {
  const requested = String(opts.model || '').trim()
  if (!requested) return p.model
  const isRealModelId = requested.includes('/') || GPT_ALIAS_RE.test(requested)
  if (!isRealModelId) return p.model
  if (p.label === 'openai' || p.label === 'custom') {
    return requested.replace(/^gpt-5\.6$/i, 'gpt-5.6-sol')
  }
  if (p.label === 'nvidia-deepseek') return canonicalizeNvidiaDeepseekModelId(requested)
  if (p.label === 'nvidia-glm') return canonicalizeNvidiaGlmModelId(requested)
  if (p.label === 'nvidia-minimax') return canonicalizeNvidiaMinimaxModelId(requested)
  if (p.label === 'nvidia-nemotron') return canonicalizeNvidiaNemotronModelId(requested)
  if (p.label === 'baseten-deepseek' || p.label === 'baseten-deepseek-pro') {
    return canonicalizeDeepseekLaneModelId(requested, p.label === 'baseten-deepseek-pro' ? 'pro' : 'flash')
  }
  return requested
}

async function openAiCompatibleComplete(
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
    if (finishReason === 'length' && text.trim()) {
      // 2026-08-11: raised from 1→3 continuation attempts — long legal
      // guides routinely need multiple continuations after hitting the
      // model's per-response token cap.
      for (let c = 0; c < 3 && finishReason === 'length'; c++) {
        const cont = await openAiCompatFetch(patched, opts, buildContinuationPrompt(text))
        text = (text + '\n\n' + cont.text).trim()
        finishReason = cont.finishReason
      }
    }
      if (!text) throw new Error(`${p.label} returned empty content`)
      // Still cut off after the continuation — cascade to the next provider.
      if (finishReason === 'length') {
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

/** NVIDIA Integrate API key for DeepSeek (long-form primary). */
export function resolveNvidiaApiKey(): string {
  return (
    env('NVIDIA_API_KEY') ||
    env('NVAPI_KEY') ||
    env('NVIDIA_NIM_API_KEY') ||
    env('NVIDIA_DEEPSEEK_API_KEY') ||
    ''
  )
}

export function isNvidiaGlmConfigured(): boolean {
  return Boolean(resolveNvidiaApiKey())
}

/** True when Grok can run: SuperGrok OAuth overlay or an XAI_API_KEY. */
export function isGrokConfigured(): boolean {
  return Boolean(env('XAI_API_KEY'))
}

/** True when OpenAI can run: an OPENAI_API_KEY that isn't a Parasail psk- key,
 *  or a connected ChatGPT Plus OAuth token (OPENAI_AUTH_MODE=chatgpt-plus). */
export function isOpenaiConfigured(): boolean {
  const key = env('OPENAI_API_KEY')
  if (key) return !looksLikeParasailKey(key)
  return env('OPENAI_AUTH_MODE') === 'chatgpt-plus'
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
): {
  maxOutputTokens: number
  reasoningEffort: 'low' | 'medium' | 'high'
} {
  const requested = Math.max(256, maxTokens ?? DEFAULT_MAX_TOKENS)
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
    baseURL: validBaseUrl(env('XAI_BASE_URL'), 'https://api.x.ai/v1'),
  }
}

/**
 * SuperGrok / Grok 4.6 primary transport: xAI Responses API.
 * Chat Completions is a fallback only — OAuth subscription tokens and
 * grok-4.6 reasoning output land on /v1/responses, not /chat/completions.
 */
async function grokResponsesFetch(
  opts: ContentAiOptions,
  userContent: string,
): Promise<{ text: string; finishReason?: string | null; model: string }> {
  const { apiKey, baseURL } = grokAuthHeader()
  const model = grokModelId(opts)
  const limits = grokRequestLimits(opts.maxTokens, opts.reasoningEffort)
  const timeoutMs = opts.strictTimeout && opts.timeoutMs != null
    ? Math.max(2_000, opts.timeoutMs)
    : Math.max(
      opts.timeoutMs ?? 0,
      deadlineForProvider('grok', opts.timeoutMs),
      Number.parseInt(process.env.CONTENT_AI_FETCH_TIMEOUT_MS || '180000', 10) || 180_000,
    )
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let res: Response
  try {
    res = await fetch(`${baseURL}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: [
          { role: 'system', content: opts.system },
          { role: 'user', content: userContent },
        ],
        store: false,
        max_output_tokens: limits.maxOutputTokens,
        reasoning: { effort: limits.reasoningEffort },
      }),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    throw new Error(formatProviderFailure('grok', res.status, errBody))
  }
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

async function* grokResponsesStream(opts: ContentAiOptions): AsyncGenerator<ContentAiStreamEvent> {
  const { apiKey, baseURL } = grokAuthHeader()
  const model = grokModelId(opts)
  const limits = grokRequestLimits(opts.maxTokens, opts.reasoningEffort)
  const timeoutMs = deadlineForProvider('grok', opts.timeoutMs, opts.strictTimeout === true)
  yield { type: 'provider', provider: 'grok', model: `${model} · ${limits.reasoningEffort} effort` }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let res: Response
  try {
    res = await fetch(`${baseURL}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model,
        input: [
          { role: 'system', content: opts.system },
          { role: 'user', content: opts.prompt },
        ],
        store: false,
        stream: true,
        max_output_tokens: limits.maxOutputTokens,
        reasoning: { effort: limits.reasoningEffort },
      }),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    throw new Error(formatProviderFailure('grok', res.status, errBody))
  }
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
        throw new Error(`grok: ${err}`)
      } else if (type === 'response.completed' && ev.response) {
        const rest = extractResponsesText(ev.response)
        if (rest && rest.length > full.length) full = rest
      }
    }
  }
  if (!full.trim()) throw new Error('grok stream returned empty content')
  yield { type: 'done', text: full.trim(), provider: 'grok', model }
}

async function grokComplete(opts: ContentAiOptions): Promise<ContentAiResult> {
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
    if ((finishReason === 'length' || finishReason === 'max_output_tokens') && words < 400) {
      for (let c = 0; c < 2 && (finishReason === 'length' || finishReason === 'max_output_tokens'); c++) {
        try {
          const cont = await grokResponsesFetch(opts, buildContinuationPrompt(text))
          text = `${text}\n\n${cont.text}`.trim()
          finishReason = cont.finishReason
        } catch {
          break
        }
      }
    }
    // Keep a substantial incomplete draft instead of cascading away from Grok.
    if (text.trim().split(/\s+/).filter(Boolean).length >= 400) {
      return { text, provider: 'grok', model: usedModel }
    }
    if (finishReason === 'length' || finishReason === 'max_output_tokens') {
      throw new Error('grok output was truncated (token limit) — trying next provider')
    }
    return { text, provider: 'grok', model: usedModel }
  })
}

export function isNvidiaDeepseekConfigured(): boolean {
  return Boolean(resolveNvidiaApiKey())
}

export function isNvidiaNemotronConfigured(): boolean {
  return Boolean(resolveNvidiaApiKey())
}

export function isNvidiaMinimaxConfigured(): boolean {
  return Boolean(resolveNvidiaApiKey())
}

/** NVIDIA-hosted MiniMax M3 — OpenAI-compatible drafting model. */
export function getNvidiaMinimaxProvider(): OpenAiCompat | null {
  const apiKey = resolveNvidiaApiKey()
  if (!apiKey) return null
  return {
    label: 'nvidia-minimax',
    baseURL: providerBaseUrl(env('NVIDIA_BASE_URL'), NVIDIA_INTEGRATE_BASE_DEFAULT, ['integrate.api.nvidia.com']),
    apiKey,
    model: canonicalizeNvidiaMinimaxModelId(env('NVIDIA_MINIMAX_MODEL') || NVIDIA_MINIMAX_MODEL_DEFAULT),
    topP: Number(env('NVIDIA_TOP_P') || '0.95') || 0.95,
    maxTokensCap: NVIDIA_MINIMAX_MAX_TOKENS,
  }
}

/** NVIDIA-hosted Nemotron 3 Ultra — reasoning-enabled OpenAI-compatible NIM. */
export function getNvidiaNemotronProvider(): OpenAiCompat | null {
  const apiKey = resolveNvidiaApiKey()
  if (!apiKey) return null
  return {
    label: 'nvidia-nemotron',
    baseURL: providerBaseUrl(env('NVIDIA_BASE_URL'), NVIDIA_INTEGRATE_BASE_DEFAULT, ['integrate.api.nvidia.com']),
    apiKey,
    model: canonicalizeNvidiaNemotronModelId(env('NVIDIA_NEMOTRON_MODEL') || NVIDIA_NEMOTRON_MODEL_DEFAULT),
    topP: Number(env('NVIDIA_TOP_P') || '0.95') || 0.95,
    maxTokensCap: NVIDIA_NEMOTRON_MAX_TOKENS,
    // Thinking mode ON, matching NVIDIA's documented integration example. The
    // request builder uses the Nemotron-specific `max_tokens` contract below;
    // reasoning_content is discarded by the SSE parser so it never enters the
    // article.
    extraBody: {
      chat_template_kwargs: { enable_thinking: true },
    },
  }
}

/** NVIDIA-hosted GLM 5.2 (z-ai/glm-5.2) — 16k max tokens, OpenAI-compatible. */
export function getNvidiaGlmProvider(): OpenAiCompat | null {
  const apiKey = resolveNvidiaApiKey()
  if (!apiKey) return null
  return {
    label: 'nvidia-glm',
    baseURL: providerBaseUrl(env('NVIDIA_BASE_URL'), NVIDIA_INTEGRATE_BASE_DEFAULT, ['integrate.api.nvidia.com']),
    apiKey,
    model: canonicalizeNvidiaGlmModelId(env('NVIDIA_GLM_MODEL') || NVIDIA_GLM_MODEL_DEFAULT),
    topP: Number(env('NVIDIA_TOP_P') || '0.95') || 0.95,
    maxTokensCap: NVIDIA_GLM_MAX_TOKENS,
    // NOTE: NO reasoning_budget here — NVIDIA rejects it for GLM with a 400
    // ("Unsupported parameter(s): `reasoning_budget`"). Truncation recovery for
    // GLM comes from the bounded continuation retry in openAiCompatibleStream.
    // Thinking mode ON — reasoning improves quality. GLM 5.2 uses enable_thinking
    // (z-ai-style) rather than `thinking` (DeepSeek-style). The parser skips
    // reasoning_content deltas, so only final prose lands in the article.
    extraBody: {
      chat_template_kwargs: { enable_thinking: true },
    },
  }
}

/** NVIDIA-hosted DeepSeek V4 Flash — 16k max tokens, OpenAI-compatible. */
export function getNvidiaDeepseekProvider(): OpenAiCompat | null {
  const apiKey = resolveNvidiaApiKey()
  if (!apiKey) return null
  return {
    label: 'nvidia-deepseek',
    baseURL: providerBaseUrl(env('NVIDIA_BASE_URL'), NVIDIA_INTEGRATE_BASE_DEFAULT, ['integrate.api.nvidia.com']),
    apiKey,
    // NVIDIA's DeepSeek lane is isolated from the shared Nemotron/GLM
    // settings. A cross-wired vault value falls back to Flash-0731.
    model: canonicalizeNvidiaDeepseekModelId(env('NVIDIA_DEEPSEEK_MODEL') || env('NVIDIA_MODEL') || NVIDIA_DEEPSEEK_MODEL_DEFAULT),
    topP: Number(env('NVIDIA_TOP_P') || '0.95') || 0.95,
    maxTokensCap: NVIDIA_DEEPSEEK_MAX_TOKENS,
    // NOTE: NO reasoning_budget here — NVIDIA DeepSeek V4 Flash returns a 400
    // for `reasoning_budget` ("Unsupported parameter(s)"). Truncation recovery
    // comes from the bounded continuation retry instead.
    // Thinking mode ON — reasoning improves factual/structured output. The SSE
    // parser skips reasoning_content deltas, so only final prose lands in the
    // article. Segmented writing keeps each run within the token budget.
    extraBody: {
      chat_template_kwargs: { thinking: true },
    },
  }
}

/** Baseten-hosted DeepSeek V4 Flash — OpenAI-compatible complete + SSE stream. */
export function resolveBasetenApiKey(): string {
  return env('BASETEN_API_KEY')
}

export function isBasetenConfigured(): boolean {
  return Boolean(resolveBasetenApiKey())
}

export function getBasetenProvider(): OpenAiCompat | null {
  const apiKey = resolveBasetenApiKey()
  if (!apiKey) return null
  return {
    label: 'baseten-deepseek',
    baseURL: providerBaseUrl(env('BASETEN_BASE_URL'), BASETEN_BASE_URL, ['inference.baseten.co']),
    apiKey,
    model: canonicalizeDeepseekLaneModelId(env('BASETEN_MODEL') || BASETEN_MODEL, 'flash'),
    maxTokensCap: BASETEN_MAX_TOKENS,
    // Thinking mode ON — reasoning improves quality. The SSE parser consumes
    // ONLY delta.content, so reasoning chains never leak into the article.
    // Segmented writing keeps each run small enough that thinking + content fit
    // the token budget, so finish_reason:'length' truncation is avoided.
    extraBody: {
      chat_template_kwargs: { enable_thinking: true },
    },
  }
}

/** Baseten-hosted DeepSeek V4 Pro 0813 — research/review pin. */
export function getBasetenDeepseekProProvider(): OpenAiCompat | null {
  const apiKey = resolveBasetenApiKey()
  if (!apiKey) return null
  return {
    label: 'baseten-deepseek-pro',
    baseURL: providerBaseUrl(env('BASETEN_BASE_URL'), BASETEN_BASE_URL, ['inference.baseten.co']),
    apiKey,
    model: canonicalizeDeepseekLaneModelId(env('BASETEN_PRO_MODEL') || BASETEN_PRO_MODEL, 'pro'),
    maxTokensCap: BASETEN_MAX_TOKENS,
    extraBody: {
      chat_template_kwargs: { enable_thinking: true },
    },
  }
}

/** Baseten-hosted GLM 5.2 Fast — a fast, efficient partner for drafting.
 *  Reuses the same BASETEN_API_KEY; model overridable via BASETEN_GLM_MODEL. */
export function resolveRunbiosApiKey(): string {
  return env('RUNBIOS_API_KEY')
}

export function isRunbiosConfigured(): boolean {
  return Boolean(resolveRunbiosApiKey())
}

export function getRunbiosProvider(pin?: string): OpenAiCompat | null {
  const apiKey = resolveRunbiosApiKey()
  if (!apiKey) return null
  const id = canonicalizeRunbiosPin(pin || 'runbios-glm-53-flash')
  const slot = runbiosSlot(id) || RUNBIOS_SLOTS[0]
  const model =
    slot.id === 'runbios-glm-53-flash'
      ? (env('RUNBIOS_GLM_MODEL') || slot.apiModel)
      : slot.apiModel
  return {
    label: slot.id,
    baseURL: providerBaseUrl(env('RUNBIOS_BASE_URL'), RUNBIOS_BASE_URL, ['api.runbios.ai']),
    apiKey,
    model,
    maxTokensCap: RUNBIOS_MAX_TOKENS,
    extraBody: slot.reasoningLow ? { reasoning_effort: 'low' } : undefined,
  }
}

export function getRunbiosGlm53FlashProvider(): OpenAiCompat | null {
  return getRunbiosProvider('runbios-glm-53-flash')
}

export function getBasetenGlm53FlashProvider(): OpenAiCompat | null {
  const apiKey = resolveBasetenApiKey()
  if (!apiKey) return null
  return {
    label: 'baseten-glm-53-flash',
    baseURL: providerBaseUrl(env('BASETEN_BASE_URL'), BASETEN_BASE_URL, ['inference.baseten.co']),
    apiKey,
    model: BASETEN_GLM_53_MODEL,
    maxTokensCap: BASETEN_MAX_TOKENS,
  }
}

export function getBasetenGlmFastProvider(): OpenAiCompat | null {
  const apiKey = resolveBasetenApiKey()
  if (!apiKey) return null
  return {
    label: 'baseten-glm-fast',
    baseURL: providerBaseUrl(env('BASETEN_BASE_URL'), BASETEN_BASE_URL, ['inference.baseten.co']),
    apiKey,
    model: env('BASETEN_GLM_MODEL') === BASETEN_GLM_MODEL ? BASETEN_GLM_MODEL : BASETEN_GLM_MODEL,
    maxTokensCap: BASETEN_MAX_TOKENS,
  }
}

/** AIHubmix-hosted GLM 5.2 Fast (glm-5.2-fast-preview) — OpenAI-compatible
 *  aggregator route. Credentials: AIHUBMIX_API_KEY (Bearer); endpoint and
 *  model overridable via AIHUBMIX_BASE_URL / AIHUBMIX_GLM_MODEL. */
export function getAihubmixGlmFastProvider(): OpenAiCompat | null {
  const apiKey = env('AIHUBMIX_API_KEY')
  if (!apiKey) return null
  return {
    label: 'aihubmix-glm-fast',
    baseURL: validBaseUrl(env('AIHUBMIX_BASE_URL'), AIHUBMIX_BASE_URL),
    apiKey,
    model: env('AIHUBMIX_GLM_MODEL') || AIHUBMIX_GLM_MODEL,
    maxTokensCap: AIHUBMIX_MAX_TOKENS,
  }
}

export function isAihubmixGlmFastConfigured(): boolean {
  return Boolean(env('AIHUBMIX_API_KEY'))
}

/** Parasail keys are issued as `psk-…`. A key pasted into another provider
 *  slot must still route to api.parasail.io — never OpenAI / DeepSeek.com. */
export function looksLikeParasailKey(value: string): boolean {
  return /^psk-/i.test(String(value || '').trim())
}

export function resolveParasailApiKey(): string {
  const dedicated = env('PARASAIL_API_KEY')
  if (dedicated) return dedicated
  for (const name of ['CUSTOM_AI_API_KEY', 'OPENAI_API_KEY', 'DEEPSEEK_API_KEY'] as const) {
    const v = env(name)
    if (looksLikeParasailKey(v)) return v
  }
  return ''
}

export function isParasailConfigured(): boolean {
  return Boolean(resolveParasailApiKey())
}

function parasailBaseURL(): string {
  return providerBaseUrl(env('PARASAIL_BASE_URL'), PARASAIL_BASE_URL, ['api.parasail.io'])
}

/** Drafting/writing: DeepSeek V4 Flash on Parasail. */
export function getParasailDeepseekProvider(): OpenAiCompat | null {
  const apiKey = resolveParasailApiKey()
  if (!apiKey) return null
  return {
    label: 'parasail-deepseek',
    baseURL: parasailBaseURL(),
    apiKey,
    model: canonicalizeDeepseekLaneModelId(env('PARASAIL_DEEPSEEK_MODEL') || PARASAIL_DEEPSEEK_MODEL, 'flash'),
    maxTokensCap: PARASAIL_MAX_TOKENS,
  }
}

/**
 * Research + Review: DeepSeek V4 Pro 0813 on Parasail.
 * Default reasoning_effort is `low`. Env PARASAIL_PRO_REASONING_EFFORT may
 * raise it to `medium` only — high/max are refused so briefs/reviews cannot
 * burn a Pro thinking budget.
 */
export function parasailProReasoningEffort(): 'low' | 'medium' {
  const raw = env('PARASAIL_PRO_REASONING_EFFORT').toLowerCase()
  return raw === 'medium' ? 'medium' : 'low'
}

export function getParasailDeepseekProProvider(): OpenAiCompat | null {
  const apiKey = resolveParasailApiKey()
  if (!apiKey) return null
  return {
    label: 'parasail-deepseek-pro',
    baseURL: parasailBaseURL(),
    apiKey,
    model: canonicalizeDeepseekLaneModelId(env('PARASAIL_DEEPSEEK_PRO_MODEL') || PARASAIL_DEEPSEEK_PRO_MODEL, 'pro'),
    maxTokensCap: PARASAIL_MAX_TOKENS,
    extraBody: { reasoning_effort: parasailProReasoningEffort() },
  }
}

/** GLM 5.2 via Parasail — same model family as NVIDIA GLM.
 *  Master Engine pair sends reasoning_effort medium. */
export function getParasailGlmProvider(effort?: 'low' | 'medium' | 'high'): OpenAiCompat | null {
  const apiKey = resolveParasailApiKey()
  if (!apiKey) return null
  const reasoning = effort === 'high' ? 'medium' : effort
  return {
    label: 'parasail-glm',
    baseURL: parasailBaseURL(),
    apiKey,
    model: canonicalizeParasailGlmModelId(env('PARASAIL_GLM_MODEL') || PARASAIL_GLM_MODEL),
    maxTokensCap: PARASAIL_MAX_TOKENS,
    extraBody: reasoning ? { reasoning_effort: reasoning } : undefined,
  }
}

export function resolveDeepseekOfficialApiKey(): string {
  const key = env('DEEPSEEK_API_KEY')
  if (!key || looksLikeParasailKey(key)) return ''
  return key
}

export function isDeepseekOfficialConfigured(): boolean {
  return Boolean(resolveDeepseekOfficialApiKey())
}

function deepseekOfficialBaseURL(): string {
  const raw = env('DEEPSEEK_BASE_URL')
  return providerBaseUrl(raw, DEEPSEEK_OFFICIAL_BASE_URL, ['api.deepseek.com'])
}

function deepseekOfficialProvider(label: string, model: string): OpenAiCompat | null {
  const apiKey = resolveDeepseekOfficialApiKey()
  if (!apiKey) return null
  return {
    label,
    baseURL: deepseekOfficialBaseURL(),
    apiKey,
    model,
    maxTokensCap: PARASAIL_MAX_TOKENS,
  }
}

/** Official DeepSeek.com — Flash-0731 (draft + review). */
export function getDeepseekOfficialFlashProvider(): OpenAiCompat | null {
  return deepseekOfficialProvider(
    'deepseek-flash',
    canonicalizeDeepseekModelId(env('DEEPSEEK_FLASH_MODEL') || env('DEEPSEEK_MODEL') || DEEPSEEK_OFFICIAL_FLASH_MODEL, 'flash'),
  )
}

/** Official DeepSeek.com — Pro-0813 (brief + review). */
export function getDeepseekOfficialProProvider(): OpenAiCompat | null {
  return deepseekOfficialProvider(
    'deepseek-pro',
    canonicalizeDeepseekModelId(env('DEEPSEEK_PRO_MODEL') || DEEPSEEK_OFFICIAL_PRO_MODEL, 'pro'),
  )
}

/** Entrim DeepSeek V4 Flash — first-party flash served at api.entrim.ai/v1.
 *  The model id `deepseek-ai/DeepSeek-V4-Flash` is sent VERBATIM: Entrim does
 *  not use the -0731 checkpoint suffix, and canonicalizing it would 404. */
export function resolveEntrimApiKey(): string {
  return env('ENTRIM_API_KEY')
}

export function isEntrimConfigured(): boolean {
  return Boolean(resolveEntrimApiKey())
}

export function getEntrimProvider(modelOverride?: string): OpenAiCompat | null {
  const apiKey = resolveEntrimApiKey()
  if (!apiKey) return null
  return {
    label: ENTRIM_DEEPSEEK_LABEL,
    baseURL: validBaseUrl(env('ENTRIM_BASE_URL'), ENTRIM_BASE_URL),
    apiKey,
    model: modelOverride || env('ENTRIM_MODEL') || ENTRIM_DEEPSEEK_MODEL,
    maxTokensCap: ENTRIM_MAX_TOKENS,
  }
}

/** Entrim Qwen3.8 27B — api.entrim.ai/v1, same vault key as the DeepSeek
 *  flash row. Used by Discover-stage engines, the Generate-Brief lane and
 *  the Reviewer lane (all three accept explicit `entrim-qwen-27b` pins). */
export function getEntrimQwenProvider(): OpenAiCompat | null {
  const provider = getEntrimProvider(ENTRIM_QWEN_MODEL)
  if (!provider) return null
  return { ...provider, label: ENTRIM_QWEN_LABEL }
}

/** Entrim Qwen3.8 27B single-provider completion (OpenAI-compatible). */
export async function entrimQwenComplete(opts: ContentAiOptions): Promise<ContentAiResult> {
  const p = getEntrimQwenProvider()
  if (!p) throw new Error('Entrim not configured (ENTRIM_API_KEY)')
  return openAiCompatibleComplete(p, {
    ...opts,
    maxTokens: Math.min(opts.maxTokens ?? ENTRIM_MAX_TOKENS, ENTRIM_MAX_TOKENS),
  })
}

export function resolveZaiApiKey(): string {
  return env('ZAI_API_KEY') || env('ZHIPU_API_KEY') || env('Z_AI_API_KEY')
}

export function isZaiConfigured(): boolean {
  return Boolean(resolveZaiApiKey())
}

/** Official Z.ai / Zhipu GLM 5.2. */
export function getZaiGlmProvider(): OpenAiCompat | null {
  const apiKey = resolveZaiApiKey()
  if (!apiKey) return null
  return {
    label: 'zai-glm',
    baseURL: validBaseUrl(env('ZAI_BASE_URL'), ZAI_BASE_URL),
    apiKey,
    model: env('ZAI_GLM_MODEL') || ZAI_GLM_MODEL,
    maxTokensCap: ZAI_MAX_TOKENS,
  }
}

async function parasailDeepseekComplete(opts: ContentAiOptions): Promise<ContentAiResult> {
  const p = getParasailDeepseekProvider()
  if (!p) throw new Error('Parasail not configured (PARASAIL_API_KEY or a psk- key)')
  return openAiCompatibleComplete(p, {
    ...opts,
    maxTokens: Math.min(opts.maxTokens ?? PARASAIL_MAX_TOKENS, PARASAIL_MAX_TOKENS),
  })
}

async function parasailDeepseekProComplete(opts: ContentAiOptions): Promise<ContentAiResult> {
  const p = getParasailDeepseekProProvider()
  if (!p) throw new Error('Parasail Pro not configured (PARASAIL_API_KEY or a psk- key)')
  return openAiCompatibleComplete(p, {
    ...opts,
    maxTokens: Math.min(opts.maxTokens ?? PARASAIL_MAX_TOKENS, PARASAIL_MAX_TOKENS),
  })
}

async function parasailGlmComplete(opts: ContentAiOptions): Promise<ContentAiResult> {
  const p = getParasailGlmProvider(opts.reasoningEffort)
  if (!p) throw new Error('Parasail GLM not configured (PARASAIL_API_KEY or a psk- key)')
  return openAiCompatibleComplete(p, {
    ...opts,
    maxTokens: Math.min(opts.maxTokens ?? PARASAIL_MAX_TOKENS, PARASAIL_MAX_TOKENS),
  })
}

async function basetenDeepseekProComplete(opts: ContentAiOptions): Promise<ContentAiResult> {
  const p = getBasetenDeepseekProProvider()
  if (!p) throw new Error('Baseten not configured (BASETEN_API_KEY)')
  return openAiCompatibleComplete(p, {
    ...opts,
    maxTokens: Math.min(opts.maxTokens ?? BASETEN_MAX_TOKENS, BASETEN_MAX_TOKENS),
  })
}

async function deepseekOfficialFlashComplete(opts: ContentAiOptions): Promise<ContentAiResult> {
  const p = getDeepseekOfficialFlashProvider()
  if (!p) throw new Error('DeepSeek.com not configured (DEEPSEEK_API_KEY)')
  return openAiCompatibleComplete(p, opts)
}

async function deepseekOfficialProComplete(opts: ContentAiOptions): Promise<ContentAiResult> {
  const p = getDeepseekOfficialProProvider()
  if (!p) throw new Error('DeepSeek.com not configured (DEEPSEEK_API_KEY)')
  return openAiCompatibleComplete(p, opts)
}

async function zaiGlmComplete(opts: ContentAiOptions): Promise<ContentAiResult> {
  const p = getZaiGlmProvider()
  if (!p) throw new Error('Zai not configured (ZAI_API_KEY)')
  return openAiCompatibleComplete(p, {
    ...opts,
    maxTokens: Math.min(opts.maxTokens ?? ZAI_MAX_TOKENS, ZAI_MAX_TOKENS),
  })
}

async function basetenComplete(opts: ContentAiOptions): Promise<ContentAiResult> {
  const p = getBasetenProvider()
  if (!p) throw new Error('Baseten not configured (BASETEN_API_KEY)')
  return openAiCompatibleComplete(p, {
    ...opts,
    maxTokens: Math.min(opts.maxTokens ?? BASETEN_MAX_TOKENS, BASETEN_MAX_TOKENS),
  })
}

async function basetenGlmFastComplete(opts: ContentAiOptions): Promise<ContentAiResult> {
  const p = getBasetenGlmFastProvider()
  if (!p) throw new Error('Baseten GLM 5.2 Fast not configured (BASETEN_API_KEY)')
  return openAiCompatibleComplete(p, {
    ...opts,
    maxTokens: Math.min(opts.maxTokens ?? BASETEN_MAX_TOKENS, BASETEN_MAX_TOKENS),
  })
}

async function aihubmixGlmFastComplete(opts: ContentAiOptions): Promise<ContentAiResult> {
  const p = getAihubmixGlmFastProvider()
  if (!p) throw new Error('AIHubmix GLM 5.2 Fast not configured (AIHUBMIX_API_KEY)')
  return openAiCompatibleComplete(p, {
    ...opts,
    maxTokens: Math.min(opts.maxTokens ?? AIHUBMIX_MAX_TOKENS, AIHUBMIX_MAX_TOKENS),
  })
}

async function nvidiaGlmComplete(opts: ContentAiOptions): Promise<ContentAiResult> {
  const p = getNvidiaGlmProvider()
  if (!p) throw new Error('NVIDIA GLM not configured (NVIDIA_API_KEY / NVAPI_KEY)')
  // NVIDIA's GLM integration is most reliable over SSE. Consume the streamed
  // response here so non-stream refinement calls use the same proven transport
  // as the operator-provided integration example instead of waiting for one
  // large buffered response until the 120s deadline.
  const maxTokens = Math.min(
    opts.maxTokens ?? NVIDIA_GLM_MAX_TOKENS,
    NVIDIA_GLM_MAX_TOKENS,
  )
  return withRetry('nvidia-glm', async () => {
    const chunks: string[] = []
    for await (const event of openAiCompatibleStream(p, {
      ...opts,
      maxTokens,
      temperature: opts.temperature ?? (Number(env('NVIDIA_TEMPERATURE') || '0.7') || 0.7),
    })) {
      if (event.type === 'delta') chunks.push(event.text)
    }
    const text = chunks.join('').trim()
    if (!text) throw new Error('nvidia-glm stream returned empty content')
    return { text, provider: p.label, model: p.model }
  })
}

/** NVIDIA-hosted MiniMax M3 — the default long-form drafting transport. */
async function nvidiaMinimaxComplete(opts: ContentAiOptions): Promise<ContentAiResult> {
  const p = getNvidiaMinimaxProvider()
  if (!p) throw new Error('NVIDIA MiniMax not configured (NVIDIA_API_KEY / NVAPI_KEY)')
  const maxTokens = Math.min(opts.maxTokens ?? NVIDIA_MINIMAX_MAX_TOKENS, NVIDIA_MINIMAX_MAX_TOKENS)
  return openAiCompatibleComplete(p, {
    ...opts,
    maxTokens,
    temperature: opts.temperature ?? (Number(env('NVIDIA_TEMPERATURE') || '1') || 1),
  })
}

async function nvidiaNemotronComplete(opts: ContentAiOptions): Promise<ContentAiResult> {
  const p = getNvidiaNemotronProvider()
  if (!p) throw new Error('NVIDIA Nemotron not configured (NVIDIA_API_KEY / NVAPI_KEY)')
  const maxTokens = Math.min(opts.maxTokens ?? NVIDIA_NEMOTRON_MAX_TOKENS, NVIDIA_NEMOTRON_MAX_TOKENS)
  return withRetry('nvidia-nemotron', async () => {
    const chunks: string[] = []
    for await (const event of openAiCompatibleStream(p, {
      ...opts,
      maxTokens,
      temperature: opts.temperature ?? (Number(env('NVIDIA_TEMPERATURE') || '1') || 1),
    })) {
      if (event.type === 'delta') chunks.push(event.text)
    }
    const text = chunks.join('').trim()
    if (!text) throw new Error('nvidia-nemotron stream returned empty content')
    return { text, provider: p.label, model: p.model }
  })
}

async function nvidiaDeepseekComplete(opts: ContentAiOptions): Promise<ContentAiResult> {
  const p = getNvidiaDeepseekProvider()
  if (!p) throw new Error('NVIDIA DeepSeek not configured (NVIDIA_API_KEY)')
  // Prefer high budget for factory long-form
  const maxTokens = Math.min(
    opts.maxTokens ?? NVIDIA_DEEPSEEK_MAX_TOKENS,
    NVIDIA_DEEPSEEK_MAX_TOKENS,
  )
  return openAiCompatibleComplete(p, {
    ...opts,
    maxTokens,
    // NVIDIA sample uses temperature=1; slightly lower for factual legal content
    temperature: opts.temperature ?? (Number(env('NVIDIA_TEMPERATURE') || '0.7') || 0.7),
  })
}

const GEMINI_MODEL = env('GEMINI_MODEL') || 'gemini-2.5-flash'
const OPENROUTER_MODELS = [
  env('OPENROUTER_MODEL') || 'meta-llama/llama-3.3-70b-instruct:free',
  'nousresearch/hermes-3-llama-3.1-405b:free',
]

async function geminiComplete(opts: ContentAiOptions): Promise<ContentAiResult> {
  const apiKey = env('GEMINI_API_KEY') || env('GOOGLE_GEMINI_API_KEY')
  if (!apiKey) throw new Error('Gemini not configured (GEMINI_API_KEY)')
  const model = GEMINI_MODEL
  return withRetry('gemini', async () => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: opts.system }] },
        contents: [{ role: 'user', parts: [{ text: opts.prompt }] }],
        generationConfig: {
          temperature: opts.temperature ?? DEFAULT_TEMPERATURE,
          maxOutputTokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
        },
      }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      const fp = `[len=${apiKey.length} ${apiKey.slice(0, 4)}…${apiKey.slice(-3)}]`
      throw new Error(`gemini ${res.status} ${fp}: ${body.slice(0, 400)}`)
    }
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    const text = data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text)
      .filter(Boolean)
      .join('')
      .trim()
    if (!text) throw new Error('gemini returned empty content')
    return { text, provider: 'gemini', model }
  })
}

/** OpenRouter free models with walk-on 404/429 (same as gig chatProvider). */
async function openRouterComplete(opts: ContentAiOptions): Promise<ContentAiResult> {
  const apiKey = env('OPENROUTER_API_KEY')
  if (!apiKey) throw new Error('OpenRouter not configured (OPENROUTER_API_KEY)')
  let lastErr: Error | null = null
  // One OpenRouter model per invocation. Walking multiple free models can
  // multiply requests before the outer fallback chain gets a chance to stop.
  for (const model of OPENROUTER_MODELS.slice(0, 1)) {
    try {
      return await openAiCompatibleComplete(
        {
          label: 'openrouter',
          baseURL: 'https://openrouter.ai/api/v1',
          apiKey,
          model,
        },
        opts,
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      lastErr = e instanceof Error ? e : new Error(msg)
      const tryNext =
        /\b(404|429|503)\b/.test(msg) || /not.found|rate.?limit|overload|unavailable/i.test(msg)
      if (!tryNext) break
    }
  }
  throw lastErr || new Error('OpenRouter: no free models succeeded')
}

/** Last-resort: reuse exact gig-creation provider chain. */
async function chatProviderBridge(opts: ContentAiOptions): Promise<ContentAiResult> {
  const { getChatProvider } = await import('@/lib/chatProvider')
  const provider = getChatProvider()
  if (!provider) throw new Error('chatProvider chain not configured')
  const text = await provider.reply(opts.system, [{ role: 'user', content: opts.prompt }], {
    maxOutputTokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
  })
  if (!text?.trim()) throw new Error(`${provider.name} returned empty content`)
  return { text: text.trim(), provider: `chatProvider:${provider.name}`, model: provider.name }
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
        if (choiceRaw?.finish_reason === 'length') {
          throw new Error('output was truncated (token limit) — trying next provider')
        }
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
        } catch {
          /* skip malformed SSE chunks */
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

async function* openAiCompatibleStream(
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
            ...(disableThinking && p.extraBody?.chat_template_kwargs
              ? { chat_template_kwargs: { ...(p.extraBody.chat_template_kwargs as Record<string, unknown>), enable_thinking: false } }
              : {}),
            ...(disableThinking ? { reasoning_budget: undefined } : {}),
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
      for await (const delta of parseOpenAiSse(streamRes.body)) {
        full += delta
        yield { type: 'delta', text: delta }
      }
      break // success — stream completed without truncation
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const truncated = /output was truncated \(token limit\)/.test(msg)
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

async function* cloudflareAiStream(
  opts: ContentAiOptions,
): AsyncGenerator<ContentAiStreamEvent> {
  const auth = resolveCloudflareAiAuth()
  if (!auth) {
    throw new Error(
      'Cloudflare AI not configured (need CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_AI_TOKEN or CLOUDFLARE_API_TOKEN with Workers AI Read)',
    )
  }

  const { accountId, token } = auth
  const model = CF_AI_MODEL
  const messages = [
    { role: 'system', content: opts.system },
    { role: 'user', content: opts.prompt },
  ]
  const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS
  const temperature = opts.temperature ?? DEFAULT_TEMPERATURE
  const chatUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`

  const res = await fetch(chatUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(env('CLOUDFLARE_AI_GATEWAY_ID')
        ? { 'cf-aig-gateway-id': env('CLOUDFLARE_AI_GATEWAY_ID') }
        : {}),
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: true,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(formatProviderFailure('cloudflare-ai stream', res.status, body))
  }
  if (!res.body) throw new Error('cloudflare-ai stream: empty body')

  yield { type: 'provider', provider: 'cloudflare-ai', model }
  let full = ''
  for await (const delta of parseOpenAiSse(res.body)) {
    full += delta
    yield { type: 'delta', text: delta }
  }
  if (!full.trim()) throw new Error('cloudflare-ai stream returned empty content')
  yield { type: 'done', text: full.trim(), provider: 'cloudflare-ai', model }
}

/** Non-stream complete → synthetic single-delta stream (fallback). */
async function* completeAsStream(
  complete: () => Promise<ContentAiResult>,
): AsyncGenerator<ContentAiStreamEvent> {
  const result = await complete()
  yield { type: 'provider', provider: result.provider, model: result.model }
  // Chunk large responses so the editor updates progressively even without true SSE
  const text = result.text
  const step = Math.max(80, Math.floor(text.length / 40))
  for (let i = 0; i < text.length; i += step) {
    const chunk = text.slice(i, i + step)
    yield { type: 'delta', text: chunk }
  }
  yield { type: 'done', text, provider: result.provider, model: result.model }
}

/**
 * Workers AI via OpenAI-compatible chat completions endpoint first,
 * then legacy /ai/run/{model} if needed.
 */
async function cloudflareAiComplete(opts: ContentAiOptions): Promise<ContentAiResult> {
  const auth = resolveCloudflareAiAuth()
  if (!auth) {
    throw new Error(
      'Cloudflare AI not configured (need CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_AI_TOKEN or CLOUDFLARE_API_TOKEN with Workers AI Read)',
    )
  }

  const { accountId, token } = auth
  const model = CF_AI_MODEL
  const messages = [
    { role: 'system', content: opts.system },
    { role: 'user', content: opts.prompt },
  ]
  const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS
  const temperature = opts.temperature ?? DEFAULT_TEMPERATURE

  // 1) OpenAI-compatible Workers AI endpoint (dashboard quick-start / AI Gateway style)
  const chatUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`
  let chatErr = 'chat/completions not attempted'
  try {
    const res = await fetch(chatUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        // Optional AI Gateway routing when configured
        ...(env('CLOUDFLARE_AI_GATEWAY_ID')
          ? { 'cf-aig-gateway-id': env('CLOUDFLARE_AI_GATEWAY_ID') }
          : {}),
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
    })

    if (res.ok) {
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>
        result?: { response?: string; choices?: Array<{ message?: { content?: string } }> }
        success?: boolean
        errors?: Array<{ message: string }>
      }

      // Shape A: OpenAI-style at top level
      let text = data.choices?.[0]?.message?.content?.trim()
      // Shape B: wrapped in result
      if (!text) text = data.result?.choices?.[0]?.message?.content?.trim()
      if (!text) text = data.result?.response?.trim()

      if (text) return { text, provider: 'cloudflare-ai', model }
      if (data.success === false) {
        const errs = (data.errors || []).map((e) => e.message).join(' | ')
        if (isDailyQuotaError(errs)) {
          throw new Error('cloudflare-ai 429: daily Workers AI free allocation exhausted; retry after the UTC quota reset or configure paid Workers AI')
        }
        throw new Error(`chat/completions success=false: ${errs}`)
      }
      throw new Error('chat/completions empty content')
    }

    const body = await res.text().catch(() => '')
    // Quota/rate-limit responses are provider-level failures. Trying the legacy
    // endpoint as well would spend another request and cannot restore quota.
    if (res.status === 429 || isDailyQuotaError(body)) {
      throw new Error(formatProviderFailure('cloudflare-ai', res.status, body))
    }
    // Fall through to legacy /run only for endpoint compatibility (normally 404).
    if (res.status === 401 || res.status === 403) {
      throw new Error(formatProviderFailure('cloudflare-ai', res.status, body))
    }
    chatErr = `chat/completions ${res.status}: ${body.slice(0, 200)}`
  } catch (e) {
    if (e instanceof Error && /cloudflare-ai (401|403)/.test(e.message)) throw e
    chatErr = e instanceof Error ? e.message : String(e)
  }

  // 2) Legacy Workers AI run endpoint
  const runUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`
  const res = await fetch(runUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      `${formatProviderFailure('cloudflare-ai', res.status, body)} (also tried: ${chatErr})`,
    )
  }

  const data = (await res.json()) as {
    success?: boolean
    result?: { response?: string; choices?: Array<{ message?: { content?: string } }> }
    errors?: Array<{ message: string }>
  }

  if (data.success === false) {
    const errs = (data.errors || []).map((e) => e.message).join(' | ').slice(0, 280)
    throw new Error(`cloudflare-ai success=false: ${errs || 'no detail'}`)
  }

  const text =
    data.result?.response?.trim() ||
    data.result?.choices?.[0]?.message?.content?.trim()

  if (!text) throw new Error('cloudflare-ai returned empty content')
  return { text, provider: 'cloudflare-ai', model }
}

/**
 * OpenAI-compatible fallbacks in gig-creation order where possible:
 * Groq → OpenRouter → custom → xAI → OpenAI → DeepSeek
 * (Gemini is native REST and tried separately.)
 */
function listOpenAiFallbackProviders(): OpenAiCompat[] {
  const out: OpenAiCompat[] = []

  // Baseten DeepSeek V4 Flash — OpenAI-compatible inference endpoint.
  if (isBasetenConfigured()) {
    const p = getBasetenProvider()
    if (p) out.push(p)
  }
  // 1) Groq — primary free tier for gigs (fastest)
  if (env('GROQ_API_KEY')) {
    out.push({
      label: 'groq',
      baseURL: 'https://api.groq.com/openai/v1',
      apiKey: env('GROQ_API_KEY'),
      model: env('GROQ_MODEL') || 'llama-3.3-70b-versatile',
    })
  }
  // 2) OpenRouter free models — separate daily quota (same as gigs)
  // Handled by openRouterComplete (multi-model walk), not listed here as single OpenAiCompat
  // 3) Custom OpenAI-compatible
  if (isParasailConfigured()) {
    const p = getParasailDeepseekProvider()
    if (p) out.push(p)
  }
  if (env('CUSTOM_AI_BASE_URL') && env('CUSTOM_AI_API_KEY') && !looksLikeParasailKey(env('CUSTOM_AI_API_KEY'))) {
    out.push({
      label: 'custom',
      baseURL: env('CUSTOM_AI_BASE_URL'),
      apiKey: env('CUSTOM_AI_API_KEY'),
      model: env('CUSTOM_AI_MODEL') || 'gpt-5.6-luna',
    })
  }
  if (isGrokConfigured()) {
    out.push({
      label: 'grok',
      baseURL: validBaseUrl(env('XAI_BASE_URL'), 'https://api.x.ai/v1'),
      apiKey: env('XAI_API_KEY'),
      model: env('XAI_MODEL') || 'grok-4.6',
    })
  }
  if (env('OPENAI_API_KEY') && !looksLikeParasailKey(env('OPENAI_API_KEY'))) {
    out.push({
      label: 'openai',
      baseURL: 'https://api.openai.com/v1',
      apiKey: env('OPENAI_API_KEY'),
      model: env('OPENAI_MODEL') || 'gpt-5.6-luna',
    })
  }
  if (env('DEEPSEEK_API_KEY') && !looksLikeParasailKey(env('DEEPSEEK_API_KEY'))) {
    out.push({
      label: 'deepseek',
      baseURL: deepseekOfficialBaseURL(),
      apiKey: env('DEEPSEEK_API_KEY'),
      model: canonicalizeDeepseekModelId(env('DEEPSEEK_MODEL') || DEEPSEEK_OFFICIAL_FLASH_MODEL, 'flash'),
    })
  }
  // Entrim — first-party DeepSeek V4 Flash. Only pushed when ENTRIM_API_KEY is
  // present, so an explicit `entrim-deepseek` pin with no key fails closed at
  // the early-fail gate instead of silently executing another host.
  if (isEntrimConfigured()) {
    const entrim = getEntrimProvider()
    if (entrim) out.push(entrim)
  }

  return out
}

function isGeminiConfigured(): boolean {
  return Boolean(env('GEMINI_API_KEY') || env('GOOGLE_GEMINI_API_KEY'))
}

function isOpenRouterConfigured(): boolean {
  return Boolean(env('OPENROUTER_API_KEY'))
}

/** True when CF Workers AI credentials are present. */
export function isCloudflareAiConfigured(): boolean {
  return resolveCloudflareAiAuth() !== null
}

/** Operator-facing list of which content AI backends are configured. */
export function listConfiguredContentProviders(): Array<{
  id: string
  label: string
  configured: boolean
  role: 'primary' | 'fallback'
}> {
  return [
    ...RUNBIOS_SLOTS.map((slot) => ({
      id: slot.id,
      label: `${slot.label.replace(' · Run BiOS', '')} via Run BiOS`,
      configured: isRunbiosConfigured(),
      role: slot.role,
    })),
    {
      id: 'nvidia-minimax',
      label: 'NVIDIA MiniMax M3 · minimaxai/minimax-m3',
      configured: isNvidiaMinimaxConfigured(),
      role: 'primary',
    },
    {
      id: 'nvidia-nemotron',
      label: 'NVIDIA Nemotron 3 Ultra · nvidia/nemotron-3-ultra-550b-a55b',
      configured: isNvidiaNemotronConfigured(),
      role: 'primary',
    },
    {
      id: 'nvidia-glm',
      label: 'NVIDIA GLM 5.2 (z-ai/glm-5.2 — fallback)',
      configured: isNvidiaGlmConfigured(),
      role: 'primary',
    },
    {
      id: 'baseten-deepseek',
      label: 'DeepSeek V4 Flash via Baseten',
      configured: isBasetenConfigured(),
      role: 'primary',
    },
    {
      id: 'baseten-deepseek-pro',
      label: 'DeepSeek V4 Pro 0813 via Baseten',
      configured: isBasetenConfigured(),
      role: 'fallback',
    },
    {
      id: 'baseten-glm-fast',
      label: 'GLM 5.2 Fast via Baseten',
      configured: isBasetenConfigured(),
      role: 'fallback',
    },
    {
      id: 'aihubmix-glm-fast',
      label: 'GLM 5.2 Fast via AIHubmix',
      configured: isAihubmixGlmFastConfigured(),
      role: 'fallback',
    },
    {
      id: 'parasail-deepseek',
      label: 'DeepSeek V4 Flash via Parasail (draft)',
      configured: isParasailConfigured(),
      role: 'primary',
    },
    {
      id: 'parasail-deepseek-pro',
      label: 'DeepSeek V4 Pro 0813 via Parasail (research/review)',
      configured: isParasailConfigured(),
      role: 'fallback',
    },
    {
      id: 'parasail-glm',
      label: 'GLM 5.2 via Parasail',
      configured: isParasailConfigured(),
      role: 'fallback',
    },
    {
      id: 'deepseek-flash',
      label: 'DeepSeek V4 Flash via DeepSeek.com',
      configured: isDeepseekOfficialConfigured(),
      role: 'fallback',
    },
    {
      id: 'deepseek-pro',
      label: 'DeepSeek V4 Pro 0813 via DeepSeek.com',
      configured: isDeepseekOfficialConfigured(),
      role: 'fallback',
    },
    {
      id: 'zai-glm',
      label: 'GLM 5.2 via Zai',
      configured: isZaiConfigured(),
      role: 'fallback',
    },
    {
      id: ENTRIM_DEEPSEEK_LABEL,
      label: 'DeepSeek V4 Flash · Entrim (api.entrim.ai/v1)',
      configured: isEntrimConfigured(),
      role: 'fallback',
    },
    {
      id: ENTRIM_QWEN_LABEL,
      label: 'Qwen3.8 27B · Entrim (api.entrim.ai/v1)',
      configured: isEntrimConfigured(),
      role: 'fallback',
    },
    {
      id: 'nvidia-deepseek',
      label: 'DeepSeek V4 Flash via NVIDIA (fallback)',
      configured: isNvidiaDeepseekConfigured(),
      role: 'primary',
    },
    {
      id: 'cloudflare-ai',
      label: 'Cloudflare Workers AI (default fallback)',
      configured: isCloudflareAiConfigured(),
      role: 'fallback',
    },
    { id: 'groq', label: 'Groq (Llama 3.3 70B)', configured: Boolean(env('GROQ_API_KEY')), role: 'fallback' },
    { id: 'gemini', label: 'Google Gemini', configured: isGeminiConfigured(), role: 'fallback' },
    { id: 'openrouter', label: 'OpenRouter free models', configured: isOpenRouterConfigured(), role: 'fallback' },
    { id: 'custom', label: 'Custom OpenAI-compatible', configured: Boolean(env('CUSTOM_AI_BASE_URL') && env('CUSTOM_AI_API_KEY') && !looksLikeParasailKey(env('CUSTOM_AI_API_KEY'))), role: 'fallback' },
    { id: 'grok', label: 'xAI Grok (SuperGrok fallback)', configured: isGrokConfigured(), role: 'fallback' },
    { id: 'openai', label: 'OpenAI (GPT-5.6 Terra · Sol · Luna or ChatGPT Plus)', configured: isOpenaiConfigured(), role: 'fallback' },
    { id: 'deepseek', label: 'DeepSeek.com API', configured: isDeepseekOfficialConfigured(), role: 'fallback' },
  ]
}

/**
 * Resolve preferred provider label.
 *
 * HARD DEFAULT: NVIDIA MiniMax M3 (`nvidia-minimax`) — matches the Draft lane
 * UI default. Run BiOS GLM 5.3 Flash is the auto-cascade runner-up.
 * Cloudflare remains a fallback and never becomes the default lead unless
 * CONTENT_AI_PROVIDER is explicitly cloudflare|workers-ai.
 *
 * Empty / unknown / legacy "primary" values resolve through the configured
 * order, whose default lead is nvidia-minimax.
 */
function preferProvider(): string {
  const explicit = (env('CONTENT_AI_PROVIDER') || env('AI_PROVIDER') || '').toLowerCase().trim()
  if (!explicit || explicit === 'auto' || explicit === 'default' || explicit === 'primary') {
    return configuredProviderOrder()[0] || 'xai'
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
    'entrim-qwen-27b', // Entrim Qwen3.8 27B — Discover / Brief / Reviewer lanes
  ])
  if (!allowedPins.has(explicit)) {
    console.warn(
      `[contentAi] Unknown CONTENT_AI_PROVIDER="${explicit}" — using nvidia-minimax (the Draft default)`,
    )
    return 'nvidia-minimax'
  }
  return explicit
}

function isNvidiaPrefer(prefer: string): boolean {
  return (
    prefer === 'nvidia' ||
    prefer === 'nvidia-deepseek' ||
    prefer === 'nvidia-glm' ||
    prefer === 'nvidia-nemotron' ||
    prefer === 'nvidia-minimax' ||
    prefer === 'glm' ||
    prefer === 'z-ai' ||
    prefer === 'deepseek' ||
    prefer === 'deepseek-v4' ||
    prefer === 'deepseek-v4-pro' ||
    prefer === 'nim' ||
    prefer === 'auto' ||
    prefer === 'default' ||
    !prefer
  )
}

function isCloudflareExclusive(prefer: string): boolean {
  return prefer === 'cloudflare' || prefer === 'cloudflare-ai' || prefer === 'workers-ai'
}

function promoteMinimaxAsLead(order: string[]): string[] {
  const pin = 'nvidia-minimax'
  const at = order.indexOf(pin)
  if (at < 0) order.unshift(pin)
  else if (at > 0) {
    order.splice(at, 1)
    order.unshift(pin)
  }
  return order
}

/** Parse the admin-saved order defensively (JSON or CSV). */
function configuredProviderOrder(): string[] {
  const raw = env('CONTENT_AI_PROVIDER_ORDER').trim()
  if (!raw) {
    return promoteMinimaxAsLead([
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
    'entrim-qwen-27b': 'entrim-qwen-27b', 'qwen3.8-27b': 'entrim-qwen-27b', qwen: 'entrim-qwen-27b',
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
  return promoteMinimaxAsLead(merged)
}

function sortByAdminOrder<T extends { label: string }>(items: T[]): T[] {
  const order = configuredProviderOrder()
  if (!order.length) return items
  const rank = new Map(order.map((id, index) => [id, index]))
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (rank.get(a.item.label) ?? 10000) - (rank.get(b.item.label) ?? 10000) || a.index - b.index)
    .map(({ item }) => item)
}

type CompleteFn = () => Promise<ContentAiResult>

/**
 * Fixed factory order unless CONTENT_AI_PROVIDER pins a different lead:
 * NVIDIA MiniMax → Grok → NVIDIA GLM/DeepSeek → configured fallbacks.
 */
function orderedCompleters(opts: ContentAiOptions, prefer: string): Array<{ label: string; run: CompleteFn }> {
  const items: Array<{ label: string; run: CompleteFn }> = []

  const pushGrok = () => {
    if (isGrokConfigured()) items.push({ label: 'grok', run: () => grokComplete(opts) })
  }
  const pushOpenAi = () => {
    const p = listOpenAiFallbackProviders().find((x) => x.label === 'openai')
    if (p) items.push({ label: 'openai', run: () => openAiCompatibleComplete(p, opts) })
  }
  const pushMinimax = () => {
    if (isNvidiaMinimaxConfigured()) {
      items.push({ label: 'nvidia-minimax', run: () => nvidiaMinimaxComplete(opts) })
    }
  }
  const pushNemotron = () => {
    if (isNvidiaNemotronConfigured()) {
      items.push({ label: 'nvidia-nemotron', run: () => nvidiaNemotronComplete(opts) })
    }
  }
  const pushGlm = () => {
    if (isNvidiaGlmConfigured()) {
      items.push({ label: 'nvidia-glm', run: () => nvidiaGlmComplete(opts) })
    }
  }
  const pushBaseten = () => {
    if (isBasetenConfigured()) {
      items.push({ label: 'baseten-deepseek', run: () => basetenComplete(opts) })
    }
  }
  const pushRunbiosGlm = () => {
    const p = getRunbiosProvider(prefer.startsWith('runbios') ? prefer : 'runbios-glm-53-flash')
    if (p) items.push({ label: p.label, run: () => openAiCompatibleComplete(p, opts) })
  }
  const pushBasetenGlm53Flash = () => {
    if (isBasetenConfigured()) items.push({ label: 'baseten-glm-53-flash', run: () => openAiCompatibleComplete(getBasetenGlm53FlashProvider()!, opts) })
  }
  const pushBasetenGlmFast = () => {
    if (isBasetenConfigured()) {
      items.push({ label: 'baseten-glm-fast', run: () => basetenGlmFastComplete(opts) })
    }
  }
  const pushAihubmixGlmFast = () => {
    if (isAihubmixGlmFastConfigured()) {
      items.push({ label: 'aihubmix-glm-fast', run: () => aihubmixGlmFastComplete(opts) })
    }
  }
  const pushParasailDeepseek = () => {
    if (isParasailConfigured()) {
      items.push({ label: 'parasail-deepseek', run: () => parasailDeepseekComplete(opts) })
    }
  }
  const pushParasailDeepseekPro = () => {
    if (isParasailConfigured()) {
      items.push({ label: 'parasail-deepseek-pro', run: () => parasailDeepseekProComplete(opts) })
    }
  }
  const pushParasailGlm = () => {
    if (isParasailConfigured()) {
      items.push({ label: 'parasail-glm', run: () => parasailGlmComplete(opts) })
    }
  }
  const pushBasetenPro = () => {
    if (isBasetenConfigured()) {
      items.push({ label: 'baseten-deepseek-pro', run: () => basetenDeepseekProComplete(opts) })
    }
  }
  const pushDeepseekFlash = () => {
    if (isDeepseekOfficialConfigured()) {
      items.push({ label: 'deepseek-flash', run: () => deepseekOfficialFlashComplete(opts) })
    }
  }
  const pushDeepseekPro = () => {
    if (isDeepseekOfficialConfigured()) {
      items.push({ label: 'deepseek-pro', run: () => deepseekOfficialProComplete(opts) })
    }
  }
  const pushZaiGlm = () => {
    if (isZaiConfigured()) {
      items.push({ label: 'zai-glm', run: () => zaiGlmComplete(opts) })
    }
  }
  const pushEntrim = () => {
    if (isEntrimConfigured()) {
      items.push({ label: ENTRIM_DEEPSEEK_LABEL, run: () => openAiCompatibleComplete(getEntrimProvider()!, opts) })
      items.push({ label: ENTRIM_QWEN_LABEL, run: () => entrimQwenComplete(opts) })
    }
  }
  const pushNvidia = () => {
    if (isNvidiaDeepseekConfigured()) {
      items.push({ label: 'nvidia-deepseek', run: () => nvidiaDeepseekComplete(opts) })
    }
  }
  const pushCf = () => {
    if (isCloudflareAiConfigured()) {
      items.push({ label: 'cloudflare-ai', run: () => cloudflareAiComplete(opts) })
    }
  }
  const pushGroq = () => {
    const p = listOpenAiFallbackProviders().find((x) => x.label === 'groq')
    if (p) items.push({ label: 'groq', run: () => openAiCompatibleComplete(p, opts) })
  }
  const pushGemini = () => {
    if (isGeminiConfigured()) items.push({ label: 'gemini', run: () => geminiComplete(opts) })
  }
  const pushOpenRouter = () => {
    if (isOpenRouterConfigured()) items.push({ label: 'openrouter', run: () => openRouterComplete(opts) })
  }
  const pushRest = () => {
    for (const p of listOpenAiFallbackProviders()) {
      if (p.label === 'groq') continue
      items.push({ label: p.label, run: () => openAiCompatibleComplete(p, opts) })
    }
  }
  const pushChatBridge = () => {
    items.push({ label: 'chatProvider-bridge', run: () => chatProviderBridge(opts) })
  }

  // Explicit pin: lead with that backend, then always DeepSeek → CF → rest
  if (isCloudflareExclusive(prefer)) {
    pushCf()
    pushNvidia()
  } else if (prefer === 'groq') {
    pushGroq()
    pushNvidia()
    pushCf()
  } else if (prefer === 'gemini') {
    pushGemini()
    pushNvidia()
    pushCf()
  } else if (prefer === 'openrouter') {
    pushOpenRouter()
    pushNvidia()
    pushCf()
  } else if (prefer === 'xai' || prefer === 'grok') {
    pushGrok()
    pushGlm()
    pushNvidia()
    pushCf()
  } else if (prefer === 'baseten-deepseek') {
    pushBaseten()
    pushGlm()
    pushNvidia()
    pushCf()
  } else if (isRunbiosPin(prefer)) {
    pushRunbiosGlm()
    pushBasetenGlm53Flash()
    pushBasetenGlmFast()
    pushGlm()
  } else if (prefer === 'baseten-glm-53-flash') {
    pushBasetenGlm53Flash()
    pushBasetenGlmFast()
    pushBaseten()
  } else if (prefer === 'baseten-glm-fast') {
    pushBasetenGlmFast()
    pushBaseten()
    pushGlm()
    pushNvidia()
    pushCf()
  } else if (prefer === 'aihubmix-glm-fast') {
    pushAihubmixGlmFast()
    pushBasetenGlmFast()
    pushBaseten()
    pushGlm()
    pushNvidia()
    pushCf()
  } else if (prefer === 'parasail-deepseek') {
    pushParasailDeepseek()
    pushBaseten()
    pushGlm()
    pushNvidia()
    pushCf()
  } else if (prefer === 'parasail-deepseek-pro') {
    pushParasailDeepseekPro()
    pushParasailDeepseek()
    pushBaseten()
    pushNvidia()
    pushCf()
  } else if (prefer === 'parasail-glm') {
    pushParasailGlm()
    pushBasetenGlmFast()
    pushGlm()
    pushZaiGlm()
    pushNvidia()
    pushCf()
  } else if (prefer === 'baseten-deepseek-pro') {
    pushBasetenPro()
    pushParasailDeepseekPro()
    pushDeepseekPro()
    pushBaseten()
    pushCf()
  } else if (prefer === 'deepseek-pro') {
    pushDeepseekPro()
    pushParasailDeepseekPro()
    pushBasetenPro()
    pushCf()
  } else if (prefer === 'deepseek-flash') {
    pushDeepseekFlash()
    pushBaseten()
    pushParasailDeepseek()
    pushNvidia()
    pushCf()
  } else if (prefer === 'zai-glm') {
    pushZaiGlm()
    pushParasailGlm()
    pushGlm()
    pushNvidia()
    pushCf()
  } else if (prefer === ENTRIM_DEEPSEEK_LABEL) {
    // Entrim is an explicit pin: lead with it. With no ENTRIM_API_KEY the
    // early-fail gate throws before this branch is ever reached, so an
    // explicit Entrim selection never silently executes another host.
    pushEntrim()
    pushNvidia()
    pushCf()
  } else if (prefer === 'nvidia-minimax') {
    pushMinimax()
    pushNemotron()
    pushGlm()
    pushNvidia()
    pushCf()
  } else if (prefer === 'nvidia-nemotron') {
    if (isNvidiaNemotronConfigured()) items.push({ label: 'nvidia-nemotron', run: () => nvidiaNemotronComplete(opts) })
    pushGlm()
    pushNvidia()
    pushCf()
  } else if (prefer === 'nvidia-glm') {
    pushGlm()
    pushNvidia()
    pushCf()
  } else if (prefer === 'openai' || prefer === 'custom') {
    const p = listOpenAiFallbackProviders().find((x) => x.label === prefer)
    if (p) items.push({ label: p.label, run: () => openAiCompatibleComplete(p, opts) })
    pushNvidia()
    pushCf()
  } else if (prefer === 'deepseek' && env('DEEPSEEK_API_KEY') && !isNvidiaDeepseekConfigured()) {
    // DeepSeek.com only if NVIDIA path missing
    const p = listOpenAiFallbackProviders().find((x) => x.label === 'deepseek')
    if (p) items.push({ label: p.label, run: () => openAiCompatibleComplete(p, opts) })
    pushCf()
  } else {
    // DEFAULT: Run BiOS GLM 5.3 Flash lead.
    pushRunbiosGlm()
    pushMinimax()
    pushNemotron()
    pushGrok()
    pushGlm()
    pushNvidia()
    pushBaseten()
    pushDeepseekFlash()
    pushCf()
  }

  // Fill remaining cascade (deduped below).
  // MiniMax, Nemotron, GLM, and Baseten are included so an explicit pin still gets the preferred
  // long-form providers before we drop out to the broader fallback set.
  pushRunbiosGlm()
  pushMinimax()
  pushNemotron()
  pushBasetenGlm53Flash()
  pushBasetenGlmFast()
  pushGlm()
  pushBaseten()
  pushParasailDeepseek()
  pushParasailDeepseekPro()
  pushParasailGlm()
  pushBasetenPro()
  pushDeepseekFlash()
  pushDeepseekPro()
  pushZaiGlm()
  pushEntrim()
  pushGrok()
  pushOpenAi()
  pushNvidia()
  pushCf()
  pushGroq()
  pushGemini()
  pushOpenRouter()
  pushRest()
  pushChatBridge()

  const orderedItems = sortByAdminOrder(items)
  const preferredIndex = orderedItems.findIndex((item) => item.label === prefer)
  if (preferredIndex > 0) {
    const [preferred] = orderedItems.splice(preferredIndex, 1)
    if (preferred) orderedItems.unshift(preferred)
  }
  const seen = new Set<string>()
  return orderedItems
    .filter((i) => {
      if (seen.has(i.label)) return false
      seen.add(i.label)
      return true
    })
    .slice(0, maxProviderCandidates())
}

/**
 * Track whether we've hit a subrequest budget error so the fallback cascade
 * stops immediately rather than pointlessly trying every remaining provider.
 */
let subrequestBudgetExhausted = false

/**
 * Check if an error is (or was caused by) the Cloudflare Workers subrequest limit.
 * When true, all remaining providers will also fail — stop the cascade.
 */
function isSubrequestLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /Too many subrequest/i.test(msg)
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
    system: system ? `${system}\n\n${qualityPromptBlock()}` : qualityPromptBlock(),
  }
}

async function withDeadline<T>(label: string, ms: number, promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label}: timed out after ${Math.round(ms / 1000)}s — trying next provider`)),
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
  // Entrim Qwen3.8 27B — explicit lane pin → entrim provider with the exact
  // upstream model id (Qwen/Qwen3.8-27B), used in the Discover, Brief, and
  // Reviewer lanes (mirrors how 'grok' / 'claude-opus-5' are wired).
  if (pin === ENTRIM_QWEN_LABEL || pin === 'qwen3.8-27b' || pin === 'qwen') {
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
    'entrim-qwen-27b': 'entrim-qwen-27b', 'qwen3.8-27b': 'entrim-qwen-27b',
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

export async function generateContentText(opts: ContentAiOptions): Promise<ContentAiResult> {
  // Apply the latest admin provider/key settings without requiring a redeploy.
  await refreshAiVault()
  // Every provider receives the same compliance contract, including custom
  // depth-rescue systems that do not pass through the factory prompt builder.
  opts = withUniversalQualityContract(opts)
  // Reset subrequest budget flag so a fresh request doesn't inherit stale state
  subrequestBudgetExhausted = false

  const { explicit, prefer, model } = resolveAiProviderPin(opts.aiProvider)
  if (model && !opts.model) opts = { ...opts, model }
  const errors: string[] = []
  let candidates = orderedCompleters(opts, prefer)

  // Exclusive pin (e.g. the Research brief): OpenAI ChatGPT alone must draft
  // it — never silently fall back to the open-source backends. Truncate the
  // cascade to just the pinned provider so any failure surfaces loudly.
  const allCandidates = candidates
  if (opts.exclusive) {
    candidates = candidates.filter((c) => c.label === prefer)
  }
  // Reviewer-style exclusive pins opt into cascadeOnCapacity: on a transient
  // infrastructure failure (529 overload, timeout, abort) the fix falls
  // through to the rest of the chain instead of hard-failing.
  const cascadeChain =
    opts.exclusive && opts.cascadeOnCapacity
      ? allCandidates.filter((c) => c.label !== prefer)
      : []

  // Early-fail: if the admin explicitly selected a provider but it isn't
  // in the cascade (missing API key), throw immediately with a clear
  // diagnostic instead of silently cycling through every other backend.
  if (explicit && !candidates.some((c) => c.label === prefer)) {
    const configured = candidates.map((c) => c.label).join(', ') || 'none'
    // Show the friendly GPT alias (e.g. 'gpt-5.6-terra') when the pin was a
    // model alias, so the message matches the picker label.
    const display = model && GPT_ALIAS_RE.test((opts.aiProvider || '').trim().toLowerCase())
      ? `${opts.aiProvider!.trim()} (${prefer})`
      : prefer
    throw new Error(
      prefer === 'grok'
        ? `Grok is not configured. Connect SuperGrok in Content Studio → Configure (no API key needed), then retry. Currently available providers: ${configured}.`
        : prefer === 'openai'
          ? `OpenAI is not configured. Connect ChatGPT Plus in Content Studio → Configure (no API key needed) or add OPENAI_API_KEY, then retry. Currently available providers: ${configured}.`
          : `Selected AI provider "${display}" is not configured. ` +
            `Add the required API key (e.g. OPENAI_API_KEY for OpenAI) to the environment. ` +
            `Currently available providers: ${configured}.`,
    )
  }

  if (!candidates.length) {
    throw new Error(
      'No content AI provider configured. Set NVIDIA_API_KEY (MiniMax drafting primary) and/or Cloudflare AI token as fallback.',
    )
  }

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]
    if (subrequestBudgetExhausted) {
      errors.push(`${c.label}: skipped — subrequest budget exhausted`)
      continue
    }
    try {
      return await withDeadline(c.label, deadlineForProvider(c.label, opts.timeoutMs, opts.strictTimeout === true), c.run())
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push(`${c.label}: ${msg}`)
      const paymentFail = isPaymentOrQuotaFailure(e) && c.label !== 'grok' && isGrokConfigured()
      if (paymentFail) {
        try {
          return await withDeadline('grok', deadlineForProvider('grok', opts.timeoutMs, opts.strictTimeout === true), grokComplete(opts))
        } catch (grokErr) {
          const grokMsg = grokErr instanceof Error ? grokErr.message : String(grokErr)
          errors.push(`grok: ${grokMsg}`)
        }
      }
      // Exclusive pins (Research brief) stay fail-closed. A draft picker
      // selection must cascade — a missing GLM deployment must not abandon
      // the job at 0 words. The reviewer (cascadeOnCapacity) is the exception:
      // a provider that cannot serve RIGHT NOW — transient overload/timeout OR
      // billing/quota (Baseten 402 "payment status") — falls through to the
      // next host so the fix sweep still ships.
      if (opts.exclusive && explicit && c.label === prefer) {
        if (
          opts.cascadeOnCapacity &&
          cascadeChain.length &&
          (isTransientInfraError(e) || isPaymentOrQuotaFailure(e))
        ) {
          console.warn(
            `[contentAi] explicit ${prefer} unavailable (${msg.slice(0, 140)}); cascading to ${cascadeChain.map((x) => x.label).join(', ')}`,
          )
          candidates = cascadeChain
          i = -1 // restart at the first fallback (cascadeChain excludes prefer)
          continue
        }
        if (paymentFail) {
          throw new Error(
            `Explicit AI provider "${prefer}" failed on billing/quota and SuperGrok fallback also failed. ` +
            `Provider errors: ${errors.join(' | ')}`,
          )
        }
        throw new Error(
          `Explicit AI provider "${prefer}" failed: ${msg.slice(0, 300)}. ` +
          `Check the API key and model in repo secrets or the AI Key Vault (Command Center → Configure). ` +
          `Provider errors: ${errors.join(' | ')}`,
        )
      }
      console.warn(`[contentAi] ${c.label} failed; trying next`)
      if (isSubrequestLimitError(e)) {
        subrequestBudgetExhausted = true
      }
    }
  }

  const quotaNote = errors.some(isDailyQuotaError)
    ? ' Cloudflare Workers AI daily free allocation is exhausted; it will not recover through retries.'
    : ''
  throw new Error(
    `All content AI providers failed. ${errors.map((e) => e.slice(0, 180)).join(' | ')}.${quotaNote} Configure another provider or retry after the affected quota resets.`,
  )
}


/**
 * Stream long-form content into the editor. Tries true SSE stream first,
 * then falls back to non-stream complete with synthetic chunking so the UI
 * still gets progressive updates.
 */
export async function* generateContentTextStream(
  opts: ContentAiOptions,
): AsyncGenerator<ContentAiStreamEvent> {
  // Apply the latest admin provider/key settings before constructing candidates.
  await refreshAiVault()
  // Streaming and complete generation share one compliance contract.
  opts = withUniversalQualityContract(opts)
  // Reset subrequest budget flag so a fresh request doesn't inherit stale state
  subrequestBudgetExhausted = false

  const { explicit, prefer, model } = resolveAiProviderPin(opts.aiProvider)
  if (model && !opts.model) opts = { ...opts, model }
  const errors: string[] = []

  type Candidate = {
    label: string
    stream?: () => AsyncGenerator<ContentAiStreamEvent>
    complete: () => Promise<ContentAiResult>
  }

  const candidates: Candidate[] = []

  const runbiosGlm = getRunbiosProvider(isRunbiosPin(prefer) ? prefer : 'runbios-glm-53-flash')
  if (runbiosGlm) {
    candidates.push({
      label: runbiosGlm.label,
      stream: () => openAiCompatibleStream(runbiosGlm, {
        ...opts,
        maxTokens: Math.min(opts.maxTokens ?? RUNBIOS_MAX_TOKENS, RUNBIOS_MAX_TOKENS),
      }),
      complete: () => openAiCompatibleComplete(runbiosGlm, opts),
    })
  }

  const basetenGlm53Flash = getBasetenGlm53FlashProvider()
  if (basetenGlm53Flash) {
    candidates.push({
      label: 'baseten-glm-53-flash',
      stream: () => openAiCompatibleStream(basetenGlm53Flash, {
        ...opts,
        maxTokens: Math.min(opts.maxTokens ?? BASETEN_MAX_TOKENS, BASETEN_MAX_TOKENS),
      }),
      complete: () => openAiCompatibleComplete(basetenGlm53Flash, opts),
    })
  }

  const basetenGlmFast = getBasetenGlmFastProvider()
  if (basetenGlmFast) {
    candidates.push({
      label: 'baseten-glm-fast',
      stream: () =>
        openAiCompatibleStream(basetenGlmFast, {
          ...opts,
          maxTokens: Math.min(opts.maxTokens ?? BASETEN_MAX_TOKENS, BASETEN_MAX_TOKENS),
        }),
      complete: () => basetenGlmFastComplete(opts),
    })
  }

  // AIHubmix GLM 5.2 Fast is a first-class streaming provider (OpenAI-compat
  // SSE) — same role as Baseten GLM Fast in the cascade, alternative route.
  const aihubmixGlmFast = getAihubmixGlmFastProvider()
  if (aihubmixGlmFast) {
    candidates.push({
      label: 'aihubmix-glm-fast',
      stream: () =>
        openAiCompatibleStream(aihubmixGlmFast, {
          ...opts,
          maxTokens: Math.min(opts.maxTokens ?? AIHUBMIX_MAX_TOKENS, AIHUBMIX_MAX_TOKENS),
        }),
      complete: () => aihubmixGlmFastComplete(opts),
    })
  }

  const parasailDeepseek = getParasailDeepseekProvider()
  if (parasailDeepseek) {
    candidates.push({
      label: 'parasail-deepseek',
      stream: () =>
        openAiCompatibleStream(parasailDeepseek, {
          ...opts,
          maxTokens: Math.min(opts.maxTokens ?? PARASAIL_MAX_TOKENS, PARASAIL_MAX_TOKENS),
        }),
      complete: () => parasailDeepseekComplete(opts),
    })
  }
  const parasailDeepseekPro = getParasailDeepseekProProvider()
  if (parasailDeepseekPro) {
    candidates.push({
      label: 'parasail-deepseek-pro',
      stream: () =>
        openAiCompatibleStream(parasailDeepseekPro, {
          ...opts,
          maxTokens: Math.min(opts.maxTokens ?? PARASAIL_MAX_TOKENS, PARASAIL_MAX_TOKENS),
        }),
      complete: () => parasailDeepseekProComplete(opts),
    })
  }
  const parasailGlm = getParasailGlmProvider(opts.reasoningEffort)
  if (parasailGlm) {
    candidates.push({
      label: 'parasail-glm',
      stream: () =>
        openAiCompatibleStream(parasailGlm, {
          ...opts,
          maxTokens: Math.min(opts.maxTokens ?? PARASAIL_MAX_TOKENS, PARASAIL_MAX_TOKENS),
        }),
      complete: () => parasailGlmComplete(opts),
    })
  }

  // NVIDIA GLM 5.2 is a first-class streaming provider. The previous
  // stream path omitted it entirely, so a selected GLM job visibly started
  // on DeepSeek/Cloudflare even though the complete path knew about GLM.
  const glm = getNvidiaGlmProvider()
  if (glm) {
    candidates.push({
      label: 'nvidia-glm',
      stream: () =>
        openAiCompatibleStream(glm, {
          ...opts,
          maxTokens: Math.min(opts.maxTokens ?? NVIDIA_GLM_MAX_TOKENS, NVIDIA_GLM_MAX_TOKENS),
          temperature: opts.temperature ?? 0.7,
        }),
      complete: () => nvidiaGlmComplete(opts),
    })
  }

  const basetenPro = getBasetenDeepseekProProvider()
  if (basetenPro) {
    candidates.push({
      label: 'baseten-deepseek-pro',
      stream: () =>
        openAiCompatibleStream(basetenPro, {
          ...opts,
          maxTokens: Math.min(opts.maxTokens ?? BASETEN_MAX_TOKENS, BASETEN_MAX_TOKENS),
        }),
      complete: () => basetenDeepseekProComplete(opts),
    })
  }
  const deepseekFlash = getDeepseekOfficialFlashProvider()
  if (deepseekFlash) {
    candidates.push({
      label: 'deepseek-flash',
      stream: () => openAiCompatibleStream(deepseekFlash, opts),
      complete: () => deepseekOfficialFlashComplete(opts),
    })
  }
  const deepseekPro = getDeepseekOfficialProProvider()
  if (deepseekPro) {
    candidates.push({
      label: 'deepseek-pro',
      stream: () => openAiCompatibleStream(deepseekPro, opts),
      complete: () => deepseekOfficialProComplete(opts),
    })
  }
  const zaiGlm = getZaiGlmProvider()
  if (zaiGlm) {
    candidates.push({
      label: 'zai-glm',
      stream: () =>
        openAiCompatibleStream(zaiGlm, {
          ...opts,
          maxTokens: Math.min(opts.maxTokens ?? ZAI_MAX_TOKENS, ZAI_MAX_TOKENS),
        }),
      complete: () => zaiGlmComplete(opts),
    })
  }

  // Entrim DeepSeek V4 Flash — first-class streaming provider (OpenAI-compat
  // SSE), same role as the zai-glm lane. Only present when ENTRIM_API_KEY is
  // configured, so an explicit pin without a key fails closed upstream.
  const entrim = getEntrimProvider()
  if (entrim) {
    candidates.push({
      label: ENTRIM_DEEPSEEK_LABEL,
      stream: () =>
        openAiCompatibleStream(entrim, {
          ...opts,
          maxTokens: Math.min(opts.maxTokens ?? ENTRIM_MAX_TOKENS, ENTRIM_MAX_TOKENS),
        }),
      complete: () => openAiCompatibleComplete(entrim, opts),
    })
  }
  const entrimQwen = getEntrimQwenProvider()
  if (entrimQwen) {
    candidates.push({
      label: ENTRIM_QWEN_LABEL,
      stream: () =>
        openAiCompatibleStream(entrimQwen, {
          ...opts,
          maxTokens: Math.min(opts.maxTokens ?? ENTRIM_MAX_TOKENS, ENTRIM_MAX_TOKENS),
        }),
      complete: () => entrimQwenComplete(opts),
    })
  }

  // Baseten DeepSeek V4 Flash is a first-class streaming provider.
  const baseten = getBasetenProvider()
  if (baseten) {
    candidates.push({
      label: 'baseten-deepseek',
      stream: () =>
        openAiCompatibleStream(baseten, {
          ...opts,
          maxTokens: Math.min(opts.maxTokens ?? BASETEN_MAX_TOKENS, BASETEN_MAX_TOKENS),
        }),
      complete: () => basetenComplete(opts),
    })
  }

  // NVIDIA DeepSeek remains available as a separate fallback/explicit pin.
  const minimax = getNvidiaMinimaxProvider()
  if (minimax) {
    candidates.push({
      label: 'nvidia-minimax',
      stream: () => openAiCompatibleStream(minimax, {
        ...opts,
        maxTokens: Math.min(opts.maxTokens ?? NVIDIA_MINIMAX_MAX_TOKENS, NVIDIA_MINIMAX_MAX_TOKENS),
        temperature: opts.temperature ?? 1,
      }),
      complete: () => nvidiaMinimaxComplete(opts),
    })
  }

  const nvidia = getNvidiaDeepseekProvider()
  if (nvidia) {
    candidates.push({
      label: 'nvidia-deepseek',
      stream: () =>
        openAiCompatibleStream(nvidia, {
          ...opts,
          maxTokens: Math.min(opts.maxTokens ?? NVIDIA_DEEPSEEK_MAX_TOKENS, NVIDIA_DEEPSEEK_MAX_TOKENS),
          temperature: opts.temperature ?? 0.7,
        }),
      complete: () => nvidiaDeepseekComplete(opts),
    })
  }

  // NVIDIA Nemotron remains available as an explicit alternative; the drafting
  // default is MiniMax and saved admin order promotes it below.
  const nemotron = getNvidiaNemotronProvider()
  if (nemotron) {
    candidates.push({
      label: 'nvidia-nemotron',
      stream: () => openAiCompatibleStream(nemotron, {
        ...opts,
        maxTokens: Math.min(opts.maxTokens ?? NVIDIA_NEMOTRON_MAX_TOKENS, NVIDIA_NEMOTRON_MAX_TOKENS),
        temperature: opts.temperature ?? 1,
      }),
      complete: () => nvidiaNemotronComplete(opts),
    })
  }

  // Streaming-capable OpenAI-compat providers
  if (isCloudflareAiConfigured()) {
    candidates.push({
      label: 'cloudflare-ai',
      stream: () => cloudflareAiStream(opts),
      complete: () => cloudflareAiComplete(opts),
    })
  }
  for (const p of listOpenAiFallbackProviders()) {
    if (p.label === 'grok') {
      candidates.push({
        label: 'grok',
        stream: () => grokResponsesStream(opts),
        complete: () => grokComplete(opts),
      })
      continue
    }
    candidates.push({
      label: p.label,
      stream: () => openAiCompatibleStream(p, opts),
      complete: () => openAiCompatibleComplete(p, opts),
    })
  }
  if (isGrokConfigured() && !candidates.some((c) => c.label === 'grok')) {
    candidates.push({
      label: 'grok',
      stream: () => grokResponsesStream(opts),
      complete: () => grokComplete(opts),
    })
  }
  if (isOpenRouterConfigured()) {
    // Multi-model OpenRouter: stream first free model only; complete walks list
    candidates.push({
      label: 'openrouter',
      stream: () =>
        openAiCompatibleStream(
          {
            label: 'openrouter',
            baseURL: 'https://openrouter.ai/api/v1',
            apiKey: env('OPENROUTER_API_KEY'),
            model: OPENROUTER_MODELS[0],
          },
          opts,
        ),
      complete: () => openRouterComplete(opts),
    })
  }
  // Gemini has no SSE path here — synthetic stream from complete
  if (isGeminiConfigured()) {
    candidates.push({
      label: 'gemini',
      complete: () => geminiComplete(opts),
    })
  }
  candidates.push({
    label: 'chatProvider-bridge',
    complete: () => chatProviderBridge(opts),
  })

  // Admin order controls the default stream cascade; manual pins still win.
  const adminOrder = configuredProviderOrder()
  if (adminOrder.length) {
    const rank = new Map(adminOrder.map((id, index) => [id, index]))
    candidates.sort((a, b) => (rank.get(a.label) ?? 10000) - (rank.get(b.label) ?? 10000))
  }
  // A persisted order can be older than the current provider set. In that
  // case a small max-provider cap may fill with billing-blocked or unrelated
  // providers before the configured long-form fallback that the operator
  // selected for this drafting lane. Keep MiniMax first, but reserve the next
  // slots for the same-model Baseten/Parasail lanes before broad fallbacks.
  // This is deliberately limited to the MiniMax drafting lane; explicit
  // reviewer/research pins retain their configured order and semantics.
  if (prefer === 'nvidia-minimax') {
    const fallbackRank = new Map([
      ['nvidia-minimax', 0],
      ['baseten-deepseek', 1],
      ['parasail-deepseek', 2],
      ['baseten-glm-fast', 3],
      ['aihubmix-glm-fast', 4],
      ['nvidia-glm', 5],
      ['nvidia-deepseek', 6],
      ['nvidia-nemotron', 7],
      ['grok', 8],
      ['cloudflare-ai', 9],
    ])
    candidates.sort((a, b) => (fallbackRank.get(a.label) ?? 10000) - (fallbackRank.get(b.label) ?? 10000))
  }
  if (isCloudflareExclusive(prefer)) {
    const idx = candidates.findIndex((c) => c.label === 'cloudflare-ai')
    if (idx > 0) {
      const [pref] = candidates.splice(idx, 1)
      candidates.unshift(pref)
    }
  } else if (
    isRunbiosPin(prefer) ||
    prefer === 'baseten-glm-53-flash' ||
    prefer === 'baseten-deepseek' ||
    prefer === 'baseten-deepseek-pro' ||
    prefer === 'baseten-glm-fast' ||
    prefer === 'aihubmix-glm-fast' ||
    prefer === 'parasail-deepseek' ||
    prefer === 'parasail-deepseek-pro' ||
    prefer === 'parasail-glm' ||
    prefer === 'deepseek-flash' ||
    prefer === 'deepseek-pro' ||
    prefer === 'zai-glm' ||
    prefer === ENTRIM_DEEPSEEK_LABEL
  ) {
    const idx = candidates.findIndex((c) => c.label === prefer)
    if (idx > 0) {
      const [pref] = candidates.splice(idx, 1)
      candidates.unshift(pref)
    }
  } else if (prefer === 'nvidia-glm' || prefer === 'nvidia-deepseek' || prefer === 'nvidia-nemotron' || prefer === 'nvidia-minimax') {
    const idx = candidates.findIndex((c) => c.label === prefer)
    if (idx > 0) {
      const [pref] = candidates.splice(idx, 1)
      candidates.unshift(pref)
    }
  } else if (prefer === 'groq' || prefer === 'gemini' || prefer === 'openrouter' || prefer === 'openai' || prefer === 'custom') {
    const want = prefer
    const idx = candidates.findIndex((c) => c.label === want)
    if (idx > 0) {
      const [pref] = candidates.splice(idx, 1)
      candidates.unshift(pref)
    }
  } else if (prefer === 'xai' || prefer === 'grok') {
    const idx = candidates.findIndex((c) => c.label === 'grok')
    if (idx > 0) {
      const [pref] = candidates.splice(idx, 1)
      candidates.unshift(pref)
    }
  }

  // A saved admin order can be stale relative to the current provider set.
  // Preserve MiniMax as the drafting lead, but keep a configured same-model
  // fallback inside the provider cap. Otherwise a MiniMax 429 can be followed
  // by billing-blocked Grok/Nemotron while Baseten Flash is never attempted.
  if (prefer === 'nvidia-minimax') {
    const fallbackRank = new Map([
      ['nvidia-minimax', 0],
      ['baseten-deepseek', 1],
      ['parasail-deepseek', 2],
      ['baseten-glm-fast', 3],
      ['aihubmix-glm-fast', 4],
      ['nvidia-glm', 5],
      ['nvidia-deepseek', 6],
      ['nvidia-nemotron', 7],
      ['grok', 8],
      ['cloudflare-ai', 9],
    ])
    candidates.sort((a, b) => (fallbackRank.get(a.label) ?? 10000) - (fallbackRank.get(b.label) ?? 10000))
  }

  // Dedupe preserving the MiniMax-first default order.
  const seen = new Set<string>()
  let unique = candidates
    .filter((c) => {
      if (seen.has(c.label)) return false
      seen.add(c.label)
      return true
    })
    .slice(0, maxProviderCandidates())

  // Exclusive pin: only the selected provider may serve this request — no
  // cascade to other backends (the Research brief belongs to ChatGPT alone).
  const allStreamCandidates = unique
  if (opts.exclusive) {
    unique = unique.filter((c) => c.label === prefer)
  }
  const cascadeChain =
    opts.exclusive && opts.cascadeOnCapacity
      ? allStreamCandidates.filter((c) => c.label !== prefer)
      : []

  let explicitProviderFailed = false
  for (let i = 0; i < unique.length; i++) {
    const c = unique[i]
    if (subrequestBudgetExhausted) {
      errors.push(`${c.label}: skipped — subrequest budget exhausted`)
      continue
    }
    // When the admin explicitly chose a provider and it's about to be skipped
    // because its stream isn't available (no SSE), surface the gap as a visible
    // provider event before the cascade continues.
    if (explicit && c.label === prefer && !c.stream) {
      // Grok 4.6 / SuperGrok uses the Responses API (no chat SSE). Fall
      // through to completeAsStream instead of failing the job.
      yield { type: 'provider', provider: c.label, model: grokModelId(opts) }
    }
    if (c.stream) {
      try {
        yield* c.stream()
        return
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        errors.push(`${c.label} stream: ${msg}`)
        // When the admin explicitly chose this provider, emit a visible
        // failure event in the Livestream so they can diagnose the issue
        // (bad API key, quota, network) instead of wondering why their
        // selection was ignored. Continue the cascade for resilience.
        if (explicit && c.label === prefer) {
          explicitProviderFailed = true
          if (isPaymentOrQuotaFailure(e) && prefer !== 'grok' && isGrokConfigured()) {
            yield { type: 'provider', provider: 'grok', model: grokModelId(opts) }
            yield* completeAsStream(() => grokComplete(opts))
            return
          }
          const failure = `Explicit AI provider "${prefer}" failed: ${msg.slice(0, 300)}`
          yield {
            type: 'provider',
            provider: c.label,
            model: `FAILED: ${failure}`,
          }
          // Research briefs (`exclusive`) stay pinned. Draft picker pins
          // cascade so a 404 GLM deployment falls through to DeepSeek/Grok
          // instead of closing the job with an empty body. The reviewer
          // (cascadeOnCapacity) falls through on transient overloads/timeouts
          // so the fix sweep still ships.
          if (opts.exclusive) {
            if (
              opts.cascadeOnCapacity &&
              cascadeChain.length &&
              (isTransientInfraError(e) || isPaymentOrQuotaFailure(e))
            ) {
              unique = cascadeChain
              i = -1 // restart at the first fallback (cascadeChain excludes prefer)
              console.warn(`[contentAi] explicit ${prefer} unavailable (${msg.slice(0, 140)}); cascading to ${cascadeChain.map((x) => x.label).join(', ')}`)
              continue
            }
            throw new Error(failure)
          }
        }
        if (isSubrequestLimitError(e)) subrequestBudgetExhausted = true
        // Do not immediately call the same provider again through its
        // complete endpoint. Move to the next bounded candidate instead.
        continue
      }
    }
    try {
      yield* completeAsStream(c.complete)
      return
    } catch (e2) {
      const msg2 = e2 instanceof Error ? e2.message : String(e2)
      errors.push(`${c.label}: ${msg2}`)
      if (c.label === 'grok' || (explicit && c.label === prefer)) {
        yield { type: 'provider', provider: c.label, model: `FAILED: ${msg2.slice(0, 220)}` }
      }
      if (explicit && c.label === prefer) {
        explicitProviderFailed = true
        if (isPaymentOrQuotaFailure(e2) && prefer !== 'grok' && isGrokConfigured()) {
          yield { type: 'provider', provider: 'grok', model: grokModelId(opts) }
          yield* completeAsStream(() => grokComplete(opts))
          return
        }
        // Reviewer-style exclusive pins cascade on transient infra / billing
        // failures even when the pinned provider had no SSE path.
        if (
          opts.exclusive &&
          opts.cascadeOnCapacity &&
          cascadeChain.length &&
          (isTransientInfraError(e2) || isPaymentOrQuotaFailure(e2))
        ) {
          unique = cascadeChain
          i = -1
          console.warn(`[contentAi] explicit ${prefer} unavailable (${msg2.slice(0, 140)}); cascading to ${cascadeChain.map((x) => x.label).join(', ')}`)
          continue
        }
      }
      if (isSubrequestLimitError(e2)) {
        subrequestBudgetExhausted = true
      }
    }
  }



  const quotaNote = errors.some(isDailyQuotaError)
    ? ' Cloudflare Workers AI daily free allocation is exhausted; it will not recover through retries.'
    : ''
  throw new Error(
    errors.length
      ? `All content AI stream providers failed. ${errors.map((e) => e.slice(0, 180)).join(' | ')}.${quotaNote} Configure another provider or retry after the affected quota resets.`
      : 'No content AI provider configured for streaming.',
  )
}
