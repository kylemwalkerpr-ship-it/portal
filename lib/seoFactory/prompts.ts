/**
 * SEO Factory prompt builders — structured, quality-first generation.
 */

import type { OwnerPlan } from './ownership'

export function buildFactorySystemPrompt(opts: {
  plan: OwnerPlan
  contentType: string
  minWords: number
}): string {
  const { plan, contentType, minWords } = opts
  return [
    'You are the YouSafe / MyCaseworks SEO content factory for immigration law content.',
    'Voice: calm, precise, practitioner-grade. Second person ("you"). Plain English.',
    'ZERO outcome promises. No guarantees of visas, approvals, timelines, or results.',
    'BANNED: delve, streamline, game-changer, revolutionize, leverage (verb), robust, seamless, holistic, bespoke, unpack, navigate the complexities, "In today\'s fast-paced".',
    'Cite official sources with full https URLs: USCIS, IRCC, UKVI/GOV.UK, Home Affairs, SEVP as relevant.',
    '',
    'OUTPUT FORMAT (strict):',
    '1) YAML front matter between --- fences with fields:',
    '   title, description (140-160 chars), primaryKeyword, robots, date (YYYY-MM-DD), region, content_type',
    plan.indexable
      ? '2) robots: index,follow'
      : '2) robots: noindex,follow',
    `3) Canonical intent: ${plan.canonicalUrl}`,
    `4) Owner host: ${plan.host} — do not cannibalize other estate hosts.`,
    '5) Body structure:',
    '   - H1 (matches title)',
    '   - ## In 60 seconds (3–5 bullets)',
    '   - ≥4 H2 sections with concrete procedures, documents, risks',
    '   - ## FAQ (4–6 Q&A)',
    '   - ## Sources (bullet list of official URLs)',
    '   - Article + FAQPage JSON-LD in <script type="application/ld+json"> blocks',
    '   - Short disclaimer: educational only, not legal advice',
    `6) Minimum ${minWords} words of body prose (not counting JSON-LD).`,
    `7) Content type: ${contentType}`,
    '8) Do NOT wrap output in markdown code fences. Emit raw markdown only.',
  ].join('\n')
}

export function buildFactoryUserPrompt(opts: {
  title: string
  topic: string
  primaryKeyword: string
  region: string
  contentType: string
  tone: string
  audience?: string
  gscBlock: string
  opportunityAction?: string
  refineNotes?: string
}): string {
  const parts = [
    `Title hint: ${opts.title}`,
    `Topic: ${opts.topic}`,
    `Primary keyword (must appear naturally in title + first H2): ${opts.primaryKeyword}`,
    `Region: ${opts.region}`,
    `Content type: ${opts.contentType}`,
    `Tone: ${opts.tone}`,
    opts.audience ? `Audience: ${opts.audience}` : '',
    '',
    opts.gscBlock,
    '',
    opts.opportunityAction === 'title_rewrite'
      ? 'Emphasize a high-CTR title and meta description (year + place + concrete action). Expand the page so it deserves ranking.'
      : 'Expand with concrete procedures, document checklists, timelines, and FAQs for high-impression / weak-rank demand.',
    'Write the full page now.',
  ]
  if (opts.refineNotes) {
    parts.push(
      '',
      '## REVISION REQUIRED',
      'A previous draft failed the SEO audit. Fix ALL of the following issues in a complete rewrite:',
      opts.refineNotes,
    )
  }
  return parts.filter(Boolean).join('\n')
}

export function minWordsForType(contentType: string): number {
  if (contentType === 'article' || contentType === 'legal_guide') return 1200
  if (contentType === 'regional_page') return 800
  if (contentType === 'marketplace_gig') return 400
  if (contentType === 'blog_summary' || contentType === 'blog_post') return 700
  return 900
}

/** Turn audit failures into revision instructions for a refine pass. */
export function auditToRefineNotes(audit: {
  blockers: Array<{ message: string; fix?: string }>
  warnings: Array<{ message: string; fix?: string }>
  wordCount: number
  score: number
}): string {
  const lines: string[] = [
    `Previous score: ${audit.score}. Word count was ${audit.wordCount}.`,
  ]
  for (const b of audit.blockers.slice(0, 8)) {
    lines.push(`- BLOCKER: ${b.message}${b.fix ? ` → Fix: ${b.fix}` : ''}`)
  }
  for (const w of audit.warnings.slice(0, 8)) {
    lines.push(`- WARNING: ${w.message}${w.fix ? ` → Fix: ${w.fix}` : ''}`)
  }
  lines.push(
    'Ensure: official .gov/.edu URLs, TL;DR block, ≥4 H2s, FAQ + FAQPage schema, Article schema, disclaimer, meta description 140–160 chars.',
  )
  return lines.join('\n')
}
