import type { BudgetEvidence, PricingAuthority } from '@/lib/messengerPricingAuthority'
import type {
  AdaptivePricingDecision,
  NegotiationAction,
  ScopeSignal,
  WorkloadEstimate,
} from '@/lib/yqaaAdaptivePricing'
import { evaluateProviderAttention } from '@/lib/messengerEscalationPolicy'

export type YqaaJourneyStage =
  | 'orienting'
  | 'pathway_map'
  | 'docs_gather'
  | 'consult_ready'
  | 'commerce'
  | 'post_offer'
  | 'crisis'
  | 'exit_risk'

export type YqaaEmotionBand = 'calm' | 'concerned' | 'distressed' | 'frustrated'

/** Deterministic scope snapshot (no model prose becomes a fact). */
export type YqaaNegotiationScopeSnapshot = {
  depth: string
  units: { unit: string; qty: number } | null
  gig_id: string | null
  tier_id: string | null
  scope_hash: string
  summary: string
}

/**
 * Negotiation memory (PRICING-ADAPTIVE §3.7 + §7.6). Additive in the v1→v2 memory
 * upgrade: every field is optional for readers of v1 rows.
 */
export type YqaaNegotiationMemory = {
  scope_current: YqaaNegotiationScopeSnapshot | null
  scope_history: Array<{ scope_hash: string; summary: string; at: string }>
  /** Range-aware latest client budget. */
  budget_latest: BudgetEvidence | null
  client_counters: Array<{ cents: number; message_id: string | null; at: string; class: string }>
  quotes_made: Array<{
    cents: number
    scope_hash: string
    kind: 'quote' | 'offer' | 'meet' | 'downscope'
    at: string
    offer_id?: string | null
  }>
  concessions_used: number
  final_quote_scope_hash?: string | null
  approval: { pending: boolean; requested_at?: string; approved_cents?: number } | null
  workload_history: Array<{ at: string; total_hours: number; price_cents: number; reason_codes: string[] }>
}

const MAX_NEGOTIATION_HISTORY = 10

export type YqaaConversationMemory = {
  /** 1 = pre-companion rows (still readable). 2 = companion rows with journey/negotiation. */
  version: 1 | 2
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
  provider_attention: {
    requested_at: string | null
    pending: boolean
    human_reply_after_request: boolean
  }
  last_offer: {
    offer_id: string
    title: string
    price_cents: number
    currency: string
    created_at: string
  } | null
  // ── v2 additions (all optional so v1 rows keep working) ──
  journey_stage?: YqaaJourneyStage | null
  last_posture?: string | null
  emotion_band?: YqaaEmotionBand | null
  negotiation?: YqaaNegotiationMemory | null
}

const MARKET_PATTERNS: Array<[string, RegExp]> = [
  ['United States', /\b(united states|usa|u\.?s\.?|america|american|f-?1|opt|cpt|h-?1b|uscis)\b/i],
  ['Canada', /\b(canada|canadian|ircc|study permit|pgwp|express entry|pnp|lmia)\b/i],
  ['United Kingdom', /\b(united kingdom|uk|britain|british|student route|graduate route|ukvi|ilr)\b/i],
  ['Australia', /\b(australia|australian|subclass\s*500|subclass\s*485|temporary graduate|genuine student|coe|oshc)\b/i],
]

const HIGH_VALUE = /\b(budget|price|quote|offer|order|need|want|looking for|help with|apply|application|visa|permit|immigration|admission|school|university|legal|lawyer|attorney|resume|cv|sop|essay|housing|settlement|family|sponsor|deadline|urgent|document|passport|transcript|refusal|appeal|feedback|update|follow up|follow-up)\b/i
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

  // In a provider↔client DM, AI messages use the provider's sender_id. That lets
  // us identify the provider id without trusting model text, while the shared
  // authority still excludes AI/system messages when deciding whether a human
  // provider has actually replied.
  const providerId = String(
    [...(args.messages || [])]
      .reverse()
      .find((m: any) => m?.sender_id && m.sender_id !== args.clientId)?.sender_id || '',
  )
  const attention = evaluateProviderAttention({
    metadata: args.metadata,
    messages: args.messages || [],
    providerId,
  })

  const priorNegotiation = (prior.negotiation || null) as YqaaNegotiationMemory | null

  return {
    version: 2,
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
    provider_attention: {
      requested_at: attention.requestedAt,
      pending: attention.pending,
      human_reply_after_request: attention.humanRespondedAfterRequest,
    },
    last_offer: prior.last_offer || null,
    journey_stage: prior.journey_stage ?? null,
    last_posture: prior.last_posture ?? null,
    emotion_band: prior.emotion_band ?? null,
    negotiation: priorNegotiation,
  }
}

