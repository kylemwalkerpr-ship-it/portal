'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { MarketplaceFooter } from '@/components/marketplace/MarketplaceFooter'
import { F } from '@/components/marketplace/tokens'
import {
  FILE_SHOP_PRODUCTS,
  type FileShopCategory,
  type FileShopProduct,
} from '@/lib/files-shop-catalog'
import {
  FILE_SHOP_BUYER_CATEGORIES,
  getFileShopBuyerCategory,
  type FileShopBuyerCategory,
} from '@/lib/files-shop-buyer-categories'

type FilterId = 'all' | FileShopBuyerCategory

/**
 * Shop palette — CSS custom-property references driven by the marketplace
 * palette picker. Fallbacks match Studio (light professional) so SSR / first
 * paint never floods mahogany or cream-on-cream.
 */
const V = {
  paper: 'var(--ys-paper, #F7F8FA)',
  paper2: 'var(--ys-paper2, #F1F3F5)',
  paper3: 'var(--ys-paper3, #E8EBEE)',
  vellum: 'var(--ys-vellum, #FFFFFF)',
  cream: 'var(--ys-cream, #F9FAFB)',
  ink: 'var(--ys-ink, #0F172A)',
  inkMid: 'var(--ys-inkMid, #334155)',
  inkSoft: 'var(--ys-inkSoft, #526072)',
  rule: 'var(--ys-rule, rgba(15,23,42,0.10))',
  teal: 'var(--ys-teal, #111827)',
  tealDeep: 'var(--ys-tealDeep, #030712)',
  gold: 'var(--ys-gold, #7A5000)',
  star: 'var(--ys-star, #7A5000)',
  cardRule: 'rgba(15,23,42,0.10)',
  cardRuleSoft: 'rgba(15,23,42,0.06)',
} as const

const DISPLAY = F.display.includes('fraunces') ? F.display : "var(--font-fraunces), 'Fraunces', Georgia, serif"
const UI = F.ui.includes('outfit') ? F.ui : "var(--font-outfit), 'Outfit', system-ui, sans-serif"
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'

// File format stays visible on the cover even though primary navigation is now
// buyer-intent based.
const CAT_TONE: Record<FileShopCategory, { wash: string; ink: string; label: string }> = {
  spreadsheet: { wash: '#C5E8E3', ink: '#06534D', label: 'Workbook' },
  guide: { wash: '#D2E6D4', ink: '#24502B', label: 'Guide' },
  template: { wash: '#F6D2C6', ink: '#7A2E14', label: 'Template' },
  craft: { wash: '#F6E4A8', ink: '#6B4E0A', label: 'Print' },
}

