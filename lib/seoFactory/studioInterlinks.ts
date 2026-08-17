/**
 * Normalize + merge interlink records from the Master Engine (camelCase
 * InterlinkEdge) and the estate registry (label/url/site) so the Work Plan
 * never paints empty pills from a field-name mismatch.
 */

export interface StudioInterlink {
  label: string
  url: string
  site?: string
}

export function normalizeInterlinkRecord(raw: Record<string, unknown> | null | undefined): StudioInterlink | null {
  if (!raw || typeof raw !== 'object') return null
  const url = String(raw.url || raw.target_url || raw.targetUrl || '').trim()
  if (!url || !/^https?:\/\//i.test(url)) return null
  const label = String(raw.label || raw.anchor_text || raw.anchorText || '').trim()
    || url.replace(/^https?:\/\//i, '').replace(/\/+$/, '').slice(0, 56)
  const site = String(raw.site || raw.target_host || raw.targetHost || '').trim() || undefined
  return { label, url, site }
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
