import { knowledgeSiteForHost, type KnowledgeChunk } from '@/lib/messengerSiteKnowledge'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { isYqaaLiveWebSourceKey } from '@/lib/yqaaWebEvidence'

export type JevTrigger = 'ambiguous' | 'conflicting_evidence' | 'low_evidence' | 'high_stakes' | 'cross_jurisdiction'
export type JevAdvisory = {
  sufficient: boolean
  confidence: number
  conflict: boolean
  needsHandoff: boolean
  market: 'usa' | 'canada' | 'uk' | 'australia' | 'global' | 'unknown'
}
export type JevNetworkFailure = 'network_headers' | 'network_redirect' | 'network_tls' | 'network_dns' | 'network_io_context' | 'network_subrequest_limit' | 'network_connection' | 'network_unknown'
type JevUnavailableReason = 'not_configured' | 'timeout' | 'invalid_response' | 'request_failed' | 'network_error' | JevNetworkFailure | 'http_401' | 'http_403' | 'http_422' | 'http_429' | 'http_529'
export type JevResult = { available: true; advisory: JevAdvisory } | { available: false; reason: JevUnavailableReason }

export type JevContext = {
  query: string
  hostname?: string | null
  evidence: KnowledgeChunk[]
}

const JEV_TIMEOUT_MS = 1400
const JEV_MAX_EVIDENCE = 12
const JEV_MAX_EXCERPT_CHARS = 600
const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone'
const JEV_MODEL = 'jev-latest'
const JEV_INSTRUCTIONS = 'Give bounded advisory judgments about public evidence only. Do not draft a visitor answer, make legal decisions, request private data, or override deterministic safety policy.'

