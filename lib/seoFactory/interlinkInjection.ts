/**
 * lib/seoFactory/interlinkInjection.ts
 *
 * P6 — fail-closed internal-link injection for the drafting pipeline.
 *
 * Before this module, `pipelineStream` verified automatic planner/radar
 * interlinks best-effort: a verifier throw fell into an empty `catch`, leaving
 * every unverified planner link in the draft allowlist. The draft could then
 * embed dead 404 targets or a legacy auth-wall URL that no live check ever
 * approved.
 *
 * The contract here is fail-closed and pure (the live verifier is injected, so
 * callers keep using the existing link-validity authority):
 *   · verifier throws or rejects   → ZERO links, `ok:false`;
 *   · verifier returns no live URL → ZERO links, `ok:false`;
 *   · otherwise                    → only URLs the verifier proved live.
 *
 * It never invents a replacement link, never keeps an unverified one, and a
 * degraded verification can only remove prompts, never add them.
 * `pruneInterlinksToLiveTargets` reports `withheld` even on partial success
 * (dead / external / unverifiable candidates), and matches root-relative
 * estate candidates through the injected resolver so they compare correctly
 * against the verifier's proven absolute URL.
 *
 * Provider/profile/gig marketplace citations (`pruneProviderAuthorLinks`) pass
 * the same gate on BOTH pipeline surfaces before prompt injection. The estate
 * helper exempts `market.yousafeconsultancy.com` provider URLs from its
 * sitemap-coverage check (`isProtectedMarketplaceUrl`), so that exemption is
 * never proof: `verifyMarketplaceServiceUrlsLive` checks each URL through the
 * repository's real HTTP liveness authority (`verifyUrlsLive` +
 * `classifyLiveStatus`) and withholds anything it cannot prove. Author
 * citation metadata (name/credential/role) survives a withheld link, and
 * `authorPackFromPrunedCitations` rebuilds the ContentSpec/playbook/prompt
 * author pack from the PRUNED citations so an unverified profile/gig URL can
 * never survive through author metadata either.
 */

import type { AuthorPack } from './authorPack'

export interface InterlinkCandidateLike {
  url?: string
}

export interface PruneInterlinksOptions {
  /**
   * Resolve a candidate URL the same way the injected live verifier resolves
   * its output before matching (e.g. `resolveEstateUrl` for the internal-link
   * authority). Without it a root-relative estate candidate can never match
   * the verifier's absolute URL and would be wrongly withheld.
   */
  resolveCandidate?: (url: string) => string
}

export interface PrunedInterlinks<T> {
  links: T[]
  ok: boolean
  /**
   * Candidate links that carried a URL the live verifier did NOT prove live
   * (dead, external/non-estate, or unverifiable). Reported even on a partial
   * success so a degraded allowlist is never silent.
   *
   * Counted over DISTINCT normalized candidate URLs (trailing-slash/case
   * variants of one target never inflate the count), and `withheld: 0` never
   * means "all is well" when `ok: false`.
   */
  withheld: number
  /**
   * True only when the verifier itself could not run (throw). `ok: false`
   * with `verifierUnavailable: false` is a SUCCESSFUL verification that proved
   * no candidate live — all candidates are dead/withheld, which is not a
   * verifier failure and must be reported as such.
   */
  verifierUnavailable?: boolean
  error?: string
}

/** Minimal pruned-citation shape needed to rebuild the writer AuthorPack. */
export interface PrunedAuthorCitation extends ProviderCitationLike {
  experienceScope?: string
  credentialLine?: string
  role?: string
  servicePages?: Array<{ title?: string; url?: string; match?: string }>
}

function normalizeKey(url: string): string {
  const trimmed = String(url || '').trim()
  if (!trimmed) return ''
  return trimmed.length > 1 ? trimmed.replace(/\/+$/, '') : trimmed
}

/**
 * Keep only candidates whose URL the live verifier proves live.
 *
 * `verifyLive` is the existing link-validity authority
 * (`filterLiveInternalUrls`) or any equivalent function returning the live
 * subset of the inputs.
 */
