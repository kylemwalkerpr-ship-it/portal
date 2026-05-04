import { NextRequest, NextResponse } from "next/server"

const MYMEMORY_URL = "https://api.mymemory.translated.net/get"
const LIBRETRANSLATE_ENDPOINTS = [
  "https://translate.fedilab.app/translate",
  "https://translate.fortytwo-it.com/translate",
]

const myMemoryLangMap: Record<string, string> = {
  en: "en",
  es: "es",
  fr: "fr",
  ar: "ar",
  zh: "zh-CN",
  hi: "hi",
  pt: "pt",
}

const libreTranslateLangMap: Record<string, string> = {
  en: "en",
  es: "es",
  fr: "fr",
  ar: "ar",
  zh: "zh",
  hi: "hi",
  pt: "pt",
}

async function translateWithMyMemory(text: string, sourceLang: string, targetLang: string): Promise<string | null> {
  try {
    const url = new URL(MYMEMORY_URL)
    url.searchParams.set("q", text.substring(0, 500))
    url.searchParams.set("langpair", `${myMemoryLangMap[sourceLang] || sourceLang}|${myMemoryLangMap[targetLang] || targetLang}`)
    url.searchParams.set("de", "info@yousafeconsultancy.com")

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)
    const response = await fetch(url.toString(), { signal: controller.signal })
    clearTimeout(timeoutId)

    if (!response.ok) return null
    const data = await response.json()
    const translated = data.responseData?.translatedText
    if (
      data.responseStatus === 200 &&
      translated &&
      !translated.includes("PLEASE SELECT") &&
      !translated.includes("MYMEMORY WARNING") &&
      !translated.includes("INVALID TARGET")
    ) {
      return translated
    }
  } catch {}

  return null
}

async function translateWithLibreTranslate(
  endpoint: string,
  text: string,
  sourceLang: string,
  targetLang: string
): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000)
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: text,
        source: libreTranslateLangMap[sourceLang] || sourceLang,
        target: libreTranslateLangMap[targetLang] || targetLang,
        format: "text",
      }),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!response.ok) return null
    const data = await response.json()
    return data.translatedText || null
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const { text, targetLang, sourceLang = "en" } = await request.json()
    const normalized = typeof text === "string" ? text.trim() : ""

    if (!normalized || !targetLang) {
      return NextResponse.json({ error: "Missing required fields: text and targetLang" }, { status: 400 })
    }

    if (targetLang === sourceLang) return NextResponse.json({ translatedText: normalized })

    const myMemoryResult = await translateWithMyMemory(normalized, sourceLang, targetLang)
    if (myMemoryResult) return NextResponse.json({ translatedText: myMemoryResult })

    for (const endpoint of LIBRETRANSLATE_ENDPOINTS) {
      const result = await translateWithLibreTranslate(endpoint, normalized, sourceLang, targetLang)
      if (result) return NextResponse.json({ translatedText: result })
    }

    return NextResponse.json({ translatedText: normalized, fallback: true })
  } catch {
    return NextResponse.json({ translatedText: "", error: "Translation failed" }, { status: 500 })
  }
}
