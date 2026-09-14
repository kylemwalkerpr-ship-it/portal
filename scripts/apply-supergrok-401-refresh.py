from pathlib import Path

path = Path('lib/xaiSuperGrokOAuth.ts')
text = path.read_text()
marker = "export async function ensureSuperGrokAccessToken(): Promise<SuperGrokAccess | null> {"
if marker not in text:
    raise SystemExit('ensureSuperGrokAccessToken marker not found')

insert = r'''/**
 * Server-rejection recovery: xAI can invalidate an OAuth access token before
 * its JWT/local expiry. When the subscription proxy returns HTTP 401, bypass
 * the local freshness check and exchange the persisted refresh token once.
 *
 * Keep this separate from ensureSuperGrokAccessToken(): normal calls should
 * continue using a locally-fresh access token without needless refreshes.
 */
export async function forceRefreshSuperGrokAccessToken(): Promise<SuperGrokAccess | null> {
  const settings = await getAiSettings(true)
  const refresh = settings.xai_oauth_refresh_token?.trim() || ''
  if (!refresh) return null
  try {
    const tokens = await refreshSuperGrokToken(refresh)
    await persistTokens(tokens, 'oauth-401-refresh')
    return {
      accessToken: tokens.access_token,
      expiresAt: tokens.expires_at,
      authMode: 'supergrok',
    }
  } catch (err) {
    console.warn(
      '[superGrok] forced refresh after 401 failed',
      err instanceof Error ? err.message : err,
    )
    return null
  }
}

'''

if 'forceRefreshSuperGrokAccessToken' in text:
    raise SystemExit('forceRefreshSuperGrokAccessToken already present')
path.write_text(text.replace(marker, insert + marker, 1))

# One-shot patch machinery must never survive into the review diff.
Path('scripts/apply-supergrok-401-refresh.py').unlink(missing_ok=True)
Path('.github/workflows/apply-supergrok-401-refresh.yml').unlink(missing_ok=True)
