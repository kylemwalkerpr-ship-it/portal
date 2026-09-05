/**
 * Render repo-specific file content for SEO Factory ships.
 * Caseworks → full Next.js page.tsx using ArticleLayout.
 * Other hosts → markdown/MDX with YAML front matter.
 */

import type { OwnerPlan } from './ownership'
import { slugifyHeading } from './editorialScaffold'
import { sanitizeEstateUrl } from './ahrefsIssues'
import { countBodyWords } from './contentDepth'
import {
  caseworksHeroKicker,
  formatRelatedRefsTs,
  formatSourceRefsTs,
  pickCaseworksRelatedSlugs,
  pickCaseworksSources,
} from './caseworksRelated'

function escapeTs(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
}

/** Strip JSON-LD / raw <script> and fenced code so they never become visible dek/body text. */
function stripScriptsAndFences(md: string): string {
  return String(md || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/```json[\s\S]*?```/gi, '')
    .replace(/```html[\s\S]*?```/gi, '')
    .replace(/```tsx?[\s\S]*?```/gi, '')
    .replace(/```jsx?[\s\S]*?```/gi, '')
    .replace(/```[\s\S]*?```/gi, '')
}

/**
 * Repair half-parsed markdown links like `CaseWorks Guides](https://…)`
 * (missing opening `[`) so renderInline can emit a real <a>.
 */
function repairOrphanMarkdownLinks(md: string): string {
  return String(md || '').replace(
    /(^|[\s(\[{])(?<!\[)([^\s\[\]][^\]\n]{0,80}?)\]\((https?:\/\/[^)\s]+)\)/gm,
    '$1[$2]($3)',
  )
}

/** Prefer a short human dek: first prose paragraph, else description — never scripts/H1. */
function extractBlogDek(body: string, fallbackDescription: string): string {
  let raw = stripScriptsAndFences(body)
  raw = repairOrphanMarkdownLinks(raw)
  // Drop leading H1 lines (page already has title)
  raw = raw.replace(/^\s*#\s+[^\n]+\n+/gm, '')
  // First non-empty paragraph before first H2
  const firstH2 = raw.search(/\n##\s/)
  const introZone = (firstH2 >= 0 ? raw.slice(0, firstH2) : raw).trim()
  const para = introZone
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .find((p) => p.length >= 40 && !p.startsWith('#') && !/@context|FAQPage|application\/ld\+json/i.test(p))
  const candidate = para || fallbackDescription
  // Hard reject chrome leak even after cleanup
  if (/<script|@context|FAQPage|application\/ld\+json|&lt;script/i.test(candidate)) {
    return fallbackDescription
  }
  return candidate.replace(/\s+/g, ' ').trim()
}


function stripFrontMatter(content: string): { fm: Record<string, string>; body: string } {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!m) return { fm: {}, body: content }
  const fm: Record<string, string> = {}
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':')
    if (i < 0) continue
    const k = line.slice(0, i).trim()
    let v = line.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    fm[k] = v
  }
  return { fm, body: m[2] }
}

/** Convert inline markdown (links, bold, italic, code) into build-safe JSX. */
function renderInline(text: string): string {
  const tokenPattern =
    /(\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*)/g
  let out = ''
  let lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = tokenPattern.exec(text))) {
    out += escapeJsxText(text.slice(lastIndex, m.index))
    if (m[2] && m[3]) {
      // [label](href) — keep TOC anchors + internal links as plain <a>,
      // external links open in a new tab.
      const href = m[3]
      const external = /^https?:\/\//i.test(href)
      const label = renderInline(m[2])
      out += external
        ? `<a href="${escapeJsxAttr(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`
        : `<a href="${escapeJsxAttr(href)}">${label}</a>`
    } else if (m[4]) {
      out += `<strong>${renderInline(m[4])}</strong>`
    } else if (m[5]) {
      out += `<code>${escapeJsxText(m[5])}</code>`
    } else if (m[6]) {
      out += `<em>${renderInline(m[6])}</em>`
    }
    lastIndex = tokenPattern.lastIndex
  }
  out += escapeJsxText(text.slice(lastIndex))
  return out
}

