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
  // Resilient Google News policy feeds — reachable from any edge, always fresh.
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
    id: 'google-trends-us',
    label: 'Google Trends (US)',
    kind: 'trend',
    url: 'https://trends.google.com/trending/rss?geo=US',
    countries: ['US'],
    limit: 10,
  },
  {
    id: 'google-trends-uk',
    label: 'Google Trends (UK)',
    kind: 'trend',
    url: 'https://trends.google.com/trending/rss?geo=GB',
    countries: ['UK'],
    limit: 10,
  },
  {
    id: 'google-trends-ca',
    label: 'Google Trends (CA)',
    kind: 'trend',
    url: 'https://trends.google.com/trending/rss?geo=CA',
    countries: ['CA'],
    limit: 10,
  },
  {
    id: 'google-trends-au',
    label: 'Google Trends (AU)',
    kind: 'trend',
    url: 'https://trends.google.com/trending/rss?geo=AU',
    countries: ['AU'],
    limit: 10,
  },
]

// ── Lightweight RSS/Atom parsing (no runtime deps; Worker-safe) ──────────────
interface RawItem {
  title: string
  link: string
  description: string
  published?: string
}

function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .trim()
}

function parseFeed(xml: string, limit: number): RawItem[] {
  const items: RawItem[] = []
  // Works for both RSS (<item>) and Atom (<entry>).
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
    const description = grab('description') || grab('summary') || ''
    const pub = grab('pubDate') || grab('published') || grab('updated') || undefined
    items.push({ title, link, description, published: pub || undefined })
  }
  return items
}

function normalizeUrl(url: string): string {
  const u = url.trim()
  if (!u) return u
  try {
    const p = new URL(u)
    p.hash = ''
    return p.href
  } catch {
    return u
  }
}

// ── Life-cycle tagging (deterministic keyword match over title+description) ──
export interface TaggedItem extends RawItem {
  stages: string[]
  countries: Country[]
  score: number
}

export function tagItem(item: RawItem): TaggedItem {
  const hay = `${item.title} ${item.description}`.toLowerCase()
  const hits: Array<{ stage: string; country: Country; score: number }> = []

  for (const stage of LIFECYCLE_STAGES) {
    for (const country of COUNTRIES) {
      const cell = stage.countries[country]
      let score = 0
      for (const kw of cell.seedKeywords) {
        const k = kw.toLowerCase()
        if (hay.includes(k)) score += k.split(' ').length // longer match = stronger
      }
      // Authority names signal country strongly
      for (const a of cell.authorities) {
        if (hay.includes(a.toLowerCase())) score += 2
      }
      if (score > 0) hits.push({ stage: stage.key, country, score })
    }
  }

  hits.sort((a, b) => b.score - a.score)
  const stages = Array.from(new Set(hits.slice(0, 3).map((h) => h.stage)))
  const countries = Array.from(new Set(hits.slice(0, 2).map((h) => h.country)))
  return { ...item, stages, countries, score: hits.reduce((s, h) => s + h.score, 0) }
}

// ── Ingestion ────────────────────────────────────────────────────────────────
export interface KnowledgeIngestOptions {
  sources?: string[] // ids to run (default: all)
  limitPerSource?: number
  aiSummarize?: boolean // default true (best-effort)
  maxAiItems?: number
}

export interface KnowledgeIngestResult {
  sourcesRun: number
  itemsFetched: number
  itemsStored: number
  aiSummarized: number
  skipped: number
  errors: string[]
  perSource: Array<{ id: string; label: string; fetched: number; stored: number; error?: string }>
}

const SUPABASE_KEYWORD_BANK = 'immigration visa study permit skilled worker express entry settlement citizenship spouse family' // used in prompt hint

function stagePromptBanks(): string {
  return LIFECYCLE_STAGES.map((s) => `${s.key}: ${s.label}`).join('\n')
}

