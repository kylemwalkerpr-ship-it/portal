/**
 * Minimal in-memory PostgREST-like client for the P6 interlink suites.
 *
 * Supports exactly the surface the production code uses:
 *   select -> eq/in/order/limit        (read)
 *   update -> eq -> select('id')       (single-row staging/verdict write,
 *                                       returning the ACTUAL affected rows;
 *                                       no returned rows = lost race)
 *   upsert(rows, { onConflict, defaultToNull }) (planner persistence)
 *
 * Upsert conflict semantics mirror PostgREST `resolution=merge-duplicates` +
 * `Prefer: missing=default`: only keys present in the payload are written, so
 * omitted lifecycle/verification columns survive on conflict and DB defaults
 * apply on insert.
 *
 * `updated_at` trigger emulation: production has a BEFORE UPDATE trigger that
 * always sets `updated_at = now()` — later than every app-written verdict
 * timestamp. Updates here do the same by default, so tests can prove the
 * reconciler does NOT depend on updated_at for revision/cooldown membership.
 * `afterSelect` lets a test deterministically rebind a row between the
 * finalizer's SELECT and its fenced UPDATE (M2 race).
 */

export type P6FakeRow = Record<string, unknown>

export interface P6CapturedFilter {
  op: 'eq' | 'in' | 'not_is_null' | 'is_null'
  column: string
  value: unknown
}

export interface P6CapturedUpdate {
  table: string
  patch: Record<string, unknown>
  filters: P6CapturedFilter[]
}

export interface P6CapturedUpsert {
  table: string
  rows: P6FakeRow[]
  options?: Record<string, unknown>
}

export interface P6CapturedSelect {
  table: string
  filters: P6CapturedFilter[]
}

export const SEO_INTERLINK_DEFAULTS: P6FakeRow = {
  status: 'planned',
  applied_at: null,
  source_url: null,
  source_job_id: null,
  verification_state: null,
  verified_at: null,
  verification_evidence: null,
  verification_attempted_at: null,
  gate_state: null,
  gate_reason: null,
  gate_actor: null,
  gate_updated_at: null,
}

function matches(filter: P6CapturedFilter, row: P6FakeRow): boolean {
  const value = row[filter.column]
  if (filter.op === 'eq') return value === filter.value
  // `.is(column, null)` — the M2/H1 compare-and-set fence on a NULL revision
  // column. `undefined` (column absent from the fixture) counts as NULL.
  if (filter.op === 'is_null') return value === null || value === undefined
  if (filter.op === 'not_is_null') return value !== null && value !== undefined
  return Array.isArray(filter.value) && (filter.value as unknown[]).includes(value)
}

export interface P6FakeDbOptions {
  /** Clock for the emulated updated_at trigger (defaults to Date.now). */
  now?: () => number
  /** Run after a select snapshot is computed but before it resolves. */
  afterSelect?: (rows: P6FakeRow[]) => void
}

export function createP6FakeDb(seed: P6FakeRow[] = [], opts: P6FakeDbOptions = {}) {
  const rows: P6FakeRow[] = seed.map((row) => ({ ...row }))
  const now = opts.now || (() => Date.now())
  const updates: P6CapturedUpdate[] = []
  const upserts: P6CapturedUpsert[] = []
  const selects: P6CapturedSelect[] = []
  let idSeq = rows.length

  const client = {
    from(table: string) {
      const filters: P6CapturedFilter[] = []
      let mode: 'select' | 'update' | 'upsert' = 'select'
      let patch: Record<string, unknown> = {}
      let returnAffected = false
      const builder: Record<string, unknown> = {
        select() {
          // `.select()` after `.update()` is the PostgREST affected-row read.
          if (mode === 'update') returnAffected = true
          return builder
        },
        eq(column: string, value: unknown) {
          filters.push({ op: 'eq', column, value })
          return builder
        },
        in(column: string, value: unknown) {
          filters.push({ op: 'in', column, value })
          return builder
        },
        is(column: string, value: unknown) {
          // Only `.is(col, null)` is used by the production finalizers/stagers.
          if (value !== null) throw new Error(`unsupported .is(${column}, ${String(value)})`)
          filters.push({ op: 'is_null', column, value })
          return builder
        },
        not(column: string, operator: string) {
          // Only `.not(col, 'is', null)` is used by the production loaders.
          filters.push({ op: 'not_is_null', column, value: operator })
          return builder
        },
        order() {
          return builder
        },
        limit() {
          return builder
        },
        update(next: Record<string, unknown>) {
          mode = 'update'
          patch = next
          return builder
        },
        upsert(next: P6FakeRow | P6FakeRow[], options?: Record<string, unknown>) {
          mode = 'upsert'
          const list = Array.isArray(next) ? next : [next]
          upserts.push({ table, rows: list, options })
          const conflict = String(options?.onConflict ?? '')
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean)
          for (const incoming of list) {
            const existing = conflict.length
              ? rows.find((row) => conflict.every((column) => row[column] === incoming[column]))
              : undefined
            if (existing) {
              Object.assign(existing, incoming)
              continue
            }
            const base = table === 'seo_interlinks' ? { ...SEO_INTERLINK_DEFAULTS } : {}
            const inserted: P6FakeRow = { ...base, ...incoming }
            if (inserted.id == null) inserted.id = `${table}-${++idSeq}`
            rows.push(inserted)
          }
          return builder
        },
        then(
          resolve?: ((value: { data: P6FakeRow[] | null; error: null }) => unknown) | null,
          reject?: ((reason: unknown) => unknown) | null,
        ) {
          if (mode === 'update') {
            updates.push({ table, patch, filters: [...filters] })
            const affected = rows.filter((row) => filters.every((filter) => matches(filter, row)))
            for (const row of rows) {
              if (filters.every((filter) => matches(filter, row))) {
                Object.assign(row, patch)
                // BEFORE UPDATE trigger: updated_at is ALWAYS now(), later than
                // any app timestamp written in the same patch.
                row.updated_at = new Date(now()).toISOString()
              }
            }
            const data = returnAffected ? affected.map((row) => ({ id: row.id })) : null
            return Promise.resolve({ data, error: null }).then(resolve ?? undefined, reject ?? undefined)
          }
          if (mode === 'upsert') {
            return Promise.resolve({ data: null, error: null }).then(resolve ?? undefined, reject ?? undefined)
          }
          selects.push({ table, filters: [...filters] })
          const data = rows
            .filter((row) => filters.every((filter) => matches(filter, row)))
            .map((row) => ({ ...row }))
          if (typeof opts.afterSelect === 'function') opts.afterSelect(rows)
          return Promise.resolve({ data, error: null }).then(resolve ?? undefined, reject ?? undefined)
        },
      }
      return builder
    },
  }

  return { client, rows, updates, upserts, selects }
}
