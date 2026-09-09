/**
 * The canonical document format contract.
 *
 * One source of truth for HOW a finished article must look, injected into:
 *   - the briefing stage (the brief specifies the layout before any prose),
 *   - the drafting prompt (formattingRequirementsBlock in contentQualityGate),
 *   - every editor/reviewer fix pass (structure-preservation rules),
 * and enforced deterministically by normalizeEditorDocument() after every AI
 * return and by the audit's formatting checks.
 *
 * 2026-08-28 incident this module prevents: an editor fix pass returned the
 * article with its own YAML frontmatter + an invalid Article JSON-LD block
 * embedded mid-body; the renderer shipped both as visible paragraphs and the
 * page looked machine-mangled (keyword title, collapsed bullets, Sources x3,
 * section FAQ "questions" built from headings like "Sources").
 */

import { sanitizeLeakedMarkup } from './leakedMarkup'
import { writingFamilyFor } from './writingShape'
import { stripReaderFacingCodeFences } from './readerFacingMarkdown'
import { rewriteMarketAnchors } from './marketAnchors'

/** The canonical reader-facing skeleton every article follows. */
export const FORMAT_SKELETON = [
  '1. YAML frontmatter (title, content_type, region, description, canonicalUrl, robots, ogImage) — top of document ONLY.',
  '2. `# H1` — Title Case, differs from the raw keyword (adds a qualifier/year).',
  '3. Byline line (`**By Name**` + credentials italic) where supplied by the brief.',
  '4. `## In 60 seconds` — 3–5 bullets, one `- ` per line. NEVER one prose line with " - " separators.',
  '5. `## Table of contents` — one `- [Section](#slug)` link per content H2, matching order.',
  '6. Content H2 sections in the brief\'s order — each opens with a 1–3 sentence answer, then scannable bodies: bullets for sets, `1.` numbered steps for sequences, at most one pipe table where tabular.',
  '7. `## FAQ` — 4–6 `### Question?` headings, each answer self-contained (2–5 sentences).',
  '8. `## Sources` — deduplicated official citations, one `- [Name](URL)` per line.',
  '9. `## Related guides` — 2–3 verified estate links, EVERY entry a clickable `- [Guide title](URL)`. A guide named as bare text is unreachable and is rejected.',
  '10. Short educational disclaimer.',
].join('\n')

/** Narrative-essay skeleton for consultancy blogs. Not a legal-guide kit. */
export const BLOG_FORMAT_SKELETON = [
  '1. YAML frontmatter (title, content_type, region, description, canonicalUrl, robots, ogImage, author) — top of document ONLY.',
  '2. `# H1` — Title Case, thesis-led, differs from the raw keyword.',
  '3. Byline line (`**By Name**` + credentials italic) where supplied by the brief.',
  '4. Opening 1–2 paragraphs that answer the thesis. No TL;DR kit, no table of contents.',
  '5. 3–6 purpose-led H2 sections that each advance the argument. Do not restate the intro. Do not force eligibility / process / documents / FAQ / worked-example headings.',
  '6. Official citations in-body where facts are asserted. A ## Sources dump is optional when the citations already live in prose.',
  '7. One closer. FAQ / FAQPage are not required.',
  '8. Short educational disclaimer on YMYL-adjacent topics.',
].join('\n')

/** Regional pages: In 60 seconds, procedural H2s, FAQ 3–5, sources, disclaimer. */
export const REGIONAL_FORMAT_SKELETON = [
  '1. YAML frontmatter (title, content_type, region, description, canonicalUrl, robots, ogImage) — top of document ONLY.',
  '2. `# H1` — Title Case, geo-specific.',
  '3. `## In 60 seconds` — 3–5 bullets, one `- ` per line.',
  '4. Content H2 sections — procedural (who it is for, what to prepare, steps, what can change, next action).',
  '5. `## FAQ` — 3–5 `### Question?` headings, each answer self-contained.',
  '6. `## Sources` — deduplicated official citations, one `- [Name](URL)` per line.',
  '7. Short educational disclaimer.',
].join('\n')

