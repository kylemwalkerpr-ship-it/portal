import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdminUser } from '@/lib/portalAuth'
import { shipContent, mergePullRequest, parseRepoSlug, type ShipMode } from '@/lib/seoFactory/ship'
import {
  resolveOwner,
  type ContentRepo,
  type OwnerHost,
  type OwnerPlan,
} from '@/lib/seoFactory/ownership'
import {
  assertPublicationDestinationAllowed,
  PUBLICATION_OWNERSHIP_PROOF_CONTENT_TYPE,
} from '@/lib/seoFactory/broadCreateFreeze'
import { auditContent } from '@/lib/seoFactory/audit'
import { resolveKeywordContract } from '@/lib/seoFactory/keywordContract'
import { countBodyWords } from '@/lib/seoFactory/contentDepth'
import { monitorContentJob } from '@/lib/seoFactory/deployMonitor'
import { enqueueAuthorityMultiplexerSignal } from '@/lib/seoFactory/specialistFeeds'
import {
  gateVerdictBoundToBody,
  jobPassesShipGate,
  mergeAuditJsonBoundToBody,
  type GateVerdictBodyBinding,
} from '@/lib/seoFactory/jobShipGate'
import { jobCompetingPages } from '@/lib/seoFactory/jobColumns'
import { currentContentStudioExecution } from '@/lib/seoFactory/contentStudioExecutionContext'
import { assertContentStudioExecution } from '@/lib/seoFactory/writingContractStore'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * P8 stale-gate refusal: a stored shipReady/editorialReview verdict only ever
 * describes the exact body it evaluated. When the body that would be stored or
 * shipped is a different body, the carried verdict is invalid — fail closed
 * (the operator must re-audit this body) instead of publishing new bytes under
 * an old verdict.
 */
function staleGateVerdictResponse(binding: GateVerdictBodyBinding): Response {
  return NextResponse.json(
    { ok: false, code: binding.code, error: binding.error },
    { status: 409 },
  )
}

type StrictExecution = {
  executionJobId: string
  contractId: string
  contractHash: string
  opportunityId: string
  executionOwner: string
  executionAttempt: number
  contractOwnership?: {
    host?: string
    repo?: string
    filePath?: string
    canonicalUrl?: string
  } | null
}

function strictExecutionFor(id: string): StrictExecution {
  const state = currentContentStudioExecution()
  if (
    !state?.strict ||
    !state.executionJobId ||
    !state.contractId ||
    !state.contractHash ||
    !state.executionOwner ||
    !Number.isInteger(Number(state.executionAttempt))
  ) {
    throw new Error('Contracted manual publication requires an active execution lease')
  }
  if (String(state.executionJobId) !== id) {
    throw new Error('Contracted manual publication job does not match the active execution lease')
  }
  return {
    executionJobId: String(state.executionJobId),
    contractId: String(state.contractId),
    contractHash: String(state.contractHash),
    opportunityId: String(state.opportunityId || ''),
    executionOwner: String(state.executionOwner),
    executionAttempt: Number(state.executionAttempt),
    contractOwnership: state.contractOwnership || null,
  }
}

function withFence<T>(query: T, execution: StrictExecution): T {
  let next = (query as any)
    .eq('id', execution.executionJobId)
    .eq('contract_id', execution.contractId)
    .eq('contract_hash', execution.contractHash)
    .eq('execution_owner', execution.executionOwner)
    .eq('execution_attempt', execution.executionAttempt)
    .gt('execution_lease_expires_at', new Date().toISOString())
  if (execution.opportunityId) next = next.eq('opportunity_id', execution.opportunityId)
  return next as T
}

async function fencedRead(execution: StrictExecution): Promise<Record<string, any>> {
  const result = await (withFence(
    db().from('content_jobs').select('*'),
    execution,
  ) as any).maybeSingle()
  if (result.error) throw new Error(`Contracted publication read failed: ${result.error.message}`)
  if (!result.data?.id) throw new Error('Contracted publication execution is stale, expired, or no longer owned by this attempt')
  return result.data as Record<string, any>
}

async function fencedUpdate(
  execution: StrictExecution,
  patch: Record<string, unknown>,
): Promise<Record<string, any>> {
  const result = await (withFence(
    db().from('content_jobs').update(patch),
    execution,
  ) as any).select('*').maybeSingle()
  if (result.error) throw new Error(`Contracted publication persistence failed: ${result.error.message}`)
  if (!result.data?.id) throw new Error('Contracted publication persistence lost execution ownership')
  return result.data as Record<string, any>
}

async function assertRemoteExecution(execution: StrictExecution): Promise<void> {
  await assertContentStudioExecution(db(), {
    jobId: execution.executionJobId,
    contractId: execution.contractId,
    contractHash: execution.contractHash,
    owner: execution.executionOwner,
    attempt: execution.executionAttempt,
  })
}

