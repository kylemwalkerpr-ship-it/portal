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
  }
}
