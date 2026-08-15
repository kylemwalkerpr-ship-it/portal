/**
 * MASTER SEO ENGINE — the brain that sits on top of the Content Studio.
 *
 * NOT a single "SEO score = Σ factor × weight". A layered model, exactly as the
 * research briefs demanded:
 *
 *   Raw features → normalized (0–1) → subsystem scores → intent-conditioned
 *   weights → competitive deltas → risk/eligibility gates → prediction →
 *   opportunity recommendations → adaptive weight learning (separate module).
 *
 * The differentiator is the architecture, not hand-counting metrics:
 *
 *   1. A REGISTRY of 130+ named, typed signals across 10 subsystems (the
 *      "ingests 100+ variables" layer — many are measurement slots that light
 *      up as data sources come online; the coverage report says exactly which
 *      were computed).
 *   2. Every computed signal is NORMALIZED to 0–1, either against a target
 *      window (title length, keyword density) or a range (depth, CTR, rank).
 *   3. Subsystem scores are weighted by QUERY INTENT (informational vs
 *      commercial vs transactional vs navigational vs local vs YMYL) — a YMYL
 *      query upweights E-E-A-T, a transactional query upweights links/schema.
 *   4. COMPETITIVE DELTAS compare the page against the SERP consensus (from
 *      supplied competitor snippets, else a deterministic baseline) so the
 *      engine says "this page trails the top 3 on links + schema" rather than
 *      just "score 72".
 *   5. RISK / ELIGIBILITY GATES are checked separately — a page that scores
 *      high but is noindex, stuffed, or lacks a YMYL disclaimer is flagged
 *      before any opportunity math.
 *   6. RECOMMENDATIONS are prioritized by expected value:
 *        Priority = Lift × Confidence × BusinessValue / ImplementationCost
 *
 * The adaptive half (reweighting from real outcomes — rank/traffic after
 * publish) lives in masterEngineLearn.ts and plugs into the same subsystem
 * score vector.
 */
import { countBodyWords, minWordsForType, targetWordsForType } from './contentDepth'
import { auditLiveHtml } from './liveAudit'
import { DISCLAIMER_RE } from './contentQualityGate'
import { ESTATE_LINK_RE } from './linkAudit'
import { BANNED_AI_TELLS } from '@/lib/seoVoice'
import { backlinkSignals, type BacklinkSnapshot } from './backlinkProvider'

// ═══ Taxonomy ══════════════════════════════════════════════════════════════

export type SubsystemId =
  | 'intent'
  | 'content'
  | 'semantic'
  | 'technical'
  | 'links'
  | 'eeat'
  | 'schema'
  | 'serp'
  | 'freshness'
  | 'experience'

export type IntentId =
  | 'informational'
  | 'procedural'
  | 'commercial'
  | 'transactional'
  | 'navigational'
  | 'local'
  | 'ymyl'

export type SignalSource = 'content' | 'live' | 'gsc' | 'registry' | 'derived'

export interface SignalDef {
  id: string
  label: string
  subsystem: SubsystemId
  source: SignalSource
  /** Display-only metadata: 1 = higher is better, -1 = lower is better.
   *  computeSignals returns every value as 0-1 GOODNESS already, so this is
   *  never flipped in scoring (2026-08 convention fix). */
  direction: 1 | -1
  /** Intra-subsystem relative weight (higher = more important within the group). */
  weight: number
  /** Whether v1 actually computes this from available inputs (false = measurement slot awaiting a data source). */
  computed: boolean
}

export const SUBSYSTEM_LABELS: Record<SubsystemId, string> = {
  intent: 'Query & Intent Intelligence',
  content: 'Content & On-Page Quality',
  semantic: 'Semantic & Entity Intelligence',
  technical: 'Technical Crawlability',
  links: 'Links & Authority',
  eeat: 'E-E-A-T / Trust',
  schema: 'Structured Data & Search Appearance',
  serp: 'SERP & GSC Performance',
  freshness: 'Freshness & Temporal',
  experience: 'Page Experience',
}

export const SUBSYSTEMS: SubsystemId[] = [
  'intent',
  'content',
  'semantic',
  'technical',
  'links',
  'eeat',
  'schema',
  'serp',
  'freshness',
  'experience',
]

/** Compact registry builder. */
const sig = (
  id: string,
  label: string,
  subsystem: SubsystemId,
  source: SignalSource,
  direction: 1 | -1,
  weight: number,
  computed: boolean,
): SignalDef => ({ id, label, subsystem, source, direction, weight, computed })

/**
 * 130+ variable registry. `computed:false` entries are measurement slots that
 * the engine ingests once a data source exists (backlink provider, CrUX field
 * data, analytics, logs) — the coverage report makes the gap explicit instead
 * of pretending a fixed formula knows the answer.
 */
