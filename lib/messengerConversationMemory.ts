import type { BudgetEvidence, PricingAuthority } from '@/lib/messengerPricingAuthority'
import { buildOfferIntakeAssessment, type OfferIntakeAssessment } from '@/lib/messengerOfferIntake'

export type YqaaConversationMemory = {
  version: 1
  updated_at: string
  budget: BudgetEvidence | null
  markets: string[]
  marketplace_scope: {
    category_id: string
    category_name: string
    subcategory_id: string | null
    subcategory_name: string | null
  } | null
  client_highlights: string[]
  deadline_highlights: string[]
  document_highlights: string[]
  latest_goal: string | null
  offer_intake?: {
    status: OfferIntakeAssessment['status']
    missing: OfferIntakeAssessment['missing']
    summary: string
  } | null
  last_offer: {
    offer_id: string
    title: string
    price_cents: number
    currency: string
    created_at: string
  } | null
}

const MARKET_PATTERNS: Array<[string, RegExp]> = [
  ['United States', /\b(united states|usa|u\.?s\.?|america|american|f-?1|opt|cpt|h-?1b|uscis)\b/i],
  ['Canada', /\b(canada|canadian|ircc|study permit|pgwp|express entry|pnp|lmia)\b/i],
  ['United Kingdom', /\b(united kingdom|uk|britain|british|student route|graduate route|ukvi|ilr)\b/i],
  ['Australia', /\b(australia|australian|subclass\s*500|subclass\s*485|temporary graduate|genuine student|coe|oshc)\b/i],
]

const HIGH_VALUE = /\b(budget|price|quote|offer|order|need|want|looking for|help with|apply|application|visa|permit|immigration|admission|school|university|legal|lawyer|attorney|resume|cv|sop|essay|housing|settlement|family|sponsor|deadline|urgent|document|passport|transcript|refusal|appeal)\b/i
const DEADLINE = /\b(deadline|due|urgent|urgently|asap|appointment|interview|hearing|filing|by\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|next\s+week|next\s+month|\w+\s+\d{1,2}))\b/i
const DOCUMENT = /\b(document|documents|passport|transcript|i-?20|cas|coe|oshc|letter|statement|sop|resume|cv|certificate|degree|bank statement|evidence|form|application)\b/i

function clean(value: unknown, max = 320) {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, max)
    : ''
}

function uniqueLatest(values: string[], max = 10) {
  const seen = new Set<string>()
  const out: string[] = []
  for (let i = values.length - 1; i >= 0; i--) {
    const value = clean(values[i])
    if (!value) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.unshift(value)
    if (out.length >= max) break
  }
  return out
}

function existingMemory(metadata: any): Partial<YqaaConversationMemory> {
  const raw = metadata && typeof metadata === 'object' ? metadata.ai_memory : null
  if (!raw || typeof raw !== 'object') return {}
  return raw as Partial<YqaaConversationMemory>
}

/**
 * Grounded memory only: we persist client-authored text highlights and values
 * that were deterministically parsed from the thread. No model-generated
 * summary is allowed to become a fact source.
 *
 * This function also runs the deterministic pre-offer intake gate. Because the
 * same mutable PricingAuthority instance is later consumed by the model prompt
 * and by guardMessengerOffer(), an incomplete scope is downgraded to
 * `insufficient_scope` here. That makes clarification a server-enforced rule on
 * every Messenger surface, not merely a prompt suggestion.
 */
