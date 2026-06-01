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
    'Members portal for YouSafe Consultancy. Study-abroad consulting and US, UK and Canada legal document review — students, attorneys, consultants and admins, in one secure portal.',
  // Portal is a members area — keep it OUT of Google. The marketing surfaces
  // (yousafeconsultancy.com landing, usa.*, ca.*, checkout.*, legal.*) carry
  // the SEO weight. Per-page generateMetadata can opt back in for any future
  // public route.
  robots: {
    index: false,
    follow: true,
  },
  alternates: {
    canonical: '/',
  },
  icons: {
    icon: '/logo.png',
  },
  openGraph: {
    title: 'YouSafe Portal — Study & Legal Services',
    description: 'Members portal for YouSafe Consultancy. Student, attorney, consultant, and admin access.',
    type: 'website',
    siteName: 'YouSafe Portal',
    locale: 'en_US',
    url: 'https://portal.yousafeconsultancy.com',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'YouSafe Portal — Study & Legal Services',
    description: 'Secure members portal for YouSafe Consultancy.',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
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
      </head>
      {/* overflowX: 'clip' — `hidden` here turns body into a scroll container,
          which silently breaks position: sticky on the landing nav and every
          other sticky header. `clip` suppresses horizontal overflow without
          establishing a scroll context. */}
      <body style={{ overflowX: 'clip' }}>
        <a href="#main" className="yousafe-skip-link">Skip to main content</a>
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
