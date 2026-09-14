jest.mock('@/lib/aiKeyVault', () => ({
  getAiSettings: jest.fn(),
  setAiSetting: jest.fn(async () => undefined),
  deleteAiSetting: jest.fn(async () => undefined),
}))

import { getAiSettings, setAiSetting } from '@/lib/aiKeyVault'
import { forceRefreshSuperGrokAccessToken } from '@/lib/xaiSuperGrokOAuth'

const mockedGetAiSettings = getAiSettings as jest.MockedFunction<typeof getAiSettings>
const mockedSetAiSetting = setAiSetting as jest.MockedFunction<typeof setAiSetting>

describe('SuperGrok unauthorized recovery', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    jest.clearAllMocks()
  })

  it('force-refreshes a server-rejected SuperGrok session even when the local access token is still fresh', async () => {
    const locallyFreshExpiry = Date.now() + 60 * 60 * 1000
    mockedGetAiSettings.mockResolvedValue({
      xai_oauth_access_token: 'server-rejected-access-token',
      xai_oauth_refresh_token: 'still-valid-refresh-token',
      xai_oauth_expires_at: String(locallyFreshExpiry),
    } as Awaited<ReturnType<typeof getAiSettings>>)

    global.fetch = jest.fn(async () => new Response(JSON.stringify({
      access_token: 'replacement-access-token',
      refresh_token: 'replacement-refresh-token',
      expires_in: 3600,
      token_type: 'Bearer',
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch

    const refreshed = await forceRefreshSuperGrokAccessToken()

    expect(refreshed?.accessToken).toBe('replacement-access-token')
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(mockedSetAiSetting).toHaveBeenCalledWith(
      'xai_oauth_access_token',
      'replacement-access-token',
      'oauth-401-refresh',
    )
  })
})
