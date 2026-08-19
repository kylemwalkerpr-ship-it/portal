/**
 * Turn a losing LLM-audit row into a studio fix: match the query to a live
 * estate URL (or flag it as a new page) and prefill the four citation actions
 * the audit already emits (capsule, FAQ schema, entities, llms.txt).
 */
import type { CitationAction } from './llmVisibility'
import { jaccard, usableQuery } from './auditQuerySelector'

const DEFAULT_LOSS_ACTIONS: CitationAction[] = [
  { priority: 4, action: 'Add a direct-answer "In 60 seconds" capsule above the fold', evidence: 'Answer engines had no quotable estate sentence for this query' },
  { priority: 3, action: 'Add FAQPage JSON-LD (4–6 Q&As) matching the exact sub-queries engines ask', evidence: 'No structured answer surface' },
  { priority: 2, action: 'Add 2–3 original statistics / named entities to raise quotability', evidence: 'No citable facts for this query' },
  { priority: 1, action: 'Confirm the page is in llms.txt + sitemap so crawlers can discover it', evidence: 'Undiscovered content cannot be cited' },
]

export interface CoveragePage {
  url: string | null
  title: string | null
  primaryKeyword: string | null
  jobId?: string | null
  clusterId?: string | null
  country?: string | null
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
}

