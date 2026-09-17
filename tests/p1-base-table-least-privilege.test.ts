/**
 * P1 base-table least-privilege follow-up — RED-first regression contract.
 *
 * Scope is exactly four server/admin-only base tables:
 *   public.content_jobs
 *   public.seo_backlink_targets
 *   public.seo_backlink_outreach
 *   public.support_audit_log
 *
 * Production baseline (supervisor-verified read-only, 2026-09-15): RLS was
 * enabled on all four, but each carried a FOR ALL policy granted TO public
 * USING (true) / WITH CHECK (true), and anon + authenticated held full table
 * privileges. Effective anon reads returned real rows.
 *
 * These tests pin the acceptance contract for the additive migration AND for
 * the Content Studio fallback: the queue no longer opens a postgres_changes
 * subscription on content_jobs from the browser anon client, while the
 * authenticated 6s/10s fetchJobs polling keeps the desk fresh.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations')
const MIGRATION_NAME = '20260917173300_base_table_least_privilege.sql'
const MIGRATION_PATH = join(MIGRATIONS_DIR, MIGRATION_NAME)
const BASELINE_PATH = join(ROOT, 'supabase', 'migration-baseline.json')
const COMPONENT_PATH = join(ROOT, 'components', 'design', 'admin-content-studio.tsx')
const LEGACY_COMMAND_CENTER_PATH = join(ROOT, 'components', 'design', 'admin-command-center.tsx')
const PREVIOUS_HEAD = '20260916122441_content_studio_provider_parity.sql'

const OWNED_TABLES = [
  'content_jobs',
  'seo_backlink_targets',
  'seo_backlink_outreach',
  'support_audit_log',
] as const

/** The permissive production policy names this migration replaces. */
const PERMISSIVE_POLICIES: Array<{ table: string; policy: string }> = [
  { table: 'content_jobs', policy: 'Admin full access' },
  { table: 'seo_backlink_targets', policy: 'Engine backlink targets full access' },
  { table: 'seo_backlink_outreach', policy: 'Engine backlink outreach full access' },
]
const LIVE_ONLY_PERMISSIVE_POLICY = 'allow_service_role'

const SERVICE_ROLE_POLICY = 'Service role full access'

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function read(path: string): string {
  expect(existsSync(path)).toBe(true)
  return readFileSync(path, 'utf8')
}

/**
 * Comment-stripped, whitespace-flattened SQL so assertions are insensitive to
 * formatting and a comment can never fake (or trip) a DDL contract.
 */
function sql(): string {
  return read(MIGRATION_PATH)
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\s+/g, ' ')
}

/** Strip SQL comments and string/DO bodies where identifier text must be real DDL. */
function ddlOnly(source: string): string {
  return source
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$[A-Za-z0-9_]*\$[\s\S]*?\$[A-Za-z0-9_]*\$/g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
}

const migrationOrderMeta = JSON.parse(
  execFileSync('node', [join(ROOT, 'scripts', 'migration-order.mjs'), '--json'], {
    encoding: 'utf8',
  }),
) as { order: string[]; timestamped: string[]; indexes: string[] }

