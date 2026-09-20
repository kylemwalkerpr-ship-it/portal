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
import { getAllSubcategories, getCategoryById } from '@/lib/categories'
import {
  getMarketplaceBaseUrl,
  marketplaceCategoryHref as canonicalMarketplaceCategoryHref,
  parseCanonicalMarketplaceCategoryUrl,
} from '@/lib/marketplaceSeo'

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
  // Marketplace canonical host — derived from the shared canonical authority
  // (lib/marketplaceSeo.ts), never hard-coded. The retired
  // portal.yousafeconsultancy.com Marketplace base must never be emitted.
  market: getMarketplaceBaseUrl(),
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

/**
 * Resolve a stage service key (e.g. 'study-permits') to a REAL
 * marketplace URL. Public category pages live at /categories/<id> on
 * market.yousafeconsultancy.com — the retired
 * portal.yousafeconsultancy.com/marketplace/... form is never emitted.
 */
export function marketplaceCategoryHref(service: string): string {
  const id = String(service || '').trim()
  const isValid =
    Boolean(getCategoryById(id)) ||
    getAllSubcategories().some((s) => s.id === id)
  const resolved = isValid ? id : 'immigration'
  return canonicalMarketplaceCategoryHref(resolved)
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
  push({
    targetUrl: marketplaceCategoryHref(service),
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

/**
 * Lifecycle states that may feed AUTOMATIC drafting suggestions under today's
 * schema: `planned` (suggest it) and `applied` (already executed). `rejected`,
 * `manual`, `paused` and `awaiting_gate` are lifecycle decisions — never
 * suggest them automatically.
 */
export const PLAN_ELIGIBLE_INTERLINK_STATUSES = ['planned', 'applied'] as const

const PLAN_ELIGIBLE_STATUS_SET: ReadonlySet<string> = new Set(PLAN_ELIGIBLE_INTERLINK_STATUSES)

/**
 * Verification verdicts that are durable proof the edge must NOT be suggested:
 * the target is dead (`target_not_live`) or the source itself is gone
 * (`source_not_live`). `absent` is a per-source verdict for a live page that
 * did not embed the edge — it does not prove the target dead, so such rows may
 * still be suggested while they wait for a re-verification. Applied rows are
 * exposed by their own row proof and keep their lifecycle guard.
 */
const PLAN_INELIGIBLE_VERIFICATION_STATES: ReadonlySet<string> = new Set([
  'target_not_live',
  'source_not_live',
])

/**
 * Load the engine's PERSISTED interlink edges for a lifecycle cell —
 * `seo-<country>-<stage>-%` source slugs (planner missions). Shaped like the
 * Opportunity Radar's interlink options so the pipeline's interlinkAllowlist
 * contract accepts them: the writer is told to embed them as internal links
 * and the ship-time link audit treats them as allowlisted targets.
 *
 * Plan-eligible only: planned/applied may be suggested; gate-rejected or
 * manually held edges must never leak into automatic drafting.
 */
export async function loadEngineInterlinksForCell(
  stage: string,
  country: Country,
  limit = 5,
): Promise<Array<{ label?: string; url?: string; site?: string; matchedOn?: string[] }>> {
  try {
    const supabase = createSupabaseAdminClient()
    const readCell = (columns: string) =>
      supabase
        .from('seo_interlinks')
        .select(columns)
        .ilike('source_slug', `seo-${country.toLowerCase()}-${stage}-%`)
        .in('status', [...PLAN_ELIGIBLE_INTERLINK_STATUSES])
        .order('score', { ascending: false })
        .limit(limit)
    let { data, error } = await readCell(
      'target_url,target_host,anchor_text,reason,status,verification_state',
    )
    // PARTIAL-migration observability: the additive P6 `verification_state`
    // column may not be deployed yet (the pre-P6 table and its columns do
    // exist). That is NOT "zero candidates" — retry the legacy select without
    // it and treat every verdict as unknown, with an explicit warning.
    //
    // Signature-narrowed: ONLY a missing-object error that names
    // `verification_state` is that known state. A generic "does not exist"
    // naming any other object (a dropped table, a typo'd column, a true
    // pre-migration schema with no P6 columns at all) must NOT be relabelled
    // as "verification_state unavailable" and retried — it falls through to
    // the fail-closed path below with its REAL error.
    const message = String(error?.message || '')
    if (error && /verification_state/i.test(message)) {
      console.warn(
        '[seoEngine/interlink] verification_state unavailable (partial P6 migration) — retrying the legacy select; verdicts treated as unknown:',
        message,
      )
      const legacy = await readCell('target_url,target_host,anchor_text,reason,status')
      data = legacy.data
      error = legacy.error
    }
    // Any other DB failure fails closed AND stays observable: a permission /
    // RLS / network error must never look like an empty (zero-candidate) cell.
    if (error) {
      console.warn(
        '[seoEngine/interlink] loadEngineInterlinksForCell failed — no interlink suggestion is offered (fail closed):',
        String(error.message || error),
      )
      return []
    }
    const rows = (data as Array<Record<string, unknown>>) || []
    // Defence-in-depth: even if a caller's query ever stops filtering, an
    // ineligible lifecycle row — or a row whose durable verification verdict
    // already proved the target/source dead — can never reach automatic
    // suggestions.
    return rows
      .filter((r) => PLAN_ELIGIBLE_STATUS_SET.has(String(r.status || 'planned')))
      .filter((r) => !PLAN_INELIGIBLE_VERIFICATION_STATES.has(String(r.verification_state || '')))
      .map((r) => ({
        label: String(r.anchor_text || r.target_url || ''),
        url: String(r.target_url || ''),
        site: String(r.target_host || ''),
        matchedOn: [String(r.reason || 'engine_interlink')],
      }))
  } catch (error) {
    console.warn(
      '[seoEngine/interlink] loadEngineInterlinksForCell threw — no interlink suggestion is offered (fail closed):',
      error instanceof Error ? error.message : error,
    )
    return []
  }
}

/**
 * Comparison key for target liveness proof: host lowercased, fragment
 * dropped, trailing slashes stripped (root preserved), query kept strict.
 */
function interlinkTargetKey(url: string): string {
  const raw = String(url || '').trim()
  if (!raw) return ''
  try {
    const parsed = new URL(raw)
    const path = (parsed.pathname || '/').replace(/\/+$/, '') || '/'
    return `${parsed.protocol}//${parsed.host.toLowerCase()}${path}${parsed.search}`
  } catch {
    let out = raw.split('#')[0]
    if (out.length > 1) out = out.replace(/\/+$/, '')
    return out
  }
}

/**
 * Keep only edges whose target URL the live-validity authority proved live.
 * Pure: the caller supplies the verified live URLs, so this is directly
 * unit-testable and never invents a replacement target.
 */
export function selectLiveInterlinkEdges(edges: InterlinkEdge[], liveUrls: string[]): InterlinkEdge[] {
  const liveKeys = new Set((liveUrls || []).map((url) => interlinkTargetKey(url)).filter(Boolean))
  if (!liveKeys.size) return []
  return edges.filter((edge) => liveKeys.has(interlinkTargetKey(String(edge.targetUrl || ''))))
}

/**
 * Persist ontology interlink edges for planner missions (idempotent upsert).
 *
 * FAIL-CLOSED TARGET GATE (P6): generated edges only persist when the exact
 * target URL is proven live by the existing link-validity authority
 * (`filterLiveInternalUrls`). Synthetic journey/cross-country/cluster targets
 * that 404 today are expected P6 hygiene: they are counted in `filtered` and
 * persist ZERO rows instead of becoming planner backlog — that is NOT an
 * error. A verifier exception/unavailability (or a DB write failure) IS one:
 * it persists zero unverified edges AND returns a truthful error. No
 * replacement URL is ever invented.
 */
export async function persistPlannerInterlinks(
  plans: Array<{
    clusterId: string
    stage: string
    country: Country
    relatedTerms?: string[]
    plan: { contentType: ContentType }
  }>,
): Promise<{ stored: number; filtered: number; errors: string[] }> {
  let stored = 0
  let filtered = 0
  const errors: string[] = []
  for (const p of plans) {
    if (!p.clusterId || !p.stage || !p.country) continue
    const edges = generateInterlinkPlan({
      sourceSlug: p.clusterId,
      stage: p.stage,
      country: p.country,
      contentType: p.plan.contentType,
      clusterId: p.clusterId,
      relatedTerms: p.relatedTerms,
    })
    const persisted = await persistInterlinkPlan(edges)
    stored += persisted.stored
    filtered += persisted.filtered
    if (persisted.error) errors.push(`${p.clusterId}: ${persisted.error}`)
  }
  return { stored, filtered, errors }
}

/**
 * Fail-closed validation for `marketplace_cta` edges.
 *
 * Every marketplace_cta edge must persist exactly the canonical public
 * Marketplace category URL (`https://market.yousafeconsultancy.com/categories/<id>`
 * with a real category/subcategory id) and targetHost 'market'. Returns a
 * description of the first offending edge, or null when all marketplace_cta
 * edges are canonical. Non-marketplace_cta reasons are deliberately untouched:
 * legitimate Portal/auth targets remain allowed for other reasons.
 */
export function findNoncanonicalMarketplaceCta(edges: InterlinkEdge[]): string | null {
  for (const edge of edges) {
    if (edge.reason !== 'marketplace_cta') continue
    const canonical = parseCanonicalMarketplaceCategoryUrl(edge.targetUrl)
    if (!canonical || edge.targetHost !== 'market') {
      return `${edge.targetUrl} (targetHost=${edge.targetHost})`
    }
  }
  return null
}

export async function persistInterlinkPlan(
  edges: InterlinkEdge[],
): Promise<{ stored: number; filtered: number; error?: string }> {
  if (!edges.length) return { stored: 0, filtered: 0 }
  // Validate BEFORE the Supabase client exists: one noncanonical
  // marketplace_cta edge rejects the whole batch atomically (zero writes) —
  // never normalized, never partially stored, never silently reinterpreted
  // as the default category.
  const noncanonical = findNoncanonicalMarketplaceCta(edges)
  if (noncanonical) {
    return {
      stored: 0,
      filtered: 0,
      error: `marketplace_cta target is not a canonical Marketplace category URL: ${noncanonical}`.slice(0, 300),
    }
  }
  // FAIL-CLOSED target liveness gate. Runs before the Supabase client exists
  // and before any write: zero unverified edges persist, and a verifier throw
  // (unavailable) is reported truthfully instead of silently storing a dead
  // planner target. Never substitutes a replacement URL.
  let verifiedEdges: InterlinkEdge[]
  try {
    const { filterLiveInternalUrls } = await import('@/lib/seoFactory/linkAudit')
    const targetUrls = [...new Set(edges.map((e) => String(e.targetUrl || '').trim()).filter(Boolean))]
    const liveUrls = await filterLiveInternalUrls(targetUrls)
    verifiedEdges = selectLiveInterlinkEdges(edges, liveUrls || [])
  } catch (e) {
    return {
      stored: 0,
      filtered: 0,
      error: `internal target liveness verification failed — persisted zero unverified edges: ${e instanceof Error ? e.message : 'verifier error'}`.slice(0, 300),
    }
  }
  // Successfully checked-and-rejected targets (dead/synthetic 404s, legacy
  // auth walls) are expected P6 hygiene: report the truthful `filtered` count
  // and persist nothing for them. This is never a fatal engine error.
  const filtered = edges.length - verifiedEdges.length
  if (!verifiedEdges.length) return { stored: 0, filtered }
  try {
    const supabase = createSupabaseAdminClient()
    // Replanning (idempotent upsert on source_slug,target_url) may only rewrite
    // plan metadata. Lifecycle truth — status, applied_at, gate_state/reason/
    // actor/timestamps, and the P6 verification/job truth (source_url,
    // source_job_id, verification_state, verified_at, verification_evidence,
    // verification_attempted_at, staged_at)
    // — belongs to the ship loop, the live verifier and the compliance gate,
    // so those columns are deliberately omitted from the payload. With
    // `defaultToNull: false`
    // PostgREST sends `Prefer: missing=default`: on INSERT the omitted columns
    // take their DB defaults (status -> 'planned'), while on conflict only the
    // keys present here are updated. No read-before-write race needed.
    const rows = verifiedEdges.map((e) => ({
      source_slug: e.sourceSlug,
      target_url: e.targetUrl,
      target_host: e.targetHost,
      anchor_text: e.anchorText,
      context_h2: e.contextH2 || null,
      reason: e.reason,
      score: e.score,
      cluster_id: e.clusterId || null,
    }))
    const { error } = await supabase
      .from('seo_interlinks')
      .upsert(rows, { onConflict: 'source_slug,target_url', defaultToNull: false })
    if (error) {
      // A missing table (migration not applied) is just as real a failure as
      // any other — never mask it as "nothing to store".
      return { stored: 0, filtered, error: error.message.slice(0, 300) }
    }
    return { stored: rows.length, filtered }
  } catch (e) {
    return { stored: 0, filtered, error: e instanceof Error ? e.message.slice(0, 300) : 'persist failed' }
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
      // Count strictly: `applied` is the only executed state; `planned` only
      // when status is actually planned. Gate states must not be relabelled.
      if (r.status === 'applied') applied += 1
      else if (r.status === 'planned') planned += 1
    }
    return { edges: rows, byReason, applied, planned }
  } catch {
    return { edges: [], byReason: {}, applied: 0, planned: 0 }
  }
}

/**
 * Persisted-state inspector for a single (stage × country) cell.
 *
 * Aggregates everything in `seo_interlinks` whose target URL belongs to the
 * given country, broken down by reason, status, and neighbour stage (the slug
 * encodes `<stage>-<country>` via the planner's deterministic builder).
 *
 * This is what the Launch-tab stage panel uses to render its persisted footer
 * — the operator sees the real, currently-persisted plan for that cell, not
 * just the in-memory recompute result.
 */
export async function loadPersistedCell(opts: {
  stage: string
  country: Country
  sourceSlug?: string
}): Promise<{
  stage: string
  country: string
  total: number
  applied: number
  planned: number
  byReason: Record<string, number>
  byStatus: Record<string, number>
  byStage: Array<{ stage: string; count: number }>
  topTargets: Array<{ url: string; host: string; anchor: string; reason: string; score: number; status: string }>
  manualRows: Array<{ url: string; anchor: string; gate_reason: string | null; gate_actor: string | null; gate_updated_at: string | null }>
  lastUpdated: string | null
}> {
  const empty = {
    stage: opts.stage, country: opts.country,
    total: 0, applied: 0, planned: 0,
    byReason: {} as Record<string, number>,
    byStatus: {} as Record<string, number>,
    byStage: [] as Array<{ stage: string; count: number }>,
    topTargets: [] as Array<{ url: string; host: string; anchor: string; reason: string; score: number; status: string }>,
    manualRows: [] as Array<{ url: string; anchor: string; gate_reason: string | null; gate_actor: string | null; gate_updated_at: string | null }>,
    lastUpdated: null as string | null,
  }
  try {
    const supabase = createSupabaseAdminClient()
    let q = supabase
      .from('seo_interlinks')
      .select('id,source_slug,target_url,target_host,anchor_text,reason,score,status,created_at,updated_at,cluster_id,gate_reason,gate_actor,gate_updated_at')
    if (opts.sourceSlug) {
      q = q.eq('source_slug', opts.sourceSlug)
    } else {
      // Planner slugs are `seo-<country>-<stage>-<topic-stem>` (plannerClusterId
      // builds `seo-${country}-${stage}-${stem}`). The old `%-<stage>-<country>-%`
      // order never matched, so this inspector always reported an empty cell.
      const countrySlug = opts.country.toLowerCase()
      q = q.ilike('source_slug', `seo-${countrySlug}-${opts.stage}-%`)
    }
    const { data } = await q.order('score', { ascending: false }).limit(200)
    const rows = (data as Array<Record<string, unknown>>) || []
    if (!rows.length) return empty
    const byReason: Record<string, number> = {}
    const byStatus: Record<string, number> = {}
    const byStageMap: Record<string, number> = {}
    let applied = 0
    let planned = 0
    let lastUpdated: string | null = null
    const topTargets: typeof empty.topTargets = []
    const manualRows: typeof empty.manualRows = []
    for (const r of rows) {
      const reason = String(r.reason || 'ontology_neighbor')
      const status = String(r.status || 'planned')
      const srcSlug = String(r.source_slug || '')
      byReason[reason] = (byReason[reason] || 0) + 1
      byStatus[status] = (byStatus[status] || 0) + 1
      // Planner slug layout: `seo-<country>-<stage>-<stem>`
      const countrySlug = opts.country.toLowerCase()
      const stem = srcSlug.startsWith(`seo-${countrySlug}-`)
        ? srcSlug.slice(`seo-${countrySlug}-`.length)
        : srcSlug
      const stageKey = stem.split('-')[0]
      if (stem !== srcSlug && stageKey) byStageMap[stageKey] = (byStageMap[stageKey] || 0) + 1
      // Count strictly; byStatus above keeps every other lifecycle state
      // (rejected/manual/paused/awaiting_gate) visible instead of folding it
      // into the planned tally.
      if (status === 'applied') applied += 1
      else if (status === 'planned') planned += 1
      const u = String(r.updated_at || r.created_at || '')
      if (u && (!lastUpdated || u > lastUpdated)) lastUpdated = u
      topTargets.push({
        url: String(r.target_url || ''),
        host: String(r.target_host || ''),
        anchor: String(r.anchor_text || ''),
        reason,
        score: Number(r.score) || 0,
        status,
      })
      if (['manual', 'paused', 'awaiting_gate', 'rejected'].includes(status)) {
        manualRows.push({
          url: String(r.target_url || ''),
          anchor: String(r.anchor_text || ''),
          gate_reason: (r.gate_reason as string) || null,
          gate_actor: (r.gate_actor as string) || null,
          gate_updated_at: (r.gate_updated_at as string) || null,
        })
      }
    }
    return {
      stage: opts.stage, country: opts.country,
      total: rows.length, applied, planned,
      byReason, byStatus, byStage: Object.entries(byStageMap).map(([stage, count]) => ({ stage, count })),
      topTargets: topTargets.slice(0, 6),
      manualRows: manualRows.slice(0, 4),
      lastUpdated,
    }
  } catch {
    return empty
  }
}
