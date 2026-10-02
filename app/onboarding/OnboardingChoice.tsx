'use client'
import { useState } from 'react'
import { YS_BRAND } from '@/lib/auth/ysClerkAppearance'

const card: React.CSSProperties = {
  display: 'block', textAlign: 'left', width: '100%', padding: '22px 22px', borderRadius: 14,
  border: `1px solid ${YS_BRAND.rule}`, background: '#fff', cursor: 'pointer', color: YS_BRAND.ink,
  boxShadow: '0 12px 32px rgba(15,23,42,0.08)', textDecoration: 'none', font: 'inherit',
}

export default function OnboardingChoice({
  returnTo, providerHref, vertical, firstName,
}: { returnTo: string; providerHref: string; vertical: string | null; firstName: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function chooseClient() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/onboarding/role', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'client', vertical }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Something went wrong.')
      window.location.assign(returnTo)
    } catch (e: any) {
      setError(e?.message || 'Something went wrong.')
      setBusy(false)
    }
  }

  return (
    <main style={{ minHeight: '100vh', background: YS_BRAND.paper, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 560 }}>
        <div style={{ height: 4, borderRadius: 4, background: `linear-gradient(90deg, ${YS_BRAND.navy} 0 50%, ${YS_BRAND.red} 50% 100%)`, marginBottom: 24 }} />
        <img src="/logo.png" alt="YouSafe" width={48} height={48} style={{ borderRadius: 10, marginBottom: 16 }} />
        <h1 style={{ fontSize: 28, margin: '0 0 8px', color: YS_BRAND.ink }}>
          Welcome{firstName ? `, ${firstName}` : ''}. How will you use YouSafe?
        </h1>
        <p style={{ color: YS_BRAND.inkSoft, margin: '0 0 24px', lineHeight: 1.6 }}>
          One account works across every YouSafe site. This choice sets up the right dashboard; you can contact support to change it later.
        </p>
        <div style={{ display: 'grid', gap: 14 }}>
          <button type="button" style={card} onClick={chooseClient} disabled={busy} data-testid="onboarding-client">
            <strong style={{ fontSize: 18 }}>I need help</strong>
            <div style={{ color: YS_BRAND.inkSoft, marginTop: 6 }}>Hire attorneys and consultants, order services, upload documents and track your case.</div>
          </button>
          <a href={providerHref} style={card} data-testid="onboarding-provider">
            <strong style={{ fontSize: 18 }}>I provide services</strong>
            <div style={{ color: YS_BRAND.inkSoft, marginTop: 6 }}>Attorneys, regulated immigration advisers (RCIC, OISC/IAA, RMA) and consultants: one short application, verified by our team.</div>
          </a>
        </div>
        {error && <p role="alert" style={{ color: YS_BRAND.red, marginTop: 16 }}>{error}</p>}
      </div>
    </main>
  )
}
