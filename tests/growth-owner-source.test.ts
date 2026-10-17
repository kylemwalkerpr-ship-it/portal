/// <reference types="jest" />
/** Synthetic fixtures only. No production orders, sessions, or buyer data. */
import {
  SOURCE_OWNER_HASH_TEST_VECTOR,
  canonicalJson,
  createSourceOwnerRequestHash,
  handleSourceOwnerRequest,
  type SourceOwnerRequest,
} from '@/lib/growthOwner/sourceOwner'
import { GROWTH_OWNER_MANIFEST } from '@/lib/growthOwner/offers'
jest.mock('@/lib/supabase', () => ({
  createSupabaseAdminClient: jest.fn(),
  isServiceRoleAchieved: jest.fn(),
}))
import { createSupabaseAdminClient, isServiceRoleAchieved } from '@/lib/supabase'
import { POST as sourceOwnerCommercePOST } from '@/app/api/internal/source-owner/commerce/route'

const NOW = Date.parse('2026-10-17T16:00:00.000Z')
const OFFER = GROWTH_OWNER_MANIFEST.offers[0]
const SECRET = 'synthetic-test-only-shared-secret'

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    consent_state: 'granted',
    first_source_class: 'campaign',
    first_source_detail: {
      source: 'yousafe',
      medium: 'organization_outreach',
      campaign: OFFER.campaign_id,
      content: 'treg_assisted',
    },
    first_seen_at: '2026-10-17T15:00:00.000Z',
    expires_at: '2026-10-18T15:00:00.000Z',
    revoked_at: null,
    ...overrides,
  }
}

function businessEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'event-1',
    event_key: 'order_paid:v1:order:internal-order-1',
    event_type: 'order_paid',
    observation: 'server_observed',
    consent_state: 'granted',
    session_id: 'session-1',
    attribution_state: 'attributed',
    source_class: 'campaign',
    source_detail: {
      source: 'yousafe',
      medium: 'organization_outreach',
      campaign: OFFER.campaign_id,
      content: 'treg_assisted',
    },
    product_ref: `gig:${OFFER.gig_id}`,
    subject_type: 'order',
    subject_id: 'internal-order-1',
    amount_cents: 2500,
    currency: 'usd',
    occurred_at: '2026-10-17T15:30:00.000Z',
    ...overrides,
  }
}

class FakeQuery implements PromiseLike<{ data: unknown[] | null; error: unknown | null }> {
  private filters: Array<{ key: string; op: string; value: unknown }> = []
  private columns: string[] = []
  private offset = 0
  private end = Number.MAX_SAFE_INTEGER
  private sortKey: string | null = null
  private ascending = true

  constructor(private rows: unknown[], private shouldFail: boolean) {}
  select(columns: string) { this.columns = columns.split(','); return this }
  eq(key: string, value: unknown) { this.filters.push({ key, op: 'eq', value }); return this }
  neq(key: string, value: unknown) { this.filters.push({ key, op: 'neq', value }); return this }
  is(key: string, value: unknown) { this.filters.push({ key, op: 'is', value }); return this }
  in(key: string, value: unknown[]) { this.filters.push({ key, op: 'in', value }); return this }
  abortSignal() { return this }
  order(key: string, options?: { ascending?: boolean }) {
    this.sortKey = key
    this.ascending = options?.ascending !== false
    return this
  }
  range(offset: number, end: number) { this.offset = offset; this.end = end; return this }

  private read(row: Record<string, any>, key: string): unknown {
    if (key.includes('->>')) {
      const [column, property] = key.split('->>')
      return (row[column] as Record<string, unknown> | undefined)?.[property]
    }
    return row[key]
  }

  private project(row: Record<string, any>): Record<string, unknown> {
    if (!this.columns.length) return row
    const projected: Record<string, unknown> = {}
    for (const spec of this.columns) {
      const [alias, expression] = spec.includes(':') ? spec.split(':', 2) : [spec, spec]
      if (expression.includes('->>')) {
        const [column, property] = expression.split('->>')
        projected[alias] = (row[column] as Record<string, unknown> | undefined)?.[property]
      } else {
        projected[alias] = row[expression]
      }
    }
    return projected
  }

