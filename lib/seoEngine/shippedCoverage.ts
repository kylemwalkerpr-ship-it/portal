/**
 * Shipped / published coverage — the single source of truth for "this topic
 * is already live on the estate". Consumed by the planner (drop or
 * de-prioritize published topics), research demand (blocked stems), and the
 * Ubersuggest work plan (shipped badge). Queries BOTH content_jobs (active)
 * and content_jobs_archive (cold storage) so merged jobs that were archived
 * are still matched against.
 */
import { createSupabaseAdminClient } from '@/lib/supabase'
import { normalizePlannerTopic } from './planner'

export interface ShippedPage {
  url: string
  title: string
  primaryKeyword: string | null
  status: string
}

export async function loadShippedCoverage(limit = 300): Promise<ShippedPage[]> {
  try {
    const db = createSupabaseAdminClient()
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
    const seen = new Set<string>()
    const out: ShippedPage[] = []
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

/**
 * Build the set of normalized shipped stems from shipped pages. A stem covers
 * the primary keyword, the title, AND the URL slug words — any of the three
 * identifies the topic.
 */
export function buildShippedStems(pages: ShippedPage[]): Set<string> {
  const stems = new Set<string>()
  for (const p of pages) {
    if (p.primaryKeyword) stems.add(normalizePlannerTopic(p.primaryKeyword))
    if (p.title) stems.add(normalizePlannerTopic(p.title))
    const slug = (p.url || '').split('/').filter(Boolean).pop() || ''
    if (slug) {
      const words = slug.replace(/[-_]+/g, ' ').replace(/\.\w+$/, '')
      const norm = normalizePlannerTopic(words)
      if (norm) stems.add(norm)
    }
  }
  return stems
}

/**
 * Token-overlap match between a candidate term and the shipped stems.
 * Returns the best matching shipped stem when ≥70% of the candidate's
 * meaningful tokens appear in a shipped stem (or vice versa) — the same
 * three-tier strategy the Ubersuggest work plan uses, so "F1 visa interview
 * prep" matches shipped "F-1 Visa Interview" while unrelated terms pass.
 */
export function shippedOverlap(term: string, shippedStems: Set<string>): string | null {
  const norm = normalizePlannerTopic(term)
  if (!norm) return null
  if (shippedStems.has(norm)) return norm
  // Substring: a shipped stem fully contained in the term (or the reverse).
  for (const s of shippedStems) {
    if (!s) continue
    if (s.includes(norm) || norm.includes(s)) return s
  }
  // Token overlap ≥70% of the smaller token set. Tokens of length ≥2 so
  // meaningful short codes like "f1" / "uk" / "485" participate.
  const tokens = new Set(norm.split(' ').filter((t) => t.length >= 2))
  if (tokens.size === 0) return null
  let best: string | null = null
  let bestRatio = 0
  for (const s of shippedStems) {
    if (!s) continue
    const sTokens = s.split(' ').filter((t) => t.length >= 2)
    if (sTokens.length === 0) continue
    let hits = 0
    for (const t of sTokens) if (tokens.has(t)) hits++
    const ratio = hits / Math.min(tokens.size, sTokens.length)
    if (ratio >= 0.7 && ratio > bestRatio) {
      best = s
      bestRatio = ratio
    }
  }
  return best
}
