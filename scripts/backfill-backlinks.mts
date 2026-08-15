/**
 * Backfill live DataForSEO backlink snapshots for merged jobs.
 *
 * Fetches a real per-URL backlink snapshot (summary + backlinks list) for
 * every merged job that has a canonical_url and persists it onto
 * content_jobs.backlinks_json + backlinks_fetched_at. The Master SEO Engine
 * then lights up the links subsystem measurement slots on the next analysis
 * (and scripts/backfill-master-engine.mts can fold them into the composite).
 *
 * Mirrors scripts/backfill-live-audit.mts:
 *   - `--dry-run` (default) reports only
 *   - `--apply` writes backlinks_json / backlinks_fetched_at
 *   - `--limit=N` caps the number of rows processed
 *   - `--only-empty` processes only rows whose backlinks_json is still null
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/backfill-backlinks.mts --dry-run
 *   npx tsx --env-file=.env.local scripts/backfill-backlinks.mts --apply
 */
import { createClient } from '@supabase/supabase-js'
import { fetchBacklinkSnapshot, isBacklinkProviderConfigured } from '../lib/seoFactory/backlinkProvider'
import { resolveSupabaseKey } from '../lib/supabaseKey'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseKey = resolveSupabaseKey()
if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL + key)')
  process.exit(1)
}

const args = new Set(process.argv.slice(2))
const APPLY = args.has('--apply')
const ONLY_EMPTY = args.has('--only-empty')
const limitArg = process.argv.find((a) => a.startsWith('--limit='))
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : null

if (!isBacklinkProviderConfigured()) {
  console.error('DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD not set — add them to .env.local first.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

interface JobRow {
  id: string
  title: string | null
  topic: string | null
  canonical_url: string | null
  backlinks_json: Record<string, unknown> | null
}

async function fetchJobs(): Promise<JobRow[]> {
  const PAGE = 1000
  const rows: JobRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('content_jobs')
      .select('id, title, topic, canonical_url, backlinks_json')
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
  let rows = await fetchJobs()
  if (ONLY_EMPTY) rows = rows.filter((r) => !r.backlinks_json)
  console.log(`${APPLY ? 'APPLY' : 'DRY-RUN'} — ${rows.length} merged job(s) with canonical_url${ONLY_EMPTY ? ' (empty only)' : ''}\n`)

  let fetched = 0
  let degraded = 0
  let wrote = 0
  const samples: Array<{ label: string; url: string; backlinks: number | null; domains: number | null }> = []

  for (const row of rows) {
    const label = (row.title || row.topic || 'untitled').slice(0, 60)
    const url = (row.canonical_url || '').trim()
    if (!url) {
      console.log(`  · skip           ${row.id.slice(0, 8)}…  no canonical_url · ${label}`)
      continue
    }

    const snapshot = await fetchBacklinkSnapshot(url)
    if (!snapshot) {
      degraded++
      console.log(`  · degraded       ${row.id.slice(0, 8)}…  no data (0 backlinks or provider error) · ${url}`)
      continue
    }
    fetched++
    samples.push({
      label,
      url,
      backlinks: snapshot.totalBacklinks,
      domains: snapshot.referringDomains,
    })
    console.log(
      `  ✔ ${String(snapshot.totalBacklinks ?? 0).padStart(4)} bl · ${String(snapshot.referringDomains ?? 0).padStart(3)} rd · ${row.id.slice(0, 8)}…  ${url}`,
    )

    if (APPLY) {
      const { error } = await supabase
        .from('content_jobs')
        .update({ backlinks_json: snapshot, backlinks_fetched_at: snapshot.fetchedAt })
        .eq('id', row.id)
      if (error) {
        console.error(`    ✗ update failed: ${error.message}`)
      } else {
        wrote++
      }
    }
    // Small delay to stay gentle on the DataForSEO API.
    await new Promise((r) => setTimeout(r, 150))
  }

  console.log('\n── Summary ──────────────────────────────────────────')
  console.log(`  Rows scanned:      ${rows.length}`)
  console.log(`  Snapshots fetched: ${fetched}`)
  console.log(`  Degraded (no data):${degraded}`)
  const withLinks = samples.filter((s) => (s.backlinks ?? 0) > 0)
  console.log(`  Rows with ≥1 backlink: ${withLinks.length}`)
  for (const s of withLinks.slice(0, 10)) {
    console.log(`    ${s.backlinks} bl · ${s.domains} rd · ${s.url}`)
  }
  if (APPLY) {
    console.log(`  Wrote:             ${wrote}`)
  } else {
    console.log('\n  Re-run with --apply to write backlinks_json back to content_jobs.')
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
