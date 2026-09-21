/**
 * P6 Batch B — executable CLI boundary (argv → authority → client → runner).
 *
 * Every external boundary is injected (env readers, apply-authority decision,
 * client factory, candidate read, durable mission read, live estate guard,
 * durable mission→content_jobs exclusion probe, live target probe, CAS write,
 * status counts, clock, stdout/stderr) so this module is fully executable in
 * tests with fakes: it reads no environment variables itself (URL/key
 * resolution is injected), imports no Supabase client, performs no network
 * call and contains no write verb. The `.mts` wrapper supplies the real
 * implementations and remains the only file that can reach the DB.
 *
 * Order of operations (fail-closed):
 *   1. parse argv — invalid argv exits 2 before anything else;
 *   2. `--help` prints usage and exits 0 without resolving any authority;
 *   3. APPLY must pass the SHARED P6 apply-authority decision (genuine
 *      service-role) BEFORE the client factory is called; a refusal exits 1
 *      with ZERO clients and zero DB/network calls; dry run keeps the
 *      read-capable key resolution;
 *   4. missing Supabase URL/key exits 1 with zero clients;
 *   5. only then is the client created and the runner invoked; the summary is
 *      always emitted as JSON and any fatal summary exits 1.
 */

import type { P6TargetObservation as P6SourceStaleTargetObservation } from './p6InterlinkDisposition'
import type { P6BatchAApplyAuthorityDecision } from './p6BatchAApplyAuthority'
import {
  P6_SOURCE_STALE_USAGE,
  parseSourceStaleArgs,
  type P6SourceStaleArgParse,
  type P6ShippedSourceResolution as P6SourceStaleResolution,
} from './p6SourceStaleRejection'
import {
  runP6SourceStaleRejection,
  type P6SourceStaleCandidateRead,
  type P6SourceStaleLiveEstateRead,
  type P6SourceStaleMissionJobProbe,
  type P6SourceStaleMissionRead,
  type P6SourceStaleRunnerDeps,
  type P6ShippedMissionResolutionInput,
  type P6SourceStaleStatusCounts,
  type P6SourceStaleSummary,
  type P6SourceStaleWrite,
  type P6SourceStaleWriteResult,
} from './p6SourceStaleRejectionRunner'
export interface P6SourceStaleCliBoundaryDeps {
  argv: string[]
  readSupabaseUrl: () => string | null | undefined
  /** Read-capable key resolution (anon fallback allowed) — dry run only. */
  resolveReadKey: () => string | null | undefined
  /** Genuine service-role authority — hard prerequisite for apply. */
  resolveApplyAuthority: () => P6BatchAApplyAuthorityDecision
  createClient: (url: string, key: string) => unknown
  readCandidates: (client: unknown) => Promise<P6SourceStaleCandidateRead>
  readMissionPlans: (
    client: unknown,
    slugs: string[],
  ) => Promise<P6SourceStaleMissionRead>
  readLiveEstateUrls: (client: unknown) => Promise<P6SourceStaleLiveEstateRead>
  probeMissionJobIdentity: (
    client: unknown,
    slugs: string[],
  ) => Promise<P6SourceStaleMissionJobProbe>
  /** Deterministic ownership resolution for the shipped-source lane. */
  resolveShippedSources: (
    missions: P6ShippedMissionResolutionInput[],
  ) => Promise<Record<string, P6SourceStaleResolution | undefined>>
  /** Fresh GET-only probe of resolved canonical source URLs (exact key). */
  probeSourceUrls: (
    urls: string[],
  ) => Promise<Record<string, P6SourceStaleTargetObservation | undefined>>
  /** Fresh live-target probe keyed by the EXACT trimmed stored target_url. */
  observeTargets: (
    exactTargets: string[],
  ) => Promise<Record<string, P6SourceStaleTargetObservation | undefined>>
  applyRejection: (
    client: unknown,
    write: P6SourceStaleWrite,
  ) => Promise<P6SourceStaleWriteResult>
  countStatuses: (client: unknown) => Promise<P6SourceStaleStatusCounts | null>
  now?: () => string
  stdout?: (line: string) => void
  stderr?: (line: string) => void
}

export interface P6SourceStaleCliBoundaryResult {
  exitCode: number
  /** Present only when the runner was actually reached. */
  summary: P6SourceStaleSummary | null
}

/**
 * Explicit refusal predicates for the two injected boolean discriminated
 * unions (the CI typechecker does not narrow them at these sites). Fail-closed
 * order is unchanged: neither refusal reaches a client, a read or a write.
 */
function isArgParseRefusal(
  parsed: P6SourceStaleArgParse,
): parsed is { ok: false; error: string } {
  return parsed.ok === false
}

function isApplyAuthorityRefusal(
  authority: P6BatchAApplyAuthorityDecision,
): authority is { ok: false; error: string } {
  return authority.ok === false
}

/** Executable CLI boundary: returns the exit code instead of calling process.exit. */
export async function runP6SourceStaleCliBoundary(
  deps: P6SourceStaleCliBoundaryDeps,
): Promise<P6SourceStaleCliBoundaryResult> {
  const stdout = deps.stdout || ((line: string) => console.log(line))
  const stderr = deps.stderr || ((line: string) => console.error(line))

  const parsed = parseSourceStaleArgs(deps.argv)
  if (isArgParseRefusal(parsed)) {
    stderr(`Refusing to run: ${parsed.error}`)
    stderr(P6_SOURCE_STALE_USAGE)
    return { exitCode: 2, summary: null }
  }
  if (parsed.config.help) {
    stdout(P6_SOURCE_STALE_USAGE)
    return { exitCode: 0, summary: null }
  }

  const supabaseUrl = deps.readSupabaseUrl()
  let supabaseKey: string | null | undefined

  if (parsed.config.apply) {
    // APPLY: hard service-role prerequisite, enforced BEFORE any client exists.
    const authority = deps.resolveApplyAuthority()
    if (isApplyAuthorityRefusal(authority)) {
      stderr(
        `Refusing to run: apply mode requires genuine service-role authority — ${authority.error}`,
      )
      stderr('No Supabase client was created; no DB or network call was made.')
      return { exitCode: 1, summary: null }
    }
    supabaseKey = authority.key
  } else {
    supabaseKey = deps.resolveReadKey()
  }

  if (!supabaseUrl || !supabaseKey) {
    stderr('Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL + key)')
    return { exitCode: 1, summary: null }
  }

  try {
    const client = deps.createClient(supabaseUrl, supabaseKey)
    const runnerDeps: P6SourceStaleRunnerDeps = {
      readCandidates: () => deps.readCandidates(client),
      readMissionPlans: (slugs) => deps.readMissionPlans(client, slugs),
      readLiveEstateUrls: () => deps.readLiveEstateUrls(client),
      probeMissionJobIdentity: (slugs) => deps.probeMissionJobIdentity(client, slugs),
      resolveShippedSources: (missions) => deps.resolveShippedSources(missions),
      probeSourceUrls: (urls) => deps.probeSourceUrls(urls),
      observeTargets: (exactTargets) => deps.observeTargets(exactTargets),
      applyRejection: (write) => deps.applyRejection(client, write),
      countStatuses: () => deps.countStatuses(client),
      now: deps.now,
      log: stderr,
    }
    const summary = await runP6SourceStaleRejection(parsed.config, runnerDeps)
    stdout(JSON.stringify(summary, null, 2))
    return { exitCode: summary.fatalErrors.length > 0 ? 1 : 0, summary }
  } catch (error) {
    stderr(error instanceof Error ? error.message : String(error))
    return { exitCode: 1, summary: null }
  }
}
