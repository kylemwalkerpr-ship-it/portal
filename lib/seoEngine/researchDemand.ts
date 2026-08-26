/**
 * Research-stage demand context: Master Engine cluster plans + Ubersuggest
 * last-good pull + already-shipped Approval/Track pages. Used so Keywords &
 * Brief consume live intel instead of inventing siblings of a canonical.
 */
import { createSupabaseAdminClient } from '@/lib/supabase'
import { checkCompetingPages, loadPlansDashboard, normalizePlannerTopic } from './planner'
import { loadUbersuggestConfig } from './ubersuggest'

export interface ResearchShippedPage {
  url: string
  title: string
  primaryKeyword: string | null
  status: string
}

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

export async function loadShippedCoverage(limit = 300): Promise<ResearchShippedPage[]> {
  try {
    const db = createSupabaseAdminClient()
    // Pull from BOTH content_jobs (active) AND content_jobs_archive (cold storage)
    // so merged jobs that were archived are still matched against.
    const [activeResult, archiveResult] = await Promise.all([
      db
        .from('content_jobs')
        .select('title, topic, primary_keyword, canonical_url, content_path, status, pr_url')
        .in('status', ['merged', 'pr_created', 'publishing'])
        .order('updated_at', { ascending: false })
        .limit(limit),
      db
        .from('content_jobs_archive')
        .select('title, topic, primary_keyword, canonical_url, content_path, status, pr_url')
        .in('status', ['merged', 'pr_created', 'publishing', 'closed'])
        .order('archived_at', { ascending: false })
        .limit(limit),
    ])
    const rows = [
      ...(activeResult.data || []),
      ...(archiveResult.data || []),
    ]
    // Dedupe by title+keyword so a job in both tables isn't double-counted
    const seen = new Set<string>()
    const out: ResearchShippedPage[] = []
    for (const row of rows) {
      const url = String(row.canonical_url || row.content_path || row.pr_url || '').trim()
      const title = String(row.title || row.topic || '')
      const pk = row.primary_keyword ? String(row.primary_keyword) : (row.topic ? String(row.topic) : null)
      const key = `${title.toLowerCase()}|${(pk || '').toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      if (url || pk) {
        out.push({ url, title, primaryKeyword: pk, status: String(row.status || '') })
      }
    }
    return out
  } catch {
    return []
  }
}

/** Region-specific keyword markers for filtering Ubersuggest terms. */
const REGION_MARKERS: Record<string, RegExp> = {
  US: /\b(h-?1b|h-?2a|opt|cpt|eb-[123]|green card|uscis|i-?\d|lse|naturalization| Adjustment of Status)\b/i,
  CA: /\b(express entry|study permit|pgwp|cec|lmia|ircc|provincial nominee|pnp|super visa|caq|quebec|cad|canadian)\b/i,
  UK: /\b(gucas|ucas|graduate route|skilled worker visa|tvl|brp|evisa|settlement|indifinite leave|british)\b/i,
  AU: /\b(subclass|485|500|189|190|491|494|australia|australian|dha|homeaffairs|monash|bridging visa)\b/i,
}

/** Check if a keyword is clearly from a specific region. */
function keywordRegion(term: string): string | null {
  for (const [region, re] of Object.entries(REGION_MARKERS)) {
    if (re.test(term)) return region
  }
  return null
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
