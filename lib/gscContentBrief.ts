/**
 * Build SEO content briefs from live GSC (service account / OAuth) or the
 * committed CSV snapshot (data/gsc/snapshot.json).
 *
 * Used by Content Studio generate so every draft is grounded in real
 * Search Console demand (impressions, position, CTR gaps).
 */

import { getGscAccess } from '@/lib/gscAuth'
import { loadGscSnapshot } from '@/lib/seoDataLoaders'
import { editorialBriefPromptBlock } from '@/lib/seoFactory/editorialContract'
import { isJunkQuery } from '@/lib/seoFactory/queryNoise'

export interface GscQuerySignal {
  term: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface GscPageSignal {
  url: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface GscContentBrief {
  source: 'live' | 'snapshot'
  mode: 'oauth' | 'service_account' | 'snapshot'
  siteUrl: string | null
  rangeNote: string
  primaryKeywords: GscQuerySignal[]
  relatedKeywords: GscQuerySignal[]
  opportunityKeywords: GscQuerySignal[]
  relatedPages: GscPageSignal[]
  strategyHints: string[]
  warnings: string[]
}

function scoreRelevance(term: string, topic: string, keywords: string[]): number {
  const t = term.toLowerCase()
  const hay = `${topic} ${keywords.join(' ')}`.toLowerCase()
  const words = hay.split(/[^a-z0-9]+/).filter((w) => w.length > 2)
  let score = 0
  for (const w of words) {
    if (t.includes(w)) score += w.length > 4 ? 3 : 1
  }
  // Prefer multi-word queries that share 2+ tokens with the topic
  const termWords = t.split(/\s+/).filter((w) => w.length > 2)
  const overlap = termWords.filter((w) => words.includes(w)).length
  score += overlap * 2
  return score
}

async function fetchLiveQueries(siteUrl: string, accessToken: string, days = 90): Promise<GscQuerySignal[]> {
  const endDate = new Date().toISOString().slice(0, 10)
  const startDate = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10)
  const endpoint = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      startDate,
      endDate,
      dimensions: ['query'],
      rowLimit: 100,
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`GSC live query failed (${res.status}): ${text.slice(0, 200)}`)
  }
  const json = (await res.json()) as {
    rows?: Array<{ keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }>
  }
  return (json.rows ?? [])
    .map((r) => ({
      term: (r.keys?.[0] ?? '').trim(),
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
      ctr: r.ctr ?? 0,
      position: r.position ?? 100,
    }))
    .filter((r) => r.term && r.impressions > 0)
}

async function fetchLivePages(siteUrl: string, accessToken: string, days = 90): Promise<GscPageSignal[]> {
  const endDate = new Date().toISOString().slice(0, 10)
  const startDate = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10)
  const endpoint = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      startDate,
      endDate,
      dimensions: ['page'],
      rowLimit: 50,
    }),
  })
  if (!res.ok) return []
  const json = (await res.json()) as {
    rows?: Array<{ keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }>
  }
  return (json.rows ?? [])
    .map((r) => ({
      url: (r.keys?.[0] ?? '').trim(),
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
      ctr: r.ctr ?? 0,
      position: r.position ?? 100,
    }))
    .filter((r) => r.url)
}

function strategyHintsFor(region: string, opportunities: GscQuerySignal[], nearPages: GscPageSignal[]): string[] {
  const hints: string[] = [
    'Prioritize CTR: pages ranking positions 4–20 with low CTR need title/meta rewrites, not new URLs.',
    'High-impression deep ranks (pos 30+) need content depth, local facts, and internal links from hubs.',
    'Use exact-match and close-variant queries from GSC in H2s and FAQ — do not invent volume.',
  ]
  if (opportunities.some((q) => /housing|apartment|dorm|rent/i.test(q.term))) {
    hints.push('Housing queries dominate demand — include city/campus neighborhood, rent ranges, and transit facts.')
  }
  if (opportunities.some((q) => /dependent|spouse|family|visa/i.test(q.term))) {
    hints.push('Family/dependent visa demand is high-impression / deep-rank — publish procedural pillar + checklist spokes.')
  }
  if (region === 'AU' || opportunities.some((q) => /485|pte|ielts|md111|ministerial/i.test(q.term))) {
    hints.push('AU GSC cluster: 485 English thresholds and MD111 — cite Home Affairs legislative instruments with dates.')
  }
  if (region === 'UK' || opportunities.some((q) => /uk|skilled worker|tier/i.test(q.term))) {
    hints.push('UK cluster: dependent visas and Skilled Worker routes — cite GOV.UK / Appendix FM where relevant.')
  }
  if (nearPages.length > 0) {
    hints.push(
      `Near-win pages (pos 4–20, weak CTR): ${nearPages
        .slice(0, 3)
        .map((p) => p.url.replace(/^https?:\/\/[^/]+/, ''))
        .join(', ')} — improve titles before net-new URLs.`,
    )
  }
  return hints
}

