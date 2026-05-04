import './globals.css'
import { ClerkProvider } from '@clerk/nextjs'
import { TranslationProvider } from '@/components/translation-provider'

const LANDING_URL = 'https://yousafeconsultancy.com'

export const metadata = {
  metadataBase: new URL('https://portal.yousafeconsultancy.com'),
  title: 'YouSafe Portal',
  description: 'Your international student consultancy platform',
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
      <body>
        <ClerkProvider afterSignOutUrl={LANDING_URL}>
          <TranslationProvider>{children}</TranslationProvider>
        </ClerkProvider>
      </body>
    </html>
  )
}
