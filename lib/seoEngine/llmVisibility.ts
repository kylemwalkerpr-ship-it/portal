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

import { createSupabaseAdminClient, getSupabaseAdminClient } from '@/lib/supabase'
import { generateContentText } from '@/lib/contentAiProvider'
import { isAuthoritativeOwnershipRow, listRegistry, type OwnershipRow } from '@/lib/seoFactory/ownership'
import {
  COMMISSIONED_PROVIDERS,
  LANE_DEFAULT_PIN,
  commissionedProvider,
  type CommissionedProviderPin,
} from '@/lib/contentAiRegistry'
import {
  scoreAuditCandidates,
  selectAuditQueries,
  type QueryCandidate,
} from './auditQuerySelector'
import { loadKnowledgeFeed } from './knowledge'
import { loadPlansDashboard } from './planner'
import type { FunnelActionKind } from './rankingModel'
import {
  P11_AUDIT_CONTRACT_VERSION,
  P11_PROMPT_ID,
  P11_PROMPT_VERSION,
  classifyCitationUrl,
  resolveStrategicAuditTarget,
  selectStrategicAuditTargets,
  summarizeProviderAttempts,
  type CitationClassification,
  type ClassifiedCitation,
  type GeoAuditStatus,
  type GeoCoverageSummary,
  type GeoProviderAttempt,
  type StrategicAuditTarget,
} from './geoVisibilityTruth'

/** The estate's observable surface — everything we want LLMs to cite. */
export const ESTATE_DOMAINS: string[] = [
  'yousafeconsultancy.com',
  'legal.yousafeconsultancy.com',
  'usa.yousafeconsultancy.com',
  'uk.yousafeconsultancy.com',
  'ca.yousafeconsultancy.com',
  'au.yousafeconsultancy.com',
  // Public Marketplace host — legitimate citation surface.
  'market.yousafeconsultancy.com',
  // Portal remains a legitimate Portal/auth surface (never a Marketplace canonical).
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
  /** Answer engines per query. Masthead uses 2 so a 90–180s tape can finish. */
  maxEngines?: number
  /** Live progress callback for streaming surfaces (phase, message, detail). */
  onProgress?: (phase: string, message: string, detail?: string) => void
}

/** Per-engine cap — content drafting allows 180s; an audit ping must not. */
export const AUDIT_ENGINE_TIMEOUT_MS = 14_000

/**
 * Build the live audit slate from planner + knowledge + prior visibility
 * records. Explicit `queries` from the caller still win.
 */
export async function assembleAuditQueryPool(limit: number): Promise<{
  queries: string[]
  picked: QueryCandidate[]
}> {
  const fallback = () => {
    const picked = selectAuditQueries(scoreAuditCandidates({ seeds: DEFAULT_AUDIT_QUERIES }), limit)
    return { queries: picked.map((p) => p.query), picked }
  }
  try {
  const supabase = getSupabaseAdminClient()
  const [plansDash, knowledge, priorRes] = await Promise.all([
    loadPlansDashboard(24).catch(() => ({ plans: [] as Array<Record<string, unknown>> })),
    loadKnowledgeFeed(24).catch(() => ({ items: [] as Array<Record<string, unknown>> })),
    supabase
      .from('seo_llm_visibility')
      .select('query,cited,share_of_voice,flags,engines_json,created_at')
      .eq('fan_out', false)
      .order('created_at', { ascending: false })
      .limit(240),
  ])

  const plans = (plansDash.plans || []).map((p) => {
    const plan = (p.plan && typeof p.plan === 'object') ? p.plan as { faq?: unknown } : null
    const faq = Array.isArray(plan?.faq) ? plan.faq.map(String) : []
    const related = Array.isArray(p.related_terms) ? (p.related_terms as unknown[]).map(String) : []
    return {
      primaryTerm: String(p.primary_term || ''),
      relatedTerms: related,
      faq,
      opportunityScore: Number(p.opportunity_score) || 0,
      impressions: Number(p.est_monthly_impressions) || 0,
    }
  })

  const priorAudits = ((priorRes.data || []) as Array<Record<string, unknown>>)
    .filter((row) => !isFailedVisibilityRow(row))
    .map((r) => ({
      query: String(r.query || ''),
      cited: Boolean(r.cited),
      shareOfVoice: r.share_of_voice == null
        ? (r.cited ? 1 : 0)
        : Number(r.share_of_voice) || 0,
      createdAt: String(r.created_at || ''),
    }))

  const knowledgeTitles = (knowledge.items || []).map((i) => String(i.title || '')).filter(Boolean)
  const scored = scoreAuditCandidates({
    seeds: DEFAULT_AUDIT_QUERIES,
    plans,
    knowledgeTitles,
    priorAudits,
  })
  const picked = selectAuditQueries(scored, limit)
  return { queries: picked.map((p) => p.query), picked }
  } catch {
    return fallback()
  }
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
  /** P11 closed audit state. Optional only for legacy in-memory/test compatibility. */
  status?: GeoAuditStatus
  failureReason?: string | null
  cited: boolean
  citedUrls: string[]
  competitorDomains: string[]
  answerFormat: string | null
  snippet: string
  confidence: number
  flags: string[]
  rawCitedUrls?: string[]
  normalizedCitedUrls?: string[]
  citationClassifications?: ClassifiedCitation[]
  competitorCitedUrls?: string[]
}

export interface P11AuditEvidence {
  contractVersion: typeof P11_AUDIT_CONTRACT_VERSION
  target: StrategicAuditTarget | null
  promptId: typeof P11_PROMPT_ID
  promptVersion: typeof P11_PROMPT_VERSION
  startedAt: string
  completedAt: string
  auditStatus: GeoAuditStatus
  failureReason: string | null
  citationExtractionStatus: 'success' | 'partial' | 'parse_failure' | 'unavailable' | 'blocked'
  rawCitedUrls: string[]
  normalizedCitedUrls: string[]
  citationClassifications: ClassifiedCitation[]
  competitorCitedUrls: string[]
  coverage: GeoCoverageSummary
}