/**
 * Build a brief for Content Studio generation.
 * Prefer live GSC when credentials work; fall back to CSV snapshot.
 */
export async function buildGscContentBrief(opts: {
  topic: string
  region: string
  keywords?: string[]
  limit?: number
}): Promise<GscContentBrief> {
  const warnings: string[] = []
  const limit = opts.limit ?? 12
  const keywords = opts.keywords ?? []

  let queries: GscQuerySignal[] = []
  let pages: GscPageSignal[] = []
  let source: 'live' | 'snapshot' = 'snapshot'
  let mode: GscContentBrief['mode'] = 'snapshot'
  let siteUrl: string | null = process.env.GSC_SITE_URL ?? null
  let rangeNote = 'CSV snapshot (Downloads/SEO yousafeconsultancy-13..16)'

  const access = await getGscAccess()
  if (access?.accessToken && access.siteUrl) {
    try {
      queries = await fetchLiveQueries(access.siteUrl, access.accessToken)
      pages = await fetchLivePages(access.siteUrl, access.accessToken)
      source = 'live'
      mode = access.mode
      siteUrl = access.siteUrl
      rangeNote = 'Live Search Console last 90 days'
    } catch (err) {
      warnings.push(
        `Live GSC unavailable (${err instanceof Error ? err.message : 'error'}); using CSV snapshot. ` +
          'Ensure gsc-reader@yousafe-gsc-reader.iam.gserviceaccount.com is a Full user on each property.',
      )
    }
  } else if (access?.accessToken && !access.siteUrl) {
    warnings.push('GSC credentials present but GSC_SITE_URL is unset — using snapshot.')
  } else {
    warnings.push(
      'No live GSC credentials (set GSC_SERVICE_ACCOUNT_JSON + GSC_SITE_URL, or OAuth bundle) — using snapshot.',
    )
  }

  if (source === 'snapshot') {
    // Never present stale demand as live. Older than 14 days → refuse the
    // snapshot entirely so downstream decision paths fail honestly instead of
    // planning on dead data.
    const snap = await loadGscSnapshot({ allowStale: false, maxAgeDays: 14 })
    queries = snap.topQueries ?? []
    pages = snap.topPages ?? []
    if (queries.length === 0) {
      warnings.push(
        'GSC snapshot is stale or unavailable (older than 14 days or missing). ' +
          'Refusing snapshot demand — regenerate the snapshot (re-export from Search Console) or fix live GSC credentials.',
      )
    }
    // Prefer opportunity lists when topic matching is weak
    if (snap.opportunities?.highImpressionLowCtr?.length) {
      // merge into pool with dedupe
      const seen = new Set(queries.map((q) => q.term))
      for (const q of snap.opportunities.highImpressionLowCtr) {
        if (!seen.has(q.term)) {
          queries.push(q)
          seen.add(q.term)
        }
      }
    }
  }

  const ranked = queries
    .map((q) => ({ q, rel: scoreRelevance(q.term, opts.topic, keywords) }))
    .sort((a, b) => b.rel - a.rel || b.q.impressions - a.q.impressions)

  const relevant = ranked.filter((r) => r.rel > 0).map((r) => r.q)
  // Never promote brand/noise queries (site's own name, file-like terms) to
  // "primary keywords" — previously the top-6 unrelated rows were used as-is.
  const cleanPool = queries.filter((q) => !isJunkQuery(String(q.term || '')))
  const pool = relevant.length > 0 ? relevant : cleanPool
  const primaryKeywords = pool.slice(0, Math.min(6, limit))
  const relatedKeywords = pool.slice(primaryKeywords.length, primaryKeywords.length + 8)

  // A clicks=0 export (or clicks missing) cannot evidence CTR gaps — every
  // query would "qualify" as low-CTR. Only compute opportunity keywords when
  // the pool carries real click data.
  const hasClickData = queries.some((q) => Number(q.clicks) > 0)
  const opportunityKeywords = hasClickData
    ? queries
        .filter((q) => q.impressions >= 15 && q.position > 20 && q.ctr < 0.02)
        .filter((q) => scoreRelevance(q.term, opts.topic, keywords) > 0 || relevant.length === 0)
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 8)
    : []

  const relatedPages = pages
    .map((p) => ({
      p,
      rel: scoreRelevance(p.url, opts.topic, keywords),
    }))
    .sort((a, b) => b.rel - a.rel || b.p.impressions - a.p.impressions)
    .slice(0, 6)
    .map((x) => x.p)

  const nearWin = pages.filter((p) => p.position >= 4 && p.position <= 20 && p.ctr < 0.03)

  return {
    source,
    mode,
    siteUrl,
    rangeNote,
    primaryKeywords,
    relatedKeywords,
    opportunityKeywords,
    relatedPages,
    strategyHints: strategyHintsFor(opts.region, opportunityKeywords, nearWin),
    warnings,
  }
}

