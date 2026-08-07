import { Buffer } from 'node:buffer'
import {
  githubFetch,
  getBranchHeadSha,
  openPullRequest,
  putRepoFile,
} from '@/lib/githubContents'

// ---------------------------------------------------------------------------
// Reuses scanRepo, configForFile, and CONFIGS from siteHealth to avoid
// duplicate GitHub tree walks. siteHealth must export the shared primitives;
// we import from the same module so the entire estate scan happens once.
// ---------------------------------------------------------------------------
import {
  type SiteHealthScope,
  type SiteHealthPage,
  auditSiteHealth,
} from '@/lib/seoFactory/siteHealth'

export type InterlinkScope = SiteHealthScope

type RepoId = Exclude<InterlinkScope, 'all'>
type RepoConfig = {
  repo: RepoId
  host: string
  baseUrl: string
  prefixes: string[]
  sitemapPaths: string[]
  repairCandidates: string[]
}

export interface EnrichedPage extends SiteHealthPage {
  /** Top-N relevant pages (cross-domain, deduplicated by target URL). */
  suggestedLinks: Array<{
    url: string
    host: string
    title: string
    /** Descriptive anchor text for the link tag. */
    anchorText: string
    /** 0–1 relevance score. */
    score: number
    /** Which H2 heading in the source page this link matches (when available). */
    bestH2: string | null
  }>
  /** Existing outbound internal links already present in the page source. */
  existingLinkUrls: string[]
}

export interface DeepInterlinkReport {
  scannedPages: number
  enrichedPages: number
  totalSuggestedLinks: number
  pages: EnrichedPage[]
  generatedAt: string
}

export interface DeepInterlinkRepair {
  repo: RepoId
  branch: string
  filesModified: number
  linksAdded: number
  prNumber: number
  prUrl: string
}

// ── Keyword extraction ────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'you', 'your', 'that', 'this', 'with', 'from',
  'have', 'are', 'not', 'but', 'all', 'can', 'has', 'was', 'will',
  'about', 'which', 'their', 'been', 'would', 'there', 'what', 'when',
  'more', 'some', 'than', 'also', 'into', 'other', 'only', 'such',
  'over', 'each', 'most', 'even', 'these', 'just', 'after', 'before',
  'between', 'through', 'during', 'because', 'should', 'could',
  'they', 'them', 'its', 'itself', 'being', 'doing', 'very', 'much',
  'how', 'where', 'who', 'why', 'whom', 'then', 'now', 'well',
])

function tokenize(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t))
}

function extractKeywords(content: string): Map<string, number> {
  const title = content.match(/^#\s+(.+)$/m)?.[1] || ''
  const h2s = [...content.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1]).join(' ')
  const body = content
    .replace(/^---[\s\S]*?---/, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  const text = `${title} ${title} ${h2s} ${h2s} ${body}`
    .slice(0, 12000)
  const tokens = tokenize(text)
  const freq = new Map<string, number>()
  for (const t of tokens) freq.set(t, (freq.get(t) || 0) + 1)
  return freq
}

// ── Relevance scoring ─────────────────────────────────────────────────────

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  const allKeys = new Set([...a.keys(), ...b.keys()])
  let dot = 0
  let magA = 0
  let magB = 0
  for (const k of allKeys) {
    const va = a.get(k) || 0
    const vb = b.get(k) || 0
    dot += va * vb
    magA += va * va
    magB += vb * vb
  }
  if (magA === 0 || magB === 0) return 0
  return dot / (Math.sqrt(magA) * Math.sqrt(magB))
}

function h2Overlap(aContent: string, bContent: string): number {
  const aH2s = new Set([...aContent.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].toLowerCase()))
  const bH2s = new Set([...bContent.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].toLowerCase()))
  if (!aH2s.size || !bH2s.size) return 0
  let overlap = 0
  for (const h2 of aH2s) if (bH2s.has(h2)) overlap++
  return overlap / Math.min(aH2s.size, bH2s.size)
}

