jest.mock('@/lib/seoEngine/gate', () => ({ recordJobQualityGate: jest.fn(async () => undefined) }))

jest.mock('@supabase/supabase-js', () => {
  type Row = Record<string, any>
  const rows: Row[] = [
    {
      id: 'job-1', content: 'newer worker content '.repeat(80), word_count: 900,
      contract_id: 'contract-1', contract_hash: 'hash-1', opportunity_id: 'opp-1',
      execution_owner: 'owner-b', execution_attempt: 2,
      execution_lease_expires_at: '2099-01-01T00:00:00.000Z', status: 'drafting',
      primary_keyword: 'f-1 visa', region: 'US', canonical_url: 'https://usa.example/f-1/',
    },
    {
      id: 'sibling-1', content: 'sibling', word_count: 1,
      contract_id: null, contract_hash: null, opportunity_id: 'other',
      execution_owner: null, execution_attempt: 0, execution_lease_expires_at: null,
      status: 'drafting', primary_keyword: 'f-1 visa', region: 'US', canonical_url: 'https://usa.example/f-1/',
    },
  ]
  const initial = () => rows.map((row) => ({ ...row }))
  const reset = () => {
    const fresh = initialSeed.map((row) => ({ ...row }))
    rows.splice(0, rows.length, ...fresh)
  }
  const initialSeed = rows.map((row) => ({ ...row }))

  const matches = (row: Row, filters: Array<[string, string, any]>) => filters.every(([op, field, value]) => {
    if (op === 'eq') return row[field] === value
    if (op === 'neq') return row[field] !== value
    if (op === 'gt') return String(row[field] || '') > String(value || '')
    if (op === 'in') return (value as any[]).includes(row[field])
    if (op === 'is') return row[field] == null
    return true
  })

  const makeBuilder = (table: string) => {
    let action: 'select' | 'update' | 'insert' = 'select'
    let patch: Row | null = null
    let insertRow: Row | null = null
    const filters: Array<[string, string, any]> = []
    let wantsSingle = false
    const execute = async () => {
      if (table !== 'content_jobs') return { data: wantsSingle ? null : [], error: null }
      const found = rows.filter((row) => matches(row, filters))
      if (action === 'update') {
        found.forEach((row) => Object.assign(row, patch || {}))
        return { data: wantsSingle ? (found[0] || null) : found, error: null }
      }
      if (action === 'insert') {
        const row = { id: `insert-${rows.length + 1}`, ...(insertRow || {}) }
        rows.push(row)
        return { data: wantsSingle ? row : [row], error: null }
      }
      return { data: wantsSingle ? (found[0] || null) : found, error: null }
    }
    const b: any = {
      select: () => { if (action !== 'update' && action !== 'insert') action = 'select'; return b },
      update: (value: Row) => { action = 'update'; patch = value; return b },
      insert: (value: Row) => { action = 'insert'; insertRow = value; return b },
      eq: (field: string, value: any) => { filters.push(['eq', field, value]); return b },
      neq: (field: string, value: any) => { filters.push(['neq', field, value]); return b },
      gt: (field: string, value: any) => { filters.push(['gt', field, value]); return b },
      in: (field: string, value: any[]) => { filters.push(['in', field, value]); return b },
      is: (field: string, value: any) => { filters.push(['is', field, value]); return b },
      order: () => b,
      limit: () => b,
      maybeSingle: () => { wantsSingle = true; return execute() },
      single: () => { wantsSingle = true; return execute() },
      then: (resolve: any, reject: any) => execute().then(resolve, reject),
    }
    return b
  }

  return {
    createClient: jest.fn(() => ({ from: (table: string) => makeBuilder(table) })),
    __rows: rows,
    __reset: reset,
  }
})

import { persistPipelineJob, type PipelineJobPersistInput } from '@/lib/seoFactory/persistContentJob'
import { createContentStudioExecutionState, runInContentStudioExecution } from '@/lib/seoFactory/contentStudioExecutionContext'
import type { SeoFactoryAudit } from '@/lib/seoFactory/audit'
import type { OwnerPlan } from '@/lib/seoFactory/ownership'

const store = jest.requireMock('@supabase/supabase-js') as { __rows: Array<Record<string, any>>; __reset: () => void }

const plan: OwnerPlan = {
  matched: null, matchScore: 0, host: 'usa', repo: 'yousafe-consultancy',
  filePath: 'usa/content/from/f-1.md', canonicalUrl: 'https://usa.example/f-1/', indexable: true,
  action: 'publish', intentClass: 'procedural', contentType: 'regional_from', warnings: [], blockers: [],
  ymy: false, routingSource: 'standing_rules',
}
const audit: SeoFactoryAudit = {
  score: 85, grade: 'B', blockers: [], warnings: [], passes: [], indexableRecommended: true,
  llmsRecommended: true, wordCount: 850,
}
const input: PipelineJobPersistInput = {
  existingJobId: 'job-1', userId: 'admin', title: 'F-1', topic: 'F-1 visa', primaryKeyword: 'f-1 visa',
  region: 'US', contentType: 'regional_from', tone: 'educational', plan,
  content: 'stale worker content '.repeat(80), shipResult: null, shipError: null, shipMode: 'pr',
  provider: 'grok', model: 'grok', attempts: 1, minAudit: 65, audit,
  gscBrief: { source: 'none', mode: 'none', primaryKeywords: [] },
  requiredShortKeywords: [], requiredLongTailKeywords: [], shortKeywordTerms: [], longTailKeywordTerms: [],
  competingUrls: [], eventLog: null, rescueStats: null, cluster: null,
}

describe('strict pipeline persistence fencing', () => {
  beforeEach(() => store.__reset())

  it('does not let stale attempt A overwrite attempt B or close siblings', async () => {
    const state = createContentStudioExecutionState(true, {
      contractId: 'contract-1', contractHash: 'hash-1', opportunityId: 'opp-1',
      executionJobId: 'job-1', executionOwner: 'owner-a', executionAttempt: 1,
      executionLeaseExpiresAt: '2099-01-01T00:00:00.000Z',
    })
    const beforeJob = { ...store.__rows.find((row) => row.id === 'job-1') }
    const beforeSibling = { ...store.__rows.find((row) => row.id === 'sibling-1') }

    await expect(runInContentStudioExecution(state, () => persistPipelineJob(input)))
      .rejects.toThrow(/execution|owner|lease|stale|fenc/i)

    expect(store.__rows.find((row) => row.id === 'job-1')).toEqual(beforeJob)
    expect(store.__rows.find((row) => row.id === 'sibling-1')).toEqual(beforeSibling)
  })
})