export const SIGNAL_REGISTRY: SignalDef[] = [
  // ── Intent (12) ──────────────────────────────────────────────────────────
  sig('intent_informational', 'Informational intent probability', 'intent', 'derived', 1, 1, true),
  sig('intent_commercial', 'Commercial intent probability', 'intent', 'derived', 1, 1, true),
  sig('intent_transactional', 'Transactional intent probability', 'intent', 'derived', 1, 1, true),
  sig('intent_navigational', 'Navigational intent probability', 'intent', 'derived', 1, 1, true),
  sig('intent_procedural', 'Procedural intent probability', 'intent', 'derived', 1, 1, true),
  sig('intent_local', 'Local intent probability', 'intent', 'derived', 1, 1, true),
  sig('intent_question', 'Question intent probability', 'intent', 'derived', 1, 1, true),
  sig('intent_comparison', 'Comparison intent probability', 'intent', 'derived', 1, 1, true),
  sig('intent_ymyl', 'YMYL risk classification', 'intent', 'derived', 1, 2, true),
  sig('intent_freshness', 'Freshness-sensitive intent probability', 'intent', 'derived', 1, 1, true),
  sig('query_complexity', 'Query complexity (multi-token)', 'intent', 'derived', 1, 1, true),
  sig('query_specificity', 'Query specificity / long-tail depth', 'intent', 'derived', 1, 1, true),

  // ── Content (26) ─────────────────────────────────────────────────────────
  sig('c_word_depth', 'Body depth vs Google floor', 'content', 'content', 1, 3, true),
  sig('c_h2_structure', 'H2 section count', 'content', 'content', 1, 3, true),
  sig('c_title_presence', 'Title present + length', 'content', 'content', 1, 2, true),
  sig('c_title_keyword', 'Primary keyword in title', 'content', 'content', 1, 2, true),
  sig('c_meta_presence', 'Meta description present', 'content', 'content', 1, 1, true),
  sig('c_meta_length', 'Meta description length window', 'content', 'content', 1, 1, true),
  sig('c_meta_keyword', 'Primary keyword in meta description', 'content', 'content', 1, 1, true),
  sig('c_keyword_first100', 'Primary keyword in first 100 words', 'content', 'content', 1, 1, true),
  sig('c_keyword_density', 'Primary keyword density (0.5–2%)', 'content', 'content', 1, 2, true),
  sig('c_keyword_body', 'Primary keyword present in body', 'content', 'content', 1, 1, true),
  sig('c_citations', 'Official .gov/.edu citations', 'content', 'content', 1, 2, true),
  sig('c_faq_section', 'FAQ section present', 'content', 'content', 1, 1, true),
  sig('c_tldr', 'In-60-seconds / TL;DR block', 'content', 'content', 1, 1, true),
  sig('c_disclaimer', 'YMYL disclaimer present', 'content', 'content', 1, 2, true),
  sig('c_internal_links', 'Internal estate links', 'content', 'content', 1, 2, true),
  sig('c_question_coverage', 'Question-form coverage', 'content', 'content', 1, 1, true),
  sig('c_list_usage', 'List utilization', 'content', 'content', 1, 1, true),
  sig('c_table_usage', 'Table utilization for data-dense content', 'content', 'content', 1, 1, true),
  sig('c_reading_level', 'Readability (Flesch) for audience', 'content', 'content', 1, 1, true),
  sig('c_sentence_variance', 'Sentence length variance', 'content', 'content', 1, 1, true),
  sig('c_passive_voice', 'Passive-voice avoidance', 'content', 'content', -1, 1, true),
  sig('c_filler_ratio', 'Filler / hedge-word avoidance', 'content', 'content', -1, 1, true),
  sig('c_ai_tells', 'Generic AI-language avoidance', 'content', 'content', -1, 2, true),
  sig('c_originality', 'Unique content / low repetition', 'content', 'content', 1, 1, true),
  sig('c_conclusion', 'Conclusion / summary section', 'content', 'content', 1, 1, true),
  sig('c_answer_strength', 'Direct-answer strength (above fold)', 'content', 'content', 1, 1, true),

  // ── Semantic (14) ────────────────────────────────────────────────────────
  sig('s_entity_density', 'Named-entity density', 'semantic', 'content', 1, 1, true),
  sig('s_entity_variety', 'Entity variety', 'semantic', 'content', 1, 1, true),
  sig('s_legal_entities', 'Statutory / form entity coverage', 'semantic', 'content', 1, 2, true),
  sig('s_longtail_coverage', 'Required long-tail keyword coverage', 'semantic', 'content', 1, 2, true),
  sig('s_short_coverage', 'Required short-keyword coverage', 'semantic', 'content', 1, 2, true),
  sig('s_synonym_coverage', 'Synonym / variant coverage', 'semantic', 'content', 1, 1, true),
  sig('s_heading_keywords', 'Keywords in H2 headings', 'semantic', 'content', 1, 1, true),
  sig('s_jaccard_competing', 'Semantic overlap vs SERP consensus', 'semantic', 'derived', 1, 1, true),
  sig('s_ngram_overlap', 'N-gram overlap with competitors', 'semantic', 'derived', 1, 1, true),
  sig('s_topic_focus', 'Topic focus (core-term concentration)', 'semantic', 'content', 1, 1, true),
  sig('s_definition_coverage', 'Definitional coverage for term', 'semantic', 'content', 1, 1, true),
  sig('s_entity_kg_link', 'Knowledge-graph entity linkage', 'semantic', 'registry', 1, 1, false),
  sig('s_embedding_similarity', 'Embedding similarity to top pages', 'semantic', 'derived', 1, 1, false),
  sig('s_passage_relevance', 'Passage-level relevance', 'semantic', 'derived', 1, 1, false),

  // ── Technical (14) ───────────────────────────────────────────────────────
  sig('t_http_ok', 'HTTP 200', 'technical', 'live', 1, 2, true),
  sig('t_https', 'HTTPS enforced', 'technical', 'live', 1, 1, true),
  sig('t_indexable', 'Indexable (no noindex conflict)', 'technical', 'registry', 1, 2, true),
  sig('t_canonical_present', 'Canonical tag present', 'technical', 'live', 1, 2, true),
  sig('t_canonical_match', 'Canonical matches target URL', 'technical', 'live', 1, 2, true),
  sig('t_noindex_absent', 'No noindex on live page', 'technical', 'live', 1, 2, true),
  sig('t_h1_single', 'Single H1', 'technical', 'live', 1, 1, true),
  sig('t_meta_present', 'Meta description on live page', 'technical', 'live', 1, 1, true),
  sig('t_viewport', 'Viewport meta present', 'technical', 'live', 1, 1, true),
  sig('t_title_length', 'Title length window (live)', 'technical', 'live', 1, 1, true),
  sig('t_page_weight', 'Page weight (lighter is better)', 'technical', 'live', -1, 1, true),
  sig('t_robots_txt', 'Robots.txt directive correct', 'technical', 'live', 1, 1, false),
  sig('t_sitemap_membership', 'Sitemap inclusion', 'technical', 'registry', 1, 1, false),
  sig('t_crawl_depth', 'Crawl depth (clicks from home)', 'technical', 'registry', 1, 1, false),

  // ── Links (12) ───────────────────────────────────────────────────────────
  sig('l_internal_estate', 'Internal estate interlinks', 'links', 'content', 1, 2, true),
  sig('l_outbound_authority', 'Outbound .gov/.edu authority links', 'links', 'content', 1, 2, true),
  sig('l_anchor_diversity', 'Anchor/link diversity', 'links', 'content', 1, 1, true),
  sig('l_orphan_risk', 'Not an orphan (has internal links)', 'links', 'content', 1, 2, true),
  sig('l_domain_authority', 'Domain authority (host / DataForSEO rank)', 'links', 'registry', 1, 1, true),
  sig('l_estate_inbound', 'Estate inbound links', 'links', 'registry', 1, 1, true),
  sig('l_referring_domains', 'Referring-domain count', 'links', 'registry', 1, 2, true),
  sig('l_link_velocity', 'Link velocity trend', 'links', 'registry', 1, 1, true),
  sig('l_anchor_natural', 'Natural anchor-text ratio', 'links', 'registry', 1, 1, true),
  sig('l_competitor_link_gap', 'Competitor link gap', 'links', 'derived', 1, 1, false),
  sig('l_toxic_links', 'Toxic-link risk', 'links', 'registry', -1, 1, true),
  sig('l_editorial_links', 'Editorial link ratio', 'links', 'registry', 1, 1, true),

  // ── E-E-A-T (14) ─────────────────────────────────────────────────────────
  sig('e_author_byline', 'Author byline present', 'eeat', 'content', 1, 1, true),
  sig('e_author_credentials', 'Author expertise disclosed', 'eeat', 'content', 1, 1, true),
  sig('e_disclaimer', 'Legal/educational disclaimer', 'eeat', 'content', 1, 2, true),
  sig('e_citation_density', 'Citation density (per 1000 words)', 'eeat', 'content', 1, 1, true),
  sig('e_primary_source', 'Primary-source ratio among citations', 'eeat', 'content', 1, 1, true),
  sig('e_ymyl_mitigation', 'YMYL mitigation (disclaimer + care)', 'eeat', 'content', 1, 2, true),
  sig('e_outcome_promise_risk', 'No outcome-guarantee language', 'eeat', 'content', -1, 2, true),
  sig('e_transparency', 'Transparency (contact / consult CTA)', 'eeat', 'content', 1, 1, true),
  sig('e_publication_date', 'Publication date disclosed', 'eeat', 'content', 1, 1, true),
  sig('e_update_disclosure', 'Update / revision disclosure', 'eeat', 'content', 1, 1, true),
  sig('e_evidence_density', 'Evidence-backed claims', 'eeat', 'content', 1, 1, true),
  sig('e_reviewer_disclosure', 'Reviewer / fact-check disclosure', 'eeat', 'content', 1, 1, false),
  sig('e_brand_reputation', 'Independent reputation signals', 'eeat', 'registry', 1, 1, false),
  sig('e_external_experts', 'External expert references', 'eeat', 'content', 1, 1, false),

  // ── Schema (10) ──────────────────────────────────────────────────────────
  sig('sc_article', 'Article JSON-LD', 'schema', 'content', 1, 2, true),
  sig('sc_faq', 'FAQPage JSON-LD', 'schema', 'content', 1, 2, true),
  sig('sc_org', 'Organization JSON-LD', 'schema', 'content', 1, 1, true),
  sig('sc_person', 'Person / author JSON-LD', 'schema', 'content', 1, 1, true),
  sig('sc_breadcrumb', 'BreadcrumbList JSON-LD', 'schema', 'content', 1, 1, true),
  sig('sc_valid', 'JSON-LD parses cleanly', 'schema', 'content', 1, 1, true),
  sig('sc_consistency', 'Schema-to-content consistency', 'schema', 'content', 1, 1, true),
  sig('sc_rich_result', 'Rich-result eligibility', 'schema', 'content', 1, 1, true),
  sig('sc_howto', 'HowTo schema (procedural queries)', 'schema', 'content', 1, 1, false),
  sig('sc_video', 'VideoObject schema', 'schema', 'content', 1, 1, false),

  // ── SERP / GSC (14) ──────────────────────────────────────────────────────
  sig('g_impressions', 'GSC impressions', 'serp', 'gsc', 1, 1, true),
  sig('g_clicks', 'GSC clicks', 'serp', 'gsc', 1, 1, true),
  sig('g_ctr', 'GSC CTR', 'serp', 'gsc', 1, 1, true),
  sig('g_position', 'GSC average position', 'serp', 'gsc', 1, 2, true),
  sig('g_ctr_deviation', 'CTR vs expected-by-position curve', 'serp', 'gsc', 1, 2, true),
  sig('g_query_count', 'Query count for page', 'serp', 'gsc', 1, 1, true),
  sig('g_cannibal_risk', 'No cannibalization (competing URLs)', 'serp', 'registry', 1, 2, true),
  sig('g_expected_traffic', 'Expected organic traffic proxy', 'serp', 'derived', 1, 1, true),
  sig('g_share_of_voice', 'Share-of-voice vs top 3', 'serp', 'derived', 1, 1, false),
  sig('g_serp_feature_opp', 'SERP feature opportunity', 'serp', 'derived', 1, 1, false),
  sig('g_rank_volatility', 'Ranking volatility', 'serp', 'derived', 1, 1, false),
  sig('g_new_query_velocity', 'New-query emergence', 'serp', 'gsc', 1, 1, false),
  sig('g_lost_query_rate', 'Lost-query rate', 'serp', 'gsc', -1, 1, false),
  sig('g_ctr_curve', 'CTR curve position fit', 'serp', 'gsc', 1, 1, false),

  // ── Freshness (10) ───────────────────────────────────────────────────────
  sig('f_year_marker', 'Current-year marker in content', 'freshness', 'content', 1, 1, true),
  sig('f_update_recency', 'Days since meaningful update', 'freshness', 'registry', 1, 2, true),
  sig('f_citation_recency', 'Recency of cited sources', 'freshness', 'content', 1, 1, true),
  sig('f_fresh_demand', 'Freshness-demand of query', 'freshness', 'derived', 1, 1, true),
  sig('f_content_age', 'Content age', 'freshness', 'registry', 1, 1, true),
  sig('f_seasonal_alignment', 'Seasonal timing alignment', 'freshness', 'derived', 1, 1, false),
  sig('f_trending_velocity', 'Trending-query velocity', 'freshness', 'gsc', 1, 1, false),
  sig('f_news_proximity', 'News/event proximity', 'freshness', 'derived', 1, 1, false),
  sig('f_update_frequency', 'Update frequency', 'freshness', 'registry', 1, 1, false),
  sig('f_competitor_freshness', 'Freshness differential vs competitors', 'freshness', 'derived', 1, 1, false),

  // ── Experience (10) ──────────────────────────────────────────────────────
  sig('x_viewport', 'Viewport configured', 'experience', 'live', 1, 1, true),
  sig('x_script_count', 'Third-party script count', 'experience', 'live', -1, 1, true),
  sig('x_image_dims', 'Image dimensions set (no CLS)', 'experience', 'live', 1, 1, true),
  sig('x_lazy_load', 'Lazy-loading for below-fold assets', 'experience', 'live', 1, 1, true),
  sig('x_page_weight', 'Page weight', 'experience', 'live', -1, 1, true),
  sig('x_readability', 'Readability', 'experience', 'content', 1, 1, true),
  sig('x_above_fold', 'Above-fold content availability', 'experience', 'content', 1, 1, true),
  sig('x_alt_text', 'Image alt-text coverage', 'experience', 'live', 1, 1, false),
  sig('x_core_vitals', 'Core Web Vitals (field data)', 'experience', 'live', 1, 2, false),
  sig('x_mobile_parity', 'Mobile/desktop content parity', 'experience', 'live', 1, 1, false),
]

