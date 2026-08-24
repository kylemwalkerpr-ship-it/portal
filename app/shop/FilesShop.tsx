'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { MarketplaceFooter } from '@/components/marketplace/MarketplaceFooter'
import { T, F } from '@/components/marketplace/tokens'
import { FILE_SHOP_FILTERS, FILE_SHOP_PRODUCTS, type FileShopCategory, type FileShopProduct } from '@/lib/files-shop-catalog'

type FilterId = 'all' | FileShopCategory

/** Shop palette — hardcoded so indigo never shows if tokens.ts still lags. */
const C = {
  ...T,
  paper: '#F6F1E8',
  paper2: '#EDE6D9',
  vellum: '#FFFCF7',
  ink: '#1A1714',
  inkMid: '#4A433C',
  inkSoft: '#7A7268',
  rule: '#E4D9CB',
  teal: '#0E7C74',
  tealDeep: '#085E58',
  gold: '#E8B931',
  terracotta: '#D4532A',
  moss: '#3F6B4A',
} as const

const DISPLAY = F.display.includes('fraunces') ? F.display : "var(--font-fraunces), 'Fraunces', Georgia, serif"
const UI = F.ui.includes('outfit') ? F.ui : "var(--font-outfit), 'Outfit', system-ui, sans-serif"
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'

const CAT_TONE: Record<FileShopCategory, { wash: string; ink: string; label: string }> = {
  spreadsheet: { wash: '#C5E8E3', ink: C.tealDeep, label: 'Workbook' },
  guide: { wash: '#D2E6D4', ink: C.moss, label: 'Guide' },
  template: { wash: '#F6D2C6', ink: C.terracotta, label: 'Template' },
  craft: { wash: '#F6E4A8', ink: '#7A5A10', label: 'Print' },
}

