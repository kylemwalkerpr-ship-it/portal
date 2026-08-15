/**
 * Backfill live_canonical_url for merged content_jobs rows.
 *
 * P0-1 live verification used to write the canonical result to
 * live_canonical_href / live_has_canonical — columns that don't exist — so
 * every pre-fix row kept live_canonical_url = NULL and the verify-published
 * stamp reported a misleading "canonical points to a different URL". The
 * persist bug is fixed in lib/seoFactory/liveVerify.ts; this script backfills
 * the already-merged rows by re-running the fetch + canonical extraction.
 *
 * What it does per merged job (canonical_url set, live_canonical_url null):
 *   1. fetch canonical_url (3 attempts, 12s timeout — mirrors verifyLiveUrl)
 *   2. extract the <link rel="canonical"> href + noindex flag
 *   3. persist live_canonical_url + live_verified_at + live_http_status +
 *      live_has_noindex + live_status
 *
 * The extraction helpers mirror lib/seoFactory/liveVerify.ts (extractCanonicalHref
 * / canonicalHrefMatches) — inlined so this script has no `@/` alias imports,
 * matching the other scripts/*.mts one-shots (see recompute-seo-scores.mts).
 *
 * RAISE-ONLY semantics: an existing non-null live_canonical_url is never
 * overwritten (we only fill the NULL gaps). It skips the audit/quality-gate
 * re-run, so live_status is the fetch-level stamp only — a full Re-verify from
 * the studio still recomputes the audit-based stamp.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/backfill-live-canonical.mts --dry-run
 *   npx tsx --env-file=.env.local scripts/backfill-live-canonical.mts --apply
 *
 * Flags:
 *   --dry-run   (default) report only, no writes
 *   --apply     write backfilled columns to content_jobs
 *   --limit N   cap the number of rows processed
 */
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
// Same key selection as recompute-seo-scores.mts: the new-format service secret
// (sb_secret_…) is not registered for PostgREST on this project, so fall back
// to the JWT anon key — content_jobs RLS is open (USING true / WITH CHECK true).
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

/* Mirrors lib/seoFactory/liveVerify.ts — see note above. */
function extractCanonicalHref(html: string): string | null {
  if (!html) return null
  const m = html.match(/<link\b[^>]*rel=["']canonical["'][^>]*?>/i)
  if (!m) return null
  const href = m[0].match(/href=["']([^"']+)["']/i)
  return href && href[1] ? href[1] : null
}

function canonicalHrefMatches(target: string, candidate: string | null): boolean {
  if (!candidate) return false
  const norm = (u: string) => {
    try {
      const p = new URL(u)
      const path = p.pathname.replace(/\/+$/, '') || '/'
      return (p.host.toLowerCase() + path).toLowerCase()
    } catch {
      return u.replace(/\/+$/, '').toLowerCase()
    }
  }
  return norm(target) === norm(candidate)
}

interface JobRow {
  id: string
  title: string | null
  topic: string | null
  canonical_url: string | null
  status: string | null
}

interface VerifyOutcome {
  body: boolean
  httpStatus: number | null
  hasNoIndex: boolean
  canonicalHref: string | null
  canonicalMatches: boolean
  fetchError: string | null
}

async function verifyCanonical(url: string): Promise<VerifyOutcome> {
  let httpStatus: number | null = null
  let bodyText: string | null = null
  let fetchError: string | null = null
  for (let a = 0; a < 3; a++) {
    if (a > 0) await new Promise((r) => setTimeout(r, 2500 * a))
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'YouSafeLiveVerify/1.0' },
        signal: AbortSignal.timeout(12000),
      })
      httpStatus = res.status
      if (res.ok) {
        bodyText = await res.text()
        break
      }
      if (res.status >= 500) continue
      bodyText = await res.text().catch(() => null)
      break
    } catch (ex) {
      fetchError = String((ex as Error)?.message || ex).slice(0, 400)
      if (a === 2) break
    }
  }
  if (!bodyText) {
    return {
      body: false,
      httpStatus,
      hasNoIndex: false,
      canonicalHref: null,
      canonicalMatches: false,
      fetchError: fetchError || `fetch failed: ${httpStatus}`,
    }
  }
  const hasNoIndex = /<meta[^>]*robots[^>]*noindex/i.test(bodyText)
  const canonicalHref = extractCanonicalHref(bodyText)
  return {
    body: true,
    httpStatus,
    hasNoIndex,
    canonicalHref,
    canonicalMatches: canonicalHrefMatches(url, canonicalHref),
    fetchError: null,
  }
}

async function fetchAll(): Promise<JobRow[]> {
  const PAGE = 1000
  const rows: JobRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('content_jobs')
      .select('id, title, topic, canonical_url, status')
      .eq('status', 'merged')
      .not('canonical_url', 'is', null)
      .is('live_canonical_url', null)
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
  console.log(
    `${APPLY ? 'APPLY' : 'DRY-RUN'} — ${rows.length} merged job(s) with a canonical_url but no live_canonical_url\n`,
  )

  let filled = 0
  let filledMismatch = 0
  let fetchFailed = 0
  let noindex = 0
  let wrote = 0
  let writeErrors = 0

  for (const row of rows) {
    const url = row.canonical_url as string
    const v = await verifyCanonical(url)
    const label = (row.title || row.topic || 'untitled').slice(0, 60)

    const liveStatus = !v.body
      ? 'fetch_failed'
      : v.hasNoIndex
        ? 'noindex'
        : v.canonicalMatches
          ? 'verified'
          : 'needs_review'

    if (!v.body) {
      fetchFailed++
      console.log(`  ✗ fetch_failed  ${row.id.slice(0, 8)}…  HTTP ${v.httpStatus}  ${label}`)
      if (APPLY) {
        const { error } = await supabase
          .from('content_jobs')
          .update({
            live_verified_at: new Date().toISOString(),
            live_status: 'fetch_failed',
            live_http_status: v.httpStatus,
          })
          .eq('id', row.id)
        if (error) {
          console.error(`    ✗ update failed: ${error.message}`)
          writeErrors++
        } else wrote++
      }
      continue
    }

    if (v.hasNoIndex) {
      noindex++
      console.log(`  ⚠ noindex       ${row.id.slice(0, 8)}…  ${label}`)
    } else if (v.canonicalMatches) {
      filled++
      console.log(`  ✓ canonical     ${row.id.slice(0, 8)}…  → ${v.canonicalHref}`)
    } else {
      filledMismatch++
      console.log(
        `  ⚠ mismatch      ${row.id.slice(0, 8)}…  live=${v.canonicalHref ?? '(none)'}  want=${url}`,
      )
    }

    if (APPLY) {
      const { error } = await supabase
        .from('content_jobs')
        .update({
          live_verified_at: new Date().toISOString(),
          live_status: liveStatus,
          live_http_status: v.httpStatus,
          live_has_noindex: v.hasNoIndex,
          live_canonical_url: v.canonicalHref,
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

  console.log('\n── Summary ──────────────────────────────────────────')
  console.log(`  Rows scanned:        ${rows.length}`)
  console.log(`  Canonical matches:   ${filled}`)
  console.log(`  Canonical mismatch:  ${filledMismatch}`)
  console.log(`  Live URL noindex:    ${noindex}`)
  console.log(`  Fetch failed:        ${fetchFailed}`)
  if (APPLY) {
    console.log(`  Wrote:               ${wrote}`)
    console.log(`  Write errors:        ${writeErrors}`)
  } else {
    console.log('\n  Re-run with --apply to write these live_* columns back.')
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
