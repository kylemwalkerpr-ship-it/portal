import { NextRequest, NextResponse } from "next/server"

const MYMEMORY_URL = "https://api.mymemory.translated.net/get"

const myMemoryLangMap: Record<string, string> = {
  en: "en",
  es: "es",
  fr: "fr",
  ar: "ar",
  zh: "zh-CN",
  hi: "hi",
  pt: "pt",
}

async function translateWithMyMemory(text: string, sourceLang: string, targetLang: string): Promise<string | null> {
  try {
    const url = new URL(MYMEMORY_URL)
    url.searchParams.set("q", text.substring(0, 500))
    url.searchParams.set("langpair", `${myMemoryLangMap[sourceLang] || sourceLang}|${myMemoryLangMap[targetLang] || targetLang}`)
    url.searchParams.set("de", "info@yousafeconsultancy.com")

    const response = await fetch(url.toString())
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

export async function POST(request: NextRequest) {
  let normalized = ""

  try {
    const { text, targetLang, sourceLang = "en" } = await request.json()
    normalized = typeof text === "string" ? text.trim() : ""

    if (!normalized || !targetLang) {
      return NextResponse.json({ error: "Missing required fields: text and targetLang" }, { status: 400 })
    }

    if (targetLang === sourceLang) return NextResponse.json({ translatedText: normalized })

    const myMemoryResult = await translateWithMyMemory(normalized, sourceLang, targetLang)
    if (myMemoryResult) return NextResponse.json({ translatedText: myMemoryResult })

    return NextResponse.json({ translatedText: normalized, fallback: true })
  } catch {
    return NextResponse.json({ translatedText: normalized, fallback: true })
  }
}
