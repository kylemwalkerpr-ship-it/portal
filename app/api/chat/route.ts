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
import { callSystemSuperGrok, type SystemAssistantTurn } from '@/lib/superGrokAssistant'

const MAX_HISTORY_TURNS = 16
const MAX_USER_MESSAGE_CHARS = 2000
const VIEWER_CONTEXT_BUDGET_MS = 1_500

type ViewerSnapshot = {
  context: string
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
    if (!clerkUserId) return { context: '', visitor: null, role: null }

    const db = createSupabaseAdminClient()
    const { data: profile } = await db
      .from('profiles')
      .select('full_name, email, role, status')
      .eq('clerk_user_id', clerkUserId)
      .maybeSingle()
    if (!profile) return { context: '', visitor: null, role: null }

    const name = profile.full_name?.trim() || null
    const email = profile.email?.trim() || null
    const role = profile.role === 'client' ? 'student' : profile.role
    const bits = [
      name ? `Name: ${name}` : null,
      role ? `Role: ${role}` : null,
      profile.status ? `Account status: ${profile.status}` : null,
    ].filter(Boolean)

    return {
      context: bits.length > 0 ? `\n\n# CURRENT VIEWER\n${bits.join('\n')}` : '',
      visitor: { name, email, phone: null },
      role: role || null,
    }
  } catch {
    return { context: '', visitor: null, role: null }
  }
}

async function boundedViewerSnapshot(): Promise<ViewerSnapshot> {
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      loadViewerSnapshot(),
      new Promise<ViewerSnapshot>((resolve) => {
        timer = setTimeout(
          () => resolve({ context: '', visitor: null, role: null }),
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

  const viewerPromise = boundedViewerSnapshot()

  if (wantsAgent) {
    const viewer = await viewerPromise
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
      console.error('[system-assistant] escalation failed', err instanceof Error ? err.message : err)
    }
  }

  try {
    const knowledgeStartedAt = Date.now()
    const knowledgePromise = buildCentralAssistantKnowledge({
      latestUserMessage: lastUser.content,
      origin: inquiryOrigin,
    })
    const [systemKnowledge, viewer] = await Promise.all([knowledgePromise, viewerPromise])
    const knowledgeMs = Date.now() - knowledgeStartedAt

    const modelStartedAt = Date.now()
    const result = await callSystemSuperGrok(systemKnowledge + viewer.context, cleaned)
    const modelMs = Date.now() - modelStartedAt
    const guarded = enforceCanonicalMarketCoverage(lastUser.content, result.text)
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
      modelReportedMs: result.latencyMs,
      promptChars: systemKnowledge.length,
      hostname: inquiryOrigin.hostname,
    })

    return withCors(
      req,
      {
        reply: guarded.text,
        provider: guarded.corrected ? 'system-ai-grounding-guard' : 'system-ai',
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
