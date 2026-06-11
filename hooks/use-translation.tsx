"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useLanguage } from "@/contexts/language-context"
import { getLocalTranslation } from "@/lib/translations"

// In-memory cache — fast hot path. Persists to localStorage too so
// repeat page loads skip the network entirely.
const clientCache = new Map<string, string>()
const translationQueue = new Map<string, Promise<string>>()
const TRANSLATION_ENDPOINTS = ["/api/translate", "https://yousafeconsultancy.com/api/translate"]
const BATCH_ENDPOINTS = ["/api/translate/batch", "https://yousafeconsultancy.com/api/translate/batch"]

const STORAGE_KEY = "ys.translate.cache.v2"
const STORAGE_LIMIT = 2000   // entries; older drops on overflow
let storageHydrated = false

function hydrateFromStorage() {
  if (storageHydrated || typeof window === "undefined") return
  storageHydrated = true
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Array<[string, string]>
    if (!Array.isArray(parsed)) return
    for (const [k, v] of parsed) {
      if (typeof k === "string" && typeof v === "string") clientCache.set(k, v)
    }
  } catch { /* corrupt storage — ignore */ }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null
function schedulePersist() {
  if (typeof window === "undefined") return
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    try {
      // Take only the last STORAGE_LIMIT entries (Map preserves insertion
      // order, so this is FIFO eviction).
      const entries = Array.from(clientCache.entries())
      const tail = entries.length > STORAGE_LIMIT ? entries.slice(-STORAGE_LIMIT) : entries
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tail))
    } catch { /* quota full — drop the write, in-memory cache still works */ }
  }, 400)
}

// CRITICAL: cache a translation ONLY when it's actually different from
// the source. MyMemory returns the original English when it's rate-
// limited, can't translate a proper noun, or the language pair fails.
// Caching that English-equals-source string used to permanently freeze
// footer items as untranslated -- subsequent runs hit the cache, got
// English back, and never retried. Treat same-as-source as a miss so
// the next page load (with cache cleared) re-attempts.
function cacheTranslation(key: string, source: string, translated: string): string {
  const norm = (translated ?? "").trim()
  if (!norm) return source
  if (norm === source.trim()) {
    // Don't poison the cache with a failed translation.
    return source
  }
  clientCache.set(key, translated)
  schedulePersist()
  return translated
}


// ── Last-resort direct fallback ─────────────────────────────────────
// Call MyMemory straight from the browser (free, CORS-enabled). Used ONLY
// when every YouSafe translate endpoint fails — e.g. the portal Worker
// hitting its CPU limit (CF 1102) — so pages never silently stay English.
// Small concurrency pool: MyMemory rate-limits aggressive parallelism.
async function myMemoryDirect(text: string, targetLang: string): Promise<string> {
  try {
    const u = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${encodeURIComponent(targetLang)}`
    const r = await fetch(u)
    if (!r.ok) return text
    const d = await r.json()
    const out = d?.responseData?.translatedText
    return typeof out === "string" && out && !/^MYMEMORY WARNING/i.test(out) ? out : text
  } catch { return text }
}

async function myMemoryBatch(texts: string[], targetLang: string): Promise<string[]> {
  const results: string[] = new Array(texts.length)
  let next = 0
  const workers = Array.from({ length: Math.min(4, texts.length) }, async () => {
    while (next < texts.length) {
      const idx = next++
      results[idx] = await myMemoryDirect(texts[idx], targetLang)
    }
  })
  await Promise.all(workers)
  return results
}

export async function translateTexts(texts: string[], targetLang: string): Promise<string[]> {
  if (!texts.length || targetLang === "en") return [...texts]
  hydrateFromStorage()

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
      schedulePersist()
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
        const source = missingTexts[k]
        const translated = typeof translations[k] === "string" ? (translations[k] as string) : source
        const cacheKey = `${targetLang}:${source}`
        results[idx] = cacheTranslation(cacheKey, source, translated)
      }
      return results
    } catch {}
  }

  // Every YouSafe endpoint failed (Worker down / rate-limited). Go straight
  // to MyMemory from the browser instead of re-hitting dead endpoints
  // per-string — the page translates even during a portal outage.
  const fallback = await myMemoryBatch(missingTexts, targetLang)
  for (let k = 0; k < missingIndices.length; k++) {
    const idx = missingIndices[k]
    const source = missingTexts[k]
    results[idx] = cacheTranslation(`${targetLang}:${source}`, source, fallback[k])
  }
  return results
}

export async function translateText(text: string, targetLang: string): Promise<string> {
  const normalized = text.trim()
  if (!normalized || targetLang === "en") return text
  hydrateFromStorage()

  const cacheKey = `${targetLang}:${normalized}`
  const cached = clientCache.get(cacheKey)
  if (cached) return cached

  const localTranslation = getLocalTranslation(normalized, targetLang)
  if (localTranslation) {
    clientCache.set(cacheKey, localTranslation)
    schedulePersist()
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
          const result = typeof data?.translatedText === "string" ? data.translatedText : normalized
          return cacheTranslation(cacheKey, normalized, result)
        } catch {}
      }
      // Endpoints all failed — last resort: direct MyMemory.
      const direct = await myMemoryDirect(normalized, targetLang)
      return cacheTranslation(cacheKey, normalized, direct)
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
    // Use the batch path -- one network round-trip instead of N. The
    // previous Promise.all(map(translateText)) issued one request per
    // string which throttled MyMemory hard and amplified perceived
    // latency.
    translateTexts(texts, language).then((results) => {
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
