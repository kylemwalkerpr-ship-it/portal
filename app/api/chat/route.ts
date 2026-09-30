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
    const publicEvidence = evidencePack.chunks
    const systemKnowledge = await buildCentralAssistantKnowledge({
      latestUserMessage: lastUser.content,
      origin: inquiryOrigin,
      curatedChunks: publicEvidence,
    })
    const knowledgeMs = Date.now() - knowledgeStartedAt

    const advisoryContext = {
      query: lastUser.content,
      hostname: inquiryOrigin.hostname,
      evidence: publicEvidence,
    }
    const triggers = yqaaJevTriggers(advisoryContext)
    const jevStartedAt = Date.now()
    const jev = await requestJevAdvisory(advisoryContext)
    const jevMs = Date.now() - jevStartedAt
    const safety = applyYqaaSafetyPolicy(advisoryContext, jev)
    if (!safety.answer) {
      const viewer = await boundedViewerSnapshot()
      const handoffVisitor = viewer.visitor || asVisitor(body.visitor) || null
      try {
        const handoff = await escalateToSupport({
          message: lastUser.content,
          visitor: handoffVisitor,
          topic: 'yqaa-safety-handoff',
        })
        return withCors(req, {
          reply: 'This question needs a qualified person to review the details. I can share general information, but I will not guess or make a decision for your situation. I am connecting you to support.',
          provider: 'handoff',
          handoff: { conversationId: handoff.conversationId, status: handoff.status, queue: handoff.queue, apiUrl: handoff.apiUrl },
          retryable: false,
        })
      } catch {
        return withCors(req, {
          reply: 'This question needs a qualified person to review the details. I cannot verify a safe answer or connect to support right now. Please retry the handoff or contact YouSafe Support directly.',
          provider: 'safety-handoff-unavailable',
          retryable: true,
        }, { status: 503 })
      }
    }

    const modelStartedAt = Date.now()
    const result = await generateYqaaAnswer(systemKnowledge, cleaned)
    const modelMs = Date.now() - modelStartedAt
    const guarded = enforceCanonicalMarketCoverage(lastUser.content, result.text)
    const pricingGuard = guardYqaaPricingClaims(lastUser.content, guarded.text)
    const finalText = pricingGuard.text
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
