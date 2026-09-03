/**
 * Normalize raw Ubersuggest MCP tool payloads into one engine snapshot.
 * Keyword volume still drives demand; domain/SERP/backlink/AISV/audit land
 * as structured intel for ranking, knowledge, and Discover evidence.
 */
import type { UberLayer } from './ubersuggestCatalog'

export interface UberKeywordRow {
  term: string
  volume: number
  position?: number
  keywordDifficulty?: number
  cpc?: number
}

export interface UberPageRow {
  url: string
  title?: string
  traffic?: number
  keywords?: number
}

export interface UberCompetitorRow {
  domain: string
  overlap?: number
  traffic?: number
}

export interface UberBacklinkRow {
  source?: string
  target?: string
  anchor?: string
  domainRating?: number
}

export interface UberSerpRow {
  keyword: string
  position?: number
  url?: string
  title?: string
}

export interface UbersuggestEngineSnapshot {
  pulledAt: string
  toolsUsed: string[]
  layers: UberLayer[]
  calls: number
  keywords: UberKeywordRow[]
  pages: UberPageRow[]
  competitors: UberCompetitorRow[]
  backlinks: UberBacklinkRow[]
  anchors: string[]
  linkingDomains: string[]
  serp: UberSerpRow[]
  contentIdeas: string[]
  domain: Record<string, unknown>
  backlinksOverview: Record<string, unknown>
  trafficValue: Record<string, unknown>
  audit: Record<string, unknown>
  aisv: Record<string, unknown>
  projects: unknown[]
}

export function emptyUbersuggestSnapshot(pulledAt = new Date().toISOString()): UbersuggestEngineSnapshot {
  return {
    pulledAt,
    toolsUsed: [],
    layers: [],
    calls: 0,
    keywords: [],
    pages: [],
    competitors: [],
    backlinks: [],
    anchors: [],
    linkingDomains: [],
    serp: [],
    contentIdeas: [],
    domain: {},
    backlinksOverview: {},
    trafficValue: {},
    audit: {},
    aisv: {},
    projects: [],
  }
}

function rec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null
}

function bag(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw
  const r = rec(raw)
  if (!r) return raw ? [raw] : []
  for (const k of ['data', 'results', 'items', 'pages', 'keywords', 'competitors', 'backlinks', 'anchors', 'domains', 'ideas', 'prompts', 'projects', 'organic']) {
    if (Array.isArray(r[k])) return r[k] as unknown[]
  }
  return [raw]
}

export function ingestToolResult(snap: UbersuggestEngineSnapshot, name: string, layer: UberLayer, raw: unknown): void {
  if (!snap.toolsUsed.includes(name)) snap.toolsUsed.push(name)
  if (!snap.layers.includes(layer)) snap.layers.push(layer)
  const payload = raw
  if (layer === 'domain' && name === 'domain_overview') {
    snap.domain = { ...snap.domain, ...(rec(payload) || { raw: payload }) }
  }
  if (name === 'traffic_value') snap.trafficValue = rec(payload) || { raw: payload }
  if (name === 'backlinks_overview') snap.backlinksOverview = rec(payload) || { raw: payload }
  if (name.startsWith('site_audit') || name === 'pagespeed_audit') {
    snap.audit = { ...snap.audit, [name]: rec(payload) || payload }
  }
  if (name.startsWith('brand_')) {
    snap.aisv = { ...snap.aisv, [name]: rec(payload) || payload }
  }
  if (name === 'list_projects' || name === 'seo_opportunities') {
    snap.projects = [...snap.projects, ...bag(payload)].slice(0, 40)
  }
  if (name === 'domain_top_pages' || name === 'page_overview') {
    for (const item of bag(payload)) {
      const r = rec(item)
      const url = String(r?.url || r?.page || r?.address || '')
      if (!url) continue
      snap.pages.push({
        url,
        title: String(r?.title || r?.name || ''),
        traffic: Number(r?.traffic || r?.visits || r?.estimated_visits) || undefined,
        keywords: Number(r?.keywords || r?.keyword_count) || undefined,
      })
    }
    snap.pages = snap.pages.slice(0, 40)
  }
  if (name === 'competitors') {
    for (const item of bag(payload)) {
      const r = rec(item)
      const domain = String(r?.domain || r?.competitor || r?.host || (typeof item === 'string' ? item : ''))
      if (!domain) continue
      snap.competitors.push({
        domain,
        overlap: Number(r?.overlap || r?.common_keywords) || undefined,
        traffic: Number(r?.traffic || r?.visits) || undefined,
      })
    }
    snap.competitors = snap.competitors.slice(0, 25)
  }
  if (name === 'backlinks') {
    for (const item of bag(payload)) {
      const r = rec(item)
      if (!r) continue
      snap.backlinks.push({
        source: String(r.source || r.source_url || r.url || ''),
        target: String(r.target || r.target_url || ''),
        anchor: String(r.anchor || r.anchor_text || ''),
        domainRating: Number(r.domain_rating || r.dr || r.authority) || undefined,
      })
    }
    snap.backlinks = snap.backlinks.slice(0, 40)
  }
  if (name === 'anchor_texts') {
    for (const item of bag(payload)) {
      const r = rec(item)
      const a = String(r?.anchor || r?.text || (typeof item === 'string' ? item : ''))
      if (a) snap.anchors.push(a)
    }
    snap.anchors = [...new Set(snap.anchors)].slice(0, 40)
  }
  if (name === 'linking_domains') {
    for (const item of bag(payload)) {
      const r = rec(item)
      const d = String(r?.domain || r?.host || (typeof item === 'string' ? item : ''))
      if (d) snap.linkingDomains.push(d)
    }
    snap.linkingDomains = [...new Set(snap.linkingDomains)].slice(0, 40)
  }
  if (name === 'serp_analysis') {
    for (const item of bag(payload)) {
      const r = rec(item)
      if (!r) continue
      snap.serp.push({
        keyword: String(r.keyword || r.query || ''),
        position: Number(r.position || r.rank) || undefined,
        url: String(r.url || r.link || ''),
        title: String(r.title || ''),
      })
    }
    snap.serp = snap.serp.slice(0, 30)
  }
  if (name === 'content_ideas' || name === 'page_shares') {
    for (const item of bag(payload)) {
      const r = rec(item)
      const idea = String(r?.title || r?.idea || r?.keyword || r?.query || (typeof item === 'string' ? item : ''))
      if (idea) snap.contentIdeas.push(idea)
    }
    snap.contentIdeas = [...new Set(snap.contentIdeas)].slice(0, 40)
  }
}

