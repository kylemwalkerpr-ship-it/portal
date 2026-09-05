/**
 * Server-side enforcement: the Content Studio jobs API must refuse to merge a
 * PR / bulk-approve a draft unless the job's persisted audit carries a CURRENT
 * ship-gate pass (shipReady === true && blockers === 0). Unknown audit state is
 * a FAIL — mergePullRequest must never run for an ungated row.
 *
 * Mocks requireAdminUser + Supabase + the GitHub merge door only; the real
 * gate helper (lib/seoFactory/jobShipGate) is exercised end to end.
 */
import { PATCH, POST } from '@/app/api/content-studio/jobs/route'

const mockRequireAdminUser = jest.fn(async () => ({
  db: {},
  profile: {},
  profileId: 'p_admin',
  role: 'admin',
}))
jest.mock('@/lib/portalAuth', () => ({
  requireAdminUser: () => mockRequireAdminUser(),
}))

const mockMergePullRequest = jest.fn()
const mockShipContent = jest.fn()
jest.mock('@/lib/seoFactory/ship', () => {
  const actual = jest.requireActual('@/lib/seoFactory/ship')
  return {
    ...actual,
    mergePullRequest: (...args: unknown[]) => mockMergePullRequest(...args),
    shipContent: (...args: unknown[]) => mockShipContent(...args),
  }
})

jest.mock('@/lib/seoFactory/deployMonitor', () => ({
  monitorContentJob: jest.fn(async () => ({ ok: true })),
}))

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, opts?: { status?: number }) => ({
      status: opts?.status ?? 200,
      body,
      json: async () => body,
    }),
  },
}))

// Stateful Supabase chain: first .single() returns the job row, an .update()
// marks the row "updated" so the next .single() returns the updated row, and
// un-returned update chains resolve via .then().
const makeSupabaseClient = () => {
  const builder: Record<string, any> = {
    _updated: false,
    _rows: new Map<string, unknown>(),
    _key: '',
    select: () => builder,
    eq: (k: string, v: unknown) => {
      builder._key = String(v)
      return builder
    },
    in: () => builder,
    order: () => builder,
    limit: () => builder,
    range: () => builder,
    maybeSingle: () =>
      Promise.resolve({ data: builder._updated ? builder._updatedRow : (builder._rows.get(builder._key) ?? null), error: null }),
    single: () =>
      Promise.resolve({ data: builder._updated ? builder._updatedRow : (builder._rows.get(builder._key) ?? null), error: null }),
    update: (patch: Record<string, unknown>) => {
      builder._updated = true
      builder._patch = patch
      return builder
    },
    insert: () => builder,
    delete: () => builder,
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: builder._updated ? builder._updatedRow ?? null : null, error: null }).then(resolve),
  }
  const client = { from: (_t: string) => builder }
  ;(client as any).__builder = builder
  return client
}

let supabaseClient: any

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => supabaseClient),
}))

function mkContent(): string {
  const sections = ['Overview', 'Eligibility', 'Required Documents', 'Application Steps', 'Processing Times', 'Fees and Costs', 'Common Mistakes', 'FAQ']
  const para = (n: number) =>
    Array.from(
      { length: n },
      (_, i) => `Canada study permit applicants must understand the eligibility rules and document requirements before submission ${i + 1}. Processing times vary by visa office and season, so start early.`,
    ).join(' ')
  const body = sections.map((s) => `## ${s}\n\n${para(30)}`).join('\n\n')
  return `---\ntitle: Canada Study Permit Guide 2026\ndescription: Step-by-step Canada study permit application guide\n---\n\n# Canada Study Permit Guide\n\nIn 60 seconds, here is the quick answer for study permit applicants.\n\n${body}\n`
}

function baseJob(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'j1',
    title: 'Canada Study Permit Guide',
    topic: 'canada study permit',
    primary_keyword: 'canada study permit',
    content_type: 'legal_guide',
    region: 'CA',
    status: 'pr_created',
    pr_number: 12,
    target_repo: 'caseworks/caseworks',
    content: mkContent(),
    audit_json: { score: 96, blockers: [] },
    ...overrides,
  }
}

