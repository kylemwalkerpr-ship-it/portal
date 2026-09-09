import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { generateContentText } from '@/lib/contentAiProvider'
import { DEFAULT_REVIEW_PIN } from '@/lib/contentAiCatalog'
import { buildHarperSupervisionPacket, measureEditorial } from '@/lib/editorialSupervisor'
import { applyEditorialReviewPatch } from '@/lib/seoFactory/editorialReviewPatch'
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
      system: `You are the EXECUTOR beneath the Harper Editorial Supervisor. Harper/deterministic measurements are the authority; you do not override, reinterpret, waive, or self-score them.

You receive HARPER_SUPERVISION with four co-equal gates: GRAMMAR, SEO, AI_WRITE/HUMAN_VOICE, and FLESCH. Treat every required directive as an instruction to implement when a safe prose-only edit can address it. Advisory directives guide naturalness and polish. You may not improve one gate by degrading another.

Return ONLY EditorPatch JSON:
{"version":1,"operations":[{"kind":"replace","findingCode":"editorial_review","anchor":"exact unique full prose line","expectedHash":"server fills this","replacement":"corrected full prose line"}]}.
Supported operation kind in this lane: replace. At most 12 operations per pass.

EXECUTION RULES — NON-NEGOTIABLE:
- Read the ENTIRE document and the complete HARPER_SUPERVISION packet before choosing edits.
- Work from the packet, not from your own imagined score. Never say a score passed; the supervisor re-runs Harper + SEO + voice + Flesch on your returned body.
- Fix Harper grammar/spelling/punctuation findings in context. Use Harper's suggested fix as intent, not as blind string replacement; re-check agreement, articles, punctuation and sentence meaning after the rewrite.
- For Flesch, shorten dense sentences and use plain English without deleting legal/technical qualifications or changing dates, amounts, program names, obligations or exceptions.
- For SEO, integrate missing wording only where it answers the reader naturally. Never keyword-stuff, paste search phrases into headings, or create unsupported claims.
- For AI_WRITE/HUMAN_VOICE, remove robotic repetition, generic filler and unnatural phrasing while keeping the author's meaning, factual scope and tone. Never invent personal experience, testimonials, statistics or citations.
- Preserve facts, citations, URLs, numbers, official names, legal qualifiers (must/not/never/may/cannot/unless), headings, metadata, tables, schema, links, disclaimers and section order. Structural SEO gaps belong to the outer Audit & Fix loop; never fabricate markup here.
- Every replacement must be the smallest complete-line edit that materially implements one or more supervisor directives.
- Do NOT return an empty operations array while HARPER_SUPERVISION.unmet is non-empty unless no safe prose-only edit exists. An empty patch does not clear anything; the supervisor will hold the draft.
- No preamble, markdown fence, explanation, commentary, alternative version, or full-document regeneration.`,
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
    const patched = applyEditorialReviewPatch(content, response.text)
    return NextResponse.json({
      ...patched,
      supervisionFingerprint: supervision.fingerprint,
      directiveCount: supervision.directives.length,
      unmet: supervision.unmet,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Editorial review failed' }, { status: 502 })
  }
}
