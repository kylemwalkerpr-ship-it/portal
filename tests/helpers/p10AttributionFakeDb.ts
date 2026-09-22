/**
 * Minimal in-memory PostgREST-like client for the P10 attribution suites.
 *
 * Supports exactly the surface the production code uses:
 *   insert -> select -> single            (append event / issue session / link)
 *   insert                                (link row, no returning clause)
 *   select -> eq -> maybeSingle / single  (resolve session, dedupe read-back)
 *   select -> limit                        (session sample for coverage)
 *   update -> eq                           (last_seen_at, consent withdrawal)
 *   select (view)                          (p10_conversion_chain_coverage)
 *
 * Uniqueness is enforced on the same columns as the migration, and a duplicate
 * insert returns Postgres error code 23505 — which is the contract the engine's
 * deterministic idempotency depends on. Every write is captured so a suite can
 * prove "consent denied → zero writes".
 *
 * The migration's `conversion_events` CHECK constraints are mirrored too
 * (Postgres error code 23514 / check_violation), so the attribution-state truth
 * model — attributed = known source, session_only = consented session with an
 * unknown source, unknown_source = no session — is enforced in tests by storage,
 * not only by the writer that happens to be under test.
 */

export type P10Row = Record<string, unknown>

export type P10CapturedWrite = {
  table: string
  kind: 'insert' | 'update'
  rows: P10Row[]
  patch?: P10Row
}

export type P10FakeDbOptions = {
  /** Tables reported as absent (PGRST205) — proves fail-closed behaviour. */
  missingTables?: string[]
  /** Force an error message on insert for a table. */
  failInsert?: Record<string, string>
  now?: () => number
}

const UNIQUE_COLUMNS: Record<string, string[]> = {
  conversion_attribution_sessions: ['identity_hash'],
  conversion_attribution_links: ['handoff_nonce'],
  conversion_events: ['event_key'],
}

/**
 * Mirrors `conversion_events_attribution_shape`, `conversion_events_consent_shape`
 * and the `attribution_state` value check from
 * supabase/migrations/20260922120000_p10_conversion_attribution.sql.
 * Returns the violated constraint name, or null when the row is storable.
 */
function conversionEventCheckViolation(row: P10Row): string | null {
  if (row.attribution_state === undefined) return null
  const state = String(row.attribution_state)
  const sessionId = row.session_id ?? null
  const sourceClass = row.source_class ?? null

  if (state === 'attributed') {
    if (sessionId === null || sourceClass === null || sourceClass === 'unknown') {
      return 'conversion_events_attribution_shape'
    }
  } else if (state === 'session_only') {
    if (sessionId === null || sourceClass !== 'unknown') return 'conversion_events_attribution_shape'
  } else if (state === 'unknown_source') {
    if (sessionId !== null || sourceClass !== null) return 'conversion_events_attribution_shape'
  } else {
    return 'conversion_events_attribution_state_check'
  }

  const observation = String(row.observation ?? '')
  const consent = String(row.consent_state ?? '')
  if (observation === 'client_declared' && consent !== 'granted') {
    return 'conversion_events_consent_shape'
  }
  if (observation === 'server_observed') {
    if (state === 'attributed' || state === 'session_only') {
      if (consent !== 'granted') return 'conversion_events_consent_shape'
    } else if (state === 'unknown_source') {
      const evidence = (row.evidence ?? {}) as Record<string, unknown>
      const named = String(evidence.consent_evidence ?? '').trim()
      const allowed = consent === 'unknown' || ((consent === 'granted' || consent === 'denied') && named.length > 0)
      if (!allowed) return 'conversion_events_consent_shape'
    }
  }
  return null
}

function matches(row: P10Row, column: string, value: unknown): boolean {
  return row[column] === value
}

/**
 * Mirrors supabase/migrations/20260922120000_p10_conversion_attribution.sql
 * `p10_conversion_chain_coverage` for the read-only report path. The SQL view is
 * the production authority; this only has to agree on the columns the route reads.
 */
function buildCoverageView(events: P10Row[]): P10Row[] {
  const byCluster = new Map<string, P10Row[]>()
  for (const event of events) {
    const cluster = String(event.cluster ?? '').trim() || 'unclassified'
    const list = byCluster.get(cluster) ?? []
    list.push(event)
    byCluster.set(cluster, list)
  }
  const rows: P10Row[] = []
  for (const [cluster, list] of byCluster) {
    const countType = (type: string) => list.filter((e) => e.event_type === type).length
    const businessCount = list.filter((e) =>
      ['lead_created', 'order_paid', 'order_refunded', 'order_cancelled'].includes(String(e.event_type)),
    ).length
    const sumAmount = (type: string) =>
      list
        .filter((e) => e.event_type === type && e.amount_cents !== null && e.amount_cents !== undefined)
        .reduce((total, e) => total + Number(e.amount_cents), 0)
    rows.push({
      cluster,
      landing_events: countType('landing'),
      cta_click_events: countType('cta_click'),
      lead_events: countType('lead_created'),
      paid_events: countType('order_paid'),
      refund_events: countType('order_refunded'),
      cancelled_events: countType('order_cancelled'),
      // attributed counts ONLY known-source paid events; a consented session with
      // an unknown source is session_only and can never inflate this number.
      attributed_paid_events: list.filter(
        (e) =>
          e.event_type === 'order_paid' &&
          e.attribution_state === 'attributed' &&
          e.source_class !== null &&
          e.source_class !== undefined &&
          e.source_class !== 'unknown',
      ).length,
      session_only_paid_events: list.filter((e) => e.event_type === 'order_paid' && e.attribution_state === 'session_only')
        .length,
      unknown_source_paid_events: list.filter((e) => e.event_type === 'order_paid' && e.attribution_state === 'unknown_source').length,
      paid_amount_cents: sumAmount('order_paid'),
      refunded_amount_cents: sumAmount('order_refunded'),
      client_declared_events: list.filter((e) => e.observation === 'client_declared').length,
      server_observed_events: list.filter((e) => e.observation === 'server_observed').length,
      consent_granted_events: list.filter((e) => e.consent_state === 'granted').length,
      consent_unknown_events: list.filter((e) => e.consent_state === 'unknown').length,
      measurement_state: businessCount === 0 ? 'no_observed_business_events' : 'observed_business_events_present',
    })
  }
  return rows
}