export default function FilesShop() {
  const [filter, setFilter] = useState<FilterId>('all')
  const [query, setQuery] = useState('')

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return FILE_SHOP_PRODUCTS.filter((p) => {
      if (filter !== 'all' && p.cat !== filter) return false
      if (!q) return true
      return `${p.title} ${p.desc} ${p.format} ${p.bullets.join(' ')}`.toLowerCase().includes(q)
    })
  }, [filter, query])

  const featured = FILE_SHOP_PRODUCTS.filter((p) => p.id === 'consultant-toolkit' || p.id === 'ai-prompts-business')

  return (
    <div className="ys-files-shop">
      <style>{SHOP_CSS}</style>

      <div className="ys-shop-hero">
        <div className="ys-shop-wrap">
          <nav className="ys-shop-crumbs" aria-label="Breadcrumb">
            <a href="https://yousafeconsultancy.com/">Home</a>
            <span aria-hidden="true">/</span>
            <Link href="/marketplace">Marketplace</Link>
            <span aria-hidden="true">/</span>
            <span>File shop</span>
          </nav>

          <div className="ys-shop-hero-grid">
            <div>
              <p className="ys-shop-kicker">Instant download · Pay once</p>
              <h1>Tools you can open today and run the business with.</h1>
              <p className="ys-shop-lede">
                Spreadsheets, templates, and short guides for consultants, operators, and families.
                Checkout is on Payhip. Your file arrives in the same session — no subscription, no
                waiting on fulfilment.
              </p>
              <div className="ys-shop-cta-row">
                <a className="ys-shop-btn primary" href="#catalog">Browse the catalog</a>
                <Link className="ys-shop-btn ghost" href="/marketplace">Back to marketplace</Link>
              </div>
            </div>
            <aside className="ys-shop-stats" aria-label="Shop facts">
              <Stat n={String(FILE_SHOP_PRODUCTS.length)} label="files in catalog" />
              <Stat n="$7–16" label="one-time USD price" />
              <Stat n="0" label="subscriptions" />
              <Stat n="Payhip" label="secure checkout" />
            </aside>
          </div>
        </div>
      </div>

      <section className="ys-shop-featured" aria-labelledby="featured-heading">
        <div className="ys-shop-wrap">
          <div className="ys-shop-section-head">
            <p className="ys-shop-kicker">Start here</p>
            <h2 id="featured-heading">Most used this week</h2>
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
              <p className="ys-shop-kicker">Full catalog</p>
              <h2>Every file, ready to download</h2>
            </div>
            <label className="ys-shop-search">
              <span className="sr-only">Search files</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search workbooks, resumes, planners…"
              />
            </label>
          </div>

          <div className="ys-shop-filters" role="tablist" aria-label="File type">
            {FILE_SHOP_FILTERS.map((pill) => (
              <button
                key={pill.id}
                type="button"
                role="tab"
                aria-selected={filter === pill.id}
                className={filter === pill.id ? 'on' : undefined}
                onClick={() => setFilter(pill.id)}
              >
                {pill.label}
              </button>
            ))}
          </div>

          <p className="ys-shop-count">
            {visible.length} {visible.length === 1 ? 'file' : 'files'}
            {filter !== 'all' ? ` in ${FILE_SHOP_FILTERS.find((f) => f.id === filter)?.label}` : ''}
          </p>

          {visible.length === 0 ? (
            <div className="ys-shop-empty">
              <p>No files match that search. Try a category instead.</p>
              <button type="button" onClick={() => { setQuery(''); setFilter('all') }}>Clear filters</button>
            </div>
          ) : (
            <div className="ys-shop-grid">
              {visible.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
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
              <h3>Pick a file</h3>
              <p>Format, page count, and what it does — named on the listing. No unlock-the-rest upsells.</p>
            </article>
            <article>
              <span>02</span>
              <h3>Checkout on Payhip</h3>
              <p>Card and PayPal on a PCI-certified cart. YouSafe never stores your card on this page.</p>
            </article>
            <article>
              <span>03</span>
              <h3>Download immediately</h3>
              <p>The receipt email carries the file. Open it the same day — Excel, Sheets, Word, PowerPoint, or PDF.</p>
            </article>
          </div>
          <p className="ys-shop-return">
            Need a consultant or attorney instead?{' '}
            <Link href="/marketplace">Return to the marketplace</Link>
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
    background: ${C.paper};
    color: ${C.ink};
    font-family: ${UI};
    font-weight: 500;
  }
  .ys-shop-wrap { width: min(1180px, calc(100vw - 40px)); margin: 0 auto; }
  .ys-shop-kicker {
    font-family: ${UI}; font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase;
    color: ${C.teal}; font-weight: 700; margin: 0 0 10px;
  }
  .ys-shop-crumbs {
    display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
    font-size: 13px; font-weight: 500; color: ${C.inkSoft}; margin-bottom: 28px;
  }
  .ys-shop-crumbs a { color: ${C.inkMid}; text-decoration: none; transition: color .2s ${EASE}; }
  .ys-shop-crumbs a:hover { color: ${C.teal}; }
  .ys-shop-hero {
    padding: 36px 0 48px; border-bottom: 1px solid ${C.rule};
    background: #fff;
  }
  .ys-shop-hero-grid { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(240px, 0.65fr); gap: 40px; align-items: end; }
  .ys-shop-hero h1 {
    font-family: ${DISPLAY}; font-weight: 800; font-size: clamp(34px, 4.8vw, 56px);
    line-height: 1.08; letter-spacing: -0.03em; margin: 0 0 16px; max-width: 16ch; color: ${C.ink};
  }
  .ys-shop-lede { font-size: 16px; line-height: 1.6; color: ${C.inkMid}; max-width: 54ch; margin: 0 0 28px; font-weight: 500; }
  .ys-shop-cta-row { display: flex; flex-wrap: wrap; gap: 10px; }
  .ys-shop-btn {
    display: inline-flex; align-items: center; justify-content: center;
    padding: 12px 20px; border-radius: 999px; font-size: 14px; font-weight: 700;
    text-decoration: none; font-family: ${UI};
    transition: background .2s ${EASE}, border-color .2s ${EASE}, transform .2s ${EASE}, color .2s ${EASE};
  }
  .ys-shop-btn.primary { background: ${C.teal}; color: #fff; }
  .ys-shop-btn.primary:hover { background: ${C.tealDeep}; transform: translateY(-1px); }
  .ys-shop-btn.ghost { background: ${C.vellum}; color: ${C.ink}; border: 1px solid ${C.rule}; }
  .ys-shop-btn.ghost:hover { border-color: ${C.teal}; color: ${C.tealDeep}; }
  .ys-shop-stats {
    display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: ${C.rule};
    border: 1px solid ${C.rule}; border-top: 3px solid ${C.gold}; border-radius: 16px; overflow: hidden;
    box-shadow: 0 18px 40px -28px rgba(17,20,24,0.35);
  }
  .ys-shop-stat { background: ${C.vellum}; padding: 18px 16px; }
  .ys-shop-stat strong { display: block; font-family: ${DISPLAY}; font-size: 22px; font-weight: 800; color: ${C.ink}; letter-spacing: -0.02em; }
  .ys-shop-stat span { font-size: 12px; color: ${C.inkSoft}; font-weight: 500; }
  .ys-shop-featured { padding: 48px 0 12px; background: ${C.paper2}; }
  .ys-shop-section-head { margin-bottom: 22px; }
  .ys-shop-section-head h2, .ys-shop-trust h2, .ys-shop-catalog h2 {
    font-family: ${DISPLAY}; font-size: 30px; font-weight: 800; letter-spacing: -0.03em; margin: 0; color: ${C.ink};
  }
  .ys-shop-section-head.row { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
  .ys-shop-featured-rail {
    display: flex; gap: 18px; overflow-x: auto; scroll-snap-type: x mandatory;
    scroll-padding-inline: 4px; padding-bottom: 10px; -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  .ys-shop-featured-rail::-webkit-scrollbar { display: none; }
  .ys-shop-featured-card {
    flex: 0 0 min(520px, calc(100% - 12px)); min-width: 280px; scroll-snap-align: start;
    background: ${C.vellum}; border: 1px solid ${C.rule}; border-radius: 16px; overflow: hidden;
    display: flex; flex-direction: column;
    transition: box-shadow .2s ${EASE}, transform .2s ${EASE}, border-color .2s ${EASE};
  }
  .ys-shop-card {
    background: ${C.vellum}; border: 1px solid ${C.rule}; border-radius: 16px; overflow: hidden;
    display: flex; flex-direction: column; min-height: 100%;
    transition: box-shadow .2s ${EASE}, transform .2s ${EASE}, border-color .2s ${EASE};
  }
  .ys-shop-featured-card:hover, .ys-shop-card:hover {
    transform: translateY(-5px); border-color: transparent;
    box-shadow: 0 22px 44px rgba(15,18,24,0.14);
  }
  .ys-shop-card-media { display: block; color: inherit; text-decoration: none; }
  .ys-shop-cover {
    position: relative; padding: 0; aspect-ratio: 4 / 5; overflow: hidden; background: ${C.paper2};
  }
  .ys-shop-cover.large { aspect-ratio: 16 / 10; }
  .ys-shop-cover img {
    width: 100%; height: 100%; object-fit: cover; display: block;
    transition: transform .45s ${EASE};
  }
  .ys-shop-featured-card:hover .ys-shop-cover img, .ys-shop-card:hover .ys-shop-cover img { transform: scale(1.04); }
  .ys-shop-cover::after {
    content: ""; position: absolute; inset: auto 0 0; height: 42%;
    background: linear-gradient(180deg, transparent 0%, rgba(17,20,24,0.38) 100%);
    pointer-events: none;
  }
  .ys-shop-cover-cat {
    position: absolute; left: 12px; top: 12px; z-index: 1;
    font-family: ${UI}; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 800;
    padding: 5px 9px; border-radius: 999px;
  }
  .ys-shop-cover-price {
    position: absolute; right: 12px; bottom: 12px; z-index: 1;
    font-family: ${UI}; font-size: 14px; font-weight: 800; letter-spacing: -0.02em;
    color: ${C.ink}; background: ${C.vellum}; padding: 6px 11px; border-radius: 999px;
    box-shadow: 0 8px 20px -12px rgba(17,20,24,0.5);
  }
  .ys-shop-card-body { padding: 14px 14px 14px; display: flex; flex-direction: column; flex: 1; }
  .ys-shop-featured-card .ys-shop-card-body { padding: 16px 18px 18px; }
  .ys-shop-card-body h3 {
    font-family: ${UI}; font-size: 16px; font-weight: 700; line-height: 1.3; margin: 0 0 6px; color: ${C.ink};
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .ys-shop-featured-card .ys-shop-card-body h3 { font-size: 20px; font-weight: 800; }
  .ys-shop-card-body p {
    font-size: 13px; line-height: 1.45; color: ${C.inkMid}; margin: 0 0 12px; font-weight: 500;
    display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden;
  }
  .ys-shop-featured-card .ys-shop-card-body p { font-size: 14px; -webkit-line-clamp: 2; margin-bottom: 14px; }
  .ys-shop-card-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: auto; min-height: 36px; }
  .ys-shop-format { font-size: 12px; color: ${C.inkSoft}; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ys-shop-buy {
    font-size: 13px; font-weight: 800; color: #fff; background: ${C.teal}; font-family: ${UI};
    padding: 8px 14px; border-radius: 999px; text-decoration: none; white-space: nowrap;
    transition: background .2s ${EASE}, transform .2s ${EASE};
  }
  .ys-shop-buy:hover { background: ${C.tealDeep}; transform: translateY(-1px); }
  .ys-shop-catalog { padding: 28px 0 64px; background: ${C.paper2}; }
  .ys-shop-search input {
    width: min(320px, 100%); border: 1px solid ${C.rule}; background: ${C.vellum}; border-radius: 999px;
    padding: 10px 16px; font-size: 14px; font-family: ${UI}; color: ${C.ink}; font-weight: 500;
    transition: border-color .2s ${EASE}, box-shadow .2s ${EASE};
  }
  .ys-shop-search input:focus { outline: none; border-color: ${C.teal}; box-shadow: 0 0 0 3px rgba(14,124,116,0.18); }
  .ys-shop-filters {
    display: flex; flex-wrap: nowrap; gap: 8px; margin: 8px 0 16px;
    overflow-x: auto; scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch;
    scrollbar-width: none; padding-bottom: 2px;
  }
  .ys-shop-filters::-webkit-scrollbar { display: none; }
  .ys-shop-filters button {
    flex: 0 0 auto; scroll-snap-align: start;
    border: 1px solid ${C.rule}; background: ${C.vellum}; color: ${C.inkMid}; border-radius: 999px;
    padding: 7px 14px; font-size: 13px; font-weight: 700; cursor: pointer; font-family: ${UI};
    transition: background .2s ${EASE}, color .2s ${EASE}, border-color .2s ${EASE}, transform .2s ${EASE};
  }
  .ys-shop-filters button:hover { border-color: ${C.teal}; color: ${C.tealDeep}; }
  .ys-shop-filters button.on, .ys-shop-filters button.on:hover {
    background: ${C.teal}; color: #fff; border-color: ${C.teal};
  }
  .ys-shop-count { font-size: 13px; color: ${C.inkSoft}; margin: 0 0 18px; font-weight: 500; }
  .ys-shop-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
  .ys-shop-empty { background: ${C.vellum}; border: 1px dashed ${C.rule}; border-radius: 16px; padding: 36px; text-align: center; color: ${C.inkSoft}; }
  .ys-shop-empty button {
    margin-top: 12px; border: 0; background: ${C.teal}; color: #fff; border-radius: 999px;
    padding: 8px 14px; cursor: pointer; font-family: ${UI}; font-weight: 700;
  }
  .ys-shop-trust { padding: 8px 0 56px; border-top: 1px solid ${C.rule}; }
  .ys-shop-trust-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin: 22px 0 28px; }
  .ys-shop-trust article { background: ${C.vellum}; border: 1px solid ${C.rule}; border-radius: 16px; padding: 18px 18px 16px; }
  .ys-shop-trust article span { font-family: ${UI}; font-size: 22px; font-weight: 800; letter-spacing: -0.04em; color: ${C.teal}; display: block; line-height: 1; }
  .ys-shop-trust article h3 { font-family: ${UI}; font-size: 16px; font-weight: 800; margin: 10px 0 6px; color: ${C.ink}; }
  .ys-shop-trust article p { margin: 0; color: ${C.inkMid}; font-size: 13px; line-height: 1.5; font-weight: 500; }
  .ys-shop-return { font-size: 14px; color: ${C.inkSoft}; font-weight: 500; }
  .ys-shop-return a { color: ${C.teal}; font-weight: 700; text-decoration: none; }
  .ys-shop-return a:hover { text-decoration: underline; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); border: 0; }

  @media (max-width: 1100px) {
    .ys-shop-grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 920px) {
    .ys-shop-hero-grid, .ys-shop-trust-grid { grid-template-columns: 1fr; }
    .ys-shop-featured-card { flex-basis: min(420px, 82vw); }
  }
  @media (max-width: 600px) {
    .ys-shop-grid { grid-template-columns: 1fr; }
    .ys-shop-hero { padding: 24px 0 32px; }
    .ys-shop-hero h1 { max-width: none; }
    .ys-shop-wrap { width: min(1180px, calc(100vw - 28px)); }
  }
  @media (prefers-reduced-motion: reduce) {
    .ys-shop-card, .ys-shop-featured-card, .ys-shop-buy, .ys-shop-cover img, .ys-shop-btn {
      transition: none;
    }
    .ys-shop-featured-card:hover, .ys-shop-card:hover { transform: none; }
    .ys-shop-featured-card:hover .ys-shop-cover img, .ys-shop-card:hover .ys-shop-cover img { transform: none; }
  }
`
