/**
 * Content-generation AI provider for Content Studio / SEO Factory.
 *
 * DEFAULT CHAIN (hard order):
 *   1. DeepSeek via NVIDIA Integrate (deepseek-ai/deepseek-v4-pro, 16k tokens)
 *   2. Cloudflare Workers AI (first fallback)
 *   3. Groq → Gemini → OpenRouter → custom → xAI → OpenAI → DeepSeek.com
 *   4. getChatProvider() bridge
 *
 * NVIDIA auth: NVIDIA_API_KEY | NVAPI_KEY | NVIDIA_NIM_API_KEY
 * CF auth: CLOUDFLARE_AI_TOKEN | CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID
 *
 * Override with CONTENT_AI_PROVIDER / AI_PROVIDER only if you must pin a backend.
 * Default / auto / deepseek → NVIDIA DeepSeek primary, Cloudflare fallback.
 */

const CF_AI_MODEL =
  process.env.CLOUDFLARE_AI_MODEL?.trim() ||
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast'

/** Default output budget — long-form guides need ~2k words (~3–4k tokens). */
const DEFAULT_MAX_TOKENS = 8192
/** NVIDIA DeepSeek V4 Pro supports large completions — use for depth floors. */
const NVIDIA_DEEPSEEK_MAX_TOKENS = 16384
const DEFAULT_TEMPERATURE = 0.65
// Keep the cascade bounded while allowing one additional configured provider
// after a primary timeout and an exhausted quota fallback.
const MAX_PROVIDER_CANDIDATES = Math.max(
  1,
  Math.min(4, Number.parseInt(process.env.CONTENT_AI_MAX_PROVIDERS || '3', 10) || 3),
)

const NVIDIA_INTEGRATE_BASE =
  process.env.NVIDIA_BASE_URL?.trim() || 'https://integrate.api.nvidia.com/v1'
const NVIDIA_DEEPSEEK_MODEL =
  process.env.NVIDIA_DEEPSEEK_MODEL?.trim() ||
  process.env.NVIDIA_MODEL?.trim() ||
  'deepseek-ai/deepseek-v4-pro'

/**
 * NVIDIA GLM 5.2 (z-ai/glm-5.2) — verified live against integrate.api.nvidia.com/v1
 * with NVAPI auth in 2026 Q3. Same base URL + OpenAI-compatible API as NVIDIA
 * DeepSeek, but with stronger multi-language / instruction-following in YMYL
 * contexts. Zhipu AI's GLM 5.2 family running on NVIDIA's NIM catalog.
 *
 * PROMOTED: GLM is now the preferred NVIDIA lead over DeepSeek V4 Pro on this
 * estate because (1) compliance-grade output on legal content and (2)
 * instruction-following are measurably stronger for our SEO briefs.
 */
const NVIDIA_GLM_MODEL =
  process.env.NVIDIA_GLM_MODEL?.trim() ||
  'z-ai/glm-5.2'
const NVIDIA_GLM_MAX_TOKENS = 16384

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
    const { buildVaultEnvOverrides } = await import('@/lib/aiKeyVault')
    const overlay = await buildVaultEnvOverrides(true)
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
  // Retry by default; set CONTENT_AI_RETRY=0 to disable
  const maxAttempts = process.env.CONTENT_AI_RETRY === '0' ? 1 : 2
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const retryable = /\b(503|429|524)\b|UNAVAILABLE|overload|high.demand|rate.?limit|gateway.timeout/i.test(msg)
      if (!retryable || attempt >= maxAttempts || /Too many subrequest/i.test(msg) || isNoRetryProviderError(msg)) { console.warn(`[contentAi] ${name} non-retryable: ${msg.slice(0,120)}`); throw e }
      console.warn(`[contentAi] ${name} transient (${msg.slice(0, 120)}); retry 1500ms`)
      await new Promise((r) => setTimeout(r, 1500))
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

