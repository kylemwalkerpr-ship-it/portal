/**
 * Ahrefs Site Audit ↔ Content Studio contract.
 *
 * Ahrefs flags titles <30 or >60, metas <70 or >160, missing/multiple H1s,
 * missing canonicals, orphans, thin pages, invented links, incomplete OG,
 * invalid JSON-LD, and double-slash URLs. The studio used to allow 12–70
 * titles and 120–170 metas, and caseworks ships omitted og:image — which
 * *created* those flags. This module is the single map of:
 *   - which Ahrefs issues CS can introduce
 *   - how we gate them before ship
 *   - how we rewrite the draft to clear them
 */

export const AHREFS_TITLE_MIN = 30
export const AHREFS_TITLE_MAX = 60
export const AHREFS_META_MIN = 70
export const AHREFS_META_MAX = 160
export const AHREFS_OG_IMAGE = '/og-image.png'
export const AHREFS_OG_IMAGE_ABS = 'https://legal.yousafeconsultancy.com/og-image.png'

export type AhrefsImportance = 'error' | 'warning' | 'notice' | 'opportunity'

export interface AhrefsIssueDef {
  id: string
  label: string
  /** Content Studio can create this by shipping a draft. */
  csCanIntroduce: boolean
  /** Deterministic or pipeline repair exists. */
  csCanFix: boolean
  /** Our quality/audit finding code. */
  gateCode: string
  severity: 'blocker' | 'warning'
  /** Ahrefs crawl importance (errors/warnings count toward csOpen). */
  importance: AhrefsImportance
}

