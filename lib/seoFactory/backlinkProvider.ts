/**
 * BACKLINK PROVIDER — DataForSEO Backlinks API.
 *
 * Lights up the Master SEO Engine's links subsystem measurement slots
 * (l_referring_domains, l_estate_inbound, l_link_velocity, l_anchor_natural,
 * l_toxic_links, l_editorial_links) with real per-URL backlink data.
 *
 * Two requests per URL (~$0.024 each + per-row, per docs.dataforseo.com):
 *   1. /v3/backlinks/summary/live            — total backlinks, referring
 *      domains, new/lost, broken, domain spam score + rank.
 *   2. /v3/backlinks/backlinks/live (limit)  — per-link anchor text,
 *      nofollow flag, new/lost flags, per-link spam score.
 *
 * Graceful degradation is a hard requirement: no credentials configured,
 * an expired balance, a 401/5xx, or a timeout all return `null` (or a
 * degraded snapshot) so the engine simply keeps those slots dark — it never
 * crashes a review or blocks a ship.
 *
 * Auth: DataForSEO uses HTTP Basic auth with login:password (not an API key).
 *   DATAFORSEO_LOGIN     — your DataForSEO account login
 *   DATAFORSEO_PASSWORD  — your DataForSEO account password
 */

export const DATAFORSEO_ENDPOINT = 'https://api.dataforseo.com'

/** Local 0–1 linear normalization (avoids a circular import with masterEngine). */
function normRange(value: number, min: number, max: number, higherIsBetter = true): number {
  const span = max - min
  if (span <= 0) return 1
  const t = Math.max(0, Math.min(1, (value - min) / span))
  return higherIsBetter ? t : 1 - t
}

export function isBacklinkProviderConfigured(): boolean {
  return Boolean(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD)
}

function basicAuth(): string {
  return 'Basic ' + Buffer.from(
    `${process.env.DATAFORSEO_LOGIN || ''}:${process.env.DATAFORSEO_PASSWORD || ''}`,
  ).toString('base64')
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v
    : typeof v === 'string' && v.trim() !== '' ? Number(v) || null
    : null

// ═══ Snapshot ═════════════════════════════════════════════════════════════

export interface BacklinkAnchorSample {
  anchor: string
  nofollow: boolean | null
  isNew: boolean | null
  isLost: boolean | null
  spamScore: number | null
  /** External links on the source page (high ⇒ sitewide-ish / directory link). */
  sourceExternalLinks: number | null
}

export interface BacklinkSnapshot {
  url: string
  provider: 'dataforseo'
  fetchedAt: string
  totalBacklinks: number | null
  referringDomains: number | null
  referringMainDomains: number | null
  referringPages: number | null
  newBacklinks: number | null
  lostBacklinks: number | null
  brokenBacklinks: number | null
  /** Domain-level spam score 0–100 from the summary endpoint. */
  spamScore: number | null
  /** Domain rank 0–100. */
  domainRank: number | null
  /** Up to `limit` sampled backlinks with per-link attributes. */
  samples: BacklinkAnchorSample[]
}

export interface BacklinkSignalsInput {
  snapshot: BacklinkSnapshot
  primaryKeyword?: string
  brandTerms?: string[]
}

export interface BacklinkSignals {
  /** l_referring_domains 0–1 */
  referringDomains: number | null
  /** l_estate_inbound 0–1 */
  estateInbound: number | null
  /** l_link_velocity 0–1 (growth vs loss) */
  linkVelocity: number | null
  /** l_anchor_natural 0–1 (share of anchors that are neither exact-match nor brand) */
  anchorNatural: number | null
  /** l_toxic_links 0–1 (HIGH = clean, i.e. low toxic share) */
  toxicClean: number | null
  /** l_editorial_links 0–1 (dofollow share) */
  editorialLinks: number | null
  /** l_domain_authority 0–1 (domain rank 0–100) */
  domainAuthority: number | null
}

// ═══ Signal mapping ═══════════════════════════════════════════════════════

export function backlinkSignals({ snapshot, primaryKeyword, brandTerms = [] }: BacklinkSignalsInput): BacklinkSignals {
  const brand = brandTerms.filter(Boolean).map((b) => b.toLowerCase())
  const primary = (primaryKeyword || '').toLowerCase().trim()
  const samples = snapshot.samples || []

  // Referring domains: 0 → 300+ is a healthy spectrum for a niche site
  const referringDomains = snapshot.referringDomains == null
    ? null
    : normRange(Math.log10(Math.max(1, snapshot.referringDomains)), 0, 2.5, true)

  const estateInbound = snapshot.totalBacklinks == null
    ? null
    : normRange(Math.log10(Math.max(1, snapshot.totalBacklinks)), 0, 3, true)

  // Velocity: (new − lost)/(new + lost + 1) mapped 0→1 (pure loss .. pure growth)
  let linkVelocity: number | null = null
  if (snapshot.newBacklinks != null && snapshot.lostBacklinks != null) {
    const ratio = (snapshot.newBacklinks - snapshot.lostBacklinks) / (snapshot.newBacklinks + snapshot.lostBacklinks + 1)
    linkVelocity = Math.max(0, Math.min(1, ratio * 0.5 + 0.5))
  }

  // Anchor naturalness from the sampled links: neither exact-match primary
  // nor brand-anchored counts as "natural" editorial anchor text.
  let anchorNatural: number | null = null
  const anchorSample = samples.filter((s) => s.anchor && s.anchor.trim())
  if (anchorSample.length > 0) {
    let natural = 0
    for (const s of anchorSample) {
      const a = s.anchor.toLowerCase().trim()
      const isExact = primary && a === primary
      const isBrand = brand.length > 0 && brand.some((b) => a.includes(b))
      if (!isExact && !isBrand) natural++
    }
    anchorNatural = natural / anchorSample.length
  }

  // Toxic clean: combines the domain spam score with the sampled per-link spam.
  let toxicClean: number | null = null
  const spamSamples = samples.filter((s) => s.spamScore != null)
  const avgSampleSpam = spamSamples.length
    ? spamSamples.reduce((a, s) => a + (s.spamScore ?? 0), 0) / spamSamples.length
    : null
  const spamRef = avgSampleSpam ?? snapshot.spamScore
  if (spamRef != null) {
    const toxicShare = Math.max(spamRef / 100, snapshot.spamScore != null ? snapshot.spamScore / 100 : 0)
    toxicClean = 1 - toxicShare
  } else if (snapshot.spamScore != null) {
    toxicClean = 1 - snapshot.spamScore / 100
  }

  // Editorial: dofollow share of sampled links.
  let editorialLinks: number | null = null
  const nofollowSamples = samples.filter((s) => s.nofollow != null)
  if (nofollowSamples.length > 0) {
    const dofollow = nofollowSamples.filter((s) => s.nofollow === false).length
    editorialLinks = dofollow / nofollowSamples.length
  }

  const domainAuthority = snapshot.domainRank == null ? null : normRange(snapshot.domainRank, 0, 100, true)

  return { referringDomains, estateInbound, linkVelocity, anchorNatural, toxicClean, editorialLinks, domainAuthority }
}

// ═══ HTTP client ══════════════════════════════════════════════════════════

const TIMEOUT_MS = 12_000

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${DATAFORSEO_ENDPOINT}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: basicAuth(),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!res.ok) {
      throw new Error(`DataForSEO ${path} HTTP ${res.status}`)
    }
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

