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
 * 2026-08 upgrade (doc-aligned, multi-engine matrix):
 *   • Structured JSON output — every audit returns `answer`, `answerFormat`,
 *     `sources[]` (with domain + quote + position), `confidence` and `flags`.
 *     This follows the engine rule that every LLM judgment ships with evidence
 *     + confidence, and the parser falls back to regex URL extraction when the
 *     model returns malformed JSON (never throws).
 *   • Multi-engine — each query is asked of up to N configured answer engines
 *     (exclusive pins, so a failed engine is recorded per-engine instead of
 *     silently cascading). Share-of-voice is the fraction of engines that
 *     cited the estate, and the per-engine breakdown is stored in `engines_json`.
 *   • Competitive delta — non-estate domains cited are captured, so we learn
 *     WHO beat us per query, not just whether we were cited.
 *   • Action generator — a deterministic, prioritized fix list turns a low
 *     share-of-voice into concrete edits (answer capsule, FAQ schema, entities,
 *     llms.txt) and names the top competitor to outrank.
 *
 * Every audit is stored in `seo_llm_visibility` so the dashboard shows a
 * verifiable trend: which queries we win, which we lose, and what changed.
 *
 * The audit uses the same AI cascade as content generation (contentAiProvider).
 */

import { createSupabaseAdminClient } from '@/lib/supabase'
import {
  generateContentText,
  isBasetenConfigured,
  isNvidiaGlmConfigured,
  isNvidiaDeepseekConfigured,
  isAihubmixGlmFastConfigured,
} from '@/lib/contentAiProvider'

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
  /** Live progress callback for streaming surfaces (phase, message, detail). */
  onProgress?: (phase: string, message: string, detail?: string) => void
}

// ── Structured audit types ──────────────────────────────────────────────────

/** One source the answer engine claimed to rely on. */
export interface AuditSource {
  url: string
  domain: string
  isEstate: boolean
  quote?: string
  position?: number
}

/** One answer engine's audit of one query. */
export interface EngineAudit {
  engine: string
  model: string | null
  ok: boolean
  cited: boolean
  citedUrls: string[]
  competitorDomains: string[]
  answerFormat: string | null
  snippet: string
  confidence: number
  flags: string[]
}

/** A deterministic, prioritized fix for a low share-of-voice query. */
export interface CitationAction {
  priority: number
  action: string
  evidence: string
}

/** Aggregated per-query result across all engines in the matrix. */
export interface VisibilityAuditResult {
  query: string
  engine: string
  model: string | null
  cited: boolean
  citedUrls: string[]
  brandMentions: string[]
  competitorDomains: string[]
  snippet: string
  rawScore: number
  /** Fraction of successful engines that cited the estate (0–1). */
  shareOfVoice: number
  stage: string | null
  country: string | null
  engines: EngineAudit[]
  topCompetitor: { domain: string; share: number } | null
  actions: CitationAction[]
}

/** Minimal evidence shape consumed by scoreMaster + the action generator. */
export interface LlmVisibilityEvidence {
  cited: number
  total: number
  shareOfVoice: number | null
  topCompetitorDomain: string | null
  competitorShare: number | null
}

