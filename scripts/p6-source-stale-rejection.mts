/**
 * P6 Batch B — operator-controlled SOURCE-stale rejection CLI.
 *
 * Rejects (does not delete, does not retarget) HISTORICAL JOBLESS planned
 * `seo_interlinks` rows whose SOURCE MISSION never shipped while the exact
 * stored target is live. It never writes `applied`, a `source_url`, a
 * `source_job_id`, a staging stamp or any verification/proof column: the only
 * write is `status='rejected'` plus the auditable
 * `gate_reason='stale_source_unshipped_mission'` / `gate_actor` /
 * `gate_updated_at` metadata, fenced by an exact-row CAS.
 *
 * Pure predicate/planning lives in `scripts/p6SourceStaleRejection.ts`; the
 * injectable orchestration lives in `scripts/p6SourceStaleRejectionRunner.ts`
 * (dry-run provably makes zero write calls); the executable
 * argv/authority/client boundary lives in `scripts/p6SourceStaleCliBoundary.ts`
 * (unit-executable with fakes). This wrapper only wires the real boundaries:
 *   1. SELECT the candidate columns with the historical jobless/no-proof NULL
 *      fence, paginated and truncation-proven — a failed/truncated read is
 *      fail-closed and no write plan is produced;
 *   2. read the durable `seo_cluster_plans` records for those exact
 *      `source_slug`s and require `status='planned'` + `shipped_at IS NULL`
 *      (never shipped). A missing record, any other status or a shipped_at
 *      stamp is ineligible — the mission is ambiguous/shipped and stays
 *      planned. Nothing is inferred from the planner slug;
 *   3. read the live estate URL set (sitemaps of the repository's estate hosts,
 *      one level of sitemap-index resolution, bounded) and fail closed when
 *      any live URL path carries the mission slug;
 *   4. probe each DISTINCT EXACT trimmed stored target ONCE per run through
 *      the repository link-liveness authority (`verifyUrlsLive` HEAD→GET
 *      fallback + `classifyLiveStatus`). Only a classified-LIVE target is
 *      eligible: dead targets belong to Batch A, unknown targets stay unknown;
 *   5. run the durable mission→`content_jobs` exclusion probe. It is required
 *      for APPLY (an unavailable probe fails apply closed); in dry run its
 *      unavailability is recorded truthfully and listed in `applyBlockers`;
 *   6. in apply mode only, issue the exact-row CAS UPDATE with the fence built
 *      by the pure module — including the exact RAW STORED `target_url` — and
 *      read back affected rows so a zero-row race is a SKIP, never success.
 *
 * Apply is enabled ONLY by `--apply --confirm REJECT-BATCH-B-SOURCE-STALE`;
 * there is no environment variable that enables writes, no upsert, no delete,
 * no rpc and no schema change. Apply also requires genuine service-role
 * authority (the same shared P6 apply-authority decision Batch A uses) plus a
 * WORKING durable mission→content_jobs exclusion probe.
 *
 * OPERATOR CONSEQUENCE: rejection is terminal for the EDGE (staging selects
 * planned rows and replanning never resets lifecycle columns). The mission
 * record itself is untouched and stays plannable, but a later ship of that
 * mission will not re-stage this edge. Apply only with explicit authorization.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/p6-source-stale-rejection.mts
 *   npx tsx --env-file=.env.local scripts/p6-source-stale-rejection.mts --limit 25
 *   # (only after explicit operator/supervisor authorization:)
 *   npx tsx --env-file=.env.local scripts/p6-source-stale-rejection.mts --limit 25 --apply --confirm REJECT-BATCH-B-SOURCE-STALE
 */

