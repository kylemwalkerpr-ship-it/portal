/**
 * Single persist door (Slice E1) — JSON + stream must persist content_jobs
 * through the same helper so status / ok / ship_mode cannot drift.
 *
 * `mapPipelineJobRow` is the pure status/ship_mode/competing_urls mapper —
 * unit-tested directly. `persistPipelineJob` is exercised against a mocked
 * Supabase chain to prove update-vs-insert and legacy-fallback behavior.
 */
jest.mock('@supabase/supabase-js', () => {
  type Op = { op: string; table: string; row?: unknown; id?: string }
  const ops: Op[] = []
  const makeBuilder = (table: string, onResolve: () => object) => {
    const builder: Record<string, any> = {
      then: (resolve: (v: object) => void) => Promise.resolve(resolve(onResolve())),
    }
    for (const m of [
      'update', 'insert', 'select', 'eq', 'in', 'neq', 'single', 'order', 'limit',
    ]) {
      builder[m] = (...args: unknown[]) => {
        if (m === 'update' || m === 'insert') ops.push({ op: m, table, row: args[0] })
        if (m === 'eq') ops.push({ op: m, table, id: String(args[1]) })
        return builder
      }
    }
    return builder
  }
  return {
    __getOps: () => ops,
    __resetOps: () => { ops.length = 0 },
    createClient: jest.fn(() => ({
      from: (table: string) =>
        makeBuilder(table, () =>
          table === 'content_jobs'
            ? { data: { id: 'inserted-123' }, error: null }
            : { data: [], error: null },
        ),
    })),
  }
})

import {
  mapCompetingUrls,
  mapPipelineJobRow,
  mapPipelineShipMode,
  mapPipelineJobStatus,
  persistPipelineJob,
  type PipelineJobPersistInput,
} from '@/lib/seoFactory/persistContentJob'
import type { SeoFactoryAudit } from '@/lib/seoFactory/audit'
import type { OwnerPlan } from '@/lib/seoFactory/ownership'
import type { ShipResult } from '@/lib/seoFactory/ship'

const mockModule = jest.requireMock('@supabase/supabase-js') as {
  __getOps: () => Array<{ op: string; table: string; row?: unknown; id?: string }>
  __resetOps: () => void
}

beforeEach(() => {
  mockModule.__resetOps()
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
})

const LONG = 'Draft body long enough to count as content for a withheld job. '.repeat(4)
const SHORT = 'tiny'

const audit = (over: Partial<SeoFactoryAudit> = {}): SeoFactoryAudit => ({
  score: 82,
  grade: 'B',
  blockers: [],
  warnings: [],
  passes: [],
  indexableRecommended: true,
  llmsRecommended: true,
  wordCount: 220,
  ...over,
})

const plan: OwnerPlan = {
  matched: null,
  matchScore: 0,
  host: 'usa',
  repo: 'yousafe-consultancy',
  filePath: 'usa/content/from/f-1-visa.md',
  canonicalUrl: 'https://yousafeconsultancy.com/from/f-1-visa/',
  indexable: true,
  action: 'publish',
  intentClass: 'procedural',
  contentType: 'regional_from',
  warnings: [],
  blockers: [],
  ymy: false,
  routingSource: 'standing_rules',
}

const merged: ShipResult = {
  mode: 'merge',
  repo: plan.repo,
  owner: 'yousafe',
  path: plan.filePath,
  mergeCommitSha: 'abc123',
  canonicalUrl: plan.canonicalUrl,
  status: 'merged',
}

const baseInput = (over: Partial<PipelineJobPersistInput> = {}): PipelineJobPersistInput => ({
  existingJobId: null,
  userId: '66k-admin',
  sourceJobId: 'src-9',
  regenerationReason: null,
  regenerationMode: null,
  intelligenceLineage: { source: 'radar' },
  title: 'F-1 Visa Guide',
  topic: 'f-1 visa',
  primaryKeyword: 'f-1 student visa',
  region: 'US',
  contentType: 'regional_from',
  tone: 'educational',
  plan,
  content: LONG,
  shipResult: merged,
  shipError: null,
  gateHoldReason: null,
  shipMode: 'merge',
  provider: 'nvidia-deepseek',
  model: 'deepseek-ai/deepseek-v4-flash-0731',
  attempts: 2,
  minAudit: 65,
  audit: audit(),
  contentSpec: null,
  gscBrief: { source: 'snapshot', mode: 'snapshot', primaryKeywords: ['f-1 visa', 'f1 usa'] },
  opportunityAction: 'create',
  requiredShortKeywords: ['f-1 visa'],
  requiredLongTailKeywords: ['f-1 student visa i-20'],
  shortKeywordTerms: [{ term: 'f-1 visa', source: 'demand' }],
  longTailKeywordTerms: [{ term: 'f-1 student visa i-20', source: 'demand' }],
  competingUrls: [{ url: 'https://yousafeconsultancy.com/us/f-1/', title: 'F-1 Visa', primaryKeyword: 'f-1 visa' }],
  eventLog: null,
  rescueStats: null,
  cluster: null,
  ...over,
})

