/**
 * Streaming SEO Factory pipeline — emits progress + content deltas for SSE.
 * Same logic as runSeoFactoryPipeline but progressive.
 */

import { createClient } from '@supabase/supabase-js'
import { resolveOwner, assertPlanRepoConsistency, type OwnerPlan } from './ownership'
import { auditContent, canAutodeploy, type SeoFactoryAudit } from './audit'
import { shipContent, type ShipMode, type ShipResult } from './ship'
import { buildGscContentBrief, formatGscBriefForPrompt } from '@/lib/gscContentBrief'
import { generateContentTextStream } from '@/lib/contentAiProvider'
import { formatStrategyForPrompt } from '@/lib/seoDataLoaders'
import {
  auditToRefineNotes,
  buildFactorySystemPrompt,
  buildFactoryUserPrompt,
  minWordsForType,
} from './prompts'
import type { PipelineInput, PipelineResult, RequestedShipMode } from './pipeline'

export type PipelineStreamEvent =
  | { type: 'progress'; stage: string; message: string }
  | { type: 'provider'; provider: string; model: string }
  | { type: 'delta'; text: string; attempt: number }
  | { type: 'attempt'; attempt: number; score: number; wordCount: number; goodEnough: boolean }
  | { type: 'ship'; ship: ShipResult | null; shipError: string | null; shipMode: string }
  | { type: 'final'; result: PipelineResult }
  | { type: 'error'; error: string }

function resolveShipMode(
  requested: RequestedShipMode,
  audit: SeoFactoryAudit,
  plan: OwnerPlan,
): ShipMode | 'none' {
  if (requested === 'none') return 'none'
  if (requested === 'pr') return 'pr'
  if (requested === 'autodeploy') {
    return canAutodeploy(audit, plan.ymy) && plan.blockers.length === 0 ? 'autodeploy' : 'pr'
  }
  return canAutodeploy(audit, plan.ymy) && plan.blockers.length === 0 ? 'autodeploy' : 'pr'
}