/** Catalog of Ahrefs Site Audit issues we care about. */
export const AHREFS_ISSUE_CATALOG: AhrefsIssueDef[] = [
  { id: 'title_too_short', label: 'Title too short', csCanIntroduce: true, csCanFix: true, gateCode: 'ahrefs_title_too_short', severity: 'blocker', importance: 'warning' },
  { id: 'title_too_long', label: 'Title too long', csCanIntroduce: true, csCanFix: true, gateCode: 'ahrefs_title_too_long', severity: 'blocker', importance: 'warning' },
  { id: 'title_missing', label: 'Missing title', csCanIntroduce: true, csCanFix: true, gateCode: 'ahrefs_title_missing', severity: 'blocker', importance: 'error' },
  { id: 'title_duplicate', label: 'Duplicate title', csCanIntroduce: true, csCanFix: false, gateCode: 'ahrefs_title_duplicate', severity: 'warning', importance: 'warning' },
  { id: 'description_missing', label: 'Missing meta description', csCanIntroduce: true, csCanFix: true, gateCode: 'ahrefs_meta_missing', severity: 'blocker', importance: 'warning' },
  { id: 'description_too_short', label: 'Meta description too short', csCanIntroduce: true, csCanFix: true, gateCode: 'ahrefs_meta_too_short', severity: 'blocker', importance: 'warning' },
  { id: 'description_too_long', label: 'Meta description too long', csCanIntroduce: true, csCanFix: true, gateCode: 'ahrefs_meta_too_long', severity: 'blocker', importance: 'warning' },
  { id: 'description_duplicate', label: 'Duplicate meta description', csCanIntroduce: true, csCanFix: false, gateCode: 'ahrefs_meta_duplicate', severity: 'warning', importance: 'warning' },
  { id: 'h1_missing', label: 'Missing H1', csCanIntroduce: true, csCanFix: true, gateCode: 'ahrefs_h1_missing', severity: 'blocker', importance: 'warning' },
  { id: 'h1_multiple', label: 'Multiple H1s', csCanIntroduce: true, csCanFix: true, gateCode: 'ahrefs_h1_multiple', severity: 'blocker', importance: 'warning' },
  { id: 'canonical_missing', label: 'Missing canonical', csCanIntroduce: true, csCanFix: true, gateCode: 'ahrefs_canonical_missing', severity: 'blocker', importance: 'warning' },
  { id: 'orphan_page', label: 'Orphan page (has no incoming internal links)', csCanIntroduce: true, csCanFix: true, gateCode: 'ahrefs_orphan', severity: 'warning', importance: 'error' },
  { id: 'noindex_page', label: 'Noindex page', csCanIntroduce: true, csCanFix: true, gateCode: 'ahrefs_noindex', severity: 'blocker', importance: 'warning' },
  { id: 'noindex', label: 'noindex on an intended page', csCanIntroduce: true, csCanFix: true, gateCode: 'ahrefs_noindex', severity: 'blocker', importance: 'warning' },
  { id: 'low_content', label: 'Thin content', csCanIntroduce: true, csCanFix: true, gateCode: 'thin_content', severity: 'blocker', importance: 'warning' },
  { id: 'broken_internal', label: 'Broken internal link', csCanIntroduce: true, csCanFix: true, gateCode: 'dead_internal_link', severity: 'blocker', importance: 'error' },
  { id: 'broken_external', label: 'Broken external link', csCanIntroduce: true, csCanFix: true, gateCode: 'dead_external_link', severity: 'blocker', importance: 'error' },
  { id: 'page_has_links_to_broken_page', label: 'Page has links to broken page', csCanIntroduce: true, csCanFix: true, gateCode: 'dead_internal_link', severity: 'blocker', importance: 'error' },
  { id: '404_page', label: '404 page', csCanIntroduce: true, csCanFix: false, gateCode: 'ahrefs_404', severity: 'warning', importance: 'error' },
  { id: '4xx_page', label: '4XX page', csCanIntroduce: true, csCanFix: false, gateCode: 'ahrefs_4xx', severity: 'warning', importance: 'error' },
  { id: 'double_slash_in_url', label: 'Double slash in URL', csCanIntroduce: true, csCanFix: true, gateCode: 'ahrefs_double_slash', severity: 'blocker', importance: 'error' },
  { id: '3xx_redirect_in_sitemap', label: '3XX redirect in sitemap', csCanIntroduce: true, csCanFix: true, gateCode: 'ahrefs_sitemap_3xx', severity: 'warning', importance: 'error' },
  { id: '4xx_page_in_sitemap', label: '4XX page in sitemap', csCanIntroduce: true, csCanFix: true, gateCode: 'ahrefs_sitemap_4xx', severity: 'warning', importance: 'error' },
  { id: '3xx_redirect', label: '3XX redirect', csCanIntroduce: true, csCanFix: false, gateCode: 'ahrefs_3xx', severity: 'warning', importance: 'warning' },
  { id: 'indexable_page_not_in_sitemap', label: 'Indexable page not in sitemap', csCanIntroduce: true, csCanFix: true, gateCode: 'ahrefs_not_in_sitemap', severity: 'warning', importance: 'notice' },
  { id: 'not_in_sitemap', label: 'Indexable page not in sitemap', csCanIntroduce: true, csCanFix: true, gateCode: 'ahrefs_not_in_sitemap', severity: 'warning', importance: 'notice' },
  { id: 'open_graph_tags_incomplete', label: 'Open Graph tags incomplete', csCanIntroduce: true, csCanFix: true, gateCode: 'ahrefs_og_incomplete', severity: 'warning', importance: 'warning' },
  { id: 'og_missing', label: 'Missing Open Graph tags', csCanIntroduce: true, csCanFix: true, gateCode: 'ahrefs_og_missing', severity: 'warning', importance: 'warning' },
  { id: 'structured_data_has_schema_org_validation_error', label: 'Structured data has schema.org validation error', csCanIntroduce: true, csCanFix: true, gateCode: 'ahrefs_schema_invalid', severity: 'warning', importance: 'notice' },
  { id: 'pages_to_submit_to_indexnow', label: 'Pages to submit to IndexNow', csCanIntroduce: true, csCanFix: true, gateCode: 'ahrefs_indexnow', severity: 'warning', importance: 'notice' },
  { id: 'page_has_only_one_dofollow_incoming_internal_link', label: 'Page has only one dofollow incoming internal link', csCanIntroduce: true, csCanFix: true, gateCode: 'ahrefs_thin_inbound', severity: 'warning', importance: 'notice' },
  { id: 'nofollow_page', label: 'Nofollow page', csCanIntroduce: true, csCanFix: true, gateCode: 'ahrefs_nofollow', severity: 'warning', importance: 'warning' },
  { id: 'page_has_links_to_redirect', label: 'Page has links to redirect', csCanIntroduce: true, csCanFix: true, gateCode: 'ahrefs_links_to_redirect', severity: 'warning', importance: 'warning' },
  { id: 'noindex_follow_page', label: 'Noindex follow page', csCanIntroduce: true, csCanFix: true, gateCode: 'ahrefs_noindex', severity: 'warning', importance: 'notice' },
  { id: 'noindex_and_nofollow_page', label: 'Noindex and nofollow page', csCanIntroduce: true, csCanFix: true, gateCode: 'ahrefs_noindex', severity: 'blocker', importance: 'notice' },
  { id: 'page_has_nofollow_outgoing_internal_links', label: 'Page has nofollow outgoing internal links', csCanIntroduce: false, csCanFix: false, gateCode: 'ahrefs_nofollow_out', severity: 'warning', importance: 'notice' },
  { id: 'page_has_nofollow_incoming_internal_links_only', label: 'Page has nofollow incoming internal links only', csCanIntroduce: false, csCanFix: false, gateCode: 'ahrefs_nofollow_in', severity: 'warning', importance: 'notice' },
  { id: 'page_has_nofollow_and_dofollow_incoming_internal_links', label: 'Page has nofollow and dofollow incoming internal links', csCanIntroduce: false, csCanFix: false, gateCode: 'ahrefs_mixed_inbound', severity: 'warning', importance: 'notice' },
  { id: 'h1_tag_changed', label: 'H1 tag changed', csCanIntroduce: true, csCanFix: false, gateCode: 'ahrefs_h1_changed', severity: 'warning', importance: 'notice' },
  { id: 'meta_description_changed', label: 'Meta description changed', csCanIntroduce: true, csCanFix: false, gateCode: 'ahrefs_meta_changed', severity: 'warning', importance: 'notice' },
  { id: 'title_tag_changed', label: 'Title tag changed', csCanIntroduce: true, csCanFix: false, gateCode: 'ahrefs_title_changed', severity: 'warning', importance: 'notice' },
  { id: 'word_count_changed', label: 'Word count changed', csCanIntroduce: true, csCanFix: false, gateCode: 'ahrefs_words_changed', severity: 'warning', importance: 'notice' },
  { id: 'http_to_https_redirect', label: 'HTTP to HTTPS redirect', csCanIntroduce: false, csCanFix: false, gateCode: 'ahrefs_http_https', severity: 'warning', importance: 'notice' },
  { id: 'page_has_redirected_js', label: 'Redirected JavaScript (platform)', csCanIntroduce: false, csCanFix: false, gateCode: 'ahrefs_redirected_js', severity: 'warning', importance: 'warning' },
  { id: 'page_has_broken_js', label: 'Broken JavaScript chunk (deploy)', csCanIntroduce: false, csCanFix: false, gateCode: 'ahrefs_broken_js', severity: 'warning', importance: 'warning' },
  { id: 'page_slow', label: 'Slow page', csCanIntroduce: false, csCanFix: false, gateCode: 'ahrefs_page_slow', severity: 'warning', importance: 'warning' },
  { id: '5xx', label: 'Server error', csCanIntroduce: false, csCanFix: false, gateCode: 'ahrefs_5xx', severity: 'warning', importance: 'error' },
]

