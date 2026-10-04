import { NextRequest, NextResponse } from "next/server"
import { translateString } from "@/lib/serverTranslate"

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
  let normalized = ""

  try {
    const { text, targetLang, sourceLang = "en" } = await request.json()
    normalized = typeof text === "string" ? text.trim() : ""

    if (!normalized || !targetLang) {
      return NextResponse.json(
        { error: "Missing required fields: text and targetLang" },
        { status: 400, headers: corsHeadersFor(request) }
      )
    }

    if (targetLang === sourceLang) {
      return NextResponse.json({ translatedText: normalized }, { headers: corsHeadersFor(request) })
    }

    const translated = await translateString(normalized, targetLang, { sourceLang })

    if (translated === normalized) {
      return NextResponse.json({ translatedText: normalized, fallback: true }, { headers: corsHeadersFor(request) })
    }

    return NextResponse.json({ translatedText: translated }, { headers: corsHeadersFor(request) })
  } catch {
    return NextResponse.json(
      { translatedText: normalized, fallback: true },
      { headers: corsHeadersFor(request) }
    )
  }
}
