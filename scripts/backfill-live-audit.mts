/**
 * Re-verify merged jobs with the NEW HTML-native live audit.
 *
 * The old ship→live verification ran the markdown draft audit (auditContent)
 * against raw rendered HTML, so every healthy page persisted a garbage
 * live_audit_score (~13/100) and live_status='needs_review' regardless of
 * real quality. lib/seoFactory/liveAudit.ts now scores the live page natively
 * (h1/h2, meta, JSON-LD, gov citations, estate links, disclaimer, TL;DR, real
 * body word count). This script re-runs that check for every already-merged
 * job and refreshes the persisted live_* columns so the Track stage stops
 * showing stale "needs review · score 13" stamps.
 *
 * Mirrors the verifyLiveUrl `ok` predicate exactly:
 *   ok = HTTP 200 && !noindex && canonical match && audit>=30 && words>=200
 *   → verified | noindex | fetch_failed | needs_review
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/backfill-live-audit.mts --dry-run
 *   npx tsx --env-file=.env.local scripts/backfill-live-audit.mts --apply
 *
 * Flags:
 *   --dry-run   (default) report only, no writes
 *   --apply     write the refreshed live_* columns back to content_jobs
 *   --limit N   cap the number of rows processed
 */
import { createClient } from '@supabase/supabase-js'
import { auditLiveHtml } from '../lib/seoFactory/liveAudit'
import { resolveSupabaseKey } from '../lib/supabaseKey'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
// resolveSupabaseKey(): the new-format service secret (sb_secret_…) is not
// registered for PostgREST on this project, so fall back to the JWT anon key
// — content_jobs RLS is open for read/write.
const supabaseKey = resolveSupabaseKey()
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

/* Mirrors lib/seoFactory/liveVerify.ts — inlined to avoid @/ alias imports. */
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
  content_type: string | null
  primary_keyword: string | null
  canonical_url: string | null
}

interface VerifyOutcome {
  body: boolean
  httpStatus: number | null
  hasNoIndex: boolean
  canonicalHref: string | null
  canonicalMatches: boolean
  score: number | null
  humanScore: number | null
  wordCount: number | null
}

async function verifyLive(url: string, row: JobRow): Promise<VerifyOutcome> {
  let httpStatus: number | null = null
  let bodyText: string | null = null
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
    } catch {
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
      score: null,
      humanScore: null,
      wordCount: null,
    }
  }
  const hasNoIndex = /<meta[^>]*robots[^>]*noindex/i.test(bodyText)
  const canonicalHref = extractCanonicalHref(bodyText)
  const canonicalMatches = canonicalHrefMatches(url, canonicalHref)
  const live = auditLiveHtml({
    html: bodyText,
    contentType: row.content_type || 'legal_guide',
    primaryKeyword: row.primary_keyword || row.topic || url,
  })
  return {
    body: true,
    httpStatus,
    hasNoIndex,
    canonicalHref,
    canonicalMatches,
    score: live.score,
    humanScore: live.humanScore,
    wordCount: live.wordCount,
  }
}

async function fetchJobs(): Promise<JobRow[]> {
  const PAGE = 1000
  const rows: JobRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('content_jobs')
      .select('id, title, topic, content_type, primary_keyword, canonical_url, status')
      .eq('status', 'merged')
      .not('canonical_url', 'is', null)
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
  console.log(
    `${APPLY ? 'APPLY' : 'DRY-RUN'} — ${rows.length} merged job(s) with a canonical_url\n`,
  )

  let verified = 0
  let noindex = 0
  let fetchFailed = 0
  let needsReview = 0
  let wrote = 0

  for (const row of rows) {
    const url = row.canonical_url as string
    const v = await verifyLive(url, row)
    const label = (row.title || row.topic || 'untitled').slice(0, 60)

    const ok =
      v.body &&
      v.httpStatus === 200 &&
      !v.hasNoIndex &&
      v.canonicalMatches &&
      (v.score ?? 0) >= 30 &&
      (v.wordCount ?? 0) >= 200
    const liveStatus = !v.body
      ? 'fetch_failed'
      : v.hasNoIndex
        ? 'noindex'
        : v.httpStatus !== 200
          ? 'fetch_failed'
          : ok
            ? 'verified'
            : 'needs_review'

    if (liveStatus === 'fetch_failed') {
      fetchFailed++
      console.log(`  ✗ fetch_failed  ${row.id.slice(0, 8)}…  HTTP ${v.httpStatus}  ${label}`)
    } else if (liveStatus === 'noindex') {
      noindex++
      console.log(`  ⚠ noindex       ${row.id.slice(0, 8)}…  ${label}`)
    } else if (liveStatus === 'verified') {
      verified++
      console.log(`  ✓ verified      ${row.id.slice(0, 8)}…  score ${v.score} · ${v.wordCount}w · ${label}`)
    } else {
      needsReview++
      console.log(
        `  ? needs_review  ${row.id.slice(0, 8)}…  score ${v.score} · ${v.wordCount}w · noindex=${v.hasNoIndex} · canonical=${v.canonicalMatches} · ${label}`,
      )
    }

    if (APPLY) {
      const { error } = await supabase
        .from('content_jobs')
        .update({
          live_verified_at: new Date().toISOString(),
          live_status: liveStatus,
          live_http_status: v.httpStatus,
          live_word_count: v.wordCount,
          live_audit_score: v.score,
          live_human_score: v.humanScore,
          live_has_noindex: v.hasNoIndex,
          live_canonical_url: v.canonicalHref,
          live_error: null,
        })
        .eq('id', row.id)
      if (error) {
        console.error(`    ✗ update failed: ${error.message}`)
      } else {
        wrote++
      }
    }
  }

  console.log('\n── Summary ──────────────────────────────────────────')
  console.log(`  Rows scanned:      ${rows.length}`)
  console.log(`  verified:          ${verified}`)
  console.log(`  needs_review:      ${needsReview}`)
  console.log(`  noindex:           ${noindex}`)
  console.log(`  fetch_failed:      ${fetchFailed}`)
  if (APPLY) {
    console.log(`  Wrote:             ${wrote}`)
  } else {
    console.log('\n  Re-run with --apply to write these live_* columns back.')
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
