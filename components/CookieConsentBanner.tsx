'use client'

import React from 'react'
import { readClientConsent, writeConsentCookie } from '@/lib/attribution/client'

export const COOKIE_CONSENT_EVENT = 'yousafe:cookie-consent-change'

type Consent = 'granted' | 'denied'

function saveConsent(value: Consent) {
  writeConsentCookie(value)
  window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_EVENT, { detail: value }))
}

function hasOpenModal() {
  return Boolean(document.body?.hasAttribute('data-checkout-open') || document.querySelector('[role="dialog"][aria-modal="true"]'))
}

export default function CookieConsentBanner() {
  const [visible, setVisible] = React.useState(false)
  const [modalOpen, setModalOpen] = React.useState(false)
  const bannerRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    setVisible(readClientConsent() === 'unknown')
    const sync = () => setModalOpen(hasOpenModal())
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-checkout-open', 'class', 'aria-modal'], childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  // Reserve space while the banner is visible, and restore it while a modal
  // temporarily suppresses the consent UI.
  React.useEffect(() => {
    if (!visible || modalOpen) return
    const el = bannerRef.current
    if (!el) return
    const body = document.body
    const previous = body.style.paddingBottom
    const reserve = () => { body.style.paddingBottom = `${Math.ceil(el.getBoundingClientRect().height) + 24}px` }
    reserve()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(reserve) : null
    observer?.observe(el)
    window.addEventListener('resize', reserve)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', reserve)
      body.style.paddingBottom = previous
    }
  }, [visible, modalOpen])

  const choose = (value: Consent) => {
    saveConsent(value)
    setVisible(false)
  }
  if (modalOpen) return null

  const buttonBase: React.CSSProperties = {
    minHeight: 44, borderRadius: 999, padding: '10px 16px', fontWeight: 800,
    fontFamily: 'inherit', cursor: 'pointer', flex: '1 1 auto',
  }
  const settingsButton = !visible && <button
    type="button" onClick={() => setVisible(true)} aria-label="Cookie settings" data-cookie-settings=""
    style={{
      position: 'fixed', zIndex: 999, left: 'max(12px, env(safe-area-inset-left))',
      bottom: 'max(88px, calc(env(safe-area-inset-bottom) + 84px))', minHeight: 42,
      border: '1px solid var(--ys-rule, #CBD5E1)', borderRadius: 999, padding: '8px 14px',
      background: 'var(--ys-vellum, #FFFFFF)', color: 'var(--ys-ink, #0F172A)',
      boxShadow: '0 4px 16px rgba(15, 23, 42, 0.18)', fontWeight: 700, cursor: 'pointer',
    }}
  ><span className="cookie-settings-label">Cookie settings</span><span className="cookie-settings-icon" aria-hidden="true">⚙</span></button>

  if (!visible) return settingsButton

  return <>
    {settingsButton}
    <div ref={bannerRef} data-cookie-banner role="dialog" aria-label="Cookie preferences" aria-live="polite" style={{
      position: 'fixed', zIndex: 1000, left: 'max(12px, env(safe-area-inset-left))',
      right: 'max(12px, env(safe-area-inset-right))', bottom: 'max(12px, env(safe-area-inset-bottom))',
      margin: '0 auto', maxWidth: 760, border: '1px solid var(--ys-rule, #CBD5E1)', borderRadius: 14,
      background: 'var(--ys-vellum, #FFFFFF)', boxShadow: '0 18px 48px rgba(15, 23, 42, 0.22)',
      padding: '16px 18px', color: 'var(--ys-ink, #0F172A)', fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif',
    }}>
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 6 }}>Cookie choices</div>
      <p style={{ margin: 0, color: 'var(--ys-inkMid, #334155)', fontSize: 13, lineHeight: 1.55 }}>
        We use essential cookies for sign-in and security. Analytics is optional and stays off until you allow it.{' '}
        <a href="https://legal.yousafeconsultancy.com/privacy/#cookies" style={{ color: 'var(--ys-indigo, #111827)', fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 2 }}>Read our privacy policy</a>.
      </p>
      <div className="cookie-consent-actions" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
        <button type="button" onClick={() => choose('granted')} style={{ ...buttonBase, border: 0, background: 'var(--ys-indigo, #111827)', color: '#FFFFFF' }}>Accept analytics</button>
        <button type="button" onClick={() => choose('denied')} style={{ ...buttonBase, border: '1px solid var(--ys-rule, #CBD5E1)', background: 'var(--ys-paper, #F7F8FA)', color: 'var(--ys-ink, #0F172A)' }}>Reject non-essential</button>
      </div>
    </div>
  </>
}
