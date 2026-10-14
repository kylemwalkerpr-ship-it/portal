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
import { requestJevAdvisory, yqaaJevTriggers } from '@/lib/jevAdvisory'
import { classifyYqaaProviderFailure, generateYqaaAnswer, publicYqaaProviderLabel, YQAA_GENERATION_BUDGET_MS } from '@/lib/yqaaGeneration'
import { guardYqaaPricingClaims } from '@/lib/assistantPricingGuard'
import { createYqaaDeadline, YqaaDeadlineError } from '@/lib/yqaaDeadline'
import { persistYqaaDecisionRecord } from '@/lib/yqaaDecisionRecord'
import { COMPANION_CHANNEL_CAPABILITIES, runCompanionOrchestrator } from '@/lib/yqaaDecisionOrchestrator'
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
const PUBLIC_YQAA_DEADLINE_MS = 42_000
const KNOWLEDGE_STAGE_BUDGET_MS = 12_000
const JEV_STAGE_BUDGET_MS = 1_500
const WEB_STAGE_BUDGET_MS = 6_000
const CONTEXT_STAGE_BUDGET_MS = 500
const MODEL_STAGE_BUDGET_MS = YQAA_GENERATION_BUDGET_MS

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

type StageState = 'ok' | 'timeout' | 'failed' | 'auth' | 'config' | 'protocol' | 'network' | 'other'
type StageTiming = { name: string; startedAt: number; durationMs?: number; state?: StageState }

class YqaaStageTimeoutError extends Error {
  constructor(readonly stage: string) {
    super(`YQAA ${stage} stage timed out`)
    this.name = 'YqaaStageTimeoutError'
  }
}

async function runBoundedStage<T>(
  deadline: ReturnType<typeof createYqaaDeadline>,
  stage: string,
  budgetMs: number,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController()
  const abortForDeadline = () => controller.abort(deadline.signal.reason)
  if (deadline.signal.aborted) abortForDeadline()
  else deadline.signal.addEventListener('abort', abortForDeadline, { once: true })
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work(controller.signal),
      deadline.race(new Promise<T>(() => {})),
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort(new YqaaStageTimeoutError(stage))
          reject(new YqaaStageTimeoutError(stage))
        }, Math.max(1, Math.min(budgetMs, deadline.remainingMs())))
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
    deadline.signal.removeEventListener('abort', abortForDeadline)
    controller.abort()
  }
}

function stageTimingHeader(stages: StageTiming[], totalMs: number): string {
  const metrics = stages.map((stage) => {
    const duration = stage.durationMs ?? Date.now() - stage.startedAt
    const state = stage.state || 'failed'
    return `${stage.name};dur=${Math.max(0, Math.round(duration))};desc="${state}"`
  })
  metrics.push(`total;dur=${Math.max(0, Math.round(totalMs))}`)
  return metrics.join(', ')
}

function generationFailureCategory(error: unknown): Extract<StageState, 'auth' | 'config' | 'protocol' | 'network' | 'timeout' | 'other'> {
  const kind = classifyYqaaProviderFailure(error).kind
  if (kind === 'authentication') return 'auth'
  if (kind === 'configuration') return 'config'
  if (kind === 'network') return 'network'
  if (kind === 'timeout') return 'timeout'
  if (kind === 'invalid_output' || kind === 'rate_limit' || kind === 'server_error') return 'protocol'
  return 'other'
}

async function persistDecisionBestEffort(
  deadline: ReturnType<typeof createYqaaDeadline>,
  input: Parameters<typeof persistYqaaDecisionRecord>[1],
): Promise<void> {
  const timeoutMs = Math.min(800, deadline.remainingMs())
  if (timeoutMs <= 0 || deadline.signal.aborted) return
  const controller = new AbortController()
  const abortForDeadline = () => controller.abort(deadline.signal.reason)
  deadline.signal.addEventListener('abort', abortForDeadline, { once: true })
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      persistYqaaDecisionRecord(createSupabaseAdminClient, input, { signal: controller.signal, timeoutMs }),
      new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          controller.abort(new YqaaDeadlineError())
          resolve()
        }, timeoutMs)
      }),
    ])
  } catch (error) {
    console.warn('[yqaa-decision-record] persistence unavailable', error instanceof Error ? error.message.slice(0, 120) : 'unknown')
  } finally {
    if (timer) clearTimeout(timer)
    deadline.signal.removeEventListener('abort', abortForDeadline)
    controller.abort()
  }
}

