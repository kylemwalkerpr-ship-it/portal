/**
 * P0 — interlink lifecycle truth under the existing production status set
 * (planned · applied · rejected · manual · paused · awaiting_gate).
 *
 * Non-negotiable semantics locked here:
 *   · planned may feed drafting suggestions, but is NOT executed authority;
 *   · applied (exact target URL found in the shipped body) is the ONLY
 *     executed state that counts toward authority / graph-applied metrics;
 *   · replanning rewrites plan metadata only — it must never reset an
 *     existing row's status / applied_at / gate state;
 *   · rejected / manual / paused / awaiting_gate never leak into automatic
 *     suggestions and are never relabelled as "planned".
 *
 * The fake Supabase client implements documented PostgREST semantics
 * (`resolution=merge-duplicates` + `Prefer: missing=default`) so the
 * persistence test exercises a real merge instead of asserting mocks.
 */

jest.mock('@/lib/supabase', () => ({ createSupabaseAdminClient: jest.fn() }))
jest.mock('@/lib/seoFactory/linkAudit', () => ({
  // P6 target-liveness gate: this suite is about lifecycle truth, so every
  // persisted target is treated as live unless a test overrides the mock.
  filterLiveInternalUrls: jest.fn(async (urls: string[]) => urls),
}))
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}))
jest.mock('@/lib/portalAuth', () => ({
  requireAdminUser: jest.fn(async () => ({ db: {}, profile: {}, profileId: 'p_admin', role: 'admin' })),
}))

import { createSupabaseAdminClient } from '@/lib/supabase'
import {
  persistInterlinkPlan,
  loadEngineInterlinksForCell,
  loadInterlinkGraph,
  loadPersistedCell,
} from '@/lib/seoEngine/interlink'
import { listInboundGaps, listOutboundGaps } from '@/lib/seoEngine/backlinkEngine'
import { GET as interlinksGET } from '@/app/api/content-studio/interlinks/route'

type FakeRow = Record<string, unknown>

interface CapturedFilter { op: string; column: string; value: unknown }
interface CapturedUpsert { table: string; rows: FakeRow[]; options?: Record<string, unknown> }

const db: Record<string, FakeRow[]> = {}
const capturedQueries: FakeQuery[] = []
const capturedUpserts: CapturedUpsert[] = []
let idSeq = 0

const SEO_INTERLINK_DB_DEFAULTS: FakeRow = {
  status: 'planned',
  applied_at: null,
  source_url: null,
  verification_state: null,
  verified_at: null,
  verification_evidence: null,
  gate_state: null,
  gate_reason: null,
  gate_actor: null,
  gate_updated_at: null,
  source: 'engine',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
}

function matchesFilter(filter: CapturedFilter, row: FakeRow): boolean {
  const value = row[filter.column]
  switch (filter.op) {
    case 'eq':
      return value === filter.value
    case 'in':
      return Array.isArray(filter.value) && (filter.value as unknown[]).includes(value)
    case 'ilike': {
      const pattern = String(filter.value)
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/%/g, '.*')
      return new RegExp(`^${pattern}$`, 'i').test(String(value ?? ''))
    }
    default:
      return true
  }
}

function applyUpsert(table: string, rows: FakeRow[], options?: Record<string, unknown>) {
  const conflict = String(options?.onConflict ?? '').split(',').filter(Boolean)
  const missingUsesDefault = options?.defaultToNull === false
  const keyOf = (row: FakeRow) => conflict.map((c) => String(row[c])).join('\u0000')
  for (const row of rows) {
    const existing = conflict.length
      ? (db[table] || []).find((candidate) => keyOf(candidate) === keyOf(row))
      : undefined
    if (existing) {
      // PostgREST resolution=merge-duplicates updates ONLY the keys present in
      // the payload. Omitted lifecycle columns are untouched on conflict.
      Object.assign(existing, row)
      continue
    }
    // Without missing=default, PostgREST sends omitted keys as NULL; with it,
    // omitted keys fall back to the column DEFAULT (status -> 'planned').
    const base: FakeRow = table === 'seo_interlinks'
      ? missingUsesDefault
        ? { ...SEO_INTERLINK_DB_DEFAULTS }
        : { status: null, applied_at: null, gate_state: null, gate_reason: null, gate_actor: null, gate_updated_at: null }
      : {}
    const inserted: FakeRow = { ...base, ...row }
    if (inserted.id == null) inserted.id = `${table}-${++idSeq}`
    if (!db[table]) db[table] = []
    db[table].push(inserted)
  }
}

