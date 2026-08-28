/**
 * JSON-LD belongs in the site template (from frontmatter / article meta),
 * never as a markdown-body <script>. Regional markdown renderers print
 * script tags as visible text — 2026-08 Austin cost-of-living leak.
 *
 * Strip-on-ingest + fail-closed gate: Content Studio approve/ship must
 * refuse any body that still contains raw <script>, application/ld+json,
 * or a visible schema.org blob.
 */

export const JSONLD_IN_BODY_CODE = 'jsonld-in-body'

const SCRIPT_BLOCK_RE = /<script\b[^>]*>[\s\S]*?(?:<\/script>|$)/gi
const ESCAPED_SCRIPT_RE = /&lt;script\b[\s\S]*?(?:&lt;\/script&gt;|$)/gi
const LD_JSON_TOKEN_RE = /application\/ld\+json/i
const SCRIPT_OPEN_RE = /<script\b|&lt;script\b/i
const SCHEMA_BLOB_RE = /\{\s*["']@context["']\s*:\s*["']https?:\/\/schema\.org/i
const FENCED_RE = /```(?:html|json|jsonld|ld\+json)?[^\n]*\n[\s\S]*?```/gi

function splitFrontMatter(content: string): { fm: string; body: string; hasFm: boolean } {
  const m = String(content || '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!m) return { fm: '', body: String(content || ''), hasFm: false }
  return { fm: m[1], body: m[2], hasFm: true }
}

function stripRawSchemaBlobs(input: string): string {
  let s = input
  for (let n = 0; n < 24; n++) {
    const start = s.search(SCHEMA_BLOB_RE)
    if (start < 0) break
    let depth = 0
    let end = -1
    for (let j = start; j < s.length; j++) {
      const ch = s[j]
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) {
          end = j + 1
          break
        }
      }
    }
    s = end > start ? s.slice(0, start) + s.slice(end) : s.slice(0, start)
  }
  return s
}

function stripFencedJsonLd(input: string): string {
  return input.replace(FENCED_RE, (block) => {
    if (LD_JSON_TOKEN_RE.test(block) || SCRIPT_OPEN_RE.test(block) || SCHEMA_BLOB_RE.test(block)) {
      return ''
    }
    return block
  })
}

/** Body-only sanitizer (front matter already stripped). */
export function stripLeakedJsonLdFromBody(body: string): { body: string; stripped: boolean } {
  const before = String(body || '')
  let next = before
    .replace(SCRIPT_BLOCK_RE, '')
    .replace(ESCAPED_SCRIPT_RE, '')
  next = stripFencedJsonLd(next)
  next = stripRawSchemaBlobs(next)
  next = next.replace(/\n{3,}/g, '\n\n').trim()
  return { body: next, stripped: next !== before.trim() && next !== before }
}

/**
 * Strip leaked JSON-LD / script blocks from a full markdown document,
 * preserving YAML front matter (including a jsonLd: field if present).
 */
export function stripLeakedJsonLd(content: string): { content: string; stripped: boolean } {
  const { fm, body, hasFm } = splitFrontMatter(content)
  const result = stripLeakedJsonLdFromBody(body)
  if (!result.stripped) return { content: String(content || ''), stripped: false }
  const next = hasFm ? `---\n${fm}\n---\n\n${result.body}\n` : `${result.body}\n`
  return { content: next, stripped: true }
}

/** True when the markdown BODY (not front matter) would leak schema as visible text. */
export function bodyContainsLeakedJsonLd(content: string): boolean {
  const { body } = splitFrontMatter(content)
  if (SCRIPT_OPEN_RE.test(body)) return true
  if (LD_JSON_TOKEN_RE.test(body)) return true
  if (SCHEMA_BLOB_RE.test(body)) return true
  return false
}