/** A deterministic, prioritized fix for a low share-of-voice query. */
export interface CitationAction {
  priority: number
  action: string
  evidence: string
  /** Funnel taxonomy kind (Phase 2b) — UI renders FUNNEL_ACTION_LABELS. */
  actionKind?: FunnelActionKind
  /**
   * Honest expected USD/month — present ONLY when real GSC impressions were
   * observed AND a stage/country cell is resolvable. Never fabricated: audits
   * without impression data omit this field entirely (see buildCitationActions).
   */
  expectedRevenue?: { usdPerMonth: number; note: string }
}

/** Aggregated per-query result across all engines in the matrix. */
export type VisibilityMeasurementState = 'measured' | 'unavailable'

export interface P11VisibilityReportRow {
  audit_contract_version?: unknown
  ownership_row_id?: unknown
  audit_status?: unknown
  stage?: unknown
  created_at?: unknown
  coverage?: unknown
}

export interface P11VisibilityReporting {
  contractVersion: typeof P11_AUDIT_CONTRACT_VERSION
  queryRows: number
  attempted: number
  successful: number
  providerUnavailable: number
  providerFailure: number
  parseFailure: number
  blocked: number
  unknown: number
  citedSuccessful: number
  successfulWithAuthoritativeCitation: number
  successfulWithOtherCurrentYouSafeCitation: number
  successfulWithWrongOrRetiredYouSafeCitation: number
  successfulWithCompetitorCitation: number
  successfulWithNoExtractableCitation: number
  shareOfVoice: number | null
  measurementState: VisibilityMeasurementState
  legacyRows: number
  auditedAuthoritativeOwners: number
  authoritativeOwnerCount: number
  ownerCoveragePercent: number | null
}
function coverageCount(value: unknown, key: keyof GeoCoverageSummary): number {
  if (!value || typeof value !== 'object') return 0
  const n = Number((value as Record<string, unknown>)[key])
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

export function aggregateP11VisibilityReport(
  rows: P11VisibilityReportRow[],
  opts: { legacyRows: number; authoritativeOwnerCount: number },
): P11VisibilityReporting {
  const p11Rows = rows.filter((row) => row.audit_contract_version === P11_AUDIT_CONTRACT_VERSION)
  const sum = (key: keyof GeoCoverageSummary) => p11Rows.reduce((total, row) => total + coverageCount(row.coverage, key), 0)
  const attempted = sum('attempted')
  const successful = sum('successful')
  const citedSuccessful = sum('citedSuccessful')
  const owners = new Set(
    p11Rows.map((row) => Number(row.ownership_row_id)).filter((id) => Number.isInteger(id) && id > 0),
  )
  const authoritativeOwnerCount = Math.max(0, Math.floor(Number(opts.authoritativeOwnerCount) || 0))
  return {
    contractVersion: P11_AUDIT_CONTRACT_VERSION,
    queryRows: p11Rows.length,
    attempted,
    successful,
    providerUnavailable: sum('providerUnavailable'),
    providerFailure: sum('providerFailure'),
    parseFailure: sum('parseFailure'),
    blocked: sum('blocked'),
    unknown: sum('unknown'),
    citedSuccessful,
    successfulWithAuthoritativeCitation: sum('successfulWithAuthoritativeCitation'),
    successfulWithOtherCurrentYouSafeCitation: sum('successfulWithOtherCurrentYouSafeCitation'),
    successfulWithWrongOrRetiredYouSafeCitation: sum('successfulWithWrongOrRetiredYouSafeCitation'),
    successfulWithCompetitorCitation: sum('successfulWithCompetitorCitation'),
    successfulWithNoExtractableCitation: sum('successfulWithNoExtractableCitation'),
    shareOfVoice: successful ? Math.round((citedSuccessful / successful) * 100) : null,
    measurementState: successful ? 'measured' : 'unavailable',
    legacyRows: Math.max(0, Math.floor(Number(opts.legacyRows) || 0)),
    auditedAuthoritativeOwners: owners.size,
    authoritativeOwnerCount,
    ownerCoveragePercent: authoritativeOwnerCount ? Math.round((owners.size / authoritativeOwnerCount) * 100) : null,
  }
}

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
  /** Fraction of successful engines that cited the estate (0–1); null when none succeeded. */
  shareOfVoice: number | null
  /** Explicitly distinguishes an engine outage/setup failure from a genuine 0% citation result. */
  measurementState: VisibilityMeasurementState
  stage: string | null
  country: string | null
  engines: EngineAudit[]
  topCompetitor: { domain: string; share: number } | null
  actions: CitationAction[]
  /** Present only for the versioned P11 ownership-aware evidence plane. */
  p11?: P11AuditEvidence
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

function hasAuditFailedFlag(flags: unknown): boolean {
  return Array.isArray(flags) && flags.some((flag) => String(flag) === 'audit_failed')
}

/**
 * Read-side compatibility guard. New writes carry `audit_failed`; older v3
 * rows may only reveal an outage through engines_json. Never reinterpret a
 * legacy row with no engine matrix as failed — only an explicit failure signal
 * is excluded.
 */
export function isFailedVisibilityRow(row: Record<string, unknown>): boolean {
  if (hasAuditFailedFlag(row.flags)) return true
  if (!Array.isArray(row.engines_json)) return false
  const engines = row.engines_json as Array<Record<string, unknown>>
  return engines.length === 0 || !engines.some((engine) => engine?.ok === true)
}

function failedAuditResult(result: VisibilityAuditResult): boolean {
  return result.measurementState === 'unavailable' || !result.engines.some((engine) => engine.ok)
}

function persistenceFlags(result: VisibilityAuditResult): string[] {
  return [...new Set([
    ...result.engines.flatMap((engine) => engine.flags),
    ...(failedAuditResult(result) ? ['audit_failed'] : []),
  ])]
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
  extractionStatus: 'success' | 'parse_failure'
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
      return { answer, answerFormat: format, sources, confidence, flags, extractionStatus: 'success' }
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
    extractionStatus: 'parse_failure',
  }
}

// ── Engine matrix ───────────────────────────────────────────────────────────

interface AuditEngineCandidate {
  pin: CommissionedProviderPin
  label: string
  configured: () => boolean
}

