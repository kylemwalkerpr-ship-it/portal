'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { CATEGORIES, type Category } from '@/lib/categories'
import { T, F } from './tokens'

interface Props {
  country: 'all' | 'us' | 'uk' | 'ca'
  /**
   * Category counts (active gigs in the current jurisdiction) for the menu
   * footer numerals. Optional — missing entries render without a count.
   */
  counts?: Record<string, number>
}

function appendCountry(href: string, country: Props['country']): string {
  if (country === 'all') return href
  const sep = href.includes('?') ? '&' : '?'
  return `${href}${sep}country=${country}`
}

export function CategoriesMenu({ country, counts }: Props) {
  const [open, setOpen] = useState(false)
  const [focus, setFocus] = useState<Category>(CATEGORIES[0]!)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '5px',
          padding: '0 14px', height: 32,
          fontSize: 13, fontWeight: 500,
          color: T.inkSoft,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          fontFamily: F.ui,
          transition: 'color 0.12s',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = T.ink }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = T.inkSoft }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
        </svg>
        Categories
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: 2 }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="cw-cat-panel" role="menu">
          <ul className="cw-cat-list">
            {CATEGORIES.map((cat) => {
              const isFocus = focus.id === cat.id
              const count = counts?.[cat.id]
              return (
                <li key={cat.id} onMouseEnter={() => setFocus(cat)}>
                  <Link
                    href={appendCountry(`/marketplace?category=${cat.id}`, country)}
                    className={isFocus ? 'is-focus' : ''}
                    onClick={() => setOpen(false)}
                  >
                    <span className="cw-cat-icon" aria-hidden="true">{cat.icon}</span>
                    <span className="cw-cat-name">{cat.name.replace(' Services', '')}</span>
                    {typeof count === 'number' && <span className="cw-cat-count">{count}</span>}
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="cw-cat-arrow">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </Link>
                </li>
              )
            })}
          </ul>
          <div className="cw-cat-detail">
            <div className="cw-cat-detail-eyebrow">{focus.name.replace(' Services', '')}</div>
            <p className="cw-cat-detail-desc">{focus.description}</p>
            <ul className="cw-cat-sublist">
              {focus.subcategories.slice(0, 12).map((sub) => (
                <li key={sub.id}>
                  <Link
                    href={appendCountry(`/marketplace?category=${focus.id}&subcategory=${sub.id}`, country)}
                    onClick={() => setOpen(false)}
                  >
                    {sub.name}
                  </Link>
                </li>
              ))}
            </ul>
            <Link
              href={appendCountry(`/marketplace?category=${focus.id}`, country)}
              onClick={() => setOpen(false)}
              className="cw-cat-detail-cta"
            >
              See all {focus.name.replace(' Services', '').toLowerCase()} services →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