async function openAiCompatibleComplete(
  p: OpenAiCompat,
  opts: ContentAiOptions,
): Promise<ContentAiResult> {
  return withRetry(p.label, async () => {
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
    const maxTokens = resolveMaxTokens(p, opts)
    // GPT-5.x / o-series reasoning models require max_completion_tokens
    // instead of max_tokens (OpenAI rejects max_tokens on these models).
    const isReasoningModel = /^(gpt-5|o[0-9]|o1|o3|o4)/i.test(p.model)
    const body: Record<string, unknown> = {
      model: p.model,
      ...(isReasoningModel ? {} : { temperature: opts.temperature ?? DEFAULT_TEMPERATURE }),
      ...(isReasoningModel ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens }),
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.prompt },
      ],
      ...(p.topP != null && !isReasoningModel ? { top_p: p.topP } : {}),
      ...(p.extraBody || {}),
    }
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
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
    const msg = choice?.message
    let text = extractMessageText(msg?.content)
    // Some thinking models put draft in reasoning; prefer content, fallback reasoning if empty
    if (!text && msg?.reasoning_content) {
      text = String(msg.reasoning_content).trim()
    }
    if (!text) throw new Error(`${p.label} returned empty content`)
    // Never silently accept a cut-off completion — cascade to the next provider instead.
    if (choice?.finish_reason === 'length') {
      throw new Error(`${p.label} output was truncated (token limit) — trying next provider`)
    }
    return { text, provider: p.label, model: p.model }
  })
}

/** NVIDIA Integrate API key for DeepSeek V4 Pro (long-form primary). */
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

export function isNvidiaDeepseekConfigured(): boolean {
  return Boolean(resolveNvidiaApiKey())
}

/** NVIDIA-hosted GLM 5.2 (z-ai/glm-5.2) — 16k max tokens, OpenAI-compatible. */
export function getNvidiaGlmProvider(): OpenAiCompat | null {
  const apiKey = resolveNvidiaApiKey()
  if (!apiKey) return null
  return {
    label: 'nvidia-glm',
    baseURL: NVIDIA_INTEGRATE_BASE,
    apiKey,
    model: NVIDIA_GLM_MODEL,
    topP: Number(env('NVIDIA_TOP_P') || '0.95') || 0.95,
    maxTokensCap: NVIDIA_GLM_MAX_TOKENS,
    // Disable thinking mode so output is final prose (factory expects markdown page).
    // GLM 5.2 uses enable_thinking (z-ai-style) rather than `thinking` (DeepSeek-style).
    extraBody: {
      chat_template_kwargs: { enable_thinking: false },
    },
  }
}

/** NVIDIA-hosted DeepSeek V4 Pro — 16k max tokens, OpenAI-compatible. */
export function getNvidiaDeepseekProvider(): OpenAiCompat | null {
  const apiKey = resolveNvidiaApiKey()
  if (!apiKey) return null
  return {
    label: 'nvidia-deepseek',
    baseURL: NVIDIA_INTEGRATE_BASE,
    apiKey,
    model: NVIDIA_DEEPSEEK_MODEL,
    topP: Number(env('NVIDIA_TOP_P') || '0.95') || 0.95,
    maxTokensCap: NVIDIA_DEEPSEEK_MAX_TOKENS,
    // Disable thinking mode so output is final prose (factory expects markdown page)
    extraBody: {
      chat_template_kwargs: { thinking: false },
    },
  }
}

