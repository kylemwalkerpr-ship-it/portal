/** Canonical full-estate interlink intelligence backed by Supabase. */
import { createSupabaseAdminClient } from '@/lib/supabase'
import { filterLiveInternalUrls } from './linkAudit'
import { loadAllSiteHealthFacts, type SiteHealthFacts } from './siteHealthSnapshot'
import { isJunkQuery } from './queryNoise'

export type InterlinkRole = 'topical-guide' | 'next-step' | 'service-handoff'
export interface InventoryInterlink {
  label: string; url: string; site?: string; score: number; reason: string
  placement: string; liveStatus: 'live' | 'verified-inventory'; role: InterlinkRole
  matchedOn: string[]; inboundLinks?: number; inSitemap?: boolean | null
}
export interface EstateInventorySummary {
  scanned: number; eligible: number; liveVerified: number
  source: 'site_health_pages + content_jobs'
}
interface EstateCandidate {
  url: string; title: string; path?: string; host?: string; primaryKeyword?: string
  topic?: string; indexable?: boolean; noindex?: boolean; inSitemap?: boolean | null
  inboundLinks?: number
}

const STOP = new Set('a an and are as at be by can for from guide how in into is it of on or our the this to vs what when where which who will with your 2025 2026'.split(' '))
const GENERIC_PATH = /^\/(?:pricing|plans|contact|about|services?|consultation)?\/?$/i
const SERVICE_INTENT = /\b(cost|price|pricing|quote|hire|lawyer|attorney|consultant|service|help|representation)\b/i

