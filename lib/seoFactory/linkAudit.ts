/**
 * Retrieval-gated facade for the legacy link-validity engine.
 *
 * linkAuditCore keeps the mature live-link, estate and remediation logic
 * byte-for-byte. This facade adds the missing retrieval contract: a reputable
 * generic homepage is not automatically evidence for every immigration page.
 */

export * from './linkAuditCore'

import * as core from './linkAuditCore'
import {
  applyEvidenceRegionFloor,
  sourcesForBrief,
  type CitationContext,
} from './officialSources'
import { citationContextForContent } from './citationPolicy'
import { isRetrievalGatedCitationAllowed } from './citationRetrievalGate'
import type { LinkAuditFinding } from './linkAuditCore'

function withRegion(
  region?: string | null,
  context?: CitationContext,
): CitationContext {
  return { ...context, region: context?.region ?? region }
}

function retrievalRejectedFindings(
  content: string,
  context?: CitationContext,
): LinkAuditFinding[] {
  const ctx = context || citationContextForContent(content)
  const seen = new Set<string>()
  const findings: LinkAuditFinding[] = []
  for (const { url } of core.extractLinks(content)) {
    if (!core.isExternalHttpUrl(url) || seen.has(url)) continue
    if (isRetrievalGatedCitationAllowed(url, ctx)) continue
    seen.add(url)
    findings.push({
      code: 'irrelevant_external_link',
      severity: 'warning',
      url,
      message: `Generic authority homepage was not retrieved for this article's topic. Keep it only when the brief explicitly names the organisation or the narrow subject it supports.`,
    })
  }
  return findings
}

function mergeFindings(
  base: LinkAuditFinding[],
  extra: LinkAuditFinding[],
): LinkAuditFinding[] {
  const out = [...base]
  const keys = new Set(base.map((f) => `${f.code}|${f.url}`))
  for (const finding of extra) {
    const key = `${finding.code}|${finding.url}`
    if (keys.has(key)) continue
    keys.add(key)
    out.push(finding)
  }
  return out
}

/**
 * Structural audit plus retrieval fit. This preserves all legacy findings and
 * adds a warning when a generic ALL-region homepage has no topic-level reason
 * to be in the article.
 */
export function auditLinksSync(
  content: string,
  knownLiveUrls?: Set<string> | string[],
  externalAllowlist?: string[],
  citationContext?: CitationContext,
): LinkAuditFinding[] {
  const base = core.auditLinksSync(content, knownLiveUrls, externalAllowlist, citationContext)
  const ctx = citationContext || citationContextForContent(content)
  return mergeFindings(base, retrievalRejectedFindings(content, ctx))
}

export async function auditLinksLive(
  content: string,
  opts?: {
    knownLiveUrls?: Set<string> | string[]
    externalAllowlist?: string[]
    citationContext?: CitationContext
  },
): Promise<LinkAuditFinding[]> {
  const base = await core.auditLinksLive(content, opts)
  const ctx = opts?.citationContext || citationContextForContent(content)
  return mergeFindings(base, retrievalRejectedFindings(content, ctx))
}

/**
 * Brief source candidates must pass authority + topical relevance + live check
 * AND the retrieval gate. The gate runs before network verification so generic
 * UN/ILO/OECD homepages never become SOURCES TO CITE for an unrelated page.
 */
export async function filterVerifiedCitationUrls(
  urls: string[],
  extraAllowlist?: string[],
  context?: CitationContext,
): Promise<string[]> {
  const gated = urls.filter((url) => isRetrievalGatedCitationAllowed(url, context))
  return core.filterVerifiedCitationUrls(gated, extraAllowlist, context)
}

export async function liveOfficialSources(
  region?: string | null,
  context?: CitationContext,
): Promise<Array<{ title: string; url: string }>> {
  const ctx = withRegion(region, context)
  const bank = sourcesForBrief(ctx).filter((source) =>
    isRetrievalGatedCitationAllowed(source.url, ctx),
  )
  const live = new Set(
    await core.filterVerifiedCitationUrls(
      bank.map((source) => source.url),
      undefined,
      ctx,
    ),
  )
  const kept = bank.filter(
    (source) => live.has(source.url) || live.has(core.normalizeCitationUrl(source.url)),
  )
  if (kept.length) return kept.slice(0, 8)
  return bank.slice(0, 2)
}

export async function assembleDraftSourceAllowlist(
  region?: string | null,
  extra?: string[],
  context?: CitationContext,
): Promise<string[]> {
  const ctx = withRegion(region, context)
  const verified = await filterVerifiedCitationUrls(extra || [], undefined, ctx)
  const official = await liveOfficialSources(region, ctx)
  const out: string[] = []
  const seen = new Set<string>()
  const push = (line: string, url: string) => {
    const key = core.normalizeCitationUrl(url)
    if (!key || seen.has(key)) return
    seen.add(key)
    out.push(line)
  }
  for (const url of verified) push(url, url)
  for (const source of official) push(`${source.title} — ${source.url}`, source.url)
  const regional = applyEvidenceRegionFloor(out, ctx.region)
  const lines = regional.lines.slice(0, 10)
  if (regional.fallbackUsed && regional.fallbackNote) lines.push(regional.fallbackNote)
  return lines
}

function stripRetrievalRejectedCitations(
  content: string,
  context: CitationContext,
): { content: string; stripped: number } {
  let stripped = 0
  let out = String(content || '')

  out = out.replace(
    /\[([^\]]*)\]\((https?:\/\/[^)\s]+)(?:\s+"[^"]*")?\)/gi,
    (whole, label: string, url: string) => {
      if (isRetrievalGatedCitationAllowed(url, context)) return whole
      stripped++
      return label
    },
  )

  out = out.replace(
    /<a\s+([^>]*?)href=["'](https?:\/\/[^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi,
    (whole, _pre: string, url: string, _post: string, inner: string) => {
      if (isRetrievalGatedCitationAllowed(url, context)) return whole
      stripped++
      return inner
    },
  )

  out = out.replace(/https?:\/\/[^\s)<>\]"'`]+/gi, (url: string) => {
    if (isRetrievalGatedCitationAllowed(url, context)) return url
    stripped++
    return ''
  })

  return { content: out.replace(/\n{3,}/g, '\n\n'), stripped }
}

/**
 * Run the mature sanitizer first, then enforce the retrieval boundary on the
 * final body. This is deliberately deterministic: rejected homepages are
 * unwrapped/removed, while their surrounding prose remains for review.
 */
export async function sanitizeDraftLinksLive(
  content: string,
  opts?: {
    region?: string
    topic?: string
    keywords?: string[]
    externalAllowlist?: string[]
    knownLiveUrls?: Set<string> | string[]
  },
): Promise<{
  content: string
  stripped: number
  injected: number
  findings: LinkAuditFinding[]
  remediations: core.DeadLinkRemediation[]
}> {
  const base = await core.sanitizeDraftLinksLive(content, opts)
  const ctx = citationContextForContent(base.content, {
    region: opts?.region,
    topic: opts?.topic,
    keywords: opts?.keywords,
  })
  const rejected = retrievalRejectedFindings(base.content, ctx)
  const cleaned = stripRetrievalRejectedCitations(base.content, ctx)
  return {
    ...base,
    content: cleaned.content,
    stripped: base.stripped + cleaned.stripped,
    findings: mergeFindings(base.findings, rejected),
  }
}
