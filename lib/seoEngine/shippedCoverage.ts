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
import { bestOwnerMatch } from './coverageIntent'

export interface ShippedPage {
  url: string
  title: string
  primaryKeyword: string | null
  status: string
}

export async function loadShippedCoverage(limit = 300): Promise<ShippedPage[]> {
  try {
    const db = createSupabaseAdminClient()
    // Only MERGED/DEPLOYED work counts as "shipped coverage". A job sitting
    // in pr_created (PR open, never merged) is a 404 — treating it as shipped
    // starved the planner of the exact topics still missing online (audit S1).
    const [activeResult, archiveResult] = await Promise.all([
      db
        .from('content_jobs')
        .select('title, topic, primary_keyword, canonical_url, content_path, status, pr_url')
        .in('status', ['merged', 'deployed'])
        .order('updated_at', { ascending: false })
        .limit(limit),
      db
        .from('content_jobs_archive')
        .select('title, topic, primary_keyword, canonical_url, content_path, status, pr_url')
        .in('status', ['merged', 'deployed'])
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
      // A PR URL is not a live page — never let its slug pollute the stems.
      const url = String(row.canonical_url || row.content_path || '').trim()
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
 * Returns the best matching shipped stem when the candidate is the SAME
 * search intent (exact, paraphrase, or a geo/audience section on the owner).
 * Distinct SERP-intent spokes (calculator, fees, vs-attorney, …) return null
 * so the planner can still queue them as new cluster members.
 */
export function shippedOverlap(term: string, shippedStems: Set<string>): string | null {
  const match = bestOwnerMatch(term, shippedStems)
  if (!match) return null
  if (match.kind === 'spoke' || match.kind === 'unrelated') return null
  return match.owner
}

