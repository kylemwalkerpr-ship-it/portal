import { createSupabaseAdminClient } from '@/lib/supabase'
import { githubFetch, getRepoFileContent } from '@/lib/githubContents'
import {
  publicationManifestFromAudit,
  withPublicationManifest,
  type PersistedPublicationManifest,
} from './publicationProof'

export type DurablePublicationProof = PersistedPublicationManifest

type DeploymentPolicy = {
  workflowPath: string
  workflowName: string
  jobName: string
  deploySteps: string[]
  requiredSuccessSteps?: string[]
  environment: string
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

function deploymentPolicy(repo: string, path: string): DeploymentPolicy | null {
  if (repo === 'portal') {
    return {
      workflowPath: '.github/workflows/deploy.yml',
      workflowName: 'Deploy YouSafe Portal',
      jobName: 'Build and deploy Worker',
      deploySteps: ['Deploy via OpenNext to Cloudflare (with transient-failure retry)'],
      requiredSuccessSteps: ['Post-deploy smoke test (studio contract + build freshness)'],
      environment: 'portal-production-main',
    }
  }
  if (repo === 'caseworks') {
    return {
      workflowPath: '.github/workflows/deploy.yml',
      workflowName: 'Deploy Caseworks Worker',
      jobName: 'Build and deploy Worker',
      deploySteps: [
        'Deploy to Cloudflare Workers (attempt 1)',
        'Deploy to Cloudflare Workers (attempt 2)',
        'Deploy to Cloudflare Workers (attempt 3 / final)',
      ],
      environment: 'caseworks-production-main',
    }
  }
  if (repo === 'yousafe-consultancy') {
    if (path.startsWith('landing-page/')) {
      return {
        workflowPath: '.github/workflows/deploy-landing-page.yml',
        workflowName: 'Deploy Landing Page',
        jobName: 'deploy',
        deploySteps: ['Promote uploaded Worker version to production'],
        requiredSuccessSteps: ['Verify deployed build is serving on apex'],
        environment: 'yousafe-apex-production-main',
      }
    }
    const country = path.split('/')[0]?.toLowerCase()
    const map: Record<string, { path: string; name: string; step: string }> = {
      usa: { path: '.github/workflows/deploy-usa.yml', name: 'Deploy USA', step: 'Deploy to Cloudflare Pages' },
      us: { path: '.github/workflows/deploy-usa.yml', name: 'Deploy USA', step: 'Deploy to Cloudflare Pages' },
      uk: { path: '.github/workflows/deploy-uk.yml', name: 'Deploy UK', step: 'Deploy to Cloudflare Pages' },
      ca: { path: '.github/workflows/deploy-ca.yml', name: 'Deploy CA', step: 'Deploy to Cloudflare Pages' },
      au: { path: '.github/workflows/deploy-au.yml', name: 'Deploy AU', step: 'Deploy to Cloudflare' },
    }
    const entry = map[country]
    if (entry) {
      return {
        workflowPath: entry.path,
        workflowName: entry.name,
        jobName: 'deploy',
        deploySteps: [entry.step],
        environment: `yousafe-${country}-production-main`,
      }
    }
  }
  return null
}

function same(a: unknown, b: unknown): boolean {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()
}

async function commitContains(owner: string, repo: string, ancestor: string, descendant: string): Promise<boolean> {
  if (same(ancestor, descendant)) return true
  const comparison = await githubFetch(
    `/repos/${owner}/${repo}/compare/${encodeURIComponent(ancestor)}...${encodeURIComponent(descendant)}`,
  ).catch(() => null) as any
  return comparison?.status === 'ahead' || comparison?.status === 'identical'
}

async function verifyAuthorizedRun(input: {
  owner: string
  repo: string
  mergeSha: string
  expectedMarker: string
  path: string
  policy: DeploymentPolicy
}): Promise<{
  runId: string
  commitSha: string
  workflowId: number
  jobId: string
  environment: string
} | null> {
  const raw = await githubFetch(
    `/repos/${input.owner}/${input.repo}/actions/runs?branch=main&per_page=100`,
  ).catch(() => null) as any
  const runs = Array.isArray(raw?.workflow_runs) ? raw.workflow_runs : []
  for (const run of runs) {
    if (run?.event !== 'push' || run?.head_branch !== 'main') continue
    if (run?.status !== 'completed' || run?.conclusion !== 'success') continue
    if (String(run?.path || '') !== input.policy.workflowPath) continue
    if (String(run?.name || '') !== input.policy.workflowName) continue
    const deployedSha = String(run?.head_sha || '').trim()
    if (!deployedSha || !(await commitContains(input.owner, input.repo, input.mergeSha, deployedSha))) continue

    const jobsRaw = await githubFetch(
      `/repos/${input.owner}/${input.repo}/actions/runs/${run.id}/jobs?per_page=100`,
    ).catch(() => null) as any
    const jobs = Array.isArray(jobsRaw?.jobs) ? jobsRaw.jobs : []
    const job = jobs.find((candidate: any) =>
      String(candidate?.name || '') === input.policy.jobName
      && candidate?.status === 'completed'
      && candidate?.conclusion === 'success',
    )
    if (!job) continue
    const steps = Array.isArray(job.steps) ? job.steps : []
    const deployed = input.policy.deploySteps.some((name) =>
      steps.some((step: any) => String(step?.name || '') === name && step?.conclusion === 'success'),
    )
    if (!deployed) continue
    const requiredOk = (input.policy.requiredSuccessSteps || []).every((name) =>
      steps.some((step: any) => String(step?.name || '') === name && step?.conclusion === 'success'),
    )
    if (!requiredOk) continue

    const artifact = await getRepoFileContent(input.owner, input.repo, input.path, deployedSha).catch(() => null)
    if (!artifact || !artifact.includes(input.expectedMarker)) continue

    return {
      runId: String(run.id),
      commitSha: deployedSha,
      workflowId: Number(run.workflow_id || 0),
      jobId: String(job.id || ''),
      // Current estate workflows do not consistently declare GitHub Environment
      // objects. The authorized production environment is therefore the exact
      // main-push workflow + successful deploy job/step encoded by policy.
      environment: String(job?.environment?.name || input.policy.environment),
    }
  }
  return null
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
    .select('id,target_repo,content_path,canonical_url,contract_id,contract_hash,opportunity_id,expected_revision_marker,pr_number,deploy_sha,audit_json,publication_phase,status')
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
  const manifest = publicationManifestFromAudit(job.audit_json)
  if (!repoRef || !path || !canonical) return persistFailure(db, jobId, 'publication target repo/path/canonical is incomplete')
  if (job.contract_id && (!manifest || !expectedMarker)) {
    return persistFailure(db, jobId, 'contracted publication is missing its persisted approval manifest or revision marker')
  }
  if (!manifest) return { ok: false, phase: 'deployment_pending', proof: null, reason: 'legacy publication has no evidence-contract manifest' }
  if (
    manifest.jobId !== jobId
    || !same(manifest.contractId, job.contract_id)
    || !same(manifest.contractHash, job.contract_hash)
    || !same(manifest.repoOwner, repoRef.owner)
    || !same(manifest.repoName, repoRef.repo)
    || manifest.path !== path
    || manifest.canonical !== canonical
    || manifest.expectedMarker !== expectedMarker
  ) return persistFailure(db, jobId, 'persisted publication manifest no longer matches the job identity')

  const policy = deploymentPolicy(repoRef.repo, path)
  if (!policy) return persistFailure(db, jobId, `no authorized deployment workflow registered for ${repoRef.repo}:${path}`)

  let approvedHeadSha = String(manifest.approvedHeadSha || '').trim()
  let mergeSha = String(manifest.mergeSha || '').trim()
  const prNumber = Number(manifest.prNumber || job.pr_number || 0)
  if (prNumber > 0) {
    const pr = await githubFetch(`/repos/${repoRef.owner}/${repoRef.repo}/pulls/${prNumber}`).catch(() => null) as any
    if (!pr) return { ok: false, phase: 'deployment_pending', proof: null, reason: 'PR evidence unavailable' }
    const currentHead = String(pr?.head?.sha || '').trim()
    if (!approvedHeadSha) approvedHeadSha = currentHead
    if (!same(currentHead, approvedHeadSha)) return persistFailure(db, jobId, 'PR head changed after approval; approval manifest is stale')
    if (!pr?.merged) {
      await db.from('content_jobs').update({ publication_phase: 'checks_passed' }).eq('id', jobId)
      return { ok: false, phase: 'deployment_pending', proof: null, reason: 'approved PR has not merged' }
    }
    mergeSha = String(pr?.merge_commit_sha || '').trim()
  } else {
    approvedHeadSha = approvedHeadSha || String(job.deploy_sha || '').trim()
    mergeSha = mergeSha || approvedHeadSha
  }
  if (!approvedHeadSha || !mergeSha) {
    return { ok: false, phase: 'deployment_pending', proof: null, reason: 'approved-head/merge evidence unavailable' }
  }

  // The merged commit itself must contain the approved marker before looking at
  // deployment runs. This rejects a wrong PR/path even when a later deployment is green.
  const mergedArtifact = await getRepoFileContent(repoRef.owner, repoRef.repo, path, mergeSha).catch(() => null)
  if (!mergedArtifact || !mergedArtifact.includes(expectedMarker)) {
    return persistFailure(db, jobId, `merge commit does not contain expected marked artifact ${path}`)
  }

  const deployed = await verifyAuthorizedRun({
    owner: repoRef.owner,
    repo: repoRef.repo,
    mergeSha,
    expectedMarker,
    path,
    policy,
  })
  if (!deployed) {
    await db.from('content_jobs').update({ publication_phase: 'deployment_pending' }).eq('id', jobId)
    return { ok: false, phase: 'deployment_pending', proof: null, reason: 'authorized successful production deployment containing the expected artifact was not found' }
  }

  const proof: DurablePublicationProof = {
    ...manifest,
    approvedHeadSha,
    mergeSha,
    deploymentRunId: deployed.runId,
    deploymentCommitSha: deployed.commitSha,
    deploymentWorkflowId: deployed.workflowId,
    deploymentWorkflowPath: policy.workflowPath,
    deploymentJobId: deployed.jobId,
    deploymentEnvironment: deployed.environment,
    lineageVerified: true,
  }
  const updated = await db.from('content_jobs').update({
    publication_phase: 'deployed',
    audit_json: withPublicationManifest(job.audit_json, proof),
  }).eq('id', jobId).eq('contract_id', job.contract_id || null).eq('contract_hash', job.contract_hash || null).select('id').maybeSingle()
  if (updated.error || !updated.data?.id) {
    return { ok: false, phase: 'verification_failed', proof: null, reason: updated.error?.message || 'publication identity advanced during reconciliation' }
  }
  return { ok: true, phase: 'deployed', proof, reason: 'approved PR/main commit, authorized deployment job, ancestry and marked artifact verified' }
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
