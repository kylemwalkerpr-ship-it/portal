import { Buffer } from 'node:buffer'
import {
  githubFetch,
  getBranchHeadSha,
  openPullRequest,
  putRepoFile,
} from '@/lib/githubContents'

export type SiteHealthScope = 'all' | 'caseworks' | 'yousafe-consultancy' | 'portal'

type RepoId = Exclude<SiteHealthScope, 'all'>
type RepoConfig = {
  repo: RepoId
  host: string
  baseUrl: string
  prefixes: string[]
  sitemapPaths: string[]
  repairCandidates: string[]
}

type TreeItem = { path: string; type: string; sha: string }
type ScanFile = { repo: RepoId; path: string; url: string; content: string; page: boolean; indexable: boolean }
export type SiteHealthPage = {
  repo: RepoId
  host: string
  path: string
  url: string
  title: string
  indexable: boolean
  inboundLinks: number
  sampleSources: string[]
  /** Full page source content (available after scan). */
  content?: string
}

export const CONFIGS: Record<RepoId, RepoConfig> = {
  caseworks: {
    repo: 'caseworks',
    host: 'legal.yousafeconsultancy.com',
    baseUrl: 'https://legal.yousafeconsultancy.com',
    prefixes: ['app/'],
    sitemapPaths: ['app/sitemap.xml/route.ts'],
    repairCandidates: ['app/articles/page.tsx', 'app/us/page.tsx', 'app/page.tsx'],
  },
  'yousafe-consultancy': {
    repo: 'yousafe-consultancy',
    host: 'regional',
    baseUrl: 'https://yousafeconsultancy.com',
    prefixes: ['usa/app/', 'uk/app/', 'ca/app/', 'au/app/', 'landing-page/app/'],
    sitemapPaths: [
      'usa/app/sitemap.xml/route.ts',
      'uk/app/sitemap.xml/route.ts',
      'ca/app/sitemap.xml/route.ts',
      'au/app/sitemap.xml/route.ts',
      'landing-page/app/sitemap.xml/route.ts',
    ],
    repairCandidates: [],
  },
  portal: {
    repo: 'portal',
    host: 'market.yousafeconsultancy.com',
    baseUrl: 'https://market.yousafeconsultancy.com',
    prefixes: ['app/'],
    sitemapPaths: ['app/sitemap.ts'],
    repairCandidates: ['app/marketplace/page.tsx', 'app/page.tsx'],
  },
}

const BLOCKED = /(^|\/)\.(next|git|wrangler|cache)(\/|$)|(^|\/)(api|dashboard|auth|sign-in|sign-up|checkout|cart|order|security|support|attorney|consultant|admin|user|sitemap\.xml)(\/|$)/i
const SOURCE_FILE = /\.(tsx?|mdx?)$/i
const PAGE_FILE = /\/page\.tsx$/
const DYNAMIC = /(^|\/)[^/]*\[[^/]+\][^/]*\//

