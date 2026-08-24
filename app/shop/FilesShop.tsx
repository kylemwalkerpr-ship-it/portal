'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { MarketplaceFooter } from '@/components/marketplace/MarketplaceFooter'
import { T, F } from '@/components/marketplace/tokens'
import { FILE_SHOP_FILTERS, FILE_SHOP_PRODUCTS, type FileShopCategory, type FileShopProduct } from '@/lib/files-shop-catalog'

type FilterId = 'all' | FileShopCategory

const CAT_TONE: Record<FileShopCategory, { wash: string; ink: string; label: string }> = {
  spreadsheet: { wash: '#EEF0F7', ink: T.indigo, label: 'Workbook' },
  guide: { wash: '#F2F4EC', ink: T.moss, label: 'Guide' },
  template: { wash: '#F7EEF0', ink: T.brick, label: 'Template' },
  craft: { wash: '#F7F3E8', ink: '#8A6A22', label: 'Print' },
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
          <div className="ys-shop-featured-grid">
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
              <p>Every listing names the format, page or sheet count, and what it actually does. No “unlock the rest” upsells.</p>
            </article>
            <article>
              <span>02</span>
              <h3>Checkout on Payhip</h3>
              <p>Card and PayPal on a PCI-certified cart. YouSafe never stores your card number on this page.</p>
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
      <span className="ys-shop-cover-cat">{tone.label}</span>
    </div>
  )
}

function ProductCard({ product: p }: { product: FileShopProduct }) {
  return (
    <article className="ys-shop-card">
      <Cover product={p} />
      <div className="ys-shop-card-body">
        <h3>{p.title}</h3>
        <p>{p.desc}</p>
        <ul>
          <li>{p.bullets[0]}</li>
          <li>{p.bullets[1]}</li>
        </ul>
        <div className="ys-shop-card-foot">
          <div className="ys-shop-price">
            ${p.price}<sup>.00</sup>
          </div>
          <a className="ys-shop-buy" href={p.href} rel="noopener noreferrer">
            Get file
          </a>
        </div>
      </div>
    </article>
  )
}

function FeaturedCard({ product: p }: { product: FileShopProduct }) {
  const tone = CAT_TONE[p.cat]
  return (
    <article className="ys-shop-featured-card">
      <Cover product={p} large />
      <div className="ys-shop-card-body">
        <span className="ys-shop-pill" style={{ color: tone.ink, background: tone.wash }}>{tone.label}</span>
        <h3>{p.title}</h3>
        <p>{p.desc}</p>
        <div className="ys-shop-card-foot">
          <div className="ys-shop-price">
            ${p.price}<sup>.00</sup>
          </div>
          <a className="ys-shop-buy" href={p.href} rel="noopener noreferrer">
            Get file
          </a>
        </div>
      </div>
    </article>
  )
}

