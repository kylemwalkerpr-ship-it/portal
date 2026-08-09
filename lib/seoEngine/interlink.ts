/**
 * lib/seoEngine/interlink.ts
 *
 * AUTO-INTERLINK GENERATOR
 *
 * The estate's interlinking used to be a manual afterthought. This module makes
 * it automatic and verifiable: for any planned cluster or published article it
 * produces a scored set of interlink edges — who links to whom, with which
 * anchor, in which H2, for which strategic reason — and persists them to
 * `seo_interlinks`.
 *
 * Link reasons (each maps to a real SEO rationale):
 *   ontology_neighbor → journey step before/after in the same country
 *   cross_country     → same stage in another country (comparison traffic)
 *   marketplace_cta   → the marketplace category that monetises this stage
 *   cluster_related   → sibling terms in the same cluster (topical depth)
 *   journey_next      → forward step in the funnel
 *   journey_prev      → backward step in the funnel
 *
 * Scoring: ontology edges (0.9) > marketplace CTA (0.85 for bottom-funnel) >
 * cross-country (0.7) > cluster siblings (0.6). Anchors are descriptive,
 * keyword-bearing phrases (Google link best practices — never "click here").
 */

import { createSupabaseAdminClient } from '@/lib/supabase'
import {
  LIFECYCLE_STAGES,
  COUNTRIES,
  getStage,
  cellId,
  primaryServiceFor,
  targetsFor,
  type Country,
} from './ontology'
import { ESTATE_REPOS, type ContentType } from './ontology'

export type InterlinkReason =
  | 'ontology_neighbor'
  | 'marketplace_cta'
  | 'cluster_related'
  | 'journey_next'
  | 'journey_prev'
  | 'cross_country'

export interface InterlinkEdge {
  sourceSlug: string
  targetUrl: string
  targetHost: string
  anchorText: string
  contextH2?: string
  reason: InterlinkReason
  score: number
  clusterId?: string
}

/** Estate host → canonical base URL (mirrors ownership registry). */
export const ESTATE_BASE: Record<string, string> = {
  legal: 'https://legal.yousafeconsultancy.com',
  usa: 'https://usa.yousafeconsultancy.com',
  uk: 'https://uk.yousafeconsultancy.com',
  ca: 'https://ca.yousafeconsultancy.com',
  au: 'https://au.yousafeconsultancy.com',
  apex: 'https://yousafeconsultancy.com',
  market: 'https://portal.yousafeconsultancy.com',
}

export interface InterlinkPlanInput {
  sourceSlug: string
  stage: string
  country: Country
  clusterId?: string
  contentType: ContentType
  relatedTerms?: string[]
  serviceCategory?: string
}

function hostForContentType(ct: ContentType): string {
  return ESTATE_REPOS[ct].repo === 'yousafe-consultancy'
    ? 'apex'
    : ESTATE_REPOS[ct].repo === 'caseworks'
      ? 'legal'
      : 'market'
}

function slugAnchor(slug: string): string {
  return slug
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
}