function normalizeAuditQuery(q: string): string {
  return String(q || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function extractUrls(text: string): string[] {
  const urls = text.match(/https?:\/\/[^\s)\]>"']+/g) || []
  return urls.map((u) => u.replace(/[.,;:]+$/, '')).filter((u) => u.includes('.'))
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return url.toLowerCase()
  }
}

function isEstateUrl(url: string): boolean {
  const d = domainOf(url)
  return ESTATE_DOMAINS.some((est) => d === est || d.endsWith('.' + est))
}

// ── Structured audit prompt + parser ────────────────────────────────────────

const AUDIT_SYSTEM_PROMPT = `You are an answer engine being audited for citation behaviour. Answer the user's question directly, then cite the sources you actually relied on.

Respond with a single JSON object only — no markdown fences, no prose outside the JSON — exactly matching this schema:
{
  "answer": "the direct answer to the question",
  "answerFormat": "direct_answer | list | table | paragraph | definition",
  "sources": [
    { "url": "https://...", "domain": "example.com", "quote": "the exact phrase you took from this source", "position": 1 }
  ],
  "confidence": 0.8,
  "flags": ["low_confidence", "no_sources", "uncertain"]
}

Rules:
- Only list sources you actually used. Never invent a URL.
- "domain" is the bare host with no www, no path, no scheme.
- "position" is the 1-based order in which you relied on the source.
- "confidence" is a number 0.0–1.0 for how certain you are of the answer.
- If you have no sources, use an empty array and include the "no_sources" flag.
- Return ONLY the JSON.`

interface ParsedAuditResponse {
  answer: string
  answerFormat: string | null
  sources: AuditSource[]
  confidence: number
  flags: string[]
}

/**
 * Parse the answer engine's reply into structured evidence. Prefers the JSON
 * contract; falls back to regex URL extraction (flagged `malformed_json`) so a
 * bad model never throws away an otherwise-readable citation.
 */
export function parseAuditResponse(text: string): ParsedAuditResponse {
  const raw = (text || '').trim()
  const asString = (v: unknown): string => (typeof v === 'string' ? v : String(v || ''))

  // 1) Strict JSON contract.
  const fence = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const start = fence.indexOf('{')
  const end = fence.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      const obj = JSON.parse(fence.slice(start, end + 1)) as Record<string, unknown>
      const answer = asString(obj.answer || raw)
      const format = obj.answerFormat ? String(obj.answerFormat).toLowerCase() : null
      const rawSources = Array.isArray(obj.sources) ? (obj.sources as Array<Record<string, unknown>>) : []
      const sources: AuditSource[] = []
      let pos = 0
      for (const s of rawSources) {
        const url = asString(s.url || s.href || '').trim()
        if (!url || !/^https?:\/\//i.test(url)) continue
        const domain = asString(s.domain || '').trim() || domainOf(url)
        sources.push({
          url,
          domain: domain.toLowerCase().replace(/^www\./, ''),
          isEstate: isEstateUrl(url),
          quote: s.quote != null ? asString(s.quote).slice(0, 200) : undefined,
          position: Number.isFinite(Number(s.position)) ? Number(s.position) : ++pos,
        })
      }
      const confidence = Number.isFinite(Number(obj.confidence))
        ? Math.max(0, Math.min(1, Number(obj.confidence)))
        : sources.length ? 0.7 : 0.4
      const flags = Array.isArray(obj.flags) ? obj.flags.map(asString).slice(0, 10) : []
      return { answer, answerFormat: format, sources, confidence, flags }
    } catch {
      /* fall through to regex extraction */
    }
  }

  // 2) Regex fallback — flag it so the dashboard knows the model went off-script.
  const urls = extractUrls(raw)
  const sources = urls.map((u, i) => ({ url: u, domain: domainOf(u), isEstate: isEstateUrl(u), position: i + 1 }))
  return {
    answer: raw.replace(/\s+/g, ' ').slice(0, 500),
    answerFormat: null,
    sources,
    confidence: sources.length ? 0.5 : 0.2,
    flags: ['malformed_json'],
  }
}

// ── Engine matrix ───────────────────────────────────────────────────────────

interface AuditEngineCandidate {
  pin: string
  label: string
  configured: () => boolean
}

/** Answer engines the estate can actually query. Deduped by model family so
 *  the matrix measures DISTINCT engines, not the same model twice. */
function auditEngineCandidates(): AuditEngineCandidate[] {
  return [
    { pin: 'baseten-glm-fast', label: 'glm-fast', configured: () => isBasetenConfigured() },
    { pin: 'baseten-deepseek', label: 'deepseek', configured: () => isBasetenConfigured() },
    { pin: 'nvidia-glm', label: 'glm', configured: () => isNvidiaGlmConfigured() },
    { pin: 'nvidia-deepseek', label: 'deepseek', configured: () => isNvidiaDeepseekConfigured() },
    { pin: 'aihubmix-glm-fast', label: 'glm-fast', configured: () => isAihubmixGlmFastConfigured() },
    { pin: 'grok', label: 'grok', configured: () => Boolean(process.env.XAI_API_KEY || process.env.GROK_API_KEY) },
    { pin: 'gemini', label: 'gemini', configured: () => Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY) },
    { pin: 'groq', label: 'groq', configured: () => Boolean(process.env.GROQ_API_KEY) },
    { pin: 'openai', label: 'openai', configured: () => Boolean(process.env.OPENAI_API_KEY) },
  ]
}

