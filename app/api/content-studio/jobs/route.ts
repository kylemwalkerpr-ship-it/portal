import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdminUser } from '@/lib/portalAuth'
import { getRepoFileContent, githubFetch } from '@/lib/githubContents'
import { runStoredContentJob, type StoredContentJob } from '@/lib/seoFactory/storedJobExecution'
import {
  assertContentStudioExecution,
  claimContentStudioExecution,
  loadWritingContract,
  releaseContentStudioExecution,
  type ContentStudioExecutionClaim,
} from '@/lib/seoFactory/writingContractStore'
import type { WritingContractV2 } from '@/lib/seoFactory/writingContract'
import {
  contentHash,
  createContentStudioExecutionState,
  runInContentStudioExecution,
} from '@/lib/seoFactory/contentStudioExecutionContext'
import {
  artifactContentHash,
  buildPublicationApprovalManifest,
  publicationManifestFromAudit,
  runWithPublicationIdentity,
  withPublicationManifest,
} from '@/lib/seoFactory/publicationProof'
import { GET as legacyGET, POST as legacyPOST, PATCH as legacyPATCH } from './legacy'

function db() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!) }
function repoParts(value: unknown): { owner: string; repo: string } {
  const raw = String(value || '').replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '')
  if (raw.includes('/')) { const [owner, repo] = raw.split('/'); return { owner, repo } }
  return { owner: process.env.GITHUB_CONTENT_OWNER || 'kylemwalkerpr-ship-it', repo: raw }
}

export async function GET(request: NextRequest) { return legacyGET(request) }
async function loadJob(id: string) { return db().from('content_jobs').select('*').eq('id', id).single() }

async function validateMarkedPr(job: Record<string, any>): Promise<string | null> {
  const manifest = publicationManifestFromAudit(job.audit_json)
  if (
    !manifest || !manifest.expectedMarker || !manifest.approvedContentHash
    || !manifest.approvedArtifactHash || !manifest.approvedBodyHash
    || !manifest.approvedHeadSha || !manifest.prNumber
  ) return 'Contracted PR cannot be merged: persisted approval manifest is incomplete'
  if (Number(job.pr_number || 0) !== Number(manifest.prNumber)) return 'Contracted PR number changed after approval'
  const { owner, repo } = repoParts(job.target_repo)
  const pr = await githubFetch(`/repos/${owner}/${repo}/pulls/${manifest.prNumber}`).catch(() => null) as any
  if (!pr) return 'Approved PR evidence is unavailable'
  if (String(pr?.head?.sha || '').toLowerCase() !== manifest.approvedHeadSha.toLowerCase()) return 'PR head changed after approval; re-audit and approve the new head'
  const approvedFile = await getRepoFileContent(owner, repo, manifest.path, manifest.approvedHeadSha).catch(() => null)
  if (!approvedFile || artifactContentHash(approvedFile) !== manifest.approvedArtifactHash) {
    return 'Approved PR artifact changed after approval; re-audit and approve the exact artifact'
  }
  return null
}

function conditionExecution<T>(query: T, claim: ContentStudioExecutionClaim): T {
  return (query as any)
    .eq('execution_owner', claim.owner)
    .eq('execution_attempt', claim.attempt)
    .gt('execution_lease_expires_at', new Date().toISOString()) as T
}

async function assertManualExecution(job: Record<string, any>, claim: ContentStudioExecutionClaim): Promise<void> {
  await assertContentStudioExecution(db(), {
    jobId: String(job.id),
    contractId: String(job.contract_id),
    contractHash: String(job.contract_hash),
    owner: claim.owner,
    attempt: claim.attempt,
  })
}

async function fencedPatch(
  job: Record<string, any>,
  claim: ContentStudioExecutionClaim,
  patch: Record<string, unknown>,
): Promise<{ data: any; error: any }> {
  let query = db().from('content_jobs').update(patch)
    .eq('id', String(job.id))
    .eq('contract_id', job.contract_id)
    .eq('contract_hash', job.contract_hash)
  query = conditionExecution(query, claim) as any
  return (query as any).select('id').maybeSingle()
}

