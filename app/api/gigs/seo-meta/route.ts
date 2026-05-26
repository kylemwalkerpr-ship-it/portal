import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'
import { getKeywordsForCategory, countKeywordDensity, computeSEOScore } from '@/lib/seoUtils'

const TITLE_SUFFIX = ' | YouSafe'
const MAX_TITLE_LENGTH = 60
const MAX_DESC_LENGTH = 160

/**
 * POST /api/gigs/seo-meta
 *
 * Generates optimized SEO metadata for a gig. Accepts gig data directly
 * (for use in the wizard) or a gig_id (fetches from DB).
 *
 * Body:
 *   { gig_id?: string } — fetches gig from DB
 *   or full gig fields: { title, pitch, description, tags, category, jurisdiction, seo_title?, seo_description? }
 *
 * Returns:
 *   { score, checks, suggested_title, suggested_description, suggested_keywords, missing_fields }
 */
export async function POST(req: Request) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const body = await req.json().catch(() => ({}))
  if (!body || typeof body !== 'object') return fail('Request body is required.', 422)

  let gigData: Record<string, any>

  // If a gig_id is provided, fetch the gig from the database
  if (body.gig_id) {
    const { data: gig, error } = await auth.db
      .from('gigs')
      .select('id, title, pitch, description, tags, category, subcategory, jurisdiction, seo_title, seo_description')
      .eq('id', body.gig_id)
      .eq('provider_id', auth.profileId)
      .single()

    if (error || !gig) return fail('Gig not found or access denied.', 404)
    gigData = gig
  } else {
    gigData = {
      title: body.title || '',
      pitch: body.pitch || '',
      description: body.description || '',
      tags: Array.isArray(body.tags) ? body.tags : [],
      category: body.category || '',
      jurisdiction: body.jurisdiction || '',
      seo_title: body.seo_title || '',
      seo_description: body.seo_description || '',
    }
  }

  const title = String(gigData.title || '')
  const pitch = String(gigData.pitch || '')
  const description = String(gigData.description || '')
  const tags: string[] = Array.isArray(gigData.tags) ? gigData.tags.map(String) : []
  const category = String(gigData.category || '')
  const jurisdiction = String(gigData.jurisdiction || '')
  const existingSeoTitle = String(gigData.seo_title || '')
  const existingSeoDesc = String(gigData.seo_description || '')

  const keywords = getKeywordsForCategory(category)

  // Compute current SEO score
  const scoreResult = computeSEOScore({
    title,
    pitch,
    description,
    tags,
    category,
    jurisdiction,
    seo_title: existingSeoTitle,
    seo_description: existingSeoDesc,
  })

  // Generate suggested SEO title
  let suggestedTitle = existingSeoTitle || title
  const availableLen = MAX_TITLE_LENGTH - TITLE_SUFFIX.length
  if (suggestedTitle.length > availableLen) {
    suggestedTitle = suggestedTitle.slice(0, availableLen - 1) + '…'
  }
  if (!suggestedTitle.toLowerCase().includes('yousafe')) {
    suggestedTitle = suggestedTitle + TITLE_SUFFIX
  }

  // Generate suggested SEO description
  let suggestedDescription = existingSeoDesc || pitch || description.slice(0, MAX_DESC_LENGTH)
  if (suggestedDescription.length > MAX_DESC_LENGTH) {
    suggestedDescription = suggestedDescription.slice(0, MAX_DESC_LENGTH - 1) + '…'
  }

  // Identify missing/weak fields
  const missingFields: string[] = []
  if (!existingSeoTitle) missingFields.push('seo_title')
  if (!existingSeoDesc) missingFields.push('seo_description')
  if (!pitch) missingFields.push('pitch')
  if (description.length < 300) missingFields.push('description_too_short')
  if (tags.length < 3) missingFields.push('tags')
  if (!jurisdiction) missingFields.push('jurisdiction')

  // Check keyword presence in title and description
  const keywordInTitle = countKeywordDensity(title, keywords)
  const keywordInDesc = countKeywordDensity(pitch || description, keywords)
  const missingKeywords = keywordInTitle < 1 || keywordInDesc < 1
    ? keywords.slice(0, 3)
    : []

  // Improvement suggestions
  const suggestions: string[] = []
  if (title.length < 20) suggestions.push(`Extend gig title to at least 20 characters (currently ${title.length})`)
  if (existingSeoTitle && existingSeoTitle.length > 60) suggestions.push(`Shorten SEO title to ≤60 chars for Google display (currently ${existingSeoTitle.length})`)
  if (description.length < 300) suggestions.push(`Expand gig description to at least 300 characters (adds ${300 - description.length} more)`)
  if (pitch.length < 40) suggestions.push(`Write a tagline/pitch of 40–160 characters`)
  if (tags.length < 3) suggestions.push(`Add ${3 - tags.length} more tag${tags.length === 2 ? '' : 's'} (aim for 3–5)`)
  if (missingKeywords.length > 0) suggestions.push(`Include keywords in content: "${missingKeywords.join('", "')}"`)
  if (!jurisdiction) suggestions.push('Set a jurisdiction to improve geographic search relevance')
  if (!existingSeoTitle) suggestions.push('Create a separate SEO title to target different keywords than the gig title')
  if (!existingSeoDesc) suggestions.push('Add a custom meta description to boost click-through from search results')

  const failedChecks = scoreResult.checks.filter(c => !c.passed)
  const optimizationScore = Math.round(
    (scoreResult.checks.filter(c => c.passed).reduce((s, c) => s + c.weight, 0) / 100) * 100
  )

  return ok({
    score: optimizationScore,
    total_weight: 100,
    passed_weight: scoreResult.checks.filter(c => c.passed).reduce((s, c) => s + c.weight, 0),
    checks: scoreResult.checks,
    failed_checks: failedChecks,
    suggested_title: suggestedTitle,
    suggested_description: suggestedDescription,
    suggested_keywords: keywords,
    missing_keywords: missingKeywords,
    missing_fields: missingFields,
    suggestions,
    keyword_count_in_title: keywordInTitle,
    keyword_count_in_description: keywordInDesc,
  })
}
