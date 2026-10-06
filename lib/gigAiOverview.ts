/**
 * Marketplace gig curated overview — generation contract + sanitizers.
 *
 * The public gig page used to label `pitch || seo_description` as an
 * "AI summary" and bolt it onto About This Service. That was a frankenstein
 * card/meta field, not a curated overview. This module owns the real overview:
 * standalone prose covering who the service is for, what is included, and
 * the buyer outcome — never a "Summary:" patch on the description.
 */

export const AI_OVERVIEW_MIN_CHARS = 120
export const AI_OVERVIEW_MAX_CHARS = 900
export const AI_OVERVIEW_TARGET_MIN = 220
export const AI_OVERVIEW_TARGET_MAX = 520

const LABEL_PREFIX =
  /^\s*(?:#{1,6}\s*)?(?:ai\s*)?(?:summary|overview|tl;?dr|in\s+brief|quick\s+summary|service\s+summary|about\s+this\s+service)\s*[:\-–—]\s*/i

const PROVIDER_MINI_BIO =
  /^\s*(?:i\s+am|i'?m)\s+(?:a|an)\s+(?:us\s+|u\.s\.\s+|uk\s+|canadian\s+|australian\s+)?(?:licensed\s+|qualified\s+|practicing\s+)?(?:attorney|lawyer|solicitor|barrister|consultant|advisor|adviser|editor|coach)\b/i

export type GigOverviewSource = {
  title?: string | null
  pitch?: string | null
  tagline?: string | null
  description?: string | null
  seo_description?: string | null
  category?: string | null
  subcategory?: string | null
  jurisdiction?: string | null
  tags?: string[] | null
  requirements?: string | null
  faq?: Array<{ question?: string; answer?: string }> | null
  tiers?: Array<{
    tier?: string | null
    title?: string | null
    description?: string | null
    price?: number | null
    delivery_days?: number | null
    features?: string[] | null
    is_active?: boolean | null
  }> | null
  provider_type?: string | null
}

/** Strip bolted-on labels and normalize whitespace for storage/display. */
export function sanitizeGigAiOverview(raw: string): string {
  let s = String(raw || '').replace(/\r\n/g, '\n').trim()
  if (!s) return ''

  s = s.replace(/^```(?:\w+)?\s*/i, '').replace(/\s*```$/i, '').trim()
  s = s.replace(/^["'`]+|["'`]+$/g, '').trim()

  for (let i = 0; i < 3; i += 1) {
    const next = s.replace(LABEL_PREFIX, '').trim()
    if (next === s) break
    s = next
  }

  s = s
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()

  return s
}

export function isValidGigAiOverview(text: string): boolean {
  const s = sanitizeGigAiOverview(text)
  if (s.length < AI_OVERVIEW_MIN_CHARS || s.length > AI_OVERVIEW_MAX_CHARS) return false
  if (LABEL_PREFIX.test(s)) return false
  return true
}

export function gigAiOverviewQualityIssues(text: string): string[] {
  const s = sanitizeGigAiOverview(text)
  const issues: string[] = []
  if (s.length < AI_OVERVIEW_TARGET_MIN) issues.push(`short (${s.length} < ${AI_OVERVIEW_TARGET_MIN})`)
  if (s.length > AI_OVERVIEW_TARGET_MAX) issues.push(`long (${s.length} > ${AI_OVERVIEW_TARGET_MAX})`)
  if (PROVIDER_MINI_BIO.test(s)) issues.push('opens as provider mini-bio')
  if (/\b(summary|tl;?dr)\s*:/i.test(s)) issues.push('contains summary label')
  if (/\b(navigating|comprehensive guide|tailored to your (?:unique )?needs|leverage|cutting-edge)\b/i.test(s)) {
    issues.push('banned AI tell')
  }
  return issues
}

/** Resolve which stored field the public page should render as Overview. */
export function resolveGigOverviewText(gig: {
  ai_overview?: string | null
  pitch?: string | null
  seo_description?: string | null
}): string {
  const curated = sanitizeGigAiOverview(String(gig.ai_overview || ''))
  if (isValidGigAiOverview(curated)) return curated
  // Intentionally do NOT fall back to pitch/seo_description — that was the
  // bolted-on "AI summary" bug.
  return ''
}

export function buildGigAiOverviewSystemPrompt(role: 'attorney' | 'consultant' = 'attorney'): string {
  const consultant = role === 'consultant'
  return [
    consultant
      ? 'You write curated marketplace service overviews for professional consulting gigs (academic, career, business, settlement). You are not drafting legal advice.'
      : 'You write curated marketplace service overviews for licensed legal/immigration professional-service gigs.',
    'Output ONLY the overview prose. No title, no "Summary:", no markdown headings, no bullets, no emoji.',
    'Write a standalone curated overview a buyer can read without the long description: who it is for, what is included, and the outcome of the work.',
    'Length: 220–520 characters, 2–4 short sentences, second-person buyer bias ("you\'ll get", "your filing").',
    'Never open with provider identity or credentials ("I am a New York attorney…"). Credentials belong in the provider card, not the overview.',
    'Use ONLY facts present in the gig context. Never invent credentials, approval rates, guarantees, forms, prices, or turnaround times.',
    consultant
      ? 'Do not imply licensed legal representation or filing on the buyer\'s behalf.'
      : 'Do not promise case outcomes or approvals.',
    'Banned bolted style: do not append a patch onto a description, do not write "In summary", do not restate the title alone.',
  ].join('\n')
}

export function buildGigAiOverviewUserPrompt(source: GigOverviewSource): string {
  const activeTiers = (source.tiers || []).filter((t) => t && t.is_active !== false)
  const tierLines = activeTiers.slice(0, 3).map((t) => {
    const price = typeof t.price === 'number' && t.price > 0 ? `$${(t.price / 100).toFixed(0)}` : null
    const days = typeof t.delivery_days === 'number' ? `${t.delivery_days}d` : null
    const feats = Array.isArray(t.features) && t.features.length
      ? t.features.slice(0, 4).join('; ')
      : ''
    return `- ${t.tier || 'tier'}: ${t.title || ''}${price ? ` · from ${price}` : ''}${days ? ` · ${days}` : ''}${feats ? ` · ${feats}` : ''}`.trim()
  })

  const faqLines = (source.faq || [])
    .slice(0, 4)
    .map((f) => `- Q: ${String(f.question || '').trim()} / A: ${String(f.answer || '').trim().slice(0, 160)}`)
    .filter((line) => line.length > 8)

  const desc = String(source.description || '').replace(/\s+/g, ' ').trim().slice(0, 1800)

  return [
    'Draft a curated Overview for this marketplace gig.',
    '',
    `Title: ${String(source.title || '').trim() || '(untitled)'}`,
    `Provider type: ${String(source.provider_type || 'attorney')}`,
    `Category: ${String(source.category || '')} / ${String(source.subcategory || '')}`,
    `Jurisdiction: ${String(source.jurisdiction || '')}`,
    source.tags?.length ? `Tags: ${source.tags.slice(0, 8).join(', ')}` : '',
    source.pitch ? `Pitch (card field — do not copy as overview): ${String(source.pitch).slice(0, 220)}` : '',
    source.tagline ? `Tagline: ${String(source.tagline).slice(0, 160)}` : '',
    source.seo_description ? `SEO description (meta — do not copy as overview): ${String(source.seo_description).slice(0, 180)}` : '',
    desc ? `Long description (source of truth):\n${desc}` : '',
    source.requirements ? `Buyer requirements: ${String(source.requirements).replace(/\s+/g, ' ').trim().slice(0, 400)}` : '',
    tierLines.length ? `Active packages:\n${tierLines.join('\n')}` : '',
    faqLines.length ? `FAQ highlights:\n${faqLines.join('\n')}` : '',
    '',
    'Return ONLY the overview paragraph(s).',
  ].filter(Boolean).join('\n')
}
