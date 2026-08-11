import { NextRequest, NextResponse } from 'next/server'
import { generateContentText } from '@/lib/contentAiProvider'
import { buildWarningsFixPrompt, type InlineAnnotation } from '@/lib/seoFactory/inlineAnnotations'
import { applyDeterministicRepairs } from '@/lib/seoFactory/editorialScaffold'
import { evaluateReauditContract, type ReauditResponse } from '@/lib/seoFactory/reauditContract'

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
  const result = await withDeadline(FIX_TIMEOUT_MS, 'AI fix', generateContentText({
    system: sys,
    prompt,
    maxTokens,
    temperature: 0.2,
  }))
  const text = (result?.text || '').trim()
  if (!text) throw new Error('AI fix returned empty content')
  return text
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
    const effective = repaired.content
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
    if (repaired.applied.length) response.appliedRepairs = repaired.applied
    return NextResponse.json(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI fix failed'
    const timedOut = /timed out/i.test(message)
    return NextResponse.json({ error: message, timedOut }, { status: timedOut ? 504 : 500 })
  }
}