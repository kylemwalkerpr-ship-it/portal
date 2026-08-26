'use client'

/**
 * ContinueBrowsingRail — "pick up where you left off."
 *
 * Renders the visitor's recently-viewed gigs (already collected by
 * GigDetailPage into localStorage under ys_marketplace_recent_gigs) as a
 * horizontal scroll rail above the browse grid. Zero network, zero Worker
 * cost — pure localStorage read. Hidden while searching/filtering so it
 * never competes with an active hunt, and hidden entirely for first-time
 * visitors.
 */
import React from 'react'
import { GigCard } from './MarketplaceHero'
import { T, F } from '@/components/marketplace/tokens'

const RECENT_GIGS_KEY = 'ys_marketplace_recent_gigs'

export function ContinueBrowsingRail({ hidden = false }: { hidden?: boolean }) {
  const [gigs, setGigs] = React.useState<any[]>([])

  React.useEffect(() => {
    try {
      const raw = JSON.parse(window.localStorage.getItem(RECENT_GIGS_KEY) || '[]')
      if (Array.isArray(raw)) setGigs(raw.filter((g) => g && g.id && g.slug && g.title).slice(0, 8))
    } catch { /* corrupt storage — show nothing */ }
  }, [])

  const clear = () => {
    setGigs([])
    try { window.localStorage.removeItem(RECENT_GIGS_KEY) } catch {}
  }

  if (hidden || gigs.length === 0) return null

  return (
    <section aria-label="Continue browsing" style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
        <h2 style={{ fontFamily: F.display, fontSize: 20, fontWeight: 600, color: '#FFFFFF', margin: 0, letterSpacing: '-0.01em' }}>
          Continue browsing
        </h2>
        <button
          type="button"
          onClick={clear}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: F.ui, fontSize: 11.5, fontWeight: 600, color: 'rgba(255,255,255,0.6)', padding: 0 }}
        >
          Clear history
        </button>
      </div>
      <div
        style={{
          display: 'grid',
          gridAutoFlow: 'column',
          gridAutoColumns: 'minmax(240px, 260px)',
          gap: 14,
          overflowX: 'auto',
          paddingBottom: 8,
          scrollSnapType: 'x proximity',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {gigs.map((gig) => (
          <div key={gig.id} style={{ scrollSnapAlign: 'start' }}>
            <GigCard gig={gig} />
          </div>
        ))}
      </div>
    </section>
  )
}
