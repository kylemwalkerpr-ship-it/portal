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
import { resolveOwnerProviderPin } from '@/lib/contentAiCatalog'
import { canonicalCommissionedPin, commissionedProvider } from '@/lib/contentAiRegistry'
import { currentContentStudioExecution } from './contentStudioExecutionContext'
import { normalizeJobContentType } from './jobContentType'
import type { KeywordTerm } from '@/lib/seoEngine/keywordTerms'
import type { OwnerPlan } from './ownership'
import { meetsShipQuality, type SeoFactoryAudit } from './audit'
import type { ShipResult } from './ship'
import type { RequestedShipMode } from './resolveShipMode'
import type { ContentSpec } from './contentSpec'
import { countBodyWords } from './contentDepth'

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

/**
 * PR #200 absent-column compatibility. Additive migrations may be merged but
 * intentionally unapplied; a write that names a column their migration owns
 * retries once without those columns so the application works identically
 * before and after the migration is applied.
 */
export const UNAPPLIED_COLUMN_ERROR_RE = /event_log|lineage|regeneration_reason|regeneration_mode|column/i

/** Strip every column owned by an additive, not-yet-applied migration. */
export function stripUnappliedColumns(row: Record<string, unknown>): Record<string, unknown> {
  const {
    source_job_id: _sourceJobId,
    lineage: _lineage,
    regeneration_reason: _reason,
    regeneration_mode: _mode,
    event_log: _eventLog,
    actual_provider: _actualProvider,
    provider_error_class: _providerErrorClass,
    ...legacyRow
  } = row
  return legacyRow
}

/** Bounded provider-attempt window persisted in audit_json.provider.attempts. */
export const PROVIDER_ATTEMPT_LIMIT = 20
export const PROVIDER_ATTEMPT_FIELD_MAX = 32
const PROVIDER_ATTEMPT_VALUE_MAX = 80

export interface ProviderAttemptInput {
  stage?: string | null
  attempt?: number | null
  outcome?: string | null
  failureClass?: string | null
  at?: string | null
}

export interface ProviderAttemptRecord {
  stage: string
  attempt: number | null
  outcome: 'ok' | 'error'
  failureClass: string | null
  at: string
}

/** Trim, truncate, and drop empty values — safe metadata only (design §4.3). */
function providerAuditValue(value: unknown, max = PROVIDER_ATTEMPT_VALUE_MAX): string | null {
  const raw = String(value ?? '').trim()
  return raw ? raw.slice(0, max) : null
}

/**
 * Build one allowlisted provider attempt record. Only the five design-§4.3
 * fields survive; prompts, keys, tokens, and request bodies are structurally
 * impossible to persist because no other field is copied.
 */
export function providerAttemptRecord(input: ProviderAttemptInput | null | undefined): ProviderAttemptRecord | null {
  if (!input || typeof input !== 'object') return null
  const stage = providerAuditValue(input.stage, PROVIDER_ATTEMPT_FIELD_MAX)
  if (!stage) return null
  const rawAttempt = Number(input.attempt)
  const attempt = Number.isInteger(rawAttempt) && rawAttempt > 0 && rawAttempt < 1_000_000 ? rawAttempt : null
  const outcome: ProviderAttemptRecord['outcome'] = input.outcome === 'error' ? 'error' : 'ok'
  const failureClass = outcome === 'error' ? providerAuditValue(input.failureClass, PROVIDER_ATTEMPT_FIELD_MAX) : null
  const rawAt = String(input.at ?? '').trim()
  const at = rawAt && !Number.isNaN(Date.parse(rawAt)) ? rawAt.slice(0, PROVIDER_ATTEMPT_FIELD_MAX) : new Date().toISOString()
  return { stage, attempt, outcome, failureClass, at }
}

/** Sanitize a prior attempts list: allowlisted records only, bounded window. */
export function sanitizeProviderAttempts(value: unknown): ProviderAttemptRecord[] {
  if (!Array.isArray(value)) return []
  const out: ProviderAttemptRecord[] = []
  for (const entry of value) {
    const record = providerAttemptRecord(entry as ProviderAttemptInput)
    if (record) out.push(record)
  }
  return out.slice(-PROVIDER_ATTEMPT_LIMIT)
}

