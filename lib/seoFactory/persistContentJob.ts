/**
 * Single persist door for the SEO Factory pipelines (JSON + stream).
 *
 * Both pipeline entry points previously carried private, slightly-drifting
 * copies of the final content_jobs write. This module is the one home for
 * the status / ship_mode / competing_urls mapping so the two pipelines
 * cannot diverge again. `mapPipelineJobRow` is pure (unit-testable without a
 * Supabase client); `persistPipelineJob` is the never-throwing DB write.
 */

import { createClient } from '@supabase/supabase-js'
import { normalizeJobContentType } from './jobContentType'
import type { KeywordTerm } from '@/lib/seoEngine/keywordTerms'
import type { OwnerPlan } from './ownership'
import { meetsShipQuality, type SeoFactoryAudit } from './audit'
import type { ShipResult } from './ship'
import type { RequestedShipMode } from './resolveShipMode'
import type { ContentSpec } from './contentSpec'

export interface CompetingUrlInput {
  url?: string
  title?: string
  primaryKeyword?: string | null
}

export interface RescueStats {
  expandPasses: number
  stallCount: number
  timeMs: number
  budgetMs: number
}

export interface PipelineJobPersistInput {
  /** Preferred existing row (JSON: input.existingJobId; stream: earlyJobId). */
  existingJobId?: string | null
  userId?: string
  sourceJobId?: string | null
  regenerationReason?: string | null
  regenerationMode?: string | null
  intelligenceLineage?: Record<string, unknown> | null
  /** The brief-stage contract owner pin — persisted in lineage.ownerProvider. */
  ownerProvider?: string | null
  title: string
  topic: string
  primaryKeyword: string
  region: string
  contentType: string
  tone: string
  plan: OwnerPlan
  content: string
  shipResult: ShipResult | null
  shipError: string | null
  gateHoldReason?: string | null
  shipMode: RequestedShipMode
  provider: string
  model: string
  attempts: number
  minAudit: number
  audit: SeoFactoryAudit
  contentSpec?: ContentSpec | null
  gscBrief: {
    source: string
    mode: string
    primaryKeywords: unknown[]
  }
  opportunityAction?: string | null
  requiredShortKeywords: string[]
  requiredLongTailKeywords: string[]
  shortKeywordTerms: KeywordTerm[]
  longTailKeywordTerms: KeywordTerm[]
  /** Stream currently omits these on persist — always store them here. */
  competingUrls?: CompetingUrlInput[] | null
  /** Stream-only seed log (realtime row); JSON path passes null. */
  eventLog?: Array<Record<string, unknown>> | null
  /** Stream-only PASS 2 rescue telemetry embedded in audit_json.rescue. */
  rescueStats?: RescueStats | null
  /** Stream-only cluster snapshot embedded in gsc_json.cluster. */
  cluster?: {
    clusterId?: string | null
    canonicalTerm?: string | null
    keywords?: string[]
    mode?: string | null
    targetUrl?: string | null
    existingJobId?: string | null
  } | null
}

/**
 * Status mapping — single rule for both pipelines.
 * - shipped to main (deployed/merged) → 'merged'
 * - review PR open → 'pr_created'
 * - withheld / failed ship with a real draft (>100 chars) → 'drafting' so the
 *   editor can fix it; no content at all → 'failed'
 * - everything else → 'drafting'
 */
export function mapPipelineJobStatus(input: {
  shipResult: ShipResult | null
  shipError: string | null
  gateHoldReason?: string | null
  content: string
}): 'merged' | 'pr_created' | 'drafting' | 'failed' {
  const { shipResult, shipError, gateHoldReason, content } = input
  if (shipResult?.status === 'deployed' || shipResult?.status === 'merged') return 'merged'
  if (shipResult?.status === 'pr_created') return 'pr_created'
  if (shipError || gateHoldReason) {
    return content && content.length > 100 ? 'drafting' : 'failed'
  }
  return 'drafting'
}