export function sanitizeYqaaPublicQuestion(value: string): string {
  return String(value || '')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted contact]')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '[redacted contact]')
    .replace(/\b(?:[A-Z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET)[A-Z0-9_]*)\s*[:=]\s*\S+/gi, '[redacted secret]')
    .replace(/\b(?:api key|access token|secret)\s+(?:is\s+)?\S+/gi, '[redacted secret]')
    .replace(/\bBearer\s+\S+/gi, '[redacted secret]')
    .replace(/\b(?:sk|pk)[_-][A-Za-z0-9._-]{8,}\b/gi, '[redacted secret]')
    .replace(/\bAKIA[0-9A-Z]{16}\b/gi, '[redacted secret]')
    .replace(/\b(?:passport|account|order|case|application|receipt|reference)\s*(?:number|no\.?|#|id)?\s*[:#-]?\s*[A-Z0-9-]{5,}\b/gi, '[redacted identifier]')
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[redacted identifier]')
    .replace(/https?:\/\/\S+/gi, '[redacted URL]')
    .slice(0, 2000)
}

function explicitMarkets(query: string): Set<string> {
  const q = query.toLowerCase()
  const result = new Set<string>()
  if (/\b(australia|australian|subclass\s*(500|485))\b/.test(q)) result.add('australia')
  if (/\b(canada|canadian|ircc|pgwp)\b/.test(q)) result.add('canada')
  if (/\b(united kingdom|britain|british|ukvi|\buk\b)/.test(q)) result.add('uk')
  if (/\b(united states|american|uscis|\busa\b|\bu\.?s\.?\b|f-?1\s+visa)\b/.test(q)) result.add('usa')
  return result
}

const MARKET_JURISDICTION: Record<string, string> = {
  usa: 'united states', canada: 'canada', uk: 'united kingdom', australia: 'australia',
}

function normalizedJurisdiction(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.toLowerCase().replace(/[^a-z]/g, '')
  if (['usa', 'us', 'unitedstates', 'unitedstatesofamerica', 'america'].includes(normalized)) return 'usa'
  if (['canada', 'canadian'].includes(normalized)) return 'canada'
  if (['uk', 'gb', 'greatbritain', 'britain', 'unitedkingdom'].includes(normalized)) return 'uk'
  if (['australia', 'australian'].includes(normalized)) return 'australia'
  return null
}

function hasJurisdictionEvidence(ctx: JevContext, market: string): boolean {
  return ctx.evidence.some((item) => {
    const evidence = item as KnowledgeChunk & { jurisdiction?: string; sourceKey?: string }
    if (normalizedJurisdiction(item.site) === market || normalizedJurisdiction(evidence.jurisdiction) === market) return true
    // Web research only admits bounded evidence with citations from the official domains.
    return isYqaaLiveWebSourceKey(evidence.sourceKey) && Boolean(item.sourceUrl || item.source) &&
      normalizedJurisdiction(evidence.jurisdiction) === market
  })
}

function hasCitationLinkedWebEvidence(ctx: JevContext): boolean {
  return ctx.evidence.some((item) => {
    const evidence = item as KnowledgeChunk & { sourceKey?: string }
    return isYqaaLiveWebSourceKey(evidence.sourceKey) && Boolean(item.sourceUrl || item.source)
  })
}

export function yqaaJevTriggers(ctx: JevContext): JevTrigger[] {
  const q = ctx.query
  const triggers: JevTrigger[] = []
  if (/\b(unclear|not sure|which (?:one|option)|what should i do|confused|compare|versus|\bvs\b|conflict)\b/i.test(q)) triggers.push('ambiguous')
  const evidenceSites = new Set(ctx.evidence.map((item) => item.site).filter(Boolean))
  const markets = explicitMarkets(q)
  if (ctx.evidence.length >= 2 && evidenceSites.size > 1 && /\b(conflict|contradict|different|inconsistent)\b/i.test(q)) triggers.push('conflicting_evidence')
  const hasUsableEvidence = ctx.evidence.some((item) =>
    item.body.trim().length > 0 && Boolean(item.site || item.sourceUrl || item.source),
  )
  if (!hasUsableEvidence) triggers.push('low_evidence')
  const explicitLegalAdvice = /\b(?:give me legal advice|advise me legally|tell me what i should do legally)\b/i.test(q)
  const outcomePrediction = /\b(?:what are my chances|will i (?:win|be approved|get (?:a|the) visa)|will my (?:case|appeal|application) (?:win|succeed|be approved))\b/i.test(q)
  const strategyRequest = /\bshould i (?:appeal|sue|settle|plead(?: guilty| not guilty)?|file (?:an? )?(?:appeal|lawsuit))\b/i.test(q)
  const personalPossessiveMatter = /\bmy\s+(?:(?:visa|permit|application)\s+refus(?:al|ed)|eviction|deportation|removal order|criminal charge|custody dispute|restraining order|court case|hearing|lawsuit)\b/i.test(q)
  const personalAdverseEvent = /\bi\s+(?:was|am|have been)\s+(?:being\s+)?(?:evicted|deported|arrested|charged|served|refused)\b/i.test(q)
  const personalActiveCase = /\bi\s+(?:have|got|received)\s+(?:(?:a|an|the)\s+)?(?:court\s+hearing|hearing|lawsuit|removal order|eviction notice|criminal charge|restraining order|visa refusal|permit refusal|application refusal)\b/i.test(q)
  const personalMatter = personalPossessiveMatter || personalAdverseEvent || personalActiveCase
  const caseActionRequest = /\b(?:what should i do|what do i do|how should i respond|should i|can i appeal|deadline|due date|when do i have to|respond|response|appeal|sue|settle|plead|file|filing)\b/i.test(q)
  const individualizedHighStakes = explicitLegalAdvice || outcomePrediction || strategyRequest || (personalMatter && caseActionRequest)
  if (individualizedHighStakes) triggers.push('high_stakes')
  const origin = knowledgeSiteForHost(ctx.hostname)
  if (markets.size > 1 || ([...markets][0] && origin && markets.size === 1 && [...markets][0] !== origin)) triggers.push('cross_jurisdiction')
  return [...new Set(triggers)]
}

function boundedPayload(ctx: JevContext, triggers: JevTrigger[]) {
  const evidence = ctx.evidence.slice(0, JEV_MAX_EVIDENCE).map((item) => ({
    id: String(item.id).slice(0, 120),
    site: String(item.site || 'network').slice(0, 24),
    repository: item.repository ? String(item.repository).slice(0, 200) : null,
    title: String(item.title).slice(0, 120),
    sourceUrl: String(item.sourceUrl || item.source).slice(0, 500),
    excerpt: String(item.body).replace(/\s+/g, ' ').slice(0, JEV_MAX_EXCERPT_CHARS),
  }))
  return {
    state: {
      question: sanitizeYqaaPublicQuestion(ctx.query),
      trustedSite: knowledgeSiteForHost(ctx.hostname),
      triggers,
      publicEvidence: evidence,
    },
    model: JEV_MODEL,
    questions: {
      sufficient: {
        type: 'noul',
        instructions: `${JEV_INSTRUCTIONS} Is the supplied public evidence sufficient for a cautious general informational answer to the question?`,
        criteria: { true: 'Enough relevant, consistent public evidence exists.', false: 'Evidence is insufficient, irrelevant, or conflicting.' },
      },
      conflict: {
        type: 'noul',
        instructions: 'Do the supplied public sources materially conflict about the answer? Treat this as advisory; deterministic policy can still reject the answer.',
      },
      needs_handoff: {
        type: 'noul',
        instructions: 'Should this request be handed to a qualified human because the provided public evidence cannot support a safe general answer?',
      },
      market: {
        type: 'choice',
        instructions: 'Which jurisdiction is most relevant to the question and supplied public evidence? An explicit jurisdiction in the question outranks the trusted site.',
        criteria: { usa: 'United States', canada: 'Canada', uk: 'United Kingdom', australia: 'Australia', global: 'Multiple or network-wide jurisdictions', unknown: 'Cannot determine' },
      },
    },
  }
}

function parseAdvisory(value: unknown): JevAdvisory | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  const market = v.market
  if (typeof v.sufficient !== 'boolean' || typeof v.conflict !== 'boolean' || typeof v.needsHandoff !== 'boolean' || typeof v.confidence !== 'number' || !Number.isFinite(v.confidence) || v.confidence < 0 || v.confidence > 1) return null
  if (!['usa', 'canada', 'uk', 'australia', 'global', 'unknown'].includes(String(market))) return null
  return { sufficient: v.sufficient, confidence: v.confidence, conflict: v.conflict, needsHandoff: v.needsHandoff, market: market as JevAdvisory['market'] }
}