/** Serialize brief for the LLM prompt block. */
/**
 * Build a dynamic, high-intent keyword portfolio from GSC data.
 * Merges primary keywords, opportunity keywords, and related long-tail
 * queries into a prioritised list for the AI writer, so every article
 * targets the full search-intent cluster — not just one keyword.
 */
/**
 * Build a dynamic, high-intent keyword portfolio from GSC data.
 * Merges primary keywords, opportunity keywords, and related long-tail
 * queries into a prioritised list for the AI writer, so every article
 * targets the full search-intent cluster — not just one keyword.
 */
export function buildKeywordPortfolio(brief: GscContentBrief): {
  primary: string[]
  secondary: string[]
  longTail: string[]
  semanticGroup: string
  intentSummary: string
} {
  // GscQuerySignal has .term, .impressions, .clicks, .ctr, .position
  const primary: string[] = brief.primaryKeywords.slice(0, 3).map((k) => k.term)
  const secondary = brief.opportunityKeywords
    .filter((k) => !primary.includes(k.term))
    .map((k) => k.term)
    .slice(0, 6)
  const longTail = brief.relatedKeywords
    .filter((k) => !primary.includes(k.term) && !secondary.includes(k.term))
    .map((k) => k.term)
    .slice(0, 10)

  // Group keywords into a semantic topic cluster
  const allTokens = new Set<string>()
  const stopWords = ['and','the','for','with','from','your','what','that','this','how','when','where','which']
  for (const kw of [...primary, ...secondary]) {
    for (const t of kw.toLowerCase().split(/[\s-]+/)) {
      if (t.length > 3 && !stopWords.includes(t)) {
        allTokens.add(t)
      }
    }
  }
  const semanticGroup = [...allTokens].slice(0, 8).join(', ')

  // Intent summary for the AI
  let intent = 'Informational — educational guide'
  if (primary.some((k) => /checklist|documents?|require|steps|how to|apply/i.test(k))) {
    intent = 'Procedural — step-by-step how-to with document lists and timelines'
  } else if (primary.some((k) => /visa|permit|status|green card|pr/i.test(k))) {
    intent = 'Navigational — visa/permit process overview with official eligibility rules'
  } else if (primary.some((k) => /cost|fee|price|salary|pay/i.test(k))) {
    intent = 'Commercial — cost/fee comparison with official sources and practical estimates'
  }

  return { primary, secondary, longTail, semanticGroup, intentSummary: intent }
}

export function formatGscBriefForPrompt(brief: GscContentBrief): string {
  const lines: string[] = [
    editorialBriefPromptBlock(),
    '',
    `## Live SEO demand (Google Search Console — ${brief.source}/${brief.mode})`,
    `Window: ${brief.rangeNote}`,
    brief.siteUrl ? `Property: ${brief.siteUrl}` : '',
    '',
    '### Primary keywords to target (use in title, H1/H2, FAQ)',
    ...brief.primaryKeywords.map(
      (q) =>
        `- "${q.term}" — impressions ${q.impressions}, clicks ${q.clicks}, CTR ${(q.ctr * 100).toFixed(2)}%, avg position ${q.position.toFixed(1)}`,
    ),
    '',
    '### Related / secondary queries',
    ...(brief.relatedKeywords.length
      ? brief.relatedKeywords.map((q) => `- "${q.term}" (imp ${q.impressions}, pos ${q.position.toFixed(1)})`)
      : ['- (none matched closely — still use primary list)']),
    '',
    '### Expansion opportunities (high impressions, weak rank/CTR)',
    ...(brief.opportunityKeywords.length
      ? brief.opportunityKeywords.map(
          (q) => `- "${q.term}" — imp ${q.impressions}, pos ${q.position.toFixed(1)}, CTR ${(q.ctr * 100).toFixed(2)}%`,
        )
      : ['- (none for this topic)']),
    '',
    '### Related estate pages (internal-link targets)',
    ...(brief.relatedPages.length
      ? brief.relatedPages.map(
          (p) => `- ${p.url} (imp ${p.impressions}, pos ${p.position.toFixed(1)}, CTR ${(p.ctr * 100).toFixed(2)}%)`,
        )
      : ['- (none)']),
    '',
    '### Strategy rules (from estate GSC plan)',
    ...brief.strategyHints.map((h) => `- ${h}`),
  ]
  if (brief.warnings.length) {
    lines.push('', '### Warnings', ...brief.warnings.map((w) => `- ${w}`))
  }
  return lines.filter(Boolean).join('\n')
}
