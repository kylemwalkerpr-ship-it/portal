// @ts-nocheck
'use client'
import React from 'react'
import Link from 'next/link'
import { Btn, Card } from '../design/shared'
import { CATEGORIES } from '@/lib/categories'
import { T, F } from './tokens'

/**
 * /marketplace/categories — full index of every top-level category with
 * subcategory chips, searchable + tile aesthetic that matches the rest of
 * the upgraded dashboard.
 */

export function MarketplaceCategoriesIndex() {
  const [q, setQ] = React.useState('')
  const [verticalFilter, setVerticalFilter] = React.useState('all')

  const verticals = React.useMemo(() => {
    const set = new Set()
    CATEGORIES.forEach(c => c.vertical && set.add(c.vertical))
    return Array.from(set)
  }, [])

  const filtered = React.useMemo(() => {
    const qLower = q.trim().toLowerCase()
    return CATEGORIES
      .filter(c => verticalFilter === 'all' || c.vertical === verticalFilter)
      .filter(c => {
        if (!qLower) return true
        if (c.name.toLowerCase().includes(qLower)) return true
        if ((c.description || '').toLowerCase().includes(qLower)) return true
        return (c.subcategories || []).some(s =>
          s.name.toLowerCase().includes(qLower) ||
          (s.description || '').toLowerCase().includes(qLower) ||
          (s.keywords || []).some(k => k.toLowerCase().includes(qLower))
        )
      })
      .sort((a, b) => (a.order || 99) - (b.order || 99))
  }, [q, verticalFilter])

  const popular = CATEGORIES.filter(c => c.popular).slice(0, 4)

  return (
    <div style={{ minHeight: '100vh', background: T.paper, fontFamily: F.ui, color: T.ink }}>
      <div style={{ width: 'min(1280px, calc(100vw - 32px))', margin: '0 auto', padding: '32px 0 64px' }}>
        {/* Breadcrumb */}
        <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: T.inkMid, fontFamily: F.mono }}>
          <Link href="/" style={{ color: T.indigo, textDecoration: 'none' }}>Marketplace</Link>
          <span>›</span>
          <span>Categories</span>
        </div>

        {/* Header */}
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.16em', color: T.gold, textTransform: 'uppercase', fontFamily: F.mono, marginBottom: 4 }}>Browse</div>
          <h1 style={{ fontFamily: F.display, fontSize: 36, fontWeight: 500, color: T.ink, margin: 0, letterSpacing: '-.012em' }}>All categories.</h1>
          <div style={{ fontSize: 14, color: T.inkMid, marginTop: 6, maxWidth: 720 }}>
            {CATEGORIES.length} categories spanning {CATEGORIES.reduce((s, c) => s + (c.subcategories?.length || 0), 0)} subcategories. Each tile opens curated gigs and templates.
          </div>
        </div>

        {/* Stat strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 18 }}>
          <StatTile label="Categories"      value={CATEGORIES.length} accent={T.indigo} />
          <StatTile label="Subcategories"   value={CATEGORIES.reduce((s, c) => s + (c.subcategories?.length || 0), 0)} accent={T.indigo} />
          <StatTile label="Popular"         value={CATEGORIES.filter(c => c.popular).length} accent={T.indigoDeep} />
          <StatTile label="Verticals"       value={verticals.length} accent={T.star} />
        </div>

        {/* Toolbar */}
        <div style={{ background: T.vellum, border: `1px solid ${T.rule}`, borderRadius: 10, padding: '14px 16px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 18 }}>
          <div style={{ position: 'relative', flex: '1 1 260px', minWidth: 220 }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: T.inkSoft, fontSize: 14 }}>🔍</span>
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search categories, subcategories, keywords…"
              style={{ width: '100%', padding: '8px 12px 8px 32px', fontSize: 13, border: `1px solid ${T.rule}`, borderRadius: 6, background: T.paper, color: T.ink, fontFamily: F.ui, boxSizing: 'border-box' }}
            />
          </div>
          <select value={verticalFilter} onChange={e => setVerticalFilter(e.target.value)} style={{ ...selectStyle, fontFamily: F.ui }}>
            <option value="all">All verticals</option>
            {verticals.map(v => <option key={v} value={v}>{v.replace(/-/g, ' ')}</option>)}
          </select>
          {(q || verticalFilter !== 'all') && (
            <Btn variant="ghost" size="sm" onClick={() => { setQ(''); setVerticalFilter('all') }}>Reset</Btn>
          )}
          <span style={{ fontSize: 12, color: T.inkMid, marginLeft: 'auto', fontFamily: F.mono }}>
            Showing {filtered.length} of {CATEGORIES.length}
          </span>
        </div>

        {/* Popular row (only when no filters) */}
        {!q && verticalFilter === 'all' && popular.length > 0 && (
          <section style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.14em', color: T.gold, textTransform: 'uppercase', fontFamily: F.mono, marginBottom: 8 }}>★ Popular</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
              {popular.map(c => <CategoryTile key={c.id} category={c} compact />)}
            </div>
          </section>
        )}

        {/* Full grid */}
        {filtered.length === 0 ? (
          <Card style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 38, marginBottom: 8 }}>🔎</div>
            <div style={{ fontFamily: F.display, fontSize: 22, fontWeight: 600, color: T.ink, marginBottom: 4 }}>No matches</div>
            <div style={{ fontSize: 13, color: T.inkMid, marginBottom: 14 }}>Try a different search term or reset the vertical filter.</div>
            <Btn variant="secondary" size="sm" onClick={() => { setQ(''); setVerticalFilter('all') }}>Reset filters</Btn>
          </Card>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
            {filtered.map(c => <CategoryTile key={c.id} category={c} />)}
          </div>
        )}
      </div>
    </div>
  )
}

