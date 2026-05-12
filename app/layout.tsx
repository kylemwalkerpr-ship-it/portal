import './globals.css'
import type { Viewport } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import { TranslationProvider } from '@/components/translation-provider'
import ChatWidget from '@/components/ChatWidget'

const PORTAL_URL = 'https://portal.yousafeconsultancy.com'

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Inter:wght@400;500;600;700&display=swap"
        />
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
            {children}
            <ChatWidget />
          </TranslationProvider>
        </ClerkProvider>
      </body>
    </html>
  )
}
