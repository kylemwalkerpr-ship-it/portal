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
  '9. `## Related guides` — 2–3 verified estate links.',
  '10. Short educational disclaimer.',
].join('\n')

/** Response-format rules appended to every editor/reviewer fix prompt. */
export function editorResponseContract(): string {
  return [
    '',
    '## FORMAT PRESERVATION CONTRACT (violations are rejected mechanically)',
    '- Return ONLY the complete corrected article as raw markdown. No preamble, no closing remarks, no explanations.',
    '- NEVER wrap the article (or any part of it) in ``` code fences.',
    '- NEVER add your own YAML frontmatter, JSON-LD <script> blocks, or metadata unless that exact block already exists in the input. If the input starts with a `---` frontmatter block, return it unchanged at the top.',
    '- Preserve the existing structure exactly: same H1, same H2/### heading text and levels, same section order, same bullet (`- `) and numbered (`1. `) markers, same table pipes — except the specific lines a listed finding requires you to change.',
    '- Keep every list item on its own line. Never merge list items into a paragraph, and never split a paragraph into fake list items.',
    '- Do not reorder, rename, merge, or split sections.',
    '- Keep all facts, citations, and interlinks that are not flagged.',
  ].join('\n')
}

/** Full contract text for the briefing + drafting stages. */
export function formatContractBriefBlock(): string {
  return [
    '## DOCUMENT FORMAT CONTRACT (the layout below is the product — write INTO it)',
    FORMAT_SKELETON,
    '',
    '- The reader scrolls: every H2 opens with a direct 1–3 sentence answer, then detail.',
    '- Reader-engagement devices required: at least one scannable checklist or table,',
    '  short paragraphs (1–3 sentences), bolded lead phrases on long list items,',
    '  blockquote callouts for warnings, and self-contained FAQ answers.',
    '- Formatting is graded: broken lists, collapsed bullets, or a keyword-only title',
    '  fail the audit exactly like a missing section.',
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

/**
 * Deterministic normalizer for ANY AI-returned document (editor fixes,
 * reviewer sweeps, refine passes). Reverses the mechanical mangling models
 * introduce when they return "the complete article":
 *   - whole-reply code fences,
 *   - chatter lines before the document starts,
 *   - YAML frontmatter embedded mid-body (moved to top; duplicate copies dropped),
 *   - invalid/empty-context JSON-LD scripts dropped,
 *   - "In 60 seconds" bullets collapsed onto one line re-split,
 *   - Sources sections with duplicated entries deduplicated,
 *   - 3+ blank lines collapsed.
 */
export function normalizeEditorDocument(raw: string): NormalizeResult {
  const fixed: string[] = []
  let s = String(raw || '')

  // 1. Whole-reply code fence (```markdown ... ``` / ```md ... ```)
  const fenced = s.trim().match(/^```(?:markdown|md|mdx)?[ \t]*\r?\n([\s\S]*?)\r?\n?```[ \t]*$/i)
  if (fenced && fenced[1].trim()) {
    s = fenced[1]
    fixed.push('editor_fence_unwrapped')
  }

  // 2. Chatter before the document starts ("Here is the corrected article:")
  const docStart = s.search(/^(---|\#\s|<script\b)/m)
  if (docStart > 0) {
    const preamble = s.slice(0, docStart).trim()
    // Only strip when the preamble is short chatter, not real content.
    if (preamble.length < 400 && !/^#/m.test(preamble)) {
      s = s.slice(docStart)
      fixed.push('editor_preamble_stripped')
    }
  }

  // 3. Frontmatter: keep the FIRST block at position 0; drop embedded copies.
  const fmBlocks: Array<{ start: number; end: number; body: string }> = []
  const fmRe = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*$/gm
  let m: RegExpExecArray | null
  while ((m = fmRe.exec(s)) !== null) {
    fmBlocks.push({ start: m.index, end: m.index + m[0].length, body: m[1] })
  }
  if (fmBlocks.length > 0 && !s.startsWith('---')) {
    // Frontmatter exists but not at the top → move the first block to the top.
    const first = fmBlocks[0]
    const rest = (s.slice(0, first.start) + s.slice(first.end)).replace(/^\s*\n/, '')
    s = `---\n${first.body.trim()}\n---\n\n${rest.trimStart()}`
    fixed.push('editor_frontmatter_moved_to_top')
  } else if (fmBlocks.length > 1) {
    // Top block + embedded duplicates → drop the embedded copies.
    let out = s
    for (let i = fmBlocks.length - 1; i >= 1; i--) {
      const blk = fmBlocks[i]
      out = out.slice(0, blk.start) + out.slice(blk.end)
    }
    s = out.replace(/\n{3,}/g, '\n\n')
    fixed.push('editor_embedded_frontmatter_dropped')
  }

  // 3b. Remove renderer-leak metadata. Editors sometimes return a complete
  // YAML/schema fragment as a paragraph (`--- title: ...`) after the TOC.
  // Only remove the bounded metadata run, stopping at the next real heading
  // or at the first prose line after the schema fragment; never consume the
  // article body.
  // Only strip INLINE metadata fragments where `--- title:` appears on the
  // same line. A real top-of-document frontmatter block uses `---` on its own
  // line followed by `title:` on the next line, and must NOT be swallowed here.
  const inlineFm = /(?:^|\n)\s*--- title:\s+[\s\S]*?(?=\n\s*(?:##?\s|Cross[‑-]border|[A-Z][^\n]{0,80}\n))/i
  if (inlineFm.test(s)) {
    s = s.replace(inlineFm, '\n')
    fixed.push('editor_inline_frontmatter_dropped')
  }
  const inlineSchemaLines = s.split('\n')
  let inlineSchemaRemoved = 0
  let inScript = false
  for (let i = 0; i < inlineSchemaLines.length; i++) {
    const line = inlineSchemaLines[i]
    const trimmed = line.trim()
    if (/<script\b/i.test(line)) inScript = true
    if (inScript) {
      if (/<\/script>/i.test(line)) inScript = false
      continue
    }
    // Only remove a single-line JSON object clearly identified as schema.
    // Multiline JSON-LD is handled by the complete <script> block pass below.
    if (/^\{.*["']?@context["']?\s*:\s*["']?.*schema\.org.*["']?@type["']?\s*:/i.test(trimmed)) {
      inlineSchemaLines[i] = ''
      inlineSchemaRemoved++
    }
  }
  if (inlineSchemaRemoved) {
    s = inlineSchemaLines.join('\n')
    fixed.push(`editor_inline_schema_dropped (${inlineSchemaRemoved})`)
  }

  // 4. Invalid JSON-LD scripts (unparseable, empty context, no @type).
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

  // 5. "In 60 seconds" bullets collapsed onto one line ("a. - b. - c.").
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

  // 6. Sources sections: dedupe repeated entries (linked or plain) by label text.
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

  // 7. Whitespace hygiene.
  const cleaned = s.replace(/\n{3,}/g, '\n\n').trim()
  if (cleaned !== s.trim()) fixed.push('whitespace_normalized')
  s = cleaned

  return { content: s, fixed }
}

/**
 * True when the title carries no more information than the primary keyword
 * (case/punctuation-insensitive). "admissions consultant credentials" for the
 * keyword "admissions consultant credentials" → keyword-only title.
 */
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

/**
 * Collapse a duplicated em-dash title ("opt application — opt application")
 * to one phrase. Live regression: the merged OPT page shipped with an H1 that
 * repeated the same phrase on both sides of an em dash.
 */
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

/** Title Case helper for synthesized titles. */
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
])

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
    if (key === 'metaDescription') key = 'description'
    if (key === 'og:image') key = 'ogImage'
    if (key === 'canonical') key = 'canonicalUrl'
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
  // Drop any complete frontmatter-like blocks that leaked into the body.
  body = body.replace(/\n?---\r?\n[\s\S]*?\r?\n---\r?\n?/g, '\n\n')
  // Drop leading lines that look like known frontmatter keys (and any stray ---).
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

/**
 * Canonical frontmatter sanitizer. Guarantees exactly one `---\n...\n---`
 * block at the top of the document, a single-line description between 70 and
 * 160 characters, and a body with no leaked YAML tokens.
 *
 * Call this at the end of every deterministic repair and every AI fix pass
 * so the renderer never ships a mangled nested-YAML header.
 */
export function sanitizeFrontmatter(content: string): string {
  const raw = String(content || '').trim()
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  const fields: Record<string, string> = fmMatch ? parseSimpleFm(fmMatch[1]) : {}
  let body = fmMatch ? raw.slice(fmMatch.index + fmMatch[0].length) : raw
  body = cleanLeakedYaml(body)

  const title = fields.title || (body.match(/^#\s+(.+)$/m) || [])[1] || 'Guide'
  const pk = fields.primaryKeyword || ''

  if (!fields.content_type) fields.content_type = 'article'
  if (!fields.robots) fields.robots = 'index,follow'
  if (!fields.ogImage) fields.ogImage = '/og-image.png'

  if (!fields.description || fields.description.length < 70 || fields.description.length > 160) {
    fields.description = deriveDescription(body, title, pk)
  }

  // Final description hardening: single line, bounded.
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
