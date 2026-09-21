/**
 * P6 Batch A — operator-controlled stale rejection CLI.
 *
 * Rejects (does not delete, does not retarget) HISTORICAL JOBLESS planned
 * `seo_interlinks` rows whose exact current target FRESHLY proves HTTP 404 or
 * 410 in this run AND is explicitly re-confirmed by a fresh GET of the same
 * exact trimmed target_url. Pure planning lives in
 * `scripts/p6BatchAStaleRejection.ts`; the injectable orchestration lives in
 * `scripts/p6BatchAStaleRejectionRunner.ts` (dry-run provably makes zero write
 * calls); the executable argv/authority/client boundary lives in
 * `scripts/p6BatchACliBoundary.ts` (unit-executable with fakes). This wrapper
 * only wires the real boundaries:
 *   1. SELECT the candidate columns with the historical jobless/no-proof NULL
 *      fence, paginated and truncation-proven — a failed/truncated read is
 *      fail-closed and no write plan is produced;
 *   2. probe each DISTINCT EXACT trimmed stored target ONCE per run through
 *      the repository link-liveness authority: `verifyUrlsLive` (HEAD, retried
 *      as GET on 403/405/501) + `classifyLiveStatus` (2xx/3xx and the
 *      authority-host 401/403/405/429 exemptions are live; 0/5xx/anything else
 *      is unknown and untouched). No normalization/synthesis: only absolute
 *      http(s) targets are probed, and observations are keyed by the exact
 *      trimmed stored target_url;
 *   3. for every EXACT target whose primary probe is a raw 404/410, perform an
 *      explicit GET-only re-confirmation (`verifyUrlsLiveGet`, fresh and
 *      uncached) of that same URL. Only a raw GET 404/410 permits rejection;
 *      a HEAD 404/410 alone never rejects;
 *   4. in apply mode only, issue the exact-row CAS UPDATE
 *      (`status='rejected'`, audit `gate_reason`/`gate_actor`/
 *      `gate_updated_at`) with the fence built by the pure module — including
 *      the exact RAW STORED `target_url` — reading back affected rows so a
 *      zero-row race is a SKIP, never success.
 *
 * Apply is enabled ONLY by `--apply --confirm REJECT-BATCH-A-STALE-404-410`;
 * there is no environment variable that enables writes, no upsert, no delete,
 * no rpc, and no schema change.
 *
 * APPLY AUTHORITY (hard prerequisite, enforced AFTER argv parsing and BEFORE
 * any client is created): the write path requires genuine service-role
 * authority — `supabaseAuthMode() === 'service-role'` AND
 * `resolveSupabaseKey({ allowAnonFallback: false })` returning a usable legacy
 * `eyJ…` JWT. The read-capable anon fallback is allowed for dry run only.
 * A degraded/anon client never reaches the DB: the CLI exits nonzero without
 * constructing a write-capable client.
 * The runner independently re-checks the exact confirmation token, so a
 * programmatic `apply: true` without the token makes zero IO calls.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/p6-batch-a-stale-rejection.mts
 *   npx tsx --env-file=.env.local scripts/p6-batch-a-stale-rejection.mts --limit 25
 *   # (only after explicit operator/supervisor authorization:)
 *   npx tsx --env-file=.env.local scripts/p6-batch-a-stale-rejection.mts --limit 25 --apply --confirm REJECT-BATCH-A-STALE-404-410
 */

import { createClient } from '@supabase/supabase-js'
import { resolveSupabaseKey } from '../lib/supabaseKey'
import {
  classifyLiveStatus,
  verifyUrlsLive,
  verifyUrlsLiveGet,
} from '../lib/seoFactory/linkAudit'
import type { P6TargetObservation } from './p6InterlinkDisposition'
import { resolveP6BatchAApplyAuthority } from './p6BatchAApplyAuthority'
import { runP6BatchACliBoundary } from './p6BatchACliBoundary'
import {
  P6_BATCH_A_CANDIDATE_COLUMNS,
  P6_BATCH_A_PAGE_SIZE,
  P6_BATCH_A_SCAN_LIMIT,
  type P6BatchACandidateRow,
} from './p6BatchAStaleRejection'
import type {
  P6BatchACandidateRead,
  P6BatchAStatusCounts,
  P6BatchAWrite,
  P6BatchAWriteResult,
} from './p6BatchAStaleRejectionRunner'

/** The historical jobless/no-proof NULL fence, also mirrored in the CAS write. */
const NULL_FENCE_COLUMNS = [
  'source_url',
  'source_job_id',
  'verification_state',
  'verified_at',
  'verification_evidence',
  'verification_attempted_at',
  'staged_at',
  'applied_at',
] as const

/**
 * SELECT-only candidate read. Fail-closed contract: any error, or a proven
 * truncation at the scan cap, is returned to the runner which then refuses to
 * plan or write.
 */