/**
 * Resolve up to `maxEngines` configured answer engines (distinct model family
 * per slot). Returns [] when nothing is configured — the caller then falls
 * back to the un-pinned cascade so an audit still runs.
 */
export function resolveAuditEngines(maxEngines = 3): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const c of auditEngineCandidates()) {
    if (out.length >= maxEngines) break
    if (seen.has(c.label)) continue
    if (!c.configured()) continue
    seen.add(c.label)
    out.push(c.pin)
  }
  return out
}

/** Run one structured audit for a query against a single engine (exclusive pin). */
async function auditQueryEngine(query: string, pin: string): Promise<EngineAudit> {
  const fail = (flags: string[], confidence = 0): EngineAudit => ({
    engine: pin, model: null, ok: false, cited: false, citedUrls: [],
    competitorDomains: [], answerFormat: null, snippet: '', confidence, flags,
  })
  try {
    const ai = await generateContentText({
      aiProvider: pin,
      exclusive: true,
      system: AUDIT_SYSTEM_PROMPT,
      prompt: query,
      maxTokens: 900,
      temperature: 0.2,
    })
    const text = (ai.text || '').trim()
    const parsed = parseAuditResponse(text)
    const estateSources = parsed.sources.filter((s) => s.isEstate)
    const competitors = parsed.sources
      .filter((s) => !s.isEstate)
      .map((s) => s.domain)
      .filter(Boolean)
    return {
      engine: ai.provider || pin,
      model: ai.model || null,
      ok: true,
      cited: estateSources.length > 0 || BRAND_MENTIONS.some((b) => parsed.answer.toLowerCase().includes(b.toLowerCase())),
      citedUrls: estateSources.map((s) => s.url),
      competitorDomains: [...new Set(competitors)],
      answerFormat: parsed.answerFormat,
      snippet: parsed.answer.replace(/\s+/g, ' ').slice(0, 500),
      confidence: parsed.confidence,
      flags: parsed.flags,
    }
  } catch (e) {
    return fail(['engine_error: ' + (e instanceof Error ? e.message.slice(0, 120) : 'unknown')])
  }
}

/** Aggregate per-engine audits into one per-query VisibilityAuditResult. */
export function aggregateEngineAudits(query: string, engineAudits: EngineAudit[]): VisibilityAuditResult {
  const okAudits = engineAudits.filter((e) => e.ok)
  const citedAudits = okAudits.filter((e) => e.cited)
  const citedUrls = [...new Set(okAudits.flatMap((e) => e.citedUrls))]
  const brandMentions = BRAND_MENTIONS.filter((b) => okAudits.some((e) => e.snippet.toLowerCase().includes(b.toLowerCase())))
  const competitorDomains = [...new Set(okAudits.flatMap((e) => e.competitorDomains))]
  const shareOfVoice = okAudits.length ? citedAudits.length / okAudits.length : 0

  // Competitive delta — the competitor cited by the most engines.
  const compCounts = new Map<string, number>()
  for (const e of okAudits) for (const d of e.competitorDomains) compCounts.set(d, (compCounts.get(d) || 0) + 1)
  let topCompetitor: { domain: string; share: number } | null = null
  for (const [domain, n] of compCounts) {
    const share = okAudits.length ? n / okAudits.length : 0
    if (!topCompetitor || share > topCompetitor.share) topCompetitor = { domain, share }
  }

  const snippet = okAudits.map((e) => e.snippet).find((s) => s) || ''
  const engines = engineAudits.map((e) => e.engine).filter(Boolean)
  const models = engineAudits.map((e) => e.model).filter((m): m is string => Boolean(m))

  // Deterministic stage/country tagging (unchanged from the prior impl).
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

  const cited = citedAudits.length > 0 || brandMentions.length > 0
  const result: VisibilityAuditResult = {
    query,
    engine: engines.join(' + ') || 'cascade',
    model: models.length ? models.join(' + ') : null,
    cited,
    citedUrls,
    brandMentions,
    competitorDomains,
    snippet,
    rawScore: Math.min(1, shareOfVoice),
    shareOfVoice,
    stage,
    country,
    engines: engineAudits,
    topCompetitor,
    actions: [],
  }
  result.actions = buildCitationActions({
    shareOfVoice,
    topCompetitorDomain: topCompetitor?.domain ?? null,
    competitorShare: topCompetitor?.share ?? null,
    cited,
  })
  return result
}

