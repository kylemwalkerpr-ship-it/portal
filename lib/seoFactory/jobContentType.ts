/**
 * content_jobs.content_type is constrained by a DB CHECK to
 * ('blog_post', 'article', 'regional_page', 'marketplace_gig').
 * The pipeline's internal contentType vocabulary is wider
 * ('legal_guide', 'regional_university', 'regional_from', 'blog_summary',
 * …) for depth rules and prompts, but any value outside the CHECK set makes
 * the job-row insert fail — and the failure is silent (the row is optional
 * for drafting), so drafts converge with no queue row and can never be
 * approved. Normalize at every content_jobs write.
 */
import { isExplicitDestinationType, normalizeStudioContentType } from './ownership'

const DB_ALLOWED_CONTENT_TYPES = new Set([
  'blog_post',
  'article',
  'regional_page',
  'marketplace_gig',
])

const CONTENT_TYPE_ALIASES: Record<string, string> = {
  legal_guide: 'article',
  regional_university: 'regional_page',
  regional_from: 'regional_page',
  blog_summary: 'blog_post',
}

export function normalizeJobContentType(contentType: string | null | undefined): string {
  const raw = (contentType || '').trim()
  if (DB_ALLOWED_CONTENT_TYPES.has(raw)) return raw
  const aliased = CONTENT_TYPE_ALIASES[raw]
  if (aliased && DB_ALLOWED_CONTENT_TYPES.has(aliased)) return aliased
  return 'article'
}

function yamlContentType(content: string | null | undefined): string {
  const m = String(content || '').match(/^---[\s\S]*?\ncontent_type:\s*["']?([a-z_]+)["']?/i)
  return m ? m[1].trim().toLowerCase() : ''
}

/**
 * Editorial type for depth/ship gates. DB stores `article` for legal_guide,
 * so a blog wrongly persisted as article still recovers from /blog/ URL or YAML.
 */
export function resolveEditorialContentType(opts: {
  contentType?: string | null
  canonicalUrl?: string | null
  filePath?: string | null
  content?: string | null
}): string {
  const path = `${opts.filePath || ''} ${opts.canonicalUrl || ''}`.toLowerCase()
  const yaml = yamlContentType(opts.content)
  const stored = String(opts.contentType || '').trim().toLowerCase()
  const storedN = stored ? normalizeStudioContentType(stored) : ''
  const yamlN = yaml ? normalizeStudioContentType(yaml) : ''

  if (
    storedN === 'blog_post' ||
    storedN === 'blog_summary' ||
    yamlN === 'blog_post' ||
    yamlN === 'blog_summary' ||
    /\/blog\//.test(path)
  ) {
    return 'blog_post'
  }
  if (
    storedN === 'regional_page' ||
    storedN === 'regional_from' ||
    storedN === 'regional_university' ||
    yamlN === 'regional_page' ||
    yamlN === 'regional_from' ||
    yamlN === 'regional_university'
  ) {
    return storedN.startsWith('regional') ? storedN : yamlN
  }
  if (storedN === 'marketplace_gig' || yamlN === 'marketplace_gig') return 'marketplace_gig'
  if (storedN === 'legal_guide' || storedN === 'article' || stored === 'article' || yamlN === 'legal_guide' || yamlN === 'article') {
    return 'legal_guide'
  }
  return storedN || yamlN || 'legal_guide'
}

/** After resolveOwner: studio destination types stick. Blogs never become legal_guide. */
export function finalizePipelineContentType(
  requested: string | undefined,
  plan: { host?: string; filePath?: string; contentType?: string; intentClass?: string },
): string {
  const req = normalizeStudioContentType(requested || '')
  const path = String(plan.filePath || '')
  if (req === 'blog_post' || req === 'blog_summary') return 'blog_post'
  if (/\/blog\//.test(path) || /app\/blog\//.test(path)) return 'blog_post'
  if (/content\/universities\//.test(path)) return 'regional_university'
  if (/content\/from\//.test(path)) return 'regional_from'
  if (isExplicitDestinationType(req) && req.startsWith('regional')) return req

  let contentType = normalizeStudioContentType(plan.contentType || req || 'legal_guide')
  if (plan.intentClass === 'geo_modifier') contentType = 'regional_from'
  else if (plan.intentClass === 'university_modifier') contentType = 'regional_university'
  else if ((plan.intentClass === 'transactional' || plan.intentClass === 'news_summary') && !requested) {
    contentType = 'blog_summary'
  } else if (plan.host === 'legal' && (contentType === 'regional_page' || !requested)) {
    contentType = 'legal_guide'
  }
  if (
    (plan.host === 'usa' || plan.host === 'uk' || plan.host === 'ca' || plan.host === 'au' || plan.host === 'apex') &&
    (contentType === 'legal_guide' || contentType === 'article')
  ) {
    contentType = plan.host === 'apex' ? 'blog_post' : 'regional_page'
  }
  return contentType
}
