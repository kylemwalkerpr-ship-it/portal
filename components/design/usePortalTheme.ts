'use client'

import { useEffect, useState } from 'react'
import { PortalThemeId, DEFAULT_THEME, THEME_IDS } from '@/lib/portalThemes'

const STORAGE_KEY = 'yousafe.portal.theme'

export function usePortalTheme(): [PortalThemeId, (next: PortalThemeId) => void] {
  const [theme, setTheme] = useState<PortalThemeId>(DEFAULT_THEME)

  useEffect(() => {
    // 1. Read localStorage first (instant — no flash).
    const cached = localStorage.getItem(STORAGE_KEY)
    if (cached && (THEME_IDS as string[]).includes(cached)) {
      setTheme(cached as PortalThemeId)
      document.documentElement.setAttribute('data-portal-theme', cached)
    }
    // 2. Reconcile with server in the background.
    fetch('/api/profile/theme', { credentials: 'same-origin' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const server = d?.theme
        if (server && server !== cached) {
          localStorage.setItem(STORAGE_KEY, server)
          setTheme(server)
          document.documentElement.setAttribute('data-portal-theme', server)
        }
      })
      .catch(() => {})
  }, [])

  const apply = (next: PortalThemeId) => {
    setTheme(next)
    localStorage.setItem(STORAGE_KEY, next)
    document.documentElement.setAttribute('data-portal-theme', next)
    fetch('/api/profile/theme', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ theme: next }),
    }).catch(() => {})
  }

  return [theme, apply]
}
