import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { generateContentText } from '@/lib/contentAiProvider'
import { DEFAULT_REVIEW_PIN } from '@/lib/contentAiCatalog'
import { anchorHash, applyEditorPatch, parseEditorPatch, type EditorPatch } from '@/lib/seoFactory/editorPatch'
import { countBodyWords, unwrapWholeDocumentFence } from '@/lib/seoFactory/contentDepth'

/**
 * POST /api/content-studio/style-review
 *
 * AI Style Review layer for the Article Editor ("Your AI model rewriting /
 * style / SEO / humanization"). One cascade call (default review model =
 * Genesis Review pin) that critiques the draft against the estate's voice
 * contract — clichés, wordy phrasing, weak/passive construction, forced
 * keywords, AI-tell rhythms, hedging, outcome-promise risk — and returns a
 * structured findings list. With `apply: true` a second pass executes the
 * findings as a surgical EditorPatch (never a full regenerate: heading,
 * frontmatter and link integrity are preserved, and each operation is
 * authorized by exactly one finding code).
 *
 * This is a REVIEW lane — the ship gates and Audit & Fix remain the
 * authority. Style findings are a human-in-the-loop enhancement, not a gate.
 */

type StyleItem = {
  category: string
  quote: string
  issue: string
  suggestion: string
}

type StyleReviewBody = {
  content: string
  primaryKeyword?: string
  contentType?: string
  jobId?: string
  apply?: boolean
  reviewModel?: string
}

const SYSTEM_PROMPT = `You are the YouSafe editorial style reviewer. You critique an immigration-law article for VOICE and READABILITY while a human editor decides what to change. Respond with ONLY a JSON object:

{"items":[{"category":"cliche|wordy|passive|forced_keyword|ai_tell|hedging|outcome_promise|rhythm|readability","quote":"exact short quote from the document","issue":"why it weakens the draft (1-2 sentences)","suggestion":"the concrete alternative wording"}]}

Rules:
- Return 0-8 items. Only genuine issues — no filler criticism, no padding to a target count.
- NEVER quote a URL, heading, frontmatter, <script> block, or table cell.
- \`quote\` must be an exact substring of the document (max 160 chars).
- \`suggestion\` must be concrete, writable prose the editor can paste.
- VOICE contract: calm, practitioner-grade, second person, plain English. BANNED: delve, streamline, game-changer, leverage (verb), robust, seamless, holistic, bespoke, unpack, navigate the complexities, "In today's fast-paced".
- YMYL: never suggest promising outcomes; flag any wording implying guarantees of visa approval, processing speed, or results as \`outcome_promise\`.
- \`forced_keyword\`: flag headings or sentences where a brief keyword is pasted word-for-word without natural need (e.g. a heading that IS the keyword string, a question like "is it possible to [keyword]"). Suggest a reader-facing reword.
- \`ai_tell\`: flag tell phrases ("delve", "it's essential to", "in conclusion", "navigating the landscape"), uniform sentence rhythm (4+ same-length declaratives in a row), and orphaned "next section walks through" promises.
- \`wordy\`: flag sentences that can lose 20%+ words without losing meaning.
- Keep the doc's second-person voice and legal caution; never suggest removing regulatory citations, numbers, or disclaimers.`

const APPLY_PROMPT = (items: StyleItem[]) => `## Findings to fix (fix ONLY these, exactly)
${items.map((it, i) => `${i + 1}. [${it.category}] "${it.quote}"
   → ${it.suggestion}`).join('\n')}

Apply each as the smallest surgical edit. Do not touch headings, frontmatter, code fences, <script> blocks, URLs, or table cells. Respond with ONLY the EditorPatch JSON:
{"version":1,"operations":[{"kind":"replace","findingCode":"style_review","anchor":"<exact full line>","replacement":"..."}]}
Also supported: "remove" (line only), "insert_after".`

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = (await request.json()) as StyleReviewBody
    const raw = String(body.content || '')
    if (countBodyWords(raw) < 40) {
      return NextResponse.json({ error: 'content must contain at least 40 words' }, { status: 400 })
    }
    const content = unwrapWholeDocumentFence(raw)
    const doc = content
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '[script-block]')
    const primary = String(body.primaryKeyword || '').trim()

    const sys = SYSTEM_PROMPT
    const prompt = `## Article

${doc.slice(0, 120_000)}

## Job context
${primary ? `Primary keyword: ${primary}` : 'No primary keyword supplied'}
Content type: ${body.contentType || 'unknown'}

Critique the voice and readability. Return ONLY the JSON.`

    const review = await generateContentText({
      system: sys,
      prompt,
      maxTokens: 2048,
      aiProvider: body.reviewModel || undefined,
    }).catch((err) => {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`style review provider failed: ${message}`)
    })

    const parsed = parseStyleJson(review.text)
    if (!parsed) {
      // Model ignored the JSON contract — surface the raw critique so the
      // editor is not lost, but never present it as structured findings.
      return NextResponse.json({ items: [], rawSnippet: review.text.slice(0, 600) })
    }

    if (!body.apply) {
      return NextResponse.json({ items: parsed.items, applied: false, provider: review.provider })
    }

    // Apply pass: surgical EditorPatch, one op per finding, hash-verified.
    const applyResult = await generateContentText({
      system: 'You are a surgical editorial copy editor. Respond with ONLY the EditorPatch JSON.',
      prompt: `## Document\n\n${doc}\n\n${APPLY_PROMPT(parsed.items)}`,
      maxTokens: 4096,
      aiProvider: body.reviewModel || undefined,
    }).catch((err) => {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`style apply provider failed: ${message}`)
    })

    const patchParsed = parseEditorPatch(applyResult.text)
    if (patchParsed.ok === false) {
      return NextResponse.json({ items: parsed.items, applied: false, reason: patchParsed.reason })
    }
    const patch: EditorPatch = {
      version: 1,
      operations: patchParsed.patch.operations.map((op) => ({
        ...op,
        expectedHash: anchorHash(content, op.anchor) || op.expectedHash,
      })),
    }
    const outcome = applyEditorPatch(content, patch, {
      outstanding: parsed.items.map((it) => ({
        code: 'style_review',
        repairClass: 'targeted_ai' as const,
      })),
    })
    if (!outcome.ok) {
      const reason = 'reason' in outcome ? outcome.reason : 'patch could not be applied'
      return NextResponse.json({ items: parsed.items, applied: false, reason })
    }
    return NextResponse.json({ items: parsed.items, applied: true, content: outcome.content })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Style review failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

function parseStyleJson(raw: string): { items: StyleItem[] } | null {
  try {
    const t = String(raw || '').trim()
    const start = t.indexOf('{')
    if (start === -1) return null
    const obj = JSON.parse(t.slice(start, t.lastIndexOf('}') + 1))
    if (!Array.isArray(obj.items)) return null
    const items: StyleItem[] = obj.items
      .filter((it) => it && typeof it.quote === 'string' && typeof it.issue === 'string')
      .slice(0, 10)
      .map((it) => ({
        category: String(it.category || 'style').slice(0, 24),
        quote: String(it.quote || '').slice(0, 160),
        issue: String(it.issue || '').slice(0, 240),
        suggestion: String(it.suggestion || '').slice(0, 320),
      }))
    return { items }
  } catch {
    return null
  }
}