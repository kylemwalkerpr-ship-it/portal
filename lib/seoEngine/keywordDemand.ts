/**
 * Market-demand keyword layer for the SEO Master Engine.
 *
 * GSC is owned-site demand (queries we already appear for). The caseworks
 * Google Ads Keyword Planner export is *market* demand — volume we should
 * plan for even when the property has no impressions yet.
 *
 * Loaded from public/seo-data/keyword-demand.json. Filtered through the
 * same junk + ontology matcher the planner uses, then:
 *   - ingested into seo_knowledge on every knowledge run
 *   - merged into planner signals (log-scaled so 1.2M head terms cannot
 *     drown a 90-impression GSC ranking gap)
 */
import { loadKeywordDemandFile } from '@/lib/seoDataLoaders'
import { isJunkQuery } from '@/lib/seoFactory/queryNoise'
import { createSupabaseAdminClient } from '@/lib/supabase'
import {
  bestCellForTerm,
  MIN_CELL_MATCH_SCORE,
  normalizePlannerTopic,
  type GscSignalInput,
} from './planner'
import type { Country } from './ontology'

export const KEYWORD_DEMAND_SOURCE_ID = 'keyword-demand'
export const KEYWORD_DEMAND_SOURCE_LABEL = 'Caseworks keyword demand (Ads)'

const DEDUPE_STOP = new Set(['and', 'the', 'for', 'of', 'a', 'an', 'to', 'in', 'on', 'at', 'or'])

export function isServiceNavigationalQuery(term: string): boolean {
  const t = String(term || '').toLowerCase()
  if (!/\b(attorney|lawyer|solicitor|consultant|law firm)\b/.test(t)) return false
  return !/\b(green card|visa|opt|ilr|spouse|student|work permit|485|f-?1|citizenship|permanent residence)\b/.test(t)
}

/**
 * Two-word heads like "student visa" / "work visas" are real market demand
 * but they are too generic to become a cluster primary — they drown GSC
 * gaps. Keep them as knowledge tags; only distinctive phrases plan.
 */
export function isThinMarketTerm(term: string): boolean {
  const words = normalizePlannerTopic(term).split(' ').filter(Boolean)
  if (words.length >= 3 && new Set(words).size >= 2) return false
  return !/\b(opt|stem|h-?1b|f-?1|485|ilr|cas|pte|n-?400|i-?485|i-?130|k-?1)\b/i.test(term)
}

export function demandDedupeKey(term: string, country: string, stage: string): string {
  const tokens = [...new Set(
    normalizePlannerTopic(term)
      .split(' ')
      .filter((w) => w.length > 2 && !DEDUPE_STOP.has(w)),
  )].sort()
  return `${country}|${stage}|${tokens.join(' ')}`
}

/** Ads volume is market-wide; log-scale it into GSC-like impressions. */
export function volumeToPlannerImpressions(volume: number): number {
  const v = Math.max(0, Number(volume) || 0)
  return Math.max(12, Math.round(Math.log10(v + 10) * 18))
}

/**
 * Ads `competitionIndex` in keyword-demand.json is 0–100 integers.
 * Ubersuggest-style 0–1 fractions still scale ×100. Values of exactly 1 stay
 * as KD 1 (the Ads file ships integer 1 for easy terms).
 */
export function competitionIndexToKd(index: number): number {
  const v = Number(index)
  if (!Number.isFinite(v) || v < 0) return 0
  if (v > 0 && v < 1) return Math.round(v * 100)
  return Math.round(Math.min(100, v))
}

export interface KeywordDemandCandidate {
  term: string
  volume: number
  competition: string
  competitionIndex: number
  stage: string
  country: Country
  matchScore: number
  impressions: number
}