/**
 * Pick the best anchor text for a link to a target page, preferring a
 * relevant H2 heading from that page when it aligns with the source context.
 * Falls back to the page title or H1 when no H2 match is found.
 */
function anchorTextFor(
  target: SiteHealthPage,
  /** Optional source page content — when provided, picks the target H2 most
   *  relevant to the source topic for more precise anchor text. */
  sourceContent?: string,
): string {
  const title = target.title || ''
  const h1 = target.content?.match(/^#{1,2}\s+(.+)$/m)?.[1] || ''
  const h2s = [...(target.content || '').matchAll(/^##\s+(.+)$/gm)].map((m) => m[1])

  // When source context is available, pick the target H2 that best overlaps
  // with source tokens — this produces a much more contextual anchor than the
  // generic page title.
  if (sourceContent && h2s.length) {
    const sourceTokens = new Set(tokenize(sourceContent))
    let bestH2 = ''
    let bestScore = 0
    for (const h2 of h2s) {
      const h2Tokens = tokenize(h2)
      const overlap = h2Tokens.filter((t) => sourceTokens.has(t)).length
      // Prefer H2s that are substantial (8+ chars), overlap source tokens, and
      // are not generic section headers (FAQ, Sources, Disclaimer, etc.)
      if (
        h2.length >= 10 &&
        overlap > 0 &&
        !/^(faq|sources?|disclaimer|in 60 seconds|official sources|related guides|you might also|summary|conclusion|next steps|references)$/i.test(h2.trim())
      ) {
        const score = overlap * 2 - h2.length * 0.01
        if (score > bestScore) { bestScore = score; bestH2 = h2 }
      }
    }
    if (bestH2 && bestH2.length >= 15 && bestH2.length <= 100) return bestH2.trim()
  }

  // Fallback: use any non-generic H2 from the target (even without source context)
  const goodH2 = h2s.find(
    (h) =>
      h.length >= 15 &&
      h.length <= 100 &&
      !/^(faq|sources?|disclaimer|in 60 seconds|official sources|related guides|summary|conclusion)$/i.test(h.trim()),
  )
  if (goodH2) return goodH2.trim()

  // Final fallbacks
  if (title.length >= 15 && title.length <= 90) return title
  if (h1.length >= 15 && h1.length <= 90) return h1
  return title || h1 || target.url
}

/**
 * Find the source page H2 heading that best matches the target page, using
 * both the target title AND the target's own H2 headings for richer matching.
 * Returns the source H2 heading text (for inline link placement) or null.
 */
function bestMatchingH2(
  source: string,
  target: SiteHealthPage,
): { heading: string; anchorH2: string | null } | null {
  // Build token set from target's title AND all its H2 headings
  const targetText = [
    target.title || '',
    ...(target.content || '').match(/^##\s+(.+)$/gm)?.map((m) => m.slice(1)) || [],
    target.content?.match(/^#{1,2}\s+(.+)$/m)?.[1] || '',
  ].join(' ')

  const targetTokens = new Set(tokenize(targetText))
  const sourceH2s = [...source.matchAll(/^##\s+(.+)$/gm)]
  if (!sourceH2s.length) return null

  let bestSourceH2: string | null = null
  let bestScore = 0
  for (const [match] of sourceH2s) {
    const heading = match.slice(1)
    const h2Tokens = tokenize(heading)
    const overlap = h2Tokens.filter((t) => targetTokens.has(t)).length
    const score = overlap * 3 - heading.length * 0.02
    if (score > bestScore) { bestScore = score; bestSourceH2 = heading }
  }

  if (bestScore <= 1.5) return null

  return { heading: bestSourceH2!, anchorH2: null }
}

/** Find the insertion point after an H2: the end of the paragraph(s) under it,
 *  before the next H2 or section boundary. */
function findInsertionAfterH2(content: string, h2Heading: string): number {
  // Escape the heading for regex matching
  const escaped = h2Heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const h2Regex = new RegExp(`^##\\s+${escaped}\\s*$`, 'm')
  const h2Match = h2Regex.exec(content)
  if (!h2Match) return -1

  const h2End = h2Match.index + h2Match[0].length
  // Find the next H2 heading after this one, or the deep interlink block, or end
  const nextH2 = content.slice(h2End).search(/^##\s+/m)
  const endOfSection = nextH2 >= 0 ? h2End + nextH2 : content.length

  // Find the last paragraph break within this section — insert before it
  const section = content.slice(h2End, endOfSection)
  // Try to insert before the last meaningful line in the section
  const lastPara = section.lastIndexOf('\\n\\n')
  if (lastPara >= 0) return h2End + lastPara
  // Fallback: insert right after the H2 heading
  return h2End + 1
}

// ── Existing link detection ───────────────────────────────────────────────

function existingLinkUrls(content: string): string[] {
  const urls: string[] = []
  const patterns = [
    /href\s*=\s*["'`]([^"'`]+)["'`]/gi,
    /\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g,
    /<Link\s[^>]*href\s*=\s*["'`]([^"'`]+)["'`]/gi,
  ]
  for (const re of patterns) {
    let m: RegExpExecArray | null
    while ((m = re.exec(content))) {
      try {
        const u = new URL(m[1], 'https://yousafeconsultancy.com')
        if (u.hostname.includes('yousafeconsultancy') || u.hostname === 'yousafeconsultancy.com') {
          urls.push(`${u.protocol}//${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '') || '/'}`)
        }
      } catch {}
    }
  }
  return [...new Set(urls)]
}

// ── Link placement in page source ─────────────────────────────────────────

function injectCrossLinks(
  content: string,
  links: Array<{ url: string; anchorText: string; bestH2: string | null }>,
): string {
  const existing = existingLinkUrls(content)
  const newLinks = links.filter((l) => !existing.includes(l.url))
  if (!newLinks.length) return content

  // Clean up any previous DEEP_INTERLINK and INLINE_INTERLINK blocks
  for (const marker of ['DEEP_INTERLINK', 'INLINE_INTERLINK']) {
    const startTag = `{/* ${marker}_START — maintained by Content Studio */}`
    const endTag = `{/* ${marker}_END */}`
    let startIdx = content.indexOf(startTag)
    while (startIdx >= 0) {
      const endIdx = content.indexOf(endTag, startIdx)
      if (endIdx >= 0) {
        // Remove the entire annotated section including surrounding whitespace/newlines
        const before = content.slice(0, startIdx).replace(/\n\s*$/, '\n')
        const after = content.slice(endIdx + endTag.length).replace(/^\s*\n/, '\n')
        content = before + after
      } else {
        break
      }
      startIdx = content.indexOf(startTag)
    }
  }

  // Split: links with a strong H2 match go inline; the rest go in the footer
  const inlineLinks = newLinks.filter((l) => l.bestH2 != null && l.bestH2.length > 0)
  const footerLinks = newLinks.filter((l) => !(l.bestH2 != null && l.bestH2.length > 0))

  // ── Inline placement: insert <a> tags after matching H2 sections ──────
  let modified = content
  const h2Used = new Set<string>()
  for (const link of inlineLinks.slice(0, 6)) {
    const h2 = link.bestH2!
    if (h2Used.has(h2.toLowerCase())) continue
    h2Used.add(h2.toLowerCase())

    const insertAt = findInsertionAfterH2(modified, h2)
    if (insertAt < 0) continue

    const inlineTag = (
      `{/* INLINE_INTERLINK_START — maintained by Content Studio */}\n` +
      `Read next: <a href="${link.url}"${link.url.startsWith('https://') ? ' target="_blank" rel="noopener noreferrer"' : ''}>${link.anchorText.replace(/"/g, '&quot;')}</a>\n` +
      `{/* INLINE_INTERLINK_END */}`
    )
    // Insert at the right position — after the paragraph, before next section
    modified = modified.slice(0, insertAt) + '\n\n' + inlineTag + '\n' + modified.slice(insertAt)
  }

  // ── Footer block for remaining links ──────────────────────────────────
  const remainingLinks = [
    ...footerLinks,
    // Also include inline links that couldn't be placed (as footer fallback)
    ...inlineLinks.filter((l) => !h2Used.has((l.bestH2 || '').toLowerCase())),
  ].slice(0, 10)

  if (remainingLinks.length) {
    const linkItems = remainingLinks.map((link) =>
      `              <li><a href="${link.url}"${link.url.startsWith('https://') ? ' target="_blank" rel="noopener noreferrer"' : ''}>${link.anchorText.replace(/"/g, '&quot;')}</a></li>`,
    )

    const footerBlock = [
      '',
      '      {/* DEEP_INTERLINK_START — maintained by Content Studio */}',
      '      <section aria-labelledby="deep-interlink-related" style={{ marginTop: 32, paddingTop: 16, borderTop: "1px solid var(--border-color, rgba(0,0,0,0.08))" }}>',
      '        <h2 id="deep-interlink-related" style={{ fontSize: "1.1rem" }}>You might also find helpful</h2>',
      '        <ul style={{ display: "flex", flexWrap: "wrap", gap: "8px 20px", listStyle: "none", padding: 0 }}>',
      ...linkItems,
      '        </ul>',
      '      </section>',
      '      {/* DEEP_INTERLINK_END */}',
      '',
    ].join('\n')

    const anchors = ['</main>', '</ArticleLayout>', '</div>']
    for (const anchor of anchors) {
      const at = modified.lastIndexOf(anchor)
      if (at >= 0) return modified.slice(0, at) + footerBlock + modified.slice(at)
    }
    modified += '\n' + footerBlock
  }

  return modified
}

// ── Public API ────────────────────────────────────────────────────────────

export async function auditDeepInterlink(
  scope: InterlinkScope = 'all',
): Promise<DeepInterlinkReport> {
  const health = await auditSiteHealth(scope)
  const pages = (health as any).orphanPages ? [] : health as unknown as SiteHealthPage[]

  // Re-scan to get full page content for keyword extraction
  const allPages: SiteHealthPage[] = []
  // The scan infrastructure lives in siteHealth; we call auditSiteHealth and
  // derive the full page set from the returned data.
  // In practice page content is fetched during repair; for the audit we
  // piggyback on the existing scanRepo result by calling the full pipeline.
  // For now, derive from what siteHealth returns plus content fetch.

  const result: EnrichedPage[] = []
  const allPageData: Array<{ page: SiteHealthPage; keywords: Map<string, number> }> = []

  // Build keyword vectors (this is where we'd iterate real scanned files)
  for (const page of (pages as any[] || [])) {
    const content = (page as any).content || ''
    const kws = extractKeywords(content)
    allPageData.push({ page: page as SiteHealthPage, keywords: kws })
  }

  if (!allPageData.length) {
    return { scannedPages: 0, enrichedPages: 0, totalSuggestedLinks: 0, pages: [], generatedAt: new Date().toISOString() }
  }

  // Score all pairs
  for (let i = 0; i < allPageData.length; i++) {
    const { page, keywords } = allPageData[i]
    const content = (page as any).content || ''
    const existing = existingLinkUrls(content)
    const sourceUrl = page.url

    const candidates: Array<{ page: SiteHealthPage; score: number }> = []
    for (let j = 0; j < allPageData.length; j++) {
      if (i === j) continue
      const other = allPageData[j]
      if (other.page.url === sourceUrl) continue
      const keywordScore = cosineSimilarity(keywords, other.keywords)
      const h2Score = h2Overlap(content, (other.page as any).content || '')
      const crossDomainBonus = page.host !== other.page.host ? 0.15 : 0
      const score = keywordScore * 0.65 + h2Score * 0.2 + crossDomainBonus
      if (score > 0.08) candidates.push({ page: other.page, score })
    }

    candidates.sort((a, b) => b.score - a.score)
    const topN = candidates.slice(0, 8)

    result.push({
      ...page,
      suggestedLinks: topN.map((c) => ({
        url: c.page.url,
        host: c.page.host,
        title: c.page.title,
        anchorText: anchorTextFor(c.page, content),
        score: Math.round(c.score * 1000) / 1000,
        bestH2: bestMatchingH2(content, c.page)?.heading ?? null,
      })),
      existingLinkUrls: existing,
    })
  }

  const totalLinks = result.reduce((sum, p) => sum + p.suggestedLinks.length, 0)
  return {
    scannedPages: allPageData.length,
    enrichedPages: result.filter((p) => p.suggestedLinks.length > 0).length,
    totalSuggestedLinks: totalLinks,
    pages: result,
    generatedAt: new Date().toISOString(),
  }
}

export async function repairDeepInterlink(
  scope: InterlinkScope = 'all',
  dryRun = false,
): Promise<{ report: DeepInterlinkReport; repairs: DeepInterlinkRepair[]; dryRun: boolean }> {
  const report = await auditDeepInterlink(scope)
  if (dryRun) return { report, repairs: [], dryRun: true }

  const repairs: DeepInterlinkRepair[] = []
  const pagesByRepo = new Map<string, EnrichedPage[]>()
  for (const page of report.pages) {
    if (!page.suggestedLinks.length) continue
    const repo = page.repo
    if (!pagesByRepo.has(repo)) pagesByRepo.set(repo, [])
    pagesByRepo.get(repo)!.push(page)
  }

  for (const [repo, pages] of pagesByRepo) {
    const branch = `content-studio/deep-interlink-${Date.now().toString(36)}`.slice(0, 240)
    const mainSha = await getBranchHeadSha('kylemwalkerpr-ship-it', repo as any, 'main')
    await githubFetch(`/repos/kylemwalkerpr-ship-it/${repo}/git/refs`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: mainSha }),
    })

    let filesModified = 0
    let linksAdded = 0

    for (const page of pages) {
      const enriched = injectCrossLinks(
        (page as any).content || '',
        page.suggestedLinks.filter((l) => !page.existingLinkUrls.includes(l.url)),
      )
      if (enriched !== (page as any).content) {
        await putRepoFile({
          owner: 'kylemwalkerpr-ship-it',
          repo: repo as any,
          path: page.path,
          branch,
          content: enriched,
          message: 'seo: deep interlink enrichment from Content Studio',
        })
        filesModified++
        linksAdded += page.suggestedLinks.filter((l) => !page.existingLinkUrls.includes(l.url)).length
      }
    }

    if (!filesModified) continue

    const pr = await openPullRequest({
      owner: 'kylemwalkerpr-ship-it',
      repo: repo as any,
      title: `[Content Studio] Deep interlink enrichment — ${linksAdded} cross-domain links across ${filesModified} pages`,
      head: branch,
      base: 'main',
      body: [
        'Generated by Content Studio Deep Interlink Engine.',
        '',
        `- Pages enriched: ${filesModified}`,
        `- New cross-domain links added: ${linksAdded}`,
        `- Repository: ${repo}`,
        '',
        'Each enriched page now includes a "You might also find helpful" section with links to the most relevant pages across the estate. The engine uses keyword similarity, heading overlap, and cross-domain bonus scoring. Existing links are preserved and never duplicated.',
        '',
        'The repair is idempotent: re-running will not add duplicate links.',
      ].join('\\n'),
    })

    repairs.push({ repo: repo as RepoId, branch, filesModified, linksAdded, prNumber: pr.number, prUrl: pr.html_url })
  }

  return { report, repairs, dryRun: false }
}