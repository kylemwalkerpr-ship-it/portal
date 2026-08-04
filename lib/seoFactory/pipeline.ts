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
} from './prompts'
import { countBodyWords, targetWordsForType, maxWordsForType } from './contentDepth'
import { meetsDepthFloor, meetsShipQuality } from './audit'
import { evaluateContentQuality, qualityToRefineNotes } from './contentQualityGate'
import { buildSeoCanon, type SeoCanon } from './seoCanon'
import { ensureEditorialScaffold } from './editorialScaffold'

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
  skipShipIfBelowScore?: boolean
  /** Saved partial draft used when continuing an interrupted stream. */
  resumeContent?: string
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

  // Resolve ownership FIRST from SEO strategies registry — content type may be adjusted
  const plan = await resolveOwner({
    primaryKeyword,
    contentType,
    region,
    indexable,
    slug: input.slug,
  })
  // Always trust plan's path/host-reconciled type (never ship legal_guide to usa universities)
  contentType = plan.contentType || contentType
  if (plan.intentClass === 'geo_modifier') contentType = 'regional_from'
  else if (plan.intentClass === 'university_modifier') contentType = 'regional_university'
  else if (plan.intentClass === 'transactional') contentType = 'marketplace_gig'
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
  const minWords = minWordsForType(contentType)
  const targetWords = targetWordsForType(contentType)
  const maxWords = maxWordsForType(contentType)

  const gscBrief = await buildGscContentBrief({
    topic,
    region,
    keywords: Array.isArray(input.keywords) ? input.keywords : [primaryKeyword],
  })
  const gscBlock = formatGscBriefForPrompt(gscBrief)

  // Build canonical SEO portfolio — the single source of truth for all
  // keyword selection, intent classification, and conversion routing.
  const seoCanon: SeoCanon = buildSeoCanon({
    brief: gscBrief,
    plan,
    contentType,
    region,
    title: title || primaryKeyword,
    topic,
  })
  const canonPortfolio = seoCanon.canonicalPromptBlock
  const strategyBlock = await formatStrategyForPrompt({
    topic: `${topic} ${primaryKeyword}`,
    maxChars: 4200,
  })

  const system = buildFactorySystemPrompt({
    plan,
    contentType,
    minWords,
    maxWords,
    strategyBlock,
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
            currentWords,
            existingH2s: extractH2Titles(content),
            draftExcerpt: content,
          }),
          maxTokens: tokensForType(contentType, 'append'),
          temperature: 0.45,
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
            refineNotes,
          }),
          maxTokens: tokensForType(contentType, 'draft'),
          temperature: 0.35,
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
  })

  if (!meetsShipQuality(audit) && audit.blockers.length > 0 && attempts < 8) {
    const q = evaluateContentQuality({
      content,
      contentType,
      primaryKeyword,
      indexable: plan.indexable,
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
            refineNotes,
          }),
          maxTokens: tokensForType(contentType, 'draft'),
          temperature: 0.3,
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
        conversionCtaBlock: seoCanon.conversionCtaBlock,
      })
      audit = auditContent({
        content,
        contentType,
        primaryKeyword,
        indexable: plan.indexable,
        ownershipBlockers: plan.blockers,
      })
    }
  }


  // ── PASS 5: Resolve mechanical blockers before push ────────────────────
  // Deterministic repairs for blockers the model repeatedly misses, so a
  // small em-dash or disclaimer miss never blocks the daily ship.
  {
    let repaired = content
    const dashes = (repaired.match(/[\u2014\u2013]/g) || []).length
    if (dashes > 0) {
      repaired = repaired
        .replace(/(\d)\s*[\u2013\u2014]\s*(\d)/g, '$1-$2')
        .replace(/\s+[\u2014\u2013]\s+/g, ', ')
        .replace(/[\u2014\u2013]/g, ', ')
    }
    if (!/not legal advice|educational only|consult (an? )?(attorney|lawyer|solicitor|regulated)/i.test(repaired)) {
      repaired = `${repaired.trimEnd()}\n\n---\n\n*This guide is for general information and educational purposes only. It is not legal advice. For your specific situation, consult a licensed attorney or immigration professional.*\n`
    }
    if (repaired !== content) {
      content = repaired
      audit = auditContent({
        content,
        contentType,
        primaryKeyword,
        indexable: plan.indexable,
        ownershipBlockers: plan.blockers,
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

    const { data: job } = await supabase
      .from('content_jobs')
      .insert({
        user_id: input.userId || 'admin',
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
        // DB check allows pr|autodeploy only; map merge → autodeploy
        ship_mode:
          shipMode === 'none' || shipMode === 'pr'
            ? 'pr'
            : 'autodeploy',
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
        deploy_sha: shipResult?.mergeCommitSha || shipResult?.commitSha || null,
        deployed_at:
          shipResult?.status === 'deployed' || shipResult?.status === 'merged'
            ? new Date().toISOString()
            : null,
        merged_at:
          shipResult?.status === 'deployed' || shipResult?.status === 'merged'
            ? new Date().toISOString()
            : null,
        llms_included: audit.llmsRecommended,
        error_message: shipError,
      })
      .select('id')
      .single()
    jobId = job?.id ?? null
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
