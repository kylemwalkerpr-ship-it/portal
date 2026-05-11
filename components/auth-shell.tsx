'use client'

import type { ReactNode } from 'react'

const FAMILY_ORIGINS = new Set([
  'https://yousafeconsultancy.com',
  'https://www.yousafeconsultancy.com',
  'https://usa.yousafeconsultancy.com',
  'https://ca.yousafeconsultancy.com',
  'https://checkout.yousafeconsultancy.com',
  'https://legal.yousafeconsultancy.com',
  'https://portal.yousafeconsultancy.com',
  'https://support.yousafeconsultancy.com',
])

export const clerkAppearance = {
  variables: {
    colorPrimary: '#3C3B6E',
    colorText: '#1d2433',
    colorTextSecondary: '#4a4f5b',
    colorBackground: '#ffffff',
    colorInputBackground: '#f7f3ea',
    colorInputText: '#1d2433',
    borderRadius: '8px',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  elements: {
    rootBox: 'ys-clerk-root',
    cardBox: 'ys-clerk-card-box',
    card: 'ys-clerk-card',
    headerTitle: 'ys-clerk-title',
    headerSubtitle: 'ys-clerk-subtitle',
    socialButtonsBlockButton: 'ys-clerk-social-button',
    formButtonPrimary: 'ys-clerk-primary-button',
    footerActionLink: 'ys-clerk-link',
    formFieldInput: 'ys-clerk-input',
    formFieldLabel: 'ys-clerk-label',
    dividerLine: 'ys-clerk-divider-line',
    dividerText: 'ys-clerk-divider-text',
    identityPreviewEditButton: 'ys-clerk-link',
  },
}

export function safeReturnTo(value: string | null): string | null {
  if (!value) return null
  try {
    if (value.startsWith('/')) {
      if (value.startsWith('//')) return null
      if (value.startsWith('/sign-in') || value.startsWith('/sign-up')) return null
      return value
    }
    const url = new URL(value)
    if (!FAMILY_ORIGINS.has(url.origin)) return null
    if (url.pathname.startsWith('/sign-in') || url.pathname.startsWith('/sign-up')) return null
    return url.toString()
  } catch {
    return null
  }
}

export function AuthShell({
  title,
  eyebrow,
  body,
  laneLabel,
  previousUrl,
  children,
}: {
  title: string
  eyebrow: string
  body: string
  laneLabel: string
  previousUrl: string | null
  children: ReactNode
}) {
  const detailItems = [
    'Role-based dashboards for students, consultants, attorneys, and support',
    'Escrow-protected orders, private files, and message threads in one place',
    'Secure Clerk sign-in with Stripe-powered payments and payouts',
  ]

  return (
    <div className="ys-auth-page">
      <div className="ys-auth-glow" aria-hidden="true" />
      <div className="ys-auth-grain" aria-hidden="true" />

      <main className="ys-auth-shell">
        <section className="ys-auth-brand-panel" aria-label="YouSafe portal overview">
          <div className="ys-auth-flag-bar" aria-hidden="true" />

          <div className="ys-auth-brand-inner">
            <div className="ys-auth-brand-top">
              <a href="https://yousafeconsultancy.com" className="ys-auth-logo-link">
                <span className="ys-auth-logo-mark">Y</span>
                <span>
                  <span className="ys-auth-logo-name">YouSafe</span>
                  <span className="ys-auth-logo-sub">Consultancy</span>
                </span>
              </a>
              <span className="ys-auth-secure-pill">Secure portal</span>
            </div>

            <div className="ys-auth-copy">
              <p className="ys-auth-eyebrow">{eyebrow}</p>
              <h1>{title}</h1>
              <p>{body}</p>

              <div className="ys-auth-detail-list">
                {detailItems.map((item) => (
                  <div key={item} className="ys-auth-detail-item">
                    <span aria-hidden="true">✓</span>
                    <p>{item}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="ys-auth-stats" aria-label="YouSafe trust markers">
              <div>
                <strong>500+</strong>
                <span>clients supported</span>
              </div>
              <div>
                <strong>30+</strong>
                <span>countries served</span>
              </div>
              <div>
                <strong>24/7</strong>
                <span>secure access</span>
              </div>
            </div>
          </div>
        </section>

        <section className="ys-auth-form-panel" aria-label="Authentication form">
          <div className="ys-auth-lane-card">
            <div>
              <span>Account lane</span>
              <p>
                Entering as <strong>{laneLabel}</strong>
              </p>
            </div>
            <strong>Role matched</strong>
          </div>

          <div className="ys-auth-clerk-frame">{children}</div>

          <div className="ys-auth-actions">
            {previousUrl ? (
              <a href={previousUrl}>Back to previous page</a>
            ) : (
              <a href="https://yousafeconsultancy.com">Back to main site</a>
            )}
            <a href="mailto:support@yousafeconsultancy.com">Need help?</a>
          </div>
        </section>
      </main>
    </div>
  )
}
