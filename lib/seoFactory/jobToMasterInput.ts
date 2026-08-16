/**
 * Shared mapper: content_jobs row → MasterEngineInput.
 *
 * Single source of truth for the field mapping so the live route
 * (/api/seo-engine/master), the Track-ledger backfill script
 * (scripts/backfill-master-engine.mts) and any future consumer never drift
 * apart. Pure — no DB, no network.
 */
import type { MasterEngineInput } from './masterEngine'

export interface MasterEngineJobRowLike {
  id?: string
  topic?: string | null
  title?: string | null
  primary_keyword?: string | null
  content_type?: string | null
  region?: string | null
  content?: string | null
  indexable?: boolean | null
  canonical_url?: string | null
  live_html?: string | null
  live_url?: string | null
  live_http_status?: number | null
  required_short_keywords?: string[] | null
  required_long_tail_keywords?: string[] | null
  competing_snippets?: string[] | null
  competing_urls?: string[] | null
  /** GSC aggregate snapshot — stored as gsc_json on content_jobs. */
  gsc_json?: Record<string, unknown> | null
  gsc?: Record<string, unknown> | null
  backlinks_json?: Record<string, unknown> | null
  authority_score?: number | null
  created_at?: string | null
  updated_at?: string | null
  /** LLM Content Quality module (Subsystem A) — persisted typed columns. */
  content_quality_score?: number | null
  content_depth_score?: number | null
  content_gap_missing_subtopics?: string[] | null
  content_top_competitor?: string | null
  content_top_competitor_depth?: number | null
  content_confidence_avg?: number | null
  /** LLM Semantic/NLP module (Subsystem H) — persisted typed columns. */
  semantic_coverage_score?: number | null
  semantic_missing_entities?: string[] | null
  semantic_top_competitor?: string | null
  semantic_top_competitor_coverage?: number | null
  semantic_confidence_avg?: number | null
  semantic_flags?: string[] | null
}

const gscOf = (gsc: Record<string, unknown> | null | undefined): MasterEngineInput['gsc'] => {
  if (!gsc || typeof gsc !== 'object') return undefined
  const out: MasterEngineInput['gsc'] = {
    impressions: typeof gsc.impressions === 'number' ? gsc.impressions : undefined,
    clicks: typeof gsc.clicks === 'number' ? gsc.clicks : undefined,
    ctr: typeof gsc.ctr === 'number' ? gsc.ctr : undefined,
    position: typeof gsc.position === 'number' ? gsc.position : undefined,
    queries: typeof gsc.queries === 'number' ? gsc.queries : undefined,
  }
  // A blob with no usable numeric fields is treated as absent.
  return Object.values(out).some((v) => v !== undefined) ? out : undefined
}

const contentQualityOf = (job: MasterEngineJobRowLike): MasterEngineInput['contentQuality'] => {
  const score = typeof job.content_quality_score === 'number' ? job.content_quality_score : null
  const missingSubtopics = Array.isArray(job.content_gap_missing_subtopics)
    ? job.content_gap_missing_subtopics.map(String).filter(Boolean)
    : []
  if (score == null && !missingSubtopics.length && !job.content_top_competitor) return undefined
  return {
    score,
    confidence: typeof job.content_confidence_avg === 'number' ? job.content_confidence_avg : null,
    missingSubtopics,
    topCompetitorUrl: job.content_top_competitor || null,
    topCompetitorDepthScore: typeof job.content_top_competitor_depth === 'number' ? job.content_top_competitor_depth : null,
  }
}

const semanticNlpOf = (job: MasterEngineJobRowLike): MasterEngineInput['semanticNlp'] => {
  const score = typeof job.semantic_coverage_score === 'number' ? job.semantic_coverage_score : null
  const missingEntities = Array.isArray(job.semantic_missing_entities)
    ? job.semantic_missing_entities.map(String).filter(Boolean)
    : []
  if (score == null && !missingEntities.length && !job.semantic_top_competitor) return undefined
  return {
    score,
    confidence: typeof job.semantic_confidence_avg === 'number' ? job.semantic_confidence_avg : null,
    missingEntities,
    topCompetitorUrl: job.semantic_top_competitor || null,
    topCompetitorEntityCoverage: typeof job.semantic_top_competitor_coverage === 'number' ? job.semantic_top_competitor_coverage : null,
    flags: Array.isArray(job.semantic_flags) ? job.semantic_flags.map(String) : undefined,
  }
}

export function jobToMasterEngineInput(job: MasterEngineJobRowLike): MasterEngineInput {
  return {
    topic: job.topic || undefined,
    primaryKeyword: job.primary_keyword || job.topic || undefined,
    contentType: job.content_type || undefined,
    region: job.region || undefined,
    title: job.title || undefined,
    content: job.content || undefined,
    liveHtml: job.live_html || undefined,
    liveUrl: job.live_url || job.canonical_url || undefined,
    liveHttpStatus: job.live_http_status ?? undefined,
    indexable: job.indexable ?? undefined,
    canonicalUrl: job.canonical_url || undefined,
    requiredShortKeywords: job.required_short_keywords || undefined,
    requiredLongTailKeywords: job.required_long_tail_keywords || undefined,
    competingSnippets: job.competing_snippets || undefined,
    competingUrls: job.competing_urls || undefined,
    gsc: gscOf(job.gsc_json ?? job.gsc),
    backlinks: (job.backlinks_json as unknown as MasterEngineInput['backlinks']) || undefined,
    authorityScore: job.authority_score ?? undefined,
    createdAt: job.created_at || undefined,
    updatedAt: job.updated_at || undefined,
    contentQuality: contentQualityOf(job),
    semanticNlp: semanticNlpOf(job),
  }
}
