import { reconcilePublicationDeployment } from '@/lib/seoFactory/publicationMonitor'
import {
  artifactContentHash,
  publicationBodyHash,
  type PersistedPublicationManifest,
} from '@/lib/seoFactory/publicationProof'

const githubFetch = jest.fn()
const getRepoFileContent = jest.fn()
let job: Record<string, any>
let updates: Record<string, unknown>[] = []

jest.mock('@/lib/githubContents', () => ({
  githubFetch: (...args: unknown[]) => githubFetch(...args),
  getRepoFileContent: (...args: unknown[]) => getRepoFileContent(...args),
}))

const APPROVED_BODY = '# Approved article\n\nThis is the exact substantive approved article body for deployment verification.'
const APPROVED_ARTIFACT = `export const metadata = { other: { "content-studio-revision": "csrev_marker" } }\n${APPROVED_BODY}`

function builder(table: string) {
  let patch: Record<string, unknown> | null = null
  const q: any = {
    select: jest.fn(() => q), eq: jest.fn(() => q), in: jest.fn(() => q), is: jest.fn(() => q),
    update: jest.fn((value: Record<string, unknown>) => { patch = value; updates.push(value); return q }),
    single: jest.fn(async () => ({ data: table === 'content_jobs' ? job : null, error:null })),
    maybeSingle: jest.fn(async () => ({ data: patch ? { id:job.id } : job, error:null })),
    then(resolve: (v: any)=>void) { resolve({ data:patch ? { id:job.id } : null, error:null }) },
  }
  return q
}
const adminDb = { from: jest.fn((table:string) => builder(table)) }
jest.mock('@/lib/supabase', () => ({ createSupabaseAdminClient: () => adminDb }))

function manifest(): PersistedPublicationManifest {
  return {
    schemaVersion:2, jobId:'job-1', contractId:'wc_1', contractHash:'hash-1', opportunityId:'opp-1',
    repoOwner:'kylemwalkerpr-ship-it', repoName:'portal', path:'app/x/page.tsx',
    canonical:'https://market.yousafeconsultancy.com/x/', expectedMarker:'csrev_marker',
    approvedContentHash:artifactContentHash(APPROVED_BODY),
    approvedArtifactHash:artifactContentHash(APPROVED_ARTIFACT),
    approvedBodyHash:publicationBodyHash(APPROVED_BODY),
    approvedAt:'2026-09-14T00:00:00Z', approvalActor:'admin',
    prNumber:77, approvedHeadSha:'head-approved', mergeSha:null,
    deploymentRunId:null, deploymentCommitSha:null, deploymentWorkflowId:null,
    deploymentWorkflowPath:null, deploymentJobId:null, deploymentEnvironment:null,
    lineageVerified:false, liveVerifiedAt:null,
  }
}

beforeEach(() => {
  jest.clearAllMocks(); updates = []
  const m = manifest()
  job = {
    id:'job-1', target_repo:'portal', content_path:'app/x/page.tsx', canonical_url:m.canonical,
    contract_id:'wc_1', contract_hash:'hash-1', opportunity_id:'opp-1', expected_revision_marker:'csrev_marker',
    pr_number:77, deploy_sha:null, publication_phase:'pr_open', status:'pr_created',
    audit_json:{ score:90, publicationManifest:m },
  }
  getRepoFileContent.mockResolvedValue(APPROVED_ARTIFACT)
})

