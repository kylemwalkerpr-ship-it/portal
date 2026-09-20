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
