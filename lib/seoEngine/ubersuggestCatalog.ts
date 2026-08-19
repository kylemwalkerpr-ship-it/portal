/**
 * Official Ubersuggest MCP tool map (42 tools, 2026-08 live tools/list).
 *
 * Each tool is assigned an engine layer so Content Studio and the Master
 * Engine know what to spend the per-run call budget on, and what to skip
 * when credits or a paid-only endpoint fail.
 */
export type UberLayer =
  | 'auth'
  | 'keyword'
  | 'domain'
  | 'serp'
  | 'backlink'
  | 'content'
  | 'audit'
  | 'project'
  | 'aisv'
  | 'utility'
  | 'write'

export type UberEngineUse =
  | 'demand'      // planner keyword volume
  | 'owned'       // our domain rank/pages
  | 'competitive' // competitor + SERP context
  | 'content'     // topic ideas
  | 'backlinks'   // link-graph intel snapshot
  | 'health'      // technical audit (paid)
  | 'tracking'    // rank-tracking projects
  | 'llm'         // AI search visibility
  | 'skip'        // auth/write/utility — not a planner input

export interface UberToolSpec {
  name: string
  layer: UberLayer
  engine: UberEngineUse
  /** Planner hot path spends budget here first. */
  hot: boolean
}

export const UBERSUGGEST_OWNED_DOMAIN = 'yousafeconsultancy.com'

export const UBERSUGGEST_TOOL_CATALOG: readonly UberToolSpec[] = [
  { name: 'auth_status', layer: 'auth', engine: 'skip', hot: false },
  { name: 'keyword_overview', layer: 'keyword', engine: 'demand', hot: true },
  { name: 'keyword_suggestions', layer: 'keyword', engine: 'demand', hot: true },
  { name: 'keyword_metrics', layer: 'keyword', engine: 'demand', hot: false },
  { name: 'match_keywords', layer: 'keyword', engine: 'demand', hot: true },
  { name: 'google_suggestions', layer: 'keyword', engine: 'demand', hot: true },
  { name: 'estimate_serp_clicks', layer: 'serp', engine: 'skip', hot: false },
  { name: 'serp_analysis', layer: 'serp', engine: 'competitive', hot: true },
  { name: 'domain_overview', layer: 'domain', engine: 'owned', hot: true },
  { name: 'domain_keywords', layer: 'domain', engine: 'owned', hot: true },
  { name: 'domain_top_pages', layer: 'domain', engine: 'owned', hot: true },
  { name: 'domain_top_countries', layer: 'domain', engine: 'owned', hot: false },
  { name: 'page_overview', layer: 'domain', engine: 'owned', hot: false },
  { name: 'page_keywords', layer: 'domain', engine: 'owned', hot: false },
  { name: 'traffic_value', layer: 'domain', engine: 'owned', hot: false },
  { name: 'competitors', layer: 'domain', engine: 'competitive', hot: false },
  { name: 'backlinks_overview', layer: 'backlink', engine: 'backlinks', hot: true },
  { name: 'backlinks', layer: 'backlink', engine: 'backlinks', hot: false },
  { name: 'anchor_texts', layer: 'backlink', engine: 'backlinks', hot: false },
  { name: 'linking_domains', layer: 'backlink', engine: 'backlinks', hot: false },
  { name: 'backlink_opportunity', layer: 'backlink', engine: 'backlinks', hot: false },
  { name: 'content_ideas', layer: 'content', engine: 'content', hot: true },
  { name: 'page_shares', layer: 'content', engine: 'content', hot: false },
  { name: 'site_audit', layer: 'audit', engine: 'health', hot: false },
  { name: 'site_audit_status', layer: 'audit', engine: 'health', hot: false },
  { name: 'site_audit_results', layer: 'audit', engine: 'health', hot: false },
  { name: 'site_audit_pages', layer: 'audit', engine: 'health', hot: false },
  { name: 'pagespeed_audit', layer: 'audit', engine: 'health', hot: false },
  { name: 'list_projects', layer: 'project', engine: 'tracking', hot: false },
  { name: 'get_project', layer: 'project', engine: 'tracking', hot: false },
  { name: 'project_position_info', layer: 'project', engine: 'tracking', hot: false },
  { name: 'seo_opportunities', layer: 'project', engine: 'tracking', hot: false },
  { name: 'create_project', layer: 'write', engine: 'skip', hot: false },
  { name: 'add_project_keywords', layer: 'write', engine: 'skip', hot: false },
  { name: 'add_project_competitors', layer: 'write', engine: 'skip', hot: false },
  { name: 'brand_config', layer: 'aisv', engine: 'llm', hot: false },
  { name: 'brand_visibility_overview', layer: 'aisv', engine: 'llm', hot: false },
  { name: 'brand_prompts', layer: 'aisv', engine: 'llm', hot: false },
  { name: 'validate_site', layer: 'utility', engine: 'skip', hot: false },
  { name: 'location_suggest', layer: 'utility', engine: 'skip', hot: false },
  { name: 'location_details', layer: 'utility', engine: 'skip', hot: false },
  { name: 'search_neilpatel_blog', layer: 'utility', engine: 'skip', hot: false },
] as const

