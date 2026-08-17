/**
 * Google-aligned content depth floors for the SEO Factory.
 *
 * Google does not publish a fixed word count, but the Helpful Content / quality
 * rater systems penalize thin pages that fail to satisfy intent. For unattended
 * immigration (YMYL-adjacent) publishing we enforce conservative floors so
 * factory ships never land as thin stubs.
 *
 * SEO guard / master plan word count gates:
 * - Pillar / legal canonicals: 2,200–2,800 body words
 * - Blog / news summaries:   800–1,500 body words
 * - Regional / from-country: 1,200–1,800 body words
 * - Marketplace gigs:         500–1,200 (scannable offer, not essay)
 *
 * Absolute thin floor: never ship indexable body under 800 words (guides) /
 * 600 (blogs) regardless of type aliasing.
 *
 * Pages that exceed maxWords will be warned (non-blocking) so the pipeline
 * can auto-trim or the reviewer can flag for splitting.
 */

export type DepthTier = 'pillar' | 'blog' | 'regional' | 'gig' | 'default'

export interface DepthSpec {
  tier: DepthTier
  /** Hard minimum body words (JSON-LD / scripts excluded). Ship blocked below this. */
  minWords: number
  /** Prompt target — model should aim here, not at the floor. */
  targetWords: number
  /** Hard maximum body words. Content exceeding this triggers a warning and may be trimmed. */
  maxWords: number
  /** Below this → always "thin content" blocker even if type floor is lower. */
  absoluteThinFloor: number
  label: string
}

const SPECS: Record<DepthTier, DepthSpec> = {
  pillar: {
    tier: 'pillar',
    minWords: 2200,
    targetWords: 2500,
    maxWords: 2800,
    absoluteThinFloor: 900,
    label: 'legal guide / article (Google comprehensive / YMYL-safe)',
  },
  blog: {
    tier: 'blog',
    minWords: 800,
    targetWords: 1200,
    maxWords: 1500,
    absoluteThinFloor: 600,
    label: 'blog / news summary',
  },
  regional: {
    tier: 'regional',
    minWords: 1200,
    targetWords: 1500,
    maxWords: 2000,
    absoluteThinFloor: 700,
    label: 'regional / university / from-country page',
  },
  gig: {
    tier: 'gig',
    minWords: 500,
    targetWords: 700,
    maxWords: 1200,
    absoluteThinFloor: 350,
    label: 'marketplace gig',
  },
  default: {
    tier: 'default',
    minWords: 1200,
    targetWords: 1500,
    maxWords: 2000,
    absoluteThinFloor: 700,
    label: 'general editorial page',
  },
}

export function depthTierForType(contentType: string): DepthTier {
  const t = (contentType || '').toLowerCase()
  if (t === 'article' || t === 'legal_guide' || t === 'legal-guide') return 'pillar'
  if (t === 'blog_summary' || t === 'blog_post' || t === 'blog' || t === 'news_summary') return 'blog'
  if (
    t === 'regional_page' ||
    t === 'regional_from' ||
    t === 'regional_university' ||
    t === 'regional'
  ) {
    return 'regional'
  }
  if (t === 'marketplace_gig' || t === 'gig') return 'gig'
  return 'default'
}

export function depthSpecForType(contentType: string): DepthSpec {
  return SPECS[depthTierForType(contentType)]
}

/** Hard minimum body words for a content type (ship/audit floor). */
export function minWordsForType(contentType: string): number {
  return depthSpecForType(contentType).minWords
}

/** Prompt target words (aim above the floor so refine has headroom). */
export function targetWordsForType(contentType: string): number {
  return depthSpecForType(contentType).targetWords
}

/** Hard maximum body words. Content exceeding this triggers a warning and may be trimmed. */
export function maxWordsForType(contentType: string): number {
  return depthSpecForType(contentType).maxWords
}

/**
 * Clamp a model-echoed word range into the canonical depth budget for a
 * content type. Used by the Research brief so a generated brief can never
 * under-spec (below the Google floor) or over-spec (above the hard max) the
 * drafting length — the same numbers the draft audit and ship gate enforce.
 *
 * A model sub-range fully inside the budget is kept (e.g. article 2400–2600);
 * anything outside snaps back to the canonical min/max.
 */
export function clampBriefWordBudget(
  contentType: string,
  modelMin?: number | null,
  modelMax?: number | null,
): { minWords: number; maxWords: number } {
  const minWords = minWordsForType(contentType)
  const maxWords = maxWordsForType(contentType)
  const mMin = Number(modelMin) || 0
  const mMax = Number(modelMax) || 0
  const finalMin = mMin >= minWords && mMin <= maxWords ? mMin : minWords
  const finalMax = mMax >= finalMin && mMax <= maxWords ? mMax : maxWords
  return { minWords: finalMin, maxWords: finalMax }
}

