/**
 * Research-stage demand context: Master Engine cluster plans + Ubersuggest
 * last-good pull + already-shipped Approval/Track pages. Used so Keywords &
 * Brief consume live intel instead of inventing siblings of a canonical.
 */
import { checkCompetingPages, loadPlansDashboard, normalizePlannerTopic } from './planner'
import { loadUbersuggestConfig } from './ubersuggest'
import { loadShippedCoverage, type ShippedPage as ResearchShippedPage } from './shippedCoverage'

// Shipped coverage lives in its own module so the planner can consume it
// without a circular import. Re-exported for existing callers.
export { loadShippedCoverage }
export type { ResearchShippedPage }

export interface ResearchDemandContext {
  engineTerms: string[]
  uberTerms: string[]
  shipped: ResearchShippedPage[]
  competing: ReturnType<typeof checkCompetingPages>
  blockedStems: Set<string>
}

function stem(term: string): string {
  return normalizePlannerTopic(term)
}

/** Region-specific keyword markers for filtering Ubersuggest terms. */
const REGION_MARKERS: Record<string, RegExp> = {
  US: /\b(h-?1b|h-?2a|h-?4|l-?1|o-?1|f-?1|f-?2|m-?1|j-?1|opt|cpt|eb-[123]|green card|uscis|i-?94|i-?20|i-?130|i-?485|i-?765|i-?539|ds-?160|sevis|naturalization|adjustment of status|travel\.state\.gov|studentaid\.gov|studyinthestates)\b/i,
  CA: /\b(express entry|study permit|work permit|pgwp|cec|lmia|ircc|provincial nominee|pnp|super visa|caq|quebec|canada\.ca|canadian|canada)\b/i,
  UK: /\b(\buk\b|gucas|ucas|graduate route|student visa uk|skilled worker visa|tvl|brp|evisa|settlement|indefinite leave|british|home office|gov\.uk|united kingdom)\b/i,
  AU: /\b(subclass|485|500|189|190|491|494|820|801|australia|australian|dha|homeaffairs|immi\.homeaffairs|monash|bridging visa|naati)\b/i,
}

/** Explicit country names — the strongest region signal for auto-detection. */
const COUNTRY_NAMES: Record<string, RegExp> = {
  US: /\b(united states|usa|u\.s\.a|america[n]?|uscis)\b/i,
  CA: /\b(canada|canadian)\b/i,
  UK: /\b(united kingdom|\buk\b|britain|england|scotland|wales)\b/i,
  AU: /\b(australia|australian|aussie)\b/i,
}

/** Check if a keyword is clearly from a specific region. */
export function keywordRegion(term: string): string | null {
  for (const [region, re] of Object.entries(REGION_MARKERS)) {
    if (re.test(term)) return region
  }
  return null
}

/**
 * Detect the region a topic/keyword text belongs to.
 *
 * Confidence rules:
 *  - An explicit country name ("Australia", "Canada", "UK", "United States")
 *    is ALWAYS confident — return that region immediately.
 *  - Otherwise count visa-programme marker hits per region; the region with
 *    the most hits wins, but only when it has ≥2 hits (a single generic term
 *    like "study permit" is not enough to override the user's pick).
 *
 * Returns null when nothing points at a region.
 */
export function detectRegionFromText(text: string): { region: string; confident: boolean; hits: number } | null {
  const t = String(text || '')
  if (!t.trim()) return null

  // 1) Explicit country name wins outright.
  for (const [region, re] of Object.entries(COUNTRY_NAMES)) {
    if (re.test(t)) return { region, confident: true, hits: 99 }
  }

  // 2) Marker-hit count, needs ≥2 to be actionable.
  const counts: Record<string, number> = { US: 0, CA: 0, UK: 0, AU: 0 }
  for (const [region, re] of Object.entries(REGION_MARKERS)) {
    const matches = t.match(new RegExp(re.source, 'gi'))
    counts[region] = matches ? matches.length : 0
  }
  let best: string | null = null
  let bestHits = 0
  for (const [region, n] of Object.entries(counts)) {
    if (n > bestHits) { best = region; bestHits = n }
  }
  if (best && bestHits >= 2) return { region: best, confident: true, hits: bestHits }
  if (best && bestHits === 1) return { region: best, confident: false, hits: 1 }
  return null
}

/**
 * Deterministically drop keywords that belong to a DIFFERENT region than the
 * one selected. Generic terms (no region marker) always pass. This is the
 * hard backstop that stops the AI model's own output from re-introducing a
 * "canada study permit" into a US keyword set after the prompt asked it not to.
 */
export function filterKeywordsByRegion(terms: string[], regionCode: string): { kept: string[]; dropped: string[] } {
  const rc = String(regionCode || 'US').toUpperCase().slice(0, 2)
  const kept: string[] = []
  const dropped: string[] = []
  for (const term of terms) {
    const t = String(term || '').trim()
    if (!t) continue
    const kr = keywordRegion(t)
    if (kr && kr !== rc) dropped.push(t)
    else kept.push(t)
  }
  return { kept, dropped }
}

/**
 * Drop H2 outline entries that clearly belong to another region (e.g. a
 * "Canada Express Entry timeline" H2 inside a US article). An entry passes
 * when it has NO other-region marker; entries carrying the selected region's
 * own markers always pass.
 */
export function filterOutlineByRegion(headings: string[], regionCode: string): { kept: string[]; dropped: string[] } {
  const rc = String(regionCode || 'US').toUpperCase().slice(0, 2)
  const kept: string[] = []
  const dropped: string[] = []
  for (const h of headings) {
    const t = String(h || '').trim()
    if (!t) continue
    const kr = keywordRegion(t)
    if (kr && kr !== rc) dropped.push(t)
    else kept.push(t)
  }
  return { kept, dropped }
}

