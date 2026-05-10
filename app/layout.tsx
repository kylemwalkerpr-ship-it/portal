import './globals.css'
import { ClerkProvider } from '@clerk/nextjs'
import { TranslationProvider } from '@/components/translation-provider'

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
      </head>
      <body>
        <ClerkProvider
          afterSignOutUrl={PORTAL_URL}
          signInUrl="/sign-in/student"
          signUpUrl="/sign-up/student"
        >
          <TranslationProvider>{children}</TranslationProvider>
        </ClerkProvider>
      </body>
    </html>
  )
}