class FakeQuery implements PromiseLike<{ data: FakeRow[]; error: null; count: number }> {
  readonly filters: CapturedFilter[] = []
  readonly table: string
  private orderBy: { column: string; ascending: boolean } | null = null
  private limitCount: number | null = null

  constructor(table: string) {
    this.table = table
    capturedQueries.push(this)
  }

  select(..._args: unknown[]) { return this }
  eq(column: string, value: unknown) { this.filters.push({ op: 'eq', column, value }); return this }
  in(column: string, value: unknown) { this.filters.push({ op: 'in', column, value }); return this }
  ilike(column: string, value: unknown) { this.filters.push({ op: 'ilike', column, value }); return this }
  not(column: string, op: string, value: unknown) { this.filters.push({ op: 'not', column, value: { op, value } }); return this }
  order(column: string, opts?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: opts?.ascending ?? true }
    return this
  }
  limit(rows: number) { this.limitCount = rows; return this }

  upsert(rows: FakeRow | FakeRow[], options?: Record<string, unknown>) {
    const list = Array.isArray(rows) ? rows : [rows]
    capturedUpserts.push({ table: this.table, rows: list, options })
    applyUpsert(this.table, list, options)
    return this
  }

  result() {
    let rows = [...(db[this.table] || [])]
    for (const filter of this.filters) rows = rows.filter((row) => matchesFilter(filter, row))
    if (this.orderBy) {
      const { column, ascending } = this.orderBy
      rows.sort((a, b) => {
        const av = a[column]
        const bv = b[column]
        const delta = typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av ?? '').localeCompare(String(bv ?? ''))
        return ascending ? delta : -delta
      })
    }
    if (this.limitCount != null) rows = rows.slice(0, this.limitCount)
    return { data: rows, error: null, count: rows.length }
  }

  then<TResult1 = { data: FakeRow[]; error: null; count: number }, TResult2 = never>(
    resolve?: ((value: { data: FakeRow[]; error: null; count: number }) => TResult1 | PromiseLike<TResult1>) | null,
    reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.result()).then(resolve, reject)
  }
}

function seed(table: string, rows: FakeRow[]) {
  db[table] = rows.map((row) => ({ ...row }))
}

function edge(partial: Partial<FakeRow> & Pick<FakeRow, 'source_slug' | 'target_url' | 'status'>): FakeRow {
  return {
    target_host: 'legal',
    anchor_text: `anchor for ${partial.target_url}`,
    context_h2: null,
    reason: 'journey_next',
    score: 0.5,
    cluster_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    applied_at: null,
    gate_state: null,
    gate_reason: null,
    gate_actor: null,
    gate_updated_at: null,
    ...partial,
  }
}

const LIFE_ROW = (status: string, overrides: Partial<FakeRow> = {}): FakeRow =>
  edge({ source_slug: `seo-uk-visa-${status}`, target_url: `https://legal.yousafeconsultancy.com/uk/${status}/`, status, ...overrides })

beforeEach(() => {
  for (const key of Object.keys(db)) delete db[key]
  capturedQueries.length = 0
  capturedUpserts.length = 0
  idSeq = 0
  ;(createSupabaseAdminClient as jest.Mock).mockImplementation(() => ({
    from: (table: string) => new FakeQuery(table),
  }))
})