function escapeJsxAttr(s: string): string {
  return escapeJsxText(s).replace(/"/g, '&quot;')
}

/**
 * Render a markdown pipe-table into build-safe JSX.
 * `rows` = [headerRow, separatorRow, ...bodyRows]. The separator row
 * (|---|---|) is detected and dropped; cells are renderInline'd so bold
 * lead-ins and inline links survive inside cells.
 */
function renderMarkdownTable(
  rows: string[],
  cls?: { table?: string; th?: string; td?: string },
): string[] {
  const parse = (row: string): string[] =>
    row
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim())
  const [headRaw, ...rest] = rows
  const sepIdx = rest.findIndex((r) => r.includes('-') && /^\|?[\s:| -]+\|?$/.test(r.trim()))
  const bodyRows = sepIdx >= 0 ? rest.slice(sepIdx + 1) : rest
  const head = headRaw ? parse(headRaw) : []
  const table = cls?.table ? ` className="${cls.table}"` : ''
  const th = cls?.th ? ` className="${cls.th}"` : ''
  const td = cls?.td ? ` className="${cls.td}"` : ''
  const out: string[] = [`      <table${table}>`]
  if (head.length) {
    out.push('        <thead>')
    out.push('          <tr>')
    for (const c of head) out.push(`            <th${th}>${renderInline(c)}</th>`)
    out.push('          </tr>')
    out.push('        </thead>')
  }
  out.push('        <tbody>')
  for (const r of bodyRows) {
    out.push('          <tr>')
    for (const c of parse(r)) out.push(`            <td${td}>${renderInline(c)}</td>`)
    out.push('          </tr>')
  }
  out.push('        </tbody>')
  out.push('      </table>')
  return out
}