async function recordFailureIfOwned(execution: StrictExecution, message: string, failJob: boolean): Promise<void> {
  try {
    await fencedUpdate(execution, {
      error_message: message.slice(0, 1000),
      ...(failJob ? { status: 'failed' } : {}),
    })
  } catch {
    // A replacement execution owns the row now. Never let the stale attempt
    // mutate the replacement's status/error while reporting its own failure.
  }
}

async function enqueueRepurposeHook(sourceUrl: string, relatedJobId: string) {
  try {
    await enqueueAuthorityMultiplexerSignal({ sourceUrl, relatedJobId })
  } catch (error) {
    console.warn(
      '[content-studio/jobs] authority_multiplexer signal skipped',
      error instanceof Error ? error.message : error,
    )
  }
}

const OWNER_HOSTS = new Set<OwnerHost>(['legal', 'usa', 'ca', 'uk', 'au', 'apex', 'market'])
const CONTENT_REPOS = new Set<ContentRepo>(['caseworks', 'yousafe-consultancy', 'portal'])

function strictOwnerHost(value: unknown, fallback: OwnerHost): OwnerHost {
  const candidate = String(value || '').trim()
  if (!candidate) return fallback
  if (!OWNER_HOSTS.has(candidate as OwnerHost)) {
    throw new Error(`Contracted publication owner host is invalid: ${candidate}`)
  }
  return candidate as OwnerHost
}

function strictContentRepo(value: unknown, fallback: ContentRepo): ContentRepo {
  const candidate = String(value || '').trim()
  if (!candidate) return fallback
  if (!CONTENT_REPOS.has(candidate as ContentRepo)) {
    throw new Error(`Contracted publication repository is invalid: ${candidate}`)
  }
  return candidate as ContentRepo
}

function exactContractPlan(resolved: OwnerPlan, execution: StrictExecution): OwnerPlan {
  const ownership = execution.contractOwnership
  if (!ownership) return resolved
  return {
    ...resolved,
    host: strictOwnerHost(ownership.host, resolved.host),
    repo: strictContentRepo(ownership.repo, resolved.repo),
    filePath: String(ownership.filePath || resolved.filePath),
    canonicalUrl: String(ownership.canonicalUrl || resolved.canonicalUrl),
  }
}

/**
 * P0 global publication freeze for DIRECT existing-PR merges. Merging an open
 * PR bypasses shipContent, so re-resolve CURRENT ownership from the job's
 * mission inputs WITHOUT hints and require the persisted destination
 * (canonical_url) to be that resolved existing owner. A fabricated/fallback
 * destination, a canonical diverging from the matched registry owner, and a
 * blank canonical all fail closed. The explicit P13 unlock is the only bypass.
 * Throws so the caller returns a stable refusal response BEFORE any merge.
 */
async function assertDirectMergeDestinationAllowed(job: Record<string, any>): Promise<void> {
  const primaryKeyword = String(job.primary_keyword || job.topic || '')
  // Content-format agnostic ownership proof: re-resolve with the neutral
  // ownership-proof type, NOT the persisted rendering type. A legal registry
  // owner finalized as `blog_post` (news_summary intent) must not be refused by
  // the explicit-blog standing-rules early return; the persisted canonical
  // still has to equal the fresh owner and pass the exact live proof below.
  const authority = await resolveOwner({
    primaryKeyword,
    contentType: PUBLICATION_OWNERSHIP_PROOF_CONTENT_TYPE,
    region: String(job.region || 'US'),
    indexable: job.indexable !== false,
  })
  await assertPublicationDestinationAllowed(authority, job.canonical_url ?? null, {
    primaryKeyword,
    env: process.env as Record<string, string | undefined>,
  })
}