export async function ingestKnowledge(opts: KnowledgeIngestOptions = {}): Promise<KnowledgeIngestResult> {
  const supabase = createSupabaseAdminClient()
  const sources = DEFAULT_SOURCES.filter((s) => !opts.sources || opts.sources.length === 0 || opts.sources.includes(s.id))
  const limit = Math.max(1, Math.min(25, opts.limitPerSource ?? 10))
  const result: KnowledgeIngestResult = {
    sourcesRun: 0, itemsFetched: 0, itemsStored: 0, aiSummarized: 0, skipped: 0, errors: [], perSource: [],
  }

  const aiSummarize = opts.aiSummarize !== false
  let aiBudget = Math.max(0, Math.min(20, opts.maxAiItems ?? 8))

  for (const source of sources) {
    const per: KnowledgeIngestResult['perSource'][number] = { id: source.id, label: source.label, fetched: 0, stored: 0 }
    try {
      const res = await fetch(source.url, {
        headers: { Accept: 'application/rss+xml, application/atom+xml, text/xml, */*' },
        signal: AbortSignal.timeout(12_000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const xml = await res.text()
      const raw = parseFeed(xml, limit)
      per.fetched = raw.length
      result.itemsFetched += raw.length

      for (const item of raw) {
        const tagged = tagItem(item)
        if (tagged.score === 0) {
          result.skipped += 1
          continue
        }
        const dedupeKey = normalizeUrl(tagged.link)

        let aiSummary: string | null = null
        if (aiSummarize && aiBudget > 0) {
          aiBudget -= 1
          try {
            const ai = await generateContentText({
              system: `You are the SEO knowledge analyst for an immigration marketplace. Summarize this policy/trend item in 2 crisp sentences for a content planner. Tag which of these journey stages it affects: ${stagePromptBanks()}. Reply as JSON: {"summary":"...","stages":["..."],"countries":["US","UK","CA","AU"]}. Be factual — never invent numbers.`,
              prompt: `SOURCE: ${source.label}\nTITLE: ${tagged.title}\nBODY: ${(tagged.description || '').slice(0, 1200)}`,
              maxTokens: 400,
              temperature: 0.2,
            })
            const parsed = JSON.parse((ai.text || '{}').trim().replace(/^```json?/, '').replace(/```$/, '')) as {
              summary?: string
              stages?: string[]
              countries?: string[]
            }
            aiSummary = parsed.summary || tagged.title
            const aiStages = (parsed.stages || []).filter((s) => getStage(s))
            if (aiStages.length) tagged.stages = aiStages.slice(0, 3)
            const aiCountries = (parsed.countries || []).filter((c) => isCountry(c))
            if (aiCountries.length) tagged.countries = aiCountries.slice(0, 2)
            result.aiSummarized += 1
          } catch {
            aiSummary = tagged.title // deterministic fallback
          }
        }

        const { data, error } = await supabase
          .from('seo_knowledge')
          .upsert(
            {
              source: source.id,
              source_label: source.label,
              kind: source.kind,
              url: dedupeKey,
              title: tagged.title.slice(0, 500),
              summary: (tagged.description || '').slice(0, 2000) || null,
              ai_summary: aiSummary,
              tags: [...tagged.stages, ...tagged.countries.map((c) => c.toLowerCase())],
              countries: tagged.countries,
              stages: tagged.stages,
              confidence: Math.min(0.99, 0.5 + tagged.score / 100),
              published_at: tagged.published ? new Date(tagged.published).toISOString() : null,
              dedupe_key: dedupeKey,
            },
            { onConflict: 'dedupe_key' },
          )
        if (error) {
          if (!/42P01|relation .* does not exist/i.test(error.message)) {
            result.errors.push(`${source.id}: ${error.message.slice(0, 160)}`)
          }
          result.skipped += 1
          continue
        }
        result.itemsStored += 1
        per.stored += 1
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      per.error = msg.slice(0, 200)
      result.errors.push(`${source.id}: ${msg.slice(0, 160)}`)
    }
    result.sourcesRun += 1
    result.perSource.push(per)
  }
  return result
}

// ── Engine run audit helpers ─────────────────────────────────────────────────
export async function recordEngineRun(
  kind: 'knowledge' | 'plan' | 'daily' | 'manual',
  status: 'running' | 'success' | 'partial' | 'failed',
  summary: Record<string, unknown>,
  errors: string[] = [],
  triggeredBy = 'cron',
): Promise<void> {
  try {
    const supabase = createSupabaseAdminClient()
    await supabase.from('seo_engine_runs').insert({
      kind,
      status,
      summary,
      errors: errors.slice(0, 20),
      triggered_by: triggeredBy,
      finished_at: status === 'running' ? null : new Date().toISOString(),
    })
  } catch {
    // audit trail is best-effort — never throw into the engine
  }
}

export async function latestEngineRuns(limit = 10): Promise<Array<Record<string, unknown>>> {
  try {
    const supabase = createSupabaseAdminClient()
    const { data } = await supabase.from('seo_engine_runs').select('*').order('started_at', { ascending: false }).limit(limit)
    return (data as Array<Record<string, unknown>>) || []
  } catch {
    return []
  }
}

/** Knowledge feed state for the dashboard: recent intel + source health. */
export async function loadKnowledgeFeed(limit = 40): Promise<{
  items: Array<Record<string, unknown>>
  sources: Array<{ id: string; label: string; lastCount: number }>
}> {
  const supabase = createSupabaseAdminClient()
  const { data } = await supabase
    .from('seo_knowledge')
    .select('id,source,source_label,kind,title,ai_summary,summary,url,countries,stages,confidence,published_at,fetched_at')
    .order('fetched_at', { ascending: false })
    .limit(limit)
  return {
    items: (data as Array<Record<string, unknown>>) || [],
    sources: DEFAULT_SOURCES.map((s) => ({ id: s.id, label: s.label, lastCount: 0 })),
  }
}
