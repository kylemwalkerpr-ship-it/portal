/**
 * P0 broad-CREATE freeze — execution gate at the central SEO Factory boundary
 * AND at every publication door (the shipContent Git write and the direct
 * existing-PR merges).
 *
 * Cleanup-to-expansion parity is not yet proven (P13 controlled expansion is
 * still PENDING), so an unmatched keyword routed by standing rules or a
 * content-type default must not become permission to author and ship a
 * net-new public page. This is an EXECUTION rule, not a routing rewrite:
 * `resolveOwner` keeps emitting standing_rules plans unchanged, and the
 * manual ownership-routing contract is untouched.
 *
 * The gate classifies the FINAL DESTINATION, not the keyword match: a keyword
 * may match an existing Legal registry row while `resolveOwner` intentionally
 * routes an explicit non-Legal destination to a different, net-new URL
 * (stealLegalPillar). There `matched` is non-null but the destination is still
 * unowned, so it stays frozen. The same applies to `registry_host`, which is
 * emitted only when a matched row's `owner_url` cannot be parsed and
 * `resolveOwner` invents a fallback path — a fabricated destination, not an
 * existing owner, so `expand` / `keep` labels on it are not proof either.
 *
 * Authority is destination agreement, never a label:
 *   - `registry_owner_url` is authoritative ONLY when the matched row's
 *     `owner_url` is parseable and normalized-equal to the final canonical
 *     (harmless trailing slash aside). An `ownerUrlHint` that matches no
 *     registry row, or that diverges from the matched owner, is a fabrication.
 *   - `strike_seed` is authoritative ONLY when the final canonical is the
 *     locked strike-seed canonical that fresh resolution produced.
 *   - `registry_host` / `standing_rules` / `content_type_default` / unknown
 *     routing sources are always frozen. A YouSafe hostname is not proof.
 *
 * Static authority is NECESSARY but NOT SUFFICIENT. Live read-only evidence
 * across all 76 current ownership-registry URLs found 10 owner URLs redirecting
 * to DIFFERENT destinations (including confirmed/keep rows) and one 404, so a
 * registry row agreeing with the final canonical does not prove the destination
 * still exists. Before authoring (pipeline/pipelineStream) and before any Git
 * write or merge (shipContent, direct existing-PR merges) the intended
 * canonical must additionally pass an EXACT LIVE existence proof:
 *   - probe only AFTER static authority passes (standing_rules,
 *     registry_host, content_type_default, unknown and fabricated hint URLs are
 *     never fetched — no SSRF surface),
 *   - HEAD with redirect:'follow' + timeout; retry GET on 403/405/501,
 *   - final status must be 2xx and the normalized final response URL must equal
 *     the intended canonical (harmless trailing slash aside),
 *   - a redirect to any different URL, any non-2xx (404/410/…), a network
 *     error/timeout or an unusable response URL fails closed,
 *   - a short in-memory cache (5m) avoids repeated checks; completed HTTP
 *     verdicts are cached, transient network failures are not.
 *
 * Future P13 unlock: set `SEO_FACTORY_UNLOCK_BROAD_CREATE=1` (or `true`) once
 * the cleanup-to-expansion parity gates are proven. The default is frozen and
 * the flag is never inferred from unrelated environment variables. The explicit
 * unlock bypasses BOTH the static and the live proof and performs no fetch.
 *
 * Deliberately dependency-light (type-only ownership import + the pure
 * strike-seed table) so tests and callers do not load the ownership registry,
 * the liveVerify DB/CDN stack or the AI stack to evaluate the gate.
 */

import { isAuthoritativeOwnershipRow, type OwnerPlan } from './ownership'
import { GSC_STRIKE_SEEDS_2026_08 } from './strikeSeeds'

export const BROAD_CREATE_UNLOCK_ENV = 'SEO_FACTORY_UNLOCK_BROAD_CREATE'

/**
 * Content type used ONLY for publication-door ownership-proof re-resolution.
 *
 * Publication proof answers one question — "does CURRENT no-hint ownership
 * registry/strike-seed truth prove this persisted final canonical is an
 * existing owner?" — which is independent of the article's RENDERING content
 * type. A legal registry owner can carry a news_summary intent, so the
 * pipeline finalizes the rendering type to `blog_post` while the owner still
 * lives on the legal/apex host. Re-resolving with `blog_post` would take
 * `resolveOwner`'s explicit-blog standing-rules early return and refuse the
 * very owner authoring approved (its canonical would re-resolve to a new
 * sibling), so publication always re-resolves owner truth with this neutral
 * ownership-proof type. Rendering, gates and persistence keep using the
 * finalized contentType unchanged; this value is never a destination hint.
 */
