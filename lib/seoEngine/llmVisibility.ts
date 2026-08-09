/**
 * lib/seoEngine/llmVisibility.ts
 *
 * LLM / AEO VISIBILITY TRACKER (share of voice in generative engines)
 *
 * GEO (Generative Engine Optimization) reality: ChatGPT, Perplexity, Google AI
 * Overviews and friends cite sources they trust. We cannot control them — but
 * we CAN measure our share of voice over time by running prompt audits: ask an
 * LLM to answer a real estate query with sources, then check whether the estate
 * was cited.
 *
 * Every audit is stored in `seo_llm_visibility` (query, engine, cited,
 * cited_urls, brand_mentions, snippet, raw_score) so the dashboard shows a
 * verifiable trend: which queries we win, which we lose, and what changed.
 *
 * The audit uses the same AI cascade as content generation (contentAiProvider),
 * so it costs nothing extra and runs on the daily cron.
 */

import { createSupabaseAdminClient } from '@/lib/supabase'
import { generateContentText } from '@/lib/contentAiProvider'

/** The estate's observable surface — everything we want LLMs to cite. */
export const ESTATE_DOMAINS: string[] = [
  'yousafeconsultancy.com',
  'legal.yousafeconsultancy.com',
  'usa.yousafeconsultancy.com',
  'uk.yousafeconsultancy.com',
  'ca.yousafeconsultancy.com',
  'au.yousafeconsultancy.com',
  'portal.yousafeconsultancy.com',
]

export const BRAND_MENTIONS: string[] = ['yousafe', 'you safe consultancy']

/** Canonical audit query bank — high-value estate queries (GSC-backed terms). */
export const DEFAULT_AUDIT_QUERIES: string[] = [
  'How do I get a student visa for Canada from Nigeria?',
  'What are the UK Skilled Worker visa requirements in 2026?',
  'Express Entry CRS calculator: how many points do I need for Canada PR?',
  'H-1B visa sponsorship: what documents do employers need?',
  'How long does a US green card take after marriage?',
  'Australia subclass 190: what are the state nomination requirements?',
  'UK spouse visa financial requirement 2026: how much do I need?',
  'How do I move my parents to Canada permanently?',
  'What is the ILR to citizenship timeline in the UK?',
  'Study in the USA: F-1 visa interview tips and checklist',
]

export interface VisibilityAuditOptions {
  queries?: string[]
  engineLabel?: string
  maxAudits?: number
}

export interface VisibilityAuditResult {
  query: string
  engine: string
  model: string | null
  cited: boolean
  citedUrls: string[]
  brandMentions: string[]
  snippet: string
  rawScore: number
  stage: string | null
  country: string | null
}

function extractUrls(text: string): string[] {
  const urls = text.match(/https?:\/\/[^\s)\]>"']+/g) || []
  return urls.map((u) => u.replace(/[.,;:]+$/, '')).filter((u) => u.includes('.'))
}

function scoreVoice(citedUrls: string[], mentions: string[]): number {
  // Share-of-voice: citations weighted more than bare mentions.
  let score = 0
  for (const u of citedUrls) {
    if (ESTATE_DOMAINS.some((d) => u.includes(d))) score += 1
  }
  for (const m of mentions) if (m) score += 0.5
  return Math.min(1, score / 3)
}

