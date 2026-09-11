'use client'

import React from 'react'
import { createPortal } from 'react-dom'
import { openOrderInApp } from '@/lib/orderLinks'

export type OfferDetailPayload = {
  offer: any
  sender?: { id?: string; full_name?: string | null; avatar_url?: string | null; role?: string | null } | null
  recipient?: { id?: string; full_name?: string | null; avatar_url?: string | null; role?: string | null } | null
  linked_gig?: { id: string; title: string; slug: string } | null
  attachments?: Array<{ id?: string; name: string; url?: string | null; size?: number; mime_type?: string | null }>
  order?: { id: string; order_number?: string | null; status?: string | null; total_amount?: number | null; escrow_status?: string | null; created_at?: string | null } | null
  viewer_relation?: 'sender' | 'recipient' | 'admin' | string
}

type Props = {
  open: boolean
  offerId: string
  details: OfferDetailPayload | null
  loading?: boolean
  error?: string
  onClose: () => void
}

function money(cents?: number | null, currency = 'USD') {
  const value = Number(cents || 0) / 100
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(value)
  } catch {
    return `$${value.toFixed(2)}`
  }
}

function when(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium', timeStyle: 'short',
  }).format(date)
}

function sizeLabel(bytes?: number | null) {
  const value = Number(bytes || 0)
  if (!value) return ''
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '120px minmax(0,1fr)', gap: 12, padding: '8px 0', borderBottom: '1px solid #EEF1F6' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
      <div style={{ fontSize: 13, color: '#0F172A', minWidth: 0, overflowWrap: 'anywhere' }}>{value ?? '—'}</div>
    </div>
  )
}

function Avatar({ person }: { person?: OfferDetailPayload['sender'] | OfferDetailPayload['recipient'] }) {
  const name = person?.full_name || 'YouSafe member'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#3C3B6E', color: '#fff', display: 'grid', placeItems: 'center', overflow: 'hidden', flex: '0 0 34px', fontSize: 12, fontWeight: 700 }}>
        {person?.avatar_url
          ? <img src={person.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : name.charAt(0).toUpperCase()}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
        <div style={{ fontSize: 11, color: '#64748B', textTransform: 'capitalize' }}>{person?.role || 'member'}</div>
      </div>
    </div>
  )
}