async function readJsonWithSignal(req: Request, signal: AbortSignal): Promise<unknown> {
  if (!req.body) throw new SyntaxError('Missing request body')
  const reader = req.body.getReader()
  const onAbort = () => { void reader.cancel(signal.reason).catch(() => {}) }
  if (signal.aborted) onAbort()
  else signal.addEventListener('abort', onAbort, { once: true })
  try {
    const decoder = new TextDecoder()
    let text = ''
    while (true) {
      const { done, value } = await reader.read()
      if (signal.aborted) throw signal.reason || new YqaaDeadlineError()
      if (done) break
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
    return JSON.parse(text)
  } finally {
    signal.removeEventListener('abort', onAbort)
    reader.releaseLock()
  }
}

export async function POST(req: Request) {
  const requestStartedAt = Date.now()
  const deadline = createYqaaDeadline(req.signal, PUBLIC_YQAA_DEADLINE_MS)
  let body: {
    messages?: unknown
    requestAgent?: unknown
    visitor?: unknown
    topic?: unknown
    origin?: unknown
    pageContext?: unknown
  }
  try {
    body = await deadline.race(readJsonWithSignal(req, deadline.signal)) as typeof body
  } catch {
    const expired = deadline.signal.aborted
    deadline.close()
    if (expired) return withCors(req, { error: 'Request body did not arrive before the time limit.', retryable: true }, { status: 504 })
    return withCors(req, { error: 'Expected JSON body', retryable: false }, { status: 400 })
  }

  const rawMessages = Array.isArray(body.messages) ? body.messages : []
  const cleaned: SystemAssistantTurn[] = rawMessages.filter(isValidTurn).slice(-MAX_HISTORY_TURNS)
  if (cleaned.length === 0 || cleaned[cleaned.length - 1].role !== 'user') {
    deadline.close()
    return withCors(req, { error: 'Send at least one user message', retryable: false }, { status: 400 })
  }
  const lastUser = cleaned[cleaned.length - 1]
  if (lastUser.content.length > MAX_USER_MESSAGE_CHARS) {
    deadline.close()
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
      deadline.close()
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
    let supportPostStarted = false
    try {
      const viewer = await deadline.race(boundedViewerSnapshot())
      const incomingVisitor = asVisitor(body.visitor)
      const topic = typeof body.topic === 'string' && body.topic.trim()
        ? body.topic.trim()
        : (viewer.role ? `portal-${viewer.role}` : inquiryOrigin.hostname || 'portal')
      const visitor: SupportVisitor | null = viewer.visitor || incomingVisitor || null
      const supportDecision = await runCompanionOrchestrator({
        channel: 'support', capabilities: COMPANION_CHANNEL_CAPABILITIES.support,
        reason: 'explicit_human_handoff',
      })
      supportPostStarted = true
      const handoff = await deadline.race(escalateToSupport({
        message: lastUser.content,
        visitor,
        topic,
        signal: deadline.signal,
      }))
      await persistDecisionBestEffort(deadline, {
        channel: 'support', interactionKey: crypto.randomUUID(),
        decision: supportDecision.decision,
      })
      deadline.close()
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
      const expired = deadline.signal.aborted || err instanceof YqaaDeadlineError
      deadline.close()
      return withCors(req, {
        reply: supportPostStarted
          ? expired
            ? 'The support handoff did not finish before the time limit. Its outcome is unknown; check the support chat before trying again, or contact YouSafe Support directly.'
            : 'The support handoff did not return a confirmation. Its outcome is unknown; check the support chat before trying again, or contact YouSafe Support directly.'
          : 'I could not prepare the support handoff before the time limit. No support request was sent; please retry or contact YouSafe Support directly.',
        provider: supportPostStarted ? 'handoff-unknown' : 'handoff-unavailable',
        ...(supportPostStarted ? { handoffState: 'unknown' } : {}),
        retryable: !supportPostStarted,
      }, { status: expired ? 504 : 503 })
    }
  }

  const stageTimings: StageTiming[] = []
  let knowledgeSource = 'unknown'
  let searchStatus = 'unknown'
  const startStage = (name: string): StageTiming => {
    const stage = { name, startedAt: Date.now() }
    stageTimings.push(stage)
    return stage
  }
  const finishStage = (stage: StageTiming, state: StageState = 'ok') => {
    stage.durationMs = Date.now() - stage.startedAt
    stage.state = state
  }

  try {
    const knowledgeStage = startStage('knowledge')
    const pageContext = [inquiryOrigin.pathname, inquiryOrigin.title, inquiryOrigin.headings]
      .filter(Boolean)
      .join(' ')
    let evidencePack
    try {
      evidencePack = await runBoundedStage(deadline, 'knowledge', KNOWLEDGE_STAGE_BUDGET_MS, (signal) =>
        loadYqaaEvidence({
          // Modal may cold-start beyond its 2s client bound. Do not then spend
          // another ~10s on the database fallback and starve generation.
          databaseFallbackTimeoutMs: 2_000,
          onSearchStatus: (status) => { searchStatus = status },
          query: lastUser.content,
          hostname: inquiryOrigin.hostname,
          pageContext,
          limit: 12,
          signal,
        }),
      )
      finishStage(knowledgeStage)
      knowledgeSource = evidencePack.source
    } catch (error) {
      finishStage(knowledgeStage, error instanceof YqaaStageTimeoutError ? 'timeout' : 'failed')
      throw error
    }
    let publicEvidence = evidencePack.chunks
    const knowledgeMs = knowledgeStage.durationMs || 0

    let advisoryContext = {
      query: lastUser.content,
      hostname: inquiryOrigin.hostname,
      evidence: publicEvidence,
    }
    const triggers = yqaaJevTriggers(advisoryContext)
    const jevStage = startStage('jev')
    let jev
    try {
      jev = await runBoundedStage(deadline, 'jev', JEV_STAGE_BUDGET_MS, (signal) =>
        requestJevAdvisory(advisoryContext, fetch, { signal }),
      )
      finishStage(jevStage, jev.available ? 'ok' : jev.reason === 'timeout' ? 'timeout' : 'failed')
    } catch (error) {
      if (!(error instanceof YqaaStageTimeoutError)) throw error
      finishStage(jevStage, 'timeout')
      jev = { available: false as const, reason: 'timeout' as const }
    }
    let jevMs = jevStage.durationMs || 0
    let publicDecision = await runCompanionOrchestrator({
      channel: 'public', capabilities: COMPANION_CHANNEL_CAPABILITIES.public,
      context: advisoryContext, jev,
    })
    let safety = publicDecision.safety
    let webEvidenceCount = 0
    let webResearchStatus: 'skipped' | 'verified' | 'retrieved' | 'insufficient' | 'failed' = 'skipped'
    const freshnessRequiresWeb = yqaaNeedsFreshWebResearch(lastUser.content)
    if (safety.reason !== 'high_stakes_handoff' &&
        (freshnessRequiresWeb || !safety.answer || evidencePack.retrievalConfidence < 0.7 || !evidencePack.freshEnough)) {
      const webStage = startStage('web')
      try {
        const webChunks = await runBoundedStage(deadline, 'web', WEB_STAGE_BUDGET_MS, (signal) =>
          researchYqaaPublicWeb(lastUser.content, inquiryOrigin.hostname, { signal }),
        )
        finishStage(webStage, webChunks.length ? 'ok' : 'failed')
        webEvidenceCount = webChunks.length
        if (webChunks.length) {
          publicEvidence = [...webChunks, ...evidencePack.chunks].slice(0, 12)
          advisoryContext = { ...advisoryContext, evidence: publicEvidence }
          const secondJevStage = startStage('jev')
          let secondJev
          try {
            secondJev = await runBoundedStage(deadline, 'jev', JEV_STAGE_BUDGET_MS, (signal) =>
              requestJevAdvisory(advisoryContext, fetch, { signal }),
            )
            finishStage(secondJevStage, secondJev.available ? 'ok' : secondJev.reason === 'timeout' ? 'timeout' : 'failed')
          } catch (error) {
            if (!(error instanceof YqaaStageTimeoutError)) throw error
            finishStage(secondJevStage, 'timeout')
            secondJev = { available: false as const, reason: 'timeout' as const }
          }
          jevMs += secondJevStage.durationMs || 0
          publicDecision = await runCompanionOrchestrator({
            channel: 'public', capabilities: COMPANION_CHANNEL_CAPABILITIES.public,
            context: advisoryContext, jev: secondJev,
          })
          safety = publicDecision.safety
          webResearchStatus = safety.answer ? 'verified' : 'retrieved'
        } else {
          publicDecision = await runCompanionOrchestrator({
            channel: 'public', capabilities: COMPANION_CHANNEL_CAPABILITIES.public,
            context: advisoryContext, jev,
            failClosedReason: 'web_evidence_insufficient',
          })
          safety = publicDecision.safety
          webResearchStatus = 'insufficient'
        }
      } catch (err) {
        finishStage(webStage, err instanceof YqaaStageTimeoutError ? 'timeout' : 'failed')
        console.warn('[system-assistant] web research failed', err instanceof Error ? err.message.slice(0, 180) : 'unknown')
        publicDecision = await runCompanionOrchestrator({
          channel: 'public', capabilities: COMPANION_CHANNEL_CAPABILITIES.public,
          context: advisoryContext, jev,
          failClosedReason: 'web_research_failed',
        })
        safety = publicDecision.safety
        webResearchStatus = 'failed'
      }
    }
    if (!safety.answer && safety.reason === 'high_stakes_handoff') {
      let supportPostStarted = false
      try {
        const viewer = await deadline.race(boundedViewerSnapshot())
        const handoffVisitor = viewer.visitor || asVisitor(body.visitor) || null
        const supportDecision = await runCompanionOrchestrator({
          channel: 'support', capabilities: COMPANION_CHANNEL_CAPABILITIES.support,
          reason: safety.reason,
        })
        supportPostStarted = true
        const handoff = await deadline.race(escalateToSupport({
          message: lastUser.content,
          visitor: handoffVisitor,
          topic: 'yqaa-safety-handoff',
          signal: deadline.signal,
        }))
        await persistDecisionBestEffort(deadline, {
          channel: 'support', interactionKey: crypto.randomUUID(),
          decision: supportDecision.decision,
          evidenceIds: publicEvidence.map((chunk) => chunk.id), shadowRubric: 'public-rubric-shadow-v1',
        })
        deadline.close()
        return withCors(req, {
          reply: safety.reason === 'high_stakes_handoff'
            ? 'This request needs individualized professional advice. I am connecting you to support for a qualified person to review it.'
            : 'I could not verify enough public evidence to answer this safely. I am connecting you to support.',
          provider: 'handoff',
          handoff: { conversationId: handoff.conversationId, status: handoff.status, queue: handoff.queue, apiUrl: handoff.apiUrl, visitorToken: handoff.visitorToken, kind: 'required' },
          retryable: false,
        })
      } catch {
        const expired = deadline.signal.aborted
        deadline.close()
        return withCors(req, {
          reply: supportPostStarted
            ? expired
              ? 'The support handoff did not finish before the time limit. Its outcome is unknown; check the support chat before trying again, or contact YouSafe Support directly.'
              : 'The support handoff did not return a confirmation. Its outcome is unknown; check the support chat before trying again, or contact YouSafe Support directly.'
            : 'I could not prepare the support handoff before the time limit. No support request was sent; please retry or contact YouSafe Support directly.',
          provider: supportPostStarted ? 'handoff-unknown' : 'handoff-unavailable',
          ...(supportPostStarted ? { handoffState: 'unknown' } : {}),
          retryable: !supportPostStarted,
        }, { status: expired ? 504 : 503 })
      }
    }

    const contextStage = startStage('context')
    let baseSystemKnowledge: string
    try {
      baseSystemKnowledge = await runBoundedStage(deadline, 'context', CONTEXT_STAGE_BUDGET_MS, () =>
        buildCentralAssistantKnowledge({
          latestUserMessage: lastUser.content,
          origin: inquiryOrigin,
          curatedChunks: publicEvidence,
          // The evidence stage already attempted the public knowledge pack.
          // Empty packs still use canonical authority and honest evidence limits.
          // Keep this assembly step free of another optional origin fetch.
          includeLiveSupplement: false,
        }),
      )
      finishStage(contextStage)
    } catch (error) {
      finishStage(contextStage, error instanceof YqaaStageTimeoutError ? 'timeout' : 'failed')
      throw error
    }
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
    const modelStage = startStage('model')
    let result
    try {
      // generateYqaaAnswer already performs the commissioned compact Grok
      // recovery and only crosses to DeepSeek when a real credential exists.
      result = await runBoundedStage(deadline, 'model', MODEL_STAGE_BUDGET_MS, (signal) =>
        generateYqaaAnswer(systemKnowledge, cleaned, { signal }),
      )
      finishStage(modelStage)
    } catch (generationError) {
      const failureCategory = generationFailureCategory(generationError)
      finishStage(modelStage, generationError instanceof YqaaStageTimeoutError || generationError instanceof YqaaDeadlineError ? 'timeout' : failureCategory)
      if (deadline.signal.aborted || generationError instanceof YqaaDeadlineError || !verifiedLiveResearch) throw generationError
      const digest = buildYqaaVerifiedWebDigest(publicEvidence)
      if (!digest) throw generationError
      const modelMs = modelStage.durationMs || 0
      const totalMs = Date.now() - requestStartedAt
      console.warn('[system-assistant] model synthesis unavailable after verified web research', {
        category: failureCategory,
        webEvidenceCount,
        totalMs,
      })
      await persistDecisionBestEffort(deadline, {
        channel: 'public', interactionKey: crypto.randomUUID(),
        decision: publicDecision.decision,
        evidenceIds: publicEvidence.map((chunk) => chunk.id), shadowRubric: 'public-rubric-shadow-v1',
      })
      deadline.close()
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
            'Server-Timing': stageTimingHeader(stageTimings, totalMs),
          },
        },
      )
    }
    const modelMs = modelStage.durationMs || 0
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

    await persistDecisionBestEffort(deadline, {
      channel: 'public', interactionKey: crypto.randomUUID(),
      decision: publicDecision.decision,
      evidenceIds: publicEvidence.map((chunk) => chunk.id), shadowRubric: 'public-rubric-shadow-v1',
    })

    deadline.close()
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
          'Server-Timing': stageTimingHeader(stageTimings, totalMs),
          'X-YQAA-Search-Status': searchStatus,
          'X-YQAA-Knowledge-Source': knowledgeSource,
        },
      },
    )
  } catch (err) {
    const failedStage = stageTimings[stageTimings.length - 1]
    if (failedStage && failedStage.state === undefined) {
      finishStage(failedStage, err instanceof YqaaStageTimeoutError ? 'timeout' : 'failed')
    }
    deadline.close()
    const totalMs = Date.now() - requestStartedAt
    const failedStageCategory = failedStage?.name === 'model' ? generationFailureCategory(err) : undefined
    const timedOut = err instanceof YqaaDeadlineError || err instanceof YqaaStageTimeoutError || deadline.signal.aborted || failedStageCategory === 'timeout'
    console.error('[system-assistant] generation failed', {
      stage: failedStage?.name || 'request',
      category: failedStageCategory || (timedOut ? 'timeout' : 'other'),
      totalMs,
    })
    return withCors(
      req,
      {
        error: timedOut
          ? "I couldn't verify enough evidence to complete that response before the time limit. Your message is still here — please retry or ask for a human."
          : "I couldn't complete that response just now. Your message is still here — you can retry it, or ask for a human if you need immediate help.",
        retryable: true,
        marketplaceRecommendation,
      },
      {
        status: timedOut ? 504 : 502,
        headers: { 'Server-Timing': stageTimingHeader(stageTimings, totalMs),
          'X-YQAA-Search-Status': searchStatus,
          'X-YQAA-Knowledge-Source': knowledgeSource },
      },
    )
  }
}