function terms(value: string): string[] {
  return [...new Set(String(value || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/).filter((term) => term.length > 2 && !STOP.has(term)))]
}
function normalizedUrl(url: string): string { return String(url || '').trim().replace(/\/+$/, '').toLowerCase() }
function hostSite(url: string): string | undefined {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    if (host.startsWith('legal.')) return 'Legal Library'
    if (host.startsWith('portal.') || host.startsWith('market.')) return 'Marketplace'
    if (/^(usa|uk|ca|au)\./.test(host)) return 'Regional Hub'
    return 'YouSafe'
  } catch { return undefined }
}
function inferRegion(value: string): string | null {
  const text = String(value || '').toLowerCase()
  if (/\b(australia|australian|immi|home affairs)\b|\/au\//.test(text)) return 'AU'
  if (/\b(canada|canadian|ircc)\b|\/ca\//.test(text)) return 'CA'
  if (/\b(uk|british|united kingdom|home office)\b|\/uk\//.test(text)) return 'UK'
  if (/\b(usa?|american|uscis|united states)\b|\/us\//.test(text)) return 'US'
  return null
}
function inferRole(candidate: EstateCandidate, serviceIntent: boolean): InterlinkRole {
  const path = candidate.path || (() => { try { return new URL(candidate.url).pathname } catch { return '' } })()
  if (GENERIC_PATH.test(path) || /portal\.|market\./i.test(candidate.host || candidate.url)) return 'service-handoff'
  if (serviceIntent && /service|lawyer|attorney|consult|application/i.test(`${candidate.title} ${path}`)) return 'service-handoff'
  if (/checklist|documents?|apply|application|process|steps?|eligib|requirements?|timeline|fees?|cost/i.test(`${candidate.title} ${path}`)) return 'next-step'
  return 'topical-guide'
}

export function rankEstateInterlinks(
  candidates: EstateCandidate[],
  input: { topic: string; keywords?: string[]; region?: string; sourceUrl?: string; h2Outline?: string[] },
  maxResults = 6,
): InventoryInterlink[] {
  const queryTerms = terms([input.topic, ...(input.keywords || [])].join(' '))
  const queryRegion = String(input.region || inferRegion(input.topic) || '').toUpperCase()
  const serviceIntent = SERVICE_INTENT.test([input.topic, ...(input.keywords || [])].join(' '))
  const sourceKey = normalizedUrl(input.sourceUrl || '')
  const scored: Array<InventoryInterlink & { raw: number }> = []
  for (const candidate of candidates) {
    if (!/^https?:\/\//i.test(candidate.url) || normalizedUrl(candidate.url) === sourceKey) continue
    if (candidate.indexable === false || candidate.noindex === true || candidate.inSitemap === false) continue
    if (!candidate.title || isJunkQuery(candidate.title)) continue
    const titleTerms = terms(candidate.title)
    const pageTerms = terms(`${candidate.title} ${candidate.primaryKeyword || ''} ${candidate.topic || ''} ${candidate.path || ''}`)
    const matched = queryTerms.filter((term) => pageTerms.includes(term))
    const titleMatched = queryTerms.filter((term) => titleTerms.includes(term))
    const phrase = input.topic.trim().toLowerCase()
    const candidateText = `${candidate.title} ${candidate.primaryKeyword || ''} ${candidate.topic || ''}`.toLowerCase()
    const candidateRegion = inferRegion(`${candidate.url} ${candidate.title} ${candidate.topic || ''}`)
    const path = candidate.path || (() => { try { return new URL(candidate.url).pathname } catch { return '' } })()
    let raw = matched.length * 12 + titleMatched.length * 8
    if (phrase.length > 8 && candidateText.includes(phrase)) raw += 28
    if (queryRegion && candidateRegion === queryRegion) raw += 18
    if (queryRegion && candidateRegion && candidateRegion !== queryRegion) raw -= 38
    if (candidate.inSitemap === true) raw += 6
    raw += Math.min(8, Math.log2(Math.max(1, (candidate.inboundLinks || 0) + 1)) * 2)
    if (GENERIC_PATH.test(path)) raw -= serviceIntent ? 8 : 42
    if (matched.length < 2 && !phrase.includes(candidateText) && !candidateText.includes(phrase)) continue
    if (raw < 18) continue
    const role = inferRole(candidate, serviceIntent)
    const placement = (input.h2Outline || []).find((heading) => {
      const headingTerms = terms(heading)
      return matched.some((term) => headingTerms.includes(term))
    }) || (role === 'service-handoff' ? 'Decision and next steps' : role === 'next-step' ? 'Process, requirements or checklist section' : 'Core explanatory section')
    scored.push({
      label: candidate.title.slice(0, 96), url: candidate.url, site: hostSite(candidate.url),
      score: Math.max(1, Math.min(100, Math.round(raw))), raw,
      reason: matched.length ? `Supports ${matched.slice(0, 4).join(', ')} with a live, indexable estate page.` : 'Provides a relevant next step from the canonical estate inventory.',
      placement, liveStatus: 'verified-inventory', role, matchedOn: matched.slice(0, 6),
      inboundLinks: candidate.inboundLinks, inSitemap: candidate.inSitemap,
    })
  }
  scored.sort((a, b) => b.raw - a.raw || (b.inboundLinks || 0) - (a.inboundLinks || 0))
  const result: InventoryInterlink[] = []
  const usedUrls = new Set<string>()
  const roleCounts = new Map<InterlinkRole, number>()
  for (const item of scored) {
    const key = normalizedUrl(item.url)
    if (usedUrls.has(key)) continue
    const roleCount = roleCounts.get(item.role) || 0
    if (item.role === 'service-handoff' && !serviceIntent && roleCount >= 1) continue
    if (roleCount >= 3) continue
    usedUrls.add(key); roleCounts.set(item.role, roleCount + 1)
    const { raw: _raw, ...suggestion } = item
    result.push(suggestion)
    if (result.length >= maxResults) break
  }
  return result
}

function factsToCandidate(fact: SiteHealthFacts): EstateCandidate {
  return { url: fact.url, title: fact.title, path: fact.path, host: fact.host, indexable: fact.indexable, noindex: fact.noindex, inSitemap: fact.inSitemap, inboundLinks: fact.inboundLinks }
}

export async function suggestInventoryInterlinks(
  topic: string, keywords: string[] = [], maxResults = 8,
  context: { region?: string; sourceUrl?: string; h2Outline?: string[] } = {},
): Promise<{ suggestions: InventoryInterlink[]; inventory: EstateInventorySummary }> {
  const healthFacts = await loadAllSiteHealthFacts()
  const candidates = [...healthFacts.values()].map(factsToCandidate)
  try {
    const { data } = await createSupabaseAdminClient().from('content_jobs')
      .select('title, topic, primary_keyword, canonical_url, status')
      .in('status', ['merged', 'published', 'closed']).not('canonical_url', 'is', null)
      .order('updated_at', { ascending: false }).limit(1000)
    for (const row of (data || []) as Array<Record<string, unknown>>) {
      const url = String(row.canonical_url || '').trim()
      if (!url) continue
      candidates.push({ url, title: String(row.title || row.topic || row.primary_keyword || '').trim(), primaryKeyword: String(row.primary_keyword || ''), topic: String(row.topic || ''), indexable: true })
    }
  } catch { /* persisted site-health inventory remains usable */ }
  const deduped = new Map<string, EstateCandidate>()
  for (const candidate of candidates) {
    const key = normalizedUrl(candidate.url); const current = deduped.get(key)
    deduped.set(key, current ? { ...candidate, ...current, primaryKeyword: candidate.primaryKeyword || current.primaryKeyword, topic: candidate.topic || current.topic } : candidate)
  }
  const eligible = [...deduped.values()].filter((c) => c.indexable !== false && c.noindex !== true && c.inSitemap !== false)
  const ranked = rankEstateInterlinks(eligible, { topic, keywords, ...context }, Math.max(maxResults * 2, 12))
  const liveUrls = new Set(await filterLiveInternalUrls(ranked.map((item) => item.url)).catch(() => []))
  const live = ranked.filter((item) => liveUrls.has(item.url)).map((item) => ({ ...item, liveStatus: 'live' as const })).slice(0, maxResults)
  return { suggestions: live, inventory: { scanned: deduped.size, eligible: eligible.length, liveVerified: live.length, source: 'site_health_pages + content_jobs' } }
}