interface DfsResponse {
  tasks?: Array<{ status_code?: number; status_message?: string; result?: Array<Record<string, unknown>> }>
}

async function postWithRetry<T>(path: string, body: unknown): Promise<T> {
  try {
    return await postJson<T>(path, body)
  } catch (err) {
    // One retry on transient network/5xx failures; 401/403 (bad creds) are
    // not retried — they degrade to null upstream.
    if (err instanceof Error && /HTTP (401|403)/.test(err.message)) throw err
    return await postJson<T>(path, body)
  }
}

/**
 * Fetch a per-URL backlink snapshot. Returns `null` when the provider is not
 * configured, when DataForSEO rejects the request (bad/expired credentials,
 * empty balance), or when the fetch fails twice — the engine then simply
 * leaves the links measurement slots dark.
 */
export async function fetchBacklinkSnapshot(
  url: string,
  opts: { limit?: number } = {},
): Promise<BacklinkSnapshot | null> {
  if (!isBacklinkProviderConfigured()) return null
  const limit = Math.max(10, Math.min(100, opts.limit ?? 50))
  const target = url.trim()
  if (!target) return null

  const [summaryRes, linksRes] = await Promise.allSettled([
    postWithRetry<DfsResponse>('/v3/backlinks/summary/live', [{ target }]),
    postWithRetry<DfsResponse>('/v3/backlinks/backlinks/live', [{ target, limit }]),
  ])

  const summary = summaryRes.status === 'fulfilled'
    ? summaryRes.value.tasks?.[0]?.result?.[0]
    : undefined
  if (summaryRes.status === 'rejected' && linksRes.status === 'rejected') {
    // Both requests failed — nothing to work with. A rejection caused by a
    // 401/403 or by missing config already returns null upstream.
    return null
  }
  if (!summary && linksRes.status !== 'fulfilled') return null

  const linksResult = linksRes.status === 'fulfilled' ? linksRes.value.tasks?.[0]?.result : undefined
  const samples: BacklinkAnchorSample[] = (linksResult || []).map((r) => ({
    anchor: typeof r.anchor === 'string' ? r.anchor : '',
    nofollow: typeof r.is_nofollow === 'boolean' ? r.is_nofollow : null,
    isNew: typeof r.is_new === 'boolean' ? r.is_new : null,
    isLost: typeof r.is_lost === 'boolean' ? r.is_lost : null,
    spamScore: num(r.spam_score),
    sourceExternalLinks: num(r.page_from_external_links),
  }))

  return {
    url: target,
    provider: 'dataforseo',
    fetchedAt: new Date().toISOString(),
    totalBacklinks: summary ? num(summary.backlinks) : null,
    referringDomains: summary ? num(summary.referring_domains) : null,
    referringMainDomains: summary ? num(summary.referring_main_domains) : null,
    referringPages: summary ? num(summary.referring_pages) : null,
    newBacklinks: summary ? num(summary.new_backlinks) : null,
    lostBacklinks: summary ? num(summary.lost_backlinks) : null,
    brokenBacklinks: summary ? num(summary.broken_backlinks) : null,
    spamScore: summary ? num(summary.spam_score) : null,
    domainRank: summary ? num(summary.domain_rank) : null,
    samples,
  }
}
