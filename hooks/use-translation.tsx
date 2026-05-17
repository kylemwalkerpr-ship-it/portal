"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useLanguage } from "@/contexts/language-context"
import { getLocalTranslation } from "@/lib/translations"

const clientCache = new Map<string, string>()
const translationQueue = new Map<string, Promise<string>>()
const TRANSLATION_ENDPOINTS = ["/api/translate", "https://yousafeconsultancy.com/api/translate"]
const BATCH_ENDPOINTS = ["/api/translate/batch", "https://yousafeconsultancy.com/api/translate/batch"]

export async function translateTexts(texts: string[], targetLang: string): Promise<string[]> {
  if (!texts.length || targetLang === "en") return [...texts]

  // Resolve from local + client cache first; only ship uncached strings.
  const results: string[] = new Array(texts.length)
  const missingIndices: number[] = []
  const missingTexts: string[] = []

  for (let i = 0; i < texts.length; i++) {
    const original = texts[i]
    const normalized = (original ?? "").trim()
    if (!normalized) {
      results[i] = original
      continue
    }
    const cacheKey = `${targetLang}:${normalized}`
    const cached = clientCache.get(cacheKey)
    if (cached) {
      results[i] = cached
      continue
    }
    const local = getLocalTranslation(normalized, targetLang)
    if (local) {
      clientCache.set(cacheKey, local)
      results[i] = local
      continue
    }
    missingIndices.push(i)
    missingTexts.push(normalized)
  }

  if (!missingTexts.length) return results

  for (const endpoint of BATCH_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts: missingTexts, targetLang }),
      })
      if (!response.ok) continue
      const data = await response.json()
      const translations: unknown = data?.translations
      if (!Array.isArray(translations) || translations.length !== missingTexts.length) continue

      for (let k = 0; k < missingIndices.length; k++) {
        const idx = missingIndices[k]
        const translated = typeof translations[k] === "string" ? (translations[k] as string) : missingTexts[k]
        const cacheKey = `${targetLang}:${missingTexts[k]}`
        clientCache.set(cacheKey, translated)
        results[idx] = translated
      }
      return results
    } catch {}
  }

  // Batch failed — fall back to per-string translateText for the missing entries.
  const fallback = await Promise.all(missingTexts.map((t) => translateText(t, targetLang)))
  for (let k = 0; k < missingIndices.length; k++) {
    results[missingIndices[k]] = fallback[k]
  }
  return results
}

export async function translateText(text: string, targetLang: string): Promise<string> {
  const normalized = text.trim()
  if (!normalized || targetLang === "en") return text

  const cacheKey = `${targetLang}:${normalized}`
  const cached = clientCache.get(cacheKey)
  if (cached) return cached

  const localTranslation = getLocalTranslation(normalized, targetLang)
  if (localTranslation) {
    clientCache.set(cacheKey, localTranslation)
    return localTranslation
  }

  const pending = translationQueue.get(cacheKey)
  if (pending) return pending

  const fetchPromise = (async () => {
    try {
      for (const endpoint of TRANSLATION_ENDPOINTS) {
        try {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: normalized, targetLang }),
          })
          if (!response.ok) continue
          const data = await response.json()
          const result = data.translatedText || normalized
          clientCache.set(cacheKey, result)
          return result
        } catch {}
      }
      return normalized
    } finally {
      translationQueue.delete(cacheKey)
    }
  })()

  translationQueue.set(cacheKey, fetchPromise)
  return fetchPromise
}

export function useTranslation(text: string): string {
  const { language } = useLanguage()
  const [translatedText, setTranslatedText] = useState(text)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (language === "en") {
      setTranslatedText(text)
      return
    }

    translateText(text, language).then((result) => {
      if (mountedRef.current) setTranslatedText(result)
    })
  }, [language, text])

  return translatedText
}

export function useTranslations(texts: string[]): string[] {
  const { language } = useLanguage()
  const textsKey = useMemo(() => texts.join("|"), [texts])
  const [translatedTexts, setTranslatedTexts] = useState(texts)

  useEffect(() => {
    if (language === "en") {
      setTranslatedTexts(texts)
      return
    }

    let cancelled = false
    Promise.all(texts.map((text) => translateText(text, language))).then((results) => {
      if (!cancelled) setTranslatedTexts(results)
    })

    return () => {
      cancelled = true
    }
  }, [language, texts, textsKey])

  return translatedTexts
}

export function T({ children }: { children: string }) {
  return <>{useTranslation(children)}</>
}
