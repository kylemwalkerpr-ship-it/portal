/**
 * revert-content.test.ts
 *
 * Locks revertContent's rollback decision: a merged ship is rolled back by
 * restoring the file to its pre-ship state, or by DELETING the file when the
 * deploy commit's parent had no such file (net-new page). The dryRun path
 * exercises the pure decision without touching GitHub.
 */
import { revertContent } from '@/lib/seoFactory/ship'

jest.mock('@/lib/githubContents', () => {
  const actual = jest.requireActual('@/lib/githubContents')
  return {
    ...actual,
    getCommitParentSha: jest.fn(),
    getRepoFileContent: jest.fn(),
  }
})

import { getCommitParentSha, getRepoFileContent } from '@/lib/githubContents'

const mockedParentSha = getCommitParentSha as jest.MockedFunction<typeof getCommitParentSha>
const mockedFileContent = getRepoFileContent as jest.MockedFunction<typeof getRepoFileContent>

describe('revertContent (dry-run decision)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('restores the pre-ship content when the file existed at the parent commit', async () => {
    mockedParentSha.mockResolvedValue('parent123')
    mockedFileContent.mockResolvedValue('---\ntitle: Old version\n---\n')

    const result = await revertContent({
      owner: 'acme',
      repo: 'caseworks',
      path: 'app/us/student-visas/page.tsx',
      deploySha: 'deploy123',
      title: 'Student Visas Hub',
      dryRun: true,
    })

    expect(result.status).toBe('dry_run')
    expect(result.action).toBe('restored')
    expect(result.note).toContain('restore the pre-ship content')
    expect(mockedParentSha).toHaveBeenCalledWith('acme', 'caseworks', 'deploy123')
    expect(mockedFileContent).toHaveBeenCalledWith('acme', 'caseworks', 'app/us/student-visas/page.tsx', 'parent123')
  })

  it('deletes the page when it was net-new (no file at the parent commit)', async () => {
    mockedParentSha.mockResolvedValue('parent123')
    mockedFileContent.mockResolvedValue(undefined)

    const result = await revertContent({
      owner: 'acme',
      repo: 'caseworks',
      path: 'app/us/new-page/page.tsx',
      deploySha: 'deploy123',
      title: 'Net-new page',
      dryRun: true,
    })

    expect(result.status).toBe('dry_run')
    expect(result.action).toBe('deleted')
    expect(result.note).toContain('DELETE this net-new page')
  })

  it('treats a missing parent commit (root commit) as net-new → delete', async () => {
    mockedParentSha.mockResolvedValue(null)

    const result = await revertContent({
      owner: 'acme',
      repo: 'caseworks',
      path: 'app/us/root-page/page.tsx',
      deploySha: 'root123',
      title: 'Root page',
      dryRun: true,
    })

    expect(result.action).toBe('deleted')
    expect(mockedFileContent).not.toHaveBeenCalled()
  })
})