export interface CitationMatch {
  mode: 'expand' | 'new'
  overlap: 'exact' | 'high' | 'low' | null
  url: string | null
  title: string | null
  jobId: string | null
  clusterId: string | null
  primaryTerm: string | null
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
  play: 'refresh' | 'content_gap'
  intent: 'informational'
  intentCategory: string
  profitability: 'high'
  reason: string
  signals: string[]
  sourcePage?: string
  aeoRemediation: {
    query: string
    url: string | null
    jobId: string | null
    mode: 'expand' | 'new'
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

const COUNTRY_IN_PATH: Array<[RegExp, string]> = [
  [/\/uk\/|united-kingdom|britain/, 'UK'],
  [/\/ca\/|canada/, 'CA'],
  [/\/au\/|australia/, 'AU'],
  [/\/us\/|united-states|america/, 'US'],
]

export function needsCitationFix(row: AuditRemediationInput): boolean {
  if (!usableQuery(row.query) && String(row.query || '').trim().length < 8) return false
  if (row.cited === false) return true
  const sov = Number(row.shareOfVoice)
  return Number.isFinite(sov) ? sov < 1 : !row.cited
}

export function actionHeadings(actions: CitationAction[]): string[] {
  return actions.slice(0, 4).map((a) => {
    const stripped = String(a.action || '')
      .replace(/^(Add|Confirm)\s+(a\s+|the\s+)?/i, '')
      .trim()
    return stripped ? stripped.charAt(0).toUpperCase() + stripped.slice(1) : 'Citation fix'
  })
}

function foldHyphens(s: string): string {
  return String(s || '').replace(/([a-z0-9])-+(?=[a-z0-9])/gi, '$1')
}

function matchTokens(s: string): Set<string> {
  return new Set(
    foldHyphens(s)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 2 && !['the', 'and', 'for', 'how', 'do', 'an', 'to', 'of', 'in', 'on', 'is', 'are', 'what', 'when', 'who', 'can', 'you', 'from', 'with', 'your'].includes(t)),
  )
}

export function scoreQueryAgainstPage(query: string, page: CoveragePage): { score: number; overlap: CitationMatch['overlap'] } {
  const q = String(query || '').trim()
  const pk = String(page.primaryKeyword || '').trim()
  const title = String(page.title || '').trim()
  if (!q) return { score: 0, overlap: null }
  const qn = foldHyphens(q).toLowerCase()
  const pkn = foldHyphens(pk).toLowerCase()
  const tn = foldHyphens(title).toLowerCase()
  const bonuses = (page.url ? 15 : 0) + (page.jobId ? 5 : 0) + (page.url && /yousafeconsultancy\.com/i.test(page.url) ? 4 : 0)
  if (pkn.length >= 8 && (qn === pkn || qn.includes(pkn))) {
    return { score: 100 + bonuses, overlap: 'exact' }
  }
  const qTokens = matchTokens(qn)
  const pageTokens = matchTokens(`${pkn} ${tn}`)
  const jac = jaccard(qTokens, pageTokens)
  let score = jac * 80 + bonuses
  const country = page.country || countryFromUrl(page.url)
  if (country && qn.includes(country.toLowerCase())) score += 8
  if (jac >= 0.45) return { score, overlap: 'high' }
  if (jac >= 0.22 && qTokens.size >= 2) return { score, overlap: 'low' }
  return { score: 0, overlap: null }
}

export function countryFromUrl(url: string | null | undefined): string | null {
  const u = String(url || '').toLowerCase()
  if (!u) return null
  for (const [re, c] of COUNTRY_IN_PATH) if (re.test(u)) return c
  return null
}

export function matchAuditQuery(query: string, pages: CoveragePage[]): CitationMatch {
  const empty: CitationMatch = {
    mode: 'new', overlap: null, url: null, title: null, jobId: null, clusterId: null, primaryTerm: null, score: 0,
  }
  if (!String(query || '').trim() || !pages.length) return empty
  let best: { page: CoveragePage; score: number; overlap: CitationMatch['overlap'] } | null = null
  for (const page of pages) {
    const hit = scoreQueryAgainstPage(query, page)
    if (!hit.overlap) continue
    const preferUrl = Boolean(page.url) && !best?.page.url && hit.score + 0.01 >= (best?.score ?? 0)
    if (!best || hit.score > best.score || preferUrl) best = { page, score: hit.score, overlap: hit.overlap }
  }
  if (!best) return empty
  const url = best.page.url ? String(best.page.url) : null
  const jobId = best.page.jobId ? String(best.page.jobId) : null
  return {
    mode: url || jobId ? 'expand' : 'new',
    overlap: best.overlap,
    url,
    title: best.page.title,
    jobId,
    clusterId: best.page.clusterId ? String(best.page.clusterId) : null,
    primaryTerm: best.page.primaryKeyword || best.page.title,
    score: best.score,
  }
}

export function buildRemediationBrief(row: AuditRemediationInput, match: CitationMatch): CitationRemediationBrief {
  const query = String(row.query || '').trim()
  const actions = Array.isArray(row.actions) && row.actions.length ? row.actions : DEFAULT_LOSS_ACTIONS
  const term = match.primaryTerm || query
  const headings = actionHeadings(actions)
  const expand = match.mode === 'expand'
  return {
    topic: query,
    title: expand && match.title ? String(match.title) : query,
    primaryKeyword: term,
    keywords: [...new Set([term, query].filter(Boolean))].slice(0, 8),
    audience: 'international applicants researching this route',
    impressions: 0,
    demandScore: 50,
    opportunityScore: 70,
    trend: 'flat',
    play: expand ? 'refresh' : 'content_gap',
    intent: 'informational',
    intentCategory: row.stage ? String(row.stage) : 'visa',
    profitability: 'high',
    reason: expand
      ? `LLM audit lost this query. Retrofit ${match.url || 'the matching page'} with the four citation actions — do not ship a sibling.`
      : 'LLM audit lost this query and no live estate URL matched. Draft one canonical page that owns it.',
    signals: [
      ...headings,
      match.url ? `Live URL: ${match.url}` : 'No live URL yet — new canonical',
      row.topCompetitor ? `Top competitor: ${row.topCompetitor}` : '',
    ].filter(Boolean),
    sourcePage: match.url || undefined,
    aeoRemediation: {
      query,
      url: match.url,
      jobId: match.jobId,
      mode: match.mode,
      actions,
    },
  }
}

export function buildCitationRemediation(row: AuditRemediationInput, pages: CoveragePage[]): CitationRemediation | null {
  const query = String(row.query || '').trim()
  if (!query) return null
  if (!needsCitationFix(row)) return null
  const match = matchAuditQuery(query, pages)
  const actions = Array.isArray(row.actions) && row.actions.length ? row.actions : DEFAULT_LOSS_ACTIONS
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

export function buildCitationRemediations(rows: AuditRemediationInput[], pages: CoveragePage[]): CitationRemediation[] {
  const out: CitationRemediation[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const item = buildCitationRemediation(row, pages)
    if (!item) continue
    const key = item.query.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

export async function loadCitationCoverage(): Promise<CoveragePage[]> {
  try {
    const { createSupabaseAdminClient } = await import('@/lib/supabase')
    const supabase = createSupabaseAdminClient()
    const pages: CoveragePage[] = []
    const { data: jobs } = await supabase
      .from('content_jobs')
      .select('id,canonical_url,title,primary_keyword,status')
      .in('status', ['merged', 'pr_created', 'publishing', 'drafting'])
      .not('canonical_url', 'is', null)
      .limit(400)
    for (const row of (jobs || []) as Array<Record<string, unknown>>) {
      const url = String(row.canonical_url || '').trim()
      if (!url) continue
      pages.push({
        url,
        title: row.title ? String(row.title) : null,
        primaryKeyword: row.primary_keyword ? String(row.primary_keyword) : null,
        jobId: row.id ? String(row.id) : null,
        country: countryFromUrl(url),
      })
    }
    const { data: plans } = await supabase
      .from('seo_cluster_plans')
      .select('cluster_id,primary_term,country')
      .order('opportunity_score', { ascending: false })
      .limit(40)
    for (const row of (plans || []) as Array<Record<string, unknown>>) {
      const term = String(row.primary_term || '').trim()
      if (!term) continue
      pages.push({
        url: null,
        title: term,
        primaryKeyword: term,
        clusterId: row.cluster_id ? String(row.cluster_id) : null,
        country: row.country ? String(row.country) : null,
      })
    }
    return pages
  } catch {
    return []
  }
}

export async function remediateVisibilityAudits(rows: AuditRemediationInput[]): Promise<CitationRemediation[]> {
  const losing = rows.filter(needsCitationFix)
  if (!losing.length) return []
  const pages = await loadCitationCoverage()
  return buildCitationRemediations(losing, pages)
}