/** Ahrefs UI labels / API names → catalog ids. */
const ISSUE_ALIASES: Record<string, string> = {
  'orphan page': 'orphan_page',
  'orphan page (has no incoming internal links)': 'orphan_page',
  'page has links to broken page': 'page_has_links_to_broken_page',
  '404 page': '404_page',
  '4xx page': '4xx_page',
  'double slash in url': 'double_slash_in_url',
  '3xx redirect in sitemap': '3xx_redirect_in_sitemap',
  '4xx page in sitemap': '4xx_page_in_sitemap',
  'noindex page': 'noindex_page',
  'meta description too long': 'description_too_long',
  'open graph tags incomplete': 'open_graph_tags_incomplete',
  'meta description too short': 'description_too_short',
  '3xx redirect': '3xx_redirect',
  'nofollow page': 'nofollow_page',
  'page has links to redirect': 'page_has_links_to_redirect',
  'title too short': 'title_too_short',
  'title too long': 'title_too_long',
  'pages to submit to indexnow': 'pages_to_submit_to_indexnow',
  'page has only one dofollow incoming internal link': 'page_has_only_one_dofollow_incoming_internal_link',
  'noindex follow page': 'noindex_follow_page',
  'structured data has schema.org validation error': 'structured_data_has_schema_org_validation_error',
  'page has nofollow and dofollow incoming internal links': 'page_has_nofollow_and_dofollow_incoming_internal_links',
  'indexable page not in sitemap': 'indexable_page_not_in_sitemap',
  'noindex and nofollow page': 'noindex_and_nofollow_page',
  'page has nofollow outgoing internal links': 'page_has_nofollow_outgoing_internal_links',
  'page has nofollow incoming internal links only': 'page_has_nofollow_incoming_internal_links_only',
  'h1 tag changed': 'h1_tag_changed',
  'meta description changed': 'meta_description_changed',
  'title tag changed': 'title_tag_changed',
  'word count changed': 'word_count_changed',
  'http to https redirect': 'http_to_https_redirect',
}

