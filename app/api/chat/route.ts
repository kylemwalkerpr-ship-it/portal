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
import { callSystemSuperGrok, type SystemAssistantTurn } from '@/lib/superGrokAssistant'

const MAX_HISTORY_TURNS = 16
const MAX_USER_MESSAGE_CHARS = 2000

function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') || ''
  const headers: Record<string, string> = { Vary: 'Origin' }
  if (isAllowedAssistantOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
    headers['Access-Control-Allow-Headers'] = 'Content-Type'
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

export async function POST(req: Request) {
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
    return withCors(req, { error: 'Expected JSON body' }, { status: 400 })
  }

  const rawMessages = Array.isArray(body.messages) ? body.messages : []
  const cleaned: SystemAssistantTurn[] = rawMessages.filter(isValidTurn).slice(-MAX_HISTORY_TURNS)
  if (cleaned.length === 0 || cleaned[cleaned.length - 1].role !== 'user') {
    return withCors(req, { error: 'Send at least one user message' }, { status: 400 })
  }
  const lastUser = cleaned[cleaned.length - 1]
  if (lastUser.content.length > MAX_USER_MESSAGE_CHARS) {
    return withCors(
      req,
      { error: `Message too long — keep it under ${MAX_USER_MESSAGE_CHARS} characters.` },
      { status: 400 },
    )
  }

  let viewerContext = ''
  let viewerVisitor: SupportVisitor | null = null
  let viewerRole: string | null = null
  let db: any = null
  try {
    const clerkUserId = await getClerkUserId()
    if (clerkUserId) {
      db = createSupabaseAdminClient()
      const { data: profile } = await db
        .from('profiles')
        .select('full_name, email, role, status')
        .eq('clerk_user_id', clerkUserId)
        .maybeSingle()
      if (profile) {
        const name = profile.full_name?.trim() || null
        const email = profile.email?.trim() || null
        viewerRole = profile.role === 'client' ? 'student' : profile.role
        viewerVisitor = { name, email, phone: null }
        const bits = [
          name ? `Name: ${name}` : null,
          viewerRole ? `Role: ${viewerRole}` : null,
          profile.status ? `Account status: ${profile.status}` : null,
        ].filter(Boolean)
        if (bits.length > 0) viewerContext = `\n\n# CURRENT VIEWER\n${bits.join('\n')}`
      }
    }
  } catch {
    /* Anonymous viewers are valid. */
  }

  const inquiryOrigin = normalizeAssistantOrigin(body.origin ?? body.pageContext, req)

  const wantsAgent =
    body.requestAgent === true || shouldEscalateToLiveAgent(lastUser.content)
  if (wantsAgent) {
    const incomingVisitor = asVisitor(body.visitor)
    const topic = typeof body.topic === 'string' && body.topic.trim()
      ? body.topic.trim()
      : (viewerRole ? `portal-${viewerRole}` : inquiryOrigin.hostname || 'portal')
    const visitor: SupportVisitor | null = viewerVisitor || incomingVisitor || null

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
      })
    } catch (err) {
      console.error('[system-assistant] escalation failed', err instanceof Error ? err.message : err)
    }
  }

  try {
    const systemKnowledge = await buildCentralAssistantKnowledge({
      latestUserMessage: lastUser.content,
      origin: inquiryOrigin,
      db,
    })
    const result = await callSystemSuperGrok(systemKnowledge + viewerContext, cleaned)
    return withCors(req, {
      reply: result.text,
      provider: 'supergrok',
      model: result.model,
      supportApiUrl: SUPPORT_WIDGET_API,
      origin: {
        surface: inquiryOrigin.surface,
        hostname: inquiryOrigin.hostname,
        pathname: inquiryOrigin.pathname,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[system-assistant] SuperGrok error', message)
    return withCors(
      req,
      {
        error:
          "Sorry — the YouSafe Assistant couldn't reach SuperGrok right now. Please try again in a moment or ask for a human support agent.",
      },
      { status: 502 },
    )
  }
}
