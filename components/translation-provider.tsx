"use client"

import { type ReactNode } from "react"
import { LanguageProvider } from "@/contexts/language-context"
import { LanguageSelector } from "@/components/language-selector"
import { TranslationBoundary } from "@/components/translation-boundary"

export function TranslationProvider({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider>
      <TranslationBoundary>{children}</TranslationBoundary>
      <LanguageSelector />
    </LanguageProvider>
  )
}
