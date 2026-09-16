/**
 * Guards the migration estate against transaction-blocking SQL (T10, INV-9):
 *  - no top-level BEGIN/COMMIT/ROLLBACK;
 *  - no denied statements (CREATE INDEX CONCURRENTLY, REINDEX, VACUUM,
 *    CREATE DATABASE, ALTER SYSTEM);
 *  - every migration ends with `;`.
 *
 * The policy module is ESM and is exercised through child subprocesses (same
 * pattern as migration-ledger-policy.test.ts), so what CI runs is what is
 * tested.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const POLICY = join(ROOT, 'scripts', 'migration-ledger-policy.mjs')
const ORDER = join(ROOT, 'scripts', 'migration-order.mjs')

function evalPolicy<T>(body: string): T {
  const code = `
    const policy = await import(${JSON.stringify(POLICY)})
    const { migrationOrder, MIGRATIONS_DIR } = await import(${JSON.stringify(ORDER)})
    ${body}
  `
  return JSON.parse(execFileSync('node', ['--input-type=module', '--eval', code], { encoding: 'utf8' }))
}

describe('migration transaction safety', () => {
  it('T10.1 scans the whole estate clean and confirms trailing semicolons', () => {
    const result = evalPolicy<{
      count: number
      notClean: string[]
      missingSemicolon: string[]
    }>(`
      const { readFileSync } = await import('node:fs')
      const { join: joinPath } = await import('node:path')
      const notClean = []
      const missingSemicolon = []
      const files = migrationOrder()
      for (const filename of files) {
        const sql = readFileSync(joinPath(MIGRATIONS_DIR, filename), 'utf8')
        if (policy.scanTransactionSafety(filename, sql).length !== 0) notClean.push(filename)
        if (!/;\\s*$/.test(sql)) missingSemicolon.push(filename)
      }
      console.log(JSON.stringify({ count: files.length, notClean, missingSemicolon }))
    `)
    expect(result.count).toBe(69)
    expect(result.notClean).toEqual([])
    expect(result.missingSemicolon).toEqual([])
  })

  it('T10.2 flags top-level transaction control', () => {
    const rules = evalPolicy<Record<string, string[]>>(`
      const rulesFor = (sql) => policy.scanTransactionSafety('x.sql', sql).map((violation) => violation.rule)
      console.log(JSON.stringify({
        beginCommit: rulesFor('BEGIN;\\nSELECT 1;\\nCOMMIT;'),
        rollback: rulesFor('ROLLBACK;'),
      }))
    `)
    expect(rules.beginCommit).toContain('TOP_LEVEL_TXN_CONTROL')
    expect(rules.rollback).toContain('TOP_LEVEL_TXN_CONTROL')
  })

  it('T10.3 flags denied statements', () => {
    const rules = evalPolicy<Record<string, string[]>>(`
      const rulesFor = (sql) => policy.scanTransactionSafety('x.sql', sql).map((violation) => violation.rule)
      console.log(JSON.stringify({
        indexConcurrently: rulesFor('CREATE INDEX CONCURRENTLY idx ON content_jobs (id);'),
        reindex: rulesFor('REINDEX TABLE content_jobs;'),
        vacuum: rulesFor('VACUUM (ANALYZE) content_jobs;'),
        createDatabase: rulesFor('CREATE DATABASE scratch;'),
        alterSystem: rulesFor("ALTER SYSTEM SET work_mem = '64MB';"),
      }))
    `)
    expect(rules.indexConcurrently).toContain('DENIED_STATEMENT')
    expect(rules.reindex).toContain('DENIED_STATEMENT')
    expect(rules.vacuum).toContain('DENIED_STATEMENT')
    expect(rules.createDatabase).toContain('DENIED_STATEMENT')
    expect(rules.alterSystem).toContain('DENIED_STATEMENT')
  })

  it('T10.4 requires a trailing semicolon', () => {
    const rules = evalPolicy<string[]>(`
      console.log(JSON.stringify(
        policy.scanTransactionSafety('x.sql', 'SELECT 1').map((violation) => violation.rule),
      ))
    `)
    expect(rules).toContain('MISSING_TRAILING_SEMICOLON')
  })

  it('T10.5 allows stripped PL/pgSQL bodies, string literals, and comments', () => {
    const rules = evalPolicy<Record<string, string[]>>(`
      const rulesFor = (sql) => policy.scanTransactionSafety('x.sql', sql).map((violation) => violation.rule)
      console.log(JSON.stringify({
        plpgsql: rulesFor('DO $$ BEGIN PERFORM 1; END $$;'),
        taggedPlpgsql: rulesFor('DO $fn$ BEGIN PERFORM 1; END $fn$;'),
        taggedVerify: rulesFor('DO $verify$ BEGIN PERFORM 1; END $verify$;'),
        taggedFunction: rulesFor('CREATE FUNCTION f() RETURNS void LANGUAGE plpgsql AS $fn$ BEGIN PERFORM 1; END $fn$;'),
        stringLiteral: rulesFor("SELECT 'COMMIT;' AS x;"),
        comment: rulesFor('-- BEGIN;\\nSELECT 1;'),
      }))
    `)
    expect(rules.plpgsql).toEqual([])
    expect(rules.taggedPlpgsql).toEqual([])
    expect(rules.taggedVerify).toEqual([])
    expect(rules.taggedFunction).toEqual([])
    expect(rules.stringLiteral).toEqual([])
    expect(rules.comment).toEqual([])
  })

  it('T10.6 ddlOnly strips dollar-quoted bodies, comments, and literals', () => {
    const stripped = evalPolicy<Record<string, string>>(`
      console.log(JSON.stringify({
        untagged: policy.ddlOnly("DO $$ BEGIN RAISE NOTICE 'x'; END $$; -- end"),
        tagged: policy.ddlOnly("DO $fn$ BEGIN RAISE NOTICE 'x'; END $fn$; -- end"),
      }))
    `)
    expect(stripped.untagged).not.toContain('BEGIN')
    expect(stripped.untagged).not.toContain('RAISE')
    expect(stripped.untagged).not.toContain('end')
    expect(stripped.tagged).not.toContain('BEGIN')
    expect(stripped.tagged).not.toContain('RAISE')
    expect(stripped.tagged).not.toContain('end')
  })

  it('T10.7 reports transaction safety OK from the --check CLI', () => {
    const res = spawnSync('node', [POLICY, '--check'], { encoding: 'utf8' })
    expect(res.status).toBe(0)
    expect(res.stderr).toContain(
      'migration-ledger-policy: manifest OK (69 files: 8 base, 57 timestamped, 4 index)',
    )
    expect(res.stderr).toContain('migration-ledger-policy: naming policy OK')
    expect(res.stderr).toContain('migration-ledger-policy: transaction safety OK')
  })
})
