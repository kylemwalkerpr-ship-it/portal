import type { PricingAuthority } from '@/lib/messengerPricingAuthority'
import type { YqaaConversationMemory } from '@/lib/messengerConversationMemory'

export type OfferIntakeAssessment = {
  status: 'ready' | 'needs_clarification'
  missing: Array<'budget' | 'scope' | 'market' | 'deliverable' | 'timing' | 'starting_point'>
  market: string | null
  deliverable: string | null
  timing: string | null
  startingPoint: string | null
  scopeLabel: string | null
  clientPrompt: string
  summary: string
}

const MARKET_SENSITIVE = new Set(['immigration', 'education', 'legal', 'settlement', 'credentials'])
const DELIVERABLE = /\b(strategy|consultation|eligibility|assessment|review|audit|checklist|roadmap|filing map|document prep|document preparation|application prep|application preparation|application review|full application|end[- ]to[- ]end|sop|statement of purpose|essay|draft|drafting|edit|editing|proofread|forms?|petition|brief|appeal|refusal|resume|cv|linkedin|job search|housing|settlement plan|credential assessment|wes|eca|mentoring|coaching)\b/i
const TIMING = /\b(asap|urgent|urgently|today|tomorrow|this week|next week|this month|next month|no rush|flexible(?: timing)?|within\s+\d+\s*(?:day|days|week|weeks|month|months)|by\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|\w+\s+\d{1,2}|the\s+end\s+of\s+\w+)|deadline|due\s+(?:on|by|in))\b/i
const STARTING_POINT = /\b(not started|haven't started|have not started|starting from scratch|already started|already applied|submitted|filed|refused|refusal|rejected|approved|accepted|admitted|have my|i have|documents?|passport|transcript|offer letter|admission letter|i-20|cas|coe|bank statement|resume|cv|draft|application is|case is|current status)\b/i

function clean(value: unknown, max = 320) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''
}

function latestMatching(texts: string[], pattern: RegExp) {
  for (let i = texts.length - 1; i >= 0; i--) {
    const text = texts[i]
    if (pattern.test(text)) return clean(text, 260)
  }
  return null
}

function buildPrompt(missing: OfferIntakeAssessment['missing'], currency: string) {
  if (missing.includes('budget')) {
    return `Before I build the offer, what budget range are you working with in ${currency.toUpperCase()}? A rough number is fine. 🙂`
  }

  const questions: string[] = []
  if (missing.includes('deliverable')) {
    questions.push('what exactly would you like the specialist to handle — for example strategy only, document/application review, or end-to-end preparation')
  }
  if (missing.includes('market')) {
    questions.push('which country or jurisdiction this is for')
  }
  if (missing.includes('timing')) {
    questions.push('when you would ideally like the work completed')
  }
  if (missing.includes('starting_point')) {
    questions.push('where you are right now — not started yet, already preparing documents, or already submitted/refused')
  }
  if (missing.includes('scope')) {
    questions.push('the exact service you want help with')
  }

  if (!questions.length) return 'I have enough detail to price this safely.'
  const first = questions[0]
  const rest = questions.slice(1, 3)
  const joined = rest.length ? `${first}; and ${rest.join('; and ')}` : first
  return `I can put the offer together — I just need ${joined}. A short answer is enough. 🙂`
}

/**
 * Deterministic pre-offer intake gate. The model may ask questions naturally,
 * but it cannot send a financially actionable offer until this server-side
 * assessment says the scope is sufficiently concrete.
 */
export function buildOfferIntakeAssessment(args: {
  messages: any[]
  clientId: string
  pricing: PricingAuthority
  memory: YqaaConversationMemory
}): OfferIntakeAssessment {
  const clientTexts = (args.messages || [])
    .filter((m: any) => m?.sender_id === args.clientId && m?.body && !m?.metadata?.ai_generated)
    .map((m: any) => clean(m.body, 600))
    .filter(Boolean)

  const market = args.memory.markets?.[args.memory.markets.length - 1] || null
  const deliverable = latestMatching(clientTexts, DELIVERABLE)
  const timing = args.memory.deadline_highlights?.[args.memory.deadline_highlights.length - 1]
    || latestMatching(clientTexts, TIMING)
  const startingPoint = args.memory.document_highlights?.[args.memory.document_highlights.length - 1]
    || latestMatching(clientTexts, STARTING_POINT)
  const scopeLabel = args.pricing.intent
    ? args.pricing.intent.subcategoryName || args.pricing.intent.categoryName
    : null

  const missing: OfferIntakeAssessment['missing'] = []
  if (!args.pricing.budget) missing.push('budget')
  if (!args.pricing.intent || args.pricing.intent.confidence !== 'high') missing.push('scope')
  if (args.pricing.intent && MARKET_SENSITIVE.has(args.pricing.intent.categoryId) && !market) missing.push('market')
  if (!deliverable) missing.push('deliverable')
  if (!timing) missing.push('timing')
  if (args.pricing.intent && MARKET_SENSITIVE.has(args.pricing.intent.categoryId) && !startingPoint) missing.push('starting_point')

  const summaryParts = [
    scopeLabel ? `Service: ${scopeLabel}` : null,
    market ? `Market: ${market}` : null,
    deliverable ? `Requested work: ${deliverable}` : null,
    timing ? `Timing: ${timing}` : null,
    startingPoint ? `Starting point: ${startingPoint}` : null,
    args.pricing.budget ? `Budget: ${args.pricing.budget.currency.toUpperCase()} ${(args.pricing.budget.maxCents / 100).toFixed(0)}` : null,
  ].filter((v): v is string => Boolean(v))

  return {
    status: missing.length ? 'needs_clarification' : 'ready',
    missing,
    market,
    deliverable,
    timing,
    startingPoint,
    scopeLabel,
    clientPrompt: buildPrompt(missing, args.pricing.currency),
    summary: summaryParts.join('\n').slice(0, 900),
  }
}

export function renderOfferIntakeAuthority(intake: OfferIntakeAssessment) {
  return [
    '# YQAA ORDER INTAKE — SERVER-CALCULATED, NON-NEGOTIABLE',
    `Status: ${intake.status}`,
    intake.missing.length ? `Missing before an offer may be sent: ${intake.missing.join(', ')}` : 'Missing before an offer may be sent: none',
    intake.summary || 'No grounded intake summary yet.',
    '',
    'INTAKE RULES:',
    '- If status=needs_clarification, keep offer=null and ask only the missing high-value details conversationally.',
    '- Do not invent answers for missing intake fields from provider/gig descriptions. The client must supply or clearly confirm them.',
    '- Do not turn the chat into a long questionnaire. Ask one compact question that can capture up to two or three related details.',
    '- If status=ready, the structured summary above is the factual scope baseline for the offer description.',
  ].join('\n')
}