export const UBERSUGGEST_HOT_TOOLS = UBERSUGGEST_TOOL_CATALOG.filter((t) => t.hot).map((t) => t.name)

export const UBERSUGGEST_MARKETS: Array<{ country: string; locId: number; language: string; seeds: string[] }> = [
  { country: 'uk', locId: 2826, language: 'en', seeds: ['uk graduate visa', 'uk student visa', 'uk spouse visa', 'skilled worker visa uk'] },
  { country: 'us', locId: 2840, language: 'en', seeds: ['f-1 visa', 'opt stem', 'h-1b visa', 'green card'] },
  { country: 'ca', locId: 2124, language: 'en', seeds: ['canada study permit', 'express entry canada', 'canada spousal sponsorship'] },
  { country: 'au', locId: 2036, language: 'en', seeds: ['australia student visa', '485 graduate visa', 'subclass 189'] },
]

export interface UberSpendCall {
  name: string
  args: Record<string, unknown>
  layer: UberLayer
}

/** Deterministic 16-call planner spend: keyword markets first, then owned domain. */
export function ubersuggestSpendPlan(): UberSpendCall[] {
  const uk = UBERSUGGEST_MARKETS[0]!
  const us = UBERSUGGEST_MARKETS[1]!
  const ca = UBERSUGGEST_MARKETS[2]!
  const au = UBERSUGGEST_MARKETS[3]!
  const owned = UBERSUGGEST_OWNED_DOMAIN
  return [
    { name: 'keyword_suggestions', layer: 'keyword', args: { keywords: uk.seeds, language: uk.language, locId: uk.locId, loc_id: uk.locId } },
    { name: 'keyword_suggestions', layer: 'keyword', args: { keywords: us.seeds, language: us.language, locId: us.locId, loc_id: us.locId } },
    { name: 'keyword_suggestions', layer: 'keyword', args: { keywords: ca.seeds, language: ca.language, locId: ca.locId, loc_id: ca.locId } },
    { name: 'keyword_suggestions', layer: 'keyword', args: { keywords: au.seeds, language: au.language, locId: au.locId, loc_id: au.locId } },
    { name: 'match_keywords', layer: 'keyword', args: { keywords: uk.seeds, language: uk.language, locId: uk.locId, loc_id: uk.locId, limit: 40 } },
    { name: 'match_keywords', layer: 'keyword', args: { keywords: us.seeds, language: us.language, locId: us.locId, loc_id: us.locId, limit: 40 } },
    { name: 'google_suggestions', layer: 'keyword', args: { keywords: [uk.seeds[0], us.seeds[0], ca.seeds[0]], language: 'en', country: 'uk' } },
    { name: 'keyword_overview', layer: 'keyword', args: { keyword: uk.seeds[0], language: uk.language, locId: uk.locId, loc_id: uk.locId } },
    { name: 'keyword_overview', layer: 'keyword', args: { keyword: us.seeds[0], language: us.language, locId: us.locId, loc_id: us.locId } },
    { name: 'content_ideas', layer: 'content', args: { keywords: [uk.seeds[0], us.seeds[1]], language: 'en', locId: uk.locId, loc_id: uk.locId } },
    { name: 'domain_overview', layer: 'domain', args: { domain: owned, language: 'en', locId: us.locId, loc_id: us.locId } },
    { name: 'domain_keywords', layer: 'domain', args: { domain: owned, language: 'en', locId: us.locId, loc_id: us.locId, limit: 50 } },
    { name: 'domain_top_pages', layer: 'domain', args: { domain: owned, language: 'en', locId: us.locId, loc_id: us.locId, limit: 20 } },
    { name: 'serp_analysis', layer: 'serp', args: { keyword: uk.seeds[0], language: uk.language, locId: uk.locId, loc_id: uk.locId, limit: 10 } },
    { name: 'backlinks_overview', layer: 'backlink', args: { domain: owned } },
    { name: 'list_projects', layer: 'project', args: {} },
  ]
}