/** Append one attempt and keep only the bounded most-recent window. */
export function appendProviderAttempt(prior: unknown, entry: ProviderAttemptInput): ProviderAttemptRecord[] {
  const list = sanitizeProviderAttempts(prior)
  const record = providerAttemptRecord(entry)
  if (!record) return list
  return [...list, record].slice(-PROVIDER_ATTEMPT_LIMIT)
}

export interface ProviderAuditFields {
  requested?: string | null
  actual?: string | null
  requestedModel?: string | null
  actualModel?: string | null
  pinSource?: string | null
  attempts?: unknown
}

/**
 * Bounded, truncated provider lineage block for audit_json.provider (design
 * §4.3). `actual`/`actualModel`/`pinSource` are omitted — never written as
 * null — when this invocation has no new provider completion, so a resumed
 * artifact cannot erase its previously known producer.
 */
export function providerAuditBlock(fields: ProviderAuditFields): Record<string, unknown> {
  const block: Record<string, unknown> = {
    requested: providerAuditValue(fields.requested),
    requestedModel: providerAuditValue(fields.requestedModel),
    attempts: sanitizeProviderAttempts(fields.attempts),
  }
  const actual = providerAuditValue(fields.actual)
  if (actual) block.actual = actual
  const actualModel = providerAuditValue(fields.actualModel)
  if (actualModel) block.actualModel = actualModel
  const pinSource = providerAuditValue(fields.pinSource, PROVIDER_ATTEMPT_FIELD_MAX)
  if (pinSource) block.pinSource = pinSource
  return block
}

