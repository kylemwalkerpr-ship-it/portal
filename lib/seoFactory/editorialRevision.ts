import { isEditorPatchShape, parseEditorPatch } from './editorPatch'
import { splitMarkdownFrontmatter } from '../harperText'

export type EditorialRevision = {
  version: 2
  mode: 'document' | 'sections'
  document?: string
  sections?: Array<{ heading: string; replacement: string }>
  appliedIds: string[]
  waivedIds: Array<{ id: string; reason: string }>
}

export type ApplyEditorialRevisionResult = {
  content: string
  clean: boolean
  appliedIds: string[]
  waivedIds: Array<{ id: string; reason: string }>
}

export type ParseEditorialRevisionResult =
  | { ok: true; revision: EditorialRevision }
  | { ok: false; fallback: 'v1' }
  | { ok: false; reason: string }

const FACT_TOKEN_RE = /https?:\/\/[^\s)]+|\b\d[\w.,%/-]*|\b(?:must|not|never|may|cannot|unless)\b/gi
const URL_RE = /https?:\/\/[^\s)]+/gi
const DISCLAIMER_RE = /(?:^|\n)#+\s+disclaimer\b|\*{0,2}disclaimer\*{0,2}\s*:/i

function normalizeUrlToken(url: string): string {
  return url.replace(/[.,;:!?]+$/g, '').toLowerCase()
}

function normalizeFactToken(token: string): string {
  if (/^https?:\/\//i.test(token)) return normalizeUrlToken(token)
  return token.replace(/[.,;:!?]+$/g, '').toLowerCase()
}

export function editorialFactTokens(text: string): string[] {
  return String(text || '').match(FACT_TOKEN_RE) || []
}

export function editorialFactTokenSet(text: string): Set<string> {
  return new Set(editorialFactTokens(text).map(normalizeFactToken))
}

/** True when the after text lost a URL, number, or legal qualifier present in before. */
export function editorialFactsShrank(before: string, after: string): boolean {
  const afterSet = editorialFactTokenSet(after)
  for (const token of editorialFactTokenSet(before)) {
    if (!afterSet.has(token)) return true
  }
  return false
}

export function editorialInventedUrls(before: string, after: string): string[] {
  const original = new Set((String(before || '').match(URL_RE) || []).map(normalizeUrlToken))
  const seen = new Set<string>()
  const invented: string[] = []
  for (const raw of String(after || '').match(URL_RE) || []) {
    const key = normalizeUrlToken(raw)
    if (!key || seen.has(key)) continue
    seen.add(key)
    if (!original.has(key)) invented.push(raw.replace(/[.,;:!?]+$/g, ''))
  }
  return invented
}

export function editorialHasDisclaimer(text: string): boolean {
  return DISCLAIMER_RE.test(String(text || ''))
}

function extractJsonValue(raw: string): unknown {
  const text = String(raw || '').trim()
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch { /* fall through */ }
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) {
    try {
      return JSON.parse(fence[1].trim())
    } catch { /* fall through */ }
  }
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1))
    } catch { /* fall through */ }
  }
  return undefined
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((v) => String(v || '').trim()).filter(Boolean)
}

function asWaived(value: unknown): Array<{ id: string; reason: string }> {
  if (!Array.isArray(value)) return []
  const out: Array<{ id: string; reason: string }> = []
  for (const item of value) {
    if (typeof item === 'string' && item.trim()) {
      out.push({ id: item.trim(), reason: 'waived' })
      continue
    }
    if (item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string') {
      const id = String((item as { id: string }).id || '').trim()
      if (!id) continue
      out.push({
        id,
        reason: String((item as { reason?: unknown }).reason || 'waived').slice(0, 240),
      })
    }
  }
  return out
}

function isEditorialRevisionShape(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (v.version !== 2) return false
  const mode = v.mode
  if (mode != null && mode !== 'document' && mode !== 'sections') return false
  if (v.document != null && typeof v.document !== 'string') return false
  if (v.sections != null && !Array.isArray(v.sections)) return false
  if (mode === 'sections' && !Array.isArray(v.sections) && typeof v.document !== 'string') return false
  return typeof v.document === 'string' || Array.isArray(v.sections) || mode === 'document' || mode === 'sections'
}

function normalizeRevision(value: Record<string, unknown>): EditorialRevision {
  const mode: EditorialRevision['mode'] = value.mode === 'sections' ? 'sections' : 'document'
  const sections = Array.isArray(value.sections)
    ? value.sections
      .map((s) => {
        if (!s || typeof s !== 'object') return null
        const row = s as { heading?: unknown; replacement?: unknown }
        if (typeof row.heading !== 'string' || typeof row.replacement !== 'string') return null
        return { heading: row.heading, replacement: row.replacement }
      })
      .filter((s): s is { heading: string; replacement: string } => Boolean(s))
    : undefined
  return {
    version: 2,
    mode,
    document: typeof value.document === 'string' ? value.document : undefined,
    sections,
    appliedIds: asStringArray(value.appliedIds),
    waivedIds: asWaived(value.waivedIds),
  }
}