describe('P1 base-table least-privilege migration', () => {
  it('adds exactly one additive 14-digit migration with the pinned name', () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true)
    const matching = readdirSync(MIGRATIONS_DIR).filter((name) =>
      /^\d{14}_base_table_least_privilege\.sql$/.test(name),
    )
    expect(matching).toEqual([MIGRATION_NAME])
  })

  it('keeps RLS enabled on the exact four tables and never disables it', () => {
    const body = sql()
    for (const table of OWNED_TABLES) {
      expect(body).toMatch(
        new RegExp(`alter table public\\.${table} enable row level security`, 'i'),
      )
    }
    expect(body).not.toMatch(/disable row level security/i)
  })

  it('drops the current permissive named policies on their exact tables', () => {
    const body = sql()
    for (const { table, policy } of PERMISSIVE_POLICIES) {
      expect(body).toMatch(
        new RegExp(
          `drop policy if exists "${escapeRegex(policy)}" on public\\.${table}`,
          'i',
        ),
      )
    }
    expect(body).toMatch(
      new RegExp(
        `drop policy if exists "${escapeRegex(LIVE_ONLY_PERMISSIVE_POLICY)}" on public\\.support_audit_log`,
        'i',
      ),
    )
  })

  it('catalog-sweeps any remaining public/anon/authenticated policy on the four tables', () => {
    const body = sql()
    expect(body).toMatch(/from pg_policies/i)
    expect(body).toMatch(/schemaname = 'public'/i)
    expect(body).toMatch(
      /tablename in \('content_jobs', 'seo_backlink_targets', 'seo_backlink_outreach', 'support_audit_log'\)/i,
    )
    expect(body).toMatch(/roles && array\['public', 'anon', 'authenticated'\]::name\[\]/i)
  })

  it('creates only service-role FOR ALL policies', () => {
    const body = sql()
    const created = body.match(/create policy[^;]*;/gi) ?? []
    expect(created).toHaveLength(OWNED_TABLES.length)
    for (const statement of created) {
      expect(statement).toMatch(/\bto service_role\b/i)
      expect(statement).not.toMatch(/\bto (public|anon|authenticated)\b/i)
    }
    for (const table of OWNED_TABLES) {
      expect(body).toMatch(
        new RegExp(
          `create policy "${escapeRegex(SERVICE_ROLE_POLICY)}" on public\\.${table} ` +
            'for all to service_role using \\(true\\) with check \\(true\\)',
          'i',
        ),
      )
      // Re-runnable: the service-role policy is dropped before it is recreated.
      expect(body).toMatch(
        new RegExp(
          `drop policy if exists "${escapeRegex(SERVICE_ROLE_POLICY)}" on public\\.${table}`,
          'i',
        ),
      )
    }
  })

  it('revokes ALL table privileges from PUBLIC, anon and authenticated on the exact tables', () => {
    const body = sql()
    for (const table of OWNED_TABLES) {
      expect(body).toMatch(
        new RegExp(
          `revoke all privileges on table public\\.${table} from public, anon, authenticated`,
          'i',
        ),
      )
    }
  })

  it('grants required table privileges only to service_role', () => {
    const body = sql()
    for (const table of OWNED_TABLES) {
      expect(body).toMatch(
        new RegExp(`grant all privileges on table public\\.${table} to service_role`, 'i'),
      )
    }
    expect(body).not.toMatch(/\bgrant\b[^;]*\bto (public|anon|authenticated)\b/i)
    expect(body).not.toMatch(/\bto (public|anon|authenticated)\b(?=[^;]*using \(true\))/i)
  })

  it('names exactly the four owned tables and guards the live-only support_audit_log', () => {
    const body = sql()
    const named = new Set(
      [...body.matchAll(/public\.([a-z0-9_]+)/gi)].map((match) => match[1].toLowerCase()),
    )
    expect([...named].sort()).toEqual([...OWNED_TABLES].sort())
    // support_audit_log is provisioned outside this repository's migration set,
    // so a fresh replay must skip it rather than fail.
    expect(body).toMatch(/to_regclass\('public\.support_audit_log'\) is not null/i)
  })

  it('is additive: no table DDL, no unrelated objects, no rewritten baseline', () => {
    const corpus = ddlOnly(read(MIGRATION_PATH))
    expect(corpus).not.toMatch(/\bcreate table\b/i)
    expect(corpus).not.toMatch(/\bdrop table\b/i)
    expect(corpus).not.toMatch(/\balter table\b[^;]*\bdrop\b/i)
    for (const unrelated of ['content_jobs_archive', 'seo_interlinks', 'inquiries']) {
      expect(read(MIGRATION_PATH)).not.toContain(unrelated)
    }
    const baseline = JSON.parse(read(BASELINE_PATH)) as {
      files: Array<{ filename: string }>
    }
    expect(baseline.files).toHaveLength(69)
    expect(baseline.files.some((entry) => entry.filename === MIGRATION_NAME)).toBe(false)
  })
})