async function readBoundedResponse(response: Response, maxBytes: number, signal?: AbortSignal): Promise<string | null> {
  const declaredLength = Number(response.headers.get('content-length') || 0)
  if (declaredLength > maxBytes) {
    await response.body?.cancel().catch(() => undefined)
    return null
  }
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  const cancelOnAbort = () => { void reader.cancel().catch(() => undefined) }
  signal?.addEventListener('abort', cancelOnAbort, { once: true })
  try {
    if (signal?.aborted) cancelOnAbort()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        return null
      }
      chunks.push(value)
    }
  } finally {
    signal?.removeEventListener('abort', cancelOnAbort)
    reader.releaseLock()
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return new TextDecoder().decode(bytes)
}

function readChoice(answer: unknown, allowed: string[]): { choice: string; confidence: number; selectedProbability: number } | null {
  const isProbability = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return null
  const value = answer as Record<string, unknown>
  if (value.type !== 'choice' || typeof value.choice !== 'string' || !isProbability(value.confidence) || !value.probabilities || typeof value.probabilities !== 'object' || Array.isArray(value.probabilities)) return null
  const probabilities = value.probabilities as Record<string, unknown>
  const keys = Object.keys(probabilities)
  if (keys.length !== allowed.length || keys.some((key) => !allowed.includes(key) || !isProbability(probabilities[key]))) return null
  const total = keys.reduce((sum, key) => sum + (probabilities[key] as number), 0)
  if (Math.abs(total - 1) > 0.01 || !keys.includes(value.choice)) return null
  return { choice: value.choice, confidence: value.confidence, selectedProbability: probabilities[value.choice] as number }
}

