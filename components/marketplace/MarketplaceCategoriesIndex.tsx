// @ts-nocheck
'use client'

import React from 'react'
import Link from 'next/link'
import { CATEGORIES } from '@/lib/categories'
import { T } from './tokens'

const DISCOVERY_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Helvetica, Arial, sans-serif"

/** Public /categories directory. Keep this surface closer to a mature
 * marketplace discovery page than an admin/dashboard index: strong hierarchy,
 * roomy cards, restrained chrome, and clean category URLs throughout. */
export function MarketplaceCategoriesIndex() {
  const [q, setQ] = React.useState('')
  const [verticalFilter, setVerticalFilter] = React.useState('all')

  const verticals = React.useMemo(() => {
    const set = new Set<string>()
    CATEGORIES.forEach((category) => {
      if (category.vertical) set.add(category.vertical)
    })
    return Array.from(set)
  }, [])

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase()
    return CATEGORIES
      .filter((category) => verticalFilter === 'all' || category.vertical === verticalFilter)
      .filter((category) => {
        if (!needle) return true
        if (category.name.toLowerCase().includes(needle)) return true
        if ((category.description || '').toLowerCase().includes(needle)) return true
        return (category.subcategories || []).some((subcategory) =>
          subcategory.name.toLowerCase().includes(needle) ||
          (subcategory.description || '').toLowerCase().includes(needle) ||
          (subcategory.keywords || []).some((keyword) => keyword.toLowerCase().includes(needle)),
        )
      })
      .sort((a, b) => (a.order || 99) - (b.order || 99))
  }, [q, verticalFilter])

  const popular = React.useMemo(
    () => CATEGORIES.filter((category) => category.popular).slice(0, 6),
    [],
  )

  const reset = () => {
    setQ('')
    setVerticalFilter('all')
  }

  return (
    <main className="ys-category-index">
      <div className="ys-category-index-shell">
        <nav className="ys-category-index-breadcrumb" aria-label="Breadcrumb">
          <Link href="/">Marketplace</Link><span aria-hidden="true">/</span><span aria-current="page">Categories</span>
        </nav>

        <header className="ys-category-index-header">
          <p className="ys-category-index-eyebrow">Browse YouSafe Marketplace</p>
          <h1>Find the right service</h1>
          <p>
            Explore specialist services by need, then compare scope, turnaround and provider credentials before you order.
          </p>
        </header>

        {!q && verticalFilter === 'all' && popular.length > 0 ? (
          <section className="ys-category-popular" aria-labelledby="ys-popular-categories-title">
            <div className="ys-category-section-heading">
              <div>
                <h2 id="ys-popular-categories-title">Popular on YouSafe</h2>
                <p>Start with the services people browse most often.</p>
              </div>
              <span>{popular.length} popular categories</span>
            </div>

            <div className="ys-category-popular-rail">
              {popular.map((category) => (
                <Link key={category.id} href={`/categories/${category.id}`} className="ys-category-popular-card">
                  <span className="ys-category-icon" aria-hidden="true">{category.icon}</span>
                  <span className="ys-category-card-copy">
                    <strong>{category.name.replace(' Services', '')}</strong>
                    <small>{(category.subcategories || []).length} service areas</small>
                  </span>
                  <span className="ys-category-arrow" aria-hidden="true">→</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section className="ys-category-directory" aria-labelledby="ys-all-categories-title">
          <div className="ys-category-section-heading ys-category-directory-heading">
            <div>
              <h2 id="ys-all-categories-title">All categories</h2>
              <p>Search by service, topic or specialist area.</p>
            </div>
          </div>

          <div className="ys-category-toolbar" role="search">
            <label className="ys-category-search">
              <span aria-hidden="true">⌕</span>
              <span className="sr-only">Search categories</span>
              <input
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder="Search categories, services or keywords"
              />
            </label>

            <label className="ys-category-select-wrap">
              <span className="sr-only">Filter by vertical</span>
              <select value={verticalFilter} onChange={(event) => setVerticalFilter(event.target.value)}>
                <option value="all">All service groups</option>
                {verticals.map((vertical) => (
                  <option key={vertical} value={vertical}>{vertical.replace(/-/g, ' ')}</option>
                ))}
              </select>
            </label>

            {(q || verticalFilter !== 'all') ? (
              <button type="button" className="ys-category-reset" onClick={reset}>Clear</button>
            ) : null}

            <span className="ys-category-result-count">{filtered.length} categories</span>
          </div>

          {filtered.length === 0 ? (
            <div className="ys-category-empty">
              <strong>No categories match that search.</strong>
              <span>Try another term or clear the filters.</span>
              <button type="button" onClick={reset}>Show all categories</button>
            </div>
          ) : (
            <div className="ys-category-grid">
              {filtered.map((category) => <CategoryTile key={category.id} category={category} />)}
            </div>
          )}
        </section>
      </div>

      <style jsx global>{`
        .ys-category-index {
          min-height: 100vh;
          background: var(--ys-paper, ${T.paper});
          color: var(--ys-ink, ${T.ink});
          font-family: ${DISCOVERY_FONT};
          -webkit-font-smoothing: antialiased;
        }
        .ys-category-index *, .ys-category-index *::before, .ys-category-index *::after { box-sizing: border-box; }
        .ys-category-index a { color: inherit; text-decoration: none; }
        .ys-category-index-shell { width: min(1280px, calc(100vw - 32px)); margin: 0 auto; padding: 24px 0 72px; }
        .ys-category-index-breadcrumb { display: flex; align-items: center; gap: 7px; min-height: 28px; margin-bottom: 20px; color: var(--ys-inkSoft, ${T.inkSoft}); font-size: 13px; }
        .ys-category-index-breadcrumb a:hover { color: var(--ys-ink, ${T.ink}); text-decoration: underline; text-underline-offset: 3px; }
        .ys-category-index-breadcrumb [aria-current='page'] { color: var(--ys-inkMid, ${T.inkMid}); font-weight: 650; }
        .ys-category-index-header { max-width: 820px; padding: 16px 0 42px; }
        .ys-category-index-eyebrow { margin: 0 0 10px; color: var(--ys-inkSoft, ${T.inkSoft}); font-size: 12px; font-weight: 760; letter-spacing: .08em; text-transform: uppercase; }
        .ys-category-index-header h1 { margin: 0; color: var(--ys-ink, ${T.ink}); font-family: ${DISCOVERY_FONT}; font-size: clamp(36px, 5vw, 58px); font-weight: 760; line-height: 1.04; letter-spacing: -.04em; }
        .ys-category-index-header > p:last-child { max-width: 720px; margin: 16px 0 0; color: var(--ys-inkMid, ${T.inkMid}); font-size: clamp(16px, 1.7vw, 19px); line-height: 1.58; }
        .ys-category-popular { margin-bottom: 54px; }
        .ys-category-section-heading { display: flex; align-items: end; justify-content: space-between; gap: 20px; margin-bottom: 18px; }
        .ys-category-section-heading h2 { margin: 0; font-family: ${DISCOVERY_FONT}; font-size: clamp(24px, 2.4vw, 31px); font-weight: 730; letter-spacing: -.025em; line-height: 1.15; }
        .ys-category-section-heading p { margin: 6px 0 0; color: var(--ys-inkSoft, ${T.inkSoft}); font-size: 14px; line-height: 1.5; }
        .ys-category-section-heading > span { flex: 0 0 auto; color: var(--ys-inkSoft, ${T.inkSoft}); font-size: 12px; font-weight: 650; }
        .ys-category-popular-rail { display: flex; gap: 14px; overflow-x: auto; padding: 2px 2px 12px; scroll-snap-type: x proximity; scrollbar-width: thin; scrollbar-color: var(--ys-rule, ${T.rule}) transparent; }
        .ys-category-popular-card { display: grid; grid-template-columns: 48px minmax(0,1fr) 20px; align-items: center; gap: 13px; min-width: 245px; min-height: 88px; padding: 15px 16px; scroll-snap-align: start; border: 1px solid var(--ys-rule, ${T.rule}); border-radius: 13px; background: var(--ys-vellum, ${T.vellum}); box-shadow: 0 2px 8px rgba(15,23,42,.045); transition: transform .16s ease, border-color .16s ease, box-shadow .16s ease; }
        .ys-category-popular-card:hover { transform: translateY(-2px); border-color: var(--ys-inkSoft, ${T.inkSoft}); box-shadow: 0 9px 22px rgba(15,23,42,.08); }
        .ys-category-icon { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 11px; background: var(--ys-paper2, ${T.paper2}); font-size: 23px; line-height: 1; }
        .ys-category-card-copy { min-width: 0; display: grid; gap: 4px; }
        .ys-category-card-copy strong { overflow: hidden; color: var(--ys-ink, ${T.ink}); font-size: 14px; font-weight: 690; line-height: 1.3; text-overflow: ellipsis; white-space: nowrap; }
        .ys-category-card-copy small { color: var(--ys-inkSoft, ${T.inkSoft}); font-size: 11px; font-weight: 520; }
        .ys-category-arrow { color: var(--ys-inkSoft, ${T.inkSoft}); font-size: 18px; transition: transform .16s ease; }
        .ys-category-popular-card:hover .ys-category-arrow { transform: translateX(3px); }
        .ys-category-directory { padding-top: 4px; }
        .ys-category-directory-heading { margin-bottom: 16px; }
        .ys-category-toolbar { display: flex; align-items: center; gap: 10px; padding: 12px; margin-bottom: 24px; border: 1px solid var(--ys-rule, ${T.rule}); border-radius: 12px; background: var(--ys-vellum, ${T.vellum}); }
        .ys-category-search { position: relative; display: flex; align-items: center; flex: 1 1 420px; min-width: 220px; }
        .ys-category-search > span:first-child { position: absolute; left: 14px; color: var(--ys-inkSoft, ${T.inkSoft}); font-size: 20px; pointer-events: none; }
        .ys-category-search input, .ys-category-select-wrap select { min-height: 44px; border: 1px solid var(--ys-rule, ${T.rule}); border-radius: 9px; background: var(--ys-vellum, ${T.vellum}); color: var(--ys-ink, ${T.ink}); font-family: ${DISCOVERY_FONT}; font-size: 14px; outline: none; }
        .ys-category-search input { width: 100%; padding: 0 14px 0 42px; }
        .ys-category-search input:focus, .ys-category-select-wrap select:focus { border-color: var(--ys-inkMid, ${T.inkMid}); box-shadow: 0 0 0 3px rgba(15,23,42,.06); }
        .ys-category-select-wrap select { min-width: 190px; padding: 0 36px 0 13px; text-transform: capitalize; }
        .ys-category-reset { min-height: 42px; padding: 0 12px; border: 0; background: transparent; color: var(--ys-inkMid, ${T.inkMid}); font: 650 13px ${DISCOVERY_FONT}; cursor: pointer; }
        .ys-category-reset:hover { text-decoration: underline; text-underline-offset: 3px; }
        .ys-category-result-count { margin-left: auto; padding-right: 4px; color: var(--ys-inkSoft, ${T.inkSoft}); font-size: 12px; white-space: nowrap; }
        .ys-category-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 18px; }
        .ys-category-tile { display: flex; flex-direction: column; min-height: 235px; padding: 22px; border: 1px solid var(--ys-rule, ${T.rule}); border-radius: 14px; background: var(--ys-vellum, ${T.vellum}); box-shadow: 0 2px 8px rgba(15,23,42,.035); transition: transform .16s ease, border-color .16s ease, box-shadow .16s ease; }
        .ys-category-tile:hover { transform: translateY(-2px); border-color: var(--ys-inkSoft, ${T.inkSoft}); box-shadow: 0 10px 26px rgba(15,23,42,.075); }
        .ys-category-tile-head { display: flex; align-items: flex-start; gap: 14px; }
        .ys-category-tile .ys-category-icon { flex: 0 0 48px; }
        .ys-category-tile-title { min-width: 0; padding-top: 2px; }
        .ys-category-tile-title strong { display: block; color: var(--ys-ink, ${T.ink}); font-size: 17px; font-weight: 710; line-height: 1.25; letter-spacing: -.012em; }
        .ys-category-tile-title span { display: block; margin-top: 6px; color: var(--ys-inkMid, ${T.inkMid}); font-size: 13px; line-height: 1.48; }
        .ys-category-sub-preview { display: flex; flex-wrap: wrap; gap: 7px; margin: 18px 0 16px; }
        .ys-category-sub-preview span { max-width: 100%; padding: 6px 9px; overflow: hidden; border-radius: 7px; background: var(--ys-paper2, ${T.paper2}); color: var(--ys-inkMid, ${T.inkMid}); font-size: 11px; line-height: 1.25; text-overflow: ellipsis; white-space: nowrap; }
        .ys-category-tile-foot { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: auto; padding-top: 14px; border-top: 1px solid var(--ys-ruleSoft, ${T.rule}); color: var(--ys-inkSoft, ${T.inkSoft}); font-size: 11px; }
        .ys-category-tile-foot b { color: var(--ys-ink, ${T.ink}); font-size: 12px; font-weight: 680; }
        .ys-category-empty { display: grid; justify-items: start; gap: 7px; padding: 32px; border: 1px solid var(--ys-rule, ${T.rule}); border-radius: 14px; background: var(--ys-vellum, ${T.vellum}); }
        .ys-category-empty strong { font-size: 18px; }
        .ys-category-empty span { color: var(--ys-inkSoft, ${T.inkSoft}); font-size: 14px; }
        .ys-category-empty button { margin-top: 8px; min-height: 40px; padding: 0 14px; border: 1px solid var(--ys-rule, ${T.rule}); border-radius: 8px; background: var(--ys-paper2, ${T.paper2}); color: var(--ys-ink, ${T.ink}); font: 650 13px ${DISCOVERY_FONT}; cursor: pointer; }
        .ys-category-index .sr-only { position: absolute !important; width: 1px !important; height: 1px !important; padding: 0 !important; margin: -1px !important; overflow: hidden !important; clip: rect(0,0,0,0) !important; white-space: nowrap !important; border: 0 !important; }
        @media (max-width: 980px) { .ys-category-grid { grid-template-columns: repeat(2, minmax(0,1fr)); } }
        @media (max-width: 720px) {
          .ys-category-index-shell { width: min(100%, calc(100vw - 28px)); padding-top: 14px; }
          .ys-category-index-header { padding: 10px 0 32px; }
          .ys-category-index-header h1 { font-size: clamp(34px, 10vw, 44px); }
          .ys-category-popular { margin-bottom: 38px; }
          .ys-category-section-heading > span { display: none; }
          .ys-category-popular-card { min-width: min(82vw, 280px); }
          .ys-category-toolbar { flex-wrap: wrap; padding: 10px; }
          .ys-category-search { flex-basis: 100%; }
          .ys-category-select-wrap { flex: 1 1 190px; }
          .ys-category-select-wrap select { width: 100%; min-width: 0; }
          .ys-category-result-count { margin-left: 0; }
          .ys-category-grid { grid-template-columns: 1fr; gap: 12px; }
          .ys-category-tile { min-height: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .ys-category-popular-card, .ys-category-tile, .ys-category-arrow { transition: none; }
          .ys-category-popular-card:hover, .ys-category-tile:hover { transform: none; }
        }
      `}</style>
    </main>
  )
}

function CategoryTile({ category }) {
  const subs = (category.subcategories || []).slice(0, 3)
  const total = category.subcategories?.length || 0

  return (
    <Link href={`/categories/${category.id}`} className="ys-category-tile">
      <div className="ys-category-tile-head">
        <span className="ys-category-icon" aria-hidden="true">{category.icon}</span>
        <span className="ys-category-tile-title">
          <strong>{category.name}</strong>
          <span>{category.description}</span>
        </span>
      </div>

      {subs.length > 0 ? (
        <div className="ys-category-sub-preview" aria-label={`Popular ${category.name} areas`}>
          {subs.map((subcategory) => <span key={subcategory.id}>{subcategory.name}</span>)}
        </div>
      ) : null}

      <div className="ys-category-tile-foot">
        <span>{total} service area{total === 1 ? '' : 's'}</span>
        <b>Explore →</b>
      </div>
    </Link>
  )
}