/** Answer engines the estate can actually query — the two commissioned
 *  providers only (design §3.1). Deduped by model family so the matrix
 *  measures DISTINCT engines, not the same model twice. No retired
 *  candidate can ever appear. */
function auditEngineCandidates(): AuditEngineCandidate[] {
  return COMMISSIONED_PROVIDERS.map((provider) => ({
    pin: provider.pin,
    label: provider.pin,
    configured: () => provider.isConfigured(),
  }))
}

/**
 * Resolve up to `maxEngines` configured commissioned answer engines (distinct
 * family per slot). Returns [] when nothing is configured — the caller then
 * runs the un-pinned lane default so an audit still executes (recorded
 * `pinSource:'lane_default'`), never a retired cascade.
 */
export function resolveAuditEngines(maxEngines = 3): CommissionedProviderPin[] {
  const out: CommissionedProviderPin[] = []
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
async function auditQueryEngine(
  query: string,
  pin: string,
  target: StrategicAuditTarget | null = null,
  registryRows: OwnershipRow[] = [],
  configured = true,
): Promise<EngineAudit> {
  if (!configured) {
    return {
      engine: pin,
      model: null,
      ok: false,
      status: 'provider_unavailable',
      failureReason: 'commissioned provider is not configured',
      cited: false,
      citedUrls: [],
      competitorDomains: [],
      answerFormat: null,
      snippet: '',
      confidence: 0,
      flags: ['provider_unavailable'],
      rawCitedUrls: [],
      normalizedCitedUrls: [],
      citationClassifications: [],
      competitorCitedUrls: [],
    }
  }
  const fail = (flags: string[], confidence = 0): EngineAudit => ({
    engine: pin,
    model: null,
    ok: false,
    status: 'provider_failure',
    failureReason: flags[0] || 'provider failure',
    cited: false,
    citedUrls: [],
    competitorDomains: [],
    answerFormat: null,
    snippet: '',
    confidence,
    flags,
    rawCitedUrls: [],
    normalizedCitedUrls: [],
    citationClassifications: [],
    competitorCitedUrls: [],
  })
  try {
    const ai = await generateContentText({
      aiProvider: pin,
      exclusive: true,
      skipQualityContract: true,
      strictTimeout: true,
      timeoutMs: AUDIT_ENGINE_TIMEOUT_MS,
      system: AUDIT_SYSTEM_PROMPT,
      prompt: query,
      maxTokens: 900,
      temperature: 0.2,
    })
    const text = (ai.text || '').trim()
    const parsed = parseAuditResponse(text)
    const classifications = target
      ? parsed.sources.map((source) => classifyCitationUrl(source.url, target, registryRows))
      : []
    const currentClasses = new Set<CitationClassification>([
      'current_authoritative_owner',
      'current_support_page',
      'current_estate_other',
    ])
    const estateSources = target
      ? classifications.filter((entry) => currentClasses.has(entry.classification))
      : parsed.sources.filter((source) => source.isEstate).map((source) => ({
          rawUrl: source.url,
          normalizedUrl: source.url,
          classification: 'current_estate_other' as const,
          matchedOwnershipRowId: null,
        }))
    const competitorEntries = target
      ? classifications.filter((entry) => entry.classification === 'competitor')
      : parsed.sources.filter((source) => !source.isEstate).map((source) => ({
          rawUrl: source.url,
          normalizedUrl: source.url,
          classification: 'competitor' as const,
          matchedOwnershipRowId: null,
        }))
    const competitors = competitorEntries
      .map((entry) => entry.normalizedUrl ? domainOf(entry.normalizedUrl) : '')
      .filter(Boolean)
    const parseFailed = parsed.extractionStatus === 'parse_failure'
    const rawCitedUrls = parsed.sources.map((source) => source.url)
    const normalizedCitedUrls = classifications.length
      ? classifications.map((entry) => entry.normalizedUrl).filter((url): url is string => Boolean(url))
      : rawCitedUrls
    return {
      engine: ai.provider || pin,
      model: ai.model || null,
      ok: !parseFailed,
      status: parseFailed ? 'parse_failure' : 'success',
      failureReason: parseFailed ? 'structured citation response could not be parsed' : null,
      cited: !parseFailed && estateSources.length > 0,
      citedUrls: estateSources.map((entry) => entry.normalizedUrl || entry.rawUrl),
      competitorDomains: [...new Set(competitors)],
      answerFormat: parsed.answerFormat,
      snippet: parsed.answer.replace(/\s+/g, ' ').slice(0, 500),
      confidence: parsed.confidence,
      flags: parsed.flags,
      rawCitedUrls,
      normalizedCitedUrls: [...new Set(normalizedCitedUrls)],
      citationClassifications: classifications,
      competitorCitedUrls: [...new Set(competitorEntries.map((entry) => entry.normalizedUrl || entry.rawUrl))],
    }
  } catch (e) {
    return fail(['engine_error: ' + (e instanceof Error ? e.message.slice(0, 120) : 'unknown')])
  }
}

/** Aggregate per-engine audits into one per-query VisibilityAuditResult. */
export function aggregateEngineAudits(query: string, engineAudits: EngineAudit[]): VisibilityAuditResult {
  const okAudits = engineAudits.filter((e) => e.ok && (e.status == null || e.status === 'success'))
  const citedAudits = okAudits.filter((e) => e.cited)
  const citedUrls = [...new Set(okAudits.flatMap((e) => e.citedUrls))]
  const brandMentions = BRAND_MENTIONS.filter((b) => okAudits.some((e) => e.snippet.toLowerCase().includes(b.toLowerCase())))
  const competitorDomains = [...new Set(okAudits.flatMap((e) => e.competitorDomains))]
  const shareOfVoice = okAudits.length ? citedAudits.length / okAudits.length : null
  const measurementState: VisibilityMeasurementState = okAudits.length ? 'measured' : 'unavailable'

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

  // Brand mentions remain observable metadata, but P11 citation truth requires a cited current-estate URL.
  const cited = citedAudits.length > 0
  const result: VisibilityAuditResult = {
    query,
    engine: engines.join(' + ') || 'cascade',
    model: models.length ? models.join(' + ') : null,
    cited,
    citedUrls,
    brandMentions,
    competitorDomains,
    snippet,
    rawScore: shareOfVoice == null ? 0 : Math.min(1, shareOfVoice),
    shareOfVoice,
    measurementState,
    stage,
    country,
    engines: engineAudits,
    topCompetitor,
    actions: [],
  }
  result.actions = shareOfVoice == null ? [] : buildCitationActions({
    shareOfVoice,
    topCompetitorDomain: topCompetitor?.domain ?? null,
    competitorShare: topCompetitor?.share ?? null,
    cited,
    stage,
    country,
  })
  return result
}

function engineAuditToGeoAttempt(engine: EngineAudit): GeoProviderAttempt {
  const status: GeoAuditStatus = engine.status ?? (engine.ok ? 'success' : 'provider_failure')
  return {
    provider: engine.engine,
    model: engine.model,
    status,
    failureReason: engine.failureReason ?? null,
    rawCitedUrls: engine.rawCitedUrls ?? [],
    normalizedCitedUrls: engine.normalizedCitedUrls ?? [],
    citationClassifications: engine.citationClassifications ?? [],
    competitorCitedUrls: engine.competitorCitedUrls ?? [],
    flags: engine.flags,
  }
}

function p11OverallStatus(coverage: GeoCoverageSummary): GeoAuditStatus {
  if (coverage.successful > 0) return 'success'
  if (coverage.attempted === 0) return 'unknown'
  if (coverage.providerUnavailable === coverage.attempted) return 'provider_unavailable'
  if (coverage.providerFailure === coverage.attempted) return 'provider_failure'
  if (coverage.parseFailure === coverage.attempted) return 'parse_failure'
  return 'unknown'
}

function p11Evidence(
  target: StrategicAuditTarget,
  engines: EngineAudit[],
  startedAt: string,
  completedAt: string,
): P11AuditEvidence {
  const attempts = engines.map(engineAuditToGeoAttempt)
  const coverage = summarizeProviderAttempts(attempts)
  const auditStatus = p11OverallStatus(coverage)
  const rawCitedUrls = [...new Set(attempts.flatMap((attempt) => attempt.rawCitedUrls))]
  const normalizedCitedUrls = [...new Set(attempts.flatMap((attempt) => attempt.normalizedCitedUrls))]
  const citationClassifications = attempts.flatMap((attempt) => attempt.citationClassifications)
  const competitorCitedUrls = [...new Set(attempts.flatMap((attempt) => attempt.competitorCitedUrls))]
  const failedAttempts = attempts.filter((attempt) => attempt.status !== 'success')
  const failureReason = auditStatus === 'success'
    ? null
    : [...new Set(failedAttempts.map((attempt) => attempt.failureReason || attempt.status))].join(' | ') || null
  const citationExtractionStatus: P11AuditEvidence['citationExtractionStatus'] = coverage.successful > 0
    ? (failedAttempts.length ? 'partial' : 'success')
    : coverage.parseFailure > 0
      ? 'parse_failure'
      : 'unavailable'
  return {
    contractVersion: P11_AUDIT_CONTRACT_VERSION,
    target,
    promptId: P11_PROMPT_ID,
    promptVersion: P11_PROMPT_VERSION,
    startedAt,
    completedAt,
    auditStatus,
    failureReason,
    citationExtractionStatus,
    rawCitedUrls,
    normalizedCitedUrls,
    citationClassifications,
    competitorCitedUrls,
    coverage,
  }
}

async function auditStrategicTarget(
  target: StrategicAuditTarget,
  registryRows: OwnershipRow[],
  maxEngines: number,
): Promise<VisibilityAuditResult> {
  const startedAt = new Date().toISOString()
  const candidates = auditEngineCandidates().slice(0, Math.max(1, Math.min(3, maxEngines)))
  const engines = await Promise.all(candidates.map((candidate) => {
    let configured = false
    try {
      configured = candidate.configured()
    } catch {
      configured = false
    }
    return auditQueryEngine(target.query, candidate.pin, target, registryRows, configured)
  }))
  const result = aggregateEngineAudits(target.query, engines)
  if (target.jurisdiction !== 'GLOBAL' && target.jurisdiction !== 'UNKNOWN') result.country = target.jurisdiction
  result.p11 = p11Evidence(target, engines, startedAt, new Date().toISOString())
  return result
}

function blockedP11Result(query: string): VisibilityAuditResult {
  const now = new Date().toISOString()
  const coverage: GeoCoverageSummary = {
    ...summarizeProviderAttempts([]),
    blocked: 1,
  }
  return {
    query,
    engine: 'blocked',
    model: null,
    cited: false,
    citedUrls: [],
    brandMentions: [],
    competitorDomains: [],
    snippet: '',
    rawScore: 0,
    shareOfVoice: null,
    measurementState: 'unavailable',
    stage: null,
    country: null,
    engines: [],
    topCompetitor: null,
    actions: [],
    p11: {
      contractVersion: P11_AUDIT_CONTRACT_VERSION,
      target: null,
      promptId: P11_PROMPT_ID,
      promptVersion: P11_PROMPT_VERSION,
      startedAt: now,
      completedAt: now,
      auditStatus: 'blocked',
      failureReason: 'no authoritative strategic owner for query',
      citationExtractionStatus: 'blocked',
      rawCitedUrls: [],
      normalizedCitedUrls: [],
      citationClassifications: [],
      competitorCitedUrls: [],
      coverage,
    },
  }
}

/**
 * P11 remediation starts with measured evidence, not generic content edits.
 * A citation loss alone can justify research/review, but not generic discovery
 * files, a sibling page, or invented revenue impact.
 */
export function buildCitationActions(evidence: {
  shareOfVoice: number
  topCompetitorDomain: string | null
  competitorShare: number | null
  cited: boolean
  stage?: string | null
  country?: string | null
  impressions?: number | null
}): CitationAction[] {
  const pct = Math.round((evidence.shareOfVoice || 0) * 100)
  if (evidence.shareOfVoice >= 1 && evidence.cited) {
    return [{
      priority: 1,
      action: 'Sustain the authoritative owner and re-audit for citation drift',
      evidence: `Successful-provider citation share is ${pct}% for this query`,
    }]
  }

  const actions: CitationAction[] = []
  if (evidence.topCompetitorDomain) {
    actions.push({
      priority: 3,
      action: `Research why ${evidence.topCompetitorDomain} was cited before changing the authoritative owner`,
      evidence: `Measured competitor citation evidence exists while current-estate citation share is ${pct}%`,
    })
  } else {    actions.push({
      priority: 3,
      action: 'Inspect successful audit evidence before changing the authoritative owner',
      evidence: `Current-estate citation share is ${pct}%, but no concrete competitor/source gap is yet established`,
    })
  }
  actions.push({
    priority: 2,
    action: 'Review the existing authoritative owner against cited evidence for answer structure, source freshness, and internal authority',
    evidence: 'P11 permits edits only after measured citation evidence identifies the actual deficit',
  })
  return actions
}

// ── Audit entry points ──────────────────────────────────────────────────────

/** Recorded label for the un-pinned lane default (registry-owned). */
const DEFAULT_AUDIT_ENGINE_LABEL = commissionedProvider(LANE_DEFAULT_PIN).pin

/**
 * Run one audit for a single query across the multi-engine matrix. Never
 * throws — returns a partial record with per-engine failures on error.
 */
export async function auditQuery(query: string, engineLabel: string = DEFAULT_AUDIT_ENGINE_LABEL, model: string | null = null, maxEngines = 2): Promise<VisibilityAuditResult> {
  const empty: VisibilityAuditResult = {
    query, engine: engineLabel, model, cited: false, citedUrls: [], brandMentions: [],
    competitorDomains: [], snippet: '', rawScore: 0, shareOfVoice: null, measurementState: 'unavailable', stage: null, country: null,
    engines: [], topCompetitor: null, actions: [],
  }
  let pins: string[] = resolveAuditEngines(Math.max(1, Math.min(3, maxEngines)))
  if (!pins.length) {
    // No commissioned engine configured — run the un-pinned lane default once
    // so the audit still produces something on estates with a minimal
    // provider set. The core records `pinSource:'lane_default'`; nothing
    // retired can be selected here.
    try {
      const ai = await generateContentText({
        system: AUDIT_SYSTEM_PROMPT,
        prompt: query,
        maxTokens: 900,
        temperature: 0.2,
        skipQualityContract: true,
        strictTimeout: true,
        timeoutMs: AUDIT_ENGINE_TIMEOUT_MS,
      })
      pins = [ai.provider || LANE_DEFAULT_PIN]
    } catch {
      return empty
    }
  }
  const engineAudits = await Promise.all(pins.map((pin) => auditQueryEngine(query, pin)))
  if (!engineAudits.length) return empty
  return aggregateEngineAudits(query, engineAudits)
}

/** Run a batch of ownership-bound P11 audits and persist to seo_llm_visibility. */
export async function runVisibilityAudits(opts: VisibilityAuditOptions = {}): Promise<{
  audits: VisibilityAuditResult[]
  cited: number
  /** Successful/measured query audits — the legacy query-level denominator. */
  total: number
  /** All attempted strategic query audits, including blocked/provider failures. */
  attempted: number
  failed: number
  /** Successful provider attempts across the P11 batch — the citation-share denominator. */
  successfulProviderAttempts: number
  /** Successful provider attempts that cited a current YouSafe estate URL. */
  citedSuccessfulProviderAttempts: number
  shareOfVoice: number | null
  measurementState: VisibilityMeasurementState
  engine: string
  selected?: Array<{ query: string; source: string; score: number; reasons: string[] }>
  remediations?: import('./citationRemediation').CitationRemediation[]
}> {
  const cap = Math.min(15, opts.maxAudits ?? 10)
  const maxEngines = Math.max(1, Math.min(3, opts.maxEngines ?? 2))
  const explicitQueries = (opts.queries || []).map(String).map((query) => query.trim()).filter(Boolean).slice(0, cap)
  let registryRows: OwnershipRow[] = []
  try {
    registryRows = await listRegistry()
  } catch {
    registryRows = []
  }

  const work: Array<{ query: string; target: StrategicAuditTarget | null }> = []
  let selected: Array<{ query: string; source: string; score: number; reasons: string[] }> = []
  if (explicitQueries.length) {
    for (const query of explicitQueries) {
      work.push({ query, target: resolveStrategicAuditTarget(query, registryRows) })
    }
  } else {
    const targets = selectStrategicAuditTargets(registryRows, cap)
    for (const target of targets) work.push({ query: target.query, target })
    selected = targets.map((target) => ({
      query: target.query,
      source: 'ownership',
      score: 100,
      reasons: [
        `authoritative owner row ${target.ownershipRowId}`,
        target.authoritativeOwnerUrl,
        `${target.jurisdiction}/${target.readerIntent}`,
      ],
    }))
    opts.onProgress?.(
      'think',
      `Selected ${targets.length} authoritative strategic ownership queries`,
      selected.slice(0, 3).map((item) => item.query).join(' · ') || undefined,
    )
  }

  const engine = opts.engineLabel || DEFAULT_AUDIT_ENGINE_LABEL
  const audits: VisibilityAuditResult[] = []
  const runId = globalThis.crypto.randomUUID()

  for (const item of work) {
    const { query, target } = item
    opts.onProgress?.(
      'audit',
      target ? `Auditing “${query}”…` : `Blocking unowned query “${query}”…`,
      target?.authoritativeOwnerUrl,
    )
    const result = target
      ? await auditStrategicTarget(target, registryRows, maxEngines)
      : blockedP11Result(query)
    audits.push(result)
    const p11 = result.p11
    opts.onProgress?.(
      'result',
      `“${query}” ${p11?.auditStatus === 'success' ? (result.cited ? 'cited current YouSafe estate' : 'returned no current YouSafe citation') : p11?.auditStatus || 'unknown'}`,
      result.cited ? result.citedUrls.slice(0, 3).join(' · ') || undefined : p11?.failureReason || undefined,
    )

    const flags = persistenceFlags(result)
    const successfulEngines = result.engines.filter((attempt) => attempt.ok && (attempt.status == null || attempt.status === 'success'))
    try {
      const supabase = getSupabaseAdminClient()
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
        answer_format: successfulEngines.map((attempt) => attempt.answerFormat).filter(Boolean)[0] ?? null,
        confidence: successfulEngines.length
          ? successfulEngines.reduce((sum, attempt) => sum + attempt.confidence, 0) / successfulEngines.length
          : null,
        flags,
        share_of_voice: result.shareOfVoice,
        top_competitor: result.topCompetitor?.domain ?? null,
        competitor_share: result.topCompetitor?.share ?? null,
        engines_json: result.engines,
        audit_contract_version: p11?.contractVersion ?? P11_AUDIT_CONTRACT_VERSION,
        run_id: runId,
        ownership_row_id: p11?.target?.ownershipRowId ?? null,
        query_family: p11?.target?.queryFamily ?? null,
        strategic_intent: p11?.target?.strategicIntent ?? null,
        reader_intent: p11?.target?.readerIntent ?? null,
        jurisdiction: p11?.target?.jurisdiction ?? null,
        authoritative_owner_url: p11?.target?.authoritativeOwnerUrl ?? null,
        owner_host: p11?.target?.ownerHost ?? null,
        prompt_id: p11?.promptId ?? P11_PROMPT_ID,
        prompt_version: p11?.promptVersion ?? P11_PROMPT_VERSION,
        audit_status: p11?.auditStatus ?? 'unknown',
        failure_reason: p11?.failureReason ?? null,
        citation_extraction_status: p11?.citationExtractionStatus ?? 'unavailable',
        raw_cited_urls: p11?.rawCitedUrls ?? [],
        normalized_cited_urls: p11?.normalizedCitedUrls ?? [],
        citation_classifications: p11?.citationClassifications ?? [],
        competitor_cited_urls: p11?.competitorCitedUrls ?? [],
        coverage: p11?.coverage ?? summarizeProviderAttempts([]),
        started_at: p11?.startedAt ?? new Date().toISOString(),
        completed_at: p11?.completedAt ?? new Date().toISOString(),
      })
    } catch {
      // Storage remains best-effort; a failed insert must not rewrite the audit truth.
    }
  }

  const measuredAudits = audits.filter((audit) => !failedAuditResult(audit))
  const cited = measuredAudits.filter((audit) => audit.cited).length
  const attempted = audits.length
  const failed = attempted - measuredAudits.length
  const total = measuredAudits.length
  const providerSuccessful = audits.reduce((sum, audit) => sum + (audit.p11?.coverage.successful ?? 0), 0)
  const providerCitedSuccessful = audits.reduce((sum, audit) => sum + (audit.p11?.coverage.citedSuccessful ?? 0), 0)
  let remediations: import('./citationRemediation').CitationRemediation[] = []
  try {
    const { remediateVisibilityAudits } = await import('./citationRemediation')
    remediations = await remediateVisibilityAudits(measuredAudits.map((audit) => ({
      query: audit.query,
      cited: audit.cited,
      shareOfVoice: audit.shareOfVoice,
      topCompetitor: audit.topCompetitor?.domain ?? null,
      competitorShare: audit.topCompetitor?.share ?? null,
      stage: audit.stage,
      country: audit.country,
      actions: audit.actions,
      authoritativeOwnerUrl: audit.p11?.target?.authoritativeOwnerUrl ?? null,
      ownershipRowId: audit.p11?.target?.ownershipRowId ?? null,
      competitorCitedUrls: audit.p11?.competitorCitedUrls ?? [],
      citationClassifications: audit.p11?.citationClassifications ?? [],
    })))
  } catch {
    remediations = []
  }
  return {
    audits,
    cited,
    total,
    attempted,
    failed,
    successfulProviderAttempts: providerSuccessful,
    citedSuccessfulProviderAttempts: providerCitedSuccessful,
    shareOfVoice: providerSuccessful ? Math.round((providerCitedSuccessful / providerSuccessful) * 100) : null,
    measurementState: providerSuccessful ? 'measured' : 'unavailable',
    engine,
    selected,
    remediations,
  }
}