async function nvidiaGlmComplete(opts: ContentAiOptions): Promise<ContentAiResult> {
  const p = getNvidiaGlmProvider()
  if (!p) throw new Error('NVIDIA GLM not configured (NVIDIA_API_KEY / NVAPI_KEY)')
  // GLM 5.2 supports max_tokens=16384 via NVIDIA NIM — same wide context as DeepSeek V4 Pro.
  const maxTokens = Math.min(
    opts.maxTokens ?? NVIDIA_GLM_MAX_TOKENS,
    NVIDIA_GLM_MAX_TOKENS,
  )
  return openAiCompatibleComplete(p, {
    ...opts,
    maxTokens,
    // Slightly lower than NVIDIA's sample default (1.0) — better factual accuracy on YMYL legal content.
    temperature: opts.temperature ?? (Number(env('NVIDIA_TEMPERATURE') || '0.7') || 0.7),
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
        try {
          const json = JSON.parse(payload) as {
            choices?: Array<{
              delta?: { content?: string }
              message?: { content?: string }
              text?: string
            }>
            response?: string
          }
          const delta =
            json.choices?.[0]?.delta?.content ||
            json.choices?.[0]?.message?.content ||
            json.choices?.[0]?.text ||
            (typeof json.response === 'string' ? json.response : '')
          if (delta) yield delta
        } catch {
          /* skip malformed SSE chunks */
        }
      }
    }
  } finally {
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
  const maxTokens = resolveMaxTokens(p, opts)
  // GPT-5.x / o-series reasoning models require max_completion_tokens
  // instead of max_tokens (OpenAI rejects max_tokens on these models).
  const isReasoningModel = /^(gpt-5|o[0-9]|o1|o3|o4)/i.test(p.model)
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: p.model,
      stream: true,
      ...(isReasoningModel ? {} : { temperature: opts.temperature ?? DEFAULT_TEMPERATURE }),
      ...(isReasoningModel ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens }),
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.prompt },
      ],
      ...(p.topP != null && !isReasoningModel ? { top_p: p.topP } : {}),
      ...(p.extraBody || {}),
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(formatProviderFailure(`${p.label} stream`, res.status, body))
  }
  if (!res.body) throw new Error(`${p.label} stream: empty body`)

  yield { type: 'provider', provider: p.label, model: p.model }
  let full = ''
  for await (const delta of parseOpenAiSse(res.body)) {
    full += delta
    yield { type: 'delta', text: delta }
  }
  if (!full.trim()) throw new Error(`${p.label} stream returned empty content`)
  yield { type: 'done', text: full.trim(), provider: p.label, model: p.model }
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
  if (env('CUSTOM_AI_BASE_URL') && env('CUSTOM_AI_API_KEY')) {
    out.push({
      label: 'custom',
      baseURL: env('CUSTOM_AI_BASE_URL'),
      apiKey: env('CUSTOM_AI_API_KEY'),
      model: env('CUSTOM_AI_MODEL') || 'gpt-5.6-luna',
    })
  }
  if (env('XAI_API_KEY')) {
    out.push({
      label: 'grok',
      baseURL: env('XAI_BASE_URL') || 'https://api.x.ai/v1',
      apiKey: env('XAI_API_KEY'),
      model: env('XAI_MODEL') || 'grok-3',
    })
  }
  if (env('OPENAI_API_KEY')) {
    out.push({
      label: 'openai',
      baseURL: 'https://api.openai.com/v1',
      apiKey: env('OPENAI_API_KEY'),
      model: env('OPENAI_MODEL') || 'gpt-5.6-luna',
    })
  }
  if (env('DEEPSEEK_API_KEY')) {
    out.push({
      label: 'deepseek',
      baseURL: env('DEEPSEEK_BASE_URL') || 'https://api.deepseek.com/v1',
      apiKey: env('DEEPSEEK_API_KEY'),
      model: env('DEEPSEEK_MODEL') || 'deepseek-chat',
    })
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
    {
      id: 'nvidia-glm',
      label: 'NVIDIA GLM 5.2 (z-ai/glm-5.2 — preferred lead)',
      configured: isNvidiaGlmConfigured(),
      role: 'primary',
    },
    {
      id: 'nvidia-deepseek',
      label: 'DeepSeek V4 Pro via NVIDIA (default primary)',
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
    { id: 'custom', label: 'Custom OpenAI-compatible', configured: Boolean(env('CUSTOM_AI_BASE_URL') && env('CUSTOM_AI_API_KEY')), role: 'fallback' },
    { id: 'grok', label: 'xAI Grok', configured: Boolean(env('XAI_API_KEY')), role: 'fallback' },
    { id: 'openai', label: 'OpenAI (GPT-5.6 Luna)', configured: Boolean(env('OPENAI_API_KEY')), role: 'fallback' },
    { id: 'deepseek', label: 'DeepSeek.com API', configured: Boolean(env('DEEPSEEK_API_KEY')), role: 'fallback' },
  ]
}