export function selectKeywordDemandCandidates(
  rows: Array<{
    term?: string
    volume?: number
    competition?: string
    competitionIndex?: number
  }>,
  opts: { forPlanner?: boolean } = {},
): KeywordDemandCandidate[] {
  const best = new Map<string, KeywordDemandCandidate>()
  for (const row of rows) {
    const term = String(row.term || '').trim()
    if (!term || isJunkQuery(term) || isServiceNavigationalQuery(term)) continue
    if (opts.forPlanner && isThinMarketTerm(term)) continue
    const match = bestCellForTerm(term)
    if (match.score < MIN_CELL_MATCH_SCORE || !match.stage) continue
    const volume = Math.max(0, Number(row.volume) || 0)
    const candidate: KeywordDemandCandidate = {
      term,
      volume,
      competition: String(row.competition || 'UNSPECIFIED'),
      competitionIndex: Number(row.competitionIndex) || 0,
      stage: match.stage,
      country: match.country,
      matchScore: match.score,
      impressions: volumeToPlannerImpressions(volume),
    }
    const key = demandDedupeKey(term, match.country, match.stage)
    const existing = best.get(key)
    if (!existing || candidate.volume > existing.volume) best.set(key, candidate)
  }
  return Array.from(best.values()).sort((a, b) => b.volume - a.volume)
}

export async function loadKeywordDemandSignals(limit = 80): Promise<GscSignalInput[]> {
  try {
    const file = await loadKeywordDemandFile()
    const cap = Math.max(1, Math.min(150, limit))
    return selectKeywordDemandCandidates(file.rows, { forPlanner: true }).slice(0, cap).map((c) => ({
      term: c.term,
      clicks: 0,
      impressions: c.impressions,
      position: 80,
      ctr: 0,
      source: 'ads' as const,
      volume: c.volume,
      keywordDifficulty: competitionIndexToKd(c.competitionIndex),
    }))
  } catch {
    return []
  }
}

function mergeTwo(a: GscSignalInput[], b: GscSignalInput[]): GscSignalInput[] {
  const byTerm = new Map<string, GscSignalInput>()
  for (const s of a) {
    const k = normalizePlannerTopic(s.term)
    if (!k) continue
    byTerm.set(k, { ...s })
  }
  for (const s of b) {
    const k = normalizePlannerTopic(s.term)
    if (!k) continue
    const existing = byTerm.get(k)
    if (existing) {
      existing.impressions = Math.max(existing.impressions, s.impressions)
      if ((existing.clicks || 0) === 0 && (s.clicks || 0) > 0) {
        existing.clicks = s.clicks
        existing.position = s.position
        existing.ctr = s.ctr
      }
      const rev = Math.max(Number(existing.revenue) || 0, Number(s.revenue) || 0)
      const purch = Math.max(Number(existing.purchases) || 0, Number(s.purchases) || 0)
      if (rev > 0) existing.revenue = rev
      if (purch > 0) existing.purchases = purch
      const vol = Math.max(Number(existing.volume) || 0, Number(s.volume) || 0)
      if (vol > 0) existing.volume = vol
      if (existing.keywordDifficulty == null && s.keywordDifficulty != null) {
        existing.keywordDifficulty = s.keywordDifficulty
      }
      if (s.source === 'ubersuggest' || existing.source === 'ubersuggest') {
        existing.source = (existing.clicks || 0) > 0 ? existing.source : 'ubersuggest'
      }
    } else {
      byTerm.set(k, { ...s })
    }
  }
  return Array.from(byTerm.values())
}

export function mergeDemandSignals(head: GscSignalInput[], ...more: GscSignalInput[][]): GscSignalInput[] {
  return more.reduce((acc, list) => mergeTwo(acc, list), head)
}

export interface KeywordResearchRow {
  term: string
  volume?: number
  keywordDifficulty?: number
}

/** Join Ads / cached Ubersuggest volume + KD onto GSC-shaped `{ term }` rows. */
export function attachKeywordResearch<T extends { term: string }>(
  rows: T[],
  research: KeywordResearchRow[],
): Array<T & { volume?: number; keywordDifficulty?: number }> {
  const indexed = research
    .map((r) => ({
      key: normalizePlannerTopic(r.term),
      volume: Math.max(0, Number(r.volume) || 0),
      keywordDifficulty:
        r.keywordDifficulty != null && Number.isFinite(Number(r.keywordDifficulty))
          ? Number(r.keywordDifficulty)
          : undefined,
    }))
    .filter((r) => r.key && (r.volume > 0 || r.keywordDifficulty != null))
  if (!indexed.length) return rows
  return rows.map((row) => {
    const key = normalizePlannerTopic(row.term)
    if (!key) return row
    let best: (typeof indexed)[number] | null = null
    let bestScore = -1
    for (const r of indexed) {
      let score = -1
      if (key === r.key) score = 1_000_000 + r.volume
      else if (key.includes(r.key) || r.key.includes(key)) score = r.key.length * 10 + r.volume / 1e6
      if (score > bestScore) {
        bestScore = score
        best = r
      }
    }
    if (!best) return row
    const current = row as T & { volume?: number; keywordDifficulty?: number }
    const volume = current.volume == null && best.volume > 0 ? best.volume : current.volume
    const keywordDifficulty =
      current.keywordDifficulty == null && best.keywordDifficulty != null
        ? best.keywordDifficulty
        : current.keywordDifficulty
    if (volume == null && keywordDifficulty == null) return row
    return { ...row, ...(volume != null ? { volume } : {}), ...(keywordDifficulty != null ? { keywordDifficulty } : {}) }
  })
}