import { createClient } from '@supabase/supabase-js'
import { resolveSupabaseKey } from '../lib/supabaseKey'
import {
  ESTATE_HOSTS,
  classifyLiveStatus,
  isEstateUrl,
  verifyUrlsLive,
  verifyUrlsLiveGet,
} from '../lib/seoFactory/linkAudit'
import { resolveOwner } from '../lib/seoFactory/ownership'
import type { P6TargetObservation } from './p6InterlinkDisposition'
import { resolveP6BatchAApplyAuthority } from './p6BatchAApplyAuthority'
import { runP6SourceStaleCliBoundary } from './p6SourceStaleCliBoundary'
import {
  P6_SOURCE_STALE_CANDIDATE_COLUMNS,
  P6_SOURCE_STALE_LIVE_URL_CAP,
  P6_SOURCE_STALE_MISSION_COLUMNS,
  P6_SOURCE_STALE_PAGE_SIZE,
  P6_SOURCE_STALE_SCAN_LIMIT,
  type P6SourceStaleCandidateRow,
  type P6SourceStaleMissionPlan,
  type P6ShippedSourceResolution,
} from './p6SourceStaleRejection'
import type {
  P6SourceStaleCandidateRead,
  P6SourceStaleLiveEstateRead,
  P6SourceStaleMissionJobProbe,
  P6SourceStaleMissionRead,
  P6ShippedMissionResolutionInput,
  P6SourceStaleStatusCounts,
  P6SourceStaleWrite,
  P6SourceStaleWriteResult,
} from './p6SourceStaleRejectionRunner'

/** The historical jobless/no-proof NULL fence, mirrored in the CAS write. */
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

/** Hosts whose sitemap may enumerate a live source page (bounded guard input). */
const LIVE_ESTATE_SITEMAP_HOSTS = [...ESTATE_HOSTS].filter(
  (host) => host !== 'portal.yousafeconsultancy.com',
)
/** Max child sitemaps resolved per host (sitemap-index depth 1). */
const SITEMAP_CHILD_CAP = 12
/** Max URLs read from one sitemap document. */
const SITEMAP_DOC_URL_CAP = 5000

type SupabaseClient = ReturnType<typeof createClient>

/**
 * SELECT-only candidate read. Fail-closed contract: any error, or a proven
 * truncation at the scan cap, is returned to the runner which then refuses to
 * plan or write.
 */
async function readCandidates(
  supabase: SupabaseClient,
): Promise<P6SourceStaleCandidateRead> {
  const rows: P6SourceStaleCandidateRow[] = []
  try {
    for (let from = 0; from < P6_SOURCE_STALE_SCAN_LIMIT; from += P6_SOURCE_STALE_PAGE_SIZE) {
      const to = Math.min(from + P6_SOURCE_STALE_PAGE_SIZE - 1, P6_SOURCE_STALE_SCAN_LIMIT - 1)
      let query: any = (supabase as any)
        .from('seo_interlinks')
        .select(P6_SOURCE_STALE_CANDIDATE_COLUMNS)
        .eq('status', 'planned')
        .not('target_url', 'is', null)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
      for (const column of NULL_FENCE_COLUMNS) query = query.is(column, null)
      const { data, error } = await query.range(from, to)
      if (error) {
        return {
          rows: [],
          truncated: false,
          error: `seo_interlinks candidate read failed: ${error.message}`,
        }
      }
      const batch = (data ?? []) as P6SourceStaleCandidateRow[]
      rows.push(...batch)
      if (batch.length < to - from + 1) return { rows, truncated: false }
      if (rows.length >= P6_SOURCE_STALE_SCAN_LIMIT) {
        let probeQuery: any = (supabase as any)
          .from('seo_interlinks')
          .select('id')
          .eq('status', 'planned')
          .not('target_url', 'is', null)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
        for (const column of NULL_FENCE_COLUMNS) probeQuery = probeQuery.is(column, null)
        const probe = await probeQuery.range(
          P6_SOURCE_STALE_SCAN_LIMIT,
          P6_SOURCE_STALE_SCAN_LIMIT,
        )
        if (probe.error) {
          return {
            rows: [],
            truncated: false,
            error: `truncation probe failed: ${probe.error.message}`,
          }
        }
        return { rows, truncated: ((probe.data ?? []) as unknown[]).length > 0 }
      }
    }
    return { rows, truncated: false }
  } catch (error) {
    return {
      rows: [],
      truncated: false,
      error: `seo_interlinks candidate read failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    }
  }
}

/**
 * Durable mission read for the EXACT candidate slugs. A row that exists is
 * returned as-is (`status` + `shipped_at`); a slug with no record is absent
 * from the map, which the predicate treats as ambiguous → ineligible.
 */
async function readMissionPlans(
  supabase: SupabaseClient,
  slugs: string[],
): Promise<P6SourceStaleMissionRead> {
  const plans: Record<string, P6SourceStaleMissionPlan | null | undefined> = {}
  if (!slugs.length) return { plans }
  try {
    for (let i = 0; i < slugs.length; i += 100) {
      const chunk = slugs.slice(i, i + 100)
      const { data, error } = await (supabase as any)
        .from('seo_cluster_plans')
        .select(P6_SOURCE_STALE_MISSION_COLUMNS)
        .in('cluster_id', chunk)
        .range(0, Math.max(chunk.length - 1, 0))
      if (error) {
        return { plans: {}, error: `seo_cluster_plans read failed: ${error.message}` }
      }
      for (const row of (data ?? []) as P6SourceStaleMissionPlan[]) {
        const clusterId = String(row?.cluster_id || '').trim()
        if (!clusterId) continue
        plans[clusterId] = row
      }
    }
    return { plans }
  } catch (error) {
    return {
      plans: {},
      error: `seo_cluster_plans read failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    }
  }
}