export async function pruneInterlinksToLiveTargets<T extends InterlinkCandidateLike>(
  interlinks: T[],
  verifyLive: (urls: string[]) => Promise<string[]>,
  opts: PruneInterlinksOptions = {},
): Promise<PrunedInterlinks<T>> {
  const list = Array.isArray(interlinks) ? interlinks : []
  const resolve = typeof opts.resolveCandidate === 'function' ? opts.resolveCandidate : (url: string) => url
  const candidates = list
    .map((link) => ({ link, url: String(link?.url || '').trim() }))
    .filter((candidate) => Boolean(candidate.url))

  // Candidates without a URL are not verifiable links; nothing to prove, and
  // they were never links, so they are not counted as withheld links either.
  if (candidates.length === 0) return { links: [], ok: true, withheld: 0 }
  // Distinct normalized candidate URLs: trailing-slash (or equivalent) forms
  // of the SAME target are one candidate, so `withheld` cannot be inflated.
  const candidateKeys = new Set(candidates.map((candidate) => normalizeKey(candidate.url)).filter(Boolean))

  let liveUrls: string[]
  try {
    liveUrls = await verifyLive(candidates.map((candidate) => candidate.url))
  } catch (error) {
    return {
      links: [],
      ok: false,
      verifierUnavailable: true,
      withheld: candidateKeys.size,
      error: error instanceof Error ? error.message : String(error || 'live verification failed'),
    }
  }

  // Two key maps: the verifier's own URL bytes (so a candidate that already is
  // the live URL keeps its exact form) and the resolved form (so a
  // root-relative candidate matches the proven absolute URL).
  const liveByRawKey = new Map<string, string>()
  const liveByResolvedKey = new Map<string, string>()
  for (const url of Array.isArray(liveUrls) ? liveUrls : []) {
    const raw = String(url || '').trim()
    if (!raw) continue
    const rawKey = normalizeKey(raw)
    if (rawKey && !liveByRawKey.has(rawKey)) liveByRawKey.set(rawKey, raw)
    const resolvedKey = normalizeKey(resolve(raw))
    if (resolvedKey && !liveByResolvedKey.has(resolvedKey)) liveByResolvedKey.set(resolvedKey, raw)
  }
  if (!liveByRawKey.size && !liveByResolvedKey.size) {
    return {
      links: [],
      ok: false,
      // The verifier RAN and proved nothing live: all candidates are withheld
      // (dead/unverifiable), which is not a verifier failure.
      verifierUnavailable: false,
      withheld: candidateKeys.size,
      error: 'no live internal target was verified',
    }
  }

  const seen = new Set<string>()
  const withheldKeys = new Set<string>()
  const links: T[] = []
  for (const candidate of candidates) {
    const rawKey = normalizeKey(candidate.url)
    const rawProven = rawKey ? liveByRawKey.get(rawKey) : undefined
    if (rawProven) {
      if (!seen.has(rawKey)) {
        seen.add(rawKey)
        links.push(candidate.link)
      }
      continue
    }
    const resolvedKey = normalizeKey(resolve(candidate.url))
    const resolvedProven = resolvedKey ? liveByResolvedKey.get(resolvedKey) : undefined
    if (resolvedProven) {
      if (!seen.has(resolvedKey)) {
        seen.add(resolvedKey)
        // Preserve the original label/match metadata but emit the PROVEN live
        // canonical/absolute URL the verifier actually approved.
        links.push(
          candidate.url === resolvedProven
            ? candidate.link
            : ({ ...candidate.link, url: resolvedProven } as T),
        )
      }
      continue
    }
    const deadKey = normalizeKey(candidate.url)
    if (deadKey) withheldKeys.add(deadKey)
  }
  if (links.length === 0) {
    return {
      links: [],
      ok: false,
      verifierUnavailable: false,
      withheld: withheldKeys.size,
      error: 'no candidate survived live verification',
    }
  }
  return { links, ok: true, verifierUnavailable: false, withheld: withheldKeys.size }
}

/** Minimal citation shape shared by the provider-author prompt records. */
export interface ProviderCitationLike {
  profileUrl?: string
  servicePages?: Array<{ url?: string }>
}