  then<TResult1 = { data: unknown[] | null; error: unknown | null }, TResult2 = never>(
    resolve?: ((value: { data: unknown[] | null; error: unknown | null }) => TResult1 | PromiseLike<TResult1>) | null,
    reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    if (this.shouldFail) {
      const failed = Promise.resolve({ data: null, error: { message: 'synthetic permission failure' } })
      return failed.then(resolve, reject)
    }
    let rows = this.rows.filter((candidate) => {
      const row = candidate as Record<string, any>
      return this.filters.every(({ key, op, value }) => {
        const got = this.read(row, key)
        if (op === 'eq') return got === value
        if (op === 'neq') return got !== value
        if (op === 'is') return got === value
        if (op === 'in') return (value as unknown[]).includes(got)
        return false
      })
    })
    if (this.sortKey) {
      const key = this.sortKey
      rows = [...rows].sort((a, b) => {
        const av = String((a as Record<string, unknown>)[key] ?? '')
        const bv = String((b as Record<string, unknown>)[key] ?? '')
        return (av.localeCompare(bv)) * (this.ascending ? 1 : -1)
      })
    }
    const value = { data: rows.slice(this.offset, this.end + 1).map((row) => this.project(row as Record<string, any>)), error: null }
    return Promise.resolve(value).then(resolve, reject)
  }
}

function fakeDb(tables: Record<string, unknown[]> = {}, failTable?: string) {
  return {
    from(table: string) {
      const defaultOrders = (tables.conversion_events ?? [])
        .filter((row: any) => row.event_type === 'order_paid')
        .map((row: any) => ({ id: row.subject_id, gig_id: OFFER.gig_id, status: 'created', amount_paid: row.amount_cents, currency: row.currency }))
        .filter((row: any, index: number, all: any[]) => all.findIndex(other => other.id === row.id) === index)
      return new FakeQuery(tables[table] ?? (table === 'orders' ? defaultOrders : []), table === failTable)
    },
  }
}

async function bodyFor(overrides: Partial<SourceOwnerRequest> = {}): Promise<SourceOwnerRequest> {
  const body = {
    contract_version: 'yousafe.source-owner.v1' as const,
    operation_id: 'yousafe:mission-1:0:commerce',
    mission_id: 'mission-1',
    tenant_id: GROWTH_OWNER_MANIFEST.tenant_id,
    policy_ref: OFFER.policy_ref,
    operation: 'commerce' as const,
    campaign_id: OFFER.campaign_id,
    gig_id: OFFER.gig_id,
    deadline_epoch: Math.floor(NOW / 1000) + 60,
    ...overrides,
  }
  return { ...body, request_hash: await createSourceOwnerRequestHash(body) }
}

function request(body: SourceOwnerRequest, overrides: { authorization?: string; requestHash?: string; idempotencyKey?: string } = {}) {
  return new Request('https://portal.example.test/api/internal/source-owner/commerce', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: overrides.authorization ?? `Bearer ${SECRET}`,
      'x-request-hash': overrides.requestHash ?? body.request_hash,
      'idempotency-key': overrides.idempotencyKey ?? body.operation_id,
    },
    body: JSON.stringify(body),
  })
}

async function call(body: SourceOwnerRequest, db: unknown, overrides: {
  authorization?: string; requestHash?: string; idempotencyKey?: string; secret?: string;
  serviceRoleAvailable?: boolean; now?: number;
} = {}) {
  return handleSourceOwnerRequest(request(body, overrides), {
    secret: overrides.secret ?? SECRET,
    database: db,
    serviceRoleAvailable: overrides.serviceRoleAvailable ?? true,
    now: overrides.now ?? NOW,
  })
}

async function payload(response: Response) {
  return response.json() as Promise<Record<string, any>>
}