/** Convert markdown body to simple JSX fragment strings for ArticleLayout children. */
function markdownToJsx(body: string): string {
  // Drop JSON-LD / raw HTML scripts — ArticleLayout already emits schema.
  // Leaving them as text or broken JSX breaks prerender (and confuses crawlers).
  // All AI providers (DeepSeek / CF / Groq / …) produce markdown; this converter
  // must emit build-safe JSX regardless of which model wrote the draft.
  let cleaned = repairOrphanMarkdownLinks(stripScriptsAndFences(body))

  const lines = cleaned.split('\n')
  const out: string[] = []
  let listType: 'ul' | 'ol' | null = null
  let para: string[] = []
  let inFence = false
  // <details>/<summary> collapsible passthrough state
  let inDetails = false
  let inSummary = false
  let inBlockquote = false

  const flushPara = () => {
    if (!para.length) return
    out.push(`      <p>${renderInline(para.join(' '))}</p>`)
    para = []
  }
  const closeList = () => {
    if (listType) {
      out.push(`      </${listType}>`)
      listType = null
    }
  }
  const openList = (type: 'ul' | 'ol') => {
    if (listType === type) return
    closeList()
    out.push(`      <${type}>`)
    listType = type
  }
  const closeBlockquote = () => {
    if (inBlockquote) {
      out.push('      </blockquote>')
      inBlockquote = false
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const line = raw.trimEnd()
    const trimmed = line.trim()

    if (trimmed.startsWith('```')) {
      flushPara()
      closeList()
      closeBlockquote()
      inFence = !inFence
      continue
    }
    if (inFence) continue

    if (!trimmed) {
      flushPara()
      closeList()
      closeBlockquote()
      continue
    }

    // Collapsible sections (<details> / <summary>) — pass through as JSX so
    // long optional reading stays tucked away. Emitted verbatim because they
    // are valid JSX intrinsic elements.
    if (/^<details\b/i.test(trimmed)) {
      flushPara()
      closeList()
      closeBlockquote()
      inDetails = true
      out.push(`      ${trimmed}`)
      continue
    }
    if (inDetails && /^<\/details>$/i.test(trimmed)) {
      flushPara()
      closeList()
      closeBlockquote()
      inDetails = false
      inSummary = false
      out.push(`      ${trimmed}`)
      continue
    }
    if (inDetails && /^<summary\b/i.test(trimmed)) {
      flushPara()
      closeList()
      closeBlockquote()
      inSummary = true
      out.push(`      ${trimmed}`)
      continue
    }
    if (inSummary && /^<\/summary>$/i.test(trimmed)) {
      inSummary = false
      out.push(`      ${trimmed}`)
      continue
    }

    // Markdown pipe-table — a header row immediately followed by a separator
    // row (|---|---|). Rendered as a real <table> so comparison/checklist
    // tables the brief asks for never ship as literal pipe text.
    if (/^\|.*\|$/.test(trimmed) && i + 1 < lines.length) {
      const nextTrim = lines[i + 1].trim()
      if (nextTrim.includes('-') && /^\|?[\s:| -]+\|?$/.test(nextTrim)) {
        const rows: string[] = [trimmed, nextTrim]
        let j = i + 2
        while (j < lines.length && /^\|.*\|$/.test(lines[j].trim())) {
          rows.push(lines[j].trim())
          j++
        }
        flushPara()
        closeList()
        closeBlockquote()
        out.push(...renderMarkdownTable(rows))
        i = j - 1
        continue
      }
    }

    // Blockquote callouts ("> Note: …") — render as a real <blockquote>.
    if (line.startsWith('> ')) {
      flushPara()
      closeList()
      if (!inBlockquote) {
        out.push('      <blockquote>')
        inBlockquote = true
      }
      out.push(`        <p>${renderInline(line.slice(2).trim())}</p>`)
      continue
    }

    // Skip raw HTML blocks and markdown H1 (page already has title/H1 from layout)
    if ((trimmed.startsWith('<') && !inDetails) || trimmed.startsWith('#' + ' ')) {
      flushPara()
      closeList()
      closeBlockquote()
      continue
    }

    if (line.startsWith('## ')) {
      flushPara()
      closeList()
      closeBlockquote()
      // Skip duplicate "In 60 seconds" — Tldr already covers it
      if (/^in 60 seconds$/i.test(line.slice(3).trim())) continue
      const text = line.slice(3)
      const id = slugifyHeading(text)
      out.push(`      <h2 id="${id || 'section'}">${renderInline(text)}</h2>`)
      continue
    }
    if (line.startsWith('### ')) {
      flushPara()
      closeList()
      closeBlockquote()
      out.push(`      <h3 id="${slugifyHeading(line.slice(4)) || 'section'}">${renderInline(line.slice(4))}</h3>`)
      continue
    }
    // h4–h6: previously fell through into <p> as literal markdown — render them
    const h4 = line.match(/^(#{4,6})\s+(.+)$/)
    if (h4) {
      flushPara()
      closeList()
      closeBlockquote()
      const level = Math.min(6, h4[1].length)
      const Tag = `h${level}`
      out.push(`      <${Tag} id="${slugifyHeading(h4[2]) || 'section'}">${renderInline(h4[2])}</${Tag}>`)
      continue
    }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      flushPara()
      closeBlockquote()
      openList('ul')
      out.push(`        <li>${renderInline(line.slice(2))}</li>`)
      continue
    }
    // Ordered (numbered) lists → <ol> so step numbers survive to the live page.
    // Previously these were emitted as <ul> and silently lost their numbering.
    if (/^\d+\.\s+/.test(line)) {
      flushPara()
      closeBlockquote()
      openList('ol')
      out.push(`        <li>${renderInline(line.replace(/^\d+\.\s+/, ''))}</li>`)
      continue
    }
    para.push(trimmed)
  }
  flushPara()
  closeList()
  closeBlockquote()
  return out.join('\n')
}

function escapeJsxText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;')
}

/**
 * Convert markdown body to JSX for the yousafe-consultancy blog format — the
 * precedence set by the existing static blog pages under landing-page/app/blog/.
 * Sections wrap in <section className="mt-10">, H2s use the serif display
 * style, and paragraph/list text uses the muted foreground utility classes.
 */
function markdownToBlogJsx(body: string): string {
  let cleaned = repairOrphanMarkdownLinks(stripScriptsAndFences(body))

  const lines = cleaned.split('\n')
  const out: string[] = []
  let listType: 'ul' | 'ol' | null = null
  let inSection = false
  let para: string[] = []
  let inBlockquote = false

  const flushPara = () => {
    if (!para.length) return
    out.push(`      <p className="mt-4 text-lg leading-relaxed tracking-[-0.003em] break-words text-foreground">${renderInline(para.join(' '))}</p>`)
    para = []
  }
  const closeList = () => {
    if (listType) {
      out.push(`      </${listType}>`)
      listType = null
    }
  }
  const openList = (type: 'ul' | 'ol') => {
    if (listType === type) return
    closeList()
    out.push(
      type === 'ol'
        ? '      <ol className="mt-4 list-decimal space-y-2 pl-5 leading-relaxed text-foreground">'
        : '      <ul className="mt-4 list-disc space-y-2 pl-5 leading-relaxed text-foreground">',
    )
    listType = type
  }
  const closeBlockquote = () => {
    if (inBlockquote) {
      out.push('      </blockquote>')
      inBlockquote = false
    }
  }
  const closeSection = () => {
    flushPara()
    closeList()
    closeBlockquote()
    if (inSection) {
      out.push('    </section>')
      inSection = false
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const line = raw.trimEnd()
    const trimmed = line.trim()

    if (!trimmed) {
      flushPara()
      closeList()
      closeBlockquote()
      continue
    }

    // Markdown pipe-table — header + separator row → a real <table>.
    if (/^\|.*\|$/.test(trimmed) && i + 1 < lines.length) {
      const nextTrim = lines[i + 1].trim()
      if (nextTrim.includes('-') && /^\|?[\s:| -]+\|?$/.test(nextTrim)) {
        const rows: string[] = [trimmed, nextTrim]
        let j = i + 2
        while (j < lines.length && /^\|.*\|$/.test(lines[j].trim())) {
          rows.push(lines[j].trim())
          j++
        }
        flushPara()
        closeList()
        closeBlockquote()
        out.push(
          ...renderMarkdownTable(rows, {
            table: 'mt-4 w-full border-collapse text-sm',
            th: 'border border-border px-3 py-2 text-left font-semibold',
            td: 'border border-border px-3 py-2 align-top',
          }),
        )
        i = j - 1
        continue
      }
    }

    // Blockquote callouts ("> Note: …") → a real <blockquote>.
    if (line.startsWith('> ')) {
      flushPara()
      closeList()
      if (!inBlockquote) {
        out.push('      <blockquote className="my-8 border-l-2 border-border pl-4 italic text-muted-foreground">')
        inBlockquote = true
      }
      out.push(`        <p>${renderInline(line.slice(2).trim())}</p>`)
      continue
    }

    if ((trimmed.startsWith('<') && !/^<\/?details/.test(trimmed)) || trimmed.startsWith('# ')) {
      flushPara()
      closeList()
      closeBlockquote()
      continue
    }

    if (line.startsWith('## ')) {
      closeSection()
      // Skip duplicate "In 60 seconds" — the header intro already covers it
      if (/^in 60 seconds$/i.test(line.slice(3).trim())) continue
      const text = line.slice(3)
      inSection = true
      out.push('    <section className="mt-10">')
      out.push(`      <h2 className="font-sans text-2xl font-semibold tracking-[-0.02em] text-balance text-foreground">${renderInline(text)}</h2>`)
      continue
    }
    if (line.startsWith('### ')) {
      flushPara()
      closeList()
      closeBlockquote()
      out.push(`      <h3 className="font-sans text-xl font-semibold tracking-[-0.02em] text-balance text-foreground">${renderInline(line.slice(4))}</h3>`)
      continue
    }
    const h4 = line.match(/^(#{4,6})\s+(.+)$/)
    if (h4) {
      flushPara()
      closeList()
      closeBlockquote()
      out.push(`      <h4 className="font-sans text-lg font-semibold tracking-[-0.02em] text-foreground">${renderInline(h4[2])}</h4>`)
      continue
    }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      flushPara()
      closeBlockquote()
      openList('ul')
      out.push(`        <li>${renderInline(line.slice(2))}</li>`)
      continue
    }
    // Ordered (numbered) lists → <ol> so step numbers survive to the live page.
    if (/^\d+\.\s+/.test(line)) {
      flushPara()
      closeBlockquote()
      openList('ol')
      out.push(`        <li>${renderInline(line.replace(/^\d+\.\s+/, ''))}</li>`)
      continue
    }
    para.push(trimmed)
  }
  closeSection()
  return out.join('\n')
}

function renderCaseworksPage(opts: {
  plan: OwnerPlan
  content: string
  title: string
  region: string
  primaryKeyword: string
  indexable: boolean
  canonicalUrl: string
}): string {
  const { fm, body } = stripFrontMatter(opts.content)
  // Use fm.title if it looks like a real title (long, has spaces, not just
  // a keyword repeated). Otherwise fall back to opts.title (DB title).
  const fmTitle = fm.title || ''
  const looksLikeKeyword = fmTitle.length < 25 || !fmTitle.includes(' ')
  const title = (fmTitle && !looksLikeKeyword) ? fmTitle : (opts.title || fmTitle || opts.primaryKeyword)
  const description =
    fm.description ||
    fm.metaDescription ||
    `${title} — practical guide for international students and immigrants. Editorial only; not legal advice.`
  const pathParts = opts.plan.filePath
    .split('/')
    .filter((p) => p && p !== 'page.tsx' && p !== 'app')
  const slug = pathParts.slice(-1)[0] || 'guide'
  // Prefer path segment (app/uk/…) over free-form region so subdomain tree matches
  const pathCountry = pathParts.find((p) => ['us', 'uk', 'ca', 'au'].includes(p.toLowerCase()))
  const countryRaw = (pathCountry || opts.region || 'us').toLowerCase()
  const country = countryRaw === 'compare' ? 'us' : countryRaw
  // Caseworks ArticleMeta.country is us|uk|ca|au (au added for SEO Factory AU guides)
  const safeCountry = ['us', 'uk', 'ca', 'au'].includes(country) ? country : 'us'
  // Caseworks ArticleMeta.topic union
  const topic =
    /tenant|rent|deposit|section.?21|housing/i.test(opts.primaryKeyword + title)
      ? 'tenancy'
      : /express.?entry|pgwp|study permit|lmia|pnp/i.test(opts.primaryKeyword + title)
        ? 'express-entry'
        : /spouse|family|dependent|f-2|h-4/i.test(opts.primaryKeyword + title)
          ? 'family'
          : /opt|cpt|f-1|f1|student visa|sevis|i-20/i.test(opts.primaryKeyword + title)
            ? 'student-visas'
            : /loan|borrower/i.test(opts.primaryKeyword + title)
              ? 'loans'
              : 'immigration'
  const today = new Date().toISOString().slice(0, 10)
  const robots = opts.indexable ? '{ index: true, follow: true }' : '{ index: false, follow: true }'
  // Extract the "In 60 seconds" section BEFORE converting to JSX, so the
  // Tldr component renders the AI-written bullets instead of hardcoded boilerplate.
  let tldrBody = ''
  let bodyWithoutTldr = body
  {
    const tldrMatch = body.match(/## In 60 [Ss]econds\s*\n([\s\S]*?)(?=\n## |$)/i)
    if (tldrMatch) {
      tldrBody = tldrMatch[1].trim()
      bodyWithoutTldr = body.replace(tldrMatch[0], '').trim()
    }
  }
  const jsxBody = markdownToJsx(bodyWithoutTldr)
  const tldrJsx = tldrBody ? markdownToJsx(tldrBody) : ''
  const keyword = opts.primaryKeyword || fm.primaryKeyword || title
  // Always legal.yousafeconsultancy.com for caseworks
  const canonical = sanitizeEstateUrl(
    opts.canonicalUrl.includes('legal.yousafeconsultancy.com')
      ? opts.canonicalUrl
      : `https://legal.yousafeconsultancy.com/${safeCountry}/${slug}/`,
  )

  const countryKey = safeCountry as 'us' | 'uk' | 'ca' | 'au'
  const relatedSlugs = pickCaseworksRelatedSlugs({
    country: countryKey,
    slug,
    title,
    primaryKeyword: keyword,
    topic,
  })
  const sourceRefs = pickCaseworksSources({
    region: safeCountry.toUpperCase(),
    title,
    primaryKeyword: keyword,
    topic,
  })
  const kicker = caseworksHeroKicker(title, slug)
  const relatedTs = formatRelatedRefsTs(relatedSlugs)
  const sourcesTs = formatSourceRefsTs(sourceRefs)
  const metaTitle = title.slice(0, 60)
  const metaDesc = description.slice(0, 160)

  const out = `// Generated by SEO Factory — do not hand-edit without review
import type { Metadata } from "next";
import { ArticleLayout } from "@/components/article/ArticleLayout";
import { UpdatedStamp } from "@/components/article/UpdatedStamp";
import { Tldr } from "@/components/article/Tldr";
import { CTAPanel } from "@/components/article/CTAPanel";
import { Disclaimer } from "@/components/article/Disclaimer";
import type { ArticleMeta, RelatedRef, SourceRef } from "@/lib/article-types";

const meta: ArticleMeta = {
  slug: ${JSON.stringify(slug)},
  country: ${JSON.stringify(safeCountry)},
  topic: ${JSON.stringify(topic)},
  title: ${JSON.stringify(title)},
  primaryKeyword: ${JSON.stringify(keyword)},
  publishedDate: ${JSON.stringify(today)},
  updatedDate: ${JSON.stringify(today)},
  author: { name: "MyCaseworks Editorial", firm: "MyCaseworks", url: "https://legal.yousafeconsultancy.com/about/" },
  reviewer: { name: "MyCaseworks Editorial", firm: "MyCaseworks", url: "https://legal.yousafeconsultancy.com/about/" },
  reviewStatus: "editorial-only",
  hero: { eyebrow: ${JSON.stringify(safeCountry.toUpperCase() + ' · Guide')}, kicker: ${JSON.stringify(kicker)} },
  ctaTarget: ${JSON.stringify(`/intake?country=${safeCountry}&topic=${topic}`)},
  faqSchema: true,
};

const related: RelatedRef[] = ${relatedTs};
const sources: SourceRef[] = ${sourcesTs};

export const metadata: Metadata = {
  title: ${JSON.stringify(metaTitle)},
  description: ${JSON.stringify(metaDesc)},
  keywords: [${JSON.stringify(keyword)}],
  alternates: { canonical: ${JSON.stringify(canonical)} },
  robots: ${robots},
  // Omit openGraph/twitter title+description — Next.js derives them from the
  // top-level fields. Verbatim copies fail caseworks check-article-quality
  // (metadataDuplication) and drift when one surface is edited later.
  openGraph: {
    siteName: "MyCaseworks",
    url: ${JSON.stringify(canonical)},
    type: "article",
    publishedTime: ${JSON.stringify(today)},
    modifiedTime: ${JSON.stringify(today)},
    images: [
      { url: "/og-image.png", width: 1200, height: 630, alt: "MyCaseworks legal guide" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og-image.png"],
  },
};

export default function Page() {
  return (
    <ArticleLayout meta={meta} related={related} sources={sources}>
      <UpdatedStamp date={${JSON.stringify(today)}} reviewer="MyCaseworks Editorial" />
      <Tldr title="In 60 seconds">
${tldrJsx || '        <p>This guide covers the key steps, costs, and requirements for ' + escapeJsxText(title) + '.</p>'}
      </Tldr>
${jsxBody || `      <p>Editorial draft for ${escapeJsxText(title)}. Expand with procedures, documents, timelines, and FAQs. Not legal advice.</p>`}
      <CTAPanel
        variant="inline"
        headline="Need a document review?"
        body="MyCaseworks provides document preparation and attorney-matching — not a substitute for licensed legal advice."
        cta="Start a review"
        href=${JSON.stringify(`/intake?country=${safeCountry}&topic=${topic}`)}
      />
      <Disclaimer />
    </ArticleLayout>
  );
}
`
  // Self-check: never emit a page that would fail caseworks CTAPanel contract /
  // Next Link prerender / static export. Provider-agnostic (DeepSeek or fallback).
  if (!out.includes('href=') || !out.includes('headline=') || !out.includes('cta=')) {
    throw new Error(
      'renderCaseworksPage internal error: CTAPanel contract incomplete (href/headline/cta required)',
    )
  }
  if (out.includes('<CTAPanel') && /CTAPanel[\s\S]{0,200}\btitle\s*=/.test(out) && !out.includes('headline=')) {
    throw new Error('renderCaseworksPage internal error: CTAPanel used title= without headline=')
  }
  if (out.includes('href={undefined}') || out.includes('href={null}')) {
    throw new Error('renderCaseworksPage internal error: undefined Link href')
  }
  if (/```/.test(out)) {
    throw new Error('renderCaseworksPage internal error: markdown fences leaked into page.tsx')
  }
  const openP = (out.match(/<p>/g) || []).length
  const closeP = (out.match(/<\/p>/g) || []).length
  if (openP !== closeP) {
    throw new Error(`renderCaseworksPage internal error: unbalanced <p> (${openP}/${closeP})`)
  }
  const openUl = (out.match(/<ul>/g) || []).length
  const closeUl = (out.match(/<\/ul>/g) || []).length
  if (openUl !== closeUl) {
    throw new Error(`renderCaseworksPage internal error: unbalanced <ul> (${openUl}/${closeUl})`)
  }
  for (const tag of ['ol', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'blockquote']) {
    const open = (out.match(new RegExp(`<${tag}(?=[\\s>])`, 'g')) || []).length
    const close = (out.match(new RegExp(`</${tag}>`, 'g')) || []).length
    if (open !== close) {
      throw new Error(`renderCaseworksPage internal error: unbalanced <${tag}> (${open}/${close})`)
    }
  }
  // Caseworks article-quality gate mirrors (check-article-quality.mjs)
  if (/kicker:\s*"SEO Factory"/.test(out)) {
    throw new Error('renderCaseworksPage internal error: hero kicker must not be "SEO Factory"')
  }
  if (/const related[^=]*=\s*\[\s*\]/.test(out)) {
    throw new Error('renderCaseworksPage internal error: related[] must not be empty')
  }
  if (/const sources[^=]*=\s*\[\s*\]/.test(out)) {
    throw new Error('renderCaseworksPage internal error: sources[] must not be empty')
  }
  return out
}

/**
 * Render a yousafe-consultancy blog page — the established static-route
 * precedence at landing-page/app/blog/<slug>/page.tsx (rich Metadata,
 * serif display layout, BlogDepthSection, legal-guide CTA panel).
 */
function renderConsultancyBlogPage(opts: {
  plan: OwnerPlan
  content: string
  title: string
  region: string
  primaryKeyword: string
  indexable: boolean
  canonicalUrl: string
}): string {
  const { fm, body } = stripFrontMatter(opts.content)
  // Use fm.title if it looks like a real title (long, has spaces, not just
  // a keyword repeated). Otherwise fall back to opts.title (DB title).
  const fmTitle = fm.title || ''
  const looksLikeKeyword = fmTitle.length < 25 || !fmTitle.includes(' ')
  const title = (fmTitle && !looksLikeKeyword) ? fmTitle : (opts.title || fmTitle || opts.primaryKeyword)
  const description =
    fm.description ||
    fm.metaDescription ||
    `${title} — a practical guide for international students and immigrants.`
  const today = new Date().toISOString().slice(0, 10)
  const pathParts = opts.plan.filePath
    .split('/')
    .filter((p) => p && p !== 'page.tsx')
  const slug = pathParts.slice(-1)[0] || 'blog'
  // Blog canonical always lives on the apex yousafeconsultancy.com /blog/<slug>/
  const canonical = opts.canonicalUrl.startsWith('https://yousafeconsultancy.com/blog/')
    ? opts.canonicalUrl
    : `https://yousafeconsultancy.com/blog/${slug}/`
  const regionKey = (opts.region || 'US').toUpperCase()
  const category =
    regionKey === 'UK' ? 'uk' : regionKey === 'CA' ? 'canada' : regionKey === 'US' ? 'usa' : 'both'
  const keywords = [opts.primaryKeyword || title]
  // Clean human dek only — never raw JSON-LD / scripts / markdown H1 chrome.
  // Body after first H2 is rendered separately so the dek never doubles.
  const cleanedBody = repairOrphanMarkdownLinks(stripScriptsAndFences(body))
  const firstH2 = cleanedBody.search(/\n##\s/)
  const intro = renderInline(extractBlogDek(cleanedBody, description))
  const jsxBody = markdownToBlogJsx(firstH2 >= 0 ? cleanedBody.slice(firstH2) : '')

  const out = `// Generated by SEO Factory — yousafe-consultancy blog page (static route)
import type { Metadata } from "next";
import { BlogDepthSection } from "@/components/blog-depth-section";

export const metadata: Metadata = {
  title: ${JSON.stringify(title)},
  description: ${JSON.stringify(description.slice(0, 160))},
  keywords: ${JSON.stringify(keywords)},
  alternates: { canonical: ${JSON.stringify(canonical.replace(/\/$/, ''))} },
  openGraph: {
    title: ${JSON.stringify(title)},
    description: ${JSON.stringify(description.slice(0, 160))},
    url: ${JSON.stringify(canonical)},
    type: "article",
    publishedTime: ${JSON.stringify(today)},
    authors: ["MyCaseworks Editorial"],
    images: [
      { url: "/og-image.png", width: 1200, height: 630, alt: "YouSafe consultancy blog" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: ${JSON.stringify(title)},
    description: ${JSON.stringify(description.slice(0, 160))},
    images: ["/og-image.png"],
  },
};

export default function Page() {
  const date = ${JSON.stringify(today)}

  return (
    <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6 lg:px-8">
      <article>
        <header>
          <p className="text-sm text-muted-foreground">{date} · MyCaseworks Editorial</p>
          <h1 className="mt-4 font-sans text-3xl tracking-[-0.02em] text-foreground sm:text-4xl">
            ${escapeTs(title)}
          </h1>
          <p className="mt-6 text-xl leading-relaxed text-muted-foreground">
            ${intro}
          </p>
        </header>

${jsxBody || `        <p className="mt-4 text-muted-foreground">
          Editorial draft for ${escapeTs(title)}. Expand with practical steps.
        </p>`}

        <section className="mt-10 rounded-lg border border-border bg-secondary/30 p-6">
          <h3 className="font-sans text-xl text-foreground">Need the full legal guide?</h3>
          <p className="mt-3 text-muted-foreground">
            This post is a practical walkthrough. For the complete legal guide — forms,
            deadlines, and refusal-risk checks — read the attorney-reviewed guide on MyCaseworks:
          </p>
          <a
            href="https://legal.yousafeconsultancy.com/${category === 'uk' ? 'uk' : category === 'canada' ? 'ca' : 'us'}/"
            className="mt-4 inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Browse legal guides →
          </a>
        </section>

        <BlogDepthSection slug=${JSON.stringify(slug)} />
      </article>
    </main>
  )
}
`
  // Self-check: the blog page must import BlogDepthSection and never leak fences / chrome
  if (!out.includes('BlogDepthSection')) {
    throw new Error('renderConsultancyBlogPage internal error: BlogDepthSection missing')
  }
  if (/```/.test(out)) {
    throw new Error('renderConsultancyBlogPage internal error: markdown fences leaked into page.tsx')
  }
  if (!out.includes('alternates:') || !out.includes('canonical:')) {
    throw new Error('renderConsultancyBlogPage internal error: alternates.canonical missing')
  }
  if (/&lt;script|@context|FAQPage|application\/ld\+json/i.test(out)) {
    throw new Error('renderConsultancyBlogPage internal error: JSON-LD/script chrome leaked into page.tsx')
  }
  if (/\]\(https?:\/\//.test(out) && !out.includes('<a href=')) {
    // orphan markdown link residue with no rendered anchors is suspicious; also catch visible ](url)
  }
  if (/[A-Za-z0-9][^\n<]*\]\(https?:\/\/[^)]+\)/.test(out)) {
    throw new Error('renderConsultancyBlogPage internal error: half-parsed markdown link leaked into page.tsx')
  }
  return out
}

/**
 * BlogPost index entry for landing-page/lib/blog-data.ts — the blog index page
 * and the [slug] fallback renderer both consume this array. Shipping a blog
 * means writing BOTH the static page.tsx and this index entry.
 */
export interface BlogPostEntry {
  slug: string
  title: string
  metaDescription: string
  category: 'usa' | 'canada' | 'both' | 'uk'
  date: string
  readTime: string
  content: string
}

export function buildBlogPostEntry(opts: {
  plan: OwnerPlan
  content: string
  title: string
  region: string
}): BlogPostEntry {
  const { fm, body } = stripFrontMatter(opts.content)
  // Use fm.title if it looks like a real title; fall back to opts.title
  const fmTitle = fm.title || ''
  const looksLikeKeyword = fmTitle.length < 25 || !fmTitle.includes(' ')
  const title = (fmTitle && !looksLikeKeyword) ? fmTitle : (opts.title || fmTitle)
  const pathParts = opts.plan.filePath.split('/').filter((p) => p && p !== 'page.tsx')
  const slug = pathParts.slice(-1)[0] || 'blog-post'
  const regionKey = (opts.region || 'US').toUpperCase()
  const category =
    regionKey === 'UK' ? 'uk' : regionKey === 'CA' ? 'canada' : regionKey === 'US' ? 'usa' : 'both'
  const words = countBodyWords(body)
  return {
    slug,
    title,
    metaDescription: (fm.description || fm.metaDescription || `${title} — YouSafe Consultancy`).slice(0, 160),
    category,
    date: new Date().toISOString().slice(0, 10),
    readTime: `${Math.max(3, Math.round(words / 200))} min read`,
    content: body.trim(),
  }
}

/**
 * Insert a new entry at the top of blogPosts[] in blog-data.ts. Pure string
 * surgery — finds the array opening and splices the entry object in first.
 */
export function insertBlogPostIntoData(current: string, entry: BlogPostEntry): string {
  const marker = 'export const blogPosts: BlogPost[] = ['
  const at = current.indexOf(marker)
  if (at < 0) {
    throw new Error('blog-data.ts: blogPosts array marker not found — cannot append entry')
  }
  const entryJs = [
    '  {',
    `    slug: ${JSON.stringify(entry.slug)},`,
    `    title: ${JSON.stringify(entry.title)},`,
    `    metaDescription: ${JSON.stringify(entry.metaDescription)},`,
    `    category: ${JSON.stringify(entry.category)},`,
    `    date: ${JSON.stringify(entry.date)},`,
    `    readTime: ${JSON.stringify(entry.readTime)},`,
    `    content: \`${escapeTs(entry.content)}\`,`,
    '  },',
  ].join('\n')
  const insertAt = at + marker.length
  return current.slice(0, insertAt) + '\n' + entryJs + '\n' + current.slice(insertAt)
}

export function renderTargetFile(opts: {
  plan: OwnerPlan
  content: string
  title: string
  region: string
  contentType: string
  primaryKeyword: string
  indexable: boolean
  canonicalUrl: string
}): { filePath: string; fileContent: string } {
  const filePath = opts.plan.filePath

  if (opts.plan.repo === 'caseworks' && filePath.endsWith('page.tsx')) {
    return {
      filePath,
      fileContent: renderCaseworksPage(opts),
    }
  }

  // Apex yousafe-consultancy blog pages — static route precedence
  // (landing-page/app/blog/<slug>/page.tsx).
  if (
    opts.plan.repo === 'yousafe-consultancy' &&
    /app\/blog\/[^/]+\/page\.tsx$/.test(filePath)
  ) {
    return {
      filePath,
      fileContent: renderConsultancyBlogPage(opts),
    }
  }

  // Markdown / MDX for portal catalogue and regional content folders
  const { fm, body } = stripFrontMatter(opts.content)
  // Use fm.title if it looks like a real title (long, has spaces, not just
  // a keyword repeated). Otherwise fall back to opts.title (DB title).
  const fmTitle = fm.title || ''
  const looksLikeKeyword = fmTitle.length < 25 || !fmTitle.includes(' ')
  const title = (fmTitle && !looksLikeKeyword) ? fmTitle : (opts.title || fmTitle || opts.primaryKeyword)
  const description = fm.description || `${title} — YouSafe Consultancy`
  const robots = opts.indexable ? 'index,follow' : 'noindex,follow'
  const front = [
    '---',
    `title: ${JSON.stringify(title)}`,
    `description: ${JSON.stringify(description.slice(0, 160))}`,
    `primaryKeyword: ${JSON.stringify(opts.primaryKeyword)}`,
    `canonical: ${JSON.stringify(opts.canonicalUrl)}`,
    `robots: ${robots}`,
    `ownerHost: ${opts.plan.host}`,
    `generatedBy: seo-factory`,
    `date: ${new Date().toISOString().slice(0, 10)}`,
    '---',
    '',
  ].join('\n')

  return {
    filePath,
    fileContent: front + body.trim() + '\n',
  }
}
