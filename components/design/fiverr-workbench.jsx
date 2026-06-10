'use client'
// @ts-nocheck
import React from 'react'
import Link from 'next/link'
import { C, Btn, Badge, Card, Input, Select, ProgressBar } from './shared'
import { computeSEOScore } from '@/lib/seoUtils'
import CardFields from '@/components/payments/CardFields'

export { C, Btn, Badge, Card, Input, Select, ProgressBar }

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
const NMI_PUB_KEY = process.env.NEXT_PUBLIC_NMI_TOKENIZATION_KEY
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

// "My Office" premium header — gradient panel + stat strip.
const premiumHeaderShell = {
  background: `linear-gradient(135deg, ${C.surface} 0%, ${C.surface2} 100%)`,
  border: `1px solid ${C.border}`,
  borderRadius: '16px',
  padding: '24px 24px 0',
  marginBottom: '18px',
  boxShadow: '0 10px 30px -22px rgba(60,59,110,0.35)',
  overflow: 'hidden',
}
const premiumHeaderInner = {
  display: 'flex', justifyContent: 'space-between', gap: '18px', alignItems: 'flex-start',
  flexWrap: 'wrap', paddingBottom: '20px',
}
const premiumEyebrow = {
  color: C.cyan, fontSize: '11px', fontWeight: 800,
  letterSpacing: '0.16em', textTransform: 'uppercase',
}
const premiumTitle = {
  margin: '8px 0 4px', fontFamily: C.serif, fontSize: 'clamp(24px, 3.2vw, 32px)',
  fontWeight: 600, letterSpacing: '-0.012em', color: C.text, lineHeight: 1.1,
}
const premiumSub = {
  margin: 0, color: C.textMuted, fontSize: '14px', lineHeight: 1.55, maxWidth: '52ch',
}
const premiumStatStrip = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
  gap: '0',
  borderTop: `1px solid ${C.border}`,
  background: C.surface,
  margin: '0 -24px',
  padding: '0 24px',
}
const premiumStatCell = {
  padding: '14px 12px',
  borderRight: `1px solid ${C.border}`,
}

// Tab pills — All / Active / Drafts / Bin.
const tabBarStyle = {
  display: 'flex', flexWrap: 'wrap', gap: '8px',
  marginBottom: '16px',
}
const tabPillStyle = {
  display: 'inline-flex', alignItems: 'center', gap: '8px',
  padding: '8px 16px', borderRadius: '999px',
  border: `1px solid ${C.border}`, background: C.surface,
  color: C.textMuted, cursor: 'pointer', fontFamily: 'inherit',
  fontSize: '13px', fontWeight: 700,
  transition: 'all 120ms',
}
const tabPillActiveStyle = {
  background: C.text, color: C.surface,
  borderColor: C.text,
}
const tabCountStyle = {
  fontSize: '11px', fontWeight: 700, opacity: 0.7,
}
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

// Premium gig-manager header with at-a-glance lifecycle counters.
// Replaces the plain subtitle string with a 4-stat strip (Active /
// Drafts / Bin / Slots used) so providers can read the state of their
// inventory at a glance. Gradient + serif title bring it in line with
// the rest of the YouSafe "fiverr workbench" surface.
function PremiumWorkbenchHeader({ gigs, counts, saving, onCreateNew }) {
  const slotsUsed = gigs.filter(g => ['draft', 'active', 'paused'].includes(g.status)).length
  return (
    <div style={premiumHeaderShell}>
      <div style={premiumHeaderInner}>
        <div>
          <div style={premiumEyebrow}>My Office · Gig Manager</div>
          <h1 style={premiumTitle}>Run your offerings.</h1>
          <p style={premiumSub}>
            Fixed-scope services with tiered pricing, publishing checks, and live marketplace visibility.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <Link href="/dashboard" style={{ color: C.textMuted, fontWeight: 800, textDecoration: 'none', fontSize: '13px' }}>Back to office</Link>
          <Btn variant="primary" size="sm" onClick={onCreateNew} disabled={saving || slotsUsed >= 5}>
            + Create new gig
          </Btn>
        </div>
      </div>
      <div style={premiumStatStrip}>
        <PremiumStat label="Active" value={counts.active} accent={C.green} />
        <PremiumStat label="Drafts" value={counts.drafts} accent={C.cyan} />
        <PremiumStat label="In bin" value={counts.bin} accent={C.textMuted} />
        <PremiumStat label="Slots used" value={`${slotsUsed} / 5`} accent={slotsUsed >= 5 ? C.red : C.text} />
      </div>
    </div>
  )
}

function PremiumStat({ label, value, accent }) {
  return (
    <div style={premiumStatCell}>
      <div style={{ fontSize: '11px', fontWeight: 800, color: C.textMuted, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: '20px', fontWeight: 800, color: accent || C.text, marginTop: '2px', fontFamily: C.serif }}>{value}</div>
    </div>
  )
}