/**
 * Deterministic, prioritized fixes for a low share-of-voice query. Pure — no
 * AI — so the action list is stable and reviewable.
 */
export function buildCitationActions(evidence: {
  shareOfVoice: number
  topCompetitorDomain: string | null
  competitorShare: number | null
  cited: boolean
}): CitationAction[] {
  const out: CitationAction[] = []
  const pct = Math.round((evidence.shareOfVoice || 0) * 100)
  if (!evidence.cited || evidence.shareOfVoice === 0) {
    out.push({ priority: 4, action: 'Add a direct-answer "In 60 seconds" capsule above the fold', evidence: `0/${100} engines cited the estate (share-of-voice ${pct}%) — the page lacks a quotable direct answer` })
    out.push({ priority: 3, action: 'Add FAQPage JSON-LD (4–6 Q&As) matching the exact sub-queries engines ask', evidence: 'No structured answer surface — answer engines default to a bare paragraph' })
    out.push({ priority: 2, action: 'Add 2–3 original statistics / named entities to raise quotability', evidence: 'Answer engines cite concrete, citable facts — this query returned none for the estate' })
    out.push({ priority: 1, action: 'Confirm the page is in llms.txt + sitemap so crawlers can discover it', evidence: 'Undiscovered content cannot be cited' })
  } else if (evidence.shareOfVoice < 1) {
    const top = evidence.topCompetitorDomain
    if (top) {
      out.push({ priority: 3, action: `Outrank ${top} in answer engines for this query`, evidence: `Top competitor ${top} cited by ${Math.round((evidence.competitorShare || 0) * 100)}% of engines vs the estate at ${pct}%` })
    }
    out.push({ priority: 2, action: 'Add the unanswered fan-out sub-queries as H2/H3 + FAQ entries', evidence: `Share-of-voice ${pct}% — some engines still answer this cluster without the estate` })
  } else {
    out.push({ priority: 1, action: 'Sustain: re-audit weekly and watch for competitor drift', evidence: `Share-of-voice ${pct}% — the estate owns this query for now` })
  }
  return out.sort((a, b) => b.priority - a.priority)
}

// ── Audit entry points ──────────────────────────────────────────────────────

/**
 * Run one audit for a single query across the multi-engine matrix. Never
 * throws — returns a partial record with per-engine failures on error.
 */
