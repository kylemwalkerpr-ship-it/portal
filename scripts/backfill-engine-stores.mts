/**
 * Live backfill + stress of later Master Engine stores.
 *
 *   cd yousafe-portal && npx tsx scripts/backfill-engine-stores.mts
 *
 * Loads .env.local, applies the engine_runs kind constraint, then runs
 * lib/seoEngine/engineBackfill.ts against the live project.
 */
import fs from 'node:fs'
import path from 'node:path'

function loadDotEnvLocal(): void {
  const p = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i < 1) continue
    const k = line.slice(0, i).trim()
    if (!/^[A-Z0-9_]+$/.test(k)) continue
    if (process.env[k]) continue
    let v = line.slice(i + 1)
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    process.env[k] = v
  }
}

async function applyKindConstraint(): Promise<void> {
  const token = (process.env.SUPABASE_ACCESS_TOKEN || '').trim()
  const ref = process.env.SUPABASE_PROJECT_REF || 'krggzrxxnqfsbbklatxl'
  if (!token) {
    console.warn('SUPABASE_ACCESS_TOKEN missing — skipping kind-constraint SQL (writer will log if insert fails)')
    return
  }
  const sql = fs.readFileSync(path.resolve('supabase/migrations/20260819_seo_engine_runs_kind.sql'), 'utf8')
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`kind constraint SQL ${res.status}: ${text.slice(0, 400)}`)
  console.log('applied seo_engine_runs kind constraint')
}

async function countRows(): Promise<Record<string, number>> {
  const token = (process.env.SUPABASE_ACCESS_TOKEN || '').trim()
  const ref = process.env.SUPABASE_PROJECT_REF || 'krggzrxxnqfsbbklatxl'
  if (!token) return {}
  const q = `
SELECT * FROM (
  SELECT 'seo_forecast_runs' AS name, count(*)::int AS n FROM public.seo_forecast_runs
  UNION ALL SELECT 'seo_reward_events', count(*)::int FROM public.seo_reward_events
  UNION ALL SELECT 'seo_model_calibration', count(*)::int FROM public.seo_model_calibration
  UNION ALL SELECT 'seo_intelligence_snapshots', count(*)::int FROM public.seo_intelligence_snapshots
  UNION ALL SELECT 'seo_ahrefs_snapshots', count(*)::int FROM public.seo_ahrefs_snapshots
  UNION ALL SELECT 'seo_backlink_targets', count(*)::int FROM public.seo_backlink_targets
  UNION ALL SELECT 'seo_backlink_outreach', count(*)::int FROM public.seo_backlink_outreach
  UNION ALL SELECT 'seo_ranking_scores', count(*)::int FROM public.seo_ranking_scores
  UNION ALL SELECT 'gsc_snapshots', count(*)::int FROM public.gsc_snapshots
) x ORDER BY name;
`
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
  })
  const rows = (await res.json()) as Array<{ name: string; n: number }>
  return Object.fromEntries((Array.isArray(rows) ? rows : []).map((r) => [r.name, r.n]))
}

async function main() {
  loadDotEnvLocal()
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required')
  }
  await applyKindConstraint()
  const before = await countRows()
  console.log('BEFORE', before)

  const { runEngineStoreBackfill } = await import('../lib/seoEngine/engineBackfill')
  const report = await runEngineStoreBackfill()
  for (const s of report.steps) {
    console.log(`${s.ok ? 'OK' : 'FAIL'}  ${s.name}  wrote=${s.wrote}  ${s.detail}${s.error ? `  ERR=${s.error}` : ''}`)
  }

  const after = await countRows()
  console.log('AFTER', after)
  const required = [
    'seo_forecast_runs',
    'seo_reward_events',
    'seo_model_calibration',
    'seo_intelligence_snapshots',
    'seo_ahrefs_snapshots',
    'seo_backlink_targets',
    'seo_backlink_outreach',
  ]
  const missing = required.filter((k) => !after[k])
  if (missing.length) {
    throw new Error(`tables still empty: ${missing.join(', ')}`)
  }
  if (!report.ok) {
    const failed = report.steps.filter((s) => !s.ok).map((s) => s.name)
    throw new Error(`backfill steps failed: ${failed.join(', ')}`)
  }
  console.log('ENGINE STORE BACKFILL OK')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
