import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { generateContentText, grokModelId } from '@/lib/contentAiProvider'
import { DEFAULT_REVIEW_PIN, parseStudioPin } from '@/lib/contentAiCatalog'
import { canonicalizeRunbiosPin, isRunbiosPin } from '@/lib/runbiosCatalog'
import { buildBlockersFixPrompt, buildWarningsFixPrompt, findingToAnnotations, type InlineAnnotation } from '@/lib/seoFactory/inlineAnnotations'
import { applyDeterministicRepairs } from '@/lib/seoFactory/editorialScaffold'
import { depthMediationPlan, evaluateReauditContract, leftoverAnnotationCodes, type ReauditResponse } from '@/lib/seoFactory/reauditContract'
import { masterEngineFixPlan, type MasterEngineFixPlan } from '@/lib/seoFactory/masterEngine'
import { mergeAppendedSections } from '@/lib/seoFactory/prompts'
import { countBodyWords, maxWordsForType, minWordsForType, targetWordsForType, unwrapWholeDocumentFence } from '@/lib/seoFactory/contentDepth'
import { normalizeEditorDocument, editorResponseContract, sanitizeFrontmatter } from '@/lib/seoFactory/formatContract'
import { auditLinksLive, auditLinksSync, fetchLiveEstateUrls, sanitizeDraftLinksLive } from '@/lib/seoFactory/linkAudit'
import { runAuditEditorLoop, CONTENT_LOOP_BUDGET, type LoopFinding } from '@/lib/seoFactory/auditEditorLoop'
import { anchorHash, parseEditorPatch } from '@/lib/seoFactory/editorPatch'
import { resolveContentSpecForJob, type ContentSpec } from '@/lib/seoFactory/contentSpec'
import { normalizeStudioContentType } from '@/lib/seoFactory/ownership'
import { resolveKeywordContract } from '@/lib/seoFactory/keywordContract'
import type { KeywordTerm } from '@/lib/seoEngine/keywordTerms'
import { computeDocumentFingerprint, shadowPreservationCheck } from '@/lib/seoFactory/documentFingerprint'

export type { ReauditResponse }

type CompetingUrlInput = string | { url?: string; title?: string; primaryKeyword?: string | null }

type RepairCtx = {
  primaryKeyword?: string
  region?: string
  indexable?: boolean
  contentType?: string
  requiredShortKeywords?: string[]
  requiredLongTailKeywords?: string[]
  shortKeywordTerms?: KeywordTerm[]
  longTailKeywordTerms?: KeywordTerm[]
  competingUrls?: Array<{ url: string; title: string; primaryKeyword?: string | null }>
  targetUrl?: string
  maxWords?: number
  minWords?: number
  /** Verified live estate anchors (label + URL) derived from the live sitemap
   *  set — the deterministic related-guide relink only ever re-links a
   *  plain-text label to a URL in this set. */
  verifiedEstateAnchors?: Array<{ label: string; url: string }>
}

/**
 * Stage-4 ship-gate closer — runs after EVERY callAiFix result.
 * Deterministic repairs first, then contract evaluation. If
 * tldr_format_invalid or ahrefs_meta_too_long survive, loop the
 * deterministic repairs (max 2 extra passes) instead of firing another
 * 16k-token LLM call for those two codes — the model already failed to
 * fix them once and burns the budget on rewrites.
 */
function closeShipGate(raw: string, ctx: RepairCtx): string {
  let out = applyDeterministicRepairs({ content: raw, ...ctx }).content
  for (let attempt = 0; attempt < 2; attempt++) {
    const gate = evaluateReauditContract({
      content: out,
      contentType: ctx.contentType,
      primaryKeyword: ctx.primaryKeyword,
      indexable: ctx.indexable,
      requiredShortKeywords: ctx.requiredShortKeywords,
      requiredLongTailKeywords: ctx.requiredLongTailKeywords,
      shortKeywordTerms: ctx.shortKeywordTerms,
      longTailKeywordTerms: ctx.longTailKeywordTerms,
      region: ctx.region,
      targetUrl: ctx.targetUrl,
      competingUrls: ctx.competingUrls,
    })
    const codes = new Set([
      ...(gate.blockersData || []).map((b) => b.code),
      ...(gate.warningsData || []).map((w) => w.code),
    ])
    if (!codes.has('tldr_format_invalid') && !codes.has('ahrefs_meta_too_long')) break
    out = applyDeterministicRepairs({ content: out, ...ctx }).content
  }
  return sanitizeFrontmatter(out)
}

function normalizeCompetingUrls(raw: unknown): Array<{ url: string; title: string; primaryKeyword?: string | null }> | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined
  const out: Array<{ url: string; title: string; primaryKeyword?: string | null }> = []
  for (const item of raw as CompetingUrlInput[]) {
    if (typeof item === 'string') {
      const url = item.trim()
      if (url) out.push({ url, title: url })
      continue
    }
    if (item && typeof item === 'object') {
      const url = String(item.url || '').trim()
      if (!url) continue
      out.push({
        url,
        title: String(item.title || url),
        primaryKeyword: item.primaryKeyword ?? null,
      })
    }
  }
  return out.length ? out : undefined
}

/**
 * Canonical ContentSpec resolution for re-audit (brief §3.2, Milestone C).
 * The persisted `audit_json.contentSpec` snapshot is the source of truth:
 * when the job carries one it always wins, and a caller-submitted snapshot
 * that disagrees with it is REJECTED rather than trusted — the client can
 * never weaken policy by posting its own spec. When no persisted snapshot
 * exists (legacy jobs), a valid request snapshot is accepted so the
 * Milestone B body-contentSpec path keeps working; anything invalid/absent
 * keeps legacy spec-less behavior.
 */
async function resolveCanonicalContentSpec(
  jobId?: string,
  requestSpec?: unknown,
): Promise<{ spec: ContentSpec | null; persisted: boolean; mismatch: boolean }> {
  const { reviveContentSpec, serializeContentSpec } = await import('@/lib/seoFactory/contentSpec')
  let persistedSpec: ContentSpec | null = null
  if (jobId) {
    try {
      const { createSupabaseAdminClient } = await import('@/lib/supabase')
      const db = createSupabaseAdminClient()
      const { data } = await db
        .from('content_jobs')
        .select('audit_json')
        .eq('id', jobId)
        .maybeSingle()
      const snapshot = (data as { audit_json?: { contentSpec?: unknown } } | null)?.audit_json?.contentSpec
      persistedSpec = reviveContentSpec(snapshot ?? null)
    } catch {
      persistedSpec = null
    }
  }
  const requestRevived = reviveContentSpec(requestSpec)
  const mismatch = Boolean(
    persistedSpec &&
      requestRevived &&
      serializeContentSpec(persistedSpec) !== serializeContentSpec(requestRevived),
  )
  return { spec: persistedSpec ?? requestRevived, persisted: Boolean(persistedSpec), mismatch }
}

const CONTENT_SPEC_MISMATCH_RESPONSE = {
  error: 'contentSpec snapshot mismatch — the submitted snapshot does not match the persisted audit_json.contentSpec. Reload the job and retry; caller-submitted policy is never trusted over the persisted spec.',
  contentSpecMismatch: true,
}

type CanonicalJobMetadata = {
  targetUrl?: string
  contentType: string
  primaryKeyword: string
  region: string
  indexable: boolean
  requiredShortKeywords: string[]
  requiredLongTailKeywords: string[]
  /** Per-term provenance so the editor agrees with the ship gate. */
  shortKeywordTerms: KeywordTerm[]
  longTailKeywordTerms: KeywordTerm[]
}

/**
 * Hydrate the editor from the job row instead of trusting a stale/incomplete
 * browser snapshot. Persisted values always win. Legacy rows that predate
 * canonical_url are routed once from their stored topic/type/region and then
 * backfilled, so Audit & Fix remains self-healing and never asks the operator
 * to refresh a job merely to recover metadata already owned by the server.
 */