async function readCandidates(
  supabase: ReturnType<typeof createClient>,
): Promise<P6BatchACandidateRead> {
  const rows: P6BatchACandidateRow[] = []
  try {
    for (let from = 0; from < P6_BATCH_A_SCAN_LIMIT; from += P6_BATCH_A_PAGE_SIZE) {
      const to = Math.min(from + P6_BATCH_A_PAGE_SIZE - 1, P6_BATCH_A_SCAN_LIMIT - 1)
      let query: any = (supabase as any)
        .from('seo_interlinks')
        .select(P6_BATCH_A_CANDIDATE_COLUMNS)
        .eq('status', 'planned')
        .not('target_url', 'is', null)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
      for (const column of NULL_FENCE_COLUMNS) query = query.is(column, null)
      const { data, error } = await query.range(from, to)
      if (error) {
        return { rows: [], truncated: false, error: `seo_interlinks candidate read failed: ${error.message}` }
      }
      const batch = (data ?? []) as P6BatchACandidateRow[]
      rows.push(...batch)
      if (batch.length < to - from + 1) {
        return { rows, truncated: false }
      }
      if (rows.length >= P6_BATCH_A_SCAN_LIMIT) {
        let probeQuery: any = (supabase as any)
          .from('seo_interlinks')
          .select('id')
          .eq('status', 'planned')
          .not('target_url', 'is', null)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
        for (const column of NULL_FENCE_COLUMNS) probeQuery = probeQuery.is(column, null)
        const probe = await probeQuery.range(P6_BATCH_A_SCAN_LIMIT, P6_BATCH_A_SCAN_LIMIT)
        if (probe.error) {
          return { rows: [], truncated: false, error: `truncation probe failed: ${probe.error.message}` }
        }
        return { rows, truncated: ((probe.data ?? []) as unknown[]).length > 0 }
      }
    }
    return { rows, truncated: false }
  } catch (error) {
    return {
      rows: [],
      truncated: false,
      error: `seo_interlinks candidate read failed: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * Fresh primary proof through the repository authority. One probe per distinct
 * EXACT trimmed stored target per run; the classified verdict is projected
 * (the raw `verifyUrlsLive.ok` is 2xx/3xx only and would call a live
 * authority-host 403 dead). No key normalization: the observation map is keyed
 * by the exact target string that was probed.
 */
async function observeTargets(
  exactTargets: string[],
): Promise<Record<string, P6TargetObservation | undefined>> {
  const results = await verifyUrlsLive(exactTargets)
  const observations: Record<string, P6TargetObservation | undefined> = {}
  for (const exact of exactTargets) {
    const result = results.get(exact)
    if (!result) {
      observations[exact] = undefined
      continue
    }
    const classified = classifyLiveStatus(exact, result.status)
    observations[exact] = {
      status: result.status,
      ok: classified.ok,
      finalUrl: result.finalUrl,
    }
  }
  return observations
}

/**
 * Explicit GET-only re-confirmation for targets the primary probe classified
 * raw 404/410. `verifyUrlsLiveGet` never reads/writes the shared probe cache
 * and refuses relative/non-http(s) inputs instead of synthesizing a target, so
 * the re-confirmation can only ever fetch the exact URL the proof is bound to.
 */
async function confirmDeadTargets(
  exactTargets: string[],
): Promise<Record<string, P6TargetObservation | undefined>> {
  const results = await verifyUrlsLiveGet(exactTargets)
  const observations: Record<string, P6TargetObservation | undefined> = {}
  for (const exact of exactTargets) {
    const result = results.get(exact)
    observations[exact] = result
      ? { status: result.status, ok: result.ok, finalUrl: result.finalUrl }
      : undefined
  }
  return observations
}

/**
 * Exact-row CAS write. Every fence entry from the pure planner is applied
 * (`.eq` for id/status/exact target_url, `.is(col, null)` for the no-proof
 * subject), then the affected rows are read back so a concurrent change is a
 * zero-row SKIP rather than an assumed success.
 */
async function applyRejection(
  supabase: ReturnType<typeof createClient>,
  write: P6BatchAWrite,
): Promise<P6BatchAWriteResult> {
  let query: any = (supabase as any).from('seo_interlinks').update(write.patch)
  for (const entry of write.fence) {
    query = entry.op === 'eq' ? query.eq(entry.column, entry.value) : query.is(entry.column, null)
  }
  const { data, error } = await query.select('id')
  if (error) {
    return { affected: 0, error: error.message }
  }
  return { affected: Array.isArray(data) ? data.length : 0 }
}

async function countStatus(
  supabase: ReturnType<typeof createClient>,
  status: string,
): Promise<number | null> {
  const { count, error } = await (supabase as any)
    .from('seo_interlinks')
    .select('*', { count: 'exact', head: true })
    .eq('status', status)
  if (error) throw new Error(error.message)
  return typeof count === 'number' ? count : null
}

async function countStatuses(
  supabase: ReturnType<typeof createClient>,
): Promise<P6BatchAStatusCounts | null> {
  try {
    return {
      planned: await countStatus(supabase, 'planned'),
      rejected: await countStatus(supabase, 'rejected'),
      applied: await countStatus(supabase, 'applied'),
    }
  } catch (error) {
    return {
      planned: null,
      rejected: null,
      applied: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function main(): Promise<void> {
  const result = await runP6BatchACliBoundary({
    argv: process.argv.slice(2),
    // Every real boundary is resolved/created only when the boundary reaches
    // it: argv parsing precedes the apply-authority decision, which precedes
    // `createClient`.
    readSupabaseUrl: () =>
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || null,
    resolveReadKey: () => resolveSupabaseKey(),
    resolveApplyAuthority: () => resolveP6BatchAApplyAuthority(),
    createClient: (url, key) =>
      createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
      }),
    readCandidates: (client) =>
      readCandidates(client as ReturnType<typeof createClient>),
    observeTargets,
    confirmDeadTargets,
    applyRejection: (client, write) =>
      applyRejection(client as ReturnType<typeof createClient>, write),
    countStatuses: (client) =>
      countStatuses(client as ReturnType<typeof createClient>),
  })
  process.exitCode = result.exitCode
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
