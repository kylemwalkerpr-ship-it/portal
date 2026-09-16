/**
 * Task 5 (P2-C) correction — provider-parity mutations run exactly ONCE.
 *
 * `runWithProviderParityCompat` may wrap pure SELECT/read builders only. A
 * PostgREST mutation's RETURNING/select list belongs to the same single
 * statement, so replaying an UPDATE/INSERT after a provider-parity
 * missing-column/schema-cache error would execute the mutation a second time.
 * These regressions simulate the intentionally-unapplied provider-parity
 * migration — every projection naming `actual_provider` / `provider_error_class`
 * fails with a missing-column error — and prove the jobs PATCH mutations
 * request the pre-stripped projection on their first and only call, while pure
 * reads keep their read-only fallback.
 */
type Attempt = { action: 'read' | 'update' | 'insert'; projection: string; failed: boolean }
const mockAttempts: Attempt[] = []
const mockRows = new Map<string, Record<string, unknown>>()
const PARITY_RE = /(?:actual_provider|provider_error_class)/
const PARITY_ERROR = { message: 'column "actual_provider" of relation "content_jobs" does not exist' }

const mockBuilder = () => {
  const state: {
    action: 'read' | 'update' | 'insert'
    row: Record<string, unknown> | null
    key: string
    projection: string
  } = { action: 'read', row: null, key: '', projection: '' }

  const finish = () => {
    const parityFail = PARITY_RE.test(state.projection)
    mockAttempts.push({ action: state.action, projection: state.projection, failed: parityFail })
    if (parityFail) return { data: null, error: PARITY_ERROR }
    const prior = mockRows.get(state.key)
    if (state.action === 'update') {
      if (!prior) return { data: null, error: { message: 'row missing' } }
      const updated = { ...prior, ...(state.row || {}) }
      mockRows.set(state.key, updated)
      return { data: updated, error: null }
    }
    if (state.action === 'insert') {
      const inserted = { id: `inserted-${mockRows.size + 1}`, ...(state.row || {}) }
      mockRows.set(String(inserted.id), inserted)
      return { data: inserted, error: null }
    }
    return prior ? { data: prior, error: null } : { data: null, error: { message: 'not found' } }
  }

  const chain: Record<string, any> = {
    select: (columns: string) => { state.projection = String(columns); return chain },
    update: (row: Record<string, unknown>) => { state.action = 'update'; state.row = row; return chain },
    insert: (row: Record<string, unknown>) => { state.action = 'insert'; state.row = row; return chain },
    delete: () => { state.action = 'update'; state.row = {}; return chain },
    eq: (column: string, value: unknown) => {
      if (column === 'id') state.key = String(value)
      return chain
    },
    in: () => chain,
    order: () => chain,
    limit: () => chain,
    range: () => chain,
    single: () => Promise.resolve(finish()),
    maybeSingle: () => Promise.resolve(finish()),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(finish()).then(resolve, reject),
  }
  return chain
}

const mockRequireAdminUser = jest.fn(async () => ({
  profile: { clerk_user_id: 'admin' },
  profileId: 'p_admin',
  role: 'admin',
}))

jest.mock('@/lib/portalAuth', () => ({ requireAdminUser: () => mockRequireAdminUser() }))
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ from: () => mockBuilder() })),
}))

import { NextRequest } from 'next/server'
import { PATCH } from '@/app/api/content-studio/jobs/legacyCore'
import {
  JOB_MUTATE_COLUMNS,
  JOB_MUTATE_MUTATION_COLUMNS,
  JOB_OPEN_COLUMNS,
  JOB_OPEN_MUTATION_COLUMNS,
  JOB_PROVIDER_PARITY_COLUMNS,
  stripProviderParityColumns,
} from '@/lib/seoFactory/jobColumns'

function patch(body: Record<string, unknown>) {
  return PATCH(new NextRequest('http://localhost/api/content-studio/jobs', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }))
}