async function mergeExistingPr(
  execution: StrictExecution,
  job: Record<string, any>,
  action: string,
  dryRun: boolean,
): Promise<Response | null> {
  if (!job.pr_number) {
    if (action === 'merge_pr') return NextResponse.json({ error: 'Job has no PR to merge' }, { status: 400 })
    return null
  }
  if (!jobPassesShipGate(job)) {
    return NextResponse.json({ error: 'Ship gate not cleared' }, { status: 409 })
  }
  // P8: the verdict carried by this row must cover the exact reviewed body the
  // merge publishes. A body change after the verdict makes it stale.
  const mergeBinding = gateVerdictBoundToBody(job, job.content)
  if (!mergeBinding.ok) return staleGateVerdictResponse(mergeBinding)
  // P0 global publication freeze: re-resolve ownership and require the
  // persisted destination to be the current existing owner. Enforced before
  // the dry-run branch too, so a dry run cannot report a mergeable PR while
  // the real merge would be refused.
  try {
    await assertDirectMergeDestinationAllowed(job)
  } catch (freezeError) {
    return NextResponse.json(
      {
        ok: false,
        code: 'broad_create_frozen',
        error: freezeError instanceof Error ? freezeError.message : 'Broad net-new CREATE is frozen',
      },
      { status: 409 },
    )
  }
  if (dryRun) {
    await assertRemoteExecution(execution)
    return NextResponse.json({ ok: true, dryRun: true, action, prNumber: job.pr_number, message: 'PR merge validated; no publication performed' })
  }
  const { owner, repo } = parseRepoSlug(String(job.target_repo || ''))
  try {
    await assertRemoteExecution(execution)
    const merged = await mergePullRequest({
      owner,
      repo,
      prNumber: Number(job.pr_number),
      commitTitle: `seo-factory: approve merge "${job.title || job.topic}"`,
    })
    if (!merged.merged) {
      return NextResponse.json(
        { ok: false, error: merged.message || 'Merge rejected', merge: merged },
        { status: 422 },
      )
    }
    const now = new Date().toISOString()
    const updated = await fencedUpdate(execution, {
      status: 'merged',
      merged_at: now,
      deployed_at: now,
      deploy_sha: merged.sha || job.deploy_sha,
      error_message: null,
      ship_mode: 'autodeploy',
    })
    if (!dryRun) {
      await enqueueRepurposeHook(String(job.canonical_url || ''), execution.executionJobId)
      await monitorContentJob(execution.executionJobId, { openIssueOnFailure: true, waitMs: 2500 })
    }
    return NextResponse.json({
      ok: true,
      approved: action === 'approve',
      merge: merged,
      job: updated,
      message: 'Existing PR merged to main · monitor started',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Merge failed'
    if (action === 'merge_pr') {
      await recordFailureIfOwned(execution, message, false)
      return NextResponse.json({ ok: false, error: message }, { status: 422 })
    }
    console.warn(
      `[content-studio/jobs] approve: PR #${job.pr_number} merge failed after execution fence; force-shipping the approved content: ${message}`,
    )
    return null
  }
}

/**
 * Contracted manual publication path. Every content_jobs read/write is fenced by
 * the exact immutable contract + opportunity + execution owner/attempt + live
 * lease. The byte-preserved legacy handler is intentionally never entered for
 * approve/reship/merge_pr once strict execution has begun.
 */
export async function strictManualPublicationPATCH(request: NextRequest): Promise<Response> {
  const auth = await requireAdminUser()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.clone().json().catch(() => ({})) as Record<string, any>
  const id = String(body.id || '').trim()
  const action = String(body.action || '').trim()
  if (!id || !['approve', 'reship', 'merge_pr'].includes(action)) {
    return NextResponse.json({ error: 'Strict manual publication action required' }, { status: 400 })
  }

  let execution: StrictExecution
  try {
    execution = strictExecutionFor(id)
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Execution lease missing' }, { status: 409 })
  }

  let job: Record<string, any>
  try {
    job = await fencedRead(execution)
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Execution lease stale' }, { status: 409 })
  }

  const mergingExisting = action === 'merge_pr'
    || (action === 'approve' && job.pr_number && job.status === 'pr_created' && body.forceNewShip !== true && body.content == null)
  if (mergingExisting) {
    const merged = await mergeExistingPr(execution, job, action, Boolean(body.dryRun))
    if (merged) return merged
  }

  let content = body.content != null ? String(body.content) : String(job.content || '')
  if (!content.trim()) return NextResponse.json({ error: 'Job has no content to ship' }, { status: 400 })
  if (body.content_type || body.contentType) job.content_type = String(body.content_type || body.contentType)
  if (body.primary_keyword || body.primaryKeyword) job.primary_keyword = String(body.primary_keyword || body.primaryKeyword)
  if (body.region) job.region = String(body.region)

  const contentType = job.content_type === 'article' ? 'legal_guide' : job.content_type || 'legal_guide'
  const primaryKeyword = job.primary_keyword || job.topic
  const keywordContract = resolveKeywordContract({
    primaryKeyword,
    topic: job.topic,
    requiredShortKeywords: job.required_short_keywords,
    requiredLongTailKeywords: job.required_long_tail_keywords,
    shortKeywordTerms: job.short_keyword_terms,
    longTailKeywordTerms: job.long_tail_keyword_terms,
  })
  if (keywordContract.backfilled && !body.dryRun) {
    job = await fencedUpdate(execution, {
      required_short_keywords: keywordContract.requiredShortKeywords,
      required_long_tail_keywords: keywordContract.requiredLongTailKeywords,
      short_keyword_terms: keywordContract.shortKeywordTerms,
      long_tail_keyword_terms: keywordContract.longTailKeywordTerms,
    })
  }
  const competingUrls = jobCompetingPages(job)
  const resolvedPlan = await resolveOwner({
    primaryKeyword,
    contentType,
    region: job.region || 'US',
    indexable: job.indexable !== false,
  })
  const plan = exactContractPlan(resolvedPlan, execution)
  const audit = auditContent({
    content,
    contentType,
    primaryKeyword,
    indexable: plan.indexable,
    ownershipBlockers: plan.blockers,
    requiredShortKeywords: keywordContract.requiredShortKeywords,
    requiredLongTailKeywords: keywordContract.requiredLongTailKeywords,
    shortKeywordTerms: keywordContract.shortKeywordTerms,
    longTailKeywordTerms: keywordContract.longTailKeywordTerms,
  })
  if (!jobPassesShipGate(job)) {
    return NextResponse.json({ error: 'Ship gate not cleared' }, { status: 409 })
  }
  // P8: bind the carried verdict to the FINAL body that would be stored and
  // shipped. `body.content` may replace the persisted draft, so the gate must
  // be re-established for those exact bytes before any write/ship.
  const shipBinding = gateVerdictBoundToBody(job, content)
  if (!shipBinding.ok) return staleGateVerdictResponse(shipBinding)

  let shipMode: ShipMode = 'pr'
  if (action === 'approve') shipMode = 'autodeploy'
  else {
    const requested = String(body.shipMode || job.ship_mode || 'merge').toLowerCase()
    shipMode = requested === 'autodeploy' || requested === 'merge' ? requested as ShipMode : 'pr'
  }

  try {
    if (body.content != null && !body.dryRun) {
      job = await fencedUpdate(execution, {
        content,
        word_count: countBodyWords(content),
        seo_score: audit.score,
        // Never copy a verdict for the previous body onto these bytes.
        audit_json: mergeAuditJsonBoundToBody(job.audit_json, { ...audit }, {
          previousContent: job.content,
          content,
        }),
      })
    }

    await assertRemoteExecution(execution)
    const ship = await shipContent({
      mode: shipMode,
      plan,
      content,
      title: body.title != null ? String(body.title) : job.title || job.topic,
      region: job.region || 'US',
      contentType,
      primaryKeyword,
      audit,
      dryRun: Boolean(body.dryRun),
      jobId: id,
      humanApproved: action === 'approve' || body.humanApproved === true,
      requiredShortKeywords: keywordContract.requiredShortKeywords,
      requiredLongTailKeywords: keywordContract.requiredLongTailKeywords,
      shortKeywordTerms: keywordContract.shortKeywordTerms,
      longTailKeywordTerms: keywordContract.longTailKeywordTerms,
      competingUrls,
    })
    if (body.dryRun) return NextResponse.json({ ok: true, dryRun: true, ship, message: 'Artifact validated; no publication performed' })
    const now = new Date().toISOString()
    const terminal = ship.status === 'deployed' || ship.status === 'merged'
      ? 'merged'
      : ship.status === 'pr_created'
        ? 'pr_created'
        : job.status
    const updated = await fencedUpdate(execution, {
      status: terminal,
      content,
      pr_url: ship.prUrl || job.pr_url,
      pr_number: ship.prNumber || job.pr_number,
      branch_name: ship.branch || job.branch_name,
      content_path: ship.path || job.content_path,
      deploy_sha: ship.mergeCommitSha || ship.commitSha || job.deploy_sha,
      deployed_at: ship.status === 'deployed' || ship.status === 'merged' ? now : job.deployed_at,
      merged_at: ship.status === 'deployed' || ship.status === 'merged' ? now : job.merged_at,
      error_message: null,
      ship_mode: ship.mode === 'pr' ? 'pr' : 'autodeploy',
      seo_score: audit.score,
      word_count: audit.wordCount,
      audit_json: mergeAuditJsonBoundToBody(job.audit_json, { ...audit }, {
        previousContent: job.content,
        content,
      }),
    })

    let monitor = null
    if ((ship.status === 'deployed' || ship.status === 'merged') && !body.dryRun) {
      await enqueueRepurposeHook(String(ship.canonicalUrl || job.canonical_url || plan.canonicalUrl || ''), id)
      monitor = await monitorContentJob(id, { openIssueOnFailure: true, waitMs: 2000 })
    }
    return NextResponse.json({
      ok: true,
      approved: action === 'approve' || body.humanApproved === true,
      ship,
      monitor,
      job: updated,
      message: ship.status === 'deployed' || ship.status === 'merged'
        ? 'Approved → main · Cloudflare deploy · monitor ran'
        : ship.status === 'pr_created'
          ? 'PR opened (merge blocked — use Approve again or fix branch protection)'
          : 'Ship complete',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ship failed'
    if (!body.dryRun) await recordFailureIfOwned(execution, message, true)
    return NextResponse.json({ ok: false, error: message }, { status: 422 })
  }
}
