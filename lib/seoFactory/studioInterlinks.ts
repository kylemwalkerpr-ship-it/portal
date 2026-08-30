/**
 * Normalize + merge interlink records from the Master Engine (camelCase
 * InterlinkEdge) and the estate registry (label/url/site) so the Work Plan
 * never paints empty pills from a field-name mismatch.
 */

export interface StudioInterlink {
  label: string
  url: string
  site?: string
  score?: number
  reason?: string
  placement?: string
  liveStatus?: string
  role?: string
  matchedOn?: string[]
  inboundLinks?: number
  inSitemap?: boolean | null
}

export function normalizeInterlinkRecord(raw: Record<string, unknown> | null | undefined): StudioInterlink | null {
  if (!raw || typeof raw !== 'object') return null
  const url = String(raw.url || raw.target_url || raw.targetUrl || '').trim()
  if (!url || !/^https?:\/\//i.test(url)) return null
  const label = String(raw.label || raw.anchor_text || raw.anchorText || '').trim()
    || url.replace(/^https?:\/\//i, '').replace(/\/+$/, '').slice(0, 56)
  const site = String(raw.site || raw.target_host || raw.targetHost || '').trim() || undefined
  const score = Number(raw.score)
  const inboundLinks = Number(raw.inboundLinks ?? raw.inbound_links)
  const out: StudioInterlink = { label, url, site }
  if (Number.isFinite(score)) out.score = score
  const reason = String(raw.reason || '').trim(); if (reason) out.reason = reason
  const placement = String(raw.placement || raw.context_h2 || raw.contextH2 || '').trim(); if (placement) out.placement = placement
  const liveStatus = String(raw.liveStatus || raw.live_status || '').trim(); if (liveStatus) out.liveStatus = liveStatus
  const role = String(raw.role || '').trim(); if (role) out.role = role
  if (Array.isArray(raw.matchedOn)) out.matchedOn = raw.matchedOn.map(String)
  else if (Array.isArray(raw.matched_on)) out.matchedOn = raw.matched_on.map(String)
  if (Number.isFinite(inboundLinks)) out.inboundLinks = inboundLinks
  if (typeof raw.inSitemap === 'boolean') out.inSitemap = raw.inSitemap
  else if (typeof raw.in_sitemap === 'boolean') out.inSitemap = raw.in_sitemap
  return out
}

export function mergeInterlinkLists(
  ...lists: Array<Array<Record<string, unknown> | StudioInterlink> | undefined | null>
): StudioInterlink[] {
  const seen = new Set<string>()
  const out: StudioInterlink[] = []
  for (const list of lists) {
    if (!Array.isArray(list)) continue
    for (const raw of list) {
      const item = normalizeInterlinkRecord(raw as Record<string, unknown>)
      if (!item) continue
      const key = item.url.replace(/\/+$/, '').toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(item)
    }
  }
  return out
}
