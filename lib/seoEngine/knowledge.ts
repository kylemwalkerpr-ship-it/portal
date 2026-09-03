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
 *   - Keyword demand JSON      (caseworks Ads export — market volume, not GSC)
 *
 * Every item is normalized into `seo_knowledge` with source, URL, title,
 * AI summary (best-effort via contentAiProvider), lifecycle-stage tags and
 * confidence. Dedupe by URL. Failures are per-source and never fatal.
 */

import { createSupabaseAdminClient } from '@/lib/supabase'
import {
  accumulatePairRollup,
  emptyPairRollup,
  formatEnginePairTape,
  generateEngineText,
  type EnginePairRollup,
} from '@/lib/seoEngine/engineAi'
import { getStage, LIFECYCLE_STAGES, COUNTRIES, isCountry, type Country } from './ontology'
import { buildPredictiveSignal, type EvidenceLineage } from './intelligence'

export interface KnowledgeSource {
  id: string
  label: string
  kind: 'policy' | 'guidance' | 'trend'
  url: string
  /** Used when the primary host hangs (Google News from Workers). */
  fallbackUrl?: string
  countries: Country[]
  /** How many items to keep per run (per source). */
  limit: number
}

// ── Source registry (deterministic, overridable via seo_engine_config) ───────
export const DEFAULT_SOURCES: KnowledgeSource[] = [
  {
    id: 'keyword-demand',
    label: 'Caseworks keyword demand (Ads)',
    kind: 'trend',
    url: 'https://portal.yousafeconsultancy.com/seo-data/keyword-demand.json',
    countries: ['US', 'UK', 'CA', 'AU'],
    limit: 80,
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
    url: 'https://api.io.canada.ca/io-server/gc/news/en/v2?dept=departmentofcitizenshipandimmigration&sort=publishedDate&orderBy=desc&publishedDate%3E=2021-07-23&pick=50&format=atom&atomtitle=Immigration,%20Refugees%20and%20Citizenship%20Canada',
    countries: ['CA'],
    limit: 12,
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
    // Bing is primary: news.google.com hangs from Cloudflare Workers (6s skip).
    url: 'https://www.bing.com/news/search?q=USCIS+immigration&format=rss',
    fallbackUrl: 'https://news.google.com/rss/search?q=USCIS+immigration&hl=en-US&gl=US&ceid=US:en',
    countries: ['US'],
    limit: 12,
  },
  {
    id: 'gnews-ircc',
    label: 'Google News · IRCC Canada',
    kind: 'policy',
    url: 'https://www.bing.com/news/search?q=IRCC+Canada+immigration&format=rss',
    fallbackUrl: 'https://news.google.com/rss/search?q=IRCC+Canada+immigration&hl=en-CA&gl=CA&ceid=CA:en',
    countries: ['CA'],
    limit: 12,
  },
  {
    id: 'gnews-au',
    label: 'Google News · Australia immigration',
    kind: 'policy',
    url: 'https://www.bing.com/news/search?q=Australia+immigration+visa&format=rss',
    fallbackUrl: 'https://news.google.com/rss/search?q=Australia+immigration+visa&hl=en-AU&gl=AU&ceid=AU:en',
    countries: ['AU'],
    limit: 12,
  },
  {
    id: 'gnews-uk',
    label: 'Google News · UK Home Office',
    kind: 'policy',
    url: 'https://www.bing.com/news/search?q=UK+Home+Office+immigration&format=rss',
    fallbackUrl: 'https://news.google.com/rss/search?q=UK+Home+Office+immigration&hl=en-GB&gl=GB&ceid=GB:en',
    countries: ['UK'],
    limit: 12,
  },
  {
    id: 'gnews-seo',
    label: 'Google News · SEO',
    kind: 'guidance',
    url: 'https://www.bing.com/news/search?q=Google+Search+Central+SEO&format=rss',
    fallbackUrl: 'https://news.google.com/rss/search?q=Google+Search+Central+SEO&hl=en-US&gl=US&ceid=US:en',
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

/**
 * Browser-like UA — Google News RSS serves an empty/rate-limited response to
 * generic cloud runtimes without one (the "0 fetched" symptom in the live
 * ingest feed). The fetcher also retries once on 429/503 or an empty body
 * because Google News intermittently rate-limits datacenter IPs.
 */
const FEED_UA = 'Mozilla/5.0 (compatible; YouSafeContentStudio/1.0; +https://portal.yousafeconsultancy.com)'

/** Google News / Trends often hold the TCP connection; fail faster than gov feeds. */
export function defaultFeedTimeoutMs(url: string): number {
  return /news\.google\.com|trends\.google\.com/i.test(url) ? 6_000 : 8_000
}

/**
 * Race `work` against a timer. Cloudflare `fetch` to news.google.com frequently
 * ignores AbortSignal, so we cannot rely on AbortSignal.timeout alone — the
 * ingest livestream would freeze on "Fetching Google News · USCIS…" forever.
 */
export async function withTimeout<T>(ms: number, work: (signal: AbortSignal) => Promise<T>, label: string): Promise<T> {
  const ac = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ac.abort()
      reject(new Error(`${label} timed out after ${ms}ms`))
    }, ms)
  })
  try {
    return await Promise.race([work(ac.signal), timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function fetchFeedOnce(url: string, timeoutMs: number): Promise<string> {
  const res = await withTimeout(
    timeoutMs,
    (signal) =>
      fetch(url, {
        headers: {
          Accept: 'application/rss+xml, application/atom+xml, text/xml, */*',
          'User-Agent': FEED_UA,
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal,
      }),
    'Feed',
  )
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await withTimeout(timeoutMs, () => res.text(), 'Feed body')
  if (!text.trim()) throw new Error(`Empty feed body (HTTP ${res.status})`)
  return text
}

/** Fetch a feed URL with a hard timeout, one retry on 429/503, then optional fallback host. */
export async function fetchFeedText(url: string, opts?: { timeoutMs?: number; fallbackUrl?: string }): Promise<string> {
  const timeoutMs = Math.max(250, opts?.timeoutMs ?? defaultFeedTimeoutMs(url))
  const urls = [...new Set([url, opts?.fallbackUrl].filter((u): u is string => Boolean(u)))]
  let lastErr = 'Empty feed body'
  for (const candidate of urls) {
    const budget = /news\.google\.com/i.test(candidate) ? Math.min(timeoutMs, 6_000) : timeoutMs
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await fetchFeedOnce(candidate, budget)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        lastErr = /timed out/i.test(msg) ? `Feed timed out after ${budget}ms` : msg
        const retryable = /HTTP 429|HTTP 503|Empty feed/i.test(msg)
        if (attempt === 0 && retryable) {
          await new Promise((r) => setTimeout(r, 300))
          continue
        }
        break
      }
    }
  }
  throw new Error(lastErr)
}

/** Unwrap Bing News tracker URLs so knowledge rows store the publisher link. */
export function unwrapFeedLink(link: string): string {
  const decoded = decodeXml(link)
  try {
    const u = new URL(decoded)
    const nested = u.searchParams.get('url')
    if (nested && /(?:^|\.)bing\.com$/i.test(u.hostname)) return nested
  } catch {
    /* keep decoded */
  }
  return decoded
}

export function parseFeed(xml: string, limit: number): RawItem[] {
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
    let link = linkMatch ? unwrapFeedLink(linkMatch[1]) : ''
    if (!title) continue
    if (!link || /trends\.google\.com\/trending\/rss/i.test(link)) {
      link = `https://trends.google.com/trending?q=${encodeURIComponent(title)}`
    }
    const newsTitles = [...block.matchAll(/<ht:news_item_title[^>]*>([\s\S]*?)<\/ht:news_item_title>/gi)].map((n) => decodeXml(n[1]))
    const description = [grab('description') || grab('summary'), ...newsTitles].filter(Boolean).join(' · ')
    items.push({ title, link, description, published: grab('pubDate') || grab('published') || grab('updated') || undefined })
  }
  return items
}

function normalizeUrl(url: string): string {
  try { const p = new URL(url.trim()); p.hash = ''; return p.href } catch { return url.trim() }
}

export interface TaggedItem extends RawItem { stages: string[]; countries: Country[]; score: number }

const IMMIGRATION_LEXICON = /\b(visa|immigra|uscis|ircc|home office|ukvi|citizenship|asylum|opt|h-?1b|f-?1|l-?1|o-?1|green card|skilled worker|express entry|graduate route|study permit|subclass|sponsor licence|tps|ead|public charge|global talent|naturali[sz]ation|n-?400|i-?485|i-?20|cas letter|pr pathway|permanent resident|indefinite leave|lmia|pgwp)\b/i
const SEO_LEXICON = /\b(search console|search central|google search|core update|ranking|sitemap|structured data|crawler|indexing|seo|rich result)\b/i

function foldText(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/([a-z0-9])-+(?=[a-z0-9])/g, '$1')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isImmigrationRelevant(title: string, description = ''): boolean {
  return IMMIGRATION_LEXICON.test(`${title} ${description}`)
}

export function isSeoRelevant(title: string, description = ''): boolean {
  return SEO_LEXICON.test(`${title} ${description}`)
}

function applySourceFloor(tagged: TaggedItem, source?: KnowledgeSource): TaggedItem {
  if (tagged.score > 0 || !source) return tagged
  if (source.kind === 'policy') {
    // A policy item that matched NOTHING in the ontology must not be pinned to
    // the visa cell by default — that silently inflated the busiest cell's
    // knowledge bias with passports notices and deportation tooling stories.
    return {
      ...tagged,
      score: 2,
      countries: tagged.countries.length ? tagged.countries : [...source.countries],
      stages: tagged.stages.length ? tagged.stages : [],
    }
  }
  if (source.kind === 'guidance' && isSeoRelevant(tagged.title, tagged.description)) {
    return { ...tagged, score: 3, countries: tagged.countries.length ? tagged.countries : [...source.countries], stages: tagged.stages.length ? tagged.stages : ['intent'] }
  }
  return tagged
}

export function tagItem(item: RawItem, source?: KnowledgeSource): TaggedItem {
  const hay = `${item.title} ${item.description}`.toLowerCase()
  const folded = foldText(hay)
  const hits: Array<{ stage: string; country: Country; score: number }> = []
  for (const stage of LIFECYCLE_STAGES) for (const country of COUNTRIES) {
    const cell = stage.countries[country]
    let score = 0
    for (const kw of cell.seedKeywords) {
      const needle = foldText(kw)
      if (needle && folded.includes(needle)) score += kw.split(' ').length
    }
    for (const authority of cell.authorities) if (hay.includes(authority.toLowerCase())) score += 2
    if (score > 0) hits.push({ stage: stage.key, country, score })
  }
  hits.sort((a, b) => b.score - a.score)
  let stages = Array.from(new Set(hits.slice(0, 3).map((h) => h.stage)))
  let countries = Array.from(new Set(hits.slice(0, 2).map((h) => h.country)))
  let score = hits.reduce((sum, h) => sum + h.score, 0)
  if (isImmigrationRelevant(item.title, item.description)) {
    score = Math.max(score, 3)
    if (!countries.length && source?.countries?.length) countries = [...source.countries]
    if (!stages.length) stages = ['visa']
  }
  return applySourceFloor({ ...item, stages, countries, score }, source)
}

export interface KnowledgeIngestOptions {
  sources?: string[]
  limitPerSource?: number
  aiSummarize?: boolean
  maxAiItems?: number
  /** Live progress callback for streaming surfaces (phase, message, detail). */
  onProgress?: (phase: string, message: string, detail?: string) => void
}
export interface KnowledgeIngestResult {
  sourcesRun: number
  itemsFetched: number
  itemsStored: number
  aiSummarized: number
  skipped: number
  errors: string[]
  aiErrors: string[]
  perSource: Array<{ id: string; label: string; fetched: number; stored: number; error?: string }>
  pair: EnginePairRollup
}

/** Parse the knowledge-analyst JSON (or recover a 2-sentence prose summary). */
export function parseKnowledgeAiSummary(text: string): { summary: string; stages: string[]; countries: string[] } {
  const raw = (text || '').trim()
  const empty = { summary: '', stages: [] as string[], countries: [] as string[] }
  if (!raw) return empty

  const fenced = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/g, '').trim()
  const start = fenced.indexOf('{')
  const end = fenced.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      const obj = JSON.parse(fenced.slice(start, end + 1)) as {
        summary?: unknown
        stages?: unknown
        countries?: unknown
      }
      const summary = String(obj.summary || '').replace(/\s+/g, ' ').trim()
      const stages = Array.isArray(obj.stages) ? obj.stages.map((s) => String(s)).filter(Boolean) : []
      const countries = Array.isArray(obj.countries) ? obj.countries.map((c) => String(c)).filter(Boolean) : []
      if (summary) return { summary, stages, countries }
    } catch {
      /* fall through to prose recovery */
    }
  }

  const prose = raw
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[{}\[\]"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const sentences = prose.split(/(?<=[.!?])\s+/).filter((s) => s.length > 20).slice(0, 2).join(' ')
  return { ...empty, summary: sentences.slice(0, 500) }
}

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
  const result: KnowledgeIngestResult = { sourcesRun: 0, itemsFetched: 0, itemsStored: 0, aiSummarized: 0, skipped: 0, errors: [], aiErrors: [], perSource: [], pair: emptyPairRollup() }
  const aiSummarize = opts.aiSummarize !== false
  let aiBudget = Math.max(0, Math.min(20, opts.maxAiItems ?? 8))

  for (const source of sources) {
    const per: KnowledgeIngestResult['perSource'][number] = { id: source.id, label: source.label, fetched: 0, stored: 0 }
    opts.onProgress?.('fetch', `Fetching ${source.label}…`)
    const sourceMs = source.id.startsWith('gnews') || source.id.startsWith('google-trends') ? 10_000 : 18_000
    try {
      if (source.id === 'keyword-demand') {
        const { ingestKeywordDemandSource } = await import('./keywordDemand')
        const sub = await withTimeout(sourceMs, () => ingestKeywordDemandSource({ limit: Math.max(limit, source.limit) }), source.label)
        per.fetched = sub.fetched
        per.stored = sub.stored
        result.itemsFetched += sub.fetched
        result.itemsStored += sub.stored
        result.skipped += sub.skipped
        if (sub.error) {
          per.error = sub.error
          result.errors.push(`${source.id}: ${sub.error}`)
        }
      } else {
      const raw = parseFeed(await fetchFeedText(source.url, { fallbackUrl: source.fallbackUrl }), limit)
      per.fetched = raw.length; result.itemsFetched += raw.length
      for (const item of raw) {
        const tagged = tagItem(item, source)
        if (!tagged.score) { result.skipped += 1; continue }
        const dedupeKey = normalizeUrl(tagged.link)
        let aiSummary: string | null = null
        let extraTags: string[] = []
        if (aiSummarize && aiBudget > 0) {
          aiBudget -= 1
          try {
            const ai = await generateEngineText({
              system: `You are the SEO knowledge analyst for an immigration marketplace. Summarize this item in 2 crisp sentences and tag affected stages: ${stagePromptBanks()}. Reply as JSON {"summary":"...","stages":[],"countries":[]}. Be factual — never invent numbers.`,
              prompt: `SOURCE: ${source.label}\nTITLE: ${tagged.title}\nBODY: ${(tagged.description || '').slice(0, 1200)}`,
              maxTokens: 250,
              timeoutMs: 25000,
              aiProvider: 'entrim-qwen-27b',
              skipQualityContract: true,
              temperature: 0.2,
            })
            const parsed = parseKnowledgeAiSummary(ai.text || '')
            accumulatePairRollup(result.pair, ai.pair)
            const extras = ai.pair?.extras
            const extraBits = [...(extras?.statutes || []), ...(extras?.urls || [])]
            extraTags = [
              ...(extras?.statutes || []).map((s) => `statute:${s.slice(0, 48)}`),
              ...(extras?.urls || []).map((u) => `url:${u.slice(0, 80)}`),
            ]
            const usable = parsed.summary && parsed.summary !== tagged.title
            if (usable) {
              aiSummary = extraBits.length
                ? `${parsed.summary}\n\n[GLM extras] ${extraBits.join('; ')}`
                : parsed.summary
              const stages = parsed.stages.filter((s) => getStage(s)).slice(0, 3)
              const countries = parsed.countries.filter((c) => isCountry(c)).slice(0, 2)
              if (stages.length) tagged.stages = stages
              if (countries.length) tagged.countries = countries
              result.aiSummarized += 1
            } else {
              aiSummary = tagged.title
              if (result.aiErrors.length < 6) result.aiErrors.push(`${source.id}: empty AI summary`)
            }
          } catch (e) {
            aiSummary = tagged.title
            const msg = e instanceof Error ? e.message : String(e)
            if (result.aiErrors.length < 6) result.aiErrors.push(`${source.id}: ${msg.slice(0, 160)}`)
          }
        }
        // Safe date parse: a malformed feed pubDate ("Published 2 days ago")
        // used to throw inside the per-source try and discard EVERY item that
        // source fetched that run. Bad dates are skipped per-item now, and
        // future-dated stamps are clamped to now.
        let publishedIso: string | null = null
        try {
          const t = tagged.published ? new Date(tagged.published).getTime() : NaN
          if (Number.isFinite(t)) publishedIso = new Date(Math.min(t, Date.now())).toISOString()
        } catch {
          publishedIso = null
        }
        const { error } = await supabase.from('seo_knowledge').upsert({
          source: source.id, source_label: source.label, kind: source.kind, url: dedupeKey,
          title: tagged.title.slice(0, 500), summary: (tagged.description || '').slice(0, 2000) || null,
          ai_summary: aiSummary, tags: [
            ...tagged.stages,
            ...tagged.countries.map((c) => c.toLowerCase()),
            ...extraTags,
          ],
          countries: tagged.countries, stages: tagged.stages, confidence: Math.min(0.99, authorityFor(source)),
          published_at: publishedIso, dedupe_key: dedupeKey,
        }, { onConflict: 'dedupe_key' })
        if (error) {
          if (!/42P01|relation .* does not exist/i.test(error.message)) result.errors.push(`${source.id}: ${error.message.slice(0, 160)}`)
          result.skipped += 1; continue
        }
        await persistIntelligenceSnapshot(source, tagged, aiSummary)
        result.itemsStored += 1; per.stored += 1
      }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e); per.error = msg.slice(0, 200); result.errors.push(`${source.id}: ${msg.slice(0, 160)}`)
    }
    result.sourcesRun += 1; result.perSource.push(per)
    const skipNote = !per.error && per.fetched > 0 && per.stored === 0 ? 'none matched immigration / SEO ontology' : per.error
    opts.onProgress?.('store', `${source.label}: ${per.stored} stored · ${per.fetched} fetched`, skipNote)
  }
  try {
    const { loadUbersuggestConfig } = await import('./ubersuggest')
    const { snapshotSummary } = await import('./ubersuggestSnapshot')
    const cfg = await loadUbersuggestConfig()
    if (cfg.lastSnapshot && (cfg.lastSnapshot.keywords?.length || cfg.lastSnapshot.contentIdeas?.length)) {
      const summary = snapshotSummary(cfg.lastSnapshot)
      opts.onProgress?.(
        'store',
        `Ubersuggest engine snapshot · ${summary}`,
        cfg.lastSnapshot.pulledAt,
      )
    } else if (!cfg.enabled) {
      opts.onProgress?.('store', 'Ubersuggest not connected — snapshot layers skipped')
    }
  } catch {
    /* snapshot readout is additive */
  }
  return result
}

