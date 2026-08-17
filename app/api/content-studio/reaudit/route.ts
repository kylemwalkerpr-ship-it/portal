import { NextRequest, NextResponse } from 'next/server'
import { generateContentText, grokModelId } from '@/lib/contentAiProvider'
import { buildBlockersFixPrompt, buildWarningsFixPrompt, findingToAnnotations, type InlineAnnotation } from '@/lib/seoFactory/inlineAnnotations'
import { applyDeterministicRepairs } from '@/lib/seoFactory/editorialScaffold'
import { depthMediationPlan, evaluateReauditContract, type ReauditResponse } from '@/lib/seoFactory/reauditContract'
import { masterEngineFixPlan, type MasterEngineFixPlan } from '@/lib/seoFactory/masterEngine'
import { mergeAppendedSections } from '@/lib/seoFactory/prompts'
import { countBodyWords, maxWordsForType, minWordsForType } from '@/lib/seoFactory/contentDepth'
import { auditLinksLive, sanitizeDraftLinksLive } from '@/lib/seoFactory/linkAudit'

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

async function callAiFix(sys: string, prompt: string, maxTokens = 16384, reviewModel?: string): Promise<string> {
  // GPT-5.6 Sol is the senior editor / quality reviewer. It has flagship
  // reasoning capability and evaluates gate compliance with higher accuracy
  // than Terra (Research) or Luna (high-volume drafting).
  const effectiveModel = reviewModel || 'gpt-5.6-sol'
  // Pin the provider so the selected review model actually applies:
  //   · gpt-5.6* → OpenAI (otherwise the default cascade runs the fix on
  //     NVIDIA DeepSeek and silently ignores the gpt-5.6 model name)
  //   · GLM 5.2 Fast → Baseten (the efficient open-source editor)
  //   · GLM 5.2 Fast via AIHubmix → the OpenAI-compatible aggregator route
  //   · DeepSeek V4 Flash 0731 → Baseten (the reasoning review heavyweight)
  //   · anything else (legacy/custom) → normal cascade
  const isGpt = /^gpt-5\.6/i.test(effectiveModel)
  const isGrok = effectiveModel === 'grok' || /^grok/i.test(effectiveModel)
  const isGlmFast =
    effectiveModel === 'baseten-glm-fast' || effectiveModel === 'glm-5.2-fast'
  const isAihubmixGlmFast =
    effectiveModel === 'aihubmix-glm-fast' || effectiveModel === 'aihubmix-glm' || effectiveModel === 'glm-fast-aihubmix'
  const isDeepseekFlash =
    effectiveModel === 'baseten-deepseek' ||
    effectiveModel === 'deepseek-v4-flash' ||
    effectiveModel === 'deepseek-ai/deepseek-v4-flash-0731'
  const aiProvider = isGpt
    ? 'openai'
    : isGrok
      ? 'grok'
      : isGlmFast
        ? 'baseten-glm-fast'
        : isAihubmixGlmFast
          ? 'aihubmix-glm-fast'
          : isDeepseekFlash
            ? 'baseten-deepseek'
            : undefined
  const result = await withDeadline(FIX_TIMEOUT_MS, 'AI fix', generateContentText({
    system: sys,
    prompt,
    maxTokens,
    temperature: 0.2,
    aiProvider,
    model: isGrok ? grokModelId({ model: effectiveModel }) : effectiveModel,
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
async function mergeLinkAudit(
  response: ReauditResponse,
  content: string,
  region?: string,
  targetUrl?: string,
  topic?: string,
): Promise<string> {
  let effective = content
  try {
    const sanitized = await sanitizeDraftLinksLive(content, {
      region,
      topic,
      knownLiveUrls: targetUrl ? [targetUrl] : undefined,
    })
    effective = sanitized.content
    const findings = sanitized.findings
    if (sanitized.remediations?.length) {
      response.appliedRepairs = [
        ...(response.appliedRepairs || []),
        ...sanitized.remediations.map((r) =>
          r.action === 'replaced'
            ? `replaced dead ${r.deadUrl} with ${r.replacement?.title || r.replacement?.url}`
            : r.action === 'removed_and_injected'
              ? `removed ${r.deadUrl} and cited ${r.replacement?.title || r.replacement?.url}`
              : `removed dead ${r.deadUrl}`,
        ),
      ]
    } else if (sanitized.stripped) {
      response.appliedRepairs = [
        ...(response.appliedRepairs || []),
        `stripped ${sanitized.stripped} dead/untrusted link${sanitized.stripped === 1 ? '' : 's'}`,
      ]
    }
    if (sanitized.injected && !sanitized.remediations?.some((r) => r.action === 'removed_and_injected')) {
      response.appliedRepairs = [
        ...(response.appliedRepairs || []),
        `injected ${sanitized.injected} live official source${sanitized.injected === 1 ? '' : 's'}`,
      ]
    }
    if (!findings.length && !sanitized.stripped && !sanitized.injected) return effective

    const remaining = await auditLinksLive(effective, {
      knownLiveUrls: targetUrl ? [targetUrl] : undefined,
    })
    const blockers = remaining.filter((f) => f.severity === 'blocker')
    const warnings = remaining.filter((f) => f.severity === 'warning')
    const linkFix = (code: string) =>
      code === 'placeholder_link'
        ? 'Replace with a verified estate URL from the research-stage INTERNAL LINK ALLOWLIST.'
        : code === 'dead_internal_link'
          ? 'Read the surrounding sentence. Swap this href for a live estate hub that matches the claim, or remove it and add a verified official citation nearby.'
          : code === 'dead_external_link'
            ? 'Read the surrounding sentence. Swap this href for a live official government/school page that supports the same claim, or remove it and add that citation under Official sources.'
            : code === 'untrusted_external_link'
              ? 'Drop competitor/blog/news/Wikipedia/shortener hrefs. Keep the sentence and cite a live official government, school, or named authority source instead.'
              : code === 'irrelevant_external_link'
                ? 'This official URL does not support the claim. Swap it for an on-topic live authority page, or remove the hyperlink.'
              : 'Re-verify the URL before shipping.'
    if (blockers.length) {
      response.ok = false
      response.shipReady = false
    }
    response.blockers = (response.blockers || 0) + blockers.length
    response.warnings = (response.warnings || 0) + warnings.length
    response.blockersData = [
      ...(response.blockersData || []),
      ...blockers.map((f) => ({ code: f.code, message: f.message, fix: linkFix(f.code) })),
    ]
    response.warningsData = [
      ...(response.warningsData || []),
      ...warnings.map((f) => ({ code: f.code, message: f.message, fix: linkFix(f.code) })),
    ]
    const linkAnns = blockers.flatMap((f) =>
      findingToAnnotations(effective, {
        code: f.code,
        severity: 'blocker',
        message: f.message,
        fix: linkFix(f.code),
        evidence: f.url,
      }),
    )
    response.annotations = [...(response.annotations || []), ...linkAnns]
    response.linkAudit = remaining
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
      jobId?: string
      region?: string
    }
    const { content, contentType, primaryKeyword, indexable, requiredShortKeywords, requiredLongTailKeywords, jobId, region } = body
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
      region,
      indexable,
      contentType,
      requiredShortKeywords,
      requiredLongTailKeywords,
    competingUrls: (body as any).competingUrls,
      targetUrl: (body as any).targetUrl,
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
        region,
      }),
    }
    effective = await mergeLinkAudit(response, effective, region, (body as { targetUrl?: string }).targetUrl, primaryKeyword)
    if (effective !== content) {
      response.fixedContent = effective
      response.appliedRepairs = [...repaired.applied, ...(response.appliedRepairs || []).filter((r) => !repaired.applied.includes(r))]
    }
    if (jobId && response.shipReady) {
      try {
        const { createSupabaseAdminClient } = await import('@/lib/supabase')
        const db = createSupabaseAdminClient()
        const { data: row } = await db.from('content_jobs').select('status').eq('id', jobId).maybeSingle()
        const patch: Record<string, unknown> = {
          error_message: null,
          content: effective,
          seo_score: response.score,
          word_count: countBodyWords(effective),
          indexable: true,
        }
        if (row?.status === 'failed') patch.status = 'drafting'
        await db.from('content_jobs').update(patch).eq('id', jobId)
      } catch {
        /* persist is best-effort — the editor already has the passing draft */
      }
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
      action: 'fix_all' | 'fix_one' | 'fix_warnings' | 'fix_depth' | 'fix_blockers'
      content: string
      annotations?: InlineAnnotation[]
      annotation?: InlineAnnotation
      /** Warnings-only payload for the fix_warnings sweep (evidence-less
       *  warnings included — these previously had no fix path at all). */
      warnings?: Array<{ code: string; message: string; fix?: string }>
      blockers?: Array<{ code: string; message: string; fix?: string }>
      contentType?: string
      primaryKeyword?: string
      indexable?: boolean
      region?: string
      requiredShortKeywords?: string[]
      requiredLongTailKeywords?: string[]
      /** SERP competitor snippets (Discover/Research stage) — feed the
       *  reviewer's engine analysis a real consensus baseline instead of the
       *  deterministic floor. */
      competingSnippets?: string[]
      /** Pages already targeting the same intent (cannibalization). */
      competingUrls?: string[]
      /** Override the review model (gpt-5.6-sol by default). Set to
       *  gpt-5.6-terra for faster, lower-cost non-critical fixes. */
      reviewModel?: string
    }
    const { action, content, annotations, annotation, warnings, blockers, contentType, primaryKeyword, indexable, region, requiredShortKeywords, requiredLongTailKeywords, competingSnippets, competingUrls, reviewModel } = body
    if (!content || !action) {
      return NextResponse.json({ error: 'content and action required' }, { status: 400 })
    }

    let fixedContent: string
    // Master Engine fix plan — the engine's highest-priority gaps, rendered
    // into a prompt block so fix_all / fix_warnings address the highest-
    // expected-value gaps FIRST instead of letting the model free-form. Pure
    // local computation (no AI, no network), computed lazily for the actions
    // that consume it.
    let enginePlan: MasterEngineFixPlan | null = null
    // Depth-mediation plan — hoisted so the appliedRepairs block below can
    // report the floor numbers after the append-only expansion runs.
    let depthPlan = depthMediationPlan(content, contentType, primaryKeyword, region)
    // True when fix_warnings routed word_count_target through the append-only
    // depth expansion (the sweep cannot pad) — lets the appliedRepairs block
    // report the growth like fix_depth does.
    let depthExpandedForWarnings = false

    if (action === 'fix_all' && annotations && annotations.length > 0) {
      // Master Engine gaps FIRST — the model must tackle the highest-priority
      // expected-value gaps (internal links, schema, citations, YMYL trust…) in
      // order before the annotation sweep, so the rewrite converges on the
      // strategic gaps rather than only the mechanical issues.
      enginePlan = masterEngineFixPlan({
        content,
        primaryKeyword,
        contentType,
        region,
        indexable,
        competingSnippets,
        competingUrls,
      })
      // Build a comprehensive fix prompt listing every issue
      const blockerList = annotations
        .filter((a) => a.severity === 'blocker')
        .map((a) => `Line ${a.line}: [${a.code}] ${a.message} -> "${a.highlightedText}" -> Fix: ${a.fix}`)
        .join('\n')
      const warningList = annotations
        .filter((a) => a.severity === 'warning')
        .map((a) => `Line ${a.line}: [${a.code}] ${a.message} -> "${a.highlightedText}"`)
        .join('\n')

      const sys = 'You are a master SEO content editor. Fix ALL quality issues in the provided article while preserving its structure, facts, headings, and interlinks. For dead links: read the surrounding sentence and either swap in a live official/estate URL that fits the claim, or remove the href and add a new verifiable citation. Never invent URLs. Return ONLY the complete fixed article. Do not add explanations.'
      const prompt = `${enginePlan.promptBlock}
## Original Article

${content}

## QUALITY ISSUES TO FIX (BLOCKERS - MUST FIX)
${blockerList}

## WARNINGS (FIX WHERE POSSIBLE)
${warningList}

## INSTRUCTIONS
1. Address the PRIORITIZED ENGINE GAPS first, in the exact order listed — highest expected value first
2. Then fix EVERY blocker listed above - these are mandatory
3. Dead/untrusted links: read the sentence around each URL. Prefer an in-place swap to a live official .gov/.edu or estate hub that matches the claim. If the anchor is a competitor/placeholder, drop the href and introduce a new verifiable citation in that paragraph or under ## Official sources.
4. Vary sentence openings: no more than 2 consecutive sentences starting with the same word
5. Replace AI cliches like "delve", "unlock", "In today's digital landscape" with natural language
6. Add specific data, examples, or concrete details where the article is vague
7. Keep all original headings, interlinks, and key facts intact
8. Return the COMPLETE fixed article, nothing else`

      fixedContent = await callAiFix(sys, prompt, 16384, reviewModel)

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

      fixedContent = await callAiFix(sys, prompt, 8192, reviewModel)

    } else if (action === 'fix_warnings' && warnings && warnings.length) {
      // Warnings-only sweep. Many quality warnings (tone_whilst, emdash_spam,
      // missing_second_person, wall_of_text, missing_reader_path…) carry no
      // inline evidence, so they were never fixable before. The sweep prompt
      // lists them with their remediation and asks for minimal edits.
      //
      // word_count_target is special: the sweep is told NOT to pad, so it can
      // never add the missing words. Route it through the append-only depth
      // expansion (same as fix_depth) so "Fix all warnings" actually clears it.
      fixedContent = content
      const hasDepthWarning = warnings.some((w) => w.code === 'word_count_target')
      if (hasDepthWarning) {
        depthPlan = depthMediationPlan(content, contentType, primaryKeyword, region)
        if (!depthPlan.ok && depthPlan.prompt) {
          const sys = 'You are a master SEO content editor expanding an immigration article to clear its word-count target. Write ONLY new markdown H2 sections (no front matter, no JSON-LD, no duplicate of existing headings). Preserve every existing section, fact, citation, and interlink. Return ONLY the new sections.'
          const appended = await callAiFix(sys, depthPlan.prompt || '', 16384, reviewModel)
          const merged = mergeAppendedSections(content, appended)
          if (countBodyWords(merged) > countBodyWords(content)) {
            fixedContent = merged
            depthExpandedForWarnings = true
          }
        }
      }
      // Sweep the REMAINING warnings with minimal edits (depth already handled
      // above — do not ask the sweep to pad on top of the expansion).
      const rest = warnings.filter((w) => w.code !== 'word_count_target')
      if (rest.length) {
        // The sweep is minimal-edit by design, but it still gets the engine's
        // top gaps so structure-level wins (reader path, second person,
        // table/example) are addressed before the fine-grained polish.
        enginePlan = masterEngineFixPlan({
          content,
          primaryKeyword,
          contentType,
          region,
          indexable,
          competingSnippets,
          competingUrls,
        })
        const sys = `You are a master SEO content editor. Resolve the listed quality warnings with minimal edits. Preserve every heading, fact, official citation, and interlink. Return ONLY the complete article.

${enginePlan.promptBlock}`
        fixedContent = await callAiFix(sys, buildWarningsFixPrompt(fixedContent, rest), 16384, reviewModel)
      }

    } else if (action === 'fix_blockers' && (blockers?.length || annotations?.some((a) => a.severity === 'blocker'))) {
      // Mechanical first (Ahrefs title/meta/H1/canonical/OG/schema + dead links),
      // then a targeted AI sweep only if blockers remain.
      const list = (blockers && blockers.length
        ? blockers
        : (annotations || [])
            .filter((a) => a.severity === 'blocker')
            .map((a) => ({ code: a.code, message: a.message, fix: a.fix })))
      const mechanical = applyDeterministicRepairs({
        content,
        primaryKeyword: primaryKeyword || 'guide',
        region,
        indexable,
        contentType,
        requiredShortKeywords,
        requiredLongTailKeywords,
        targetUrl: (body as { targetUrl?: string }).targetUrl,
      })
      const sanitized = await sanitizeDraftLinksLive(mechanical.content, {
        region,
        topic: primaryKeyword,
        knownLiveUrls: (body as { targetUrl?: string }).targetUrl
          ? [(body as { targetUrl?: string }).targetUrl as string]
          : undefined,
      })
      const afterMech = evaluateReauditContract({
        content: sanitized.content,
        contentType,
        primaryKeyword,
        indexable,
        requiredShortKeywords,
        requiredLongTailKeywords,
        region,
      })
      const leftoverLinks = (await auditLinksLive(sanitized.content)).filter((f) => f.severity === 'blocker')
      if (afterMech.ok && leftoverLinks.length === 0) {
        fixedContent = sanitized.content
      } else {
        const leftover = [
          ...afterMech.blockersData,
          ...leftoverLinks.map((f) => ({ code: f.code, message: f.message, fix: 'Remove or replace the dead URL.' })),
        ]
        const sys = 'You are a master SEO content editor. Clear EVERY listed ship blocker with the smallest possible edit. Return ONLY the complete article.'
        fixedContent = await callAiFix(sys, buildBlockersFixPrompt(sanitized.content, leftover.length ? leftover : list), 16384, reviewModel)
      }

    } else if (action === 'fix_depth') {
      // DEPTH MEDIATION — the Google depth floor AND the word_count_target
      // warning share one mechanism. A draft can be "100/100 quality" yet
      // ship-blocked at 1813/2200 words, or warning-listed at 2380/2200–2500.
      // The fix is append-only: buildDepthAppendPrompt asks the review model
      // to write NEW H2 sections (never touching existing content, which
      // already passed quality), and mergeAppendedSections splices them in
      // before the schema block. This preserves every passing section instead
      // of forcing a full rewrite that re-introduces voice/depth failures.
      depthPlan = depthMediationPlan(content, contentType, primaryKeyword, region)
      if (depthPlan.ok) {
        // Goal (floor OR target) already met — nothing to expand; keep the
        // draft as-is and re-evaluate below so the response reflects the true
        // state.
        fixedContent = content
      } else {
        const before = countBodyWords(content)
        const sys = 'You are a master SEO content editor expanding an immigration legal guide to clear the Google depth floor. Write ONLY new markdown H2 sections (no front matter, no JSON-LD, no duplicate of existing headings). Preserve every existing section, fact, citation, and interlink. Return ONLY the new sections.'
        const appended = await callAiFix(sys, depthPlan.prompt || '', 16384, reviewModel)
        const merged = mergeAppendedSections(content, appended)
        const after = countBodyWords(merged)
        if (after <= before) {
          throw new Error(
            `Depth expansion added no new words (${before} → ${after}). The model returned no usable sections — try again or expand sections manually.`,
          )
        }
        fixedContent = merged
      }

    } else {
      return NextResponse.json({ error: 'Invalid action or missing annotations/warnings' }, { status: 400 })
    }

    // Sanity: never let a truncated/partial rewrite silently replace the article.
    // Skip for fix_depth — append-only expansion is a strict superset (it can
    // only grow the draft), so the shrink guard would be meaningless.
    const fixedWords = countBodyWords(fixedContent)
    const originalWords = Math.max(1, countBodyWords(content))
    if (action !== 'fix_depth' && fixedWords < Math.max(20, Math.round(originalWords * 0.4))) {
      throw new Error(
        `AI fix returned a partial rewrite (${fixedWords} words vs ${originalWords} original) and was discarded. Your draft is unchanged — try Fix again or edit inline.`,
      )
    }

    // Deterministic repair after AI fix — the model may still omit the
    // disclaimer; we never ship a draft that a mechanical fix can clear.
    const repaired = applyDeterministicRepairs({
      content: fixedContent,
      primaryKeyword: primaryKeyword || 'guide',
      region,
      indexable: body.indexable,
      contentType,
      requiredShortKeywords,
      requiredLongTailKeywords,
      competingUrls: (body as any).competingUrls,
        targetUrl: (body as any).targetUrl,
      // The append prompt demands ≥500 new words even for a small target gap —
      // the deterministic trim keeps an overshooting expansion inside the
      // type's window (2026-08-13 regression: fix_depth overshot past max).
      maxWords: maxWordsForType(String(contentType || 'legal_guide')),
      minWords: minWordsForType(String(contentType || 'legal_guide')),
    })
    fixedContent = repaired.content

    // Depth mediation is append-only — record the growth so the editor can
    // show what actually happened (e.g. "expanded 1813 → 2261 words"). Report
    // it for fix_depth AND for the word_count_target branch of fix_warnings.
    let depthRepair: string | undefined
    if ((action === 'fix_depth' || depthExpandedForWarnings) && !depthPlan.ok) {
      const grewWords = countBodyWords(fixedContent)
      depthRepair = depthPlan.floorMet
        ? `expanded to ${grewWords} body words (target ${depthPlan.targetWords})`
        : `expanded to ${grewWords} body words (floor ${depthPlan.minWords}, target ~${depthPlan.targetWords})`
    }

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
        region,
      }),
      fixedContent,
      // Let the editor show which engine gaps the fix targeted, in order.
      ...(enginePlan ? { enginePriorities: enginePlan.priorities } : {}),
    }
    fixedContent = await mergeLinkAudit(response, fixedContent, region, (body as { targetUrl?: string }).targetUrl, primaryKeyword)
    const applied: string[] = []
    if (depthRepair) applied.push(depthRepair)
    if (repaired.applied.length) applied.push(...repaired.applied)
    if (response.appliedRepairs?.length) applied.push(...response.appliedRepairs)
    if (applied.length) response.appliedRepairs = [...new Set(applied)]
    return NextResponse.json(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI fix failed'
    const timedOut = /timed out/i.test(message)
    return NextResponse.json({ error: message, timedOut }, { status: timedOut ? 504 : 500 })
  }
}