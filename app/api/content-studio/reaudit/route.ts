import { NextRequest, NextResponse } from 'next/server'
import { generateContentText, grokModelId } from '@/lib/contentAiProvider'
import { parseStudioPin } from '@/lib/contentAiCatalog'
import { buildBlockersFixPrompt, buildWarningsFixPrompt, findingToAnnotations, type InlineAnnotation } from '@/lib/seoFactory/inlineAnnotations'
import { applyDeterministicRepairs } from '@/lib/seoFactory/editorialScaffold'
import { depthMediationPlan, evaluateReauditContract, leftoverAnnotationCodes, type ReauditResponse } from '@/lib/seoFactory/reauditContract'
import { masterEngineFixPlan, type MasterEngineFixPlan } from '@/lib/seoFactory/masterEngine'
import { mergeAppendedSections } from '@/lib/seoFactory/prompts'
import { countBodyWords, maxWordsForType, minWordsForType, unwrapWholeDocumentFence } from '@/lib/seoFactory/contentDepth'
import { auditLinksLive, sanitizeDraftLinksLive } from '@/lib/seoFactory/linkAudit'

export type { ReauditResponse }

/**
 * Resolve the canonical/target URL for a job so the Ahrefs canonical repair
 * can inject canonicalUrl into the front matter. The editor does not always
 * know the job's live estate URL, so when the request body omits targetUrl we
 * fall back to the job's stored canonical_url. Without this, ahrefs_canonical_missing
 * recurs on every re-audit because the repair never learns the URL.
 */
async function resolveTargetUrl(jobId?: string, bodyTargetUrl?: string): Promise<string | undefined> {
  if (bodyTargetUrl) return bodyTargetUrl
  if (!jobId) return undefined
  try {
    const { createSupabaseAdminClient } = await import('@/lib/supabase')
    const db = createSupabaseAdminClient()
    const { data } = await db
      .from('content_jobs')
      .select('canonical_url')
      .eq('id', jobId)
      .maybeSingle()
    const url = (data?.canonical_url || '').trim()
    return url || undefined
  } catch {
    return undefined
  }
}

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

/**
 * Resolve the actual upstream API model id for a reviewer pin. The studio
 * picker stores a pin (`nvidia-deepseek`, `parasail-deepseek-pro`, …), which
 * is NOT a model id — sending the pin as the model would 404. Real API ids
 * (containing a host slash) pass through untouched; pins map through the
 * catalog to the model's canonical apiModel (e.g. nvidia-deepseek →
 * deepseek-ai/DeepSeek-V4-Flash-0731).
 */
function reviewApiModel(pin: string): string | undefined {
  const raw = String(pin || '').trim()
  if (!raw) return undefined
  if (raw.includes('/')) return raw
  return parseStudioPin(raw).model.apiModel
}

