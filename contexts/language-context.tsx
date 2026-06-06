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
const COOKIE_NAME = "yousafe-lang-default"

function isLanguage(value: string | null | undefined): value is Language {
  return !!value && languages.some((language) => language.code === value)
}

/** Read a cookie value by name (returns null if missing). Edge-safe. */
function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null
  const match = document.cookie
    .split(";")
    .map(c => c.trim())
    .find(c => c.startsWith(name + "="))
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en")

  useEffect(() => {
    // Priority order:
    //   1. ?lang=             — explicit per-request choice (hreflang, links, pill)
    //   2. localStorage       — returning visitor preference
    //   3. yousafe-lang-default cookie — server's geo/Accept-Language inference
    //                          (set by middleware on apps that have it)
    //   4. navigator.language — final client-side fallback (works under static
    //                          export where middleware can't run)
    //   5. 'en'               — last resort
    // Priority: URL > cross-subdomain cookie > local storage > navigator.
    // Cookie outranks localStorage so that a fresh choice on portal /
    // market / apex propagates instantly to every other subdomain
    // instead of being overridden by stale per-origin storage that was
    // written before the user changed their preference.
    const urlLang = new URLSearchParams(window.location.search).get("lang")
    if (isLanguage(urlLang)) { setLanguageState(urlLang); return }
    const cookieLang = readCookie(COOKIE_NAME)
    if (isLanguage(cookieLang)) { setLanguageState(cookieLang); return }
    const stored = localStorage.getItem(STORAGE_KEY)
    if (isLanguage(stored)) { setLanguageState(stored); return }
    const navLang = (navigator.language || "").toLowerCase().slice(0, 2)
    if (isLanguage(navLang)) { setLanguageState(navLang); return }
  }, [])

  const setLanguage = useCallback((newLanguage: Language) => {
    setLanguageState(newLanguage)
    try { localStorage.setItem(STORAGE_KEY, newLanguage) } catch {}
    // Write a parent-domain cookie so the choice follows the user across
    // every subdomain (portal, market, apex, usa, uk, ca, legal). 1-year
    // max-age, SameSite=Lax keeps it on top-level navigations, Secure
    // lets us drop it on every site we serve over HTTPS. The leading dot
    // on the domain makes browsers attach this cookie to every host
    // matching *.yousafeconsultancy.com.
    try {
      const host = window.location.hostname
      const isApex = host === "yousafeconsultancy.com" || host.endsWith(".yousafeconsultancy.com")
      const domainAttr = isApex ? "; Domain=.yousafeconsultancy.com" : ""
      const secureAttr = window.location.protocol === "https:" ? "; Secure" : ""
      document.cookie = `${COOKIE_NAME}=${encodeURIComponent(newLanguage)}; Path=/; Max-Age=31536000; SameSite=Lax${domainAttr}${secureAttr}`
    } catch {}
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
