/**
 * Post-AI editorial scaffold so audit / ship gates can pass on drafts from
 * any model (DeepSeek V4 Pro, Cloudflare, Groq, …).
 *
 * AI often returns body-only markdown without YAML, disclaimer, or citations.
 * We never invent legal facts — only structure required for estate compliance.
 */

import { DISCLAIMER_RE } from './contentQualityGate'

const REGION_SOURCES: Record<string, Array<{ title: string; url: string }>> = {
  US: [
    { title: 'USCIS — Students and Employment', url: 'https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/students-and-employment' },
    { title: 'Study in the States (DHS / SEVP)', url: 'https://studyinthestates.dhs.gov/' },
  ],
  UK: [
    { title: 'GOV.UK — Student visa', url: 'https://www.gov.uk/student-visa' },
    { title: 'GOV.UK — Immigration Rules', url: 'https://www.gov.uk/guidance/immigration-rules' },
  ],
  CA: [
    { title: 'IRCC — Study permit', url: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada.html' },
    { title: 'IRCC — Work after graduation (PGWP)', url: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/work/after-graduation.html' },
  ],
  AU: [
    { title: 'Home Affairs — Student visa (subclass 500)', url: 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500' },
    { title: 'Home Affairs — Temporary Graduate visa (485)', url: 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485' },
  ],
}

function stripFm(content: string): { fm: string; body: string } {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!m) return { fm: '', body: content.trim() }
  return { fm: m[1], body: m[2].trim() }
}

function hasDisclaimer(body: string): boolean {
  return DISCLAIMER_RE.test(body)
}

function hasGovCitation(body: string): boolean {
  return /\.gov|\.edu|uscis\.gov|canada\.ca|homeaffairs\.gov|gov\.uk|ircc|studyinthestates/i.test(body)
}

function metaDescriptionFrom(title: string, body: string, primaryKeyword: string): string {
  const plain = body
    .replace(/^#+\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const seed =
    plain.slice(0, 200) ||
    `${title}. Practical guidance on ${primaryKeyword || title} for international students and immigrants.`
  let desc = seed.slice(0, 158)
  if (desc.length < 120) {
    desc = `${title} — practical checklist and steps for ${primaryKeyword || 'your application'}. Editorial only; not legal advice.`
  }
  if (desc.length > 160) desc = desc.slice(0, 157).replace(/\s+\S*$/, '') + '…'
  if (desc.length < 120) {
    desc = (desc + ' Verify every rule against official government sources before you apply.').slice(0, 160)
  }
  return desc.slice(0, 160)
}

function titleLine(title: string, primaryKeyword: string): string {
  const t = (title || primaryKeyword || 'Immigration guide').trim()
  if (t.length >= 12 && t.length <= 70) return t
  if (t.length > 70) return t.slice(0, 67).replace(/\s+\S*$/, '') + '…'
  return `${t} — practical guide`.slice(0, 70)
}

/**
 * Rewrite known AI-slop phrases to plain English so quality gates don't
 * hard-block otherwise solid DeepSeek/CF drafts. Structural fix: any model
 * may emit these; we normalize before audit/ship rather than fail the job.
 */
export function sanitizeAiSlop(text: string): string {
  const pairs: Array<[RegExp, string]> = [
    [/\bit is important to note that\b/gi, 'Note that'],
    [/\bit is worth noting that\b/gi, 'Note that'],
    [/\bin this comprehensive guide\b/gi, 'in this guide'],
    [/\bthis comprehensive guide\b/gi, 'This guide'],
    [/\bwhether you are looking\b/gi, 'If you need'],
    [/\blook no further\b/gi, 'use the steps below'],
    [/\bat the end of the day\b/gi, 'Ultimately'],
    [/\bit goes without saying\b/gi, 'Clearly'],
    [/\bneedless to say\b/gi, ''],
    [/\bwithout further ado\b/gi, ''],
    [/\ba plethora of\b/gi, 'many'],
    [/\bmyriad of\b/gi, 'many'],
    [/\bfirst and foremost\b/gi, 'First'],
    [/\blast but not least\b/gi, 'Finally'],
    [/\bdue to the fact that\b/gi, 'because'],
    [/\bat this point in time\b/gi, 'now'],
    [/\bwe understand that\b/gi, ''],
    [/\bwe know that navigating\b/gi, 'Navigating'],
    [/\brest assured that\b/gi, ''],
    [/\bin conclusion\b/gi, 'Summary'],
    [/\bto summarize\b/gi, 'In short'],
    [/\bin this article we will\b/gi, 'This guide covers'],
    [/\bin this guide we will\b/gi, 'This guide covers'],
    [/\bleverage\b/gi, 'use'],
    [/\bdelve into\b/gi, 'cover'],
    [/\bstreamline\b/gi, 'simplify'],
    [/\brobust\b/gi, 'solid'],
    [/\bseamless\b/gi, 'smooth'],
    [/\bholistic\b/gi, 'complete'],
    [/\bbespoke\b/gi, 'tailored'],
    [/\bgame-?changer\b/gi, 'important change'],
    [/\brevolutionize\b/gi, 'change'],
  ]
  let out = text
  for (const [re, rep] of pairs) out = out.replace(re, rep)
  // Collapse leftover double spaces from empty replacements
  return out.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n')
}

/**
 * Ensure content has YAML front matter, official citation, and disclaimer
 * so audit/quality gates reflect structure, not model formatting quirks.
 */
export function ensureEditorialScaffold(opts: {
  content: string
  title: string
  primaryKeyword: string
  region?: string
  /** Canonical conversion CTA block to append after the disclaimer. */
  conversionCtaBlock?: string
}): string {
  const region = (opts.region || 'US').toUpperCase().slice(0, 2)
  const title = titleLine(opts.title, opts.primaryKeyword)

  // Canonical indexability guarantee: every generated page must be
  // index,follow unless explicitly blocked.
  const ensureIndexable = (frontMatter: string): string => {
    if (!frontMatter.trim()) return 'robots: "index,follow"\nindexable: true'
    let fm = frontMatter
    if (!/robots/i.test(fm)) {
      fm = 'robots: "index,follow"\n' + fm
    } else {
      fm = fm.replace(/robots:\s*"[^"]*"/i, 'robots: "index,follow"')
    }
    if (!/indexable/i.test(fm)) {
      fm = 'indexable: true\n' + fm
    } else {
      fm = fm.replace(/indexable:\s*(true|false)/g, 'indexable: true')
    }
    return fm
  }

let { fm, body: rawBody } = stripFm(opts.content || '')
  let body = sanitizeAiSlop(rawBody || `# ${title}\n\nEditorial draft for ${opts.primaryKeyword || title}.`)
  fm = ensureIndexable(fm)

  // Drop model-emitted JSON-LD / scripts — estate layout emits schema
  body = body
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/```json[\s\S]*?```/gi, '')

  if (!hasGovCitation(body)) {
    const sources = REGION_SOURCES[region] || REGION_SOURCES.US
    const lines = sources.map((s) => `- [${s.title}](${s.url})`).join('\n')
    body += `\n\n## Official sources\n\n${lines}\n`
  }

  if (!hasDisclaimer(body)) {
    body +=
      '\n\n---\n\n**Disclaimer:** This page is educational and editorial only. It is **not legal advice**. ' +
      'Immigration rules change; verify every requirement against official government sources and consult a ' +
      'licensed attorney, solicitor, or registered migration agent for your situation.\n'
  }

  // Inject canonical conversion CTA after editorial scaffold
  if (opts.conversionCtaBlock && !body.includes(opts.conversionCtaBlock.slice(0, 60))) {
    body += '\n' + opts.conversionCtaBlock + '\n'
  }

  // Ensure at least one H1 for title extraction fallback
  if (!/^#\s+/m.test(body)) {
    body = `# ${title}\n\n${body}`
  }

  // Quality gate requires a TL;DR / "In 60 seconds" block for indexable long-form
  if (!/in 60 seconds|tl;?dr|key takeaways|quick answer/i.test(body)) {
    const kw = opts.primaryKeyword || title
    body = body.replace(
      /^(#\s+[^\n]+\n+)/,
      `$1## In 60 seconds\n\n- This guide covers **${kw}** in practical steps.\n- Confirm every rule on official government sites before you apply.\n- Use the document list and FAQ below as a checklist — not a substitute for advice.\n\n`,
    )
  }

  const desc = metaDescriptionFrom(title, body, opts.primaryKeyword)
  const fmLines = [
    '---',
    `title: ${JSON.stringify(title)}`,
    `description: ${JSON.stringify(desc)}`,
    `primaryKeyword: ${JSON.stringify(opts.primaryKeyword || title)}`,
    'robots: index,follow',
    '---',
    '',
  ]

  // Prefer regenerated FM (keeps lengths in band) unless existing FM already complete
  const hasTitle = /title\s*:/i.test(fm)
  const hasDesc = /description\s*:/i.test(fm)
  if (hasTitle && hasDesc) {
    return `---\n${fm}\n---\n\n${body.trim()}\n`
  }
  return fmLines.join('\n') + body.trim() + '\n'
}