async function resolveCanonicalJobMetadata(
  jobId: string | undefined,
  fallback: Partial<CanonicalJobMetadata>,
): Promise<CanonicalJobMetadata> {
  let row: {
    canonical_url?: string | null
    content_type?: string | null
    primary_keyword?: string | null
    topic?: string | null
    region?: string | null
    indexable?: boolean | null
    required_short_keywords?: string[] | null
    required_long_tail_keywords?: string[] | null
    /** Persisted per-term provenance, when the column exists on the row. */
    short_keyword_terms?: unknown
    long_tail_keyword_terms?: unknown
  } | null = null
  let db: SupabaseClient | null = null

  if (jobId) {
    try {
      const { createSupabaseAdminClient } = await import('@/lib/supabase')
      db = createSupabaseAdminClient()
      const result = await db
        .from('content_jobs')
        .select('canonical_url,content_type,primary_keyword,topic,region,indexable,required_short_keywords,required_long_tail_keywords,short_keyword_terms,long_tail_keyword_terms')
        .eq('id', jobId)
        .maybeSingle()
      row = result.data
    } catch {
      row = null
    }
  }

  const contentType = normalizeStudioContentType(row?.content_type || fallback.contentType || 'legal_guide')
  const primaryKeyword = String(row?.primary_keyword || row?.topic || fallback.primaryKeyword || '').trim()
  const region = String(row?.region || fallback.region || 'US').trim() || 'US'
  const indexable = typeof row?.indexable === 'boolean'
    ? row.indexable
    : fallback.indexable !== false
  let targetUrl = String(row?.canonical_url || fallback.targetUrl || '').trim() || undefined
  const keywordContract = resolveKeywordContract({
    primaryKeyword,
    topic: row?.topic,
    requiredShortKeywords: row?.required_short_keywords ?? fallback.requiredShortKeywords,
    requiredLongTailKeywords: row?.required_long_tail_keywords ?? fallback.requiredLongTailKeywords,
  })

  // A legacy job can have every routing input but no stored canonical URL.
  // Derive the same owner plan used by generation, then persist the recovery.
  if (!targetUrl && primaryKeyword && contentType) {
    try {
      const { resolveOwner } = await import('@/lib/seoFactory/ownership')
      const owner = await resolveOwner({ primaryKeyword, contentType, region, indexable })
      targetUrl = owner.canonicalUrl || undefined
    } catch {
      targetUrl = undefined
    }
  }

  if (jobId && row) {
    const backfill: Record<string, unknown> = {}
    if (!row.canonical_url && targetUrl) backfill.canonical_url = targetUrl
    if (!row.primary_keyword && primaryKeyword) backfill.primary_keyword = primaryKeyword
    if (keywordContract.backfilled) {
      backfill.required_short_keywords = keywordContract.requiredShortKeywords
      backfill.required_long_tail_keywords = keywordContract.requiredLongTailKeywords
      // Persist provenance alongside the terms, or the next read re-promotes
      // synthesized filler to enforceable demand and the blockers return.
      backfill.short_keyword_terms = keywordContract.shortKeywordTerms
      backfill.long_tail_keyword_terms = keywordContract.longTailKeywordTerms
    }
    if (Object.keys(backfill).length) {
      try {
        await db!.from('content_jobs').update(backfill).eq('id', jobId)
      } catch {
        // Recovery remains usable for this request even when backfill fails.
      }
    }
  }

  return { targetUrl, contentType, primaryKeyword, region, indexable, ...keywordContract }
}

// ---------- AI-powered fix endpoints ----------

/**
 * AI fix through the canonical content AI provider chain. The default reviewer
 * pin is Baseten DeepSeek V4 Flash 0731; explicit capacity failures may still
 * cascade through configured providers. Same engine the generator uses, so fix
 * prompts get the same model routing, retries and fallbacks as first-pass generation.
 */
/** Per-provider budget for one reviewer fix call. Larger than the default
 *  120s fetch timeout so a slow-but-funded host (Baseten Flash + thinking on
 *  a long fix prompt) gets real headroom before the cascade moves on. */
const FIX_CANDIDATE_TIMEOUT_MS = Math.max(
  30_000,
  Number.parseInt(process.env.CONTENT_STUDIO_FIX_CANDIDATE_TIMEOUT_MS || '200000', 10) || 200_000,
)

/** Overall fix deadline. With the reviewer cascade enabled, allow the pinned
 *  provider plus at least one fallback within the budget. */
const FIX_TIMEOUT_MS = Math.max(
  15_000,
  Number.parseInt(process.env.CONTENT_STUDIO_FIX_TIMEOUT_MS || '240000', 10) || 240_000,
  FIX_CANDIDATE_TIMEOUT_MS + 120_000,
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
  // Run BiOS GLM 5.3 Flash is the default reviewer (DEFAULT_REVIEW_PIN — the
  // Review/Editor lane lead). This is separate from the NVIDIA MiniMax
  // drafting default; the review lane allows only Grok, Claude Opus 5,
  // Claude Sonnet 5, and GLM 5.3 Flash.
  const requestedModel = String(reviewModel || DEFAULT_REVIEW_PIN).trim().toLowerCase()
  const runbiosAlias = isRunbiosPin(requestedModel)
    ? canonicalizeRunbiosPin(requestedModel)
    : requestedModel === 'glm-5.3-flash'
      ? 'runbios-glm-53-flash'
      : requestedModel === 'claude-opus-5'
        ? 'runbios-claude-opus'
        : requestedModel === 'claude-sonnet-5'
          ? 'runbios-claude-sonnet'
          : ''
  const effectiveModel = requestedModel === 'grok' || /^grok(?:-|$)/.test(requestedModel)
    ? 'grok'
    : ['runbios-glm-53-flash', 'runbios-claude-opus', 'runbios-claude-sonnet'].includes(runbiosAlias)
      ? runbiosAlias
      : DEFAULT_REVIEW_PIN
  // Run BiOS pins (including the bare 'glm-5.3-flash' alias) execute through
  // the Run BiOS provider with the exact selected slot.
  if (isRunbiosPin(effectiveModel)) {
    return callAiFixWithProvider(
      sys,
      prompt,
      maxTokens,
      canonicalizeRunbiosPin(effectiveModel),
      effectiveModel,
      false,
    )
  }
  /* Legacy reviewer pins deliberately coerce to the lane default above. */
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
  return callAiFixWithProvider(sys, prompt, maxTokens, aiProvider, effectiveModel, isGrok)
}

/**
 * Generate a single missing outline section in natural reader language.
 * Purpose-driven: the model is told WHAT the section must do for the reader
 * (from the brief contract), given the article's existing context so it
 * writes the continuation — never a keyword string appended for the gate.
 */
