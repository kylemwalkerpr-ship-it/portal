/**
 * Ahrefs Site Audit ↔ Content Studio contract.
 *
 * Ahrefs flags titles <30 or >60, metas <70 or >160, missing/multiple H1s,
 * missing canonicals, orphans, thin pages, and invented links. The studio
 * used to allow 12–70 titles and 120–170 metas, which *created* those
 * flags. This module is the single map of:
 *   - which Ahrefs issues CS can introduce
 *   - how we gate them before ship
 *   - how we rewrite the draft to clear them
 */

export const AHREFS_TITLE_MIN = 30
export const AHREFS_TITLE_MAX = 60
export const AHREFS_META_MIN = 70
export const AHREFS_META_MAX = 160

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
}

/** Catalog of Ahrefs Site Audit issues we care about. */
export const AHREFS_ISSUE_CATALOG: AhrefsIssueDef[] = [
  { id: 'title_too_short', label: 'Title too short (<30)', csCanIntroduce: true, csCanFix: true, gateCode: 'ahrefs_title_too_short', severity: 'blocker' },
  { id: 'title_too_long', label: 'Title too long (>60)', csCanIntroduce: true, csCanFix: true, gateCode: 'ahrefs_title_too_long', severity: 'blocker' },
  { id: 'title_missing', label: 'Missing title', csCanIntroduce: true, csCanFix: true, gateCode: 'ahrefs_title_missing', severity: 'blocker' },
  { id: 'title_duplicate', label: 'Duplicate title', csCanIntroduce: true, csCanFix: false, gateCode: 'ahrefs_title_duplicate', severity: 'warning' },
  { id: 'description_missing', label: 'Missing meta description', csCanIntroduce: true, csCanFix: true, gateCode: 'ahrefs_meta_missing', severity: 'blocker' },
  { id: 'description_too_short', label: 'Meta description too short (<70)', csCanIntroduce: true, csCanFix: true, gateCode: 'ahrefs_meta_too_short', severity: 'blocker' },
  { id: 'description_too_long', label: 'Meta description too long (>160)', csCanIntroduce: true, csCanFix: true, gateCode: 'ahrefs_meta_too_long', severity: 'blocker' },
  { id: 'description_duplicate', label: 'Duplicate meta description', csCanIntroduce: true, csCanFix: false, gateCode: 'ahrefs_meta_duplicate', severity: 'warning' },
  { id: 'h1_missing', label: 'Missing H1', csCanIntroduce: true, csCanFix: true, gateCode: 'ahrefs_h1_missing', severity: 'blocker' },
  { id: 'h1_multiple', label: 'Multiple H1s', csCanIntroduce: true, csCanFix: true, gateCode: 'ahrefs_h1_multiple', severity: 'blocker' },
  { id: 'canonical_missing', label: 'Missing canonical', csCanIntroduce: true, csCanFix: true, gateCode: 'ahrefs_canonical_missing', severity: 'blocker' },
  { id: 'orphan_page', label: 'Orphan page', csCanIntroduce: true, csCanFix: true, gateCode: 'ahrefs_orphan', severity: 'warning' },
  { id: 'noindex', label: 'noindex on an intended page', csCanIntroduce: true, csCanFix: true, gateCode: 'ahrefs_noindex', severity: 'blocker' },
  { id: 'low_content', label: 'Thin content', csCanIntroduce: true, csCanFix: true, gateCode: 'thin_content', severity: 'blocker' },
  { id: 'broken_internal', label: 'Broken internal link', csCanIntroduce: true, csCanFix: true, gateCode: 'dead_internal_link', severity: 'blocker' },
  { id: 'broken_external', label: 'Broken external link', csCanIntroduce: true, csCanFix: true, gateCode: 'dead_external_link', severity: 'blocker' },
  { id: 'not_in_sitemap', label: 'Indexable page not in sitemap', csCanIntroduce: true, csCanFix: true, gateCode: 'ahrefs_not_in_sitemap', severity: 'warning' },
  { id: 'og_missing', label: 'Missing Open Graph tags', csCanIntroduce: true, csCanFix: true, gateCode: 'ahrefs_og_missing', severity: 'warning' },
  { id: 'page_has_redirected_js', label: 'Redirected JavaScript (platform)', csCanIntroduce: false, csCanFix: false, gateCode: 'ahrefs_redirected_js', severity: 'warning' },
  { id: 'page_has_broken_js', label: 'Broken JavaScript chunk (deploy)', csCanIntroduce: false, csCanFix: false, gateCode: 'ahrefs_broken_js', severity: 'warning' },
  { id: 'page_slow', label: 'Slow page', csCanIntroduce: false, csCanFix: false, gateCode: 'ahrefs_page_slow', severity: 'warning' },
  { id: '5xx', label: 'Server error', csCanIntroduce: false, csCanFix: false, gateCode: 'ahrefs_5xx', severity: 'warning' },
]

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
      code: 'ahrefs_noindex', issueId: 'noindex', severity: 'blocker',
      message: 'Draft is noindex but the ship is indexable — Ahrefs will report a noindex page.',
      fix: 'Set robots: index,follow before shipping an indexable page.',
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
  if (opts.targetUrl && !fm.canonicalUrl && !fm.canonical) {
    fm.canonicalUrl = opts.targetUrl
    applied.push('ahrefs_canonical')
  }
  if (/noindex/i.test(fm.robots || '')) {
    fm.robots = 'index,follow'
    applied.push('ahrefs_indexable')
  }
  if (!fm.robots) fm.robots = 'index,follow'

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
  return {
    content: `---\n${fmBlock.trim()}\n---\n\n${body.trim()}\n`,
    applied,
  }
}
