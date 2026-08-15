/**
 * Backfill Master SEO Engine scores for every merged job.
 *
 * Runs the layered engine (130+ signals, intent-conditioned weights,
 * competitive deltas, risk gates, prediction) over each merged job's stored
 * content and persists the composite score + full report so the Track stage's
 * Ship Ledger can show the engine grade without re-running on every render.
 *
 * Mirrors scripts/backfill-live-audit.mts:
 *   - `--dry-run` (default) reports only
 *   - `--apply` writes master_engine_score / master_engine_grade /
 *     master_engine_json / master_engine_fetched_at back to content_jobs
 *   - `--limit=N` caps the number of rows processed
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/backfill-master-engine.mts --dry-run
 *   npx tsx --env-file=.env.local scripts/backfill-master-engine.mts --apply
 */
import { createClient } from '@supabase/supabase-js'
import { scoreMaster } from '../lib/seoFactory/masterEngine'
import { jobToMasterEngineInput } from '../lib/seoFactory/jobToMasterInput'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseKey =
  (process.env.SUPABASE_SERVICE_ROLE_KEY || '').startsWith('eyJ')
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL + key)')
  process.exit(1)
}

const args = new Set(process.argv.slice(2))
const APPLY = args.has('--apply')
const limitArg = process.argv.find((a) => a.startsWith('--limit='))
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : null

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

interface JobRow {
  id: string
  title: string | null
  topic: string | null
  primary_keyword: string | null
  content_type: string | null
  region: string | null
  content: string | null
  indexable: boolean | null
  canonical_url: string | null
  live_http_status: number | null
  required_short_keywords: string[] | null
  required_long_tail_keywords: string[] | null
  competing_urls: string[] | null
  gsc_json: Record<string, unknown> | null
  backlinks_json: Record<string, unknown> | null
  created_at: string | null
  updated_at: string | null
  master_engine_score: number | null
  master_engine_grade: string | null
}

async function fetchJobs(): Promise<JobRow[]> {
  const PAGE = 1000
  const rows: JobRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('content_jobs')
      .select(`
        id, title, topic, primary_keyword, content_type, region, content,
        indexable, canonical_url, live_http_status,
        required_short_keywords, required_long_tail_keywords,
        competing_urls, gsc_json, backlinks_json,
        created_at, updated_at,
        master_engine_score, master_engine_grade
      `)
      .eq('status', 'merged')
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`query failed: ${error.message}`)
    const chunk = (data ?? []) as JobRow[]
    rows.push(...chunk)
    if (chunk.length < PAGE) break
    if (LIMIT && rows.length >= LIMIT) break
  }
  return LIMIT ? rows.slice(0, LIMIT) : rows
}

async function main() {
  const rows = await fetchJobs()
  console.log(`${APPLY ? 'APPLY' : 'DRY-RUN'} — ${rows.length} merged job(s)\n`)

  const grades: Record<string, number> = {}
  let scored = 0
  let skipped = 0
  let wrote = 0
  let updated = 0

  for (const row of rows) {
    const label = (row.title || row.topic || 'untitled').slice(0, 60)

    // Skip rows that already carry a score from the same engine era? No —
    // this is a raise/replace backfill: score every merged job and refresh.
    const report = scoreMaster(jobToMasterEngineInput(row))
    if (report.composite == null) {
      skipped++
      console.log(`  · skipped       ${row.id.slice(0, 8)}…  no computable composite · ${label}`)
      continue
    }
    scored++
    grades[report.grade ?? '?'] = (grades[report.grade ?? '?'] ?? 0) + 1

    const already = row.master_engine_score
    const delta = already == null ? '' : ` (was ${already})`
    console.log(
      `  ${report.grade} ${String(report.composite).padStart(3)}/100  ${row.id.slice(0, 8)}…  ${report.intentLabel}  coverage ${report.coverage.pct}%${delta} · ${label}`,
    )

    if (APPLY) {
      const { error } = await supabase
        .from('content_jobs')
        .update({
          master_engine_score: report.composite,
          master_engine_grade: report.grade,
          master_engine_json: report,
          master_engine_fetched_at: report.generatedAt,
        })
        .eq('id', row.id)
      if (error) {
        console.error(`    ✗ update failed: ${error.message}`)
      } else {
        wrote++
        if (already != null) updated++
      }
    }
  }

  console.log('\n── Summary ──────────────────────────────────────────')
  console.log(`  Rows scanned:      ${rows.length}`)
  console.log(`  Scored:            ${scored}`)
  console.log(`  Skipped:           ${skipped} (no computable composite)`)
  const gradeLine = Object.entries(grades)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([g, n]) => `${g}:${n}`)
    .join(' · ')
  console.log(`  Grades:            ${gradeLine || '—'}`)
  if (APPLY) {
    console.log(`  Wrote:             ${wrote} (${updated} refreshed)`)
  } else {
    console.log('\n  Re-run with --apply to write master_engine_* back to content_jobs.')
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
