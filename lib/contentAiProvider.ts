/**
 * Content-generation AI provider for Content Studio / SEO Factory.
 *
 * Cloudflare Workers AI is PRIMARY for long-form articles and blogs.
 * Other OpenAI-compatible providers (xAI, custom, OpenAI, DeepSeek) are
 * fallbacks only — chat/gigs still use lib/chatProvider.ts separately.
 *
 * Auth (any one of these tokens, preferred order):
 *   CLOUDFLARE_AI_TOKEN           — scoped Workers AI token (recommended)
 *   CLOUDFLARE_WORKERS_AI_TOKEN   — alias
 *   CLOUDFLARE_API_TOKEN          — account API token with Workers AI Read
 *
 * Plus: CLOUDFLARE_ACCOUNT_ID (e.g. 48f2c5185be44e14fea1df7d0591932a)
 *
 * REST (OpenAI-compatible, preferred):
 *   POST /client/v4/accounts/{account_id}/ai/v1/chat/completions
 * Legacy run endpoint fallback:
 *   POST /client/v4/accounts/{account_id}/ai/run/{model}
 */

const CF_AI_MODEL =
  process.env.CLOUDFLARE_AI_MODEL?.trim() ||
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast'

const DEFAULT_MAX_TOKENS = 5000
const DEFAULT_TEMPERATURE = 0.65

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

async function openAiCompatibleComplete(
  p: OpenAiCompat,
  opts: ContentAiOptions,
): Promise<ContentAiResult> {
  const url = p.baseURL.replace(/\/$/, '') + '/chat/completions'
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${p.apiKey}`,
    },
    body: JSON.stringify({
      model: p.model,
      temperature: opts.temperature ?? DEFAULT_TEMPERATURE,
      max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.prompt },
      ],
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`${p.label} ${res.status}: ${body.slice(0, 400)}`)
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const text = json.choices?.[0]?.message?.content
  if (!text?.trim()) throw new Error(`${p.label} returned empty content`)
  return { text: text.trim(), provider: p.label, model: p.model }
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
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${p.apiKey}`,
    },
    body: JSON.stringify({
      model: p.model,
      stream: true,
      temperature: opts.temperature ?? DEFAULT_TEMPERATURE,
      max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.prompt },
      ],
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

function listFallbackProviders(): OpenAiCompat[] {
  const out: OpenAiCompat[] = []

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
  if (env('GROQ_API_KEY')) {
    out.push({
      label: 'groq',
      baseURL: 'https://api.groq.com/openai/v1',
      apiKey: env('GROQ_API_KEY'),
      model: env('GROQ_MODEL') || 'llama-3.3-70b-versatile',
    })
  }

  return out
}

/** True when CF Workers AI credentials are present. */
export function isCloudflareAiConfigured(): boolean {
  return resolveCloudflareAiAuth() !== null
}

function preferProvider(): string {
  return (env('CONTENT_AI_PROVIDER') || env('AI_PROVIDER') || 'cloudflare').toLowerCase()
}

function tryCloudflareFirst(prefer: string): boolean {
  return (
    prefer === 'cloudflare' ||
    prefer === 'cloudflare-ai' ||
    prefer === 'workers-ai' ||
    !prefer ||
    prefer === 'auto'
  )
}

/**
 * Generate long-form content. Cloudflare AI first, then OpenAI-compatible fallbacks.
 * Surfaces the last error if every provider fails.
 */
export async function generateContentText(opts: ContentAiOptions): Promise<ContentAiResult> {
  const prefer = preferProvider()
  const errors: string[] = []
  const tryCfFirst = tryCloudflareFirst(prefer)

  if (tryCfFirst && isCloudflareAiConfigured()) {
    try {
      return await cloudflareAiComplete(opts)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
  }

  if (!tryCfFirst) {
    const fallbacks = listFallbackProviders()
    const preferred = fallbacks.find((p) => {
      if (prefer === 'xai' || prefer === 'grok') return p.label === 'grok'
      return p.label === prefer
    })
    if (preferred) {
      try {
        return await openAiCompatibleComplete(preferred, opts)
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    }
  }

  for (const p of listFallbackProviders()) {
    try {
      return await openAiCompatibleComplete(p, opts)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
  }

  if (!tryCfFirst && isCloudflareAiConfigured()) {
    try {
      return await cloudflareAiComplete(opts)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
  }

  throw new Error(
    errors.length
      ? `All content AI providers failed. ${errors.map((e) => e.slice(0, 180)).join(' | ')}`
      : 'No content AI provider configured. Set CLOUDFLARE_ACCOUNT_ID + (CLOUDFLARE_AI_TOKEN or CLOUDFLARE_API_TOKEN with Workers AI Read).',
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
  const tryCfFirst = tryCloudflareFirst(prefer)
  const errors: string[] = []

  type Candidate = {
    label: string
    stream: () => AsyncGenerator<ContentAiStreamEvent>
    complete: () => Promise<ContentAiResult>
  }

  const candidates: Candidate[] = []
  if (isCloudflareAiConfigured()) {
    candidates.push({
      label: 'cloudflare-ai',
      stream: () => cloudflareAiStream(opts),
      complete: () => cloudflareAiComplete(opts),
    })
  }
  for (const p of listFallbackProviders()) {
    candidates.push({
      label: p.label,
      stream: () => openAiCompatibleStream(p, opts),
      complete: () => openAiCompatibleComplete(p, opts),
    })
  }

  // Reorder if a non-CF provider is preferred
  if (!tryCfFirst && candidates.length > 1) {
    const idx = candidates.findIndex((c) => {
      if (prefer === 'xai' || prefer === 'grok') return c.label === 'grok'
      return c.label === prefer
    })
    if (idx > 0) {
      const [pref] = candidates.splice(idx, 1)
      candidates.unshift(pref)
    }
  }

  for (const c of candidates) {
    try {
      yield* c.stream()
      return
    } catch (e) {
      errors.push(`${c.label} stream: ${e instanceof Error ? e.message : String(e)}`)
      try {
        yield* completeAsStream(c.complete)
        return
      } catch (e2) {
        errors.push(`${c.label}: ${e2 instanceof Error ? e2.message : String(e2)}`)
      }
    }
  }

  throw new Error(
    errors.length
      ? `All content AI stream providers failed. ${errors.map((e) => e.slice(0, 180)).join(' | ')}`
      : 'No content AI provider configured for streaming.',
  )
}