function strictManualState(job: Record<string, any>, contract: WritingContractV2, claim: ContentStudioExecutionClaim, bindContent: boolean) {
  const state = createContentStudioExecutionState(true, {
    contractId: contract.contractId,
    contractHash: contract.contractHash,
    opportunityId: contract.opportunity?.id || String(job.opportunity_id || ''),
    contractBrief: contract.brief || null,
    contractOwnership: contract.ownership || null,
    requestedModel: contract.requestedModel || null,
    executionJobId: String(job.id),
    executionOwner: claim.owner,
    executionAttempt: claim.attempt,
    executionLeaseExpiresAt: claim.leaseExpiresAt,
  })
  if (bindContent) {
    const accepted = String(job.content || '')
    if (!accepted.trim()) throw new Error('contracted manual publication requires persisted accepted content')
    state.acceptedContent = accepted
    state.acceptedHash = contentHash(accepted)
    state.revisionState = 'completed'
  }
  return state
}

export async function PATCH(request: NextRequest) {
  const body = await request.clone().json().catch(() => ({})) as Record<string, any>
  const id = String(body.id || '').trim()
  const action = String(body.action || '').trim()
  if (!id || !['regenerate','approve','reship','merge_pr'].includes(action)) return legacyPATCH(request)

  const auth = await requireAdminUser()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const loaded = await loadJob(id)
  if (loaded.error || !loaded.data) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  const job = loaded.data as Record<string, any>
  if (!job.contract_id) return legacyPATCH(request)

  let contract: WritingContractV2
  try {
    const loadedContract = await loadWritingContract(db(), {
      contractId: String(job.contract_id), contractHash: String(job.contract_hash || ''), jobId: id,
    })
    if (!loadedContract) return NextResponse.json({ ok:false, error:'Writing contract not found for job' }, { status:409 })
    contract = loadedContract
  } catch (error) {
    return NextResponse.json({ ok:false, error:error instanceof Error ? error.message : 'Writing contract validation failed' }, { status:409 })
  }

  if (action === 'regenerate') {
    try {
      const result = await runStoredContentJob(job as unknown as StoredContentJob, {
        dryRun: Boolean(body.dryRun),
        minAuditScore: body.minAuditScore != null ? Number(body.minAuditScore) : 55,
        maxRefine: body.maxRefine != null ? Math.min(2, Number(body.maxRefine) || 2) : 2,
        regenerationMode: 'refresh',
      })
      return NextResponse.json({ ok: result.ok, previousJobId: id, result }, { status: result.shipError ? 422 : 200 })
    } catch (error) {
      return NextResponse.json({ ok:false, error: error instanceof Error ? error.message : 'regenerate failed' }, { status: 422 })
    }
  }

  const mergingExisting = action === 'merge_pr'
    || (action === 'approve' && job.pr_number && job.status === 'pr_created' && body.forceNewShip !== true && body.content == null)
  if (mergingExisting) {
    const problem = await validateMarkedPr(job)
    if (problem) return NextResponse.json({ ok:false, error: problem }, { status: 409 })
  } else if (body.content != null && artifactContentHash(String(body.content)) !== artifactContentHash(String(job.content || ''))) {
    return NextResponse.json({
      ok:false,
      error:'Contracted approval cannot ship unsaved editor content; save and re-audit the accepted draft first',
    }, { status:409 })
  }

  let claim: ContentStudioExecutionClaim
  try {
    claim = await claimContentStudioExecution(db(), {
      jobId: id,
      contractId: contract.contractId,
      contractHash: contract.contractHash,
    })
  } catch (error) {
    return NextResponse.json({
      ok:false,
      error:error instanceof Error ? error.message : 'Contracted publication execution is already active',
    }, { status:409 })
  }

  const state = strictManualState(job, contract, claim, !mergingExisting)
  try {
    let response: Response
    let marker: string | null = null
    let exactContentHash: string | null = null
    let exactContent: string | null = null
    let exactArtifactHash: string | null = null
    let exactBodyHash: string | null = null

    if (mergingExisting) {
      response = await runInContentStudioExecution(state, () => legacyPATCH(request))
    } else {
      const publication = await runInContentStudioExecution(state, () => runWithPublicationIdentity({
        contractId: String(job.contract_id), contractHash: String(job.contract_hash || ''), opportunityId: String(job.opportunity_id || ''),
      }, () => legacyPATCH(request)))
      response = publication.result
      marker = publication.marker
      exactContentHash = publication.contentHash
      exactContent = publication.content
      exactArtifactHash = publication.artifactHash
      exactBodyHash = publication.bodyHash
    }
    if (!response.ok) return response

    await assertManualExecution(job, claim)
    const payload = await response.clone().json().catch(() => ({})) as Record<string, any>
    const existingManifest = publicationManifestFromAudit(job.audit_json)
    const ship = payload.ship as Record<string, any> | undefined
    const merge = payload.merge as Record<string, any> | undefined

    if (mergingExisting && existingManifest) {
      const nextManifest = {
        ...existingManifest,
        mergeSha: String(merge?.sha || ship?.mergeCommitSha || existingManifest.mergeSha || '').trim() || null,
        approvalActor: auth.profileId || existingManifest.approvalActor,
        approvedAt: new Date().toISOString(),
        lineageVerified: false,
        deploymentRunId: null,
        deploymentCommitSha: null,
        liveVerifiedAt: null,
      }
      const persisted = await fencedPatch(job, claim, {
        audit_json: withPublicationManifest(job.audit_json, nextManifest),
        expected_revision_marker: nextManifest.expectedMarker,
        publication_phase: 'deployment_pending',
        execution_stage: 'merged',
      })
      if (persisted.error || !persisted.data?.id) {
        return NextResponse.json({ ok:false, error:persisted.error?.message || 'Publication merge persistence lost execution ownership' }, { status:409 })
      }
      return response
    }

    if ((action === 'approve' || action === 'reship') && !body.dryRun) {
      if (!marker || !ship || !exactContentHash || !exactContent?.trim() || !exactArtifactHash || !exactBodyHash) {
        await fencedPatch(job, claim, {
          publication_phase:'verification_failed', execution_stage:'verification_failed',
          error_message:'Contracted ship completed without exact renderer marker/body/artifact proof',
        })
        return NextResponse.json({ ok:false, error:'Contracted ship completed without exact renderer marker/body/artifact proof' }, { status:500 })
      }

      const returnedPersistedContent = String(payload?.job?.content || '')
      if (returnedPersistedContent.trim() && artifactContentHash(returnedPersistedContent) !== exactContentHash) {
        await fencedPatch(job, claim, {
          publication_phase:'verification_failed', execution_stage:'verification_failed',
          error_message:'Persisted approved body does not match the exact renderer body hash',
        })
        return NextResponse.json({ ok:false, error:'Persisted approved body does not match the exact renderer body hash' }, { status:500 })
      }

      const repo = { owner:String(ship.owner || repoParts(job.target_repo).owner), repo:String(ship.repo || repoParts(job.target_repo).repo) }
      let manifest
      try {
        manifest = buildPublicationApprovalManifest({
          jobId:id, contractId:job.contract_id, contractHash:job.contract_hash, opportunityId:job.opportunity_id,
          repoOwner:repo.owner, repoName:repo.repo, path:String(ship.path || job.content_path || ''),
          canonical:String(ship.canonicalUrl || job.canonical_url || ''), expectedMarker:marker,
          content:exactContent, approvedContentHash:exactContentHash,
          approvedArtifactHash: exactArtifactHash, approvedBodyHash: exactBodyHash,
          approvalActor:auth.profileId || null, prNumber:ship.prNumber || job.pr_number || null,
          approvedHeadSha:ship.commitSha || null,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Publication manifest validation failed'
        await fencedPatch(job, claim, {
          publication_phase:'verification_failed', execution_stage:'verification_failed', error_message:message.slice(0,1000),
        })
        return NextResponse.json({ ok:false, error:message }, { status:500 })
      }
      manifest.mergeSha = ship.mergeCommitSha || (ship.status === 'deployed' ? ship.commitSha || null : null)
      await assertManualExecution(job, claim)
      let latestQuery = db().from('content_jobs').select('audit_json').eq('id', id)
      latestQuery = conditionExecution(latestQuery, claim) as any
      const latest = await (latestQuery as any).maybeSingle()
      if (latest.error || !latest.data) return NextResponse.json({ ok:false, error:latest.error?.message || 'Publication manifest load lost execution ownership' }, { status:409 })
      const persisted = await fencedPatch(job, claim, {
        content:exactContent,
        audit_json:withPublicationManifest(latest.data?.audit_json, manifest),
        expected_revision_marker:marker,
        publication_phase:ship.status === 'pr_created' ? 'pr_open' : 'deployment_pending',
        execution_stage:ship.status === 'pr_created' ? 'pr_open' : 'merged',
      })
      if (persisted.error || !persisted.data?.id) return NextResponse.json({ ok:false, error:persisted.error?.message || 'Publication manifest persistence lost execution ownership' }, { status:409 })
    }
    return response
  } catch (error) {
    return NextResponse.json({
      ok:false,
      error:error instanceof Error ? error.message : 'Contracted publication execution failed',
    }, { status:409 })
  } finally {
    try {
      await releaseContentStudioExecution(db(), { jobId:id, owner:claim.owner, attempt:claim.attempt })
    } catch (error) {
      console.warn('[content-studio/jobs] execution lease release failed', error instanceof Error ? error.message : error)
    }
  }
}

export async function POST(request: NextRequest) {
  const body = await request.clone().json().catch(() => ({})) as Record<string, any>
  const action = String(body.action || '').trim()

  if (action === 'bulk_approve') {
    const ids = Array.isArray(body.ids) ? body.ids.map((v: unknown) => String(v).trim()).filter(Boolean).slice(0,25) : []
    const results: Array<{ id:string; ok:boolean; error?:string; skipped?:boolean }> = []
    for (const id of ids) {
      const child = new NextRequest(request.url, { method:'PATCH', headers:request.headers, body:JSON.stringify({ id, action:'approve', dryRun:Boolean(body.dryRun) }) })
      const res = await PATCH(child)
      const out = await res.clone().json().catch(() => ({})) as any
      const skipped = !res.ok && out.error === 'Ship gate not cleared'
      results.push({ id, ok:res.ok && out.ok !== false, error:out.error, ...(skipped ? { skipped:true } : {}) })
    }
    const succeeded = results.filter(r=>r.ok).length
    const skippedIds = results.filter(r=>r.skipped).map(r=>r.id)
    const failed = results.filter(r=>!r.ok && !r.skipped).length
    if (ids.length > 0 && skippedIds.length === ids.length) {
      return NextResponse.json({ ok:false, action, error:'Ship gate not cleared', processed:results.length, succeeded:0, failed, skipped:skippedIds, results }, { status:409 })
    }
    return NextResponse.json({ ok:succeeded===results.length, action, processed:results.length, succeeded, failed, ...(skippedIds.length ? { skipped:skippedIds } : {}), results }, { status:succeeded ? 200 : 409 })
  }

  if (action !== 'rerun_resume') return legacyPOST(request)
  const auth = await requireAdminUser()
  if ('error' in auth) return NextResponse.json({ error:auth.error }, { status:auth.status })
  const ids = Array.isArray(body.ids) ? body.ids.map((value:unknown)=>String(value).trim()).filter(Boolean).slice(0,10) : []
  if (!ids.length) return NextResponse.json({ error:'rerun_resume requires ids[]' }, { status:400 })
  const results: Array<{ id:string; ok:boolean; error?:string; newJobId?:string }> = []
  for (const id of ids) {
    try {
      const { data:job, error } = await loadJob(id)
      if (error || !job) { results.push({ id, ok:false, error:error?.message || 'not found' }); continue }
      const result = await runStoredContentJob(job as unknown as StoredContentJob, {
        dryRun:Boolean(body.dryRun), minAuditScore:body.minAuditScore != null ? Number(body.minAuditScore) : 55,
        maxRefine:body.maxRefine != null ? Math.min(2,Number(body.maxRefine)||2) : 2, regenerationMode:'refresh',
      })
      results.push({ id, ok:result.ok, newJobId:result.jobId || undefined, error:result.error || result.shipError || undefined })
    } catch (error) { results.push({ id, ok:false, error:error instanceof Error ? error.message : 'regenerate failed' }) }
  }
  const succeeded = results.filter(result=>result.ok).length
  return NextResponse.json({ ok:succeeded===results.length, action:'rerun_resume', processed:results.length, succeeded, failed:results.length-succeeded, results })
}
