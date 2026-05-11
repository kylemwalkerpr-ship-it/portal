import { CHAT_SYSTEM_PROMPT } from '@/lib/chatKnowledgeBase'
import { getChatProvider, type ChatTurn } from '@/lib/chatProvider'
import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { fetchLiveKnowledge } from '@/lib/liveKnowledge'
import {
  SUPPORT_WIDGET_API,
  escalateToSupport,
  shouldEscalateToLiveAgent,
  type SupportVisitor,
} from '@/lib/chatEscalation'

const MAX_HISTORY_TURNS = 16
const MAX_USER_MESSAGE_CHARS = 2000

const ALLOWED_ORIGINS = new Set([
  'https://yousafeconsultancy.com',
  'https://www.yousafeconsultancy.com',
  'https://ca.yousafeconsultancy.com',
  'https://usa.yousafeconsultancy.com',
  'https://checkout.yousafeconsultancy.com',
  'https://portal.yousafeconsultancy.com',
  'https://support.yousafeconsultancy.com',
  'https://legal.yousafeconsultancy.com',
])

function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') || ''
  const headers: Record<string, string> = {
    'Vary': 'Origin',
  }
  if (ALLOWED_ORIGINS.has(origin)) {
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

function isValidTurn(t: unknown): t is ChatTurn {
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

function asPageContext(input: unknown) {
  if (!input || typeof input !== 'object') return ''
  const value = input as Record<string, unknown>
  const clean = (key: string) => {
    const raw = value[key]
    if (typeof raw !== 'string') return null
    const trimmed = raw.trim()
    return trimmed ? trimmed.slice(0, 300) : null
  }
  const bits = [
    clean('surface') ? `Surface: ${clean('surface')}` : null,
    clean('hostname') || clean('origin') ? `Site: ${clean('hostname') || clean('origin')}` : null,
    clean('pathname') ? `Path: ${clean('pathname')}` : null,
    clean('title') ? `Page title: ${clean('title')}` : null,
    clean('referrer') ? `Referrer: ${clean('referrer')}` : null,
  ].filter(Boolean)
  return bits.length > 0 ? `\n\n# Current page context\n${bits.join('\n')}` : ''
}

export async function POST(req: Request) {
  let body: {
    messages?: unknown
    requestAgent?: unknown
    visitor?: unknown
    topic?: unknown
    pageContext?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return withCors(req, { error: 'Expected JSON body' }, { status: 400 })
  }

  const rawMessages = Array.isArray(body.messages) ? body.messages : []
  const cleaned: ChatTurn[] = rawMessages.filter(isValidTurn).slice(-MAX_HISTORY_TURNS)
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

  // Resolve viewer context from Clerk if signed in. Used both to enrich the
  // AI system prompt AND to pre-fill visitor identity for support-saas
  // handoff so the agent knows who they're talking to.
  let viewerContext = ''
  let viewerVisitor: SupportVisitor | null = null
  let viewerRole: string | null = null
  try {
    const clerkUserId = await getClerkUserId()
    if (clerkUserId) {
      const db = createSupabaseAdminClient()
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
        if (bits.length > 0) viewerContext = `\n\n# Current viewer\n${bits.join('\n')}`
      }
    }
  } catch {
    /* anonymous viewers are fine */
  }
  const pageContext = asPageContext(body.pageContext)

  // ── LIVE-AGENT ESCALATION ────────────────────────────────────────────────
  // Triggered either by an explicit `requestAgent: true` from the widget
  // (e.g. the "Talk to a human" button) or when the user's message contains
  // intent keywords ("real human", "live agent", etc.).
  const wantsAgent =
    body.requestAgent === true || shouldEscalateToLiveAgent(lastUser.content)
  if (wantsAgent) {
    const incomingVisitor = asVisitor(body.visitor)
    const topic = typeof body.topic === 'string' && body.topic.trim()
      ? body.topic.trim()
      : (viewerRole ? `portal-${viewerRole}` : 'portal')
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
      console.error('[chat] escalation failed', err instanceof Error ? err.message : err)
      // Fall through to AI reply so the user isn't left stranded if support
      // is unreachable. We'll surface a hint that they can email instead.
    }
  }

  const provider = getChatProvider()
  if (!provider) {
    return withCors(
      req,
      {
        error:
          "I'm not configured yet — the platform owner needs to set GROQ_API_KEY or GEMINI_API_KEY before I can chat.",
      },
      { status: 503 },
    )
  }

  // Fetch the live knowledge supplement maintained on the marketing site so
  // edits to yara-knowledge.json roll out without a portal redeploy. Edge-
  // cached for ~5 minutes; falls back to null if the marketing site is down.
  const liveKnowledge = await fetchLiveKnowledge()
  const liveSection = liveKnowledge
    ? `\n\n# Live updates from the marketing site\nThese override anything conflicting in the static knowledge base above.\n\n${liveKnowledge}`
    : ''

  try {
    const reply = await provider.reply(CHAT_SYSTEM_PROMPT + viewerContext + pageContext + liveSection, cleaned)
    return withCors(req, { reply, provider: provider.name, supportApiUrl: SUPPORT_WIDGET_API })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[chat] provider error', message)
    return withCors(
      req,
      { error: "Sorry — I couldn't reach the assistant right now. Please try again in a moment." },
      { status: 502 },
    )
  }
}