function extractLocs(xml: string): string[] {
  const out: string[] = []
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(xml)) !== null) out.push(match[1])
  return out
}

/**
 * Live estate URL set for the fail-closed source-page guard: every estate
 * host's `/sitemap.xml` (one level of sitemap-index resolution, bounded). Hosts
 * without a sitemap simply contribute nothing — an unreachable sitemap is NOT
 * treated as proof that a page does not exist, because the guard is only ever
 * used to EXCLUDE rows (never to claim a URL is the mission's page).
 */
async function readLiveEstateUrls(): Promise<P6SourceStaleLiveEstateRead> {
  const urls = new Set<string>()
  const errors: string[] = []
  for (const host of LIVE_ESTATE_SITEMAP_HOSTS) {
    try {
      const res = await fetch(`https://${host}/sitemap.xml`, {
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) continue
      const xml = await res.text()
      let locs = extractLocs(xml)
      if (/<sitemapindex/i.test(xml)) {
        const children = locs.slice(0, SITEMAP_CHILD_CAP)
        locs = []
        for (const child of children) {
          try {
            const childRes = await fetch(child, { signal: AbortSignal.timeout(15000) })
            if (!childRes.ok) continue
            locs.push(...extractLocs(await childRes.text()).slice(0, SITEMAP_DOC_URL_CAP))
          } catch {
            /* one child sitemap is not fatal: the host still contributes */
          }
        }
      }
      for (const loc of locs) {
        const trimmed = String(loc || '').trim()
        if (!trimmed) continue
        urls.add(trimmed)
        if (urls.size >= P6_SOURCE_STALE_LIVE_URL_CAP) break
      }
    } catch (error) {
      errors.push(`${host}: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (urls.size >= P6_SOURCE_STALE_LIVE_URL_CAP) break
  }
  if (!urls.size && errors.length) {
    return { urls: [], error: `live estate sitemap read failed: ${errors.join('; ')}` }
  }
  return { urls: [...urls] }
}

/**
 * Durable mission→`content_jobs` exclusion probe (EXACT identity only).
 *
 * A mission slug is "resolved" when a `content_jobs` (or archived) row carries
 * that exact slug, or the last path segment of its `canonical_url`/
 * `content_path` equals it. Such a mission has a durable page, so it must never
 * be treated as source-stale. Reads are bounded; a permission/transport error
 * is reported as `ok: false` (which fails APPLY closed).
 */
async function probeMissionJobIdentity(
  supabase: SupabaseClient,
  slugs: string[],
): Promise<P6SourceStaleMissionJobProbe> {
  if (!slugs.length) return { ok: true, resolvedSlugs: {} }
  const wanted = new Set(slugs.map((slug) => String(slug || '').trim().toLowerCase()).filter(Boolean))
  const resolvedSlugs: Record<string, string> = {}
  const PAGE = 500
  const TABLE_CAP = 5000
  try {
    for (const table of ['content_jobs', 'content_jobs_archive'] as const) {
      let scanned = 0
      let complete = false
      for (let from = 0; from < TABLE_CAP; from += PAGE) {
        const { data, error } = await (supabase as any)
          .from(table)
          .select('id,slug,canonical_url,content_path')
          .order('updated_at', { ascending: false })
          .range(from, from + PAGE - 1)
        if (error) return { ok: false, resolvedSlugs: {}, error: `${table}: ${error.message}` }
        const rows = (data ?? []) as Array<{
          id?: string | null
          slug?: string | null
          canonical_url?: string | null
          content_path?: string | null
        }>
        scanned += rows.length
        for (const row of rows) {
          const candidates = new Set<string>()
          const slug = String(row?.slug || '').trim().toLowerCase()
          if (slug) candidates.add(slug)
          for (const value of [row?.canonical_url, row?.content_path]) {
            const raw = String(value || '').trim()
            if (!raw) continue
            let segment = ''
            try {
              segment = new URL(raw).pathname.split('/').filter(Boolean).pop() || ''
            } catch {
              segment = raw.split('/').filter(Boolean).pop() || ''
            }
            if (segment) candidates.add(decodeURIComponentSafe(segment).toLowerCase())
          }
          for (const candidate of candidates) {
            if (wanted.has(candidate) && row?.id) resolvedSlugs[candidate] = String(row.id)
          }
        }
        if (rows.length < PAGE) {
          complete = true
          break
        }
      }
      // The exclusion probe is only meaningful when the scan COMPLETED: an
      // incomplete scan could have missed the mission's durable job row, so it
      // must never be reported as a completed "no job identity" proof.
      if (!complete) {
        return {
          ok: false,
          resolvedSlugs: {},
          error: `${table}: mission identity scan cap (${TABLE_CAP} rows) reached after ${scanned} row(s) — exclusion proof incomplete`,
        }
      }
    }
    return { ok: true, resolvedSlugs }
  } catch (error) {
    return {
      ok: false,
      resolvedSlugs: {},
      error: `${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/**
 * Fresh live-target proof through the repository authority. The classified
 * verdict is projected (the raw `verifyUrlsLive.ok` is 2xx/3xx only). No key
 * normalization: the observation map is keyed by the exact target string.
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
 * Deterministic ownership resolution for the SHIPPED-source lane.
 *
 * The repository resolver (`resolveOwner`) is handed exactly the durable
 * mission inputs — the plan's `primary_term`, `country` and persisted plan-body
 * `contentType` — and must return ONE absolute http(s) canonical source URL on
 * an estate host. Every other outcome (missing mission input, resolver throw,
 * no/blank/non-absolute result, or an off-estate host) is reported as an
 * explicit FAILURE, so the mission is ineligible — never fuzzy-matched, never
 * synthesized from the planner slug.
 */
async function resolveShippedSources(
  missions: P6ShippedMissionResolutionInput[],
): Promise<Record<string, P6ShippedSourceResolution | undefined>> {
  const out: Record<string, P6ShippedSourceResolution | undefined> = {}
  for (const mission of missions) {
    const primaryKeyword = String(mission.primaryTerm || '').trim()
    const region = String(mission.country || '').trim()
    const contentType = String(mission.contentType || '').trim()
    if (!primaryKeyword || !region || !contentType) {
      out[mission.clusterId] = {
        ok: false,
        reason: `missing durable mission input(s): ${
          [
            !primaryKeyword ? 'primary_term' : null,
            !region ? 'country' : null,
            !contentType ? 'plan.contentType' : null,
          ]
            .filter(Boolean)
            .join(', ')
        }`,
      }
      continue
    }
    try {
      const plan = await resolveOwner({ primaryKeyword, contentType, region })
      const canonicalUrl = String(plan?.canonicalUrl || '').trim()
      if (!canonicalUrl) {
        out[mission.clusterId] = {
          ok: false,
          reason: 'ownership resolver returned no canonical source URL',
        }
        continue
      }
      let absolute = false
      try {
        const parsed = new URL(canonicalUrl)
        absolute =
          (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
          Boolean(parsed.hostname)
      } catch {
        absolute = false
      }
      if (!absolute) {
        out[mission.clusterId] = {
          ok: false,
          reason: `ownership resolver returned a non-absolute canonical URL`,
        }
        continue
      }
      if (!isEstateUrl(canonicalUrl)) {
        out[mission.clusterId] = {
          ok: false,
          reason: 'ownership resolver resolved outside the estate host set',
        }
        continue
      }
      out[mission.clusterId] = {
        ok: true,
        source: {
          url: canonicalUrl,
          resolver: 'resolveOwner',
          contentType,
          host: plan?.host ?? null,
          routingSource: plan?.routingSource ?? null,
        },
      }
    } catch (error) {
      out[mission.clusterId] = {
        ok: false,
        reason: `ownership resolver error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      }
    }
  }
  return out
}

/**
 * Fresh GET-only probe of the RESOLVED canonical source URLs.
 *
 * `verifyUrlsLiveGet` is the P6 GET-only authority: it consults no cache,
 * synthesizes no URL, and returns the RAW HTTP status. Only a raw 404/410 can
 * prove a shipped source gone; a live source is NEVER rejected because the
 * planned href is absent from it.
 */
async function probeSourceUrls(
  urls: string[],
): Promise<Record<string, P6TargetObservation | undefined>> {
  const results = await verifyUrlsLiveGet(urls)
  const observations: Record<string, P6TargetObservation | undefined> = {}
  for (const exact of urls) {
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
  supabase: SupabaseClient,
  write: P6SourceStaleWrite,
): Promise<P6SourceStaleWriteResult> {
  let query: any = (supabase as any).from('seo_interlinks').update(write.patch)
  for (const entry of write.fence) {
    query = entry.op === 'eq' ? query.eq(entry.column, entry.value) : query.is(entry.column, null)
  }
  const { data, error } = await query.select('id')
  if (error) return { affected: 0, error: error.message }
  return { affected: Array.isArray(data) ? data.length : 0 }
}

async function countStatus(
  supabase: SupabaseClient,
  status: string,
): Promise<number | null> {
  const { count, error } = await (supabase as any)
    .from('seo_interlinks')
    .select('*', { count: 'exact', head: true })
    .eq('status', status)
  if (error) throw new Error(error.message)
  return typeof count === 'number' ? count : null
}

async function countStatuses(supabase: SupabaseClient): Promise<P6SourceStaleStatusCounts | null> {
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
  const result = await runP6SourceStaleCliBoundary({
    argv: process.argv.slice(2),
    readSupabaseUrl: () =>
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || null,
    resolveReadKey: () => resolveSupabaseKey(),
    // The P6 apply-authority decision is SHARED with Batch A on purpose: the
    // write prerequisite (genuine service-role) must be identical in both lanes.
    resolveApplyAuthority: () => resolveP6BatchAApplyAuthority(),
    createClient: (url, key) =>
      createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
      }),
    readCandidates: (client) => readCandidates(client as SupabaseClient),
    readMissionPlans: (client, slugs) => readMissionPlans(client as SupabaseClient, slugs),
    readLiveEstateUrls: () => readLiveEstateUrls(),
    probeMissionJobIdentity: (client, slugs) =>
      probeMissionJobIdentity(client as SupabaseClient, slugs),
    resolveShippedSources,
    probeSourceUrls,
    observeTargets,
    applyRejection: (client, write) => applyRejection(client as SupabaseClient, write),
    countStatuses: (client) => countStatuses(client as SupabaseClient),
  })
  process.exitCode = result.exitCode
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