describe('A. persistInterlinkPlan never resets lifecycle truth', () => {
  it('omits lifecycle columns from the upsert payload and lets DB defaults cover inserts', async () => {
    seed('seo_interlinks', [LIFE_ROW('planned')])

    const result = await persistInterlinkPlan([
      {
        sourceSlug: 'seo-uk-visa-planned',
        targetUrl: 'https://legal.yousafeconsultancy.com/uk/planned/',
        targetHost: 'legal',
        anchorText: 'Replanned UK visa anchor',
        contextH2: 'Replanned section',
        reason: 'journey_next',
        score: 0.9,
        clusterId: 'cluster-uk-visa',
      },
    ])

    expect(result).toEqual({ stored: 1 })
    expect(capturedUpserts).toHaveLength(1)
    const [{ rows, options }] = capturedUpserts
    // Plan metadata is written…
    expect(rows[0]).toMatchObject({
      source_slug: 'seo-uk-visa-planned',
      target_url: 'https://legal.yousafeconsultancy.com/uk/planned/',
      target_host: 'legal',
      anchor_text: 'Replanned UK visa anchor',
      context_h2: 'Replanned section',
      reason: 'journey_next',
      score: 0.9,
      cluster_id: 'cluster-uk-visa',
    })
    // …lifecycle columns are not.
    expect(rows[0]).not.toHaveProperty('status')
    expect(rows[0]).not.toHaveProperty('applied_at')
    expect(rows[0]).not.toHaveProperty('source_url')
    expect(rows[0]).not.toHaveProperty('verification_state')
    expect(rows[0]).not.toHaveProperty('verified_at')
    expect(rows[0]).not.toHaveProperty('verification_evidence')
    expect(rows[0]).not.toHaveProperty('gate_state')
    expect(rows[0]).not.toHaveProperty('gate_reason')
    expect(rows[0]).not.toHaveProperty('gate_actor')
    expect(rows[0]).not.toHaveProperty('gate_updated_at')
    // missing=default ⇒ PostgREST fills omitted columns from DB defaults on INSERT.
    expect(options).toMatchObject({ onConflict: 'source_slug,target_url', defaultToNull: false })
  })

  it.each(['planned', 'applied', 'rejected', 'manual', 'paused', 'awaiting_gate'])(
    'replanning an existing %s row keeps its status, applied_at and gate state',
    async (status) => {
      const existing = LIFE_ROW(status, {
        status,
        applied_at: status === 'applied' ? '2026-02-01T10:00:00.000Z' : null,
        gate_state: status === 'awaiting_gate' ? 'pending' : 'cleared',
        gate_reason: status === 'manual' ? 'operator_edit' : 'not_applicable',
        gate_actor: 'ops@yousafeconsultancy.com',
        gate_updated_at: '2026-02-02T10:00:00.000Z',
      })
      seed('seo_interlinks', [existing])

      await persistInterlinkPlan([
        {
          sourceSlug: String(existing.source_slug),
          targetUrl: String(existing.target_url),
          targetHost: 'legal',
          anchorText: 'Regenerated anchor',
          contextH2: 'Regenerated H2',
          reason: 'cross_country',
          score: 0.7,
          clusterId: 'replanned-cluster',
        },
      ])

      const stored = (db.seo_interlinks || []).find((row) => row.source_slug === existing.source_slug)!
      // Lifecycle truth survives the replan…
      expect(stored.status).toBe(status)
      expect(stored.applied_at).toBe(existing.applied_at)
      expect(stored.gate_state).toBe(existing.gate_state)
      expect(stored.gate_reason).toBe(existing.gate_reason)
      expect(stored.gate_actor).toBe(existing.gate_actor)
      expect(stored.gate_updated_at).toBe(existing.gate_updated_at)
      // …while plan metadata is refreshed.
      expect(stored.anchor_text).toBe('Regenerated anchor')
      expect(stored.context_h2).toBe('Regenerated H2')
      expect(stored.score).toBe(0.7)
      expect(stored.cluster_id).toBe('replanned-cluster')
    },
  )

  it('inserts brand-new edges with the DB planned default (no explicit status required)', async () => {
    seed('seo_interlinks', [])

    await persistInterlinkPlan([
      {
        sourceSlug: 'seo-uk-visa-brand-new',
        targetUrl: 'https://legal.yousafeconsultancy.com/uk/brand-new/',
        targetHost: 'legal',
        anchorText: 'Brand new anchor',
        reason: 'journey_next',
        score: 0.6,
      },
    ])

    const stored = (db.seo_interlinks || []).find((row) => row.source_slug === 'seo-uk-visa-brand-new')!
    expect(stored.status).toBe('planned')
    expect(stored.applied_at).toBe(null)
  })
})

