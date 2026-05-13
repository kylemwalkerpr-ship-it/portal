'use client'
// @ts-nocheck
import React from 'react'
import Link from 'next/link'
import { loadStripe } from '@stripe/stripe-js'
import { C, Btn, Badge, Card, Input, Select, ProgressBar } from './shared'

const ORDER_COLUMNS = [
  { id: 'pending', label: 'Pending', statuses: ['pending', 'queued', 'created', 'new'], color: 'orange' },
  { id: 'in_progress', label: 'In progress', statuses: ['active', 'in_progress'], color: 'cyan' },
  { id: 'review', label: 'Review', statuses: ['review', 'under_review', 'revision_requested'], color: 'purple' },
  { id: 'completed', label: 'Completed', statuses: ['completed', 'released', 'paid'], color: 'green' },
  { id: 'exception', label: 'Exceptions', statuses: ['cancelled', 'refunded', 'declined'], color: 'red' },
]

const STATUS_OPTIONS = ['pending', 'in_progress', 'under_review', 'revision_requested', 'completed', 'released', 'cancelled', 'refunded']
const CATEGORY_FALLBACK = ['Immigration consultation', 'Document review', 'Study permits', 'University admissions', 'Settlement planning', 'Career mentorship', 'Legal forms review', 'Business immigration']
const TIERS = ['basic', 'standard', 'premium']
const STRIPE_PUB_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
const TERMS_URL = 'https://usa.yousafeconsultancy.com/terms-of-service'
const REFUND_POLICY_URL = 'https://yousafeconsultancy.com/refund-policy'

const pageShell = {
  minHeight: '100vh',
  background: C.bg,
  color: C.text,
  fontFamily: C.sans,
}

const inner = {
  width: 'min(1180px, calc(100vw - 32px))',
  margin: '0 auto',
  padding: '28px 0 48px',
}

const toolbar = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '16px',
  flexWrap: 'wrap',
  marginBottom: '20px',
}

const titleStyle = {
  fontFamily: C.serif,
  fontSize: '34px',
  fontWeight: 500,
  letterSpacing: '-0.012em',
  margin: 0,
  color: C.text,
}

const subStyle = { margin: '6px 0 0', color: C.textMuted, fontSize: '14px', lineHeight: 1.6 }
const sectionTitle = { margin: 0, fontSize: '15px', fontWeight: 800, color: C.text }
const labelStyle = { display: 'grid', gap: '6px', color: C.textMuted, fontSize: '12px', fontWeight: 800 }
const textareaStyle = { width: '100%', minHeight: '96px', resize: 'vertical', boxSizing: 'border-box', border: `1px solid ${C.border2}`, borderRadius: '10px', padding: '11px 12px', background: C.surface2, color: C.text, fontFamily: 'inherit', fontSize: '14px', lineHeight: 1.5 }
const inputStyle = { width: '100%', boxSizing: 'border-box', border: `1px solid ${C.border2}`, borderRadius: '10px', padding: '11px 12px', background: C.surface2, color: C.text, fontFamily: 'inherit', fontSize: '14px' }

function money(cents, currency = 'usd') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: String(currency || 'usd').toUpperCase(), minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(cents || 0) / 100)
}

function dollars(cents) {
  return (Number(cents || 0) / 100).toFixed(2)
}

function compactDate(value) {
  if (!value) return 'No date'
  try { return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) } catch { return 'No date' }
}

function statusColor(status) {
  const normalized = String(status || '').toLowerCase()
  if (['completed', 'released', 'paid', 'active'].includes(normalized)) return 'green'
  if (['cancelled', 'refunded', 'declined'].includes(normalized)) return 'red'
  if (['under_review', 'revision_requested', 'review'].includes(normalized)) return 'purple'
  if (['pending', 'queued', 'created', 'new'].includes(normalized)) return 'orange'
  return 'gray'
}

function providerName(gig) {
  return gig?.provider?.full_name || gig?.provider?.email || 'YouSafe provider'
}

async function requestJson(url, options = {}) {
  const res = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: options.body && !(options.body instanceof FormData)
      ? { 'Content-Type': 'application/json', ...(options.headers || {}) }
      : options.headers,
  })
  const payload = await res.json().catch(() => ({}))
  const message = payload?.error?.message || payload?.error || `Request failed (${res.status})`
  if (!res.ok) {
    const error = new Error(message)
    error.fields = payload?.error?.fields || {}
    throw error
  }
  return payload?.data ?? payload
}