export const PUBLICATION_OWNERSHIP_PROOF_CONTENT_TYPE = 'legal_guide'

/**
 * The OwnerPlan fields accepted by the gate. `matched` and `action` are
 * accepted for call-site compatibility but the action label is deliberately
 * NOT consulted: an `expand` / `keep` label on a fallback route is not proof
 * that the final destination exists.
 */
export type BroadCreatePlan = Pick<
  OwnerPlan,
  'matched' | 'action' | 'routingSource' | 'canonicalUrl'
>

/**
 * Normalized destination key for authority comparison: trimmed absolute URL
 * with harmless trailing slashes removed. Blank or unparseable URLs return
 * null so every comparison fails closed.
 */
export function normalizeDestinationKey(url: string | null | undefined): string | null {
  const raw = String(url ?? '').trim()
  if (!raw) return null
  try {
    const parsed = new URL(raw)
    parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/'
    return parsed.toString()
  } catch {
    return null
  }
}

const STRIKE_SEED_CANONICALS: ReadonlySet<string> = new Set(
  GSC_STRIKE_SEEDS_2026_08
    .map((seed) => normalizeDestinationKey(seed.canonicalUrl))
    .filter((key): key is string => key !== null),
)

/** The locked strike-seed key a plan must carry to claim strike-seed authority. */
function strikeSeedKey(canonicalUrl: string | null | undefined): string | null {
  const key = normalizeDestinationKey(canonicalUrl)
  return key !== null && STRIKE_SEED_CANONICALS.has(key) ? key : null
}

/**
 * True when the freshly resolved `authority` proves `finalCanonicalUrl` is an
 * EXISTING owner:
 *   - `registry_owner_url`: the matched registry row's `owner_url` is
 *     parseable and normalized-equal to the final canonical;
 *   - `strike_seed`: the final canonical is the locked strike-seed canonical
 *     (and equals the freshly resolved seed canonical it is compared to).
 *
 * Every other routing source is an invented destination → false. Action
 * labels and the YouSafe hostname are never consulted.
 */
export function isAuthoritativeDestination(
  authority: Pick<BroadCreatePlan, 'matched' | 'routingSource' | 'canonicalUrl'>,
  finalCanonicalUrl: string | null | undefined,
): boolean {
  const final = normalizeDestinationKey(finalCanonicalUrl)
  if (!final) return false
  if (authority.routingSource === 'registry_owner_url') {
    if (!isAuthoritativeOwnershipRow(authority.matched)) return false
    const owner = normalizeDestinationKey(authority.matched.owner_url)
    return owner !== null && owner === final
  }
  if (authority.routingSource === 'strike_seed') {
    const resolvedSeed = strikeSeedKey(authority.canonicalUrl)
    return resolvedSeed !== null && resolvedSeed === final
  }
  return false
}

/**
 * True when the plan's FINAL DESTINATION is not proven to already exist. A
 * non-null `matched` row is NOT proof either: `resolveOwner` can match a
 * registry keyword yet deliberately route an explicit destination elsewhere
 * (stealLegalPillar) or diverge from the matched owner because of a hint, and
 * `registry_host` fabricates a path when the matched owner URL is unusable.
 */
export function isBroadNetNewCreate(plan: BroadCreatePlan): boolean {
  return !isAuthoritativeDestination(plan, plan.canonicalUrl)
}

function envValue(env: Record<string, string | undefined>, key: string): string {
  const raw = env[key]
  return raw == null ? '' : String(raw).trim().toLowerCase()
}

/**
 * The one intentional P13 unlock. Only `1` / `true` unlock; everything else
 * (including missing, `0`, `false`, unrelated env vars) stays frozen.
 */
export function isBroadCreateUnlocked(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): boolean {
  const value = envValue(env, BROAD_CREATE_UNLOCK_ENV)
  return value === '1' || value === 'true'
}

