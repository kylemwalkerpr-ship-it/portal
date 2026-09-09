'use client'

import React from 'react'
import { CATEGORIES, LEGACY_CATEGORY_MAP, normalizeCategory } from '@/lib/categories'
import { withCountry, type Country, type LandingGig } from '@/lib/marketplaceDisplay'
import { T } from './tokens'

const DISCOVERY_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Helvetica, Arial, sans-serif"

type Props = {
  gigs: LandingGig[]
  country: Country
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s ease', opacity: .72 }}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

function Popover({
  id,
  label,
  openId,
  setOpenId,
  children,
}: {
  id: string
  label: string
  openId: string | null
  setOpenId: (value: string | null) => void
  children: React.ReactNode
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const open = openId === id

  React.useEffect(() => {
    if (!open) return
    const closeOutside = (event: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpenId(null)
    }
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenId(null)
    }
    document.addEventListener('mousedown', closeOutside)
    document.addEventListener('touchstart', closeOutside)
    document.addEventListener('keydown', closeEscape)
    return () => {
      document.removeEventListener('mousedown', closeOutside)
      document.removeEventListener('touchstart', closeOutside)
      document.removeEventListener('keydown', closeEscape)
    }
  }, [open, setOpenId])

  return (
    <div ref={ref} className="ys-landing-filter-popover-wrap">
      <button type="button" className={`ys-landing-filter-pill${open ? ' is-open' : ''}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpenId(open ? null : id)}>
        <span>{label}</span><Chevron open={open} />
      </button>
      {open && <div className="ys-landing-filter-popover" role="dialog" aria-label={`${label} filter`}>{children}</div>}
    </div>
  )
}

export function LandingDiscoveryControls({ gigs, country }: Props) {
  const [openId, setOpenId] = React.useState<string | null>(null)

  const categoryCounts = React.useMemo(() => {
    const counts = new Map<string, number>()
    for (const gig of gigs) {
      if (!gig.category) continue
      const id = LEGACY_CATEGORY_MAP[gig.category] || normalizeCategory(gig.category)
      if (id) counts.set(id, (counts.get(id) || 0) + 1)
    }
    return counts
  }, [gigs])

  const categories = CATEGORIES
    .map((category) => ({ ...category, count: categoryCounts.get(category.id) || 0 }))
    .filter((category) => category.count > 0)
    .sort((a, b) => b.count - a.count)

  // The standalone market domain exposes the root as `/` and category hubs as
  // `/categories/<id>`. Do not make a user navigate through the internal
  // `/marketplace` mount or duplicate category identity in a query string.
  const filterLink = (query: string) => withCountry(`/?${query}`, country)
  const categoryLink = (categoryId: string) => withCountry(`/categories/${encodeURIComponent(categoryId)}`, country)

  return (
    <div className="ys-landing-discovery-controls" aria-label="Browse marketplace filters">
      <div className="ys-landing-filter-pills">
        <Popover id="service" label="Service options" openId={openId} setOpenId={setOpenId}>
          <p className="ys-landing-filter-title">Categories</p>
          <div className="ys-landing-filter-list">
            {categories.map((category) => (
              <a key={category.id} href={categoryLink(category.id)}>
                <span>{category.name.replace(' Services', '')}</span>
                <span className="count">{category.count}</span>
              </a>
            ))}
          </div>
        </Popover>

        <Popover id="provider" label="Provider details" openId={openId} setOpenId={setOpenId}>
          <p className="ys-landing-filter-title">Provider type</p>
          <div className="ys-landing-filter-list">
            <a href={filterLink('provider_type=attorney')}><span>Licensed attorneys</span><span>→</span></a>
            <a href={filterLink('provider_type=consultant')}><span>Regulated consultants</span><span>→</span></a>
            <a href={filterLink('min_rating=4.5')}><span>Rated 4.5 and above</span><span>★</span></a>
          </div>
        </Popover>

        <Popover id="budget" label="Budget" openId={openId} setOpenId={setOpenId}>
          <p className="ys-landing-filter-title">Starting price</p>
          <div className="ys-landing-filter-list">
            <a href={filterLink('max_price=100')}><span>Under 100</span><span>→</span></a>
            <a href={filterLink('min_price=100&max_price=500')}><span>100 – 500</span><span>→</span></a>
            <a href={filterLink('min_price=500&max_price=1000')}><span>500 – 1,000</span><span>→</span></a>
            <a href={filterLink('min_price=1000')}><span>1,000 and above</span><span>→</span></a>
          </div>
        </Popover>

        <Popover id="delivery" label="Delivery time" openId={openId} setOpenId={setOpenId}>
          <p className="ys-landing-filter-title">Turnaround</p>
          <div className="ys-landing-filter-list">
            <a href={filterLink('delivery_days=1')}><span>Within 24 hours</span><span>→</span></a>
            <a href={filterLink('delivery_days=3')}><span>Within 3 days</span><span>→</span></a>
            <a href={filterLink('delivery_days=7')}><span>Within 7 days</span><span>→</span></a>
          </div>
        </Popover>
      </div>

      <div className="ys-landing-filter-shortcuts">
        <a className="ys-landing-filter-switch" href={filterLink('provider_type=attorney')}>
          <span className="track" aria-hidden="true"><span /></span>
          Attorneys only
        </a>
        <a className="ys-landing-filter-switch" href={filterLink('delivery_days=3')}>
          <span className="track" aria-hidden="true"><span /></span>
          Delivery ≤ 3 days
        </a>
        <a className="ys-landing-all-results" href={filterLink('sort=relevance')}>All filters</a>
      </div>

      <style jsx global>{`
        .ys-landing-discovery-controls {
          display: flex;
          align-items: center;
          gap: 14px;
          margin: 0 0 30px;
          min-width: 0;
          font-family: ${DISCOVERY_FONT};
        }
        .ys-landing-filter-pills {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }
        .ys-landing-filter-popover-wrap { position: relative; flex: 0 0 auto; }
        .ys-landing-filter-pill {
          height: 46px;
          padding: 0 17px;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          border: 1px solid ${T.rule};
          border-radius: 10px;
          background: ${T.vellum};
          color: ${T.ink};
          font-family: ${DISCOVERY_FONT};
          font-size: 14px;
          font-weight: 650;
          white-space: nowrap;
          cursor: pointer;
          transition: border-color .15s ease, box-shadow .15s ease;
        }
        .ys-landing-filter-pill:hover,
        .ys-landing-filter-pill.is-open {
          border-color: ${T.inkMid};
          box-shadow: 0 2px 8px rgba(15,23,42,.06);
        }
        .ys-landing-filter-popover {
          position: absolute;
          top: calc(100% + 10px);
          left: 0;
          z-index: 170;
          width: 310px;
          max-width: min(92vw, 370px);
          max-height: 400px;
          overflow-y: auto;
          padding: 14px;
          border: 1px solid ${T.rule};
          border-radius: 14px;
          background: ${T.vellum};
          box-shadow: 0 20px 50px rgba(15,23,42,.14);
        }
        .ys-landing-filter-title {
          margin: 2px 4px 8px;
          color: ${T.inkSoft};
          font-size: 11px;
          font-weight: 750;
          letter-spacing: .08em;
          text-transform: uppercase;
        }
        .ys-landing-filter-list { display: flex; flex-direction: column; gap: 2px; }
        .ys-landing-filter-list a {
          min-height: 42px;
          padding: 0 9px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          border-radius: 8px;
          color: ${T.ink};
          font-size: 14px;
          font-weight: 520;
        }
        .ys-landing-filter-list a:hover { background: ${T.paper2}; }
        .ys-landing-filter-list .count { color: ${T.inkSoft}; font-size: 12px; }
        .ys-landing-filter-shortcuts {
          margin-left: auto;
          display: flex;
          align-items: center;
          gap: 15px;
          min-width: max-content;
        }
        .ys-landing-filter-switch {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: ${T.inkMid};
          font-size: 13px;
          font-weight: 600;
          white-space: nowrap;
        }
        .ys-landing-filter-switch .track {
          width: 32px;
          height: 19px;
          padding: 2px;
          display: inline-flex;
          align-items: center;
          justify-content: flex-start;
          border-radius: 999px;
          background: ${T.paper3};
        }
        .ys-landing-filter-switch .track span {
          width: 15px;
          height: 15px;
          border-radius: 50%;
          background: #fff;
          box-shadow: 0 1px 3px rgba(15,23,42,.22);
        }
        .ys-landing-filter-switch:hover .track { background: ${T.inkSoft}; }
        .ys-landing-all-results {
          min-height: 40px;
          padding: 0 4px;
          display: inline-flex;
          align-items: center;
          color: ${T.ink};
          font-size: 13px;
          font-weight: 700;
          border-bottom: 1px solid transparent;
        }
        .ys-landing-all-results:hover { border-bottom-color: ${T.ink}; }

        @media (max-width: 1180px) {
          .ys-landing-discovery-controls {
            overflow-x: auto;
            scrollbar-width: none;
            padding-bottom: 4px;
          }
          .ys-landing-discovery-controls::-webkit-scrollbar { display: none; }
          .ys-landing-filter-shortcuts { margin-left: 6px; }
        }
        @media (max-width: 700px) {
          .ys-landing-discovery-controls { margin-bottom: 24px; gap: 10px; }
          .ys-landing-filter-pill { height: 42px; padding: 0 14px; font-size: 13px; }
          .ys-landing-filter-shortcuts { display: none; }
        }
      `}</style>
    </div>
  )
}
