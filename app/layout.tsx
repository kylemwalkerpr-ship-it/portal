import './globals.css'
import './portal-themes.css'
import type { Viewport } from 'next'
import { Inter, Cormorant_Garamond, Lora, IBM_Plex_Mono } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import { headers } from 'next/headers'
import { TranslationProvider } from '@/components/translation-provider'
import ChatWidget from '@/components/ChatWidget'
// HreflangTags removed — portal is noindex sitewide and has no per-locale
// URLs, so emitting hreflang produced "Multiple Entries" and "Not Using
// Canonical" flags. Re-introduce once we have real `/es/...` routes.

// Self-host fonts via next/font for better LCP + no render-blocking
// stylesheet from fonts.googleapis.com. Variables are consumed by the
// existing `font-family` declarations in globals.css.
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
})
const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-cormorant',
  display: 'swap',
})
const lora = Lora({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-lora',
  display: 'swap',
})
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
  display: 'swap',
})

const PORTAL_URL = 'https://portal.yousafeconsultancy.com'

// SUPPORTED_LANGS kept for html lang attribute resolution only; we no
// longer emit hreflang alternates because the URLs don't differ by locale
// (translation is overlaid client-side).
const SUPPORTED_LANGS = ['en', 'es', 'fr', 'ar', 'zh', 'hi', 'pt'] as const
const SUPPORTED_LANG_SET = new Set<string>(SUPPORTED_LANGS)
const RTL_LANGS = new Set(['ar'])

export const metadata = {
  metadataBase: new URL('https://portal.yousafeconsultancy.com'),
  title: 'YouSafe Portal — Study & Legal Services',
  description:
    'YouSafe members portal — study-abroad consulting + US / UK / Canada legal document review. Students, attorneys, consultants and admins in one secure portal.',
  // Portal members area pages (dashboard, sign-in, sign-up) opt into
  // noindex individually via per-page generateMetadata. The marketing
  // subdomains (usa.*, ca.*, legal.*, uk.*, market.*) must remain
  // indexable for SEO — they carry the content Google ranks.
  // Canonical omitted to avoid polluting ?lang= query-param variants.
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  manifest: '/site.webmanifest',
  openGraph: {
    title: 'YouSafe Portal — Study & Legal Services',
    description: 'Members portal for YouSafe Consultancy. Student, attorney, consultant, and admin access.',
    type: 'website',
    siteName: 'YouSafe Portal',
    locale: 'en_US',
    url: 'https://portal.yousafeconsultancy.com',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'YouSafe Portal — Study & Legal Services',
    description: 'Secure members portal for YouSafe Consultancy.',
    images: ['/og-image.png'],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0B3B78',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Resolve the active language from middleware-set x-lang. Falls back to
  // 'en' if the header is missing (e.g. on edge cases that bypass middleware).
  let lang = 'en'
  let dir: 'ltr' | 'rtl' = 'ltr'
  try {
    const h = await headers()
    const fromHeader = h.get('x-lang')
    if (fromHeader && SUPPORTED_LANG_SET.has(fromHeader)) lang = fromHeader
    if (RTL_LANGS.has(lang)) dir = 'rtl'
  } catch {
    /* fall through with default 'en' */
  }

  return (
    <html lang={lang} dir={dir} className={`${inter.variable} ${cormorant.variable} ${lora.variable} ${plexMono.variable}`}>
      <head>
        {/* Warm the TLS handshake for the Clerk SDK origin — the script
            itself is async, but preconnect shaves ~100ms off the eventual
            fetch on cold visits. */}
        <link rel="preconnect" href="https://clerk.portal.yousafeconsultancy.com" crossOrigin="anonymous" />
        {/* hreflang removed pending per-locale URL routes */}
        {/* Stale-chunk handler. After a deploy, the build's hashed JS
            chunks rotate but users + crawlers may hold cached HTML
            referencing the OLD hashes. OpenNext serves 404 for chunks
            not in the current build's asset manifest — Ahrefs flags
            these as "page-has-broken-JS" (80+ pages on the last
            audit) and users get a white-screen render. This handler
            catches both the runtime ChunkLoadError and the script-
            load failure event, then force-reloads ONCE per session
            (10-second cooldown prevents reload loops on persistent
            errors). The reload pulls the new HTML referencing the
            current build's chunk hashes — same UX as a manual
            Cmd-Shift-R after a deploy, but automatic. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var K='yousafe:chunk-reload';function r(){try{var t=Number(sessionStorage.getItem(K)||0);if(Date.now()-t<10000)return;sessionStorage.setItem(K,String(Date.now()));location.reload()}catch(e){location.reload()}}window.addEventListener('error',function(e){var t=e&&e.target;var isScript=t&&t.tagName==='SCRIPT'&&typeof t.src==='string'&&t.src.indexOf('/_next/static/chunks/')>-1;var isChunkErr=e&&(e.message&&(/Loading chunk/.test(e.message)||/ChunkLoadError/.test(e.message))||(e.error&&e.error.name==='ChunkLoadError'));if(isScript||isChunkErr)r()},true);window.addEventListener('unhandledrejection',function(e){var msg=e&&e.reason&&(e.reason.message||String(e.reason));if(msg&&(/Loading chunk/.test(msg)||/ChunkLoadError/.test(msg)))r()})})();`,
          }}
        />
      </head>
      {/* overflowX: 'clip' — `hidden` here turns body into a scroll container,
          which silently breaks position: sticky on the landing nav and every
          other sticky header. `clip` suppresses horizontal overflow without
          establishing a scroll context. */}
      <body style={{ overflowX: 'clip' }}>
        <a href="#main" className="yousafe-skip-link">Skip to main content</a>
        {/* SDK version pinning: the clerk-js script URL is pinned to
            an exact patch via the NEXT_PUBLIC_CLERK_JS_VERSION env var
            (set in wrangler.toml). Without it, Clerk injects the
            major-version alias `/npm/@clerk/clerk-js@6/...` which
            returns 307 → 6.12.1, flagging EVERY page that loads the
            SDK as "page-has-redirected-JS" in Ahrefs (~11.5k rows,
            ~71% of total issue volume). Bump the env var when
            upgrading @clerk/nextjs to a newer clerk-js minor; the
            package.json lockfile is the source of truth for which
            version to pin. */}
        <ClerkProvider
          afterSignOutUrl={PORTAL_URL}
          signInUrl="/sign-in/student"
          signUpUrl="/sign-up/student"
        >
          <TranslationProvider>
            {/* Language switcher now docks inside each app's nav bar
                instead of floating — see dashboard topbars + MarketplaceShell. */}
            {children}
            <ChatWidget />
          </TranslationProvider>
        </ClerkProvider>
      </body>
    </html>
  )
}
