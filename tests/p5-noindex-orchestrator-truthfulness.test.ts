/**
 * P5 final supervisor repair — complete-flow noindex truthfulness regression.
 *
 * `runFullSiteHealthCheck({ fixNoindex: true })` must not report or log a
 * P5-protected skipped page as fixed. The orchestrator's fix-history entries
 * are now derived from the outcomes `fixNoIndexPagesChunked()` actually fixed,
 * and that boundary consults the P5 disposition contract before any mutation.
 *
 * Only the module boundaries that would otherwise need the network/DB are
 * stubbed (site-health audit scan, live verify, snapshot persistence, sitemap
 * fetch, GitHub Contents). The real mutation boundary under test runs
 * unmodified.
 */
import { Buffer } from 'node:buffer'
import { auditSiteHealthChunked } from '@/lib/seoFactory/siteHealth'
import {
  buildNoIndexFixLogEntries,
  runFullSiteHealthCheck,
} from '@/lib/seoFactory/siteHealthComplete'

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
const UTAH_PATH = 'app/guide/university-of-utah-student-housing/page.tsx'
const UTAH_URL = 'https://legal.yousafeconsultancy.com/guide/university-of-utah-student-housing/'

const FILE_CONTENT: Record<string, string> = {
  [UTAH_PATH]: [
    'export const metadata = { title: "University of Utah student housing", robots: "noindex, nofollow" }',
    '',
    'export default function Page() {',
    `  return <main>${'Utah student housing guide. '.repeat(60)}</main>`,
    '}',
    '',
  ].join('\n'),
}

/** The one page the stubbed audit "scanned": a registered KEEP_BUT_SILO noindex page. */
const NOINDEX_PAGE = {
  repo: 'caseworks',
  host: 'legal.yousafeconsultancy.com',
  path: UTAH_PATH,
  url: UTAH_URL,
  title: 'University of Utah student housing',
  indexable: false,
  noindex: true,
  words: 500,
  inboundLinks: 0,
  sampleSources: [] as string[],
}

const shaFor = (path: string) => `sha-${path}`

/** Deterministic GitHub boundary over the fixture above. */
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
  const contents = url.match(/\/contents\/(.+?)\?ref=main$/)
  if (contents) {
    const content = FILE_CONTENT[contents[1]]
    if (content == null) throw new Error('GitHub 404: Not Found')
    return { content: Buffer.from(content, 'utf8').toString('base64'), sha: shaFor(contents[1]) }
  }
  if (init?.method === 'PUT' || init?.method === 'POST') return { ok: true }
  return {}
}

/** Decoded entries of the fix-history PUT, or null when no history write happened. */
const historyPutEntries = (): Array<Record<string, unknown>> | null => {
  const call = mockGithubFetch.mock.calls.find(
    ([endpoint, init]) =>
      String(endpoint).includes('.content-studio/site-health-fixes.json') &&
      (init as { method?: string } | undefined)?.method === 'PUT',
  )
  if (!call) return null
  const body = JSON.parse(String((call[1] as { body?: string }).body))
  return JSON.parse(Buffer.from(String(body.content), 'base64').toString('utf8'))
}

const originalFetch = global.fetch

beforeEach(() => {
  mockGithubFetch.mockReset().mockImplementation(githubFetchImpl)
  mockPutRepoFile.mockReset().mockResolvedValue({ ok: true })
  mockOpenPullRequest.mockReset().mockResolvedValue({ number: 9, html_url: 'https://github.com/example/pull/9' })
  ;(auditSiteHealthChunked as unknown as jest.Mock).mockReset().mockResolvedValue({
    pages: [NOINDEX_PAGE],
    filesScanned: 1,
    totalFiles: 1,
    nextBatch: null,
  })
  ;(global as unknown as { fetch: unknown }).fetch = jest.fn(async () => {
    throw new Error('offline regression test — live sitemap fetch is stubbed')
  })
})

afterAll(() => {
  ;(global as unknown as { fetch: unknown }).fetch = originalFetch
})

describe('P5 complete-flow noindex truthfulness', () => {
  it('does not report or log a protected skipped noindex page as fixed', async () => {
    const report = await runFullSiteHealthCheck({ scope: CASE, fixNoindex: true, batchSize: 10 })

    // Classification stays truthful: the page is still a noindex page because
    // protection means "preserve current state", not "hide it".
    expect(report.noindexPages.map((p) => p.url)).toEqual([UTAH_URL])
    expect(report.repairs.noindexFixed).toBe(0)
    expect(report.repairs.noindexProtectedSkipped).toBe(1)
    expect(report.repairs.errors).toEqual([])

    // No mutation reached the GitHub boundary at all: no branch/refs POST,
    // no fix-history PUT, no file write, no PR.
    expect(mockPutRepoFile).not.toHaveBeenCalled()
    expect(mockOpenPullRequest).not.toHaveBeenCalled()
    const mutations = mockGithubFetch.mock.calls.filter(([, init]) => {
      const method = (init as { method?: string } | undefined)?.method
      return method === 'PUT' || method === 'POST'
    })
    expect(mutations).toEqual([])
    expect(historyPutEntries()).toBeNull()
  })

  it('builds history entries only from actual fixed outcomes', () => {
    // A skipped (protected) candidate never reaches this function's input, so
    // an empty fixed list can never produce a "Removed noindex" log entry.
    expect(buildNoIndexFixLogEntries([])).toEqual([])

    const entries = buildNoIndexFixLogEntries([
      { repo: 'caseworks', path: UTAH_PATH, url: UTAH_URL, title: 'Utah guide', words: 500 },
    ])
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      action: 'noindex',
      repo: 'caseworks',
      path: UTAH_PATH,
      url: UTAH_URL,
    })
    expect(entries[0].detail).toContain('Removed noindex')
    expect(entries[0].detail).toContain('500w')
  })
})