export interface PrunedProviderAuthorLinks<T, C> {
  /** Provider/gig links the live verifier proved live (dead ones withheld). */
  links: T[]
  /**
   * The same citation records with every URL the verifier did NOT prove live
   * removed. Name, credential, role and match metadata are preserved — a
   * withheld link never withholds the author citation itself.
   */
  cited: C[]
  /** True when verification actually ran (a verifier throw is `false`). */
  ok: boolean
  /** True only when the verifier itself could not run (throw). */
  verifierUnavailable?: boolean
  /**
   * Distinct normalized candidate URLs withheld (not proven live, or
   * unverifiable). Trailing-slash variants of one URL are one candidate, so
   * the count is never inflated by formatting.
   */
  withheld: number
  /** Distinct candidate URLs proven live. */
  verified: number
  error?: string
}

function citationUrlKeys(person: ProviderCitationLike): string[] {
  return [
    String(person?.profileUrl || '').trim(),
    ...(person?.servicePages || []).map((page) => String(page?.url || '').trim()),
  ]
    .map((url) => normalizeKey(url))
    .filter(Boolean)
}

/**
 * Marketplace provider/profile/gig citation links must pass the SAME liveness
 * authority as every other automatic link before they reach a prompt.
 *
 * The verifier is injected (helper-testable, no network at test time). When it
 * throws, EVERY provider link is withheld and the citation records keep their
 * metadata with no URLs; when it proves nothing live, the dead URLs are
 * withheld. No replacement link is ever invented, and the author citation
 * (name/credential/role/why-this-article) survives either way.
 */
export async function pruneProviderAuthorLinks<
  T extends InterlinkCandidateLike,
  C extends ProviderCitationLike,
>(
  links: T[],
  cited: C[],
  verifyLive: (urls: string[]) => Promise<string[]>,
): Promise<PrunedProviderAuthorLinks<T, C>> {
  const linkList = Array.isArray(links) ? links : []
  const citedList = Array.isArray(cited) ? cited : []
  // Distinct by NORMALIZED key (trailing slash/case form of one URL is one
  // candidate) while preserving the first raw form for the verifier.
  const candidateUrlByKey = new Map<string, string>()
  for (const url of [
    ...linkList.map((link) => String(link?.url || '').trim()),
    ...citedList.flatMap((person) => citationUrlKeys(person)),
  ]) {
    const key = normalizeKey(url)
    if (key && !candidateUrlByKey.has(key)) candidateUrlByKey.set(key, url)
  }
  const candidateUrls = [...candidateUrlByKey.values()]
  const stripCited = (liveKeys: Set<string>): C[] =>
    citedList.map((person) => {
      const profileUrl = String(person?.profileUrl || '').trim()
      const servicePages = (person?.servicePages || []).filter((page) =>
        liveKeys.has(normalizeKey(String(page?.url || ''))),
      )
      return {
        ...person,
        profileUrl: liveKeys.has(normalizeKey(profileUrl)) ? profileUrl : '',
        servicePages,
      } as C
    })
  if (!candidateUrls.length) {
    // Candidates without a URL are not verifiable links, so they are not
    // counted as withheld links (consistent with pruneInterlinksToLiveTargets).
    return { links: [], cited: stripCited(new Set()), ok: true, withheld: 0, verified: 0 }
  }

  let liveUrls: string[]
  try {
    liveUrls = await verifyLive(candidateUrls)
  } catch (error) {
    return {
      links: [],
      cited: stripCited(new Set()),
      ok: false,
      verifierUnavailable: true,
      withheld: candidateUrls.length,
      verified: 0,
      error: error instanceof Error ? error.message : String(error || 'live verification failed'),
    }
  }

  const liveKeys = new Set(
    (Array.isArray(liveUrls) ? liveUrls : []).map((url) => normalizeKey(url)).filter(Boolean),
  )
  const keptLinks = linkList.filter((link) => liveKeys.has(normalizeKey(String(link?.url || ''))))
  const verified = candidateUrls.filter((url) => liveKeys.has(normalizeKey(url))).length
  return {
    links: keptLinks,
    cited: stripCited(liveKeys),
    ok: true,
    verifierUnavailable: false,
    withheld: candidateUrls.length - verified,
    verified,
  }
}

