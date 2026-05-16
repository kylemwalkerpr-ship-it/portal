/**
 * HreflangTags — server component
 *
 * Emits one <link rel="alternate" hreflang> per supported language, plus an
 * x-default. Mounted once in <head> from app/layout.tsx so EVERY page emits
 * the full set automatically (root layout wraps every route in Next App
 * Router).
 *
 * The href encodes the language as a `?lang=<code>` query param against the
 * current pathname. This matches our language-context.tsx which reads
 * ?lang= on first load. If we ever move to subpath routing (/es/...,
 * /fr/...), only the href construction below needs to change — every page
 * still gets every variant.
 *
 * Important: this is a SERVER component (no "use client") so it runs on
 * every request, captures the current pathname via headers(), and emits the
 * correct URLs even on dynamic routes like /marketplace/gigs/[slug].
 */
import { headers } from "next/headers"

const SITE_URL = "https://portal.yousafeconsultancy.com"

const LANGUAGES = [
  { code: "en", hreflang: "en" },
  { code: "es", hreflang: "es" },
  { code: "fr", hreflang: "fr" },
  { code: "ar", hreflang: "ar" },
  { code: "zh", hreflang: "zh" },
  { code: "hi", hreflang: "hi" },
  { code: "pt", hreflang: "pt" },
]

export async function HreflangTags() {
  const headerList = await headers()
  // Try X-Forwarded-* first (Cloudflare / proxies set these), then host
  const host = headerList.get("x-forwarded-host") || headerList.get("host") || "portal.yousafeconsultancy.com"
  const proto = headerList.get("x-forwarded-proto") || "https"
  const pathname = headerList.get("x-pathname") || headerList.get("next-url") || "/"

  // Strip any existing ?lang= so we don't double-stack params
  const [path, query = ""] = pathname.split("?")
  const params = new URLSearchParams(query)
  params.delete("lang")
  const baseQuery = params.toString()

  const buildHref = (langCode: string | null) => {
    const merged = new URLSearchParams(baseQuery)
    if (langCode) merged.set("lang", langCode)
    const q = merged.toString()
    return `${proto}://${host}${path}${q ? `?${q}` : ""}`
  }

  return (
    <>
      {LANGUAGES.map(({ code, hreflang }) => (
        <link key={hreflang} rel="alternate" hrefLang={hreflang} href={buildHref(code)} />
      ))}
      {/* x-default: the URL search engines should serve when no language
          preference is known (English fallback). */}
      <link rel="alternate" hrefLang="x-default" href={buildHref(null)} />
    </>
  )
}