describe('Growth source-owner request contract', () => {
  it('exports the six configured offer pairs with unique campaign and gig bindings', () => {
    expect(GROWTH_OWNER_MANIFEST.offers).toHaveLength(6)
    expect(new Set(GROWTH_OWNER_MANIFEST.offers.map((offer) => offer.campaign_id)).size).toBe(6)
    expect(new Set(GROWTH_OWNER_MANIFEST.offers.map((offer) => offer.gig_id)).size).toBe(6)
    expect(GROWTH_OWNER_MANIFEST.cohorts).toEqual(['manual_research', 'treg_assisted'])
  })

  it('matches the Python canonical JSON SHA-256 test vector', async () => {
    expect(canonicalJson({ b: 'é', a: 1 })).toBe(SOURCE_OWNER_HASH_TEST_VECTOR.canonical_json)
    expect(await createSourceOwnerRequestHash({ b: 'é', a: 1 })).toBe(SOURCE_OWNER_HASH_TEST_VECTOR.sha256)
  })

  it('rejects missing or wrong machine authentication before a database read', async () => {
    const db = fakeDb()
    const body = await bodyFor()
    const response = await call(body, db, { authorization: 'Bearer wrong-secret' })
    expect(response.status).toBe(401)
  })

  it('distinguishes an expired request deadline', async () => {
    const body = await bodyFor({ deadline_epoch: Math.floor(NOW / 1000) - 1 })
    const response = await call(body, fakeDb())
    expect(response.status).toBe(409)
    expect((await payload(response)).reason).toBe('REQUEST_EXPIRED')
  })

  it.each([
    ['tenant_id', 'another-tenant'],
    ['campaign_id', 'unlisted-campaign'],
    ['gig_id', '00000000-0000-4000-8000-000000000000'],
  ])('denies a request with an unallowlisted %s', async (key, value) => {
    const body = await bodyFor({ [key]: value } as Partial<SourceOwnerRequest>)
    const response = await call(body, fakeDb())
    expect(response.status).toBe(403)
  })

  it('rejects a stale or mismatched request hash', async () => {
    const body = await bodyFor()
    const response = await call(body, fakeDb(), { requestHash: '0'.repeat(64) })
    expect(response.status).toBe(409)
    expect((await payload(response)).reason).toBe('REQUEST_HASH_MISMATCH')
  })

  it('rejects an idempotency header that differs from the operation id', async () => {
    const body = await bodyFor()
    const response = await call(body, fakeDb(), { idempotencyKey: 'another-operation' })
    expect(response.status).toBe(409)
  })

  it('rejects oversized request bodies before reading source data', async () => {
    const body = await bodyFor()
    const oversized = new Request('https://portal.example.test/api/internal/source-owner/commerce', {
      method: 'POST',
      headers: {
        'content-type': 'application/json', authorization: `Bearer ${SECRET}`,
        'x-request-hash': body.request_hash, 'idempotency-key': body.operation_id,
      },
      body: ' '.repeat(9 * 1024),
    })
    const response = await handleSourceOwnerRequest(oversized, {
      secret: SECRET, database: fakeDb(), serviceRoleAvailable: true, now: NOW,
    })
    expect(response.status).toBe(413)
  })

  it('rejects a deadline beyond the configured request horizon', async () => {
    const body = await bodyFor({ deadline_epoch: Math.floor(NOW / 1000) + 31 * 24 * 60 * 60 })
    const response = await call(body, fakeDb())
    expect(response.status).toBe(422)
  })

  it('rejects arbitrary fields and unsupported operations', async () => {
    const body = { ...await bodyFor(), arbitrary_order_id: 'buyer-order-1' }
    const response = await handleSourceOwnerRequest(request(body as SourceOwnerRequest), {
      secret: SECRET, database: fakeDb(), serviceRoleAvailable: true, now: NOW,
    })
    expect(response.status).toBe(400)
  })

  it('rejects an unsupported operation even when every other field is valid', async () => {
    const body = { ...await bodyFor(), operation: 'admit_action' } as unknown as SourceOwnerRequest
    const response = await call(body, fakeDb())
    expect(response.status).toBe(422)
    expect((await payload(response)).reason).toBe('REQUEST_OPERATION_UNSUPPORTED')
  })

  it('returns a complete authenticated zero snapshot when the bounded read is empty', async () => {
    const body = await bodyFor()
    const response = await call(body, fakeDb())
    const result = await payload(response)
    expect(response.status).toBe(200)
    expect(result).toMatchObject({ status: 'PASS', authenticated: true, snapshot_complete: true })
    expect(result.paid_order_receipts).toEqual([])
    expect(result.evidence_refs).toHaveLength(1)
  })

  it('returns UNKNOWN rather than using a degraded anon database client', async () => {
    const body = await bodyFor()
    const response = await call(body, fakeDb({ conversion_events: [businessEvent()] }), {
      serviceRoleAvailable: false,
    })
    const result = await payload(response)
    expect(result.status).toBe('UNKNOWN')
    expect(result.snapshot_complete).toBe(false)
    expect(result.reason).toBe('OWNER_DATABASE_AUTH_UNAVAILABLE')
    expect(result.paid_order_receipts).toEqual([])
  })

  it('runs the real local Next route handler with synthetic service-role fixtures', async () => {
    const body = await bodyFor()
    ;(createSupabaseAdminClient as jest.Mock).mockReturnValue(fakeDb())
    ;(isServiceRoleAchieved as jest.Mock).mockReturnValue(true)
    const oldSecret = process.env.YOUSAFE_GROWTH_SOURCE_OWNER_TOKEN
    process.env.YOUSAFE_GROWTH_SOURCE_OWNER_TOKEN = SECRET
    try {
      const response = await sourceOwnerCommercePOST(request(body))
      expect(response.status).toBe(200)
      expect((await payload(response)).snapshot_complete).toBe(true)
    } finally {
      if (oldSecret === undefined) delete process.env.YOUSAFE_GROWTH_SOURCE_OWNER_TOKEN
      else process.env.YOUSAFE_GROWTH_SOURCE_OWNER_TOKEN = oldSecret
      jest.clearAllMocks()
    }
  })
})

