import { NextRequest, NextResponse } from "next/server"
import { translateBatch } from "@/lib/serverTranslate"

const MAX_TEXTS = 100

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
        { status: 400 }
      )
    }

    if (texts.length > MAX_TEXTS) {
      return NextResponse.json(
        { error: `Too many texts: max ${MAX_TEXTS} per request` },
        { status: 400 }
      )
    }

    if (texts.length === 0) {
      return NextResponse.json({ translations: [] })
    }

    // Coerce non-strings to empty so translateBatch's ordering guarantees hold.
    const safeTexts = texts.map((t) => (typeof t === "string" ? t : ""))

    if (targetLang === sourceLang) {
      return NextResponse.json({ translations: safeTexts })
    }

    const translations = await translateBatch(safeTexts, targetLang, { sourceLang })
    return NextResponse.json({ translations })
  } catch {
    // Best-effort fallback: try to echo any texts we managed to parse, else 500.
    return NextResponse.json({ error: "Batch translation failed" }, { status: 500 })
  }
}