export function EmptyState({ title, body, action = null }) {
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
  const [payMethod, setPayMethod] = React.useState('wallet')
  const [walletBalance, setWalletBalance] = React.useState(null)
  const [cards, setCards] = React.useState([])
  const [settings, setSettings] = React.useState(null)
  const [selectedCardId, setSelectedCardId] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const [newCardToken, setNewCardToken] = React.useState(null)
  const [cardError, setCardError] = React.useState(null)
  const cardFieldsRef = React.useRef(null)
  const lastTokenRef = React.useRef(null)
  const [hasSetDefaultPayMethod, setHasSetDefaultPayMethod] = React.useState(false)

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

  React.useEffect(() => {
    if (walletBalance === null || hasSetDefaultPayMethod) return
    const priceDollars = totalCents / 100
    const canUseWallet = walletBalance >= priceDollars
    let selected = 'wallet'
    if (canUseWallet) {
      selected = 'wallet'
    } else if (cards.length > 0) {
      selected = 'saved_card'
    } else {
      selected = 'new_card'
    }
    setPayMethod(selected)
    setHasSetDefaultPayMethod(true)
  }, [walletBalance, cards, totalCents, hasSetDefaultPayMethod])

  // One idempotency key per checkout attempt — retries replay the stored
  // server outcome instead of double-charging.
  const idemKeyRef = React.useRef(null)

  const pay = async () => {
    if (busy) return
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
    setCardError(null)
    idemKeyRef.current ||= crypto.randomUUID()
    try {
      // For new-card flow, tokenize at click-time so the user sees one button.
      let result = newCardToken ? lastTokenRef.current : null
      if (payMethod === 'new_card' && !result) {
        if (!cardFieldsRef.current) throw new Error('Card fields not ready')
        await cardFieldsRef.current.tokenize()
        result = lastTokenRef.current
        if (!result) throw new Error('Tokenization did not return a token')
      }
      const body = {
        sourceType: 'gig',
        sourceId: gig.id,
        tierId: tier.id,
        paymentMethod: payMethod,
        ...(payMethod === 'saved_card' && { paymentMethodId: selectedCardId }),
        ...(payMethod === 'new_card'   && { token: result.token, gateway: result.gateway }),
        idempotencyKey: idemKeyRef.current,
      }
      const payload = await requestJson('/api/checkout/order', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      idemKeyRef.current = null
      if (payload.url) {
        window.location.href = payload.url
        return
      }
      onPaid?.()
    } catch (e) {
      setError(typeof e.message === 'string' ? e.message : 'Payment failed.')
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

          {/* Wallet */}
          <CheckoutButton
            active={payMethod === 'wallet'}
            disabled={!canUseWallet}
            onClick={() => canUseWallet && setPayMethod('wallet')}
            title="Wallet balance"
            detail={walletBalance === null
              ? 'Loading balance...'
              : `${money((walletBalance || 0) * 100)} available${canUseWallet ? '' : ' · insufficient'}`}
          />

          {/* Saved card */}
          <CheckoutButton
            active={payMethod === 'saved_card'}
            disabled={!cards.length}
            onClick={() => { if (cards.length) setPayMethod('saved_card') }}
            title="Saved card"
            detail={cards.length === 0
              ? 'No saved cards — add one from billing'
              : selectedCard
                ? `${(selectedCard.brand || 'CARD').toUpperCase()} ••••${selectedCard.last4} · exp ${String(selectedCard.exp_month).padStart(2,'0')}/${String(selectedCard.exp_year).slice(-2)}`
                : 'Select a card below'}
          />
          {payMethod === 'saved_card' && cards.length > 0 && (
            <select
              value={selectedCardId}
              onChange={e => setSelectedCardId(e.target.value)}
              aria-label="Choose a saved card"
              style={{ width: '100%', border: `1px solid ${C.border2}`, borderRadius: '10px', padding: '11px 12px', background: C.surface2, color: C.text }}
            >
              {cards.map(card => (
                <option key={card.id} value={card.id}>
                  {(card.brand || 'CARD').toUpperCase()} ••••{card.last4} · exp {String(card.exp_month).padStart(2,'0')}/{String(card.exp_year).slice(-2)}{card.is_default ? ' · default' : ''}
                </option>
              ))}
            </select>
          )}

          {/* New card */}
          <CheckoutButton
            active={payMethod === 'new_card'}
            onClick={() => { setPayMethod('new_card') }}
            title="New card"
            detail="Enter card details securely"
          />
          {payMethod === 'new_card' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {cardError && (
                <div style={{ color: C.red, fontSize: '12px', padding: '8px 12px', background: 'rgba(220,38,38,0.06)', borderRadius: '8px' }}>
                  {cardError}
                </div>
              )}
              <CardFields
                ref={cardFieldsRef}
                onError={setCardError}
                onToken={(result) => { lastTokenRef.current = result; setNewCardToken(result.token); setCardError(null) }}
              />
            </div>
          )}

          {error && (
            <div style={{ color: C.red, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.22)', borderRadius: '10px', padding: '10px 12px', fontSize: '13px' }}>
              {error}
            </div>
          )}
          <Btn
            variant="primary" fullWidth size="lg"
            onClick={pay}
            disabled={
              busy ||
              (payMethod === 'wallet'     && !canUseWallet) ||
              (payMethod === 'saved_card' && !selectedCardId)
            }
          >
            {busy ? 'Processing...' : payMethod === 'wallet'
              ? `Pay ${money(totalCents)} from wallet`
              : payMethod === 'saved_card' && selectedCard
              ? `Pay ${money(totalCents)} with ${(selectedCard.brand || 'CARD').toUpperCase()} ••••${selectedCard.last4}`
              : payMethod === 'new_card'
              ? `Pay ${money(totalCents)} with new card`
              : 'Choose a saved card'}
          </Btn>
          <p style={{ color: C.textDim, fontSize: '11px', lineHeight: 1.5, textAlign: 'center', margin: '4px 0 0' }}>
            By placing this order you agree to the{' '}
            <a href={TERMS_URL} target="_blank" rel="noreferrer" style={{ color: C.textMuted, textDecoration: 'underline' }}>Terms of Service</a>{' '}
            and{' '}
            <a href={REFUND_POLICY_URL} target="_blank" rel="noreferrer" style={{ color: C.textMuted, textDecoration: 'underline' }}>Refund Policy</a>.
          </p>
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
  // Tabs let the provider split the gig list by lifecycle. "All" hides
  // deleted gigs entirely; "Bin" is the only place deleted gigs show up
  // and editing is disabled there.
  const [tab, setTab] = React.useState('all') // 'all' | 'active' | 'drafts' | 'bin'

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

  // Restore a deleted gig from the bin back to a draft so the provider
  // can edit it again. Mirror image of the soft-delete that runs on
  // archive — clears deleted_at/by server-side via the PATCH payload.
  const restoreGig = async () => {
    if (!selected) return
    setSaving(true)
    setNotice('')
    try {
      const data = await requestJson(`/api/gigs/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'draft' }),
      })
      setGigs(prev => prev.map(g => g.id === selected.id ? data.gig : g))
      setTab('drafts')
      setNotice('Gig restored from the bin.')
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
        // DELETE soft-deletes (status='deleted') instead of removing
        // the row. Keep the gig in local state so the user can find
        // it under the Bin tab and Restore it later — that's what the
        // "soft delete + bin" UX is built on.
        setGigs(prev => prev.map(g => g.id === selected.id
          ? { ...g, status: 'deleted', deleted_at: new Date().toISOString() }
          : g))
        setTab('bin')
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

  // Tab-aware partitioning of the gig list. Default "All" hides deleted
  // entirely; "Bin" is the only home for them.
  const counts = {
    all: gigs.filter(g => g.status !== 'deleted').length,
    active: gigs.filter(g => g.status === 'active').length,
    drafts: gigs.filter(g => g.status === 'draft').length,
    bin: gigs.filter(g => g.status === 'deleted').length,
  }
  const tabFilter = (g) => {
    if (tab === 'all') return g.status !== 'deleted'
    if (tab === 'active') return g.status === 'active'
    if (tab === 'drafts') return g.status === 'draft'
    if (tab === 'bin') return g.status === 'deleted'
    return true
  }
  const visibleGigs = gigs.filter(tabFilter)
  const visibleSelected = visibleGigs.find(g => g.id === selectedId) ? selected : visibleGigs[0]
  const effectiveSelectedId = visibleSelected?.id || ''
  const isDeleted = visibleSelected?.status === 'deleted'

  return (
    <div style={pageShell}>
      <main style={inner}>
        <PremiumWorkbenchHeader
          gigs={gigs}
          counts={counts}
          saving={saving}
          onCreateNew={() => { if (typeof window !== 'undefined') window.location.href = '/dashboard/gigs/new' }}
        />
        {/* Status tabs — All / Active / Drafts / Bin. Bin is the only
            place deleted gigs surface; All explicitly omits them. */}
        <div className="ys-gigs-tabs" style={tabBarStyle}>
          {[
            { id: 'all', label: 'All', count: counts.all },
            { id: 'active', label: 'Active', count: counts.active },
            { id: 'drafts', label: 'Drafts', count: counts.drafts },
            { id: 'bin', label: '🗑 Bin', count: counts.bin },
          ].map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                ...tabPillStyle,
                ...(tab === t.id ? tabPillActiveStyle : {}),
                opacity: t.id === 'bin' && counts.bin === 0 ? 0.55 : 1,
              }}
            >
              {t.label}
              <span style={tabCountStyle}>{t.count}</span>
            </button>
          ))}
        </div>
        {notice && <div style={{ marginBottom: '14px', color: notice.includes('saved') || notice.includes('published') || notice.includes('created') || notice.includes('added') || notice.includes('removed') || notice.includes('restored') ? C.green : C.red, fontSize: '13px', fontWeight: 700 }}>{notice}</div>}
        {gigs.length === 0 ? (
          <EmptyState title="You haven't created any gigs yet." body="Create a draft, add a clear scope and tier pricing, then publish it to the marketplace." action={<Btn variant="primary" onClick={() => { if (typeof window !== 'undefined') window.location.href = '/dashboard/gigs/new' }}>+ Create new gig</Btn>} />
        ) : visibleGigs.length === 0 ? (
          <EmptyState
            title={tab === 'bin' ? 'Bin is empty.' : `No gigs in “${tab}”.`}
            body={tab === 'bin' ? 'Deleted gigs land here for 90 days before permanent removal.' : 'Switch tabs to see gigs in other lifecycle states.'}
          />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '290px minmax(0, 1fr)', gap: '16px' }} className="ys-gigs-grid">
            <aside style={{ display: 'grid', gap: '10px', alignContent: 'start' }}>
              {visibleGigs.map(gig => {
                const inBin = gig.status === 'deleted'
                return (
                  <button
                    key={gig.id}
                    type="button"
                    onClick={() => setSelectedId(gig.id)}
                    style={{
                      textAlign: 'left',
                      border: `1px solid ${effectiveSelectedId === gig.id ? C.cyan : C.border}`,
                      background: effectiveSelectedId === gig.id ? C.cyanGlow : C.surface,
                      borderRadius: '10px',
                      padding: '14px',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      opacity: inBin ? 0.78 : 1,
                      boxShadow: effectiveSelectedId === gig.id ? '0 6px 16px -10px rgba(60,59,110,0.35)' : 'none',
                      transition: 'border-color 120ms, box-shadow 160ms, opacity 160ms',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                      <Badge color={statusColor(gig.status)}>{gig.status}</Badge>
                      <span style={{ color: C.textMuted, fontSize: '11px' }}>{gig.tiers?.length || 0} tiers</span>
                    </div>
                    <div style={{ fontWeight: 900, color: C.text, fontSize: '14px', lineHeight: 1.35 }}>{gig.title}</div>
                    <div style={{ color: C.textMuted, fontSize: '12px', marginTop: '5px' }}>{gig.category || 'Uncategorized'}</div>
                  </button>
                )
              })}
            </aside>
            {selected && (
              <div style={{ display: 'grid', gap: '16px', pointerEvents: isDeleted ? 'none' : 'auto', opacity: isDeleted ? 0.55 : 1 }}>
                {/* When the selected gig is in the bin we mask the
                    detail area visually + block pointer events so the
                    user can't edit. The detail-section header below
                    is the only thing left interactive (Restore CTA). */}
                <Card style={{ padding: '18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '14px', pointerEvents: 'auto' }}>
                    <div>
                      <h2 style={sectionTitle}>{isDeleted ? 'Gig in the bin' : 'Gig details'}</h2>
                      <div style={{ color: C.textMuted, fontSize: '12px', marginTop: '4px' }}>
                        {isDeleted
                          ? `Deleted ${compactDate(selected.deleted_at || selected.updated_at)} — restore to edit`
                          : `Last updated ${compactDate(selected.updated_at)}`}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {isDeleted ? (
                        <Btn size="sm" variant="success" onClick={restoreGig} disabled={saving}>↺ Restore</Btn>
                      ) : (
                        <>
                          <Btn size="sm" variant="secondary" onClick={saveGig} disabled={saving}>Save</Btn>
                          {selected.status !== 'active' && <Btn size="sm" variant="success" onClick={() => transitionGig('publish')} disabled={saving}>Publish</Btn>}
                          {selected.status === 'active' && <Btn size="sm" variant="secondary" onClick={() => transitionGig('pause')} disabled={saving}>Pause</Btn>}
                          <Btn size="sm" variant="danger" onClick={() => transitionGig('archive')} disabled={saving}>🗑 Move to bin</Btn>
                        </>
                      )}
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
                {/* SEO optimization card with live scoring + SERP preview */}
                <Card style={{ padding: '18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '14px' }}>
                    <h2 style={sectionTitle}>SEO & Search Visibility</h2>
                    {selected.seo_title && selected.seo_description && (
                      <Badge color="cyan">Custom SEO</Badge>
                    )}
                  </div>
                  <div style={{ display: 'grid', gap: '12px' }}>
                    <Input
                      label="SEO Title (optional — leave blank to use gig title)"
                      value={selected.seo_title || ''}
                      onChange={title => updateLocalGig({ seo_title: title })}
                      hint={selected.seo_title && selected.seo_title.length > 60 ? 'Google may truncate titles over 60 characters' : 'Optimal: up to 60 chars for full search display'}
                    />
                    <label style={labelStyle}>
                      Meta Description (optional — shown under the title in search results)
                      <textarea
                        style={{ ...textareaStyle, minHeight: '64px' }}
                        value={selected.seo_description || ''}
                        onChange={e => updateLocalGig({ seo_description: e.target.value })}
                        placeholder="A compelling summary that appears in Google search snippets — aim for 120–160 characters"
                      />
                      <div style={{ color: C.textMuted, fontSize: '11px', marginTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{(selected.seo_description || '').length}/300 characters</span>
                        {(selected.seo_description || '').length > 0 && (selected.seo_description || '').length < 120 && (
                          <span style={{ color: C.red }}>Add {120 - (selected.seo_description || '').length} more chars for optimal snippet</span>
                        )}
                      </div>
                    </label>
                  </div>
                  {/* Live SEO Score + SERP preview from shared utilities */}
                  <div style={{ marginTop: '16px' }}>
                    <GigSEOInsights gig={selected} />
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

// SEO insights component used by ProviderGigsPage — wraps computeSEOScore
// and renders a live score ring + SERP preview + optimization checklist.
function GigSEOInsights({ gig }) {
  const [expanded, setExpanded] = React.useState(false)

  const data = React.useMemo(() => {
    const result = computeSEOScore({
      title: gig?.title || '',
      pitch: gig?.pitch || '',
      description: gig?.description || '',
      tags: Array.isArray(gig?.tags) ? gig.tags : [],
      seo_title: gig?.seo_title || '',
      seo_description: gig?.seo_description || '',
      category: gig?.category || '',
      jurisdiction: gig?.jurisdiction || '',
    })
    return {
      score: result.score,
      checks: result.checks,
      finalTitle: (gig?.seo_title || gig?.title || ''),
      metaDesc: (gig?.seo_description || gig?.pitch || ''),
      passedCount: result.checks.filter(c => c.passed).length,
      totalCount: result.checks.length,
    }
  }, [gig])

  const scoreColor = data.score >= 80 ? C.green : data.score >= 50 ? '#9A7B3B' : C.red
  const scoreBg = data.score >= 80 ? `${C.green}12` : data.score >= 50 ? '#FFF8E7' : `${C.red}10`

  return (
    <div style={{ display: 'grid', gap: '12px' }}>
      {/* Score ring summary */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '16px',
        padding: '12px 14px', background: scoreBg,
        borderRadius: '10px', border: `1px solid ${scoreColor}25`,
      }}>
        <div style={{ position: 'relative', width: '52px', height: '52px', flexShrink: 0 }}>
          <svg width="52" height="52" viewBox="0 0 52 52">
            <circle cx="26" cy="26" r="21" fill="none" stroke="#E2E8F0" strokeWidth="4" />
            <circle
              cx="26" cy="26" r="21" fill="none"
              stroke={scoreColor} strokeWidth="4"
              strokeDasharray={`${(data.score / 100) * 132} 132`}
              strokeDashoffset="33" strokeLinecap="round"
              style={{ transition: 'stroke-dasharray 0.6s ease' }}
            />
            <text x="26" y="26" textAnchor="middle" dominantBaseline="central"
              fill={C.text} fontSize="14" fontWeight="700" fontFamily="system-ui, sans-serif">
              {data.score}%
            </text>
          </svg>
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: '14px', color: C.text }}>
            SEO Score
          </div>
          <div style={{ fontSize: '12px', color: C.textMuted, marginTop: '2px' }}>
            {data.passedCount}/{data.totalCount} checks
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          style={{
            marginLeft: 'auto', background: 'transparent', border: `1px solid ${C.border}`,
            borderRadius: '6px', padding: '4px 10px', fontSize: '11px',
            fontWeight: 700, cursor: 'pointer', color: C.textMuted, fontFamily: 'inherit',
          }}
        >
          {expanded ? 'Hide details' : 'Details'}
        </button>
      </div>

      {/* Expanded: SERP preview + checklist */}
      {expanded && (
        <>
          <div style={{
            padding: '12px 14px', background: '#fff',
            border: '1px solid #E2E8F0', borderRadius: '10px',
            fontFamily: 'Arial, sans-serif',
          }}>
            <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>
              Google Search Preview
            </div>
            <div style={{ fontSize: '11px', color: '#4B5563', marginBottom: '3px' }}>
              marketplace.yousafeconsultancy.com/marketplace/gigs/{gig?.slug || 'your-gig'}
            </div>
            <div style={{
              fontSize: '18px', color: '#1a0dab', fontWeight: 400,
              maxWidth: '600px', overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap', lineHeight: 1.3, marginBottom: '2px',
            }}>
              {data.finalTitle.length > 60 ? `${data.finalTitle.slice(0, 60)}…` : data.finalTitle || 'Gig Title'}
            </div>
            <div style={{ fontSize: '12px', color: '#4B5563', lineHeight: 1.58, maxWidth: '600px' }}>
              {data.metaDesc.length > 160 ? `${data.metaDesc.slice(0, 157)}…` : data.metaDesc || 'Write a compelling meta description to improve click-through.'}
            </div>
          </div>

          <div style={{ display: 'grid', gap: '4px' }}>
            {data.checks.map(check => (
              <div key={check.label} style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '6px 10px', borderRadius: '6px',
                background: check.ok ? `${C.green}08` : `${C.red}08`,
                fontSize: '12px',
              }}>
                <span style={{
                  width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '10px', fontWeight: 700,
                  background: check.ok ? `${C.green}20` : `${C.red}15`,
                  color: check.ok ? C.green : C.red,
                }}>
                  {check.ok ? '✓' : '!'}
                </span>
                <span style={{ flex: 1, color: check.ok ? C.text : C.text, fontWeight: check.ok ? 400 : 600 }}>
                  {check.label}
                </span>
                <span style={{ fontSize: '10px', fontWeight: 700, color: check.ok ? C.green : C.textMuted }}>
                  +{check.weight}%
                </span>
              </div>
            ))}
          </div>
        </>
      )}
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

// Admin KPI strip — six tiles derived from /api/admin/orders/stats. Always
// renders (even at 0 / 0 / 0 / 0%) so the admin can see the platform is
// alive and not just confronting a blank kanban. Tile order is intentional:
// money on the left (revenue, escrow held, refunds), operational risk in the
// middle (late deliveries, completion rate), and AOV on the right.
function AdminKpiStrip({ stats, orderCount, onKpiClick, kpiFilter }) {
  // Server-side totals come from ALL orders, not the filtered view — that
  // way the strip is the source of truth for platform health.
  const attyGross = Number(stats?.by_provider_type?.attorney?.gross ?? 0)
  const consGross = Number(stats?.by_provider_type?.consultant?.gross ?? 0)
  const gross = attyGross + consGross
  const escrowHeld = Number(stats?.escrow_held_total ?? 0) // optional field; tolerated when absent
  const refundsTotal = Number(stats?.refund_stats?.total ?? 0)
  const refundsCount = Number(stats?.refund_stats?.count ?? 0)
  const lateCount = Number(stats?.late_delivery_count ?? 0)
  const completionRate = Number(stats?.completion_rate ?? 0)
  const aov = Number(stats?.avg_order_value ?? 0)

  // `total_amount` and `gross` from the stats endpoint already use dollar
  // units (rows.total_amount summed directly), so multiply by 100 before
  // passing to money() which expects cents.
  const moneyDollars = (d) => money(Math.round(Number(d || 0) * 100))

  // `kpi` is the filter key this tile applies when clicked; absence means
  // the tile is informational only (click does nothing, cursor stays default).
  // Tiles that filter: refunds, late, escrow, attorney/consultant gross.
  // Tiles that don't: lifetime revenue, completion rate, avg order value.
  const tiles = [
    { label: 'Lifetime revenue', value: moneyDollars(gross), sub: `${orderCount} orders` },
    { label: 'In escrow', value: escrowHeld > 0 ? moneyDollars(escrowHeld) : '—', sub: 'Held funds', kpi: escrowHeld > 0 ? 'escrow' : null },
    { label: 'Refunds', value: moneyDollars(refundsTotal), sub: `${refundsCount} order${refundsCount === 1 ? '' : 's'}`, danger: refundsCount > 0, kpi: refundsCount > 0 ? 'refunds' : null },
    { label: 'Late deliveries', value: String(lateCount), sub: lateCount === 0 ? 'All on time' : 'Past deadline', danger: lateCount > 0, kpi: lateCount > 0 ? 'late' : null },
    { label: 'Completion rate', value: `${Math.round(completionRate * 100)}%`, sub: 'Completed vs cancelled' },
    { label: 'Avg order value', value: moneyDollars(aov), sub: 'Across all orders' },
    { label: 'Attorney gross', value: moneyDollars(attyGross), sub: `${stats?.by_provider_type?.attorney?.count ?? 0} orders`, kpi: (stats?.by_provider_type?.attorney?.count ?? 0) > 0 ? 'attorney' : null },
    { label: 'Consultant gross', value: moneyDollars(consGross), sub: `${stats?.by_provider_type?.consultant?.count ?? 0} orders`, kpi: (stats?.by_provider_type?.consultant?.count ?? 0) > 0 ? 'consultant' : null },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '14px' }}>
      {tiles.map((t) => {
        const isActive = !!t.kpi && t.kpi === kpiFilter
        const isClickable = !!t.kpi && typeof onKpiClick === 'function'
        const Tag = isClickable ? 'button' : 'div'
        return (
          <Tag
            key={t.label}
            type={isClickable ? 'button' : undefined}
            onClick={isClickable ? () => onKpiClick(isActive ? null : t.kpi) : undefined}
            aria-pressed={isClickable ? isActive : undefined}
            title={isClickable ? (isActive ? 'Clear filter' : `Filter to ${t.label.toLowerCase()}`) : undefined}
            style={{
              all: 'unset',
              boxSizing: 'border-box',
              display: 'block',
              background: t.danger ? '#2a1010' : isActive ? C.cyanGlow : C.surface2,
              border: `1px solid ${isActive ? C.cyan : t.danger ? C.red : C.border}`,
              borderRadius: '10px',
              padding: '12px 14px',
              cursor: isClickable ? 'pointer' : 'default',
              transition: 'border-color 120ms ease, background 120ms ease',
              fontFamily: 'inherit',
              textAlign: 'left',
              color: 'inherit',
            }}
          >
            <div style={{ color: C.textMuted, fontSize: '11px', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '6px' }}>
              {t.label}
            </div>
            <div style={{ fontSize: '20px', fontWeight: 900, color: t.danger ? '#fecaca' : C.text, lineHeight: 1.1 }}>
              {t.value}
            </div>
            <div style={{ color: C.textMuted, fontSize: '11px', marginTop: '4px' }}>{t.sub}</div>
          </Tag>
        )
      })}
    </div>
  )
}

export function OrderKanbanPage({ adminOnly = false }) {
  const [profile, setProfile] = React.useState(null)
  const [orders, setOrders] = React.useState([])
  const [selected, setSelected] = React.useState(null)
  const [filter, setFilter] = React.useState('all')
  // KPI-driven filter (refunds | late | escrow | attorney | consultant).
  // Click a KPI tile to apply; null = no KPI filter active.
  const [kpiFilter, setKpiFilter] = React.useState(null)
  // Focused kanban column — when set, only that column is rendered (Fiverr-
  // style drill-down). null = full 5-column board.
  const [focusCol, setFocusCol] = React.useState(null)
  const [search, setSearch] = React.useState('')
  const [stats, setStats] = React.useState(null)
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
      // Admin gets stats in parallel so the KPI strip lights up at the same
      // time the kanban does. Stats failures degrade silently — the kanban
      // is the primary surface, KPIs are additive.
      const [data, statsPayload] = await Promise.all([
        requestJson(endpoint),
        role === 'admin'
          ? requestJson('/api/admin/orders/stats').catch(() => null)
          : Promise.resolve(null),
      ])
      setOrders(shapeOrders(data, role))
      setStats(statsPayload?.data ?? statsPayload ?? null)
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
  const isAdmin = role === 'admin'

  // Predicate helpers used by the click-driven filters from the KPI strip.
  // `late` mirrors the server-side rule in /admin/orders/stats: past
  // delivery_deadline AND not in a terminal status.
  const TERMINAL = ['completed', 'released', 'paid', 'cancelled', 'refunded']
  const isLate = (o) => {
    if (!o.deadline) return false
    const t = new Date(o.deadline).getTime()
    if (!Number.isFinite(t)) return false
    return t < Date.now() && !TERMINAL.includes(String(o.status || '').toLowerCase())
  }
  const isRefundOrCancel = (o) => ['refunded', 'cancelled', 'declined'].includes(String(o.status || '').toLowerCase())
  const isEscrowHeld = (o) => String(o.escrowStatus || '').toLowerCase() === 'held'

  // Tab filter (existing) + KPI-driven filter (new). Combined, then search
  // narrows the kanban view further. KPI strip stays platform-wide so it
  // never reflects the current narrow view.
  const tabFiltered = filter === 'all'
    ? orders
    : orders.filter(o => o.providerType === filter || o.status === filter)
  const kpiFiltered = !kpiFilter
    ? tabFiltered
    : tabFiltered.filter(o =>
        kpiFilter === 'refunds' ? isRefundOrCancel(o)
        : kpiFilter === 'late' ? isLate(o)
        : kpiFilter === 'escrow' ? isEscrowHeld(o)
        : kpiFilter === 'attorney' ? o.providerType === 'attorney'
        : kpiFilter === 'consultant' ? o.providerType === 'consultant'
        : true,
      )
  // Column focus — click a column header to drill into just that pipeline
  // stage; the four other columns hide and the focused one expands.
  const columnFiltered = !focusCol
    ? kpiFiltered
    : kpiFiltered.filter(o => {
        const col = ORDER_COLUMNS.find(c => c.id === focusCol)
        return col?.statuses.includes(String(o.status || '').toLowerCase())
      })
  const q = search.trim().toLowerCase()
  const visibleOrders = q
    ? columnFiltered.filter(o =>
        String(o.id || '').toLowerCase().includes(q) ||
        String(o.orderNumber || '').toLowerCase().includes(q) ||
        String(o.title || '').toLowerCase().includes(q) ||
        String(o.clientName || '').toLowerCase().includes(q) ||
        String(o.clientEmail || '').toLowerCase().includes(q) ||
        String(o.providerName || '').toLowerCase().includes(q),
      )
    : columnFiltered
  const totalValue = visibleOrders.reduce((sum, o) => sum + Number(o.amountCents || 0), 0)
  const allColumns = ORDER_COLUMNS.map(col => ({ ...col, orders: visibleOrders.filter(o => col.statuses.includes(String(o.status || '').toLowerCase())) }))
  const columns = focusCol ? allColumns.filter(c => c.id === focusCol) : allColumns

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

        {/* Admin-only KPI strip + search. Stats are computed server-side over
            ALL orders (not just the current tab/search) so the admin always
            sees the real platform totals; the kanban below reflects the
            filter. KPI tiles degrade gracefully to 0 / dash when stats are
            absent (e.g. brand-new install with no orders). */}
        {isAdmin && (
          <AdminKpiStrip stats={stats} orderCount={orders.length} kpiFilter={kpiFilter} onKpiClick={setKpiFilter} />
        )}

        {/* Late-delivery red banner — only visible when there's actually
            something to act on. Counts come from /admin/orders/stats. */}
        {isAdmin && stats?.late_delivery_count > 0 && (
          <div style={{ background: '#3a1010', border: `1px solid ${C.red}`, color: '#fecaca', borderRadius: '10px', padding: '12px 14px', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', fontWeight: 800 }}>
              {stats.late_delivery_count} order{stats.late_delivery_count === 1 ? '' : 's'} past delivery deadline. These need admin attention.
            </span>
            <button type="button" onClick={() => { setKpiFilter('late'); setFocusCol(null) }} style={{ border: `1px solid ${C.red}`, background: 'transparent', color: '#fecaca', borderRadius: '999px', padding: '6px 12px', fontSize: '12px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
              View late orders →
            </button>
          </div>
        )}

        {/* Active filter chip row — shows what's narrowing the kanban right
            now and lets the admin clear in one click. Beats the user having
            to remember which tile they hit. */}
        {isAdmin && (kpiFilter || focusCol) && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '14px' }}>
            <span style={{ color: C.textMuted, fontSize: '11px', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Filter</span>
            {kpiFilter && (
              <button type="button" onClick={() => setKpiFilter(null)} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', border: `1px solid ${C.cyan}`, background: C.cyanGlow, color: C.text, borderRadius: '999px', padding: '6px 12px', fontSize: '12px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                {kpiFilter === 'refunds' ? 'Refunds'
                  : kpiFilter === 'late' ? 'Late deliveries'
                  : kpiFilter === 'escrow' ? 'In escrow'
                  : kpiFilter === 'attorney' ? 'Attorney orders'
                  : kpiFilter === 'consultant' ? 'Consultant orders'
                  : kpiFilter}
                <span aria-hidden style={{ opacity: 0.7 }}>✕</span>
              </button>
            )}
            {focusCol && (
              <button type="button" onClick={() => setFocusCol(null)} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', border: `1px solid ${C.cyan}`, background: C.cyanGlow, color: C.text, borderRadius: '999px', padding: '6px 12px', fontSize: '12px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                Column: {ORDER_COLUMNS.find(c => c.id === focusCol)?.label ?? focusCol}
                <span aria-hidden style={{ opacity: 0.7 }}>✕</span>
              </button>
            )}
          </div>
        )}

        {isAdmin && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '14px' }}>
            <input
              type="search"
              placeholder="Search by order #, ID, client name, email, or service"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ flex: 1, minWidth: 0, border: `1px solid ${C.border2}`, background: C.surface, color: C.text, borderRadius: '10px', padding: '10px 14px', fontSize: '13px', fontFamily: 'inherit' }}
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} style={{ border: `1px solid ${C.border2}`, background: C.surface, color: C.textMuted, borderRadius: '10px', padding: '10px 14px', fontSize: '12px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                Clear
              </button>
            )}
          </div>
        )}

        {notice && <div style={{ color: notice.includes('updated') ? C.green : C.red, fontSize: '13px', fontWeight: 800, marginBottom: '12px' }}>{notice}</div>}

        {/* Friendly empty state — beats five blank kanban columns when there
            are genuinely zero orders to triage. Search misses get a tighter
            message so the admin knows it's a query problem, not a data one. */}
        {visibleOrders.length === 0 && !loading && (
          <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: '12px', padding: '28px', textAlign: 'center', marginBottom: '14px' }}>
            <div style={{ fontWeight: 900, fontSize: '15px', marginBottom: '6px' }}>
              {orders.length === 0
                ? (isAdmin ? 'No orders on the platform yet.' : 'No orders yet.')
                : 'No orders match this filter.'}
            </div>
            <div style={{ color: C.textMuted, fontSize: '13px', lineHeight: 1.55, maxWidth: '520px', margin: '0 auto' }}>
              {orders.length === 0 && isAdmin
                ? 'When students place their first order, it appears here with full status, escrow, and audit controls.'
                : orders.length === 0
                  ? 'When you receive new orders they will appear in the pipeline.'
                  : 'Try clearing the search box or switching back to the All tab.'}
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: focusCol ? '1fr' : 'repeat(5, minmax(220px, 1fr))', gap: '12px', overflowX: 'auto', paddingBottom: '8px' }}>
          {columns.map(col => {
            const isFocused = focusCol === col.id
            const headerClickable = isAdmin && (col.orders.length > 0 || isFocused)
            return (
              <section key={col.id} style={{ minWidth: '220px', background: C.surface2, border: `1px solid ${isFocused ? C.cyan : C.border}`, borderRadius: '8px', padding: '10px' }}>
                {/* Click the column header to drill into just that stage —
                    Fiverr-style focus. Click again (or the chip ✕) to clear. */}
                <button
                  type="button"
                  onClick={headerClickable ? () => setFocusCol(isFocused ? null : col.id) : undefined}
                  disabled={!headerClickable}
                  title={headerClickable ? (isFocused ? 'Show all columns' : `Focus ${col.label}`) : undefined}
                  style={{
                    all: 'unset',
                    boxSizing: 'border-box',
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '8px',
                    alignItems: 'center',
                    marginBottom: '10px',
                    cursor: headerClickable ? 'pointer' : 'default',
                    fontFamily: 'inherit',
                    color: 'inherit',
                  }}
                >
                  <span style={{ fontWeight: 900, fontSize: '13px' }}>{col.label}</span>
                  <Badge color={col.color}>{col.orders.length}</Badge>
                </button>
                <div style={{ display: 'grid', gap: '10px' }}>
                  {col.orders.map(order => (
                    // Card is a div (not a button) so we can embed real anchor
                    // tags for clickable provider/client links without nesting
                    // interactive elements (which would break a11y and click).
                    <div
                      key={order.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelected(order)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(order) } }}
                      style={{ textAlign: 'left', border: `1px solid ${C.border}`, background: C.surface, borderRadius: '8px', padding: '12px', cursor: 'pointer', fontFamily: 'inherit', color: C.text }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                        <Badge color={statusColor(order.status)}>{order.status}</Badge>
                        {/* Click provider-type chip → filter to that role. */}
                        {isAdmin && (order.providerType === 'attorney' || order.providerType === 'consultant') ? (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setKpiFilter(order.providerType) }}
                            title={`Filter to ${order.providerType} orders`}
                            style={{ all: 'unset', cursor: 'pointer', color: C.textMuted, fontSize: '11px', textDecoration: 'underline dotted', textUnderlineOffset: '2px' }}
                          >
                            {order.providerType}
                          </button>
                        ) : (
                          <span style={{ color: C.textMuted, fontSize: '11px' }}>{order.providerType || role}</span>
                        )}
                      </div>
                      <div style={{ fontWeight: 900, fontSize: '14px', lineHeight: 1.35 }}>
                        {order.orderNumber ? <span style={{ color: C.textMuted, fontWeight: 700 }}>#{order.orderNumber} · </span> : null}
                        {order.title}
                      </div>
                      <div style={{ color: C.textMuted, fontSize: '12px', marginTop: '6px' }}>
                        <span>{order.clientName}</span>
                        {order.providerName ? <> → {order.providerProfileId ? (
                          <Link
                            href={`/marketplace/providers/${order.providerProfileId}`}
                            target="_blank"
                            rel="noopener"
                            onClick={(e) => e.stopPropagation()}
                            title="Open provider profile in a new tab"
                            style={{ color: C.text, textDecoration: 'underline', textUnderlineOffset: '2px' }}
                          >
                            {order.providerName}
                          </Link>
                        ) : order.providerName}</> : null}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: C.textMuted, fontSize: '11px', marginTop: '10px' }}>
                        <span>{compactDate(order.createdAt)}</span>
                        <span>{money(order.amountCents)}</span>
                      </div>
                      <ProgressBar value={Math.min(100, Math.max(0, Number(order.progress || 0)))} style={{ marginTop: '10px' }} />
                    </div>
                  ))}
                </div>
              </section>
            )
          })}
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
        orderNumber: o.order_number || null,
        title: service?.title || o.service_title || o.title || 'Marketplace order',
        status: o.status === 'queued' ? 'pending' : o.status || 'pending',
        escrowStatus: o.escrow_status || 'held',
        clientId: o.client_id || null,
        clientName: client?.full_name || client?.email || 'Student',
        clientEmail: client?.email || null,
        providerProfileId: o.consultant_id || o.attorney_profile_id || null,
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
