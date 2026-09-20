/**
 * P6 — `seo_interlinks` verification-truth DB contract.
 *
 * Locks the additive migration, its position in the apply order, and the
 * fail-closed `status='applied'` proof constraint. The migration must stay
 * additive/idempotent/re-runnable and must never reconcile existing rows.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations')
const MIGRATION_NAME = '20260920130000_seo_interlinks_verification_truth.sql'
const PREVIOUS_HEAD = '20260920120000_seo_cannibal_decisions_append_only_search_path.sql'

const read = (file: string) => readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
const sql = () => read(MIGRATION_NAME)

/** Strip comments, strings and dollar-quoted DO bodies for DDL-only matching. */
function ddlOnly(source: string): string {
  return source
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''")
}

/** Strip only comments, keeping DO bodies so existence guards stay visible. */
function withoutComments(source: string): string {
  return source.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')
}

const orderMeta = JSON.parse(
  execFileSync('node', [join(ROOT, 'scripts', 'migration-order.mjs'), '--json'], {
    encoding: 'utf8',
  }),
) as { order: string[]; timestamped: string[]; timestampedPattern: string }

describe('A) migration self-registration and order', () => {
  it('registers the new migration on disk and in the apply order', () => {
    const onDisk = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql'))
    expect(onDisk).toContain(MIGRATION_NAME)
    expect(orderMeta.order).toContain(MIGRATION_NAME)
    expect(orderMeta.timestamped).toContain(MIGRATION_NAME)
  })

  it('applies after the previous head and keeps timestamped order chronological', () => {
    const headAt = orderMeta.order.indexOf(PREVIOUS_HEAD)
    const migrationAt = orderMeta.order.indexOf(MIGRATION_NAME)
    expect(headAt).toBeGreaterThanOrEqual(0)
    expect(migrationAt).toBeGreaterThan(headAt)
    expect(orderMeta.timestamped).toEqual([...orderMeta.timestamped].sort())
    expect(new RegExp(orderMeta.timestampedPattern).test(MIGRATION_NAME)).toBe(true)
  })

  it('passes the whole-estate ledger policy (naming, transaction safety, trailing semicolon)', () => {
    expect(() =>
      execFileSync('node', [join(ROOT, 'scripts', 'migration-ledger-policy.mjs'), '--check'], {
        encoding: 'utf8',
      }),
    ).not.toThrow()
  })
})

describe('B) verification-truth columns are additive', () => {
  it.each([
    ['source_url', 'text'],
    ['verification_state', 'text'],
    ['verified_at', 'timestamptz'],
    ['verification_evidence', 'jsonb'],
  ])('adds %s %s null with IF NOT EXISTS', (column, type) => {
    expect(sql().toLowerCase()).toContain(
      `add column if not exists ${column} ${type} null`,
    )
  })

  it('never rewrites, deletes or backfills existing rows', () => {
    const body = ddlOnly(sql()).toLowerCase()
    expect(body).not.toMatch(/update\s+public\.seo_interlinks/)
    expect(body).not.toMatch(/\bupdate\s+[a-z_."]*\s+set\b/)
    expect(body).not.toMatch(/\bdelete\s+from\b/)
    expect(body).not.toMatch(/\binsert\s+into\b/)
    expect(body).not.toMatch(/\bcreate\s+table\b/)
    expect(body).not.toMatch(/\bdrop\s+table\b/)
    expect(body).not.toMatch(/\balter\s+table\b[^;]*\bdrop\s+column\b/)
  })
})

describe('C) closed verification vocabulary', () => {
  it('constrains verification_state idempotently to the five durable states', () => {
    const lower = withoutComments(sql()).toLowerCase()
    expect(lower).toContain('seo_interlinks_verification_state_check')
    for (const state of ['present', 'absent', 'source_not_live', 'target_not_live', 'unverifiable']) {
      expect(lower).toContain(`'${state}'`)
    }
    expect(lower).toContain('verification_state is null')
    expect(lower).toMatch(/from pg_constraint where conname = 'seo_interlinks_verification_state_check'/)
  })
})

describe('D) applied requires the full proof contract, validated', () => {
  const contract = () => withoutComments(sql()).toLowerCase()

  it('names the constraint and every required field', () => {
    const body = contract()
    expect(body).toContain('seo_interlinks_applied_requires_verification')
    expect(body).toContain("status <> 'applied'")
    expect(body).toContain('source_url is not null')
    expect(body).toContain("btrim(source_url) <> ''")
    expect(body).toContain("verification_state = 'present'")
    expect(body).toContain('verified_at is not null')
    expect(body).toContain('verification_evidence is not null')
    expect(body).toContain('applied_at is not null')
  })

  it('is validated (never NOT VALID) and creation is existence-guarded', () => {
    const body = contract()
    expect(body).not.toContain('not valid')
    expect(body).toMatch(/from pg_constraint where conname = 'seo_interlinks_applied_requires_verification'/)
  })
})

describe('E) indexes, notify and re-runnability', () => {
  it('adds only the justified verification indexes', () => {
    const body = sql().toLowerCase()
    expect(body).toContain('create index if not exists idx_seo_interlinks_source_url')
    expect(body).toContain('where source_url is not null')
    expect(body).toContain('create index if not exists idx_seo_interlinks_verification_state')
    expect(body).toContain('where verification_state is not null')
  })

  it('notifies PostgREST and ends with a semicolon', () => {
    expect(sql().toLowerCase()).toContain("notify pgrst, 'reload schema'")
    expect(sql().trimEnd().endsWith(';')).toBe(true)
  })

  it('is re-runnable: every created object is existence-guarded or dropped first', () => {
    const body = sql()
    const policies = [...body.matchAll(/create\s+policy\s+"([^"]+)"/gi)].map((match) => match[1])
    expect(policies.length).toBe(2)
    for (const name of policies) {
      expect(new RegExp(`drop\\s+policy\\s+if\\s+exists\\s+"${name}"`, 'i').test(body)).toBe(true)
    }
    expect(body.match(/create\s+index\s+if\s+not\s+exists/gi)?.length).toBe(2)
    expect(body.match(/drop\s+policy\s+if\s+exists/gi)?.length).toBeGreaterThanOrEqual(3)
  })
})

describe('F) least privilege (proven-safe hardening)', () => {
  it('revokes write verbs from public/anon/authenticated and grants SELECT back', () => {
    const body = sql().toLowerCase().replace(/\s+/g, ' ')
    expect(body).toContain(
      'revoke all privileges on table public.seo_interlinks from public, anon, authenticated;',
    )
    expect(body).toContain('grant select on table public.seo_interlinks to anon, authenticated;')
    expect(body).toContain('grant all privileges on table public.seo_interlinks to service_role;')
  })

  it('replaces the open FOR ALL policy with a select-only realtime read policy', () => {
    const body = sql().toLowerCase().replace(/\s+/g, ' ')
    expect(body).toContain('drop policy if exists "engine v2 full access" on public.seo_interlinks;')
    expect(body).toContain(
      'create policy "seo_interlinks read for realtime" on public.seo_interlinks for select to anon, authenticated using (true);',
    )
    expect(body).toContain(
      'create policy "seo_interlinks service role full access" on public.seo_interlinks for all to service_role using (true) with check (true);',
    )
    // No permissive write policy may target anon/authenticated.
    expect(body).not.toMatch(/for all to (?:anon|authenticated)/)
    expect(body).not.toMatch(/for (?:insert|update|delete) to (?:anon|authenticated)/)
  })
})
