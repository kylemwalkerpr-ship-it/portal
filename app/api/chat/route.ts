import { CHAT_SYSTEM_PROMPT } from '@/lib/chatKnowledgeBase'
import { getChatProvider, type ChatTurn } from '@/lib/chatProvider'
import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { fetchLiveKnowledge } from '@/lib/liveKnowledge'

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

export async function POST(req: Request) {
  let body: { messages?: unknown }
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

  // Best-effort viewer context: if signed in, tell the model who's asking so it
  // can address them by name and tailor advice for their role. This is purely
  // informational; the model doesn't get any private order data.
  let viewerContext = ''
  try {
    const clerkUserId = await getClerkUserId()
    if (clerkUserId) {
      const db = createSupabaseAdminClient()
      const { data: profile } = await db
        .from('profiles')
        .select('full_name, role, status')
        .eq('clerk_user_id', clerkUserId)
        .maybeSingle()
      if (profile) {
        const name = profile.full_name?.trim()
        const role = profile.role === 'client' ? 'student' : profile.role
        const bits = [
          name ? `Name: ${name}` : null,
          role ? `Role: ${role}` : null,
          profile.status ? `Account status: ${profile.status}` : null,
        ].filter(Boolean)
        if (bits.length > 0) viewerContext = `\n\n# Current viewer\n${bits.join('\n')}`
      }
    }
  } catch {
    /* anonymous viewers are fine */
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
    const reply = await provider.reply(CHAT_SYSTEM_PROMPT + viewerContext + liveSection, cleaned)
    return withCors(req, { reply, provider: provider.name })
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