export function resolveAhrefsIssueId(raw: string): string {
  const s = String(raw || '').trim()
  if (!s) return ''
  const snake = s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  if (AHREFS_ISSUE_CATALOG.some((i) => i.id === snake)) return snake
  const aliased = ISSUE_ALIASES[s.toLowerCase()] || ISSUE_ALIASES[snake.replace(/_/g, ' ')]
  if (aliased) return aliased
  return snake
}

/** Collapse `https://host//path` and `https://host/foo//bar` to a single slash. */
export function sanitizeEstateUrl(url: string): string {
  const raw = String(url || '').trim()
  if (!raw) return raw
  try {
    const u = new URL(raw)
    u.pathname = u.pathname.replace(/\/{2,}/g, '/')
    if (u.pathname.length > 1 && !u.pathname.endsWith('/')) u.pathname += '/'
    return u.toString()
  } catch {
    return raw.replace(/([^:]\/)\/+/g, '$1')
  }
}

export function urlHasDoubleSlash(url: string): boolean {
  try {
    const u = new URL(url)
    return /\/{2,}/.test(u.pathname)
  } catch {
    return /https?:\/\/[^/]+\/{2,}/i.test(url) || /[^:]\/\/\//.test(url)
  }
}

function extractJsonLdBlocks(content: string): Array<{ raw: string; data: unknown }> {
  const out: Array<{ raw: string; data: unknown }> = []
  const re = /<script\b[^>\n]*type=["']application\/ld\+json["'][^>\n]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(content))) {
    const raw = m[1].trim()
    try {
      out.push({ raw, data: JSON.parse(raw) })
    } catch {
      out.push({ raw, data: null })
    }
  }
  return out
}

function walkTypes(node: unknown, acc: unknown[] = []): unknown[] {
  if (!node || typeof node !== 'object') return acc
  const rec = node as Record<string, unknown>
  if (rec['@type']) acc.push(node)
  if (Array.isArray(rec['@graph'])) rec['@graph'].forEach((n) => walkTypes(n, acc))
  if (Array.isArray(node)) node.forEach((n) => walkTypes(n, acc))
  return acc
}