describe('mapPipelineJobStatus — one rule for JSON + stream', () => {
  it('deployed and merged both map to merged', () => {
    expect(mapPipelineJobStatus({ shipResult: merged, shipError: null, content: LONG })).toBe('merged')
    expect(
      mapPipelineJobStatus({ shipResult: { ...merged, status: 'deployed' }, shipError: null, content: LONG }),
    ).toBe('merged')
  })

  it('pr_created stays pr_created even when a shipError is present', () => {
    expect(
      mapPipelineJobStatus({
        shipResult: { ...merged, status: 'pr_created' },
        shipError: 'Ship withheld · audit 40',
        content: LONG,
      }),
    ).toBe('pr_created')
  })

  it('dry_run with no error is a drafting draft', () => {
    expect(
      mapPipelineJobStatus({ shipResult: { ...merged, status: 'dry_run' }, shipError: null, content: LONG }),
    ).toBe('drafting')
  })

  it('withheld ship with a real draft (>100 chars) stays drafting so the editor can fix it', () => {
    expect(mapPipelineJobStatus({ shipResult: null, shipError: 'Ship withheld · audit 40', content: LONG })).toBe('drafting')
  })

  it('gate hold with a real draft stays drafting', () => {
    expect(
      mapPipelineJobStatus({ shipResult: null, shipError: 'Ship withheld · audit 40', gateHoldReason: 'quality/depth blockers', content: LONG }),
    ).toBe('drafting')
  })

  it('empty / tiny content with a failure is failed', () => {
    expect(mapPipelineJobStatus({ shipResult: null, shipError: 'AI generation failed', content: '' })).toBe('failed')
    expect(mapPipelineJobStatus({ shipResult: null, shipError: 'AI generation failed', content: SHORT })).toBe('failed')
    expect(mapPipelineJobStatus({ shipResult: null, shipError: 'AI generation failed', gateHoldReason: 'quality', content: '' })).toBe('failed')
  })

  it('no error and no ship is a drafting draft (nothing wrong)', () => {
    expect(mapPipelineJobStatus({ shipResult: null, shipError: null, content: LONG })).toBe('drafting')
  })
})

describe('mapPipelineShipMode / mapCompetingUrls', () => {
  it('none and pr store as pr; every main-intent mode stores as autodeploy', () => {
    expect(mapPipelineShipMode('none')).toBe('pr')
    expect(mapPipelineShipMode('pr')).toBe('pr')
    expect(mapPipelineShipMode('autodeploy')).toBe('autodeploy')
    expect(mapPipelineShipMode('merge')).toBe('autodeploy')
    expect(mapPipelineShipMode('auto')).toBe('autodeploy')
  })

  it('competing_urls serialize (sliced to 10) when present, null otherwise', () => {
    const ten = Array.from({ length: 12 }, (_, i) => ({ url: `https://x.test/${i}`, title: `P ${i}` }))
    const row = JSON.parse(mapCompetingUrls(ten) || '')
    expect(row).toHaveLength(10)
    expect(mapCompetingUrls([])).toBeNull()
    expect(mapCompetingUrls(undefined)).toBeNull()
    expect(mapCompetingUrls(null)).toBeNull()
  })
})