/** Deterministic, operator-readable refusal message. */
export function broadCreateFreezeMessage(
  plan: BroadCreatePlan,
  opts: { primaryKeyword?: string } = {},
): string {
  const keyword = opts.primaryKeyword ? `"${opts.primaryKeyword}" ` : ''
  const canonical = (plan as { canonicalUrl?: string }).canonicalUrl
  const filePath = (plan as { filePath?: string }).filePath
  const destination = [canonical, filePath].filter(Boolean).join(' · ')
  const matchedStatus = String(plan.matched?.status ?? '').trim() || '(missing)'
  const matchedAction = String(plan.matched?.action ?? '').trim() || '(missing)'
  const matchedNotes = String(plan.matched?.notes ?? '').trim()
  return [
    'Broad net-new CREATE is frozen pending cleanup-to-expansion parity (P13 controlled expansion not yet started).',
    `Refused plan for ${keyword}(action=${plan.action}, routingSource=${plan.routingSource}, ownerStatus=${matchedStatus}, ownerAction=${matchedAction})${destination ? ` → ${destination}` : ''}.`,
    `That routing source/ownership state does not prove the final destination already exists${matchedNotes ? ` (${matchedNotes})` : ''} — an action label alone is not an existing owner.`,
    'No drafting job was created and no AI generation was started.',
    'Resolve this keyword to an existing owner (matched registry owner URL or strike-seed owner), or deliberately unlock '
      + `${BROAD_CREATE_UNLOCK_ENV}=1 once the P13 expansion gates are proven.`,
  ].join(' ')
}

/** Operator-readable refusal for a publication door (ship / direct merge). */
export function publicationFreezeMessage(
  authority: Pick<BroadCreatePlan, 'matched' | 'routingSource' | 'canonicalUrl'>,
  finalCanonicalUrl: string | null | undefined,
  opts: { primaryKeyword?: string } = {},
): string {
  const keyword = opts.primaryKeyword ? `"${opts.primaryKeyword}" ` : ''
  const final = String(finalCanonicalUrl ?? '').trim() || '(blank)'
  const resolvedOwner =
    authority.routingSource === 'registry_owner_url'
      ? String(authority.matched?.owner_url ?? '').trim() || '(none)'
      : String(authority.canonicalUrl ?? '').trim() || '(none)'
  const matchedStatus = String(authority.matched?.status ?? '').trim() || '(missing)'
  const matchedAction = String(authority.matched?.action ?? '').trim() || '(missing)'
  const matchedNotes = String(authority.matched?.notes ?? '').trim()
  return [
    'Broad net-new CREATE is frozen pending cleanup-to-expansion parity (P13 controlled expansion not yet started).',
    `Refused publication for ${keyword}(routingSource=${authority.routingSource}, ownerStatus=${matchedStatus}, ownerAction=${matchedAction}) → final destination ${final}.`,
    `That destination/ownership state does not match a currently authoritative existing owner (${resolvedOwner})${matchedNotes ? ` (${matchedNotes})` : ''}. A registry row, an ownerUrlHint, or a YouSafe hostname is authority only when the row is authoritative and the final canonical equals the resolved owner.`,
    'No Git write was performed.',
    `Resolve this keyword to its current existing owner, or deliberately unlock ${BROAD_CREATE_UNLOCK_ENV}=1 once the P13 expansion gates are proven.`,
  ].join(' ')
}

/**
 * Pure static execution gate — call immediately after `resolveOwner()` when
 * only the deterministic routing classification is needed. Throws for broad
 * net-new CREATE unless the explicit P13 unlock is configured. Production
 * authoring boundaries must use `assertBroadCreateDestinationAllowed` instead:
 * static authority alone cannot see registry owners that now redirect or 404.
 */
export function assertBroadCreateAllowed(
  plan: BroadCreatePlan,
  opts: {
    primaryKeyword?: string
    env?: Record<string, string | undefined>
  } = {},
): void {
  if (!isBroadNetNewCreate(plan)) return
  if (isBroadCreateUnlocked(opts.env)) return
  throw new Error(broadCreateFreezeMessage(plan, { primaryKeyword: opts.primaryKeyword }))
}

// ── exact live existence proof ──────────────────────────────────────────────