export function buildGroundedConversationMemory(args: {
  messages: any[]
  clientId: string
  pricing: PricingAuthority
  metadata?: any
}): YqaaConversationMemory {
  const prior = existingMemory(args.metadata)
  const clientRows = (args.messages || []).filter((m: any) => m?.sender_id === args.clientId && m?.body)
  const clientTexts = clientRows.map((m: any) => clean(m.body, 500)).filter(Boolean)

  const markets = new Set<string>(Array.isArray(prior.markets) ? prior.markets : [])
  for (const text of clientTexts) {
    for (const [name, pattern] of MARKET_PATTERNS) {
      if (pattern.test(text)) markets.add(name)
    }
  }

  const priorHighlights = Array.isArray(prior.client_highlights) ? prior.client_highlights : []
  const priorDeadlines = Array.isArray(prior.deadline_highlights) ? prior.deadline_highlights : []
  const priorDocs = Array.isArray(prior.document_highlights) ? prior.document_highlights : []

  const newHighlights = clientTexts.filter((text) => HIGH_VALUE.test(text))
  const newDeadlines = clientTexts.filter((text) => DEADLINE.test(text))
  const newDocs = clientTexts.filter((text) => DOCUMENT.test(text))

  const memory: YqaaConversationMemory = {
    version: 1,
    updated_at: new Date().toISOString(),
    budget: args.pricing.budget || (prior.budget as BudgetEvidence | null) || null,
    markets: Array.from(markets),
    marketplace_scope: args.pricing.intent ? {
      category_id: args.pricing.intent.categoryId,
      category_name: args.pricing.intent.categoryName,
      subcategory_id: args.pricing.intent.subcategoryId,
      subcategory_name: args.pricing.intent.subcategoryName,
    } : (prior.marketplace_scope || null),
    client_highlights: uniqueLatest([...priorHighlights, ...newHighlights], 12),
    deadline_highlights: uniqueLatest([...priorDeadlines, ...newDeadlines], 6),
    document_highlights: uniqueLatest([...priorDocs, ...newDocs], 8),
    latest_goal: clean(clientTexts[clientTexts.length - 1] || prior.latest_goal || '', 500) || null,
    offer_intake: prior.offer_intake || null,
    last_offer: prior.last_offer || null,
  }

  const intake = buildOfferIntakeAssessment({
    messages: args.messages || [],
    clientId: args.clientId,
    pricing: args.pricing,
    memory,
  })
  memory.offer_intake = {
    status: intake.status,
    missing: intake.missing,
    summary: intake.summary,
  }

  const missingBeyondBudget = intake.missing.filter((field) => field !== 'budget')
  if (missingBeyondBudget.length && args.pricing.status !== 'insufficient_market_data') {
    args.pricing.status = 'insufficient_scope'
    args.pricing.rationale.push(
      `Offer intake is incomplete. Client clarification required before an offer: ${missingBeyondBudget.join(', ')}.`,
    )
  }

  return memory
}

export function withOfferInMemory(
  memory: YqaaConversationMemory,
  offer: { id: string; title: string; priceCents: number; currency: string },
): YqaaConversationMemory {
  return {
    ...memory,
    updated_at: new Date().toISOString(),
    last_offer: {
      offer_id: offer.id,
      title: clean(offer.title, 120),
      price_cents: Math.max(0, Math.round(offer.priceCents)),
      currency: String(offer.currency || 'usd').toLowerCase(),
      created_at: new Date().toISOString(),
    },
  }
}

export function renderConversationMemory(memory: YqaaConversationMemory) {
  const lines = [
    '# GROUNDED CONVERSATION MEMORY',
    'This memory contains only client-authored facts/highlights or deterministic values. Use it to stay context-aware and avoid asking for information the client already supplied.',
    memory.markets.length ? `Markets mentioned: ${memory.markets.join(', ')}` : null,
    memory.marketplace_scope ? `Current Marketplace scope: ${memory.marketplace_scope.subcategory_name || memory.marketplace_scope.category_name}` : null,
    memory.budget ? `Known client budget: ${memory.budget.minCents ? `${memory.budget.minCents / 100}–` : ''}${memory.budget.maxCents / 100} ${memory.budget.currency.toUpperCase()}` : 'Known client budget: not yet supplied',
    memory.latest_goal ? `Latest client goal/message: ${memory.latest_goal}` : null,
    memory.offer_intake ? `Order-intake readiness: ${memory.offer_intake.status}` : null,
    memory.offer_intake?.missing?.length ? `Still needed before an offer: ${memory.offer_intake.missing.join(', ')}` : null,
    memory.offer_intake?.summary ? `Grounded order-intake summary:\n${memory.offer_intake.summary}` : null,
    memory.deadline_highlights.length ? `Deadline/urgency statements:\n${memory.deadline_highlights.map((x) => `- ${x}`).join('\n')}` : null,
    memory.document_highlights.length ? `Document statements:\n${memory.document_highlights.map((x) => `- ${x}`).join('\n')}` : null,
    memory.client_highlights.length ? `Important prior client statements:\n${memory.client_highlights.map((x) => `- ${x}`).join('\n')}` : null,
    memory.last_offer ? `Most recent YQAA offer: ${memory.last_offer.title} · ${memory.last_offer.currency.toUpperCase()} ${(memory.last_offer.price_cents / 100).toFixed(2)} · offer ${memory.last_offer.offer_id}` : null,
    '',
    'MEMORY BEHAVIOR:',
    '- Do not ask again for a fact that is already clearly present above unless the client has contradicted or changed it.',
    '- Do not repeat obvious platform explanations or your AI disclosure once already established in the thread unless clarification genuinely requires it.',
    '- Refer back naturally (for example, “with the budget you mentioned…”), but do not mechanically recap the whole conversation.',
    '- If Order-intake readiness is needs_clarification, you MUST keep offer=null and ask only the missing material details naturally. Never infer the missing client facts from a gig description.',
  ].filter((x): x is string => typeof x === 'string')
  return lines.join('\n')
}