/** Run one audit for a single query. Never throws — returns a partial record. */
export async function auditQuery(query: string, engineLabel = 'deepseek', model: string | null = null): Promise<VisibilityAuditResult> {
  const empty: VisibilityAuditResult = {
    query, engine: engineLabel, model, cited: false, citedUrls: [], brandMentions: [],
    snippet: '', rawScore: 0, stage: null, country: null,
  }
  try {
    const ai = await generateContentText({
      system:
        `You are an answer engine doing a research round. Answer the user's question directly, then list the authoritative sources you used as URLs. ` +
        `Be honest: only list sources you actually relied on. Return the answer text first, then a line "Sources:" followed by one URL per line.`,
      prompt: query,
      maxTokens: 900,
      temperature: 0.2,
    })
    const text = (ai.text || '').trim()
    const citedUrls = extractUrls(text).filter((u) => ESTATE_DOMAINS.some((d) => u.includes(d)))
    const brandMentions = BRAND_MENTIONS.filter((b) => text.toLowerCase().includes(b.toLowerCase()))
    const snippet = text.replace(/\s+/g, ' ').slice(0, 500)

    // Tag stage/country deterministically from the query text
    let stage: string | null = null
    let country: string | null = null
    const lower = query.toLowerCase()
    const countryMap: Array<[string, string]> = [
      ['usa', 'US'], ['america', 'US'], ['united states', 'US'],
      ['uk', 'UK'], ['united kingdom', 'UK'], ['britain', 'UK'],
      ['canada', 'CA'], ['australia', 'AU'],
    ]
    for (const [key, c] of countryMap) if (lower.includes(key)) { country = c; break }
    const stageMap: Array<[RegExp, string]> = [
      [/visa|green card|permanent residence|pr /, 'visa'],
      [/student visa|study permit|study in|f-1|f1/, 'schools'],
      [/work visa|skilled worker|h-1b|h1b|express entry|subclass/, 'work'],
      [/spouse|partner|marriage|family|parents|children|relative/, 'family'],
      [/citizenship|naturali[sz]ation|ilr/, 'citizenship'],
      [/house|housing|rent|accommodation/, 'housing'],
      [/settle|bank|health|driver/, 'settlement'],
      [/move to|relocate|immigrate/, 'intent'],
    ]
    for (const [re, s] of stageMap) if (re.test(lower)) { stage = s; break }

    return {
      ...empty,
      cited: citedUrls.length > 0 || brandMentions.length > 0,
      citedUrls,
      brandMentions,
      snippet,
      rawScore: scoreVoice(citedUrls, brandMentions),
      stage,
      country,
    }
  } catch {
    return empty
  }
}

/** Run a batch of audits and persist to seo_llm_visibility. */
export async function runVisibilityAudits(opts: VisibilityAuditOptions = {}): Promise<{
  audits: VisibilityAuditResult[]
  cited: number
  total: number
  shareOfVoice: number
  engine: string
}> {
  const queries = (opts.queries || DEFAULT_AUDIT_QUERIES).slice(0, Math.min(15, opts.maxAudits ?? 10))
  const engine = opts.engineLabel || 'deepseek'
  const audits: VisibilityAuditResult[] = []

  for (const q of queries) {
    const result = await auditQuery(q, engine)
    audits.push(result)
    try {
      const supabase = createSupabaseAdminClient()
      await supabase.from('seo_llm_visibility').insert({
        query: result.query,
        engine: result.engine,
        model: result.model,
        cited: result.cited,
        cited_urls: result.citedUrls,
        brand_mentions: result.brandMentions,
        snippet: result.snippet,
        raw_score: result.rawScore,
        stage: result.stage,
        country: result.country,
      })
    } catch {
      // storage best-effort — the audit itself stands
    }
  }

  const cited = audits.filter((a) => a.cited).length
  const total = audits.length
  return {
    audits,
    cited,
    total,
    shareOfVoice: total ? Math.round((cited / total) * 100) : 0,
    engine,
  }
}

export async function loadVisibilityFeed(limit = 50): Promise<{
  audits: Array<Record<string, unknown>>
  shareOfVoice: number
  cited: number
  total: number
  byStage: Record<string, number>
}> {
  try {
    const supabase = createSupabaseAdminClient()
    const { data } = await supabase
      .from('seo_llm_visibility')
      .select('id,query,engine,model,cited,cited_urls,brand_mentions,snippet,raw_score,stage,country,created_at')
      .order('created_at', { ascending: false })
      .limit(limit)
    const rows = (data as Array<Record<string, unknown>>) || []
    const cited = rows.filter((r) => r.cited).length
    const byStage: Record<string, number> = {}
    for (const r of rows) {
      const s = String(r.stage || 'untagged')
      byStage[s] = (byStage[s] || 0) + 1
    }
    return {
      audits: rows,
      shareOfVoice: rows.length ? Math.round((cited / rows.length) * 100) : 0,
      cited,
      total: rows.length,
      byStage,
    }
  } catch {
    return { audits: [], shareOfVoice: 0, cited: 0, total: 0, byStage: {} }
  }
}