export async function loadResearchDemandContext(topic: string, primaryKeyword?: string, region?: string): Promise<ResearchDemandContext> {
  const pk = (primaryKeyword || topic || '').trim()
  const regionCode = String(region || 'US').toUpperCase().slice(0, 2)
  const [plansDash, uberCfg, shipped] = await Promise.all([
    loadPlansDashboard(40).catch(() => ({ plans: [] as Array<Record<string, unknown>> })),
    loadUbersuggestConfig().catch(() => null),
    loadShippedCoverage().catch(() => [] as ResearchShippedPage[]),
  ])

  const engineTerms: string[] = []
  for (const p of plansDash.plans || []) {
    // Filter master engine plans by the selected region/country.
    // Plans without a country default to the selected region.
    const planCountry = String(p.country || regionCode || 'US').toUpperCase().slice(0, 2)
    if (planCountry !== regionCode && planCountry !== 'ALL') continue
    const primary = String(p.primary_term || '').trim()
    if (primary) engineTerms.push(primary)
    const related = Array.isArray(p.related_terms) ? p.related_terms.map(String) : []
    engineTerms.push(...related.filter(Boolean))
  }

  // Filter Ubersuggest terms — keep only terms that match the selected region
  // or have no clear region marker (generic immigration terms).
  const uberTerms = (uberCfg?.lastGoodSignals || [])
    .map((s) => s.term)
    .filter((term) => {
      if (!term) return false
      const termRegion = keywordRegion(term)
      // Keep if: no region marker (generic) OR matches selected region
      return !termRegion || termRegion === regionCode
    })

  const competing = checkCompetingPages({
    primaryKeyword: pk,
    coverage: shipped.map((s) => ({
      url: s.url || s.primaryKeyword || '',
      title: s.title,
      primaryKeyword: s.primaryKeyword,
      status: s.status,
    })),
  })

  const blockedStems = new Set<string>()
  for (const page of shipped) {
    if (page.primaryKeyword) blockedStems.add(stem(page.primaryKeyword))
    if (page.title) blockedStems.add(stem(page.title))
  }
  for (const c of competing.competing) {
    if (c.overlap === 'exact' || c.overlap === 'high') {
      if (c.primaryKeyword) blockedStems.add(stem(c.primaryKeyword))
      blockedStems.add(stem(c.title))
    }
  }

  return { engineTerms, uberTerms, shipped, competing, blockedStems }
}

/** Prefer engine + Ubersuggest terms that are not already a shipped canonical. */
export function pickResearchKeywords(
  ctx: ResearchDemandContext,
  topic: string,
  opts: { short?: number; long?: number } = {},
): { shortTail: string[]; longTail: string[]; skippedCanonicals: string[] } {
  const shortN = opts.short ?? 5
  const longN = opts.long ?? 4
  const skippedCanonicals: string[] = []
  const topicStem = stem(topic)
  const pool = [...ctx.uberTerms, ...ctx.engineTerms]
    .map((t) => t.trim())
    .filter(Boolean)
  const shortTail: string[] = []
  const longTail: string[] = []
  const seen = new Set<string>()

  for (const term of pool) {
    const s = stem(term)
    if (!s || seen.has(s)) continue
    if (ctx.blockedStems.has(s) && s !== topicStem) {
      skippedCanonicals.push(term)
      continue
    }
    const words = s.split(' ').filter(Boolean).length
    seen.add(s)
    if (words <= 3 && shortTail.length < shortN) shortTail.push(term)
    else if (words >= 4 && longTail.length < longN) longTail.push(term)
    if (shortTail.length >= shortN && longTail.length >= longN) break
  }

  return { shortTail, longTail, skippedCanonicals: [...new Set(skippedCanonicals)].slice(0, 12) }
}

export function formatResearchPromptBlock(ctx: ResearchDemandContext, picked: ReturnType<typeof pickResearchKeywords>): string {
  const lines: string[] = []
  if (ctx.engineTerms.length) {
    lines.push(`MASTER ENGINE CLUSTER TERMS (prefer these; already scored): ${ctx.engineTerms.slice(0, 24).join(', ')}`)
  } else {
    lines.push('MASTER ENGINE CLUSTER TERMS: none persisted yet — run the planner.')
  }
  if (ctx.uberTerms.length) {
    lines.push(`UBERSUGGEST LAST-GOOD KEYWORDS (market volume): ${ctx.uberTerms.slice(0, 24).join(', ')}`)
  } else {
    lines.push('UBERSUGGEST: no last-good pull — connect MCP in Configure, then run planner.')
  }
  if (picked.shortTail.length || picked.longTail.length) {
    lines.push(`PRESELECTED (engine ∪ Ubersuggest, not a shipped canonical): short=${picked.shortTail.join(', ') || '—'} · long=${picked.longTail.join(', ') || '—'}`)
  }
  if (ctx.shipped.length) {
    lines.push(
      `SHIPPED / IN-FLIGHT CANONICALS (Approval+Track — do not create a sibling URL):\n${ctx.shipped.slice(0, 20).map((p) => `  - ${p.primaryKeyword || p.title} · ${p.status} · ${p.url || 'no url'}`).join('\n')}`,
    )
  }
  if (ctx.competing.competing.length) {
    lines.push(
      `COMPETING PAGES FOR THIS TOPIC:\n${ctx.competing.competing.slice(0, 8).map((c) => `  - [${c.overlap}] ${c.title} ${c.url}`).join('\n')}`,
    )
    lines.push(...ctx.competing.suggestions.map((s) => `GUARD: ${s}`))
  }
  if (picked.skippedCanonicals.length) {
    lines.push(`DROPPED (already a canonical): ${picked.skippedCanonicals.join(', ')}`)
  }
  return lines.join('\n')
}
