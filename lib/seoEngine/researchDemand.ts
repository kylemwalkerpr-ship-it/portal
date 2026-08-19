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

export async function loadShippedCoverage(limit = 200): Promise<ResearchShippedPage[]> {
  try {
    const db = createSupabaseAdminClient()
    const { data, error } = await db
      .from('content_jobs')
      .select('title, topic, primary_keyword, canonical_url, content_path, status, pr_url')
      .in('status', ['merged', 'pr_created', 'publishing'])
      .order('updated_at', { ascending: false })
      .limit(limit)
    if (error) return []
    return (data || []).map((row: Record<string, unknown>) => {
      const url = String(row.canonical_url || row.content_path || row.pr_url || '').trim()
      return {
        url,
        title: String(row.title || row.topic || ''),
        primaryKeyword: row.primary_keyword ? String(row.primary_keyword) : (row.topic ? String(row.topic) : null),
        status: String(row.status || ''),
      }
    }).filter((p) => p.url || p.primaryKeyword)
  } catch {
    return []
  }
}

export async function loadResearchDemandContext(topic: string, primaryKeyword?: string): Promise<ResearchDemandContext> {
  const pk = (primaryKeyword || topic || '').trim()
  const [plansDash, uberCfg, shipped] = await Promise.all([
    loadPlansDashboard(40).catch(() => ({ plans: [] as Array<Record<string, unknown>> })),
    loadUbersuggestConfig().catch(() => null),
    loadShippedCoverage().catch(() => [] as ResearchShippedPage[]),
  ])

  const engineTerms: string[] = []
  for (const p of plansDash.plans || []) {
    const primary = String(p.primary_term || '').trim()
    if (primary) engineTerms.push(primary)
    const related = Array.isArray(p.related_terms) ? p.related_terms.map(String) : []
    engineTerms.push(...related.filter(Boolean))
  }

  const uberTerms = (uberCfg?.lastGoodSignals || []).map((s) => s.term).filter(Boolean)

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