export async function auditQuery(query: string, engineLabel = 'deepseek', model: string | null = null): Promise<VisibilityAuditResult> {
  const empty: VisibilityAuditResult = {
    query, engine: engineLabel, model, cited: false, citedUrls: [], brandMentions: [],
    competitorDomains: [], snippet: '', rawScore: 0, shareOfVoice: 0, stage: null, country: null,
    engines: [], topCompetitor: null, actions: [],
  }
  const pins = resolveAuditEngines(3)
  if (!pins.length) {
    // No configured engine — try the un-pinned cascade once so the audit still
    // produces something on estates with a minimal provider set.
    try {
      const ai = await generateContentText({ system: AUDIT_SYSTEM_PROMPT, prompt: query, maxTokens: 900, temperature: 0.2 })
      pins.push(ai.provider || 'cascade')
    } catch {
      return empty
    }
  }
  const engineAudits: EngineAudit[] = []
  for (const pin of pins) {
    engineAudits.push(await auditQueryEngine(query, pin))
  }
  if (!engineAudits.length) return empty
  return aggregateEngineAudits(query, engineAudits)
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
    opts.onProgress?.('audit', `Auditing “${q}”…`)
    const result = await auditQuery(q, engine)
    audits.push(result)
    opts.onProgress?.('result', `“${q}” ${result.cited ? 'cited the estate' : 'not cited'}`, result.cited ? result.citedUrls.slice(0, 3).join(' · ') || undefined : undefined)
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
        competitor_domains: result.competitorDomains,
        answer_format: result.engines.map((e) => e.answerFormat).filter(Boolean)[0] ?? null,
        confidence: result.engines.length ? result.engines.reduce((a, e) => a + e.confidence, 0) / result.engines.length : null,
        flags: [...new Set(result.engines.flatMap((e) => e.flags))],
        share_of_voice: result.shareOfVoice,
        top_competitor: result.topCompetitor?.domain ?? null,
        competitor_share: result.topCompetitor?.share ?? null,
        engines_json: result.engines,
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
    // Base feed = prompt-audit bank only. Fan-out sub-query audits are a
    // different population (they roll into the recent-50 window daily and
    // would silently change what the headline share-of-voice means); they
    // surface separately via loadVisibilityByCluster on the same GET.
    const { data } = await supabase
      .from('seo_llm_visibility')
      .select('id,query,engine,model,cited,cited_urls,brand_mentions,snippet,raw_score,stage,country,fan_out,cluster_id,source_field,competitor_domains,answer_format,confidence,flags,share_of_voice,top_competitor,competitor_share,created_at')
      .eq('fan_out', false)
      .order('created_at', { ascending: false })
      .limit(limit)
    const rows = (data as Array<Record<string, unknown>>) || []
    const cited = rows.filter((r) => r.cited).length
    const byStage: Record<string, number> = {}
    for (const r of rows) {
      const s = String(r.stage || 'untagged')
      byStage[s] = (byStage[s] || 0) + 1
      // Deterministic, prioritized fixes derived from the stored evidence —
      // so the audit trail shows WHAT to do about a low share-of-voice, not
      // just that it is low.
      const sov = Number(r.share_of_voice)
      ;(r as Record<string, unknown>).actions = buildCitationActions({
        shareOfVoice: Number.isFinite(sov) ? sov : r.cited ? 1 : 0,
        topCompetitorDomain: r.top_competitor ? String(r.top_competitor) : null,
        competitorShare: Number(r.competitor_share),
        cited: Boolean(r.cited),
      })
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

/**
 * Load measured LLM share-of-voice evidence for a topic/term (best-effort
 * match against audited queries). Feeds scoreMaster's `g_share_of_voice`
 * signal + the competitive-delta recommendation.
 */
export async function loadLlmVisibilityEvidence(term?: string | null): Promise<LlmVisibilityEvidence | null> {
  if (!term) return null
  const normalized = normalizeAuditQuery(term)
  if (normalized.length < 3) return null
  try {
    const supabase = createSupabaseAdminClient()
    const { data } = await supabase
      .from('seo_llm_visibility')
      .select('query,cited,share_of_voice,top_competitor,competitor_share')
      .order('created_at', { ascending: false })
      .limit(200)
    const rows = (data as Array<Record<string, unknown>>) || []
    const matches = rows.filter((r) => {
      const q = normalizeAuditQuery(String(r.query || ''))
      return q && (q === normalized || q.includes(normalized) || normalized.includes(q))
    })
    if (!matches.length) return null
    const cited = matches.filter((r) => r.cited).length
    const total = matches.length
    // Prefer the stored per-row share, else the row aggregate.
    const sovs = matches.map((r) => Number(r.share_of_voice)).filter((n) => Number.isFinite(n))
    const shareOfVoice = sovs.length ? sovs.reduce((a, b) => a + b, 0) / sovs.length : total ? cited / total : null
    const compCounts = new Map<string, { n: number; share: number }>()
    for (const r of matches) {
      const d = String(r.top_competitor || '').trim()
      if (!d) continue
      const cur = compCounts.get(d) || { n: 0, share: 0 }
      cur.n += 1
      const cs = Number(r.competitor_share)
      cur.share += Number.isFinite(cs) ? cs : 0
      compCounts.set(d, cur)
    }
    let topCompetitorDomain: string | null = null
    let competitorShare: number | null = null
    for (const [d, v] of compCounts) {
      const share = v.n ? v.share / v.n : 0
      if (topCompetitorDomain == null || v.n > (compCounts.get(topCompetitorDomain)?.n ?? 0)) {
        topCompetitorDomain = d
        competitorShare = share
      }
    }
    return { cited, total, shareOfVoice, topCompetitorDomain, competitorShare }
  } catch {
    return null
  }
}

// ── Fan-out audit bank (per-cluster sub-queries) ─────────────────────────────
export type FanOutSource = 'primary' | 'faq' | 'related'

export interface FanOutAuditQuery {
  clusterId: string
  primaryTerm: string
  query: string
  source: FanOutSource
}

/** Shape of a cluster-plan row as consumed by the fan-out builder. */
export interface FanOutPlanRow {
  cluster_id?: string | null
  primary_term?: string | null
  related_terms?: unknown
  plan?: unknown
}

/**
 * Build the fan-out audit bank for the top cluster plans: every sub-query an
 * LLM might ask around a cluster's primary term — FAQ questions first (the
 * exact phrasing answer engines quote), then GSC related terms, then the
 * primary term itself. Deterministic, de-duplicated, and capped per plan so
 * the audit batch stays bounded. No AI — pure projection from the plan.
 */
export function buildFanOutAuditQueries(
  plans: FanOutPlanRow[],
  opts: { maxPlans?: number; maxPerPlan?: number } = {},
): FanOutAuditQuery[] {
  const maxPlans = Math.max(1, Math.min(20, opts.maxPlans ?? 10))
  const maxPerPlan = Math.max(2, Math.min(12, opts.maxPerPlan ?? 6))
  const out: FanOutAuditQuery[] = []
  const push = (clusterId: string, primaryTerm: string, query: string, source: FanOutSource, seen: Set<string>) => {
    const q = String(query || '').trim()
    if (!q || q.length < 5) return
    const key = normalizeAuditQuery(q)
    if (seen.has(key)) return
    seen.add(key)
    out.push({ clusterId, primaryTerm: String(primaryTerm || ''), query: q, source })
  }

  for (const p of plans.slice(0, maxPlans)) {
    const seen = new Set<string>()
    const clusterId = String(p.cluster_id || '')
    const primaryTerm = String(p.primary_term || '')
    if (!clusterId || !primaryTerm) continue
    const subBudget = Math.max(1, maxPerPlan - 1)
    let count = 0
    const plan = p.plan as { faq?: string[] } | null | undefined
    const faq = Array.isArray(plan?.faq) ? (plan.faq as string[]) : []
    const related = Array.isArray(p.related_terms)
      ? (p.related_terms as Array<unknown>).map((t) => String(t)).filter(Boolean)
      : []
    for (const q of faq) {
      if (count >= subBudget) break
      push(clusterId, primaryTerm, q, 'faq', seen)
      count += 1
    }
    for (const t of related) {
      if (count >= subBudget) break
      push(clusterId, primaryTerm, t, 'related', seen)
      count += 1
    }
    push(clusterId, primaryTerm, primaryTerm, 'primary', seen)
  }
  return out
}

export interface FanOutAuditRunResult {
  audits: VisibilityAuditResult[]
  clusters: number
  cited: number
  total: number
  shareOfVoice: number
  /** cluster_id → { cited, total } for the aeoGeo family feed. */
  byCluster: Record<string, { cited: number; total: number }>
}

/**
 * Run the fan-out audit batch: build sub-queries from the top cluster plans,
 * audit each against the multi-engine matrix, and persist with cluster
 * provenance. Results are also returned grouped by cluster so the ranking
 * model's aeoGeo family can consume measured (not guessed) fan-out citation
 * evidence.
 */
export async function runFanOutVisibilityAudits(opts: {
  planLimit?: number
  maxPerPlan?: number
  maxAudits?: number
  engineLabel?: string
} = {}): Promise<FanOutAuditRunResult> {
  const engine = opts.engineLabel || 'deepseek'
  const empty: FanOutAuditRunResult = { audits: [], clusters: 0, cited: 0, total: 0, shareOfVoice: 0, byCluster: {} }
  try {
    const { loadPlansDashboard } = await import('./planner')
    const { plans } = await loadPlansDashboard(opts.planLimit || 10)
    const queries = buildFanOutAuditQueries(plans as FanOutPlanRow[], {
      maxPlans: opts.planLimit || 10,
      maxPerPlan: opts.maxPerPlan,
    }).slice(0, Math.min(30, opts.maxAudits ?? 18))
    if (!queries.length) return empty

    const audits: VisibilityAuditResult[] = []
    const byCluster: Record<string, { cited: number; total: number }> = {}
    const supabase = createSupabaseAdminClient()
    for (const fq of queries) {
      const result = await auditQuery(fq.query, engine)
      audits.push(result)
      const cell = byCluster[fq.clusterId] || { cited: 0, total: 0 }
      cell.total += 1
      if (result.cited) cell.cited += 1
      byCluster[fq.clusterId] = cell
      try {
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
          fan_out: true,
          cluster_id: fq.clusterId,
          source_field: fq.source,
          competitor_domains: result.competitorDomains,
          answer_format: result.engines.map((e) => e.answerFormat).filter(Boolean)[0] ?? null,
          confidence: result.engines.length ? result.engines.reduce((a, e) => a + e.confidence, 0) / result.engines.length : null,
          flags: [...new Set(result.engines.flatMap((e) => e.flags))],
          share_of_voice: result.shareOfVoice,
          top_competitor: result.topCompetitor?.domain ?? null,
          competitor_share: result.topCompetitor?.share ?? null,
          engines_json: result.engines,
        })
      } catch {
        // storage best-effort — the audit itself stands
      }
    }
    const cited = audits.filter((a) => a.cited).length
    return {
      audits,
      clusters: Object.keys(byCluster).length,
      cited,
      total: audits.length,
      shareOfVoice: audits.length ? Math.round((cited / audits.length) * 100) : 0,
      byCluster,
    }
  } catch {
    return empty
  }
}