/** Deterministic anchor from term + stage label (descriptive, keyword-bearing). */
export function anchorFor(term: string, stageLabel: string): string {
  const clean = term.replace(/['"]/g, '').trim()
  if (clean.split(' ').length <= 4) return `${clean} — ${stageLabel.toLowerCase()} guide`
  return clean
}

/**
 * Generate the full interlink plan for a source page (or planned cluster).
 * Deterministic — same inputs produce the same edges (auditable, testable).
 */
export function generateInterlinkPlan(input: InterlinkPlanInput): InterlinkEdge[] {
  const edges: InterlinkEdge[] = []
  const stageDef = getStage(input.stage)
  if (!stageDef) return edges

  const country = input.country
  const cell = stageDef.countries[country]
  const sourceSlug = input.sourceSlug
  const stageLabel = stageDef.label
  const clusterId = input.clusterId

  const push = (e: Omit<InterlinkEdge, 'sourceSlug' | 'clusterId'> & { clusterId?: string }) => {
    // de-dup by target
    if (edges.some((x) => x.targetUrl === e.targetUrl)) return
    edges.push({ ...e, sourceSlug, clusterId: e.clusterId ?? clusterId })
  }

  // 1. Journey neighbors (prev/next in the same country) — strongest edges
  const neighbors = cell.neighbors
  if (neighbors.prev) {
    const prev = getStage(neighbors.prev)
    if (prev) {
      push({
        targetUrl: `${ESTATE_BASE[hostForContentType(prev.contentTypes[0])]}/${country.toLowerCase()}/${neighbors.prev}`,
        targetHost: hostForContentType(prev.contentTypes[0]),
        anchorText: anchorFor(`${prev.label} in ${country}`, prev.label),
        contextH2: `The path before: ${prev.label}`,
        reason: 'journey_prev',
        score: 0.9,
      })
    }
  }
  if (neighbors.next) {
    const next = getStage(neighbors.next)
    if (next) {
      push({
        targetUrl: `${ESTATE_BASE[hostForContentType(next.contentTypes[0])]}/${country.toLowerCase()}/${neighbors.next}`,
        targetHost: hostForContentType(next.contentTypes[0]),
        anchorText: anchorFor(`${next.label} in ${country}`, next.label),
        contextH2: `What comes next: ${next.label}`,
        reason: 'journey_next',
        score: 0.9,
      })
    }
  }

  // 2. Cross-country comparison (same stage, other countries)
  for (const across of neighbors.across || []) {
    const [sKey, cKey] = across.split('|')
    const acrossCountry = (cKey || '').toUpperCase() as Country
    if (!COUNTRIES.includes(acrossCountry) || !getStage(sKey)) continue
    const acrossStage = getStage(sKey)!
    push({
      targetUrl: `${ESTATE_BASE[hostForContentType(acrossStage.contentTypes[0])]}/${cKey}/${sKey}`,
      targetHost: hostForContentType(acrossStage.contentTypes[0]),
      anchorText: `${stageLabel} in ${acrossCountry} vs ${country}: key differences`,
      contextH2: `Compare: ${acrossCountry} and ${country}`,
      reason: 'cross_country',
      score: 0.7,
    })
  }

  // 3. Marketplace CTA — the page that monetises this stage
  const service = input.serviceCategory || primaryServiceFor(stageDef)
  const marketHost = ESTATE_BASE.market
  push({
    targetUrl: `${marketHost}/marketplace/category/${service}`,
    targetHost: 'market',
    anchorText: `Find ${service.replace(/-/g, ' ')} help on the marketplace`,
    contextH2: 'Get professional help',
    reason: 'marketplace_cta',
    score: stageDef.funnel === 'bottom' ? 0.85 : 0.75,
  })

  // 4. Cluster siblings (related terms → same-stage sibling pages)
  for (const term of (input.relatedTerms || []).slice(0, 3)) {
    const slug = `seo-${term.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)}`
    push({
      targetUrl: `${ESTATE_BASE[hostForContentType(input.contentType)]}/${country.toLowerCase()}/${slug}`,
      targetHost: hostForContentType(input.contentType),
      anchorText: anchorFor(term, stageLabel),
      contextH2: `Related: ${stageLabel}`,
      reason: 'cluster_related',
      score: 0.6,
    })
  }

  // Sort: strongest first
  return edges.sort((a, b) => b.score - a.score)
}

/** Compact prompt context for the AI generator: the interlinks to embed. */
export function interlinkPromptBlock(edges: InterlinkEdge[]): string {
  if (!edges.length) return ''
  return (
    'INTERNAL LINKS TO EMBED (use these exact anchor texts, once each, in the suggested H2 sections):\n' +
    edges.map((e, i) => `${i + 1}. [${e.anchorText}](${e.targetUrl}) — in "${e.contextH2 || 'relevant section'}"`).join('\n')
  )
}

export async function persistInterlinkPlan(edges: InterlinkEdge[]): Promise<{ stored: number }> {
  if (!edges.length) return { stored: 0 }
  try {
    const supabase = createSupabaseAdminClient()
    const rows = edges.map((e) => ({
      source_slug: e.sourceSlug,
      target_url: e.targetUrl,
      target_host: e.targetHost,
      anchor_text: e.anchorText,
      context_h2: e.contextH2 || null,
      reason: e.reason,
      score: e.score,
      status: 'planned',
      cluster_id: e.clusterId || null,
    }))
    const { error } = await supabase.from('seo_interlinks').upsert(rows, { onConflict: 'source_slug,target_url' })
    if (error) {
      if (/42P01|relation .* does not exist/i.test(error.message)) return { stored: 0 }
      return { stored: 0 }
    }
    return { stored: rows.length }
  } catch {
    return { stored: 0 }
  }
}

export async function markInterlinkApplied(sourceSlugs: string[], targetUrls: string[]): Promise<void> {
  try {
    const supabase = createSupabaseAdminClient()
    for (const slug of sourceSlugs) {
      for (const url of targetUrls) {
        await supabase
          .from('seo_interlinks')
          .update({ status: 'applied', applied_at: new Date().toISOString() })
          .eq('source_slug', slug)
          .eq('target_url', url)
      }
    }
  } catch {
    // best-effort
  }
}

export async function loadInterlinkGraph(limit = 100): Promise<{
  edges: Array<Record<string, unknown>>
  byReason: Record<string, number>
  applied: number
  planned: number
}> {
  try {
    const supabase = createSupabaseAdminClient()
    const { data } = await supabase
      .from('seo_interlinks')
      .select('id,source_slug,target_url,target_host,anchor_text,context_h2,reason,score,status,created_at')
      .order('score', { ascending: false })
      .limit(limit)
    const rows = (data as Array<Record<string, unknown>>) || []
    const byReason: Record<string, number> = {}
    let applied = 0
    let planned = 0
    for (const r of rows) {
      const reason = String(r.reason || 'ontology_neighbor')
      byReason[reason] = (byReason[reason] || 0) + 1
      if (r.status === 'applied') applied += 1
      else planned += 1
    }
    return { edges: rows, byReason, applied, planned }
  } catch {
    return { edges: [], byReason: {}, applied: 0, planned: 0 }
  }
}