export const SIGNAL_COUNT = SIGNAL_REGISTRY.length

// ═══ Intent detection + weight matrix ══════════════════════════════════════

const YMYL_TERMS = /immigration|visa|lawyer|attorney|solicitor|migration|legal|medical|health|diagnos|treatment|surgery|financial|investment|loan|mortgage|tax|insurance|green card|citizenship|asylum|refugee/i

/**
 * YMYL is a RISK overlay, not an exclusive intent. Almost the whole studio
 * corpus is immigration/visa content, so if YMYL short-circuits the intent
 * classifier every query would collapse to one row and the procedural /
 * commercial / transactional weight matrices would be dead code. Instead the
 * primary intent is detected independently and the YMYL flag is used to (a)
 * blend in extra E-E-A-T weight and (b) gate on disclaimers/credentials.
 */
export function isYmyLQuery(input: {
  primaryKeyword?: string
  topic?: string
  contentType?: string
  region?: string
  title?: string
}): boolean {
  const t = `${input.primaryKeyword || ''} ${input.topic || ''} ${input.title || ''}`
  return YMYL_TERMS.test(t)
}

/** Heuristic intent classification used to pick the base weight matrix. */
export function detectIntent(input: {
  primaryKeyword?: string
  topic?: string
  contentType?: string
  region?: string
  title?: string
}): IntentId {
  const q = `${input.primaryKeyword || ''} ${input.topic || ''} ${input.title || ''}`.toLowerCase()
  if (/\b(near me|in [a-z]+|for [a-z]+ residents|city|region)\b/i.test(q) && /\b(visa|service|consultant)\b/i.test(q)) return 'local'
  if (/\b(hire|find an? |consultation|speak to|contact|get help|buy|purchase|retainer|book|apply now)\b/i.test(q)) return 'transactional'
  if (/\b(cost|fee|price|how much|expensive|cheap|vs\.?|versus|comparison|compare|alternative|best |review|worth it|pros and cons|difference)\b/i.test(q)) return 'commercial'
  if (/\b(how to|steps?|process|procedure|checklist|timeline|apply|application|requirements?|eligibility|documents? (required|needed)|appeal|reapply|renew)\b/i.test(q)) return 'procedural'
  if (/\b(form [iI]-?\d+|imm\s?\d+|subclass\s?\d+|uscis|ircc|ukvi|home affairs)\b/i.test(q)) return 'navigational'
  return 'informational'
}

/**
 * Effective weights = the detected intent row, blended toward the YMYL row
 * when the query is YMYL (so E-E-A-T gets its documented 2–3× uplift without
 * killing the procedural/commercial structure weights).
 */
export function weightsFor(
  intent: IntentId,
  ymyl: boolean,
): Record<SubsystemId, number> {
  const base = INTENT_WEIGHT_MATRIX[intent]
  if (!ymyl) return base
  const y = INTENT_WEIGHT_MATRIX.ymyl
  const out = {} as Record<SubsystemId, number>
  let sum = 0
  for (const s of SUBSYSTEMS) {
    out[s] = base[s] * 0.6 + y[s] * 0.4
    sum += out[s]
  }
  for (const s of SUBSYSTEMS) out[s] = out[s] / sum
  return out
}

/**
 * Subsystem weight per intent. Rows sum to 1 (enforced by a test). YMYL
 * upweights E-E-A-T 2.4×; transactional upweights links + schema; local
 * upweights intent-local + technical.
 */
export const INTENT_WEIGHT_MATRIX: Record<IntentId, Record<SubsystemId, number>> = {
  informational: {
    intent: 0.08, content: 0.22, semantic: 0.14, technical: 0.12, links: 0.10,
    eeat: 0.12, schema: 0.08, serp: 0.06, freshness: 0.05, experience: 0.03,
  },
  procedural: {
    intent: 0.06, content: 0.26, semantic: 0.12, technical: 0.10, links: 0.10,
    eeat: 0.10, schema: 0.10, serp: 0.06, freshness: 0.05, experience: 0.05,
  },
  commercial: {
    intent: 0.06, content: 0.22, semantic: 0.12, technical: 0.10, links: 0.12,
    eeat: 0.12, schema: 0.10, serp: 0.08, freshness: 0.04, experience: 0.04,
  },
  transactional: {
    intent: 0.06, content: 0.18, semantic: 0.08, technical: 0.10, links: 0.16,
    eeat: 0.14, schema: 0.12, serp: 0.10, freshness: 0.03, experience: 0.03,
  },
  navigational: {
    intent: 0.14, content: 0.14, semantic: 0.04, technical: 0.20, links: 0.12,
    eeat: 0.10, schema: 0.12, serp: 0.08, freshness: 0.03, experience: 0.03,
  },
  local: {
    intent: 0.14, content: 0.16, semantic: 0.08, technical: 0.12, links: 0.12,
    eeat: 0.12, schema: 0.08, serp: 0.10, freshness: 0.04, experience: 0.04,
  },
  ymyl: {
    intent: 0.05, content: 0.20, semantic: 0.10, technical: 0.12, links: 0.10,
    eeat: 0.24, schema: 0.08, serp: 0.06, freshness: 0.03, experience: 0.02,
  },
}

export function intentWeightsFor(intent: IntentId): Record<SubsystemId, number> {
  return INTENT_WEIGHT_MATRIX[intent]
}

