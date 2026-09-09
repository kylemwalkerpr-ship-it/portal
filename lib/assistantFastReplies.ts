import type { SystemAssistantTurn } from '@/lib/superGrokAssistant'

function normalize(text: string): string {
  return String(text || '').toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim()
}

function isGreeting(text: string): boolean {
  return /^(hi|hello|hey|hiya|hi there|hello there|hey there|hi you|good morning|good afternoon|good evening)[!.?\s]*$/.test(normalize(text))
}

function asksCompanyOverview(text: string): boolean {
  const q = normalize(text)
  return (
    /\b(tell me|explain|what is|who is|about)\b.*\b(yousafe|you safe|this company|the company)\b/.test(q) ||
    /\b(yousafe consultancy|you safe consultancy)\b.*\b(company|business|about)\b/.test(q)
  )
}

/**
 * Resolve only facts that are stable, curated and do not need a model turn.
 * If there is an unanswered substantive user message in the current tail,
 * a later "hi" must not mask it — the request continues to the grounded AI.
 */
export function getDeterministicYqaaReply(turns: SystemAssistantTurn[]): string | null {
  if (!turns.length) return null
  let lastAssistant = -1
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    if (turns[i].role === 'assistant') {
      lastAssistant = i
      break
    }
  }
  const pendingUsers = turns.slice(lastAssistant + 1).filter((turn) => turn.role === 'user')
  if (!pendingUsers.length) return null

  const last = pendingUsers[pendingUsers.length - 1].content
  const earlierSubstantive = pendingUsers.slice(0, -1).some((turn) => !isGreeting(turn.content))

  if (isGreeting(last) && !earlierSubstantive) {
    return "Hi — I'm **YQAA**, the **YouSafe Quick Assistance Agent**. I'm ready to help with YouSafe services, Marketplace options, orders, documents, billing, or general study and immigration planning. What can I help you with?"
  }

  if (pendingUsers.some((turn) => asksCompanyOverview(turn.content))) {
    return [
      '**YouSafe Consultancy** is a cross-border education, immigration-support, and professional-services platform serving clients across the **United States, United Kingdom, Canada, and Australia**.',
      '',
      'Through YouSafe, clients can explore services, message professionals, exchange documents, receive custom offers, place orders, and use platform-managed payment/escrow workflows. Legal advice or representation is handled by appropriately licensed professionals rather than YQAA or the consultancy itself.',
      '',
      'You can start at [YouSafe Consultancy](https://yousafeconsultancy.com) or browse relevant services in the [YouSafe Marketplace](https://market.yousafeconsultancy.com).',
    ].join('\n')
  }

  return null
}

export const assistantFastReplyInternals = { isGreeting, asksCompanyOverview }
