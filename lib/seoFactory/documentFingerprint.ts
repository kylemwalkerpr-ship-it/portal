/**
 * Structural preservation fingerprint (implementation brief §5.4).
 *
 * Pure, deterministic module parsed from Markdown — not fragile regex-only
 * matching. Captures the normalized structure of an accepted document (H1,
 * heading sequence, canonical skeleton sections, frontmatter key set, links,
 * citations, schema block types, list volume, body volume) with a stable
 * hash per item, and reports the invariants an AI edit must preserve.
 *
 * Milestone B scope: shadow mode. Nothing in production changes the accepted
 * draft based on this module yet — the reaudit route records would-reject
 * reasons for the bounded loop transcript.
 */

export type FingerprintHeading = { level: number; text: string }

export type FingerprintLink = { url: string; anchor: string; line: string }

export type DocumentFingerprint = {
  h1: string | null
  headings: FingerprintHeading[]
  skeleton: string[]
  frontmatterKeys: string[]
  links: FingerprintLink[]
  citations: string[]
  schemaTypes: string[]
  listItems: number
  bodyWords: number
  hash: string
}

export type PreservationViolation = { invariant: string; detail: string }

/** Canonical structural sections, in the order the skeleton requires. */
const SKELETON_SECTIONS: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: 'In 60 seconds', re: /^in 60 seconds$|^tldr$|^tl;?dr$|^quick answer$|^key takeaways$/ },
  { name: 'TOC', re: /^(table of contents|on this page)$/ },
  { name: 'FAQ', re: /^faq\b|^frequently asked questions/ },
  { name: 'Sources', re: /^sources\b|^references\b|^official sources\b/ },
  { name: 'Related guides', re: /^related guides?\b/ },
]

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/
const JSONLD_RE = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
const MARKDOWN_LINK_RE = /\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/
const LIST_ITEM_RE = /^\s*(?:[-*+]|\d+[.)])\s+/

/** Stable, dependency-free hash (FNV-1a 32-bit, hex). */
export function textHash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

export function normalizeHeadingText(text: string): string {
  return text.toLowerCase().replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim()
}

function extractFrontmatterKeys(content: string): string[] {
  const m = content.match(FRONTMATTER_RE)
  if (!m) return []
  const keys: string[] = []
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':')
    if (i > 0 && !line.startsWith(' ') && !line.startsWith('#')) keys.push(line.slice(0, i).trim())
  }
  return keys
}

function extractSchemaTypes(content: string): string[] {
  const types: string[] = []
  for (const m of content.matchAll(JSONLD_RE)) {
    try {
      const parsed = JSON.parse(m[1]) as { '@type'?: unknown; '@graph'?: Array<{ '@type'?: unknown }> }
      if (Array.isArray(parsed['@graph'])) {
        for (const node of parsed['@graph']) {
          if (typeof node['@type'] === 'string') types.push(node['@type'])
        }
      } else if (typeof parsed['@type'] === 'string') {
        types.push(parsed['@type'])
      }
    } catch {
      types.push('<invalid-json>')
    }
  }
  return types
}

function isEstateHref(url: string): boolean {
  return /yousafeconsultancy\.com|yousafeconsult\.com|^\//i.test(url)
}

/**
 * Compute the structural fingerprint of a markdown document with frontmatter.
 * Deterministic and idempotent: the same input always produces the same hash.
 */
