import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import {
  SUPPORT_WIDGET_API,
  escalateToSupport,
  shouldEscalateToLiveAgent,
  type SupportVisitor,
} from '@/lib/chatEscalation'
import {
  buildCentralAssistantKnowledge,
  isAllowedAssistantOrigin,
  normalizeAssistantOrigin,
} from '@/lib/centralAssistantKnowledge'
import { enforceCanonicalMarketCoverage } from '@/lib/assistantNetworkAuthority'
import { matchMarketplaceIntent } from '@/lib/assistantMarketplaceIntent'
import { getDeterministicYqaaReply } from '@/lib/assistantFastReplies'
import type { SystemAssistantTurn } from '@/lib/superGrokAssistant'
import { applyYqaaSafetyPolicy, requestJevAdvisory, yqaaJevTriggers } from '@/lib/jevAdvisory'
import { generateYqaaAnswer, publicYqaaProviderLabel } from '@/lib/yqaaGeneration'
import { guardYqaaPricingClaims } from '@/lib/assistantPricingGuard'
import { loadYqaaEvidence } from '@/lib/yqaaKnowledgeDb'
import { researchYqaaPublicWeb, yqaaNeedsFreshWebResearch } from '@/lib/yqaaWebResearch'
import {
  buildYqaaLiveResearchContext,
  buildYqaaVerifiedWebDigest,
  guardVerifiedLiveResearchDisclosure,
  isYqaaLiveWebSourceKey,
} from '@/lib/yqaaWebEvidence'

const MAX_HISTORY_TURNS = 16
const MAX_USER_MESSAGE_CHARS = 2000
const VIEWER_CONTEXT_BUDGET_MS = 1_500

type ViewerSnapshot = {
  visitor: SupportVisitor | null
  role: string | null
}

function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') || ''
  const headers: Record<string, string> = { Vary: 'Origin' }
  if (isAllowedAssistantOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
    headers['Access-Control-Allow-Headers'] = 'Content-Type'
    headers['Access-Control-Expose-Headers'] = 'Server-Timing'
    headers['Access-Control-Max-Age'] = '86400'
  }
  return headers
}

function withCors(req: Request, body: unknown, init: ResponseInit = {}) {
  return Response.json(body, {
    ...init,
    headers: { ...corsHeaders(req), ...(init.headers || {}) },
  })
}

export function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(req) })
}

function isValidTurn(t: unknown): t is SystemAssistantTurn {
  if (!t || typeof t !== 'object') return false
  const turn = t as { role?: unknown; content?: unknown }
  return (
    (turn.role === 'user' || turn.role === 'assistant') &&
    typeof turn.content === 'string' &&
    turn.content.trim().length > 0
  )
}

function asVisitor(input: unknown): SupportVisitor | null {
  if (!input || typeof input !== 'object') return null
  const v = input as Record<string, unknown>
  const trim = (s: unknown) => (typeof s === 'string' ? s.trim() : '') || null
  return {
    name: trim(v.name),
    email: trim(v.email),
    phone: trim(v.phone),
  }
}

async function loadViewerSnapshot(): Promise<ViewerSnapshot> {
  try {
    const clerkUserId = await getClerkUserId()
    if (!clerkUserId) return { visitor: null, role: null }

    const db = createSupabaseAdminClient()
    const { data: profile } = await db
      .from('profiles')
      .select('full_name, email, role, status')
      .eq('clerk_user_id', clerkUserId)
      .maybeSingle()
    if (!profile) return { visitor: null, role: null }

    const name = profile.full_name?.trim() || null
    const email = profile.email?.trim() || null
    const role = profile.role === 'client' ? 'student' : profile.role
    return {
      visitor: { name, email, phone: null },
      role: role || null,
    }
  } catch {
    return { visitor: null, role: null }
  }
}

