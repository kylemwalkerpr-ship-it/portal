"use client"

import { LanguageSelector } from "@/components/language-selector"

/**
 * GlobalLanguageBar
 *
 * Fixed top-right language switcher that appears on EVERY page site-wide.
 * Mounted once in app/layout.tsx so it overlays every route automatically —
 * marketing, marketplace, dashboards, auth, admin. No per-page wiring needed.
 *
 * Anchored to top-right with `data-no-translate` so the Google Translate
 * Element doesn't try to retranslate its own controls. z-index sits above
 * dashboards but below modals (10010 vs 10500/dialog).
 */
export function GlobalLanguageBar() {
  return (
    <div
      data-no-translate
      style={{
        position: "fixed",
        top: 12,
        right: 12,
        zIndex: 10010,
        pointerEvents: "auto",
      }}
    >
      <LanguageSelector placement="inline" />
    </div>
  )
}
