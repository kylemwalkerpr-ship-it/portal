/**
 * Tiny abstraction over the free AI providers we use for the support chat.
 * Picks whichever is configured at runtime and returns a clean reply string.
 *
 * Preference order (cheapest / fastest first):
 *   1. Groq           — free tier, Llama-3.3-70b, very low latency.
 *   2. Google Gemini  — free tier, gemini-2.5-flash, generous quota.
 *
 * Set ONE of GROQ_API_KEY or GEMINI_API_KEY (or both — Groq wins) on
 * Cloudflare. No other config is required.
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
  const groq = groqKey ? buildGroq(groqKey) : null
  const gemini = geminiKey ? buildGemini(geminiKey) : null

  if (groq && gemini) return chain(groq, gemini)
  if (groq) return groq
  if (gemini) return gemini
  return null
}
