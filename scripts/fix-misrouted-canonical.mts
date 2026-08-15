/**
 * Fix mis-routed canonical_url rows on content_jobs.
 *
 * A batch of jobs was resolved against the wrong owner page, so their
 * canonical_url landed on the UK spouse-visa document checklist instead of the
 * page matching their keyword:
 *
 *   - "uk graduate visa requirements"  → should be /uk/graduate-route-visa/
 *   - "asu visa requirements" (Arizona State University) → should be the ASU
 *     F-1 guide on /guide/arizona-state-university-international-student-guide/
 *
 * Both destinations are verified live (200 + self-canonicalizing). The script
 * is idempotent: it only touches rows whose canonical_url differs from the
 * correct one, so re-running is a no-op after the first apply.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/fix-misrouted-canonical.mts --dry-run
 *   npx tsx --env-file=.env.local scripts/fix-misrouted-canonical.mts --apply
 */
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseKey =
  (process.env.SUPABASE_SERVICE_ROLE_KEY || '').startsWith('eyJ')
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL + key)')
  process.exit(1)
}

const APPLY = process.argv.includes('--apply')
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

/** topic → correct canonical (verified live). */
const CORRECTIONS: ReadonlyArray<{ topic: string; canonical: string }> = [
  {
    topic: 'uk graduate visa requirements',
    canonical: 'https://legal.yousafeconsultancy.com/uk/graduate-route-visa/',
  },
  {
    topic: 'asu visa requirements',
    canonical: 'https://legal.yousafeconsultancy.com/guide/arizona-state-university-international-student-guide/',
  },
]

interface JobRow {
  id: string
  topic: string | null
  title: string | null
  canonical_url: string | null
  status: string | null
}

async function main() {
  console.log(`${APPLY ? 'APPLY' : 'DRY-RUN'} — correcting mis-routed canonical_url rows\n`)
  let totalUpdated = 0

  for (const correction of CORRECTIONS) {
    const { data, error } = await supabase
      .from('content_jobs')
      .select('id, topic, title, canonical_url, status')
      .eq('topic', correction.topic)
      .neq('canonical_url', correction.canonical)
      .order('created_at', { ascending: false })
    if (error) throw new Error(`query failed for "${correction.topic}": ${error.message}`)

    const rows = (data ?? []) as JobRow[]
    console.log(`── ${correction.topic} (${rows.length} row(s) to fix)`)
    console.log(`   correct canonical: ${correction.canonical}`)

    for (const row of rows) {
      console.log(
        `   ${APPLY ? '→' : '·'} ${row.id.slice(0, 8)}… [${row.status ?? '?'}]  ${(row.canonical_url || '(none)').slice(0, 80)}`,
      )
      if (APPLY) {
        const { error: upErr } = await supabase
          .from('content_jobs')
          .update({ canonical_url: correction.canonical })
          .eq('id', row.id)
        if (upErr) {
          console.error(`     ✗ update failed: ${upErr.message}`)
        } else {
          totalUpdated++
        }
      }
    }
    console.log()
  }

  console.log(`Done — ${APPLY ? `updated ${totalUpdated} row(s)` : `dry-run (re-run with --apply to write)`}`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
