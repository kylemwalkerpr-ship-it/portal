'use client'
import { useEffect, useMemo, useState } from 'react'
import { CATEGORIES } from '@/lib/categories'

type Country = 'all' | 'us' | 'uk' | 'ca' | 'au'

interface Gig {
  id: string
  slug: string | null
  title: string
  category: string | null
  jurisdiction: string | null
  provider_type: 'attorney' | 'consultant' | null
  starting_price: number | null
  delivery_days: number | null
  avg_rating: number | null
  review_count: number | null
  order_count: number | null
  provider?: { full_name?: string | null } | null
}

interface ApiEnvelope { gigs?: Gig[]; total?: number }

const CURRENCY_BY: Record<Country, string> = { all: 'USD', us: 'USD', uk: 'GBP', ca: 'CAD', au: 'AUD' }

function formatPrice(cents: number | null | undefined, currency = 'USD'): string {
  if (cents == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(Number(cents) / 100))
}

export function AllGigsDrawer({
  triggerLabel = 'See all featured →',
  initialCountry = 'all',
}: {
  triggerLabel?: string
  initialCountry?: Country
}) {
  const [open, setOpen] = useState(false)
  const [country, setCountry] = useState<Country>(initialCountry)
  const [picked, setPicked] = useState<Set<string>>(new Set(CATEGORIES.map((c) => c.id))) // all checked
  const [sort, setSort] = useState<'trending' | 'best_rated' | 'most_orders' | 'newest' | 'price_asc'>('trending')
  const [gigs, setGigs] = useState<Gig[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError('')
    const params = new URLSearchParams()
    if (country !== 'all') params.set('country', country)
    for (const id of picked) params.append('category', id)
    params.set('sort', sort)
    params.set('limit', '48')

    fetch(`/api/marketplace/gigs?${params.toString()}`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then((body: { data?: ApiEnvelope } & ApiEnvelope) => {
        if (cancelled) return
        // ok() envelope is { ok: true, data: {...} }; some routes return the data directly. Handle both.
        const payload = (body as any).data ?? body
        setGigs(payload.gigs ?? [])
        setTotal(payload.total ?? 0)
      })
      .catch((e) => !cancelled && setError(typeof e === 'string' ? e : 'Failed to load gigs'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [open, country, picked, sort])

  // Close on Escape, lock body scroll while open
  useEffect(() => {
    if (!open) return
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onEsc)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onEsc)
      document.body.style.overflow = prev
    }
  }, [open])

  const allChecked = picked.size === CATEGORIES.length
  const noneChecked = picked.size === 0

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const currency = CURRENCY_BY[country]

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="cw-all-trigger">
        {triggerLabel}
      </button>

      {open && (
        <div className="cw-all-overlay" role="dialog" aria-modal="true" aria-label="All services">
          <div className="cw-all-backdrop" onClick={() => setOpen(false)} />
          <div className="cw-all-drawer">
            <header className="cw-all-head">
              <div>
                <div className="cw-all-eyebrow">All services</div>
                <h2 className="cw-all-title">Browse every active brief</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="cw-all-close" aria-label="Close">×</button>
            </header>

            <div className="cw-all-body">
              <aside className="cw-all-side">
                <div className="cw-all-filterblock">
                  <div className="cw-all-filter-label">Jurisdiction</div>
                  <div className="cw-all-jx">
                    {(['all', 'us', 'uk', 'ca', 'au'] as Country[]).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCountry(c)}
                        className={c === country ? 'on' : ''}
                      >
                        {c === 'all' ? 'All' : c.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="cw-all-filterblock">
                  <div className="cw-all-filter-label">
                    Categories
                    <span className="cw-all-bulk">
                      <button type="button" onClick={() => setPicked(new Set(CATEGORIES.map((c) => c.id)))} disabled={allChecked}>All</button>
                      <span>·</span>
                      <button type="button" onClick={() => setPicked(new Set())} disabled={noneChecked}>None</button>
                    </span>
                  </div>
                  <ul className="cw-all-cats">
                    {CATEGORIES.map((cat) => {
                      const on = picked.has(cat.id)
                      return (
                        <li key={cat.id}>
                          <label>
                            <input type="checkbox" checked={on} onChange={() => toggle(cat.id)} />
                            <span className="cw-all-cat-icon" aria-hidden="true">{cat.icon}</span>
                            <span>{cat.name.replace(' Services', '')}</span>
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                </div>

                <div className="cw-all-filterblock">
                  <div className="cw-all-filter-label">Sort by</div>
                  <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="cw-all-sort">
                    <option value="trending">Most popular</option>
                    <option value="best_rated">Best rated</option>
                    <option value="most_orders">Most orders</option>
                    <option value="newest">Newest</option>
                    <option value="price_asc">Price · low to high</option>
                  </select>
                </div>
              </aside>

              <section className="cw-all-results">
                <div className="cw-all-count">
                  {loading ? 'Loading…' : error ? `${error}` : `${total.toLocaleString('en-US')} services match · showing ${gigs.length}`}
                </div>
                {!loading && !error && gigs.length === 0 && (
                  <div className="cw-all-empty">No services match these filters. Try widening the categories or switching jurisdiction.</div>
                )}
                <div className="cw-all-grid">
                  {gigs.map((g) => {
                    const jx = (g.jurisdiction || '').toLowerCase()
                    const tag = `${(jx || 'YS').toUpperCase()} · ${(g.category ?? 'Brief').replace(/Services?$/i, '').trim() || 'Brief'}`
                    return (
                      <a
                        key={g.id}
                        href={g.slug ? `/marketplace/gigs/${g.slug}` : '/marketplace'}
                        className="cw-all-card"
                      >
                        <div className="cw-all-card-plate" data-c={jx || 'us'}>
                          <span className="cw-all-card-tag">{tag}</span>
                        </div>
                        <div className="cw-all-card-body">
                          <h4>{g.title}</h4>
                          <div className="cw-all-card-meta">
                            <span>{g.provider?.full_name || 'YouSafe provider'}</span>
                            {Number(g.review_count) > 0 && (
                              <span className="cw-all-card-rating">★ {Number(g.avg_rating).toFixed(2)} · {g.review_count}</span>
                            )}
                          </div>
                          <div className="cw-all-card-foot">
                            <span className="cw-all-card-delivery">{g.delivery_days ? `${g.delivery_days}d` : 'Flex'}</span>
                            <span className="cw-all-card-price">{formatPrice(g.starting_price, currency)}</span>
                          </div>
                        </div>
                      </a>
                    )
                  })}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