/**
 * THE Content Studio word counter. Persist, display, quality, audit, and
 * ship all use this. YAML, JSON-LD, scripts, and fenced code are excluded
 * so schema inflation cannot fake Google-depth.
 */
export function countBodyWords(content: string): number {
  let body = String(content || '')
  // Front matter
  body = body.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
  // Scripts / JSON-LD
  body = body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
  // Fenced code (including ```json schema dumps models sometimes emit)
  body = body.replace(/```[\s\S]*?```/g, ' ')
  // Inline schema-ish blobs
  body = body.replace(/\{\s*"@context"\s*:\s*"https?:\/\/schema\.org"[\s\S]*?\n\}/g, ' ')
  // HTML tags → space
  body = body.replace(/<[^>]+>/g, ' ')
  // Collapse
  return body
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0 && !/^[{}\[\]",:;]+$/.test(w)).length
}

export interface DepthCheckResult {
  ok: boolean
  wordCount: number
  minWords: number
  targetWords: number
  maxWords: number
  tier: DepthTier
  /** True when below absolute thin floor (always ship-blocking). */
  thin: boolean
  /** True when below type minWords. */
  belowMin: boolean
  errors: string[]
  warnings: string[]
}

export function checkContentDepth(opts: {
  content: string
  contentType: string
  /** If false, still warn but allow slightly lower floors for private drafts — default true for factory ships. */
  indexable?: boolean
}): DepthCheckResult {
  const spec = depthSpecForType(opts.contentType)
  const wordCount = countBodyWords(opts.content)
  const indexable = opts.indexable !== false
  const errors: string[] = []
  const warnings: string[] = []

  const belowMin = wordCount < spec.minWords
  const thin = wordCount < spec.absoluteThinFloor

  if (thin) {
    errors.push(
      `Thin content: ${wordCount} body words (absolute floor ${spec.absoluteThinFloor} for ${spec.label}). Google treats thin pages as low-quality; expand with procedures, documents, FAQs, and sources.`,
    )
  } else if (belowMin) {
    errors.push(
      `Below Google-depth floor: ${wordCount} body words (min ${spec.minWords}, target ${spec.targetWords} for ${spec.label}). Unattended factory ships must fully satisfy search intent.`,
    )
  } else if (wordCount < spec.targetWords) {
    warnings.push(
      `Acceptable but short of target: ${wordCount} words (target ${spec.targetWords} for ${spec.label}).`,
    )
  }

  // Indexable ships never allowed under min
  if (indexable && belowMin && !errors.length) {
    errors.push(
      `Indexable ship requires ≥${spec.minWords} body words (have ${wordCount}).`,
    )
  }

  // Cap check: warn when content exceeds the max word count
  const overMax = wordCount > spec.maxWords
  if (overMax) {
    warnings.push(
      `Exceeds max word count: ${wordCount} words (max ${spec.maxWords} for ${spec.label}). Consider splitting into sub-topics or trimming redundant sections.`,
    )
  }

  return {
    ok: errors.length === 0,
    wordCount,
    minWords: spec.minWords,
    targetWords: spec.targetWords,
    maxWords: spec.maxWords,
    tier: spec.tier,
    thin,
    belowMin,
    errors,
    warnings,
  }
}

/** Throw before any GitHub write when depth fails (approve cannot bypass). */
export function assertContentDepth(opts: {
  content: string
  contentType: string
  indexable?: boolean
}): DepthCheckResult {
  const r = checkContentDepth(opts)
  if (!r.ok) {
    throw new Error(
      `Ship refused — content depth (Google SEO floor):\n- ${r.errors.join('\n- ')}`,
    )
  }
  return r
}

/** One-line prompt fragment for system/user prompts. */
export function depthPromptClause(contentType: string): string {
  const s = depthSpecForType(contentType)
  return [
    `DEPTH (Google helpful-content / anti-thin): minimum ${s.minWords} body words of real prose; aim for ~${s.targetWords}; HARD MAX ${s.maxWords} words — do NOT exceed.`,
    'Do NOT count YAML front matter, JSON-LD, or code fences toward the minimum.',
    'Cover the query completely: definitions, eligibility/steps, documents, risks/timelines, FAQ (4–6), official sources.',
    'Padding, repetition, and keyword stuffing do not count as depth — add concrete procedures and citable facts only.',
    `Longer than ${s.maxWords} words is penalized by the SEO audit — trim redundant sections and stay concise.`,
  ].join(' ')
}
