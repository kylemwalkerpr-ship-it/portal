'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { CATEGORIES } from '@/lib/categories'
import { T, F } from './tokens'
import { CategoryMegaDropdown } from './CategoryMegaDropdown'

interface Props {
  country: 'all' | 'us' | 'uk' | 'ca' | 'au'
}

// Hard-coded heights that the sticky offset uses to clear the TopNav.
// TopNav (components/marketplace/MarketplaceShell.tsx) renders a
// position:sticky header at top:0 — measure with DevTools if the header
// padding ever changes.
const TOPNAV_OFFSET_DESKTOP = 64
const TOPNAV_OFFSET_MOBILE  = 56
// How far each chevron click scrolls the strip. ~60% of the visible
// width feels natural without over-scrolling past the next chip.
const CHEVRON_SCROLL_RATIO  = 0.6

export function CategoryBar({ country }: Props) {
  const searchParams = useSearchParams()
  const activeCategory = searchParams?.get('category') ?? ''
  const [openId, setOpenId] = useState<string | null>(null)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  // Tracks if the viewport is wide enough that we should render the
  // circular chevron arrows. On touch / narrow viewports we hide them
  // and let native swipe handle horizontal navigation; only the edge
  // fade gradients hint that there's more content offscreen.
  const [showChevrons, setShowChevrons] = useState(false)

  const closeDropdown = useCallback(() => {
    setOpenId(null)
    setAnchorRect(null)
  }, [])

  const toggleCategory = useCallback((id: string, rect: DOMRect) => {
    setOpenId(prev => {
      const next = prev === id ? null : id
      setAnchorRect(next === null ? null : rect)
      return next
    })
  }, [])

  // Page-scroll closes any open dropdown — the anchorRect would otherwise
  // drift relative to the sticky bar and the panel would float in the
  // wrong place.
  useEffect(() => {
    if (!openId) return
    const onScroll = () => closeDropdown()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [openId, closeDropdown])

  useEffect(() => {
    if (!openId) return
    let timeoutId: ReturnType<typeof setTimeout>
    const onResize = () => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        const btn = buttonRefs.current[openId]
        if (btn) {
          setAnchorRect(btn.getBoundingClientRect())
        }
      }, 100)
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      clearTimeout(timeoutId)
    }
  }, [openId])

  // Overflow detection. We watch the inner scroll container and update
  // the can-scroll-left/right flags so the chevron arrows + edge fades
  // only render when there's actually content offscreen on that side.
  const updateOverflow = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const left = el.scrollLeft
    const max  = el.scrollWidth - el.clientWidth
    setCanScrollLeft(left > 2)
    setCanScrollRight(left < max - 2)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    updateOverflow()
    el.addEventListener('scroll', updateOverflow, { passive: true })
    // Strip scrolls horizontally - close any open dropdown because the
    // anchor button has moved.
    const onStripScroll = () => closeDropdown()
    el.addEventListener('scroll', onStripScroll, { passive: true })
    // ResizeObserver catches viewport-driven overflow changes (font load,
    // dropdown insertion, container width).
    let ro: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => updateOverflow())
      ro.observe(el)
    }
    window.addEventListener('resize', updateOverflow)
    return () => {
      el.removeEventListener('scroll', updateOverflow)
      el.removeEventListener('scroll', onStripScroll)
      window.removeEventListener('resize', updateOverflow)
      ro?.disconnect()
    }
  }, [updateOverflow, closeDropdown])

  // Show circular chevrons only when the viewport has enough room for
  // them to sit comfortably outside the chip strip. On mobile / tablet
  // (<720px) the edge fades alone communicate "there's more" and the
  // user swipes natively.
  useEffect(() => {
    const onResize = () => {
      setShowChevrons(typeof window !== 'undefined' && window.innerWidth >= 720)
    }
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const scrollByDirection = useCallback((dir: 'left' | 'right') => {
    const el = scrollRef.current
    if (!el) return
    const distance = Math.round(el.clientWidth * CHEVRON_SCROLL_RATIO)
    el.scrollBy({ left: dir === 'left' ? -distance : distance, behavior: 'smooth' })
  }, [])

  return (
    <>
      <style jsx>{`
        .ys-cat-bar {
          position: sticky;
          top: ${TOPNAV_OFFSET_DESKTOP}px;
          z-index: 180;
          border-bottom: 1px solid ${T.rule};
          /* Varying tone from the white top menu: a soft slate wash so the
             category pills read as their own elegant band. */
          background: ${T.paper2};
        }
        @media (max-width: 720px) {
          .ys-cat-bar { top: ${TOPNAV_OFFSET_MOBILE}px; }
        }
        .ys-cat-bar-wrap {
          position: relative;
          max-width: 1280px;
          margin: 0 auto;
          padding: 0 28px;
        }
        @media (max-width: 720px) {
          .ys-cat-bar-wrap { padding: 0 16px; }
        }
        .ys-cat-strip {
          display: flex;
          align-items: center;
          gap: 4px;
          height: 52px;
          overflow-x: auto;
          scrollbar-width: none;
          -ms-overflow-style: none;
          scroll-behavior: smooth;
          -webkit-overflow-scrolling: touch;
        }
        .ys-cat-strip::-webkit-scrollbar { display: none; }
        .ys-cat-fade {
          position: absolute;
          top: 0;
          bottom: 1px;
          width: 56px;
          pointer-events: none;
          z-index: 2;
          opacity: 0;
          transition: opacity 0.15s ease-out;
        }
        .ys-cat-fade.left  { left: 0;  background: linear-gradient(to right, ${T.paper2} 30%, rgba(0,0,0,0)); }
        .ys-cat-fade.right { right: 0; background: linear-gradient(to left,  ${T.paper2} 30%, rgba(0,0,0,0)); }
        .ys-cat-fade.on { opacity: 1; }
        .ys-cat-chev {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 32px;
          height: 32px;
          border-radius: 999px;
          background: ${T.paper};
          border: 1px solid ${T.rule};
          box-shadow: 0 2px 8px rgba(29,36,51,0.10);
          display: flex;
          align-items: center;
          justify-content: center;
          color: ${T.cream};
          cursor: pointer;
          z-index: 3;
          transition: background 0.12s, transform 0.12s, opacity 0.12s;
        }
        .ys-cat-chev:hover  { background: ${T.paper2}; }
        .ys-cat-chev:active { transform: translateY(-50%) scale(0.94); }
        .ys-cat-chev.left  { left: 4px; }
        .ys-cat-chev.right { right: 4px; }
        .ys-cat-chev.hidden { opacity: 0; pointer-events: none; }
      `}</style>
      <div className="ys-cat-bar">
        <div className="ys-cat-bar-wrap">
          <div className={`ys-cat-fade left  ${canScrollLeft ? 'on' : ''}`}  aria-hidden="true" />
          <div className={`ys-cat-fade right ${canScrollRight ? 'on' : ''}`} aria-hidden="true" />
          {showChevrons && (
            <button
              type="button"
              className={`ys-cat-chev left ${canScrollLeft ? '' : 'hidden'}`}
              aria-label="Scroll categories left"
              onClick={() => scrollByDirection('left')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )}
          {showChevrons && (
            <button
              type="button"
              className={`ys-cat-chev right ${canScrollRight ? '' : 'hidden'}`}
              aria-label="Scroll categories right"
              onClick={() => scrollByDirection('right')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          )}
          <div ref={scrollRef} className="ys-cat-strip" role="tablist" aria-label="Browse marketplace categories">
            {CATEGORIES.map(cat => {
              const isActive = activeCategory === cat.id
              const isOpen = openId === cat.id
              const label = cat.name.replace(' Services', '')

              return (
                <div key={cat.id} style={{ position: 'relative', flexShrink: 0 }}>
                  <button
                    ref={el => { buttonRefs.current[cat.id] = el }}
                    type="button"
                    onClick={(e) => toggleCategory(cat.id, e.currentTarget.getBoundingClientRect())}
                    aria-haspopup="dialog"
                    aria-expanded={isOpen}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '0 16px',
                      height: '36px',
                      borderRadius: '999px',
                      border: `1px solid ${isOpen || isActive ? T.indigo : T.rule}`,
                      background: isOpen || isActive ? T.indigo : T.vellum,
                      boxShadow: isOpen ? 'none' : '0 1px 2px rgba(14,124,116,0.08)',
                      fontFamily: F.ui,
                      fontSize: '13.5px',
                      fontWeight: isActive || isOpen ? 700 : 600,
                      color: isOpen || isActive ? '#fff' : T.inkMid,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                      transition: 'all 0.18s cubic-bezier(0.22,1,0.36,1)',
                    }}
                    onMouseEnter={(e) => {
                      if (!isOpen && !isActive) {
                        e.currentTarget.style.color = T.indigo
                        e.currentTarget.style.borderColor = T.indigo
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isOpen) {
                        e.currentTarget.style.color = isActive ? '#fff' : T.inkMid
                        e.currentTarget.style.borderColor = isActive ? T.indigo : T.rule
                      }
                    }}
                  >
                    <span>{label}</span>
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ opacity: 0.7, flexShrink: 0 }}
                      aria-hidden="true"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                  {isActive && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: '2px',
                        background: T.indigo,
                        borderRadius: '1px',
                      }}
                    />
                  )}
                  {isOpen && (
                    <CategoryMegaDropdown
                      category={cat}
                      country={country}
                      anchorRect={anchorRect}
                      onClose={closeDropdown}
                      onNavigate={closeDropdown}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
