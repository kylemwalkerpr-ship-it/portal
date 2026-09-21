/**
 * P6 Batch A — executable CLI boundary (argv → authority → client → runner).
 *
 * Every external boundary is injected (env readers, apply-authority decision,
 * client factory, candidate read, primary probe, GET re-confirmation, CAS
 * write, status counts, clock, stdout/stderr) so this module is fully
 * executable in tests with fakes: it reads no environment variables itself
 * (URL/key resolution is injected), imports no Supabase client, performs no
 * network call and contains no write verb. The `.mts` wrapper supplies the
 * real implementations and remains the only file that can reach the DB.
 *
 * Order of operations (fail-closed):
 *   1. parse argv — invalid argv exits 2 before anything else;
 *   2. `--help` prints usage and exits 0 without resolving any authority;
 *   3. APPLY must pass `resolveApplyAuthority()` (genuine service-role) BEFORE
 *      the client factory is called; a refusal exits 1 with ZERO clients and
 *      zero DB/network calls; dry run keeps the read-capable key resolution;
 *   4. missing Supabase URL/key exits 1 with zero clients;
 *   5. only then is the client created and the runner invoked; the summary is
 *      always emitted as JSON and any fatal summary exits 1.
 */

import type { P6TargetObservation } from './p6InterlinkDisposition'
import type { P6BatchAApplyAuthorityDecision } from './p6BatchAApplyAuthority'
import {
  P6_BATCH_A_USAGE,
  parseBatchAArgs,
  type P6BatchAArgParse,
} from './p6BatchAStaleRejection'
import {
  runP6BatchARejection,
  type P6BatchACandidateRead,
  type P6BatchARunnerDeps,
  type P6BatchAStatusCounts,
  type P6BatchASummary,
  type P6BatchAWrite,
  type P6BatchAWriteResult,
} from './p6BatchAStaleRejectionRunner'

export interface P6BatchACliBoundaryDeps {
  argv: string[]
  readSupabaseUrl: () => string | null | undefined
  /** Read-capable key resolution (anon fallback allowed) — dry run only. */
  resolveReadKey: () => string | null | undefined
  /** Genuine service-role authority — hard prerequisite for apply. */
  resolveApplyAuthority: () => P6BatchAApplyAuthorityDecision
  createClient: (url: string, key: string) => unknown
  readCandidates: (client: unknown) => Promise<P6BatchACandidateRead>
  /** Fresh primary probe keyed by the EXACT trimmed stored target_url. */
  observeTargets: (
    exactTargets: string[],
  ) => Promise<Record<string, P6TargetObservation | undefined>>
  /** Explicit GET re-confirmation keyed by the same exact URLs. */
  confirmDeadTargets: (
    exactTargets: string[],
  ) => Promise<Record<string, P6TargetObservation | undefined>>
  applyRejection: (client: unknown, write: P6BatchAWrite) => Promise<P6BatchAWriteResult>
  countStatuses: (client: unknown) => Promise<P6BatchAStatusCounts | null>
  now?: () => string
  stdout?: (line: string) => void
  stderr?: (line: string) => void
}

export interface P6BatchACliBoundaryResult {
  exitCode: number
  /** Present only when the runner was actually reached. */
  summary: P6BatchASummary | null
}

/**
 * Explicit refusal predicates for the two injected boolean discriminated
 * unions. The CI typechecker does not narrow `if (!decision.ok)` at these
 * sites, so the refusal variant is asserted by a declared type predicate
 * instead: the refusal body reads the exact `{ ok: false; error: string }`
 * member, and the success path keeps the remaining member. Fail-closed order
 * is unchanged: neither refusal reaches a client, a read or a write, and only
 * the exact declared success shape proceeds.
 */
function isBatchAArgParseRefusal(
  parsed: P6BatchAArgParse,
): parsed is { ok: false; error: string } {
  return parsed.ok === false
}

function isBatchAApplyAuthorityRefusal(
  authority: P6BatchAApplyAuthorityDecision,
): authority is { ok: false; error: string } {
  return authority.ok === false
}

/** Executable CLI boundary: returns the exit code instead of calling process.exit. */
export async function runP6BatchACliBoundary(
  deps: P6BatchACliBoundaryDeps,
): Promise<P6BatchACliBoundaryResult> {
  const stdout = deps.stdout || ((line: string) => console.log(line))
  const stderr = deps.stderr || ((line: string) => console.error(line))

  const parsed = parseBatchAArgs(deps.argv)
  if (isBatchAArgParseRefusal(parsed)) {
    stderr(`Refusing to run: ${parsed.error}`)
    stderr(P6_BATCH_A_USAGE)
    return { exitCode: 2, summary: null }
  }
  if (parsed.config.help) {
    stdout(P6_BATCH_A_USAGE)
    return { exitCode: 0, summary: null }
  }

  const supabaseUrl = deps.readSupabaseUrl()
  let supabaseKey: string | null | undefined

  if (parsed.config.apply) {
    // APPLY: hard service-role prerequisite, enforced BEFORE any client exists.
    const authority = deps.resolveApplyAuthority()
    if (isBatchAApplyAuthorityRefusal(authority)) {
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
    const runnerDeps: P6BatchARunnerDeps = {
      readCandidates: () => deps.readCandidates(client),
      observeTargets: (exactTargets) => deps.observeTargets(exactTargets),
      confirmDeadTargets: (exactTargets) => deps.confirmDeadTargets(exactTargets),
      applyRejection: (write) => deps.applyRejection(client, write),
      countStatuses: () => deps.countStatuses(client),
      now: deps.now,
      log: stderr,
    }
    const summary = await runP6BatchARejection(parsed.config, runnerDeps)
    stdout(JSON.stringify(summary, null, 2))
    return { exitCode: summary.fatalErrors.length > 0 ? 1 : 0, summary }
  } catch (error) {
    stderr(error instanceof Error ? error.message : String(error))
    return { exitCode: 1, summary: null }
  }
}
