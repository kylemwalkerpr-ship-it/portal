/**
 * Guards the migration apply order.
 *
 * Two regressions this locks down:
 *  1. A new migration silently never being applied (the bug that left
 *     `20260815_keyword_partition.sql` unapplied while prod code assumed its
 *     columns existed).
 *  2. A dependency-unsafe order — e.g. replacing the pinned list with a naive
 *     `*.sql | sort`, which puts `20260806_*.sql` (ALTER content_jobs) ahead of
 *     `content_jobs.sql` (CREATE content_jobs) and fails on a fresh database.
 *
 * Exercised through the CLI, so what CI actually runs is what is tested.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const SCRIPT = join(ROOT, 'scripts', 'migration-order.mjs')
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations')

function cli(...args: string[]): string {
  return execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8' })
}

const meta = JSON.parse(cli('--json')) as {
  order: string[]
  base: string[]
  timestamped: string[]
  indexes: string[]
  timestampedPattern: string
}
const order = meta.order
const read = (f: string) => readFileSync(join(MIGRATIONS_DIR, f), 'utf8')
const onDisk = () => readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()

/** Strip comments + string/dollar-quoted bodies so we only match real DDL. */
function ddlOnly(sql: string): string {
  return sql
    .replace(/\$\$[\s\S]*?\$\$/g, ' ') // function / DO bodies
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''")
}

const tablesCreated = (sql: string): string[] =>
  [
    ...ddlOnly(sql).matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?/gi,
    ),
  ].map((m) => m[1].toLowerCase())

const tablesAltered = (sql: string): string[] =>
  [
    ...ddlOnly(sql).matchAll(
      /alter\s+table\s+(?:only\s+)?(?:if\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?/gi,
    ),
  ]
    .map((m) => m[1].toLowerCase())
    .filter((t) => t !== 'if' && t !== 'only')

const tablesIndexed = (sql: string): string[] =>
  [
    ...ddlOnly(sql).matchAll(
      /create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?[a-z0-9_"]+\s+on\s+(?:public\.)?"?([a-z0-9_]+)"?/gi,
    ),
  ].map((m) => m[1].toLowerCase())

/**
 * Tables some migration creates somewhere. Several index-only files target
 * tables that live outside supabase/migrations/ entirely (gigs, orders,
 * attorneys, …), so ordering says nothing about them — only tables this
 * directory owns can be ordered wrongly.
 */
function migrationOwnedTables(files: string[]): Set<string> {
  const owned = new Set<string>()
  for (const f of files) for (const t of tablesCreated(read(f))) owned.add(t)
  return owned
}

/** Files that touch a migration-owned table before any earlier file creates it. */
function dependencyViolations(sequence: string[]): string[] {
  const owned = migrationOwnedTables(sequence)
  const created = new Set<string>()
  const violations: string[] = []
  for (const file of sequence) {
    const sql = read(file)
    // Same-file CREATEs precede that file's own ALTERs by authorship.
    for (const t of tablesCreated(sql)) created.add(t)
    for (const t of [...tablesAltered(sql), ...tablesIndexed(sql)]) {
      if (owned.has(t) && !created.has(t)) {
        violations.push(`${file}: touches "${t}" before any CREATE TABLE`)
      }
    }
  }
  return violations
}

describe('migration apply order', () => {
  it('covers every .sql file on disk exactly once', () => {
    expect([...order].sort()).toEqual(onDisk())
    expect(new Set(order).size).toBe(order.length)
  })

  it('creates every table before any migration alters or indexes it', () => {
    expect(dependencyViolations(order)).toEqual([])
  })

  it('would reject a naive alphabetical sort (proves the check has teeth)', () => {
    // The tempting one-line replacement for the hardcoded list breaks a fresh
    // database, because legacy files lack timestamp prefixes.
    expect(dependencyViolations(onDisk()).length).toBeGreaterThan(0)
  })

  it('puts the base schema first and index-only passes last', () => {
    expect(order.slice(0, meta.base.length)).toEqual(meta.base)
    expect(order.slice(-meta.indexes.length)).toEqual(meta.indexes)
  })

  it('keeps auto-registered migrations in chronological order', () => {
    expect(meta.timestamped).toEqual([...meta.timestamped].sort())
    expect(meta.timestamped.length).toBeGreaterThan(0)
  })

  it('auto-registers a new timestamped migration without touching any list', () => {
    const pattern = new RegExp(meta.timestampedPattern)
    expect(pattern.test('20270101_brand_new_thing.sql')).toBe(true)
    // Non-conforming names are rejected rather than silently skipped.
    expect(pattern.test('brand_new_thing.sql')).toBe(false)
  })

  it('fails loudly on a migration that no tier claims', () => {
    const dir = join(
      require('node:os').tmpdir(),
      `migorder-${process.pid}-${Math.random().toString(36).slice(2)}`,
    )
    const fs = require('node:fs') as typeof import('node:fs')
    fs.mkdirSync(dir, { recursive: true })
    try {
      for (const f of [...meta.base, ...meta.indexes]) fs.writeFileSync(join(dir, f), '-- stub\n')
      fs.writeFileSync(join(dir, 'unclaimed_migration.sql'), '-- stub\n')
      expect(() =>
        execFileSync('node', ['--input-type=module', '-e', `
          import { migrationOrder } from ${JSON.stringify(SCRIPT)}
          migrationOrder({ dir: ${JSON.stringify(dir)} })
        `], { encoding: 'utf8', stdio: 'pipe' }),
      ).toThrow(/unclaimed migration/i)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('is the only apply list — workflow has no inline hardcoded files', () => {
    const wf = readFileSync(
      join(ROOT, '.github', 'workflows', 'apply-seo-factory-migrations.yml'),
      'utf8',
    )
    expect(wf).toMatch(/scripts\/migration-order\.mjs/)
    // A reintroduced inline list is the exact drift this replaces.
    expect(wf.match(/supabase\/migrations\/[a-z0-9_]+\.sql/gi)).toBeNull()
  })
})
