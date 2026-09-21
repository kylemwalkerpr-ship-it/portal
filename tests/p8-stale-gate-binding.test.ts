/**
 * P8 — stale gate binding.
 *
 * A stored `audit_json` ship verdict (`shipReady` / `editorialReview`) is only
 * ever true of the exact body it was evaluated against. `strictManualPublication`
 * and `legacyCore` used to read that verdict off a row and then store/ship the
 * editor buffer, a deterministically repaired body, or a changed draft — the
 * verdict for body A authorized publication of body B.
 *
 * Covered here (both surfaces, real `gateVerdictBoundToBody` /
 * `mergeAuditJsonBoundToBody` — `jobShipGate` is NOT mocked):
 *   - the unchanged exact body may reuse its verdict (existing contract)
 *   - changed bytes cannot reuse shipReady/editorialReview → re-audit/409
 *   - a persisted verdict fingerprint for another body is a deterministic refusal
 *   - a body write never copies the carried verdict onto the new bytes
 *   - merge paths keep their existing freeze/manifest behaviour
 */
import { NextRequest } from 'next/server'
import {
  contentFingerprint,
  gateVerdictBodyFingerprint,
  persistedGateVerdictFingerprint,
} from '@/lib/seoFactory/currentGate'
import {
  gateVerdictBoundToBody,
  mergeAuditJsonBoundToBody,
} from '@/lib/seoFactory/jobShipGate'

const mockRequireAdminUser = jest.fn(async () => ({
  profileId: 'admin-1',
  profile: { clerk_user_id: 'admin-1' },
}))
jest.mock('@/lib/portalAuth', () => ({ requireAdminUser: () => mockRequireAdminUser() }))

