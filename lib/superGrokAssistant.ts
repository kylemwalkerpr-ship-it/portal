import { resolveMessengerGrokAuth } from '@/lib/messengerAi'

export type SystemAssistantTurn = {
  role: 'user' | 'assistant'
  content: string
}

const REQUEST_TIMEOUT_MS = 55_000
const MAX_OUTPUT_TOKENS = 1600

/**
 * System-wide YouSafe assistant transport.
 *
 * This deliberately resolves credentials/model through Messenger's existing
 * SuperGrok path so public-site chat and Messenger cannot silently drift to a
 * different AI provider. There is no Groq/Gemini/OpenAI fallback here.
 */
export async function callSystemSuperGrok(
  system: string,
  turns: SystemAssistantTurn[],
): Promise<{ text: string; model: string; authMode: string }> {
  const auth = await resolveMessengerGrokAuth()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const messages = [
    { role: 'system', content: system },
    ...turns.map((turn) => ({ role: turn.role, content: turn.content })),
  ]

  try {
    const chatRes = await fetch(`${auth.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model: auth.model,
        temperature: 0.35,
        max_tokens: MAX_OUTPUT_TOKENS,
        messages,
      }),
      signal: controller.signal,
    })
    const chatText = await chatRes.text()
    if (chatRes.ok) {
      const json = JSON.parse(chatText) as any
      const content = json?.choices?.[0]?.message?.content || json?.choices?.[0]?.text || ''
      if (String(content).trim()) {
        return { text: String(content).trim(), model: auth.model, authMode: auth.authMode }
      }
    }

    // Same secondary protocol used by Messenger for SuperGrok-compatible
    // endpoints. This is a protocol fallback, not a provider/model fallback.
    const respRes = await fetch(`${auth.baseURL}/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model: auth.model,
        input: messages,
        max_output_tokens: MAX_OUTPUT_TOKENS,
      }),
      signal: controller.signal,
    })
    const respText = await respRes.text()
    if (!respRes.ok) {
      throw new Error(`SuperGrok failed (${chatRes.status}/${respRes.status}): ${respText.slice(0, 240)}`)
    }
    const json = JSON.parse(respText) as any
    const content =
      json?.output_text ||
      (Array.isArray(json?.output)
        ? json.output
            .flatMap((item: any) => item?.content || [])
            .map((item: any) => item?.text || '')
            .join('\n')
        : '') ||
      json?.choices?.[0]?.message?.content ||
      ''
    if (!String(content).trim()) throw new Error('SuperGrok returned empty content')
    return { text: String(content).trim(), model: auth.model, authMode: auth.authMode }
  } finally {
    clearTimeout(timer)
  }
}
