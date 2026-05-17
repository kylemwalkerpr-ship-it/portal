import { NextRequest, NextResponse } from "next/server"
import { translateString } from "@/lib/serverTranslate"

// CORS for the statically-exported sister sites (yousafe-consultancy
// usa/ca/checkout) which can't host their own API routes.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(request: NextRequest) {
  let normalized = ""

  try {
    const { text, targetLang, sourceLang = "en" } = await request.json()
    normalized = typeof text === "string" ? text.trim() : ""

    if (!normalized || !targetLang) {
      return NextResponse.json(
        { error: "Missing required fields: text and targetLang" },
        { status: 400, headers: CORS_HEADERS }
      )
    }

    if (targetLang === sourceLang) {
      return NextResponse.json({ translatedText: normalized }, { headers: CORS_HEADERS })
    }

    const translated = await translateString(normalized, targetLang, { sourceLang })

    if (translated === normalized) {
      return NextResponse.json({ translatedText: normalized, fallback: true }, { headers: CORS_HEADERS })
    }

    return NextResponse.json({ translatedText: translated }, { headers: CORS_HEADERS })
  } catch {
    return NextResponse.json(
      { translatedText: normalized, fallback: true },
      { headers: CORS_HEADERS }
    )
  }
}