function configForFile(repo: RepoId, path: string): { host: string; baseUrl: string; route: string } | null {
  if (repo === 'caseworks' && path.startsWith('app/') && PAGE_FILE.test(path)) {
    const route = path.replace(/^app\//, '').replace(/\/page\.tsx$/, '')
    return { host: CONFIGS.caseworks.host, baseUrl: CONFIGS.caseworks.baseUrl, route: route ? `/${route}/` : '/' }
  }
  if (repo === 'portal' && path.startsWith('app/') && PAGE_FILE.test(path)) {
    const route = path.replace(/^app\//, '').replace(/\/page\.tsx$/, '')
    return { host: CONFIGS.portal.host, baseUrl: CONFIGS.portal.baseUrl, route: route ? `/${route}/` : '/' }
  }
  if (repo === 'yousafe-consultancy' && PAGE_FILE.test(path)) {
    const m = path.match(/^(usa|uk|ca|au|landing-page)\/app\/(.*)\/page\.tsx$/)
    if (!m) return null
    const route = m[2] ? `/${m[2]}/` : '/'
    const host = m[1] === 'landing-page' ? 'yousafeconsultancy.com' : `${m[1]}.yousafeconsultancy.com`
    return { host, baseUrl: `https://${host}`, route }
  }
  return null
}

function shouldScanPath(path: string): boolean {
  if (BLOCKED.test(path) || DYNAMIC.test(path)) return false
  return SOURCE_FILE.test(path)
}

function normalizePath(path: string): string {
  const raw = path.split('#')[0].split('?')[0] || '/'
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`
  if (withSlash === '/') return '/'
  return withSlash.replace(/\/+/g, '/').replace(/\/+$/, '') + '/'
}

function normalizeUrl(value: string, source: ScanFile): string | null {
  const raw = String(value || '').trim()
  if (!raw || raw.startsWith('#') || /^(mailto|tel|javascript|data):/i.test(raw)) return null
  try {
    const u = raw.startsWith('/') ? new URL(raw, source.url) : new URL(raw)
    const host = u.hostname.replace(/^www\./, '')
    const knownHost = source.url ? new URL(source.url).hostname.replace(/^www\./, '') : ''
    if (host !== knownHost && !host.endsWith('yousafeconsultancy.com')) return null
    return `https://${host}${normalizePath(u.pathname)}`
  } catch {
    return null
  }
}

function extractLinks(content: string, source: ScanFile): string[] {
  const values: string[] = []
  const patterns = [
    /(?:href|to|url)\s*=\s*["'`]([^"'`]+)["'`]/gi,
    /\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g,
  ]
  for (const re of patterns) {
    let match: RegExpExecArray | null
    while ((match = re.exec(content))) values.push(match[1])
  }
  return values.map((value) => normalizeUrl(value, source)).filter((value): value is string => Boolean(value))
}

function titleFromContent(content: string, route: string): string {
  const title = content.match(/(?:title|headline)\s*[:=]\s*["'`]([^"'`]{3,140})/i)?.[1]
  if (title) return title.trim()
  const heading = content.match(/^#{1,2}\s+(.+)$/m)?.[1]
  if (heading) return heading.trim()
  const slug = route.split('/').filter(Boolean).pop() || 'home'
  return slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = []
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await fn(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

async function readRepoFile(repo: RepoId, path: string): Promise<string | null> {
  try {
    const file = await githubFetch(`/repos/kylemwalkerpr-ship-it/${repo}/contents/${path}?ref=main`)
    return Buffer.from(String(file.content || ''), 'base64').toString('utf8')
  } catch (err) {
    if (/GitHub 404/.test(err instanceof Error ? err.message : String(err))) return null
    throw err
  }
}

async function scanRepo(config: RepoConfig): Promise<ScanFile[]> {
  const tree = await githubFetch(`/repos/kylemwalkerpr-ship-it/${config.repo}/git/trees/main?recursive=1`)
  const items = (tree.tree || []) as TreeItem[]
  const candidates = items.filter((item) => item.type === 'blob' && shouldScanPath(item.path) && configForFile(config.repo, item.path))
  return mapLimit(candidates, 4, async (item) => {
      const mapped = configForFile(config.repo, item.path)!
    const blob = await githubFetch(`/repos/kylemwalkerpr-ship-it/${config.repo}/git/blobs/${item.sha}`)
    const content = Buffer.from(String(blob.content || ''), 'base64').toString('utf8')
    const page = PAGE_FILE.test(item.path)
    const indexable = page && !/robots\s*[:=][\s\S]{0,120}index\s*:\s*false|noindex/i.test(content)
    return {
      repo: config.repo,
      path: item.path,
      url: `${mapped.baseUrl}${mapped.route}`,
      content,
      page,
      indexable,
    }
  })
}

function chooseRepairHub(files: ScanFile[], config: RepoConfig): ScanFile | null {
  const candidates = config.repo === 'yousafe-consultancy'
    ? files.filter((file) => /^(usa|uk|ca|au|landing-page)\/app\/page\.tsx$/.test(file.path))
    : config.repairCandidates.map((path) => files.find((file) => file.path === path)).filter(Boolean) as ScanFile[]
  return candidates.find((file) => file) || files.find((file) => file.page && file.indexable) || null
}

function repairSection(links: Array<{ url: string; label: string }>): string {
  const rows = links.map((link) => `          <li><a href="${link.url}">${link.label}</a></li>`).join('\n')
  return `\n      {/* SITEMAP_ORPHAN_FIX_START — maintained by Content Studio */}\n      <section aria-labelledby="content-studio-related-pages">\n        <h2 id="content-studio-related-pages">Related guides</h2>\n        <ul>\n${rows}\n        </ul>\n      </section>\n      {/* SITEMAP_ORPHAN_FIX_END */}\n`
}

function injectRepairSection(content: string, links: Array<{ url: string; label: string }>): string {
  const section = repairSection(links)
  const start = content.indexOf('SITEMAP_ORPHAN_FIX_START')
  if (start >= 0) {
    const begin = content.lastIndexOf('{/*', start)
    const endMarker = 'SITEMAP_ORPHAN_FIX_END'
    const end = content.indexOf(endMarker, start)
    const close = end >= 0 ? content.indexOf('*/}', end) + 3 : -1
    if (begin >= 0 && close > 2) return content.slice(0, begin) + section.trimStart() + content.slice(close)
  }
  const anchors = ['</main>', '</ArticleLayout>', '</main >', '</div>']
  for (const anchor of anchors) {
    const at = content.lastIndexOf(anchor)
    if (at >= 0) return content.slice(0, at) + section + content.slice(at)
  }
  return content + '\n' + section
}

function sitemapBlock(entries: Array<{ path: string; priority: number; changefreq: string }>, kind: 'caseworks' | 'regional' | 'portal'): string {
  const payload = JSON.stringify(entries, null, 2)
  if (kind === 'caseworks') {
    const caseworksPayload = JSON.stringify(entries.map((entry) => ({ path: entry.path, changeFrequency: entry.changefreq, priority: entry.priority })), null, 2)
    return `// SITEMAP_ORPHAN_FIX_START — generated by Content Studio\nconst STUDIO_SITEMAP_ROUTES: ReadonlyArray<SitemapRoute> = ${caseworksPayload}\n// SITEMAP_ORPHAN_FIX_END`
  }
  if (kind === 'regional') {
    return `// SITEMAP_ORPHAN_FIX_START — generated by Content Studio\nconst STUDIO_SITEMAP_ROUTES: ReadonlyArray<{ path: string; priority: number; changefreq: string }> = ${payload}\n// SITEMAP_ORPHAN_FIX_END`
  }
  return `// SITEMAP_ORPHAN_FIX_START — generated by Content Studio\nconst STUDIO_SITEMAP_ROUTES = ${JSON.stringify(entries.map((entry) => entry.path), null, 2)}\n// SITEMAP_ORPHAN_FIX_END`
}

function updateSitemap(content: string, entries: Array<{ path: string; priority: number; changefreq: string }>, kind: 'caseworks' | 'regional' | 'portal'): string {
  const block = sitemapBlock(entries, kind)
  const existing = content.match(/\/\/ SITEMAP_ORPHAN_FIX_START[\s\S]*?\/\/ SITEMAP_ORPHAN_FIX_END/)
  let out = existing ? content.replace(existing[0], block) : content
  if (!existing) {
    const marker = kind === 'caseworks' ? '// ── File-tree walker' : kind === 'portal' ? 'export default async function sitemap' : 'function escapeXml'
    const at = out.indexOf(marker)
    if (at < 0) throw new Error(`Sitemap marker not found in ${kind} route`)
    out = out.slice(0, at) + block + '\n\n' + out.slice(at)
  }
  if (kind === 'caseworks') {
    if (!out.includes('...STUDIO_SITEMAP_ROUTES')) {
      out = out.replace('[...STATIC_ROUTES, ...registryRoutes', '[...STATIC_ROUTES, ...STUDIO_SITEMAP_ROUTES, ...registryRoutes')
    }
  } else if (kind === 'regional') {
    if (!out.includes('STUDIO_SITEMAP_ROUTES.map')) {
      const needle = '...STATIC_ROUTES.map((r) => ({ loc: url(r.path), changefreq: r.changefreq, priority: r.priority })),'
      out = out.replace(needle, needle + '\n    ...STUDIO_SITEMAP_ROUTES.map((r) => ({ loc: url(r.path), changefreq: r.changefreq, priority: r.priority })),' )
    }
  } else if (kind === 'portal') {
    if (!out.includes('STUDIO_SITEMAP_ROUTES.map')) {
      const needle = 'const entries: MetadataRoute.Sitemap = ['
      const insertion = `const entries: MetadataRoute.Sitemap = [\n    ...STUDIO_SITEMAP_ROUTES.map((path: string) => ({ url: \`${'${base}'}${'${mp(path)}'}, lastModified: new Date(), changeFrequency: 'weekly' as const, priority: 0.55 })),`
      out = out.replace(needle, insertion)
    }
  }
  return out
}

function routeEntry(page: SiteHealthPage): { path: string; priority: number; changefreq: string } {
  const path = new URL(page.url).pathname.replace(/\/+$/, '') || '/'
  return { path, priority: 0.55, changefreq: 'monthly' }
}


// ---------- Noindex / word-count helpers (shared with siteHealthFixes) ----------

/** True when page content carries an explicit noindex robots directive. */
export function hasNoIndexFlag(content: string): boolean {
  return /robots\s*[:=][\s\S]{0,160}(?:index\s*:\s*false|['"]noindex['"]|noindex\b)/i.test(content)
}

/** Rough word count of the visible prose (strips code, imports, JSX plumbing). */
export function wordCount(content: string): number {
  const body = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"]/g, ' ')
    .replace(/[{}[\]()<>=,;:.?!|&*+_'"`#@%^~\\/-]+/g, ' ')
  return body.split(/\s+/).filter((w) => /[A-Za-z]{2,}/.test(w)).length
}

/** True when the page has enough real prose to be indexable. */
export function isFullyExpanded(content: string): boolean {
  return wordCount(content) >= 400
}

export async function auditSiteHealth(scope: SiteHealthScope = 'all') {
  const configs = (Object.values(CONFIGS) as RepoConfig[]).filter((config) => scope === 'all' || config.repo === scope)
  const files = (await Promise.all(configs.map(scanRepo))).flat()
  const pages = files.filter((file) => file.page && file.indexable)
  const byUrl = new Map(pages.map((page) => [normalizeUrl(page.url, page), page]))
  const inbound = new Map<string, { count: number; sources: string[] }>()
  for (const page of pages) inbound.set(normalizeUrl(page.url, page)!, { count: 0, sources: [] })
  for (const source of files) {
    for (const link of extractLinks(source.content, source)) {
      const target = inbound.get(link)
      if (!target) continue
      target.count += 1
      if (target.sources.length < 5) target.sources.push(source.url)
    }
  }
  const orphanPages: SiteHealthPage[] = pages
    .filter((page) => page.url !== `${page.url.split('/').slice(0, 3).join('/')}/` && (inbound.get(normalizeUrl(page.url, page))?.count || 0) === 0)
    .map((page) => ({
      repo: page.repo,
      host: new URL(page.url).hostname,
      path: page.path,
      url: page.url,
      title: titleFromContent(page.content, new URL(page.url).pathname),
      indexable: true,
      inboundLinks: 0,
      sampleSources: [],
    }))
  return {
    scannedFiles: files.length,
    scannedPages: pages.length,
    orphanCount: orphanPages.length,
    orphanPages,
    generatedAt: new Date().toISOString(),
  }
}

/**
 * Chunked version of site health audit. Processes files in batches to stay
 * under the Cloudflare Workers 50-subrequest limit per invocation.
 * Returns partial results plus a cursor for the next batch.
 */
export async function auditSiteHealthChunked(
  scope: SiteHealthScope,
  batchStart: number,
  batchSize: number,
): Promise<{
  pages: SiteHealthPage[]
  filesScanned: number
  totalFiles: number
  nextBatch: number | null
}> {
  const configs = scope === 'all'
    ? [CONFIGS.caseworks, CONFIGS['yousafe-consultancy'], CONFIGS.portal]
    : [CONFIGS[scope]]

  // Phase 1: get all file trees (3 subrequests max)
  const allCandidates: Array<{ repo: RepoId; path: string; sha: string; config: RepoConfig }> = []
  for (const config of configs) {
    const tree = await githubFetch(`/repos/kylemwalkerpr-ship-it/${config.repo}/git/trees/main?recursive=1`)
    const items = (tree.tree || []) as TreeItem[]
    for (const item of items) {
      if (item.type !== 'blob' || !shouldScanPath(item.path)) continue
      const mapped = configForFile(config.repo, item.path)
      if (!mapped) continue
      allCandidates.push({ repo: config.repo, path: item.path, sha: item.sha, config })
    }
  }

  const totalFiles = allCandidates.length
  const batch = allCandidates.slice(batchStart, batchStart + batchSize)
  
  if (batch.length === 0) {
    return { pages: [], filesScanned: 0, totalFiles, nextBatch: null }
  }

  // Phase 2: fetch blobs for this batch only (up to batchSize subrequests)
  const pages: SiteHealthPage[] = []
  let scanned = 0

  for (const item of batch) {
    try {
      const mapped = configForFile(item.repo, item.path)!
      const blob = await githubFetch(`/repos/kylemwalkerpr-ship-it/${item.repo}/git/blobs/${item.sha}`)
      const content = Buffer.from(String(blob.content || ''), 'base64').toString('utf8')
      scanned++

      pages.push({
        repo: item.repo,
        host: mapped.host,
        path: item.path,
        url: `${mapped.baseUrl}${mapped.route}`,
        title: titleFromContent(content, mapped.route),
        indexable: !BLOCKED.test(item.path) && !hasNoIndexFlag(content),
        noindex: hasNoIndexFlag(content),
        words: wordCount(content),
        inboundLinks: 0,
        sampleSources: [],
        content,
      })
    } catch {
      // Skip files that fail to fetch — they're likely deleted
    }
  }

  const nextBatch = batchStart + batchSize < totalFiles ? batchStart + batchSize : null

  return { pages, filesScanned: scanned, totalFiles, nextBatch }
}


export async function repairSiteHealth(scope: SiteHealthScope = 'all', dryRun = false) {
  const report = await auditSiteHealth(scope)
  if (dryRun) return { ...report, dryRun: true, repaired: [], pullRequests: [] }
  const configs = (Object.values(CONFIGS) as RepoConfig[]).filter((config) => scope === 'all' || config.repo === scope)
  const repaired: Array<{ repo: RepoId; hubPath: string; links: number; sitemapPaths: string[] }> = []
  const pullRequests: Array<{ repo: RepoId; branch: string; files: string[]; prNumber: number; prUrl: string }> = []
  for (const config of configs) {
    const orphans = report.orphanPages.filter((page) => page.repo === config.repo)
    // Re-scan so the sitemap is refreshed from the same current page graph,
    // even when this repository currently has zero orphan pages.
    const files = await scanRepo(config)
    const indexablePages = files.filter((file) => file.page && file.indexable)
    if (!orphans.length && !indexablePages.length) continue
    const hub = orphans.length ? chooseRepairHub(files, config) : null
    const branch = `content-studio/site-health-${Date.now().toString(36)}`.slice(0, 240)
    const mainSha = await getBranchHeadSha('kylemwalkerpr-ship-it', config.repo, 'main')
    await githubFetch(`/repos/kylemwalkerpr-ship-it/${config.repo}/git/refs`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: mainSha }),
    })
    const filesWritten: string[] = []
    const links = orphans.map((orphan) => ({ url: orphan.url, label: orphan.title }))
    if (hub && links.length) {
      const repairedHub = injectRepairSection(hub.content, links)
      if (repairedHub !== hub.content) {
        await putRepoFile({ owner: 'kylemwalkerpr-ship-it', repo: config.repo, path: hub.path, branch, content: repairedHub, message: 'seo: repair orphan page interlinks from Content Studio' })
        filesWritten.push(hub.path)
      }
    }
    // Keep every sitemap route in sync, including repositories with no current
    // orphan. Sitemap source files are intentionally outside the page scan.
    const sitemapPaths = config.sitemapPaths
    for (const sitemapPath of sitemapPaths) {
      const sitemapContent = await readRepoFile(config.repo, sitemapPath)
      if (sitemapContent == null) continue
      const prefix = config.repo === 'yousafe-consultancy' ? sitemapPath.split('/')[0] : ''
      const entries = indexablePages
        .filter((page) => !prefix || page.path.startsWith(`${prefix}/`))
        .map((page) => routeEntry({
          repo: page.repo,
          host: new URL(page.url).hostname,
          path: page.path,
          url: page.url,
          title: titleFromContent(page.content, new URL(page.url).pathname),
          indexable: true,
          inboundLinks: 0,
          sampleSources: [],
        }))
      const kind = config.repo === 'caseworks' ? 'caseworks' : config.repo === 'portal' ? 'portal' : 'regional'
      const updated = updateSitemap(sitemapContent, entries, kind)
      if (updated !== sitemapContent) {
        await putRepoFile({ owner: 'kylemwalkerpr-ship-it', repo: config.repo, path: sitemapPath, branch, content: updated, message: 'seo: keep sitemap synchronized with Content Studio repairs' })
        filesWritten.push(sitemapPath)
      }
    }
    repaired.push({ repo: config.repo, hubPath: hub?.path || '(no orphan hub needed)', links: links.length, sitemapPaths })
    if (!filesWritten.length) continue
    const pr = await openPullRequest({
      owner: 'kylemwalkerpr-ship-it',
      repo: config.repo,
      title: `[Content Studio] Repair ${orphans.length} orphan page${orphans.length === 1 ? '' : 's'} + sync sitemap`,
      head: branch,
      base: 'main',
      body: [
        'Generated by Content Studio Site Health.',
        '',
        `- Orphan pages repaired: ${orphans.length}`,
        `- Stable hub updated: ${hub?.path || '(none needed; sitemap refresh only)'}`,
        `- Sitemap route${sitemapPaths.length === 1 ? '' : 's'} updated: ${sitemapPaths.join(', ')}`,
        '',
        'The repair is intentionally additive and idempotent: existing page content is preserved and the related-guides block is maintained by the studio.',
      ].join('\\n'),
    })
    pullRequests.push({ repo: config.repo, branch, files: filesWritten, prNumber: pr.number, prUrl: pr.html_url })
  }
  return { ...report, dryRun: false, repaired, pullRequests }
}



/**
 * Chunked repair: processes one batch and returns partial results.
 */
export async function repairSiteHealthChunked(
  scope: SiteHealthScope,
  batchStart: number,
  batchSize: number,
  dryRun: boolean,
): Promise<{
  repaired: Array<{ repo: RepoId; hubPath: string; links: number; sitemapPaths: string[] }>
  orphansFixed: number
  totalOrphans: number
  nextBatch: number | null
  prUrl: string | null
}> {
  const configs = scope === 'all'
    ? [CONFIGS.caseworks, CONFIGS['yousafe-consultancy'], CONFIGS.portal]
    : [CONFIGS[scope]]

  // Re-scan for full page graph (Phase 1: trees)
  const allCandidates: Array<{ repo: RepoId; path: string; sha: string; config: RepoConfig }> = []
  for (const config of configs) {
    const tree = await githubFetch(`/repos/kylemwalkerpr-ship-it/${config.repo}/git/trees/main?recursive=1`)
    const items = (tree.tree || []) as TreeItem[]
    for (const item of items) {
      if (item.type !== 'blob' || !shouldScanPath(item.path)) continue
      const mapped = configForFile(config.repo, item.path)
      if (!mapped) continue
      allCandidates.push({ repo: config.repo, path: item.path, sha: item.sha, config })
    }
  }

  // Phase 2: fetch blobs for this batch
  const pages: Array<{ repo: RepoId; host: string; path: string; url: string; title: string; indexable: boolean; content: string }> = []
  for (const item of allCandidates) {
    try {
      const mapped = configForFile(item.repo, item.path)!
      const blob = await githubFetch(`/repos/kylemwalkerpr-ship-it/${item.repo}/git/blobs/${item.sha}`)
      const content = Buffer.from(String(blob.content || ''), 'base64').toString('utf8')
      pages.push({
        repo: item.repo, host: mapped.host, path: item.path,
        url: `${mapped.baseUrl}${mapped.route}`,
        title: titleFromContent(content, mapped.route),
        indexable: !BLOCKED.test(item.path), content,
      })
    } catch { /* skip */ }
  }

  // Compute orphans
  const files: ScanFile[] = pages.map((p) => ({ ...p, page: true }))
  const byUrl = new Map(files.map((page) => [normalizeUrl(page.url, page) as string, page]))
  const inbound = new Map<string, { count: number; sources: string[] }>()
  for (const page of files) inbound.set(normalizeUrl(page.url, page)!, { count: 0, sources: [] })
  for (const source of files) {
    for (const link of extractLinks(source.content, source)) {
      const existing = inbound.get(link)
      if (existing) { existing.count++; existing.sources.push(source.url) }
    }
  }
  const orphans = [...inbound.entries()]
    .filter(([_, v]) => v.count === 0)
    .map(([url, v]) => {
      const page = byUrl.get(url)
      return {
        repo: page?.repo || scope as RepoId,
        host: page ? new URL(page.url).hostname : '',
        path: new URL(url).pathname,
        url,
        title: page ? titleFromContent(page.content, new URL(page.url).pathname) : url.split('/').filter(Boolean).pop() || 'home',
        indexable: page?.indexable ?? true,
        inboundLinks: v.count,
        sampleSources: v.sources.slice(0, 5),
      }
    })

  // Process batch of orphans
  const batchOrphans = orphans.slice(batchStart, batchStart + batchSize)
  const repaired: Array<{ repo: RepoId; hubPath: string; links: number; sitemapPaths: string[] }> = []

  for (const config of configs) {
    const configOrphans = batchOrphans.filter((o) => o.repo === config.repo)
    if (configOrphans.length === 0) continue

    // Find/update hub file
    let hub: { path: string; content: string } | null = null
    for (const candidate of config.repairCandidates) {
      try {
        const c = await readRepoFile(config.repo, candidate)
        if (c) { hub = { path: candidate, content: c }; break }
      } catch { /* try next */ }
    }
    if (!hub) continue

    const links = configOrphans.map((orphan) => ({ url: orphan.url, label: orphan.title }))
    const updatedHubContent = injectRepairSection(hub.content, links)

    if (!dryRun) {
      const branch = `seo/orphan-repair-${Date.now()}`
      const sha = await getBranchHeadSha('kylemwalkerpr-ship-it', config.repo, 'main')
      await githubFetch(`/repos/kylemwalkerpr-ship-it/${config.repo}/git/refs`, {
        method: 'POST',
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
      })
      await putRepoFile({
        owner: 'kylemwalkerpr-ship-it', repo: config.repo, path: hub.path,
        branch, content: updatedHubContent,
        message: 'seo: link orphan pages in related-guides hub',
      })
    }

    repaired.push({ repo: config.repo, hubPath: hub.path, links: links.length, sitemapPaths: config.sitemapPaths })
  }

  let prUrl: string | null = null
  if (!dryRun && repaired.length > 0 && batchOrphans.length > 0) {
    try {
      const pr = await openPullRequest({
        owner: 'kylemwalkerpr-ship-it', repo: repaired[0].repo,
        head: `seo/orphan-repair-${Date.now()}`,
        base: 'main',
        title: `[Content Studio] Repair ${batchOrphans.length} orphan page(s) — chunked batch`,
        body: `- Batch: ${batchStart}-${batchStart + batchSize}
- Orphans: ${batchOrphans.length}
- Repos: ${repaired.map((r) => r.repo).join(', ')}`,
      })
      prUrl = pr.html_url
    } catch { /* PR creation optional */ }
  }

  return {
    repaired,
    orphansFixed: batchOrphans.length,
    totalOrphans: orphans.length,
    nextBatch: batchStart + batchSize < orphans.length ? batchStart + batchSize : null,
    prUrl,
  }
}