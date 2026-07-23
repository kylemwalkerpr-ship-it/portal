/**
 * Unit tests for GitHub Contents helpers (no network).
 * Guards the 422 "sha wasn't supplied" contract forever.
 */
import { encodeRepoPath, isGithubShaRequiredError } from '@/lib/githubContents'

describe('encodeRepoPath', () => {
  it('strips leading slash and encodes segments', () => {
    expect(encodeRepoPath('/app/uk/foo bar/page.tsx')).toBe(
      'app/uk/foo%20bar/page.tsx',
    )
  })

  it('handles empty', () => {
    expect(encodeRepoPath('')).toBe('')
  })

  it('does not double-encode plain paths', () => {
    expect(encodeRepoPath('app/ca/express-entry/page.tsx')).toBe(
      'app/ca/express-entry/page.tsx',
    )
  })
})

describe('isGithubShaRequiredError', () => {
  it('detects the classic 422 body', () => {
    expect(
      isGithubShaRequiredError(
        'GitHub 422: {"message":"Invalid request.\\n\\n\\"sha\\" wasn\'t supplied.","status":"422"}',
      ),
    ).toBe(true)
  })

  it('detects bare message', () => {
    expect(isGithubShaRequiredError(`"sha" wasn't supplied`)).toBe(true)
  })

  it('detects 409 conflict', () => {
    expect(isGithubShaRequiredError('GitHub 409: does not match')).toBe(true)
  })

  it('ignores unrelated errors', () => {
    expect(isGithubShaRequiredError('GitHub 403: Resource not accessible')).toBe(false)
    expect(isGithubShaRequiredError('GitHub 404: Not Found')).toBe(false)
    expect(isGithubShaRequiredError('network timeout')).toBe(false)
  })
})