export function formatSkeletonFor(contentType: string): string {
  const family = writingFamilyFor(contentType)
  if (family === 'blog' || family === 'short') return BLOG_FORMAT_SKELETON
  if (family === 'regional') return REGIONAL_FORMAT_SKELETON
  return FORMAT_SKELETON
}

/** Response-format rules appended to every editor/reviewer fix prompt. */
export function editorResponseContract(): string {
  return [
    '',
    '## FORMAT PRESERVATION CONTRACT (violations are rejected mechanically)',
    '- Return ONLY the complete corrected article as raw markdown. No preamble, no closing remarks, no explanations.',
    '- NEVER wrap the article (or any part of it) in ``` code fences.',
    '- NEVER add your own YAML frontmatter, JSON-LD <script> blocks, or metadata unless that exact block already exists in the input. If the input starts with a `---` frontmatter block, return it unchanged at the top.',
    '- NEVER emit the literal token `KEEP---` / `KEEP<script` / `KEEP&lt;script` (KEEP glued to a fence or schema tag). Preserve means leave `---` / `<script>` as-is — do not prefix them with KEEP.',
    '- Preserve the existing structure exactly: same H1, same H2/### heading text and levels, same section order, same bullet (`- `) and numbered (`1. `) markers, same table pipes — except the specific lines a listed finding requires you to change.',
    '- Keep every list item on its own line. Never merge list items into a paragraph, and never split a paragraph into fake list items.',
    '- Do not reorder, rename, merge, or split sections.',
    '- Keep all facts, citations, and interlinks that are not flagged.',
    '- Every URL must stay wrapped in a descriptive markdown link — `[Label](https://…)`. Never emit a raw URL as plain text, and never name a related guide without linking it.',
  ].join('\n')
}

/** Full contract text for the briefing + drafting stages. */
export function formatContractBriefBlock(contentType?: string): string {
  const skeleton = contentType ? formatSkeletonFor(contentType) : FORMAT_SKELETON
  const family = contentType ? writingFamilyFor(contentType) : 'guide'
  const engagement =
    family === 'blog' || family === 'short'
      ? [
          '- The reader scrolls: every H2 advances the thesis, then supporting detail.',
          '- Blogs are essays: developed paragraphs are allowed; do not force a FAQ, TOC, or TL;DR kit.',
          '- Formatting is graded: a keyword-only title still fails. Kit sections are not required.',
        ]
      : [
          '- The reader scrolls: every H2 opens with a direct 1–3 sentence answer, then detail.',
          '- Reader-engagement devices required: at least one scannable checklist or table,',
          '  short paragraphs (1–6 sentences; a developed 4–6 sentence paragraph is allowed), bolded lead phrases on long list items,',
          '  blockquote callouts for warnings, and self-contained FAQ answers.',
          '- Formatting is graded: broken lists, collapsed bullets, or a keyword-only title',
          '  fail the audit exactly like a missing section.',
        ]
  return [
    '## DOCUMENT FORMAT CONTRACT (the layout below is the product — write INTO it)',
    skeleton,
    '',
    ...engagement,
  ].join('\n')
}

export interface NormalizeResult {
  content: string
  fixed: string[]
}

function isValidSchemaScript(block: string): boolean {
  const inner = (block.match(/>([\s\S]*?)<\/script>/i) || [])[1] || ''
  if (!inner.trim()) return false
  try {
    const data = JSON.parse(inner.trim()) as Record<string, unknown>
    if (!data || typeof data !== 'object') return false
    const ctx = String(data['@context'] || '')
    if (!ctx || !/schema\.org/i.test(ctx)) return false
    if (!data['@type']) return false
    return true
  } catch {
    return false
  }
}

