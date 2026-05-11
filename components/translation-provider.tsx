"use client"

import { type ReactNode, useEffect, useState } from "react"
import { LanguageProvider } from "@/contexts/language-context"
import { LanguageSelector } from "@/components/language-selector"
import { TranslationBoundary } from "@/components/translation-boundary"

export function TranslationProvider({ children }: { children: ReactNode }) {
  const [showFixedSelector, setShowFixedSelector] = useState(false)

  useEffect(() => {
    const update = () => setShowFixedSelector(!window.location.pathname.startsWith("/dashboard"))
    update()
    window.addEventListener("popstate", update)
    window.addEventListener("yousafe-navigate", update)
    return () => {
      window.removeEventListener("popstate", update)
      window.removeEventListener("yousafe-navigate", update)
    }
  }, [])

  return (
    <LanguageProvider>
      <TranslationBoundary>{children}</TranslationBoundary>
      {showFixedSelector && <LanguageSelector />}
    </LanguageProvider>
  )
}
