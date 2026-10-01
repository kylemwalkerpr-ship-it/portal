export const YQAA_LIVE_WEB_SOURCE_KEYS = new Set([
  'xai:web_search',
  'cloudflare:browser_search',
])

export function isYqaaLiveWebSourceKey(value: unknown): boolean {
  return typeof value === 'string' && YQAA_LIVE_WEB_SOURCE_KEYS.has(value)
}


type LiveWebEvidenceLike = {
  sourceKey?: unknown
  sourceUrl?: string
  source?: string
  fetchedAt?: string
  title?: string
  body?: string
  jurisdiction?: string
}

function liveWebEvidence(chunks: LiveWebEvidenceLike[]): LiveWebEvidenceLike[] {
  const seen = new Set<string>()
  return chunks.filter((chunk) => {
    if (!isYqaaLiveWebSourceKey(chunk.sourceKey)) return false
    const url = String(chunk.sourceUrl || chunk.source || '').trim()
    if (!/^https:\/\//i.test(url) || seen.has(url)) return false
    seen.add(url)
    return true
  })
}

function compactExcerpt(value: unknown, max = 1200): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

export function buildYqaaLiveResearchContext(
  chunks: LiveWebEvidenceLike[],
  status: 'skipped' | 'verified' | 'retrieved' | 'insufficient' | 'failed',
): string {
  if (status !== 'verified' && status !== 'retrieved') return ''
  const live = chunks.filter((chunk) => isYqaaLiveWebSourceKey(chunk.sourceKey) && Boolean(chunk.sourceUrl || chunk.source))
  if (!live.length) return ''
  const hosts = [...new Set(live.flatMap((chunk) => {
    try { return [new URL(String(chunk.sourceUrl || chunk.source)).hostname] } catch { return [] }
  }))]
  const fetched = live.map((chunk) => Date.parse(String(chunk.fetchedAt || ''))).filter(Number.isFinite)
  const latestFetchedAt = fetched.length ? new Date(Math.max(...fetched)).toISOString() : null
  return [
    '# LIVE WEB RESEARCH — VERIFIED THIS TURN',
    `Live public-web research succeeded for this request and returned ${live.length} citation-linked source${live.length === 1 ? '' : 's'}.`,
    hosts.length ? `Retrieved source hosts: ${hosts.join(', ')}.` : '',
    latestFetchedAt ? `Evidence retrieval timestamp: ${latestFetchedAt}.` : '',
    'The live-web evidence is included in the curated evidence block below. Use it for current/fresh claims and cite the exact supplied URLs.',
    'Do NOT say that you cannot search, browse, crawl, access, or research the live web on this turn. Do NOT call this evidence merely cached or offline when it was retrieved for this turn.',
    'Do not imply that search results are exhaustive. Distinguish what the cited official pages verify from anything that remains uncertain.',
  ].filter(Boolean).join('\n')
}


export function buildYqaaVerifiedWebDigest(
  chunks: LiveWebEvidenceLike[],
): string {
  const live = liveWebEvidence(chunks).slice(0, 3)
  if (!live.length) return ''
  const sources = live.map((chunk) => {
    const url = String(chunk.sourceUrl || chunk.source)
    const title = compactExcerpt(chunk.title || new URL(url).hostname, 220)
    const excerpt = compactExcerpt(chunk.body, 260)
    return `- **${title}** — [${new URL(url).hostname}](${url})${excerpt ? `\n  Retrieved evidence: ${excerpt}${String(chunk.body || '').replace(/\\s+/g, ' ').trim().length > 260 ? '…' : ''}` : ''}`
  }).join('\n')
  return [
    '**Live web research succeeded.** I retrieved current public sources for this request, but the answer-synthesis model did not complete reliably enough for me to turn them into a confident narrative answer.',
    '',
    'Rather than invent or overstate anything, here are the live sources and the bounded evidence I verified:',
    sources,
    '',
    'You can retry the question for a synthesized YQAA answer. This is a model-synthesis issue, not a web-access limitation.',
  ].join('\n')
}

export function guardVerifiedLiveResearchDisclosure(text: string, verified: boolean): string {
  if (!verified) return text
  const replacement = '**Live web research:** I checked live public sources for this answer; the citations below are the pages retrieved for this turn.'
  let inserted = false
  let guarded = String(text || '')
  const patterns = [
    /\bI\s+(?:still\s+)?(?:can't|cannot|couldn't|could\s+not)\s+(?:(?:run|perform)\s+)?(?:a\s+)?(?:live\s+)?(?:web\s+crawl|web\s+search|search\s+(?:the\s+)?(?:web|internet)|browse\s+(?:the\s+)?(?:web|internet)|access\s+(?:the\s+)?(?:live\s+)?(?:web|internet))[^.!?]*(?:[.!?]|$)/gi,
    /\b(?:live\s+)?(?:web\s+)?research\s+(?:isn't|is\s+not|wasn't|was\s+not)\s+available[^.!?]*(?:[.!?]|$)/gi,
  ]
  for (const pattern of patterns) {
    guarded = guarded.replace(pattern, () => {
      if (inserted) return ''
      inserted = true
      return replacement
    })
  }
  return guarded.replace(/\n{3,}/g, '\n\n').trim()
}