export function createP10FakeDb(seed: Record<string, P10Row[]> = {}, opts: P10FakeDbOptions = {}) {
  const tables = new Map<string, P10Row[]>()
  for (const [table, rows] of Object.entries(seed)) {
    tables.set(table, rows.map((row) => ({ ...row })))
  }
  const writes: P10CapturedWrite[] = []
  let idCounter = 0
  const nextId = () => `00000000-0000-4000-8000-${String(++idCounter).padStart(12, '0')}`

  function missing(table: string) {
    return (opts.missingTables ?? []).includes(table)
  }

  function stateFor(table: string) {
    if (!tables.has(table)) tables.set(table, [])
    return table === 'p10_conversion_chain_coverage'
      ? buildCoverageView(tables.get('conversion_events') ?? [])
      : tables.get(table)!
  }

  function duplicate(table: string, row: P10Row): boolean {
    const unique = UNIQUE_COLUMNS[table]
    if (!unique) return false
    return stateFor(table).some((existing) =>
      unique.every((column) => existing[column] !== undefined && existing[column] === row[column]),
    )
  }

  function applyInsert(table: string, row: P10Row): { data: P10Row | null; error: { code?: string; message?: string } | null } {
    writes.push({ table, kind: 'insert', rows: [row] })
    if (missing(table)) return { data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${table}'` } }
    const forced = opts.failInsert?.[table]
    if (forced) return { data: null, error: { message: forced } }
    if (table === 'conversion_events') {
      const violation = conversionEventCheckViolation(row)
      if (violation) {
        return {
          data: null,
          error: {
            code: '23514',
            message: `new row for relation "${table}" violates check constraint "${violation}"`,
          },
        }
      }
    }
    if (duplicate(table, row)) {
      return { data: null, error: { code: '23505', message: `duplicate key value violates unique constraint "${table}"` } }
    }
    const stored: P10Row = { id: row.id ?? nextId(), ...row }
    stateFor(table).push(stored)
    return { data: stored, error: null }
  }

  function chain(table: string) {
    const filters: Array<[string, unknown]> = []
    let selection = '*'
    let limitCount: number | null = null
    let headCount = false

    const api: any = {
      select(columns = '*') {
        selection = columns
        return api
      },
      eq(column: string, value: unknown) {
        filters.push([column, value])
        return api
      },
      limit(count: number) {
        limitCount = count
        return api
      },
      order() {
        return api
      },
      insert(row: P10Row) {
        const result = applyInsert(table, row)
        return {
          data: result.data,
          error: result.error,
          select() {
            return {
              single: async () => result,
            }
          },
          then(resolve: (value: unknown) => unknown) {
            return Promise.resolve({ data: null, error: result.error }).then(resolve)
          },
        }
      },
      update(patch: P10Row) {
        writes.push({ table, kind: 'update', rows: [], patch })
        return {
          eq: async (column: string, value: unknown) => {
            if (missing(table)) {
              return { data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${table}'` } }
            }
            for (const existing of stateFor(table)) {
              if (matches(existing, column, value)) Object.assign(existing, patch)
            }
            return { data: null, error: null }
          },
        }
      },
      maybeSingle: async () => {
        if (missing(table)) {
          return { data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${table}'` } }
        }
        const rows = filtered()
        return { data: rows[0] ?? null, error: null }
      },
      single: async () => {
        if (missing(table)) {
          return { data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${table}'` } }
        }
        const rows = filtered()
        return rows[0]
          ? { data: rows[0], error: null }
          : { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } }
      },
      // Awaiting the builder directly (no terminal modifier) resolves a list.
      then: (resolve: (value: unknown) => unknown) => {
        void selection
        void headCount
        const rows = filtered()
        const projected = rows.map((row) => (selection === '*' ? row : project(row, selection)))
        return Promise.resolve({
          data: limitCount === null ? projected : projected.slice(0, limitCount),
          error: missing(table) ? { code: 'PGRST205', message: `Could not find the table 'public.${table}'` } : null,
        }).then(resolve)
      },
    }

    function filtered(): P10Row[] {
      const rows = stateFor(table)
      return rows.filter((row) => filters.every(([column, value]) => matches(row, column, value)))
    }

    return api
  }

  function project(row: P10Row, selection: string): P10Row {
    if (selection.trim() === '*') return row
    const columns = selection.split(',').map((value) => value.trim()).filter(Boolean)
    const projected: P10Row = {}
    for (const column of columns) projected[column] = row[column] ?? null
    return projected
  }

  return {
    client: {
      from: (table: string) => chain(table),
    },
    tables,
    writes,
    rows: (table: string) => stateFor(table),
  }
}