export async function requestJevAdvisory(
  ctx: JevContext,
  fetcher: typeof fetch = fetch,
  options: { apiKey?: string; workerEnv?: { TYPESAFE_API_KEY?: string }; signal?: AbortSignal } = {},
): Promise<JevResult> {
  const apiKey = await resolveJevApiKey(options)
  if (!apiKey) return { available: false, reason: 'not_configured' }
  if (options.signal?.aborted) return { available: false, reason: 'timeout' }
  const controller = new AbortController()
  const abortForCaller = () => controller.abort(options.signal?.reason)
  options.signal?.addEventListener('abort', abortForCaller, { once: true })
  const timer = setTimeout(() => controller.abort(), JEV_TIMEOUT_MS)
  let removeAbortListener = () => {}
  const aborted = new Promise<JevResult>((resolve) => {
    const onAbort = () => resolve({ available: false, reason: 'timeout' })
    controller.signal.addEventListener('abort', onAbort, { once: true })
    removeAbortListener = () => controller.signal.removeEventListener('abort', onAbort)
  })
  const request = (async (): Promise<JevResult> => {
  try {
    const response = await fetcher(JEV_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(boundedPayload(ctx, yqaaJevTriggers(ctx))),
      signal: controller.signal,
      redirect: 'error',
    })
    if (!response.ok) {
      return { available: false, reason: knownFiniteHttpFailure(response.status) || 'request_failed' }
    }
    const responseText = await readBoundedResponse(response, 4096, controller.signal)
    if (responseText === null) return { available: false, reason: 'invalid_response' }
    let raw: Record<string, unknown> | null = null
    try { raw = JSON.parse(responseText) as Record<string, unknown> } catch { return { available: false, reason: 'invalid_response' } }
    const answers = raw?.answers && typeof raw.answers === 'object' ? raw.answers as Record<string, unknown> : null
    if (!answers) return { available: false, reason: 'invalid_response' }
    const sufficient = answers.sufficient as Record<string, unknown> | undefined
    const conflict = answers.conflict as Record<string, unknown> | undefined
    const handoff = answers.needs_handoff as Record<string, unknown> | undefined
    const market = answers.market as Record<string, unknown> | undefined
    const sufficientProbability = sufficient?.noul
    const conflictProbability = conflict?.noul
    const handoffProbability = handoff?.noul
    const isProbability = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    if (sufficient?.type !== 'noul' || conflict?.type !== 'noul' || handoff?.type !== 'noul' ||
      !isProbability(sufficientProbability) || !isProbability(conflictProbability) || !isProbability(handoffProbability)) {
      return { available: false, reason: 'invalid_response' }
    }
    const sufficientP = sufficientProbability as number
    const conflictP = conflictProbability as number
    const handoffP = handoffProbability as number
    const parsedMarket = market?.choice
    const marketChoice = readChoice(market, ['usa', 'canada', 'uk', 'australia', 'global', 'unknown'])
    if (!marketChoice || market?.type !== 'choice' || marketChoice.choice !== parsedMarket) {
      return { available: false, reason: 'invalid_response' }
    }
    const advisory = parseAdvisory({
      sufficient: sufficientP >= 0.75,
      conflict: conflictP >= 0.6,
      needsHandoff: handoffP >= 0.6,
      confidence: Math.round(Math.min(1, Math.max(0, Math.abs(sufficientP - 0.5) * 2)) * 1000) / 1000,
      market: parsedMarket,
    })
    return advisory ? { available: true, advisory } : { available: false, reason: 'invalid_response' }
  } catch (error) {
    return { available: false, reason: error instanceof Error && error.name === 'AbortError' ? 'timeout' : classifyJevNetworkError(error) }
  }
  })()
  try {
    return await Promise.race([request, aborted])
  } finally {
    clearTimeout(timer)
    removeAbortListener()
    options.signal?.removeEventListener('abort', abortForCaller)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Companion (DM) advisory: posture + negotiation posture.
//
// Jev recommends, policy authorizes: the caller prunes both choice sets to the
// options it is willing to honour BEFORE the call. Malformed or off-list
// responses fail closed to deterministic handling. Jev never sees or sets a price — the payload carries
// only enums, buckets and counts (no cents, no rates, no floors).
// ─────────────────────────────────────────────────────────────────────────────

export const JEV_COMPANION_TIMEOUT_MS = JEV_TIMEOUT_MS
export const JEV_COMPANION_MODEL = JEV_MODEL

export type JevPosture =
  | 'EDUCATE'
  | 'DISCOVER'
  | 'EMPATHIZE'
  | 'COMMERCE'
  | 'NEGOTIATE'
  | 'ESCALATE_PROVIDER'
  | 'HANDOFF_SUPPORT'
  | 'ABSTAIN'

export type JevNegotiationAction = 'ACCEPT' | 'MEET_MIDDLE' | 'DOWNSCOPE' | 'HOLD_VALUE' | 'ESCALATE_PROVIDER'

export type CompanionJevContext = {
  query: string
  hostname?: string | null
  evidence?: KnowledgeChunk[]
  channel?: 'dm' | 'public' | 'support'
  journeyStage?: string | null
  emotionBand?: string | null
  scopeDepth?: string | null
  counterBucket?: string | null
  counterCount?: number | null
  frustration?: boolean
  duplicateRisk?: boolean
  budgetStatus?: string | null
  triggers?: JevTrigger[]
  /** Pruned server-side before the call: forbidden postures are removed, not down-weighted. */
  postureOptions: JevPosture[]
  /** Pruned server-side; empty = pricing not in play, so no negotiation question is asked. */
  negotiationOptions?: JevNegotiationAction[]
}

export type CompanionJevResult =
  | {
      available: true
      posture: JevPosture | null
      negotiationPosture: JevNegotiationAction | null
      sufficient: boolean
      confidence: number
      needsHandoff: boolean
      market: JevAdvisory['market']
      ignored: string[]
      choiceDiagnostics?: Partial<Record<'posture' | 'negotiation_posture' | 'market', { confidence: number; selectedProbability: number }>>
    }
  | { available: false; reason: JevUnavailableReason }

function knownFiniteHttpFailure(status: number): 'http_401' | 'http_403' | 'http_422' | 'http_429' | 'http_529' | null {
  const reasons: Record<number, 'http_401' | 'http_403' | 'http_422' | 'http_429' | 'http_529'> = {
    401: 'http_401', 403: 'http_403', 422: 'http_422', 429: 'http_429', 529: 'http_529',
  }
  return reasons[status] || null
}

/** Extract only bounded diagnostic fields; never return or persist provider text. */
export function classifyJevNetworkError(error: unknown): JevNetworkFailure {
  const fields: string[] = []
  if (error && typeof error === 'object') {
    const value = error as { name?: unknown; message?: unknown; cause?: unknown }
    if (typeof value.name === 'string') fields.push(value.name)
    if (typeof value.message === 'string') fields.push(value.message)
    if (value.cause && typeof value.cause === 'object') {
      const code = (value.cause as { code?: unknown }).code
      if (typeof code === 'string') fields.push(code)
    }
  }
  const diagnostic = fields.join(' ').toLowerCase()
  if (/subrequest|too many.*request|limit.*request/.test(diagnostic)) return 'network_subrequest_limit'
  if (/redirect|redirection|3xx/.test(diagnostic)) return 'network_redirect'
  if (/header/.test(diagnostic)) return 'network_headers'
  if (/tls|ssl|certificate|cert_|secure connection/.test(diagnostic)) return 'network_tls'
  if (/dns|enotfound|eai_again|eai_fail|name not resolved/.test(diagnostic)) return 'network_dns'
  if (/context|execution context|io[_ -]?context/.test(diagnostic)) return 'network_io_context'
  if (/econn|connection|socket|reset|refused|closed|pipe/.test(diagnostic)) return 'network_connection'
  return 'network_unknown'
}

export async function resolveJevApiKey(options: { apiKey?: string; workerEnv?: { TYPESAFE_API_KEY?: string } } = {}) {
  let apiKey = options.apiKey?.trim() || options.workerEnv?.TYPESAFE_API_KEY?.trim() || ''
  if (!apiKey) {
    try {
      const workerEnv = getCloudflareContext().env as CloudflareEnv & { TYPESAFE_API_KEY?: string }
      apiKey = workerEnv.TYPESAFE_API_KEY?.trim() || ''
    } catch {
      // Cloudflare context is absent outside the Worker.
    }
  }
  // An empty Worker binding (Jest's cloudflare stub returns `{ env: {} }` without
  // throwing; local Next can do the same) must still honor TYPESAFE_API_KEY.
  // A key present on the binding above wins.
  if (!apiKey) apiKey = process.env.TYPESAFE_API_KEY?.trim() || ''
  return apiKey
}

export async function readJevBoundedResponse(response: Response, maxBytes: number) {
  return readBoundedResponse(response, maxBytes)
}

export function companionJevPayload(ctx: CompanionJevContext) {
  const postureOptions = [...new Set(ctx.postureOptions)].filter(Boolean)
  const negotiationOptions = [...new Set(ctx.negotiationOptions || [])].filter(Boolean)
  // Jev never sees a number: strip currency amounts from the redacted state.
  const redactMoney = (value: string) =>
    String(value || '')
      .replace(/(?:\b(?:usd|cad)\b\s*|\$)\s*\d[\d,]*(?:\.\d{1,2})?/gi, '[amount]')
      .replace(/\b\d[\d,]*(?:\.\d{1,2})?\s*(?:usd|cad|dollars?|bucks?)\b/gi, '[amount]')
  const evidence = (ctx.evidence || []).slice(0, JEV_MAX_EVIDENCE).map((item) => ({
    id: String(item.id).slice(0, 120),
    site: String(item.site || 'network').slice(0, 24),
    title: String(item.title).slice(0, 120),
    sourceUrl: String(item.sourceUrl || item.source).slice(0, 500),
    excerpt: redactMoney(String(item.body).replace(/\s+/g, ' ')).slice(0, JEV_MAX_EXCERPT_CHARS),
  }))
  const questions: Record<string, unknown> = {
    ...(postureOptions.length >= 2 ? { posture: {
      type: 'choice',
      instructions: `${JEV_INSTRUCTIONS} Pick the single best conversational posture for the next YQAA reply, from the allowed list only.`,
      criteria: Object.fromEntries(postureOptions.map((option) => [option, option])),
    } } : {}),
    sufficient: {
      type: 'noul',
      instructions: `${JEV_INSTRUCTIONS} Is the supplied public evidence sufficient for a cautious general informational answer to the question?`,
      criteria: { true: 'Enough relevant, consistent public evidence exists.', false: 'Evidence is insufficient, irrelevant, or conflicting.' },
    },
    needs_handoff: {
      type: 'noul',
      instructions: 'Should this request be handed to a qualified human because the supplied evidence and conversation state cannot support a safe answer?',
    },
    market: {
      type: 'choice',
      instructions: 'Which jurisdiction is most relevant to the question and supplied evidence? An explicit jurisdiction in the question outranks the trusted site.',
      criteria: { usa: 'United States', canada: 'Canada', uk: 'United Kingdom', australia: 'Australia', global: 'Multiple or network-wide jurisdictions', unknown: 'Cannot determine' },
    },
  }
  if (negotiationOptions.length >= 2) {
    questions.negotiation_posture = {
      type: 'choice',
      instructions: `${JEV_INSTRUCTIONS} Choose the negotiation posture for this turn from the allowed list only. The server computes every number; never state or imply a price.`,
      criteria: Object.fromEntries(negotiationOptions.map((option) => [option, option])),
    }
  }
  return {
    state: {
      question: redactMoney(sanitizeYqaaPublicQuestion(ctx.query)),
      channel: ctx.channel || 'dm',
      trustedSite: knowledgeSiteForHost(ctx.hostname),
      triggers: ctx.triggers || [],
      journeyStage: ctx.journeyStage || null,
      emotionBand: ctx.emotionBand || null,
      scopeDepth: ctx.scopeDepth || 'unknown',
      counterBucket: ctx.counterBucket || 'none',
      counterCount: Math.max(0, Math.min(99, Number(ctx.counterCount) || 0)),
      frustration: Boolean(ctx.frustration),
      duplicateRisk: Boolean(ctx.duplicateRisk),
      budgetStatus: ctx.budgetStatus || 'unknown',
      publicEvidence: evidence,
    },
    model: JEV_MODEL,
    questions,
  }
}

export async function requestCompanionJev(
  ctx: CompanionJevContext,
  fetcher: typeof fetch = fetch,
  options: { apiKey?: string; workerEnv?: { TYPESAFE_API_KEY?: string }; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<CompanionJevResult> {
  const apiKey = await resolveJevApiKey(options)
  if (!apiKey) return { available: false, reason: 'not_configured' }
  if (options.signal?.aborted) return { available: false, reason: 'timeout' }
  const controller = new AbortController()
  const abortForCaller = () => controller.abort(options.signal?.reason)
  if (options.signal?.aborted) abortForCaller()
  else options.signal?.addEventListener('abort', abortForCaller, { once: true })
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) && Number(options.timeoutMs) > 0
    ? Number(options.timeoutMs)
    : JEV_COMPANION_TIMEOUT_MS
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let resolveTimedOut = () => {}
  let removeTimeoutListener = () => {}
  const timedOut = controller.signal.aborted
    ? Promise.resolve<CompanionJevResult>({ available: false, reason: 'timeout' })
    : new Promise<CompanionJevResult>((resolve) => {
      resolveTimedOut = () => resolve({ available: false, reason: 'timeout' })
      const onAbort = () => resolveTimedOut()
      controller.signal.addEventListener('abort', onAbort, { once: true })
      removeTimeoutListener = () => controller.signal.removeEventListener('abort', onAbort)
    })
  const request = (async (): Promise<CompanionJevResult> => {
    try {
      const response = await fetcher(JEV_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(companionJevPayload(ctx)),
        signal: controller.signal,
        redirect: 'error',
      })
      if (!response.ok) {
        return { available: false, reason: knownFiniteHttpFailure(response.status) || 'request_failed' }
      }
      const responseText = await readBoundedResponse(response, 4096, controller.signal)
      if (responseText === null) return { available: false, reason: 'invalid_response' }
      let raw: Record<string, unknown> | null = null
      try { raw = JSON.parse(responseText) as Record<string, unknown> } catch { return { available: false, reason: 'invalid_response' } }
      const answers = raw?.answers && typeof raw.answers === 'object' ? raw.answers as Record<string, unknown> : null
      if (!answers) return { available: false, reason: 'invalid_response' }

      const isProbability = (value: unknown): value is number =>
        typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
      const sufficientAnswer = answers.sufficient as Record<string, unknown> | undefined
      const handoffAnswer = answers.needs_handoff as Record<string, unknown> | undefined
      const sufficientProbability = sufficientAnswer?.noul
      const handoffProbability = handoffAnswer?.noul
      const marketAnswer = answers.market as Record<string, unknown> | undefined
      const market = marketAnswer?.choice
      if (sufficientAnswer?.type !== 'noul' || handoffAnswer?.type !== 'noul') return { available: false, reason: 'invalid_response' }
      if (!isProbability(sufficientProbability) || !isProbability(handoffProbability)) {
        return { available: false, reason: 'invalid_response' }
      }
      if (typeof market !== 'string' || !['usa', 'canada', 'uk', 'australia', 'global', 'unknown'].includes(market)) {
        return { available: false, reason: 'invalid_response' }
      }

      const readChoice = (answer: unknown, allowed: string[]): { choice: string; confidence: number; selectedProbability: number } | null => {
        if (!answer || typeof answer !== 'object') return null
        const value = answer as Record<string, unknown>
        if (value.type !== 'choice' || typeof value.choice !== 'string' || !isProbability(value.confidence) || !value.probabilities || typeof value.probabilities !== 'object' || Array.isArray(value.probabilities)) return null
        const probabilities = value.probabilities as Record<string, unknown>
        const keys = Object.keys(probabilities)
        if (keys.length < 2 || keys.length > 255 || keys.some((key) => !isProbability(probabilities[key]))) return null
        const total = keys.reduce((sum, key) => sum + (probabilities[key] as number), 0)
        if (Math.abs(total - 1) > 0.01 || !keys.includes(value.choice)) return null
        if (allowed.length > 0 && (keys.length !== allowed.length || allowed.some((key) => !keys.includes(key)))) return null
        return { choice: value.choice, confidence: value.confidence, selectedProbability: probabilities[value.choice] as number }
      }
      const marketChoice = readChoice(marketAnswer, ['usa', 'canada', 'uk', 'australia', 'global', 'unknown'])
      if (!marketChoice || marketChoice.choice !== market) return { available: false, reason: 'invalid_response' }

      const ignored: string[] = []
      const allowedPostures = [...new Set(ctx.postureOptions)]
      let posture: JevPosture | null = allowedPostures.length === 1 ? allowedPostures[0] : null
      const choiceDiagnostics: NonNullable<Extract<CompanionJevResult, { available: true }>['choiceDiagnostics']> = { market: { confidence: marketChoice.confidence, selectedProbability: marketChoice.selectedProbability } }
      if (allowedPostures.length >= 2) {
        const selected = readChoice(answers.posture, allowedPostures)
        if (!selected) return { available: false, reason: 'invalid_response' }
        choiceDiagnostics.posture = { confidence: selected.confidence, selectedProbability: selected.selectedProbability }
        posture = selected.choice as JevPosture
      }

      const allowedActions = [...new Set(ctx.negotiationOptions || [])].filter(Boolean)
      let negotiationPosture: JevNegotiationAction | null = allowedActions.length === 1 ? allowedActions[0] : null
      if (allowedActions.length >= 2) {
        const selected = readChoice(answers.negotiation_posture, allowedActions)
        if (!selected) return { available: false, reason: 'invalid_response' }
        choiceDiagnostics.negotiation_posture = { confidence: selected.confidence, selectedProbability: selected.selectedProbability }
        negotiationPosture = selected.choice as JevNegotiationAction
      }

      const sufficientP = sufficientProbability as number
      const handoffP = handoffProbability as number
      return {
        available: true,
        posture,
        negotiationPosture,
        sufficient: sufficientP >= 0.75,
        needsHandoff: handoffP >= 0.6,
        confidence: Math.round(Math.min(1, Math.max(0, Math.abs(sufficientP - 0.5) * 2)) * 1000) / 1000,
        market: market as JevAdvisory['market'],
        ignored,
        choiceDiagnostics,
      }
    } catch (error) {
      return { available: false, reason: error instanceof Error && error.name === 'AbortError' ? 'timeout' : classifyJevNetworkError(error) }
    }
  })()
  try {
    return await Promise.race([request, timedOut])
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', abortForCaller)
    removeTimeoutListener()
  }
}

export function applyYqaaSafetyPolicy(ctx: JevContext, result: JevResult): { answer: boolean; reason: string } {
  const triggers = yqaaJevTriggers(ctx)
  if (triggers.includes('high_stakes')) return { answer: false, reason: 'high_stakes_handoff' }
  if (triggers.includes('low_evidence')) return { answer: false, reason: 'low_evidence_handoff' }
  const explicit = explicitMarkets(ctx.query)
  if (explicit.size > 1) return { answer: false, reason: 'jurisdiction_mismatch_handoff' }
  const explicitMarket = explicit.size === 1 ? [...explicit][0] : null
  const matchingJurisdictionEvidence = Boolean(explicitMarket && hasJurisdictionEvidence(ctx, explicitMarket))
  if (!result.available) {
    if (explicitMarket && !matchingJurisdictionEvidence) return { answer: false, reason: 'jurisdiction_evidence_missing_handoff' }
    const unresolvedTriggers = triggers.filter((trigger) =>
      trigger !== 'cross_jurisdiction' || !matchingJurisdictionEvidence,
    )
    if (unresolvedTriggers.length) return { answer: false, reason: 'jev_unavailable_handoff' }
    return { answer: true, reason: 'deterministic_policy_clear' }
  }
  if (explicitMarket && result.advisory.market !== explicitMarket) {
    return { answer: false, reason: 'jurisdiction_mismatch_handoff' }
  }
  if (explicitMarket && !matchingJurisdictionEvidence) return { answer: false, reason: 'jurisdiction_evidence_missing_handoff' }
  if (triggers.includes('conflicting_evidence') &&
      !(hasCitationLinkedWebEvidence(ctx) && result.advisory.sufficient && !result.advisory.conflict &&
        !result.advisory.needsHandoff && result.advisory.confidence >= 0.7)) {
    return { answer: false, reason: 'conflicting_evidence_handoff' }
  }
  if (result.advisory.needsHandoff || result.advisory.conflict || !result.advisory.sufficient || result.advisory.confidence < 0.7) {
    return { answer: false, reason: 'jev_or_evidence_handoff' }
  }
  return { answer: true, reason: 'jev_advisory_clear' }
}
