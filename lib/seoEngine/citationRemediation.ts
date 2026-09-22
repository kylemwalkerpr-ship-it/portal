/**
 * P11 citation remediation is ownership-bound and fail-closed.
 *
 * A measured citation loss may open research or a refresh of the existing
 * authoritative owner. It may never manufacture a sibling page, infer an owner
 * from fuzzy coverage rows, or prescribe generic discovery files.
 */
import { HOST_PUBLIC } from '@/lib/seoFactory/ownership'
import type { CitationAction } from './llmVisibility'
import { jaccard, usableQuery } from './auditQuerySelector'

export interface CoveragePage {
  url: string | null
  title: string | null
  primaryKeyword: string | null
  jobId?: string | null
  clusterId?: string | null
  country?: string | null
}

export interface CitationClassificationEvidence {
  classification: string
  rawUrl: string
  normalizedUrl: string | null
}

export interface AuditRemediationInput {
  id?: string | null
  query: string
  cited?: boolean | null
  shareOfVoice?: number | null
  topCompetitor?: string | null
  competitorShare?: number | null
  stage?: string | null
  country?: string | null
  actions?: CitationAction[] | null
  authoritativeOwnerUrl?: string | null
  ownershipRowId?: number | null
  competitorCitedUrls?: string[] | null
  citationClassifications?: CitationClassificationEvidence[] | null
}

export interface CitationMatch {
  mode: 'expand' | 'unresolved'
  overlap: 'exact' | 'high' | 'low' | null
  url: string | null
  title: string | null
  jobId: string | null
  clusterId: string | null
  primaryTerm: string | null
  ownershipRowId: number | null
  score: number
}

export interface CitationRemediationBrief {
  topic: string
  title: string
  primaryKeyword: string
  keywords: string[]
  audience: string
  impressions: number
  demandScore: number
  opportunityScore: number
  trend: 'flat'
  play: 'refresh'
  intent: 'informational'
  intentCategory: string
  profitability: 'high'
  reason: string
  signals: string[]
  sourcePage: string
  aeoRemediation: {
    query: string
    url: string
    jobId: null
    mode: 'expand'
    actions: CitationAction[]
  }
}

export interface CitationRemediation {
  id: string | null
  query: string
  cited: boolean
  shareOfVoice: number
  topCompetitor: string | null
  actions: CitationAction[]
  match: CitationMatch
  brief: CitationRemediationBrief
}

const COUNTRY_IN_PATH: Array<[RegExp, string]> = [  [/\/uk\/|united-kingdom|britain/, 'UK'],
  [/\/ca\/|canada/, 'CA'],
  [/\/au\/|australia/, 'AU'],
  [/\/us\/|united-states|america/, 'US'],
]

const CURRENT_OWNER_HOSTS = new Set(
  Object.values(HOST_PUBLIC).map((base) => new URL(base).hostname.toLowerCase()),
)

function validAuthoritativeOwner(url: string | null | undefined, rowId: number | null | undefined): url is string {
  if (!url || !Number.isInteger(rowId) || Number(rowId) <= 0) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && CURRENT_OWNER_HOSTS.has(parsed.hostname.toLowerCase())
  } catch {
    return false
  }
}

export function needsCitationFix(row: AuditRemediationInput): boolean {
  if (!usableQuery(row.query) && String(row.query || '').trim().length < 8) return false
  if (row.shareOfVoice == null) return false
  if (row.cited === false) return true
  const sov = Number(row.shareOfVoice)
  return Number.isFinite(sov) ? sov < 1 : false
}

export function actionHeadings(actions: CitationAction[]): string[] {  return actions.slice(0, 4).map((action) => {
    const stripped = String(action.action || '')
      .replace(/^(Research|Review|Repair|Inspect|Sustain)\s+(a\s+|the\s+)?/i, '')
      .trim()
    return stripped ? stripped.charAt(0).toUpperCase() + stripped.slice(1) : 'Citation evidence review'
  })
}

function foldHyphens(value: string): string {
  return String(value || '').replace(/([a-z0-9])-+(?=[a-z0-9])/gi, '$1')
}

function matchTokens(value: string): Set<string> {
  return new Set(
    foldHyphens(value)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 2 && !['the', 'and', 'for', 'how', 'do', 'an', 'to', 'of', 'in', 'on', 'is', 'are', 'what', 'when', 'who', 'can', 'you', 'from', 'with', 'your'].includes(token)),
  )
}

export function countryFromUrl(url: string | null | undefined): string | null {
  const value = String(url || '').toLowerCase()
  if (!value) return null
  for (const [pattern, country] of COUNTRY_IN_PATH) if (pattern.test(value)) return country
  return null
}
export function scoreQueryAgainstPage(query: string, page: CoveragePage): { score: number; overlap: CitationMatch['overlap'] } {
  const q = String(query || '').trim()
  const keyword = String(page.primaryKeyword || '').trim()
  const title = String(page.title || '').trim()
  if (!q) return { score: 0, overlap: null }
  const qn = foldHyphens(q).toLowerCase()
  const pkn = foldHyphens(keyword).toLowerCase()
  const tn = foldHyphens(title).toLowerCase()
  const bonuses = (page.url ? 15 : 0) + (page.jobId ? 5 : 0)
  if (pkn.length >= 8 && (qn === pkn || qn.includes(pkn))) return { score: 100 + bonuses, overlap: 'exact' }
  const jac = jaccard(matchTokens(qn), matchTokens(`${pkn} ${tn}`))
  const score = jac * 80 + bonuses
  if (jac >= 0.45) return { score, overlap: 'high' }
  if (jac >= 0.22) return { score, overlap: 'low' }
  return { score: 0, overlap: null }
}

