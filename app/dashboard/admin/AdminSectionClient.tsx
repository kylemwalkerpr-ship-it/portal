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

const PORTAL_URL = 'https://portal.yousafeconsultancy.com'

export default function AdminSectionClient() {
  const { signOut } = useClerk()
  const loggingOut = React.useRef(false)

  const handleLogout = React.useCallback(() => {
    if (loggingOut.current) return
    loggingOut.current = true
    const watchdog = window.setTimeout(() => {
      window.location.replace(PORTAL_URL)
    }, 3000)
    signOut({ redirectUrl: PORTAL_URL })
      .catch(() => window.location.replace(PORTAL_URL))
      .finally(() => window.clearTimeout(watchdog))
  }, [signOut])

  return <AdminApp onLogout={handleLogout} />
}