export function articleJsonLdErrors(content: string): string[] {
  const errors: string[] = []
  const blocks = extractJsonLdBlocks(content)
  if (blocks.some((b) => b.data === null)) {
    errors.push('JSON-LD does not parse')
    return errors
  }
  const nodes = blocks.flatMap((b) => walkTypes(b.data))
  const articles = nodes.filter((n) => {
    const t = (n as Record<string, unknown>)['@type']
    return t === 'Article' || (Array.isArray(t) && t.includes('Article'))
  }) as Array<Record<string, unknown>>
  const faqs = nodes.filter((n) => {
    const t = (n as Record<string, unknown>)['@type']
    return t === 'FAQPage' || (Array.isArray(t) && t.includes('FAQPage'))
  }) as Array<Record<string, unknown>>
  for (const a of articles) {
    if (!a.headline) errors.push('Article missing headline')
    if (!a.image) errors.push('Article missing image (schema.org / Google required)')
    if (!a.datePublished) errors.push('Article missing datePublished')
    if (!a.author) errors.push('Article missing author')
    const author = a.author as Record<string, unknown> | undefined
    if (author && typeof author.affiliation === 'string') {
      errors.push('Person.affiliation must be an Organization, not a string')
    }
  }
  for (const f of faqs) {
    const ents = f.mainEntity
    if (!Array.isArray(ents) || ents.length === 0) {
      errors.push('FAQPage missing mainEntity Question list')
      continue
    }
    for (const e of ents) {
      const q = e as Record<string, unknown>
      const ans = q.acceptedAnswer as Record<string, unknown> | undefined
      if (q['@type'] !== 'Question' || !q.name || !ans?.text) {
        errors.push('FAQPage Question missing name or acceptedAnswer.text')
        break
      }
    }
  }
  return errors
}

export const CS_INTRODUCED_ISSUE_IDS = new Set(
  AHREFS_ISSUE_CATALOG.filter((i) => i.csCanIntroduce).map((i) => i.id),
)

export interface AhrefsDraftFinding {
  code: string
  issueId: string
  severity: 'blocker' | 'warning'
  message: string
  fix: string
}

