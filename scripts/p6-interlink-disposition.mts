/**
 * P6 — read-only disposition report CLI for `seo_interlinks`.
 *
 * Pure classification lives in scripts/p6InterlinkDisposition.ts (unit
 * tested). This wrapper only:
 *   1. SELECTs the disposition columns (paginated, no writes),
 *   2. live-checks each distinct target URL once through the repository link
 *      authority (`verifyUrlsLive` → `classifyLiveStatus`), which uses the same
 *      HEAD→GET fallback for HEAD-hostile hosts and authority-host exemptions
 *      as every other link audit (2xx/3xx = live, 404/410 = dead, anything
 *      else — including network errors — stays unknown),
 *   3. prints the JSON report (raw backlog kept separate from the
 *      approved-useful numerator/denominator, plus explicit `truncated` /
 *      `rowLimit` truth when the row cap was reached).
 *
 * There is no --apply flag, no update/delete/upsert path, and no table is
 * mutated. Unknown stays unknown.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/p6-interlink-disposition.mts
 */
import { createClient } from '@supabase/supabase-js'
import { resolveSupabaseKey } from '../lib/supabaseKey'
import { verifyUrlsLive } from '../lib/seoFactory/linkAudit'
import {
  p6ObservationFromLiveCheck,
  p6TargetKey,
  runP6DispositionReport,
  type P6TargetObservation,
} from './p6InterlinkDisposition'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseKey = resolveSupabaseKey()
if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL + key)')
  process.exit(1)
}

async function observeTargets(urls: string[]): Promise<Record<string, P6TargetObservation>> {
  const observations: Record<string, P6TargetObservation> = {}
  // The repository link-validity authority: concurrent, cached, and
  // HEAD-hostile-safe (HEAD, retried as GET on 403/405/501).
  const results = await verifyUrlsLive(urls)
  for (const url of urls) {
    const result = results.get(url)
    observations[p6TargetKey(url)] = result
      ? p6ObservationFromLiveCheck(url, result)
      : { status: 0, ok: false, finalUrl: url }
  }
  return observations
}

async function main() {
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const report = await runP6DispositionReport({
    // SELECT-only surface: the report module has no write verb.
    supabase: supabase as unknown as Parameters<typeof runP6DispositionReport>[0]['supabase'],
    observeTargets,
  })
  console.log(JSON.stringify(report, null, 2))
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
