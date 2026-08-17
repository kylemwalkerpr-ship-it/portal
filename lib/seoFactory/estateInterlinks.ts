/**
 * Live estate inventory interlinks — merged/published content_jobs with a
 * canonical URL, ranked by overlap with the brief topic + keywords.
 * Complements the static registry so Find interlinks can pick up pages that
 * shipped after the last registry sweep.
 */

import { createSupabaseAdminClient } from '@/lib/supabase'
import { isJunkQuery } from './queryNoise'

export interface InventoryInterlink {
  label: string
  url: string
  site?: string
}

function tokens(s: string): string[] {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((t) => t.length > 2)
}

function hostSite(url: string): string | undefined {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '')
    if (h.startsWith('legal.')) return 'caseworks'
    if (h.startsWith('portal.')) return 'marketplace'
    if (/^(usa|uk|ca|au)\./.test(h)) return 'regional'
    return h.split('.')[0]
  } catch {
    return undefined
  }
}

export async function suggestInventoryInterlinks(
  topic: string,
  keywords: string[] = [],
  maxResults = 8,
): Promise<InventoryInterlink[]> {
  const hay = tokens([topic, ...keywords].join(' '))
  if (!hay.length) return []
  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('content_jobs')
      .select('title, topic, primary_keyword, canonical_url, status')
      .in('status', ['merged', 'published', 'closed'])
      .not('canonical_url', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(250)
    if (error || !data?.length) return []
    const scored: Array<InventoryInterlink & { score: number }> = []
    for (const row of data as Array<Record<string, unknown>>) {
      const url = String(row.canonical_url || '').trim()
      if (!/^https?:\/\//i.test(url)) continue
      const title = String(row.title || row.topic || row.primary_keyword || '').trim()
      if (!title || isJunkQuery(title)) continue
      const pageToks = tokens(`${title} ${String(row.topic || '')} ${String(row.primary_keyword || '')}`)
      let shared = 0
      for (const t of hay) if (pageToks.includes(t)) shared += 1
      if (shared < 2) continue
      scored.push({ label: title.slice(0, 80), url, site: hostSite(url), score: shared })
    }
    scored.sort((a, b) => b.score - a.score)
    const seen = new Set<string>()
    const out: InventoryInterlink[] = []
    for (const s of scored) {
      const key = s.url.replace(/\/+$/, '').toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ label: s.label, url: s.url, site: s.site })
      if (out.length >= maxResults) break
    }
    return out
  } catch {
    return []
  }
}
