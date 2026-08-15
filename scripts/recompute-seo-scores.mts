/**
 * Recompute seo_score for existing content_jobs rows (RAISE-ONLY).
 *
 * The audit scorecard used to divide by `max = 20` while only ever awarding
 * 18 points, so every flawless article was persisted at 90%. That denominator
 * is now 18 (a clean article scores 100). This script re-runs the REAL audit
 * over each stored draft.
 *
 * RAISE-ONLY semantics: a row is updated ONLY when the recomputed score is
 * strictly higher than the stored score (or the row had no score). Rows the
 * current (stricter) gate would score LOWER are left untouched — historical
 * merged/live articles are not retroactively downgraded. Raised rows also get
 * their word_count + audit_json refreshed so the snapshot stays consistent.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/recompute-seo-scores.mts --dry-run
 *   npx tsx --env-file=.env.local scripts/recompute-seo-scores.mts --apply
 *
 * Flags:
 *   --dry-run   (default) report only, no writes
 *   --apply     write recomputed scores back to content_jobs
 *   --limit N   cap the number of rows processed
 */
import { createClient } from '@supabase/supabase-js'
import { auditContent } from '../lib/seoFactory/audit'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
// The new-format service secret (sb_secret_…) is not registered for PostgREST
// on this project, so fall back to the JWT anon key — the content_jobs RLS
// policy is open (USING true / WITH CHECK true), so reads AND writes work.
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
  status: string | null
  content_type: string | null
  primary_keyword?: string | null
  topic?: string | null
  indexable?: boolean | null
  content?: string | null
  seo_score?: number | null
  word_count?: number | null
  required_short_keywords?: string[] | null
  required_long_tail_keywords?: string[] | null
  audit_json?: Record<string, unknown> | null
}

/** Same inputs the re-audit contract (and editor Re-audit) passes. */
function recompute(row: JobRow) {
  return auditContent({
    content: String(row.content ?? ''),
    contentType: String(row.content_type || 'legal_guide'),
    primaryKeyword: String(row.primary_keyword || row.topic || ''),
    indexable: row.indexable !== false,
    requiredShortKeywords: row.required_short_keywords ?? undefined,
    requiredLongTailKeywords: row.required_long_tail_keywords ?? undefined,
  })
}

async function fetchAll(): Promise<JobRow[]> {
  const PAGE = 1000
  const rows: JobRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('content_jobs')
      .select(
        'id, title, status, content_type, primary_keyword, topic, indexable, content, seo_score, word_count, required_short_keywords, required_long_tail_keywords, audit_json',
      )
      .not('content', 'is', null)
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
  const rows = await fetchAll()
  console.log(`${APPLY ? 'APPLY' : 'DRY-RUN'} (raise-only) — ${rows.length} rows with stored content\n`)

  let raised = 0
  let unchanged = 0
  let skippedLower = 0
  let wrote = 0
  let writeErrors = 0
  const distribution = new Map<string, number>()

  for (const row of rows) {
    const audit = recompute(row)
    const oldScore = row.seo_score
    const newScore = audit.score
    distribution.set(String(newScore), (distribution.get(String(newScore)) || 0) + 1)

    // Raise-only: never lower a stored score. Skip when the stricter current
    // gate would downgrade historical content (or there's nothing to change).
    if (oldScore != null && newScore <= oldScore) {
      if (newScore < oldScore) skippedLower++
      else unchanged++
      continue
    }

    raised++
    const title = (row.title || row.topic || 'untitled').slice(0, 52)
    const arrow = oldScore == null ? `— → ${newScore}` : `${oldScore} → ${newScore} (+${newScore - oldScore})`
    console.log(`  [${row.status ?? '?'}] ${row.id.slice(0, 8)}… ${arrow}  ${title}`)

    if (APPLY) {
      const existing = row.audit_json ?? {}
      const { error } = await supabase
        .from('content_jobs')
        .update({
          seo_score: newScore,
          word_count: audit.wordCount,
          audit_json: { ...existing, ...audit },
        })
        .eq('id', row.id)
      if (error) {
        console.error(`    ✗ update failed: ${error.message}`)
        writeErrors++
      } else {
        wrote++
      }
    }
  }

  console.log('\n── Summary (raise-only) ─────────────────────────')
  console.log(`  Rows scanned:     ${rows.length}`)
  console.log(`  Will raise:       ${raised}`)
  console.log(`  Unchanged:        ${unchanged}`)
  console.log(`  Skipped (lower):  ${skippedLower}`)
  if (APPLY) {
    console.log(`  Wrote:            ${wrote}`)
    console.log(`  Write errors:     ${writeErrors}`)
  }
  const dist = [...distribution.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))
  console.log(`  Recomputed spread: ${dist.map(([s, n]) => `${s}×${n}`).join('  ') || '—'}`)
  if (!APPLY) {
    console.log('\n  Re-run with --apply to write these raised scores back.')
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