async function callAiFix(sys: string, prompt: string, maxTokens = 16384, reviewModel?: string): Promise<string> {
  // DeepSeek V4 Flash via NVIDIA is the default reviewer. Flash is the
  // checkpoint NVIDIA currently serves — Pro-0813 is EOL on NVIDIA (410) and
  // must be routed to Parasail/Baseten/DeepSeek instead.
  const effectiveModel = reviewModel || 'nvidia-deepseek'
  // Pin the provider so the selected review model actually applies.
  const isGpt = /^gpt-5\.6/i.test(effectiveModel)
  const isGrok = effectiveModel === 'grok' || /^grok/i.test(effectiveModel)
  const isGlmFast =
    effectiveModel === 'baseten-glm-fast' || effectiveModel === 'glm-5.2-fast'
  const isAihubmixGlmFast =
    effectiveModel === 'aihubmix-glm-fast' || effectiveModel === 'aihubmix-glm' || effectiveModel === 'glm-fast-aihubmix'
  // The NVIDIA catalog id is the LOWERCASE form; the mixed-case form is the
  // Parasail/Baseten id of the same checkpoint. Either case of the Flash id
  // means NVIDIA (resolveAiProviderPin lowercases it to the NVIDIA pin) —
  // only bare legacy pins mean Baseten.
  const isNvidiaDeepseekModel =
    effectiveModel === 'deepseek-ai/deepseek-v4-flash-0731' ||
    effectiveModel === 'deepseek-ai/DeepSeek-V4-Flash-0731'
  const isDeepseekFlash =
    effectiveModel === 'baseten-deepseek' ||
    effectiveModel === 'deepseek-v4-flash'
  const isParasailDeepseekPro =
    effectiveModel === 'parasail' ||
    effectiveModel === 'parasail-deepseek-pro' ||
    effectiveModel === 'parasail-pro' ||
    effectiveModel === 'deepseek-v4-pro' ||
    effectiveModel === 'deepseek-ai/deepseek-v4-pro-0813' ||
    effectiveModel === 'deepseek-ai/DeepSeek-V4-Pro-0813'
  const isParasailDeepseek =
    effectiveModel === 'parasail-deepseek' ||
    effectiveModel === 'parasail-deepseek-v4-flash'
  const isParasailGlm =
    effectiveModel === 'parasail-glm' ||
    effectiveModel === 'parasail-glm-52' ||
    effectiveModel === 'parasail-glm-5.2' ||
    effectiveModel === 'nvidia/GLM-5.2-NVFP4'
  const isBasetenPro = effectiveModel === 'baseten-deepseek-pro'
  const isNvidiaGlm = effectiveModel === 'nvidia-glm'
  const isNvidiaDeepseek = effectiveModel === 'nvidia-deepseek' || isNvidiaDeepseekModel
  const isDeepseekOfficialPro = effectiveModel === 'deepseek-pro'
  const isDeepseekOfficialFlash = effectiveModel === 'deepseek-flash'
  const isZaiGlm = effectiveModel === 'zai-glm' || effectiveModel === 'zai'
  const aiProvider = isGpt
    ? 'openai'
    : isGrok
      ? 'grok'
      : isGlmFast
        ? 'baseten-glm-fast'
        : isAihubmixGlmFast
          ? 'aihubmix-glm-fast'
          : isParasailDeepseekPro
            ? 'parasail-deepseek-pro'
            : isParasailDeepseek
            ? 'parasail-deepseek'
            : isParasailGlm
              ? 'parasail-glm'
              : isBasetenPro
                ? 'baseten-deepseek-pro'
                : isNvidiaGlm
                  ? 'nvidia-glm'
                  : isNvidiaDeepseek
                    ? 'nvidia-deepseek'
                    : isDeepseekOfficialPro
                      ? 'deepseek-pro'
                      : isDeepseekOfficialFlash
                        ? 'deepseek-flash'
                        : isZaiGlm
                          ? 'zai-glm'
                          : isDeepseekFlash
                            ? 'baseten-deepseek'
                            : undefined
  const result = await withDeadline(FIX_TIMEOUT_MS, 'AI fix', generateContentText({
    system: sys,
    prompt,
    maxTokens,
    temperature: 0.2,
    aiProvider,
    exclusive: Boolean(aiProvider),
    // Reviewer is not a first-pass drafter. The universal quality contract
    // ("Every article you write…") makes Pro-0813 rewrite the whole guide
    // as schema/YAML or a fenced stub — countBodyWords then reads 0 and
    // the shrink guard discards it. Lane-2 scorers already skip this.
    skipQualityContract: true,
    reasoningEffort: 'low',
    // Send the real API model id, never the pin. Pins like 'nvidia-deepseek'
    // map through the catalog to the Flash checkpoint the user selected;
    // otherwise the provider default (deployed NVIDIA_DEEPSEEK_MODEL secret)
    // would be used — that is what sent EOL'd deepseek-v4-pro (410 Gone).
    model: isGrok ? grokModelId({ model: effectiveModel }) : reviewApiModel(effectiveModel) || effectiveModel,
  }))
  const text = unwrapWholeDocumentFence((result?.text || '').trim())
  if (!text.trim()) throw new Error('AI fix returned empty content')
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
  keywords?: string[],
): Promise<string> {
  let effective = content
  try {
    const citationContext = {
      region,
      topic,
      keywords,
      body: content.slice(0, 4000),
    }
    const sanitized = await sanitizeDraftLinksLive(content, {
      region,
      topic,
      keywords,
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
      citationContext,
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
              ? 'This link is from a non-verified source. If it is live and relevant to the claim, keep it. Only replace if the link is broken (404) or clearly unrelated to the surrounding content.'
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
    // Resolve the canonical URL from the job when the body omits it — the
    // Ahrefs canonical repair needs it to inject canonicalUrl into front matter.
    const targetUrl = await resolveTargetUrl(jobId, (body as { targetUrl?: string }).targetUrl)
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
      targetUrl,
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
    // Live HEAD/GET of every URL is a Worker subrequest bomb. The desk auto-gate
    // POSTs this on tab enter; crawling links 500s the request with an empty
    // body. Structural placeholder checks still run inside the quality gate.
    // Opt in with liveLinks:true (the PATCH fix path still live-audits).
    if ((body as { liveLinks?: boolean }).liveLinks === true) {
      effective = await mergeLinkAudit(
        response,
        effective,
        region,
        targetUrl,
        primaryKeyword,
        [...(requiredShortKeywords || []), ...(requiredLongTailKeywords || [])],
      )
    }
    if (effective !== content) {
      response.fixedContent = effective
      response.appliedRepairs = [...repaired.applied, ...(response.appliedRepairs || []).filter((r) => !repaired.applied.includes(r))]
    }
    if (jobId) {
      try {
        const { persistReviewSnapshot } = await import('@/lib/seoFactory/reviewSnapshots')
        await persistReviewSnapshot({
          jobId,
          content: effective,
          source: 'reaudit',
          qualityOk: response.ok,
          shipReady: response.shipReady ?? null,
          blockers: response.blockersData || [],
          warnings: response.warningsData || [],
          appliedRepairs: response.appliedRepairs || [],
        })
        if (response.shipReady) {
          const { createSupabaseAdminClient } = await import('@/lib/supabase')
          const db = createSupabaseAdminClient()
          const { data: row } = await db.from('content_jobs').select('status').eq('id', jobId).maybeSingle()
          if (row?.status === 'failed') {
            await db.from('content_jobs').update({ status: 'drafting', error_message: null }).eq('id', jobId)
          }
        }
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
      /** Live estate URL this draft publishes to (job.canonical_url). Injects
       *  canonicalUrl into front matter so ahrefs_canonical_missing clears. */
      targetUrl?: string
      /** Override the review model (gpt-5.6-sol by default). Set to
       *  gpt-5.6-terra for faster, lower-cost non-critical fixes. */
      reviewModel?: string
      jobId?: string
    }
    const { action, content, annotations, annotation, warnings, blockers, contentType, primaryKeyword, indexable, region, requiredShortKeywords, requiredLongTailKeywords, competingSnippets, competingUrls, reviewModel, jobId } = body
    if (!content || !action) {
      return NextResponse.json({ error: 'content and action required' }, { status: 400 })
    }
    if (countBodyWords(content) < 40) {
      return NextResponse.json({
        error: 'Editor content has no countable body words (YAML/schema only, or the draft never loaded). Click Load saved draft, then Fix again.',
        needLoadDraft: true,
      }, { status: 409 })
    }
    // Resolve the canonical URL from the job when the body omits it — the
    // Ahrefs canonical repair needs it to inject canonicalUrl into front matter.
    const targetUrl = await resolveTargetUrl(jobId, (body as { targetUrl?: string }).targetUrl)

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
      // Mechanical first — missing_disclaimer / schema_faq / TOC never need a
      // 2.6k-word Pro rewrite. The reviewer pin inherits generateContentText's
      // drafter role; a full rewrite of a long guide is how we get
      // "0 words vs N original" discards.
      const mechanical = applyDeterministicRepairs({
        content,
        primaryKeyword: primaryKeyword || 'guide',
        region,
        indexable,
        contentType,
        requiredShortKeywords,
        requiredLongTailKeywords,
        competingUrls: competingUrls as any,
        targetUrl,
      })
      const afterMech = evaluateReauditContract({
        content: mechanical.content,
        contentType,
        primaryKeyword,
        indexable,
        requiredShortKeywords,
        requiredLongTailKeywords,
        region,
      })
      const leftover = leftoverAnnotationCodes(annotations, afterMech)
      if (leftover.length === 0) {
        fixedContent = mechanical.content
      } else {
      // Master Engine gaps FIRST — the model must tackle the highest-priority
      // expected-value gaps (internal links, schema, citations, YMYL trust…) in
      // order before the annotation sweep, so the rewrite converges on the
      // strategic gaps rather than only the mechanical issues.
      enginePlan = masterEngineFixPlan({
        content: mechanical.content,
        primaryKeyword,
        contentType,
        region,
        indexable,
        competingSnippets,
        competingUrls,
      })
      const leftoverSet = new Set(leftover)
      // Build a comprehensive fix prompt listing every issue
      const blockerList = annotations
        .filter((a) => a.severity === 'blocker' && leftoverSet.has(a.code))
        .map((a) => `Line ${a.line}: [${a.code}] ${a.message} -> "${a.highlightedText}" -> Fix: ${a.fix}`)
        .join('\n')
      const warningList = annotations
        .filter((a) => a.severity === 'warning' && leftoverSet.has(a.code))
        .map((a) => `Line ${a.line}: [${a.code}] ${a.message} -> "${a.highlightedText}"`)
        .join('\n')

      const sys = 'You are a master SEO content editor. Fix ALL quality issues in the provided article while preserving its structure, facts, headings, and interlinks. For dead links: read the surrounding sentence and either swap in a live official/estate URL that fits the claim, or remove the href and add a new verifiable citation. Never invent URLs. Return ONLY the complete fixed article. Do not add explanations.'
      const prompt = `${enginePlan.promptBlock}
## Original Article

${mechanical.content}

## QUALITY ISSUES TO FIX (BLOCKERS - MUST FIX)
${blockerList}

## WARNINGS (FIX WHERE POSSIBLE)
${warningList}

## INSTRUCTIONS
1. Address the PRIORITIZED ENGINE GAPS first, in the exact order listed — highest expected value first
2. Then fix EVERY blocker listed above - these are mandatory
3. Dead/untrusted links: ONE pass. KEEP the href if it is the issuing body for the claim (exam board, licensing council). If it is a competitor/blog/news/shortener, REPLACE the href in place with the allowlist official URL for the SAME claim — do not unwrap and do not swap a board URL for a generic immigration homepage. Never invent a URL.
4. Vary sentence openings: no more than 2 consecutive sentences starting with the same word
5. Replace AI cliches like "delve", "unlock", "In today's digital landscape" with natural language
6. Add specific data, examples, or concrete details where the article is vague
7. Keep all original headings, interlinks, and key facts intact
8. Return the COMPLETE fixed article, nothing else`

      fixedContent = await callAiFix(sys, prompt, 16384, reviewModel)
      }

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
      // Warnings-only sweep — DETERMINISTIC FIRST so mechanical warnings
      // (schema_faq, meta_description, internal_links, sentence rhythm,
      // ahrefs_canonical_missing, dashes, whilst) and link warnings
      // (untrusted/irrelevant/dead external links) clear without an AI call.
      // The old sweep handed the model evidence-less warnings it routinely
      // ignored, so the same codes recurred on every re-audit.
      const requestedCodes = new Set(warnings.map((w) => w.code))
      // 1) Mechanical repairs (front matter, schema, FAQ, rhythm, meta…)
      const mechanical = applyDeterministicRepairs({
        content,
        primaryKeyword: primaryKeyword || 'guide',
        region,
        indexable,
        contentType,
        requiredShortKeywords,
        requiredLongTailKeywords,
        competingUrls: competingUrls as any,
        targetUrl,
      })
      // 2) Live link remediation — replace/remove dead + irrelevant + untrusted
      //    (non-official) URLs so link warnings stop recurring.
      let current = mechanical.content
      try {
        const sanitized = await sanitizeDraftLinksLive(current, {
          region,
          topic: primaryKeyword,
          keywords: [...(requiredShortKeywords || []), ...(requiredLongTailKeywords || [])],
          knownLiveUrls: targetUrl ? [targetUrl] : undefined,
        })
        if (sanitized.content && sanitized.content !== current) current = sanitized.content
      } catch { /* live audit is best-effort; structural gate still applies */ }
      // 3) Re-evaluate to find which requested warnings actually remain.
      const afterMech = evaluateReauditContract({
        content: current,
        contentType,
        primaryKeyword,
        indexable,
        requiredShortKeywords,
        requiredLongTailKeywords,
        region,
      })
      const afterCodes = new Set([
        ...(afterMech.blockersData || []).map((b) => b.code),
        ...(afterMech.warningsData || []).map((w) => w.code),
      ])
      let leftover = warnings.filter((w) => requestedCodes.has(w.code) && afterCodes.has(w.code))
      fixedContent = current
      // 4) word_count_target → append-only depth expansion (the sweep cannot pad).
      const hasDepthWarning = leftover.some((w) => w.code === 'word_count_target')
      if (hasDepthWarning) {
        depthPlan = depthMediationPlan(fixedContent, contentType, primaryKeyword, region)
        if (!depthPlan.ok && depthPlan.prompt) {
          const sys = 'You are a master SEO content editor expanding an immigration article to clear its word-count target. Write ONLY new markdown H2 sections (no front matter, no JSON-LD, no duplicate of existing headings). Preserve every existing section, fact, citation, and interlink. Return ONLY the new sections.'
          const appended = await callAiFix(sys, depthPlan.prompt || '', 16384, reviewModel)
          const merged = mergeAppendedSections(fixedContent, appended)
          if (countBodyWords(merged) > countBodyWords(fixedContent)) {
            fixedContent = merged
            depthExpandedForWarnings = true
          }
        }
      }
      // 5) Recompute leftovers after depth expansion, then AI-sweep the rest.
      const postDepth = evaluateReauditContract({
        content: fixedContent,
        contentType,
        primaryKeyword,
        indexable,
        requiredShortKeywords,
        requiredLongTailKeywords,
        region,
      })
      const stillPresent = new Set([
        ...(postDepth.blockersData || []).map((b) => b.code),
        ...(postDepth.warningsData || []).map((w) => w.code),
      ])
      const rest = leftover.filter((w) => w.code !== 'word_count_target' && stillPresent.has(w.code))
      if (rest.length) {
        enginePlan = masterEngineFixPlan({
          content: fixedContent,
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
        targetUrl,
      })
      const sanitized = await sanitizeDraftLinksLive(mechanical.content, {
        region,
        topic: primaryKeyword,
        keywords: [...(requiredShortKeywords || []), ...(requiredLongTailKeywords || [])],
        knownLiveUrls: targetUrl ? [targetUrl] : undefined,
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
      const leftoverLinks = (await auditLinksLive(sanitized.content, {
        knownLiveUrls: targetUrl ? [targetUrl] : undefined,
        citationContext: {
          region,
          topic: primaryKeyword,
          keywords: [...(requiredShortKeywords || []), ...(requiredLongTailKeywords || [])],
          body: sanitized.content.slice(0, 4000),
        },
      })).filter((f) => f.severity === 'blocker')
      if (afterMech.ok && leftoverLinks.length === 0) {
        fixedContent = sanitized.content
      } else {
        const leftover = [
          ...afterMech.blockersData,
          ...leftoverLinks.map((f) => ({
            code: f.code,
            message: f.message,
            fix: f.code === 'untrusted_external_link'
              ? 'This link is from a non-verified source. If it is live and relevant to the claim, keep it. Only replace if the link is broken (404) or unrelated to the surrounding content.'
              : 'Remove or replace the dead URL with a live official page that supports the same claim.',
          })),
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
        targetUrl,
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
    fixedContent = await mergeLinkAudit(
      response,
      fixedContent,
      region,
      targetUrl,
      primaryKeyword,
      [...(requiredShortKeywords || []), ...(requiredLongTailKeywords || [])],
    )
    // mergeLinkAudit sanitizes links (dead/untrusted/irrelevant) and updates
    // the response's blockers/warnings/annotations — but it does NOT rewrite
    // response.fixedContent. Without this, the editor receives the pre-sanitize
    // body, the bad links stay in the draft, and re-audit re-flags them.
    response.fixedContent = fixedContent
    const applied: string[] = []
    if (depthRepair) applied.push(depthRepair)
    if (repaired.applied.length) applied.push(...repaired.applied)
    if (response.appliedRepairs?.length) applied.push(...response.appliedRepairs)
    if (applied.length) response.appliedRepairs = [...new Set(applied)]
    if (jobId && response.fixedContent) {
      try {
        const { persistReviewSnapshot } = await import('@/lib/seoFactory/reviewSnapshots')
        await persistReviewSnapshot({
          jobId,
          content: response.fixedContent,
          source: 'fix',
          qualityOk: response.ok,
          shipReady: response.shipReady ?? null,
          blockers: response.blockersData || [],
          warnings: response.warningsData || [],
          appliedRepairs: response.appliedRepairs || [],
        })
      } catch { /* editor still holds the repaired body */ }
    }
    return NextResponse.json(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI fix failed'
    const timedOut = /timed out/i.test(message)
    return NextResponse.json({ error: message, timedOut }, { status: timedOut ? 504 : 500 })
  }
}