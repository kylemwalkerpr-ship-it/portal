'use client'

import React from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  planMarketJurisdictionSync,
  rememberMarketJurisdiction,
  type MarketJurisdiction,
} from '@/lib/marketJurisdiction'

/**
 * Applies the persisted Market jurisdiction (lib/marketJurisdiction.ts).
 * Renders nothing. Mounted by MarketplaceShell inside its own Suspense
 * boundary, so reading search params never suspends the shell.
 *
 * - URL has `?country=` / `?jurisdiction=` → the URL wins; a single value is
 *   written to the cookie.
 * - No URL choice and a stored non-"all" value on a listing page → the value
 *   is added to the URL with replaceState (no RSC round-trip, no history
 *   entry). Every existing consumer — landing gate, catalogue filters and
 *   pager, category rail links, header selector — already reads `?country=`.
 */
export function MarketJurisdictionSync({ onResolved }: { onResolved: (value: MarketJurisdiction) => void }) {
  const searchParams = useSearchParams()
  const pathname = usePathname()

  React.useEffect(() => {
    const plan = planMarketJurisdictionSync({
      pathname: pathname || '/',
      search: searchParams?.toString() ?? '',
      hash: window.location.hash,
      cookie: document.cookie,
    })
    if (plan.writeCookie) rememberMarketJurisdiction(plan.writeCookie)
    if (plan.replaceUrl) window.history.replaceState(null, '', plan.replaceUrl)
    onResolved(plan.value)
  }, [searchParams, pathname, onResolved])

  return null
}
