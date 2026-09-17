jest.mock('@/lib/githubContents', () => ({
  githubFetch: jest.fn(),
  getBranchHeadSha: jest.fn(),
  openPullRequest: jest.fn(),
  putRepoFile: jest.fn(),
}))

import { githubFetch } from '@/lib/githubContents'
import { listSiteHealthPageInventory } from '@/lib/seoFactory/siteHealth'

const mockedGithubFetch = githubFetch as jest.MockedFunction<typeof githubFetch>

describe('listSiteHealthPageInventory', () => {
  beforeEach(() => mockedGithubFetch.mockReset())

  it('builds a public URL inventory from trees without fetching page blobs', async () => {
    mockedGithubFetch.mockImplementation(async (path: string) => {
      if (path.includes('/caseworks/')) {
        return { tree: [
          { type: 'blob', path: 'app/us/f1/page.tsx', sha: 'a' },
          { type: 'blob', path: 'app/api/private/page.tsx', sha: 'blocked' },
        ] } as never
      }
      if (path.includes('/yousafe-consultancy/')) {
        return { tree: [
          { type: 'blob', path: 'ca/content/from/kenya.md', sha: 'b' },
          { type: 'blob', path: 'uk/app/skilled-worker/page.tsx', sha: 'c' },
        ] } as never
      }
      if (path.includes('/portal/')) {
        return { tree: [
          { type: 'blob', path: 'app/marketplace/page.tsx', sha: 'd' },
          { type: 'blob', path: 'app/dashboard/admin/page.tsx', sha: 'blocked2' },
        ] } as never
      }
      throw new Error(`unexpected ${path}`)
    })

    const pages = await listSiteHealthPageInventory('all')

    expect(pages.map((p) => p.url)).toEqual([
      'https://ca.yousafeconsultancy.com/from/kenya/',
      'https://legal.yousafeconsultancy.com/us/f1/',
      'https://market.yousafeconsultancy.com/marketplace/',
      'https://uk.yousafeconsultancy.com/skilled-worker/',
    ])
    expect(mockedGithubFetch).toHaveBeenCalledTimes(3)
    for (const call of mockedGithubFetch.mock.calls) {
      expect(String(call[0])).toContain('/git/trees/main?recursive=1')
      expect(String(call[0])).not.toContain('/git/blobs/')
    }
  })
})
