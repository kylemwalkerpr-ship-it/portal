/**
 * Post-P4 Supabase advisor remediation contract.
 *
 * Production advisor finding: public.seo_cannibal_decisions_append_only had a
 * mutable search_path. The applied P4 migration is history and must stay
 * byte-for-byte frozen; the fix ships as a NEW additive, function-only
 * migration that pins the trigger to an empty search_path (its body is a bare
 * RAISE EXCEPTION with no relation references, so nothing can break).
 *
 * This suite proves three things:
 *  1. the remediation migration is the smallest safe DDL and only touches that
 *     one function (no scope broadening to other advisor findings);
 *  2. the mutable-search_path condition really existed after the P4 migration
 *     and is closed by the remediation in the real `migration-order` sequence,
 *     and stays closed for every later migration;
 *  3. the historical P4 migration is unchanged (pinned SHA-256).
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations')
const ORDER_SCRIPT = join(ROOT, 'scripts', 'migration-order.mjs')

const P4_FILE = '20260920090000_p4_cannibal_decisions.sql'
/** Frozen when the P4 ledger migration was applied; editing it fails this test. */
const P4_SHA256 = 'aeae74c2e703406c75e722f2512221a9273281f1ab14e95f86bfd5bbd5ef724d'
const FUNCTION_NAME = 'public.seo_cannibal_decisions_append_only'
const PINNED_SEARCH_PATH_RE = /set\s+search_path\s*=\s*''/i
const FUTURE_MIGRATION_RE = /^\d{14}_[a-z0-9_]+\.sql$/

const read = (filename: string) =>
  readFileSync(join(MIGRATIONS_DIR, filename), 'utf8')
const sha256 = (filename: string) =>
  createHash('sha256').update(readFileSync(join(MIGRATIONS_DIR, filename))).digest('hex')

/** Strip comments + dollar-quoted bodies, then split into executable statements. */
function executableStatements(sql: string): string[] {
  return sql
    .replace(/\$\$[\s\S]*?\$\$/g, "''") // P4 trigger body (contains its own `;`)
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split(';')
    .map((statement) => statement.trim().replace(/\s+/g, ' '))
    .filter((statement) => statement.length > 0)
}

type FunctionState = 'mutable' | 'pinned'

/** Model what proconfig the advisor would read after each statement. */
function applyStatement(state: FunctionState | null, statement: string): FunctionState | null {
  const declaration = statement.match(/^(create(?:\s+or\s+replace)?|alter)\s+function\s+(.*)$/i)
  if (!declaration) return state
  const signature = declaration[2]
  if (!new RegExp(`^${FUNCTION_NAME.replace(/\./g, '\\.')}\\s*\\(`, 'i').test(signature)) {
    return state
  }
  return PINNED_SEARCH_PATH_RE.test(statement) ? 'pinned' : 'mutable'
}

const order = (
  JSON.parse(execFileSync('node', [ORDER_SCRIPT, '--json'], { encoding: 'utf8' })) as {
    order: string[]
  }
).order

/** Every migration other than the frozen P4 file that references the function. */
const remediationFiles = readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith('.sql') && name !== P4_FILE)
  .filter((name) => read(name).includes('seo_cannibal_decisions_append_only'))
  .sort()
const remediationFile = remediationFiles[0] ?? ''
const remediationSql = remediationFile ? read(remediationFile) : ''
const remediationDdl = remediationFile ? executableStatements(remediationSql).join('; ') : ''

describe('post-P4 advisor remediation: seo_cannibal_decisions_append_only search_path', () => {
  it('ships exactly one new remediation migration, named by the future-migration policy', () => {
    expect(remediationFiles).toHaveLength(1)
    expect(remediationFile).toMatch(FUTURE_MIGRATION_RE)
    expect(order).toContain(remediationFile)
    expect(order.indexOf(remediationFile)).toBeGreaterThan(order.indexOf(P4_FILE))
    expect(remediationFile.slice(0, 14) > P4_FILE.slice(0, 14)).toBe(true)
  })

  it('pins the trigger to the empty search_path with a single alter-function statement', () => {
    const statements = executableStatements(remediationSql)
    expect(statements).toHaveLength(1)
    expect(statements[0]).toBe(
      `alter function ${FUNCTION_NAME}() set search_path = ''`,
    )
  })

  it('does not broaden scope: no redefinition, no other advisor fixes', () => {
    expect(remediationDdl).not.toMatch(/\bcreate\b/i)
    expect(remediationDdl).not.toMatch(/\b(?:drop|grant|revoke|truncate|insert|update|delete)\b/i)
    expect(remediationDdl).not.toMatch(/\balter\s+table\b/i)
    expect(remediationDdl).not.toMatch(/\bsecurity\s+definer\b/i)
    // Executable DDL never re-declares the trigger body.
    expect(remediationDdl).not.toMatch(/raise\s+exception/i)
    // The only executable reference is the one flagged function.
    expect(remediationDdl.match(/seo_cannibal_decisions_append_only/g)).toHaveLength(1)
  })

  it('closes the advisor condition in the real apply order and keeps it closed', () => {
    const stateAfter = new Map<string, FunctionState>()
    let state: FunctionState | null = null
    for (const filename of order) {
      for (const statement of executableStatements(read(filename))) {
        state = applyStatement(state, statement)
      }
      if (state) stateAfter.set(filename, state)
    }

    const p4Index = order.indexOf(P4_FILE)
    const remediationIndex = order.indexOf(remediationFile)
    // Teeth: the mutable-search_path condition genuinely existed after P4.
    expect(stateAfter.get(P4_FILE)).toBe('mutable')
    // The remediation is what closes it.
    expect(stateAfter.get(remediationFile)).toBe('pinned')
    // Nothing later (including other migrations) can silently re-open it.
    for (let i = remediationIndex; i < order.length; i += 1) {
      expect(stateAfter.get(order[i])).toBe('pinned')
    }
    expect(p4Index).toBeGreaterThanOrEqual(0)
  })

  it('leaves the applied P4 migration byte-for-byte unchanged', () => {
    expect(readdirSync(MIGRATIONS_DIR)).toContain(P4_FILE)
    expect(sha256(P4_FILE)).toBe(P4_SHA256)
    // History still shows the original, unpinned definition.
    const p4Statements = executableStatements(read(P4_FILE))
    expect(p4Statements.some((statement) => /^create(?:\s+or\s+replace)?\s+function\s+public\.seo_cannibal_decisions_append_only\s*\(/i.test(statement))).toBe(true)
    expect(p4Statements.some((statement) => /^alter\s+function\s+public\.seo_cannibal_decisions_append_only\s*\(/i.test(statement))).toBe(false)
  })
})