export function normalizeEditorDocument(raw: string): NormalizeResult {
  const fixed: string[] = []
  let s = String(raw || '')

  {
    let keepFixed = false
    if (/\bKEEP---+/i.test(s)) {
      s = s.replace(/\bKEEP---+/gi, '---')
      keepFixed = true
    }
    if (/\bKEEP(?=<script\b)/i.test(s)) {
      s = s.replace(/\bKEEP(?=<script\b)/gi, '')
      keepFixed = true
    }
    if (/\bKEEP(?=&lt;script\b)/i.test(s)) {
      s = s.replace(/\bKEEP(?=&lt;script\b)/gi, '')
      keepFixed = true
    }
    if (keepFixed) fixed.push('editor_keep_fence_normalized')
  }

  {
    const before = s
    s = s
      .replace(/&amp;lt;script\b/gi, '&lt;script')
      .replace(/&amp;lt;\/script&amp;gt;/gi, '&lt;/script&gt;')
      .replace(/&amp;lt;\/script&gt;/gi, '&lt;/script&gt;')
      .replace(/&lt;script\b([^&]*?)&amp;gt;/gi, '&lt;script$1&gt;')
      .replace(/&lt;script\b([^&]*?)&gt;/gi, '<script$1>')
      .replace(/&lt;\/script&gt;/gi, '</script>')
    if (!/&lt;script\b/i.test(s)) {
      s = s.replace(/[ \t]*&amp;lt;\/script&amp;gt;/gi, '').replace(/[ \t]*&lt;\/script&gt;/gi, '')
    }
    if (s !== before) {
      s = s.replace(/\n{3,}/g, '\n\n')
      fixed.push('editor_escaped_script_unescaped')
    }
  }

  const fenced = s.trim().match(/^```(?:markdown|md|mdx)?[ \t]*\r?\n([\s\S]*?)\r?\n?```[ \t]*$/i)
  if (fenced && fenced[1].trim()) {
    s = fenced[1]
    fixed.push('editor_fence_unwrapped')
  }

  const docStart = s.search(/^(---|\#\s|<script\b)/m)
  if (docStart > 0) {
    const preamble = s.slice(0, docStart).trim()
    if (preamble.length < 400 && !/^#/m.test(preamble)) {
      s = s.slice(docStart)
      fixed.push('editor_preamble_stripped')
    }
  }

  const fmBlocks: Array<{ start: number; end: number; body: string }> = []
  const fmRe = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*$/gm
  let m: RegExpExecArray | null
  while ((m = fmRe.exec(s)) !== null) {
    fmBlocks.push({ start: m.index, end: m.index + m[0].length, body: m[1] })
  }
  if (fmBlocks.length > 0 && !s.startsWith('---')) {
    const first = fmBlocks[0]
    const rest = (s.slice(0, first.start) + s.slice(first.end)).replace(/^\s*\n/, '')
    s = `---\n${first.body.trim()}\n---\n\n${rest.trimStart()}`
    fixed.push('editor_frontmatter_moved_to_top')
  } else if (fmBlocks.length > 1) {
    let out = s
    for (let i = fmBlocks.length - 1; i >= 1; i--) {
      const blk = fmBlocks[i]
      out = out.slice(0, blk.start) + out.slice(blk.end)
    }
    s = out.replace(/\n{3,}/g, '\n\n')
    fixed.push('editor_embedded_frontmatter_dropped')
  }

  const inlineFm = /(?:^|\n)\s*--- title:\s+[\s\S]*?(?=\n\s*(?:##?\s|Cross[‑-]border|[A-Z][^\n]{0,80}\n))/i
  if (inlineFm.test(s)) {
    s = s.replace(inlineFm, '\n')
    fixed.push('editor_inline_frontmatter_dropped')
  }
  {
    const lines = s.split('\n')
    let openAt = -1
    let depth = 0
    for (let i = 0; i < lines.length; i++) {
      if (/<script\b/i.test(lines[i])) {
        depth++
        if (depth === 1) openAt = i
      }
      if (/<\/script>/i.test(lines[i])) {
        depth = Math.max(0, depth - 1)
        if (depth === 0) openAt = -1
      }
    }
    if (openAt >= 0) {
      let end = openAt + 1
      while (end < lines.length) {
        const t = lines[end].trim()
        if (t === '' || /^#{1,6}\s/.test(t) || /^[-*]\s/.test(t) || /^\d+\.\s/.test(t)) break
        if (!/^[{}\[\]",]|^["']?[A-Za-z@][A-Za-z0-9_@.-]*["']?\s*:/.test(t)) break
        end++
      }
      s = [...lines.slice(0, openAt), ...lines.slice(end)].join('\n').replace(/\n{3,}/g, '\n\n')
      fixed.push('editor_unterminated_schema_dropped')
    }
  }

  const inlineSchemaLines = s.split('\n')
  let inlineSchemaRemoved = 0
  let scriptDepth = 0
  for (let i = 0; i < inlineSchemaLines.length; i++) {
    const line = inlineSchemaLines[i]
    const trimmed = line.trim()
    if (/<script\b/i.test(line)) scriptDepth++
    if (scriptDepth > 0) {
      if (/<\/script>/i.test(line)) scriptDepth = Math.max(0, scriptDepth - 1)
      continue
    }
    if (/^\{.*["']?@context["']?\s*:\s*["']?.*schema\.org.*["']?@type["']?\s*:/i.test(trimmed)) {
      inlineSchemaLines[i] = ''
      inlineSchemaRemoved++
    }
  }
  if (inlineSchemaRemoved) {
    s = inlineSchemaLines.join('\n')
    fixed.push(`editor_inline_schema_dropped (${inlineSchemaRemoved})`)
  }

  const badScripts = s.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || []
  let removedScripts = 0
  for (const blk of badScripts) {
    if (!isValidSchemaScript(blk)) {
      s = s.replace(blk, '')
      removedScripts++
    }
  }
  if (removedScripts > 0) {
    s = s.replace(/\n{3,}/g, '\n\n')
    fixed.push(`editor_invalid_schema_dropped (${removedScripts})`)
  }

  {
    const splitRunInHeadings = (input: string): string => {
      const fenceRe = /^```/m
      const lines = input.split('\n')
      const out: string[] = []
      let inFence = false
      let changed = false
      for (const line of lines) {
        if (fenceRe.test(line.trimStart()) && !inFence) {
          inFence = true
          out.push(line)
          continue
        }
        if (inFence && fenceRe.test(line.trimStart())) {
          inFence = false
          out.push(line)
          continue
        }
        if (inFence) {
          out.push(line)
          continue
        }
        const m = line.match(/^(.{1,400}?)(\s)(#{2,4})\s+(.+)$/)
        if (m && m[1] && /[^\s]/.test(m[1])) {
          out.push(m[1].replace(/\s+$/, ''), '', `${m[3]} ${m[4].trim()}`)
          changed = true
        } else {
          out.push(line)
        }
      }
      return changed ? out.join('\n') : input
    }
    const split = splitRunInHeadings(s)
    if (split !== s) {
      s = split.replace(/\n{3,}/g, '\n\n')
      fixed.push('run_in_headings_split')
    }
  }

  {
    const splitRunInTables = (input: string): string => {
      const lines = input.split('\n')
      const out: string[] = []
      let inFence = false
      let changed = false
      for (const line of lines) {
        if (/^```/.test(line.trimStart()) && !inFence) {
          inFence = true
          out.push(line)
          continue
        }
        if (inFence && /^```/.test(line.trimStart())) {
          inFence = false
          out.push(line)
          continue
        }
        if (inFence) {
          out.push(line)
          continue
        }
        const trimmed = line.trim()
        const cells = trimmed.split('|').map((c) => c.trim())
        const isTableLine = trimmed.startsWith('|') && trimmed.endsWith('|') && cells.length >= 5
        if (!isTableLine || cells.length <= 4) {
          out.push(line)
          continue
        }
        const contentCells = cells.slice(1, -1).filter(Boolean)
        const dashIdx = contentCells.findIndex((c) => /^-{2,}$/.test(c))
        if (dashIdx <= 0) {
          out.push(line)
          continue
        }
        const headerCells = contentCells.slice(0, dashIdx)
        const colCount = headerCells.length
        if (colCount < 2) {
          out.push(line)
          continue
        }
        const sepBlock = contentCells.slice(dashIdx, dashIdx + colCount)
        if (sepBlock.length !== colCount || !sepBlock.every((c) => /^-{2,}$/.test(c))) {
          out.push(line)
          continue
        }
        const bodyCells = contentCells.slice(dashIdx + colCount)
        if (!bodyCells.length) {
          out.push(line)
          continue
        }
        const rows: string[][] = [headerCells]
        for (let i = 0; i < bodyCells.length; i += colCount) {
          rows.push(bodyCells.slice(i, i + colCount))
        }
        if (rows.some((r) => r.length !== colCount)) {
          out.push(line)
          continue
        }
        for (let r = 0; r < rows.length; r++) {
          if (r === 1) {
            out.push(`| ${rows[0].map(() => '---').join(' | ')} |`)
          }
          out.push(`| ${rows[r].join(' | ')} |`)
        }
        out.push('')
        changed = true
      }
      return changed ? out.join('\n') : input
    }
    const splitTables = splitRunInTables(s)
    if (splitTables !== s) {
      s = splitTables.replace(/\n{3,}/g, '\n\n')
      fixed.push('mangled_tables_split')
    }
  }

  const tldrRe = /(## In 60 seconds\s*\n)([\s\S]*?)(?=\n## |\n$|$)/i
  const tldrMatch = s.match(tldrRe)
  if (tldrMatch) {
    const body = tldrMatch[2]
    const hasLineBullets = /^[-*+]\s+/m.test(body)
    if (!hasLineBullets && /\s[-–]\s/.test(body)) {
      const segments = body
        .trim()
        .replace(/<\/?(?:ul|ol|li)[^>]*>/gi, ' ')
        .split(/\s[-–]\s/)
        .map((seg) => seg.replace(/^[-–*+]\s*/, '').trim())
        .filter(Boolean)
      if (segments.length >= 3) {
        const rebuilt = `${tldrMatch[1]}${segments.map((seg) => `- ${seg}`).join('\n')}\n`
        s = s.replace(tldrMatch[0], rebuilt)
        fixed.push('tldr_bullets_restored')
      }
    }
  }

  const sourcesRe = /(## (?:Official )?[Ss]ources\s*\n)([\s\S]*?)(?=\n## |\n$|$)/
  const sourcesMatch = s.match(sourcesRe)
  if (sourcesMatch) {
    const entries = sourcesMatch[2].split('\n').filter((l) => l.trim())
    const seen = new Set<string>()
    let dupes = 0
    const deduped = entries.filter((line) => {
      const label = line
        .replace(/^[-*]\s*/, '')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
        .replace(/[.]+$/, '')
      if (!label) return true
      if (seen.has(label)) {
        dupes++
        return false
      }
      seen.add(label)
      return true
    })
    if (dupes > 0) {
      s = s.replace(sourcesMatch[0], `${sourcesMatch[1]}${deduped.join('\n')}\n`)
      fixed.push(`sources_deduplicated (${dupes})`)
    }
  }

  const cleaned = s.replace(/\n{3,}/g, '\n\n').trim()
  if (cleaned !== s.trim()) fixed.push('whitespace_normalized')
  s = cleaned

  // Reader-facing articles are never code samples. Unwrap prose that a model
  // fenced as markdown and drop leaked code/schema fences. This deliberately
  // leaves valid <script type="application/ld+json"> blocks alone.
  const reader = stripReaderFacingCodeFences(s)
  if (reader.changed) fixed.push(`reader_code_fences_removed (${reader.changed})`)
  s = reader.content.trim()

  // Marketplace URLs cite people/services, not addresses. Keep the href but
  // replace URL-as-anchor / parenthetical URL output with a readable name.
  const market = rewriteMarketAnchors(s)
  if (market.changed) fixed.push(`marketplace_anchors_named (${market.changed})`)
  s = market.content.trim()

  return { content: s, fixed }
}

export function isKeywordOnlyTitle(title: string, primaryKeyword: string): boolean {
  const norm = (v: string) =>
    v
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  const t = norm(title)
  const k = norm(primaryKeyword)
  if (!t || !k) return false
  if (t === k) return true
  const stripYear = (v: string) => v.replace(/\b20\d{2}\b/g, '').replace(/\s+/g, ' ').trim()
  return stripYear(t) === stripYear(k)
}

export function collapseDuplicatedTitle(title: string): string {
  const raw = String(title || '')
  const parts = raw.split(/\s+[—–]\s+/)
  if (parts.length < 2) return raw.trim()
  const left = parts[0].trim()
  const right = parts.slice(1).join(' — ').trim()
  const norm = (v: string) =>
    v.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  if (left && right && norm(left) === norm(right)) return left
  return raw.trim()
}

export function titleCaseWords(phrase: string): string {
  const small = new Set(['a', 'an', 'the', 'for', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'by', 'with', 'from'])
  return phrase
    .split(/\s+/)
    .map((w, i) => (i > 0 && small.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

const KNOWN_FM_KEYS = new Set([
  'title',
  'content_type',
  'contentType',
  'contenttype',
  'primaryKeyword',
  'description',
  'metaDescription',
  'region',
  'canonicalUrl',
  'canonical',
  'robots',
  'ogImage',
  'og:image',
  'image',
  'date',
  'ownerHost',
  'ownerhost',
  'slug',
  'layout',
])

const FM_KEY_SPLIT_RE = new RegExp(
  `(?:^|\\s)(${[...KNOWN_FM_KEYS].sort((a, b) => b.length - a.length).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}):\\s*`,
  'gi',
)

function canonicalizeFmKey(key: string): string {
  const k = key.trim()
  if (/^contenttype$/i.test(k)) return 'content_type'
  if (/^ownerhost$/i.test(k)) return 'ownerHost'
  if (k === 'metaDescription') return 'description'
  if (k === 'og:image') return 'ogImage'
  if (k === 'canonical') return 'canonicalUrl'
  return k
}

export function splitCollapsedYamlLine(line: string): Record<string, string> | null {
  const trimmed = String(line || '')
    .trim()
    .replace(/^---\s*/, '')
    .replace(/\s*---\s*$/, '')
  if (!trimmed) return null
  FM_KEY_SPLIT_RE.lastIndex = 0
  const hits: Array<{ key: string; valueStart: number; matchStart: number }> = []
  let m: RegExpExecArray | null
  while ((m = FM_KEY_SPLIT_RE.exec(trimmed)) !== null) {
    hits.push({
      key: canonicalizeFmKey(m[1]),
      valueStart: m.index + m[0].length,
      matchStart: m.index,
    })
  }
  if (hits.length < 2) return null
  const out: Record<string, string> = {}
  for (let i = 0; i < hits.length; i++) {
    const end = i + 1 < hits.length ? hits[i + 1].matchStart : trimmed.length
    const val = trimmed.slice(hits[i].valueStart, end).trim()
    if (val) out[hits[i].key] = val
  }
  return Object.keys(out).length >= 2 ? out : null
}

export function peelCollapsedFrontmatter(content: string): string {
  const raw = String(content || '')
  const start = raw.match(/^\s*/)?.[0] ?? ''
  const rest = raw.slice(start.length)
  const nl = rest.search(/\r?\n/)
  const firstLine = nl === -1 ? rest : rest.slice(0, nl)
  const fields = splitCollapsedYamlLine(firstLine)
  if (!fields) return raw
  const body = nl === -1 ? '' : rest.slice(nl).replace(/^\r?\n+/, '')
  const fm = Object.entries(fields).map(([k, v]) => stringifyFmValue(k, v)).join('\n')
  return `---\n${fm}\n---\n\n${body}`
}

function parseSimpleFm(body: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const m = trimmed.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/)
    if (!m) continue
    let key = m[1]
    let val = m[2].trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    key = canonicalizeFmKey(key)
    out[key] = val
  }
  return out
}

function stringifyFmValue(key: string, value: string): string {
  if (value === '') return `${key}: ""`
  const needsQuotes =
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r') ||
    value.startsWith(' ') ||
    value.endsWith(' ') ||
    /^:/.test(value) ||
    /:\s/.test(value)
  return `${key}: ${needsQuotes ? JSON.stringify(value) : value}`
}

function deriveDescription(body: string, title: string, primaryKeyword: string): string {
  const plain = body
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/^#+\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  let desc = plain.slice(0, 155).trim()
  if (desc.length < 70) {
    desc = `${title} — practical guidance on ${primaryKeyword || title}. Editorial only; not legal advice.`
  }
  desc = desc.slice(0, 160).trim()
  if (desc.length > 155) {
    desc = desc.slice(0, 155).replace(/\s+\S*$/, '') + '…'
  }
  if (desc.length < 70) {
    desc = (desc + ' Verify every rule against official government sources before you apply.').slice(0, 160)
  }
  return desc
}

function cleanLeakedYaml(body: string): string {
  body = body.replace(/\n?---\r?\n[\s\S]*?\r?\n---\r?\n?/g, '\n\n')
  const lines = body.split(/\r?\n/)
  let i = 0
  while (i < lines.length) {
    const trimmed = lines[i].trim()
    if (trimmed === '') {
      i++
      continue
    }
    if (trimmed === '---') {
      i++
      continue
    }
    const m = trimmed.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/)
    if (m && KNOWN_FM_KEYS.has(m[1])) {
      i++
      continue
    }
    break
  }
  if (i > 0) body = lines.slice(i).join('\n')
  return body.replace(/\n{3,}/g, '\n\n').trim()
}

export function sanitizeFrontmatter(content: string): string {
  const raw = peelCollapsedFrontmatter(
    String(content || '')
      .replace(/\bKEEP---+/gi, '---')
      .replace(/\bKEEP(?=<script\b)/gi, '')
      .replace(/\bKEEP(?=&lt;script\b)/gi, ''),
  ).trim()
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  const fields: Record<string, string> = fmMatch ? parseSimpleFm(fmMatch[1]) : {}
  let body = fmMatch ? raw.slice(fmMatch.index + fmMatch[0].length) : raw
  body = cleanLeakedYaml(body)
  body = sanitizeLeakedMarkup(body)

  const title = fields.title || (body.match(/^#\s+(.+)$/m) || [])[1] || 'Guide'
  const pk = fields.primaryKeyword || ''

  if (!fields.content_type) {
    fields.content_type = /\/blog\//i.test(String(fields.canonicalUrl || fields.canonical || ''))
      ? 'blog_post'
      : 'article'
  }
  if (!fields.robots) fields.robots = 'index,follow'
  if (!fields.ogImage) fields.ogImage = '/og-image.png'

  if (!fields.description || fields.description.length < 70 || fields.description.length > 160) {
    fields.description = deriveDescription(body, title, pk)
  }

  fields.description = fields.description
    .replace(/[\n\r]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (fields.description.length > 160) {
    fields.description = fields.description.slice(0, 157).replace(/\s+\S*$/, '') + '…'
  }
  if (fields.description.length < 70) {
    fields.description = (fields.description + ' Check official guidance before applying.').slice(0, 160)
  }

  fields.title = title

  const orderedKeys = ['title', 'content_type', 'primaryKeyword', 'region', 'description', 'canonicalUrl', 'robots', 'ogImage']
    .filter((k) => fields[k] !== undefined && fields[k] !== '')
  for (const k of Object.keys(fields)) {
    if (!orderedKeys.includes(k)) orderedKeys.push(k)
  }

  const fmOut = orderedKeys.map((k) => stringifyFmValue(k, fields[k])).join('\n')
  return `---\n${fmOut}\n---\n\n${body.trim()}\n`
}