export async function recordEngineRun(kind: 'knowledge' | 'plan' | 'daily' | 'forecast-reward' | 'manual', status: 'running' | 'success' | 'partial' | 'failed', summary: Record<string, unknown>, errors: string[] = [], triggeredBy = 'cron'): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await createSupabaseAdminClient().from('seo_engine_runs').insert({ kind, status, summary, errors: errors.slice(0, 20), triggered_by: triggeredBy, finished_at: status === 'running' ? null : new Date().toISOString() })
    if (error) {
      console.warn('[seoEngine] recordEngineRun', error.message)
      return { ok: false, error: error.message }
    }
    return { ok: true }
  } catch (e) {
    const error = e instanceof Error ? e.message : 'recordEngineRun failed'
    console.warn('[seoEngine] recordEngineRun', error)
    return { ok: false, error }
  }
}

export async function latestEngineRuns(limit = 10): Promise<Array<Record<string, unknown>>> {
  try { const { data } = await createSupabaseAdminClient().from('seo_engine_runs').select('*').order('started_at', { ascending: false }).limit(limit); return (data as Array<Record<string, unknown>>) || [] } catch { return [] }
}

export async function loadKnowledgeFeed(limit = 40): Promise<{ items: Array<Record<string, unknown>>; sources: Array<{ id: string; label: string; lastCount: number }> }> {
  const { data } = await createSupabaseAdminClient().from('seo_knowledge').select('id,source,source_label,kind,title,ai_summary,summary,url,countries,stages,confidence,published_at,fetched_at').order('fetched_at', { ascending: false }).limit(limit)
  return { items: (data as Array<Record<string, unknown>>) || [], sources: DEFAULT_SOURCES.map((s) => ({ id: s.id, label: s.label, lastCount: 0 })) }
}