export function parseEditorialRevision(raw: string): ParseEditorialRevisionResult {
  const value = extractJsonValue(raw)
  if (value && isEditorialRevisionShape(value)) {
    return { ok: true, revision: normalizeRevision(value) }
  }
  if (value && isEditorPatchShape(value)) {
    return { ok: false, fallback: 'v1' }
  }
  const v1 = parseEditorPatch(String(raw || ''))
  if (v1.ok) return { ok: false, fallback: 'v1' }
  return { ok: false, reason: 'Editorial revision is not valid EditorialRevision v2 JSON' }
}

function normalizeHeading(text: string): string {
  return String(text || '').replace(/^#+\s*/, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

type H2Block = { heading: string; block: string }

function splitH2Blocks(body: string): { preamble: string; blocks: H2Block[] } {
  const lines = String(body || '').split('\n')
  const blocks: H2Block[] = []
  const preambleLines: string[] = []
  let current: { heading: string; lines: string[] } | null = null
  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+?)\s*$/)
    if (h2) {
      if (current) blocks.push({ heading: current.heading, block: current.lines.join('\n') })
      current = { heading: h2[1].trim(), lines: [line] }
      continue
    }
    if (current) current.lines.push(line)
    else preambleLines.push(line)
  }
  if (current) blocks.push({ heading: current.heading, block: current.lines.join('\n') })
  return { preamble: preambleLines.join('\n'), blocks }
}

function applySectionReplacements(body: string, sections: Array<{ heading: string; replacement: string }>): string {
  const { preamble, blocks } = splitH2Blocks(body)
  const next = blocks.map((b) => ({ ...b }))
  for (const section of sections) {
    const want = normalizeHeading(section.heading)
    const idx = next.findIndex((b) => normalizeHeading(b.heading) === want)
    if (idx < 0) throw new Error(`Editorial revision section not found: ${section.heading}`)
    const replacement = String(section.replacement || '')
    if (/^##\s+/.test(replacement.trim())) {
      next[idx] = { heading: section.heading, block: replacement.replace(/\s+$/, '') }
    } else {
      const headingLine = next[idx].block.split('\n')[0] || `## ${next[idx].heading}`
      next[idx] = { heading: next[idx].heading, block: `${headingLine}\n\n${replacement}`.replace(/\s+$/, '') }
    }
  }
  const parts = [preamble, ...next.map((b) => b.block)].filter((p, i) => i === 0 || p.length > 0)
  return parts.join('\n').replace(/\n{3,}/g, '\n\n')
}

function assertFactsPreserved(before: string, after: string): void {
  const invented = editorialInventedUrls(before, after)
  if (invented.length) {
    throw new Error(`Editorial revision introduced a URL that was not in the original: ${invented[0]}`)
  }
  if (editorialFactsShrank(before, after)) {
    throw new Error('Editorial revision dropped a URL, number or legal qualification')
  }
  if (editorialHasDisclaimer(before) && !editorialHasDisclaimer(after)) {
    throw new Error('Editorial revision removed the disclaimer heading or block')
  }
}

function coveredIds(revision: EditorialRevision): Set<string> {
  const ids = new Set(revision.appliedIds)
  for (const row of revision.waivedIds) ids.add(row.id)
  return ids
}

export function applyEditorialRevision(
  content: string,
  revision: EditorialRevision,
  opts: { mustApplyIds: string[]; protectFacts?: boolean } = { mustApplyIds: [] },
): ApplyEditorialRevisionResult {
  const original = String(content || '')
  const mustApplyIds = (opts.mustApplyIds || []).filter(Boolean)
  const protectFacts = opts.protectFacts !== false
  const appliedIds = [...revision.appliedIds]
  const waivedIds = [...revision.waivedIds]
  const document = String(revision.document || '')
  const sections = revision.sections || []
  const emptyDocument = revision.mode === 'sections' ? sections.length === 0 : document.trim().length === 0

  if (emptyDocument && appliedIds.length === 0 && mustApplyIds.length > 0) {
    throw new Error('Editorial revision is empty while required Harper directives remain')
  }

  const covered = coveredIds(revision)
  const missing = mustApplyIds.filter((id) => !covered.has(id))
  if (missing.length) {
    throw new Error(`Editorial revision did not cover required directive ${missing[0]}`)
  }

  if (emptyDocument && appliedIds.length === 0) {
    return { content: original, clean: true, appliedIds, waivedIds }
  }

  const { fm, body } = splitMarkdownFrontmatter(original)
  let nextBody: string
  if (revision.mode === 'sections') {
    if (!sections.length) throw new Error('Editorial revision sections are empty')
    nextBody = applySectionReplacements(body, sections)
  } else {
    if (!document.trim()) throw new Error('Editorial revision document is empty')
    const { body: rewritten } = splitMarkdownFrontmatter(document)
    nextBody = rewritten
  }
  const next = fm ? `${fm}${nextBody}` : nextBody
  if (protectFacts) assertFactsPreserved(original, next)
  return { content: next, clean: false, appliedIds, waivedIds }
}