/** Completed verdict for one intended canonical. `at` is the epoch-ms cache time. */
export interface BroadCreateLiveVerdict {
  ok: boolean
  status: number
  /** Normalized final response URL when an HTTP response was received. */
  finalUrl: string
  reason:
    | 'exact_live'
    | 'invalid_destination'
    | 'redirect_mismatch'
    | 'http_not_2xx'
    | 'invalid_final_url'
    | 'network_error'
  at: number
}

/** Short cache so repeated gates do not re-probe the same canonical. */
export const BROAD_CREATE_LIVE_CACHE_TTL_MS = 5 * 60_000
export const BROAD_CREATE_LIVE_TIMEOUT_ENV = 'SEO_FACTORY_LIVE_PROOF_TIMEOUT_MS'
const BROAD_CREATE_LIVE_TIMEOUT_DEFAULT_MS = 8_000

const liveVerdictCache = new Map<string, BroadCreateLiveVerdict>()

/** Test hook: clear the in-memory live-verdict cache between hermetic tests. */
export function resetBroadCreateLiveCache(): void {
  liveVerdictCache.clear()
}

export interface BroadCreateLiveOptions {
  primaryKeyword?: string
  env?: Record<string, string | undefined>
  /** Injectable fetch for hermetic tests. Production uses global fetch. */
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

function liveTimeoutMs(explicit?: number): number {
  if (typeof explicit === 'number' && Number.isFinite(explicit) && explicit > 0) return explicit
  const raw = Number(process.env[BROAD_CREATE_LIVE_TIMEOUT_ENV])
  return Number.isFinite(raw) && raw > 0 ? raw : BROAD_CREATE_LIVE_TIMEOUT_DEFAULT_MS
}

/**
 * Exact live existence proof for an intended canonical. Never call this with a
 * URL that has not already passed static authority — the probe is only safe for
 * trusted resolved owners, not for fabricated/standing-rules destinations.
 *
 * HEAD (redirect:follow) → GET retry on 403/405/501 → final 2xx AND normalized
 * final URL equal to the intended canonical. Every failure mode fails closed.
 */
export async function checkBroadCreateDestinationLive(
  intendedCanonicalUrl: string | null | undefined,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<BroadCreateLiveVerdict> {
  const intendedKey = normalizeDestinationKey(intendedCanonicalUrl)
  if (!intendedKey) {
    return { ok: false, status: 0, finalUrl: '', reason: 'invalid_destination', at: Date.now() }
  }
  const cached = liveVerdictCache.get(intendedKey)
  if (cached && Date.now() - cached.at < BROAD_CREATE_LIVE_CACHE_TTL_MS) return cached

  // Probe the canonical exactly as resolved (its trailing-slash form is the
  // live URL the owner actually serves); compare/cache by the normalized key.
  const target = String(intendedCanonicalUrl ?? '').trim()
  const doFetch = opts.fetchImpl ?? fetch
  const timeoutMs = liveTimeoutMs(opts.timeoutMs)
  let verdict: BroadCreateLiveVerdict
  try {
    const probe = (method: 'HEAD' | 'GET') =>
      doFetch(target, { method, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) })
    let res = await probe('HEAD')
    // Some estates answer 403/405/501 for HEAD — retry the same URL as GET.
    if (res.status === 403 || res.status === 405 || res.status === 501) {
      res = await probe('GET')
    }
    const status = Number(res.status) || 0
    const finalKey = normalizeDestinationKey(res.url)
    if (!finalKey) {
      verdict = { ok: false, status, finalUrl: '', reason: 'invalid_final_url', at: Date.now() }
    } else if (finalKey !== intendedKey) {
      verdict = { ok: false, status, finalUrl: finalKey, reason: 'redirect_mismatch', at: Date.now() }
    } else if (status < 200 || status >= 300) {
      verdict = { ok: false, status, finalUrl: finalKey, reason: 'http_not_2xx', at: Date.now() }
    } else {
      verdict = { ok: true, status, finalUrl: finalKey, reason: 'exact_live', at: Date.now() }
    }
  } catch {
    verdict = { ok: false, status: 0, finalUrl: '', reason: 'network_error', at: Date.now() }
  }
  // Cache completed HTTP verdicts only: a transient network failure must be able
  // to recover on the next attempt instead of pinning the destination closed.
  if (verdict.reason !== 'network_error') liveVerdictCache.set(intendedKey, verdict)
  return verdict
}

function liveFailureDetail(verdict: BroadCreateLiveVerdict): string {
  switch (verdict.reason) {
    case 'redirect_mismatch':
      return `the URL redirects to a different destination (${verdict.finalUrl || 'unknown'}${verdict.status ? `, HTTP ${verdict.status}` : ''})`
    case 'http_not_2xx':
      return `the URL answered HTTP ${verdict.status || '(none)'}`
    case 'network_error':
      return 'the live probe could not complete (network error or timeout)'
    case 'invalid_final_url':
      return 'the live probe returned an unusable response URL'
    default:
      return 'the destination URL is not usable'
  }
}

/** Deterministic, operator-readable refusal for a failed exact-live proof. */
export function liveDestinationFreezeMessage(
  intendedCanonicalUrl: string | null | undefined,
  verdict: BroadCreateLiveVerdict,
  opts: { primaryKeyword?: string } = {},
): string {
  const keyword = opts.primaryKeyword ? `"${opts.primaryKeyword}" ` : ''
  const intended = String(intendedCanonicalUrl ?? '').trim() || '(blank)'
  return [
    'Broad net-new CREATE is frozen pending cleanup-to-expansion parity (P13 controlled expansion not yet started).',
    `Refused ${keyword}because the exact live existence proof failed for ${intended} (${verdict.reason}).`,
    `Static/registry agreement is necessary but not sufficient: ${liveFailureDetail(verdict)}.`,
    'No drafting job was created, no AI generation was started and no Git write was performed.',
    `Resolve this keyword to an exactly-live existing owner, or deliberately unlock ${BROAD_CREATE_UNLOCK_ENV}=1 once the P13 expansion gates are proven.`,
  ].join(' ')
}

async function assertDestinationLiveExact(
  intendedCanonicalUrl: string | null | undefined,
  opts: {
    primaryKeyword?: string
    fetchImpl?: typeof fetch
    timeoutMs?: number
  },
): Promise<void> {
  const verdict = await checkBroadCreateDestinationLive(intendedCanonicalUrl, {
    fetchImpl: opts.fetchImpl,
    timeoutMs: opts.timeoutMs,
  })
  if (verdict.ok) return
  throw new Error(
    liveDestinationFreezeMessage(intendedCanonicalUrl, verdict, {
      primaryKeyword: opts.primaryKeyword,
    }),
  )
}

/**
 * Execution gate — call immediately after `resolveOwner()` and before any AI
 * generation or drafting-job persistence. Enforces BOTH static authority and an
 * exact live existence proof; the explicit P13 unlock bypasses both and performs
 * no fetch.
 */
export async function assertBroadCreateDestinationAllowed(
  plan: BroadCreatePlan,
  opts: BroadCreateLiveOptions = {},
): Promise<void> {
  const env = opts.env ?? (process.env as Record<string, string | undefined>)
  if (isBroadCreateUnlocked(env)) return
  assertBroadCreateAllowed(plan, { primaryKeyword: opts.primaryKeyword, env })
  await assertDestinationLiveExact(plan.canonicalUrl, opts)
}

/**
 * Publication gate — call after freshly re-resolving ownership WITHOUT hints
 * and before any Git read/write/branch creation (shipContent) or
 * `mergePullRequest` (direct existing-PR merges). The ACTUAL final/persisted
 * destination must equal the resolved existing owner (static authority) AND
 * pass the exact live existence proof; a blank destination or a dead/redirected
 * owner fails closed. The explicit P13 unlock is the only bypass and performs
 * no fetch.
 */
export async function assertPublicationDestinationAllowed(
  authority: Pick<BroadCreatePlan, 'matched' | 'routingSource' | 'canonicalUrl'>,
  finalCanonicalUrl: string | null | undefined,
  opts: BroadCreateLiveOptions = {},
): Promise<void> {
  const env = opts.env ?? (process.env as Record<string, string | undefined>)
  if (isBroadCreateUnlocked(env)) return
  if (!isAuthoritativeDestination(authority, finalCanonicalUrl)) {
    throw new Error(
      publicationFreezeMessage(authority, finalCanonicalUrl, { primaryKeyword: opts.primaryKeyword }),
    )
  }
  await assertDestinationLiveExact(finalCanonicalUrl, opts)
}
