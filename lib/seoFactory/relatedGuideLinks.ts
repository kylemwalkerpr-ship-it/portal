/**
 * Deterministic `unlinked_related_guide` repair.
 *
 * The quality gate (contentQualityGate.auditReferenceReachability) blocks any
 * draft whose `## Related guides`-style sections name a guide as plain text
 * instead of a clickable Markdown link. The only safe, non-inventing way to
 * clear that blocker is to re-link a plain-text entry to a VERIFIED live
 * estate URL — never to manufacture a destination.
 *
 * This module is the pure, unit-testable core of that repair:
 *
 *  - Matching is normalized: punctuation (em dashes, commas) and markdown
 *    emphasis are collapsed, so the comma-mangled label the em-dash cleanup
 *    leaves behind still matches its canonical anchor.
 *  - Matching is UNIQUE: a label that maps to more than one distinct verified
 *    URL is ambiguous and stays a blocker — we never guess which guide was
 *    meant.
 *  - No-match entries stay plain text (still a blocker).
 *  - Only reference-style sections are touched; headings, bullets, numbering,
 *    prose, citations, and already-linked items are preserved verbatim.
 *
 * Verified URLs are caller-supplied (the re-audit flow passes the live sitemap
 * set it already fetched). When no verified set is available the documented
 * static anchors (ESTATE_ANCHOR_LINKS, every entry confirmed live) are used.
 */
import { ESTATE_ANCHOR_LINKS } from './linkAudit'

export interface VerifiedRelatedGuideAnchor {
  label: string
  url: string
}

/** Plain-text adverbials the sentence-rhythm pass previously glued onto a
 *  link-only list item ("In this case, [Guide](url)"). Stripped before match. */
const LEADING_ADVERBIAL_RE =
  /^(?:In practice|For applicants|In this case|As a result|On review|Typically|Meanwhile|On the ground)\s*,\s*/i

/** Reference-section headings the gate flags as `unlinked_related_guide`. */
const REF_SECTION_RE =
  /^##\s+(related guides?|related reading|related resources|further reading|see also)\s*$/i

const LIST_ITEM_RE = /^(\s*(?:[-*+]|\d+[.)])\s+)(.*)$/
const MARKDOWN_LINK_RE = /\[[^\]]+\]\([^)]+\)/
const HTML_LINK_RE = /<a\b[^>]*href/i
const BARE_URL_RE = /(?:https?:\/\/|www\.)\S+/i

/** Collapse punctuation/emphasis to plain lowercase words for matching. */
export function normalizeGuideLabel(s: string): string {
  return String(s || '')
    .replace(/\*\*/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase()
}

function isPlainTextEntry(text: string): boolean {
  if (!text) return false
  if (MARKDOWN_LINK_RE.test(text)) return false
  if (HTML_LINK_RE.test(text)) return false
  // A bare URL is its own blocker (`bare_url_not_hyperlinked`); never treat a
  // URL as a relinkable guide label.
  if (BARE_URL_RE.test(text)) return false
  return true
}

/**
 * Re-link plain-text Related-guides entries to the single verified URL whose
 * normalized label uniquely matches them.
 *
 * Returns the repaired document plus counts so callers can report the repair
 * (`estate_labels_relinked (n)`) and a diagnostic of what stayed blocked.
 */
export function relinkPlainTextRelatedGuides(
  content: string,
  anchors: readonly VerifiedRelatedGuideAnchor[],
): { content: string; relinked: number; ambiguous: number; unmatched: number } {
  // Normalized label → distinct verified URLs. `byKey` uses a Set of URLs so
  // the SAME label+URL repeated across regions is still a single destination.
  const byKey = new Map<string, Set<string>>()
  for (const anchor of anchors) {
    if (!anchor || !anchor.label || !anchor.url) continue
    const key = normalizeGuideLabel(anchor.label)
    if (!key) continue
    if (!byKey.has(key)) byKey.set(key, new Set())
    byKey.get(key)!.add(anchor.url.trim())
  }
  const canonicalByKey = new Map<string, VerifiedRelatedGuideAnchor>()
  for (const anchor of anchors) {
    if (!anchor || !anchor.label || !anchor.url) continue
    const key = normalizeGuideLabel(anchor.label)
    if (!key) continue
    if (!canonicalByKey.has(key)) canonicalByKey.set(key, anchor)
  }

  let relinked = 0
  let ambiguous = 0
  let unmatched = 0
  let inRefSection = false
  const lines = content.split('\n').map((line) => {
    if (/^##\s+/.test(line)) {
      inRefSection = REF_SECTION_RE.test(line.trim())
      return line
    }
    if (!inRefSection) return line
    const item = line.match(LIST_ITEM_RE)
    if (!item) return line
    const text = item[2].trim()
    if (!isPlainTextEntry(text)) return line
    const bare = text.replace(LEADING_ADVERBIAL_RE, '')
    const key = normalizeGuideLabel(bare)
    if (!key) return line
    const urls = byKey.get(key)
    if (!urls || urls.size === 0) {
      unmatched++
      return line
    }
    if (urls.size > 1) {
      ambiguous++
      return line
    }
    const [url] = urls
    const canonical = canonicalByKey.get(key)
    const label = canonical != null && canonical.url.trim() === url ? canonical.label : bare
    relinked++
    return `${item[1]}[${label}](${url})`
  })
  return { content: lines.join('\n'), relinked, ambiguous, unmatched }
}

function normalizeUrl(url: string): string {
  return String(url || '').trim().replace(/\/+$/, '').toLowerCase()
}

/**
 * Resolve the verified anchor set for a repair call.
 *
 * `verifiedUrls` is the live estate URL set already fetched by the re-audit
 * flow (live sitemap). Anchors whose URL is NOT in that set are dropped so we
 * never re-link a label to an unverified destination. When the live set is
 * empty or contains none of the documented anchors (sitemap failure / a
 * sitemap that only lists leaf pages), the documented static anchors — every
 * entry confirmed HTTP 200 — are used rather than disabling the repair.
 */
export function resolveVerifiedEstateAnchors(
  verifiedUrls?: Set<string> | string[] | null,
): VerifiedRelatedGuideAnchor[] {
  const all = Object.values(ESTATE_ANCHOR_LINKS).flat()
  if (!verifiedUrls) return all
  const urls = Array.isArray(verifiedUrls) ? verifiedUrls : Array.from(verifiedUrls)
  if (urls.length === 0) return all
  const set = new Set<string>(urls.map(normalizeUrl))
  const filtered = all.filter((anchor) => set.has(normalizeUrl(anchor.url)))
  return filtered.length > 0 ? filtered : all
}