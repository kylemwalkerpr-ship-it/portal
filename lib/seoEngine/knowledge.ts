/**
 * lib/seoEngine/knowledge.ts
 *
 * Daily fresh-knowledge ingestion for the SEO Master Engine.
 *
 * The engine actively consumes public intelligence so planning never relies
 * on stale assumptions:
 *   - Government policy feeds  (USCIS · Home Office · IRCC · AU Home Affairs)
 *   - Google Search Central    (algorithm + AI-search guidance)
 *   - Google Trends            (daily trending topics per country)
 *   - GSC signals              (own-site demand, via existing seoFactory)
 *
 * Every item is normalized into `seo_knowledge` with source, URL, title,
 * AI summary (best-effort via contentAiProvider), lifecycle-stage tags and
 * confidence. Dedupe by URL. Failures are per-source and never fatal.
 */

import { createSupabaseAdminClient } from '@/lib/supabase'
import { generateContentText } from '@/lib/contentAiProvider'
import { getStage, LIFECYCLE_STAGES, COUNTRIES, isCountry, type Country } from './ontology'
import { buildPredictiveSignal, type EvidenceLineage } from './intelligence'

export interface KnowledgeSource {
  id: string
  label: string
  kind: 'policy' | 'guidance' | 'trend'
  url: string
  countries: Country[]
  /** How many items to keep per run (per source). */
  limit: number
}

// ── Source registry (deterministic, overridable via seo_engine_config) ───────
export const DEFAULT_SOURCES: KnowledgeSource[] = [
  {
    id: 'uscis-news',
    label: 'USCIS Newsroom',
    kind: 'policy',
    url: 'https://www.uscis.gov/news/all-news/rss',
    countries: ['US'],
    limit: 12,
  },
  {
    id: 'home-office',
    label: 'UK Home Office (immigration)',
    kind: 'policy',
    url: 'https://www.gov.uk/search/news-and-communications.atom?organisations%5B%5D=home-office&keywords=immigration',
    countries: ['UK'],
    limit: 12,
  },
  {
    id: 'ircc-news',
    label: 'IRCC News (Canada)',
    kind: 'policy',
    url: 'https://www.canada.ca/en/immigration-refugees-citizenship.rss',
    countries: ['CA'],
    limit: 12,
  },
  {
    id: 'home-affairs-au',
    label: 'AU Home Affairs Media',
    kind: 'policy',
    url: 'https://www.homeaffairs.gov.au/news-media/media-releases.rss',
    countries: ['AU'],
    limit: 10,
  },
  {
    id: 'google-search-central',
    label: 'Google Search Central',
    kind: 'guidance',
    url: 'https://developers.googleblog.com/feeds/posts/default?alt=rss',
    countries: ['US', 'UK', 'CA', 'AU'],
    limit: 8,
  },
  {
    id: 'gnews-uscis',
    label: 'Google News · USCIS',
    kind: 'policy',
    url: 'https://news.google.com/rss/search?q=USCIS&hl=en-US&gl=US&ceid=US:en',
    countries: ['US'],
    limit: 12,
  },
  {
    id: 'gnews-ircc',
    label: 'Google News · IRCC Canada',
    kind: 'policy',
    url: 'https://news.google.com/rss/search?q=IRCC+Canada+immigration&hl=en-CA&gl=CA&ceid=CA:en',
    countries: ['CA'],
    limit: 12,
  },
  {
    id: 'gnews-au',
    label: 'Google News · Australia immigration',
    kind: 'policy',
    url: 'https://news.google.com/rss/search?q=Australia+immigration+visa&hl=en-AU&gl=AU&ceid=AU:en',
    countries: ['AU'],
    limit: 12,
  },
  {
    id: 'gnews-uk',
    label: 'Google News · UK Home Office',
    kind: 'policy',
    url: 'https://news.google.com/rss/search?q=UK+Home+Office+immigration&hl=en-GB&gl=GB&ceid=GB:en',
    countries: ['UK'],
    limit: 12,
  },
  {
    id: 'gnews-seo',
    label: 'Google News · SEO',
    kind: 'guidance',
    url: 'https://news.google.com/rss/search?q=Google+Search+Central+SEO&hl=en-US&gl=US&ceid=US:en',
    countries: ['US', 'UK', 'CA', 'AU'],
    limit: 8,
  },
  {
    id: 'google-trends-us', label: 'Google Trends (US)', kind: 'trend', url: 'https://trends.google.com/trending/rss?geo=US', countries: ['US'], limit: 10,
  },
  {
    id: 'google-trends-uk', label: 'Google Trends (UK)', kind: 'trend', url: 'https://trends.google.com/trending/rss?geo=GB', countries: ['UK'], limit: 10,
  },
  {
    id: 'google-trends-ca', label: 'Google Trends (CA)', kind: 'trend', url: 'https://trends.google.com/trending/rss?geo=CA', countries: ['CA'], limit: 10,
  },
  {
    id: 'google-trends-au', label: 'Google Trends (AU)', kind: 'trend', url: 'https://trends.google.com/trending/rss?geo=AU', countries: ['AU'], limit: 10,
  },
]

