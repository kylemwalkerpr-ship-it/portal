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

const SHIPPED_STATUSES = ['merged', 'closed'] as const
const COVERAGE_PAGE_SIZE = 500
const COVERAGE_HARD_CAP = 10_000

async function loadCoverageRows(
  table: 'content_jobs' | 'content_jobs_archive',
  orderColumn: 'updated_at' | 'archived_at',
  requestedLimit: number,
): Promise<Array<Record<string, unknown>>> {
  const db = createSupabaseAdminClient()
  const rows: Array<Record<string, unknown>> = []
  const cap = Math.min(Math.max(1, requestedLimit), COVERAGE_HARD_CAP)
  for (let from = 0; from < cap; from += COVERAGE_PAGE_SIZE) {
    const to = Math.min(cap - 1, from + COVERAGE_PAGE_SIZE - 1)
    const result = await db
      .from(table)
      .select('title, topic, primary_keyword, canonical_url, content_path, status, pr_url')
      .in('status', [...SHIPPED_STATUSES])
      .order(orderColumn, { ascending: false })
      .range(from, to)
    if (result.error) throw new Error(result.error.message)
    const chunk = (result.data || []) as Array<Record<string, unknown>>
    rows.push(...chunk)
    if (chunk.length < to - from + 1) break
  }
  return rows
}

export async function loadShippedCoverage(limit = 300): Promise<ShippedPage[]> {
  try {
    // Only terminal Git states count here. `deployed` is not a valid live
    // content_jobs.status in the current schema; deployment/live proof is
    // tracked separately. `closed` is retained for archived historical rows.
    const [activeRows, archiveRows] = await Promise.all([
      loadCoverageRows('content_jobs', 'updated_at', limit),
      loadCoverageRows('content_jobs_archive', 'archived_at', limit),
    ])
    const rows = [...activeRows, ...archiveRows]
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
