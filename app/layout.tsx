import './globals.css'
import { ClerkProvider } from '@clerk/nextjs'

const LANDING_URL = 'https://yousafeconsultancy.com'

export const metadata = {
  title: 'YouSafe Portal',
  description: 'Your international student consultancy platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ClerkProvider afterSignOutUrl={LANDING_URL}>{children}</ClerkProvider>
      </body>
    </html>
  )
}
