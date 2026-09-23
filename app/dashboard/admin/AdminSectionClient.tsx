'use client'
/**
 * Client wrapper for the standalone /dashboard/admin/<section> routes.
 * Renders the same AdminApp shell as /dashboard — AdminApp reads the
 * section from the pathname, so navigation, refresh, and the back button
 * all work identically whichever entry point the admin used.
 *
 * Logout mirrors DashboardClient's hardened flow: Clerk's signOut with a
 * redirect, a rejection fallback, and a 3s watchdog for the intermittent
 * case where signOut stalls without resolving.
 */
import React from 'react'
import dynamic from 'next/dynamic'
import { useClerk } from '@clerk/nextjs'

const AdminApp = dynamic(() => import('@/components/design/admin'), { ssr: false })

const MARKET_HOME_URL = 'https://market.yousafeconsultancy.com/'

export default function AdminSectionClient() {
  const { signOut } = useClerk()
  const loggingOut = React.useRef(false)

  const handleLogout = React.useCallback(() => {
    if (loggingOut.current) return
    loggingOut.current = true
    const watchdog = window.setTimeout(() => {
      window.location.replace(MARKET_HOME_URL)
    }, 3000)
    signOut({ redirectUrl: MARKET_HOME_URL })
      .catch(() => window.location.replace(MARKET_HOME_URL))
      .finally(() => window.clearTimeout(watchdog))
  }, [signOut])

  return <AdminApp onLogout={handleLogout} />
}
