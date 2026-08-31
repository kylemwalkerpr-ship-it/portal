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