const SHOP_CSS = `
  .ys-files-shop { background: ${T.paper}; color: ${T.ink}; font-family: ${F.ui}; }
  .ys-shop-wrap { width: min(1120px, calc(100vw - 40px)); margin: 0 auto; }
  .ys-shop-kicker {
    font-family: ${F.mono}; font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase;
    color: ${T.indigo}; font-weight: 600; margin: 0 0 10px;
  }
  .ys-shop-crumbs {
    display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
    font-size: 13px; color: ${T.inkSoft}; margin-bottom: 28px;
  }
  .ys-shop-crumbs a { color: ${T.inkMid}; text-decoration: none; }
  .ys-shop-crumbs a:hover { color: ${T.indigo}; }
  .ys-shop-hero { padding: 36px 0 48px; border-bottom: 1px solid ${T.rule}; background: linear-gradient(180deg, #fff 0%, ${T.paper} 100%); }
  .ys-shop-hero-grid { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(240px, 0.7fr); gap: 40px; align-items: end; }
  .ys-shop-hero h1 {
    font-family: ${F.display}; font-weight: 600; font-size: clamp(32px, 4.6vw, 52px);
    line-height: 1.12; letter-spacing: -0.02em; margin: 0 0 16px; max-width: 16ch;
  }
  .ys-shop-lede { font-size: 17px; line-height: 1.6; color: ${T.inkMid}; max-width: 54ch; margin: 0 0 28px; }
  .ys-shop-cta-row { display: flex; flex-wrap: wrap; gap: 10px; }
  .ys-shop-btn {
    display: inline-flex; align-items: center; justify-content: center;
    padding: 11px 18px; border-radius: 999px; font-size: 14px; font-weight: 600;
    text-decoration: none; font-family: ${F.ui};
  }
  .ys-shop-btn.primary { background: ${T.indigo}; color: #fff; }
  .ys-shop-btn.primary:hover { background: ${T.indigoDeep}; }
  .ys-shop-btn.ghost { background: #fff; color: ${T.ink}; border: 1px solid ${T.rule}; }
  .ys-shop-btn.ghost:hover { border-color: ${T.inkSoft}; }
  .ys-shop-stats {
    display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: ${T.rule};
    border: 1px solid ${T.rule}; border-radius: 16px; overflow: hidden;
  }
  .ys-shop-stat { background: #fff; padding: 18px 16px; }
  .ys-shop-stat strong { display: block; font-family: ${F.display}; font-size: 22px; font-weight: 600; }
  .ys-shop-stat span { font-size: 12px; color: ${T.inkSoft}; }
  .ys-shop-featured { padding: 48px 0 20px; }
  .ys-shop-section-head { margin-bottom: 22px; }
  .ys-shop-section-head h2, .ys-shop-trust h2, .ys-shop-catalog h2 {
    font-family: ${F.display}; font-size: 28px; font-weight: 600; letter-spacing: -0.02em; margin: 0;
  }
  .ys-shop-section-head.row { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
  .ys-shop-featured-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  .ys-shop-featured-card, .ys-shop-card {
    background: #fff; border: 1px solid ${T.rule}; border-radius: 16px; overflow: hidden;
    display: flex; flex-direction: column; min-height: 100%;
    transition: box-shadow .18s ease, transform .18s ease, border-color .18s ease;
  }
  .ys-shop-featured-card:hover, .ys-shop-card:hover {
    transform: translateY(-3px); border-color: ${T.paper3};
    box-shadow: 0 18px 40px -24px rgba(15,23,42,0.35);
  }
  .ys-shop-cover {
    position: relative; padding: 0; aspect-ratio: 4 / 3; overflow: hidden; background: ${T.paper2};
  }
  .ys-shop-cover.large { aspect-ratio: 16 / 10; }
  .ys-shop-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .ys-shop-cover-cat {
    position: absolute; left: 12px; bottom: 12px;
    font-family: ${F.mono}; font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; font-weight: 600;
    color: #fff; background: rgba(15,23,42,0.72); padding: 5px 8px; border-radius: 6px;
  }
  .ys-shop-card-body { padding: 18px 18px 16px; display: flex; flex-direction: column; flex: 1; }
  .ys-shop-card-body h3 { font-family: ${F.display}; font-size: 18px; font-weight: 600; line-height: 1.3; margin: 0 0 8px; }
  .ys-shop-card-body p { font-size: 14px; line-height: 1.55; color: ${T.inkMid}; margin: 0 0 12px; flex: 1; }
  .ys-shop-card-body ul { list-style: none; padding: 0; margin: 0 0 16px; font-size: 13px; color: ${T.inkSoft}; }
  .ys-shop-card-body ul li { padding-left: 14px; position: relative; margin-bottom: 4px; }
  .ys-shop-card-body ul li::before { content: ""; width: 5px; height: 5px; border-radius: 50%; background: ${T.indigo}; position: absolute; left: 0; top: 0.55em; }
  .ys-shop-pill { display: inline-block; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; padding: 4px 8px; border-radius: 6px; margin-bottom: 8px; }
  .ys-shop-card-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: auto; padding-top: 12px; border-top: 1px solid ${T.ruleSoft}; }
  .ys-shop-price { font-family: ${F.display}; font-size: 22px; font-weight: 600; }
  .ys-shop-price sup { font-size: 11px; font-weight: 500; }
  .ys-shop-buy {
    font-size: 13px; font-weight: 700; color: #fff; background: ${T.indigo};
    padding: 9px 14px; border-radius: 999px; text-decoration: none;
  }
  .ys-shop-buy:hover { background: ${T.indigoDeep}; }
  .ys-shop-catalog { padding: 28px 0 64px; }
  .ys-shop-search input {
    width: min(320px, 100%); border: 1px solid ${T.rule}; background: #fff; border-radius: 999px;
    padding: 10px 16px; font-size: 14px; font-family: ${F.ui}; color: ${T.ink};
  }
  .ys-shop-search input:focus { outline: 2px solid ${T.indigoSoft}; border-color: ${T.indigo}; }
  .ys-shop-filters { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 16px; }
  .ys-shop-filters button {
    border: 1px solid ${T.rule}; background: #fff; color: ${T.inkMid}; border-radius: 999px;
    padding: 7px 14px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: ${F.ui};
  }
  .ys-shop-filters button.on, .ys-shop-filters button:hover { background: ${T.indigo}; color: #fff; border-color: ${T.indigo}; }
  .ys-shop-count { font-size: 13px; color: ${T.inkSoft}; margin: 0 0 18px; }
  .ys-shop-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
  .ys-shop-empty { background: #fff; border: 1px dashed ${T.rule}; border-radius: 16px; padding: 36px; text-align: center; color: ${T.inkSoft}; }
  .ys-shop-empty button { margin-top: 12px; border: 0; background: ${T.indigo}; color: #fff; border-radius: 999px; padding: 8px 14px; cursor: pointer; }
  .ys-shop-trust { padding: 8px 0 56px; border-top: 1px solid ${T.rule}; }
  .ys-shop-trust-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin: 22px 0 28px; }
  .ys-shop-trust article { background: #fff; border: 1px solid ${T.rule}; border-radius: 16px; padding: 22px; }
  .ys-shop-trust article span { font-family: ${F.mono}; font-size: 11px; letter-spacing: 0.14em; color: ${T.indigo}; }
  .ys-shop-trust article h3 { font-family: ${F.display}; font-size: 18px; margin: 8px 0 8px; }
  .ys-shop-trust article p { margin: 0; color: ${T.inkMid}; font-size: 14px; line-height: 1.55; }
  .ys-shop-return { font-size: 14px; color: ${T.inkSoft}; }
  .ys-shop-return a { color: ${T.indigo}; font-weight: 600; text-decoration: none; }
  .ys-shop-return a:hover { text-decoration: underline; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); border: 0; }
  @media (max-width: 920px) {
    .ys-shop-hero-grid, .ys-shop-featured-grid, .ys-shop-trust-grid { grid-template-columns: 1fr; }
    .ys-shop-grid { grid-template-columns: 1fr 1fr; }
  }
  @media (max-width: 600px) {
    .ys-shop-grid { grid-template-columns: 1fr; }
    .ys-shop-hero { padding: 24px 0 32px; }
  }
`
