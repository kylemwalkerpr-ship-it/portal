/**
 * P5 pre-PR review — complete-flow ORPHAN truthfulness regression.
 *
 * `runFullSiteHealthCheck({ fixOrphans: true })` must report and log only the
 * orphans `repairSiteHealthChunked()` actually repaired. A P5-protected
 * KEEP_BUT_SILO orphan (or one whose repo had no usable hub) is never counted
 * in `repairs.orphansFixed`, never written and never given a "Repaired orphan
 * page" history entry; protected skips are surfaced in
 * `repairs.orphansProtectedSkipped`.
 *
 * Only the boundaries that would otherwise need the network are stubbed
 * (audit scan, snapshot persistence, live verify, sitemap fetch, GitHub
 * Contents). The real chunked mutation path runs unmodified.
 */
import { Buffer } from 'node:buffer'
import { auditSiteHealthChunked, type SiteHealthPage } from '@/lib/seoFactory/siteHealth'
import { runFullSiteHealthCheck } from '@/lib/seoFactory/siteHealthComplete'

const mockGithubFetch = jest.fn()
const mockPutRepoFile = jest.fn()
const mockOpenPullRequest = jest.fn()

jest.mock('@/lib/githubContents', () => ({
  githubFetch: (...args: unknown[]) => mockGithubFetch(...args),
  putRepoFile: (...args: unknown[]) => mockPutRepoFile(...args),
  openPullRequest: (...args: unknown[]) => mockOpenPullRequest(...args),
  getBranchHeadSha: jest.fn(async () => 'mainsha'),
  getRepoFileContent: jest.fn(),
}))

jest.mock('@/lib/seoFactory/siteHealthSnapshot', () => ({
  persistSiteHealthSnapshot: jest.fn(async () => 0),
}))

jest.mock('@/lib/seoFactory/liveVerify', () => ({
  verifyLiveUrl: jest.fn(),
}))

jest.mock('@/lib/seoFactory/siteHealth', () => {
  const actual = jest.requireActual('@/lib/seoFactory/siteHealth')
  return {
    ...actual,
    auditSiteHealthChunked: jest.fn(),
    enrichInboundLinks: jest.fn((pages: unknown[]) => pages),
  }
})

const CASE = 'caseworks'
const HOST = 'https://legal.yousafeconsultancy.com'
/** Registered KEEP_BUT_SILO cohort orphan (a real registry entry). */
const UTAH_PATH = 'app/guide/university-of-utah-student-housing/page.tsx'
const UTAH_URL = `${HOST}/guide/university-of-utah-student-housing/`
/** Unregistered orphan the repair is allowed to fix. */
const PLAIN_PATH = 'app/us/student-visas/x/page.tsx'
const PLAIN_URL = `${HOST}/us/student-visas/x/`
const HUB_PATH = 'app/us/page.tsx'

const FILE_CONTENT: Record<string, string> = {
  [UTAH_PATH]: 'export const metadata = { title: "University of Utah student housing" }\n\nexport default function Page() {\n  return <main>Utah page</main>\n}\n',
  // Links to the hub so the hub itself is not an orphan; this page is the orphan.
  [PLAIN_PATH]: `export const metadata = { title: "Repair target page" }\n\nexport default function Page() {\n  return <main><a href="${HOST}/us/">hub</a></main>\n}\n`,
  [HUB_PATH]: 'export const metadata = { title: "Estate hub" }\n\nexport default function Page() {\n  return <main>Hub</main>\n}\n',
}

const PROTECTED_PAGE: SiteHealthPage = {
  repo: CASE,
  host: 'legal.yousafeconsultancy.com',
  path: UTAH_PATH,
  url: UTAH_URL,
  title: 'University of Utah student housing',
  indexable: true,
  inboundLinks: 0,
  sampleSources: [],
}

const PLAIN_PAGE: SiteHealthPage = {
  repo: CASE,
  host: 'legal.yousafeconsultancy.com',
  path: PLAIN_PATH,
  url: PLAIN_URL,
  title: 'Repair target page',
  indexable: true,
  inboundLinks: 0,
  sampleSources: [],
}

const shaFor = (path: string) => `sha-${path}`

