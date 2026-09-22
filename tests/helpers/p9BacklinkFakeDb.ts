/**
 * Minimal in-memory PostgREST-like client for the P9 external-authority suites.
 *
 * Supports exactly the surface the production code uses:
 *   select -> eq / in / neq / limit / order / single   (read)
 *   insert -> select -> single                          (append evidence / outreach)
 *   update -> eq / neq -> select('id')                  (fenced won transition)
 *
 * `single()` mirrors PostgREST's `Accept: application/vnd.pgrst.object+json`:
 * exactly one row is returned as an object, zero rows is an error. Insert
 * failures can be scripted so a suite can prove "no durable evidence → no win".
 */

export type P9FakeRow = Record<string, unknown>

export interface P9CapturedFilter {
  op: 'eq' | 'neq' | 'in' | 'is_null' | 'not_is_null'
  column: string
  value: unknown
}

export interface P9CapturedWrite {
  table: string
  kind: 'insert' | 'update'
  rows: P9FakeRow[]
  patch?: P9FakeRow
  filters: P9CapturedFilter[]
}

export interface P9CapturedSelect {
  table: string
  filters: P9CapturedFilter[]
}

export interface P9FakeDbOptions {
  now?: () => number
  /** Scripted insert failures: `${table}` → error message. */
  failInsert?: Record<string, string>
}

function matches(filter: P9CapturedFilter, row: P9FakeRow): boolean {
  const value = row[filter.column]
  if (filter.op === 'eq') return value === filter.value
  if (filter.op === 'neq') return value !== filter.value
  if (filter.op === 'is_null') return value === null || value === undefined
  if (filter.op === 'not_is_null') return value !== null && value !== undefined
  return Array.isArray(filter.value) && (filter.value as unknown[]).includes(value)
}

export function createP9FakeDb(
  seed: Record<string, P9FakeRow[]> = {},
  opts: P9FakeDbOptions = {},
) {
  const tables = new Map<string, P9FakeRow[]>()
  for (const [table, rows] of Object.entries(seed)) {
    tables.set(
      table,
      rows.map((row) => ({ ...row })),
    )
  }
  const rowsOf = (table: string): P9FakeRow[] => {
    if (!tables.has(table)) tables.set(table, [])
    return tables.get(table) as P9FakeRow[]
  }
  const writes: P9CapturedWrite[] = []
  const selects: P9CapturedSelect[] = []
  let idSeq = 0
  const now = opts.now || (() => Date.now())

  const client = {
    from(table: string) {
      const filters: P9CapturedFilter[] = []
      let mode: 'select' | 'insert' | 'update' = 'select'
      let payload: P9FakeRow | P9FakeRow[] | null = null
      let patch: P9FakeRow | null = null
      let wantSingle = false
      let returnAffected = false
      let limitCount: number | null = null

      const settle = (): { data: unknown; error: { message: string } | null } => {
        const rows = rowsOf(table)
        if (mode === 'insert') {
          const scripted = opts.failInsert?.[table]
          if (scripted) return { data: null, error: { message: scripted } }
          const incoming = (Array.isArray(payload) ? payload : [payload]) as P9FakeRow[]
          const inserted = incoming.map((row) => {
            const rowWithId: P9FakeRow = {
              id: row.id ?? `${table}-${++idSeq}`,
              created_at: row.created_at ?? new Date(now()).toISOString(),
              ...row,
            }
            rows.push(rowWithId)
            return { ...rowWithId }
          })
          writes.push({ table, kind: 'insert', rows: inserted, filters: [...filters] })
          if (wantSingle) {
            return inserted.length === 1
              ? { data: inserted[0], error: null }
              : { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned' } }
          }
          return { data: inserted, error: null }
        }
        if (mode === 'update') {
          const matched = rows.filter((row) => filters.every((filter) => matches(filter, row)))
          for (const row of matched) Object.assign(row, patch)
          writes.push({ table, kind: 'update', rows: matched.map((row) => ({ ...row })), patch: patch ?? {}, filters: [...filters] })
          const data = returnAffected ? matched.map((row) => ({ id: row.id })) : null
          if (wantSingle) {
            return matched.length === 1
              ? { data: matched[0], error: null }
              : { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned' } }
          }
          return { data, error: null }
        }
        selects.push({ table, filters: [...filters] })
        const matched = rows.filter((row) => filters.every((filter) => matches(filter, row)))
        const limited = limitCount == null ? matched : matched.slice(0, limitCount)
        const data = limited.map((row) => ({ ...row }))
        if (wantSingle) {
          return data.length === 1
            ? { data: data[0], error: null }
            : { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned' } }
        }
        return { data, error: null }
      }

      const builder: Record<string, unknown> = {
        select(_columns?: string) {
          if (mode === 'insert' || mode === 'update') returnAffected = true
          return builder
        },
        insert(values: P9FakeRow | P9FakeRow[]) {
          mode = 'insert'
          payload = values
          return builder
        },
        update(values: P9FakeRow) {
          mode = 'update'
          patch = values
          return builder
        },
        eq(column: string, value: unknown) {
          filters.push({ op: 'eq', column, value })
          return builder
        },
        neq(column: string, value: unknown) {
          filters.push({ op: 'neq', column, value })
          return builder
        },
        in(column: string, value: unknown) {
          filters.push({ op: 'in', column, value })
          return builder
        },
        is(column: string, value: unknown) {
          if (value !== null) throw new Error(`unsupported .is(${column}, ${String(value)})`)
          filters.push({ op: 'is_null', column, value })
          return builder
        },
        not(column: string, _operator: string, value: unknown) {
          if (value !== null) throw new Error(`unsupported .not(${column}, ${String(value)})`)
          filters.push({ op: 'not_is_null', column, value })
          return builder
        },
        order() {
          return builder
        },
        limit(count: number) {
          limitCount = count
          return builder
        },
        single() {
          wantSingle = true
          return builder
        },
        then(
          resolve?: ((value: { data: unknown; error: { message: string } | null }) => unknown) | null,
          reject?: ((reason: unknown) => unknown) | null,
        ) {
          return Promise.resolve(settle()).then(resolve ?? undefined, reject ?? undefined)
        },
      }
      return builder
    },
  }

  return {
    client,
    tables,
    rows: rowsOf,
    writes,
    selects,
    insertsFor: (table: string) => writes.filter((write) => write.kind === 'insert' && write.table === table),
    updatesFor: (table: string) => writes.filter((write) => write.kind === 'update' && write.table === table),
  }
}