const P11_REPORTING_ROW_LIMIT = 5000

async function exactVisibilityCount(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  contractVersion?: string,
): Promise<number | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = supabase.from('seo_llm_visibility').select('id', { count: 'exact', head: true }).eq('fan_out', false)
    if (contractVersion) query = query.eq('audit_contract_version', contractVersion)
    const { count } = await query
    return typeof count === 'number' ? count : null
  } catch {
    return null
  }
}

export async function loadVisibilityFeed(limit = 50): Promise<{
  audits: Array<Record<string, unknown>>
  shareOfVoice: number | null
  measurementState: VisibilityMeasurementState
  cited: number
  total: number
  attempted: number
  failed: number
  byStage: Record<string, number>
  reporting: P11VisibilityReporting
  reportingTruncated: boolean
  remediations: import('./citationRemediation').CitationRemediation[]
}> {
  const emptyReporting = aggregateP11VisibilityReport([], { legacyRows: 0, authoritativeOwnerCount: 0 })
  try {
    const supabase = getSupabaseAdminClient()
    const [{ data, error }, totalRows, p11RowsExact, registryRows] = await Promise.all([
      supabase
        .from('seo_llm_visibility')
        .select('id,query,engine,model,cited,cited_urls,brand_mentions,snippet,raw_score,stage,country,fan_out,competitor_domains,answer_format,confidence,flags,share_of_voice,top_competitor,competitor_share,created_at,audit_contract_version,ownership_row_id,authoritative_owner_url,audit_status,failure_reason,citation_extraction_status,raw_cited_urls,normalized_cited_urls,citation_classifications,competitor_cited_urls,coverage')
        .eq('fan_out', false)
        .eq('audit_contract_version', P11_AUDIT_CONTRACT_VERSION)
        .order('created_at', { ascending: false })
        .limit(P11_REPORTING_ROW_LIMIT),
      exactVisibilityCount(supabase),
      exactVisibilityCount(supabase, P11_AUDIT_CONTRACT_VERSION),
      listRegistry().catch(() => [] as OwnershipRow[]),
    ])
    if (error) throw error
    const rows = ((data as Array<Record<string, unknown>>) || [])
    const legacyRows = totalRows == null || p11RowsExact == null ? 0 : Math.max(0, totalRows - p11RowsExact)
    const authoritativeOwnerCount = registryRows.filter(isAuthoritativeOwnershipRow).length
    const reporting = aggregateP11VisibilityReport(rows as P11VisibilityReportRow[], {
      legacyRows,
      authoritativeOwnerCount,
    })
    const measuredRows = rows.filter((row) => coverageCount(row.coverage, 'successful') > 0)
    const byStage: Record<string, number> = {}
    for (const row of measuredRows) {
      const stage = String(row.stage || 'untagged')
      byStage[stage] = (byStage[stage] || 0) + 1
      const sov = row.share_of_voice == null ? Number.NaN : Number(row.share_of_voice)
      row.actions = buildCitationActions({
        shareOfVoice: Number.isFinite(sov) ? sov : 0,
        topCompetitorDomain: row.top_competitor ? String(row.top_competitor) : null,
        competitorShare: Number(row.competitor_share),
        cited: Boolean(row.cited),
        stage: row.stage ? String(row.stage) : null,
        country: row.country ? String(row.country) : null,
      })
    }
    let remediations: import('./citationRemediation').CitationRemediation[] = []
    try {
      const { remediateVisibilityAudits } = await import('./citationRemediation')
      remediations = await remediateVisibilityAudits(measuredRows.map((row) => ({
        id: row.id ? String(row.id) : null,
        query: String(row.query || ''),
        cited: Boolean(row.cited),
        shareOfVoice: row.share_of_voice == null ? 0 : Number(row.share_of_voice),
        topCompetitor: row.top_competitor ? String(row.top_competitor) : null,
        competitorShare: Number(row.competitor_share),
        stage: row.stage ? String(row.stage) : null,
        country: row.country ? String(row.country) : null,
        actions: Array.isArray(row.actions) ? row.actions as import('./citationRemediation').CitationRemediation['actions'] : null,
        authoritativeOwnerUrl: row.authoritative_owner_url ? String(row.authoritative_owner_url) : null,
        ownershipRowId: Number(row.ownership_row_id) || null,
        competitorCitedUrls: Array.isArray(row.competitor_cited_urls) ? row.competitor_cited_urls.map(String) : [],
        citationClassifications: Array.isArray(row.citation_classifications)
          ? row.citation_classifications as import('./citationRemediation').CitationClassificationEvidence[]
          : [],
      })))
      const byQuery = new Map(remediations.map((item) => [item.query.toLowerCase(), item]))
      for (const row of measuredRows) {
        const hit = byQuery.get(String(row.query || '').toLowerCase())
        if (hit) row.remediation = hit
      }
    } catch {
      remediations = []
    }
    return {
      audits: rows.slice(0, Math.max(1, limit)),
      shareOfVoice: reporting.shareOfVoice,
      measurementState: reporting.measurementState,
      cited: reporting.citedSuccessful,
      total: reporting.successful,
      attempted: reporting.attempted,
      failed: Math.max(0, reporting.attempted - reporting.successful),
      byStage,
      reporting,
      reportingTruncated: rows.length >= P11_REPORTING_ROW_LIMIT && (p11RowsExact == null || p11RowsExact > rows.length),
      remediations,
    }
  } catch {
    return {
      audits: [], shareOfVoice: null, measurementState: 'unavailable', cited: 0, total: 0,
      attempted: 0, failed: 0, byStage: {}, reporting: emptyReporting,
      reportingTruncated: false, remediations: [],
    }
  }
}

