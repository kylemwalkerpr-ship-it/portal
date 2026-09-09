'use client'

import React from 'react'

const HEIGHT_VAR = '--ys-visual-viewport-height'
const BLOCK_SIZE_VAR = '--ys-visual-viewport-block-size'
const OFFSET_VAR = '--ys-visual-viewport-offset-top'
const CHAT_CANVAS_SELECTOR = ".yousafe-messenger .ys-chatscreen[data-mobile-view='chat'] [data-chat-canvas]"
const COMPOSER_INPUT_SELECTOR = ".yousafe-messenger .ys-chatscreen[data-mobile-view='chat'] .comp-input"

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
 *
 * iOS browser chrome needs one additional signal. When Safari keeps its URL
 * bar immediately above the software keyboard, VisualViewport.height can still
 * include the pixels covered by that browser UI. We therefore publish
 * data-ys-ios-webkit / data-ys-keyboard-open on <html>; CSS uses those flags to
 * reserve only the dynamic browser-chrome delta while the composer is focused.
 */
export default function MobileVisualViewport() {
  React.useLayoutEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return

    const root = document.documentElement
    const nav = navigator as Navigator & { standalone?: boolean }
    const isIOSWebKit = /iPad|iPhone|iPod/.test(nav.userAgent)
      || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
    const standalone = window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true

    root.dataset.ysIosWebkit = isIOSWebKit ? 'true' : 'false'
    root.dataset.ysStandalone = standalone ? 'true' : 'false'

    let frame = 0
    let tailFrame = 0
    let focusTimers: number[] = []
    let chatNearBottom = true
    let unfocusedVisualHeight = Math.max(1, Math.round(window.visualViewport?.height || window.innerHeight))

    const composerIsFocused = () => {
      const active = document.activeElement
      return active instanceof HTMLElement && active.matches(COMPOSER_INPUT_SELECTOR)
    }

    const pinChatTailIfNeeded = () => {
      if (!chatNearBottom) return
      if (tailFrame) window.cancelAnimationFrame(tailFrame)
      tailFrame = window.requestAnimationFrame(() => {
        tailFrame = 0
        const canvas = document.querySelector<HTMLElement>(CHAT_CANVAS_SELECTOR)
        if (!canvas) return
        canvas.scrollTop = canvas.scrollHeight
      })
    }

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
      const focused = composerIsFocused()

      // Remember the current keyboard-closed height rather than the historical
      // maximum so rotating portrait -> landscape cannot make a hardware
      // keyboard look like a software-keyboard shrink.
      if (!focused) unfocusedVisualHeight = visualHeight
      const keyboardOpen = isIOSWebKit
        && !standalone
        && focused
        && visualHeight < unfocusedVisualHeight - 80

      root.dataset.ysKeyboardOpen = keyboardOpen ? 'true' : 'false'
      root.style.setProperty(HEIGHT_VAR, `${visibleBottom}px`)
      root.style.setProperty(BLOCK_SIZE_VAR, `${visualHeight}px`)
      root.style.setProperty(OFFSET_VAR, `${offsetTop}px`)

      // A keyboard resize reduces the canvas clientHeight without changing its
      // scrollTop. If the reader was already at the conversation tail, keep the
      // newest message immediately above the composer just like WhatsApp. If
      // they intentionally scrolled up, chatNearBottom is false and we do not
      // yank their reading position.
      pinChatTailIfNeeded()
    }

    const schedule = () => {
      if (frame) window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(apply)
    }

    const scheduleSettledMeasurements = () => {
      focusTimers.forEach((timer) => window.clearTimeout(timer))
      // Safari with the bottom URL bar can report its final VisualViewport late
      // in the keyboard animation. Sample the settled geometry several times so
      // the composer never gets stranded under stale browser-chrome metrics.
      focusTimers = [80, 180, 360, 650].map((delay) => window.setTimeout(schedule, delay))
    }

    const onChatScroll = (event: Event) => {
      const target = event.target
      if (!(target instanceof HTMLElement) || !target.matches('[data-chat-canvas]')) return
      chatNearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 120
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
    document.addEventListener('scroll', onChatScroll, true)

    // VisualViewport resize is the primary keyboard signal. Focus changes also
    // trigger a short set of delayed measurements because iOS can expose the
    // final URL-bar/keyboard geometry only after its animation has settled.
    const onFocusChange = () => {
      schedule()
      scheduleSettledMeasurements()
    }
    document.addEventListener('focusin', onFocusChange)
    document.addEventListener('focusout', onFocusChange)

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        schedule()
        scheduleSettledMeasurements()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      if (tailFrame) window.cancelAnimationFrame(tailFrame)
      focusTimers.forEach((timer) => window.clearTimeout(timer))
      viewport?.removeEventListener('resize', schedule)
      viewport?.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('orientationchange', schedule)
      window.removeEventListener('pageshow', schedule)
      document.removeEventListener('scroll', onChatScroll, true)
      document.removeEventListener('focusin', onFocusChange)
      document.removeEventListener('focusout', onFocusChange)
      document.removeEventListener('visibilitychange', onVisibility)
      delete root.dataset.ysIosWebkit
      delete root.dataset.ysStandalone
      delete root.dataset.ysKeyboardOpen
      root.style.removeProperty(HEIGHT_VAR)
      root.style.removeProperty(BLOCK_SIZE_VAR)
      root.style.removeProperty(OFFSET_VAR)
    }
  }, [])

  return null
}