describe('B. plan-eligible engine suggestions (planned/applied only)', () => {
  it('queries planned+applied and never leaks other lifecycle states into drafting suggestions', async () => {
    seed('seo_interlinks', [
      LIFE_ROW('planned', { score: 0.9, anchor_text: 'planned anchor', target_url: 'https://legal.yousafeconsultancy.com/uk/planned-url/' }),
      LIFE_ROW('applied', { score: 0.8, anchor_text: 'applied anchor', target_url: 'https://legal.yousafeconsultancy.com/uk/applied-url/' }),
      LIFE_ROW('rejected', { score: 1.0, anchor_text: 'rejected anchor', target_url: 'https://legal.yousafeconsultancy.com/uk/rejected-url/' }),
      LIFE_ROW('manual', { score: 1.0, anchor_text: 'manual anchor', target_url: 'https://legal.yousafeconsultancy.com/uk/manual-url/' }),
      LIFE_ROW('paused', { score: 1.0, anchor_text: 'paused anchor', target_url: 'https://legal.yousafeconsultancy.com/uk/paused-url/' }),
      LIFE_ROW('awaiting_gate', { score: 1.0, anchor_text: 'gate anchor', target_url: 'https://legal.yousafeconsultancy.com/uk/gate-url/' }),
    ])

    const suggestions = await loadEngineInterlinksForCell('visa', 'UK', 10)

    expect(suggestions.map((s) => s.url)).toEqual([
      'https://legal.yousafeconsultancy.com/uk/planned-url/',
      'https://legal.yousafeconsultancy.com/uk/applied-url/',
    ])

    const query = capturedQueries.find((q) => q.table === 'seo_interlinks')!
    expect(query.filters).toContainEqual({ op: 'in', column: 'status', value: ['planned', 'applied'] })
  })

  it('excludes rows whose durable verification verdict proved the edge dead', async () => {
    seed('seo_interlinks', [
      LIFE_ROW('planned', {
        score: 0.9,
        target_url: 'https://legal.yousafeconsultancy.com/uk/dead-target/',
        verification_state: 'target_not_live',
      }),
      LIFE_ROW('planned', {
        score: 0.8,
        target_url: 'https://legal.yousafeconsultancy.com/uk/gone-source/',
        verification_state: 'source_not_live',
      }),
      LIFE_ROW('planned', {
        score: 0.7,
        target_url: 'https://legal.yousafeconsultancy.com/uk/absent-href/',
        verification_state: 'absent',
      }),
      LIFE_ROW('planned', {
        score: 0.6,
        target_url: 'https://legal.yousafeconsultancy.com/uk/unverified/',
        verification_state: null,
      }),
      LIFE_ROW('applied', {
        score: 0.5,
        target_url: 'https://legal.yousafeconsultancy.com/uk/applied-verified/',
        verification_state: 'present',
      }),
    ])

    const suggestions = await loadEngineInterlinksForCell('visa', 'UK', 10)

    // Dead-verdict rows are withheld; absent (live source, href missing) and
    // null-verdict rows may still be suggested while they await verification,
    // and applied rows keep their own row proof.
    expect(suggestions.map((s) => s.url)).toEqual([
      'https://legal.yousafeconsultancy.com/uk/absent-href/',
      'https://legal.yousafeconsultancy.com/uk/unverified/',
      'https://legal.yousafeconsultancy.com/uk/applied-verified/',
    ])
  })
})

