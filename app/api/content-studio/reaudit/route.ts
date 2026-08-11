import { NextRequest, NextResponse } from 'next/server'
import { generateContentText } from '@/lib/contentAiProvider'
import { buildWarningsFixPrompt, type InlineAnnotation } from '@/lib/seoFactory/inlineAnnotations'
import { applyDeterministicRepairs } from '@/lib/seoFactory/editorialScaffold'
import { evaluateReauditContract, type ReauditResponse } from '@/lib/seoFactory/reauditContract'
import { auditLinksLive, stripDeadLinks } from '@/lib/seoFactory/linkAudit'

export type { ReauditResponse }

// ---------- AI-powered fix endpoints ----------

/**
 * AI fix through the canonical content AI provider chain
 * (NVIDIA DeepSeek V4 Pro → Cloudflare → Groq → Gemini → OpenRouter → …).
 * Same engine the generator uses, so fix prompts get the same model
 * routing, retries and fallbacks as first-pass generation.
 */
const FIX_TIMEOUT_MS = Math.max(
  15_000,
  Number.parseInt(process.env.CONTENT_STUDIO_FIX_TIMEOUT_MS || '240000', 10) || 240_000,
)

/** Hard deadline so an AI fix can never hang the request past the Worker limit. */
function withDeadline<T>(ms: number, label: string, promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s — your draft was auto-saved. Re-audit or fix the issue inline.`)),
          ms,
        )
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function callAiFix(sys: string, prompt: string, maxTokens = 16384): Promise<string> {
  // GPT-5.6 Sol is the senior editor / quality reviewer. It has flagship
  // reasoning capability and evaluates gate compliance with higher accuracy
  // than Terra (Research) or Luna (high-volume drafting). The provider
  // cascade (auto) tries configured providers in order; each will use its
  // own default model unless overridden, so Sol only applies to OpenAI.
  const result = await withDeadline(FIX_TIMEOUT_MS, 'AI fix', generateContentText({
    system: sys,
    prompt,
    maxTokens,
    temperature: 0.2,
    // GPT Sol is the reviewer — pass model override for OpenAI providers.
    // Non-OpenAI providers ignore this and use their own default.
    model: 'gpt-5.6-sol',
  }))
  const text = (result?.text || '').trim()
  if (!text) throw new Error('AI fix returned empty content')
  return text
}


/** Best-effort live link audit: structural checks already run in the quality
 *  gate; this adds real HTTP verification of internal links so dead or
 *  invented links (2026-08 example.com incident) block ship with evidence.
 *  After the audit, mechanically strips every dead link so the AI editor
 *  and ship gate never see a URL that doesn't resolve. */
async function mergeLinkAudit(response: ReauditResponse, content: string): Promise<string> {
  let effective = content
  try {
    const findings = await auditLinksLive(content)
    if (!findings.length) return effective
    const blockers = findings.filter((f) => f.severity === 'blocker')
    const warnings = findings.filter((f) => f.severity === 'warning')

    // ── Mechanical strip: remove every dead/unreachable/placeholder URL ──
    const deadUrls = findings
      .filter((f) => f.code === 'dead_internal_link' || f.code === 'placeholder_link' || f.code === 'unreachable_internal_link')
      .map((f) => f.url)
    if (deadUrls.length > 0) {
      const { content: cleaned, stripped } = stripDeadLinks(content, deadUrls)
      if (stripped > 0) {
        effective = cleaned
        response.appliedRepairs = [...(response.appliedRepairs || []), `stripped ${stripped} dead link${stripped === 1 ? '' : 's'}`]
      }
    }

    // Re-count after strip — only dead links we couldn't mechanically fix
    const remainingBlockers = blockers.filter(
      (f) => !deadUrls.includes(f.url),
    )
    const remainingWarnings = warnings.filter(
      (f) => !deadUrls.includes(f.url),
    )
    if (remainingBlockers.length) {
      response.ok = false
      response.shipReady = false
    }
    response.blockers = (response.blockers || 0) + remainingBlockers.length
    response.warnings = (response.warnings || 0) + remainingWarnings.length
    response.warningsData = [
      ...(response.warningsData || []),
      ...[...remainingBlockers, ...remainingWarnings].map((f) => ({
        code: f.code,
        message: f.message,
        fix: f.code === 'placeholder_link'
          ? 'Replace with a verified estate URL from the research-stage INTERNAL LINK ALLOWLIST.'
          : f.code === 'dead_internal_link'
            ? 'Point the link at a live estate URL (re-verify in the link audit).'
            : 'Re-verify the URL before shipping.',
      })),
    ]
    response.linkAudit = findings
    return effective
  } catch {
    // Live audit is best-effort; the structural gate still enforces placeholders.
    return effective
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      content: string; contentType?: string; primaryKeyword?: string; indexable?: boolean
      requiredShortKeywords?: string[]; requiredLongTailKeywords?: string[]
    }
    const { content, contentType, primaryKeyword, indexable, requiredShortKeywords, requiredLongTailKeywords } = body
    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'content string required' }, { status: 400 })
    }
    // Deterministic compliance repair first: a missing disclaimer or broken
    // reader TOC is a mechanical fix — apply it now so the audit reflects the
    // content that can actually ship, and return the repaired draft so the
    // editor shows the cleared state (no more "100/100 but blocked").
    // indexable/contentType pass through so the YMYL disclaimer is not forced
    // onto marketplace gigs or non-indexable content.
    const repaired = applyDeterministicRepairs({
      content,
      primaryKeyword: primaryKeyword || 'guide',
      indexable,
      contentType,
    })
    let effective = repaired.content
    // Contract evaluation (quality gate + audit + warningsData merge + depth
    // gate + shipReady) is shared with PATCH — see lib/seoFactory/reauditContract.
    const response: ReauditResponse = {
      ...evaluateReauditContract({
        content: effective,
        contentType,
        primaryKeyword,
        indexable,
        requiredShortKeywords,
        requiredLongTailKeywords,
      }),
    }
    effective = await mergeLinkAudit(response, effective)
    if (repaired.applied.length && effective !== content) {
      response.fixedContent = effective
      response.appliedRepairs = repaired.applied
    }
    return NextResponse.json(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Re-audit failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}


export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json() as {
      action: 'fix_all' | 'fix_one' | 'fix_warnings'
      content: string
      annotations?: InlineAnnotation[]
      annotation?: InlineAnnotation
      /** Warnings-only payload for the fix_warnings sweep (evidence-less
       *  warnings included — these previously had no fix path at all). */
      warnings?: Array<{ code: string; message: string; fix?: string }>
      contentType?: string
      primaryKeyword?: string
      indexable?: boolean
      requiredShortKeywords?: string[]
      requiredLongTailKeywords?: string[]
    }
    const { action, content, annotations, annotation, warnings, contentType, primaryKeyword, indexable, requiredShortKeywords, requiredLongTailKeywords } = body
    if (!content || !action) {
      return NextResponse.json({ error: 'content and action required' }, { status: 400 })
    }

    let fixedContent: string

    if (action === 'fix_all' && annotations && annotations.length > 0) {
      // Build a comprehensive fix prompt listing every issue
      const blockerList = annotations
        .filter((a) => a.severity === 'blocker')
        .map((a) => `Line ${a.line}: [${a.code}] ${a.message} -> "${a.highlightedText}" -> Fix: ${a.fix}`)
        .join('\n')
      const warningList = annotations
        .filter((a) => a.severity === 'warning')
        .map((a) => `Line ${a.line}: [${a.code}] ${a.message} -> "${a.highlightedText}"`)
        .join('\n')

      const sys = 'You are a master SEO content editor. Fix ALL quality issues in the provided article while preserving its structure, facts, headings, and interlinks. Return ONLY the complete fixed article. Do not add explanations.'
      const prompt = `## Original Article

${content}

## QUALITY ISSUES TO FIX (BLOCKERS - MUST FIX)
${blockerList}

## WARNINGS (FIX WHERE POSSIBLE)
${warningList}

## INSTRUCTIONS
1. Fix EVERY blocker listed above - these are mandatory
2. Vary sentence openings: no more than 2 consecutive sentences starting with the same word
3. Replace AI cliches like "delve", "unlock", "In today's digital landscape" with natural language
4. Add specific data, examples, or concrete details where the article is vague
5. Keep all original headings, interlinks, and key facts intact
6. Return the COMPLETE fixed article, nothing else`

      fixedContent = await callAiFix(sys, prompt, 16384)

    } else if (action === 'fix_one' && annotation) {
      const sys = 'You are a surgical content editor. Fix ONLY the specified issue. Return ONLY the full article with that one fix applied. Do not change anything else.'
      // Document-level warnings (schema, meta description, internal links,
      // AI-answer block…) anchor at line 1 with no highlighted text. Give the
      // model concrete context instead of an empty quote so the fix is precise.
      const snippet = annotation.highlightedText.trim() || content.split('\n').find((l) => /^#{1,3}\s/.test(l.trim()))?.trim() || content.slice(0, 80)
      const prompt = `## Article

${content}

## Issue to Fix
- Line ${annotation.line}: [${annotation.code}] ${annotation.message}
- Problematic text: "${snippet}"
- Suggested fix: ${annotation.fix}

## Instructions
Fix ONLY this specific issue. Keep everything else exactly the same. Return the COMPLETE article.`

      fixedContent = await callAiFix(sys, prompt, 8192)

    } else if (action === 'fix_warnings' && warnings && warnings.length) {
      // Warnings-only sweep. Many quality warnings (tone_whilst, emdash_spam,
      // missing_second_person, wall_of_text, missing_reader_path…) carry no
      // inline evidence, so they were never fixable before. The sweep prompt
      // lists them with their remediation and asks for minimal edits.
      const sys = 'You are a master SEO content editor. Resolve the listed quality warnings with minimal edits. Preserve every heading, fact, official citation, and interlink. Return ONLY the complete article.'
      fixedContent = await callAiFix(sys, buildWarningsFixPrompt(content, warnings), 16384)

    } else {
      return NextResponse.json({ error: 'Invalid action or missing annotations/warnings' }, { status: 400 })
    }

    // Sanity: never let a truncated/partial rewrite silently replace the article.
    const fixedWords = fixedContent.split(/\s+/).filter(Boolean).length
    const originalWords = Math.max(1, content.split(/\s+/).filter(Boolean).length)
    if (fixedWords < Math.max(20, Math.round(originalWords * 0.4))) {
      throw new Error(
        `AI fix returned a partial rewrite (${fixedWords} words vs ${originalWords} original) and was discarded. Your draft is unchanged — try Fix again or edit inline.`,
      )
    }

    // Deterministic repair after AI fix — the model may still omit the
    // disclaimer; we never ship a draft that a mechanical fix can clear.
    const repaired = applyDeterministicRepairs({
      content: fixedContent,
      primaryKeyword: primaryKeyword || 'guide',
      indexable: body.indexable,
      contentType,
    })
    fixedContent = repaired.content

    // Re-evaluate the fixed content — contract evaluation (quality gate +
    // audit + warningsData merge + depth gate + shipReady) shared with POST.
    const response: ReauditResponse = {
      ...evaluateReauditContract({
        content: fixedContent,
        contentType,
        primaryKeyword,
        indexable,
        requiredShortKeywords,
        requiredLongTailKeywords,
      }),
      fixedContent,
    }
    fixedContent = await mergeLinkAudit(response, fixedContent)
    if (repaired.applied.length) response.appliedRepairs = repaired.applied
    return NextResponse.json(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI fix failed'
    const timedOut = /timed out/i.test(message)
    return NextResponse.json({ error: message, timedOut }, { status: timedOut ? 504 : 500 })
  }
}