function StatTile({ label, value, accent = T.indigo }) {
  return (
    <div style={{ background: T.vellum, border: `1px solid ${T.rule}`, borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: T.inkSoft, fontFamily: F.mono }}>{label}</div>
      <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 26, color: accent, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1.05 }}>{Number(value).toLocaleString('en-US')}</div>
    </div>
  )
}

function CategoryTile({ category, compact }) {
  const subs = (category.subcategories || []).slice(0, compact ? 3 : 5)
  const total = category.subcategories?.length || 0
  return (
    <Link href={`/marketplace/categories/${category.id}`} style={{ textDecoration: 'none', display: 'block' }}>
      <Card style={{
        padding: '20px 22px', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', gap: 12,
        minHeight: compact ? 'auto' : 200,
        borderLeft: `4px solid ${category.popular ? T.gold : T.indigo}`,
        transition: 'box-shadow .15s, border-color .15s',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ fontSize: 36, lineHeight: 1, flexShrink: 0 }}>{category.icon}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
              <span style={{ fontFamily: F.display, fontSize: 19, fontWeight: 600, color: T.ink, lineHeight: 1.2 }}>{category.name}</span>
              {category.popular && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: `${T.gold}15`, color: T.gold, letterSpacing: '.04em', textTransform: 'uppercase' }}>Popular</span>}
            </div>
            <div style={{ fontSize: 12, color: T.inkMid, lineHeight: 1.5 }}>{category.description}</div>
          </div>
        </div>

        {subs.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {subs.map(s => (
              <div key={s.id} style={{ fontSize: 11, color: T.inkMid, display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ color: T.inkSoft }}>›</span>
                <span style={{ fontWeight: s.popular ? 600 : 400, color: s.popular ? T.ink : T.inkMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
              </div>
            ))}
            {total > subs.length && (
              <div style={{ fontSize: 11, color: T.indigo, fontWeight: 600, marginTop: 4 }}>+ {total - subs.length} more</div>
            )}
          </div>
        )}

        <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: T.inkSoft, fontFamily: F.mono }}>{total} subcategor{total === 1 ? 'y' : 'ies'}</span>
          <span style={{ fontSize: 12, color: T.indigo, fontWeight: 700 }}>Explore →</span>
        </div>
      </Card>
    </Link>
  )
}

const selectStyle = {
  padding: '8px 10px', fontSize: 13, border: `1px solid ${T.rule}`, borderRadius: 6,
  background: T.paper, color: T.ink, fontFamily: F.ui, cursor: 'pointer', textTransform: 'capitalize',
}