/**
 * Resolve preferred provider label.
 *
 * HARD DEFAULT: DeepSeek V4 Pro via NVIDIA (`nvidia-deepseek`).
 * Cloudflare is always the first fallback in orderedCompleters — never the
 * default lead unless CONTENT_AI_PROVIDER is explicitly cloudflare|workers-ai.
 *
 * Empty / unknown / legacy "primary" values all map back to nvidia-deepseek
 * so a stale Worker secret cannot silently demote the writer.
 */
function preferProvider(): string {
  const explicit = (env('CONTENT_AI_PROVIDER') || env('AI_PROVIDER') || '').toLowerCase().trim()
  if (!explicit || explicit === 'auto' || explicit === 'default' || explicit === 'primary') {
    return 'xai' // Grok (xAI) is now the default primary
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
  // Aliases → NVIDIA DeepSeek primary
  if (
    explicit === 'deepseek' ||
    explicit === 'deepseek-v4' ||
    explicit === 'deepseek-v4-pro' ||
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
    'nvidia-deepseek', // already aliased upstream, allowed as explicit pin
  ])
  if (!allowedPins.has(explicit)) {
    console.warn(
      `[contentAi] Unknown CONTENT_AI_PROVIDER="${explicit}" — using nvidia-deepseek (DeepSeek V4 Pro)`,
    )
    return 'nvidia-deepseek'
  }
  return explicit
}

