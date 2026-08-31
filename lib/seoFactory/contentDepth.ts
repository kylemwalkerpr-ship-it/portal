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

/**
 * Operational target threshold. A word processor's count can differ by a few
 * words from markdown tokenisation, so do not create filler work for the final
 * one percent. The canonical target remains unchanged for prompts and UI.
 */
export function targetThresholdForType(contentType: string): number {
  const spec = depthSpecForType(contentType)
  const tolerance = Math.max(20, Math.round(spec.targetWords * 0.01))
  return Math.max(spec.minWords, spec.targetWords - tolerance)
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
 * Models sometimes wrap the entire article in one ```markdown fence.
 * That makes the draft look present in the editor while countBodyWords
 * (which strips fences) reports 0 — and H2/FAQ scanners miss every heading.
 */
export function unwrapWholeDocumentFence(content: string): string {
  const raw = String(content || '')
  const trimmed = raw.trim()
  const take = (inner: string): string | null => {
    const t = inner.replace(/\s+$/, '')
    return t.trim() ? `${t}\n` : null
  }
  const exact = trimmed.match(/^```(?:markdown|md|mdx)?[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/i)
  if (exact) {
    const inner = take(exact[1])
    if (inner) return inner
  }
  // Reviewer/reasoning models (DeepSeek V4 Pro especially) often prefix
  // "Here is the complete article:" and then fence the body — sometimes as
  // ```text / ```article, not ```markdown. Unwrap when the fence is clearly
  // the article and the preamble is a short acknowledgement.
  const fenced = trimmed.match(/```(?:markdown|md|mdx|text|article|tsx|html)?[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*\s*$/i)
  if (fenced) {
    const inner = fenced[1]
    const fenceAt = trimmed.indexOf('```')
    const preamble = fenceAt > 0 ? trimmed.slice(0, fenceAt).trim() : ''
    const innerWords = inner.split(/\s+/).filter(Boolean).length
    const preWords = preamble ? preamble.split(/\s+/).filter(Boolean).length : 0
    if (innerWords >= 40 && innerWords > preWords) {
      const taken = take(inner)
      if (taken) return taken
    }
  }
  return raw
}

/** Honest header: never hide a 0-word editor behind a stale stored count. */
export function formatBodyWordDisplay(live: number, stored?: number | null): string {
  if (live > 0) return String(live)
  if (stored && stored > 0) return `0 (stored ${stored} — not in editor)`
  return live === 0 ? '0' : '—'
}

/**
 * THE Content Studio word counter. Persist, display, quality, audit, and
 * ship all use this. YAML, JSON-LD, scripts, and fenced code are excluded
 * so schema inflation cannot fake Google-depth.
 */
export function countBodyWords(content: string): number {
  let body = unwrapWholeDocumentFence(content)
  // Front matter
  body = body.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
  // Scripts / JSON-LD
  body = body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
  // Fenced code (including ```json schema dumps models sometimes emit)
  body = body.replace(/```[\s\S]*?```/g, ' ')
  // Inline schema-ish blobs
  body = body.replace(/\{\s*"@context"\s*:\s*"https?:\/\/schema\.org"[\s\S]*?\n\}/g, ' ')
  // Markdown images are not visible prose; links retain their visible label.
  body = body.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
  body = body.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  // Word treats a visible URL as one token, regardless of path punctuation.
  body = body.replace(/https?:\/\/[^\s<>)\]}]+/gi, ' URLTOKEN ')
  // HTML tags → space
  body = body.replace(/<[^>]+>/g, ' ')
  // Markdown syntax is formatting, not a word in Word/Google Docs.
  body = body
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}(?:[-+*]|\d+[.)])\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/[|*_~`]+/g, ' ')
    .replace(/&(?:nbsp|amp|lt|gt|quot|#39);/gi, ' ')
  // Unicode words, with apostrophes and hyphens kept inside one Word-style
  // token. This is the canonical counter used by UI, persistence and gates.
  return body.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)?.length || 0
}

/**
 * Reduce runaway prose without touching document structure. Only complete
 * trailing sentences from ordinary paragraphs may be removed: headings,
 * numbered/bulleted lists, tables, blockquotes, code, frontmatter and scripts
 * remain byte-for-byte intact and in the same order.
 */
export function trimMarkdownProseToWordBudget(
  content: string,
  maxWords: number,
  minWords = 0,
): { content: string; removedWords: number } {
  const original = String(content || '')
  const originalWords = countBodyWords(original)
  if (originalWords <= maxWords) return { content: original, removedWords: 0 }

  const blocks = original.split(/(\r?\n\s*\r?\n)/)
  const isSeparator = (value: string) => /^\r?\n\s*\r?\n$/.test(value)
  const protectedBlock = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return true
    if (/^(?:---|```|~~~|<script\b)/i.test(trimmed)) return true
    return value.split(/\r?\n/).some((line) =>
      /^\s*(?:#{1,6}\s|[-+*]\s|\d+[.)]\s|>|\|)/.test(line) ||
      (/\|/.test(line) && /^\s*\|?\s*:?-{3,}/.test(line)),
    )
  }

  let guard = 0
  while (countBodyWords(blocks.join('')) > maxWords && guard++ < 500) {
    const candidates = blocks
      .map((value, index) => ({ value, index, words: countBodyWords(value) }))
      .filter((b) => !isSeparator(b.value) && !protectedBlock(b.value) && b.words > 20)
      .sort((a, b) => b.words - a.words || b.index - a.index)
    const candidate = candidates[0]
    if (!candidate) break
    const sentences = candidate.value.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g)?.map((s) => s.trim()).filter(Boolean) || []
    const beforeTotal = countBodyWords(blocks.join(''))
    let nextParagraph = ''
    if (sentences.length > 1) {
      nextParagraph = sentences.slice(0, -1).join(' ').trim()
    } else {
      // Runaway single-sentence paragraphs have no safe sentence boundary.
      // Keep their opening words (and add terminal punctuation) instead of
      // deleting a heading/list/table or flattening the whole document.
      const remove = Math.max(1, beforeTotal - maxWords)
      const rawTokens = candidate.value.trim().split(/\s+/)
      const keep = Math.max(0, rawTokens.length - remove)
      nextParagraph = keep >= 8 ? `${rawTokens.slice(0, keep).join(' ').replace(/[,:;\-]+$/, '')}.` : ''
    }
    const afterTotal = beforeTotal - candidate.words + countBodyWords(nextParagraph)
    if (afterTotal < minWords || afterTotal >= beforeTotal) break
    blocks[candidate.index] = nextParagraph
  }

  const trimmed = blocks.join('').replace(/[ \t]+\r?\n/g, '\n').replace(/\n{3,}/g, '\n\n')
  const finalWords = countBodyWords(trimmed)
  return finalWords < originalWords && finalWords >= minWords
    ? { content: trimmed, removedWords: originalWords - finalWords }
    : { content: original, removedWords: 0 }
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
  } else if (wordCount < targetThresholdForType(opts.contentType)) {
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
