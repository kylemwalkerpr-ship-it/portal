/**
 * Shared SEO Factory pipeline: plan → GSC brief → AI (with refine) → audit → ship.
 */

import { createClient } from '@supabase/supabase-js'
import { resolveOwner, assertPlanRepoConsistency, type OwnerPlan } from './ownership'
import { auditContent, canAutodeploy, type SeoFactoryAudit } from './audit'
import { shipContent, type ShipMode, type ShipResult } from './ship'
import { buildGscContentBrief, formatGscBriefForPrompt } from '@/lib/gscContentBrief'
import { generateContentText } from '@/lib/contentAiProvider'
import { formatStrategyForPrompt } from '@/lib/seoDataLoaders'
import {
  auditToRefineNotes,
  buildDepthAppendPrompt,
  buildDepthExpandPrompt,
  buildFactorySystemPrompt,
  buildFactoryUserPrompt,
  extractH2Titles,
  mergeAppendedSections,
  minWordsForType,
  type ModelGuidanceInput,
} from './prompts'
import { countBodyWords, targetWordsForType, maxWordsForType } from './contentDepth'
import { meetsDepthFloor, meetsShipQuality } from './audit'
import { evaluateContentQuality, qualityToRefineNotes } from './contentQualityGate'
import { buildSeoCanon, type SeoCanon } from './seoCanon'
import { applyDeterministicRepairs, ensureEditorialScaffold } from './editorialScaffold'
import { buildGenerationEnrichment } from '@/lib/seoFactory/crossDomainEnrich'
import { stripNoIndex } from './siteHealthFixes'
import { partitionKeywords } from '@/lib/seoEngine/planner'
import { isJunkTopic } from './queryNoise'

/**
 * Token budget: cap generation to stay within max word count.
 * Estimate: ~1.5 tokens per word + 1200 overhead for YAML, JSON-LD, disclaimer.
 * Hard ceiling of 8,000 to prevent 4,000+ word blow-ups.
 *
 * For pillar (max 2,800w):  2,800*1.5+1,200 = 5,400 → ~3,600w max
 * For blog   (max 1,500w):  1,500*1.5+1,200 = 3,450 → ~2,300w max
 */
function tokensForType(contentType: string, phase: 'draft' | 'expand' | 'append'): number {
  const maxWords = maxWordsForType(contentType)
  const estimated = Math.round(maxWords * 1.5 + 1200)
  const cap = Math.min(estimated, 8000)
  if (phase === 'append') return Math.min(cap, 5000)
  return cap
}

/**
 * Wrap an AI generation call with one automatic retry on transient failures
 * (timeout, rate-limit, gateway 500s). Returns the first successful result
 * or throws after exhausting retries.
 */
async function generateWithRetry(
  fn: typeof generateContentText,
  opts: Parameters<typeof generateContentText>[0],
): Promise<{ text: string; provider: string; model: string }> {
  const maxAttempts = process.env.CONTENT_AI_RETRY === '1' ? 2 : 1
  for (let retry = 0; retry < maxAttempts; retry++) {
    try {
      const result = await fn(opts)
      if (result.text && result.text.length > 50) return result
    } catch (e) {
      if (retry >= maxAttempts - 1 || /Too many subrequest/i.test(e instanceof Error ? e.message : String(e))) throw e
      console.warn(
        `[pipeline] AI transient error (retry ${retry + 1})`,
        e instanceof Error ? e.message : e,
      )
      await new Promise((r) => setTimeout(r, 2000 * (retry + 1)))
    }
  }
  throw new Error('AI generation failed after retry')
}

export type RequestedShipMode = ShipMode | 'none' | 'auto' | 'merge'

