/**
 * Tiny abstraction over the free AI providers we use for the gig-
 * draft + support-chat AI. Picks whichever is configured at runtime
 * and chains them so a per-day quota exhaustion on one doesn't break
 * the AI surface.
 *
 * Preference order (cheapest / fastest first):
 *   1. Groq            — free tier, Llama-3.3-70b, fastest latency.
 *   2. Google Gemini   — free tier, gemini-2.5-flash, generous quota.
 *   3. Cloudflare Workers AI — runs on the same CF network as the
 *                       Worker; reuses CLOUDFLARE_ACCOUNT_ID +
 *                       CLOUDFLARE_API_TOKEN. 10k Neurons/day free,
 *                       ≈ 2000 Llama-3.3-70b generations. Independent
 *                       quota from Groq + Gemini, so when both hit
 *                       their daily TPD limits this keeps the AI
 *                       surface alive.
 *
 * Configure any subset on Cloudflare:
 *   - GROQ_API_KEY                — primary
 *   - GEMINI_API_KEY              — first fallback
 *   - CLOUDFLARE_ACCOUNT_ID +     — second fallback. No new key — the
 *     CLOUDFLARE_API_TOKEN          existing deploy creds are reused.
 *
 * Chain semantics: each provider gets a 1500ms intra-provider retry
 * on transient 503/429, then falls through to the next provider on
 * persistent failure. When all configured providers fail, the error
 * names all of them so the operator sees the full picture.
 */

export type ChatTurn = { role: 'user' | 'assistant'; content: string }

export interface ChatReplyOptions {
  // Per-call output ceiling. Defaults to 600 (covers titles, pitches,
  // SEO meta, tier features, tier descriptions, requirements, tags).
  // FAQ + long-form description need 1500-2000 because the prompts
  // ask for 8-10 Q+A pairs / 500-700 word prose and 600 tokens chops
  // them off mid-output. Callers know their per-field budget; this
  // option threads it through without bloating defaults.
  maxOutputTokens?: number
}

export interface ChatProvider {
  name: string
  reply: (system: string, history: ChatTurn[], options?: ChatReplyOptions) => Promise<string>
}

const DEFAULT_MAX_TOKENS = 600

const GROQ_MODEL = 'llama-3.3-70b-versatile'
const GEMINI_MODEL = 'gemini-2.5-flash'
// Cloudflare Workers AI model identifier. The `-fp8-fast` variant is
// the FP8-quantized model running on CF's accelerated inference
// stack — same architecture as Groq's hosted Llama 3.3 70b but on
// Cloudflare's network. Costs ~5 Neurons per call; 10k free
// Neurons/day = ~2000 generations.
const CF_AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
// OpenRouter free model. The `:free` suffix flags rows on OpenRouter's
// free tier — these have their own per-day quotas separate from every
// other provider in the chain, so we get genuine extra headroom rather
// than just a fancier paid relay. Llama-3.1-8b is the most predictable
// for instruction-following; Hermes/Mistral come behind it. Cheap to
// swap if quotas shift.
const OPENROUTER_MODEL = 'meta-llama/llama-3.1-8b-instruct:free'

function buildGroq(apiKey: string): ChatProvider {
  const callOnce = async (system: string, history: ChatTurn[], options?: ChatReplyOptions) => {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          temperature: 0.4,
          max_tokens: options?.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
          messages: [
            { role: 'system', content: system },
            ...history.map(t => ({ role: t.role, content: t.content })),
          ],
        }),
      })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      const fp = apiKey
        ? `[len=${apiKey.length} ${apiKey.slice(0, 4)}…${apiKey.slice(-3)}]`
        : '[missing]'
      throw new Error(`Groq ${res.status} ${fp}: ${text.slice(0, 280)}`)
    }
    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
    const reply = data.choices?.[0]?.message?.content?.trim()
    if (!reply) throw new Error('Groq returned an empty reply')
    return reply
  }
  return {
    name: 'groq',
    // Wrap in withRetry so transient 429 rate-limits get a 1.5s
    // backoff retry before the chain falls through to Gemini.
    reply: (system, history, options) => withRetry('groq', () => callOnce(system, history, options)),
  }
}