/** Diagnostic-only matcher. It never authorizes creation. */
export function matchAuditQuery(query: string, pages: CoveragePage[]): CitationMatch {
  const unresolved: CitationMatch = {
    mode: 'unresolved', overlap: null, url: null, title: null,
    jobId: null, clusterId: null, primaryTerm: null, ownershipRowId: null, score: 0,
  }
  let best: { page: CoveragePage; score: number; overlap: CitationMatch['overlap'] } | null = null
  for (const page of pages || []) {
    if (!page.url) continue
    const hit = scoreQueryAgainstPage(query, page)
    if (!hit.overlap) continue
    if (!best || hit.score > best.score) best = { page, score: hit.score, overlap: hit.overlap }
  }
  if (!best?.page.url) return unresolved
  return {
    mode: 'expand', overlap: best.overlap, url: best.page.url,
    title: best.page.title, jobId: best.page.jobId ? String(best.page.jobId) : null,
    clusterId: best.page.clusterId ? String(best.page.clusterId) : null,
    primaryTerm: best.page.primaryKeyword || best.page.title,
    ownershipRowId: null, score: best.score,
  }
}

function evidenceActions(row: AuditRemediationInput): CitationAction[] {
  const actions: CitationAction[] = Array.isArray(row.actions) ? [...row.actions] : []
  const classifications = row.citationClassifications || []
  const estateProblem = classifications.some((item) =>
    item.classification === 'wrong_current_owner' || item.classification === 'retired_estate_url'
  )
  if (estateProblem) {
    actions.unshift({
      priority: 4,
      action: 'Repair estate canonical, redirect, and internal authority so the authoritative owner is the citation target',
      evidence: 'Measured audit evidence cited a wrong current owner or retired estate URL',
    })
  }
  if (!actions.some((action) => /research/i.test(action.action)) && row.topCompetitor) {
    actions.push({
      priority: 3,
      action: `Research why ${row.topCompetitor} was cited before changing the authoritative owner`,
      evidence: 'Competitor citation evidence is an observation; verify claims against primary sources before editing',
    })
  }  if (!actions.length) {
    actions.push({
      priority: 3,
      action: 'Inspect successful audit evidence before changing the authoritative owner',
      evidence: 'Citation absence alone does not identify an answer-structure, source-quality, or authority defect',
    })
  }
  return actions
    .filter((action, index, all) => all.findIndex((candidate) => candidate.action === action.action) === index)
    .sort((a, b) => b.priority - a.priority)
}

export function buildRemediationBrief(row: AuditRemediationInput, match: CitationMatch): CitationRemediationBrief {
  if (match.mode !== 'expand' || !match.url) throw new Error('P11 remediation requires an existing authoritative owner')
  const query = String(row.query || '').trim()
  const actions = evidenceActions(row)
  const competitorUrls = (row.competitorCitedUrls || []).filter(Boolean)
  return {
    topic: query,
    title: query,
    primaryKeyword: query,
    keywords: [query],
    audience: 'international applicants researching this route',
    impressions: 0,
    demandScore: 50,
    opportunityScore: 70,
    trend: 'flat',
    play: 'refresh',
    intent: 'informational',
    intentCategory: row.stage ? String(row.stage) : 'visa',
    profitability: 'high',    reason: `Measured P11 citation loss is bound to authoritative owner ${match.url}; research the evidence before refreshing that owner only.`,
    signals: [
      ...actionHeadings(actions),
      `Authoritative owner: ${match.url}`,
      ...competitorUrls.map((url) => `Competitor cited URL: ${url}`),
      ...(competitorUrls.length ? ['Primary source research required before adopting any competing claim'] : []),
    ],
    sourcePage: match.url,
    aeoRemediation: { query, url: match.url, jobId: null, mode: 'expand', actions },
  }
}

export function buildCitationRemediation(
  row: AuditRemediationInput,
  _legacyPages: CoveragePage[] = [],
): CitationRemediation | null {
  const query = String(row.query || '').trim()
  if (!query || !needsCitationFix(row)) return null
  if (!validAuthoritativeOwner(row.authoritativeOwnerUrl, row.ownershipRowId)) return null
  const match: CitationMatch = {
    mode: 'expand',
    overlap: 'exact',
    url: row.authoritativeOwnerUrl,
    title: null,
    jobId: null,
    clusterId: null,
    primaryTerm: query,
    ownershipRowId: Number(row.ownershipRowId),
    score: 100,
  }
  const actions = evidenceActions(row)
  return {
    id: row.id ? String(row.id) : null,
    query,
    cited: Boolean(row.cited),
    shareOfVoice: Number(row.shareOfVoice) || 0,
    topCompetitor: row.topCompetitor ? String(row.topCompetitor) : null,
    actions,
    match,
    brief: buildRemediationBrief({ ...row, actions }, match),
  }
}

export function buildCitationRemediations(
  rows: AuditRemediationInput[],
  _legacyPages: CoveragePage[] = [],
): CitationRemediation[] {
  const out: CitationRemediation[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const item = buildCitationRemediation(row)
    if (!item) continue
    const key = `${item.query.toLowerCase()}|${item.match.url}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

/** Runtime P11 remediation never loads fuzzy content-job/cluster coverage. */
export async function remediateVisibilityAudits(rows: AuditRemediationInput[]): Promise<CitationRemediation[]> {
  return buildCitationRemediations(rows.filter(needsCitationFix))
}
