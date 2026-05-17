import { NextRequest, NextResponse } from "next/server"
import { translateBatch } from "@/lib/serverTranslate"

const MAX_TEXTS = 100

// Sister sites (statically exported, no backend of their own) call this
// endpoint from the browser for translation. Allow them by name; everything
// else gets the safe wildcard (read-only translator, no auth).
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
  try {
    const body = await request.json().catch(() => null) as
      | { texts?: unknown; targetLang?: unknown; sourceLang?: unknown }
      | null

    const texts = Array.isArray(body?.texts) ? (body!.texts as unknown[]) : null
    const targetLang = typeof body?.targetLang === "string" ? body!.targetLang : ""
    const sourceLang =
      typeof body?.sourceLang === "string" && body!.sourceLang ? (body!.sourceLang as string) : "en"

    if (!texts || !targetLang) {
      return NextResponse.json(
        { error: "Missing required fields: texts (string[]) and targetLang" },
        { status: 400, headers: CORS_HEADERS }
      )
    }

    if (texts.length > MAX_TEXTS) {
      return NextResponse.json(
        { error: `Too many texts: max ${MAX_TEXTS} per request` },
        { status: 400, headers: CORS_HEADERS }
      )
    }

    if (texts.length === 0) {
      return NextResponse.json({ translations: [] }, { headers: CORS_HEADERS })
    }

    const safeTexts = texts.map((t) => (typeof t === "string" ? t : ""))

    if (targetLang === sourceLang) {
      return NextResponse.json({ translations: safeTexts }, { headers: CORS_HEADERS })
    }

    const translations = await translateBatch(safeTexts, targetLang, { sourceLang })
    return NextResponse.json({ translations }, { headers: CORS_HEADERS })
  } catch {
    return NextResponse.json(
      { error: "Batch translation failed" },
      { status: 500, headers: CORS_HEADERS }
    )
  }
}