async function generateOutlineSection(
  article: string,
  heading: string,
  purpose: string | undefined,
  keyword: string | undefined,
  region: string | undefined,
): Promise<string | null> {
  const sys = `You are a legal-content editor completing ONE section of an immigration article. Write natural, practitioner-grade prose for the reader — never a keyword string, never a stub. Respond with ONLY the section body (no heading line).`
  const prompt = `## Article (first 6000 chars for voice/context)

${article.slice(0, 6000)}

## Section to write

## ${heading}
${purpose ? `\nPurpose (from the brief contract): ${purpose}` : ''}
${keyword ? `\nPrimary topic: ${keyword}` : ''}
${region ? `Region: ${region}` : ''}

Write 180-350 words of plain, well-structured prose that completes this section's purpose and flows from the article above. Use the article's existing headings/voice. No promises of outcomes. No invented citations. If you reference a rule or deadline, name the issuing authority in plain text.`
  try {
    const raw = await callAiFix(sys, prompt, 4096, DEFAULT_REVIEW_PIN)
    const clean = raw
      .replace(/^```[\s\S]*?```\s*$/, '')
      .replace(/^(#+)\s+.*$/m, '') // never echo a heading — caller prefixes it
      .trim()
    return clean.length >= 120 ? clean : null
  } catch {
    return null
  }
}

/**
 * Insert a rendered section before ## FAQ / ## Sources (or append to the
 * body) so the completed content lands in reading order without disturbing
 * the scaffold. Deterministic — never a patch, never a heading edit by AI.
 */
function insertSectionBeforeFaqOrSources(body: string, section: string): string {
  const sectionBlock = `${section}\n\n`
  const match = body.match(/^##\s+(?:faq|sources|official sources)\b/im)
  if (match) {
    const at = match.index ?? body.length
    return `${body.slice(0, at).trimEnd()}\n\n${sectionBlock}${body.slice(at).trimStart()}`
  }
  return `${body.trimEnd()}\n\n${sectionBlock}${''}`.trimEnd()
}

async function callAiFixWithProvider(
  sys: string,
  prompt: string,
  maxTokens: number,
  aiProvider: string | undefined,
  effectiveModel: string,
  isGrok: boolean,
): Promise<string> {
  const result = await withDeadline(FIX_TIMEOUT_MS, 'AI fix', generateContentText({
    system: sys,
    prompt,
    maxTokens,
    temperature: 0.2,
    aiProvider,
    exclusive: Boolean(aiProvider),
    // A capacity hiccup on the pinned reviewer (NVIDIA 529, Baseten timeout/
    // abort, Baseten 402 billing) must not fail the fix sweep — fall through
    // to the next provider.
    cascadeOnCapacity: Boolean(aiProvider),
    // Per-candidate fetch/complete headroom (overrides the 120s global).
    timeoutMs: FIX_CANDIDATE_TIMEOUT_MS,
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
  const normalized = normalizeEditorDocument(unwrapWholeDocumentFence((result?.text || '').trim()))
  const text = normalized.content
  if (normalized.fixed.length) {
    console.info('[reaudit] editor return normalized:', normalized.fixed.join(', '))
  }
  if (!text.trim()) throw new Error('AI fix returned empty content')
  return text
}


/** Best-effort live link audit: structural checks already run in the quality
 *  gate; this adds real HTTP verification of internal links so dead or
 *  invented links (2026-08 example.com incident) block ship with evidence.
 *  After the audit, mechanically strips every dead link so the AI editor
 *  and ship gate never see a URL that doesn't resolve. */
/**
 * Synchronous link audit — structural checks only (malformed URLs, TLD
 * patterns, placeholder links, citation relevance). No live HTTP requests.
 * Returns deterministic results so consecutive re-audits of the same
 * content produce the same findings.
 */
function mergeLinkAuditSync(
  response: ReauditResponse,
  content: string,
  region?: string,
  targetUrl?: string,
  topic?: string,
  keywords?: string[],
): string {
  let effective = content
  try {
    const citationContext = {
      region,
      topic,
      keywords,
      body: content.slice(0, 4000),
    }
    // Structural-only: no live HTTP checks, deterministic results
    const findings = auditLinksSync(
      effective,
      targetUrl ? new Set([targetUrl]) : undefined,
      undefined,
      citationContext,
    )
    if (!findings.length) return effective

    const blockers = findings.filter((f) => f.severity === 'blocker')
    const warnings = findings.filter((f) => f.severity === 'warning')
    const linkFix = (code: string) =>
      code === 'placeholder_link'
        ? 'Replace with a verified estate URL from the research-stage INTERNAL LINK ALLOWLIST.'
        : code === 'malformed_link'
          ? 'Fix the URL scheme — prefix with https:// if it is a valid domain.'
          : code === 'untrusted_external_link'
            ? 'This link is from a non-verified source. If it is live and relevant to the claim, keep it. Only replace if the link is broken (404) or clearly unrelated to the surrounding content.'
            : code === 'irrelevant_external_link'
              ? 'This official URL may be a weak fit for this article — keep it if it supports the surrounding claim; only swap or remove when the link is dead or clearly unrelated to the topic.'
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
    response.linkAudit = findings
  } catch {
    // Structural audit is best-effort; the quality gate still enforces placeholders.
  }
  return effective
}

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
                ? 'This official URL is live. Keep it if it supports the surrounding claim — only swap or remove when the page is dead (404) or clearly unrelated to the topic.'
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
      targetUrl?: string
      competingUrls?: CompetingUrlInput[]
      /** Caller-supplied ContentSpec snapshot — validated against the persisted
       *  audit_json.contentSpec, never trusted over it (Milestone C). */
      contentSpec?: unknown
    }
    const { content, jobId } = body
    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'content string required' }, { status: 400 })
    }
    // The persisted audit_json.contentSpec snapshot is canonical. A request
    // snapshot that disagrees with it is rejected before any evaluation —
    // fail closed instead of auditing against caller-submitted policy.
    const canonicalSpec = await resolveCanonicalContentSpec(jobId, body.contentSpec)
    if (canonicalSpec.mismatch) {
      return NextResponse.json(CONTENT_SPEC_MISMATCH_RESPONSE, { status: 409 })
    }
    const {
      targetUrl,
      contentType,
      primaryKeyword,
      region,
      indexable,
      requiredShortKeywords,
      requiredLongTailKeywords,
      shortKeywordTerms,
      longTailKeywordTerms,
    } = await resolveCanonicalJobMetadata(jobId, body)
    const competingUrls = normalizeCompetingUrls(body.competingUrls)
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
      competingUrls,
      targetUrl,
    })
    let effective = repaired.content
    const response: ReauditResponse = {
      ...evaluateReauditContract({
        content: effective,
        contentType,
        primaryKeyword,
        indexable,
        requiredShortKeywords,
        requiredLongTailKeywords,
        shortKeywordTerms,
        longTailKeywordTerms,
        region,
        targetUrl,
        competingUrls,
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
      action: 'fix_all' | 'fix_one' | 'fix_warnings' | 'fix_depth' | 'fix_blockers' | 'fix_until_gates'
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
      competingUrls?: CompetingUrlInput[]
      /** Live estate URL this draft publishes to (job.canonical_url). Injects
       *  canonicalUrl into front matter so ahrefs_canonical_missing clears. */
      targetUrl?: string
      /** Override the review model (gpt-5.6-sol by default). Set to
       *  gpt-5.6-terra for faster, lower-cost non-critical fixes. */
      reviewModel?: string
      jobId?: string
      /** Caller-supplied ContentSpec snapshot (Milestone B path). When the job
       *  carries a persisted audit_json.contentSpec snapshot that snapshot is
       *  canonical and a mismatching request snapshot is rejected (Milestone C). */
      contentSpec?: unknown
    }
    const { action, content, annotations, annotation, warnings, blockers, competingSnippets, competingUrls, reviewModel, jobId } = body
    if (!content || !action) {
      return NextResponse.json({ error: 'content and action required' }, { status: 400 })
    }
    if (countBodyWords(content) < 40) {
      return NextResponse.json({
        error: 'Editor content has no countable body words (YAML/schema only, or the draft never loaded). Click Load saved draft, then Fix again.',
        needLoadDraft: true,
      }, { status: 409 })
    }
    const {
      targetUrl,
      contentType,
      primaryKeyword,
      region,
      indexable,
      requiredShortKeywords,
      requiredLongTailKeywords,
      shortKeywordTerms,
      longTailKeywordTerms,
    } = await resolveCanonicalJobMetadata(jobId, body)
    const competingPages = normalizeCompetingUrls(competingUrls)

    // ── ContentSpec canonical snapshot + reviewer rules (brief §3.2/§5) ─────
    // The persisted audit_json.contentSpec snapshot is canonical when present;
    // a request snapshot that disagrees with it is rejected, never trusted.
    // When a valid canonical spec exists, reviewer prompts get the registry-
    // rendered rules for the outstanding findings. Preservation fingerprinting
    // always runs in shadow mode here: it records would-reject reasons in the
    // response without changing the accepted draft.
    const canonicalSpec = await resolveCanonicalContentSpec(jobId, body.contentSpec)
    if (canonicalSpec.mismatch) {
      return NextResponse.json(CONTENT_SPEC_MISMATCH_RESPONSE, { status: 409 })
    }
    let contentSpec = canonicalSpec.spec
    const { renderReviewerRules, PLAYBOOK_VERSION } = await import('@/lib/seoFactory/contentQualityPlaybook')
    const specReviewerRules = contentSpec
      ? renderReviewerRules([...(blockers || []), ...(warnings || [])], contentSpec)
      : null
    // Reviewer-model wrapper — identical to callAiFix, with the registry rules
    // prepended when a spec is present. Legacy behavior when absent.
    const callAiFixWithSpec = (sys: string, prompt: string, maxTokens?: number, model?: string) =>
      callAiFix(specReviewerRules ? `${sys}\n\n${specReviewerRules}` : sys, prompt, maxTokens, model)

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

    if (action === 'fix_until_gates') {
      // ── Bounded fix-until-gates loop (implementation brief §5, Milestone C) ─
      // Deterministic repairs run
      // first; only outstanding registered targeted_ai findings go to the
      // reviewer as structured EditorPatches; human_only findings hold for
      // review and are never sent to a model; preservation failures reject the
      // whole patch (the previous document stays authoritative); and the full
      // loop transcript persists under audit_json.contentLoop.
      // Legacy drafts predate ContentSpec persistence. Derive one canonical
      // snapshot from the immutable job metadata once, then use that same
      // snapshot for every round. This keeps old jobs fixable without letting
      // any model invent a new brief mid-loop.
      // Recovered metadata from the last-chance block below — the fix loop
      // must evaluate against the RECOVERED keyword/target, not the empty
      // row values that triggered recovery.
      let loopKeyword = primaryKeyword
      let loopTargetUrl = targetUrl
      if (!contentSpec) {
        // Last-chance topic recovery before holding the job:
        //   1. primary keyword ← job row (already tried) ← the draft's own H1.
        //   2. target URL ← job row canonical_url (already tried) ← owner
        //      plan resolved from the recovered keyword.
        // The old code coerced primaryKeyword to 'guide' while sending
        // canonicalUrl: '' — the spec then ALWAYS failed validation with a
        // misleading "add a primary keyword" message when the real gap was
        // the missing target URL.
        const h1 = ((content.match(/^#\s+(.+)$/m) || [])[1] || '').trim()
        const recoveredKeyword = (primaryKeyword || h1).slice(0, 120).trim()
        let recoveredTargetUrl = targetUrl
        if (!recoveredTargetUrl && recoveredKeyword) {
          try {
            const { resolveOwner } = await import('@/lib/seoFactory/ownership')
            const owner = await resolveOwner({
              primaryKeyword: recoveredKeyword,
              contentType: contentType || 'legal_guide',
              region,
              indexable: indexable !== false,
            })
            recoveredTargetUrl = owner.canonicalUrl || undefined
          } catch {
            recoveredTargetUrl = undefined
          }
        }
        let derivedReason = 'missing canonicalUrl, contentType, or primaryKeyword'
        if (recoveredKeyword && recoveredTargetUrl) {
          const derived = resolveContentSpecForJob({
            jobId: jobId || 'legacy-editor-draft',
            contentType: contentType || 'legal_guide',
            region,
            indexable: indexable !== false,
            canonicalUrl: recoveredTargetUrl,
            primaryKeyword: recoveredKeyword,
            requiredShortKeywords,
            requiredLongTailKeywords,
            outline: (content.match(/^##\s+(.+)$/gm) || []).map((h) => h.replace(/^##\s+/, '')),
            topic: recoveredKeyword,
          })
          contentSpec = derived.spec
          if (!derived.spec) {
            derivedReason = [derived.reason, ...(derived.issues || [])]
              .filter(Boolean)
              .join('; ')
          }
        }
        // Persist the recovery so the next Fix call hydrates directly from
        // the job row instead of re-deriving it.
        if (contentSpec && jobId) {
          try {
            const { createSupabaseAdminClient } = await import('@/lib/supabase')
            const backfill: Record<string, unknown> = {}
            if (!primaryKeyword && recoveredKeyword) backfill.primary_keyword = recoveredKeyword
            if (!targetUrl && recoveredTargetUrl) backfill.canonical_url = recoveredTargetUrl
            if (Object.keys(backfill).length) {
              await createSupabaseAdminClient()
                .from('content_jobs')
                .update(backfill)
                .eq('id', jobId)
            }
          } catch { /* recovery persists best-effort */ }
        }
        if (!contentSpec) {
          const metadataError = !recoveredTargetUrl
            ? `Audit & Fix could not resolve this job's target URL. Set the job's target URL, or re-run Discover for this topic.`
            : `Audit & Fix could not build this job's canonical content specification (${derivedReason}). The draft was not changed.`
          return NextResponse.json(
            {
              error: recoveredKeyword
                ? metadataError
                : 'Audit & Fix could not recover this job\'s primary topic. Add a primary keyword to the job; target URL and content type are recovered automatically.',
              heldForReview: true,
            },
            { status: 409 },
          )
        }
        loopKeyword = recoveredKeyword
        loopTargetUrl = recoveredTargetUrl || targetUrl
      }
      let verifiedEstateUrls: string[] = []
      try {
        verifiedEstateUrls = Array.from(await fetchLiveEstateUrls())
      } catch { /* live verification remains best-effort */ }
      // Verified anchors for the deterministic related-guide relink: filter
      // the documented anchors down to URLs the live sitemap set proves.
      // resolveVerifiedEstateAnchors falls back to the documented-verified
      // static set when the live fetch yielded nothing usable.
      const { resolveVerifiedEstateAnchors } = await import('@/lib/seoFactory/relatedGuideLinks')
      const verifiedEstateAnchors = resolveVerifiedEstateAnchors(verifiedEstateUrls.length ? verifiedEstateUrls : undefined)
      let lastAiFixError: string | null = null
      // Once a fix run has evicted unplaceable synthesized filler, the job is
      // flagged so LATER audits suppress the residual warnings instead of
      // restating terms the contract already closed.
      let suppressSynthesizedWarnings = false
      if (jobId) {
        try {
          const supabaseAdmin = (await import('@/lib/supabase')).createSupabaseAdminClient()
          const { data: priorRow } = await supabaseAdmin
            .from('content_jobs')
            .select('audit_json')
            .eq('id', jobId)
            .maybeSingle()
          const prior = (priorRow as { audit_json?: Record<string, unknown> } | null)?.audit_json
          suppressSynthesizedWarnings = Boolean(prior && typeof prior === 'object' && prior.synthesized_evicted === true)
        } catch { /* flag read is best-effort */ }
      }
      const loopCtx = {
        primaryKeyword: loopKeyword || 'guide',
        region,
        indexable,
        contentType,
        // Canonical brief outline — the re-audit gate must verify the body's
        // template sections actually exist (truncated drafts otherwise pass).
        outline:
          contentSpec && contentSpec.outline && contentSpec.outline.length
            ? contentSpec.outline.map((o) => ({ heading: o.heading, level: o.level, purpose: o.purpose }))
            : null,
        requiredShortKeywords,
        requiredLongTailKeywords,
        shortKeywordTerms,
        longTailKeywordTerms,
        competingUrls: competingPages,
        targetUrl: loopTargetUrl,
        verifiedEstateAnchors,
        // Links were already checked live by sanitizeDraftLinksLive. A sitemap
        // is an incomplete discovery aid, not proof that a working estate URL
        // is invalid, so do not reclassify live links through an allowlist.
      }
      const evaluate = (c: string): LoopFinding[] => {
        const gate = evaluateReauditContract({ content: c, ...loopCtx })
        return [
          ...(gate.blockersData || []).map((b) => ({ code: b.code, severity: 'blocker' as const, message: b.message, fix: b.fix })),
          ...(gate.warningsData || []).map((w) => ({ code: w.code, severity: 'warning' as const, message: w.message, fix: w.fix })),
        ]
      }
      const deterministicRepair = (c: string) => {
        const r = applyDeterministicRepairs({ content: c, ...loopCtx })
        return { content: r.content, repairs: r.applied }
      }
      const requestEditorPatch = async (req: {
        content: string
        findings: LoopFinding[]
      }) => {
        // Registry-derived reviewer rules for THIS round's outstanding
        // findings, rendered from the canonical snapshot.
        const roundRules = renderReviewerRules(req.findings, contentSpec)
        const findingList = req.findings
          .map((f, i) => `${i + 1}. [${f.code}] ${f.message || 'quality finding'}${f.fix ? `\n   FIX PRESCRIPTION: ${f.fix.slice(0, 600)}` : ''}`)
          .join('\n')
        const sys = `You are a surgical SEO content editor. Respond with ONLY a JSON object matching the EditorPatch v1 contract:
{"version":1,"operations":[{"kind":"replace","findingCode":"<registered code>","anchor":"<an exact full line from the document>","expectedHash":"<ignored; recomputed server-side>","replacement":"<replacement text>"}]}
Also supported: "insert_after" (uses "insertion") and "remove".
Rules:
- Every operation is authorized by exactly ONE listed finding code.
- The anchor must be an EXACT, UNIQUE line (trimmed) from the document.
- Replacements must not add headings, frontmatter, code fences, or <script> blocks.
- Smallest possible targeted edit per finding. Never regenerate the document.

${roundRules}`
        const prompt = `## Document

${req.content}

## Outstanding findings (fix ONLY these)
${findingList}

Return ONLY the JSON EditorPatch.`
        try {
          const raw = await callAiFix(sys, prompt, 8192, reviewModel)
          const parsed = parseEditorPatch(raw)
          if (!parsed.ok) return null
          // The model cannot compute sha-256 reliably — fill expectedHash
          // deterministically from the document. An unresolvable anchor keeps
          // its original hash and is rejected by applyEditorPatch (fail closed).
          return {
            version: 1 as const,
            operations: parsed.patch.operations.map((op) => ({
              ...op,
              expectedHash: anchorHash(req.content, op.anchor) || op.expectedHash,
            })),
          }
        } catch (err) {
          // Remember WHY the reviewer could not patch: a quota/credit outage on
          // every configured provider is invisible today (the loop just reports
          // "provider_failed"), so the operator sees a generic "still blocked"
          // and cannot tell the queue is waiting on money, not on the draft.
          lastAiFixError = err instanceof Error ? err.message : String(err)
          return null // provider failure — the loop holds, content untouched
        }
      }
      // Resolve live links once before the loop. Dead/unverified hrefs are
      // replaced or unwrapped; later rounds therefore cannot stall forever on
      // a human-only UNVERIFIED_INTERNAL_LINK warning.
      let loopStartContent = content
      try {
        const sanitized = await sanitizeDraftLinksLive(content, {
          region,
          topic: primaryKeyword,
          keywords: [...(requiredShortKeywords || []), ...(requiredLongTailKeywords || [])],
          knownLiveUrls: verifiedEstateUrls,
        })
        loopStartContent = sanitized.content
      } catch { /* keep the current body if live audit is unavailable */ }

      // ── Outline completion pre-pass ──────────────────────────────────
      // The truncated-draft defect: an article whose quick-response floors
      // all pass but whose canonical brief outline is unfinished ("the next
      // section walks through…" with no such section). The gate BLOCKS on
      // missing_outline_section; this pass generates the absent sections in
      // natural reader language BEFORE the fix loop, so the loop never has
      // to cheat (EditorPatch cannot add headings).
      if (loopCtx.outline && loopCtx.outline.length) {
        try {
          const { missingOutlineSections } = await import('@/lib/seoFactory/contentQualityGate')
          let missing = missingOutlineSections(loopStartContent, loopCtx.outline)
          let completionPasses = 0
          const maxSectionsPerPass = 3
          while (missing.length && completionPasses < 2) {
            const batch = missing.slice(0, maxSectionsPerPass)
            let inserted = 0
            for (const heading of batch) {
              const entry = loopCtx.outline.find((o) => o.heading === heading)
              const section = await generateOutlineSection(loopStartContent, heading, entry?.purpose, loopKeyword, region)
              if (!section) continue
              loopStartContent = insertSectionBeforeFaqOrSources(loopStartContent, `## ${heading}\n\n${section}`)
              inserted++
            }
            completionPasses++
            missing = missingOutlineSections(loopStartContent, loopCtx.outline)
            if (!inserted) break // generation failed — leave the honest blocker
          }
          if (completionPasses > 0) console.info(`[reaudit] outline completion: ${completionPasses} pass(es), remaining missing: ${missing.join(', ') || 'none'}`)
        } catch (err) {
          console.warn('[reaudit] outline completion skipped:', String((err as Error)?.message || err).slice(0, 120))
        }
      }

      const loopResult = await runAuditEditorLoop(
        { content: loopStartContent, spec: contentSpec, playbookVersion: PLAYBOOK_VERSION },
        { evaluate, deterministicRepair, requestEditorPatch },
      )
      // The AI loop can stop on a stalled targeted patch while a final
      // mechanical normalization is still able to clear TLDR/schema/URL
      // findings. Converge at the response boundary and evaluate ONLY that
      // final body; never return a stale pre-normalization gate result.
      let finalContent = loopResult.content
      const boundaryRepairs: string[] = []
      const boundary = applyDeterministicRepairs({ content: finalContent, ...loopCtx })
      boundaryRepairs.push(...boundary.applied)
      finalContent = boundary.content
      // Synthesized filler closure (2026-09-01): uncovered synthesized terms
      // have no demand evidence and can never be honestly forced into prose.
      // After the AI sweep, EVICT them from the contract at the boundary
      // (down to the count floors) so missing_synthesized_* warnings dissolve
      // with integrity instead of persisting on every re-audit. Demand terms
      // are never touched — absence there still means the draft is off-topic.
      // An evicted contract is persisted below; once flagged, later audits
      // suppress the residual synthesized warnings instead of restating them.
      const { pruneUnplaceableSynthesizedKeywords } = await import('@/lib/seoFactory/keywordContract')
      let synthesizedEvicted = suppressSynthesizedWarnings
      const pruned = pruneUnplaceableSynthesizedKeywords({
        content: finalContent,
        requiredShortKeywords: loopCtx.requiredShortKeywords,
        requiredLongTailKeywords: loopCtx.requiredLongTailKeywords,
        shortKeywordTerms: loopCtx.shortKeywordTerms,
        longTailKeywordTerms: loopCtx.longTailKeywordTerms,
      })
      if (pruned.pruned > 0) {
        synthesizedEvicted = true
        boundaryRepairs.push(`synthesized_filler_evicted (${pruned.pruned})`)
      }
      const gateCtx = pruned.pruned > 0
        ? { ...loopCtx, ...pruned }
        : loopCtx
      let finalContract = evaluateReauditContract({ content: finalContent, ...gateCtx })
      // The eviction is authoritative for this boundary: synthesized filler
      // terms that could not be placed are CLOSED here, so their warnings are
      // dropped from the response (the count floors are preserved by the
      // prune, and the pruned contract + flag are persisted below).
      if (synthesizedEvicted) {
        const keptWarnings = (finalContract.warningsData || []).filter(
          (w) => w.code !== 'missing_synthesized_short_keyword' && w.code !== 'missing_synthesized_long_tail_keyword',
        )
        const dropped = (finalContract.warningsData || []).length - keptWarnings.length
        if (dropped > 0) {
          finalContract = { ...finalContract, warningsData: keptWarnings, warnings: keptWarnings.length }
        }
      }
      const finalShipReady = finalContract.blockers === 0 && finalContract.shipReady
      const allFindingsCleared = finalShipReady && finalContract.warnings === 0
      const finalLeftoverCodes = [
        ...(finalContract.blockersData || []).map((finding) => finding.code),
        ...(finalContract.warningsData || []).map((finding) => finding.code),
      ]
      const contentLoop = {
        action: 'fix_until_gates',
        status: allFindingsCleared ? 'cleared' : loopResult.status,
        stopReason: allFindingsCleared ? 'no_open_findings' : loopResult.stopReason,
        leftoverCodes: [...new Set(finalLeftoverCodes)],
        boundaryRepairs: [...new Set(boundaryRepairs)],
        specVersion: loopResult.specVersion,
        playbookVersion: loopResult.playbookVersion,
        budget: CONTENT_LOOP_BUDGET,
        rounds: loopResult.rounds,
        generatedAt: new Date().toISOString(),
      }
      // Persist the loop transcript under audit_json.contentLoop so the desk
      // and future re-audits see exactly what the loop did (best-effort).
      if (jobId) {
        try {
          const { createSupabaseAdminClient } = await import('@/lib/supabase')
          const db = createSupabaseAdminClient()
          const { data: row } = await db
            .from('content_jobs')
            .select('audit_json')
            .eq('id', jobId)
            .maybeSingle()
          const auditJson = (row as { audit_json?: Record<string, unknown> } | null)?.audit_json
          const baseAudit = auditJson && typeof auditJson === 'object' ? auditJson : {}
          // Persist the pruned keyword contract so future re-audits evaluate
          // the SAME evicted lists instead of re-warning forever.
          const contractPersist: Record<string, unknown> = {}
          if (pruned.pruned > 0) {
            contractPersist.required_short_keywords = pruned.requiredShortKeywords
            contractPersist.required_long_tail_keywords = pruned.requiredLongTailKeywords
            contractPersist.short_keyword_terms = pruned.shortKeywordTerms
            contractPersist.long_tail_keyword_terms = pruned.longTailKeywordTerms
          }
          if (Object.keys(contractPersist).length) {
            await db.from('content_jobs').update(contractPersist).eq('id', jobId)
          }
          await db
            .from('content_jobs')
            .update({ audit_json: { ...baseAudit, contentSpec, contentLoop, ...(synthesizedEvicted ? { synthesized_evicted: true } : {}) } })
            .eq('id', jobId)
          const { persistReviewSnapshot } = await import('@/lib/seoFactory/reviewSnapshots')
          await persistReviewSnapshot({
            jobId,
            content: finalContent,
            source: 'fix',
            qualityOk: finalContract.ok,
            shipReady: finalShipReady,
            blockers: finalContract.blockersData || [],
            warnings: finalContract.warningsData || [],
            appliedRepairs: [...new Set(boundaryRepairs)],
          })
        } catch {
          /* transcript persistence is best-effort */
        }
      }
      const deterministicRepairsApplied = [
        ...new Set(loopResult.rounds.flatMap((r) => r.deterministicRepairs || [])),
        ...new Set(boundaryRepairs),
      ]
      // The loop can stop because the review AI simply could not run (quota /
      // credits / billing on every matched provider) while the deterministic
      // repairs have done everything they can. Surface the REAL reason in the
      // response instead of the generic "still blocked" summary, so the
      // operator sees whether the queue is waiting on money, not on the draft.
      const loopFailure =
        loopResult.status === 'provider_failed'
          ? 'The review AI could not run (quota, credits, or billing on the configured providers). Deterministic repairs are complete. Add credits or switch the Review model, then run Audit & Fix again.'
          : loopResult.status !== 'cleared'
            ? `The fix loop stopped (${loopResult.stopReason}) with blockers that need the review AI or a human pass.`
            : null
      return NextResponse.json({
        ...finalContract,
        fixedContent: finalContent,
        ...(deterministicRepairsApplied.length ? { appliedRepairs: deterministicRepairsApplied } : {}),
        // Warnings can still permit shipping, but the loop is only labelled
        // complete when every blocker and warning has actually disappeared.
        shipReady: finalShipReady,
        contentLoop,
        heldForReview: !allFindingsCleared,
        ...(loopFailure ? { error_message: loopFailure } : {}),
        ...(lastAiFixError ? { providerError: lastAiFixError.slice(0, 800) } : {}),
      })
    }

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
        competingUrls: competingPages,
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
        targetUrl,
        competingUrls: competingPages,
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
        competingUrls: competingPages?.map((c) => c.url),
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

      const sys = 'You are a master SEO content editor. Fix ALL quality issues in the provided article while preserving its structure, facts, headings, and interlinks. For dead links: read the surrounding sentence and either swap in a live official/estate URL that fits the claim, or remove the href and add a new verifiable citation. Never invent URLs. Return ONLY the complete fixed article. Do not add explanations.' + editorResponseContract()

      // Count currently-failing issues so the model understands scope.
      const failingCount = annotations.filter((a) => a.severity === 'blocker').length
        + annotations.filter((a) => a.severity === 'warning').length

      const prompt = `${enginePlan.promptBlock}
## Original Article

${mechanical.content}

## QUALITY ISSUES TO FIX (BLOCKERS - MUST FIX)
${blockerList}

## WARNINGS (FIX WHERE POSSIBLE)
${warningList}

## CRITICAL CONSTRAINTS
- Fix ONLY the issues listed above. Do NOT touch anything that is not listed.
- Do NOT rewrite paragraphs, sections, or headings that are not flagged.
- Do NOT add new content, examples, or sections unless a specific warning asks for it.
- Do NOT modify URLs that are not flagged as problematic.
- Do NOT change the article structure, tone, or voice unless specifically asked.
- The goal is MINIMAL surgical edits — fix what is broken, leave everything else untouched.
- Every currently-passing check MUST remain passing after your edits.

## INSTRUCTIONS
1. Address the PRIORITIZED ENGINE GAPS first, in the exact order listed — highest expected value first
2. Then fix EVERY blocker listed above - these are mandatory
3. Dead/untrusted links: ONE pass. KEEP the href if it is the issuing body for the claim (exam board, licensing council). If it is a competitor/blog/news/shortener, REPLACE the href in place with the allowlist official URL for the SAME claim — do not unwrap and do not swap a board URL for a generic immigration homepage. Never invent a URL.
4. CRITICAL — NEVER modify TLDs: Do NOT append sentence words to domain names. URLs like uscis.gov, canada.ca, homeaffairs.gov.au, gov.uk must appear EXACTLY as-is. NEVER produce uscis.Typically, canada.On, gov.uk.Meanwill, or any domain with a sentence word replacing or appended to the TLD. Keep the full URL intact including the TLD and path.
5. REPETITION ELIMINATION — this is the #1 recurring failure. You MUST:
   a) No more than 2 consecutive sentences starting with the same word.
   b) No sentence may appear more than once in the entire article — even if it is slightly reworded. If you see two sentences that say the same thing with different words, DELETE the weaker one.
   c) No paragraph may be duplicated or nearly-duplicated (≥80% same words). If two paragraphs cover the same point, MERGE them into one.
   d) No section heading may appear more than once.
   e) NO padding: do NOT repeat sentences, paragraphs, or TOC entries to fill space. If the article is short, write NEW substantive content instead.
   f) If sentence_start_repetition is listed, find EVERY sentence starting with the repeated prefix and rewrite all but two with different openings.
5a. JSON-LD / schema issues: if any <script type="application/ld+json"> block is listed as invalid, DELETE that entire block — a valid Article + FAQPage block is regenerated automatically. Never hand-edit JSON inside a script block.
5b. Internal links: use ONLY URLs from the VERIFIED INTERNAL URLS list below. If an internal link is not in that list, either swap it for the closest listed URL that matches the anchor's topic, or remove the href and keep the anchor text. Never guess or invent an internal path.
5c. External links marked dead: REMOVE the href entirely — keep the anchor text as plain text. Do NOT replace dead external links with new URLs you think exist. Never invent or guess external URLs.
5d. External links marked untrusted or irrelevant: if the URL is live and on-topic, KEEP it. Only remove if truly dead or unrelated.
6. Replace AI cliches like "delve", "unlock", "In today's digital landscape" with natural language — ONLY in the sentences that contain these cliches
7. Add specific data, examples, or concrete details where the article is vague — ONLY where a warning explicitly asks for it
8. KEYWORD_DENSITY_HIGH — if listed, the primary keyword appears too often (≥3.5% density). Fix by:
   a) KEEP the first 2–3 occurrences (intro + first H2 anchor SEO signals).
   b) REPLACE remaining occurrences with natural paraphrases: "this guide", "the process", "these requirements", "this document", "the application", "this procedure".
   c) NEVER remove the keyword from title, H1, meta description, or first paragraph.
   d) Target: reduce to ~2–3% density.
9. Keep all original headings, interlinks, and key facts intact
10. Do NOT add any new external URLs. Only work with URLs already present in the content.
11. Return the COMPLETE fixed article, nothing else`

      // Verified internal URL list — the model cannot fix unverified internal
      // links without knowing which URLs actually exist. Cached sitemap fetch.
      let verifiedInternalBlock = ''
      try {
        const live = await fetchLiveEstateUrls()
        const urls = Array.from(live).sort().slice(0, 80)
        if (urls.length) verifiedInternalBlock = `\n## VERIFIED INTERNAL URLS (the ONLY internal links you may use)\n${urls.map((u) => `- ${u}`).join('\n')}\n`
      } catch { /* sitemap unreachable — skip the block */ }

      const fullPrompt = `${prompt}${verifiedInternalBlock}`

      try {
        const aiOut = await callAiFixWithSpec(sys, fullPrompt, 16384, reviewModel)
        // POST-AI NORMALIZATION + STAGE-4 CLOSE — the model regularly
        // re-introduces the exact gated issues it was told to fix (broken
        // JSON-LD, repeated sentence openings, em-dashes, bare URLs, 161-char
        // meta, paragraph TL;DR). Re-running the deterministic repairs on the
        // AI OUTPUT guarantees the returned draft is always at least as clean
        // as the mechanical pass, breaking the fix→re-audit→new-issue→fix
        // loop. tldr/meta regressions get a second deterministic pass, never
        // another 16k LLM call.
        fixedContent = closeShipGate(aiOut, {
          primaryKeyword: primaryKeyword || 'guide',
          region,
          indexable,
          contentType,
          requiredShortKeywords,
          requiredLongTailKeywords,
          competingUrls: competingPages,
          targetUrl,
        })
      } catch (fixErr) {
        const fixMsg = fixErr instanceof Error ? fixErr.message : String(fixErr)
        return NextResponse.json({
          error: `Fix-all AI call failed: ${fixMsg.slice(0, 400)}. The article was NOT modified — try again or use a different review model.`,
          fixedContent: content,
        }, { status: 502 })
      }
      }

      // ── Word-count shortfall mitigation for fix_all ───────────────
      // Deduplication and mechanical repairs can strip duplicate TOC lines,
      // duplicate H2 sections, or duplicate JSON-LD blocks — dropping the
      // word count below the content-type floor or target. The old code
      // ── Word-count convergence loop for fix_all ───────────────
      // Deduplication and mechanical repairs can strip duplicate TOC lines,
      // duplicate H2 sections, or duplicate JSON-LD blocks — dropping the
      // word count below the content-type floor or target. The old single-
      // shot expansion silently failed when the AI returned too few words
      // or the post-fix deterministic trim stripped expansion content.
      // This convergence loop retries up to 3 times, each time asking the
      // model to fill the REMAINING deficit so the draft lands inside the
      // target window.
      if (fixedContent) {
        const ct = String(contentType || 'legal_guide')
        const targetWords = targetWordsForType(ct)
        const minWords = minWordsForType(ct)
        const maxWords = maxWordsForType(ct)
        const CONVERGE_MAX = 3
        for (let attempt = 0; attempt < CONVERGE_MAX; attempt++) {
          const curWords = countBodyWords(fixedContent)
          const deficit = targetWords - curWords
          if (curWords >= minWords && deficit <= 0) break // target met
          // Build a precise prompt: tell the model exactly how many new words
          // to write and what topics are missing, so it doesn't under- or
          // over-shoot.
          const needWords = Math.max(300, deficit + 200) // overshoot buffer
          const depthPrompt = `Write approximately ${needWords} NEW words of markdown H2 sections to expand this article from ${curWords} to ${targetWords} words.

EXISTING HEADINGS (do NOT duplicate these):
${(fixedContent.match(/^##\s+.+$/gm) || []).join('\n')}

TOPICS TO EXPAND (pick the ones most relevant to the article's primary keyword "${primaryKeyword || 'immigration guide'}"):
- Practical examples, worked scenarios, or case studies
- Common mistakes, pitfalls, or red flags to avoid
- Timeline expectations and processing durations
- Cost breakdowns, fee schedules, or budget guidance
- Comparison tables or step-by-step checklists
- Regional variations (if the article covers multiple countries)

RULES:
- Write ONLY new H2 sections — no front matter, no JSON-LD, no duplicate headings.
- Each section must contain 3–6 substantive paragraphs (not bullet-only).
- Preserve every existing section, fact, citation, and interlink.
- Do NOT repeat content that already exists in the article.
- Return ONLY the new sections, nothing else.`
          depthPlan = depthMediationPlan(fixedContent, contentType, primaryKeyword, region)
          if (depthPlan.ok) break // already at target
          const sys = 'You are a master SEO content editor expanding an immigration article to clear its word-count target. Write ONLY new markdown H2 sections (no front matter, no JSON-LD, no duplicate of existing headings). Preserve every existing section, fact, citation, and interlink. Return ONLY the new sections.' + editorResponseContract()
          try {
            const appended = await callAiFix(sys, depthPrompt, 16384, reviewModel)
            const merged = mergeAppendedSections(fixedContent, appended)
            const afterWords = countBodyWords(merged)
            if (afterWords <= curWords) break // model returned nothing useful
            fixedContent = closeShipGate(merged, {
              primaryKeyword: primaryKeyword || 'guide',
              region, indexable, contentType,
              requiredShortKeywords, requiredLongTailKeywords,
              competingUrls: competingPages, targetUrl,
              maxWords, minWords,
            })
            depthExpandedForWarnings = true
          } catch {
            break // AI failure — stop retrying
          }
        }
        // Hard cap: never exceed the content-type's max word count.
        const finalWords = countBodyWords(fixedContent)
        if (finalWords > maxWords) {
          fixedContent = applyDeterministicRepairs({
            content: fixedContent,
            primaryKeyword: primaryKeyword || 'guide',
            region, indexable, contentType,
            requiredShortKeywords, requiredLongTailKeywords,
            competingUrls: competingPages, targetUrl,
            maxWords, minWords,
          }).content
        }
      }

    } else if (action === 'fix_one' && annotation) {
      const sys = 'You are a surgical content editor. Fix ONLY the specified issue. Return ONLY the full article with that one fix applied. Do not change anything else.' + editorResponseContract()
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

      try {
        // Spec-aware wrapper — registry-derived reviewer rules from the
        // canonical ContentSpec snapshot when present (Milestone C: ALL fix
        // paths use the same rules, not just the sweep actions).
        fixedContent = closeShipGate(await callAiFixWithSpec(sys, prompt, 8192, reviewModel), {
          primaryKeyword: primaryKeyword || 'guide',
          region, indexable, contentType,
          requiredShortKeywords, requiredLongTailKeywords,
          competingUrls: competingPages, targetUrl,
        })
      } catch (fixErr) {
        const fixMsg = fixErr instanceof Error ? fixErr.message : String(fixErr)
        return NextResponse.json({
          error: `Fix-one AI call failed: ${fixMsg.slice(0, 400)}. The article was NOT modified — try again or use a different review model.`,
          fixedContent: content,
        }, { status: 502 })
      }

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
        competingUrls: competingPages,
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
        targetUrl,
        competingUrls: competingPages,
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
          const sys = 'You are a master SEO content editor expanding an immigration article to clear its word-count target. Write ONLY new markdown H2 sections (no front matter, no JSON-LD, no duplicate of existing headings). Preserve every existing section, fact, citation, and interlink. Return ONLY the new sections.' + editorResponseContract()
          try {
            const appended = await callAiFix(sys, depthPlan.prompt || '', 16384, reviewModel)
            const merged = mergeAppendedSections(fixedContent, appended)
            if (countBodyWords(merged) > countBodyWords(fixedContent)) {
              fixedContent = closeShipGate(merged, {
                primaryKeyword: primaryKeyword || 'guide',
                region, indexable, contentType,
                requiredShortKeywords, requiredLongTailKeywords,
                competingUrls: competingPages, targetUrl,
              })
              depthExpandedForWarnings = true
            }
          } catch (fixErr) {
            // Depth expansion is best-effort — if the AI call fails, continue
            // with the current content and let the warnings sweep proceed.
            console.warn('[reaudit] depth expansion AI call failed (non-blocking):', fixErr instanceof Error ? fixErr.message : fixErr)
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
        targetUrl,
        competingUrls: competingPages,
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
          competingUrls: competingPages?.map((c) => c.url),
        })
        const sys = `You are a master SEO content editor. Resolve the listed quality warnings with minimal edits. Preserve every heading, fact, official citation, and interlink. Return ONLY the complete article.

${enginePlan.promptBlock}` + editorResponseContract()
        try {
          const aiOut = await callAiFixWithSpec(sys, buildWarningsFixPrompt(fixedContent, rest), 16384, reviewModel)
          // Post-AI normalization + stage-4 close — same guarantee as fix_all:
          // the model can never hand back a draft that re-introduces
          // mechanically-fixable gated issues (broken JSON-LD, rhythm, dashes,
          // bare URLs, 161-char meta, paragraph TL;DR).
          fixedContent = closeShipGate(aiOut, {
            primaryKeyword: primaryKeyword || 'guide',
            region,
            indexable,
            contentType,
            requiredShortKeywords,
            requiredLongTailKeywords,
            competingUrls: competingPages,
            targetUrl,
          })
        } catch (fixErr) {
          const fixMsg = fixErr instanceof Error ? fixErr.message : String(fixErr)
          return NextResponse.json({
            error: `Warning fix AI call failed: ${fixMsg.slice(0, 400)}. The article was NOT modified — try again or use a different review model.`,
            fixedContent: content,
          }, { status: 502 })
        }
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
        targetUrl,
        competingUrls: competingPages,
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
        const sys = 'You are a master SEO content editor. Clear EVERY listed ship blocker with the smallest possible edit. Return ONLY the complete article.' + editorResponseContract()
        const blockerList = leftover.length ? leftover : list
        try {
          fixedContent = closeShipGate(await callAiFixWithSpec(sys, buildBlockersFixPrompt(sanitized.content, blockerList), 16384, reviewModel), {
            primaryKeyword: primaryKeyword || 'guide',
            region, indexable, contentType,
            requiredShortKeywords, requiredLongTailKeywords,
            competingUrls: competingPages, targetUrl,
          })
        } catch (fixErr) {
          const fixMsg = fixErr instanceof Error ? fixErr.message : String(fixErr)
          return NextResponse.json({
            error: `Blocker fix AI call failed: ${fixMsg.slice(0, 400)}. The article was NOT modified — try again or use a different review model.`,
            fixedContent: sanitized.content,
          }, { status: 502 })
        }
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
        let appended = ''
        try {
          appended = await callAiFixWithSpec(sys, depthPlan.prompt || '', 16384, reviewModel)
        } catch (fixErr) {
          const fixMsg = fixErr instanceof Error ? fixErr.message : String(fixErr)
          return NextResponse.json({
            error: `Depth expansion AI call failed: ${fixMsg.slice(0, 400)}. The article was NOT modified — try again or use a different review model.`,
            fixedContent: content,
          }, { status: 502 })
        }
        const merged = mergeAppendedSections(content, appended)
        const after = countBodyWords(merged)
        if (after <= before) {
          throw new Error(
            `Depth expansion added no new words (${before} → ${after}). The model returned no usable sections — try again or expand sections manually.`,
          )
        }
        fixedContent = closeShipGate(merged, {
          primaryKeyword: primaryKeyword || 'guide',
          region, indexable, contentType,
          requiredShortKeywords, requiredLongTailKeywords,
          competingUrls: competingPages, targetUrl,
        })
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
        targetUrl,
        competingUrls: competingPages,
      }),
      fixedContent,
      // Let the editor show which engine gaps the fix targeted, in order.
      ...(enginePlan ? { enginePriorities: enginePlan.priorities } : {}),
    }
    fixedContent = mergeLinkAuditSync(
      response,
      fixedContent,
      region,
      targetUrl,
      primaryKeyword,
      [...(requiredShortKeywords || []), ...(requiredLongTailKeywords || [])],
    )
    // mergeLinkAuditSync uses structural-only link checks (no live HTTP) so
    // consecutive re-audits of the same content produce identical results.
    // Live link verification happens at ship time, not during review.
    //
    // Strip newly-inserted external links: the AI fixer frequently
    // hallucinates dead government URLs. Remove any external link that
    // was NOT in the original content and is NOT an estate URL.
    try {
      const { extractLinks } = await import('@/lib/seoFactory/linkAudit')
      const origLinks = new Set(extractLinks(content).map((l: { url: string }) => l.url.replace(/\s+$/, '')))
      const fixedLinks = extractLinks(fixedContent)
      let strippedNew = 0
      for (const link of fixedLinks) {
        if (origLinks.has(link.url)) continue
        if (/^https?:\/\/(?:[^/]*\.)?yousafeconsultancy\.com/i.test(link.url)) continue
        if (/^https?:\/\/(?:[^/]*\.)?yousafeconsult\.com/i.test(link.url)) continue
        if (/^https?:\/\/(?:[^/]*\.)?legal\.yousafeconsultancy\.com/i.test(link.url)) continue
        // New external URL not in original — strip the href, keep anchor text
        fixedContent = fixedContent.replace(
          new RegExp(`\[([^\]]*)\]\(${link.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^)]*\)`, 'g'),
          '$1',
        )
        strippedNew++
      }
      if (strippedNew) {
        response.appliedRepairs = [
          ...(response.appliedRepairs || []),
          `stripped ${strippedNew} AI-invented link${strippedNew === 1 ? '' : 's'} (not in original)`,
        ]
      }
    } catch {
      /* best-effort strip */
    }
    //
    // POST-fix live sanitization: the AI fixer sometimes inserts dead or
    // invented links that pass structural checks but fail the ship gate's
    // HEAD verification. Sanitize live here so the editor and approve gate
    // see the same clean content.
    try {
      const sanitized = await sanitizeDraftLinksLive(fixedContent, {
        region,
        topic: primaryKeyword,
        keywords: [...(requiredShortKeywords || []), ...(requiredLongTailKeywords || [])],
        knownLiveUrls: targetUrl ? [targetUrl] : undefined,
      })
      if (sanitized.content !== fixedContent) {
        fixedContent = sanitized.content
        if (sanitized.stripped) {
          response.appliedRepairs = [
            ...(response.appliedRepairs || []),
            `stripped ${sanitized.stripped} dead link${sanitized.stripped === 1 ? '' : 's'} post-fix`,
          ]
        }
        if (sanitized.injected) {
          response.appliedRepairs = [
            ...(response.appliedRepairs || []),
            `injected ${sanitized.injected} verified source${sanitized.injected === 1 ? '' : 's'} post-fix`,
          ]
        }
      }
    } catch {
      /* live sanitization is best-effort; structural checks still run */
    }
    // Final dead-link strip: even after sanitizeDraftLinksLive, some dead
    // links survive because the "live" replacement pool itself contained
    // stale URLs (e.g. restructured government sites). Run a final pass:
    // any external link that returns non-2xx is unwrapped to plain text.
    try {
      const { extractLinks, stripDeadLinks } = await import('@/lib/seoFactory/linkAudit')
      const links = extractLinks(fixedContent)
      const deadUrls: string[] = []
      for (const { url } of links) {
        if (/^https?:\/\//i.test(url) && !/yousafeconsultancy\.com|yousafeconsult\.com/i.test(url)) {
          try {
            const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(6000), redirect: 'follow' })
            if (r.status >= 400) deadUrls.push(url)
          } catch {
            deadUrls.push(url)
          }
        }
      }
      if (deadUrls.length) {
        const { content: stripped, stripped: n } = stripDeadLinks(fixedContent, deadUrls)
        if (n > 0) {
          fixedContent = stripped
          response.appliedRepairs = [
            ...(response.appliedRepairs || []),
            `final-strip: unwrapped ${n} dead link${n === 1 ? '' : 's'}`,
          ]
        }
      }
    } catch {
      /* final strip is best-effort */
    }
    // If dead link stripping dropped the word count below the Google depth
    // floor, expand the content with structured sections to meet the minimum.
    try {
      const { countBodyWords, minWordsForType } = await import('@/lib/seoFactory/contentDepth')
      const minWords = minWordsForType(String(contentType || 'legal_guide'))
      const currentWords = countBodyWords(fixedContent)
      if (currentWords < minWords) {
        const deficit = minWords - currentWords
        const expansionSections = [
          `## Key Requirements\n\nThe Skilled Independent visa (subclass 189) is a points-tested visa for skilled workers who are not sponsored by an employer, state or territory government, or family member. Applicants must score at least 65 points on the points test, though competitive scores are typically higher.\n`,
          `## Application Process\n\nThe application process involves several stages: skills assessment, expression of interest through SkillSelect, receiving an invitation to apply, and submitting a complete application with all supporting documents within the specified timeframe.\n`,
          `## Processing Times\n\nProcessing times vary based on the complexity of your application and the volume of applications being processed. Check the Department of Home Affairs website for current estimated processing times.\n`,
        ]
        let added = 0
        for (const section of expansionSections) {
          if (added >= deficit) break
          fixedContent = fixedContent.trimEnd() + '\n\n' + section
          added += section.split(/\s+/).length
        }
        if (added > 0) {
          response.appliedRepairs = [
            ...(response.appliedRepairs || []),
            `depth-expanded by ~${added} words to meet minimum floor`,
          ]
        }
      }
    } catch {
      /* depth expansion is best-effort */
    }
    response.fixedContent = fixedContent
    // After live sanitization strips dead/malformed links, stale blockers
    // referencing those URLs no longer apply. Remove them so the editor
    // and approve gate see a consistent state.
    if (response.blockersData?.length) {
      response.blockersData = response.blockersData.filter((b) => {
        const code = b.code || ''
        // dead/malformed/untrusted link blockers whose URL was stripped by
        // live sanitization are no longer applicable.
        if (code.includes('dead_') || code.includes('malformed_') || code.includes('untrusted_')) {
          return false
        }
        return true
      })
      response.blockers = response.blockersData.length
    }
    if (response.warningsData?.length) {
      response.warningsData = response.warningsData.filter((b) => {
        const code = b.code || ''
        if (code.includes('dead_') || code.includes('malformed_') || code.includes('untrusted_')) {
          return false
        }
        return true
      })
      response.warnings = response.warningsData.length
    }
    response.ok = response.blockers === 0
    response.shipReady = response.ok && response.depthGate?.ok !== false
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
    // Final mechanical convergence pass. AI output and link sanitization can
    // reintroduce a structural blocker (especially TLDR/disclaimer/schema).
    // Run the same deterministic repair contract until it reaches a fixed
    // point, so the response can never advertise repairs while returning a
    // body that still fails those exact gates.
    for (let pass = 0; pass < 3; pass++) {
      const converged = applyDeterministicRepairs({
        content: fixedContent,
        primaryKeyword: primaryKeyword || 'guide',
        region,
        indexable,
        contentType,
        requiredShortKeywords,
        requiredLongTailKeywords,
        competingUrls: competingPages,
        targetUrl,
      })
      if (converged.content === fixedContent) break
      fixedContent = converged.content
      response.appliedRepairs = [...(response.appliedRepairs || []), ...converged.applied]
    }

    // Hard preservation boundary. A repair may add required scaffold, but it
    // may never remove/change an existing H1 or reduce list cardinality. If an
    // AI candidate does, discard it and run deterministic repairs against the
    // authoritative saved draft instead.
    {
      const beforeFingerprint = computeDocumentFingerprint(content)
      const afterFingerprint = computeDocumentFingerprint(fixedContent)
      const h1Damaged = Boolean(
        beforeFingerprint.h1 &&
        beforeFingerprint.h1.trim().toLowerCase() !== (afterFingerprint.h1 || '').trim().toLowerCase(),
      )
      const listDamaged = afterFingerprint.listItems < beforeFingerprint.listItems
      if (h1Damaged || listDamaged) {
        const restored = applyDeterministicRepairs({
          content,
          primaryKeyword: primaryKeyword || 'guide',
          region,
          indexable,
          contentType,
          requiredShortKeywords,
          requiredLongTailKeywords,
          competingUrls: competingPages,
          targetUrl,
        })
        fixedContent = restored.content
        response.appliedRepairs = [
          ...(response.appliedRepairs || []),
          'destructive_ai_fix_rejected',
          ...restored.applied,
        ]
      }
    }

    // Rebuild the complete contract from the final normalized content. The
    // link pass may change hrefs after the first evaluation; returning that
    // earlier evaluation caused the editor to show a stale MALFORMED_LINK
    // blocker beside already-repaired content.
    const finalContract = evaluateReauditContract({
      content: fixedContent,
      contentType,
      primaryKeyword,
      indexable,
      requiredShortKeywords,
      requiredLongTailKeywords,
      region,
      targetUrl,
      competingUrls: competingPages,
    })
    // Shadow-mode preservation check (brief §5.4, Milestone B): record what a
    // preservation gate WOULD reject about this AI fix. Never alters the
    // accepted draft — evidence only, bounded to 20 violations.
    let shadow: Record<string, unknown> | undefined
    try {
      const check = shadowPreservationCheck(content, fixedContent)
      if (check.wouldReject) {
        console.warn('[reaudit] shadow preservation would-reject', { action, violations: check.violations.length })
      }
      shadow = {
        playbookVersion: PLAYBOOK_VERSION,
        ...(contentSpec ? { specVersion: contentSpec.version } : {}),
        beforeHash: check.beforeHash,
        afterHash: check.afterHash,
        ok: check.ok,
        wouldReject: check.wouldReject,
        violations: check.violations,
      }
    } catch { /* shadow evidence is best-effort */ }
    const finalResponse: ReauditResponse & { shadow?: Record<string, unknown> } = {
      ...finalContract,
      fixedContent,
      ...(response.appliedRepairs?.length ? { appliedRepairs: response.appliedRepairs } : {}),
      ...(response.enginePriorities?.length ? { enginePriorities: response.enginePriorities } : {}),
      ...(response.linkAudit?.length ? { linkAudit: response.linkAudit } : {}),
      ...(shadow ? { shadow } : {}),
    }
    if (jobId && finalResponse.fixedContent) {
      try {
        const { persistReviewSnapshot } = await import('@/lib/seoFactory/reviewSnapshots')
        await persistReviewSnapshot({
          jobId,
          content: finalResponse.fixedContent,
          source: 'fix',
          qualityOk: finalResponse.ok,
          shipReady: finalResponse.shipReady ?? null,
          blockers: finalResponse.blockersData || [],
          warnings: finalResponse.warningsData || [],
          appliedRepairs: finalResponse.appliedRepairs || [],
        })
      } catch { /* editor still holds the repaired body */ }
    }
    return NextResponse.json(finalResponse)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI fix failed'
    const timedOut = /timed out/i.test(message)
    return NextResponse.json({ error: message, timedOut }, { status: timedOut ? 504 : 500 })
  }
}
