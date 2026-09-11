'use client'

/**
 * SmartSearchBox — Marketplace autocomplete without treating keystrokes as demand.
 *
 * Typing only loads best-effort suggestions. A demand event is created later,
 * when the user explicitly submits or clicks a suggestion. Suggestions combine
 * local categories with privacy-filtered Marketplace tags, gig titles and
 * sufficiently aggregated historical search queries.
 */
import React from 'react'
import { CATEGORIES } from '@/lib/categories'
import {
  queueMarketplaceSearchExecution,
  recordMarketplaceSearch,
  type MarketplaceSuggestionType,
} from '@/lib/marketplaceSearchIntelligence'
import { T, F } from '@/components/marketplace/tokens'

const RECENT_KEY = 'ys.recentSearches.v1'
const MAX_RECENT = 6

function readRecent(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = JSON.parse(window.localStorage.getItem(RECENT_KEY) || '[]')
    return Array.isArray(raw) ? raw.filter((s) => typeof s === 'string').slice(0, MAX_RECENT) : []
  } catch { return [] }
}

export function rememberSearch(q: string) {
  const term = q.trim()
  if (!term || typeof window === 'undefined') return
  try {
    const next = [term, ...readRecent().filter((s) => s.toLowerCase() !== term.toLowerCase())].slice(0, MAX_RECENT)
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {}
}

type Suggestion =
  | { kind: 'recent'; label: string }
  | { kind: 'category'; label: string; id: string }
  | { kind: 'tag'; label: string }
  | { kind: 'query'; label: string; demandCount?: number }
  | { kind: 'gig'; label: string; slug: string; gigId?: string | null }

interface SmartSearchBoxProps {
  value: string
  onChange: (value: string) => void
  onSubmit: (value: string) => void
  placeholder?: string
  style?: React.CSSProperties
}

export function SmartSearchBox({ value, onChange, onSubmit, placeholder, style }: SmartSearchBoxProps) {
  const [open, setOpen] = React.useState(false)
  const [items, setItems] = React.useState<Suggestion[]>([])
  const [highlight, setHighlight] = React.useState(-1)
  const seqRef = React.useRef(0)
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const rootRef = React.useRef<HTMLDivElement | null>(null)

  const showRecents = React.useCallback(() => {
    const recents = readRecent().map((label): Suggestion => ({ kind: 'recent', label }))
    setItems(recents)
    setHighlight(-1)
  }, [])

  React.useEffect(() => {
    const q = value.trim().toLowerCase()
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (q.length < 2) {
      if (open) showRecents()
      return
    }

    const categories: Suggestion[] = CATEGORIES
      .filter((c: any) => String(c.name || c.label || '').toLowerCase().includes(q))
      .slice(0, 3)
      .map((c: any): Suggestion => ({ kind: 'category', label: c.name || c.label, id: c.id }))
    setItems(categories)
    setHighlight(-1)

    debounceRef.current = setTimeout(async () => {
      const seq = ++seqRef.current
      try {
        const res = await fetch(`/api/marketplace/search-suggestions?q=${encodeURIComponent(value.trim())}`, {
          credentials: 'same-origin',
        })
        const body = await res.json().catch(() => ({}))
        if (seq !== seqRef.current) return
        const remote: Suggestion[] = ((body?.data?.suggestions ?? body?.suggestions) || [])
          .map((row: any): Suggestion | null => {
            if (row.kind === 'tag') return { kind: 'tag', label: String(row.label || '') }
            if (row.kind === 'query') return { kind: 'query', label: String(row.label || ''), demandCount: Number(row.demandCount || 0) }
            if (row.kind === 'gig' && row.slug) {
              return {
                kind: 'gig',
                label: String(row.label || ''),
                slug: String(row.slug),
                gigId: row.gigId ? String(row.gigId) : null,
              }
            }
            return null
          })
          .filter(Boolean) as Suggestion[]
        setItems([...categories, ...remote].slice(0, 12))
      } catch {
        // Suggestions are best-effort; category matches remain usable.
      }
    }, 220)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [value, open, showRecents])

  React.useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const pick = (suggestion: Suggestion) => {
    setOpen(false)

    if (suggestion.kind === 'gig') {
      const query = value.trim() || suggestion.label
      rememberSearch(query)
      // This is both a meaningful search choice and its attributed click.
      // Supply/result count is intentionally unknown (null), so a direct gig
      // suggestion can never be misclassified as a zero-result search.
      void recordMarketplaceSearch({
        query,
        source: 'suggestion_click',
        suggestionType: 'gig',
        resultCount: null,
        clickedGigId: suggestion.gigId || undefined,
      })
      window.location.href = `/gigs/${suggestion.slug}`
      return
    }

    if (suggestion.kind === 'category') {
      rememberSearch(suggestion.label)
      queueMarketplaceSearchExecution({
        query: suggestion.label,
        source: 'suggestion_click',
        suggestionType: 'category',
        categoryId: suggestion.id,
      })
      window.location.href = `/categories/${suggestion.id}`
      return
    }

    const suggestionType = suggestion.kind as MarketplaceSuggestionType
    onChange(suggestion.label)
    rememberSearch(suggestion.label)
    queueMarketplaceSearchExecution({
      query: suggestion.label,
      source: 'suggestion_click',
      suggestionType,
    })
    onSubmit(suggestion.label)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || items.length === 0) {
      if (e.key === 'Enter') { rememberSearch(value); setOpen(false) }
      return
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => (h + 1) % items.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => (h <= 0 ? items.length - 1 : h - 1)) }
    else if (e.key === 'Enter' && highlight >= 0) { e.preventDefault(); pick(items[highlight]) }
    else if (e.key === 'Enter') { rememberSearch(value); setOpen(false) }
    else if (e.key === 'Escape') setOpen(false)
  }

  const kindLabel = (s: Suggestion) => {
    if (s.kind === 'category') return 'Category'
    if (s.kind === 'tag') return 'Tag'
    if (s.kind === 'query') return 'Popular search'
    if (s.kind === 'gig') return 'Service'
    return null
  }

  return (
    <div ref={rootRef} style={{ position: 'relative', flex: 1, ...style }}>
      <input
        role="combobox"
        aria-expanded={open && items.length > 0}
        aria-autocomplete="list"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => { setOpen(true); if (value.trim().length < 2) showRecents() }}
        onKeyDown={onKeyDown}
        placeholder={placeholder || 'Search services…'}
        style={{
          width: '100%', padding: '10px 14px 10px 38px', fontSize: 14, fontFamily: F.ui,
          border: `1.5px solid ${T.rule}`, borderRadius: 10, background: T.vellum, color: T.ink,
          boxSizing: 'border-box', outline: 'none',
        }}
      />
      <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: T.inkSoft, fontSize: 14, pointerEvents: 'none' }}>🔍</span>

      {open && items.length > 0 && (
        <div role="listbox" style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 60,
          background: T.vellum, border: `1px solid ${T.rule}`, borderRadius: 12,
          boxShadow: '0 12px 32px rgba(15,23,42,0.14)', overflow: 'hidden', padding: '6px 0',
        }}>
          {items[0]?.kind === 'recent' && (
            <div style={{ padding: '4px 14px', fontFamily: F.mono, fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: T.inkSoft }}>
              Recent searches
            </div>
          )}
          {items.map((s, i) => (
            <button
              key={`${s.kind}:${s.label}:${i}`}
              type="button"
              role="option"
              aria-selected={i === highlight}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={(e) => { e.preventDefault(); pick(s) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                padding: '9px 14px', border: 'none', cursor: 'pointer', fontFamily: F.ui, fontSize: 13.5,
                background: i === highlight ? T.paper2 : 'transparent', color: T.ink,
              }}
            >
              <span style={{ fontSize: 13, width: 18, textAlign: 'center', color: T.inkSoft }}>
                {s.kind === 'recent' ? '🕘' : s.kind === 'category' ? '📂' : s.kind === 'tag' ? '#' : s.kind === 'query' ? '↗' : '🔎'}
              </span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
              {kindLabel(s) && (
                <span style={{ fontFamily: F.mono, fontSize: 10, color: T.inkSoft, textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>
                  {kindLabel(s)}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
