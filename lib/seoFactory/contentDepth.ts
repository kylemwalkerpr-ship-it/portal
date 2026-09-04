/**
 * Google-aligned content depth floors for the SEO Factory.
 *
 * Google does not publish a fixed word count, but the Helpful Content / quality
 * rater systems penalize thin pages that fail to satisfy intent. For unattended
 * immigration (YMYL-adjacent) publishing we enforce conservative floors so
 * factory ships never land as thin stubs.
 *
 * Estate word-count gates (tight):
 * - Caseworks canonical / legal_guide: 2,200–2,500 body words
 * - Apex blogs (yousafe-consultancy /blog): 800–1,200
 * - Regional guides (usa/uk/ca/au): 1,200–2,000
 * - Marketplace gigs: 500–1,200
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
    targetWords: 2350,
    maxWords: 2500,
    absoluteThinFloor: 900,
    label: 'legal guide / article (Google comprehensive / YMYL-safe)',
  },
  blog: {
    tier: 'blog',
    minWords: 800,
    targetWords: 1000,
    maxWords: 1200,
    absoluteThinFloor: 600,
    label: 'blog / news summary',
  },
  regional: {
    tier: 'regional',
    minWords: 1200,
    targetWords: 1600,
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

/**
 * Client-safe editorial type for the draft word chip. Must not import
 * ownership/seoDataLoaders (those pull node:fs into the webpack client bundle).
 */