export default function FilesShop() {
  const [filter, setFilter] = useState<FilterId | null>('immigration')
  const [query, setQuery] = useState('')

  const publishedProducts = useMemo(() => FILE_SHOP_PRODUCTS.filter((p) => p.published), [])

  const categoryCounts = useMemo(() => {
    const counts = Object.fromEntries(
      FILE_SHOP_BUYER_CATEGORIES.map((category) => [category.id, 0]),
    ) as Record<FileShopBuyerCategory, number>

    for (const product of publishedProducts) {
      const category = getFileShopBuyerCategory(product.id)
      if (category) counts[category] += 1
    }
    return counts
  }, [publishedProducts])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()

    return publishedProducts.filter((product) => {
      const buyerCategory = getFileShopBuyerCategory(product.id)
      if (filter && filter !== 'all' && buyerCategory !== filter) return false
      if (!q) return filter !== null
      return `${product.title} ${product.desc} ${product.format} ${product.bullets.join(' ')}`
        .toLowerCase()
        .includes(q)
    })
  }, [filter, publishedProducts, query])

  const featured = publishedProducts.filter(
    (p) => p.id === 'consultant-toolkit' || p.id === 'ai-prompts-business',
  )

  const activeCategory =
    filter && filter !== 'all'
      ? FILE_SHOP_BUYER_CATEGORIES.find((category) => category.id === filter)
      : null
  const hasSearch = query.trim().length > 0
  const showResults = filter !== null || hasSearch

  return (
    <div className="ys-files-shop">
      <style>{SHOP_CSS}</style>

      <div className="ys-shop-bar">
        <div className="ys-shop-wrap">
          <span>⚡ Instant download</span>
          <span>🔒 Secure Payhip checkout</span>
          <span>♾️ Pay once — keep the file forever</span>
        </div>
      </div>

      <div className="ys-shop-hero">
        <div className="ys-shop-wrap">
          <nav className="ys-shop-crumbs" aria-label="Breadcrumb">
            <a href="https://yousafeconsultancy.com/">Home</a>
            <span aria-hidden="true">/</span>
            <Link href="/">Marketplace</Link>
            <span aria-hidden="true">/</span>
            <span>File shop</span>
          </nav>

          <div className="ys-shop-hero-grid">
            <div>
              <p className="ys-shop-kicker">The YouSafe file shop</p>
              <h1>Find the right file without digging through the whole catalog.</h1>
              <p className="ys-shop-lede">
                Start with what you need: immigration preparation, business, marketing, personal
                planning, career, or wedding and creative resources. File format stays clearly labelled
                on every product, and checkout remains securely on Payhip.
              </p>
              <div className="ys-shop-cta-row">
                <a className="ys-shop-btn primary" href="#catalog">Shop by category</a>
                <Link className="ys-shop-btn ghost" href="/">Back to marketplace</Link>
              </div>
            </div>
            <aside className="ys-shop-stats" aria-label="Shop facts">
              <Stat n={String(publishedProducts.length)} label="files in catalog" />
              <Stat n={String(FILE_SHOP_BUYER_CATEGORIES.length)} label="buyer-friendly categories" />
              <Stat n="0" label="subscriptions" />
              <Stat n="Payhip" label="secure checkout" />
            </aside>
          </div>
        </div>
      </div>

      <section className="ys-shop-featured" aria-labelledby="featured-heading">
        <div className="ys-shop-wrap">
          <div className="ys-shop-section-head">
            <p className="ys-shop-kicker">Popular downloads</p>
            <h2 id="featured-heading">A few practical starting points</h2>
          </div>
          <div className="ys-shop-featured-rail">
            {featured.map((p) => (
              <FeaturedCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      </section>

      <section className="ys-shop-catalog" id="catalog">
        <div className="ys-shop-wrap">
          <div className="ys-shop-section-head row">
            <div>
              <p className="ys-shop-kicker">Shop by category</p>
              <h2>What are you looking for?</h2>
              <p className="ys-shop-section-copy">
                Immigration Packs are open to get you started. Choose another category anytime, search the entire shop, or browse all files.
              </p>
            </div>
            <label className="ys-shop-search">
              <span className="sr-only">Search files</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search visa packs, planners, business tools…"
              />
            </label>
          </div>

          <div className="ys-shop-category-grid" aria-label="Shop categories">
            {FILE_SHOP_BUYER_CATEGORIES.map((category) => (
              <button
                key={category.id}
                type="button"
                aria-pressed={filter === category.id}
                className={filter === category.id ? 'on' : undefined}
                onClick={() => setFilter(category.id)}
              >
                <span className="ys-shop-category-count">{categoryCounts[category.id]} files</span>
                <strong>{category.label}</strong>
                <span className="ys-shop-category-description">{category.description}</span>
                <span className="ys-shop-category-action">Browse category →</span>
              </button>
            ))}
          </div>

          <div className="ys-shop-all-row">
            <button
              type="button"
              className={filter === 'all' ? 'ys-shop-all-files on' : 'ys-shop-all-files'}
              aria-pressed={filter === 'all'}
              onClick={() => setFilter('all')}
            >
              Browse all {publishedProducts.length} files
            </button>
            {(filter !== null || hasSearch) && (
              <button
                type="button"
                className="ys-shop-reset"
                onClick={() => {
                  setFilter(null)
                  setQuery('')
                }}
              >
                Back to categories
              </button>
            )}
          </div>

          {showResults ? (
            <div className="ys-shop-results" aria-live="polite">
              <div className="ys-shop-results-head">
                <div>
                  <p className="ys-shop-kicker">
                    {activeCategory?.label ?? (filter === 'all' ? 'All files' : 'Search results')}
                  </p>
                  <h3>
                    {activeCategory?.label ??
                      (filter === 'all' ? 'Every instant download' : `Results for “${query.trim()}”`)}
                  </h3>
                </div>
                <p className="ys-shop-count">
                  {visible.length} {visible.length === 1 ? 'file' : 'files'}
                </p>
              </div>

              {visible.length === 0 ? (
                <div className="ys-shop-empty">
                  <p>No files match that search in the selected category.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('')
                      setFilter(null)
                    }}
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                <div className="ys-shop-grid">
                  {visible.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="ys-shop-category-prompt">
              <strong>Start with a category above.</strong>
              <span>You will only see the products relevant to that need.</span>
            </div>
          )}
        </div>
      </section>

      <section className="ys-shop-trust" aria-labelledby="trust-heading">
        <div className="ys-shop-wrap">
          <p className="ys-shop-kicker">How it works</p>
          <h2 id="trust-heading">Buy on Payhip, keep the file.</h2>
          <div className="ys-shop-trust-grid">
            <article>
              <span>01</span>
              <h3>Choose the right category</h3>
              <p>Start with your goal instead of sorting through unrelated formats and products.</p>
            </article>
            <article>
              <span>02</span>
              <h3>Review the exact file</h3>
              <p>Format and what the download includes are shown before you leave for checkout.</p>
            </article>
            <article>
              <span>03</span>
              <h3>Checkout on Payhip</h3>
              <p>Complete secure checkout and receive the purchased file through Payhip.</p>
            </article>
          </div>
          <p className="ys-shop-return">
            Need a consultant or attorney instead?{' '}
            <Link href="/">Return to the marketplace</Link>
            {' · '}
            <a href="https://portal.yousafeconsultancy.com/dashboard">Open your dashboard</a>
            {' · '}
            <a href="https://yousafeconsultancy.com/">YouSafe home</a>
          </p>
        </div>
      </section>

      <MarketplaceFooter />
    </div>
  )
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div className="ys-shop-stat">
      <strong>{n}</strong>
      <span>{label}</span>
    </div>
  )
}

function Cover({ product, large }: { product: FileShopProduct; large?: boolean }) {
  const tone = CAT_TONE[product.cat]
  return (
    <div className={`ys-shop-cover${large ? ' large' : ''}`}>
      <img src={product.cover} alt="" width={1200} height={1600} />
      <span className="ys-shop-cover-cat" style={{ background: tone.wash, color: tone.ink }}>{tone.label}</span>
      {product.stamp ? (
        <span className="ys-shop-cover-stamp">{product.stamp.replace(/\n/g, ' ')}</span>
      ) : null}
      <span className="ys-shop-cover-price">${product.price}</span>
    </div>
  )
}

function ProductCard({ product: p }: { product: FileShopProduct }) {
  return (
    <article className="ys-shop-card">
      <a className="ys-shop-card-media" href={p.href} rel="noopener noreferrer">
        <Cover product={p} />
      </a>
      <div className="ys-shop-card-body">
        <h3>{p.title}</h3>
        <p>{p.desc}</p>
        <div className="ys-shop-card-foot">
          <span className="ys-shop-format">{p.format}</span>
          <a className="ys-shop-buy" href={p.href} rel="noopener noreferrer">
            Get file
          </a>
        </div>
      </div>
    </article>
  )
}

function FeaturedCard({ product: p }: { product: FileShopProduct }) {
  return (
    <article className="ys-shop-featured-card">
      <a className="ys-shop-card-media" href={p.href} rel="noopener noreferrer">
        <Cover product={p} large />
      </a>
      <div className="ys-shop-card-body">
        <span className="ys-shop-badge">Popular</span>
        <h3>{p.title}</h3>
        <p>{p.desc}</p>
        <a className="ys-shop-buy always" href={p.href} rel="noopener noreferrer">
          Get file
        </a>
      </div>
    </article>
  )
}

const SHOP_CSS = `
  .ys-files-shop {
    background: ${V.paper};
    color: ${V.ink};
    font-family: ${UI};
    font-weight: 500;
  }
  .ys-shop-wrap { width: min(1180px, calc(100vw - 40px)); margin: 0 auto; }
  .ys-shop-kicker {
    font-family: ${UI}; font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase;
    color: ${V.teal}; font-weight: 800; margin: 0 0 10px;
  }
  .ys-shop-crumbs {
    display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
    font-size: 13px; font-weight: 500; color: ${V.inkMid}; margin-bottom: 28px;
  }
  .ys-shop-crumbs a { color: ${V.ink}; text-decoration: none; transition: color .2s ${EASE}, opacity .2s ${EASE}; }
  .ys-shop-crumbs a:hover { color: ${V.teal}; }

  .ys-shop-bar {
    background: ${V.paper2};
    border-bottom: 1px solid ${V.rule};
  }
  .ys-shop-bar .ys-shop-wrap {
    display: flex; flex-wrap: wrap; gap: 8px 24px; align-items: center;
    padding: 9px 0; font-size: 12px; font-weight: 600; letter-spacing: 0.01em; color: ${V.inkMid};
  }
  .ys-shop-bar span { opacity: 0.9; white-space: nowrap; }

  .ys-shop-hero {
    padding: 44px 0 56px;
    background: radial-gradient(120% 160% at 85% -10%, ${V.paper3} 0%, ${V.paper} 55%);
    border-bottom: 1px solid ${V.rule};
  }
  .ys-shop-hero-grid { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(240px, 0.65fr); gap: 40px; align-items: center; }
  .ys-shop-hero h1 {
    font-family: ${DISPLAY}; font-weight: 800; font-size: clamp(36px, 5vw, 58px);
    line-height: 1.06; letter-spacing: -0.03em; margin: 0 0 16px; max-width: 17ch; color: ${V.ink};
  }
  .ys-shop-lede { font-size: 16px; line-height: 1.6; color: ${V.inkMid}; max-width: 58ch; margin: 0 0 28px; font-weight: 500; }
  .ys-shop-cta-row { display: flex; flex-wrap: wrap; gap: 10px; }
  .ys-shop-btn {
    display: inline-flex; align-items: center; justify-content: center;
    padding: 12px 22px; border-radius: 999px; font-size: 14px; font-weight: 700;
    text-decoration: none; font-family: ${UI};
    transition: background .2s ${EASE}, border-color .2s ${EASE}, transform .2s ${EASE}, color .2s ${EASE};
  }
  .ys-shop-btn.primary { background: ${V.teal}; color: #fff; }
  .ys-shop-btn.primary:hover { background: ${V.tealDeep}; transform: translateY(-1px); }
  .ys-shop-btn.ghost { background: transparent; color: ${V.ink}; border: 1px solid ${V.rule}; }
  .ys-shop-btn.ghost:hover { border-color: ${V.ink}; }

  .ys-shop-stats {
    display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: ${V.cardRule};
    border: 1px solid ${V.cardRule}; border-radius: 16px; overflow: hidden;
    box-shadow: 0 18px 40px -24px rgba(15,23,42,0.18);
  }
  .ys-shop-stat { background: ${V.vellum}; padding: 20px 18px; }
  .ys-shop-stat strong { display: block; font-family: ${DISPLAY}; font-size: 24px; font-weight: 800; color: ${V.ink}; letter-spacing: -0.02em; }
  .ys-shop-stat span { font-size: 12px; color: ${V.inkSoft}; font-weight: 600; }

  .ys-shop-featured { padding: 52px 0 12px; background: ${V.paper}; }
  .ys-shop-section-head { margin-bottom: 22px; }
  .ys-shop-section-head h2, .ys-shop-trust h2, .ys-shop-catalog h2 {
    font-family: ${DISPLAY}; font-size: 32px; font-weight: 800; letter-spacing: -0.03em; margin: 0; color: ${V.ink};
  }
  .ys-shop-section-head.row { display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; flex-wrap: wrap; }
  .ys-shop-section-copy { margin: 8px 0 0; color: ${V.inkMid}; font-size: 14px; line-height: 1.55; max-width: 62ch; font-weight: 500; }
  .ys-shop-featured-rail {
    display: flex; gap: 18px; overflow-x: auto; scroll-snap-type: x mandatory;
    scroll-padding-inline: 4px; padding-bottom: 10px; -webkit-overflow-scrolling: touch; scrollbar-width: none;
  }
  .ys-shop-featured-rail::-webkit-scrollbar { display: none; }
  .ys-shop-featured-card {
    flex: 0 0 min(540px, calc(100% - 12px)); min-width: 280px; scroll-snap-align: start;
    background: ${V.vellum}; border: 1px solid ${V.cardRule}; border-radius: 18px; overflow: hidden;
    display: flex; flex-direction: column;
    transition: box-shadow .2s ${EASE}, transform .2s ${EASE}, border-color .2s ${EASE};
  }

  .ys-shop-card {
    background: ${V.vellum}; border: 1px solid ${V.cardRule}; border-radius: 18px; overflow: hidden;
    display: flex; flex-direction: column; min-height: 100%;
    transition: box-shadow .2s ${EASE}, transform .2s ${EASE}, border-color .2s ${EASE};
  }
  .ys-shop-featured-card:hover, .ys-shop-card:hover {
    transform: translateY(-5px); border-color: transparent;
    box-shadow: 0 18px 40px -24px rgba(15,23,42,0.14);
  }
  .ys-shop-card-media { display: block; color: inherit; text-decoration: none; }
  .ys-shop-cover { position: relative; padding: 0; aspect-ratio: 4 / 5; overflow: hidden; background: ${V.paper2}; }
  .ys-shop-cover.large { aspect-ratio: 16 / 10; }
  .ys-shop-cover img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .45s ${EASE}; }
  .ys-shop-featured-card:hover .ys-shop-cover img, .ys-shop-card:hover .ys-shop-cover img { transform: scale(1.04); }
  .ys-shop-cover::after {
    content: ""; position: absolute; inset: auto 0 0; height: 46%;
    background: linear-gradient(180deg, transparent 0%, rgba(10,8,6,0.42) 100%); pointer-events: none;
  }
  .ys-shop-cover-cat, .ys-shop-cover-stamp {
    position: absolute; top: 12px; z-index: 1; font-family: ${UI}; font-size: 10px;
    letter-spacing: 0.12em; text-transform: uppercase; font-weight: 800; padding: 5px 9px; border-radius: 999px;
  }
  .ys-shop-cover-cat { left: 12px; }
  .ys-shop-cover-stamp { right: 12px; background: ${V.teal}; color: #fff; }
  .ys-shop-cover-price {
    position: absolute; right: 12px; bottom: 12px; z-index: 1; font-family: ${UI}; font-size: 14px;
    font-weight: 800; letter-spacing: -0.02em; color: ${V.ink}; background: ${V.vellum};
    padding: 6px 12px; border-radius: 999px; box-shadow: 0 8px 20px -12px rgba(0,0,0,0.6);
  }
  .ys-shop-card-body { padding: 16px; display: flex; flex-direction: column; flex: 1; }
  .ys-shop-featured-card .ys-shop-card-body { padding: 18px 20px 20px; }
  .ys-shop-badge {
    align-self: flex-start; font-family: ${UI}; font-size: 10px; letter-spacing: 0.12em;
    text-transform: uppercase; font-weight: 800; color: ${V.tealDeep}; background: ${V.cardRuleSoft};
    border: 1px solid ${V.cardRule}; padding: 4px 9px; border-radius: 999px; margin-bottom: 8px;
  }
  .ys-shop-card-body h3 {
    font-family: ${UI}; font-size: 16px; font-weight: 700; line-height: 1.3; margin: 0 0 6px; color: ${V.ink};
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .ys-shop-featured-card .ys-shop-card-body h3 { font-size: 21px; font-weight: 800; }
  .ys-shop-card-body p {
    font-family: ${UI}; font-size: 14px; line-height: 1.5; color: ${V.ink}; margin: 0 0 12px; font-weight: 600;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .ys-shop-featured-card .ys-shop-card-body p { font-size: 14px; -webkit-line-clamp: 2; margin-bottom: 14px; }
  .ys-shop-card-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: auto; min-height: 36px; }
  .ys-shop-format { font-size: 12px; color: ${V.inkSoft}; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ys-shop-buy {
    font-size: 13px; font-weight: 800; color: #fff; background: ${V.teal}; font-family: ${UI};
    padding: 8px 15px; border-radius: 999px; text-decoration: none; white-space: nowrap;
    transition: background .2s ${EASE}, transform .2s ${EASE};
  }
  .ys-shop-buy:hover { background: ${V.tealDeep}; transform: translateY(-1px); }

  .ys-shop-catalog { padding: 28px 0 68px; background: ${V.paper}; }
  .ys-shop-search { width: min(360px, 100%); }
  .ys-shop-search input {
    width: 100%; border: 1px solid ${V.cardRule}; background: ${V.vellum}; border-radius: 999px;
    padding: 11px 16px; font-size: 14px; font-family: ${UI}; color: ${V.ink}; font-weight: 500;
    transition: border-color .2s ${EASE}, box-shadow .2s ${EASE}; box-sizing: border-box;
  }
  .ys-shop-search input::placeholder { color: ${V.inkSoft}; }
  .ys-shop-search input:focus { outline: none; border-color: ${V.teal}; box-shadow: 0 0 0 3px rgba(57,72,200,0.18); }

  .ys-shop-category-grid {
    display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 8px 0 14px;
  }
  .ys-shop-category-grid button {
    appearance: none; text-align: left; border: 1px solid ${V.cardRule}; border-radius: 16px;
    background: ${V.vellum};
    background: linear-gradient(
      145deg,
      color-mix(in srgb, ${V.vellum} 84%, transparent),
      color-mix(in srgb, ${V.paper2} 64%, transparent)
    );
    color: ${V.ink}; padding: 18px; min-height: 164px; cursor: pointer;
    display: flex; flex-direction: column; align-items: flex-start; font-family: ${UI};
    backdrop-filter: blur(14px) saturate(120%);
    -webkit-backdrop-filter: blur(14px) saturate(120%);
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, ${V.vellum} 78%, transparent),
      0 12px 32px -28px rgba(15,23,42,.28);
    transition: transform .2s ${EASE}, border-color .2s ${EASE}, box-shadow .2s ${EASE}, background .2s ${EASE};
  }
  .ys-shop-category-grid button:hover {
    transform: translateY(-2px);
    border-color: color-mix(in srgb, ${V.ink} 24%, transparent);
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, ${V.vellum} 84%, transparent),
      0 16px 34px -26px rgba(15,23,42,.34);
  }
  .ys-shop-category-grid button.on {
    border-color: color-mix(in srgb, ${V.teal} 62%, transparent);
    background: ${V.paper2};
    background: linear-gradient(
      145deg,
      color-mix(in srgb, ${V.vellum} 90%, transparent),
      color-mix(in srgb, ${V.paper2} 76%, transparent)
    );
    box-shadow:
      inset 0 0 0 1px color-mix(in srgb, ${V.teal} 24%, transparent),
      inset 0 1px 0 color-mix(in srgb, ${V.vellum} 88%, transparent),
      0 16px 36px -28px rgba(15,23,42,.36);
  }
  .ys-shop-category-count { font-size: 11px; text-transform: uppercase; letter-spacing: .1em; color: ${V.inkSoft}; font-weight: 800; }
  .ys-shop-category-grid strong { font-family: ${DISPLAY}; font-size: 20px; line-height: 1.15; margin: 10px 0 7px; letter-spacing: -.02em; }
  .ys-shop-category-description { font-size: 13px; line-height: 1.45; color: ${V.inkMid}; font-weight: 500; }
  .ys-shop-category-action { margin-top: auto; padding-top: 12px; font-size: 12px; color: ${V.teal}; font-weight: 800; }
  .ys-shop-all-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 0 0 24px; }
  .ys-shop-all-files, .ys-shop-reset {
    border-radius: 999px; padding: 9px 15px; font-family: ${UI}; font-size: 13px; font-weight: 750; cursor: pointer;
  }
  .ys-shop-all-files { border: 1px solid ${V.rule}; background: ${V.vellum}; color: ${V.ink}; }
  .ys-shop-all-files:hover, .ys-shop-all-files.on { border-color: ${V.teal}; background: ${V.teal}; color: #fff; }
  .ys-shop-reset { border: 0; background: transparent; color: ${V.inkMid}; text-decoration: underline; text-underline-offset: 3px; }
  .ys-shop-category-prompt {
    border: 1px dashed ${V.cardRule}; background: ${V.vellum}; border-radius: 16px; padding: 20px;
    display: flex; flex-direction: column; gap: 4px; color: ${V.inkMid}; font-size: 14px;
  }
  .ys-shop-category-prompt strong { color: ${V.ink}; }
  .ys-shop-results { margin-top: 8px; }
  .ys-shop-results-head { display: flex; align-items: end; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
  .ys-shop-results-head h3 { font-family: ${DISPLAY}; font-size: 26px; margin: 0; letter-spacing: -.025em; }
  .ys-shop-count { font-size: 13px; color: ${V.inkSoft}; margin: 0; font-weight: 600; white-space: nowrap; }
  .ys-shop-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
  .ys-shop-empty { background: ${V.vellum}; border: 1px dashed ${V.cardRule}; border-radius: 18px; padding: 40px; text-align: center; color: ${V.inkSoft}; }
  .ys-shop-empty button {
    margin-top: 12px; border: 0; background: ${V.teal}; color: #fff; border-radius: 999px;
    padding: 9px 16px; cursor: pointer; font-family: ${UI}; font-weight: 700;
  }

  .ys-shop-trust { padding: 12px 0 60px; background: ${V.paper}; border-top: 1px solid ${V.rule}; }
  .ys-shop-trust-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin: 22px 0 28px; }
  .ys-shop-trust article { background: ${V.vellum}; border: 1px solid ${V.cardRule}; border-radius: 18px; padding: 20px 20px 18px; }
  .ys-shop-trust article span { font-family: ${UI}; font-size: 24px; font-weight: 800; letter-spacing: -0.04em; color: ${V.teal}; display: block; line-height: 1; }
  .ys-shop-trust article h3 { font-family: ${UI}; font-size: 16px; font-weight: 800; margin: 10px 0 6px; color: ${V.ink}; }
  .ys-shop-trust article p { margin: 0; color: ${V.inkMid}; font-size: 13px; line-height: 1.5; font-weight: 500; }
  .ys-shop-return { font-size: 14px; color: ${V.inkMid}; font-weight: 500; }
  .ys-shop-return a { color: ${V.teal}; font-weight: 700; text-decoration: none; }
  .ys-shop-return a:hover { text-decoration: underline; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); border: 0; }

  @media (max-width: 1100px) {
    .ys-shop-grid { grid-template-columns: repeat(2, 1fr); }
    .ys-shop-category-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (max-width: 920px) {
    .ys-shop-hero-grid, .ys-shop-trust-grid { grid-template-columns: 1fr; }
    .ys-shop-featured-card { flex-basis: min(420px, 82vw); }
  }
  @media (max-width: 600px) {
    .ys-shop-grid, .ys-shop-category-grid { grid-template-columns: 1fr; }
    .ys-shop-category-grid button { min-height: 138px; }
    .ys-shop-hero { padding: 28px 0 36px; }
    .ys-shop-hero h1 { max-width: none; }
    .ys-shop-wrap { width: min(1180px, calc(100vw - 28px)); }
    .ys-shop-results-head { align-items: flex-start; flex-direction: column; gap: 4px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .ys-shop-card, .ys-shop-featured-card, .ys-shop-buy, .ys-shop-cover img, .ys-shop-btn, .ys-shop-category-grid button {
      transition: none;
    }
    .ys-shop-featured-card:hover, .ys-shop-card:hover, .ys-shop-category-grid button:hover { transform: none; }
    .ys-shop-featured-card:hover .ys-shop-cover img, .ys-shop-card:hover .ys-shop-cover img { transform: none; }
  }
`