function buildGemini(apiKey: string): ChatProvider {
  const callOnce = async (system: string, history: ChatTurn[], options?: ChatReplyOptions) => {
    // Send key in the x-goog-api-key header instead of the query
    // string. This is Google's recommended placement (avoids the
    // key appearing in proxy/edge access logs) AND sidesteps any
    // URL-encoding edge cases that have caused INVALID_ARGUMENT
    // on Cloudflare workers when the value contained whitespace.
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`
    const contents = history.map(t => ({
      role: t.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: t.content }],
    }))
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents,
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: options?.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
        },
      }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      // Include a fingerprint of the key (length + prefix + suffix
      // only — never the full value) so config drift is visible
      // from the error surface without leaking the secret.
      const fp = apiKey
        ? `[len=${apiKey.length} ${apiKey.slice(0, 4)}…${apiKey.slice(-3)}]`
        : '[missing]'
      throw new Error(`Gemini ${res.status} ${fp}: ${text.slice(0, 280)}`)
    }
    const data = await res.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    const reply = data.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('').trim()
    if (!reply) throw new Error('Gemini returned an empty reply')
    return reply
  }
  return {
    name: 'gemini',
    // Wrap in withRetry so Gemini's "model overloaded" 503 (the
    // UNAVAILABLE status) gets a 1.5s backoff retry before the chain
    // falls through to Groq. Google's own docs say to retry on
    // UNAVAILABLE — this implements that recommendation.
    reply: (system, history, options) => withRetry('gemini', () => callOnce(system, history, options)),
  }
}

// Cloudflare Workers AI — third provider, independent quota from
// Groq + Gemini. Uses the REST AI endpoint with the existing
// CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN secrets (the same
// creds CI already uses for `wrangler deploy`), so adding this
// provider requires ZERO new key provisioning. Free tier is 10k
// Neurons/day; a Llama-3.3-70b call costs ~5 Neurons so the daily
// ceiling is ~2000 generations.
function buildCloudflareAI(accountId: string, apiToken: string): ChatProvider {
  const callOnce = async (system: string, history: ChatTurn[], options?: ChatReplyOptions) => {
    // Cloudflare Workers AI exposes an OpenAI-compatible chat endpoint
    // when you POST to /run/{model} with a `messages` array. The
    // response shape differs slightly from OpenAI — the reply lives
    // at result.response — so we unpack that here.
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${CF_AI_MODEL}`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: system },
          ...history.map(t => ({ role: t.role, content: t.content })),
        ],
        temperature: 0.4,
        max_tokens: options?.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
      }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      const fp = apiToken
        ? `[len=${apiToken.length} ${apiToken.slice(0, 4)}…${apiToken.slice(-3)}]`
        : '[missing]'
      throw new Error(`Cloudflare-AI ${res.status} ${fp}: ${text.slice(0, 280)}`)
    }
    const data = await res.json() as {
      success?: boolean
      result?: { response?: string }
      errors?: Array<{ message: string }>
    }
    if (!data.success) {
      const errs = (data.errors || []).map(e => e.message).join(' | ').slice(0, 280)
      throw new Error(`Cloudflare-AI returned success=false: ${errs || 'no detail'}`)
    }
    const reply = data.result?.response?.trim()
    if (!reply) throw new Error('Cloudflare-AI returned an empty reply')
    return reply
  }
  return {
    name: 'cloudflare-ai',
    reply: (system, history, options) => withRetry('cloudflare-ai', () => callOnce(system, history, options)),
  }
}

// OpenRouter — fourth provider, independent quota again. OpenRouter's
// :free models have separate per-day caps from Groq/Gemini/Cloudflare,
// so this is genuine extra headroom rather than a paid relay onto the
// same upstream. Requires a single OPENROUTER_API_KEY. The API speaks
// OpenAI shape, so the call site mirrors buildGroq.
function buildOpenRouter(apiKey: string): ChatProvider {
  const callOnce = async (system: string, history: ChatTurn[], options?: ChatReplyOptions) => {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // OpenRouter asks attribution headers on the free tier so they
        // can rate-limit fairly. These are best-effort and harmless.
        'HTTP-Referer': 'https://portal.yousafeconsultancy.com',
        'X-Title': 'YouSafe Portal',
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        temperature: 0.4,
        max_tokens: options?.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
        messages: [
          { role: 'system', content: system },
          ...history.map(t => ({ role: t.role, content: t.content })),
        ],
      }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      const fp = apiKey
        ? `[len=${apiKey.length} ${apiKey.slice(0, 4)}…${apiKey.slice(-3)}]`
        : '[missing]'
      throw new Error(`OpenRouter ${res.status} ${fp}: ${text.slice(0, 280)}`)
    }
    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
    const reply = data.choices?.[0]?.message?.content?.trim()
    if (!reply) throw new Error('OpenRouter returned an empty reply')
    return reply
  }
  return {
    name: 'openrouter',
    reply: (system, history, options) => withRetry('openrouter', () => callOnce(system, history, options)),
  }
}

