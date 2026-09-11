import { fail, ok } from '@/lib/apiEnvelope'
import { sanitizeMarketplaceQuery } from '@/lib/marketplaceSearchIntelligence'
import { createSupabaseAdminClient } from '@/lib/supabase'

type Suggestion = {
  kind: 'tag' | 'gig' | 'query'
  label: string
  slug?: string | null
  demandCount?: number
}

function safeSuggestion(kind: Suggestion['kind'], label: unknown, slug?: unknown, demandCount?: unknown): Suggestion | null {
  const safe = sanitizeMarketplaceQuery(label)
  if (!safe) return null
  return {
    kind,
    label: String(label).replace(/\s+/g, ' ').trim().slice(0, 80),
    slug: kind === 'gig' && typeof slug === 'string' ? slug.slice(0, 160) : null,
    demandCount: Math.max(0, Math.floor(Number(demandCount) || 0)),
  }
}

function dedupe(items: Suggestion[], limit = 10) {
  const seen = new Set<string>()
  const output: Suggestion[] = []
  for (const item of items) {
    const key = `${item.kind}:${sanitizeMarketplaceQuery(item.label)?.normalized || item.label.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    output.push(item)
    if (output.length >= limit) break
  }
  return output
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const query = sanitizeMarketplaceQuery(url.searchParams.get('q'))
  if (!query) return ok({ suggestions: [] })

  const db = createSupabaseAdminClient()
  const { data, error } = await db.rpc('marketplace_search_suggestions', {
    p_query: query.raw,
    p_limit: 12,
  })

  let suggestions: Suggestion[] = []
  if (!error && Array.isArray(data)) {
    suggestions = data
      .map((row: any) => safeSuggestion(row.kind, row.label, row.slug, row.demand_count))
      .filter(Boolean) as Suggestion[]
  } else {
    // Graceful deploy-order fallback: the UI can ship before the migration
    // workflow has refreshed PostgREST's function cache. Historical-query
    // suggestions are simply unavailable during that brief window.
    const fallback = await db
      .from('gigs')
      .select('title, slug, tags, rank_score')
      .eq('status', 'active')
      .order('rank_score', { ascending: false })
      .limit(120)

    if (fallback.error) return fail('Could not load search suggestions.', 500)
    const q = query.normalized
    const tagCounts = new Map<string, { label: string; count: number }>()
    const gigMatches: Suggestion[] = []
    for (const gig of fallback.data || []) {
      const title = String(gig.title || '')
      const titleSafe = sanitizeMarketplaceQuery(title)
      if (titleSafe?.normalized.includes(q)) {
        const item = safeSuggestion('gig', title, gig.slug)
        if (item) gigMatches.push(item)
      }
      for (const rawTag of Array.isArray(gig.tags) ? gig.tags : []) {
        const tag = String(rawTag || '')
        const tagSafe = sanitizeMarketplaceQuery(tag)
        if (!tagSafe || !tagSafe.normalized.includes(q)) continue
        const existing = tagCounts.get(tagSafe.normalized)
        tagCounts.set(tagSafe.normalized, { label: tag, count: (existing?.count || 0) + 1 })
      }
    }
    const tagMatches = Array.from(tagCounts.values())
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .map((entry) => safeSuggestion('tag', entry.label))
      .filter(Boolean) as Suggestion[]
    suggestions = [...tagMatches.slice(0, 5), ...gigMatches.slice(0, 5)]
  }

  return ok(
    { suggestions: dedupe(suggestions, 10) },
    { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } },
  )
}