/** Merge (never wipe) the provider block onto an existing audit_json blob. */
export function mergeProviderAudit(auditJson: unknown, fields: ProviderAuditFields): Record<string, unknown> {
  const base = auditJson && typeof auditJson === 'object' && !Array.isArray(auditJson)
    ? { ...(auditJson as Record<string, unknown>) }
    : {}
  const prior = base.provider && typeof base.provider === 'object' && !Array.isArray(base.provider)
    ? base.provider as Record<string, unknown>
    : {}
  return {
    ...base,
    provider: providerAuditBlock({
      requested: fields.requested ?? (prior.requested as string | null | undefined),
      actual: fields.actual ?? (prior.actual as string | null | undefined),
      requestedModel: fields.requestedModel ?? (prior.requestedModel as string | null | undefined),
      actualModel: fields.actualModel ?? (prior.actualModel as string | null | undefined),
      pinSource: fields.pinSource ?? (prior.pinSource as string | null | undefined),
      attempts: fields.attempts ?? prior.attempts,
    }),
  }
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
  /** Explicit actual provider override; omitted derives it from `provider`. */
  actualProvider?: string | null
  /** Granular provider failure class when this write persists a provider failure. */
  providerErrorClass?: string | null
  /**
   * Prior audit_json read under the same fence. Provider lineage
   * (`provider.actual` / `actualModel` / `attempts`) is preserved from it so a
   * resume that produced no new provider completion never erases the known
   * producer or the bounded attempt window.
   */
  priorAuditJson?: unknown
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
 * - review PR open (status pr_created OR a real pr/html_url) → 'pr_created'
 * - shipReady && requested pr && no PR URL → drafting WITH ship_ready_but_no_pr
 *   (never a silent GATE PASS)
 * - withheld / failed ship with a real draft (>100 chars) → 'drafting' so the
 *   editor can fix it; no content at all → 'failed'
 * - everything else → 'drafting'
 */
export const SHIP_READY_BUT_NO_PR = 'ship_ready_but_no_pr'

/**
 * A failed/stub pass must not wipe a substantial in-flight draft.
 * Live PhD job 8cc5d523: a 1248-word body was overwritten by a 102-word
 * generic kit after the provider failed.
 */
export function shouldRefuseThinOverwrite(opts: {
  previousContent?: string | null
  previousWordCount?: number | null
  nextContent?: string | null
  nextWordCount?: number | null
}): boolean {
  const prevWords = Number(opts.previousWordCount) > 0
    ? Number(opts.previousWordCount)
    : countBodyWords(String(opts.previousContent || ''))
  const nextWords = Number(opts.nextWordCount) > 0
    ? Number(opts.nextWordCount)
    : countBodyWords(String(opts.nextContent || ''))
  if (prevWords < 800) return false
  if (nextWords >= 800) return false
  return nextWords < 400 || nextWords < prevWords * 0.4
}

function shipResultPrUrl(shipResult: ShipResult | null | undefined): string | null {
  if (!shipResult) return null
  const rec = shipResult as ShipResult & { html_url?: string | null }
  const raw = rec.prUrl || rec.html_url
  const url = String(raw || '').trim()
  return /^https?:\/\//i.test(url) ? url : null
}

export function mapPipelineJobStatus(input: {
  shipResult: ShipResult | null
  shipError: string | null
  gateHoldReason?: string | null
  content: string
}): 'merged' | 'pr_created' | 'drafting' | 'failed' {
  const { shipResult, shipError, gateHoldReason, content } = input
  if (shipResult?.status === 'deployed' || shipResult?.status === 'merged') return 'merged'
  const prUrl = shipResultPrUrl(shipResult)
  if (prUrl) return 'pr_created'
  if (shipResult?.status === 'pr_created' && !prUrl) {
    return content && content.length > 100 ? 'drafting' : 'failed'
  }
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
  // Canonical ship gate (jobShipGate.jobPassesShipGate demands this boolean):
  // true only when the pipeline's own ship-quality definition passes AND
  // ownership is not blocked — never implied by score alone.
  const shipReady = input.plan.blockers.length === 0 && meetsShipQuality(input.audit)
  const prUrl = shipResultPrUrl(input.shipResult)
  const shippedMain =
    input.shipResult?.status === 'deployed' || input.shipResult?.status === 'merged'
  const dryRun = input.shipResult?.status === 'dry_run'

  let shipError = input.shipError
  let gateHoldReason = input.gateHoldReason ?? null

  // Requested PR + GATE PASS without a PR URL is a hold, never silent success.
  // Do not auto-merge.
  if (
    input.shipMode === 'pr' &&
    shipReady &&
    !prUrl &&
    !shippedMain &&
    !dryRun
  ) {
    if (!shipError) shipError = SHIP_READY_BUT_NO_PR
    if (!gateHoldReason) gateHoldReason = SHIP_READY_BUT_NO_PR
  }

  const status = mapPipelineJobStatus({
    shipResult: input.shipResult,
    shipError,
    gateHoldReason,
    content: input.content,
  })
  const shipped = shippedMain
  const ownerPin = resolveOwnerProviderPin(input.ownerProvider, input.provider)
  // Requested pin vs actual commissioned pin are deliberately distinct: the
  // owner pin stays the requested/commissioned identity, and only a
  // commissioned runtime pin may be recorded as the provider that produced
  // the artifact. A retired runtime value is never promoted to `actual`.
  const requestedPin = canonicalCommissionedPin(ownerPin)
  const requestedModel = requestedPin ? commissionedProvider(requestedPin).apiModel : null
  const explicitActual = input.actualProvider !== undefined ? input.actualProvider : input.provider
  const actualPin = explicitActual != null ? canonicalCommissionedPin(explicitActual) : null
  const actualModel = actualPin ? String(input.model || '').trim() || null : null
  const execution = currentContentStudioExecution()
  // The strict fenced claim attempt is the only real execution attempt. The
  // pipeline refinement count (`input.attempts`) is never one: a non-strict
  // legacy persist records `null` instead of inventing a strict number.
  const executionAttempt = execution?.strict && Number.isInteger(execution.executionAttempt)
    ? Number(execution.executionAttempt)
    : null
  const pinSource = execution?.providerPinSource ?? null
  const priorProvider = input.priorAuditJson && typeof input.priorAuditJson === 'object' && !Array.isArray(input.priorAuditJson)
    ? (input.priorAuditJson as { provider?: unknown }).provider
    : null
  const priorAttempts = priorProvider && typeof priorProvider === 'object' && !Array.isArray(priorProvider)
    ? (priorProvider as { attempts?: unknown }).attempts
    : undefined
  // A commissioned completion appends exactly one bounded `draft` ok record.
  // With no new completion the prior bounded window is preserved untouched.
  const providerAttempts = actualPin
    ? appendProviderAttempt(priorAttempts, {
        stage: 'draft',
        attempt: executionAttempt,
        outcome: 'ok',
        at: new Date().toISOString(),
      })
    : sanitizeProviderAttempts(priorAttempts)
  const baseRow: Record<string, unknown> = {
    user_id: input.userId || 'admin',
    source_job_id: input.sourceJobId || null,
    lineage: {
      modelVersion: 'seo-intelligence-v1',
      sourceJobId: input.sourceJobId || null,
      regenerationMode: input.regenerationMode || null,
      ownerProvider: ownerPin,
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
    pr_url: prUrl || input.shipResult?.prUrl || null,
    pr_number: input.shipResult?.prNumber || null,
    ai_provider: ownerPin,
    // `actual_provider` is omitted — never null — until a commissioned runtime
    // provider completion is known, so a resume cannot erase the prior producer.
    ...(actualPin ? { actual_provider: actualPin } : {}),
    // Column semantics (design §4.2): `requested_model` is the upstream API
    // model, never the stable pin. Omitted for non-commissioned history so a
    // legacy value is preserved rather than overwritten.
    ...(requestedModel ? { requested_model: requestedModel } : {}),
    provider_error_class: input.providerErrorClass ?? null,
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
      ownerProvider: ownerPin,
      runtimeProvider: input.provider || null,
      // Durable requested/actual provider+model lineage (design §4.3): bounded
      // attempt records only — never prompts, keys, tokens, or bodies. Merged
      // over the prior audited block so an invocation with no new completion
      // preserves the known actual provider/model and bounded attempts.
      provider: mergeProviderAudit(input.priorAuditJson, {
        requested: ownerPin,
        actual: actualPin,
        requestedModel,
        actualModel,
        pinSource,
        attempts: providerAttempts,
      }).provider,
      ...(gateHoldReason ? { gateHoldReason } : {}),
      ...(shipError ? { shipError } : {}),
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
    error_message: shipError,
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
    const existingId = String(input.existingJobId || '').trim()

    let jobId: string | null = null
    if (existingId) {
      let baseRow: Record<string, unknown>
      try {
        const prior = await supabase
          .from('content_jobs')
          .select('content,word_count,audit_json')
          .eq('id', existingId)
          .maybeSingle()
        const prev = (prior as {
          data?: { content?: string | null; word_count?: number | null; audit_json?: unknown } | null
        })?.data
        // Provider lineage is merged over the prior audited block so a resume
        // that produced no new provider completion preserves its producer.
        baseRow = mapPipelineJobRow({ ...input, priorAuditJson: prev?.audit_json })
        if (
          prev
          && shouldRefuseThinOverwrite({
            previousContent: prev.content,
            previousWordCount: prev.word_count,
            nextContent: input.content,
            nextWordCount: input.audit.wordCount,
          })
        ) {
          baseRow.content = prev.content
          baseRow.word_count = prev.word_count
          const prevWc = Number(prev.word_count) || 0
          baseRow.error_message = `Refused thin overwrite (${input.audit.wordCount} words) of a ${prevWc}-word draft`
        }
      } catch {
        /* fail open — never block persist on the guard read */
        baseRow = mapPipelineJobRow(input)
      }
      const { error: upErr } = await supabase
        .from('content_jobs')
        .update(baseRow)
        .eq('id', existingId)
      if (upErr && UNAPPLIED_COLUMN_ERROR_RE.test(upErr.message || '')) {
        await supabase.from('content_jobs').update(stripUnappliedColumns(baseRow)).eq('id', existingId)
      }
      jobId = existingId
    } else {
      let insertRow = mapPipelineJobRow(input)
      let jobInsert = await supabase.from('content_jobs').insert(insertRow).select('id').single()
      if (jobInsert.error && UNAPPLIED_COLUMN_ERROR_RE.test(jobInsert.error.message || '')) {
        insertRow = stripUnappliedColumns(insertRow)
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

    if (jobId && /^https?:\/\//i.test(String(input.plan.canonicalUrl || ''))) {
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
    const pk = String(input.primaryKeyword || '').trim()
    const region = String(input.region || '').trim()
    const substantial = Number(input.audit?.wordCount || 0) >= 400
      || String(input.content || '').length > 2000
    if (jobId && pk && substantial) {
      await supabase
        .from('content_jobs')
        .update({
          status: 'closed',
          closed_at: new Date().toISOString(),
          error_message: `Superseded by in-flight sibling ${jobId}`,
        })
        .eq('primary_keyword', pk)
        .eq('region', region)
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