export interface PipelineInput {
  topic: string
  title?: string
  primaryKeyword?: string
  region?: string
  contentType?: string
  tone?: string
  audience?: string
  keywords?: string[]
  slug?: string
  indexable?: boolean
  shipMode?: RequestedShipMode
  dryRun?: boolean
  /** Min audit score before shipping (default 65). Refine if below. */
  minAuditScore?: number
  /** Max AI refine attempts after first draft (default 3 — depth expands need room). */
  maxRefine?: number
  opportunityAction?: string
  writeHint?: string
  userId?: string
  /** Update this job in place instead of inserting a sibling queue row. */
  existingJobId?: string | null
  /** Existing job replaced by this regeneration, shown in the queue lineage. */
  sourceJobId?: string | null
  /** Operator-readable reason and mode for regeneration lineage. */
  regenerationReason?: string | null
  regenerationMode?: 'new' | 'refresh' | 'expand' | 'resume' | 'manual' | null
  /** Evidence snapshot carried from the radar/planner into the queue. */
  intelligenceLineage?: Record<string, unknown> | null
  skipShipIfBelowScore?: boolean
  /** Saved partial draft used when continuing an interrupted stream. */
  resumeContent?: string
  /** Admin-chosen AI provider pin ('grok' | 'openai' | 'nvidia-deepseek' | 'auto'). */
  aiProvider?: string
  /**
   * Opportunity Radar brief (play, intent, signals) — consumed by the streaming
   * pipeline's autopilot transparency block. Complement to `modelGuidance`
   * (which carries the ranking model's recommendedActions + forecast).
   */
  opportunity?: {
    primaryKeyword?: string
    play?: string
    intent?: string
    opportunityScore?: number
    signals?: string[]
  } | null
  /**
   * Ranking-model guidance (recommendedActions + forecast) — threads into the
   * generation prompt so the draft is written against the model's weak families.
   */
  modelGuidance?: ModelGuidanceInput | null
  /** Master SEO Engine prompt pack (scoreMaster + prioritized gaps). */
  masterEngineBlock?: string | null
  /** Internal-link targets chosen by the Opportunity Radar autopilot. */
  interlinks?: Array<{ label?: string; url?: string; site?: string; matchedOn?: string[] }> | null
  /**
   * Keyword-cluster resolution (anti-cannibalization): when the Radar resolves
   * this brief to an existing canonical page, generation expands THAT page and
   * merges the whole cluster's keywords instead of creating a sibling.
   */
  cluster?: {
    clusterId?: string
    canonicalTerm?: string
    keywords?: string[]
    intent?: string
    region?: string
    mode?: 'expand' | 'new'
    targetUrl?: string | null
    targetRepo?: string | null
    targetFilePath?: string | null
    existingJobId?: string | null
    reason?: string
  } | null
  /** Brief Assembly Panel: admin-defined H2 section outline */
  h2Outline?: string[]
  /** Brief Assembly Panel: sources the AI must cite */
  sources?: string[]
  /** Brief Assembly Panel: admin-specified min word count */
  minWords?: number
  /** Brief Assembly Panel: admin-specified max word count */
  maxWords?: number
  /**
   * Segmented writing — write long documents in N sequential bounded parts so
   * thinking mode + content fit the token budget. Default 2 for long-form
   * (minWords ≥1600), 1 otherwise. Max 4.
   */
  writeSegments?: number
  /** Brief Assembly Panel: target slug for the generated page */
  targetSlug?: string
  /** Brief Assembly Panel: keyword → H2 section placement map */
  kwH2Map?: Record<string, string>
  /** Competing estate pages detected by the Discover stage's anti-cannibalization
   *  guard. Stored in content_jobs.competing_urls so the quality gate and
   *  deterministic repair fire on reaudit / ship. */
  competingUrls?: Array<{ url?: string; title?: string; primaryKeyword?: string | null }>
}

export interface PipelineResult {
  ok: boolean
  content: string
  plan: OwnerPlan
  audit: SeoFactoryAudit
  ship: ShipResult | null
  shipError: string | null
  shipMode: RequestedShipMode
  provider: string
  model: string
  attempts: number
  gsc: {
    source: string
    mode: string
    primaryKeywords: unknown[]
    opportunityKeywords: unknown[]
    warnings: string[]
  }
  jobId: string | null
  error?: string
}

function resolveShipMode(
  requested: RequestedShipMode,
  audit: SeoFactoryAudit,
  plan: OwnerPlan,
): ShipMode | 'none' {
  if (requested === 'none') return 'none'
  if (requested === 'pr') return 'pr'
  if (requested === 'merge') {
    // Prefer PR→merge to main (audit trail); fall back handled in shipContent
    return plan.blockers.length === 0 ? 'merge' : 'pr'
  }
  if (requested === 'autodeploy') {
    return canAutodeploy(audit, plan.ymy) && plan.blockers.length === 0 ? 'autodeploy' : 'merge'
  }
  // auto: high-quality non-blocked → merge to main; else PR for review
  if (canAutodeploy(audit, plan.ymy) && plan.blockers.length === 0) return 'merge'
  return 'pr'
}

