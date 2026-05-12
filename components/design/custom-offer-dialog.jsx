'use client'
// @ts-nocheck
import React from 'react'
import { C, Avatar } from './shared'

const money = (cents, currency = 'usd') => new Intl.NumberFormat('en-US', { style: 'currency', currency: String(currency).toUpperCase() }).format(Number(cents || 0) / 100)
const cleanMoney = value => {
  const next = String(value || '').replace(/[^0-9.]/g, '')
  const parts = next.split('.')
  return parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : next
}
const toCents = value => Math.round((Number(value) || 0) * 100)
const fileSize = bytes => Number(bytes) >= 1024 * 1024 ? `${(Number(bytes) / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(Number(bytes || 0) / 1024))} KB`

const defaults = {
  title: '',
  description: '',
  price: '',
  hasDiscount: false,
  discountPrice: '',
  deliveryTime: '1',
  deliveryUnit: 'days',
  revisions: '1',
  expiresIn: '7',
  gigId: '',
}

export default function CustomOfferDialog({ chatId, providerRole = 'consultant', recipientName = 'Client', recipientAvatar, onClose, onCreated }) {
  const [form, setForm] = React.useState(defaults)
  const [files, setFiles] = React.useState([])
  const [settings, setSettings] = React.useState(null)
  const [gigs, setGigs] = React.useState([])
  const [errors, setErrors] = React.useState({})
  const [submitting, setSubmitting] = React.useState(false)
  const dialogRef = React.useRef(null)
  const firstRef = React.useRef(null)
  const fileRef = React.useRef(null)

  React.useEffect(() => {
    document.body.style.overflow = 'hidden'
    firstRef.current?.focus()
    fetch('/api/admin/payment-settings').then(r => r.json()).then(p => setSettings(p.data || null)).catch(() => {})
    fetch('/api/dashboard/gigs').then(r => r.json()).then(p => setGigs((p.data?.gigs || []).filter(g => g.status === 'active'))).catch(() => {})
    return () => {
      document.body.style.overflow = ''
      setForm(defaults)
      setFiles([])
      setErrors({})
      setSubmitting(false)
    }
  }, [])

  React.useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])')
        const list = Array.from(focusables).filter(el => !el.disabled)
        if (!list.length) return
        const first = list[0]
        const last = list[list.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }))
  const currency = settings?.primary_currency || 'usd'
  const isAttorney = providerRole === 'attorney'
  const fee = isAttorney
    ? Number(settings?.attorney_platform_fee_percent ?? 25)
    : Number(settings?.platform_fee_percent ?? 20)
  const consultantShare = Number(settings?.consultant_fee_percent ?? Math.max(0, 100 - fee))
  const priceCents = toCents(form.price)
  const finalCents = form.hasDiscount && form.discountPrice ? toCents(form.discountPrice) : priceCents
  const safeFinalCents = Number.isFinite(finalCents) ? finalCents : 0
  const platformFeeCents = Math.max(0, Math.round(safeFinalCents * (fee / 100)))
  const receiveCents = isAttorney
    ? safeFinalCents
    : Math.max(0, Math.round(safeFinalCents * (consultantShare / 100)) || (safeFinalCents - platformFeeCents))
  const clientPaysCents = isAttorney ? safeFinalCents + platformFeeCents : safeFinalCents
  const savings = form.hasDiscount && priceCents > 0 && finalCents > 0 ? Math.round((1 - finalCents / priceCents) * 100) : 0

  const validate = () => {
    const next = {}
    if (form.title.trim().length < 10) next.title = 'Use at least 10 characters.'
    if (form.description.trim().length < 30) next.description = 'Use at least 30 characters.'
    if (!priceCents) next.price = 'Enter a valid price.'
    if (settings && priceCents < settings.minimum_offer_amount_cents) next.price = `Minimum is ${money(settings.minimum_offer_amount_cents, currency)}.`
    if (settings && priceCents > settings.maximum_offer_amount_cents) next.price = `Maximum is ${money(settings.maximum_offer_amount_cents, currency)}.`
    if (form.hasDiscount && (!finalCents || finalCents >= priceCents)) next.discountPrice = 'Discount must be lower than the original price.'
    if (form.hasDiscount && settings && finalCents < settings.minimum_offer_amount_cents) next.discountPrice = `Minimum is ${money(settings.minimum_offer_amount_cents, currency)}.`
    if (!Number.isInteger(Number(form.deliveryTime)) || Number(form.deliveryTime) < 1) next.deliveryTime = 'Enter a positive whole number.'
    if (!form.revisions) next.revisions = 'Choose revision count.'
    if (!form.expiresIn) next.expiresIn = 'Choose an expiry.'
    if (files.length > 5) next.files = 'Maximum 5 files.'
    if (files.some(f => f.size > 20 * 1024 * 1024)) next.files = 'Each file must be 20 MB or less.'
    setErrors(next)
    return next
  }

  const chooseGig = gigId => {
    update('gigId', gigId)
    const gig = gigs.find(g => g.id === gigId)
    const basic = (gig?.tiers || []).find(t => t.tier === 'basic') || (gig?.tiers || [])[0]
    if (gig && basic) {
      setForm(prev => ({
        ...prev,
        gigId,
        title: gig.title || prev.title,
        description: gig.description || gig.pitch || prev.description,
        price: String(Number(basic.price || 0) / 100),
      }))
    }
  }

  const addFiles = selected => {
    const next = [...files, ...Array.from(selected || [])].slice(0, 5)
    setFiles(next)
  }

  const submit = async e => {
    e.preventDefault()
    if (submitting) return
    const nextErrors = validate()
    if (Object.keys(nextErrors).length) return
    setSubmitting(true)
    try {
      let uploaded = []
      if (files.length) {
        const fd = new FormData()
        files.forEach(f => fd.append('files[]', f))
        const res = await fetch('/api/uploads', { method: 'POST', body: fd })
        const payload = await res.json()
        if (!res.ok) throw new Error(payload?.error?.message || 'File upload failed.')
        uploaded = payload.data?.files || []
      }
      const days = form.deliveryUnit === 'hours'
        ? Math.max(1, Math.ceil(Number(form.deliveryTime) / 24))
        : form.deliveryUnit === 'weeks'
          ? Number(form.deliveryTime) * 7
          : Number(form.deliveryTime)
      const expiresAt = new Date(Date.now() + Number(form.expiresIn) * 24 * 60 * 60 * 1000).toISOString()
      const res = await fetch('/api/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          title: form.title,
          description: form.description,
          price: priceCents,
          discounted_price: form.hasDiscount ? finalCents : undefined,
          delivery_days: days,
          revisions: form.revisions === 'unlimited' ? 999 : Number(form.revisions),
          expires_at: expiresAt,
          gig_id: form.gigId || undefined,
          file_urls: uploaded.map(f => f.file_url),
        }),
      })
      const payload = await res.json()
      if (!res.ok) {
        if (payload?.error?.fields) setErrors(payload.error.fields)
        throw new Error(payload?.error?.message || 'Could not send offer.')
      }
      onCreated?.(payload.data?.offer_card_html_or_json)
      setTimeout(onClose, 200)
    } catch (err) {
      setErrors(prev => ({ ...prev, form: err.message || 'Could not send offer.' }))
      setSubmitting(false)
    }
  }

  return (
    <div onMouseDown={e => { if (e.target === e.currentTarget) onClose() }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <form ref={dialogRef} onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="dialog-title" style={{ width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: '16px', boxShadow: 'none', color: C.text }}>
        <div style={{ padding: '18px 20px 12px', display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
          <div>
            <div id="dialog-title" style={{ fontSize: '16px', fontWeight: 500 }}>Send custom offer</div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', marginTop: '8px', padding: '4px 9px', borderRadius: '999px', background: C.surface2, color: C.textMuted, fontSize: '12px', fontWeight: 700 }}>
              <Avatar name={recipientName} src={recipientAvatar} size={18} /> {recipientName}
            </div>
          </div>
          <button type="button" aria-label="Close offer dialog" onClick={onClose} style={iconBtn}>x</button>
        </div>
        <Divider />
        <div style={{ padding: '20px', display: 'grid', gap: '24px' }}>
          {errors.form && <Error>{errors.form}</Error>}
          <Section title="Offer details">
            <Field id="offer-title" label="Offer title" error={errors.title}>
              <input ref={firstRef} id="offer-title" value={form.title} onChange={e => update('title', e.target.value.slice(0, 120))} onBlur={validate} placeholder="e.g. Immigration consultation - 2 hrs" style={inputStyle(errors.title)} />
            </Field>
            <Field id="offer-description" label="Description" error={errors.description}>
              <div style={{ position: 'relative' }}>
                <textarea id="offer-description" rows={6} value={form.description} onChange={e => update('description', e.target.value.slice(0, 1200))} onBlur={validate} style={{ ...inputStyle(errors.description), minHeight: '132px', paddingBottom: '24px', resize: 'vertical' }} />
                <span style={{ position: 'absolute', right: '10px', bottom: '8px', color: C.textDim, fontSize: '12px' }}>{form.description.length}/1200</span>
              </div>
            </Field>
          </Section>

          <Section title="Pricing">
            <Field id="offer-price" label="Price" error={errors.price}>
              <MoneyInput id="offer-price" value={form.price} currency={currency} error={errors.price} onChange={v => update('price', cleanMoney(v))} onBlur={validate} />
            </Field>
            <button type="button" onClick={() => update('hasDiscount', !form.hasDiscount)} style={{ width: 'fit-content', border: `1px solid ${form.hasDiscount ? C.orange : C.border2}`, background: form.hasDiscount ? 'rgba(217,119,6,0.10)' : C.surface2, color: form.hasDiscount ? C.orange : C.text, borderRadius: '999px', padding: '8px 12px', fontWeight: 800, cursor: 'pointer' }}>Add a discount</button>
            {form.hasDiscount && (
              <Field id="discount-price" label="Discounted price" error={errors.discountPrice}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <MoneyInput id="discount-price" value={form.discountPrice} currency={currency} error={errors.discountPrice} onChange={v => update('discountPrice', cleanMoney(v))} onBlur={validate} />
                  {savings > 0 && <span style={{ background: 'rgba(217,119,6,0.12)', color: C.orange, borderRadius: '999px', padding: '6px 10px', fontSize: '12px', fontWeight: 800 }}>{savings}% off</span>}
                </div>
              </Field>
            )}
            <div aria-live="polite" style={{ border: `1px solid ${C.border}`, borderRadius: '10px', background: C.surface2, padding: '12px', display: 'grid', gap: '6px', fontSize: '13px' }}>
              <div style={{ color: C.textDim, fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Live client preview
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                <span>{isAttorney ? 'Your attorney fee' : 'Offer price'}</span>
                <strong>{money(finalCents, currency)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                <span>Platform amount ({fee}%)</span>
                <strong>{money(platformFeeCents, currency)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                <span>{isAttorney ? 'You receive' : `You receive (${consultantShare}%)`}</span>
                <strong>{money(receiveCents, currency)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', borderTop: `1px solid ${C.border}`, paddingTop: '6px', fontWeight: 900 }}>
                <span>Client pays</span>
                <strong>{money(clientPaysCents, currency)}</strong>
              </div>
              <div style={{ color: C.textDim, fontSize: '11px', lineHeight: 1.45 }}>
                {isAttorney
                  ? 'Attorney offers add the platform fee on top, so your fee is not split.'
                  : 'Consultant offers include the platform amount inside the client price.'}
              </div>
            </div>
          </Section>

          <Section title="Delivery terms">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: '10px' }}>
              <Field id="delivery-time" label="Delivery time" error={errors.deliveryTime}>
                <input id="delivery-time" value={form.deliveryTime} onChange={e => update('deliveryTime', e.target.value.replace(/\D/g, ''))} onBlur={validate} style={inputStyle(errors.deliveryTime)} />
              </Field>
              <Field id="delivery-unit" label="Unit">
                <select id="delivery-unit" value={form.deliveryUnit} onChange={e => update('deliveryUnit', e.target.value)} style={inputStyle()}><option value="hours">Hours</option><option value="days">Days</option><option value="weeks">Weeks</option></select>
              </Field>
            </div>
            <Field id="revisions" label="Revisions" error={errors.revisions}>
              <select id="revisions" value={form.revisions} onChange={e => update('revisions', e.target.value)} onBlur={validate} style={inputStyle(errors.revisions)}>{['0','1','2','3','5','10','unlimited'].map(v => <option key={v} value={v}>{v === 'unlimited' ? 'Unlimited' : v}</option>)}</select>
            </Field>
            <Field id="expires-in" label="Offer expires in" error={errors.expiresIn}>
              <select id="expires-in" value={form.expiresIn} onChange={e => update('expiresIn', e.target.value)} onBlur={validate} style={inputStyle(errors.expiresIn)}>{[1,3,7,14,30].map(v => <option key={v} value={v}>{v} day{v === 1 ? '' : 's'}</option>)}</select>
            </Field>
          </Section>

          <Section title="Attachments">
            <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.jpg,.jpeg,.png,.mp4,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,video/mp4" style={{ display: 'none' }} onChange={e => addFiles(e.target.files)} />
            <button type="button" onClick={() => fileRef.current?.click()} onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files) }} onDragOver={e => e.preventDefault()} style={{ height: '74px', border: `1px dashed ${errors.files ? C.red : C.border2}`, borderRadius: '8px', background: C.surface2, cursor: 'pointer', color: C.textMuted, fontWeight: 800 }}>Drop files here or click to browse</button>
            {errors.files && <Error>{errors.files}</Error>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>{files.map((f, i) => <span key={`${f.name}-${i}`} style={{ display: 'inline-flex', gap: '8px', alignItems: 'center', border: `1px solid ${C.border}`, borderRadius: '999px', padding: '6px 9px', fontSize: '12px' }}>FILE {f.name} {fileSize(f.size)} <button type="button" onClick={() => setFiles(files.filter((_, idx) => idx !== i))} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>x</button></span>)}</div>
          </Section>

          <Section title="Link a gig">
            <select value={form.gigId} onChange={e => chooseGig(e.target.value)} style={inputStyle()}>
              <option value="">No linked gig</option>
              {gigs.map(g => <option key={g.id} value={g.id}>{g.title} - from {money(Math.min(...(g.tiers || []).map(t => Number(t.price || 0)).filter(Boolean)), currency)}</option>)}
            </select>
          </Section>
        </div>
        <Divider />
        <div style={{ position: 'sticky', bottom: 0, background: '#fff', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
          <div style={{ color: C.textMuted, fontSize: '13px', fontWeight: 700 }}>Client pays: {money(clientPaysCents, currency)} | You receive: {money(receiveCents, currency)} | Platform: {money(platformFeeCents, currency)}</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" onClick={onClose} style={secondaryBtn}>Cancel</button>
            <button type="submit" disabled={submitting || !settings} style={{ ...primaryBtn, opacity: submitting || !settings ? 0.55 : 1 }}>{submitting ? 'Sending...' : 'Send Offer >'}</button>
          </div>
        </div>
      </form>
    </div>
  )
}

function Section({ title, children }) {
  return <section style={{ display: 'grid', gap: '12px' }}><div style={{ fontSize: '12px', fontWeight: 500, textTransform: 'uppercase', color: C.textMuted, letterSpacing: '0.06em' }}>{title}</div>{children}</section>
}
function Field({ id, label, error, children }) {
  return <div style={{ display: 'grid', gap: '6px' }}><label htmlFor={id} style={{ color: C.text, fontSize: '13px', fontWeight: 700 }}>{label}</label>{children}{error && <Error>{error}</Error>}</div>
}
function Error({ children }) { return <div style={{ color: C.red, fontSize: '12px' }}>{children}</div> }
function Divider() { return <div style={{ height: '1px', background: C.border }} /> }
function MoneyInput({ id, value, currency, error, onChange, onBlur }) {
  return <div style={{ position: 'relative', width: '100%' }}><span style={{ position: 'absolute', left: '8px', top: '7px', height: '26px', display: 'inline-flex', alignItems: 'center', padding: '0 8px', borderRadius: '6px', background: C.surface2, color: C.textMuted, fontFamily: 'monospace', fontSize: '13px' }}>$ {String(currency).toUpperCase()}</span><input id={id} value={value} onChange={e => onChange(e.target.value)} onBlur={onBlur} inputMode="decimal" style={{ ...inputStyle(error), paddingLeft: '82px' }} /></div>
}
const inputStyle = error => ({ width: '100%', height: '40px', boxSizing: 'border-box', border: `0.5px solid ${error ? C.red : C.border2}`, borderRadius: '8px', padding: '9px 10px', outline: 'none', font: 'inherit', color: C.text, background: '#fff' })
const iconBtn = { border: `1px solid ${C.border}`, background: C.surface2, borderRadius: '999px', width: '32px', height: '32px', cursor: 'pointer', color: C.text }
const secondaryBtn = { border: `1px solid ${C.border2}`, background: C.surface, borderRadius: '999px', padding: '9px 14px', cursor: 'pointer', fontWeight: 800, color: C.text }
const primaryBtn = { border: 'none', background: C.text, color: '#fff', borderRadius: '999px', padding: '9px 14px', cursor: 'pointer', fontWeight: 800 }
