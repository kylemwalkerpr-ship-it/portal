import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: false },
}

export default function NotFound() {
  return (
    <main
      style={{
        maxWidth: 560,
        margin: '0 auto',
        padding: '96px 24px',
        textAlign: 'center',
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
        color: '#1A1F2E',
      }}
    >
      <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#5C6070', margin: '0 0 8px' }}>404</p>
      <h1 style={{ fontSize: 32, fontWeight: 700, margin: '0 0 12px' }}>Page not found</h1>
      <p style={{ fontSize: 15, color: '#5C6070', margin: '0 0 28px', lineHeight: 1.6 }}>
        We couldn&rsquo;t find that page in the portal. It may have moved, or the link may be broken.
      </p>
      <Link
        href="/"
        style={{ padding: '10px 18px', background: '#1B2D4F', color: '#fff', borderRadius: 6, fontWeight: 700, textDecoration: 'none', fontSize: 14, display: 'inline-block' }}
      >
        Back to portal home
      </Link>
    </main>
  )
}
