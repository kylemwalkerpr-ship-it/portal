import { createSupabaseAdminClient } from '@/lib/supabase'
import { githubFetch } from '@/lib/githubContents'

export type DurablePublicationProof = {
  repoOwner: string
  repoName: string
  path: string
  canonical: string
  contractId: string | null
  contractHash: string | null
  expectedMarker: string | null
  approvedHeadSha: string
  mergeSha: string
  deploymentRunId: string
  deploymentCommitSha: string
  deploymentWorkflow: string
  verifiedAt: string
}

function parseRepo(targetRepo: unknown): { owner: string; repo: string } | null {
  const fallbackOwner = (process.env.GITHUB_CONTENT_OWNER || process.env.GITHUB_REPO_OWNER || 'kylemwalkerpr-ship-it').trim()
  const raw = String(targetRepo || '').trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '')
  if (!raw) return null
  if (raw.includes('/')) {
    const [owner, repo] = raw.split('/')
    return owner && repo ? { owner, repo } : null
  }
  return { owner: fallbackOwner, repo: raw }
}

function encodedPath(path: string): string {
  return path.split('/').filter(Boolean).map(encodeURIComponent).join('/')
}

export async function reconcilePublicationDeployment(jobId: string): Promise<{
  ok: boolean
  phase: 'deployment_pending' | 'deployed' | 'verification_failed'
  proof: DurablePublicationProof | null
  reason: string
}> {
  const db = createSupabaseAdminClient()
  const loaded = await db
    .from('content_jobs')
    .select('id,target_repo,content_path,canonical_url,contract_id,contract_hash,expected_revision_marker,pr_number,deploy_sha,audit_json,publication_phase,status')
    .eq('id', jobId)
    .single()
  if (loaded.error || !loaded.data) {
    return { ok: false, phase: 'verification_failed', proof: null, reason: loaded.error?.message || 'job not found' }
  }
  const job = loaded.data as Record<string, any>
  const repoRef = parseRepo(job.target_repo)
  const path = String(job.content_path || '').trim()
  const canonical = String(job.canonical_url || '').trim()
  const expectedMarker = String(job.expected_revision_marker || '').trim()
  if (!repoRef || !path || !canonical) {
    return persistFailure(db, jobId, 'publication target repo/path/canonical is incomplete')
  }
  if (job.contract_id && !expectedMarker) {
    return persistFailure(db, jobId, 'contracted publication has no expected revision marker')
  }

  let approvedHeadSha = ''
  let mergeSha = ''
  const prNumber = Number(job.pr_number || 0)
  if (prNumber > 0) {
    const pr = await githubFetch(`/repos/${repoRef.owner}/${repoRef.repo}/pulls/${prNumber}`).catch(() => null) as any
    if (!pr) return { ok: false, phase: 'deployment_pending', proof: null, reason: 'PR evidence unavailable' }
    approvedHeadSha = String(pr?.head?.sha || '').trim()
    if (!pr?.merged) {
      await db.from('content_jobs').update({ publication_phase: 'checks_passed' }).eq('id', jobId)
      return { ok: false, phase: 'deployment_pending', proof: null, reason: 'PR not merged' }
    }
    mergeSha = String(pr?.merge_commit_sha || job.deploy_sha || '').trim()
  } else {
    // Human-approved direct-main commit: the approved commit, merge lineage and
    // deployment commit are the same immutable main SHA.
    approvedHeadSha = String(job.deploy_sha || '').trim()
    mergeSha = approvedHeadSha
  }
  if (!approvedHeadSha || !mergeSha) {
    return { ok: false, phase: 'deployment_pending', proof: null, reason: 'approved/merge commit evidence unavailable' }
  }

  // Verify the intended artifact exists at the exact approved merge/main SHA.
  const artifact = await githubFetch(
    `/repos/${repoRef.owner}/${repoRef.repo}/contents/${encodedPath(path)}?ref=${encodeURIComponent(mergeSha)}`,
  ).catch(() => null) as any
  if (!artifact?.sha && !artifact?.download_url && artifact?.type !== 'file') {
    return persistFailure(db, jobId, `approved commit does not contain intended artifact ${path}`)
  }

  // A green PR check is not deployment proof. Require a successful deployment-
  // shaped Actions run whose head SHA is the merge/direct-main commit.
  const runs = await githubFetch(
    `/repos/${repoRef.owner}/${repoRef.repo}/actions/runs?head_sha=${encodeURIComponent(mergeSha)}&per_page=50`,
  ).catch(() => null) as any
  const workflowRuns = Array.isArray(runs?.workflow_runs) ? runs.workflow_runs : []
  const deployRun = workflowRuns.find((run: any) =>
    String(run?.head_sha || '').toLowerCase() === mergeSha.toLowerCase()
    && run?.status === 'completed'
    && run?.conclusion === 'success'
    && /deploy|cloudflare|pages|production|worker/i.test(String(run?.name || run?.display_title || '')),
  )
  if (!deployRun) {
    await db.from('content_jobs').update({ publication_phase: 'deployment_pending' }).eq('id', jobId)
    return { ok: false, phase: 'deployment_pending', proof: null, reason: 'successful deployment run for approved commit not found' }
  }

  const proof: DurablePublicationProof = {
    repoOwner: repoRef.owner,
    repoName: repoRef.repo,
    path,
    canonical,
    contractId: job.contract_id ? String(job.contract_id) : null,
    contractHash: job.contract_hash ? String(job.contract_hash) : null,
    expectedMarker: expectedMarker || null,
    approvedHeadSha,
    mergeSha,
    deploymentRunId: String(deployRun.id || ''),
    deploymentCommitSha: mergeSha,
    deploymentWorkflow: String(deployRun.name || deployRun.display_title || 'deployment'),
    verifiedAt: new Date().toISOString(),
  }
  const priorAudit = job.audit_json && typeof job.audit_json === 'object' ? job.audit_json : {}
  const updated = await db.from('content_jobs').update({
    publication_phase: 'deployed',
    deploy_sha: mergeSha,
    audit_json: { ...priorAudit, publicationProof: proof },
  }).eq('id', jobId).eq('contract_id', job.contract_id || null).select('id').maybeSingle()
  if (updated.error || !updated.data?.id) {
    return { ok: false, phase: 'verification_failed', proof: null, reason: updated.error?.message || 'publication identity advanced during reconciliation' }
  }
  return { ok: true, phase: 'deployed', proof, reason: 'approved commit, artifact and deployment lineage verified' }
}

async function persistFailure(
  db: ReturnType<typeof createSupabaseAdminClient>,
  jobId: string,
  reason: string,
): Promise<{ ok: false; phase: 'verification_failed'; proof: null; reason: string }> {
  await db.from('content_jobs').update({
    publication_phase: 'verification_failed',
    execution_stage: 'verification_failed',
    error_message: reason.slice(0, 1000),
  }).eq('id', jobId)
  return { ok: false, phase: 'verification_failed', proof: null, reason }
}