export function computeDocumentFingerprint(content: string): DocumentFingerprint {
  const fmMatch = content.match(FRONTMATTER_RE)
  const bodyStart = fmMatch ? content.indexOf(fmMatch[0]) + fmMatch[0].length : 0
  const body = content.slice(bodyStart)

  let h1: string | null = null
  const headings: FingerprintHeading[] = []
  let listItems = 0
  let bodyWords = 0
  for (const line of body.split('\n')) {
    const hm = line.match(HEADING_RE)
    if (hm) {
      const text = hm[2].trim()
      if (hm[1].length === 1) {
        if (h1 === null) h1 = text
      } else {
        headings.push({ level: hm[1].length, text })
      }
      continue
    }
    if (LIST_ITEM_RE.test(line)) listItems++
    if (!line.trim().startsWith('<') && !line.trim().startsWith('```')) {
      bodyWords += line.split(/\s+/).filter(Boolean).length
    }
  }

  // Record structural sections in DOCUMENT order (deduplicated) so a
  // reordering of skeleton sections is itself a violation.
  const skeleton: string[] = []
  for (const h of headings) {
    if (h.level !== 2) continue
    const hit = SKELETON_SECTIONS.find((s) => s.re.test(normalizeHeadingText(h.text)))
    if (hit && !skeleton.includes(hit.name)) skeleton.push(hit.name)
  }

  const links: FingerprintLink[] = []
  const citations: string[] = []
  for (const line of body.split('\n')) {
    for (const m of line.matchAll(MARKDOWN_LINK_RE)) {
      const anchor = m[1].trim()
      const url = m[2].trim()
      links.push({ url, anchor, line: line.trim() })
      if (/^https?:\/\//i.test(url) && !isEstateHref(url)) citations.push(url)
    }
  }

  const frontmatterKeys = extractFrontmatterKeys(content)
  const schemaTypes = extractSchemaTypes(content)
  const hash = textHash(
    JSON.stringify({
      h1,
      headings: headings.map((h) => [h.level, normalizeHeadingText(h.text)]),
      skeleton,
      frontmatterKeys,
      links: links.map((l) => [l.url, l.anchor]),
      citations: [...new Set(citations)].sort(),
      schemaTypes: [...schemaTypes].sort(),
      listItems,
    }),
  )
  return { h1, headings, skeleton, frontmatterKeys, links, citations, schemaTypes, listItems, bodyWords, hash }
}

export type PreservationOptions = {
  /** Heading texts (normalized) explicitly targeted by a finding — may change. */
  targetedHeadings?: string[]
  /** Anchor lines (trimmed) explicitly targeted — links/citations on them are exempt. */
  targetedAnchors?: string[]
  /** Volume loss tolerance (fraction of before body words). Default 0.6. */
  minVolumeFraction?: number
}

function multisetDelta<T>(before: T[], after: T[], key: (v: T) => string): { removed: T[]; added: T[] } {
  const count = new Map<string, number>()
  for (const v of before) count.set(key(v), (count.get(key(v)) || 0) + 1)
  for (const v of after) count.set(key(v), (count.get(key(v)) || 0) - 1)
  const removed: T[] = []
  const added: T[] = []
  for (const v of before) if ((count.get(key(v)) || 0) > 0) { removed.push(v); count.set(key(v), count.get(key(v))! - 1) }
  for (const v of after) if ((count.get(key(v)) || 0) < 0) { added.push(v); count.set(key(v), count.get(key(v))! + 1) }
  return { removed, added }
}

/**
 * Compare two fingerprints and return every violated preservation invariant
 * (brief §5.4 table). An empty list means the edit is preservable. Targeted
 * findings exempt exactly the anchors they were permitted to touch.
 */
export function fingerprintViolations(
  before: DocumentFingerprint,
  after: DocumentFingerprint,
  opts: PreservationOptions = {},
): PreservationViolation[] {
  const v: PreservationViolation[] = []
  const targetedHeadings = new Set((opts.targetedHeadings || []).map(normalizeHeadingText))
  const targetedAnchors = new Set(opts.targetedAnchors || [])

  // H1 — exactly one; unchanged.
  if ((before.h1 ?? null) !== (after.h1 ?? null)) {
    v.push({ invariant: 'h1', detail: `H1 changed: "${before.h1}" -> "${after.h1}"` })
  }

  // Headings — same levels/text/order except explicitly targeted anchors.
  const bh = before.headings.filter((h) => !targetedHeadings.has(normalizeHeadingText(h.text)))
  const ah = after.headings.filter((h) => !targetedHeadings.has(normalizeHeadingText(h.text)))
  if (bh.length !== ah.length) {
    v.push({ invariant: 'headings', detail: `Heading count changed (${bh.length} -> ${ah.length}) outside targeted anchors` })
  } else {
    for (let i = 0; i < bh.length; i++) {
      if (bh[i].level !== ah[i].level || normalizeHeadingText(bh[i].text) !== normalizeHeadingText(ah[i].text)) {
        v.push({ invariant: 'headings', detail: `Heading ${i + 1} changed: "${bh[i].text}" -> "${ah[i].text}"` })
        break
      }
    }
  }

  // Skeleton — same structural sections present, same order.
  if (before.skeleton.join('|') !== after.skeleton.join('|')) {
    v.push({ invariant: 'skeleton', detail: `Structural sections changed: [${before.skeleton.join(', ')}] -> [${after.skeleton.join(', ')}]` })
  }

  // Frontmatter — key set stable.
  const bk = [...new Set(before.frontmatterKeys)].sort()
  const ak = [...new Set(after.frontmatterKeys)].sort()
  if (bk.join('|') !== ak.join('|')) {
    v.push({ invariant: 'frontmatter', detail: `Frontmatter key set changed: [${bk.join(', ')}] -> [${ak.join(', ')}]` })
  }

  // Links — unflagged URL+anchor unchanged; new links rejected (link invention).
  const beforeLinks = before.links.filter((l) => !targetedAnchors.has(l.line))
  const afterLinks = after.links.filter((l) => !targetedAnchors.has(l.line))
  const linkKey = (l: FingerprintLink) => `${l.url}::${l.anchor}`
  const { removed, added } = multisetDelta(beforeLinks, afterLinks, linkKey)
  for (const l of removed.slice(0, 3)) v.push({ invariant: 'links', detail: `Unflagged link removed: ${l.url}` })
  for (const l of added.slice(0, 3)) v.push({ invariant: 'links', detail: `New link not approved by a targeted finding: ${l.url}` })

  // Citations — approved citations cannot disappear unless targeted.
  const beforeCitations = before.citations.filter((c) => !before.links.some((l) => l.url === c && targetedAnchors.has(l.line)))
  const afterCitations = after.citations.filter((c) => !after.links.some((l) => l.url === c && targetedAnchors.has(l.line)))
  const { removed: removedCitations } = multisetDelta(beforeCitations, afterCitations, (c) => c)
  for (const c of removedCitations.slice(0, 3)) v.push({ invariant: 'citations', detail: `Approved citation removed: ${c}` })

  // Schema — generated/scaffolded; a model must not add/remove schema blocks.
  const bs = [...before.schemaTypes].sort().join('|')
  const as = [...after.schemaTypes].sort().join('|')
  if (bs !== as) v.push({ invariant: 'schema', detail: `JSON-LD schema blocks changed: [${bs}] -> [${as}]` })

  // Lists/tables — no unflagged items removed (collapse detection).
  if (after.listItems < before.listItems) {
    v.push({ invariant: 'lists', detail: `List items removed: ${before.listItems} -> ${after.listItems}` })
  }

  // Volume — retain the existing 40% loss guard.
  const minFraction = opts.minVolumeFraction ?? 0.6
  if (before.bodyWords > 0 && after.bodyWords < before.bodyWords * minFraction) {
    v.push({ invariant: 'volume', detail: `Body words dropped below the loss guard: ${before.bodyWords} -> ${after.bodyWords}` })
  }

  return v
}

/**
 * Shadow-mode check: what WOULD the preservation gate reject about this edit?
 * Records would-reject reasons for the bounded loop transcript without
 * changing the accepted document (Milestone B acceptance).
 */
export function shadowPreservationCheck(
  beforeContent: string,
  afterContent: string,
  opts: PreservationOptions = {},
): { ok: boolean; wouldReject: boolean; violations: PreservationViolation[]; beforeHash: string; afterHash: string } {
  const before = computeDocumentFingerprint(beforeContent)
  const after = computeDocumentFingerprint(afterContent)
  const violations = fingerprintViolations(before, after, opts).slice(0, 20)
  return {
    ok: violations.length === 0,
    wouldReject: violations.length > 0,
    violations,
    beforeHash: before.hash,
    afterHash: after.hash,
  }
}
