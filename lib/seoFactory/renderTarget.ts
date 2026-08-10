/**
 * Render repo-specific file content for SEO Factory ships.
 * Caseworks → full Next.js page.tsx using ArticleLayout.
 * Other hosts → markdown/MDX with YAML front matter.
 */

import type { OwnerPlan } from './ownership'
import { slugifyHeading } from './editorialScaffold'

function escapeTs(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
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

/** Convert markdown body to simple JSX fragment strings for ArticleLayout children. */
function markdownToJsx(body: string): string {
  // Drop JSON-LD / raw HTML scripts — ArticleLayout already emits schema.
  // Leaving them as text or broken JSX breaks prerender (and confuses crawlers).
  // All AI providers (DeepSeek / CF / Groq / …) produce markdown; this converter
  // must emit build-safe JSX regardless of which model wrote the draft.
  let cleaned = body
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/```json[\s\S]*?```/gi, '')
    .replace(/```html[\s\S]*?```/gi, '')
    .replace(/```tsx?[\s\S]*?```/gi, '')
    .replace(/```jsx?[\s\S]*?```/gi, '')
    // Strip any remaining fenced blocks so fences never leak into page.tsx
    .replace(/```[\s\S]*?```/gi, '')

  const lines = cleaned.split('\n')
  const out: string[] = []
  let inList = false
  let para: string[] = []
  let inFence = false
  // <details>/<summary> collapsible passthrough state
  let inDetails = false
  let inSummary = false

  const flushPara = () => {
    if (!para.length) return
    out.push(`      <p>${renderInline(para.join(' '))}</p>`)
    para = []
  }
  const closeList = () => {
    if (inList) {
      out.push('      </ul>')
      inList = false
    }
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    const trimmed = line.trim()

    if (trimmed.startsWith('```')) {
      flushPara()
      closeList()
      inFence = !inFence
      continue
    }
    if (inFence) continue

    if (!trimmed) {
      flushPara()
      closeList()
      continue
    }

    // Collapsible sections (<details> / <summary>) — pass through as JSX so
    // long optional reading stays tucked away. Emitted verbatim because they
    // are valid JSX intrinsic elements.
    if (/^<details\b/i.test(trimmed)) {
      flushPara()
      closeList()
      inDetails = true
      out.push(`      ${trimmed}`)
      continue
    }
    if (inDetails && /^<\/details>$/i.test(trimmed)) {
      flushPara()
      closeList()
      inDetails = false
      inSummary = false
      out.push(`      ${trimmed}`)
      continue
    }
    if (inDetails && /^<summary\b/i.test(trimmed)) {
      flushPara()
      closeList()
      inSummary = true
      out.push(`      ${trimmed}`)
      continue
    }
    if (inSummary && /^<\/summary>$/i.test(trimmed)) {
      inSummary = false
      out.push(`      ${trimmed}`)
      continue
    }

    // Skip raw HTML blocks and markdown H1 (page already has title/H1 from layout)
    if ((trimmed.startsWith('<') && !inDetails) || trimmed.startsWith('#' + ' ')) {
      flushPara()
      closeList()
      continue
    }

    if (line.startsWith('## ')) {
      flushPara()
      closeList()
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
      out.push(`      <h3 id="${slugifyHeading(line.slice(4)) || 'section'}">${renderInline(line.slice(4))}</h3>`)
      continue
    }
    // h4–h6: previously fell through into <p> as literal markdown — render them
    const h4 = line.match(/^(#{4,6})\s+(.+)$/)
    if (h4) {
      flushPara()
      closeList()
      const level = Math.min(6, h4[1].length)
      const Tag = `h${level}`
      out.push(`      <${Tag} id="${slugifyHeading(h4[2]) || 'section'}">${renderInline(h4[2])}</${Tag}>`)
      continue
    }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      flushPara()
      if (!inList) {
        out.push('      <ul>')
        inList = true
      }
      out.push(`        <li>${renderInline(line.slice(2))}</li>`)
      continue
    }
    // Ordered lists → plain list items
    if (/^\d+\.\s+/.test(line)) {
      flushPara()
      if (!inList) {
        out.push('      <ul>')
        inList = true
      }
      out.push(`        <li>${renderInline(line.replace(/^\d+\.\s+/, ''))}</li>`)
      continue
    }
    para.push(trimmed)
  }
  flushPara()
  closeList()
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
  const title = fm.title || opts.title
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
  const jsxBody = markdownToJsx(body)
  const keyword = opts.primaryKeyword || fm.primaryKeyword || title
  // Always legal.yousafeconsultancy.com for caseworks
  const canonical = opts.canonicalUrl.includes('legal.yousafeconsultancy.com')
    ? opts.canonicalUrl
    : `https://legal.yousafeconsultancy.com/${safeCountry}/${slug}/`

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
  hero: { eyebrow: ${JSON.stringify(safeCountry.toUpperCase() + ' · Guide')}, kicker: "SEO Factory" },
  ctaTarget: ${JSON.stringify(`/intake?country=${safeCountry}&topic=${topic}`)},
  faqSchema: true,
};

const related: RelatedRef[] = [];
const sources: SourceRef[] = [];

export const metadata: Metadata = {
  title: ${JSON.stringify(title.slice(0, 60))},
  description: ${JSON.stringify(description.slice(0, 160))},
  keywords: [${JSON.stringify(keyword)}],
  alternates: { canonical: ${JSON.stringify(canonical)} },
  robots: ${robots},
  openGraph: {
    siteName: "MyCaseworks",
    title: ${JSON.stringify(title.slice(0, 60))},
    description: ${JSON.stringify(description.slice(0, 160))},
    url: ${JSON.stringify(canonical)},
    type: "article",
    publishedTime: ${JSON.stringify(today)},
    modifiedTime: ${JSON.stringify(today)},
  },
  twitter: { card: "summary_large_image" },
};

export default function Page() {
  return (
    <ArticleLayout meta={meta} related={related} sources={sources}>
      <UpdatedStamp date={${JSON.stringify(today)}} reviewer="MyCaseworks Editorial" />
      <Tldr title="In 60 seconds">
        <p>This guide was generated by the SEO Factory from live Search Console demand. Verify every official rule against primary government sources before relying on it.</p>
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
  return out
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

  // Markdown / MDX for portal catalogue and regional content folders
  const { fm, body } = stripFrontMatter(opts.content)
  const title = fm.title || opts.title
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
