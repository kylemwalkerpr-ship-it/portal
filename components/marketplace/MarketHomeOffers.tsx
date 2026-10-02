import type { CategoryTile, MostRequestedCard } from '@/lib/marketHomeMostRequested'

/**
 * Market home "Most requested" rail + category tiles.
 *
 * Server component with no client state: it renders static markup into the
 * build-static landing document (no hydration work, no per-request compute).
 * Data comes from lib/marketHomeMostRequested.ts, resolved at build time.
 */
export function MostRequestedRail({ cards }: { cards: MostRequestedCard[] }) {
  if (cards.length === 0) return null
  return (
    <section className="cw-most-requested" aria-labelledby="most-requested-heading" data-most-requested={cards.length}>
      <div className="wrap">
        <div className="cw-mr-head">
          <h2 id="most-requested-heading">Most requested</h2>
          <a href="/gigs">Browse all services →</a>
        </div>
        <ul className="cw-mr-grid">
          {cards.map((card) => (
            <li key={card.key}>
              <a className={`cw-mr-card is-${card.kind}`} href={card.href} data-mr-card={card.key}>
                <span className="cw-mr-kicker">{card.kicker}</span>
                <span className="cw-mr-title">{card.title}</span>
                <span className="cw-mr-outcome">{card.outcome}</span>
                <span className="cw-mr-meta">
                  <b>{card.priceLabel}</b>
                  <span>{card.deliveryLabel}</span>
                  {card.rushLabel ? <span className="cw-mr-rush">{card.rushLabel}</span> : null}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export function MarketHomeCategoryTiles({ tiles }: { tiles: readonly CategoryTile[] }) {
  return (
    <nav className="cw-home-tiles" aria-label="Popular categories">
      <div className="wrap cw-home-tiles-grid">
        {tiles.map((tile) => (
          <a key={tile.id} className="cw-home-tile" href={tile.href} data-home-tile={tile.id}>
            <span className="cw-home-tile-label">{tile.label}</span>
            <span className="cw-home-tile-blurb">{tile.blurb}</span>
          </a>
        ))}
      </div>
    </nav>
  )
}
