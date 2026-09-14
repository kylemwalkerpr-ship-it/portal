from pathlib import Path

path = Path('app/api/internal/xai-grok/[...path]/route.ts')
text = path.read_text()

import_anchor = "import { NextRequest } from 'next/server'\n"
refresh_import = "import { forceRefreshSuperGrokAccessToken } from '@/lib/xaiSuperGrokOAuth'\n"
if refresh_import not in text:
    if import_anchor not in text:
        raise SystemExit('NextRequest import anchor not found')
    text = text.replace(import_anchor, import_anchor + refresh_import, 1)

old = r'''  const upstream = await fetch(`${upstreamBase}/${path}${request.nextUrl.search}`, {
    method: request.method,
    headers,
    body: upstreamBody,
    redirect: 'manual',
    cache: 'no-store',
  })

  const responseHeaders = new Headers()
'''
new = r'''  let upstream = await fetch(`${upstreamBase}/${path}${request.nextUrl.search}`, {
    method: request.method,
    headers,
    body: upstreamBody,
    redirect: 'manual',
    cache: 'no-store',
  })

  // Match the official Grok client auth-recovery contract: an OAuth access
  // token may be invalidated by the subscription service before its local
  // expiry. A 401 from the subscription proxy gets exactly one forced token
  // refresh and one replay. Developer API keys and 403 policy/quota failures
  // must never enter this recovery path.
  if (!developerKey && upstream.status === 401) {
    const refreshed = await forceRefreshSuperGrokAccessToken()
    if (refreshed?.accessToken) {
      try { await upstream.body?.cancel() } catch { /* best effort */ }

      headers.set('Authorization', `Bearer ${refreshed.accessToken}`)
      const refreshedUserId = decodeJwtSubject(refreshed.accessToken)
      if (refreshedUserId) {
        headers.set('x-userid', refreshedUserId)
        headers.set('x-grok-user-id', refreshedUserId)
      } else {
        headers.delete('x-userid')
        headers.delete('x-grok-user-id')
      }

      upstream = await fetch(`${upstreamBase}/${path}${request.nextUrl.search}`, {
        method: request.method,
        headers,
        body: upstreamBody,
        redirect: 'manual',
        cache: 'no-store',
      })
    }
  }

  const responseHeaders = new Headers()
'''
if old not in text:
    raise SystemExit('upstream fetch anchor not found')
text = text.replace(old, new, 1)
path.write_text(text)

Path('scripts/apply-supergrok-401-router.py').unlink(missing_ok=True)
Path('.github/workflows/apply-supergrok-401-router.yml').unlink(missing_ok=True)
