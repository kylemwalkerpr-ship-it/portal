'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', background: '#F7F5F0', color: '#1A1F2E', minHeight: '100vh' }}>
        <main style={{ maxWidth: 560, margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 12px' }}>Something went wrong</h1>
          <p style={{ fontSize: 15, color: '#5C6070', margin: '0 0 28px', lineHeight: 1.6 }}>
            An unexpected error occurred. You can try again, or return home.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => reset()}
              style={{ padding: '10px 18px', background: '#1B2D4F', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{ padding: '10px 18px', background: 'transparent', color: '#1B2D4F', border: '1px solid #1B2D4F', borderRadius: 6, fontWeight: 700, textDecoration: 'none', fontSize: 14, display: 'inline-block' }}
            >
              Go home
            </a>
          </div>
        </main>
      </body>
    </html>
  )
}