function patch(body: Record<string, unknown>) {
  return PATCH({ json: async () => body } as any)
}

function post(body: Record<string, unknown>) {
  return POST({ json: async () => body } as any)
}

beforeEach(() => {
  jest.clearAllMocks()
  supabaseClient = makeSupabaseClient()
  mockMergePullRequest.mockResolvedValue({ merged: true, sha: 'sha123', message: 'merged' })
})

describe('PATCH merge_pr — refuses an ungated PR', () => {
  it('returns 409 and never calls mergePullRequest when audit_json has NO shipReady (UNKNOWN)', async () => {
    supabaseClient.__builder._rows.set('j1', baseJob())
    const res = await patch({ id: 'j1', action: 'merge_pr' })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('Ship gate not cleared')
    expect(mockMergePullRequest).not.toHaveBeenCalled()
  })

  it('returns 409 when the audit explicitly reports shipReady=false', async () => {
    supabaseClient.__builder._rows.set('j1', baseJob({ audit_json: { score: 100, shipReady: false, blockers: 0 } }))
    const res = await patch({ id: 'j1', action: 'merge_pr' })
    expect(res.status).toBe(409)
    expect(mockMergePullRequest).not.toHaveBeenCalled()
  })

  it('returns 409 when blockers remain even at shipReady=true', async () => {
    supabaseClient.__builder._rows.set('j1', baseJob({ audit_json: { score: 100, shipReady: true, blockers: 1 } }))
    const res = await patch({ id: 'j1', action: 'merge_pr' })
    expect(res.status).toBe(409)
    expect(mockMergePullRequest).not.toHaveBeenCalled()
  })

  it('merges when the current gate snapshot is a true pass (shipReady && blockers===0)', async () => {
    supabaseClient.__builder._rows.set('j1', baseJob({ audit_json: { score: 88, shipReady: true, blockers: 0 } }))
    supabaseClient.__builder._updatedRow = { ...baseJob(), status: 'merged' }
    const res = await patch({ id: 'j1', action: 'merge_pr' })
    expect(res.status).toBe(200)
    expect(mockMergePullRequest).toHaveBeenCalledWith(
      expect.objectContaining({ owner: 'caseworks', repo: 'caseworks', prNumber: 12 }),
    )
    expect((await res.json()).ok).toBe(true)
  })

  it('merges when blockers is an empty array (client-normalized pass)', async () => {
    supabaseClient.__builder._rows.set('j1', baseJob({ audit_json: { score: 88, shipReady: true, blockers: [] } }))
    supabaseClient.__builder._updatedRow = { ...baseJob(), status: 'merged' }
    const res = await patch({ id: 'j1', action: 'merge_pr' })
    expect(res.status).toBe(200)
    expect(mockMergePullRequest).toHaveBeenCalled()
  })
})

describe('PATCH approve — PR-merge shortcut (no editor content) refuses an ungated PR', () => {
  it('returns 409 instead of merging the existing PR when the gate is not cleared', async () => {
    supabaseClient.__builder._rows.set('j1', baseJob({ audit_json: { score: 96, blockers: [] } }))
    const res = await patch({ id: 'j1', action: 'approve', humanApproved: true })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('Ship gate not cleared')
    expect(mockMergePullRequest).not.toHaveBeenCalled()
    expect(mockShipContent).not.toHaveBeenCalled()
  })

  it('returns 409 when shipping content was requested but persisted gate is not cleared (P1-SHIP-1)', async () => {
    // Direct modal approve must use the same audit_json.shipReady evidence as
    // workspace / bulk_approve — content in the body no longer bypasses the gate.
    supabaseClient.__builder._rows.set('j1', baseJob({ audit_json: { score: 96, blockers: [] } }))
    mockShipContent.mockResolvedValue({ status: 'pr_created', path: 'app/ca/x/page.tsx', mode: 'pr' })
    const res = await patch({ id: 'j1', action: 'approve', humanApproved: true, content: 'approved full body content' })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('Ship gate not cleared')
    expect(mockShipContent).not.toHaveBeenCalled()
    expect(mockMergePullRequest).not.toHaveBeenCalled()
  })

  it('ships via shipContent when body.content is present AND audit_json.shipReady is true', async () => {
    supabaseClient.__builder._rows.set(
      'j1',
      baseJob({ audit_json: { score: 96, shipReady: true, blockers: [] } }),
    )
    mockShipContent.mockResolvedValue({ status: 'pr_created', path: 'app/ca/x/page.tsx', mode: 'pr' })
    supabaseClient.__builder._updatedRow = { ...baseJob(), status: 'pr_created' }
    const res = await patch({ id: 'j1', action: 'approve', humanApproved: true, content: mkContent() })
    expect(res.status).toBe(200)
    expect(mockShipContent).toHaveBeenCalled()
    expect(mockMergePullRequest).not.toHaveBeenCalled()
    expect((await res.json()).ok).toBe(true)
  })
})

