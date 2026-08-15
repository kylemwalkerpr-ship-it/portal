/**
 * HTML-native live audit — the post-deploy page re-check used by ship → live
 * verification (verifyLiveUrl).
 *
 * The draft audit (audit.ts) is markdown-oriented: it reads YAML front matter,
 * `## H2` headings, `[text](url)` markdown links, and "In 60 seconds" prose.
 * Feeding it the raw HTML fetched from a live URL produced garbage scores
 * (a healthy page read ~13/100) because none of those markers exist in HTML —
 * so every live verification was stamped "needs review · score < 30" no matter
 * how good the page actually was, and the word count was inflated by nav /
 * footer boilerplate.
 *
 * This module instead extracts the real article body from rendered HTML and
 * scores the live signals natively: <h1>/<h2> tags, meta description, JSON-LD,
 * government citations, estate interlinks, disclaimer, TL;DR block, and a true
 * body word count (boilerplate stripped). The result is a meaningful 0–100
 * health score for the live page, independent of the markdown draft audit.
 */
import { minWordsForType, targetWordsForType } from './contentDepth'
import { DISCLAIMER_RE, evaluateContentQuality } from './contentQualityGate'
import { ESTATE_LINK_RE } from './linkAudit'

export interface LiveAuditResult {
  /** 0–100 live-page health score (10 checks × 10 points). */
  score: number
  /** Human-voice heuristic (0–100) run on the extracted article text, or null if it errored. */
  humanScore: number | null
  /** True body word count — nav/footer/header/scripts stripped. */
  wordCount: number
  h1: string | null
  h2Count: number
  metaDescription: string | null
  hasArticleSchema: boolean
  hasFaqSchema: boolean
  hasGovCitations: boolean
  hasDisclaimer: boolean
  hasTldr: boolean
  internalLinks: number
  keywordInTitle: boolean
  keywordInBody: boolean
  warnings: string[]
}

/** Same authority-domains the draft audit treats as official citations. */
const GOV_RE = /\.gov|\.edu|uscis\.gov|canada\.ca|homeaffairs\.gov|gov\.uk|ircc/i

/** TL;DR / AI-answer markers (mirrors audit.ts ai_answer_block). */
const TLDR_RE = /tldr|in 60 seconds|quick answer|key takeaways/i