interface RawItem {
  title: string
  link: string
  description: string
  published?: string
}

function decodeXml(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'").trim()
}

function parseFeed(xml: string, limit: number): RawItem[] {
  const items: RawItem[] = []
  const re = /<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null && items.length < limit) {
    const block = m[1]
    const grab = (tag: string) => {
      const mm = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
      return mm ? decodeXml(mm[1]) : ''
    }
    const title = grab('title')
    const linkMatch = block.match(/<(?:link|link href|link[^>]*href)\s*[^>]*?href="([^"]+)"/i) || block.match(/<link>([^<]+)<\/link>/i)
    const link = linkMatch ? decodeXml(linkMatch[1]) : ''
    if (!title || !link) continue
    items.push({ title, link, description: grab('description') || grab('summary') || '', published: grab('pubDate') || grab('published') || grab('updated') || undefined })
  }
  return items
}

function normalizeUrl(url: string): string {
  try { const p = new URL(url.trim()); p.hash = ''; return p.href } catch { return url.trim() }
}

export interface TaggedItem extends RawItem { stages: string[]; countries: Country[]; score: number }

export function tagItem(item: RawItem): TaggedItem {
  const hay = `${item.title} ${item.description}`.toLowerCase()
  const hits: Array<{ stage: string; country: Country; score: number }> = []
  for (const stage of LIFECYCLE_STAGES) for (const country of COUNTRIES) {
    const cell = stage.countries[country]
    let score = 0
    for (const kw of cell.seedKeywords) if (hay.includes(kw.toLowerCase())) score += kw.split(' ').length
    for (const authority of cell.authorities) if (hay.includes(authority.toLowerCase())) score += 2
    if (score > 0) hits.push({ stage: stage.key, country, score })
  }
  hits.sort((a, b) => b.score - a.score)
  return { ...item, stages: Array.from(new Set(hits.slice(0, 3).map((h) => h.stage))), countries: Array.from(new Set(hits.slice(0, 2).map((h) => h.country))), score: hits.reduce((sum, h) => sum + h.score, 0) }
}

export interface KnowledgeIngestOptions { sources?: string[]; limitPerSource?: number; aiSummarize?: boolean; maxAiItems?: number }
export interface KnowledgeIngestResult { sourcesRun: number; itemsFetched: number; itemsStored: number; aiSummarized: number; skipped: number; errors: string[]; perSource: Array<{ id: string; label: string; fetched: number; stored: number; error?: string }> }

function stagePromptBanks(): string { return LIFECYCLE_STAGES.map((s) => `${s.key}: ${s.label}`).join('\n') }