function Header({ eyebrow, title, sub, actions }) {
  return (
    <div style={toolbar}>
      <div>
        {eyebrow && <div style={{ color: C.textMuted, fontSize: '11px', letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 800, marginBottom: '4px' }}>{eyebrow}</div>}
        <h1 style={titleStyle}>{title}</h1>
        {sub && <p style={subStyle}>{sub}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  )
}

export function EmptyState({ title, body, action }) {
  return (
    <Card style={{ padding: '28px', textAlign: 'center' }}>
      <div style={{ fontSize: '16px', fontWeight: 800, marginBottom: '6px' }}>{title}</div>
      <div style={{ color: C.textMuted, fontSize: '14px', lineHeight: 1.6, margin: '0 auto 16px', maxWidth: '420px' }}>{body}</div>
      {action}
    </Card>
  )
}

export function LoadingState({ label = 'Loading...' }) {
  return <div style={pageShell}><main style={inner}><Card><div style={{ color: C.textMuted }}>{label}</div></Card></main></div>
}

export function ErrorState({ message, onRetry }) {
  return (
    <div style={pageShell}>
      <main style={inner}>
        <Card style={{ borderColor: 'rgba(220,38,38,0.25)' }}>
          <div style={{ color: C.red, fontWeight: 800, marginBottom: '8px' }}>Could not load this page</div>
          <div style={{ color: C.textMuted, fontSize: '14px', marginBottom: '16px' }}>{message}</div>
          {onRetry && <Btn variant="secondary" size="sm" onClick={onRetry}>Retry</Btn>}
        </Card>
      </main>
    </div>
  )
}

function Cover({ gig, height = 150 }) {
  const images = Array.isArray(gig?.gallery_images) ? gig.gallery_images : []
  const src = images.find(img => img?.url)?.url
  if (src) return <img src={src} alt={gig.title} style={{ width: '100%', height, objectFit: 'cover', borderRadius: '8px', border: `1px solid ${C.border}` }} />
  return (
    <div style={{ height, borderRadius: '8px', border: `1px solid ${C.border}`, background: `linear-gradient(135deg, ${C.surface2}, #E8EEF6 50%, #F8E9EA)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.text, fontFamily: C.serif, fontSize: '28px', fontWeight: 600 }}>
      {String(gig?.title || 'YS').slice(0, 2).toUpperCase()}
    </div>
  )
}

export function MarketplacePage() {
  const [gigs, setGigs] = React.useState([])
  const [categories, setCategories] = React.useState(CATEGORY_FALLBACK)
  const [filters, setFilters] = React.useState({ q: '', category: '', provider_type: '', min_price: '', max_price: '', min_rating: '', sort: 'relevance' })
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')

  const load = React.useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      for (const key of ['q', 'category', 'provider_type', 'sort']) {
        if (filters[key]) params.set(key, filters[key])
      }
      const [gigData, catData] = await Promise.all([
        requestJson(`/api/marketplace/gigs?${params.toString()}`),
        requestJson('/api/gig-categories').catch(() => ({ categories: CATEGORY_FALLBACK })),
      ])
      setGigs(gigData.gigs || [])
      setCategories(catData.categories || CATEGORY_FALLBACK)
      for (const gig of gigData.gigs || []) {
        requestJson('/api/gig-metrics/event', { method: 'POST', body: JSON.stringify({ gig_id: gig.id, event_type: 'impression' }) }).catch(() => {})
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [filters])

  React.useEffect(() => { load() }, [load])

  const visibleGigs = gigs.filter(gig => {
    const price = Number(gig.starting_price || 0) / 100
    const min = Number(filters.min_price || 0)
    const max = Number(filters.max_price || 0)
    const rating = Number(gig.avg_rating || 0)
    const minRating = Number(filters.min_rating || 0)
    if (min && price < min) return false
    if (max && price > max) return false
    if (minRating && rating < minRating) return false
    return true
  })

  if (error && !gigs.length) return <ErrorState message={error} onRetry={load} />

  return (
    <div style={pageShell}>
      <main style={inner}>
        <Header
          eyebrow="Marketplace"
          title="Find the right expert."
          sub="Browse fixed-scope legal, immigration, and study-abroad gigs from verified YouSafe providers."
          actions={<Link href="/dashboard" style={{ color: C.textMuted, fontWeight: 800, textDecoration: 'none', fontSize: '13px' }}>Dashboard</Link>}
        />

        <Card style={{ padding: '16px', marginBottom: '18px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }} className="ys-market-filters">
            <Input value={filters.q} onChange={q => setFilters(f => ({ ...f, q }))} placeholder="Search services" />
            <Select value={filters.category} onChange={category => setFilters(f => ({ ...f, category }))} options={[{ value: '', label: 'All categories' }, ...categories.map(c => ({ value: c, label: c }))]} />
            <Select value={filters.provider_type} onChange={provider_type => setFilters(f => ({ ...f, provider_type }))} options={[{ value: '', label: 'All providers' }, { value: 'attorney', label: 'Attorneys' }, { value: 'consultant', label: 'Consultants' }]} />
            <Input type="number" value={filters.min_price} onChange={min_price => setFilters(f => ({ ...f, min_price }))} placeholder="Min price" />
            <Input type="number" value={filters.max_price} onChange={max_price => setFilters(f => ({ ...f, max_price }))} placeholder="Max price" />
            <Select value={filters.min_rating} onChange={min_rating => setFilters(f => ({ ...f, min_rating }))} options={[{ value: '', label: 'Any rating' }, { value: '4.5', label: '4.5+ stars' }, { value: '4', label: '4.0+ stars' }, { value: '3', label: '3.0+ stars' }]} />
            <Select value={filters.sort} onChange={sort => setFilters(f => ({ ...f, sort }))} options={[
              { value: 'relevance', label: 'Recommended' },
              { value: 'best_rated', label: 'Best rated' },
              { value: 'most_orders', label: 'Most orders' },
              { value: 'price_asc', label: 'Price low to high' },
              { value: 'price_desc', label: 'Price high to low' },
              { value: 'newest', label: 'Newest' },
            ]} />
          </div>
        </Card>

        {loading ? (
          <Card><div style={{ color: C.textMuted }}>Loading gigs...</div></Card>
        ) : visibleGigs.length === 0 ? (
          <EmptyState title="No gigs match these filters." body="Try a broader search or clear the category/provider filters." />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
            {visibleGigs.map(gig => (
              <Link key={gig.id} href={`/marketplace/gigs/${gig.slug}`} onClick={() => requestJson('/api/gig-metrics/event', { method: 'POST', body: JSON.stringify({ gig_id: gig.id, event_type: 'click' }) }).catch(() => {})} style={{ textDecoration: 'none', color: 'inherit' }}>
                <Card hover style={{ padding: '14px', height: '100%', display: 'grid', gap: '12px', alignContent: 'start' }}>
                  <Cover gig={gig} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <Badge color={gig.provider_type === 'attorney' ? 'green' : 'purple'}>{gig.provider_type}</Badge>
                    {gig.new_badge && <Badge color="orange">New</Badge>}
                    {gig.category && <span style={{ color: C.textMuted, fontSize: '12px' }}>{gig.category}</span>}
                  </div>
                  <div style={{ fontWeight: 800, color: C.text, fontSize: '16px', lineHeight: 1.35 }}>{gig.title}</div>
                  <div style={{ color: C.textMuted, fontSize: '13px', lineHeight: 1.5, minHeight: '38px' }}>{gig.pitch || 'Fixed-scope support with clear pricing and delivery.'}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: '12px' }}>
                    <div>
                      <div style={{ color: C.textMuted, fontSize: '11px', fontWeight: 800 }}>Provider</div>
                      <div style={{ color: C.text, fontSize: '13px', fontWeight: 700 }}>{providerName(gig)}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: C.textMuted, fontSize: '11px', fontWeight: 800 }}>Starts at</div>
                      <div style={{ color: C.text, fontSize: '18px', fontWeight: 900 }}>{gig.starting_price ? money(gig.starting_price) : '—'}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: C.textMuted, fontSize: '12px' }}>
                    <span>{Number(gig.avg_rating || 0).toFixed(1)} rating · {gig.review_count || 0} reviews</span>
                    <span>{gig.delivery_days ? `${gig.delivery_days}d delivery` : 'Timeline set'}</span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
      <style jsx global>{`
        @media (max-width: 860px) {
          .ys-market-filters { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}

export function GigDetailPage({ slug }) {
  const [gig, setGig] = React.useState(null)
  const [selectedTierId, setSelectedTierId] = React.useState('')
  const [checkoutOpen, setCheckoutOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [notice, setNotice] = React.useState('')
  const [error, setError] = React.useState('')

  const load = React.useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await requestJson(`/api/marketplace/gigs/${slug}`)
      const loaded = data.gig
      const tiers = (loaded.tiers || []).filter(t => t.is_active).sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier))
      setGig(loaded)
      setSelectedTierId(tiers[0]?.id || '')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [slug])

  React.useEffect(() => { load() }, [load])

  const purchase = async () => {
    if (!selectedTierId || !gig) return
    setCheckoutOpen(true)
  }

  if (loading) return <LoadingState label="Loading gig..." />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (!gig) return null

  const tiers = (gig.tiers || []).filter(t => t.is_active).sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier))
  const selectedTier = tiers.find(t => t.id === selectedTierId) || tiers[0]
  const faq = Array.isArray(gig.faq) ? gig.faq : []

  return (
    <div style={pageShell}>
      <main style={inner}>
        <Header
          eyebrow="Gig detail"
          title={gig.title}
          sub={gig.pitch}
          actions={<Link href="/marketplace" style={{ color: C.textMuted, fontWeight: 800, textDecoration: 'none', fontSize: '13px' }}>Back to marketplace</Link>}
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(320px, 0.7fr)', gap: '18px' }} className="ys-detail-grid">
          <div style={{ display: 'grid', gap: '16px' }}>
            <Cover gig={gig} height={320} />
            <Card>
              <h2 style={sectionTitle}>About this gig</h2>
              <p style={{ color: C.textMuted, fontSize: '14px', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{gig.description || gig.pitch || 'Details are being finalized by the provider.'}</p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '14px' }}>
                {(gig.tags || []).map(tag => <Badge key={tag} color="gray">{tag}</Badge>)}
              </div>
            </Card>
            {faq.length > 0 && (
              <Card>
                <h2 style={sectionTitle}>FAQ</h2>
                <div style={{ display: 'grid', gap: '12px', marginTop: '12px' }}>
                  {faq.map((item, i) => (
                    <div key={i} style={{ borderTop: i ? `1px solid ${C.border}` : 'none', paddingTop: i ? '12px' : 0 }}>
                      <div style={{ fontWeight: 800, fontSize: '14px' }}>{item.question || item.q}</div>
                      <div style={{ color: C.textMuted, fontSize: '13px', lineHeight: 1.6, marginTop: '4px' }}>{item.answer || item.a}</div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
          <aside style={{ display: 'grid', gap: '14px', alignContent: 'start' }}>
            <Card style={{ padding: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <div style={{ fontWeight: 900 }}>{providerName(gig)}</div>
                  <div style={{ color: C.textMuted, fontSize: '12px' }}>{gig.provider_type} · {gig.review_count || 0} reviews</div>
                </div>
                <Badge color={gig.provider_type === 'attorney' ? 'green' : 'purple'}>{Number(gig.avg_rating || 0).toFixed(1)}</Badge>
              </div>
              <div style={{ display: 'grid', gap: '10px' }}>
                {tiers.map(tier => (
                  <button key={tier.id} type="button" onClick={() => setSelectedTierId(tier.id)} style={{ border: `1px solid ${selectedTierId === tier.id ? C.cyan : C.border2}`, background: selectedTierId === tier.id ? C.cyanGlow : C.surface2, borderRadius: '8px', padding: '12px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                      <div style={{ fontWeight: 900, color: C.text, textTransform: 'capitalize' }}>{tier.tier}</div>
                      <div style={{ fontWeight: 900, color: C.text }}>{money(tier.price)}</div>
                    </div>
                    <div style={{ color: C.textMuted, fontSize: '12px', marginTop: '4px' }}>{tier.delivery_days} day delivery · {tier.revisions >= 999 ? 'Unlimited' : tier.revisions} revisions</div>
                    {tier.description && <div style={{ color: C.textMuted, fontSize: '13px', lineHeight: 1.45, marginTop: '8px' }}>{tier.description}</div>}
                  </button>
                ))}
              </div>
              {selectedTier && (
                <div style={{ marginTop: '16px', display: 'grid', gap: '8px' }}>
                  {(selectedTier.features || []).map(feature => <div key={feature} style={{ color: C.text, fontSize: '13px', fontWeight: 700 }}>✓ {feature}</div>)}
                  <Btn variant="primary" fullWidth onClick={purchase}>Continue to checkout</Btn>
                  {notice && <div style={{ color: notice.includes('created') || notice.includes('prepared') ? C.green : C.red, fontSize: '12px', lineHeight: 1.5 }}>{notice}</div>}
                </div>
              )}
            </Card>
          </aside>
        </div>
        {checkoutOpen && selectedTier && (
          <GigCheckoutDialog
            gig={gig}
            tier={selectedTier}
            onClose={() => setCheckoutOpen(false)}
            onPaid={() => {
              setCheckoutOpen(false)
              setNotice('Payment successful. Your order is ready for the provider to start.')
              requestJson('/api/gig-metrics/event', { method: 'POST', body: JSON.stringify({ gig_id: gig.id, event_type: 'purchase' }) }).catch(() => {})
            }}
          />
        )}
      </main>
      <style jsx global>{`
        @media (max-width: 920px) {
          .ys-detail-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}

function GigCheckoutDialog({ gig, tier, onClose, onPaid }) {
  const [payMethod, setPayMethod] = React.useState('stripe')
  const [walletBalance, setWalletBalance] = React.useState(null)
  const [cards, setCards] = React.useState([])
  const [settings, setSettings] = React.useState(null)
  const [selectedCardId, setSelectedCardId] = React.useState('')
  const [acceptedTerms, setAcceptedTerms] = React.useState(false)
  const [acceptedRefundPolicy, setAcceptedRefundPolicy] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const providerType = String(gig.provider_type || '').toLowerCase() === 'attorney' ? 'attorney' : 'consultant'
  const subtotalCents = Number(tier.price || 0)
  const platformPercent = providerType === 'attorney'
    ? Number(settings?.attorney_platform_fee_percent ?? 25)
    : Number(settings?.platform_fee_percent ?? 20)
  const providerSharePercent = providerType === 'attorney'
    ? 100
    : Number(settings?.consultant_fee_percent ?? Math.max(0, 100 - platformPercent))
  const platformFeeCents = Math.round(subtotalCents * (platformPercent / 100))
  const providerPayoutCents = providerType === 'attorney'
    ? subtotalCents
    : Math.max(0, Math.round(subtotalCents * (providerSharePercent / 100)) || (subtotalCents - platformFeeCents))
  const totalCents = providerType === 'attorney' ? subtotalCents + platformFeeCents : subtotalCents
  const priceDollars = totalCents / 100
  const requiresAck = payMethod === 'wallet' || payMethod === 'saved_card'
  const ackComplete = !requiresAck || (acceptedTerms && acceptedRefundPolicy)
  const canUseWallet = walletBalance !== null && walletBalance >= priceDollars
  const selectedCard = cards.find(card => card.id === selectedCardId)

  React.useEffect(() => {
    fetch('/api/wallet/balance')
      .then(r => r.json())
      .then(d => setWalletBalance(Number(d.available?.usd ?? d.available ?? 0)))
      .catch(() => setWalletBalance(0))
    fetch('/api/wallet/payment-methods')
      .then(r => r.json())
      .then(d => {
        const next = d.cards ?? []
        setCards(next)
        setSelectedCardId(next[0]?.id || '')
      })
      .catch(() => setCards([]))
    requestJson('/api/admin/payment-settings')
      .then(setSettings)
      .catch(() => setSettings(null))
  }, [])

  const pay = async () => {
    if (busy) return
    if (!ackComplete) {
      setError('Please confirm the Terms of Service and Refund Policy before paying.')
      return
    }
    if (payMethod === 'wallet' && !canUseWallet) {
      setError('Your wallet balance is not enough for this order.')
      return
    }
    if (payMethod === 'saved_card' && !selectedCardId) {
      setError('Choose a saved card first.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const payload = await requestJson('/api/checkout/order', {
        method: 'POST',
        body: JSON.stringify({
          sourceType: 'gig',
          sourceId: gig.id,
          tierId: tier.id,
          paymentMethod: payMethod,
          paymentMethodId: selectedCardId,
          acceptedTerms,
          acceptedRefundPolicy,
        }),
      })
      if (payload.url) {
        window.location.href = payload.url
        return
      }
      if (payload.requiresAction) {
        if (!STRIPE_PUB_KEY) throw new Error('Stripe is not configured.')
        const stripe = await loadStripe(STRIPE_PUB_KEY)
        if (!stripe) throw new Error('Unable to load Stripe.')
        const result = await stripe.confirmCardPayment(payload.clientSecret)
        if (result.error) throw new Error(result.error.message)
        await requestJson('/api/checkout/order', {
          method: 'PATCH',
          body: JSON.stringify({ paymentIntentId: payload.paymentIntentId }),
        })
      }
      onPaid?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div onMouseDown={e => { if (e.target === e.currentTarget) onClose() }} style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(15,18,32,0.48)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '18px' }}>
      <div style={{ width: '100%', maxWidth: '540px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', gap: '14px' }}>
          <div>
            <div style={{ color: C.textMuted, fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 800 }}>Gig checkout</div>
            <div style={{ fontFamily: C.serif, fontSize: '24px', fontWeight: 500, marginTop: '4px' }}>{gig.title}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close checkout" style={{ width: '34px', height: '34px', borderRadius: '999px', border: `1px solid ${C.border}`, background: C.surface2, cursor: 'pointer', color: C.text }}>x</button>
        </div>
        <div style={{ padding: '20px', display: 'grid', gap: '14px' }}>
          <Card style={{ padding: '14px' }}>
            <div style={{ fontWeight: 900, textTransform: 'capitalize' }}>{tier.tier}</div>
            <div style={{ color: C.textMuted, fontSize: '13px', marginTop: '4px' }}>{tier.delivery_days} day delivery · {tier.revisions >= 999 ? 'Unlimited' : tier.revisions} revisions</div>
            <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: `1px solid ${C.border}`, display: 'grid', gap: '7px', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                <span style={{ color: C.textMuted }}>{providerType === 'attorney' ? 'Provider fee' : 'Package price'}</span>
                <strong>{money(subtotalCents)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                <span style={{ color: C.textMuted }}>Platform amount ({platformPercent}%)</span>
                <strong>{money(platformFeeCents)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                <span style={{ color: C.textMuted }}>Provider receives{providerType === 'consultant' ? ` (${providerSharePercent}%)` : ''}</span>
                <strong>{money(providerPayoutCents)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${C.border}`, paddingTop: '8px', marginTop: '2px' }}>
                <span style={{ fontWeight: 900 }}>You pay</span>
                <span style={{ fontFamily: C.serif, fontSize: '26px' }}>{money(totalCents)}</span>
              </div>
              <div style={{ color: C.textDim, fontSize: '11px', lineHeight: 1.45 }}>
                {providerType === 'attorney'
                  ? 'Attorney gigs add the platform amount on top of the provider fee.'
                  : 'Consultant gig platform amount is included in the package price.'}
              </div>
            </div>
          </Card>
          <CheckoutButton active={payMethod === 'wallet'} disabled={!canUseWallet} onClick={() => canUseWallet && setPayMethod('wallet')} title="Wallet balance" detail={walletBalance === null ? 'Loading balance...' : `${money((walletBalance || 0) * 100)} available${canUseWallet ? '' : ' - insufficient'}`} />
          <CheckoutButton active={payMethod === 'saved_card'} disabled={!cards.length} onClick={() => cards.length && setPayMethod('saved_card')} title="Saved card" detail={selectedCard ? `${selectedCard.brand?.toUpperCase?.() || 'CARD'} ending ${selectedCard.last4}` : 'No saved cards yet'} />
          {payMethod === 'saved_card' && cards.length > 0 && (
            <select value={selectedCardId} onChange={e => setSelectedCardId(e.target.value)} style={{ width: '100%', border: `1px solid ${C.border2}`, borderRadius: '10px', padding: '11px 12px', background: C.surface2, color: C.text }}>
              {cards.map(card => <option key={card.id} value={card.id}>{card.brand?.toUpperCase?.() || 'CARD'} ending {card.last4}</option>)}
            </select>
          )}
          <CheckoutButton active={payMethod === 'stripe'} onClick={() => setPayMethod('stripe')} title="Stripe hosted checkout" detail="Open Stripe's secure payment page" />
          {requiresAck && (
            <Card style={{ padding: '14px' }}>
              <label style={{ display: 'flex', gap: '10px', fontSize: '13px', marginBottom: '8px' }}>
                <input type="checkbox" checked={acceptedTerms} onChange={e => setAcceptedTerms(e.target.checked)} />
                <span>I agree to the <a href={TERMS_URL} target="_blank" rel="noreferrer" style={{ color: C.cyan, fontWeight: 800 }}>Terms of Service</a>.</span>
              </label>
              <label style={{ display: 'flex', gap: '10px', fontSize: '13px' }}>
                <input type="checkbox" checked={acceptedRefundPolicy} onChange={e => setAcceptedRefundPolicy(e.target.checked)} />
                <span>I accept the <a href={REFUND_POLICY_URL} target="_blank" rel="noreferrer" style={{ color: C.cyan, fontWeight: 800 }}>Refund Policy</a>.</span>
              </label>
            </Card>
          )}
          {error && <div style={{ color: C.red, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.22)', borderRadius: '10px', padding: '10px 12px', fontSize: '13px' }}>{error}</div>}
          <Btn variant="primary" fullWidth size="lg" onClick={pay} disabled={busy || (requiresAck && !ackComplete)}>
            {busy ? 'Processing...' : payMethod === 'stripe' ? 'Continue to Stripe checkout' : `Pay ${money(totalCents)}`}
          </Btn>
        </div>
      </div>
    </div>
  )
}

function CheckoutButton({ active, disabled, onClick, title, detail }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} style={{ width: '100%', border: `2px solid ${active ? C.cyan : C.border}`, background: active ? C.cyanGlow : C.surface2, opacity: disabled ? 0.55 : 1, cursor: disabled ? 'not-allowed' : 'pointer', borderRadius: '12px', padding: '13px 14px', color: C.text, display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', fontFamily: 'inherit', textAlign: 'left' }}>
      <span><span style={{ display: 'block', fontWeight: 900, fontSize: '14px' }}>{title}</span><span style={{ display: 'block', color: C.textMuted, fontSize: '12px', marginTop: '3px' }}>{detail}</span></span>
      <span style={{ color: active ? C.cyan : C.textDim, fontWeight: 900 }}>{active ? '✓' : '○'}</span>
    </button>
  )
}

export function ProviderGigsPage({ startNew = false, selectedGigId = '' } = {}) {
  const [gigs, setGigs] = React.useState([])
  const [selectedId, setSelectedId] = React.useState('')
  const [categories, setCategories] = React.useState(CATEGORY_FALLBACK)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const [error, setError] = React.useState('')

  const load = React.useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [data, cats] = await Promise.all([
        requestJson('/api/dashboard/gigs'),
        requestJson('/api/gig-categories').catch(() => ({ categories: CATEGORY_FALLBACK })),
      ])
      setGigs(data.gigs || [])
      setCategories(cats.categories || CATEGORY_FALLBACK)
      setSelectedId(current => {
        if (selectedGigId && (data.gigs || []).some(g => g.id === selectedGigId)) return selectedGigId
        return current && (data.gigs || []).some(g => g.id === current) ? current : data.gigs?.[0]?.id || ''
      })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [selectedGigId])

  React.useEffect(() => { load() }, [load])

  const selected = gigs.find(g => g.id === selectedId)
  const tiers = (selected?.tiers || []).slice().sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier))

  const updateLocalGig = (patch) => {
    setGigs(prev => prev.map(g => g.id === selectedId ? { ...g, ...patch } : g))
  }

  const saveGig = async () => {
    if (!selected) return
    setSaving(true)
    setNotice('')
    try {
      const data = await requestJson(`/api/gigs/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: selected.title,
          category: selected.category,
          pitch: selected.pitch,
          description: selected.description,
          tags: selected.tags || [],
          seo_title: selected.seo_title,
          seo_description: selected.seo_description,
          video_url: selected.video_url,
        }),
      })
      setGigs(prev => prev.map(g => g.id === selected.id ? data.gig : g))
      setNotice('Gig saved.')
    } catch (e) {
      setNotice(e.message)
    } finally {
      setSaving(false)
    }
  }

  const createGig = async () => {
    setSaving(true)
    setNotice('')
    try {
      const data = await requestJson('/api/gigs', {
        method: 'POST',
        body: JSON.stringify({ title: 'New YouSafe gig', category: categories[0], pitch: 'Fixed-scope support for students and families.' }),
      })
      await load()
      setSelectedId(data.gig.id)
      setNotice('Draft gig created.')
    } catch (e) {
      setNotice(e.message)
    } finally {
      setSaving(false)
    }
  }

  const transitionGig = async (action) => {
    if (!selected) return
    setSaving(true)
    setNotice('')
    try {
      const url = action === 'archive' ? `/api/gigs/${selected.id}` : `/api/gigs/${selected.id}/${action}`
      const data = await requestJson(url, { method: action === 'archive' ? 'DELETE' : 'PATCH' })
      if (action === 'archive') {
        setGigs(prev => prev.filter(g => g.id !== selected.id))
        setSelectedId('')
      } else {
        setGigs(prev => prev.map(g => g.id === selected.id ? { ...g, ...data.gig } : g))
      }
      setNotice(action === 'publish' ? 'Gig published.' : action === 'pause' ? 'Gig paused.' : 'Gig archived.')
    } catch (e) {
      const fieldCopy = e.fields ? Object.values(e.fields).join(' ') : ''
      setNotice([e.message, fieldCopy].filter(Boolean).join(' '))
    } finally {
      setSaving(false)
    }
  }

  const saveTier = async (tier, patch = {}) => {
    if (!selected) return
    setSaving(true)
    setNotice('')
    try {
      const body = {
        title: tier.title,
        description: tier.description,
        price: dollars(tier.price),
        delivery_days: tier.delivery_days,
        revisions: tier.revisions,
        features: tier.features || [],
        is_active: tier.is_active,
        ...patch,
      }
      await requestJson(`/api/gigs/${selected.id}/tiers/${tier.id}`, { method: 'PATCH', body: JSON.stringify(body) })
      await load()
      setNotice('Tier saved.')
    } catch (e) {
      setNotice(e.message)
    } finally {
      setSaving(false)
    }
  }

  const addTier = async () => {
    if (!selected) return
    const used = new Set(tiers.map(t => t.tier))
    const next = TIERS.find(t => !used.has(t))
    if (!next) return setNotice('This gig already has three tiers.')
    setSaving(true)
    try {
      await requestJson(`/api/gigs/${selected.id}/tiers`, { method: 'POST', body: JSON.stringify({ tier: next, title: next[0].toUpperCase() + next.slice(1), price: '25.00', delivery_days: 7, revisions: 1, features: [] }) })
      await load()
      setNotice('Tier added.')
    } catch (e) {
      setNotice(e.message)
    } finally {
      setSaving(false)
    }
  }

  const deleteTier = async (tier) => {
    if (!selected) return
    setSaving(true)
    try {
      await requestJson(`/api/gigs/${selected.id}/tiers/${tier.id}`, { method: 'DELETE' })
      await load()
      setNotice('Tier removed.')
    } catch (e) {
      setNotice(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingState label="Loading your gigs..." />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (startNew) return <GigBuilderStepOne categories={categories} onCreated={(id) => { if (typeof window !== 'undefined') window.location.href = `/dashboard/gigs/${id}/edit` }} />

  return (
    <div style={pageShell}>
      <main style={inner}>
        <Header
          eyebrow="Provider workspace"
          title="Gig manager."
          sub={`${gigs.filter(g => ['draft', 'active', 'paused'].includes(g.status)).length} of 5 active slots used. Build fixed-scope services with tiers, publishing checks, and marketplace visibility.`}
          actions={<><Link href="/dashboard" style={{ color: C.textMuted, fontWeight: 800, textDecoration: 'none', fontSize: '13px' }}>Dashboard</Link><Btn variant="primary" size="sm" onClick={() => { if (typeof window !== 'undefined') window.location.href = '/dashboard/gigs/new' }} disabled={saving || gigs.length >= 5}>+ Create new gig</Btn></>}
        />
        {notice && <div style={{ marginBottom: '14px', color: notice.includes('saved') || notice.includes('published') || notice.includes('created') || notice.includes('added') || notice.includes('removed') ? C.green : C.red, fontSize: '13px', fontWeight: 700 }}>{notice}</div>}
        {gigs.length === 0 ? (
          <EmptyState title="You haven't created any gigs yet." body="Create a draft, add a clear scope and tier pricing, then publish it to the marketplace." action={<Btn variant="primary" onClick={() => { if (typeof window !== 'undefined') window.location.href = '/dashboard/gigs/new' }}>+ Create new gig</Btn>} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '290px minmax(0, 1fr)', gap: '16px' }} className="ys-gigs-grid">
            <aside style={{ display: 'grid', gap: '10px', alignContent: 'start' }}>
              {gigs.map(gig => (
                <button key={gig.id} type="button" onClick={() => setSelectedId(gig.id)} style={{ textAlign: 'left', border: `1px solid ${selectedId === gig.id ? C.cyan : C.border}`, background: selectedId === gig.id ? C.cyanGlow : C.surface, borderRadius: '8px', padding: '12px', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                    <Badge color={statusColor(gig.status)}>{gig.status}</Badge>
                    <span style={{ color: C.textMuted, fontSize: '11px' }}>{gig.tiers?.length || 0} tiers</span>
                  </div>
                  <div style={{ fontWeight: 900, color: C.text, fontSize: '14px', lineHeight: 1.35 }}>{gig.title}</div>
                  <div style={{ color: C.textMuted, fontSize: '12px', marginTop: '5px' }}>{gig.category || 'Uncategorized'}</div>
                </button>
              ))}
            </aside>
            {selected && (
              <div style={{ display: 'grid', gap: '16px' }}>
                <Card style={{ padding: '18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
                    <div>
                      <h2 style={sectionTitle}>Gig details</h2>
                      <div style={{ color: C.textMuted, fontSize: '12px', marginTop: '4px' }}>Last updated {compactDate(selected.updated_at)}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <Btn size="sm" variant="secondary" onClick={saveGig} disabled={saving}>Save</Btn>
                      {selected.status !== 'active' && <Btn size="sm" variant="success" onClick={() => transitionGig('publish')} disabled={saving}>Publish</Btn>}
                      {selected.status === 'active' && <Btn size="sm" variant="secondary" onClick={() => transitionGig('pause')} disabled={saving}>Pause</Btn>}
                      <Btn size="sm" variant="danger" onClick={() => transitionGig('archive')} disabled={saving}>Archive</Btn>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: '12px' }} className="ys-two-col">
                    <Input label="Title" value={selected.title || ''} onChange={title => updateLocalGig({ title })} />
                    <Select label="Category" value={selected.category || ''} onChange={category => updateLocalGig({ category })} options={[{ value: '', label: 'Choose category' }, ...categories.map(c => ({ value: c, label: c }))]} />
                  </div>
                  <div style={{ display: 'grid', gap: '12px', marginTop: '12px' }}>
                    <Input label="One-line pitch" value={selected.pitch || ''} onChange={pitch => updateLocalGig({ pitch })} />
                    <label style={labelStyle}>Description<textarea style={textareaStyle} value={selected.description || ''} onChange={e => updateLocalGig({ description: e.target.value })} /></label>
                    <Input label="Tags" value={(selected.tags || []).join(', ')} onChange={v => updateLocalGig({ tags: v.split(',').map(s => s.trim()).filter(Boolean).slice(0, 5) })} hint="Comma-separated, up to five." />
                  </div>
                </Card>
                <Card style={{ padding: '18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '14px' }}>
                    <h2 style={sectionTitle}>Pricing tiers</h2>
                    <Btn variant="secondary" size="sm" onClick={addTier} disabled={saving || tiers.length >= 3}>Add tier</Btn>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '12px' }}>
                    {tiers.map(tier => <TierEditor key={tier.id} tier={tier} onSave={saveTier} onDelete={deleteTier} disabled={saving} />)}
                  </div>
                </Card>
              </div>
            )}
          </div>
        )}
      </main>
      <style jsx global>{`
        @media (max-width: 900px) {
          .ys-gigs-grid, .ys-two-col { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}

function GigBuilderStepOne({ categories, onCreated }) {
  const [draft, setDraft] = React.useState({
    title: '',
    category: categories?.[0] || '',
    tagsText: '',
    pitch: '',
    seo_title: '',
    seo_description: '',
  })
  const [gigId, setGigId] = React.useState('')
  const [status, setStatus] = React.useState('Not saved')
  const [saving, setSaving] = React.useState(false)

  const payload = React.useCallback(() => ({
    title: draft.title || 'New YouSafe gig',
    category: draft.category || categories?.[0] || null,
    tags: draft.tagsText.split(',').map(s => s.trim()).filter(Boolean).slice(0, 5),
    pitch: draft.pitch,
    seo_title: draft.seo_title || draft.title,
    seo_description: draft.seo_description || draft.pitch,
  }), [categories, draft])

  const autosave = async () => {
    setSaving(true)
    setStatus('Autosaving...')
    try {
      if (!gigId) {
        const data = await requestJson('/api/gigs', { method: 'POST', body: JSON.stringify(payload()) })
        setGigId(data.gig.id)
        setStatus('Autosaved')
        return data.gig.id
      } else {
        await requestJson(`/api/gigs/${gigId}`, { method: 'PATCH', body: JSON.stringify(payload()) })
        setStatus('Autosaved')
        return gigId
      }
    } catch (e) {
      setStatus(e.message)
      return ''
    } finally {
      setSaving(false)
    }
  }

  const update = (key, value) => setDraft(prev => ({ ...prev, [key]: value }))

  return (
    <div style={pageShell}>
      <main style={inner}>
        <Header
          eyebrow="Gig builder"
          title="Step 1: Service basics."
          sub="Start with the public marketplace copy. Pricing, gallery, and publish checks happen after this foundation is saved."
          actions={<Link href="/dashboard/gigs" style={{ color: C.textMuted, fontWeight: 800, textDecoration: 'none', fontSize: '13px' }}>Back to gigs</Link>}
        />
        <Card style={{ padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={sectionTitle}>Title, category, tags, pitch, and SEO</h2>
            <Badge color={status === 'Autosaved' ? 'green' : status === 'Autosaving...' ? 'orange' : status === 'Not saved' ? 'gray' : 'red'}>{status}</Badge>
          </div>
          <div style={{ display: 'grid', gap: '12px' }}>
            <Input label="Gig title" value={draft.title} onChange={v => update('title', v)} onBlur={autosave} placeholder="Review my study permit documents" />
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(220px, 0.7fr)', gap: '12px' }} className="ys-two-col">
              <Select label="Category" value={draft.category} onChange={v => update('category', v)} options={(categories || CATEGORY_FALLBACK).map(c => ({ value: c, label: c }))} />
              <Input label="Tags" value={draft.tagsText} onChange={v => update('tagsText', v)} onBlur={autosave} placeholder="visa, documents, review" />
            </div>
            <label style={labelStyle}>Pitch<textarea style={{ ...textareaStyle, minHeight: '74px' }} value={draft.pitch} onChange={e => update('pitch', e.target.value)} onBlur={autosave} placeholder="One clear sentence students will see in the marketplace." /></label>
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: '12px', display: 'grid', gap: '12px' }}>
              <Input label="SEO title" value={draft.seo_title} onChange={v => update('seo_title', v)} onBlur={autosave} placeholder={draft.title || 'SEO title'} />
              <label style={labelStyle}>SEO description<textarea style={{ ...textareaStyle, minHeight: '74px' }} value={draft.seo_description} onChange={e => update('seo_description', e.target.value)} onBlur={autosave} placeholder="Short search/social description." /></label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
              <Btn variant="secondary" onClick={autosave} disabled={saving}>{saving ? 'Saving...' : 'Save draft'}</Btn>
              <Btn variant="primary" onClick={async () => { const id = gigId || await autosave(); if (id) onCreated?.(id) }} disabled={saving}>Continue</Btn>
            </div>
          </div>
        </Card>
      </main>
    </div>
  )
}

function TierEditor({ tier, onSave, onDelete, disabled }) {
  const [draft, setDraft] = React.useState(() => ({ ...tier, priceDollars: dollars(tier.price), featuresText: (tier.features || []).join('\n') }))
  React.useEffect(() => setDraft({ ...tier, priceDollars: dollars(tier.price), featuresText: (tier.features || []).join('\n') }), [tier.id, tier.updated_at, tier.price])
  const save = () => onSave(tier, {
    title: draft.title,
    description: draft.description,
    price: draft.priceDollars.includes('.') ? draft.priceDollars : `${draft.priceDollars}.00`,
    delivery_days: Number(draft.delivery_days || 1),
    revisions: Number(draft.revisions || 0),
    features: draft.featuresText.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 8),
    is_active: draft.is_active,
  })
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: '8px', padding: '12px', display: 'grid', gap: '10px', background: C.surface2 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' }}>
        <Badge color="gray">{tier.tier}</Badge>
        <label style={{ display: 'flex', gap: '6px', alignItems: 'center', color: C.textMuted, fontSize: '12px', fontWeight: 800 }}>
          <input type="checkbox" checked={Boolean(draft.is_active)} onChange={e => setDraft(d => ({ ...d, is_active: e.target.checked }))} />
          Active
        </label>
      </div>
      <input style={inputStyle} value={draft.title || ''} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} placeholder="Tier title" />
      <textarea style={{ ...textareaStyle, minHeight: '72px' }} value={draft.description || ''} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} placeholder="Short tier description" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
        <label style={labelStyle}>Price<input style={inputStyle} value={draft.priceDollars} onChange={e => setDraft(d => ({ ...d, priceDollars: e.target.value.replace(/[^\d.]/g, '') }))} /></label>
        <label style={labelStyle}>Days<input style={inputStyle} type="number" min="1" value={draft.delivery_days || 1} onChange={e => setDraft(d => ({ ...d, delivery_days: e.target.value }))} /></label>
        <label style={labelStyle}>Revs<input style={inputStyle} type="number" min="0" value={draft.revisions || 0} onChange={e => setDraft(d => ({ ...d, revisions: e.target.value }))} /></label>
      </div>
      <textarea style={{ ...textareaStyle, minHeight: '82px' }} value={draft.featuresText || ''} onChange={e => setDraft(d => ({ ...d, featuresText: e.target.value }))} placeholder="One feature per line" />
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between' }}>
        <Btn size="sm" variant="secondary" onClick={save} disabled={disabled}>Save tier</Btn>
        <Btn size="sm" variant="danger" onClick={() => onDelete(tier)} disabled={disabled}>Delete</Btn>
      </div>
    </div>
  )
}

export function OrderKanbanPage({ adminOnly = false }) {
  const [profile, setProfile] = React.useState(null)
  const [orders, setOrders] = React.useState([])
  const [selected, setSelected] = React.useState(null)
  const [filter, setFilter] = React.useState('all')
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [notice, setNotice] = React.useState('')

  const load = React.useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const profileData = await requestJson('/api/profile')
      const role = profileData.profile?.role || 'client'
      if (adminOnly && role !== 'admin') throw new Error('Admin access is required.')
      setProfile(profileData.profile)
      const endpoint = role === 'admin' ? '/api/admin/data' : role === 'attorney' ? '/api/attorney/data' : role === 'consultant' ? '/api/consultant/data' : '/api/student/data'
      const data = await requestJson(endpoint)
      setOrders(shapeOrders(data, role))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [adminOnly])

  React.useEffect(() => { load() }, [load])

  const adminUpdate = async (orderId, body) => {
    setNotice('')
    try {
      await requestJson(`/api/admin/orders/${orderId}`, { method: 'PATCH', body: JSON.stringify(body) })
      await load()
      setNotice('Order updated.')
    } catch (e) {
      setNotice(e.message)
    }
  }

  if (loading) return <LoadingState label="Loading orders..." />
  if (error) return <ErrorState message={error} onRetry={load} />

  const role = profile?.role || 'client'
  const visibleOrders = filter === 'all' ? orders : orders.filter(o => o.providerType === filter || o.status === filter)
  const totalValue = visibleOrders.reduce((sum, o) => sum + Number(o.amountCents || 0), 0)
  const columns = ORDER_COLUMNS.map(col => ({ ...col, orders: visibleOrders.filter(o => col.statuses.includes(String(o.status || '').toLowerCase())) }))

  return (
    <div style={pageShell}>
      <main style={inner}>
        <Header
          eyebrow={role === 'admin' ? 'Admin oversight' : 'Order board'}
          title={role === 'admin' ? 'Order command center.' : 'Order Kanban.'}
          sub={`${visibleOrders.length} orders · ${money(totalValue)} tracked value`}
          actions={<><Link href="/dashboard" style={{ color: C.textMuted, fontWeight: 800, textDecoration: 'none', fontSize: '13px' }}>Dashboard</Link><Btn variant="secondary" size="sm" onClick={load}>Refresh</Btn></>}
        />
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
          {['all', 'attorney', 'consultant', 'pending', 'completed', 'cancelled'].map(item => (
            <button key={item} type="button" onClick={() => setFilter(item)} style={{ border: `1px solid ${filter === item ? C.cyan : C.border2}`, background: filter === item ? C.cyanGlow : C.surface, color: C.text, borderRadius: '999px', padding: '7px 12px', fontSize: '12px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>{item}</button>
          ))}
        </div>
        {notice && <div style={{ color: notice.includes('updated') ? C.green : C.red, fontSize: '13px', fontWeight: 800, marginBottom: '12px' }}>{notice}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(220px, 1fr))', gap: '12px', overflowX: 'auto', paddingBottom: '8px' }}>
          {columns.map(col => (
            <section key={col.id} style={{ minWidth: '220px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ fontWeight: 900, fontSize: '13px' }}>{col.label}</div>
                <Badge color={col.color}>{col.orders.length}</Badge>
              </div>
              <div style={{ display: 'grid', gap: '10px' }}>
                {col.orders.map(order => (
                  <button key={order.id} type="button" onClick={() => setSelected(order)} style={{ textAlign: 'left', border: `1px solid ${C.border}`, background: C.surface, borderRadius: '8px', padding: '12px', cursor: 'pointer', fontFamily: 'inherit', color: C.text }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                      <Badge color={statusColor(order.status)}>{order.status}</Badge>
                      <span style={{ color: C.textMuted, fontSize: '11px' }}>{order.providerType || role}</span>
                    </div>
                    <div style={{ fontWeight: 900, fontSize: '14px', lineHeight: 1.35 }}>{order.title}</div>
                    <div style={{ color: C.textMuted, fontSize: '12px', marginTop: '6px' }}>{order.clientName} {order.providerName ? `→ ${order.providerName}` : ''}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: C.textMuted, fontSize: '11px', marginTop: '10px' }}>
                      <span>{compactDate(order.createdAt)}</span>
                      <span>{money(order.amountCents)}</span>
                    </div>
                    <ProgressBar value={Math.min(100, Math.max(0, Number(order.progress || 0)))} style={{ marginTop: '10px' }} />
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
      {selected && <OrderDrawer order={selected} role={role} onClose={() => setSelected(null)} onAdminUpdate={adminUpdate} />}
    </div>
  )
}

function shapeOrders(data, role) {
  if (role === 'admin') {
    const profiles = new Map((data.users || []).map(p => [p.id, p]))
    const items = new Map((data.orderItems || []).map(i => [i.order_id, i]))
    const services = new Map((data.services || []).map(s => [s.id, s]))
    return (data.orders || []).map(o => {
      const item = items.get(o.id)
      const service = services.get(item?.service_id)
      const client = profiles.get(o.client_id)
      const provider = profiles.get(o.consultant_id || o.attorney_profile_id)
      const amount = Number(o.amount_paid ?? o.total_amount ?? item?.subtotal ?? 0)
      const cents = Number(o.amount_paid || o.net_payout) ? amount : Math.round(amount * 100)
      return {
        id: o.id,
        title: service?.title || o.service_title || o.title || 'Marketplace order',
        status: o.status === 'queued' ? 'pending' : o.status || 'pending',
        escrowStatus: o.escrow_status || 'held',
        clientName: client?.full_name || client?.email || 'Student',
        providerName: provider?.full_name || provider?.email || 'Provider',
        providerType: o.attorney_id ? 'attorney' : 'consultant',
        amountCents: cents,
        progress: o.progress ?? (o.status === 'completed' ? 100 : o.status === 'under_review' ? 90 : 35),
        createdAt: o.created_at,
        deadline: o.delivery_deadline || o.deadline,
        raw: o,
      }
    })
  }
  return (data.orders || []).map(o => ({
    id: o.id,
    title: o.title || o.service || o.deliverable || 'Marketplace order',
    status: o.status === 'queued' ? 'pending' : o.status || 'pending',
    escrowStatus: o.escrow_status || o.escrowStatus || 'held',
    clientName: o.client_name || o.student || 'Student',
    providerName: o.consultant || null,
    providerType: role,
    amountCents: Number(o.totalCents ?? o.attorney_fee ?? o.consultantPayoutAmount ?? 0),
    progress: o.progress ?? (o.status === 'completed' ? 100 : 35),
    createdAt: o.created_at || o.createdAt,
    deadline: o.deadline,
    raw: o,
  }))
}

function OrderDrawer({ order, role, onClose, onAdminUpdate }) {
  const [status, setStatus] = React.useState(order.status || 'pending')
  const [reason, setReason] = React.useState('')
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.38)', zIndex: 400, display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
      <aside onClick={e => e.stopPropagation()} style={{ width: 'min(430px, 100vw)', height: '100%', background: C.surface, borderLeft: `1px solid ${C.border}`, padding: '22px', overflowY: 'auto', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'start', marginBottom: '18px' }}>
          <div>
            <Badge color={statusColor(order.status)}>{order.status}</Badge>
            <h2 style={{ ...titleStyle, fontSize: '28px', marginTop: '10px' }}>{order.title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ border: `1px solid ${C.border2}`, background: C.surface2, borderRadius: '999px', width: '34px', height: '34px', cursor: 'pointer', color: C.text }}>×</button>
        </div>
        <div style={{ display: 'grid', gap: '12px' }}>
          {[
            ['Order ID', order.id],
            ['Student', order.clientName],
            ['Provider', order.providerName || role],
            ['Amount', money(order.amountCents)],
            ['Created', compactDate(order.createdAt)],
            ['Deadline', compactDate(order.deadline)],
            ['Escrow', order.escrowStatus],
          ].map(([label, value]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', borderBottom: `1px solid ${C.border}`, paddingBottom: '10px' }}>
              <span style={{ color: C.textMuted, fontSize: '12px', fontWeight: 800 }}>{label}</span>
              <span style={{ color: C.text, fontSize: '13px', fontWeight: 800, textAlign: 'right', wordBreak: 'break-word' }}>{value || '—'}</span>
            </div>
          ))}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: C.textMuted, marginBottom: '6px' }}>
              <span>Progress</span><span>{order.progress || 0}%</span>
            </div>
            <ProgressBar value={Math.min(100, Math.max(0, Number(order.progress || 0)))} />
          </div>
          {role === 'admin' && (
            <Card style={{ padding: '14px', background: C.surface2 }}>
              <h3 style={sectionTitle}>Admin actions</h3>
              <div style={{ display: 'grid', gap: '10px', marginTop: '12px' }}>
                <Select label="Status" value={status} onChange={setStatus} options={STATUS_OPTIONS.map(s => ({ value: s, label: s.replace(/_/g, ' ') }))} />
                <label style={labelStyle}>Reason<textarea style={{ ...textareaStyle, minHeight: '74px', background: C.surface }} value={reason} onChange={e => setReason(e.target.value)} /></label>
                <Btn variant="primary" fullWidth onClick={() => onAdminUpdate(order.id, { status, reason, action_type: 'admin_status_change' })}>Save status</Btn>
                <Btn variant="secondary" fullWidth onClick={() => onAdminUpdate(order.id, { escrow_status: 'released', status: 'released', force: true, reason, action_type: 'force_release' })}>Force release</Btn>
                <Btn variant="danger" fullWidth onClick={() => onAdminUpdate(order.id, { refund: true, reason, action_type: 'issue_refund' })}>Refund order</Btn>
              </div>
            </Card>
          )}
        </div>
      </aside>
    </div>
  )
}
