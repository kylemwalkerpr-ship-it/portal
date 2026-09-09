'use client'

import React from 'react'

const HEIGHT_VAR = '--ys-visual-viewport-height'
const OFFSET_VAR = '--ys-visual-viewport-offset-top'
const MIN_HEIGHT = 320

/**
 * Keep full-screen Portal surfaces tied to what the user can actually see.
 *
 * iOS Safari can leave the layout viewport taller than the visual viewport
 * while its bottom toolbar or software keyboard is present. CSS 100vh/100dvh
 * alone is therefore not a sufficient ownership boundary for app-like flex
 * layouts: the final flex child (Messenger's composer) can sit underneath
 * browser chrome even though the document itself is not scrollable.
 *
 * This coordinator publishes the live VisualViewport geometry as CSS custom
 * properties. The mobile viewport contract consumes them for every role
 * dashboard and full-screen Messenger surface, while retaining 100dvh as the
 * no-JS fallback. It is intentionally mounted once at the root instead of
 * inside a student-only component so clients, attorneys and consultants behave
 * alike.
 */
export default function MobileVisualViewport() {
  React.useLayoutEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return

    const root = document.documentElement
    let frame = 0
    let focusTimer = 0

    const apply = () => {
      frame = 0
      const viewport = window.visualViewport
      const rawHeight = viewport?.height || window.innerHeight
      const offsetTop = Math.max(0, Math.round(viewport?.offsetTop || 0))
      // visualViewport.height is the visible block size. During keyboard-driven
      // viewport panning Safari may also move offsetTop; adding that offset keeps
      // the shell's bottom edge aligned with the visible bottom edge instead of
      // leaving a dead strip beneath the composer.
      const visibleBottom = Math.max(MIN_HEIGHT, Math.round(rawHeight) + offsetTop)

      root.style.setProperty(HEIGHT_VAR, `${visibleBottom}px`)
      root.style.setProperty(OFFSET_VAR, `${offsetTop}px`)
    }

    const schedule = () => {
      if (frame) window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(apply)
    }

    // Do the first measurement synchronously during layout so an open thread
    // does not paint one frame at 100vh before being corrected.
    apply()

    const viewport = window.visualViewport
    viewport?.addEventListener('resize', schedule)
    viewport?.addEventListener('scroll', schedule)
    window.addEventListener('resize', schedule)
    window.addEventListener('orientationchange', schedule)
    window.addEventListener('pageshow', schedule)

    // VisualViewport resize is the primary keyboard signal. The focus hooks
    // are a small Safari fallback for versions that report the final keyboard
    // geometry one task later than focus.
    const onFocusChange = () => {
      schedule()
      if (focusTimer) window.clearTimeout(focusTimer)
      focusTimer = window.setTimeout(schedule, 250)
    }
    document.addEventListener('focusin', onFocusChange)
    document.addEventListener('focusout', onFocusChange)

    const onVisibility = () => {
      if (document.visibilityState === 'visible') schedule()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      if (focusTimer) window.clearTimeout(focusTimer)
      viewport?.removeEventListener('resize', schedule)
      viewport?.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('orientationchange', schedule)
      window.removeEventListener('pageshow', schedule)
      document.removeEventListener('focusin', onFocusChange)
      document.removeEventListener('focusout', onFocusChange)
      document.removeEventListener('visibilitychange', onVisibility)
      root.style.removeProperty(HEIGHT_VAR)
      root.style.removeProperty(OFFSET_VAR)
    }
  }, [])

  return null
}
