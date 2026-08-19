/**
 * Citation policy — the only contract Content Studio may use.
 *
 * Research, draft, scaffold, remediator, quality, audit, and ship must call
 * these helpers. Do not inject or gate on a raw `.gov` / `.edu` regex, and
 * do not invent URLs. Same-region immigration / school authorities are
 * always valid on this estate.
 */

import {
  inferArticleClaim,
  isCitationRelevant,
  isCreamSource,
  sourcesForBrief,
  type CitationContext,
  type OfficialSource,
} from './officialSources'

export function extractHttpUrls(content: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const re = /https?:\/\/[^\s)<>\]"'`]+/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(String(content || ''))) !== null) {
    const url = m[0].replace(/[.,);]+$/, '')
    if (!url || seen.has(url)) continue
    seen.add(url)
    out.push(url)
  }
  return out
}

export function buildCitationContext(opts: {
  region?: string | null
  topic?: string | null
  title?: string | null
  primaryKeyword?: string | null
  keywords?: string[]
  body?: string | null
}): CitationContext {
  const keywords = [opts.primaryKeyword, ...(opts.keywords || [])]
    .map((k) => String(k || '').trim())
    .filter(Boolean)
  const topic = String(opts.topic || opts.primaryKeyword || opts.title || inferArticleClaim(opts.body || '') || '')
    .trim() || undefined
  return {
    region: opts.region || undefined,
    topic,
    keywords,
    body: opts.body ? String(opts.body).slice(0, 4000) : undefined,
  }
}

/** Single context builder for brief, gate, remediator, reaudit, and ship. */
export function citationContextForContent(
  content: string,
  opts?: {
    region?: string | null
    topic?: string | null
    title?: string | null
    primaryKeyword?: string | null
    keywords?: string[]
  },
): CitationContext {
  return buildCitationContext({
    region: opts?.region,
    topic: opts?.topic || opts?.primaryKeyword || opts?.title,
    title: opts?.title,
    primaryKeyword: opts?.primaryKeyword,
    keywords: opts?.keywords,
    body: content,
  })
}

/** True when the draft already cites a live-policy official URL for this brief. */
export function articleHasOfficialCitation(content: string, ctx?: CitationContext | null): boolean {
  for (const url of extractHttpUrls(content)) {
    if (isCreamSource(url, ctx) && isCitationRelevant(url, ctx)) return true
  }
  return false
}

/** Topic-ranked official pages that are allowed on this brief. Never invents. */
export function pickOfficialCitations(ctx?: CitationContext | null, limit = 2): OfficialSource[] {
  return sourcesForBrief(ctx)
    .filter((s) => isCreamSource(s.url, ctx) && isCitationRelevant(s.url, ctx))
    .slice(0, Math.max(1, limit))
}

function injectOfficialSources(content: string, sources: OfficialSource[]): string {
  const missing = sources.filter((s) => s.url && !content.includes(s.url))
  if (!missing.length) return content
  const lines = missing.map((s) => `- [${s.title}](${s.url})`).join('\n')
  const heading = content.search(/^##\s+(official sources|sources|references)\s*$/im)
  if (heading >= 0) {
    const nl = content.indexOf('\n', heading)
    const at = nl >= 0 ? nl + 1 : heading
    return `${content.slice(0, at)}\n${lines}\n${content.slice(at)}`
  }
  return `${content.trimEnd()}\n\n## Official sources\n\n${lines}\n`
}

/**
 * Guarantee the draft has at least one on-topic official citation.
 * Injects at most two topic-ranked allowlist URLs. Never invents a path.
 */
export function applyCitationPolicy(
  content: string,
  ctx?: CitationContext | null,
): { content: string; applied: string[] } {
  const applied: string[] = []
  const next = String(content || '')
  if (articleHasOfficialCitation(next, ctx)) return { content: next, applied }
  const picks = pickOfficialCitations(ctx, 2)
  if (!picks.length) return { content: next, applied }
  return {
    content: injectOfficialSources(next, picks),
    applied: ['official_citations'],
  }
}
