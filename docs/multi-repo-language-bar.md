# Site-wide language bar + hreflang — portable bundle

The `portal` repo now mounts a fixed-top-right language selector and emits
`<link rel="alternate" hreflang>` on **every page** via the root layout.
This doc gives you the same behaviour for the other three repos.

The portable bundle is **two files + two edits**. Drop the files in, edit the
root layout once, and every page in that repo gets the bar + hreflang.

## File 1 — `components/GlobalLanguageBar.tsx`

```tsx
"use client"

import { useEffect, useState } from "react"

type Lang = "en" | "es" | "fr" | "ar" | "zh" | "hi" | "pt"
const LANGUAGES: { code: Lang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "ar", label: "العربية" },
  { code: "zh", label: "中文" },
  { code: "hi", label: "हिन्दी" },
  { code: "pt", label: "Português" },
]
const STORAGE_KEY = "preferredLanguage"

/**
 * Fixed top-right language switcher. Mount once in app/layout.tsx — every
 * page in the app automatically gets it.
 *
 * Sets ?lang=<code> on the current URL, persists choice to localStorage,
 * and dispatches a `languagechange` event so any in-page translator can
 * react. Tags itself with `data-no-translate` so Google Translate's own
 * controls aren't retranslated.
 */
export function GlobalLanguageBar() {
  const [lang, setLang] = useState<Lang>("en")

  useEffect(() => {
    const url = new URLSearchParams(window.location.search).get("lang")
    const stored = localStorage.getItem(STORAGE_KEY)
    const next = (url && LANGUAGES.find(l => l.code === url)?.code)
              || (stored && LANGUAGES.find(l => l.code === stored)?.code)
              || "en"
    setLang(next as Lang)
  }, [])

  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value as Lang
    setLang(next)
    localStorage.setItem(STORAGE_KEY, next)
    const url = new URL(window.location.href)
    url.searchParams.set("lang", next)
    window.history.replaceState({}, "", url.toString())
    window.dispatchEvent(new CustomEvent("languagechange", { detail: { language: next } }))
  }

  return (
    <div
      data-no-translate
      style={{
        position: "fixed", top: 12, right: 12, zIndex: 10010,
        display: "flex", alignItems: "center", gap: 8,
        border: "1px solid rgba(148,163,184,0.35)", borderRadius: 8,
        background: "rgba(255,255,255,0.95)", color: "#0f172a",
        boxShadow: "0 12px 30px rgba(15,23,42,0.16)",
        padding: "8px 10px", fontSize: 13, fontWeight: 600, pointerEvents: "auto",
      }}
    >
      <span aria-hidden="true">🌐</span>
      <select
        value={lang}
        aria-label="Language"
        onChange={onChange}
        style={{ border: 0, background: "transparent", font: "inherit", outline: "none" }}
      >
        {LANGUAGES.map(l => (
          <option key={l.code} value={l.code}>{l.label}</option>
        ))}
      </select>
    </div>
  )
}
```

## File 2 — `components/HreflangTags.tsx`

```tsx
import { headers } from "next/headers"

const LANGUAGES = ["en", "es", "fr", "ar", "zh", "hi", "pt"] as const

/**
 * Emits one <link rel="alternate" hreflang> per language plus x-default.
 * Mount in <head> from app/layout.tsx so every page gets the full set.
 * Server component — uses headers() to resolve the current pathname.
 */
export async function HreflangTags() {
  const h = await headers()
  const host  = h.get("x-forwarded-host") || h.get("host") || ""
  const proto = h.get("x-forwarded-proto") || "https"
  const path  = h.get("x-pathname") || "/"

  const [pathname, query = ""] = path.split("?")
  const baseParams = new URLSearchParams(query)
  baseParams.delete("lang")
  const baseQuery = baseParams.toString()

  const href = (code: string | null) => {
    const merged = new URLSearchParams(baseQuery)
    if (code) merged.set("lang", code)
    const q = merged.toString()
    return `${proto}://${host}${pathname}${q ? `?${q}` : ""}`
  }

  return (
    <>
      {LANGUAGES.map(code => (
        <link key={code} rel="alternate" hrefLang={code} href={href(code)} />
      ))}
      <link rel="alternate" hrefLang="x-default" href={href(null)} />
    </>
  )
}
```

## Edit 1 — `middleware.ts`

The hreflang component reads `x-pathname` to construct correct URLs. Set it
on every response. If your repo has no middleware, create one:

```ts
import { NextResponse, type NextRequest } from "next/server"

export function middleware(req: NextRequest) {
  const res = NextResponse.next()
  res.headers.set("x-pathname", `${req.nextUrl.pathname}${req.nextUrl.search}`)
  return res
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
}
```

If your repo already has middleware (e.g. Clerk's `clerkMiddleware`), add the
header on every `NextResponse.next()` returned from it:

```ts
const res = NextResponse.next()
res.headers.set("x-pathname", `${req.nextUrl.pathname}${req.nextUrl.search}`)
return res
```

## Edit 2 — `app/layout.tsx`

```tsx
import { GlobalLanguageBar } from "@/components/GlobalLanguageBar"
import { HreflangTags } from "@/components/HreflangTags"

const SUPPORTED_LANGS = ["en","es","fr","ar","zh","hi","pt"] as const
const ALTERNATE_LANGUAGES: Record<string, string> = Object.fromEntries(
  SUPPORTED_LANGS.map(c => [c, `/?lang=${c}`]),
)

export const metadata = {
  metadataBase: new URL("https://<your-site>"),     // ← change per repo
  alternates: {
    canonical: "/",
    languages: ALTERNATE_LANGUAGES,
  },
  // ...your existing fields
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HreflangTags />
      </head>
      <body>
        <GlobalLanguageBar />
        {children}
      </body>
    </html>
  )
}
```

## Verification (per repo)

After deploy, on any page in each repo run in DevTools console:

```js
[...document.querySelectorAll("link[rel=alternate][hreflang]")].map(l => `${l.hreflang} → ${l.href}`)
```

You should see 8 entries (7 languages + `x-default`). Repeat on `/`,
`/marketplace`, `/dashboard`, `/sign-in/student`, plus any deep paths —
every page should produce the same 8 alternates with the path matching the
current URL.

## Notes

- **Source of truth for the language list** is the `LANGUAGES` constants in
  both files. Keep them in sync across all 4 repos. If you split out a
  shared npm package later, this is the natural seam.
- **Style consistency**: the bar uses the same translucent white pill
  shape across repos. Tweak the `style` block in `GlobalLanguageBar.tsx`
  if a repo has a darker theme — the only required attributes are
  `position: fixed`, `top`, `right`, `z-index ≥ 10000`, `data-no-translate`.
- **Subpath routing later**: if you ever migrate from `?lang=es` to
  `/es/...`, the only files that need updating are these two — every
  consumer page is decoupled.