beforeEach(() => {
  mockAttempts.length = 0
  mockRows.clear()
  jest.clearAllMocks()
})

describe('mutation projections are pre-migration safe (Task 5 P2-C correction)', () => {
  it('PATCH abandon executes the UPDATE exactly once when the provider-parity columns do not exist', async () => {
    mockRows.set('job-1', { id: 'job-1', status: 'drafting', title: 'Draft', content: 'body' })

    const res = await patch({ id: 'job-1', action: 'abandon' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.job).toMatchObject({ id: 'job-1', status: 'closed' })
    expect(body.job).not.toHaveProperty('actual_provider')
    expect(body.job).not.toHaveProperty('provider_error_class')

    const updates = mockAttempts.filter((attempt) => attempt.action === 'update')
    expect(updates).toHaveLength(1)
    expect(updates[0].failed).toBe(false)
    expect(updates[0].projection).not.toMatch(PARITY_RE)
    expect(updates[0].projection).toContain('content')
    expect(mockRows.get('job-1')?.status).toBe('closed')

    // The pre-migration condition is real in this mock: the pure job read
    // requested the provider-parity columns first, failed, and recovered via
    // the READ-ONLY fallback — never by replaying the mutation.
    const fullProjectionReads = mockAttempts.filter((attempt) => (
      attempt.action === 'read' && PARITY_RE.test(attempt.projection)
    ))
    expect(fullProjectionReads.length).toBeGreaterThan(0)
    expect(fullProjectionReads.some((attempt) => attempt.failed)).toBe(true)
    expect(mockAttempts.some((attempt) => (
      attempt.action === 'read' && !attempt.failed && !PARITY_RE.test(attempt.projection)
    ))).toBe(true)
  })

  it('PATCH duplicate executes the INSERT exactly once when the provider-parity columns do not exist', async () => {
    mockRows.set('job-1', {
      id: 'job-1',
      status: 'drafting',
      title: 'Draft',
      topic: 'topic',
      content: 'body',
      content_type: 'blog_post',
      region: 'US',
      ship_mode: 'pr',
    })

    const res = await patch({ id: 'job-1', action: 'duplicate' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.duplicatedFrom).toBe('job-1')

    const inserts = mockAttempts.filter((attempt) => attempt.action === 'insert')
    expect(inserts).toHaveLength(1)
    expect(inserts[0].failed).toBe(false)
    expect(inserts[0].projection).not.toMatch(PARITY_RE)
    expect(body.job).not.toHaveProperty('actual_provider')
    expect(body.job).not.toHaveProperty('provider_error_class')
  })
})

describe('mutation projection contract', () => {
  it('strips ONLY the two provider-parity columns and preserves every other field', () => {
    expect([...JOB_PROVIDER_PARITY_COLUMNS]).toEqual(['actual_provider', 'provider_error_class'])
    expect(JOB_OPEN_MUTATION_COLUMNS).toBe(stripProviderParityColumns(JOB_OPEN_COLUMNS))
    expect(JOB_MUTATE_MUTATION_COLUMNS).toBe(stripProviderParityColumns(JOB_MUTATE_COLUMNS))
    for (const projection of [JOB_OPEN_MUTATION_COLUMNS, JOB_MUTATE_MUTATION_COLUMNS]) {
      expect(projection).not.toMatch(PARITY_RE)
    }
    const mutateColumns = JOB_MUTATE_MUTATION_COLUMNS.split(',')
    for (const column of ['id', 'ai_provider', 'requested_model', 'actual_model', 'content', 'audit_json', 'updated_at']) {
      expect(mutateColumns).toContain(column)
    }
    // Pure reads still request the new columns first so post-migration GETs
    // include them without any strip.
    expect(JOB_OPEN_COLUMNS).toContain('actual_provider')
    expect(JOB_OPEN_COLUMNS).toContain('provider_error_class')
  })
})
