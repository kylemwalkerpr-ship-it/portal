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

function asksServicesOverview(text: string): boolean {
  const q = normalize(text).replace(/[?.!]+$/g, '')
  const specificMatter = /\b(visa|immigration|study permit|student visa|f-?1|pgwp|work permit|sponsorship|green card|permanent residence|citizenship|admission|university|college|essay|sop|credential|resume|cv|job search|housing|tenant|legal|lawyer|attorney|canada|australia|united kingdom|uk|united states|usa|price|pricing|cost|package)\b/.test(q)
  if (specificMatter) return false
  return (
    /^(what|which) services? (do you|does yousafe|does this company) (sell|offer|provide|have)$/.test(q) ||
    /^(what|which) (do you|does yousafe) (sell|offer|provide)$/.test(q) ||
    /^(tell me|show me) (about )?(your|yousafe'?s) services?$/.test(q) ||
    /^(what are|list) (your|yousafe'?s|the) services?$/.test(q)
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

  if (asksServicesOverview(last)) {
    return [
      'YouSafe offers services through **verified attorneys and credentialed consultants** across these Marketplace areas:',
      '',
      '- **Immigration Services** — study permits, work permits, permanent-residence pathways, family sponsorship, visitor visas, and citizenship support.',
      '- **Education & Admissions** — university and graduate admissions, scholarships, test preparation, and academic mentoring.',
      '- **Academic Writing & Application Support** — application essays, statements of purpose, scholarship essays, research writing, proofreading, and editing.',
      '- **Legal Services** — document preparation, attorney review, legal consultations, business formation, and compliance work handled by appropriately licensed professionals where required.',
      '- **Settlement & Integration** — housing, banking, healthcare navigation, daily-life setup, and cultural integration.',
      '- **Career Development** — resumes/CVs, LinkedIn, job-search help, interview preparation, career coaching, and internship support.',
      '- **Business Services** — consulting, marketing/branding, finance/accounting, grant writing, and tax advisory.',
      '- **Credentials & Assessment** — foreign credential assessment, licensing/certification, and education verification.',
      '- **Mentorship & Coaching** — student mentorship, professional coaching, and ongoing guidance.',
      '',
      'Browse current listings and providers in the [YouSafe Marketplace](https://market.yousafeconsultancy.com/). If you tell me **what you need help with and which country it concerns**, I can point you to the most relevant category.',
    ].join('\n')
  }

  return null
}

export const assistantFastReplyInternals = { isGreeting, asksCompanyOverview, asksServicesOverview }
