const API = (ref) => `https://api.supabase.com/v1/projects/${ref}/database/query`
const DEFAULT_SLEEP = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const truncate = (body) => String(body ?? '').slice(0, 400)

export class ManagementSqlError extends Error {
  constructor(message, { status = 0, body = '' } = {}) {
    super(message)
    this.name = 'ManagementSqlError'
    this.status = status
    this.body = body
  }
}

export function classifyResult(result) {
  if (result.ok) return 'success'
  if (result.status === 429 || result.status >= 500 || result.status === 0) return 'transient'
  return 'permanent'
}

export function createManagementSqlClient({
  projectRef,
  accessToken,
  fetchImpl = fetch,
  sleepFn = DEFAULT_SLEEP,
  maxAttempts = 3,
  backoffMs = 1000,
}) {
  if (!projectRef || !accessToken) throw new Error('management-sql: projectRef and accessToken are required')

  const runSql = async (sql) => {
    try {
      const res = await fetchImpl(API(projectRef), {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sql }),
      })
      return { ok: res.ok, status: res.status, body: await res.text() }
    } catch (err) {
      return { ok: false, status: 0, body: String(err) }
    }
  }

  const query = (sql) => runQueryWithRetry(sql, { runSql, sleepFn, maxAttempts, backoffMs })

  const execute = async (sql) => {
    let last = { ok: false, status: 0, body: 'no attempt made' }
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      last = await runSql(sql)
      const cls = classifyResult(last)
      if (cls === 'success' || cls === 'permanent' || attempt === maxAttempts) return last
      await sleepFn(backoffMs * attempt)
    }
    return last
  }

  return { runSql, classifyResult, query, execute }
}

export async function runQueryWithRetry(sql, { runSql, sleepFn = DEFAULT_SLEEP, maxAttempts = 3, backoffMs = 1000 }) {
  let last = { ok: false, status: 0, body: 'no attempt made' }
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      last = await runSql(sql)
    } catch (err) {
      // Explicit interface contract: a thrown network error is status 0 (transient),
      // never dependent on the concrete fetch wrapper swallowing it.
      last = { ok: false, status: 0, body: String(err) }
    }
    const cls = classifyResult(last)
    if (cls === 'success') {
      try {
        return JSON.parse(last.body || '[]')
      } catch {
        throw new ManagementSqlError(`query returned non-JSON body: ${truncate(last.body)}`, last)
      }
    }
    if (cls === 'permanent' || attempt === maxAttempts) {
      throw new ManagementSqlError(`query failed (HTTP ${last.status}): ${truncate(last.body)}`, last)
    }
    await sleepFn(backoffMs * attempt)
  }
}

export async function verifyPostgresRuntimeRole(client) {
  const rows = await client.query(
    `SELECT current_user, session_user, current_setting('role', true) AS role`,
  )
  const row = rows[0] ?? {}
  return {
    ok: row.current_user === 'postgres' && row.session_user === 'postgres',
    currentUser: row.current_user,
    sessionUser: row.session_user,
    role: row.role,
  }
}

export async function readNativeMigrationHistory(client) {
  return client.query(`SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version`)
}

export async function readLedgerRows(client) {
  const reg = await client.query(
    `SELECT to_regclass('supabase_migrations.yousafe_migration_ledger') AS ledger_reg`,
  )
  if (!reg[0]?.ledger_reg) return { exists: false, rows: [] }
  const rows = await client.query(
    `SELECT filename, sha256, applied_by, source_git_sha FROM supabase_migrations.yousafe_migration_ledger ORDER BY filename`,
  )
  return { exists: true, rows }
}

export { truncate }