describe('C. graph + cell counters do not relabel non-planned states', () => {
  const SIX = [
    LIFE_ROW('planned', { score: 0.9 }),
    LIFE_ROW('applied', { score: 0.8 }),
    LIFE_ROW('rejected', { score: 0.7 }),
    LIFE_ROW('manual', { score: 0.6 }),
    LIFE_ROW('paused', { score: 0.5 }),
    LIFE_ROW('awaiting_gate', { score: 0.4 }),
  ]

  it('loadInterlinkGraph counts planned only when status === planned', async () => {
    seed('seo_interlinks', SIX)

    const graph = await loadInterlinkGraph(100)

    expect(graph.applied).toBe(1)
    expect(graph.planned).toBe(1)
    expect(graph.edges).toHaveLength(6)
    const statuses = graph.edges.map((row) => row.status).sort()
    expect(statuses).toEqual(['applied', 'awaiting_gate', 'manual', 'paused', 'planned', 'rejected'])
  })

  it('loadPersistedCell counts strictly and preserves byStatus for every lifecycle state', async () => {
    seed('seo_interlinks', SIX)

    const cell = await loadPersistedCell({ stage: 'visa', country: 'UK' })

    expect(cell.total).toBe(6)
    expect(cell.applied).toBe(1)
    expect(cell.planned).toBe(1)
    expect(cell.byStatus).toEqual({
      planned: 1,
      applied: 1,
      rejected: 1,
      manual: 1,
      paused: 1,
      awaiting_gate: 1,
    })
  })
})

describe('D. backlink-gap queries count only applied seo_interlinks', () => {
  it('listInboundGaps counts applied edges only (planned/rejected/manual/paused/awaiting_gate excluded)', async () => {
    seed('anchor_ledger', [
      { source_slug: 'post-anchor', target_url: 'https://legal.yousafeconsultancy.com/uk/target/', anchor: 'Anchor row' },
    ])
    seed('seo_interlinks', [
      edge({ source_slug: 'seo-uk-visa-applied-1', target_url: 'https://legal.yousafeconsultancy.com/uk/target/', status: 'applied' }),
      edge({ source_slug: 'seo-uk-visa-applied-2', target_url: 'https://legal.yousafeconsultancy.com/uk/target/', status: 'applied' }),
      edge({ source_slug: 'seo-uk-visa-planned', target_url: 'https://legal.yousafeconsultancy.com/uk/target/', status: 'planned' }),
      edge({ source_slug: 'seo-uk-visa-rejected', target_url: 'https://legal.yousafeconsultancy.com/uk/target/', status: 'rejected' }),
      edge({ source_slug: 'seo-uk-visa-manual', target_url: 'https://legal.yousafeconsultancy.com/uk/target/', status: 'manual' }),
      edge({ source_slug: 'seo-uk-visa-paused', target_url: 'https://legal.yousafeconsultancy.com/uk/target/', status: 'paused' }),
      edge({ source_slug: 'seo-uk-visa-gate', target_url: 'https://legal.yousafeconsultancy.com/uk/target/', status: 'awaiting_gate' }),
    ])

    const gaps = await listInboundGaps({ minInbound: 5, limit: 10 })

    expect(gaps).toHaveLength(1)
    expect(gaps[0].source_slug).toBe('https://legal.yousafeconsultancy.com/uk/target/')
    // 1 anchor_ledger row + 2 applied seo_interlinks. Any leak would push this to 7.
    expect(gaps[0].inbound_links).toBe(3)

    const query = capturedQueries.find((q) => q.table === 'seo_interlinks')!
    expect(query.filters).toEqual([{ op: 'eq', column: 'status', value: 'applied' }])
  })

  it('listOutboundGaps counts applied edges only', async () => {
    seed('anchor_ledger', [])
    seed('seo_interlinks', [
      edge({ source_slug: 'seo-uk-visa-source', target_url: 'https://legal.yousafeconsultancy.com/uk/a/', status: 'applied' }),
      edge({ source_slug: 'seo-uk-visa-source', target_url: 'https://legal.yousafeconsultancy.com/uk/b/', status: 'planned' }),
      edge({ source_slug: 'seo-uk-visa-source', target_url: 'https://legal.yousafeconsultancy.com/uk/c/', status: 'rejected' }),
      edge({ source_slug: 'seo-uk-visa-source', target_url: 'https://legal.yousafeconsultancy.com/uk/d/', status: 'manual' }),
    ])

    const gaps = await listOutboundGaps({ minOutbound: 3, limit: 10 })

    expect(gaps).toHaveLength(1)
    expect(gaps[0].source_slug).toBe('seo-uk-visa-source')
    expect(gaps[0].outbound_links).toBe(1)
    expect(gaps[0].distinct_targets).toEqual(['https://legal.yousafeconsultancy.com/uk/a/'])

    const query = capturedQueries.find((q) => q.table === 'seo_interlinks')!
    expect(query.filters).toEqual([{ op: 'eq', column: 'status', value: 'applied' }])
  })
})

