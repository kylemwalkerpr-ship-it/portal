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

const NVIDIA_INTEGRATE_BASE =
  process.env.NVIDIA_BASE_URL?.trim() || 'https://integrate.api.nvidia.com/v1'
const NVIDIA_DEEPSEEK_MODEL =
  process.env.NVIDIA_DEEPSEEK_MODEL?.trim() ||
  process.env.NVIDIA_MODEL?.trim() ||
  'deepseek-ai/deepseek-v4-pro'

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

function env(name: string): string {
  return (process.env[name] || '').trim()
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

/** Transient 429/503 retry — same pattern as gig chatProvider. */
async function withRetry<T>(name: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const retryable = /\b(503|429)\b|UNAVAILABLE|overload|high.demand|rate.?limit/i.test(msg)
    if (!retryable) throw e
    console.warn(`[contentAi] ${name} transient (${msg.slice(0, 120)}); retry 1500ms`)
    await new Promise((r) => setTimeout(r, 1500))
    return fn()
  }
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
    const body: Record<string, unknown> = {
      model: p.model,
      temperature: opts.temperature ?? DEFAULT_TEMPERATURE,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.prompt },
      ],
      ...(p.topP != null ? { top_p: p.topP } : {}),
      ...(p.extraBody || {}),
    }
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      throw new Error(`${p.label} ${res.status}: ${errBody.slice(0, 400)}`)
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: unknown; reasoning_content?: string } }>
    }
    const msg = json.choices?.[0]?.message
    let text = extractMessageText(msg?.content)
    // Some thinking models put draft in reasoning; prefer content, fallback reasoning if empty
    if (!text && msg?.reasoning_content) {
      text = String(msg.reasoning_content).trim()
    }
    if (!text) throw new Error(`${p.label} returned empty content`)
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

export function isNvidiaDeepseekConfigured(): boolean {
  return Boolean(resolveNvidiaApiKey())
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
  for (const model of OPENROUTER_MODELS) {
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
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: p.model,
      stream: true,
      temperature: opts.temperature ?? DEFAULT_TEMPERATURE,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.prompt },
      ],
      ...(p.topP != null ? { top_p: p.topP } : {}),
      ...(p.extraBody || {}),
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`${p.label} stream ${res.status}: ${body.slice(0, 400)}`)
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
    throw new Error(`cloudflare-ai stream ${res.status}: ${body.slice(0, 400)}`)
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
  const fp = `[len=${token.length} ${token.slice(0, 4)}…${token.slice(-3)}]`
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
        throw new Error(`chat/completions success=false: ${errs}`)
      }
      throw new Error('chat/completions empty content')
    }

    const body = await res.text().catch(() => '')
    // Fall through to legacy /run on 404/not found; rethrow hard auth errors
    if (res.status === 401 || res.status === 403) {
      throw new Error(`cloudflare-ai ${res.status} ${fp}: ${body.slice(0, 400)}`)
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
      `cloudflare-ai ${res.status} ${fp}: ${body.slice(0, 300)} (also tried: ${chatErr})`,
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
      model: env('CUSTOM_AI_MODEL') || 'gpt-4o-mini',
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
      model: env('OPENAI_MODEL') || 'gpt-4o-mini',
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
    { id: 'openai', label: 'OpenAI', configured: Boolean(env('OPENAI_API_KEY')), role: 'fallback' },
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
    return 'nvidia-deepseek'
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
    // DEFAULT: DeepSeek primary, Cloudflare first fallback
    pushNvidia()
    pushCf()
  }

  // Fill remaining cascade (deduped below)
  pushNvidia()
  pushCf()
  pushGroq()
  pushGemini()
  pushOpenRouter()
  pushRest()
  pushChatBridge()

  const seen = new Set<string>()
  return items.filter((i) => {
    if (seen.has(i.label)) return false
    seen.add(i.label)
    return true
  })
}

/**
 * Generate long-form content.
 * Default: DeepSeek (NVIDIA) → Cloudflare fallback → other free tiers.
 */
export async function generateContentText(opts: ContentAiOptions): Promise<ContentAiResult> {
  const prefer = preferProvider()
  const errors: string[] = []
  const candidates = orderedCompleters(opts, prefer)

  if (!candidates.length) {
    throw new Error(
      'No content AI provider configured. Set NVIDIA_API_KEY (DeepSeek primary) and/or Cloudflare AI token as fallback.',
    )
  }

  for (const c of candidates) {
    try {
      return await c.run()
    } catch (e) {
      errors.push(`${c.label}: ${e instanceof Error ? e.message : String(e)}`)
      console.warn(`[contentAi] ${c.label} failed; trying next`)
    }
  }

  throw new Error(
    `All content AI providers failed. ${errors.map((e) => e.slice(0, 180)).join(' | ')}. Primary: NVIDIA_API_KEY (DeepSeek). Fallback: Cloudflare Workers AI.`,
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
  const prefer = preferProvider()
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
  const unique = candidates.filter((c) => {
    if (seen.has(c.label)) return false
    seen.add(c.label)
    return true
  })

  for (const c of unique) {
    if (c.stream) {
      try {
        yield* c.stream()
        return
      } catch (e) {
        errors.push(`${c.label} stream: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    try {
      yield* completeAsStream(c.complete)
      return
    } catch (e2) {
      errors.push(`${c.label}: ${e2 instanceof Error ? e2.message : String(e2)}`)
    }
  }

  throw new Error(
    errors.length
      ? `All content AI stream providers failed. ${errors.map((e) => e.slice(0, 180)).join(' | ')}`
      : 'No content AI provider configured for streaming.',
  )
}