/** Ship mode storage — same rule for both pipelines. */
export function mapPipelineShipMode(shipMode: RequestedShipMode): 'pr' | 'autodeploy' {
  return shipMode === 'none' || shipMode === 'pr' ? 'pr' : 'autodeploy'
}

/** Competing estate URLs — always persisted when present (stream used to omit). */
export function mapCompetingUrls(competingUrls?: CompetingUrlInput[] | null): string | null {
  return Array.isArray(competingUrls) && competingUrls.length
    ? JSON.stringify(competingUrls.slice(0, 10))
    : null
}

/** Pure row builder — all status / ship_mode / competing_urls decisions live here. */
export function mapPipelineJobRow(input: PipelineJobPersistInput): Record<string, unknown> {
  const status = mapPipelineJobStatus(input)
  const shipped =
    input.shipResult?.status === 'deployed' || input.shipResult?.status === 'merged'
  // Canonical ship gate (jobShipGate.jobPassesShipGate demands this boolean):
  // true only when the pipeline's own ship-quality definition passes AND
  // ownership is not blocked — never implied by score alone.
  const shipReady = input.plan.blockers.length === 0 && meetsShipQuality(input.audit)
  const baseRow: Record<string, unknown> = {
    user_id: input.userId || 'admin',
    source_job_id: input.sourceJobId || null,
    lineage: {
      modelVersion: 'seo-intelligence-v1',
      sourceJobId: input.sourceJobId || null,
      regenerationMode: input.regenerationMode || null,
      ownerProvider: input.ownerProvider || null,
      evidence: input.intelligenceLineage || null,
    },
    regeneration_reason: input.regenerationReason || null,
    regeneration_mode: input.regenerationMode || null,
    title: input.title,
    topic: input.topic,
    content_type: normalizeJobContentType(input.contentType),
    tone: input.tone,
    region: input.region,
    target_repo: input.plan.repo,
    status,
    slug: input.plan.filePath.split('/').filter(Boolean).slice(-2, -1)[0] || null,
    content: input.content,
    branch_name: input.shipResult?.branch || null,
    content_path: input.shipResult?.path || input.plan.filePath,
    pr_url: input.shipResult?.prUrl || null,
    pr_number: input.shipResult?.prNumber || null,
    ai_provider: input.provider,
    word_count: input.audit.wordCount,
    seo_score: input.audit.score,
    ship_mode: mapPipelineShipMode(input.shipMode),
    indexable: input.plan.indexable,
    canonical_url: input.plan.canonicalUrl,
    owner_host: input.plan.host,
    primary_keyword: input.primaryKeyword,
    audit_json: {
      ...input.audit,
      shipReady,
      blockers: input.audit.blockers,
      blockersCount: input.audit.blockers.length,
      attempts: input.attempts,
      model: input.model,
      minAudit: input.minAudit,
      ownerProvider: input.ownerProvider || null,
      // Immutable ContentSpec snapshot (brief §3.2) — briefing, writer,
      // reviewer, re-audit, and ship all read this same JSON snapshot.
      ...(input.contentSpec ? { contentSpec: input.contentSpec } : {}),
      ...(input.rescueStats
        ? {
            rescue: {
              expandPasses: input.rescueStats.expandPasses,
              stallCount: input.rescueStats.stallCount,
              timeMs: input.rescueStats.timeMs,
              budgetMs: input.rescueStats.budgetMs,
            },
          }
        : {}),
    },
    gsc_json: {
      source: input.gscBrief.source,
      mode: input.gscBrief.mode,
      primaryKeywords: (input.gscBrief.primaryKeywords || []).slice(0, 8),
      opportunityAction: input.opportunityAction ?? null,
      ...(input.cluster
        ? {
            cluster: {
              clusterId: input.cluster.clusterId || null,
              canonicalTerm: input.cluster.canonicalTerm || null,
              keywords: (input.cluster.keywords || []).slice(0, 24),
              mode: input.cluster.mode || 'new',
              targetUrl: input.cluster.targetUrl || null,
              existingJobId: input.cluster.existingJobId || null,
            },
          }
        : {}),
    },
    required_short_keywords: input.requiredShortKeywords,
    required_long_tail_keywords: input.requiredLongTailKeywords,
    // Persist provenance so a later re-audit / approve does not downgrade
    // synthesized backfill into enforceable demand blockers.
    short_keyword_terms: input.shortKeywordTerms,
    long_tail_keyword_terms: input.longTailKeywordTerms,
    keyword_partition_source: 'word_count_v1',
    competing_urls: mapCompetingUrls(input.competingUrls),
    deploy_sha: input.shipResult?.mergeCommitSha || input.shipResult?.commitSha || null,
    deployed_at: shipped ? new Date().toISOString() : null,
    merged_at: shipped ? new Date().toISOString() : null,
    llms_included: input.audit.llmsRecommended,
    error_message: input.shipError,
  }
  if (input.eventLog && input.eventLog.length) baseRow.event_log = input.eventLog
  return baseRow
}