// ═══ Normalization ═════════════════════════════════════════════════════════

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v))
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * Linear 0–1 normalization with clamping; higherIsBetter flips it.
 * A min > max window is normalized (swap + flip) instead of collapsing to a
 * step function — callers can express "lower is better" either as
 * (v, lo, hi, false) or (v, hi, lo, true) and get the same linear result.
 */
export function normalizeRange(
  value: number | null | undefined,
  min: number,
  max: number,
  higherIsBetter = true,
): number | null {
  if (value == null || !finite(value)) return null
  if (max < min) return normalizeRange(value, max, min, !higherIsBetter)
  const span = max - min
  if (span <= 0) return clamp01(higherIsBetter ? (value >= min ? 1 : 0) : (value <= min ? 1 : 0))
  const t = clamp01((value - min) / span)
  return higherIsBetter ? t : 1 - t
}

/** Gaussian peak around a target — perfect for "window" metrics (density, length). */
export function normalizeTarget(
  value: number | null | undefined,
  target: number,
  tol: number,
): number | null {
  if (value == null || !finite(value)) return null
  return clamp01(Math.exp(-(((value - target) / tol) ** 2)))
}

// ═══ Inputs ════════════════════════════════════════════════════════════════

export interface MasterEngineInput {
  topic?: string
  primaryKeyword?: string
  contentType?: string
  region?: string
  title?: string
  /** Draft body (markdown or rendered text). */
  content?: string
  /** Live rendered HTML (post-deploy verification). */
  liveHtml?: string
  liveUrl?: string
  liveHttpStatus?: number | null
  indexable?: boolean
  canonicalUrl?: string
  requiredShortKeywords?: string[]
  requiredLongTailKeywords?: string[]
  /** Short competitor page snippets for the SERP-consensus baseline. */
  competingSnippets?: string[]
  /** Pages already targeting the same intent (cannibalization). */
  competingUrls?: string[]
  gsc?: {
    impressions?: number
    clicks?: number
    ctr?: number
    position?: number
    queries?: number
  }
  /** Per-URL backlink snapshot from the DataForSEO provider (links subsystem). */
  backlinks?: BacklinkSnapshot | null
  updatedAt?: string
  createdAt?: string
  /** Optional 0–100 host authority proxy (registry / authorityScoring). */
  authorityScore?: number | null
}

// ═══ Signal computation ════════════════════════════════════════════════════

export interface ComputedSignal {
  id: string
  label: string
  subsystem: SubsystemId
  source: SignalSource
  /** 0–1 normalized, null when the signal could not be computed. */
  value: number | null
  computed: boolean
}

interface SignalBundle {
  signals: ComputedSignal[]
  score: number | null
  coverage: number
}

function parseFrontMatter(content: string): Record<string, string> {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return {}
  const out: Record<string, string> = {}
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':')
    if (i < 0) continue
    const k = line.slice(0, i).trim()
    let v = line.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[k] = v
  }
  return out
}

