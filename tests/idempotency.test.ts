/**
 * Unit tests for lib/idempotency — the guard protecting every money-moving
 * POST (checkout/order, wallet/topup, wallet/debit) from double-charging.
 */
import {
  extractIdempotencyKey,
  claimIdempotencyKey,
  completeIdempotencyKey,
} from '@/lib/idempotency'

// ── Minimal Supabase-shaped mock ────────────────────────────────────────────
type Row = Record<string, any>

function makeDb(initialRows: Row[] = []) {
  const rows: Row[] = [...initialRows]
  const db = {
    rows,
    from(table: string) {
      if (table !== 'checkout_idempotency_keys') throw new Error(`unexpected table ${table}`)
      return {
        insert(values: Row) {
          const dup = rows.find((r) => r.profile_id === values.profile_id && r.key === values.key)
          if (dup) return Promise.resolve({ error: { code: '23505', message: 'duplicate key' } })
          rows.push({ status: 'pending', created_at: new Date().toISOString(), ...values })
          return Promise.resolve({ error: null })
        },
        select(_cols: string) {
          const filters: Array<[string, any]> = []
          const chain = {
            eq(col: string, val: any) { filters.push([col, val]); return chain },
            single() {
              const found = rows.find((r) => filters.every(([c, v]) => r[c] === v))
              return Promise.resolve(found ? { data: found, error: null } : { data: null, error: { message: 'not found' } })
            },
          }
          return chain
        },
        update(values: Row) {
          const filters: Array<[string, any]> = []
          let ltFilter: [string, string] | null = null
          const chain: any = {
            eq(col: string, val: any) { filters.push([col, val]); return chain },
            lt(col: string, val: string) { ltFilter = [col, val]; return chain },
            select(_cols: string) {
              const matched = rows.filter((r) =>
                filters.every(([c, v]) => r[c] === v) &&
                (!ltFilter || new Date(r[ltFilter[0]]).getTime() < new Date(ltFilter[1]).getTime()),
              )
              matched.forEach((r) => Object.assign(r, values))
              return Promise.resolve({ data: matched, error: null })
            },
            then(resolve: any) {
              // awaited without .select(): perform update, resolve supabase-style
              const matched = rows.filter((r) => filters.every(([c, v]) => r[c] === v))
              matched.forEach((r) => Object.assign(r, values))
              resolve({ data: matched, error: null })
            },
          }
          return chain
        },
      }
    },
  }
  return db as any
}

const reqWith = (headers: Record<string, string> = {}) =>
  new Request('https://example.com/api/checkout/order', { method: 'POST', headers })

describe('extractIdempotencyKey', () => {
  it('reads the Idempotency-Key header', () => {
    const key = '0b9c6e1a-9f2d-4f3a-8a1e-aaaaaaaaaaaa'
    expect(extractIdempotencyKey(reqWith({ 'Idempotency-Key': key }))).toBe(key)
  })

  it('falls back to body.idempotencyKey', () => {
    const key = 'abcdefghijklmnop'
    expect(extractIdempotencyKey(reqWith(), { idempotencyKey: key })).toBe(key)
  })

  it('rejects junk: too short, too long, bad charset', () => {
    expect(extractIdempotencyKey(reqWith({ 'Idempotency-Key': 'short' }))).toBeNull()
    expect(extractIdempotencyKey(reqWith({ 'Idempotency-Key': 'x'.repeat(200) }))).toBeNull()
    expect(extractIdempotencyKey(reqWith({ 'Idempotency-Key': 'has spaces and $tuff!' }))).toBeNull()
    expect(extractIdempotencyKey(reqWith())).toBeNull()
  })
})

describe('claimIdempotencyKey', () => {
  const PROFILE = 'profile-1'
  const KEY = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

  it('fresh claim succeeds and stores a pending row', async () => {
    const db = makeDb()
    const claim = await claimIdempotencyKey(db, PROFILE, KEY)
    expect(claim.kind).toBe('fresh')
    expect(db.rows).toHaveLength(1)
    expect(db.rows[0].status).toBe('pending')
  })

  it('duplicate while pending (recent) reports in_flight — blocks the double-click', async () => {
    const db = makeDb()
    await claimIdempotencyKey(db, PROFILE, KEY)
    const second = await claimIdempotencyKey(db, PROFILE, KEY)
    expect(second.kind).toBe('in_flight')
  })

  it('duplicate after completion replays the stored response + status', async () => {
    const db = makeDb()
    await claimIdempotencyKey(db, PROFILE, KEY)
    await completeIdempotencyKey(db, PROFILE, KEY, { success: true, orderId: 'o1' }, 200, 'o1')
    const replay = await claimIdempotencyKey(db, PROFILE, KEY)
    expect(replay.kind).toBe('replay')
    if (replay.kind === 'replay') {
      expect(replay.statusCode).toBe(200)
      expect(replay.response).toEqual({ success: true, orderId: 'o1' })
    }
  })

  it('duplicate after a failure replays the failure (does not re-charge)', async () => {
    const db = makeDb()
    await claimIdempotencyKey(db, PROFILE, KEY)
    await completeIdempotencyKey(db, PROFILE, KEY, { error: 'declined' }, 402)
    const replay = await claimIdempotencyKey(db, PROFILE, KEY)
    expect(replay.kind).toBe('replay')
    if (replay.kind === 'replay') {
      expect(replay.statusCode).toBe(402)
      expect(replay.response).toEqual({ error: 'declined' })
    }
  })

  it('stale pending row (crashed worker >10min ago) is reclaimable', async () => {
    const db = makeDb([{
      profile_id: PROFILE,
      key: KEY,
      status: 'pending',
      created_at: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
    }])
    const claim = await claimIdempotencyKey(db, PROFILE, KEY)
    expect(claim.kind).toBe('fresh')
  })

  it('keys are scoped per profile — same key for another user is fresh', async () => {
    const db = makeDb()
    await claimIdempotencyKey(db, PROFILE, KEY)
    const other = await claimIdempotencyKey(db, 'profile-2', KEY)
    expect(other.kind).toBe('fresh')
  })
})