/** Deterministic GitHub boundary over the fixture map. */
const githubFetchImpl = async (endpoint: string, init?: { method?: string }) => {
  const url = String(endpoint)
  const tree = url.match(/^\/repos\/kylemwalkerpr-ship-it\/([^/]+)\/git\/trees\/main\?recursive=1$/)
  if (tree) {
    return {
      tree: tree[1] === CASE
        ? Object.keys(FILE_CONTENT).map((path) => ({ path, type: 'blob', sha: shaFor(path) }))
        : [],
    }
  }
  const blob = url.match(/\/git\/blobs\/(.+)$/)
  if (blob) {
    for (const [path, content] of Object.entries(FILE_CONTENT)) {
      if (shaFor(path) === blob[1]) return { content: Buffer.from(content, 'utf8').toString('base64') }
    }
    throw new Error('GitHub 404: blob not found')
  }
  const contents = url.match(/\/contents\/(.+?)\?ref=main$/)
  if (contents) {
    const content = FILE_CONTENT[contents[1]]
    if (content == null) throw new Error('GitHub 404: Not Found')
    return { content: Buffer.from(content, 'utf8').toString('base64'), sha: shaFor(contents[1]) }
  }
  if (init?.method === 'PUT' || init?.method === 'POST') return { ok: true }
  return {}
}

type HistoryEntry = Record<string, unknown>

/** Decoded entries of every fix-history PUT written during the run. */
const historyEntriesWritten = (): HistoryEntry[] => {
  const entries: HistoryEntry[] = []
  const calls = mockGithubFetch.mock.calls as Array<[unknown, { method?: string; body?: string } | undefined]>
  for (const [endpoint, init] of calls) {
    if (!String(endpoint).includes('.content-studio/site-health-fixes.json')) continue
    if (init?.method !== 'PUT') continue
    const body = JSON.parse(String(init?.body))
    entries.push(...JSON.parse(Buffer.from(String(body.content), 'base64').toString('utf8')))
  }
  return entries
}

const originalFetch = global.fetch

beforeEach(() => {
  mockGithubFetch.mockReset().mockImplementation(githubFetchImpl)
  mockPutRepoFile.mockReset().mockResolvedValue({ ok: true })
  mockOpenPullRequest.mockReset().mockResolvedValue({ number: 11, html_url: 'https://github.com/example/pull/11' })
  ;(auditSiteHealthChunked as unknown as jest.Mock).mockReset().mockResolvedValue({
    pages: [PROTECTED_PAGE, PLAIN_PAGE],
    filesScanned: 3,
    totalFiles: 3,
    nextBatch: null,
  })
  ;(global as unknown as { fetch: unknown }).fetch = jest.fn(async () => {
    throw new Error('offline regression test — live sitemap fetch is stubbed')
  })
})

afterAll(() => {
  ;(global as unknown as { fetch: unknown }).fetch = originalFetch
})

describe('P5 complete-flow orphan truthfulness', () => {
  it('counts and logs only the orphan the chunked repair actually fixed', async () => {
    const report = await runFullSiteHealthCheck({ scope: CASE, dryRun: false, fixOrphans: true, batchSize: 10 })

    // Classification keeps the protected orphan visible; it is not hidden.
    expect(report.orphans.map((p) => p.url).sort()).toEqual([PLAIN_URL, UTAH_URL].sort())
    expect(report.repairs.orphansProtectedSkipped).toBe(1)
    expect(report.repairs.orphansFixed).toBe(1)
    expect(report.repairs.errors).toEqual([])

    // Only the unregistered orphan's hub write happened.
    const hubWrite = mockPutRepoFile.mock.calls
      .map(([arg]) => arg as { path: string; content: string })
      .find((call) => call.path === HUB_PATH)
    expect(hubWrite).toBeDefined()
    expect(hubWrite!.content).toContain(PLAIN_URL)
    for (const [arg] of mockPutRepoFile.mock.calls) {
      const content = (arg as { content: string }).content
      expect(content).not.toContain(UTAH_URL)
      expect(content).not.toContain('university-of-utah-student-housing')
    }

    // PR accounting reports the actual outcome count, not the candidate batch.
    expect(mockOpenPullRequest).toHaveBeenCalledTimes(1)
    const prBody = String((mockOpenPullRequest.mock.calls[0][0] as { body?: string }).body)
    expect(prBody).toContain('Orphans actually repaired: 1')
    expect(prBody).not.toContain('university-of-utah-student-housing')

    // History contains the real fixed URL only — never the protected one.
    const entries = historyEntriesWritten()
    expect(entries.length).toBeGreaterThan(0)
    const serialized = JSON.stringify(entries)
    expect(serialized).toContain(PLAIN_URL)
    expect(serialized).not.toContain(UTAH_URL)
    expect(serialized).not.toContain('university-of-utah-student-housing')

    const orphanEntries = entries.filter((entry) => entry.action === 'orphan')
    expect(orphanEntries).toHaveLength(1)
    expect(orphanEntries[0]).toMatchObject({ action: 'orphan', repo: CASE, url: PLAIN_URL })
    expect(String(orphanEntries[0].detail)).toContain('Repaired orphan page')
  })
})
