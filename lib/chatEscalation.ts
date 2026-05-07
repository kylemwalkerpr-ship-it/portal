/**
 * Live-agent escalation helpers for Yara.
 *
 * When a user wants to talk to a real person (or types something that signals
 * they need one), Yara hands off to the support-saas chat queue at
 * support.yousafeconsultancy.com. From that point the support team handles
 * the conversation in their dashboard, and the widget polls support-saas
 * directly for new messages.
 */

export const SUPPORT_WIDGET_API =
  process.env.SUPPORT_WIDGET_URL?.trim() ||
  'https://support.yousafeconsultancy.com/api/chat/widget'

const ESCALATION_KEYWORDS = [
  'live agent',
  'real person',
  'real human',
  'speak to someone',
  'speak to a person',
  'speak to support',
  'talk to someone',
  'talk to a person',
  'talk to a human',
  'talk to support',
  'support agent',
  'support staff',
  'human support',
  'human agent',
  'representative',
  'connect me with',
  'i need a human',
  'i want a human',
  'i need to speak to',
]

export function shouldEscalateToLiveAgent(text: string): boolean {
  const lower = String(text || '').toLowerCase()
  return ESCALATION_KEYWORDS.some(k => lower.includes(k))
}

export type SupportVisitor = {
  name?: string | null
  email?: string | null
  phone?: string | null
}

export type SupportHandoffResult = {
  conversationId: string | null
  status: string | null
  queue: { position: number; estimatedWaitMinutes: number } | null
  apiUrl: string
}

/**
 * Create or continue a live-support conversation in the support-saas.
 * Returns the conversation id + queue info so the widget can keep polling
 * the support backend directly.
 */
export async function escalateToSupport(opts: {
  message: string
  visitor: SupportVisitor | null
  topic?: string
  conversationId?: string | null
}): Promise<SupportHandoffResult> {
  const res = await fetch(SUPPORT_WIDGET_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: opts.message,
      visitor: opts.visitor || undefined,
      topic: opts.topic || 'portal',
      requestAgent: true,
      conversationId: opts.conversationId || undefined,
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Support widget responded ${res.status}: ${text.slice(0, 200)}`)
  }
  const data = await res.json() as {
    conversation?: { id?: string; status?: string }
    queue?: { position: number; estimatedWaitMinutes: number }
  }
  return {
    conversationId: data.conversation?.id ?? null,
    status: data.conversation?.status ?? null,
    queue: data.queue ?? null,
    apiUrl: SUPPORT_WIDGET_API,
  }
}