function isNvidiaPrefer(prefer: string): boolean {
  return (
    prefer === 'nvidia' ||
    prefer === 'nvidia-deepseek' ||
    prefer === 'nvidia-glm' ||
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

type CompleteFn = () => Promise<ContentAiResult>

/**
 * Fixed factory order unless CONTENT_AI_PROVIDER pins a different lead:
 * DeepSeek (NVIDIA) → Cloudflare → Groq → Gemini → OpenRouter → rest.
 */
function orderedCompleters(opts: ContentAiOptions, prefer: string): Array<{ label: string; run: CompleteFn }> {
  const items: Array<{ label: string; run: CompleteFn }> = []

  const pushGrok = () => {
    const p = listOpenAiFallbackProviders().find((x) => x.label === 'grok')
    if (p) items.push({ label: 'grok', run: () => openAiCompatibleComplete(p, opts) })
  }
  const pushOpenAi = () => {
    const p = listOpenAiFallbackProviders().find((x) => x.label === 'openai')
    if (p) items.push({ label: 'openai', run: () => openAiCompatibleComplete(p, opts) })
  }
  const pushGlm = () => {
    if (isNvidiaGlmConfigured()) {
      items.push({ label: 'nvidia-glm', run: () => nvidiaGlmComplete(opts) })
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
    const p = listOpenAiFallbackProviders().find((x) => x.label === 'grok')
    if (p) items.push({ label: 'grok', run: () => openAiCompatibleComplete(p, opts) })
    pushGlm() // GLM 5.2 preferred lead over DeepSeek on NVIDIA branch
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
    // DEFAULT: GLM 5.2 (preferred NVIDIA) → Grok → OpenAI → DeepSeek → Cloudflare
    pushGlm()
    pushGrok()
    pushOpenAi()
    pushNvidia()
    pushCf()
  }

  // Fill remaining cascade (deduped below).
  // GLM is included so any explicit pin that skips the GLM lead still gets it
  // as a fallback option before we drop out to Groq/Gemini/OpenRouter.
  pushGlm()
  pushGrok()
  pushOpenAi()
  pushNvidia()
  pushCf()
  pushGroq()
  pushGemini()
  pushOpenRouter()
  pushRest()
  pushChatBridge()

  const seen = new Set<string>()
  return items
    .filter((i) => {
      if (seen.has(i.label)) return false
      seen.add(i.label)
      return true
    })
    .slice(0, MAX_PROVIDER_CANDIDATES)
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
  Number.parseInt(process.env.CONTENT_AI_COMPLETE_TIMEOUT_MS || '120000', 10) || 120_000,
)

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

export async function generateContentText(opts: ContentAiOptions): Promise<ContentAiResult> {
  // Reset subrequest budget flag so a fresh request doesn't inherit stale state
  subrequestBudgetExhausted = false

  const explicit = (opts.aiProvider || '').trim().toLowerCase()
  const prefer = explicit || preferProvider()
  const errors: string[] = []
  const candidates = orderedCompleters(opts, prefer)

  if (!candidates.length) {
    throw new Error(
      'No content AI provider configured. Set NVIDIA_API_KEY (DeepSeek primary) and/or Cloudflare AI token as fallback.',
    )
  }

  for (const c of candidates) {
    if (subrequestBudgetExhausted) {
      errors.push(`${c.label}: skipped — subrequest budget exhausted`)
      continue
    }
    try {
      return await withDeadline(c.label, COMPLETE_TIMEOUT_MS, c.run())
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push(`${c.label}: ${msg}`)
      // When the admin explicitly chose this provider, stop the cascade so
      // the dashboard sees exactly why their selection didn't ship. Silent
      // fallback made it look like the picker was ignored.
      if (explicit && c.label === prefer) {
        throw new Error(
          `Explicit AI provider "${prefer}" failed: ${msg.slice(0, 300)}. ` +
          `Check the API key and model in repo secrets (OPENAI_API_KEY, etc). ` +
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
  // Reset subrequest budget flag so a fresh request doesn't inherit stale state
  subrequestBudgetExhausted = false

  const explicit = (opts.aiProvider || '').trim().toLowerCase()
  const prefer = explicit || preferProvider()
  const errors: string[] = []

  type Candidate = {
    label: string
    stream?: () => AsyncGenerator<ContentAiStreamEvent>
    complete: () => Promise<ContentAiResult>
  }

  const candidates: Candidate[] = []

  // NVIDIA DeepSeek first when configured (long-form / depth)
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

  // Streaming-capable OpenAI-compat providers
  if (isCloudflareAiConfigured()) {
    candidates.push({
      label: 'cloudflare-ai',
      stream: () => cloudflareAiStream(opts),
      complete: () => cloudflareAiComplete(opts),
    })
  }
  for (const p of listOpenAiFallbackProviders()) {
    candidates.push({
      label: p.label,
      stream: () => openAiCompatibleStream(p, opts),
      complete: () => openAiCompatibleComplete(p, opts),
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

  // Default stream order is already DeepSeek → Cloudflare (built above).
  // Only reorder when CONTENT_AI_PROVIDER explicitly pins Cloudflare (or other).
  if (isCloudflareExclusive(prefer)) {
    const idx = candidates.findIndex((c) => c.label === 'cloudflare-ai')
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

  // Dedupe preserving order (DeepSeek first, Cloudflare second by default)
  const seen = new Set<string>()
  const unique = candidates
    .filter((c) => {
      if (seen.has(c.label)) return false
      seen.add(c.label)
      return true
    })
    .slice(0, MAX_PROVIDER_CANDIDATES)

  let explicitProviderFailed = false
  for (const c of unique) {
    if (subrequestBudgetExhausted) {
      errors.push(`${c.label}: skipped — subrequest budget exhausted`)
      continue
    }
    // When the admin explicitly chose a provider and it's about to be skipped
    // because its stream isn't available (no SSE), surface the gap as a visible
    // provider event before the cascade continues.
    if (explicit && c.label === prefer && !c.stream) {
      explicitProviderFailed = true
      yield { type: 'provider', provider: c.label, model: 'not streamable — falling back to next provider' }
      continue
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
          yield {
            type: 'provider',
            provider: c.label,
            model: `FAILED: ${msg.slice(0, 120)} — falling back to next provider`,
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
      if (explicit && c.label === prefer) {
        explicitProviderFailed = true
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
