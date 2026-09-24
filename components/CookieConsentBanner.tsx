'use client'

import React from 'react'
import { readClientConsent, writeConsentCookie } from '@/lib/attribution/client'

export const COOKIE_CONSENT_EVENT = 'yousafe:cookie-consent-change'

type Consent = 'granted' | 'denied'

function saveConsent(value: Consent) {
  writeConsentCookie(value)
  window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_EVENT, { detail: value }))
}

export default function CookieConsentBanner() {
  const [visible, setVisible] = React.useState(false)

  React.useEffect(() => {
    setVisible(readClientConsent() === 'unknown')
  }, [])

  const choose = (value: Consent) => {
    saveConsent(value)
    setVisible(false)
  }

  const settingsButton = (
    <button
      type="button"
      onClick={() => setVisible(true)}
      aria-label="Cookie settings"
      style={{
        position: 'fixed',
        zIndex: 999,
        left: 'max(12px, env(safe-area-inset-left))',
        bottom: 'max(12px, env(safe-area-inset-bottom))',
        minHeight: 40,
        border: '1px solid #CBD5E1',
        borderRadius: 999,
        padding: '8px 14px',
        background: '#FFFFFF',
        color: '#0F172A',
        boxShadow: '0 4px 16px rgba(15, 23, 42, 0.14)',
        fontWeight: 700,
        cursor: 'pointer',
      }}
    >
      Cookie settings
    </button>
  )

  if (!visible) return settingsButton

  return (
    <>
      <aside
        role="dialog"
        aria-label="Cookie preferences"
        aria-live="polite"
        style={{
          position: 'fixed',
          zIndex: 1000,
          left: 'max(12px, env(safe-area-inset-left))',
          right: 'max(12px, env(safe-area-inset-right))',
          bottom: 'max(12px, env(safe-area-inset-bottom))',
          margin: '0 auto',
          maxWidth: 760,
          border: '1px solid #D8DEE8',
          borderRadius: 14,
          background: '#FFFFFF',
          boxShadow: '0 18px 48px rgba(15, 23, 42, 0.18)',
          padding: '16px 18px',
          color: '#0F172A',
          fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif',
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 6 }}>Cookie choices</div>
        <p style={{ margin: 0, color: '#475569', fontSize: 13, lineHeight: 1.55 }}>
          We use essential cookies for sign-in and security. Analytics is optional and stays off until you allow it.{' '}
          <a
            href="https://usa.yousafeconsultancy.com/privacy-policy/"
            style={{ color: '#3730A3', fontWeight: 700 }}
          >
            Read our privacy policy
          </a>.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
          <button
            type="button"
            onClick={() => choose('granted')}
            style={{
              minHeight: 44,
              border: 0,
              borderRadius: 999,
              padding: '10px 16px',
              background: '#0F172A',
              color: '#FFFFFF',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Accept analytics
          </button>
          <button
            type="button"
            onClick={() => choose('denied')}
            style={{
              minHeight: 44,
              border: '1px solid #CBD5E1',
              borderRadius: 999,
              padding: '10px 16px',
              background: '#FFFFFF',
              color: '#0F172A',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Reject non-essential
          </button>
        </div>
      </aside>
    </>
  )
}