export function editorialTypeForDepth(opts: {
  contentType?: string | null
  studioType?: string | null
  canonicalUrl?: string | null
  filePath?: string | null
  content?: string | null
}): string {
  const studio = String(opts.studioType || '').toLowerCase()
  if (studio === 'blog_post' || studio === 'blog' || studio === 'blog_summary') return 'blog_post'
  const path = `${opts.filePath || ''} ${opts.canonicalUrl || ''}`.toLowerCase()
  const yaml = String(opts.content || '').match(/^---[\s\S]*?\ncontent_type:\s*["']?([a-z_]+)/i)
  const yamlT = (yaml?.[1] || '').toLowerCase()
  const stored = String(opts.contentType || '').toLowerCase()
  if (
    stored === 'blog_post' ||
    stored === 'blog' ||
    yamlT === 'blog_post' ||
    yamlT === 'blog' ||
    /\/blog\//.test(path) ||
    /app\/blog\//.test(path)
  ) {
    return 'blog_post'
  }
  if (stored.startsWith('regional') || yamlT.startsWith('regional') || studio === 'regional_page') {
    return 'regional_page'
  }
  if (stored === 'marketplace_gig' && !/^catalogue\//.test(path)) return 'blog_post'
  if (stored === 'marketplace_gig') return 'marketplace_gig'
  if (stored === 'article' || stored === 'legal_guide' || studio === 'article') return 'legal_guide'
  return stored || studio || 'legal_guide'
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
 * CANONICAL WINDOW (single source of truth): the spec window is returned
 * verbatim — a model sub-range no longer survives, because the pipeline,
 * the prompt LENGTH line, the section budgets and the audit must all show
 * the SAME window or the drafter resolves the contradiction by writing long.
 */
export function clampBriefWordBudget(
  contentType: string,
  _modelMin?: number | null,
  _modelMax?: number | null,
): { minWords: number; maxWords: number } {
  // Spec is canonical. Ignore model-echoed ranges entirely.
  void _modelMin
  void _modelMax
  return { minWords: minWordsForType(contentType), maxWords: maxWordsForType(contentType) }
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
  // Live stream: the opening ```markdown fence often arrives before the
  // closer. Count the inner article, not 0, while the model is still writing.
  const unclosed = trimmed.match(/^```(?:markdown|md|mdx)?[ \t]*\r?\n([\s\S]*)$/i)
  if (unclosed && !unclosed[1].includes('```')) {
    const inner = take(unclosed[1])
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
const YAML_LEAD_KEY =
  /^(title|description|metaDescription|primaryKeyword|robots|date|region|content_?type|contentType|ownerHost|canonicalUrl|canonical|ogImage|slug|layout)\s*:/i

/** Drop YAML scaffolding. Never discard H1/body just because the opening fence never closed. */
function stripLeadingYaml(content: string): string {
  // Models glue KEEP onto the opening fence (KEEP---). Treat as --- so YAML is excluded from body counts.
  const raw = String(content || '').replace(/^\uFEFF/, '').replace(/\bKEEP---+/gi, '---')
  const closed = raw.match(/^\s*---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/)
  if (closed) return raw.slice(closed.index! + closed[0].length)

  let t = raw.trimStart()
  const yamlish = /^(---|title\s*:|description\s*:|primaryKeyword\s*:)/i.test(t)
  if (!yamlish) return raw

  t = t.replace(/^---[ \t]*/, '')
  t = t.replace(/^\r?\n/, '')

  const heading = t.search(/(?:^|\n)#{1,6}\s+\S/)
  if (heading !== -1) {
    return t.slice(t[heading] === '\n' ? heading + 1 : heading)
  }

  const lines = t.split(/\n/)
  let i = 0
  while (i < lines.length) {
    const tr = lines[i].trim()
    if (!tr || tr === '---') {
      i++
      continue
    }
    const keys = tr.match(/\b(?:title|description|primaryKeyword|robots|date|region|content_?type|ownerHost|canonicalUrl|ogImage)\s*:/gi) || []
    if (YAML_LEAD_KEY.test(tr) || keys.length >= 2) {
      i++
      continue
    }
    break
  }
  return lines.slice(i).join('\n')
}

export function countBodyWords(content: string): number {
  let body = stripLeadingYaml(unwrapWholeDocumentFence(content))
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
 * True when the document does NOT open with an unclosed YAML frontmatter
 * block. A truncated stream can cut off mid-frontmatter — the opening `---`
 * never gets its closing fence — and what was streamed is all scaffolding:
 * zero prose. Depth rescue uses this to refuse expansion (and the pipeline
 * to regenerate) instead of "expanding" a frontmatter-only draft.
 * (A body that legitimately STARTS with a thematic break is not a shape the
 * pipeline produces; treating it as malformed only affects expansion
 * eligibility, never shipping.)
 */
export function openingFrontmatterClosed(content: string): boolean {
  const t = String(content || '').trimStart()
  if (!t.startsWith('---')) return true
  return /^---\r?\n[\s\S]*?\r?\n---(\r?\n|$)/.test(t)
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
  const isHeadingOnly = (value: string) => /^\s*#{1,6}\s+\S/.test(value.trim()) && !/\n\s*\S/.test(value.trim().replace(/^\s*#{1,6}\s+[^\n]+/, ''))
  const isFence = (value: string) => /^(?:---|```|~~~|<script\b)/i.test(value.trim())
  const isTable = (value: string) =>
    value.split(/\r?\n/).some((line) => /\|/.test(line) && /^\s*\|?\s*:?-{3,}/.test(line))
  const isList = (value: string) =>
    value.split(/\r?\n/).filter((l) => l.trim()).every((line) => /^\s*(?:[-+*]\s|\d+[.)]\s|>)/.test(line))
  const hardProtected = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return true
    if (isFence(value) || isHeadingOnly(value) || isTable(value)) return true
    // YMYL / required end-matter: never truncate the educational disclaimer,
    // FAQ, or official-sources blocks the same way we keep fences intact.
    if (/\*\*Disclaimer\*\*|^\*?Disclaimer\s*:/i.test(trimmed)) return true
    if (/^##\s+(FAQ|Frequently asked questions|Official sources|Sources|Disclaimer|In 60 seconds|TL;DR|Key takeaways)\b/i.test(trimmed)) return true
    return false
  }

  const precedingHeading = (arr: string[], index: number): string => {
    for (let i = index - 1; i >= 0; i--) {
      const t = arr[i].trim()
      if (!t || isSeparator(arr[i])) continue
      const h = t.match(/^#{1,6}\s+(.+)/)
      return h ? h[1] : ''
    }
    return ''
  }

  const protectedSectionBody = (arr: string[], index: number, value: string) => {
    if (/\*\*Disclaimer\*\*|^\*?Disclaimer\s*:/i.test(value.trim())) return true
    const heading = precedingHeading(arr, index)
    return /^(FAQ|Frequently asked questions|Official sources|Sources|Disclaimer|In 60 seconds|TL;DR|Key takeaways|Table of contents)\b/i.test(heading)
  }

  const dropLastSentence = (value: string, beforeTotal: number): string => {
    const sentences = value.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g)?.map((s) => s.trim()).filter(Boolean) || []
    if (sentences.length > 1) return sentences.slice(0, -1).join(' ').trim()
    const remove = Math.max(1, beforeTotal - maxWords)
    const rawTokens = value.trim().split(/\s+/)
    const keep = Math.max(0, rawTokens.length - remove)
    return keep >= 4 ? `${rawTokens.slice(0, keep).join(' ').replace(/[,:;\-]+$/, '')}.` : ''
  }

  const dropLastListItem = (value: string): string => {
    const lines = value.split(/\r?\n/)
    let lastItem = -1
    for (let i = lines.length - 1; i >= 0; i--) {
      if (/^\s*(?:[-+*]\s|\d+[.)]\s)/.test(lines[i])) {
        lastItem = i
        break
      }
    }
    if (lastItem < 0) return value
    const kept = lines.filter((_, i) => i !== lastItem)
    return kept.some((l) => l.trim()) ? kept.join('\n') : ''
  }

  let guard = 0
  while (countBodyWords(blocks.join('')) > maxWords && guard++ < 800) {
    const beforeTotal = countBodyWords(blocks.join(''))
    const prose = blocks
      .map((value, index) => ({ value, index, words: countBodyWords(value) }))
      .filter((b) => !isSeparator(b.value) && !hardProtected(b.value) && !protectedSectionBody(blocks, b.index, b.value) && !isList(b.value) && b.words >= 4)
      .sort((a, b) => b.words - a.words || b.index - a.index)
    const candidate = prose[0]
    if (candidate) {
      const nextParagraph = dropLastSentence(candidate.value, beforeTotal)
      const afterTotal = beforeTotal - candidate.words + countBodyWords(nextParagraph)
      if (afterTotal >= beforeTotal) break
      if (afterTotal < minWords && afterTotal < maxWords) {
        // Prefer landing at max rather than refusing the trim when the
        // leftover still clears the floor on a later, smaller cut.
        if (beforeTotal - 1 < minWords) break
      }
      if (afterTotal < minWords && countBodyWords(nextParagraph) === 0 && afterTotal < minWords) {
        // Emptying this block would undershoot — try a smaller cut via tokens.
        const tokens = candidate.value.trim().split(/\s+/)
        const need = beforeTotal - maxWords
        const keep = Math.max(4, tokens.length - need)
        if (keep >= tokens.length) break
        const clipped = `${tokens.slice(0, keep).join(' ').replace(/[,:;\-]+$/, '')}.`
        if (beforeTotal - candidate.words + countBodyWords(clipped) < minWords) break
        blocks[candidate.index] = clipped
        continue
      }
      blocks[candidate.index] = nextParagraph
      continue
    }

    // Soft overshoot often lives in TLDR / FAQ lists. Drop trailing items.
    const lists = blocks
      .map((value, index) => ({ value, index, words: countBodyWords(value) }))
      .filter((b) => !isSeparator(b.value) && isList(b.value) && b.words >= 4 && !protectedSectionBody(blocks, b.index, b.value))
      .sort((a, b) => b.index - a.index)
    const list = lists[0]
    if (list) {
      const next = dropLastListItem(list.value)
      const afterTotal = beforeTotal - list.words + countBodyWords(next)
      if (afterTotal >= beforeTotal || afterTotal < minWords) break
      blocks[list.index] = next
      continue
    }
    break
  }

  const trimmed = blocks.join('').replace(/[ \t]+\r?\n/g, '\n').replace(/\n{3,}/g, '\n\n')
  const finalWords = countBodyWords(trimmed)
  if (finalWords <= maxWords && finalWords >= Math.min(minWords, maxWords) && finalWords < originalWords) {
    return { content: trimmed, removedWords: originalWords - finalWords }
  }
  // Last resort: still over max — keep heading/fence/table bytes, clip leftover
  // prose tokens from the longest remaining non-heading block so the desk
  // never receives a ship-blocking overshoot.
  if (finalWords > maxWords) {
    const fallbackBlocks = trimmed.split(/(\r?\n\s*\r?\n)/)
    const need = finalWords - maxWords
    const clipAt = fallbackBlocks
      .map((value, index) => ({ value, index, words: countBodyWords(value) }))
      .filter((b) => !isSeparator(b.value) && !hardProtected(b.value) && !protectedSectionBody(fallbackBlocks, b.index, b.value) && b.words > 0)
      .sort((a, b) => b.words - a.words || b.index - a.index)[0]
    if (clipAt) {
      const tokens = clipAt.value.trim().split(/\s+/)
      const keep = Math.max(0, tokens.length - need)
      const next = keep >= 4 ? `${tokens.slice(0, keep).join(' ').replace(/[,:;\-]+$/, '')}.` : ''
      fallbackBlocks[clipAt.index] = next
      const out = fallbackBlocks.join('').replace(/\n{3,}/g, '\n\n')
      const outWords = countBodyWords(out)
      if (outWords <= maxWords && outWords >= Math.min(minWords, maxWords) && outWords < originalWords) {
        return { content: out, removedWords: originalWords - outWords }
      }
    }
  }
  return finalWords < originalWords && finalWords >= minWords && finalWords <= maxWords
    ? { content: trimmed, removedWords: originalWords - finalWords }
    : { content: original, removedWords: 0 }
}

/**
 * Pipeline door: after generate / refine / outline / depth expansion, the
 * draft handed to the desk must sit in [minWords, maxWords] when the body
 * started at or above the floor. Uses the same countBodyWords rules as the
 * audit (prose only — YAML, fences, JSON-LD excluded).
 */
export function enforceBodyWordBudget(
  content: string,
  contentType: string,
  bounds?: { minWords?: number; maxWords?: number },
): { content: string; removedWords: number } {
  const maxWords = bounds?.maxWords ?? maxWordsForType(contentType)
  const minWords = bounds?.minWords ?? minWordsForType(contentType)
  return trimMarkdownProseToWordBudget(content, maxWords, Math.min(minWords, maxWords))
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
  /** True when above the hard maxWords (bloat — ship-blocking). */
  overMax: boolean
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

  // Cap check: content over the hard max is REJECTED — bloat is as much a
  // depth failure as thin content. The pipeline trims every attempt to the
  // window, but a draft that still lands over (manual paste, reviewer
  // rewrite, model overshoot) must never read as "depth satisfied".
  const overMax = wordCount > spec.maxWords
  if (overMax) {
    errors.push(
      `Exceeds max word count: ${wordCount} words (max ${spec.maxWords} for ${spec.label}). Over-budget pages are rejected — trim redundant sections or split into sub-topics.`,
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
    overMax,
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
