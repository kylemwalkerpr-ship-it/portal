/**
 * P6 — read-only disposition report CLI for `seo_interlinks`.
 *
 * Pure classification lives in scripts/p6InterlinkDisposition.ts (unit
 * tested). This wrapper only:
 *   1. SELECTs the disposition columns (paginated, no writes),
 *   2. HEAD-checks each distinct target URL once (2xx/3xx = live, 404/410 =
 *      dead, anything else — including network errors — stays unknown),
 *   3. prints the JSON report (raw backlog kept separate from the
 *      approved-useful numerator/denominator).
 *
 * There is no --apply flag, no update/delete/upsert path, and no table is
 * mutated. Unknown stays unknown.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/p6-interlink-disposition.mts
 */
import { createClient } from '@supabase/supabase-js'
import { resolveSupabaseKey } from '../lib/supabaseKey'
import {
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
  const concurrency = Number(process.env.P6_DISPOSITION_CONCURRENCY || 4)
  let cursor = 0
  const worker = async () => {
    while (cursor < urls.length) {
      const url = urls[cursor++]
      try {
        const res = await fetch(url, {
          method: 'HEAD',
          redirect: 'follow',
          signal: AbortSignal.timeout(Number(process.env.P6_DISPOSITION_TIMEOUT_MS || 8000)),
        })
        observations[p6TargetKey(url)] = {
          status: res.status,
          ok: res.status >= 200 && res.status < 400,
          finalUrl: res.url || url,
        }
      } catch {
        observations[p6TargetKey(url)] = { status: 0, ok: false, finalUrl: url }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, urls.length)) }, worker))
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
