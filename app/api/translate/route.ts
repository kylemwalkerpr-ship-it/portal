import { NextRequest, NextResponse } from "next/server"
import { translateString } from "@/lib/serverTranslate"

export async function POST(request: NextRequest) {
  let normalized = ""

  try {
    const { text, targetLang, sourceLang = "en" } = await request.json()
    normalized = typeof text === "string" ? text.trim() : ""

    if (!normalized || !targetLang) {
      return NextResponse.json({ error: "Missing required fields: text and targetLang" }, { status: 400 })
    }

    if (targetLang === sourceLang) return NextResponse.json({ translatedText: normalized })

    const translated = await translateString(normalized, targetLang, { sourceLang })

    // translateString returns the original on any failure — surface the fallback flag
    // so existing clients keep their previous behaviour.
    if (translated === normalized) {
      return NextResponse.json({ translatedText: normalized, fallback: true })
    }

    return NextResponse.json({ translatedText: translated })
  } catch {
    return NextResponse.json({ translatedText: normalized, fallback: true })
  }
}