/**
 * Persist the finished pipeline job — prefer updating the early-created
 * (or caller-supplied) row, else insert. Legacy-column retry, canonical-url
 * supersede close, and net: returns the jobId or null — never throws.
 */
export async function persistPipelineJob(
  input: PipelineJobPersistInput,
): Promise<string | null> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const baseRow = mapPipelineJobRow(input)
    const existingId = String(input.existingJobId || '').trim()

    let jobId: string | null = null
    if (existingId) {
      const { error: upErr } = await supabase
        .from('content_jobs')
        .update(baseRow)
        .eq('id', existingId)
      if (upErr && /event_log|lineage|regeneration_reason|regeneration_mode|column/i.test(upErr.message || '')) {
        const {
          source_job_id: _sourceJobId,
          lineage: _lineage,
          regeneration_reason: _reason,
          regeneration_mode: _mode,
          event_log: _event_log,
          ...legacyRow
        } = baseRow
        await supabase.from('content_jobs').update(legacyRow).eq('id', existingId)
      }
      jobId = existingId
    } else {
      let insertRow = baseRow
      let jobInsert = await supabase.from('content_jobs').insert(insertRow).select('id').single()
      if (jobInsert.error && /event_log|lineage|regeneration_reason|regeneration_mode|column/i.test(jobInsert.error.message || '')) {
        const {
          source_job_id: _sourceJobId,
          lineage: _lineage,
          regeneration_reason: _reason,
          regeneration_mode: _mode,
          event_log: _event_log,
          ...legacyRow
        } = baseRow
        insertRow = legacyRow
        jobInsert = await supabase.from('content_jobs').insert(insertRow).select('id').single()
      }
      if (jobInsert.error || !jobInsert.data?.id) {
        jobInsert = await supabase.from('content_jobs').insert(insertRow).select('id').single()
      }
      if (jobInsert.error || !jobInsert.data?.id) {
        console.error('[persistPipelineJob] job insert failed after retry', jobInsert.error?.message || 'no id returned by insert')
      }
      jobId = jobInsert.data?.id ?? null
    }

    if (jobId && input.plan.canonicalUrl) {
      await supabase
        .from('content_jobs')
        .update({
          status: 'closed',
          closed_at: new Date().toISOString(),
          error_message: `Superseded by in-place repair of ${jobId}`,
        })
        .eq('canonical_url', input.plan.canonicalUrl)
        .in('status', ['drafting', 'pending', 'failed'])
        .neq('id', jobId)
    }
    if (jobId) {
      try {
        const { recordJobQualityGate } = await import('@/lib/seoEngine/gate')
        await recordJobQualityGate({
          jobId,
          score: input.audit.score,
          passed: input.plan.blockers.length === 0 && meetsShipQuality(input.audit),
          blockers: (input.audit.blockers || []).map((b) => String(b.code || b.message || '')).filter(Boolean),
          country: input.region || null,
          stage: 'studio_audit',
        })
      } catch { /* desk telemetry must never fail persist */ }
    }
    return jobId
  } catch (e) {
    console.warn('[persistPipelineJob] job persist skipped', e)
    return null
  }
}