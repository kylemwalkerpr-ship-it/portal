/**
 * Live-agent escalation helpers for the system-wide YouSafe AI Assistant.
 *
 * When a user wants to talk to a real person, the assistant hands off to the
 * support-saas chat queue at support.yousafeconsultancy.com. From that point
 * the support team handles the conversation in their dashboard, and the
 * widget polls support-saas directly for new messages.
 */

export const SUPPORT_WIDGET_API =
  process.env.SUPPORT_WIDGET_URL?.trim() ||
  'https://support.yousafeconsultancy.com/api/chat/widget'

const EXPLICIT_ESCALATION_PATTERNS = [
  /\b(?:live|human|support)\s+(?:agent|representative|staff|person)\b/i,
  /\b(?:real\s+person|real\s+human|human\s+support|live\s+support)\b/i,
  /\b(?:speak|talk|chat)\s+(?:to|with)\s+(?:a\s+)?(?:human|person|someone|support|representative|agent)\b/i,
  /\bconnect\s+me\s+(?:to|with)\s+(?:a\s+)?(?:human|person|someone|support|representative|agent)\b/i,
  /\bi\s+(?:need|want|would\s+like)\s+(?:a\s+)?(?:human|person|support\s+agent|human\s+agent|representative)\b/i,
  /\bi\s+(?:need|want|would\s+like)\s+to\s+(?:speak|talk|chat)\s+(?:to|with)\s+(?:a\s+)?(?:human|person|someone|support|representative|agent)\b/i,
]

export function shouldEscalateToLiveAgent(text: string): boolean {
  const value = String(text || '').trim()
  return EXPLICIT_ESCALATION_PATTERNS.some((pattern) => pattern.test(value))
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
  /**
   * Per-conversation secret issued by support-saas when it creates the
   * conversation. The visitor's browser must send it as `X-Chat-Token` to read
   * (poll) or continue that conversation; support-saas rejects requests
   * without it. Null when the call continued an existing conversation.
   */
  visitorToken: string | null
}

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
    visitorToken?: string
  }
  return {
    conversationId: data.conversation?.id ?? null,
    status: data.conversation?.status ?? null,
    queue: data.queue ?? null,
    apiUrl: SUPPORT_WIDGET_API,
    visitorToken: typeof data.visitorToken === 'string' ? data.visitorToken : null,
  }
}