function authorityFor(source: KnowledgeSource): number {
  if (source.id === 'google-search-central' || source.url.includes('uscis.gov') || source.url.includes('gov.uk') || source.url.includes('canada.ca') || source.url.includes('homeaffairs.gov.au')) return 0.98
  if (source.kind === 'policy') return 0.86
  if (source.kind === 'guidance') return 0.82
  return 0.55
}

async function persistIntelligenceSnapshot(
  source: KnowledgeSource,
  tagged: TaggedItem,
  summary: string | null,
): Promise<void> {
  try {
    const observedAt = new Date().toISOString()
    const evidence: EvidenceLineage[] = [{
      kind: 'knowledge', id: source.id, url: normalizeUrl(tagged.link), observedAt,
      source: source.label, authority: authorityFor(source), excerpt: (summary || tagged.title).slice(0, 280),
    }]
    const pseudoOpportunity = {
      topic: tagged.title, play: 'content_gap' as const, opportunityScore: Math.min(100, tagged.score * 8),
      difficultyScore: 50, signals: [`${source.label} · ${tagged.title}`], sourcePage: tagged.link,
    }
    const prediction = buildPredictiveSignal(pseudoOpportunity, evidence)
    const db = createSupabaseAdminClient()
    const snapshotKey = `${source.id}:${normalizeUrl(tagged.link)}`
    const row = {
      snapshot_key: snapshotKey,
      model_version: prediction.modelVersion, topic: prediction.topic,
      normalized_topic: tagged.title.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim(),
      play: prediction.play, opportunity_score: prediction.opportunityScore,
      confidence: prediction.confidence, freshness: prediction.freshness,
      rankability: prediction.rankability, evidence: prediction.evidence,
      reasons: prediction.reasons, regeneration_eligible: prediction.regenerationEligible,
      observed_at: observedAt,
      last_seen_at: observedAt,
    }
    // Keep the original observed_at on unchanged feed items so freshness decay
    // reflects the evidence revision, not how often the cron happened to poll.
    const { data: existing } = await db.from('seo_intelligence_snapshots').select('observed_at').eq('snapshot_key', snapshotKey).maybeSingle()
    if (existing?.observed_at) {
      delete row.observed_at
    }
    const { error } = await db.from('seo_intelligence_snapshots').upsert(row, { onConflict: 'snapshot_key' })
    if (error && !/42P01|relation .* does not exist/i.test(error.message)) console.warn('[seoEngine/knowledge] intelligence snapshot', error.message)
  } catch {
    // The intelligence table is additive; ingestion remains useful if it has
    // not been migrated in a preview environment yet.
  }
}