const mockMergePullRequest = jest.fn(async () => ({ merged: true, sha: 'merge-sha', message: 'merged' }))
const mockShipContent = jest.fn(async () => ({ status: 'deployed' }))
jest.mock('@/lib/seoFactory/ship', () => ({
  shipContent: (...args: unknown[]) => mockShipContent(...args),
  mergePullRequest: (...args: unknown[]) => mockMergePullRequest(...args),
  revertContent: jest.fn(),
  parseRepoSlug: (value: string) => {
    const raw = String(value || '')
      .replace(/^https?:\/\/github\.com\//, '')
      .replace(/\.git$/, '')
      .replace(/\/$/, '')
    if (raw.includes('/')) {
      const [owner, repo] = raw.split('/')
      return { owner, repo }
    }
    return { owner: 'kylemwalkerpr-ship-it', repo: raw }
  },
}))

const ownershipPlan = {
  host: 'legal',
  repo: 'caseworks',
  filePath: 'app/us/student-visas/f1-document-checklist-2026/page.tsx',
  canonicalUrl: 'https://legal.yousafeconsultancy.com/us/student-visas/f1-document-checklist-2026/',
  indexable: true,
  blockers: [],
  matched: {
    id: 3,
    owner_url: 'https://legal.yousafeconsultancy.com/us/student-visas/f1-document-checklist-2026/',
    status: 'confirmed',
    action: 'expand',
    notes: '',
  },
  routingSource: 'registry_owner_url',
  action: 'expand',
}
jest.mock('@/lib/seoFactory/ownership', () => {
  const actual = jest.requireActual('@/lib/seoFactory/ownership')
  return { ...actual, resolveOwner: jest.fn(async () => ownershipPlan) }
})

jest.mock('@/lib/seoFactory/audit', () => ({
  auditContent: jest.fn(() => ({ score: 100, wordCount: 320, blockers: [], warnings: [] })),
}))
jest.mock('@/lib/seoFactory/deployMonitor', () => ({
  monitorContentJob: jest.fn(async () => ({ ok: true })),
}))
jest.mock('@/lib/seoFactory/specialistFeeds', () => ({
  enqueueAuthorityMultiplexerSignal: jest.fn(async () => undefined),
}))
jest.mock('@/lib/seoFactory/keywordContract', () => ({
  resolveKeywordContract: jest.fn(() => ({
    requiredShortKeywords: [],
    requiredLongTailKeywords: [],
    backfilled: false,
    shortKeywordTerms: [],
    longTailKeywordTerms: [],
  })),
}))
const mockApplyDeterministicRepairs = jest.fn((o: { content: string }) => ({ applied: [], content: o.content }))
jest.mock('@/lib/seoFactory/editorialScaffold', () => ({
  applyDeterministicRepairs: (o: { content: string }) => mockApplyDeterministicRepairs(o),
}))

// The strict lease boundary is exercised elsewhere; here it only has to agree
// that this attempt still owns the row.
jest.mock('@/lib/seoFactory/writingContractStore', () => ({
  assertContentStudioExecution: jest.fn(async () => undefined),
}))

const mockStrictState = {
  strict: true,
  executionJobId: 'job-stale-gate-1',
  contractId: 'contract-stale-gate-1',
  contractHash: 'hash-stale-gate-1',
  opportunityId: 'opp-stale-gate-1',
  executionOwner: 'stale-gate-owner-1',
  executionAttempt: 2,
  contractOwnership: null,
}
jest.mock('@/lib/seoFactory/contentStudioExecutionContext', () => {
  const actual = jest.requireActual('@/lib/seoFactory/contentStudioExecutionContext')
  return { ...actual, currentContentStudioExecution: jest.fn(() => mockStrictState) }
})

const JOB_ID = 'job-stale-gate-1'
const CANONICAL = ownershipPlan.canonicalUrl

/** Two substantial, clearly different bodies (the thin-overwrite guard must not
 *  be what refuses the changed-body cases). */
function bodyFor(label: string, sentences = 60): string {
  const paragraph = Array.from(
    { length: sentences },
    (_, i) =>
      `Point ${i + 1}: ${label} applicants must confirm eligibility and documentary requirements before filing, because the ${label} rule changes by office and by season.`,
  ).join(' ')
  return `# ${label} document checklist\n\n${paragraph}\n`
}
const BODY_A = bodyFor('Alpha')
const BODY_B = bodyFor('Beta')

type JobShape = Record<string, unknown>

function baseJob(overrides: JobShape = {}): Record<string, any> {
  const content = (overrides.content as string) ?? BODY_A
  return {
    id: JOB_ID,
    status: 'drafting',
    pr_number: null,
    target_repo: 'caseworks',
    title: 'F-1 document checklist stale gate probe',
    topic: 'f-1 document checklist',
    primary_keyword: 'f-1 document checklist',
    content_type: 'legal_guide',
    region: 'US',
    canonical_url: CANONICAL,
    content_path: ownershipPlan.filePath,
    content,
    word_count: 1200,
    ship_mode: 'autodeploy',
    audit_json: { score: 100, shipReady: true, blockers: 0 },
    required_short_keywords: [],
    required_long_tail_keywords: [],
    short_keyword_terms: [],
    long_tail_keyword_terms: [],
    contract_id: mockStrictState.contractId,
    contract_hash: mockStrictState.contractHash,
    opportunity_id: mockStrictState.opportunityId,
    execution_owner: mockStrictState.executionOwner,
    execution_attempt: mockStrictState.executionAttempt,
    execution_lease_expires_at: new Date(Date.now() + 900_000).toISOString(),
    ...overrides,
  }
}

type FakeDb = {
  client: any
  state: { row: Record<string, any>; updates: Array<Record<string, unknown>> }
}

function makeDb(row: Record<string, any>): FakeDb {
  const state = { row: { ...row }, updates: [] as Array<Record<string, unknown>> }
  const builder: Record<string, any> = {
    _mode: 'read' as 'read' | 'update',
    _patch: null as Record<string, unknown> | null,
    _conds: [] as Array<{ op: 'eq' | 'gt'; key: string; value: unknown }>,
    select: () => builder,
    update: (patch: Record<string, unknown>) => {
      builder._mode = 'update'
      builder._patch = patch
      return builder
    },
    eq: (key: string, value: unknown) => {
      builder._conds.push({ op: 'eq', key, value })
      return builder
    },
    gt: (key: string, value: unknown) => {
      builder._conds.push({ op: 'gt', key, value })
      return builder
    },
    in: () => builder,
    order: () => builder,
    limit: () => builder,
    _matches: () =>
      builder._conds.every((c: { op: string; key: string; value: unknown }) =>
        c.op === 'eq'
          ? state.row[c.key] === c.value
          : String(state.row[c.key] || '') > String(c.value || ''),
      ),
    _exec: () => {
      const matched = builder._matches()
      if (builder._mode === 'update' && matched) {
        state.updates.push({ ...(builder._patch || {}) })
        Object.assign(state.row, builder._patch || {})
      }
      return { data: matched ? { ...state.row } : null, error: null }
    },
    single: async () => {
      const result = builder._exec()
      return result.data ? result : { data: null, error: { message: 'no rows' } }
    },
    maybeSingle: async () => builder._exec(),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(builder._exec()).then(resolve),
  }
  const client = {
    from: (table: string) => {
      if (table !== 'content_jobs') throw new Error(`unexpected table ${table}`)
      builder._mode = 'read'
      builder._patch = null
      builder._conds = []
      return builder
    },
    rpc: jest.fn(async () => ({ data: true, error: null })),
  }
  return { client, state }
}

let mockDbRef: FakeDb
jest.mock('@supabase/supabase-js', () => ({ createClient: () => mockDbRef.client }))

import { PATCH as legacyJobsPatch } from '@/app/api/content-studio/jobs/legacyCore'
import { strictManualPublicationPATCH } from '@/app/api/content-studio/jobs/strictManualPublication'

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/content-studio/jobs', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** Live existence probe for the P0 direct-merge freeze (never real network). */
const liveFetchMock = jest.fn(async (url: string) => ({ ok: true, status: 200, url: String(url) }))
const originalFetch = global.fetch

function resetFreezeCache(): void {
  const mod = require('@/lib/seoFactory/broadCreateFreeze') as { resetBroadCreateLiveCache?: () => void }
  mod.resetBroadCreateLiveCache?.()
}

beforeEach(() => {
  jest.clearAllMocks()
  liveFetchMock.mockReset()
  liveFetchMock.mockImplementation(async (url: string) => ({ ok: true, status: 200, url: String(url) }))
  ;(global as unknown as { fetch: unknown }).fetch = liveFetchMock
  resetFreezeCache()
  mockShipContent.mockResolvedValue({ status: 'deployed' })
  mockMergePullRequest.mockResolvedValue({ merged: true, sha: 'merge-sha', message: 'merged' })
  mockApplyDeterministicRepairs.mockImplementation((o: { content: string }) => ({ applied: [], content: o.content }))
})

afterAll(() => {
  ;(global as unknown as { fetch: unknown }).fetch = originalFetch
})

function storedVerdictFingerprint(update: Record<string, unknown> | undefined): string | null {
  return persistedGateVerdictFingerprint(update?.audit_json)
}

describe('gateVerdictBoundToBody — the binding contract', () => {
  it('binds an unchanged stored body to its verdict (existing contract)', () => {
    const job = { content: BODY_A, audit_json: { shipReady: true, blockers: 0 } }
    const binding = gateVerdictBoundToBody(job, BODY_A)
    expect(binding.ok).toBe(true)
    expect(binding.reason).toBe('unchanged_stored_body')
  })

  it('never binds different bytes to that verdict', () => {
    const job = { content: BODY_A, audit_json: { shipReady: true, blockers: 0 } }
    const binding = gateVerdictBoundToBody(job, BODY_B)
    expect(binding.ok).toBe(false)
    expect(binding.code).toBe('ship_gate_stale_body')
  })

  it('uses the persisted verdict fingerprint as the durable binding', () => {
    const audit_json = {
      shipReady: true,
      blockers: 0,
      contentFingerprint: gateVerdictBodyFingerprint(BODY_A),
    }
    expect(gateVerdictBoundToBody({ content: 'a different stored body', audit_json }, BODY_A).ok).toBe(true)
    expect(gateVerdictBoundToBody({ content: BODY_A, audit_json }, BODY_B).ok).toBe(false)
  })

  it('refuses a carried editorial verdict that cleared a different body', () => {
    const audit_json = {
      shipReady: true,
      blockers: 0,
      editorialReview: {
        status: 'cleared',
        supervisor: 'harper-editorial-v1',
        fingerprint: contentFingerprint(BODY_A),
        grammar: 100,
        seo: 100,
        harperSeo: 100,
        voice: 90,
        flesch: 70,
        fleschTarget: 60,
        reason: 'cleared',
      },
    }
    expect(gateVerdictBoundToBody({ content: BODY_A, audit_json }, BODY_A).ok).toBe(true)
    expect(gateVerdictBoundToBody({ content: BODY_A, audit_json }, BODY_B).ok).toBe(false)
  })

  it('merges a bare audit overlay without copying a verdict onto new bytes', () => {
    const prior = {
      shipReady: true,
      blockers: [],
      contentSpec: { version: 'cs-1' },
      editorialReview: { status: 'cleared' },
      contentFingerprint: gateVerdictBodyFingerprint(BODY_A),
    }
    const same = mergeAuditJsonBoundToBody(prior, { score: 90 }, { previousContent: BODY_A, content: BODY_A })
    expect(same.shipReady).toBe(true)
    expect(same.editorialReview).toEqual(prior.editorialReview)
    expect(same.contentSpec).toEqual(prior.contentSpec)

    const changed = mergeAuditJsonBoundToBody(prior, { score: 90 }, { previousContent: BODY_A, content: BODY_B })
    expect(changed).not.toHaveProperty('shipReady')
    expect(changed).not.toHaveProperty('editorialReview')
    expect(changed).not.toHaveProperty('contentFingerprint')
    expect(changed.contentSpec).toEqual(prior.contentSpec)
  })

  it('never drops a verdict the overlay itself just set', () => {
    const prior = { shipReady: true, blockers: [], contentFingerprint: gateVerdictBodyFingerprint(BODY_A) }
    const merged = mergeAuditJsonBoundToBody(
      prior,
      { shipReady: false, contentFingerprint: gateVerdictBodyFingerprint(BODY_B) },
      { previousContent: BODY_A, content: BODY_B },
    )
    expect(merged.shipReady).toBe(false)
    expect(merged.contentFingerprint).toBe(gateVerdictBodyFingerprint(BODY_B))
  })
})

describe('strictManualPublication — contracted manual publication', () => {
  it('ships the unchanged stored body under its current verdict', async () => {
    mockDbRef = makeDb(baseJob())
    const res = await strictManualPublicationPATCH(request({ id: JOB_ID, action: 'approve' }))
    expect(res.status).toBe(200)
    expect(mockShipContent).toHaveBeenCalledTimes(1)
    expect((mockShipContent.mock.calls[0][0] as { content: string }).content).toBe(BODY_A)
  })

  it('refuses to ship changed editor bytes under the stored verdict', async () => {
    mockDbRef = makeDb(baseJob())
    const res = await strictManualPublicationPATCH(request({ id: JOB_ID, action: 'approve', content: BODY_B }))
    expect(res.status).toBe(409)
    const body = await res.clone().json()
    expect(body.code).toBe('ship_gate_stale_body')
    expect(body.error).toMatch(/different body/i)
    expect(mockShipContent).not.toHaveBeenCalled()
    expect(mockMergePullRequest).not.toHaveBeenCalled()
    // Nothing was stored for the body no verdict covers.
    expect(mockDbRef.state.updates).toEqual([])
    expect(mockDbRef.state.row.content).toBe(BODY_A)
  })

  it('refuses a verdict fingerprinted for another body, deterministically', async () => {
    const staleAudit = {
      score: 100,
      shipReady: true,
      blockers: 0,
      contentFingerprint: gateVerdictBodyFingerprint(BODY_B),
    }
    const outcomes: Array<{ status: number; code: string }> = []
    for (let i = 0; i < 3; i += 1) {
      mockDbRef = makeDb(baseJob({ audit_json: staleAudit }))
      const res = await strictManualPublicationPATCH(request({ id: JOB_ID, action: 'approve' }))
      const body = await res.clone().json()
      outcomes.push({ status: res.status, code: body.code })
    }
    expect(outcomes).toEqual([
      { status: 409, code: 'ship_gate_stale_body' },
      { status: 409, code: 'ship_gate_stale_body' },
      { status: 409, code: 'ship_gate_stale_body' },
    ])
    expect(mockShipContent).not.toHaveBeenCalled()
  })

  it('reuses a matching persisted verdict fingerprint for an identical store+ship', async () => {
    mockDbRef = makeDb(baseJob({
      audit_json: {
        score: 100,
        shipReady: true,
        blockers: 0,
        contentFingerprint: gateVerdictBodyFingerprint(BODY_A),
      },
    }))
    const res = await strictManualPublicationPATCH(request({ id: JOB_ID, action: 'reship' }))
    expect(res.status).toBe(200)
    expect(mockShipContent).toHaveBeenCalledTimes(1)
  })

  it('merges an existing PR only while the verdict still covers the persisted body', async () => {
    mockDbRef = makeDb(baseJob({ status: 'pr_created', pr_number: 42 }))
    const ok = await strictManualPublicationPATCH(request({ id: JOB_ID, action: 'merge_pr' }))
    expect(ok.status).toBe(200)
    expect(mockMergePullRequest).toHaveBeenCalledTimes(1)

    jest.clearAllMocks()
    resetFreezeCache()
    mockDbRef = makeDb(baseJob({
      status: 'pr_created',
      pr_number: 42,
      audit_json: {
        score: 100,
        shipReady: true,
        blockers: 0,
        contentFingerprint: gateVerdictBodyFingerprint(BODY_B),
      },
    }))
    const refused = await strictManualPublicationPATCH(request({ id: JOB_ID, action: 'merge_pr' }))
    expect(refused.status).toBe(409)
    expect((await refused.clone().json()).code).toBe('ship_gate_stale_body')
    expect(mockMergePullRequest).not.toHaveBeenCalled()
  })

  it('refuses a carried editorial verdict that does not cover the shipped bytes', async () => {
    const editorialReview = {
      status: 'cleared',
      supervisor: 'harper-editorial-v1',
      fingerprint: contentFingerprint(BODY_A),
      grammar: 100,
      grammarErrors: 0,
      grammarSuggestions: 0,
      seo: 100,
      harperSeo: 100,
      voice: 90,
      flesch: 70,
      fleschTarget: 60,
      reason: 'cleared',
    }
    // The shipReady stamp names BODY_B while Harper only cleared BODY_A: the
    // carried editorial verdict must not be extended to the other body.
    mockDbRef = makeDb(baseJob({
      audit_json: {
        score: 100,
        shipReady: true,
        blockers: 0,
        editorialReview,
        contentFingerprint: gateVerdictBodyFingerprint(BODY_B),
      },
    }))
    const res = await strictManualPublicationPATCH(request({ id: JOB_ID, action: 'approve', content: BODY_B }))
    expect(res.status).toBe(409)
    expect((await res.clone().json()).code).toBe('ship_gate_stale_body')
    expect(mockShipContent).not.toHaveBeenCalled()

    // Same row, shipping the body Harper actually cleared → the gate holds.
    mockDbRef = makeDb(baseJob({
      audit_json: {
        score: 100,
        shipReady: true,
        blockers: 0,
        editorialReview,
        contentFingerprint: gateVerdictBodyFingerprint(BODY_A),
      },
    }))
    const ok = await strictManualPublicationPATCH(request({ id: JOB_ID, action: 'approve' }))
    expect(ok.status).toBe(200)
    expect(mockShipContent).toHaveBeenCalledTimes(1)
  })
})

describe('legacyCore — legacy/uncontracted manual publication', () => {
  it('ships when the edited body is the exact body the verdict evaluated', async () => {
    mockDbRef = makeDb(baseJob())
    const res = await legacyJobsPatch(request({ id: JOB_ID, action: 'approve', content: BODY_A }))
    expect(res.status).toBe(200)
    expect(mockShipContent).toHaveBeenCalledTimes(1)
    // The pre-ship body write keeps the verdict that covers these bytes.
    const bodyWrite = mockDbRef.state.updates.find((u) => typeof u.content === 'string')
    expect(bodyWrite?.audit_json).toMatchObject({ shipReady: true })
  })

  it('refuses changed editor bytes and never lets the old verdict reach the ship', async () => {
    mockDbRef = makeDb(baseJob())
    const res = await legacyJobsPatch(request({ id: JOB_ID, action: 'approve', content: BODY_B }))
    expect(res.status).toBe(409)
    const body = await res.clone().json()
    expect(body.code).toBe('ship_gate_stale_body')
    expect(mockShipContent).not.toHaveBeenCalled()
    // The stored row is left honest: the carried verdict is invalidated, so the
    // new bytes can never inherit it from a later read.
    const auditWrite = mockDbRef.state.updates
      .map((u) => u.audit_json as Record<string, unknown> | undefined)
      .filter(Boolean)
      .pop()
    expect(auditWrite).toBeDefined()
    expect(auditWrite).not.toHaveProperty('shipReady')
    expect(auditWrite).not.toHaveProperty('editorialReview')
    expect(storedVerdictFingerprint({ audit_json: auditWrite })).toBeNull()
  })

  it('refuses deterministically when the row verdict is fingerprinted for another body', async () => {
    const staleAudit = {
      score: 100,
      shipReady: true,
      blockers: 0,
      contentFingerprint: gateVerdictBodyFingerprint(BODY_B),
    }
    const codes: Array<number | string> = []
    for (let i = 0; i < 3; i += 1) {
      jest.clearAllMocks()
      mockShipContent.mockResolvedValue({ status: 'deployed' })
      mockDbRef = makeDb(baseJob({ audit_json: staleAudit }))
      const res = await legacyJobsPatch(request({ id: JOB_ID, action: 'approve' }))
      codes.push((await res.clone().json()).code ?? res.status)
    }
    expect(codes).toEqual(['ship_gate_stale_body', 'ship_gate_stale_body', 'ship_gate_stale_body'])
    expect(mockShipContent).not.toHaveBeenCalled()
  })

  it('refuses a body the deterministic repair changed after the verdict', async () => {
    mockDbRef = makeDb(baseJob())
    mockApplyDeterministicRepairs.mockImplementation((o: { content: string }) => ({
      applied: ['disclaimer'],
      content: `${o.content}\n\n<!-- repaired disclaimer -->\n`,
    }))
    const res = await legacyJobsPatch(request({ id: JOB_ID, action: 'approve' }))
    expect(res.status).toBe(409)
    expect((await res.clone().json()).code).toBe('ship_gate_stale_body')
    expect(mockShipContent).not.toHaveBeenCalled()
  })

  it('keeps a cleared verdict when Save writes the identical body, and drops it when the body changes', async () => {
    mockDbRef = makeDb(baseJob())
    const same = await legacyJobsPatch(request({ id: JOB_ID, action: 'save', content: BODY_A }))
    expect(same.status).toBe(200)
    const sameWrite = mockDbRef.state.updates.map((u) => u.audit_json).filter(Boolean).pop() as Record<string, unknown>
    expect(sameWrite.shipReady).toBe(true)

    jest.clearAllMocks()
    mockDbRef = makeDb(baseJob())
    const changed = await legacyJobsPatch(request({ id: JOB_ID, action: 'save', content: BODY_B }))
    expect(changed.status).toBe(200)
    const changedWrite = mockDbRef.state.updates.map((u) => u.audit_json).filter(Boolean).pop() as Record<string, unknown>
    expect(changedWrite).not.toHaveProperty('shipReady')
    // The stored body now matches the written body, but no verdict covers it.
    expect(mockDbRef.state.row.content).toBe(BODY_B)
    expect(storedVerdictFingerprint({ audit_json: changedWrite })).toBeNull()
  })

  it('merges an existing PR with a verdict that covers the persisted body', async () => {
    mockDbRef = makeDb(baseJob({ status: 'pr_created', pr_number: 42 }))
    const res = await legacyJobsPatch(request({ id: JOB_ID, action: 'merge_pr' }))
    expect(res.status).toBe(200)
    expect(mockMergePullRequest).toHaveBeenCalledTimes(1)
  })

  it('refuses a merge whose verdict is bound to a different body', async () => {
    mockDbRef = makeDb(baseJob({
      status: 'pr_created',
      pr_number: 42,
      audit_json: {
        score: 100,
        shipReady: true,
        blockers: 0,
        contentFingerprint: gateVerdictBodyFingerprint(BODY_B),
      },
    }))
    const res = await legacyJobsPatch(request({ id: JOB_ID, action: 'merge_pr' }))
    expect(res.status).toBe(409)
    expect((await res.clone().json()).code).toBe('ship_gate_stale_body')
    expect(mockMergePullRequest).not.toHaveBeenCalled()
    expect(liveFetchMock).not.toHaveBeenCalled()
  })
})