/** Flatten snapshot layers into planner/Discover demand rows. */
export function signalsFromUbersuggestSnapshot(
  snap: UbersuggestEngineSnapshot | null | undefined,
): Array<{
  term: string
  impressions: number
  clicks: number
  position: number
  ctr: number
  source: 'ubersuggest'
  volume?: number
  keywordDifficulty?: number
}> {
  if (!snap) return []
  const volImp = (v: number) => Math.max(40, Math.min(4000, Math.round(Math.max(0, Number(v) || 0) * 0.15)))
  const seen = new Set<string>()
  const out: Array<{
    term: string
    impressions: number
    clicks: number
    position: number
    ctr: number
    source: 'ubersuggest'
    volume?: number
    keywordDifficulty?: number
  }> = []
  const push = (term: string, impressions: number, extra?: { volume?: number; keywordDifficulty?: number; position?: number }) => {
    const t = String(term || '').trim()
    const key = t.toLowerCase()
    if (!t || seen.has(key)) return
    seen.add(key)
    out.push({
      term: t,
      impressions,
      clicks: 0,
      position: extra?.position ?? 55,
      ctr: 0,
      source: 'ubersuggest',
      ...(extra?.volume != null ? { volume: extra.volume } : {}),
      ...(extra?.keywordDifficulty != null ? { keywordDifficulty: extra.keywordDifficulty } : {}),
    })
  }
  for (const k of snap.keywords || []) {
    if (!k.term) continue
    push(k.term, volImp(k.volume), {
      volume: k.volume,
      keywordDifficulty: k.keywordDifficulty,
      position: k.position && k.position < 70 ? k.position : 55,
    })
  }
  for (const idea of snap.contentIdeas || []) push(String(idea), 72)
  for (const row of snap.serp || []) {
    if (row.keyword) push(row.keyword, 88, { position: row.position && row.position < 70 ? row.position : 50 })
  }
  return out
}

export function snapshotSummary(snap: UbersuggestEngineSnapshot): string {
  const bits = [
    `${snap.keywords.length} keywords`,
    snap.pages.length ? `${snap.pages.length} top pages` : '',
    snap.competitors.length ? `${snap.competitors.length} competitors` : '',
    snap.backlinks.length || Object.keys(snap.backlinksOverview).length ? 'backlinks' : '',
    snap.serp.length ? `${snap.serp.length} SERP rows` : '',
    snap.contentIdeas.length ? `${snap.contentIdeas.length} content ideas` : '',
    Object.keys(snap.aisv).length ? 'AI visibility' : '',
    Object.keys(snap.audit).length ? 'audit' : '',
  ].filter(Boolean)
  return bits.join(' · ')
}