export async function runSeoFactoryPipeline(input: PipelineInput): Promise<PipelineResult> {
  const topic = (input.topic || '').trim()
  const primaryKeyword = (input.primaryKeyword || topic).trim()
  // Partition the user-supplied keywords + primary keyword into short / long-tail so the
  // brief and the gate can enforce ≥5 short and ≥4 long-tail on every draft.
  const userKeywords = Array.isArray(input.keywords) ? input.keywords : []
  const briefPartition = partitionKeywords(
    userKeywords,
    primaryKeyword,
  )
  const requiredShortKeywords = briefPartition.short
  const requiredLongTailKeywords = briefPartition.longTail
  const title = (input.title || topic || primaryKeyword).trim()
  const region = (input.region || 'US').toUpperCase()
  let contentType = input.contentType || 'legal_guide'
  const tone = input.tone || 'educational'
  const indexable = input.indexable !== false
  const requestedMode = (input.shipMode || 'pr') as RequestedShipMode
  const minAudit = Math.min(95, Math.max(50, Number(input.minAuditScore) || 65))
  // Bound total AI calls per Worker invocation. Quality review can continue
  // manually from the Studio after this safe initial pass.
  // Allow enough refine passes that a second draft is always attempted before ship.
  const maxRefine = Math.min(3, Math.max(1, Number(input.maxRefine ?? 2)))

  if (!topic) {
    throw new Error('topic required')
  }

  // Refuse junk-query jobs before they generate — GSC/autocomplete leaks
  // ("rates final.pdf …/files/user2983", quoted document stamps, brand pastes)
  // can never resolve into a real content page. Long-tail topics stay allowed.
  if (isJunkTopic(topic) || isJunkTopic(primaryKeyword)) {
    throw new Error(
      `Rejected junk keyword: "${primaryKeyword || topic}" is not a valid search topic`,
    )
  }

  // Keyword cluster: merge the whole cluster into the brief so ONE page answers
  // every related query (anti-cannibalization). Resolve to an existing page
  // when the cluster says so.
  const clusterKeywords = Array.isArray(input.cluster?.keywords)
    ? input.cluster!.keywords!
    : []
  const mergedKeywords = Array.isArray(input.keywords)
    ? [...new Set([...input.keywords, primaryKeyword, ...clusterKeywords])].slice(0, 10)
    : [...new Set([primaryKeyword, ...clusterKeywords])].slice(0, 10)
  const ownerUrlHint =
    input.cluster?.mode === 'expand' && input.cluster?.targetUrl
      ? String(input.cluster.targetUrl)
      : undefined

  // Resolve ownership FIRST from SEO strategies registry — content type may be adjusted
  const plan = await resolveOwner({
    primaryKeyword,
    contentType,
    region,
    indexable,
    slug: input.slug,
    ownerUrlHint,
  })
  // Always trust plan's path/host-reconciled type (never ship legal_guide to usa universities)
  contentType = plan.contentType || contentType
  if (plan.intentClass === 'geo_modifier') contentType = 'regional_from'
  else if (plan.intentClass === 'university_modifier') contentType = 'regional_university'
  // Transactional intent is downgraded by standingRulesHost to a blog_summary on
  // legal or the best-fit regional host — the studio never creates marketplace gigs.
  else if (plan.intentClass === 'transactional') contentType = 'blog_summary'
  else if (plan.intentClass === 'news_summary') contentType = 'blog_summary'
  else if (plan.host === 'legal' && (contentType === 'regional_page' || !input.contentType)) {
    contentType = 'legal_guide'
  }
  // Second pass: path wins if still mismatched (defense in depth)
  if (/content\/universities\//.test(plan.filePath)) contentType = 'regional_university'
  else if (/content\/from\//.test(plan.filePath)) contentType = 'regional_from'
  else if (
    (plan.host === 'usa' || plan.host === 'uk' || plan.host === 'ca' || plan.host === 'au' || plan.host === 'apex') &&
    (contentType === 'legal_guide' || contentType === 'article')
  ) {
    contentType = 'regional_page'
  }
  assertPlanRepoConsistency(plan)
  const minWords = input.minWords ?? minWordsForType(contentType)
  const targetWords = targetWordsForType(contentType)
  const maxWords = input.maxWords ?? maxWordsForType(contentType)

  const gscBrief = await buildGscContentBrief({
    topic,
    region,
    keywords: mergedKeywords,
  })
  // Build canonical SEO intelligence — the single source of truth for all
  // keyword selection, intent classification, and conversion routing.
  const seoCanon = buildSeoCanon({
    brief: gscBrief,
    plan,
    contentType,
    region,
    title,
    topic,
    extraKeywords: mergedKeywords,
  })
  const canonPortfolio = seoCanon.canonicalPromptBlock

  const strategyBlock = await formatStrategyForPrompt({
    topic: `${topic} ${primaryKeyword}`,
    maxChars: 4200,
  })

  const { assembleDraftSourceAllowlist, sanitizeDraftLinksLive, urlsFromAllowlistLines } = await import('./linkAudit')
  const citationCtx = { region, topic, keywords: mergedKeywords }
  const verifiedSources = await assembleDraftSourceAllowlist(region, input.sources as string[] | undefined, citationCtx)
  const verifiedSourceUrls = urlsFromAllowlistLines(verifiedSources)

  const system = buildFactorySystemPrompt({
    plan,
    contentType,
    minWords,
    maxWords,
    strategyBlock,
    requiredShortKeywords,
    requiredLongTailKeywords,
    h2Outline: input.h2Outline as string[] | undefined,
    sources: verifiedSources,
    targetSlug: input.targetSlug as string | undefined,
    kwH2Map: input.kwH2Map as Record<string, string> | undefined,
  })

  let content = input.resumeContent || ''
  let provider = 'unknown'
  let model = 'unknown'
  let audit: SeoFactoryAudit = auditContent({
    content: '',
    contentType,
    primaryKeyword,
    indexable: plan.indexable,
    ownershipBlockers: plan.blockers,
  })
  let attempts = 0
  let refineNotes: string | undefined
  let expandPasses = 0
  let stalledCount = 0
  const maxStalled = 2  // consecutive non-improving attempts before giving up

  // ── PASS 1: Main refine loop (depth + quality) ─────────────────────────
  for (let i = 0; i <= maxRefine; i++) {
    attempts = i + 1
    const underDepth = Boolean(content) && countBodyWords(content) < minWords

    // Under depth → dedicated expand prompt (keeps draft, forbids short rewrite)
    const prompt = underDepth
      ? buildDepthExpandPrompt({
          title,
          topic,
          primaryKeyword,
          region,
          contentType,
          minWords,
          targetWords,
          maxWords,
          currentWords: countBodyWords(content),
          draft: content,
        })
      : buildFactoryUserPrompt({
          title,
          topic,
          primaryKeyword,
          region,
          contentType,
          tone,
          audience: input.audience,
          gscBlock: canonPortfolio,
          opportunityAction: input.opportunityAction,
          writeHint: input.writeHint,
          modelGuidance: input.modelGuidance || undefined,
          masterEngineBlock: input.masterEngineBlock || undefined,
          refineNotes,
          // Keep human/model fixes when resuming a saved draft (retry cron).
          draft: content || undefined,
        })

    const prevWords = content ? countBodyWords(content) : 0
    const prevBlockers = audit.blockers.length
    const prevScore = audit.score
    const ai = await generateWithRetry(generateContentText, {
      system,
      prompt,
      maxTokens: tokensForType(contentType, underDepth ? 'expand' : 'draft'),
      temperature: i === 0 ? 0.5 : underDepth ? 0.45 : 0.35,
      aiProvider: input.aiProvider,
    })
    // Never accept a shorter body when we were expanding for depth
    if (underDepth && countBodyWords(ai.text) < prevWords) {
      // keep previous content; will try append rescue after loop
      provider = ai.provider
      model = ai.model
    } else {
      content = ai.text
      provider = ai.provider
      model = ai.model
    }

    audit = auditContent({
      content,
      contentType,
      primaryKeyword,
      indexable: plan.indexable,
      ownershipBlockers: plan.blockers,
      requiredShortKeywords,
      requiredLongTailKeywords,
    })

    // Depth + voice/tone/compliance — unattended publish must clear all gates
    const goodEnough =
      audit.score >= minAudit &&
      meetsShipQuality(audit) &&
      audit.blockers.filter((b) => b.code !== 'ownership').length === 0

    if (goodEnough) break

    // Progress check: break only if we've been stalled for maxStalled attempts
    const improved = audit.score > prevScore || audit.blockers.length < prevBlockers
    if (improved) {
      stalledCount = 0
    } else {
      stalledCount++
      if (stalledCount >= maxStalled) {
        console.warn(
          `[pipeline] refine stalled after ${attempts} attempts (score ${audit.score}, ${audit.blockers.length} blockers) — moving to depth rescue`,
        )
        break
      }
    }

    if (i === maxRefine) break
    const q = evaluateContentQuality({
      content,
      contentType,
      primaryKeyword,
      indexable: plan.indexable,
      requiredShortKeywords,
      requiredLongTailKeywords,
      region,
      linkAllowlist: (input.interlinks ?? []).map((l) => l.url).filter(Boolean) as string[],
    })
    refineNotes = [
      auditToRefineNotes({
        ...audit,
        minWords,
        targetWords,
      }),
      !q.ok || q.humanScore < 75 ? qualityToRefineNotes(q) : '',
    ]
      .filter(Boolean)
      .join('\n\n')
  }

  // ── PASS 2: Depth rescue (expand/append until floor met) ───────────────
  const maxExpand = contentType === 'marketplace_gig' ? 1 : 5
  while (countBodyWords(content) < minWords && expandPasses < maxExpand) {
    expandPasses++
    attempts++
    const currentWords = countBodyWords(content)
    try {
      // Pass 1: full expand rewrite; passes 2+: append new H2 sections only
      if (expandPasses === 1) {
        const ai = await generateWithRetry(generateContentText, {
          system,
          prompt: buildDepthExpandPrompt({
            title,
            topic,
            primaryKeyword,
            region,
            contentType,
            minWords,
            targetWords,
            maxWords,
            currentWords,
            draft: content,
          }),
          maxTokens: tokensForType(contentType, 'expand'),
          temperature: 0.42,
          aiProvider: input.aiProvider,
        })
        if (countBodyWords(ai.text) > currentWords) {
          content = ai.text
          provider = ai.provider
          model = ai.model
        }
      } else {
        const ai = await generateWithRetry(generateContentText, {
          system:
            'You expand immigration educational guides with concrete practitioner sections. No front matter. No JSON-LD. No AI clichés. No outcome guarantees.',
          prompt: buildDepthAppendPrompt({
            primaryKeyword,
            region,
            minWords,
            maxWords,
            currentWords,
            existingH2s: extractH2Titles(content),
            draftExcerpt: content,
          }),
          maxTokens: tokensForType(contentType, 'append'),
          temperature: 0.45,
          aiProvider: input.aiProvider,
        })
        const merged = mergeAppendedSections(content, ai.text)
        if (countBodyWords(merged) > currentWords) {
          content = merged
          provider = ai.provider
          model = ai.model
        } else {
          break
        }
      }
    } catch (e) {
      console.warn(
        '[seoFactory/pipeline] depth expand pass failed',
        e instanceof Error ? e.message : e,
      )
      break
    }
    audit = auditContent({
      content,
      contentType,
      primaryKeyword,
      indexable: plan.indexable,
      ownershipBlockers: plan.blockers,
      requiredShortKeywords,
      requiredLongTailKeywords,
    })
    if (meetsDepthFloor(audit) && meetsShipQuality(audit) && audit.score >= minAudit) {
      break
    }
  }

  // ── PASS 3: Quality refine after depth rescue ──────────────────────────
  // Depth rescue can introduce new quality issues (AI slop from appended sections).
  // Continue refining on quality/blocker issues even if word count is now OK.
  if (!meetsShipQuality(audit) && countBodyWords(content) >= minWords) {
    stalledCount = 0
    for (let j = 0; j <= Math.min(1, maxRefine); j++) {
      attempts++
      const prevBlockers = audit.blockers.length
      const prevScore = audit.score

      const q = evaluateContentQuality({
        content,
        contentType,
        primaryKeyword,
        indexable: plan.indexable,
        region,
      })
      refineNotes = [
        auditToRefineNotes({ ...audit, minWords, targetWords }),
        !q.ok || q.humanScore < 75 ? qualityToRefineNotes(q) : '',
      ]
        .filter(Boolean)
        .join('\n\n')

      if (!refineNotes.trim()) break

      try {
        const ai = await generateWithRetry(generateContentText, {
          system,
          prompt: buildFactoryUserPrompt({
            title,
            topic,
            primaryKeyword,
            region,
            contentType,
            tone,
            audience: input.audience,
            gscBlock: canonPortfolio,
            opportunityAction: input.opportunityAction,
            writeHint: input.writeHint,
            masterEngineBlock: input.masterEngineBlock || undefined,
            refineNotes,
          }),
          maxTokens: tokensForType(contentType, 'draft'),
          temperature: 0.35,
          aiProvider: input.aiProvider,
        })
        if (countBodyWords(ai.text) >= minWords) {
          content = ai.text
          provider = ai.provider
          model = ai.model
        }
      } catch (e) {
        console.warn('[seoFactory/pipeline] post-depth quality refine failed', e)
        break
      }

      audit = auditContent({
        content,
        contentType,
        primaryKeyword,
        indexable: plan.indexable,
        ownershipBlockers: plan.blockers,
        requiredShortKeywords,
        requiredLongTailKeywords,
      })

      if (meetsShipQuality(audit) && audit.score >= minAudit) break

      const improved = audit.score > prevScore || audit.blockers.length < prevBlockers
      if (!improved) {
        stalledCount++
        if (stalledCount >= maxStalled) break
      } else {
        stalledCount = Math.max(0, stalledCount - 1)
      }
    }
  }

  // ── CROSS-DOMAIN ENRICHMENT: inject cross-domain links before scaffold ──
  let enrichedSystem = system
  try {
    const enrich = await buildGenerationEnrichment(
      plan.canonicalUrl,
      plan.host,
      primaryKeyword,
      'all',
    )
    if (enrich.crossLinkInstructions) {
      enrichedSystem = `${system}\n\n---\n\n${enrich.crossLinkInstructions}\n\n---`
      if (enrich.recommendedLinks.length > 0) {
        const linkBlock = enrich.recommendedLinks
          .slice(0, 4)
          .map((l) => `- [${l.anchorText}](${l.url})`)
          .join('\n')
        content = `${content}\n\n<!-- CROSS_DOMAIN_ENRICH_START -->\n### Related Resources\n\n${linkBlock}\n<!-- CROSS_DOMAIN_ENRICH_END -->`
      }
    }
  } catch (e) {
    console.warn('[seoFactory/pipeline] cross-domain enrichment skipped', e)
  }

  // ── PASS 4: Scaffold + final quality lock ──────────────────────────────
  content = ensureEditorialScaffold({
    content,
    title: title || primaryKeyword,
    primaryKeyword,
    region,
    conversionCtaBlock: seoCanon.conversionCtaBlock,
  })

  // After scaffold, audit again. If blockers remain, do one final refine pass
  // targeting the specific scaffold-level issues (citations, disclaimer, TL;DR).
  audit = auditContent({
    content,
    contentType,
    primaryKeyword,
    indexable: plan.indexable,
    ownershipBlockers: plan.blockers,
    requiredShortKeywords,
    requiredLongTailKeywords,
  })

  if (!meetsShipQuality(audit) && audit.blockers.length > 0 && attempts < 8) {
    const q = evaluateContentQuality({
      content,
      contentType,
      primaryKeyword,
      indexable: plan.indexable,
      requiredShortKeywords,
      requiredLongTailKeywords,
      region,
      linkAllowlist: (input.interlinks ?? []).map((l) => l.url).filter(Boolean) as string[],
    })
    refineNotes = [
      auditToRefineNotes({ ...audit, minWords, targetWords }),
      !q.ok || q.humanScore < 75 ? qualityToRefineNotes(q) : '',
    ]
      .filter(Boolean)
      .join('\n\n')

    if (refineNotes.trim()) {
      try {
        attempts++
        const ai = await generateWithRetry(generateContentText, {
          system: enrichedSystem,
          prompt: buildFactoryUserPrompt({
            title,
            topic,
            primaryKeyword,
            region,
            contentType,
            tone,
            audience: input.audience,
            gscBlock: canonPortfolio,
            opportunityAction: input.opportunityAction,
            writeHint: input.writeHint,
            masterEngineBlock: input.masterEngineBlock || undefined,
            refineNotes,
          }),
          maxTokens: tokensForType(contentType, 'draft'),
          temperature: 0.3,
          aiProvider: input.aiProvider,
        })
        if (countBodyWords(ai.text) >= minWords) {
          content = ai.text
          provider = ai.provider
          model = ai.model
        }
      } catch (e) {
        console.warn('[seoFactory/pipeline] post-scaffold refine failed', e)
      }
      // Re-scaffold the refined content
      content = ensureEditorialScaffold({
        content,
        title: title || primaryKeyword,
        primaryKeyword,
        region,
      })
      audit = auditContent({
        content,
        contentType,
        primaryKeyword,
        indexable: plan.indexable,
        ownershipBlockers: plan.blockers,
        requiredShortKeywords,
        requiredLongTailKeywords,
      })
    }
  }


  // ── PASS 5: Resolve mechanical blockers before push ────────────────────
  // Deterministic repairs for blockers the model repeatedly misses, so a
  // small em-dash, disclaimer, schema, or over-max-word-count issue never
  // ships (or persists in the studio). The SAME repair stack the ship gate
  // uses is applied here so the stored draft is the content that will ship.
  {
    const repaired = applyDeterministicRepairs({
      content,
      title: title || primaryKeyword,
      primaryKeyword,
      region,
      indexable: plan.indexable,
      contentType,
      requiredShortKeywords,
      requiredLongTailKeywords,
      competingUrls: (input.competingUrls ?? []) as any,
      targetUrl: plan.canonicalUrl || undefined,
      maxWords: maxWordsForType(contentType),
      minWords: minWordsForType(contentType),
    })
    if (repaired.applied.length) {
      console.info(`[seoFactory/pipeline] deterministic repair applied: ${repaired.applied.join(', ')}`)
      content = repaired.content
    }
    const sanitized = await sanitizeDraftLinksLive(content, {
      region,
      topic,
      keywords: mergedKeywords,
      externalAllowlist: verifiedSourceUrls,
    })
    if (sanitized.stripped || sanitized.injected) {
      console.info(`[seoFactory/pipeline] live link sanitize: stripped=${sanitized.stripped} injected=${sanitized.injected}`)
      content = sanitized.content
    }
    if (repaired.applied.length || sanitized.stripped || sanitized.injected) {
      audit = auditContent({
        content,
        contentType,
        primaryKeyword,
        indexable: plan.indexable,
        ownershipBlockers: plan.blockers,
        requiredShortKeywords,
        requiredLongTailKeywords,
      })
    }
  }

  // Dry-run must exercise render + ship gates even if caller sent shipMode=none
  let effectiveRequested: RequestedShipMode = requestedMode
  if (input.dryRun && effectiveRequested === 'none') {
    effectiveRequested = 'merge'
  }

  let shipMode = resolveShipMode(effectiveRequested, audit, plan)
  let gateHoldReason: string | null = null

  // Never ship thin or low-quality voice to main — even if score looks OK
  if (!meetsShipQuality(audit) && shipMode !== 'none' && shipMode !== 'pr') {
    gateHoldReason = formatGateHold(audit, minAudit, 'quality/depth blockers')
    shipMode = 'none'
  }
  if (
    input.skipShipIfBelowScore !== false &&
    shipMode !== 'none' &&
    (audit.score < minAudit || !meetsShipQuality(audit)) &&
    effectiveRequested !== 'pr'
  ) {
    if (!meetsShipQuality(audit)) {
      // Depth OK + no ownership blockers → open PR for review instead of silent hold.
      // Score floor 30: AI-slop residual after sanitize should not kill the daily job.
      if (meetsDepthFloor(audit) && audit.score >= 30 && plan.blockers.length === 0) {
        shipMode = 'pr'
        gateHoldReason = null
      } else {
        gateHoldReason = formatGateHold(audit, minAudit, 'quality/depth blockers')
        shipMode = 'none'
      }
    } else if (
      effectiveRequested === 'auto' ||
      effectiveRequested === 'autodeploy' ||
      effectiveRequested === 'merge'
    ) {
      if (audit.score >= 50) {
        // Below minAudit but shipable → PR (human/CI path) instead of silent hold
        shipMode = 'pr'
      } else {
        gateHoldReason = formatGateHold(audit, minAudit, `audit ${audit.score} < 50`)
        shipMode = 'none'
      }
    }
  }

  // Auto index: once every check has passed, strip any stale noindex so the
  // stored draft and shipped page are indexable by default.
  if (plan.indexable) {
    const stripped = stripNoIndex(content)
    if (stripped !== content) {
      content = stripped
      audit = auditContent({
        content,
        contentType,
        primaryKeyword,
        indexable: plan.indexable,
        ownershipBlockers: plan.blockers,
        requiredShortKeywords,
        requiredLongTailKeywords,
      })
    }
  }

  let shipResult: ShipResult | null = null
  let shipError: string | null = null

  if (shipMode !== 'none') {
    try {
      // shipContent enforces shipGate (host · path · format) before any Git write
    shipResult = await shipContent({
      mode: shipMode,
      plan,
      content,
      title: title || primaryKeyword,
      region,
      contentType,
      primaryKeyword,
      audit,
      dryRun: Boolean(input.dryRun),
      requiredShortKeywords,
      requiredLongTailKeywords,
      maxWords,
    })
    } catch (e) {
      shipError = e instanceof Error ? e.message : 'Ship failed'
    }
  } else {
    // Always surface why unattended ship was withheld (was error:null)
    shipError =
      gateHoldReason ||
      formatGateHold(audit, minAudit, effectiveRequested === 'none' ? 'shipMode=none' : 'held')
  }

  let jobId: string | null = null
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const status =
      shipResult?.status === 'deployed' || shipResult?.status === 'merged'
        ? 'merged'
        : shipResult?.status === 'pr_created'
          ? 'pr_created'
          : shipError && !gateHoldReason
            ? 'failed'
            : gateHoldReason
              ? 'drafting'
              : 'drafting'

    const baseRow: Record<string, unknown> = {
      user_id: input.userId || 'admin',
      source_job_id: input.sourceJobId || null,
      lineage: {
        modelVersion: 'seo-intelligence-v1',
        sourceJobId: input.sourceJobId || null,
        regenerationMode: input.regenerationMode || null,
        evidence: input.intelligenceLineage || null,
      },
      regeneration_reason: input.regenerationReason || null,
      regeneration_mode: input.regenerationMode || null,
      title,
      topic,
      content_type: contentType === 'legal_guide' ? 'article' : contentType,
      tone,
      region,
      target_repo: plan.repo,
      status,
      slug: plan.filePath.split('/').filter(Boolean).slice(-2, -1)[0] || null,
      content,
      branch_name: shipResult?.branch || null,
      content_path: shipResult?.path || plan.filePath,
      pr_url: shipResult?.prUrl || null,
      pr_number: shipResult?.prNumber || null,
      ai_provider: provider,
      word_count: audit.wordCount,
      seo_score: audit.score,
      ship_mode: shipMode === 'none' || shipMode === 'pr' ? 'pr' : 'autodeploy',
      indexable: plan.indexable,
      canonical_url: plan.canonicalUrl,
      owner_host: plan.host,
      primary_keyword: primaryKeyword,
      audit_json: { ...audit, attempts, model, minAudit },
      gsc_json: {
        source: gscBrief.source,
        mode: gscBrief.mode,
        primaryKeywords: gscBrief.primaryKeywords.slice(0, 8),
        opportunityAction: input.opportunityAction,
      },
      required_short_keywords: requiredShortKeywords,
      required_long_tail_keywords: requiredLongTailKeywords,
      keyword_partition_source: 'word_count_v1',
      competing_urls: Array.isArray(input.competingUrls) && input.competingUrls!.length
        ? JSON.stringify(input.competingUrls!.slice(0, 10))
        : null,
      deploy_sha: shipResult?.mergeCommitSha || shipResult?.commitSha || null,
      deployed_at: shipResult?.status === 'deployed' || shipResult?.status === 'merged' ? new Date().toISOString() : null,
      merged_at: shipResult?.status === 'deployed' || shipResult?.status === 'merged' ? new Date().toISOString() : null,
      llms_included: audit.llmsRecommended,
      error_message: shipError,
    }
    const existingId = String(input.existingJobId || '').trim()
    if (existingId) {
      const { error: upErr } = await supabase.from('content_jobs').update(baseRow).eq('id', existingId)
      if (upErr && /lineage|regeneration_reason|regeneration_mode|column/i.test(upErr.message || '')) {
        const { source_job_id: _sourceJobId, lineage: _lineage, regeneration_reason: _reason, regeneration_mode: _mode, ...legacyRow } = baseRow
        await supabase.from('content_jobs').update(legacyRow).eq('id', existingId)
      }
      jobId = existingId
    } else {
      let jobInsert = await supabase.from('content_jobs').insert(baseRow).select('id').single()
      if (jobInsert.error && /lineage|regeneration_reason|regeneration_mode|column/i.test(jobInsert.error.message || '')) {
        const { source_job_id: _sourceJobId, lineage: _lineage, regeneration_reason: _reason, regeneration_mode: _mode, ...legacyRow } = baseRow
        jobInsert = await supabase.from('content_jobs').insert(legacyRow).select('id').single()
      }
      if (jobInsert.error) console.warn('[seoFactory/pipeline] job insert skipped', jobInsert.error.message)
      jobId = jobInsert.data?.id ?? null
    }
    if (jobId && plan.canonicalUrl) {
      await supabase
        .from('content_jobs')
        .update({
          status: 'closed',
          closed_at: new Date().toISOString(),
          error_message: `Superseded by in-place repair of ${jobId}`,
        })
        .eq('canonical_url', plan.canonicalUrl)
        .in('status', ['drafting', 'pending', 'failed'])
        .neq('id', jobId)
    }
  } catch (e) {
    console.warn('[seoFactory/pipeline] job persist skipped', e)
  }

  // ok when we either shipped, opened a PR, or dry-ran — not when gates held ship
  const shippedOk = Boolean(
    shipResult &&
      (shipResult.status === 'deployed' ||
        shipResult.status === 'merged' ||
        shipResult.status === 'pr_created' ||
        shipResult.status === 'dry_run'),
  )
  // Gate-held drafts are not hard pipeline crashes, but they are not successful ships
  const ok = shippedOk || (shipMode === 'none' && !gateHoldReason && !shipError)

  return {
    ok: Boolean(ok && !shipError?.startsWith('Ship refused')),
    content,
    plan,
    audit,
    ship: shipResult,
    shipError,
    shipMode,
    provider,
    model,
    attempts,
    gsc: {
      source: gscBrief.source,
      mode: gscBrief.mode,
      primaryKeywords: gscBrief.primaryKeywords.slice(0, 8),
      opportunityKeywords: gscBrief.opportunityKeywords.slice(0, 6),
      warnings: gscBrief.warnings,
    },
    jobId,
    error: shipError || undefined,
  }
}

/** Human-readable reason for War Room / Auto-Pilot when merge is withheld. */
function formatGateHold(audit: SeoFactoryAudit, minAudit: number, why: string): string {
  const blockers = (audit.blockers || [])
    .slice(0, 4)
    .map((b) => b.message)
    .join('; ')
  const parts = [
    `Ship withheld (${why})`,
    `audit ${audit.score}/100 (min ${minAudit}) grade ${audit.grade}`,
    `words ${audit.wordCount}`,
    audit.humanScore != null ? `human ${audit.humanScore}` : null,
    blockers ? `blockers: ${blockers}` : null,
  ].filter(Boolean)
  return parts.join(' · ')
}

/**
 * Keywords already *productively* covered by Content Studio (dedupe auto-run / War Room).
 *
 * Only jobs that reached Git (PR or merge) count. Held/drafting/pending/failed rows
 * must NOT block the queue — otherwise a quality-hold War Room day empties Auto-Pilot
 * with "No eligible opportunities (all top terms recently covered)".
 */
export async function loadRecentPrimaryKeywords(days = 14): Promise<Set<string>> {
  const out = new Set<string>()
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const since = new Date(Date.now() - days * 864e5).toISOString()
    const { data } = await supabase
      .from('content_jobs')
      .select('primary_keyword, topic, status')
      .gte('created_at', since)
      // Shipped or open for review only — not drafts held at quality gates
      .in('status', ['merged', 'pr_created', 'publishing'])
      .limit(500)
    for (const row of data || []) {
      const k = (row.primary_keyword || row.topic || '').toLowerCase().trim()
      if (k) out.add(k)
    }
  } catch {
    /* empty */
  }
  return out
}
