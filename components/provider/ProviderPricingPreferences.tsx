'use client'
import React from 'react'
import { DEFAULT_YQAA_PROVIDER_PRICING_PREFERENCES, type YqaaProviderPricingPreferences } from '@/lib/yqaaProviderControls'

const fields: Array<{ key: 'auto_accept_pct' | 'flex_pct' | 'approval_band_pct' | 'max_auto_concessions'; label: string; help: string; max: number }> = [
  { key: 'auto_accept_pct', label: 'Auto-accept range', help: 'Maximum discount YQAA can accept automatically.', max: 100 },
  { key: 'flex_pct', label: 'Automatic flexibility', help: 'Maximum discount YQAA can negotiate without asking you.', max: 100 },
  { key: 'approval_band_pct', label: 'Provider review range', help: 'Requests beyond automatic flexibility are sent to you for a decision.', max: 100 },
  { key: 'max_auto_concessions', label: 'Price moves per scope', help: 'Maximum automatic price changes for the same scope.', max: 10 },
]

export default function ProviderPricingPreferences() {
  const [value, setValue] = React.useState<YqaaProviderPricingPreferences>(DEFAULT_YQAA_PROVIDER_PRICING_PREFERENCES)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState('')
  const [saved, setSaved] = React.useState(false)
  const [available, setAvailable] = React.useState(true)

  React.useEffect(() => {
    let mounted = true
    fetch('/api/provider/pricing-preferences', { credentials: 'same-origin' })
      .then(async (r) => ({ r, d: await r.json() }))
      .then(({ r, d }) => {
        if (!mounted) return
        setAvailable(d.available !== false)
        if (!r.ok) setError(d.error || 'Could not load preferences.')
        if (d.preferences) setValue({ ...DEFAULT_YQAA_PROVIDER_PRICING_PREFERENCES, ...d.preferences })
      }).catch(() => mounted && setError('Could not load preferences.'))
      .finally(() => mounted && setLoading(false))
    return () => { mounted = false }
  }, [])

  async function save() {
    setSaving(true); setError(''); setSaved(false)
    try {
      const r = await fetch('/api/provider/pricing-preferences', { method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Could not save preferences.')
      setValue({ ...DEFAULT_YQAA_PROVIDER_PRICING_PREFERENCES, ...d.preferences })
      setSaved(true)
    } catch (e: any) { setError(e?.message || 'Could not save preferences.') }
    finally { setSaving(false) }
  }

  const box: React.CSSProperties = { background: 'var(--surface, #fff)', border: '1px solid var(--border, #e5e7eb)', borderRadius: 12, padding: 20 }
  const label: React.CSSProperties = { display: 'block', fontWeight: 650, marginBottom: 6, color: 'var(--text, #182230)' }
  if (loading) return <div style={box}>Loading pricing preferences…</div>
  return <section style={{ maxWidth: 720, display: 'grid', gap: 16, color: 'var(--text, #182230)' }}>
    {!available && <div role="status" style={{ ...box, background: 'var(--surface-muted, #f8fafc)' }}>Pricing preferences will be available after the additive database migration is applied. Existing platform defaults remain in effect.</div>}
    <div style={box}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 650 }}>
        <input type="checkbox" checked={value.negotiation_enabled} onChange={(e) => setValue(v => ({ ...v, negotiation_enabled: e.target.checked }))} disabled={!available} />
        Allow YQAA to negotiate within my pricing preferences
      </label>
      <p style={{ margin: '8px 0 0 28px', color: 'var(--text-muted, #667085)', fontSize: 14 }}>When off, YQAA can explain options and ask you to review pricing, but will not make automatic price concessions.</p>
    </div>
    <div style={box}>
      <h2 style={{ fontSize: 18, margin: '0 0 6px' }}>Negotiation limits</h2>
      <p style={{ margin: '0 0 18px', color: 'var(--text-muted, #667085)', fontSize: 14 }}>Leave a field blank to use the platform default. Any request outside automatic limits waits for your decision.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 18 }}>
        {fields.map(({ key, label: title, help, max }) => <div key={key}>
          <label htmlFor={key} style={label}>{title}</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input id={key} type="number" min="0" max={max} step="1" value={value[key] ?? ''} onChange={(e) => setValue(v => ({ ...v, [key]: e.target.value === '' ? null : Number(e.target.value) }))} disabled={!available || !value.negotiation_enabled} style={{ width: 100, padding: '9px 10px', border: '1px solid var(--border, #d0d5dd)', borderRadius: 8 }} />
            <span>{key === 'max_auto_concessions' ? 'moves' : '%'}</span>
          </div>
          <div style={{ marginTop: 5, fontSize: 12, color: 'var(--text-muted, #667085)' }}>{help}</div>
        </div>)}
      </div>
      <label style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 20 }}>
        <input type="checkbox" checked={value.prefer_accept} onChange={(e) => setValue(v => ({ ...v, prefer_accept: e.target.checked }))} disabled={!available || !value.negotiation_enabled} />
        Prefer accepting reasonable client counters within my automatic range
      </label>
    </div>
    {error && <div role="alert" style={{ color: 'var(--danger, #b42318)' }}>{error}</div>}
    {saved && <div role="status" style={{ color: 'var(--success, #067647)' }}>Pricing preferences saved.</div>}
    <div><button type="button" onClick={() => void save()} disabled={saving || !available} className="cv-head-offer-cta">{saving ? 'Saving…' : 'Save preferences'}</button></div>
  </section>
}