describe('POST bulk_approve — never ships an ungated row', () => {
  it('returns 409 when every requested id failed the ship gate', async () => {
    supabaseClient.__builder._rows.set('g1', baseJob({ id: 'g1', audit_json: { score: 100, blockers: [] } }))
    supabaseClient.__builder._rows.set('g2', baseJob({ id: 'g2', audit_json: { score: 88, shipReady: false, blockers: 0 } }))
    const res = await post({ action: 'bulk_approve', ids: ['g1', 'g2'] })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('Ship gate not cleared')
    expect(body.skipped).toEqual(['g1', 'g2'])
    expect(mockShipContent).not.toHaveBeenCalled()
  })

  it('skips only the failing id and ships the gated one, returning skipped in JSON', async () => {
    supabaseClient.__builder._rows.set('bad', baseJob({ id: 'bad', audit_json: { score: 100, blockers: [] } }))
    supabaseClient.__builder._rows.set(
      'good',
      baseJob({ id: 'good', audit_json: { score: 88, shipReady: true, blockers: 0 } }),
    )
    mockShipContent.mockResolvedValue({ status: 'pr_created', path: 'app/ca/study-permit/page.tsx', prUrl: null, prNumber: null, branch: null, mode: 'pr' })
    const res = await post({ action: 'bulk_approve', ids: ['bad', 'good'] })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.skipped).toEqual(['bad'])
    expect(body.succeeded).toBe(1)
    expect(body.failed).toBe(0)
    expect(mockShipContent).toHaveBeenCalledTimes(1)
    const results = body.results as Array<{ id: string; skipped?: boolean; ok: boolean }>
    expect(results.find((r) => r.id === 'bad')).toMatchObject({ ok: false, skipped: true, error: 'Ship gate not cleared' })
    expect(results.find((r) => r.id === 'good')?.ok).toBe(true)
  })
})

describe('PATCH save — must not wipe shipReady / contentSpec / contentLoop (P0-SHIP-2)', () => {
  it('merges bare auditContent overlay over prior gate fields', async () => {
    const priorAudit = {
      score: 96,
      shipReady: true,
      blockers: [],
      contentSpec: { version: 'cs-1', outline: [{ heading: 'Overview' }] },
      contentLoop: { action: 'fix_until_gates', status: 'cleared' },
      model: 'grok',
    }
    supabaseClient.__builder._rows.set(
      'j1',
      baseJob({ status: 'drafting', pr_number: null, audit_json: priorAudit }),
    )
    supabaseClient.__builder._updatedRow = baseJob({ status: 'drafting', audit_json: priorAudit })
    const res = await patch({ id: 'j1', action: 'save', content: mkContent() })
    expect(res.status).toBe(200)
    const patchWritten = supabaseClient.__builder._patch
    expect(patchWritten).toBeTruthy()
    expect(patchWritten.audit_json.shipReady).toBe(true)
    expect(patchWritten.audit_json.contentSpec).toEqual(priorAudit.contentSpec)
    expect(patchWritten.audit_json.contentLoop).toEqual(priorAudit.contentLoop)
  })
})