describe('durable publication monitor', () => {
  it('accepts a later deployed main commit only when exact authorized workflow/job/step, artifact and ancestry all match', async () => {
    githubFetch.mockImplementation(async (path:string) => {
      if (path.endsWith('/pulls/77')) return { merged:true, head:{sha:'head-approved'}, merge_commit_sha:'merge-sha' }
      if (path.includes('/actions/runs?')) return { workflow_runs:[
        { id:1, event:'push', head_branch:'main', status:'completed', conclusion:'success', path:'.github/workflows/fake-deploy.yml', name:'Deploy YouSafe Portal', head_sha:'new-main', workflow_id:999 },
        { id:2, event:'push', head_branch:'main', status:'completed', conclusion:'success', path:'.github/workflows/deploy.yml', name:'Deploy YouSafe Portal', head_sha:'new-main', workflow_id:273970987 },
      ] }
      if (path.includes('/compare/merge-sha...new-main')) return { status:'ahead' }
      if (path.includes('/actions/runs/2/jobs')) return { jobs:[{
        id:22, name:'Build and deploy Worker', status:'completed', conclusion:'success',
        steps:[
          { name:'Deploy via OpenNext to Cloudflare (with transient-failure retry)', conclusion:'success' },
          { name:'Post-deploy smoke test (studio contract + build freshness)', conclusion:'success' },
        ],
      }] }
      throw new Error(`unexpected github path ${path}`)
    })

    const result = await reconcilePublicationDeployment('job-1')
    expect(result.ok).toBe(true)
    expect(result.proof?.mergeSha).toBe('merge-sha')
    expect(result.proof?.deploymentCommitSha).toBe('new-main')
    expect(result.proof?.deploymentWorkflowPath).toBe('.github/workflows/deploy.yml')
    expect(result.proof?.deploymentEnvironment).toBe('not configured')
    expect(result.proof?.lineageVerified).toBe(true)
    expect(getRepoFileContent).toHaveBeenCalledWith('kylemwalkerpr-ship-it','portal','app/x/page.tsx','merge-sha')
    expect(getRepoFileContent).toHaveBeenCalledWith('kylemwalkerpr-ship-it','portal','app/x/page.tsx','new-main')
  })

  it('records an actual GitHub Environment only when the successful deploy job reports one', async () => {
    githubFetch.mockImplementation(async (path:string) => {
      if (path.endsWith('/pulls/77')) return { merged:true, head:{sha:'head-approved'}, merge_commit_sha:'merge-sha' }
      if (path.includes('/actions/runs?')) return { workflow_runs:[{ id:20,event:'push',head_branch:'main',status:'completed',conclusion:'success',path:'.github/workflows/deploy.yml',name:'Deploy YouSafe Portal',head_sha:'merge-sha',workflow_id:273970987 }] }
      if (path.includes('/actions/runs/20/jobs')) return { jobs:[{ id:220,name:'Build and deploy Worker',status:'completed',conclusion:'success',environment:{name:'production'},steps:[{name:'Deploy via OpenNext to Cloudflare (with transient-failure retry)',conclusion:'success'},{name:'Post-deploy smoke test (studio contract + build freshness)',conclusion:'success'}] }] }
      throw new Error(`unexpected ${path}`)
    })
    const result = await reconcilePublicationDeployment('job-1')
    expect(result.ok).toBe(true)
    expect(result.proof?.deploymentEnvironment).toBe('production')
  })

  it('rejects a manifest that lost the exact rendered-body hash', async () => {
    job.audit_json.publicationManifest.approvedContentHash = ''
    const result = await reconcilePublicationDeployment('job-1')
    expect(result.ok).toBe(false)
    expect(result.phase).toBe('verification_failed')
    expect(result.reason).toMatch(/content hash/i)
    expect(githubFetch).not.toHaveBeenCalled()
  })

  it('rejects a manifest that lost the exact repository artifact digest', async () => {
    job.audit_json.publicationManifest.approvedArtifactHash = ''
    const result = await reconcilePublicationDeployment('job-1')
    expect(result.ok).toBe(false)
    expect(result.phase).toBe('verification_failed')
    expect(result.reason).toMatch(/artifact hash/i)
  })

  it('rejects a successful deployment-shaped but unauthorized workflow', async () => {
    githubFetch.mockImplementation(async (path:string) => {
      if (path.endsWith('/pulls/77')) return { merged:true, head:{sha:'head-approved'}, merge_commit_sha:'merge-sha' }
      if (path.includes('/actions/runs?')) return { workflow_runs:[
        { id:3, event:'push', head_branch:'main', status:'completed', conclusion:'success', path:'.github/workflows/other.yml', name:'Production deploy', head_sha:'merge-sha', workflow_id:3 },
      ] }
      throw new Error(`unexpected ${path}`)
    })
    const result = await reconcilePublicationDeployment('job-1')
    expect(result.ok).toBe(false)
    expect(result.phase).toBe('deployment_pending')
    expect(result.reason).toMatch(/authorized successful production deployment/i)
  })

  it('rejects a stale deployment commit that does not contain the merge', async () => {
    githubFetch.mockImplementation(async (path:string) => {
      if (path.endsWith('/pulls/77')) return { merged:true, head:{sha:'head-approved'}, merge_commit_sha:'merge-sha' }
      if (path.includes('/actions/runs?')) return { workflow_runs:[
        { id:4, event:'push', head_branch:'main', status:'completed', conclusion:'success', path:'.github/workflows/deploy.yml', name:'Deploy YouSafe Portal', head_sha:'old-main', workflow_id:273970987 },
      ] }
      if (path.includes('/compare/merge-sha...old-main')) return { status:'behind' }
      throw new Error(`unexpected ${path}`)
    })
    const result = await reconcilePublicationDeployment('job-1')
    expect(result.ok).toBe(false)
    expect(result.phase).toBe('deployment_pending')
  })

  it('fails closed when the deployed artifact at the right commit differs even if the marker is retained', async () => {
    getRepoFileContent.mockImplementation(async (_o:string,_r:string,_p:string,ref:string) =>
      ref === 'merge-sha' ? APPROVED_ARTIFACT : APPROVED_ARTIFACT.replace('exact substantive approved', 'changed substantive approved'),
    )
    githubFetch.mockImplementation(async (path:string) => {
      if (path.endsWith('/pulls/77')) return { merged:true, head:{sha:'head-approved'}, merge_commit_sha:'merge-sha' }
      if (path.includes('/actions/runs?')) return { workflow_runs:[{ id:5,event:'push',head_branch:'main',status:'completed',conclusion:'success',path:'.github/workflows/deploy.yml',name:'Deploy YouSafe Portal',head_sha:'new-main',workflow_id:273970987 }] }
      if (path.includes('/compare/merge-sha...new-main')) return { status:'ahead' }
      if (path.includes('/actions/runs/5/jobs')) return { jobs:[{ id:55,name:'Build and deploy Worker',status:'completed',conclusion:'success',steps:[{name:'Deploy via OpenNext to Cloudflare (with transient-failure retry)',conclusion:'success'},{name:'Post-deploy smoke test (studio contract + build freshness)',conclusion:'success'}] }] }
      throw new Error(`unexpected ${path}`)
    })
    const result = await reconcilePublicationDeployment('job-1')
    expect(result.ok).toBe(false)
    expect(result.phase).toBe('deployment_pending')
  })
})
