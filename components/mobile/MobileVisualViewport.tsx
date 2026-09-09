'use client'

import React from 'react'

const HEIGHT_VAR = '--ys-visual-viewport-height'
const BLOCK_SIZE_VAR = '--ys-visual-viewport-block-size'
const OFFSET_VAR = '--ys-visual-viewport-offset-top'

/**
 * Keep full-screen Portal surfaces tied to what the user can actually see.
 *
 * iOS Safari can leave the layout viewport taller than the visual viewport
 * while its bottom toolbar or software keyboard is present. CSS 100vh/100dvh
 * alone is therefore not a sufficient ownership boundary for app-like flex
 * layouts: the final flex child (Messenger's composer) can sit underneath
 * browser chrome even though the document itself is not scrollable.
 *
 * Two measurements are intentionally published:
 * - --ys-visual-viewport-height is the visible bottom edge in layout-viewport
 *   coordinates. Existing dashboard shells use it while remaining in normal
 *   document flow.
 * - --ys-visual-viewport-block-size is the actual visible height. Full-screen
 *   mobile conversations pair it with --ys-visual-viewport-offset-top and
 *   become fixed to the VisualViewport, which prevents Safari's keyboard pan
 *   from clipping the chat header or composer.
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
      const visualHeight = Math.max(1, Math.round(rawHeight))
      const offsetTop = Math.max(0, Math.round(viewport?.offsetTop || 0))
      // Normal-flow dashboard shells need their bottom edge to reach the visual
      // viewport bottom even when Safari pans the layout viewport. Fixed mobile
      // chats instead consume visualHeight + offsetTop as separate values.
      const visibleBottom = visualHeight + offsetTop

      root.style.setProperty(HEIGHT_VAR, `${visibleBottom}px`)
      root.style.setProperty(BLOCK_SIZE_VAR, `${visualHeight}px`)
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
      root.style.removeProperty(BLOCK_SIZE_VAR)
      root.style.removeProperty(OFFSET_VAR)
    }
  }, [])

  return null
}