/**
 * Narrow column set for the status summary: only what
 * `aggregateP11VisibilityReport` consumes. Deliberately EXCLUDES the deep-feed
 * columns (snippet, cited_urls, brand_mentions, citation_classifications,
 * competitor arrays, actions) so a health/status render never pays to transfer
 * and re-shape thousands of wide rows.
 */
const P11_STATUS_SUMMARY_COLUMNS = 'audit_contract_version,ownership_row_id,coverage'

export interface VisibilityStatusSummary {
  /** Aggregates over successful provider attempts — the P11 headline numbers. */
  cited: number
  total: number
  attempted: number
  failed: number
  shareOfVoice: number | null
  measurementState: VisibilityMeasurementState
  reporting: P11VisibilityReporting
  reportingTruncated: boolean
  /** Newest audited query, for the status card's latestQuery/latestAt fields. */
  latest: { query: string; createdAt: string } | null
  /** True: produced by this summary path, not the deep loadVisibilityFeed pipeline. */
  summaryMode: true
}

/**
 * Status-summary read for /api/seo-engine/status (and any other health surface).
 *
 * Splits the cheap status work from the deep visibility/remediation computation
 * in `loadVisibilityFeed`: no wide-row fetch (narrow columns only), no per-row
 * citation actions, no remediation generator, no audits slice. The `reporting`
 * aggregate is computed by the same `aggregateP11VisibilityReport` so the two
 * paths cannot drift in what they report.
 */
