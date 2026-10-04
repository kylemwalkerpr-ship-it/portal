import { NextRequest, NextResponse } from "next/server"
import { translateBatch } from "@/lib/serverTranslate"

const MAX_TEXTS = 100

// Phase 5 CORS: the statically exported estate sites (yousafeconsultancy.com,
// usa/ca/uk/au, legal) call this cross-origin. Only YouSafe https origins are
// echoed; never a wildcard (Workers AI cost / abuse), never credentials.
const YOUSAFE_ORIGIN = /^https:\/\/([a-z0-9-]+\.)*yousafeconsultancy\.com$/
function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || ""
  const headers: Record<string, string> = { Vary: "Origin" }
  if (YOUSAFE_ORIGIN.test(origin)) {
    headers["Access-Control-Allow-Origin"] = origin
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    headers["Access-Control-Allow-Headers"] = "Content-Type"
    headers["Access-Control-Max-Age"] = "86400"
  }
  return headers
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeadersFor(request) })
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
        { status: 400, headers: corsHeadersFor(request) }
      )
    }

    if (texts.length > MAX_TEXTS) {
      return NextResponse.json(
        { error: `Too many texts: max ${MAX_TEXTS} per request` },
        { status: 400, headers: corsHeadersFor(request) }
      )
    }

    if (texts.length === 0) {
      return NextResponse.json({ translations: [] }, { headers: corsHeadersFor(request) })
    }

    const safeTexts = texts.map((t) => (typeof t === "string" ? t : ""))

    if (targetLang === sourceLang) {
      return NextResponse.json({ translations: safeTexts }, { headers: corsHeadersFor(request) })
    }

    const translations = await translateBatch(safeTexts, targetLang, { sourceLang })
    return NextResponse.json({ translations }, { headers: corsHeadersFor(request) })
  } catch {
    return NextResponse.json(
      { error: "Batch translation failed" },
      { status: 500, headers: corsHeadersFor(request) }
    )
  }
}