describe('Commerce receipt projection from synthetic source-owned rows', () => {
  it.each(['refunded', 'cancelled'])('reconciles current %s order state even without telemetry', async (status) => {
    const result = await payload(await call(await bodyFor(), fakeDb({
      conversion_events: [businessEvent()], conversion_attribution_sessions: [session()],
      orders: [{ id: 'internal-order-1', gig_id: OFFER.gig_id, status, amount_paid: 2500, currency: 'usd' }],
    })))
    expect(result.paid_order_receipts).toEqual([])
    if (status === 'refunded') expect(result.status).toBe('UNKNOWN')
    else expect(result.status).toBe('PASS')
  })

  it('does not ignore a refund whose optional product inheritance is missing', async () => {
    const result = await payload(await call(await bodyFor(), fakeDb({
      conversion_events: [businessEvent(), businessEvent({ id: 'refund-null-product',
        event_key: 'refund-null-product', event_type: 'order_refunded', product_ref: null })],
      conversion_attribution_sessions: [session()],
    })))
    expect(result.status).toBe('PASS')
    expect(result.paid_order_receipts).toEqual([])
  })

  it('fails closed when the actual order is missing', async () => {
    const result = await payload(await call(await bodyFor(), fakeDb({
      conversion_events: [businessEvent()], conversion_attribution_sessions: [session()], orders: [],
    })))
    expect(result.status).toBe('UNKNOWN')
  })

  it('does not count forged client-declared paid events', async () => {
    const body = await bodyFor()
    const forged = businessEvent({ observation: 'client_declared' })
    const response = await call(body, fakeDb({ conversion_events: [forged], conversion_attribution_sessions: [session()] }))
    expect((await payload(response)).paid_order_receipts).toEqual([])
  })

  it('does not count lead_created as a paid order', async () => {
    const body = await bodyFor()
    const lead = businessEvent({ event_type: 'lead_created', amount_cents: null, currency: null })
    const response = await call(body, fakeDb({
      conversion_events: [lead], conversion_attribution_sessions: [session()],
    }))
    expect((await payload(response)).paid_order_receipts).toEqual([])
  })

  it.each([
    ['unknown event consent', businessEvent({ consent_state: 'unknown' }), session()],
    ['session-only attribution', businessEvent({ attribution_state: 'session_only' }), session()],
    ['revoked consent session', businessEvent(), session({ revoked_at: '2026-10-17T15:45:00.000Z' })],
  ])('does not count %s', async (_label, paid, attributionSession) => {
    const body = await bodyFor()
    const response = await call(body, fakeDb({
      conversion_events: [paid], conversion_attribution_sessions: [attributionSession],
    }))
    expect((await payload(response)).paid_order_receipts).toEqual([])
  })

  it('deduplicates duplicate order events and subtracts partial refunds in the original currency', async () => {
    const body = await bodyFor()
    const paid = businessEvent()
    const duplicate = businessEvent({ id: 'event-duplicate', event_key: paid.event_key })
    const refund = businessEvent({
      id: 'refund-1', event_key: 'order_refunded:v1:order:internal-order-1:refund-1',
      event_type: 'order_refunded', session_id: null, consent_state: 'unknown',
      attribution_state: 'unknown_source', source_class: null,
      amount_cents: 400, currency: 'usd',
    })
    const response = await call(body, fakeDb({
      conversion_events: [paid, duplicate, refund], conversion_attribution_sessions: [session()],
    }))
    const result = await payload(response)
    expect(result.paid_order_receipts).toHaveLength(1)
    expect(result.paid_order_receipts[0]).toMatchObject({ payment_status: 'paid', amount_minor: 2100, currency: 'usd' })
    expect(JSON.stringify(result)).not.toContain('internal-order-1')
  })

  it('excludes fully refunded orders from net paid-order receipts', async () => {
    const body = await bodyFor()
    const paid = businessEvent()
    const refund = businessEvent({
      id: 'refund-1', event_key: 'order_refunded:v1:order:internal-order-1:refund-1',
      event_type: 'order_refunded', session_id: null, consent_state: 'unknown',
      attribution_state: 'unknown_source', source_class: null,
    })
    const response = await call(body, fakeDb({
      conversion_events: [paid, refund], conversion_attribution_sessions: [session()],
    }))
    expect((await payload(response)).paid_order_receipts).toEqual([])
  })

  it('returns UNKNOWN when a refund cannot be reconciled to the paid amount and currency', async () => {
    const body = await bodyFor()
    const paid = businessEvent()
    const refund = businessEvent({
      id: 'refund-1', event_key: 'order_refunded:v1:order:internal-order-1:refund-1',
      event_type: 'order_refunded', session_id: null, consent_state: 'unknown',
      attribution_state: 'unknown_source', source_class: null, amount_cents: 400, currency: 'cad',
    })
    const response = await call(body, fakeDb({
      conversion_events: [paid, refund], conversion_attribution_sessions: [session()],
    }))
    const result = await payload(response)
    expect(result.status).toBe('UNKNOWN')
    expect(result.snapshot_complete).toBe(false)
  })

  it('holds when the page ceiling would hide additional source rows', async () => {
    const body = await bodyFor()
    const many = Array.from({ length: 101 }, (_, i) => businessEvent({
      id: `event-${String(i).padStart(3, '0')}`,
      event_key: `order_paid:v1:order:internal-order-${i}`,
      subject_id: `internal-order-${i}`,
    }))
    const response = await call(body, fakeDb({ conversion_events: many }))
    const result = await payload(response)
    expect(result.status).toBe('UNKNOWN')
    expect(result.snapshot_complete).toBe(false)
    expect(result.reason).toBe('SOURCE_SNAPSHOT_LIMIT')
  })

  it('distinguishes permission or schema failures from an authenticated zero snapshot', async () => {
    const body = await bodyFor()
    const response = await call(body, fakeDb({}, 'conversion_events'))
    const result = await payload(response)
    expect(result.status).toBe('UNKNOWN')
    expect(result.snapshot_complete).toBe(false)
    expect(result.reason).toBe('OWNER_SOURCE_READ_FAILED')
  })

  it('strips buyer, order, and free-form attribution metadata from the response', async () => {
    const body = await bodyFor()
    const event = businessEvent({
      evidence: { email: 'buyer@example.test', private_note: 'synthetic private text' },
      subject_id: 'raw-internal-order-id',
      source_detail: { ...businessEvent().source_detail, term: 'raw private search query' },
    })
    const response = await call(body, fakeDb({
      conversion_events: [event], conversion_attribution_sessions: [session()],
    }))
    const wire = await response.text()
    expect(wire).not.toContain('buyer@example.test')
    expect(wire).not.toContain('raw-internal-order-id')
    expect(wire).not.toContain('private_note')
    expect(wire).not.toContain('raw private search query')
  })

  it('keeps the response under the 32 KiB history boundary', async () => {
    const body = await bodyFor()
    const response = await call(body, fakeDb())
    expect(new TextEncoder().encode(await response.text()).byteLength).toBeLessThanOrEqual(32 * 1024)
  })

  it('keeps a full bounded page of receipts under the 32 KiB history boundary', async () => {
    const body = await bodyFor()
    const events = Array.from({ length: 100 }, (_, i) => businessEvent({
      id: `event-${String(i).padStart(3, '0')}`,
      event_key: `order_paid:v1:order:internal-order-${i}`,
      subject_id: `internal-order-${i}`,
      session_id: `session-${i}`,
    }))
    const sessions = events.map((event) => session({ id: event.session_id }))
    const response = await call(body, fakeDb({
      conversion_events: events,
      conversion_attribution_sessions: sessions,
    }))
    const wire = await response.text()
    expect(new TextEncoder().encode(wire).byteLength).toBeLessThanOrEqual(32 * 1024)
    expect(JSON.parse(wire).paid_order_receipts).toHaveLength(100)
  })
})
