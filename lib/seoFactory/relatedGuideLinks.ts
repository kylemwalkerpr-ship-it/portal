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
import { ESTATE_ANCHOR_LINKS, ESTATE_HOSTS } from './linkAudit'

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

const GUIDE_STOP = new Set([
  'the', 'and', 'for', 'with', 'from', 'your', 'application', 'timeline',
  'guide', 'complete', 'related', 'reading', 'resources',
])

/** Collapse punctuation/emphasis to plain lowercase words for matching. */
export function normalizeGuideLabel(s: string): string {
  return String(s || '')
    .replace(/\*\*/g, '')
    .replace(/\bf[-\s]?1\b/gi, 'f1')
    .replace(/\bh[-\s]?1[-\s]?b\b/gi, 'h1b')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase()
}

export function distinctiveGuideTokens(label: string): string[] {
  return normalizeGuideLabel(label)
    .split(/\s+/)
    .filter((t) => (t.length >= 3 || /\d/.test(t)) && t.length >= 2 && !GUIDE_STOP.has(t))
}

function urlPathTokens(url: string): string[] {
  try {
    return new URL(url).pathname.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3)
  } catch {
    return String(url).toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3)
  }
}

function slugLabelFromUrl(url: string): string {
  try {
    const leaf = new URL(url).pathname.split('/').filter(Boolean).pop() || ''
    return leaf.replace(/[-_]+/g, ' ')
  } catch {
    return url
  }
}

/** Unique fuzzy match: distinctive tokens vs label + URL slug. Exact key still wins. */
export function uniqueGuideAnchorMatch(
  label: string,
  anchors: readonly VerifiedRelatedGuideAnchor[],
): VerifiedRelatedGuideAnchor | null {
  const key = normalizeGuideLabel(label)
  if (!key || !anchors.length) return null
  const exact = anchors.filter((a) => normalizeGuideLabel(a.label) === key)
  const exactUrls = new Set(exact.map((a) => a.url.trim()))
  if (exactUrls.size === 1) return exact[0]
  if (exactUrls.size > 1) return null

  const tokens = distinctiveGuideTokens(label)
  if (tokens.length < 1) return null
  let best: VerifiedRelatedGuideAnchor | null = null
  let bestScore = 0
  let ties = 0
  for (const anchor of anchors) {
    const hay = new Set([
      ...distinctiveGuideTokens(anchor.label),
      ...urlPathTokens(anchor.url),
    ])
    let score = 0
    for (const t of tokens) {
      if (hay.has(t) || [...hay].some((h) => h.includes(t) || t.includes(h))) score += 1
    }
    if (score <= 0) continue
    if (score > bestScore) {
      best = anchor
      bestScore = score
      ties = 1
    } else if (score === bestScore && best && best.url.trim() !== anchor.url.trim()) {
      ties += 1
    }
  }
  if (!best || ties > 1) return null
  if (bestScore < Math.min(2, tokens.length)) return null
  return best
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
 * When `removeUnmatched` is true, plain-text entries that match NO verified
 * URL (or map to more than one) are REMOVED instead of left as blockers. This
 * is the deterministic form of the playbook rule: "if no live guide exists
 * for that entry, delete that entry — never leave a guide title as bare
 * text." Removing an unreachable promise loses no reader value and it is the
 * only honest machine path when the review AI is unavailable (quota/credit
 * outage), so a stuck queue cannot wedge forever on an AI-only fix.
 *
 * Never touched: already-linked items, bare URLs (their own blocker is
 * `bare_url_not_hyperlinked`), prose, headings, numbering, citations, and
 * non-reference sections.
 *
 * Returns the repaired document plus counts so callers can report the repair
 * (`estate_labels_relinked (n)`, `unlinked_guide_entries_removed (n)`) and a
 * diagnostic of what stayed blocked.
 */
export function relinkPlainTextRelatedGuides(
  content: string,
  anchors: readonly VerifiedRelatedGuideAnchor[],
  removeUnmatched = false,
): { content: string; relinked: number; ambiguous: number; unmatched: number; removed: number } {
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
  let removed = 0
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
    if (urls && urls.size > 1) {
      ambiguous++
      if (removeUnmatched) {
        removed++
        return ``
      }
      return line
    }
    const matched =
      urls && urls.size === 1
        ? (canonicalByKey.get(key) || { label: bare, url: [...urls][0] })
        : uniqueGuideAnchorMatch(bare, anchors)
    if (!matched) {
      unmatched++
      if (removeUnmatched) {
        removed++
        return ``
      }
      return line
    }
    relinked++
    return `${item[1]}[${matched.label}](${matched.url})`
  })
  // Removing entries hollows out the section; collapse the empty line pairs
  // left behind so consecutive removals cannot leave a stack of blank lines.
  const collapsed = lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n\s*\n\s*(?=##\s)/g, '\n\n')
  return { content: collapsed, relinked, ambiguous, unmatched, removed }
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
  const documented = Object.values(ESTATE_ANCHOR_LINKS).flat()
  const urls = !verifiedUrls ? [] : Array.isArray(verifiedUrls) ? verifiedUrls : Array.from(verifiedUrls)
  const liveKeys = new Set(urls.map((u) => normalizeUrl(String(u || ''))).filter(Boolean))
  const merged: VerifiedRelatedGuideAnchor[] = []
  const seen = new Set<string>()
  const push = (label: string, url: string) => {
    const key = normalizeUrl(url)
    if (!key || seen.has(key)) return
    seen.add(key)
    merged.push({ label, url })
  }
  if (liveKeys.size > 0) {
    for (const a of documented) {
      if (liveKeys.has(normalizeUrl(a.url))) push(a.label, a.url)
    }
    for (const url of urls) {
      const u = String(url || '').trim()
      if (u) push(slugLabelFromUrl(u), u)
    }
    return merged
  }
  for (const a of documented) push(a.label, a.url)
  return merged
}