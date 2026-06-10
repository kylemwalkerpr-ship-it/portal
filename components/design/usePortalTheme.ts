'use client'

import { useEffect, useState } from 'react'
import { PortalThemeId, DEFAULT_THEME, THEME_IDS } from '@/lib/portalThemes'

const STORAGE_KEY = 'yousafe.portal.theme'
// Same-tab broadcast channel. The `storage` event doesn't fire in the tab
// that wrote it, so without a custom event a ThemePicker in settings and
// the dashboard shell hook (two separate React useState slots) couldn't
// agree on the current theme. They'd both store correctly but read each
// other's stale state.
const SYNC_EVENT = 'yousafe-portal-theme-changed'

function applyAttribute(value: string) {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-portal-theme', value)
}

export function usePortalTheme(): [PortalThemeId, (next: PortalThemeId) => void] {
  const [theme, setTheme] = useState<PortalThemeId>(DEFAULT_THEME)

  useEffect(() => {
    // 0. Apply saved appearance prefs (font / kerning / background) at boot.
    //    Every role shell calls usePortalTheme, so this is the one place
    //    that guarantees appearance is applied before Settings is opened.
    import('@/lib/portalAppearance').then(({ usePortalAppearance: _unused, applyAppearance, DEFAULT_APPEARANCE }) => {
      try {
        const raw = localStorage.getItem('yousafe.portal.appearance')
        const parsed = raw ? JSON.parse(raw) : null
        applyAppearance({ ...DEFAULT_APPEARANCE, ...(parsed && typeof parsed === 'object' ? parsed : {}) })
      } catch { applyAppearance(DEFAULT_APPEARANCE) }
    }).catch(() => {})
    // 1. Read localStorage first (instant — no flash).
    const cached = localStorage.getItem(STORAGE_KEY)
    if (cached && (THEME_IDS as string[]).includes(cached)) {
      setTheme(cached as PortalThemeId)
      applyAttribute(cached)
    }
    // 2. Reconcile with server in the background.
    fetch('/api/profile/theme', { credentials: 'same-origin' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const server = d?.theme
        if (server && server !== cached) {
          localStorage.setItem(STORAGE_KEY, server)
          setTheme(server)
          applyAttribute(server)
        }
      })
      .catch(() => {})

    // 3. Listen for same-tab theme changes (custom event) AND cross-tab
    // changes (storage event). Either updates this hook instance's state
    // so any code reading the theme value stays consistent.
    const onSync = (e: Event) => {
      const next = (e as CustomEvent<PortalThemeId>).detail
      if (next && (THEME_IDS as string[]).includes(next)) {
        setTheme(next)
        applyAttribute(next)
      }
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return
      if ((THEME_IDS as string[]).includes(e.newValue)) {
        setTheme(e.newValue as PortalThemeId)
        applyAttribute(e.newValue)
      }
    }
    window.addEventListener(SYNC_EVENT, onSync as EventListener)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(SYNC_EVENT, onSync as EventListener)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const apply = (next: PortalThemeId) => {
    setTheme(next)
    localStorage.setItem(STORAGE_KEY, next)
    applyAttribute(next)
    // Notify any other usePortalTheme() instances in this same tab.
    window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: next }))
    fetch('/api/profile/theme', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ theme: next }),
    }).catch(() => {})
  }

  return [theme, apply]
}