export async function ingestKnowledge(opts: KnowledgeIngestOptions = {}): Promise<KnowledgeIngestResult> {
  const supabase = createSupabaseAdminClient()
  const sources = DEFAULT_SOURCES.filter((s) => !opts.sources || opts.sources.length === 0 || opts.sources.includes(s.id))
  const limit = Math.max(1, Math.min(25, opts.limitPerSource ?? 10))
  const result: KnowledgeIngestResult = { sourcesRun: 0, itemsFetched: 0, itemsStored: 0, aiSummarized: 0, skipped: 0, errors: [], perSource: [] }
  const aiSummarize = opts.aiSummarize !== false
  let aiBudget = Math.max(0, Math.min(20, opts.maxAiItems ?? 8))

  for (const source of sources) {
    const per: KnowledgeIngestResult['perSource'][number] = { id: source.id, label: source.label, fetched: 0, stored: 0 }
    try {
      const res = await fetch(source.url, { headers: { Accept: 'application/rss+xml, application/atom+xml, text/xml, */*' }, signal: AbortSignal.timeout(12_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const raw = parseFeed(await res.text(), limit)
      per.fetched = raw.length; result.itemsFetched += raw.length
      for (const item of raw) {
        const tagged = tagItem(item)
        if (!tagged.score) { result.skipped += 1; continue }
        const dedupeKey = normalizeUrl(tagged.link)
        let aiSummary: string | null = null
        if (aiSummarize && aiBudget > 0) {
          aiBudget -= 1
          try {
            const ai = await generateContentText({ system: `You are the SEO knowledge analyst for an immigration marketplace. Summarize this item in 2 crisp sentences and tag affected stages: ${stagePromptBanks()}. Reply as JSON {"summary":"...","stages":[],"countries":[]}. Be factual — never invent numbers.`, prompt: `SOURCE: ${source.label}\nTITLE: ${tagged.title}\nBODY: ${(tagged.description || '').slice(0, 1200)}`, maxTokens: 400, temperature: 0.2 })
            const parsed = JSON.parse((ai.text || '{}').trim().replace(/^```json?/, '').replace(/```$/, '')) as { summary?: string; stages?: string[]; countries?: string[] }
            aiSummary = parsed.summary || tagged.title
            const stages = (parsed.stages || []).filter((s) => getStage(s)).slice(0, 3)
            const countries = (parsed.countries || []).filter((c) => isCountry(c)).slice(0, 2)
            if (stages.length) tagged.stages = stages
            if (countries.length) tagged.countries = countries
            result.aiSummarized += 1
          } catch { aiSummary = tagged.title }
        }
        const { error } = await supabase.from('seo_knowledge').upsert({
          source: source.id, source_label: source.label, kind: source.kind, url: dedupeKey,
          title: tagged.title.slice(0, 500), summary: (tagged.description || '').slice(0, 2000) || null,
          ai_summary: aiSummary, tags: [...tagged.stages, ...tagged.countries.map((c) => c.toLowerCase())],
          countries: tagged.countries, stages: tagged.stages, confidence: Math.min(0.99, authorityFor(source)),
          published_at: tagged.published ? new Date(tagged.published).toISOString() : null, dedupe_key: dedupeKey,
        }, { onConflict: 'dedupe_key' })
        if (error) {
          if (!/42P01|relation .* does not exist/i.test(error.message)) result.errors.push(`${source.id}: ${error.message.slice(0, 160)}`)
          result.skipped += 1; continue
        }
        await persistIntelligenceSnapshot(source, tagged, aiSummary)
        result.itemsStored += 1; per.stored += 1
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e); per.error = msg.slice(0, 200); result.errors.push(`${source.id}: ${msg.slice(0, 160)}`)
    }
    result.sourcesRun += 1; result.perSource.push(per)
  }
  return result
}

export async function recordEngineRun(kind: 'knowledge' | 'plan' | 'daily' | 'manual', status: 'running' | 'success' | 'partial' | 'failed', summary: Record<string, unknown>, errors: string[] = [], triggeredBy = 'cron'): Promise<void> {
  try {
    await createSupabaseAdminClient().from('seo_engine_runs').insert({ kind, status, summary, errors: errors.slice(0, 20), triggered_by: triggeredBy, finished_at: status === 'running' ? null : new Date().toISOString() })
  } catch { /* best effort */ }
}

export async function latestEngineRuns(limit = 10): Promise<Array<Record<string, unknown>>> {
  try { const { data } = await createSupabaseAdminClient().from('seo_engine_runs').select('*').order('started_at', { ascending: false }).limit(limit); return (data as Array<Record<string, unknown>>) || [] } catch { return [] }
}

export async function loadKnowledgeFeed(limit = 40): Promise<{ items: Array<Record<string, unknown>>; sources: Array<{ id: string; label: string; lastCount: number }> }> {
  const { data } = await createSupabaseAdminClient().from('seo_knowledge').select('id,source,source_label,kind,title,ai_summary,summary,url,countries,stages,confidence,published_at,fetched_at').order('fetched_at', { ascending: false }).limit(limit)
  return { items: (data as Array<Record<string, unknown>>) || [], sources: DEFAULT_SOURCES.map((s) => ({ id: s.id, label: s.label, lastCount: 0 })) }
}
