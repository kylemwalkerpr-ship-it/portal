/**
 * Phase 3 sanitization — server-only lockdown of tables that the public anon
 * key could read (anon probe, 2026-10-03). Pins the migration contract and the
 * invariant that no browser code queries these tables directly.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const MIGRATION_PATH = join(
  ROOT,
  'supabase',
  'migrations',
  '20261003210000_phase3_rls_lockdown_exposed_tables.sql',
)

/** Tables the anon probe returned real rows from (public.services excluded). */
const PROBE_EXPOSED = [
  'orders',
  'order_status_history',
  'chat_conversations',
  'chat_messages',
  'support_presence',
  'gsc_snapshots',
  'mission_log',
  'cannibal_merges',
  'content_job_reviews',
  'content_rhythm_alerts',
  'site_health_pages',
  'studio_specialist_signals',
  'seo_ahrefs_snapshots',
  'seo_cluster_plans',
  'seo_engine_config',
  'seo_engine_runs',
  'seo_forecast_runs',
  'seo_gate_runs',
  'seo_gsc_rows',
  'seo_intelligence_snapshots',
  'seo_interlinks',
  'seo_knowledge',
  'seo_lifecycle_stages',
  'seo_model_calibration',
  'seo_ranking_scores',
  'seo_reward_events',
] as const

function sql(): string {
  expect(existsSync(MIGRATION_PATH)).toBe(true)
  return readFileSync(MIGRATION_PATH, 'utf8')
    .replace(/--[^\n]*/g, ' ')
    .replace(/\s+/g, ' ')
}

function ownedTables(): string[] {
  const m = sql().match(/owned text\[\] := array\[([^\]]*)\]/)
  expect(m).not.toBeNull()
  return [...m![1].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1])
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(p)
  }
  return out
}

describe('phase 3 RLS lockdown migration', () => {
  it('covers every table the anon probe could read', () => {
    const owned = ownedTables()
    for (const t of PROBE_EXPOSED) expect(owned).toContain(t)
  })

  it('leaves the public services catalogue alone', () => {
    expect(ownedTables()).not.toContain('services')
  })

  it('enables RLS, drops client-role policies and adds a service-role-only policy', () => {
    const s = sql()
    expect(s).toMatch(/alter table public\.%I enable row level security/)
    expect(s).toMatch(/roles && array\['public', 'anon', 'authenticated'\]::name\[\]/)
    expect(s).toMatch(/drop policy if exists %I on public\.%I', entry\.policyname, t/)
    expect(s).toMatch(/for all to service_role using \(true\) with check \(true\)/)
    expect(s).not.toMatch(/to (public|anon|authenticated) using \(true\)/i)
  })

  it('revokes client-role privileges and keeps service_role whole', () => {
    const s = sql()
    expect(s).toMatch(/revoke all privileges on table public\.%I from public, anon, authenticated/)
    expect(s).toMatch(/grant all privileges on table public\.%I to service_role/)
    expect(s).not.toMatch(/grant [a-z ,]+ to (anon|authenticated)/i)
  })

  it('guards each table with to_regclass for fresh replays', () => {
    expect(sql()).toMatch(/if to_regclass\(format\('public\.%I', t\)\) is null then continue;/)
  })
})

describe('browser code never queries the locked tables directly', () => {
  it('has no client component calling .from() on a locked table', () => {
    const locked = new Set(ownedTables())
    const offenders: string[] = []
    for (const dir of ['app', 'components', 'hooks', 'contexts', 'lib']) {
      const abs = join(ROOT, dir)
      if (!existsSync(abs)) continue
      for (const file of walk(abs)) {
        const src = readFileSync(file, 'utf8')
        if (!/^\s*['"]use client['"]/m.test(src.slice(0, 200))) continue
        for (const m of src.matchAll(/\.from\(\s*['"]([a-z0-9_]+)['"]\s*\)/g)) {
          if (locked.has(m[1])) offenders.push(`${file}:${m[1]}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