/**
 * Local keyword-research index for War Room / opportunities.
 * Always reads keyword-demand.json. Optionally forwards KD/volume already
 * stamped on Ubersuggest lastGoodSignals — never a live MCP pull.
 */
export async function loadKeywordResearchIndex(): Promise<KeywordResearchRow[]> {
  const out: KeywordResearchRow[] = []
  try {
    const file = await loadKeywordDemandFile()
    for (const c of selectKeywordDemandCandidates(file.rows)) {
      out.push({
        term: c.term,
        volume: c.volume,
        keywordDifficulty: competitionIndexToKd(c.competitionIndex),
      })
    }
  } catch {
    /* ads file optional */
  }
  try {
    const { loadUbersuggestConfig } = await import('./ubersuggest')
    const cfg = await loadUbersuggestConfig()
    for (const row of cfg.lastGoodSignals || []) {
      const rec = row as { term?: string; volume?: number; keywordDifficulty?: number }
      const term = String(rec.term || '').trim()
      if (!term) continue
      if (rec.volume == null && rec.keywordDifficulty == null) continue
      out.push({
        term,
        volume: rec.volume,
        keywordDifficulty: rec.keywordDifficulty,
      })
    }
  } catch {
    /* cached uber optional — no live MCP */
  }
  return out
}

export async function ingestKeywordDemandSource(opts: {
  limit?: number
}): Promise<{ fetched: number; stored: number; skipped: number; error?: string }> {
  const limit = Math.max(1, Math.min(120, opts.limit ?? 80))
  try {
    const file = await loadKeywordDemandFile()
    const fetched = file.rows.length
    const selected = selectKeywordDemandCandidates(file.rows).slice(0, limit)
    const skipped = Math.max(0, fetched - selected.length)
    const supabase = createSupabaseAdminClient()
    const rows = selected.map((c) => {
      const slug = normalizePlannerTopic(c.term).replace(/\s+/g, '-')
      const dedupeKey = `keyword-demand://${slug}`
      const summary =
        `Market demand ${c.volume.toLocaleString('en-US')} monthly searches · ` +
        `competition ${c.competition} (${c.competitionIndex}) · ` +
        `lifecycle ${c.stage}/${c.country}.`
      return {
        source: KEYWORD_DEMAND_SOURCE_ID,
        source_label: KEYWORD_DEMAND_SOURCE_LABEL,
        kind: 'trend',
        url: dedupeKey,
        title: c.term.slice(0, 500),
        summary,
        ai_summary: summary,
        tags: [c.stage, c.country.toLowerCase(), 'keyword-demand'],
        countries: [c.country],
        stages: [c.stage],
        confidence: Math.min(0.86, 0.45 + Math.log10(c.volume + 10) / 12),
        published_at: file.updatedAt || null,
        dedupe_key: dedupeKey,
      }
    })
    const { error } = await supabase.from('seo_knowledge').upsert(rows, { onConflict: 'dedupe_key' })
    if (error && !/42P01|relation .* does not exist/i.test(error.message)) {
      return { fetched, stored: 0, skipped, error: error.message.slice(0, 160) }
    }
    return { fetched, stored: error ? 0 : rows.length, skipped }
  } catch (e) {
    return {
      fetched: 0,
      stored: 0,
      skipped: 0,
      error: e instanceof Error ? e.message.slice(0, 160) : 'keyword-demand ingest failed',
    }
  }
}