export default function OfferDetailPanel({ open, offerId, details, loading = false, error = '', onClose }: Props) {
  const [popupRoot, setPopupRoot] = React.useState<HTMLElement | null>(null)
  const popupRef = React.useRef<Window | null>(null)
  const [detachError, setDetachError] = React.useState('')

  const redock = React.useCallback(() => {
    try { popupRef.current?.close() } catch {}
    popupRef.current = null
    setPopupRoot(null)
  }, [])

  React.useEffect(() => {
    return () => {
      try { popupRef.current?.close() } catch {}
    }
  }, [])

  React.useEffect(() => {
    if (!open) redock()
  }, [open, redock])

  if (!open) return null

  const detach = () => {
    setDetachError('')
    const popup = window.open('', `yousafe-offer-${offerId}`, 'popup=yes,width=520,height=780,resizable=yes,scrollbars=yes')
    if (!popup) {
      setDetachError('Your browser blocked the detached panel. Allow pop-ups for YouSafe and try again.')
      return
    }

    popup.document.title = details?.offer?.title ? `Offer · ${details.offer.title}` : 'YouSafe offer details'
    popup.document.documentElement.style.background = '#F7F8FA'
    popup.document.body.style.margin = '0'
    popup.document.body.style.fontFamily = "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
    popup.document.body.style.background = '#F7F8FA'
    popup.document.body.innerHTML = ''

    for (const node of Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))) {
      try { popup.document.head.appendChild(node.cloneNode(true)) } catch {}
    }

    const mount = popup.document.createElement('div')
    mount.id = 'yousafe-detached-offer-panel'
    popup.document.body.appendChild(mount)
    popupRef.current = popup
    setPopupRoot(mount)
    popup.addEventListener('beforeunload', () => {
      popupRef.current = null
      setPopupRoot(null)
    }, { once: true })
  }

  const closeAll = () => {
    redock()
    onClose()
  }

  const offer = details?.offer
  const effectiveCents = offer
    ? Number(offer.discount_cents ?? offer.discounted_price ?? offer.price_cents ?? offer.price ?? 0)
    : 0
  const currency = String(offer?.currency || 'USD')
  const revisions = Number(offer?.revisions || 0)
  const order = details?.order

  const panel = (
    <section
      aria-label="Offer details"
      style={{
        width: popupRoot ? '100%' : 'min(430px, 100%)',
        height: popupRoot ? '100vh' : '100%',
        position: popupRoot ? 'relative' : 'absolute',
        inset: popupRoot ? undefined : '0 0 0 auto',
        zIndex: 120,
        display: 'flex',
        flexDirection: 'column',
        background: '#FFFFFF',
        borderLeft: popupRoot ? 'none' : '1px solid #E2E8F0',
        boxShadow: popupRoot ? 'none' : '-18px 0 50px rgba(15,23,42,.14)',
        color: '#0F172A',
      }}
    >
      <header style={{ height: 54, flex: '0 0 54px', display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px 0 16px', borderBottom: '1px solid #E2E8F0', background: '#F8FAFC' }}>
        <div style={{ width: 8, height: 8, borderRadius: 99, background: '#C4A45A', flex: '0 0 auto' }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: '#475569' }}>Offer details</div>
          <div style={{ fontSize: 11, color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{offerId}</div>
        </div>
        {popupRoot ? (
          <button type="button" onClick={redock} title="Dock panel back into Messenger" style={iconBtn}>↙</button>
        ) : (
          <button type="button" onClick={detach} title="Detach panel into its own window" style={iconBtn}>↗</button>
        )}
        <button type="button" onClick={closeAll} title="Close offer details" style={iconBtn}>×</button>
      </header>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 18 }}>
        {detachError && <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: '#FEF2F2', color: '#991B1B', fontSize: 12 }}>{detachError}</div>}
        {loading && !details ? <div style={{ padding: '30px 4px', color: '#64748B', fontSize: 13 }}>Loading complete offer details…</div> : null}
        {error && !details ? <div style={{ padding: 12, borderRadius: 8, background: '#FEF2F2', color: '#991B1B', fontSize: 13 }}>{error}</div> : null}

        {details && offer ? (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: '#C68B27', marginBottom: 5 }}>Custom offer</div>
                <h2 style={{ margin: 0, fontFamily: "Lora,Georgia,serif", fontSize: 22, lineHeight: 1.2, fontWeight: 600 }}>{offer.title}</h2>
              </div>
              <span style={{ flex: '0 0 auto', padding: '4px 9px', borderRadius: 999, background: '#EEF2FF', color: '#3730A3', fontSize: 10, fontWeight: 800, textTransform: 'uppercase' }}>{offer.status}</span>
            </div>

            {offer.description ? <p style={{ margin: '0 0 16px', whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6, color: '#475569' }}>{offer.description}</p> : null}

            <div style={sectionStyle}>
              <div style={sectionTitle}>People</div>
              <div style={{ display: 'grid', gap: 12 }}>
                <div><div style={miniLabel}>Sender</div><Avatar person={details.sender} /></div>
                <div><div style={miniLabel}>Recipient</div><Avatar person={details.recipient} /></div>
              </div>
            </div>

            <div style={sectionStyle}>
              <div style={sectionTitle}>Commercial terms</div>
              <Row label="Price" value={money(effectiveCents, currency)} />
              {Number(offer.discount_cents || 0) > 0 && <Row label="Original" value={money(Number(offer.price_cents || offer.price || 0), currency)} />}
              <Row label="Delivery" value={`${offer.delivery_days} day${Number(offer.delivery_days) === 1 ? '' : 's'}`} />
              <Row label="Revisions" value={revisions >= 999 ? 'Unlimited' : revisions} />
              <Row label="Expires" value={when(offer.expires_at)} />
              <Row label="Created" value={when(offer.created_at)} />
              {offer.accepted_at && <Row label="Accepted" value={when(offer.accepted_at)} />}
            </div>

            {details.linked_gig ? (
              <div style={sectionStyle}>
                <div style={sectionTitle}>Linked service</div>
                <a href={`https://market.yousafeconsultancy.com/gigs/${details.linked_gig.slug}`} target="_blank" rel="noreferrer" style={{ color: '#3C3B6E', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
                  {details.linked_gig.title} ↗
                </a>
              </div>
            ) : null}

            <div style={sectionStyle}>
              <div style={sectionTitle}>Attachments</div>
              {(details.attachments || []).length ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  {(details.attachments || []).map((file, index) => {
                    const label = [file.mime_type, sizeLabel(file.size)].filter(Boolean).join(' · ')
                    const content = (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: 10, border: '1px solid #E2E8F0', borderRadius: 9, background: '#F8FAFC' }}>
                        <span aria-hidden>📎</span>
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                          {label && <span style={{ display: 'block', marginTop: 2, fontSize: 10, color: '#94A3B8' }}>{label}</span>}
                        </span>
                      </div>
                    )
                    return file.url && /^https?:\/\//i.test(file.url)
                      ? <a key={file.id || index} href={file.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>{content}</a>
                      : <div key={file.id || index}>{content}</div>
                  })}
                </div>
              ) : <div style={{ fontSize: 12, color: '#94A3B8' }}>No attachments</div>}
            </div>

            {order ? (
              <div style={{ ...sectionStyle, borderColor: '#C7D2FE', background: '#F8FAFF', padding: 12, borderRadius: 10 }}>
                <div style={sectionTitle}>Linked order</div>
                <Row label="Order" value={order.order_number || order.id} />
                <Row label="Status" value={order.status || '—'} />
                <Row label="Escrow" value={order.escrow_status || '—'} />
                <Row label="Total" value={order.total_amount != null ? money(Number(order.total_amount), currency) : '—'} />
                <Row label="Created" value={when(order.created_at)} />
                <button type="button" onClick={() => openOrderInApp(order.id)} style={{ marginTop: 12, width: '100%', padding: '10px 12px', border: 0, borderRadius: 9, background: '#3C3B6E', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
                  Open order →
                </button>
              </div>
            ) : null}

            <div style={sectionStyle}>
              <div style={sectionTitle}>References</div>
              <Row label="Offer ID" value={offer.id} />
              <Row label="Thread ID" value={offer.chat_id || '—'} />
              {offer.gig_id && <Row label="Gig ID" value={offer.gig_id} />}
              {order?.id && <Row label="Order ID" value={order.id} />}
            </div>
          </>
        ) : null}
      </div>
    </section>
  )

  if (popupRoot) return createPortal(panel, popupRoot)
  return panel
}

const iconBtn: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 7,
  border: '1px solid #E2E8F0',
  background: '#FFFFFF',
  color: '#334155',
  display: 'grid',
  placeItems: 'center',
  cursor: 'pointer',
  fontSize: 18,
  lineHeight: 1,
}

const sectionStyle: React.CSSProperties = {
  marginTop: 16,
  paddingTop: 14,
  borderTop: '1px solid #E2E8F0',
}

const sectionTitle: React.CSSProperties = {
  marginBottom: 10,
  fontSize: 11,
  fontWeight: 800,
  color: '#475569',
  letterSpacing: '.08em',
  textTransform: 'uppercase',
}

const miniLabel: React.CSSProperties = {
  marginBottom: 5,
  fontSize: 10,
  fontWeight: 800,
  color: '#94A3B8',
  textTransform: 'uppercase',
  letterSpacing: '.08em',
}
