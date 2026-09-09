'use client'

import React from 'react'

const HEIGHT_VAR = '--ys-visual-viewport-height'
const BLOCK_SIZE_VAR = '--ys-visual-viewport-block-size'
const OFFSET_VAR = '--ys-visual-viewport-offset-top'
const PAN_VAR = '--ys-visual-viewport-pan-top'
const CHAT_ROOT_SELECTOR = ".yousafe-messenger .ys-chatscreen[data-mobile-view='chat']"
const CHAT_CANVAS_SELECTOR = `${CHAT_ROOT_SELECTOR} [data-chat-canvas]`
const COMPOSER_INPUT_SELECTOR = `${CHAT_ROOT_SELECTOR} .comp-input`

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
 *   mobile conversations pair it with a separately published visual pan and
 *   stay aligned with the on-screen viewport even when WebKit pans the page.
 *
 * iOS 26 has an additional fixed-position regression: the browser can visually
 * pan the page while fixed descendants are anchored against stale layout
 * geometry. Some builds also under-report VisualViewport.offsetTop while
 * pageTop reflects the larger pan. We therefore publish a defensive pan value
 * derived from both signals. CSS keeps the fixed chat anchored at top: 0 and
 * applies the pan as a compositor transform instead of feeding it back into
 * fixed-position layout.
 *
 * Composer focus controls compact padding, not a guessed browser-chrome
 * reserve. VisualViewport supplies the visible rectangle; subtracting another
 * URL-bar/input-assistant allowance double-counts native UI and leaves a gap.
 *
 * This coordinator is intentionally surface-agnostic. Student, attorney,
 * consultant, admin, Marketplace Messages, and the direct Marketplace provider
 * drawer all use the same .yousafe-messenger + ChatScreen contract. When more
 * than one Messenger exists in the DOM, tail pinning is scoped to the focused
 * (or otherwise visible) chat so a keyboard resize cannot scroll a hidden or
 * background conversation by mistake.
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
    let focusFrame = 0
    let focusTimers: number[] = []
    const nearBottomByCanvas = new WeakMap<HTMLElement, boolean>()
    let unfocusedVisualHeight = Math.max(1, Math.round(window.visualViewport?.height || window.innerHeight))

    const composerIsFocused = () => {
      const active = document.activeElement
      return active instanceof HTMLElement && active.matches(COMPOSER_INPUT_SELECTOR)
    }

    const publishComposerFocus = (focused: boolean) => {
      root.dataset.ysMessengerComposerFocused = focused ? 'true' : 'false'
    }

    const activeChatRoot = () => {
      const active = document.activeElement
      if (active instanceof HTMLElement) {
        const focusedRoot = active.closest<HTMLElement>(CHAT_ROOT_SELECTOR)
        if (focusedRoot) return focusedRoot
      }

      const roots = Array.from(document.querySelectorAll<HTMLElement>(CHAT_ROOT_SELECTOR))
      return roots.find((candidate) => {
        const style = window.getComputedStyle(candidate)
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && candidate.getClientRects().length > 0
      }) || roots[0] || null
    }

    const activeChatCanvas = () => activeChatRoot()?.querySelector<HTMLElement>('[data-chat-canvas]') || null

    const pinChatTailIfNeeded = () => {
      const canvas = activeChatCanvas()
      if (!canvas || nearBottomByCanvas.get(canvas) === false) return
      if (tailFrame) window.cancelAnimationFrame(tailFrame)
      tailFrame = window.requestAnimationFrame(() => {
        tailFrame = 0
        const currentCanvas = activeChatCanvas()
        if (!currentCanvas || nearBottomByCanvas.get(currentCanvas) === false) return
        currentCanvas.scrollTop = currentCanvas.scrollHeight
      })
    }

    const apply = () => {
      frame = 0
      const viewport = window.visualViewport
      const rawHeight = viewport?.height || window.innerHeight
      const visualHeight = Math.max(1, Math.round(rawHeight))
      const offsetTop = Math.max(0, Math.round(viewport?.offsetTop || 0))
      const pageTop = Math.max(0, Math.round(viewport?.pageTop ?? (window.scrollY + offsetTop)))
      const layoutScrollTop = Math.max(
        0,
        Math.round(window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0),
      )
      // Under normal VisualViewport semantics pageTop - scrollY === offsetTop.
      // iOS 26 can under-report offsetTop during keyboard pan, so prefer the
      // larger equivalent signal and feed that to the compositor transform.
      const visualPanTop = Math.max(offsetTop, pageTop - layoutScrollTop)
      // Normal-flow dashboard shells need their bottom edge to reach the visual
      // viewport bottom even when Safari pans the layout viewport. Fixed mobile
      // chats consume visualHeight and visualPanTop as separate values.
      const visibleBottom = visualHeight + visualPanTop
      const focused = composerIsFocused()

      // Keep the focus marker synchronized even if Safari restores a page from
      // bfcache or changes activeElement without delivering the expected event.
      publishComposerFocus(focused)

      // Preserve the keyboard-open marker for diagnostics and any consumers
      // that genuinely need keyboard-height evidence. Crucially, Messenger's
      // compact composer padding no longer depends on this heuristic.
      if (!focused) unfocusedVisualHeight = visualHeight
      const keyboardOpen = isIOSWebKit
        && !standalone
        && focused
        && visualHeight < unfocusedVisualHeight - 80

      root.dataset.ysKeyboardOpen = keyboardOpen ? 'true' : 'false'
      root.style.setProperty(HEIGHT_VAR, `${visibleBottom}px`)
      root.style.setProperty(BLOCK_SIZE_VAR, `${visualHeight}px`)
      root.style.setProperty(OFFSET_VAR, `${offsetTop}px`)
      root.style.setProperty(PAN_VAR, `${visualPanTop}px`)

      // A keyboard resize reduces the canvas clientHeight without changing its
      // scrollTop. Each Messenger canvas keeps its own pre-resize near-bottom
      // state so the active thread follows the newest message like WhatsApp,
      // while any background/hidden Messenger remains untouched.
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
      if (!(target instanceof HTMLElement) || !target.matches(CHAT_CANVAS_SELECTOR)) return
      nearBottomByCanvas.set(
        target,
        target.scrollHeight - target.scrollTop - target.clientHeight < 120,
      )
    }

    // Do the first measurement synchronously during layout so an open thread
    // does not paint one frame at 100vh before being corrected.
    publishComposerFocus(composerIsFocused())
    apply()

    const viewport = window.visualViewport
    viewport?.addEventListener('resize', schedule)
    viewport?.addEventListener('scroll', schedule)
    window.addEventListener('resize', schedule)
    window.addEventListener('orientationchange', schedule)
    window.addEventListener('pageshow', schedule)
    document.addEventListener('scroll', onChatScroll, true)

    // Publish focus synchronously so CSS uses compact composer padding during
    // keyboard animation, without subtracting guessed native UI heights.
    // On focusout, defer one frame so moving focus between Messenger controls
    // cannot briefly collapse the app rectangle.
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target
      if (target instanceof HTMLElement && target.matches(COMPOSER_INPUT_SELECTOR)) {
        publishComposerFocus(true)
        const canvas = target.closest<HTMLElement>(CHAT_ROOT_SELECTOR)?.querySelector<HTMLElement>('[data-chat-canvas]')
        if (canvas && !nearBottomByCanvas.has(canvas)) {
          nearBottomByCanvas.set(canvas, canvas.scrollHeight - canvas.scrollTop - canvas.clientHeight < 120)
        }
      }
      schedule()
      scheduleSettledMeasurements()
    }

    const onFocusOut = (event: FocusEvent) => {
      const target = event.target
      if (target instanceof HTMLElement && target.matches(COMPOSER_INPUT_SELECTOR)) {
        if (focusFrame) window.cancelAnimationFrame(focusFrame)
        focusFrame = window.requestAnimationFrame(() => {
          focusFrame = 0
          publishComposerFocus(composerIsFocused())
          schedule()
        })
      } else {
        schedule()
      }
      scheduleSettledMeasurements()
    }

    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        publishComposerFocus(composerIsFocused())
        schedule()
        scheduleSettledMeasurements()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      if (tailFrame) window.cancelAnimationFrame(tailFrame)
      if (focusFrame) window.cancelAnimationFrame(focusFrame)
      focusTimers.forEach((timer) => window.clearTimeout(timer))
      viewport?.removeEventListener('resize', schedule)
      viewport?.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('orientationchange', schedule)
      window.removeEventListener('pageshow', schedule)
      document.removeEventListener('scroll', onChatScroll, true)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      document.removeEventListener('visibilitychange', onVisibility)
      delete root.dataset.ysIosWebkit
      delete root.dataset.ysStandalone
      delete root.dataset.ysKeyboardOpen
      delete root.dataset.ysMessengerComposerFocused
      root.style.removeProperty(HEIGHT_VAR)
      root.style.removeProperty(BLOCK_SIZE_VAR)
      root.style.removeProperty(OFFSET_VAR)
      root.style.removeProperty(PAN_VAR)
    }
  }, [])

  return null
}
