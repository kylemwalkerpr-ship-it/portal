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
 *
 * Provider/profile/gig marketplace citations (`pruneProviderAuthorLinks`) pass
 * the same gate on BOTH pipeline surfaces before prompt injection. The estate
 * helper exempts `market.yousafeconsultancy.com` provider URLs from its
 * sitemap-coverage check (`isProtectedMarketplaceUrl`), so that exemption is
 * never proof: `verifyMarketplaceServiceUrlsLive` checks each URL through the
 * repository's real HTTP liveness authority (`verifyUrlsLive` +
 * `classifyLiveStatus`) and withholds anything it cannot prove. Author
 * citation metadata (name/credential/role) survives a withheld link.
 */

export interface InterlinkCandidateLike {
  url?: string
}

export interface PrunedInterlinks<T> {
  links: T[]
  ok: boolean
  error?: string
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
): Promise<PrunedInterlinks<T>> {
  if (!Array.isArray(interlinks) || interlinks.length === 0) return { links: [], ok: true }

  const urls = interlinks.map((link) => String(link?.url || '').trim()).filter(Boolean)
  // Candidates without a URL are not verifiable links; withhold them.
  if (urls.length === 0) return { links: [], ok: true }

  let liveUrls: string[]
  try {
    liveUrls = await verifyLive(urls)
  } catch (error) {
    return {
      links: [],
      ok: false,
      error: error instanceof Error ? error.message : String(error || 'live verification failed'),
    }
  }

  const liveKeys = new Set(
    (Array.isArray(liveUrls) ? liveUrls : []).map((url) => normalizeKey(url)).filter(Boolean),
  )
  if (liveKeys.size === 0) {
    return { links: [], ok: false, error: 'no live internal target was verified' }
  }

  const links = interlinks.filter((link) => liveKeys.has(normalizeKey(String(link?.url || ''))))
  if (links.length === 0) {
    return { links: [], ok: false, error: 'no candidate survived live verification' }
  }
  return { links, ok: true }
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
  /** Distinct candidate URLs withheld (not proven live, or unverifiable). */
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
  const candidateUrls = [
    ...new Set(
      [
        ...linkList.map((link) => String(link?.url || '').trim()),
        ...citedList.flatMap((person) => citationUrlKeys(person)),
      ].filter(Boolean),
    ),
  ]
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
    return { links: [], cited: stripCited(new Set()), ok: true, withheld: linkList.length, verified: 0 }
  }

  let liveUrls: string[]
  try {
    liveUrls = await verifyLive(candidateUrls)
  } catch (error) {
    return {
      links: [],
      cited: stripCited(new Set()),
      ok: false,
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
    withheld: candidateUrls.length - verified,
    verified,
  }
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