/**
 * H1 repair — the AuthoPack consumed by ContentSpec/brief/playbook/prompt must
 * be derived from the PRUNED citation state, never from the raw provider pack.
 *
 * The raw `providerAuthors.author` carried `marketplaceUrl = profileUrl` and
 * `servicePages` before any liveness proof; `pruneProviderAuthorLinks` only
 * pruned `cited`/`links`, so the raw author pack could still put an unverified
 * marketplace/profile/gig URL into the spec (and through it the playbook and
 * writer/system prompt) while the downstream audit exempts protected
 * marketplace URLs from its dead-link check.
 *
 * Metadata (name, credential, experienceScope, reviewedBy, providerType,
 * experienceBeats) always survives. `marketplaceUrl` is kept ONLY when the
 * exact profile URL the pack carried is proven live in the pruned citation
 * state; when it was withheld the key is OMITTED (never `''`, which ContentSpec
 * validation rejects and which would null the whole spec). Service pages are
 * intersected with the proven-live set, so an unverified gig URL can never
 * survive through author metadata.
 */
export function authorPackFromPrunedCitations(
  pack: AuthorPack | null | undefined,
  cited: PrunedAuthorCitation[] | null | undefined,
): AuthorPack | null {
  if (!pack) return null
  const first = Array.isArray(cited) ? cited[0] : undefined
  const provenProfileUrl = String(first?.profileUrl || '').trim()
  const packProfileUrl = String(pack.marketplaceUrl || '').trim()
  const packPageByKey = new Map(
    (pack.servicePages || []).map((page) => [normalizeKey(String(page?.url || '')), page]),
  )
  const servicePages = (first?.servicePages || [])
    .map((page) => {
      const key = normalizeKey(String(page?.url || ''))
      const original = key ? packPageByKey.get(key) : undefined
      if (!original?.url) return null
      return {
        title: String(original.title || ''),
        url: String(page?.url || original.url).trim(),
        ...(original.match ? { match: original.match } : {}),
      }
    })
    .filter((page): page is { title: string; url: string; match?: string } => Boolean(page?.url))

  const pruned: AuthorPack = { ...pack }
  delete pruned.marketplaceUrl
  delete pruned.servicePages
  // Only the pack's own profile URL, and only when the pruned citation state
  // proves that exact URL live, may survive.
  if (provenProfileUrl && packProfileUrl && provenProfileUrl === packProfileUrl) {
    pruned.marketplaceUrl = provenProfileUrl
  }
  if (servicePages.length) pruned.servicePages = servicePages
  return pruned
}

/**
 * Verify marketplace provider/profile/gig citation URLs through the
 * repository's ACTUAL HTTP liveness authority.
 *
 * `filterLiveInternalUrls` / the estate audit deliberately exempt
 * `market.yousafeconsultancy.com` provider URLs from their sitemap-coverage
 * check (`isProtectedMarketplaceUrl`), so that exemption is never treated as
 * proof: every URL is HEAD→GET checked by `verifyUrlsLive` and classified by
 * `classifyLiveStatus`. Only the marketplace providers/gigs host+path shape is
 * accepted — anything else is withheld, never trusted by host exemption.
 */
export async function verifyMarketplaceServiceUrlsLive(urls: string[]): Promise<string[]> {
  const candidates = [...new Set((Array.isArray(urls) ? urls : []).map((url) => String(url || '').trim()).filter(Boolean))]
  if (!candidates.length) return []
  const [{ verifyUrlsLive, classifyLiveStatus }, { isMarketplaceServiceUrl }] = await Promise.all([
    import('./linkAudit'),
    import('./providerAuthors'),
  ])
  const marketplace = candidates.filter((url) => isMarketplaceServiceUrl(url))
  if (!marketplace.length) return []
  const results = await verifyUrlsLive(marketplace)
  return marketplace.filter((url) => {
    const result = results.get(url)
    return Boolean(result && classifyLiveStatus(url, result.status).ok)
  })
}