async function boundedViewerSnapshot(): Promise<ViewerSnapshot> {
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      loadViewerSnapshot(),
      new Promise<ViewerSnapshot>((resolve) => {
        timer = setTimeout(
          () => resolve({ visitor: null, role: null }),
          VIEWER_CONTEXT_BUDGET_MS,
        )
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function timingHeader(parts: Array<[string, number]>): string {
  return parts.map(([name, ms]) => `${name};dur=${Math.max(0, Math.round(ms))}`).join(', ')
}

export async function POST(req: Request) {
  const requestStartedAt = Date.now()
  let body: {
    messages?: unknown
    requestAgent?: unknown
    visitor?: unknown
    topic?: unknown
    origin?: unknown
    pageContext?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return withCors(req, { error: 'Expected JSON body', retryable: false }, { status: 400 })
  }

  const rawMessages = Array.isArray(body.messages) ? body.messages : []
  const cleaned: SystemAssistantTurn[] = rawMessages.filter(isValidTurn).slice(-MAX_HISTORY_TURNS)
  if (cleaned.length === 0 || cleaned[cleaned.length - 1].role !== 'user') {
    return withCors(req, { error: 'Send at least one user message', retryable: false }, { status: 400 })
  }
  const lastUser = cleaned[cleaned.length - 1]
  if (lastUser.content.length > MAX_USER_MESSAGE_CHARS) {
    return withCors(
      req,
      { error: `Message too long — keep it under ${MAX_USER_MESSAGE_CHARS} characters.`, retryable: false },
      { status: 400 },
    )
  }

  const inquiryOrigin = normalizeAssistantOrigin(body.origin ?? body.pageContext, req)
  const marketplaceRecommendation = matchMarketplaceIntent(lastUser.content)
  const wantsAgent = body.requestAgent === true || shouldEscalateToLiveAgent(lastUser.content)

  if (!wantsAgent) {
    const fastReply = getDeterministicYqaaReply(cleaned)
    if (fastReply) {
      const total = Date.now() - requestStartedAt
      return withCors(
        req,
        {
          reply: fastReply,
          provider: 'system-fast-path',
          supportApiUrl: SUPPORT_WIDGET_API,
          marketplaceRecommendation,
          retryable: false,
          origin: {
            surface: inquiryOrigin.surface,
            hostname: inquiryOrigin.hostname,
            pathname: inquiryOrigin.pathname,
          },
        },
        { headers: { 'Server-Timing': timingHeader([['total', total]]) } },
      )
    }
  }

  if (wantsAgent) {
    const viewer = await boundedViewerSnapshot()
    const incomingVisitor = asVisitor(body.visitor)
    const topic = typeof body.topic === 'string' && body.topic.trim()
      ? body.topic.trim()
      : (viewer.role ? `portal-${viewer.role}` : inquiryOrigin.hostname || 'portal')
    const visitor: SupportVisitor | null = viewer.visitor || incomingVisitor || null

    try {
      const handoff = await escalateToSupport({
        message: lastUser.content,
        visitor,
        topic,
      })
      return withCors(req, {
        handoff: {
          conversationId: handoff.conversationId,
          status: handoff.status,
          queue: handoff.queue,
          apiUrl: handoff.apiUrl,
          visitorToken: handoff.visitorToken,
          kind: 'explicit',
        },
        reply:
          "I'm connecting you to a live support agent. They'll join the chat as soon as someone is available — feel free to share more context here in the meantime.",
        provider: 'handoff',
        retryable: false,
      })
    } catch (err) {
      console.error('[system-assistant] escalation failed', err instanceof Error ? err.message.slice(0, 160) : 'unknown')
      return withCors(req, {
        reply: 'I could not connect you to support just now. I will not guess about this request. Please retry the handoff or contact YouSafe Support directly.',
        provider: 'handoff-unavailable',
        retryable: true,
      }, { status: 503 })
    }
  }

  try {
    const knowledgeStartedAt = Date.now()
    const pageContext = [inquiryOrigin.pathname, inquiryOrigin.title, inquiryOrigin.headings]
      .filter(Boolean)
      .join(' ')
    const evidencePack = await loadYqaaEvidence({
      query: lastUser.content,
      hostname: inquiryOrigin.hostname,
      pageContext,
      limit: 12,
    })
    let publicEvidence = evidencePack.chunks
    const knowledgeMs = Date.now() - knowledgeStartedAt

    let advisoryContext = {
      query: lastUser.content,
      hostname: inquiryOrigin.hostname,
      evidence: publicEvidence,
    }
    const triggers = yqaaJevTriggers(advisoryContext)
    const jevStartedAt = Date.now()
    const jev = await requestJevAdvisory(advisoryContext)
    let jevMs = Date.now() - jevStartedAt
    let safety = applyYqaaSafetyPolicy(advisoryContext, jev)
    let webEvidenceCount = 0
    let webResearchStatus: 'skipped' | 'verified' | 'retrieved' | 'insufficient' | 'failed' = 'skipped'
    const freshnessRequiresWeb = yqaaNeedsFreshWebResearch(lastUser.content)
    if (safety.reason !== 'high_stakes_handoff' &&
        (freshnessRequiresWeb || !safety.answer || evidencePack.retrievalConfidence < 0.7 || !evidencePack.freshEnough)) {
      try {
        const webChunks = await researchYqaaPublicWeb(lastUser.content, inquiryOrigin.hostname)
        webEvidenceCount = webChunks.length
        if (webChunks.length) {
          publicEvidence = [...webChunks, ...evidencePack.chunks].slice(0, 12)
          advisoryContext = { ...advisoryContext, evidence: publicEvidence }
          const secondJevStartedAt = Date.now()
          const secondJev = await requestJevAdvisory(advisoryContext)
          jevMs += Date.now() - secondJevStartedAt
          safety = applyYqaaSafetyPolicy(advisoryContext, secondJev)
          webResearchStatus = safety.answer ? 'verified' : 'retrieved'
        } else {
          safety = { answer: false, reason: 'web_evidence_insufficient' }
          webResearchStatus = 'insufficient'
        }
      } catch (err) {
        console.warn('[system-assistant] web research failed', err instanceof Error ? err.message.slice(0, 180) : 'unknown')
        safety = { answer: false, reason: 'web_research_failed' }
        webResearchStatus = 'failed'
      }
    }
    if (!safety.answer && safety.reason === 'high_stakes_handoff') {
      const viewer = await boundedViewerSnapshot()
      const handoffVisitor = viewer.visitor || asVisitor(body.visitor) || null
      try {
        const handoff = await escalateToSupport({
          message: lastUser.content,
          visitor: handoffVisitor,
          topic: 'yqaa-safety-handoff',
        })
        return withCors(req, {
          reply: safety.reason === 'high_stakes_handoff'
            ? 'This request needs individualized professional advice. I am connecting you to support for a qualified person to review it.'
            : 'I could not verify enough public evidence to answer this safely. I am connecting you to support.',
          provider: 'handoff',
          handoff: { conversationId: handoff.conversationId, status: handoff.status, queue: handoff.queue, apiUrl: handoff.apiUrl, visitorToken: handoff.visitorToken, kind: 'required' },
          retryable: false,
        })
      } catch {
        return withCors(req, {
          reply: 'I could not verify enough public evidence or connect to support right now. Please retry the handoff or contact YouSafe Support directly.',
          provider: 'safety-handoff-unavailable',
          retryable: true,
        }, { status: 503 })
      }
    }

    const baseSystemKnowledge = await buildCentralAssistantKnowledge({
      latestUserMessage: lastUser.content,
      origin: inquiryOrigin,
      curatedChunks: publicEvidence,
    })
    const liveResearchContext = buildYqaaLiveResearchContext(publicEvidence, webResearchStatus)
    const evidenceLimit = safety.answer ? '' : [
      '# CURRENT TURN EVIDENCE LIMIT',
      `Evidence check: ${safety.reason.replace(/_handoff$/, '')}.`,
      `Live web research: ${webResearchStatus}.`,
      'This evidence limitation is not, by itself, a reason to create a human-support handoff.',
      'Continue helping through YQAA. Give the most useful general answer supported by canonical/public evidence. If a current or YouSafe-specific fact cannot be verified, say that plainly and give the closest verified self-service next step. Do not invent specifics or claim freshness, certainty, eligibility, or outcomes that the evidence does not support.',
    ].join('\n')
    const systemKnowledge = [baseSystemKnowledge, liveResearchContext, evidenceLimit].filter(Boolean).join('\n\n')
    const verifiedLiveResearch = webEvidenceCount > 0 && (webResearchStatus === 'verified' || webResearchStatus === 'retrieved')
    const modelStartedAt = Date.now()
    let result
    try {
      // generateYqaaAnswer already performs the commissioned compact Grok
      // recovery and only crosses to DeepSeek when a real credential exists.
      result = await generateYqaaAnswer(systemKnowledge, cleaned)
    } catch (generationError) {
      if (!verifiedLiveResearch) throw generationError
      const digest = buildYqaaVerifiedWebDigest(publicEvidence)
      if (!digest) throw generationError
      const modelMs = Date.now() - modelStartedAt
      const totalMs = Date.now() - requestStartedAt
      console.warn('[system-assistant] model synthesis unavailable after verified web research', {
        generation: generationError instanceof Error ? generationError.message.slice(0, 160) : 'unknown',
        webEvidenceCount,
        totalMs,
      })
      return withCors(
        req,
        {
          reply: digest,
          provider: 'system-ai-live-evidence',
          supportApiUrl: SUPPORT_WIDGET_API,
          marketplaceRecommendation,
          retryable: true,
          origin: {
            surface: inquiryOrigin.surface,
            hostname: inquiryOrigin.hostname,
            pathname: inquiryOrigin.pathname,
          },
        },
        {
          status: 200,
          headers: {
            'Server-Timing': timingHeader([
              ['knowledge', knowledgeMs],
              ['jev', jevMs],
              ['model', modelMs],
              ['total', totalMs],
            ]),
          },
        },
      )
    }
    const modelMs = Date.now() - modelStartedAt
    const guarded = enforceCanonicalMarketCoverage(lastUser.content, result.text)
    const pricingGuard = guardYqaaPricingClaims(lastUser.content, guarded.text)
    const researchGuardedText = guardVerifiedLiveResearchDisclosure(pricingGuard.text, verifiedLiveResearch)
    const webCitations = publicEvidence.filter((chunk) => isYqaaLiveWebSourceKey(chunk.sourceKey))
      .map((chunk) => chunk.sourceUrl).filter((url): url is string => Boolean(url))
    const missingCitations = webCitations.filter((url) => !researchGuardedText.includes(url))
    const finalText = missingCitations.length
      ? `${researchGuardedText}\n\nSources: ${missingCitations.map((url) => `[${new URL(url).hostname}](${url})`).join(', ')}`
      : researchGuardedText
    const totalMs = Date.now() - requestStartedAt

    if (guarded.corrected) {
      console.warn('[system-assistant] canonical market contradiction blocked', {
        correctedMarkets: guarded.correctedMarkets,
        hostname: inquiryOrigin.hostname,
      })
    }

    console.info('[system-assistant] timing', {
      totalMs,
      knowledgeMs,
      modelMs,
      promptChars: systemKnowledge.length,
      hostname: inquiryOrigin.hostname,
      provider: result.provider,
      fallback: result.fallback,
      fallbackEvidence: result.failureEvidence ? { kind: result.failureEvidence.kind, status: result.failureEvidence.status } : null,
      jevMs,
      jevAvailable: jev.available,
      jevFailureReason: 'reason' in jev ? jev.reason : null,
      jevTriggers: triggers,
      safetyReason: safety.reason,
      knowledgeSource: evidencePack.source,
      retrievalConfidence: Number(evidencePack.retrievalConfidence.toFixed(3)),
      knowledgeFreshEnough: evidencePack.freshEnough,
      knowledgeSites: evidencePack.sites,
      evidenceChunks: publicEvidence.length,
      webEvidenceCount,
      webResearchStatus,
    })

    return withCors(
      req,
      {
        reply: finalText,
        provider: guarded.corrected || pricingGuard.corrected ? 'system-ai-grounding-guard' : publicYqaaProviderLabel(),
        supportApiUrl: SUPPORT_WIDGET_API,
        marketplaceRecommendation,
        retryable: false,
        origin: {
          surface: inquiryOrigin.surface,
          hostname: inquiryOrigin.hostname,
          pathname: inquiryOrigin.pathname,
        },
      },
      {
        headers: {
          'Server-Timing': timingHeader([
            ['knowledge', knowledgeMs],
            ['jev', jevMs],
            ['model', modelMs],
            ['total', totalMs],
          ]),
        },
      },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const totalMs = Date.now() - requestStartedAt
    console.error('[system-assistant] model error', message, { totalMs })
    return withCors(
      req,
      {
        error:
          "I couldn't complete that response just now. Your message is still here — you can retry it, or ask for a human if you need immediate help.",
        retryable: true,
        marketplaceRecommendation,
      },
      {
        status: 502,
        headers: { 'Server-Timing': timingHeader([['total', totalMs]]) },
      },
    )
  }
}