function htmlDecode(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

/** Strip scripts/styles/comments/head and chrome (nav/footer/header/aside). */
function stripBoilerplate(html: string): string {
  let h = html
  h = h.replace(/<!--[\s\S]*?-->/g, ' ')
  h = h.replace(/<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
  h = h.replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/gi, ' ')
  h = h.replace(/<(nav|footer|header|aside)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
  return h
}

/** Prefer <article>/<main>; fall back to the boilerplate-stripped body. */
function articleRegion(html: string): string {
  const m = html.match(/<(article|main)\b[^>]*>[\s\S]*?<\/\1\s*>/i)
  return m ? m[0] : stripBoilerplate(html)
}

function htmlToText(html: string): string {
  return htmlDecode(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim()
}

function firstTagText(html: string, tag: string): string | null {
  const m = html.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}\\s*>`, 'i'))
  return m ? htmlToText(m[1]) : null
}

function metaDescription(html: string): string | null {
  const patterns = [
    /<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i,
    /<meta\b[^>]*content=["']([^"']*)["'][^>]*name=["']description["'][^>]*>/i,
    /<meta\b[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["'][^>]*>/i,
    /<meta\b[^>]*content=["']([^"']*)["'][^>]*property=["']og:description["'][^>]*>/i,
  ]
  for (const re of patterns) {
    const m = html.match(re)
    if (m && m[1]) return htmlDecode(m[1]).trim()
  }
  return null
}

function jsonLdText(html: string): string {
  const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let out = ''
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) out += m[1] + '\n'
  return out
}

function extractHrefs(html: string): string[] {
  const re = /href=["']([^"']+)["']/gi
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const u = m[1].trim()
    if (u) out.push(u)
  }
  return out
}

export function auditLiveHtml(opts: {
  html: string
  contentType?: string
  primaryKeyword?: string
}): LiveAuditResult {
  const contentType = opts.contentType || 'legal_guide'
  const minWords = minWordsForType(contentType)
  const targetWords = targetWordsForType(contentType)
  const region = articleRegion(opts.html || '')
  const text = htmlToText(region)
  const wordCount = text
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0 && !/^[{}\[\]",:;]+$/.test(w)).length

  const h1 = firstTagText(opts.html || '', 'h1')
  const h2Count = (opts.html.match(/<h2\b[^>]*>/gi) || []).length
  const meta = metaDescription(opts.html || '')
  const ld = jsonLdText(opts.html || '')
  const hasArticleSchema = /"@type"\s*:\s*"Article"/.test(ld)
  const hasFaqSchema = /"@type"\s*:\s*"FAQPage"/.test(ld)

  const hrefs = extractHrefs(region)
  const estateRe = new RegExp(ESTATE_LINK_RE.source, 'i')
  const internalHrefs = new Set(hrefs.filter((u) => u.startsWith('/') || estateRe.test(u)))
  const internalLinks = internalHrefs.size

  const hasGovCitations = hrefs.some((u) => GOV_RE.test(u)) || GOV_RE.test(text)
  const hasDisclaimer = DISCLAIMER_RE.test(text)
  const hasTldr = TLDR_RE.test(text)

  const primary = (opts.primaryKeyword || '').toLowerCase()
  const firstWord = primary.split(' ')[0] || ''
  const keywordInTitle = Boolean(firstWord && h1 && h1.toLowerCase().includes(firstWord))
  const keywordInBody = Boolean(firstWord && text.toLowerCase().includes(firstWord))

  let humanScore: number | null = null
  try {
    const q = evaluateContentQuality({
      content: text,
      contentType,
      primaryKeyword: opts.primaryKeyword || '',
      indexable: true,
    })
    humanScore = q.humanScore
  } catch {
    humanScore = null
  }

  const warnings: string[] = []
  // 10 checks × 10 points = 100. Each is an HTML-native live signal.
  let score = 0

  if (wordCount >= minWords) {
    score += 10
    if (wordCount < targetWords) {
      warnings.push(`Live word count ${wordCount} meets floor ${minWords} but under target ${targetWords}`)
    }
  } else {
    warnings.push(`Live word count ${wordCount} below floor ${minWords}`)
  }

  if (h1 && h1.length >= 10 && h1.length <= 70) score += 10
  else warnings.push(h1 ? `Live H1 length ${h1.length} (want 10–70)` : 'Live page missing <h1>')

  if (h2Count >= 4) score += 10
  else warnings.push(`Live H2 count ${h2Count} (want ≥4)`)

  if (meta && meta.length >= 120 && meta.length <= 170) score += 10
  else warnings.push(meta ? `Live meta description length ${meta.length}` : 'Live page missing meta description')

  if (hasArticleSchema) score += 10
  else warnings.push('Live page missing Article JSON-LD')

  if (hasFaqSchema) score += 10
  else warnings.push('Live page missing FAQPage JSON-LD')

  if (hasGovCitations) score += 10
  else warnings.push('Live page missing .gov/.edu citations')

  if (internalLinks >= 2) score += 10
  else warnings.push(`Live internal/estate links ${internalLinks} (want ≥2)`)

  if (hasDisclaimer) score += 10
  else warnings.push('Live page missing legal disclaimer')

  if (hasTldr) score += 10
  else warnings.push('Live page missing TL;DR / quick-answer block')

  return {
    score,
    humanScore,
    wordCount,
    h1,
    h2Count,
    metaDescription: meta,
    hasArticleSchema,
    hasFaqSchema,
    hasGovCitations,
    hasDisclaimer,
    hasTldr,
    internalLinks,
    keywordInTitle,
    keywordInBody,
    warnings,
  }
}
