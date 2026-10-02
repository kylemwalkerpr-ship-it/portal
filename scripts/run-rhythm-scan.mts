/**
 * Run the weekly rhythm scan on the GitHub Actions runner instead of inside
 * the portal Worker.
 *
 * Why: POST /api/cron/rhythm-scan-weekly scans up to 500 stored drafts through
 * the full content-quality gate (twice per flagged draft). On the Workers Free
 * plan (see wrangler.toml: no [limits] block) that exceeds the per-request
 * resource limit and Cloudflare answers 503 / error 1102, so the job has failed
 * every week since 2026-09-21. The same runRhythmScan() runs here with the
 * service-role env the other data workflows already use. The persisted rows
 * (content_rhythm_alerts + mission_log) are identical, so the admin dashboard
 * and the GET endpoint are unchanged.
 *
 * Usage: npx -y tsx scripts/run-rhythm-scan.mts   (env: RHYTHM_LIMIT, RHYTHM_MAX_ROWS)
 */
import { runRhythmScan } from '../lib/seoFactory/rhythmScan'
import { supabaseAuthMode } from '../lib/supabaseKey'

function intEnv(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] || '', 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required')
  const mode = supabaseAuthMode()
  if (mode !== 'service-role') throw new Error(`service-role Supabase key required (auth mode: ${mode})`)

  const limit = intEnv('RHYTHM_LIMIT', 500)
  const maxRows = intEnv('RHYTHM_MAX_ROWS', 100)
  console.log(`Rhythm scan on runner (limit=${limit}, maxRows=${maxRows})`)
  const result = await runRhythmScan({ limit, maxRows })
  console.log(JSON.stringify({ scanned: result.scanned, flagged: result.flagged, remediable: result.remediable, errors: result.errors }, null, 2))

  const fatal = result.errors.filter((e) => /query failed|insert failed/.test(e))
  if (fatal.length) throw new Error(`rhythm scan failed: ${fatal.join('; ')}`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e))
  process.exit(1)
})