export function withOfferInMemory(
  memory: YqaaConversationMemory,
  offer: { id: string; title: string; priceCents: number; currency: string },
): YqaaConversationMemory {
  return {
    ...memory,
    version: 2,
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

function emptyNegotiationMemory(): YqaaNegotiationMemory {
  return {
    scope_current: null,
    scope_history: [],
    budget_latest: null,
    client_counters: [],
    quotes_made: [],
    concessions_used: 0,
    final_quote_scope_hash: null,
    approval: null,
    workload_history: [],
  }
}

function scopeSnapshot(decision: AdaptivePricingDecision, scope: ScopeSignal): YqaaNegotiationScopeSnapshot {
  return {
    depth: scope.depth,
    units: scope.units ? { unit: scope.units.unit, qty: scope.units.qty } : null,
    gig_id: decision.gig_id,
    tier_id: decision.tier_id,
    scope_hash: scope.scope_hash,
    summary: clean(scope.summary, 160),
  }
}

function uniqueByHash<T extends { scope_hash?: string; cents?: number }>(rows: T[], max = MAX_NEGOTIATION_HISTORY) {
  const out: T[] = []
  const seen = new Set<string>()
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const key = `${rows[i].scope_hash || ''}:${rows[i].cents ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    out.unshift(rows[i])
    if (out.length >= max) break
  }
  return out
}

/**
 * Persist the adaptive-pricing outcome of this turn (additive v2).
 * Client-safe numbers only; internal floors/rates/weights are never stored.
 */
export function withAdaptivePricingInMemory(
  memory: YqaaConversationMemory,
  args: {
    decision: AdaptivePricingDecision
    scope?: ScopeSignal | null
    workload?: WorkloadEstimate | null
    action?: NegotiationAction | null
    approvedPriceCents?: number | null
    offerId?: string | null
    journeyStage?: YqaaJourneyStage | null
    emotionBand?: YqaaEmotionBand | null
    lastPosture?: string | null
  },
): YqaaConversationMemory {
  const decision = args.decision
  const scope = args.scope || decision.scope
  const workload = args.workload || decision.workload
  const action = args.action || decision.recommended_action
  const now = new Date().toISOString()
  const negotiation: YqaaNegotiationMemory = {
    ...(memory.negotiation || emptyNegotiationMemory()),
  }

  const snapshot = scopeSnapshot(decision, scope)
  negotiation.scope_current = snapshot
  negotiation.scope_history = uniqueByHash(
    [...(negotiation.scope_history || []), { scope_hash: snapshot.scope_hash, summary: snapshot.summary, at: now }],
    MAX_NEGOTIATION_HISTORY,
  )

  if (decision.negotiation.budget) {
    negotiation.budget_latest = decision.negotiation.budget
  }
  if (decision.counter_cents && decision.negotiation.counter_source !== 'budget') {
    negotiation.client_counters = uniqueByHash(
      [
        ...(negotiation.client_counters || []),
        {
          cents: decision.counter_cents,
          message_id: decision.negotiation.counter_message_id,
          at: now,
          class: decision.counter_class,
        },
      ],
      MAX_NEGOTIATION_HISTORY,
    )
  }

  const approved = args.approvedPriceCents ?? decision.approved_price_cents
  const quoteKind: 'quote' | 'offer' | 'meet' | 'downscope' = action === 'DOWNSCOPE'
    ? 'downscope'
    : action === 'MEET_MIDDLE'
      ? 'meet'
      : args.offerId
        ? 'offer'
        : 'quote'
  if (approved && approved > 0 && (action === 'QUOTE' || action === 'ACCEPT' || action === 'MEET_MIDDLE' || action === 'DOWNSCOPE')) {
    const scopeHash = action === 'DOWNSCOPE'
      ? (decision.downscope_options[0]?.scope.scope_hash || snapshot.scope_hash)
      : snapshot.scope_hash
    const alreadyRecorded = (negotiation.quotes_made || []).some(
      (row) => row.scope_hash === scopeHash && Number(row.cents) === approved,
    )
    negotiation.quotes_made = uniqueByHash(
      [...(negotiation.quotes_made || []), { cents: approved, scope_hash: scopeHash, kind: quoteKind, at: now, offer_id: args.offerId || null }],
      MAX_NEGOTIATION_HISTORY,
    )
    // A "concession" is a price move below the priced scope: ACCEPT at a counter,
    // MEET_MIDDLE, or a downscope. Identical repeats do not count twice.
    const movedPrice =
      action === 'MEET_MIDDLE' ||
      action === 'DOWNSCOPE' ||
      (action === 'ACCEPT' && approved < decision.quote.scoped_list_cents)
    if (movedPrice && !alreadyRecorded) {
      negotiation.concessions_used = Math.max(0, Number(negotiation.concessions_used || 0)) + 1
    }
    negotiation.final_quote_scope_hash = scopeHash
  }

  if (decision.approval_required || decision.status === 'provider_approval_required') {
    negotiation.approval = { pending: true, requested_at: now, approved_cents: negotiation.approval?.approved_cents }
  } else if (decision.approved_price_cents) {
    negotiation.approval = { pending: false, requested_at: negotiation.approval?.requested_at, approved_cents: decision.approved_price_cents }
  } else if (!negotiation.approval) {
    negotiation.approval = null
  }

  negotiation.workload_history = [
    ...(negotiation.workload_history || []),
    {
      at: now,
      total_hours: workload.total_hours,
      price_cents: approved || decision.quote.scoped_list_cents,
      reason_codes: [...decision.reason_codes, ...workload.reason_codes].slice(0, 24),
    },
  ].slice(-MAX_NEGOTIATION_HISTORY)

  return {
    ...memory,
    version: 2,
    updated_at: now,
    journey_stage: args.journeyStage ?? memory.journey_stage ?? null,
    emotion_band: args.emotionBand ?? memory.emotion_band ?? null,
    last_posture: args.lastPosture ?? memory.last_posture ?? null,
    negotiation,
  }
}

export function renderConversationMemory(memory: YqaaConversationMemory) {
  const negotiation = memory.negotiation || null
  const latestQuote = negotiation?.quotes_made?.length
    ? negotiation.quotes_made[negotiation.quotes_made.length - 1]
    : null
  const lines = [
    '# GROUNDED CONVERSATION MEMORY',
    'This memory contains only client-authored facts/highlights or deterministic values. Use it to stay context-aware and avoid asking for information the client already supplied.',
    memory.journey_stage ? `Journey stage: ${memory.journey_stage}` : null,
    memory.emotion_band ? `Client emotional band (deterministic): ${memory.emotion_band}` : null,
    memory.last_posture ? `Last server posture: ${memory.last_posture}` : null,
    memory.markets.length ? `Markets mentioned: ${memory.markets.join(', ')}` : null,
    memory.marketplace_scope ? `Current Marketplace scope: ${memory.marketplace_scope.subcategory_name || memory.marketplace_scope.category_name}` : null,
    memory.budget ? `Known client budget: ${memory.budget.minCents ? `${memory.budget.minCents / 100}–` : ''}${memory.budget.maxCents / 100} ${memory.budget.currency.toUpperCase()}` : 'Known client budget: not yet supplied',
    memory.latest_goal ? `Latest client goal/message: ${memory.latest_goal}` : null,
    memory.provider_attention.pending
      ? `Provider attention status: REQUESTED and still pending. There is NO human-provider reply in the thread after the request${memory.provider_attention.requested_at ? ` at ${memory.provider_attention.requested_at}` : ''}.`
      : memory.provider_attention.human_reply_after_request
        ? 'Provider attention status: the human provider HAS replied in the thread after the request. Only use the actual provider-authored message as provider feedback.'
        : 'Provider attention status: no pending provider-attention request is established.',
    memory.deadline_highlights.length ? `Deadline/urgency statements:\n${memory.deadline_highlights.map((x) => `- ${x}`).join('\n')}` : null,
    memory.document_highlights.length ? `Document statements:\n${memory.document_highlights.map((x) => `- ${x}`).join('\n')}` : null,
    memory.client_highlights.length ? `Important prior client statements:\n${memory.client_highlights.map((x) => `- ${x}`).join('\n')}` : null,
    memory.last_offer ? `Most recent YQAA offer: ${memory.last_offer.title} · ${memory.last_offer.currency.toUpperCase()} ${(memory.last_offer.price_cents / 100).toFixed(2)} · offer ${memory.last_offer.offer_id}` : null,
    negotiation?.scope_current
      ? `Current agreed scope: ${negotiation.scope_current.summary}${negotiation.scope_current.units ? ` (${negotiation.scope_current.units.qty} ${negotiation.scope_current.units.unit})` : ''}`
      : null,
    latestQuote
      ? `Most recent server-approved price for a scope: ${(latestQuote.cents / 100).toFixed(0)} ${memory.budget?.currency?.toUpperCase() || 'USD'} (${latestQuote.kind}${latestQuote.scope_hash ? `, scope ${latestQuote.scope_hash}` : ''})`
      : null,
    negotiation && negotiation.client_counters?.length
      ? `Client counters seen: ${negotiation.client_counters.length}${negotiation.client_counters[negotiation.client_counters.length - 1] ? ` (latest ${(negotiation.client_counters[negotiation.client_counters.length - 1].cents / 100).toFixed(0)} ${memory.budget?.currency?.toUpperCase() || 'USD'})` : ''}`
      : null,
    negotiation?.approval?.pending
      ? 'Pricing approval: REQUESTED from the provider and still pending — say a human is reviewing pricing flexibility; do not promise a discount.'
      : null,
    '',
    'MEMORY BEHAVIOR:',
    '- Do not ask again for a fact that is already clearly present above unless the client has contradicted or changed it.',
    '- Do not repeat obvious platform explanations or your AI disclosure once already established in the thread unless clarification genuinely requires it.',
    '- Refer back naturally (for example, “with the budget you mentioned…”), but do not mechanically recap the whole conversation.',
    '- If provider attention is pending and the client asks for feedback, an update, or sends another hello, answer promptly. State that there is no new human-provider reply yet, do not invent one, and remain helpful while the provider is pending.',
    '- A provider-attention request is not a reason for YQAA to disappear. Only an explicit provider/admin AI pause or off mode is a true takeover.',
    '- Never repeat a price that is not the current server-approved price for the current scope. Earlier prices in this memory are history, not an offer you may restate.',
  ].filter((x): x is string => typeof x === 'string')
  return lines.join('\n')
}