describe('P1 base-table least-privilege migration order', () => {
  it('self-registers after the frozen baseline and the previous head, before the index pass', () => {
    const { order, indexes } = migrationOrderMeta
    expect(order).toContain(MIGRATION_NAME)
    const newAt = order.indexOf(MIGRATION_NAME)
    const headAt = order.indexOf(PREVIOUS_HEAD)
    expect(headAt).toBeGreaterThanOrEqual(0)
    expect(newAt).toBeGreaterThan(headAt)

    const baseline = JSON.parse(read(BASELINE_PATH)) as {
      files: Array<{ filename: string; tier: string }>
    }
    // Index-tier baseline files intentionally run last; the new DDL migration
    // must land after every baseline DDL file but before that index pass.
    const lastBaselineDdlAt = Math.max(
      ...baseline.files
        .filter((entry) => entry.tier !== 'index')
        .map((entry) => order.indexOf(entry.filename)),
    )
    expect(newAt).toBeGreaterThan(lastBaselineDdlAt)

    const firstIndexAt = Math.min(...indexes.map((name) => order.indexOf(name)))
    expect(newAt).toBeLessThan(firstIndexAt)
  })

  it('keeps the four-table hardening in a single timestamped migration', () => {
    expect(migrationOrderMeta.timestamped).toContain(MIGRATION_NAME)
    const candidates = readdirSync(MIGRATIONS_DIR).filter((name) =>
      name.includes('base_table_least_privilege'),
    )
    expect(candidates).toEqual([MIGRATION_NAME])
  })
})

describe('Content Studio job-refresh fallback', () => {
  const component = read(COMPONENT_PATH)
  const legacyCommandCenter = read(LEGACY_COMMAND_CENTER_PATH)

  it('removes the direct content_jobs postgres_changes subscription', () => {
    expect(component).not.toContain('subscribeToTable(')
    expect(component).not.toContain('postgres_changes')
    expect(component).not.toContain("subscribeToTable('content_jobs'")
    expect(component).not.toContain('subscribeToTables([\'content_jobs\']')
  })

  it('keeps subscribeToTables for the SEO telemetry tables only', () => {
    expect(component).toContain(
      "import { subscribeToTables } from '@/lib/supabaseRealtime'",
    )
    const flat = component.replace(/\s+/g, ' ')
    expect(flat).toContain(
      "const off = subscribeToTables([ 'seo_knowledge', 'seo_cluster_plans', " +
        "'seo_interlinks', 'seo_llm_visibility', 'seo_gate_runs', " +
        "'seo_engine_runs', 'seo_ranking_scores', ], 'public', kick, onStatus)",
    )
  })

  it('keeps the authenticated 6s active-job polling and 10s background polling', () => {
    expect(component).toContain('setInterval(fetchJobs, 6_000)')
    expect(component).toContain('setInterval(fetchJobs, 10_000)')
    expect(component).toContain(
      'const fetchJobs = React.useCallback(async (): Promise<ContentJob[]> => {',
    )
    expect(component).toContain("queueJobsListPath({ limit: 100, filter: 'all' })")
  })

  it('does not fall back to a browser anon-key table read of content_jobs', () => {
    expect(component).not.toContain(".from('content_jobs')")
    expect(component).not.toContain('createSupabaseBrowserClient')
  })

  it('removes the latent content_jobs anon Realtime path from the deprecated Command Center too', () => {
    expect(legacyCommandCenter).not.toContain("subscribeToTable('content_jobs'")
    expect(legacyCommandCenter).not.toContain("import { subscribeToTable } from '@/lib/supabaseRealtime'")
    // Its authenticated API polling remains the fallback if this component is remounted.
    expect(legacyCommandCenter).toContain('/api/content-studio/jobs?limit=100')
    expect(legacyCommandCenter).toContain('setInterval(loadJobs, 6_000)')
    expect(legacyCommandCenter).toContain('setInterval(loadJobs, 30_000)')
  })
})