/**
 * Load measured fan-out citation evidence grouped by cluster, for the ranking
 * model's aeoGeo family.
 *
 * Honesty guard: the cap is PER CLUSTER, not global — a cluster's cited/total
 * always reflects ITS OWN most-recent audits, never a window diluted by other
 * clusters' newer rows. Best-effort: returns {} on any failure.
 */
export async function loadVisibilityByCluster(perCluster = 12, maxClusters = 50): Promise<Record<string, { cited: number; total: number }>> {
  try {
    const supabase = createSupabaseAdminClient()
    const { data: clusters } = await supabase
      .from('seo_llm_visibility')
      .select('cluster_id')
      .eq('fan_out', true)
      .not('cluster_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(maxClusters)
    const ids = [...new Set(((clusters as Array<{ cluster_id: string | null }>) || []).map((r) => String(r.cluster_id || '')).filter(Boolean))]
    const byCluster: Record<string, { cited: number; total: number }> = {}
    for (const id of ids) {
      const { data: rows } = await supabase
        .from('seo_llm_visibility')
        .select('cluster_id,cited')
        .eq('cluster_id', id)
        .eq('fan_out', true)
        .order('created_at', { ascending: false })
        .limit(perCluster)
      for (const r of (rows as Array<{ cited: boolean | null }>) || []) {
        const cell = byCluster[id] || { cited: 0, total: 0 }
        cell.total += 1
        if (r.cited) cell.cited += 1
        byCluster[id] = cell
      }
    }
    return byCluster
  } catch {
    return {}
  }
}
