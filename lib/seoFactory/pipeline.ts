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
import { countBodyWords, targetWordsForType } from './contentDepth'
import { meetsDepthFloor, meetsShipQuality } from './audit'
import { evaluateContentQuality, qualityToRefineNotes } from './contentQualityGate'

/** Token budget: long-form needs room; many models hard-cap ~8k–16k output. */
function tokensForType(contentType: string, phase: 'draft' | 'expand' | 'append'): number {
  if (contentType === 'marketplace_gig') return phase === 'append' ? 2500 : 4000
  if (phase === 'append') return 6000
  if (phase === 'expand') return 12000
  return 10000
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
  const maxRefine = Math.min(4, Math.max(0, Number(input.maxRefine ?? 3)))

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
  // Prefer strategy-driven content type (geo → regional_from, etc.)
  if (plan.intentClass === 'geo_modifier') contentType = 'regional_from'
  else if (plan.intentClass === 'university_modifier') contentType = 'regional_university'
  else if (plan.intentClass === 'transactional') contentType = 'marketplace_gig'
  else if (plan.intentClass === 'news_summary') contentType = 'blog_summary'
  else if (plan.host === 'legal' && (contentType === 'regional_page' || !input.contentType)) {
    contentType = 'legal_guide'
  }
  assertPlanRepoConsistency(plan)
  const minWords = minWordsForType(contentType)
  const targetWords = targetWordsForType(contentType)

  const gscBrief = await buildGscContentBrief({
    topic,
    region,
    keywords: Array.isArray(input.keywords) ? input.keywords : [primaryKeyword],
  })
  const gscBlock = formatGscBriefForPrompt(gscBrief)
  const strategyBlock = await formatStrategyForPrompt({
    topic: `${topic} ${primaryKeyword}`,
    maxChars: 4200,
  })

  const system = buildFactorySystemPrompt({
    plan,
    contentType,
    minWords,
    strategyBlock,
  })

  let content = ''
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
          gscBlock,
          opportunityAction: input.opportunityAction,
          writeHint: input.writeHint,
          refineNotes,
        })

    const prevWords = content ? countBodyWords(content) : 0
    const ai = await generateContentText({
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

  // ── Depth rescue: expand / append until floor met (or budget exhausted) ──
  const maxExpand = contentType === 'marketplace_gig' ? 2 : 4
  while (countBodyWords(content) < minWords && expandPasses < maxExpand) {
    expandPasses++
    attempts++
    const currentWords = countBodyWords(content)
    try {
      // Odd passes: full expand rewrite; even: append new H2s only
      if (expandPasses % 2 === 1) {
        const ai = await generateContentText({
          system,
          prompt: buildDepthExpandPrompt({
            title,
            topic,
            primaryKeyword,
            region,
            contentType,
            minWords,
            targetWords,
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
        const ai = await generateContentText({
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
    if (meetsDepthFloor(audit) && meetsShipQuality(audit) && audit.score >= minAudit) break
  }

  // Final audit after rescue
  audit = auditContent({
    content,
    contentType,
    primaryKeyword,
    indexable: plan.indexable,
    ownershipBlockers: plan.blockers,
  })

  let shipMode = resolveShipMode(requestedMode, audit, plan)
  // Never ship thin or low-quality voice to main — even if score looks OK
  if (!meetsShipQuality(audit) && shipMode !== 'none' && shipMode !== 'pr') {
    shipMode = 'none'
  }
  if (
    input.skipShipIfBelowScore !== false &&
    shipMode !== 'none' &&
    (audit.score < minAudit || !meetsShipQuality(audit)) &&
    requestedMode !== 'pr'
  ) {
    if (!meetsShipQuality(audit)) {
      shipMode = 'none'
    } else if (requestedMode === 'auto' || requestedMode === 'autodeploy' || requestedMode === 'merge') {
      shipMode = audit.score >= 50 ? 'pr' : 'none'
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
          : shipError
            ? 'failed'
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

  return {
    ok: !shipError,
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

/** Keywords already covered by recent non-failed jobs (dedupe auto-run). */
export async function loadRecentPrimaryKeywords(days = 45): Promise<Set<string>> {
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
      .neq('status', 'failed')
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
