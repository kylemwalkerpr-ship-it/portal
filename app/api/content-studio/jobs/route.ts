import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdminUser } from '@/lib/portalAuth'
import { githubFetch } from '@/lib/githubContents'
import { runStoredContentJob, type StoredContentJob } from '@/lib/seoFactory/storedJobExecution'
import { loadWritingContract } from '@/lib/seoFactory/writingContractStore'
import {
  buildPublicationApprovalManifest,
  publicationManifestFromAudit,
  runWithPublicationIdentity,
  withPublicationManifest,
} from '@/lib/seoFactory/publicationProof'
import { GET as legacyGET, POST as legacyPOST, PATCH as legacyPATCH } from './legacy'

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}
function repoParts(value: unknown): { owner: string; repo: string } {
  const raw = String(value || '').replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '')
  if (raw.includes('/')) { const [owner, repo] = raw.split('/'); return { owner, repo } }
  return { owner: process.env.GITHUB_CONTENT_OWNER || 'kylemwalkerpr-ship-it', repo: raw }
}

export async function GET(request: NextRequest) { return legacyGET(request) }

async function loadJob(id: string) {
  return db().from('content_jobs').select('*').eq('id', id).single()
}

async function validateMarkedPr(job: Record<string, any>): Promise<string | null> {
  const manifest = publicationManifestFromAudit(job.audit_json)
  if (!manifest || !manifest.expectedMarker || !manifest.approvedHeadSha || !manifest.prNumber) {
    return 'Contracted PR cannot be merged: persisted approval manifest is incomplete'
  }
  if (Number(job.pr_number || 0) !== Number(manifest.prNumber)) return 'Contracted PR number changed after approval'
  const { owner, repo } = repoParts(job.target_repo)
  const pr = await githubFetch(`/repos/${owner}/${repo}/pulls/${manifest.prNumber}`).catch(() => null) as any
  if (!pr) return 'Approved PR evidence is unavailable'
  if (String(pr?.head?.sha || '').toLowerCase() !== manifest.approvedHeadSha.toLowerCase()) {
    return 'PR head changed after approval; re-audit and approve the new head'
  }
  return null
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

  // Every contracted admin action revalidates the immutable contract AND its
  // persisted evidence hashes before it can regenerate, approve, reship or merge.
  try {
    const contract = await loadWritingContract(db(), {
      contractId: String(job.contract_id),
      contractHash: String(job.contract_hash || ''),
      jobId: id,
    })
    if (!contract) return NextResponse.json({ ok:false, error:'Writing contract not found for job' }, { status:409 })
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
  }

  // Human approval is a publication operation, not an authoring operation.
  // It receives NO AI execution lease. The publication-only context lets the
  // renderer derive the marker from the exact post-repair body it is shipping.
  let response: Response
  let marker: string | null = null
  if (mergingExisting) {
    response = await legacyPATCH(request)
  } else {
    const publication = await runWithPublicationIdentity({
      contractId: String(job.contract_id),
      contractHash: String(job.contract_hash || ''),
      opportunityId: String(job.opportunity_id || ''),
    }, () => legacyPATCH(request))
    response = publication.result
    marker = publication.marker
  }
  if (!response.ok) return response

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
    await db().from('content_jobs').update({
      audit_json: withPublicationManifest(job.audit_json, nextManifest),
      expected_revision_marker: nextManifest.expectedMarker,
      publication_phase: 'deployment_pending',
      execution_stage: 'merged',
    }).eq('id', id).eq('contract_id', job.contract_id).eq('contract_hash', job.contract_hash)
    return response
  }

  if ((action === 'approve' || action === 'reship') && !body.dryRun) {
    if (!marker || !ship) {
      await db().from('content_jobs').update({ publication_phase:'verification_failed', execution_stage:'verification_failed', error_message:'Contracted ship completed without a durable revision marker/ship result' }).eq('id', id)
      return NextResponse.json({ ok:false, error:'Contracted ship completed without a durable revision marker/ship result' }, { status:500 })
    }
    const repo = { owner:String(ship.owner || repoParts(job.target_repo).owner), repo:String(ship.repo || repoParts(job.target_repo).repo) }
    // legacyPATCH returns the exact persisted post-repair body in job.content.
    const content = String(payload?.job?.content || body.content || job.content || '')
    const manifest = buildPublicationApprovalManifest({
      jobId:id, contractId:job.contract_id, contractHash:job.contract_hash, opportunityId:job.opportunity_id,
      repoOwner:repo.owner, repoName:repo.repo, path:String(ship.path || job.content_path || ''),
      canonical:String(ship.canonicalUrl || job.canonical_url || ''), expectedMarker:marker, content,
      approvalActor:auth.profileId || null, prNumber:ship.prNumber || job.pr_number || null,
      approvedHeadSha:ship.commitSha || null,
    })
    manifest.mergeSha = ship.mergeCommitSha || (ship.status === 'deployed' ? ship.commitSha || null : null)
    const latest = await db().from('content_jobs').select('audit_json').eq('id', id).single()
    await db().from('content_jobs').update({
      audit_json:withPublicationManifest(latest.data?.audit_json, manifest),
      expected_revision_marker:marker,
      publication_phase:ship.status === 'pr_created' ? 'pr_open' : 'deployment_pending',
      execution_stage:ship.status === 'pr_created' ? 'pr_open' : 'merged',
    }).eq('id', id).eq('contract_id', job.contract_id).eq('contract_hash', job.contract_hash)
  }
  return response
}

export async function POST(request: NextRequest) {
  const body = await request.clone().json().catch(() => ({})) as Record<string, any>
  const action = String(body.action || '').trim()

  if (action === 'bulk_approve') {
    const ids = Array.isArray(body.ids) ? body.ids.map((v: unknown) => String(v).trim()).filter(Boolean).slice(0,25) : []
    const results: Array<{ id:string; ok:boolean; error?:string }> = []
    for (const id of ids) {
      const child = new NextRequest(request.url, { method:'PATCH', headers:request.headers, body:JSON.stringify({ id, action:'approve', dryRun:Boolean(body.dryRun) }) })
      const res = await PATCH(child)
      const out = await res.clone().json().catch(() => ({})) as any
      results.push({ id, ok:res.ok && out.ok !== false, error:out.error })
    }
    const succeeded = results.filter(r=>r.ok).length
    return NextResponse.json({ ok:succeeded===results.length, action, processed:results.length, succeeded, failed:results.length-succeeded, results }, { status:succeeded ? 200 : 409 })
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
