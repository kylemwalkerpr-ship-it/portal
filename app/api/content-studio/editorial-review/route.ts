import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { generateContentText } from '@/lib/contentAiProvider'
import { DEFAULT_REVIEW_PIN } from '@/lib/contentAiCatalog'
import { buildHarperSupervisionPacket, measureEditorial } from '@/lib/editorialSupervisor'
import { applyEditorialReviewPatch } from '@/lib/seoFactory/editorialReviewPatch'
import { applyEditorialRevision, parseEditorialRevision } from '@/lib/seoFactory/editorialRevision'
import { countBodyWords } from '@/lib/seoFactory/contentDepth'
import { contentFingerprint } from '@/lib/seoFactory/currentGate'
import { DRAFT_HARD_MAX_CHARS } from '@/lib/seoFactory/draftIntegrity'
import type { EditorSeoHint } from '@/lib/editorMetrics'
import type { HarperLintSummary } from '@/lib/harperBrowser'

export const maxDuration = 180

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    const body = await request.json()
    const content = typeof body.content === 'string' ? body.content : ''
    if (content.length > DRAFT_HARD_MAX_CHARS || countBodyWords(content) < 40) {
      return NextResponse.json({
        error: `Editorial review needs 40+ body words and at most ${DRAFT_HARD_MAX_CHARS.toLocaleString()} characters; no partial review is marked complete.`,
      }, { status: 400 })
    }

    // Harper runs in the admin browser, but its output is bound to the exact
    // body it linted. Stale findings are not allowed to supervise a newer
    // revision, even if the stale scores happen to look perfect.
    const grammar = body.grammar as HarperLintSummary | null
    if (!grammar || !Array.isArray(grammar.items)) {
      return NextResponse.json({ error: 'Fresh Harper findings required' }, { status: 400 })
    }
    const fingerprint = contentFingerprint(content)
    if (grammar.fingerprint !== fingerprint || grammar.sourceCharacters !== content.length) {
      return NextResponse.json({
        error: 'Harper findings are stale for this draft. Re-lint the exact current body before the model is allowed to edit it.',
        expectedFingerprint: fingerprint,
      }, { status: 409 })
    }

    const hint: EditorSeoHint = body.hint || {}
    const snapshot = measureEditorial(content, hint, grammar)
    const supervision = buildHarperSupervisionPacket(snapshot)
    const mustApplyIds = supervision.directives.filter((d) => d.mustApply).map((d) => d.id)
    const pendingIds = (supervision.pending || supervision.directives).map((d) => d.id)
    const reviewPin = typeof body.reviewModel === 'string' && body.reviewModel.trim()
      ? body.reviewModel.trim()
      : DEFAULT_REVIEW_PIN
    const response = await generateContentText({
      aiProvider: reviewPin,
      exclusive: true,
      // Harper executes the operator's selected reviewer only. Cascading to
      // Entrim (or any unselected host) after a Grok abort produced 401s on
      // proxy tokens the operator never chose as the review model.
      cascadeOnCapacity: false,
      system: `You are the EXECUTOR beneath the Harper Editorial Supervisor. Harper/deterministic measurements are the authority; you do not override, reinterpret, or self-score them.

You receive HARPER_SUPERVISION (packet version 2) with gates GRAMMAR, SEO, AI_WRITE/HUMAN_VOICE, and FLESCH. Style leftovers are advisory and do not block ship. Treat every mustApply directive as an instruction to implement.

Return ONLY EditorialRevision v2 JSON:
{"version":2,"mode":"document","document":"<full markdown>","appliedIds":["..."],"waivedIds":[]}
You MAY return mode "sections" with H2 replacements:
{"version":2,"mode":"sections","sections":[{"heading":"Eligibility","replacement":"..."}],"appliedIds":["..."],"waivedIds":[]}

EXECUTION RULES — NON-NEGOTIABLE:
- Read the ENTIRE document and the complete HARPER_SUPERVISION packet before rewriting.
- You MUST cover every mustApply directive id in appliedIds or waivedIds.
- Full document rewrite of prose is allowed. Preserve facts, URLs, numbers, legal qualifiers (must/not/never/may/cannot/unless), disclaimer, sources, heading topics, schema and frontmatter.
- Work from the packet, not from your own imagined score. Never say a score passed; the supervisor re-runs Harper + SEO + voice + Flesch on your returned body.
- Fix Harper grammar/spelling/punctuation findings in context. Use Harper's suggested fix as intent, not as blind string replacement.
- For Flesch, shorten dense sentences and use plain English without deleting legal/technical qualifications or changing dates, amounts, program names, obligations or exceptions.
- For SEO, integrate missing wording only where it answers the reader naturally. Never keyword-stuff, paste search phrases into headings, or create unsupported claims.
- For AI_WRITE/HUMAN_VOICE, remove robotic repetition, generic filler and unnatural phrasing while keeping the author's meaning, factual scope and tone.
- Never invent experience, fees, dates, URLs, testimonials, statistics or citations.
- Structural SEO gaps belong to the outer Audit & Fix loop; never fabricate markup here.
- Do NOT return EditorPatch 12-line format as the primary protocol.
- Do NOT return empty document while pending required directives exist. An empty revision does not clear anything; the supervisor will hold the draft.
- No preamble, markdown fence, or commentary if possible.`,
      prompt: JSON.stringify({
        HARPER_SUPERVISION: supervision,
        document: content,
        brief: hint,
      }),
      maxTokens: 8192,
      timeoutMs: 180_000,
      strictTimeout: false,
      skipQualityContract: true,
      disableThinking: true,
      reasoningEffort: 'low',
    })
    const parsed = parseEditorialRevision(response.text)
    if (!parsed.ok) {
      if ('fallback' in parsed && parsed.fallback === 'v1') {
        const patched = applyEditorialReviewPatch(content, response.text)
        return NextResponse.json({
          ...patched,
          appliedIds: [],
          waivedIds: [],
          supervisionFingerprint: supervision.fingerprint,
          directiveCount: supervision.directives.length,
          unmet: supervision.unmet,
          pendingIds,
        })
      }
      throw new Error(parsed.reason)
    }
    const patched = applyEditorialRevision(content, parsed.revision, { mustApplyIds, protectFacts: true })
    return NextResponse.json({
      content: patched.content,
      clean: patched.clean,
      appliedIds: patched.appliedIds,
      waivedIds: patched.waivedIds,
      supervisionFingerprint: supervision.fingerprint,
      directiveCount: supervision.directives.length,
      unmet: supervision.unmet,
      pendingIds,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Editorial review failed' }, { status: 502 })
  }
}