export async function* runSeoFactoryPipelineStream(
  input: PipelineInput,
): AsyncGenerator<PipelineStreamEvent> {
  try {
    const topic = (input.topic || '').trim()
    const primaryKeyword = (input.primaryKeyword || topic).trim()
    const title = (input.title || topic || primaryKeyword).trim()
    const region = (input.region || 'US').toUpperCase()
    let contentType = input.contentType || 'legal_guide'
    const tone = input.tone || 'educational'
    const indexable = input.indexable !== false
    const requestedMode = (input.shipMode || 'pr') as RequestedShipMode
    const minAudit = Math.min(95, Math.max(40, Number(input.minAuditScore) || 55))
    const maxRefine = Math.min(3, Math.max(0, Number(input.maxRefine ?? 2)))

    if (!topic) {
      yield { type: 'error', error: 'topic required' }
      return
    }

    yield { type: 'progress', stage: 'plan', message: 'Resolving ownership & content type…' }
    const plan = await resolveOwner({
      primaryKeyword,
      contentType,
      region,
      indexable,
      slug: input.slug,
    })
    if (plan.intentClass === 'geo_modifier') contentType = 'regional_from'
    else if (plan.intentClass === 'university_modifier') contentType = 'regional_university'
    else if (plan.intentClass === 'transactional') contentType = 'marketplace_gig'
    else if (plan.intentClass === 'news_summary') contentType = 'blog_summary'
    else if (plan.host === 'legal' && (contentType === 'regional_page' || !input.contentType)) {
      contentType = 'legal_guide'
    }
    assertPlanRepoConsistency(plan)
    const minWords = minWordsForType(contentType)

    yield {
      type: 'progress',
      stage: 'plan',
      message: `Owner ${plan.host} · ${plan.repo} · ${plan.filePath}`,
    }

    yield { type: 'progress', stage: 'gsc', message: 'Building GSC content brief…' }
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

    for (let i = 0; i <= maxRefine; i++) {
      attempts = i + 1
      yield {
        type: 'progress',
        stage: 'generate',
        message:
          i === 0
            ? `Generating draft (attempt ${attempts})…`
            : `Refining draft (attempt ${attempts})…`,
      }

      const prompt = buildFactoryUserPrompt({
        title,
        topic,
        primaryKeyword,
        region,
        contentType,
        tone,
        audience: input.audience,
        gscBlock,
        opportunityAction: input.opportunityAction,
        refineNotes,
      })

      let attemptText = ''
      for await (const ev of generateContentTextStream({
        system,
        prompt,
        maxTokens: 5500,
        temperature: i === 0 ? 0.55 : 0.4,
      })) {
        if (ev.type === 'provider') {
          provider = ev.provider
          model = ev.model
          yield { type: 'provider', provider, model }
        } else if (ev.type === 'delta') {
          attemptText += ev.text
          yield { type: 'delta', text: ev.text, attempt: attempts }
        } else if (ev.type === 'done') {
          attemptText = ev.text
          provider = ev.provider
          model = ev.model
        }
      }

      content = attemptText
      audit = auditContent({
        content,
        contentType,
        primaryKeyword,
        indexable: plan.indexable,
        ownershipBlockers: plan.blockers,
      })

      const goodEnough =
        audit.score >= minAudit &&
        audit.blockers.filter((b) => b.code !== 'ownership').length === 0

      yield {
        type: 'attempt',
        attempt: attempts,
        score: audit.score,
        wordCount: audit.wordCount,
        goodEnough,
      }

      if (goodEnough || i === maxRefine) break
      refineNotes = auditToRefineNotes(audit)
      yield {
        type: 'progress',
        stage: 'refine',
        message: `Audit ${audit.score} < ${minAudit} — refining…`,
      }
    }

    let shipMode = resolveShipMode(requestedMode, audit, plan)
    if (
      input.skipShipIfBelowScore !== false &&
      shipMode !== 'none' &&
      audit.score < minAudit &&
      requestedMode !== 'pr'
    ) {
      if (requestedMode === 'auto' || requestedMode === 'autodeploy') {
        shipMode = audit.score >= 40 ? 'pr' : 'none'
      }
    }

    let shipResult: ShipResult | null = null
    let shipError: string | null = null

    if (shipMode !== 'none') {
      yield {
        type: 'progress',
        stage: 'ship',
        message: `Shipping via ${shipMode}${input.dryRun ? ' (dry run)' : ''}…`,
      }
      try {
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
      yield { type: 'progress', stage: 'ship', message: 'Ship skipped (mode none)' }
    }

    yield { type: 'ship', ship: shipResult, shipError, shipMode }

    let jobId: string | null = null
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      )
      const status =
        shipResult?.status === 'deployed'
          ? 'merged'
          : shipResult?.status === 'pr_created'
            ? 'pr_created'
            : shipError
              ? 'failed'
              : 'drafting'

      const seedLog = [
        {
          id: `pipe-${Date.now()}`,
          ts: Date.now(),
          level: shipError ? 'warn' : 'success',
          source: 'pipeline',
          message: shipResult
            ? `Shipped ${shipResult.status} · audit ${audit.score}`
            : `Generated · audit ${audit.score} · ${provider}`,
          detail: shipError || shipResult?.prUrl || undefined,
        },
      ]

      const baseRow: Record<string, unknown> = {
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
        ship_mode: shipMode === 'none' ? 'pr' : shipMode,
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
        deploy_sha: shipResult?.commitSha || null,
        deployed_at: shipResult?.status === 'deployed' ? new Date().toISOString() : null,
        llms_included: audit.llmsRecommended,
        error_message: shipError,
      }

      // Prefer with event_log; fall back if migration not applied yet
      let job: { id: string } | null = null
      const withLog = await supabase
        .from('content_jobs')
        .insert({ ...baseRow, event_log: seedLog })
        .select('id')
        .single()
      if (withLog.data?.id) {
        job = withLog.data
      } else if (withLog.error && /event_log|column/i.test(withLog.error.message || '')) {
        const without = await supabase.from('content_jobs').insert(baseRow).select('id').single()
        job = without.data
      } else if (withLog.error) {
        console.warn('[seoFactory/pipelineStream] job insert', withLog.error.message)
      }
      jobId = job?.id ?? null
    } catch (e) {
      console.warn('[seoFactory/pipelineStream] job persist skipped', e)
    }

    const result: PipelineResult = {
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

    yield { type: 'final', result }
  } catch (e) {
    yield { type: 'error', error: e instanceof Error ? e.message : 'Pipeline failed' }
  }
}