// Retry pattern shared by both adapters. Gemini's "model overloaded"
// (503 UNAVAILABLE) and Groq's 429 rate-limits both typically clear
// in 1-3 seconds — Google's docs explicitly say to retry on
// UNAVAILABLE. Doing this INSIDE each provider before chain() falls
// through means a temporary spike on one provider doesn't force a
// wholesale switch to the other (which itself may be under load).
//
// 2 attempts with a 1500ms gap covers the typical spike window
// without inflating user-visible latency too much (worst case ~3.5s).
// Only retries on 503 / 429 — auth errors (401/403) shouldn't be
// retried; they need a config fix.
async function withRetry<T>(name: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const retryable = /\b(503|429)\b|UNAVAILABLE|overload|high.demand|rate.?limit/i.test(msg)
    if (!retryable) throw e
    // eslint-disable-next-line no-console
    console.warn(`[chatProvider] ${name} transient error (${msg.slice(0, 140)}); retrying in 1500ms`)
    await new Promise((r) => setTimeout(r, 1500))
    return fn()
  }
}

// Build a chained provider that tries each adapter in order. If the
// first one fails (after its own internal retry) with an auth /
// quota / 5xx error, fall through to the next. When BOTH providers
// fail, the surfaced error names both — without that, users see
// "Gemini 503" and don't know Groq also failed (Groq's failure was
// only logged to the worker tail), wasting time chasing the wrong
// provider for a config fix.
function chain(primary: ChatProvider, fallback: ChatProvider): ChatProvider {
  return {
    name: `${primary.name}+${fallback.name}`,
    async reply(system, history, options) {
      let primaryErr: Error | null = null
      try {
        return await primary.reply(system, history, options)
      } catch (e) {
        primaryErr = e instanceof Error ? e : new Error(String(e))
        const msg = primaryErr.message
        // Retry on auth, quota, rate-limit, or transient server errors.
        // Anything else (malformed payload, content filter) is a real
        // failure — re-throw so the caller can surface it without
        // burning the fallback's quota on a guaranteed-bad request.
        const retryable = /\b(401|403|429|5\d\d)\b|invalid[_ ]api[_ ]key|quota|rate.?limit/i.test(msg)
        if (!retryable) throw e
        // eslint-disable-next-line no-console
        console.warn(`[chatProvider] ${primary.name} failed (${msg.slice(0, 160)}); falling back to ${fallback.name}`)
      }
      try {
        return await fallback.reply(system, history, options)
      } catch (e) {
        const fallbackMsg = e instanceof Error ? e.message : String(e)
        const primaryMsg = primaryErr ? primaryErr.message : '(no primary error)'
        // Both providers exhausted — surface BOTH failures so the
        // operator can see whether one is a config bug and the other
        // is just an outage, vs both being misconfigured. Pre-fix the
        // user saw only "Gemini 503" and didn't know Groq also failed.
        throw new Error(
          `Both AI providers failed. ${primary.name}: ${primaryMsg.slice(0, 200)} | ${fallback.name}: ${fallbackMsg.slice(0, 200)}`,
        )
      }
    },
  }
}

export function getChatProvider(): ChatProvider | null {
  // Trim before use — secrets piped through CI sometimes pick up a
  // trailing newline that survives all the way to the worker, and
  // encodeURIComponent() on that newline turns into %0A in the
  // request URL, which Google's Generative Language API rejects with
  // API_KEY_INVALID. Same applies to Groq's Authorization header.
  const groqKey = (process.env.GROQ_API_KEY || '').trim()
  const geminiKey = ((process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY) || '').trim()
  const cfAccountId = (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim()
  // CLOUDFLARE_AI_TOKEN is a SCOPED token with only Workers AI : Read
  // permission. CLOUDFLARE_API_TOKEN (the deploy token) does NOT have
  // Workers AI scope and returns 401 "Authentication error" code 10000
  // when used against the AI REST endpoint. We prefer the scoped token
  // and fall back to the deploy token only if it's explicitly opted
  // into via the scoped slot (so a misconfigured deploy token doesn't
  // silently break the AI chain).
  const cfAiToken = (
    process.env.CLOUDFLARE_AI_TOKEN ||
    process.env.CLOUDFLARE_WORKERS_AI_TOKEN ||
    ''
  ).trim()
  const openRouterKey = (process.env.OPENROUTER_API_KEY || '').trim()
  const groq = groqKey ? buildGroq(groqKey) : null
  const gemini = geminiKey ? buildGemini(geminiKey) : null
  const cloudflare = cfAccountId && cfAiToken ? buildCloudflareAI(cfAccountId, cfAiToken) : null
  const openrouter = openRouterKey ? buildOpenRouter(openRouterKey) : null

  // Build the chain from whichever providers are configured. Order:
  // Groq (fastest) → Gemini (largest free quota) → Cloudflare AI
  // (independent vendor, separate quota) → OpenRouter :free models
  // (separate quotas again). Each chain() hop adds a 1500ms intra-
  // provider retry plus an inter-provider fallback.
  const configured = [groq, gemini, cloudflare, openrouter].filter((p): p is ChatProvider => p !== null)
  if (configured.length === 0) return null
  if (configured.length === 1) return configured[0]
  return configured.reduce((acc, next) => chain(acc, next))
}
