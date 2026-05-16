"use client"

import { type ReactNode } from "react"
import { LanguageProvider } from "@/contexts/language-context"
import { TranslationBoundary } from "@/components/translation-boundary"

// Note: the site-wide language selector now lives in <GlobalLanguageBar />,
// mounted once from app/layout.tsx so it appears on every page (marketing,
// marketplace, dashboards, auth). The old conditional "fixed only outside
// /dashboard" pattern is gone — we want the switcher universally available.
export function TranslationProvider({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider>
      <TranslationBoundary>{children}</TranslationBoundary>
    </LanguageProvider>
  )
}