describe('E. Content Studio GET engine graph is plan-eligible only', () => {
  it('keeps registry links intact while hiding rejected/manual/paused/awaiting_gate engine rows', async () => {
    seed('seo_interlinks', [
      LIFE_ROW('planned', { target_url: 'https://legal.yousafeconsultancy.com/uk/engine-planned/' }),
      LIFE_ROW('applied', { target_url: 'https://legal.yousafeconsultancy.com/uk/engine-applied/' }),
      LIFE_ROW('rejected', { target_url: 'https://legal.yousafeconsultancy.com/uk/engine-rejected/' }),
      LIFE_ROW('manual', { target_url: 'https://legal.yousafeconsultancy.com/uk/engine-manual/' }),
      LIFE_ROW('paused', { target_url: 'https://legal.yousafeconsultancy.com/uk/engine-paused/' }),
      LIFE_ROW('awaiting_gate', { target_url: 'https://legal.yousafeconsultancy.com/uk/engine-gate/' }),
    ])

    const res = await interlinksGET()
    const body = (await res.json()) as {
      engineGraphCount: number
      links: Array<{ url: string; source: string; status?: string }>
    }

    const engineLinks = body.links.filter((link) => link.source === 'engine_graph')
    expect(body.engineGraphCount).toBe(2)
    expect(engineLinks.map((link) => link.url).sort()).toEqual([
      'https://legal.yousafeconsultancy.com/uk/engine-applied/',
      'https://legal.yousafeconsultancy.com/uk/engine-planned/',
    ])
    expect(body.links.some((link) => link.url.includes('engine-rejected'))).toBe(false)
    expect(body.links.some((link) => link.url.includes('engine-manual'))).toBe(false)
    expect(body.links.some((link) => link.url.includes('engine-paused'))).toBe(false)
    expect(body.links.some((link) => link.url.includes('engine-gate'))).toBe(false)

    // Registry links are untouched (still the same count as registry entries
    // minus any URL already covered by the eligible engine graph).
    const registryLinks = body.links.filter((link) => link.source === 'registry')
    expect(registryLinks.length).toBeGreaterThan(0)
    expect(registryLinks).toContainEqual(
      expect.objectContaining({ url: 'https://portal.yousafeconsultancy.com/' }),
    )

    const query = capturedQueries.find((q) => q.table === 'seo_interlinks')!
    expect(query.filters).toContainEqual({ op: 'in', column: 'status', value: ['planned', 'applied'] })
  })
})
