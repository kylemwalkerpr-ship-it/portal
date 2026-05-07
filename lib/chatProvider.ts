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

export interface ChatProvider {
  name: string
  reply: (system: string, history: ChatTurn[]) => Promise<string>
}

const GROQ_MODEL = 'llama-3.3-70b-versatile'
const GEMINI_MODEL = 'gemini-2.5-flash'

function buildGroq(apiKey: string): ChatProvider {
  return {
    name: 'groq',
    async reply(system, history) {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          temperature: 0.4,
          max_tokens: 600,
          messages: [
            { role: 'system', content: system },
            ...history.map(t => ({ role: t.role, content: t.content })),
          ],
        }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Groq ${res.status}: ${text.slice(0, 300)}`)
      }
      const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
      const reply = data.choices?.[0]?.message?.content?.trim()
      if (!reply) throw new Error('Groq returned an empty reply')
      return reply
    },
  }
}

function buildGemini(apiKey: string): ChatProvider {
  return {
    name: 'gemini',
    async reply(system, history) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`
      const contents = history.map(t => ({
        role: t.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: t.content }],
      }))
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents,
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 600,
          },
        }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Gemini ${res.status}: ${text.slice(0, 300)}`)
      }
      const data = await res.json() as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
      }
      const reply = data.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('').trim()
      if (!reply) throw new Error('Gemini returned an empty reply')
      return reply
    },
  }
}

export function getChatProvider(): ChatProvider | null {
  const groq = process.env.GROQ_API_KEY
  if (groq) return buildGroq(groq)
  const gemini = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY
  if (gemini) return buildGemini(gemini)
  return null
}