describe('mapPipelineJobRow — pure row builder', () => {
  it('maps merged state with deploy sha + merged/deployed timestamps and autodeploy ship_mode', () => {
    const row = mapPipelineJobRow(baseInput())
    expect(row.status).toBe('merged')
    expect(row.ship_mode).toBe('autodeploy')
    expect(row.deploy_sha).toBe('abc123')
    expect(row.merged_at).toEqual(expect.any(String))
    expect(row.deployed_at).toEqual(expect.any(String))
    expect(row.competing_urls).toBe(JSON.stringify([baseInput().competingUrls![0]]))
  })

  it('pr shipped rows keep ship_mode pr and no deploy timestamps', () => {
    const row = mapPipelineJobRow(
      baseInput({
        shipResult: { ...merged, status: 'pr_created', prUrl: 'https://github.com/yousafe/x/pull/7', branch: 'f1-visa', mergeCommitSha: undefined, commitSha: 'branchSHA' },
        shipMode: 'pr',
        shipError: null,
      }),
    )
    expect(row.status).toBe('pr_created')
    expect(row.ship_mode).toBe('pr')
    expect(row.pr_url).toBe('https://github.com/yousafe/x/pull/7')
    expect(row.merged_at).toBeNull()
    expect(row.deployed_at).toBeNull()
    expect(row.deploy_sha).toBe('branchSHA')
  })

  it('withhold with content → drafting; empty failure → failed', () => {
    const held = mapPipelineJobRow(baseInput({ shipResult: null, shipError: 'Ship withheld · audit 40', gateHoldReason: 'quality/depth blockers' }))
    expect(held.status).toBe('drafting')
    expect(held.error_message).toBe('Ship withheld · audit 40')
    const failed = mapPipelineJobRow(baseInput({ shipResult: null, shipError: 'AI generation failed', content: '' }))
    expect(failed.status).toBe('failed')
  })

  it('always persists competing_urls when provided (stream used to omit)', () => {
    const urls = [
      { url: 'https://yousafeconsultancy.com/us/f-1/', title: 'F-1', primaryKeyword: 'f-1 visa' },
      { url: 'https://yousafeconsultancy.com/us/f1-study/', title: 'F1 Study' },
    ]
    const row = mapPipelineJobRow(baseInput({ competingUrls: urls }))
    expect(row.competing_urls).toBe(JSON.stringify(urls))
  })

  it('carries event_log, rescue telemetry and cluster snapshot when provided', () => {
    const eventLog = [{ id: 'pipe-1', ts: 1, level: 'success', source: 'pipeline', message: 'done' }]
    const row = mapPipelineJobRow(
      baseInput({
        eventLog,
        rescueStats: { expandPasses: 2, stallCount: 1, timeMs: 500, budgetMs: 60000 },
        cluster: { clusterId: 'cl-1', canonicalTerm: 'f-1 visa', keywords: ['f-1', 'f1'], mode: 'new' },
      }),
    )
    expect(row.event_log).toEqual(eventLog)
    const aj = row.audit_json as Record<string, unknown>
    expect(aj.rescue).toEqual({ expandPasses: 2, stallCount: 1, timeMs: 500, budgetMs: 60000 })
    expect(aj.attempts).toBe(2)
    expect(aj.model).toBe('deepseek-ai/deepseek-v4-flash-0731')
    expect(aj.minAudit).toBe(65)
    const gj = row.gsc_json as Record<string, unknown>
    expect((gj.cluster as { clusterId: unknown }).clusterId).toBe('cl-1')
    expect(row.event_log).toBeDefined()
  })

  it('no event_log / rescue / cluster → those keys stay absent (JSON path parity)', () => {
    const row = mapPipelineJobRow(baseInput())
    expect(row.event_log).toBeUndefined()
    expect((row.audit_json as Record<string, unknown>).rescue).toBeUndefined()
    expect((row.gsc_json as Record<string, unknown>).cluster).toBeUndefined()
  })

  it('persists shipReady=true when the audit passes ship quality and ownership is clear', () => {
    const aj = mapPipelineJobRow(baseInput()).audit_json as Record<string, unknown>
    expect(aj.shipReady).toBe(true)
    expect(aj.blockersCount).toBe(0)
    expect(aj.blockers).toEqual([])
  })

  it('persists shipReady=false when the audit still carries a hard blocker', () => {
    const aj = mapPipelineJobRow(
      baseInput({
        audit: audit({
          blockers: [{ code: 'thin_content', severity: 'blocker', message: 'too thin', fix: 'expand' }],
        }),
      }),
    ).audit_json as Record<string, unknown>
    expect(aj.shipReady).toBe(false)
    expect(aj.blockersCount).toBe(1)
    expect(Array.isArray(aj.blockers)).toBe(true)
  })

  it('persists the owner/brief pin as ai_provider even when cascade runtime differs', () => {
    const row = mapPipelineJobRow(
      baseInput({ ownerProvider: 'grok', provider: 'entrim-qwen-27b' }),
    )
    expect(row.ai_provider).toBe('grok')
    const lineage = row.lineage as Record<string, unknown>
    const aj = row.audit_json as Record<string, unknown>
    expect(lineage.ownerProvider).toBe('grok')
    expect(aj.ownerProvider).toBe('grok')
    expect(aj.runtimeProvider).toBe('entrim-qwen-27b')
  })

  it('falls back to runtime provider when no owner pin was set', () => {
    const row = mapPipelineJobRow(baseInput({ ownerProvider: null, provider: 'entrim-deepseek' }))
    expect(row.ai_provider).toBe('entrim-deepseek')
    expect((row.lineage as Record<string, unknown>).ownerProvider).toBe('entrim-deepseek')
  })

  it('persists shipReady=false when ownership is blocked even on a clean audit', () => {
    const aj = mapPipelineJobRow(
      baseInput({ plan: { ...plan, blockers: ['blocked_on_supply: wait'] } }),
    ).audit_json as Record<string, unknown>
    expect(aj.shipReady).toBe(false)
    expect(aj.blockersCount).toBe(0)
  })
})

describe('persistPipelineJob — one write door, never throws', () => {
  it('updates the existing row and returns its id (early/stream path)', async () => {
    const jobId = await persistPipelineJob(baseInput({ existingJobId: 'early-1', shipMode: 'pr' }))
    expect(jobId).toBe('early-1')
    const ops = mockModule.__getOps()
    const update = ops.find((o) => o.op === 'update' && o.table === 'content_jobs')
    expect(update).toBeDefined()
    expect((update!.row as Record<string, unknown>).status).toBe('merged')
    expect(ops.some((o) => o.op === 'insert' && o.table === 'content_jobs')).toBe(false)
  })

  it('inserts a new row when no existing id and returns the inserted id', async () => {
    const jobId = await persistPipelineJob(baseInput({ existingJobId: '' }))
    expect(jobId).toBe('inserted-123')
    const ops = mockModule.__getOps()
    expect(ops.some((o) => o.op === 'insert' && o.table === 'content_jobs')).toBe(true)
  })
})