function bodyText(content: string): { body: string; text: string; fm: Record<string, string> } {
  const c = content || ''
  const fm = parseFrontMatter(c)
  const body = c.replace(/^---[\s\S]*?---\r?\n/, '')
  const text = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*_`>~|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return { body, text, fm }
}

function fleschReading(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length || 1
  const sents = (text.match(/[.!?]+/g) || []).length || 1
  const syllables = (text.toLowerCase().match(/[aeiouy]{1,2}/g) || []).length || words
  return 206.835 - 1.015 * (words / sents) - 84.6 * (syllables / words)
}

function extractCanonicalHref(html: string): string | null {
  const m = html.match(/<link\b[^>]*rel=["']canonical["'][^>]*?>/i)
  if (!m) return null
  const href = m[0].match(/href=["']([^"']+)["']/i)
  return href && href[1] ? href[1] : null
}

function canonicalMatches(target: string | undefined, candidate: string | null): boolean {
  if (!target || !candidate) return false
  const norm = (u: string) => {
    try {
      const p = new URL(u)
      const path = p.pathname.replace(/\/+$/, '') || '/'
      return (p.host.toLowerCase() + path).toLowerCase()
    } catch {
      return u.replace(/\/+$/, '').toLowerCase()
    }
  }
  return norm(target) === norm(candidate)
}

const GOV_RE = /\.gov|\.edu|uscis\.gov|canada\.ca|homeaffairs\.gov|gov\.uk|ircc/i
const TLDR_RE = /tldr|in 60 seconds|quick answer|key takeaways/i
const FILLER_RE = /\b(very|really|quite|basically|actually|just|simply|highly|extremely|in order to|it is important to note|it's worth noting|needless to say|it should be noted)\b/gi
const PASSIVE_RE = /\b(am|is|are|was|were|be|been|being)\s+[a-z]+ed\b/gi
const LEGAL_ENTITY_RE = /\b(?:INA|IRCC|USCIS|UKVI|DHS|DOL|SEVP|CRS|Home Affairs|Form\s+[A-Z]-?\d+|subclass\s*\d+|[A-Z]{2,5}\s*\d+\([a-z]\)|Immigration and Nationality Act)\b/gi
const CURRENT_YEAR = String(new Date().getFullYear())
const OUTCOME_PROMISE_RE = /\b(guarantee|100% (success|approval)|we will get you|ensure (your )?(visa |application )?(approval|success)|approved for sure|no risk of refusal|certainly qualify|we promise)\b/i

/** Compute every computable signal (0–1). Values that cannot be computed are null. */
export function computeSignals(input: MasterEngineInput): Record<string, number | null> {
  const out: Record<string, number | null> = {}
  const { body, text, fm } = bodyText(input.content || '')
  const lower = text.toLowerCase()
  const words = countBodyWords(input.content || '')
  const primary = (input.primaryKeyword || input.topic || '').toLowerCase().trim()
  const pFirst = primary.split(' ')[0] || primary
  const contentType = input.contentType || 'legal_guide'
  const minWords = minWordsForType(contentType)
  const targetWords = targetWordsForType(contentType)
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0)

  // ══ intent ══
  const intent = detectIntent(input)
  out.intent_ymyl = isYmyLQuery(input) ? 1 : 0
  out.intent_informational = intent === 'informational' ? 1 : 0
  out.intent_procedural = intent === 'procedural' ? 1 : 0
  out.intent_commercial = intent === 'commercial' ? 1 : 0
  out.intent_transactional = intent === 'transactional' ? 1 : 0
  out.intent_navigational = intent === 'navigational' ? 1 : 0
  out.intent_local = intent === 'local' ? 1 : 0
  out.intent_question = /\b(what|how|why|when|where|who|can i|do i|is it)\b/i.test(`${primary} ${input.title || ''}`) ? 1 : 0
  out.intent_comparison = /\b(vs\.?|versus|comparison|compare|or |better|difference)\b/i.test(primary) ? 1 : 0
  out.intent_freshness = /\b(202[4-9]|new|latest|updated|this year|now|current|recent)\b/i.test(primary) ? 1 : 0
  const tokens = primary.split(/\s+/).filter(Boolean).length
  out.query_complexity = normalizeRange(tokens, 2, 6, true)
  out.query_specificity = normalizeRange(tokens, 2, 5, true)

  // ══ content ══
  const title = (input.title || fm.title || '').trim()
  const meta = fm.description || fm.metaDescription || ''
  const h2s = (body.match(/^##\s+/gm) || []).length
  const first100 = lower.slice(0, 100)
  const density = words > 0 && primary ? (lower.split(primary).length - 1) / Math.max(1, words) * 100 : 0
  const citations = (body.match(GOV_RE) || []).length
  const internalLinks =
    (body.match(/\]\(\//g) || []).length + (body.match(ESTATE_LINK_RE) || []).length
  const bullets = (body.match(/^\s*[-*]\s/mg) || []).length
  const tables = (body.match(/^\s*\|.*\|\s*$/gm) || []).length
  const questions = (body.match(/\?\s*$/gm) || []).length

  out.c_word_depth =
    words >= targetWords ? 1 : normalizeRange(words, minWords, targetWords, true)
  out.c_h2_structure = normalizeRange(h2s, 0, 4, true)
  out.c_title_presence = title.length >= 10 && title.length <= 70 ? 1 : title ? normalizeTarget(title.length, 55, 18) : 0
  out.c_title_keyword = primary && title.toLowerCase().includes(primary.slice(0, Math.min(primary.length, 20))) ? 1 : 0
  out.c_meta_presence = meta.length > 0 ? 1 : 0
  out.c_meta_length = meta ? normalizeTarget(meta.length, 150, 28) : 0
  out.c_meta_keyword = primary && meta.toLowerCase().includes(pFirst) ? 1 : 0
  out.c_keyword_first100 = primary ? (first100.includes(pFirst) ? 1 : 0) : null
  out.c_keyword_density = primary ? normalizeTarget(density, 1.2, 0.8) : null
  out.c_keyword_body = primary ? (lower.includes(pFirst) ? 1 : 0) : null
  out.c_citations = normalizeRange(citations, 0, 3, true)
  out.c_faq_section = /^##\s*.*faq/i.test(body) || /faqpage|people also ask/i.test(body) ? 1 : 0
  out.c_tldr = TLDR_RE.test(body) ? 1 : 0
  out.c_disclaimer = DISCLAIMER_RE.test(text) ? 1 : 0
  out.c_internal_links = normalizeRange(internalLinks, 0, 3, true)
  out.c_question_coverage = normalizeRange(questions, 0, 4, true)
  out.c_list_usage = normalizeRange(bullets, 0, 5, true)
  out.c_table_usage = tables > 0 ? 1 : 0

  const flesch = fleschReading(text)
  out.c_reading_level = normalizeRange(flesch, 45, 70, true)
  const lens = sentences.map((s) => s.split(/\s+/).filter(Boolean).length).filter((n) => n > 0)
  const mean = lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0
  const variance = lens.length
    ? Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length)
    : 0
  out.c_sentence_variance = normalizeRange(variance, 4, 12, true)
  // Lower-is-better signals are computed as direct 0-1 GOODNESS (higher =
  // better) so every consumer (recommendations, risk gates) reads the value
  // without a second flip. 0 occurrences = 1 (perfect), N+ occurrences = 0.
  const passive = (text.match(PASSIVE_RE) || []).length
  out.c_passive_voice = 1 - clamp01(passive / 8)
  const filler = (text.match(FILLER_RE) || []).length
  out.c_filler_ratio = 1 - clamp01(filler / Math.max(1, words / 1000) / 12)
  let aiTells = 0
  for (const t of BANNED_AI_TELLS) {
    if (lower.includes(t.toLowerCase())) aiTells++
  }
  out.c_ai_tells = 1 - clamp01(aiTells / 4)
  const seen = new Set<string>()
  let unique = 0
  for (const s of sentences) {
    const k = s.trim().toLowerCase().slice(0, 40)
    if (k && !seen.has(k)) {
      seen.add(k)
      unique++
    }
  }
  out.c_originality = sentences.length ? unique / sentences.length : 0
  out.c_conclusion = /^##\s*(conclusion|summary|final thoughts|next steps|wrap[- ]up)/im.test(body) ? 1 : 0
  out.c_answer_strength = primary ? (first100.includes(pFirst) && /\b(is|are|can|do|steps?|requirements?)\b/.test(first100) ? 1 : 0.4) : null

  // ══ semantic ══
  const entityMatches = text.match(/\b([A-Z][a-z]{2,}(?:\s[A-Z][a-z]{2,}){0,2})\b/g) || []
  const legalMatches = (body.match(LEGAL_ENTITY_RE) || []).length
  out.s_entity_density = normalizeRange(entityMatches.length / Math.max(1, words / 1000), 3, 15, true)
  out.s_entity_variety = normalizeRange(new Set(entityMatches.map((e) => e.toLowerCase())).size, 4, 18, true)
  out.s_legal_entities = legalMatches > 0 ? 1 : 0
  const lts = (input.requiredLongTailKeywords || []).filter(Boolean)
  const shorts = (input.requiredShortKeywords || []).filter(Boolean)
  out.s_longtail_coverage = lts.length ? lts.filter((k) => lower.includes(k.toLowerCase())).length / lts.length : null
  out.s_short_coverage = shorts.length ? shorts.filter((k) => lower.includes(k.toLowerCase())).length / shorts.length : null
  const variants = new Set<string>([primary, primary.replace(/s$/, ''), `${primary}s`, pFirst])
  const found = [...variants].filter((v) => v && lower.includes(v)).length
  out.s_synonym_coverage = variants.size > 0 ? found / variants.size : null
  const h2Text = (body.match(/^##\s+(.+)$/gm) || []).join(' ').toLowerCase()
  out.s_heading_keywords = primary ? (h2Text.includes(pFirst) ? 1 : 0) : null
  out.s_topic_focus = primary ? (lower.split(pFirst).length - 1) / Math.max(1, words / 100) : 0
  out.s_definition_coverage = primary ? (/\bis\b|\bmeans?\b|\brefers to\b/.test(lower.slice(0, 400)) ? 1 : 0.3) : null
  // Semantic overlap vs competitors (Jaccard on term sets)
  const pageTerms = new Set(lower.split(/\s+/).filter((w) => w.length > 3))
  if (input.competingSnippets && input.competingSnippets.length) {
    let total = 0
    let count = 0
    for (const s of input.competingSnippets) {
      const sTerms = new Set(s.toLowerCase().split(/\s+/).filter((w) => w.length > 3))
      const inter = [...pageTerms].filter((t) => sTerms.has(t)).length
      const union = new Set([...pageTerms, ...sTerms]).size
      if (union > 0) {
        total += inter / union
        count++
      }
    }
    out.s_jaccard_competing = count ? total / count : null
  } else {
    out.s_jaccard_competing = null
  }
  out.s_ngram_overlap = null
  out.s_entity_kg_link = null
  out.s_embedding_similarity = null
  out.s_passage_relevance = null

  // ══ technical (live) ══
  const live = input.liveHtml ? auditLiveHtml({ html: input.liveHtml, contentType, primaryKeyword: primary }) : null
  const liveHtml = input.liveHtml || ''
  const canonicalHref = liveHtml ? extractCanonicalHref(liveHtml) : null
  const noindex = /<meta[^>]*robots[^>]*noindex/i.test(liveHtml)
  const viewport = /<meta[^>]*name=["']viewport["']/i.test(liveHtml)
  const liveTitle = liveHtml ? (liveHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim() : ''
  const scriptCount = (liveHtml.match(/<script\b/gi) || []).length
  const imgCount = (liveHtml.match(/<img\b/gi) || []).length
  const imgWithDims = (liveHtml.match(/<img\b[^>]*\b(width|height)=["']/gi) || []).length

  out.t_http_ok = input.liveHttpStatus == null ? null : input.liveHttpStatus === 200 ? 1 : 0
  out.t_https = input.liveUrl ? (input.liveUrl.startsWith('https://') ? 1 : 0) : null
  out.t_indexable = input.indexable === false ? 0 : 1
  out.t_canonical_present = liveHtml ? (canonicalHref ? 1 : 0) : null
  out.t_canonical_match = liveHtml ? (canonicalMatches(input.canonicalUrl || input.liveUrl, canonicalHref) ? 1 : 0) : null
  out.t_noindex_absent = liveHtml ? (noindex ? 0 : 1) : null
  out.t_h1_single = live ? (live.h1 ? 1 : 0) : null
  out.t_meta_present = live ? (live.metaDescription ? 1 : 0) : null
  out.t_viewport = liveHtml ? (viewport ? 1 : 0) : null
  out.t_title_length = liveTitle ? normalizeTarget(liveTitle.length, 55, 20) : null
  out.t_page_weight = liveHtml ? normalizeRange(liveHtml.length, 60_000, 400_000, false) : null
  out.t_robots_txt = null
  out.t_sitemap_membership = null
  out.t_crawl_depth = null

  // ══ links ══
  out.l_internal_estate = normalizeRange(internalLinks, 0, 3, true)
  out.l_outbound_authority = normalizeRange(citations, 0, 3, true)
  const domains = new Set((body.match(/https?:\/\/([^\/\s]+)/g) || []).map((u) => {
    try { return new URL(u).hostname } catch { return u }
  }))
  out.l_anchor_diversity = normalizeRange(domains.size, 0, 4, true)
  out.l_orphan_risk = internalLinks > 0 ? 1 : 0
  out.l_domain_authority = input.authorityScore == null ? null : normalizeRange(input.authorityScore, 0, 80, true)
  out.l_competitor_link_gap = null
  if (input.backlinks) {
    const bl = backlinkSignals({
      snapshot: input.backlinks,
      primaryKeyword: primary,
      brandTerms: ['yousafe'],
    })
    out.l_referring_domains = bl.referringDomains
    out.l_estate_inbound = bl.estateInbound
    out.l_link_velocity = bl.linkVelocity
    out.l_anchor_natural = bl.anchorNatural
    out.l_toxic_links = bl.toxicClean
    out.l_editorial_links = bl.editorialLinks
    if (bl.domainAuthority != null) out.l_domain_authority = bl.domainAuthority
  } else {
    out.l_referring_domains = null
    out.l_estate_inbound = null
    out.l_link_velocity = null
    out.l_anchor_natural = null
    out.l_toxic_links = null
    out.l_editorial_links = null
  }

  // ══ E-E-A-T ══
  const author = fm.author || fm.byline || ''
  const hasCredentials = /\b(attorney|lawyer|solicitor|consultant|immigration (specialist|lawyer|expert|professional)|advisor|caseworker)\b/i.test(text) || Boolean(fm.credentials || fm.role)
  const ymyl = isYmyLQuery(input)
  out.e_author_byline = author ? 1 : 0
  out.e_author_credentials = hasCredentials ? 1 : 0
  out.e_disclaimer = out.c_disclaimer
  out.e_citation_density = normalizeRange(citations / Math.max(1, words / 1000), 0, 6, true)
  out.e_primary_source = citations > 0 ? Math.min(1, (body.match(GOV_RE) || []).length / Math.max(1, citations)) : 0
  out.e_ymyl_mitigation = ymyl ? (DISCLAIMER_RE.test(text) && (author || hasCredentials) ? 1 : 0.3) : 1
  out.e_outcome_promise_risk = OUTCOME_PROMISE_RE.test(text) ? 0 : 1
  out.e_transparency = /\b(contact|consultation|about us|about this (guide|article)|reach out|disclaimer)\b/i.test(text) ? 1 : 0.4
  out.e_publication_date = Boolean(fm.date || fm.published || fm.publishDate) ? 1 : 0
  out.e_update_disclosure = /\b(updated|last updated|revised|reviewed|as of)\b/i.test(text) ? 1 : 0
  const stats = (text.match(/\b\d[\d,.]*\s*(%|years?|days?|months?|weeks?|\$|USD|GBP|CAD|AUD)\b/g) || []).length
  out.e_evidence_density = normalizeRange(stats, 0, 6, true)
  out.e_reviewer_disclosure = null
  out.e_brand_reputation = null
  out.e_external_experts = null

  // ══ schema (from content JSON-LD) ══
  const ldBlocks = (body.match(/<script\b[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [])
  const ldText = ldBlocks.join('\n')
  let ldValid = true
  try {
    for (const m of ldBlocks) {
      const json = m.replace(/<script\b[^>]*>[\s\S]*?>/, '').replace(/<\/script>/gi, '')
      JSON.parse(json.trim())
    }
  } catch {
    ldValid = false
  }
  const hasType = (t: string) => new RegExp(`"@type"\\s*:\\s*"${t}"`).test(ldText)
  out.sc_article = hasType('Article') ? 1 : 0
  out.sc_faq = hasType('FAQPage') ? 1 : 0
  out.sc_org = hasType('Organization') ? 1 : 0
  out.sc_person = hasType('Person') ? 1 : 0
  out.sc_breadcrumb = hasType('BreadcrumbList') ? 1 : 0
  out.sc_valid = ldBlocks.length ? (ldValid ? 1 : 0) : null
  out.sc_consistency = hasType('Article') && title ? (ldText.includes(title.slice(0, 30)) ? 1 : 0.5) : null
  out.sc_rich_result = hasType('Article') || hasType('FAQPage') ? 1 : 0
  out.sc_howto = null
  out.sc_video = null

  // ══ SERP / GSC ══
  const g = input.gsc || {}
  out.g_impressions = g.impressions == null ? null : normalizeRange(Math.log10(Math.max(1, g.impressions)), 1.5, 4.5, true)
  out.g_clicks = g.clicks == null ? null : normalizeRange(Math.log10(Math.max(1, g.clicks)), 0, 3, true)
  out.g_ctr = g.ctr == null ? null : normalizeRange(g.ctr, 0.005, 0.12, true)
  out.g_position = g.position == null ? null : normalizeRange(g.position, 20, 1, true)
  const expectedCtr = g.position == null ? null : (g.position <= 3 ? 0.12 : g.position <= 10 ? 0.05 : g.position <= 20 ? 0.025 : 0.01)
  out.g_ctr_deviation = g.ctr != null && expectedCtr != null ? normalizeRange((g.ctr - expectedCtr) / expectedCtr + 1, 0.3, 1.5, true) : null
  out.g_query_count = g.queries == null ? null : normalizeRange(Math.log10(Math.max(1, g.queries)), 1, 3, true)
  const competing = (input.competingUrls || []).filter(Boolean).length
  out.g_cannibal_risk = competing === 0 ? 1 : normalizeRange(competing, 3, 0, true) ?? 1
  out.g_expected_traffic = g.impressions != null && g.position != null
    ? normalizeRange(Math.log10(Math.max(1, g.impressions * (g.position <= 3 ? 0.1 : g.position <= 10 ? 0.03 : 0.01))), 0.5, 3.5, true)
    : null
  out.g_share_of_voice = null
  out.g_serp_feature_opp = null
  out.g_rank_volatility = null
  out.g_new_query_velocity = null
  out.g_lost_query_rate = null
  out.g_ctr_curve = null

  // ══ freshness ══
  out.f_year_marker = text.includes(CURRENT_YEAR) ? 1 : /\b202[4-9]\b/.test(text) ? 0.6 : 0.2
  const updatedTs = input.updatedAt ? new Date(input.updatedAt).getTime() : Date.now()
  const daysSince = Math.max(0, (Date.now() - updatedTs) / 86_400_000)
  out.f_update_recency = normalizeRange(daysSince, 180, 0, true) ?? 1
  out.f_citation_recency = /\b20(2[4-9])\b/.test(text) ? 1 : 0.5
  out.f_fresh_demand = out.intent_freshness ?? 0.3
  const createdTs = input.createdAt ? new Date(input.createdAt).getTime() : Date.now()
  out.f_content_age = normalizeRange(Math.max(0, (Date.now() - createdTs) / 86_400_000), 365, 0, true) ?? 1
  out.f_seasonal_alignment = null
  out.f_trending_velocity = null
  out.f_news_proximity = null
  out.f_update_frequency = null
  out.f_competitor_freshness = null

  // ══ experience ══
  out.x_viewport = out.t_viewport
  out.x_script_count = liveHtml ? normalizeRange(scriptCount, 3, 20, false) : null
  out.x_image_dims = imgCount > 0 ? imgWithDims / imgCount : null
  out.x_lazy_load = liveHtml ? (/(<img\b[^>]*loading=["']lazy["']|<img\b[^>]*loading=lazy)/i.test(liveHtml) ? 1 : 0.5) : null
  out.x_page_weight = out.t_page_weight
  out.x_readability = out.c_reading_level
  out.x_above_fold = out.c_answer_strength
  out.x_alt_text = null
  out.x_core_vitals = null
  out.x_mobile_parity = null

  return out
}

// ═══ Subsystem scoring ═════════════════════════════════════════════════════

function bundle(subsystem: SubsystemId, values: Record<string, number | null>): SignalBundle {
  const defs = SIGNAL_REGISTRY.filter((s) => s.subsystem === subsystem)
  const signals: ComputedSignal[] = defs.map((d) => {
    // computeSignals returns every value as 0-1 GOODNESS (higher = better),
    // so no direction flip happens here — the registry `direction` field is
    // metadata/display only. (2026-08: fixed inverted-window signals that
    // read 0 = "perfect" and leaked satisfied gaps into the fix loop.)
    const value = values[d.id]
    return { id: d.id, label: d.label, subsystem, source: d.source, value, computed: d.computed && value != null }
  })
  const computedSignals = signals.filter((s) => s.computed && s.value != null)
  const weightSum = computedSignals.reduce((a, s) => {
    const def = defs.find((d) => d.id === s.id)
    return a + (def?.weight ?? 1)
  }, 0)
  const score =
    weightSum > 0
      ? computedSignals.reduce((a, s) => {
          const def = defs.find((d) => d.id === s.id)
          return a + (s.value ?? 0) * (def?.weight ?? 1)
        }, 0) / weightSum
      : null
  const coverage = defs.length ? computedSignals.length / defs.length : 0
  return { signals, score, coverage }
}

/** Weighted 0-1 score for one subsystem from raw signal values (no flip —
 *  values are already goodness). Used by the delta-gap gate in recommend(). */
function subsystemScoreFrom(
  values: Record<string, number | null>,
  subsystem: SubsystemId,
): number | null {
  const defs = SIGNAL_REGISTRY.filter((s) => s.subsystem === subsystem)
  const computed = defs
    .map((d) => ({ def: d, value: values[d.id] }))
    .filter((c): c is { def: SignalDef; value: number } => c.def.computed && c.value != null)
  const weightSum = computed.reduce((a, c) => a + c.def.weight, 0)
  if (weightSum <= 0) return null
  return computed.reduce((a, c) => a + c.value * c.def.weight, 0) / weightSum
}

// ═══ Competitive baseline ══════════════════════════════════════════════════

const DEFAULT_BASELINE: Record<SubsystemId, number> = {
  intent: 0.7,
  content: 0.6,
  semantic: 0.55,
  technical: 0.6,
  links: 0.5,
  eeat: 0.55,
  schema: 0.5,
  serp: 0.5,
  freshness: 0.6,
  experience: 0.6,
}

/**
 * SERP-consensus baseline: average subsystem score of the supplied competitor
 * snippets (re-scored with the same machinery), else a deterministic floor.
 */
export function competitiveBaseline(input: MasterEngineInput): Record<SubsystemId, number> {
  const baseline = { ...DEFAULT_BASELINE }
  const snippets = (input.competingSnippets || []).filter(Boolean)
  if (!snippets.length) return baseline
  const bundles: Partial<Record<SubsystemId, SignalBundle>> = {}
  for (const s of snippets) {
    const vals = computeSignals({
      content: s,
      primaryKeyword: input.primaryKeyword,
      topic: input.topic,
      contentType: input.contentType,
    })
    for (const sub of SUBSYSTEMS) {
      const b = bundle(sub, vals)
      if (b.score == null) continue
      if (!bundles[sub]) bundles[sub] = { score: 0, coverage: 0, signals: [] }
      ;(bundles[sub] as { score: number }).score += b.score
    }
  }
  for (const sub of SUBSYSTEMS) {
    const b = bundles[sub] as { score: number } | undefined
    if (b && snippets.length) baseline[sub] = b.score / snippets.length
  }
  return baseline
}

// ═══ Risk gates ════════════════════════════════════════════════════════════

export interface MasterRisk {
  code: string
  severity: 'blocker' | 'warning'
  message: string
}

function evaluateRisks(input: MasterEngineInput, values: Record<string, number | null>): MasterRisk[] {
  const risks: MasterRisk[] = []
  const words = countBodyWords(input.content || '')
  const minWords = minWordsForType(input.contentType || 'legal_guide')
  if (words > 0 && words < minWords) {
    risks.push({
      code: 'thin_content',
      severity: 'blocker',
      message: `Below Google-depth floor: ${words} body words (min ${minWords})`,
    })
  }
  if ((values.c_ai_tells ?? 1) < 0.5) {
    risks.push({ code: 'ai_slop', severity: 'blocker', message: 'Generic AI-language density too high (banned tells)' })
  }
  if ((values.c_keyword_density ?? 0) > 0.4 && values.c_keyword_density != null) {
    // density is a gaussian on 0–1; a low score means far from the 1.2% target — only flag extreme stuffing
  }
  if ((values.e_outcome_promise_risk ?? 1) === 0) {
    risks.push({ code: 'outcome_promise', severity: 'blocker', message: 'Outcome-guarantee language present (YMYL / bar-ethics risk)' })
  }
  if (input.liveHtml && (values.t_noindex_absent ?? 1) === 0) {
    risks.push({ code: 'noindex', severity: 'blocker', message: 'Live page is noindex' })
  }
  if (input.liveHtml && (values.t_canonical_match ?? 1) === 0) {
    risks.push({ code: 'canonical_mismatch', severity: 'warning', message: 'Live canonical does not match the target URL' })
  }
  if ((values.l_orphan_risk ?? 1) === 0) {
    risks.push({ code: 'orphan', severity: 'warning', message: 'Page has no internal estate links (orphan risk)' })
  }
  if (isYmyLQuery(input) && (values.e_disclaimer ?? 0) === 0) {
    risks.push({ code: 'missing_disclaimer', severity: 'blocker', message: 'YMYL content without a legal/educational disclaimer' })
  }
  const competing = (input.competingUrls || []).filter(Boolean).length
  if (competing > 0) {
    risks.push({ code: 'cannibalization', severity: 'warning', message: `${competing} other URL(s) target the same intent — consolidate or differentiate` })
  }
  return risks
}

// ═══ Recommendations ═══════════════════════════════════════════════════════

export interface MasterRecommendation {
  /** Stable machine id (e.g. 'h2_structure', 'faq_schema') for filtering. */
  code: string
  /** True while the underlying gap is still open given the current signals.
   *  The fix loop passes ONLY open recommendations to the review model. */
  open: boolean
  priority: number
  subsystem: SubsystemId
  action: string
  lift: number
  confidence: number
  effort: 'low' | 'medium' | 'high'
  value: number
}

function effortCost(e: MasterRecommendation['effort']): number {
  return e === 'low' ? 1 : e === 'medium' ? 2.5 : 5
}

function recommend(
  input: MasterEngineInput,
  values: Record<string, number | null>,
  deltas: Record<SubsystemId, number>,
  risks: MasterRisk[],
): MasterRecommendation[] {
  const recs: MasterRecommendation[] = []
  const push = (
    code: string,
    subsystem: SubsystemId,
    action: string,
    lift: number,
    confidence: number,
    effort: MasterRecommendation['effort'],
    value = 1,
  ) => recs.push({ code, open: true, priority: 0, subsystem, action, lift, confidence, effort, value })

  const ymyl = isYmyLQuery(input)

  // Specific findings first (highest confidence) — every check reads the
  // signal as 0-1 GOODNESS, so a recommendation is pushed ONLY while its gap
  // is genuinely open (open: true). Satisfied gaps never reach the fix loop.
  if ((values.c_h2_structure ?? 1) < 0.75) {
    push('h2_structure', 'content', 'Add ≥4 H2 sections (procedure, documents, risks, FAQ)', 0.12, 0.8, 'low')
  }
  if ((values.c_citations ?? 0) < 0.7) {
    push('gov_citations', 'content', 'Add 2–3 official .gov/.edu citations with live URLs', 0.1, 0.75, 'low')
  }
  if ((values.c_internal_links ?? 0) < 0.7) {
    push('internal_links', 'links', 'Add 2+ contextual internal links to hub and related estate pages', 0.08, 0.75, 'low')
  }
  if ((values.c_keyword_density ?? 0.3) < 0.4 && values.c_keyword_density != null) {
    push('keyword_density', 'content', 'Normalize primary-keyword density toward ~1.2% (avoid stuffing or absence)', 0.06, 0.6, 'low')
  }
  if ((values.sc_faq ?? 0) === 0) {
    push('faq_schema', 'schema', 'Add FAQPage JSON-LD (4–6 Q&As) for AI-overview eligibility', 0.09, 0.7, 'low')
  }
  if ((values.sc_article ?? 0) === 0) {
    push('article_schema', 'schema', 'Add Article JSON-LD with headline + datePublished', 0.06, 0.7, 'low')
  }
  if ((values.c_tldr ?? 0) === 0) {
    push('tldr_block', 'content', 'Add an "In 60 seconds" quick-answer block for LLM citation', 0.07, 0.7, 'low')
  }
  if (ymyl && (values.e_disclaimer ?? 0) === 0) {
    push('ymyl_disclaimer', 'eeat', 'Add educational disclaimer ("not legal advice")', 0.15, 0.9, 'low', 2)
  }
  if (ymyl && (values.e_author_byline ?? 0) === 0) {
    push('author_byline', 'eeat', 'Add author byline with credentials (YMYL trust)', 0.08, 0.75, 'low')
  }
  if ((values.e_outcome_promise_risk ?? 1) === 0) {
    push('outcome_promise', 'eeat', 'Remove outcome-guarantee language', 0.15, 0.95, 'low', 2)
  }
  if ((values.f_year_marker ?? 0.2) < 0.6) {
    push('year_marker', 'freshness', 'Add current-year markers + "as of" dates so the page reads current', 0.06, 0.65, 'low')
  }
  if ((values.c_ai_tells ?? 1) < 0.6) {
    push('ai_voice', 'content', 'Rewrite generic AI phrases in plain practitioner voice', 0.12, 0.85, 'medium', 2)
  }
  if ((values.c_originality ?? 1) < 0.8) {
    push('originality', 'content', 'Cut repeated sentences; add original examples and case studies', 0.08, 0.7, 'medium')
  }
  if ((values.s_longtail_coverage ?? 1) < 0.6) {
    push('longtail_coverage', 'semantic', 'Work the required long-tail queries into FAQ + H2s naturally', 0.07, 0.7, 'low')
  }
  if ((values.sc_org ?? 0) === 0 || (values.sc_person ?? 0) === 0) {
    push('org_person_schema', 'schema', 'Add Organization + Person (author) JSON-LD with sameAs', 0.05, 0.65, 'low')
  }
  if (competingCount(input.competingUrls) > 0) {
    push('cannibal_merge', 'serp', 'Consolidate/differentiate from competing pages (301 losers → winner)', 0.1, 0.7, 'medium', 2)
  }

  // Subsystem delta gaps (lower confidence, higher effort) — gated on an
  // ABSOLUTE floor so a subsystem that is already strong (≥65) is never told
  // to "close the gap" just because the consensus baseline sits higher.
  for (const sub of SUBSYSTEMS) {
    const delta = deltas[sub]
    if (delta == null) continue
    const absolute = values && subsystemScoreFrom(values, sub)
    if (delta < -0.12 && absolute != null && absolute < 0.65) {
      const gap = Math.abs(delta)
      const label = SUBSYSTEM_LABELS[sub].split(' ')[0].toLowerCase()
      push(`gap_${sub}`, sub, `Close the ${label} gap vs SERP consensus (delta ${(delta * 100).toFixed(0)}pts)`, Math.min(0.18, gap * 0.6), 0.5, gap > 0.2 ? 'high' : 'medium')
    }
  }

  // Priority = Lift × Confidence × Value / Cost (the research-brief formula)
  for (const r of recs) {
    r.priority = Math.round((r.lift * r.confidence * r.value) / effortCost(r.effort) * 1000)
  }
  recs.sort((a, b) => b.priority - a.priority)
  return recs.slice(0, 12)
}

function competingCount(urls?: string[]): number {
  return (urls || []).filter(Boolean).length
}

// ═══ Prediction ════════════════════════════════════════════════════════════

export interface MasterPrediction {
  top10Probability: number | null
  top3Probability: number | null
  expectedLift: number
  expectedTrafficLift: number | null
}

export function predict(
  composite: number,
  deltas: Record<SubsystemId, number>,
  weights: Record<SubsystemId, number>,
  gsc?: MasterEngineInput['gsc'],
): MasterPrediction {
  const positiveDeltaSum = SUBSYSTEMS.reduce((a, s) => a + Math.max(0, deltas[s] ?? 0), 0)
  const sigmoid = (x: number) => 1 / (1 + Math.exp(-x))
  const top10 = sigmoid((composite - 52) / 11 + positiveDeltaSum * 0.55)
  const top3 = sigmoid((composite - 66) / 12 + positiveDeltaSum * 0.4)
  const expectedLift = SUBSYSTEMS.reduce((a, s) => a + Math.max(0, -(deltas[s] ?? 0)) * (weights[s] ?? 0), 0)
  let expectedTrafficLift: number | null = null
  if (gsc?.impressions != null) {
    expectedTrafficLift = Math.round(gsc.impressions * expectedLift * 0.5)
  }
  return {
    top10Probability: Math.round(top10 * 100),
    top3Probability: Math.round(top3 * 100),
    expectedLift: Math.round(expectedLift * 100),
    expectedTrafficLift,
  }
}

// ═══ Report ════════════════════════════════════════════════════════════════

export interface MasterEngineReport {
  generatedAt: string
  intent: IntentId
  intentLabel: string
  composite: number | null
  grade: 'A' | 'B' | 'C' | 'D' | 'F' | null
  weights: Record<SubsystemId, number>
  subsystems: Record<SubsystemId, { score: number | null; coverage: number }>
  deltas: Record<SubsystemId, number | null>
  baseline: Record<SubsystemId, number>
  coverage: { computed: number; total: number; pct: number }
  risks: MasterRisk[]
  recommendations: MasterRecommendation[]
  prediction: MasterPrediction
  computedSignals: ComputedSignal[]
}

function grade(score: number): MasterEngineReport['grade'] {
  if (score >= 85) return 'A'
  if (score >= 70) return 'B'
  if (score >= 55) return 'C'
  if (score >= 40) return 'D'
  return 'F'
}

// ═══ Fix-loop integration ═════════════════════════════════════════════════

export interface MasterEngineFixPlan {
  /** Top UNMET engine gaps, sorted by priority (Priority = Lift × Confidence × Value / Cost). */
  priorities: Array<{
    code: string
    priority: number
    subsystem: SubsystemId
    action: string
    effort: 'low' | 'medium' | 'high'
    lift: number
    confidence: number
  }>
  /** Prompt-ready block telling the review model to address the gaps in order. */
  promptBlock: string
}

/**
 * Build the fix-loop plan: run the engine, take the highest-priority
 * recommendations, and render them into a prompt block the AI re-audit fix
 * loop prepends to fix_all / fix_warnings. Pure and cheap (no AI, no
 * network) — safe to call on every PATCH.
 */
export function masterEngineFixPlan(input: MasterEngineInput): MasterEngineFixPlan {
  const report = scoreMaster(input)
  // Only UNMET gaps reach the model: recommendations are open:true at push
  // time (each guard reads a goodness signal), and the delta-gap gate carries
  // its absolute floor. Filtering again here is the contract's safety net.
  const recs = report.recommendations.filter((r) => r.open).slice(0, 8)
  const priorities = recs.map((r) => ({
    code: r.code,
    priority: r.priority,
    subsystem: r.subsystem,
    action: r.action,
    effort: r.effort,
    lift: r.lift,
    confidence: r.confidence,
  }))
  const promptBlock = [
    '## PRIORITIZED ENGINE GAPS — address IN THIS ORDER (highest expected value first)',
    'Each gap comes from the Master SEO Engine (priority = Lift × Confidence × Value / Cost).',
    ...recs.map((r, i) => `${i + 1}. [${r.subsystem.toUpperCase()} · p${r.priority}] ${r.action} (effort: ${r.effort}, lift ~${Math.round(r.lift * 100)}%)`),
    '',
  ].join('\n')
  return { priorities, promptBlock }
}

export function scoreMaster(input: MasterEngineInput): MasterEngineReport {
  const values = computeSignals(input)
  const intent = detectIntent(input)
  const ymyl = isYmyLQuery(input)
  const weights = weightsFor(intent, ymyl)
  const baseline = competitiveBaseline(input)

  const subsystems = {} as Record<SubsystemId, { score: number | null; coverage: number }>
  const deltas = {} as Record<SubsystemId, number | null>
  let weightedSum = 0
  let weightUsed = 0
  for (const sub of SUBSYSTEMS) {
    const b = bundle(sub, values)
    subsystems[sub] = { score: b.score, coverage: b.coverage }
    deltas[sub] = b.score == null ? null : b.score - baseline[sub]
    if (b.score != null) {
      weightedSum += b.score * weights[sub]
      weightUsed += weights[sub]
    }
  }
  const composite = weightUsed > 0 ? weightedSum / weightUsed : null
  const computedSignals = SUBSYSTEMS.flatMap((s) => bundle(s, values).signals)
  const risks = evaluateRisks(input, values)
  const recs = recommend(input, values, deltas, risks)
  const prediction = predict(composite ?? 50, deltas, weights, input.gsc)

  return {
    generatedAt: new Date().toISOString(),
    intent,
    intentLabel: ymyl ? `${intent.toUpperCase()} · YMYL` : intent.toUpperCase(),
    composite: composite == null ? null : Math.round(composite * 100),
    grade: composite == null ? null : grade(composite * 100),
    weights,
    subsystems,
    deltas,
    baseline,
    coverage: {
      computed: computedSignals.filter((s) => s.computed && s.value != null).length,
      total: SIGNAL_COUNT,
      pct: Math.round((computedSignals.filter((s) => s.computed && s.value != null).length / SIGNAL_COUNT) * 100),
    },
    risks,
    recommendations: recs,
    prediction,
    computedSignals,
  }
}