function parseFm(content: string): { fm: Record<string, string>; body: string } {
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

/** Evaluate a draft against the Ahrefs rules CS is allowed to create. */
export function evaluateAhrefsDraft(
  content: string,
  opts: { indexable?: boolean; targetUrl?: string } = {},
): AhrefsDraftFinding[] {
  if (opts.indexable === false) return []
  const { fm, body } = parseFm(content)
  const title = (fm.title || (body.match(/^#\s+(.+)$/m) || [])[1] || '').trim()
  const desc = (fm.description || fm.metaDescription || '').trim()
  const h1s = body.match(/^#\s+.+$/gm) || []
  const robots = String(fm.robots || '').toLowerCase()
  const canonical = (fm.canonicalUrl || fm.canonical || opts.targetUrl || '').trim()
  const findings: AhrefsDraftFinding[] = []

  if (!title) {
    findings.push({
      code: 'ahrefs_title_missing', issueId: 'title_missing', severity: 'blocker',
      message: 'Missing title — Ahrefs flags this as a missing title tag.',
      fix: `Set YAML title to ${AHREFS_TITLE_MIN}–${AHREFS_TITLE_MAX} characters.`,
    })
  } else if (title.length < AHREFS_TITLE_MIN) {
    findings.push({
      code: 'ahrefs_title_too_short', issueId: 'title_too_short', severity: 'blocker',
      message: `Title is ${title.length} chars (Ahrefs minimum ${AHREFS_TITLE_MIN}).`,
      fix: `Lengthen the title to ${AHREFS_TITLE_MIN}–${AHREFS_TITLE_MAX} characters with the primary keyword.`,
    })
  } else if (title.length > AHREFS_TITLE_MAX) {
    findings.push({
      code: 'ahrefs_title_too_long', issueId: 'title_too_long', severity: 'blocker',
      message: `Title is ${title.length} chars (Ahrefs maximum ${AHREFS_TITLE_MAX}).`,
      fix: `Shorten the title to ≤${AHREFS_TITLE_MAX} characters so it is not truncated in SERPs.`,
    })
  }

  if (!desc) {
    findings.push({
      code: 'ahrefs_meta_missing', issueId: 'description_missing', severity: 'blocker',
      message: 'Missing meta description — Ahrefs flags this on every crawl.',
      fix: `Add description: ${AHREFS_META_MIN}–${AHREFS_META_MAX} characters.`,
    })
  } else if (desc.length < AHREFS_META_MIN) {
    findings.push({
      code: 'ahrefs_meta_too_short', issueId: 'description_too_short', severity: 'blocker',
      message: `Meta description is ${desc.length} chars (Ahrefs minimum ${AHREFS_META_MIN}).`,
      fix: `Expand the description to ${AHREFS_META_MIN}–${AHREFS_META_MAX} characters.`,
    })
  } else if (desc.length > AHREFS_META_MAX) {
    findings.push({
      code: 'ahrefs_meta_too_long', issueId: 'description_too_long', severity: 'blocker',
      message: `Meta description is ${desc.length} chars (Ahrefs maximum ${AHREFS_META_MAX}).`,
      fix: `Trim the description to ≤${AHREFS_META_MAX} characters.`,
    })
  }

  if (h1s.length === 0) {
    findings.push({
      code: 'ahrefs_h1_missing', issueId: 'h1_missing', severity: 'blocker',
      message: 'No markdown H1 — the live page will miss an H1 or inherit a weak layout title.',
      fix: 'Add a single `# Heading` that matches the title.',
    })
  } else if (h1s.length > 1) {
    findings.push({
      code: 'ahrefs_h1_multiple', issueId: 'h1_multiple', severity: 'blocker',
      message: `${h1s.length} H1 headings — Ahrefs flags multiple H1s.`,
      fix: 'Keep one H1; demote the extras to H2.',
    })
  }

  if (!canonical) {
    findings.push({
      code: 'ahrefs_canonical_missing', issueId: 'canonical_missing', severity: 'warning',
      message: 'No canonical URL in front matter — Ahrefs will flag a missing canonical after deploy.',
      fix: 'Set canonicalUrl to the live estate URL. Ship repair injects it from the owner plan.',
    })
  }

  if (/noindex/.test(robots)) {
    findings.push({
      code: 'ahrefs_noindex', issueId: 'noindex_page', severity: 'blocker',
      message: 'Draft is noindex but the ship is indexable — Ahrefs will report a noindex page.',
      fix: 'Set robots: index,follow before shipping an indexable page.',
    })
  }

  if (/nofollow/.test(robots) && !/noindex/.test(robots)) {
    findings.push({
      code: 'ahrefs_nofollow', issueId: 'nofollow_page', severity: 'warning',
      message: 'Draft is nofollow — Ahrefs will report a nofollow page and drop link equity.',
      fix: 'Set robots: index,follow for indexable ships.',
    })
  }

  const ogImage = (fm.ogImage || fm['og:image'] || fm.image || '').trim()
  if (!ogImage) {
    findings.push({
      code: 'ahrefs_og_incomplete', issueId: 'open_graph_tags_incomplete', severity: 'warning',
      message: 'No og:image — caseworks Open Graph is incomplete without images (Ahrefs +17 on the last crawl).',
      fix: `Set ogImage: ${AHREFS_OG_IMAGE}. renderTarget injects it on ship if missing.`,
    })
  }

  const urlsToCheck = [canonical, opts.targetUrl || '', ...Array.from(body.matchAll(/\[[^\]]*]\((https?:[^)\s]+)\)/g)).map((m) => m[1])]
  if (urlsToCheck.some((u) => u && urlHasDoubleSlash(u))) {
    findings.push({
      code: 'ahrefs_double_slash', issueId: 'double_slash_in_url', severity: 'blocker',
      message: 'URL contains a double slash in the path (Ahrefs error: Double slash in URL).',
      fix: 'Collapse `//` in the pathname. Ship repair sanitizes canonical + markdown hrefs.',
    })
  }

  const schemaErrors = articleJsonLdErrors(content)
  if (schemaErrors.length) {
    findings.push({
      code: 'ahrefs_schema_invalid', issueId: 'structured_data_has_schema_org_validation_error', severity: 'warning',
      message: `JSON-LD would fail schema.org validation: ${schemaErrors.slice(0, 3).join('; ')}.`,
      fix: 'Article needs headline, image, datePublished, author; FAQPage needs mainEntity Question/Answer.',
    })
  }

  return findings
}

export function clampTitleToAhrefs(title: string, primaryKeyword = ''): string {
  let t = String(title || primaryKeyword || 'Immigration guide').replace(/\s+/g, ' ').trim()
  if (t.length > AHREFS_TITLE_MAX) {
    t = t.slice(0, AHREFS_TITLE_MAX).replace(/\s+\S*$/, '').trim()
    if (t.length < AHREFS_TITLE_MIN) t = String(title).slice(0, AHREFS_TITLE_MAX).trim()
  }
  if (t.length < AHREFS_TITLE_MIN) {
    const pad = `${t} — ${(primaryKeyword || 'practical guide').trim()}`.replace(/\s+/g, ' ').trim()
    t = pad.length <= AHREFS_TITLE_MAX ? pad : `${t} guide`.slice(0, AHREFS_TITLE_MAX)
  }
  if (t.length < AHREFS_TITLE_MIN) t = `${t} checklist 2026`.slice(0, AHREFS_TITLE_MAX)
  return t
}

export function clampMetaToAhrefs(desc: string, title: string, primaryKeyword: string): string {
  let d = String(desc || '').replace(/\s+/g, ' ').trim()
  if (d.length > AHREFS_META_MAX) {
    d = d.slice(0, AHREFS_META_MAX).replace(/\s+\S*$/, '').trim()
  }
  if (d.length < AHREFS_META_MIN) {
    const extra = ` Practical steps for ${primaryKeyword || title}. Verify official rules before you apply.`
    d = (d + extra).replace(/\s+/g, ' ').trim().slice(0, AHREFS_META_MAX)
  }
  return d
}

/** Rewrite FM + body so Ahrefs title/meta/H1/canonical/noindex rules clear. */
export function applyAhrefsDraftRepairs(
  content: string,
  opts: { primaryKeyword?: string; targetUrl?: string } = {},
): { content: string; applied: string[] } {
  const applied: string[] = []
  const parsed = parseFm(content)
  let { fm, body } = parsed
  const pk = opts.primaryKeyword || fm.primaryKeyword || ''
  // Broken/unclosed script open tags (model truncation, e.g. a trailing
  // `<script type="application/` with no `>` on the line) merge with the NEXT
  // real tag inside every attribute-span regex (`[^>]*` crosses newlines).
  // Strip them before any block matching so schema replacement can never
  // swallow body text (a live run lost 2675 → 601 body words this way).
  body = body.replace(/^<script\b[^>\n]*$/gim, '')
  body = body.replace(/\n{3,}/g, '\n\n')
  const rawTitle = fm.title || (body.match(/^#\s+(.+)$/m) || [])[1] || pk || 'Immigration guide'
  const title = clampTitleToAhrefs(rawTitle, pk)
  if (title !== rawTitle) applied.push('ahrefs_title')
  const rawDesc = fm.description || fm.metaDescription || ''
  const desc = clampMetaToAhrefs(rawDesc, title, pk)
  if (desc !== rawDesc) applied.push('ahrefs_meta')

  const h1s = body.match(/^#\s+.+$/gm) || []
  if (h1s.length === 0) {
    body = `# ${title}\n\n${body.trim()}`
    applied.push('ahrefs_h1')
  } else if (h1s.length > 1) {
    let seen = 0
    body = body.replace(/^#\s+(.+)$/gm, (_m, text) => {
      seen += 1
      return seen === 1 ? `# ${text}` : `## ${text}`
    })
    applied.push('ahrefs_h1_demote')
  }

  fm.title = title
  fm.description = desc
  const target = opts.targetUrl ? sanitizeEstateUrl(opts.targetUrl) : ''
  if (target && urlHasDoubleSlash(opts.targetUrl || '')) applied.push('ahrefs_double_slash')
  if (target && !fm.canonicalUrl && !fm.canonical) {
    fm.canonicalUrl = target
    applied.push('ahrefs_canonical')
  }
  if (fm.canonicalUrl) {
    const clean = sanitizeEstateUrl(fm.canonicalUrl)
    if (clean !== fm.canonicalUrl) applied.push('ahrefs_double_slash')
    fm.canonicalUrl = clean
  }
  if (/noindex/i.test(fm.robots || '') || /nofollow/i.test(fm.robots || '')) {
    fm.robots = 'index,follow'
    applied.push('ahrefs_indexable')
  }
  if (!fm.robots) fm.robots = 'index,follow'
  if (!fm.ogImage && !fm['og:image'] && !fm.image) {
    fm.ogImage = AHREFS_OG_IMAGE
    applied.push('ahrefs_og_image')
  }

  const slashed = body.replace(/\]\((https?:\/\/[^)]+)\)/g, (_m, href: string) => {
    if (!urlHasDoubleSlash(href)) return `](${href})`
    applied.push('ahrefs_double_slash')
    return `](${sanitizeEstateUrl(href)})`
  })
  if (slashed !== body) body = slashed

  const schemaFix = ensureValidArticleJsonLd(body, {
    title,
    description: desc,
    url: fm.canonicalUrl || target,
  })
  if (schemaFix.changed) {
    body = schemaFix.body
    applied.push('ahrefs_schema')
  }

  const raw = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  let fmBlock = raw ? raw[1] : ''
  const setFm = (key: string, value: string) => {
    const re = new RegExp(`^${key}\\s*:\\s*.*$`, 'im')
    if (re.test(fmBlock)) fmBlock = fmBlock.replace(re, `${key}: ${value}`)
    else fmBlock = `${fmBlock.trim()}\n${key}: ${value}`
  }
  setFm('title', title.includes(':') || title.includes('"') ? JSON.stringify(title) : title)
  setFm('description', desc.includes(':') || desc.length > 80 ? JSON.stringify(desc) : desc)
  if (fm.canonicalUrl) setFm('canonicalUrl', fm.canonicalUrl)
  if (fm.robots) setFm('robots', /[:"]/.test(fm.robots) ? JSON.stringify(fm.robots) : fm.robots)
  if (fm.ogImage) setFm('ogImage', fm.ogImage)
  return {
    content: `---\n${fmBlock.trim()}\n---\n\n${body.trim()}\n`,
    applied,
  }
}

function ensureValidArticleJsonLd(
  body: string,
  meta: { title: string; description: string; url: string },
): { body: string; changed: boolean } {
  const today = new Date().toISOString().slice(0, 10)
  const valid: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: meta.title.slice(0, 110),
    description: meta.description.slice(0, 160),
    image: [AHREFS_OG_IMAGE_ABS],
    datePublished: today,
    dateModified: today,
    mainEntityOfPage: meta.url || AHREFS_OG_IMAGE_ABS.replace(/\/og-image\.png$/, '/'),
    author: {
      '@type': 'Organization',
      name: 'MyCaseworks Editorial',
      url: 'https://legal.yousafeconsultancy.com/about/',
    },
    publisher: {
      '@type': 'Organization',
      name: 'MyCaseworks',
      url: 'https://legal.yousafeconsultancy.com',
      logo: {
        '@type': 'ImageObject',
        url: AHREFS_OG_IMAGE_ABS,
        width: 1200,
        height: 630,
      },
    },
  }
  const script = `<script type="application/ld+json">\n${JSON.stringify(valid, null, 2)}\n</script>`
  if (!/"@type"\s*:\s*"Article"/i.test(body)) {
    return { body: `${script}\n\n${body.trim()}\n`, changed: true }
  }
  if (articleJsonLdErrors(body).length === 0) {
    return { body, changed: false }
  }
  // Replace ONLY the Article JSON-LD block itself. The old regex let the two
  // lazy `[\s\S]*?` spans run from the FIRST <script tag to the FIRST
  // "@type": "Article" ANYWHERE after it — crossing </script> boundaries and
  // the entire article body when the Article script sat behind a FAQPage
  // block, deleting the body on replace. Match a single block, then swap it.
  const ldBlockRe = /<script\b[^>\n]*type=["']application\/ld\+json["'][^>\n]*>[\s\S]*?<\/script>/gi
  const ldBlocks = Array.from(body.matchAll(ldBlockRe)).map((m) => m[0])
  const articleBlock = ldBlocks.find((blk) => /"@type"\s*:\s*"Article"/i.test(blk))
  if (articleBlock) {
    return { body: body.replace(articleBlock, () => script), changed: true }
  }
  return { body: `${script}\n\n${body.trim()}\n`, changed: true }
}