export async function loadVisibilityStatusSummary(): Promise<VisibilityStatusSummary> {
  const emptyReporting = aggregateP11VisibilityReport([], { legacyRows: 0, authoritativeOwnerCount: 0 })
  try {
    const supabase = getSupabaseAdminClient()
    // One narrow row replaces the deep feed's audits[0] headline read.
    const latestPromise = Promise.resolve(supabase
      .from('seo_llm_visibility')
      .select('query,created_at')
      .eq('fan_out', false)
      .eq('audit_contract_version', P11_AUDIT_CONTRACT_VERSION)
      .order('created_at', { ascending: false })
      .limit(1) as unknown as PromiseLike<{ data: Array<Record<string, unknown>> | null; error: unknown }>
    ).catch(
      () => ({ data: null, error: null }),
    )
    const [dataResult, totalRows, p11RowsExact, registryRows, latestRes] = await Promise.all([
      supabase
        .from('seo_llm_visibility')
        .select(P11_STATUS_SUMMARY_COLUMNS)
        .eq('fan_out', false)
        .eq('audit_contract_version', P11_AUDIT_CONTRACT_VERSION)
        .order('created_at', { ascending: false })
        .limit(P11_REPORTING_ROW_LIMIT),
      exactVisibilityCount(supabase),
      exactVisibilityCount(supabase, P11_AUDIT_CONTRACT_VERSION),
      listRegistry().catch(() => [] as OwnershipRow[]),
      latestPromise,
    ])
    const { data, error } = dataResult as { data: Array<Record<string, unknown>> | null; error: { message: string } | null }
    if (error) throw error
    const rows = (data as Array<Record<string, unknown>>) || []
    const legacyRows = totalRows == null || p11RowsExact == null ? 0 : Math.max(0, totalRows - p11RowsExact)
    const authoritativeOwnerCount = registryRows.filter(isAuthoritativeOwnershipRow).length
    const reporting = aggregateP11VisibilityReport(rows as P11VisibilityReportRow[], {
      legacyRows,
      authoritativeOwnerCount,
    })
    const latestRows = (((latestRes as { data?: Array<Record<string, unknown>> } | null)?.data) || []) as Array<Record<string, unknown>>
    const latestRow0 = latestRows[0] ?? null
    return {
      cited: reporting.citedSuccessful,
      total: reporting.successful,
      attempted: reporting.attempted,
      failed: Math.max(0, reporting.attempted - reporting.successful),
      shareOfVoice: reporting.shareOfVoice,
      measurementState: reporting.measurementState,
      reporting,
      reportingTruncated: rows.length >= P11_REPORTING_ROW_LIMIT && (p11RowsExact == null || p11RowsExact > rows.length),
      latest: latestRow0
        ? { query: String(latestRow0.query || ''), createdAt: String(latestRow0.created_at || '') }
        : null,
      summaryMode: true,
    }
  } catch {
    return {
      cited: 0, total: 0, attempted: 0, failed: 0,
      shareOfVoice: null, measurementState: 'unavailable',
      reporting: emptyReporting, reportingTruncated: false, latest: null, summaryMode: true,
    }
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
    const supabase = getSupabaseAdminClient()
    const { data } = await supabase
      .from('seo_llm_visibility')
      .select('query,audit_contract_version,audit_status,coverage,top_competitor,competitor_share,created_at')
      .eq('fan_out', false)
      .eq('audit_contract_version', P11_AUDIT_CONTRACT_VERSION)
      .order('created_at', { ascending: false })
      .limit(200)
    const rows = (data as Array<Record<string, unknown>>) || []

    // Ranking evidence is intentionally exact-topic and latest-observation only.
    // Legacy rows, fuzzy query overlaps, and an older successful run must never
    // override a newer unavailable P11 observation.
    const latest = rows.find((row) => normalizeAuditQuery(String(row.query || '')) === normalized)
    if (!latest) return null

    const successful = coverageCount(latest.coverage, 'successful')
    if (successful <= 0 || latest.audit_status !== 'success') return null
    const citedSuccessful = Math.min(successful, coverageCount(latest.coverage, 'citedSuccessful'))
    const shareOfVoice = citedSuccessful / successful
    const topCompetitorDomain = String(latest.top_competitor || '').trim() || null
    const competitorShareRaw = Number(latest.competitor_share)
    const competitorShare = topCompetitorDomain && Number.isFinite(competitorShareRaw)
      ? competitorShareRaw
      : null

    return {
      cited: citedSuccessful,
      total: successful,
      shareOfVoice,
      topCompetitorDomain,
      competitorShare,
    }
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
  /** Successful/measured fan-out audits — the denominator. */
  total: number
  attempted: number
  failed: number
  shareOfVoice: number | null
  measurementState: VisibilityMeasurementState
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
  const engine = opts.engineLabel || DEFAULT_AUDIT_ENGINE_LABEL
  const empty: FanOutAuditRunResult = { audits: [], clusters: 0, cited: 0, total: 0, attempted: 0, failed: 0, shareOfVoice: null, measurementState: 'unavailable', byCluster: {} }
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
    const supabase = getSupabaseAdminClient()
    for (const fq of queries) {
      const result = await auditQuery(fq.query, engine)
      audits.push(result)
      if (!failedAuditResult(result)) {
        const cell = byCluster[fq.clusterId] || { cited: 0, total: 0 }
        cell.total += 1
        if (result.cited) cell.cited += 1
        byCluster[fq.clusterId] = cell
      }
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
          flags: persistenceFlags(result),
          share_of_voice: result.shareOfVoice,
          top_competitor: result.topCompetitor?.domain ?? null,
          competitor_share: result.topCompetitor?.share ?? null,
          engines_json: result.engines,
        })
      } catch {
        // storage best-effort — the audit itself stands
      }
    }
    const measuredAudits = audits.filter((audit) => !failedAuditResult(audit))
    const cited = measuredAudits.filter((audit) => audit.cited).length
    const total = measuredAudits.length
    const attempted = audits.length
    const failed = attempted - total
    return {
      audits,
      clusters: Object.keys(byCluster).length,
      cited,
      total,
      attempted,
      failed,
      shareOfVoice: total ? Math.round((cited / total) * 100) : null,
      measurementState: total ? 'measured' : 'unavailable',
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
    const supabase = getSupabaseAdminClient()
    const { data: clusters } = await supabase
      .from('seo_llm_visibility')
      .select('cluster_id,flags,engines_json')
      .eq('fan_out', true)
      .not('cluster_id', 'is', null)
      .not('flags', 'ov', `{audit_failed}`)
      .order('created_at', { ascending: false })
      .limit(maxClusters)
    const ids = [...new Set(((clusters as Array<{ cluster_id: string | null }>) || []).map((r) => String(r.cluster_id || '')).filter(Boolean))]
    const byCluster: Record<string, { cited: number; total: number }> = {}
    for (const id of ids) {
      const { data: rows } = await supabase
        .from('seo_llm_visibility')
        .select('cluster_id,cited,flags,engines_json')
        .eq('cluster_id', id)
        .eq('fan_out', true)
        .not('flags', 'ov', `{audit_failed}`)
        .order('created_at', { ascending: false })
        .limit(Math.max(perCluster, Math.min(200, perCluster * 4)))
      const measuredRows = (((rows as Array<Record<string, unknown>>) || [])
        .filter((row) => !isFailedVisibilityRow(row))
        .slice(0, perCluster))
      for (const r of measuredRows) {
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
