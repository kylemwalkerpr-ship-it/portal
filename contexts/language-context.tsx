"use client"

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"

export type Language = "en" | "es" | "fr" | "ar" | "zh" | "hi" | "pt"

export const languages: { code: Language; label: string; nativeLabel: string; dir?: "ltr" | "rtl" }[] = [
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "es", label: "Spanish", nativeLabel: "Espanol" },
  { code: "fr", label: "French", nativeLabel: "Francais" },
  { code: "ar", label: "Arabic", nativeLabel: "Arabic", dir: "rtl" },
  { code: "zh", label: "Chinese", nativeLabel: "Chinese" },
  { code: "hi", label: "Hindi", nativeLabel: "Hindi" },
  { code: "pt", label: "Portuguese", nativeLabel: "Portugues" },
]

interface LanguageContextType {
  language: Language
  setLanguage: (language: Language) => void
  languageLabel: string
  direction: "ltr" | "rtl"
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)
const STORAGE_KEY = "preferredLanguage"

function isLanguage(value: string | null): value is Language {
  return !!value && languages.some((language) => language.code === value)
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en")

  useEffect(() => {
    const urlLang = new URLSearchParams(window.location.search).get("lang")
    const stored = localStorage.getItem(STORAGE_KEY)
    setLanguageState(isLanguage(urlLang) ? urlLang : isLanguage(stored) ? stored : "en")
  }, [])

  const setLanguage = useCallback((newLanguage: Language) => {
    setLanguageState(newLanguage)
    localStorage.setItem(STORAGE_KEY, newLanguage)
  }, [])

  const currentLanguage = languages.find((item) => item.code === language) ?? languages[0]
  const direction = currentLanguage.dir ?? "ltr"

  useEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dir = direction
  }, [direction, language])

  return (
    <LanguageContext.Provider value={{ language, setLanguage, languageLabel: currentLanguage.label, direction }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) throw new Error("useLanguage must be used within a LanguageProvider")
  return context
}
