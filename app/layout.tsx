import './globals.css'
import type { Viewport } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import { headers } from 'next/headers'
import { TranslationProvider } from '@/components/translation-provider'
import ChatWidget from '@/components/ChatWidget'
import { GlobalLanguageBar } from '@/components/GlobalLanguageBar'
import { HreflangTags } from '@/components/HreflangTags'

const PORTAL_URL = 'https://portal.yousafeconsultancy.com'

// One entry per supported language for Next's native metadata.alternates.languages.
// HreflangTags below ALSO emits the same set as raw <link> tags — some crawlers
// pick up only one of the two forms, so we emit both. Keep this list in sync
// with contexts/language-context.tsx (Language type) and HreflangTags.tsx.
const SUPPORTED_LANGS = ['en', 'es', 'fr', 'ar', 'zh', 'hi', 'pt'] as const
const SUPPORTED_LANG_SET = new Set<string>(SUPPORTED_LANGS)
const RTL_LANGS = new Set(['ar'])
const ALTERNATE_LANGUAGES: Record<string, string> = Object.fromEntries(
  SUPPORTED_LANGS.map(code => [code, `/?lang=${code}`]),
)

export const metadata = {
  metadataBase: new URL('https://portal.yousafeconsultancy.com'),
  title: 'YouSafe Portal — Study & Legal Services',
  description:
    'Members portal for YouSafe Consultancy. Study-abroad consulting and US, UK and Canada legal document review — students, attorneys, consultants and admins, in one secure portal.',
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: '/',
    languages: ALTERNATE_LANGUAGES,
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
    <html lang={lang} dir={dir}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Inter:wght@400;500;600;700&display=swap"
        />
        {/* hreflang alternates — emitted on every page via root layout */}
        <HreflangTags />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: 'YouSafe Portal',
              url: 'https://portal.yousafeconsultancy.com',
            }),
          }}
        />
      </head>
      <body>
        <ClerkProvider
          afterSignOutUrl={PORTAL_URL}
          signInUrl="/sign-in/student"
          signUpUrl="/sign-up/student"
        >
          <TranslationProvider>
            {/* Site-wide language switcher — fixed top-right, every page */}
            <GlobalLanguageBar />
            {children}
            <ChatWidget />
          </TranslationProvider>
        </ClerkProvider>
      </body>
    </html>
  )
}
