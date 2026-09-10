'use client'
import { useEffect, useRef, useState } from 'react'
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

interface ApiEnvelope { gigs?: Gig[]; total?: number; hasMore?: boolean; page?: number }

const PAGE_SIZE = 48

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
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const resultsRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError('')
    const params = new URLSearchParams()
    if (country !== 'all') params.set('country', country)
    // "All categories checked" means unfiltered — don't send category
    // params at all. Sending every taxonomy id as a filter made the API
    // drop active gigs whose category is NULL or outside the taxonomy,
    // so part of the inventory was invisible even on "show everything".
    if (picked.size !== CATEGORIES.length) {
      for (const id of picked) params.append('category', id)
    }
    params.set('sort', sort)
    params.set('limit', String(PAGE_SIZE))
    params.set('page', String(page))

    fetch(`/api/marketplace/gigs?${params.toString()}`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then((body: { data?: ApiEnvelope } & ApiEnvelope) => {
        if (cancelled) return
        // ok() envelope is { ok: true, data: {...} }; some routes return the data directly. Handle both.
        const payload = (body as any).data ?? body
        setGigs(payload.gigs ?? [])
        setTotal(payload.total ?? 0)
        setHasMore(Boolean(payload.hasMore))
      })
      .catch((e) => !cancelled && setError(typeof e === 'string' ? e : 'Failed to load gigs'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [open, country, picked, sort, page])

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

  const currency = CURRENCY_BY[country]

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const canPrev = page > 1
  const canNext = hasMore || page < totalPages
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rangeEnd = (page - 1) * PAGE_SIZE + gigs.length

  function goToPage(next: number) {
    if (next < 1) return
    setPage(next)
    // Keep the top of the result grid in view after the swap.
    requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
  }

  // Filter mutations always restart at page 1 — resetting here (in the same
  // handlers that change state) avoids an extra fetch with the stale page.
  function changeCountry(c: Country) {
    setCountry(c)
    setPage(1)
  }

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setPage(1)
  }

  function pickAll() {
    setPicked(new Set(CATEGORIES.map((c) => c.id)))
    setPage(1)
  }

  function pickNone() {
    setPicked(new Set())
    setPage(1)
  }

  function changeSort(s: typeof sort) {
    setSort(s)
    setPage(1)
  }

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
                        onClick={() => changeCountry(c)}
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
                      <button type="button" onClick={pickAll} disabled={allChecked}>All</button>
                      <span>·</span>
                      <button type="button" onClick={pickNone} disabled={noneChecked}>None</button>
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
                  <select value={sort} onChange={(e) => changeSort(e.target.value as typeof sort)} className="cw-all-sort">
                    <option value="trending">Most popular</option>
                    <option value="best_rated">Best rated</option>
                    <option value="most_orders">Most orders</option>
                    <option value="newest">Newest</option>
                    <option value="price_asc">Price · low to high</option>
                  </select>
                </div>
              </aside>

              <section className="cw-all-results" ref={resultsRef}>
                <div className="cw-all-count">
                  {loading
                    ? 'Loading…'
                    : error
                      ? `${error}`
                      : total === 0
                        ? '0 services match'
                        : `${total.toLocaleString('en-US')} services match · showing ${rangeStart}–${rangeEnd}`}
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
                        href={g.slug ? `/gigs/${g.slug}` : '/'}
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

                {!loading && !error && total > PAGE_SIZE && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '18px 0 4px' }}>
                    <button
                      type="button"
                      onClick={() => goToPage(page - 1)}
                      disabled={!canPrev || loading}
                      style={{
                        padding: '8px 14px', borderRadius: 8, border: '1px solid #DDD8CE',
                        background: '#FFFFFF', cursor: canPrev && !loading ? 'pointer' : 'not-allowed',
                        opacity: canPrev && !loading ? 1 : 0.45, fontWeight: 600, fontSize: 13,
                      }}
                    >
                      ← Prev
                    </button>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#5C6070' }}>
                      Page {page} of {totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => goToPage(page + 1)}
                      disabled={!canNext || loading}
                      style={{
                        padding: '8px 14px', borderRadius: 8, border: '1px solid #DDD8CE',
                        background: '#FFFFFF', cursor: canNext && !loading ? 'pointer' : 'not-allowed',
                        opacity: canNext && !loading ? 1 : 0.45, fontWeight: 600, fontSize: 13,
                      }}
                    >
                      Next →
                    </button>
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
