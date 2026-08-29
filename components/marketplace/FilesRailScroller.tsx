'use client'

import { useEffect, useRef, useState } from 'react'
import type { FileShopProduct } from '@/lib/files-shop-catalog'

const STEP_MS = 4500

export function FilesRailScroller({ products }: { products: FileShopProduct[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const pausedRef = useRef(false)
  const [canForward, setCanForward] = useState(true)

  const measure = () => {
    const el = scrollerRef.current
    if (!el) return
    setCanForward(el.scrollLeft + el.clientWidth < el.scrollWidth - 8)
  }

  const scrollByCard = (dir: 1 | -1) => {
    const el = scrollerRef.current
    if (!el) return
    const card = el.querySelector<HTMLElement>('.cw-files-card')
    const delta = (card ? card.offsetWidth + 14 : 234) * dir
    const max = el.scrollWidth - el.clientWidth
    let next = el.scrollLeft + delta
    if (dir > 0 && next >= max - 4) next = 0
    if (dir < 0 && next < 0) next = max
    el.scrollTo({ left: next, behavior: 'smooth' })
  }

  useEffect(() => {
    measure()
    const el = scrollerRef.current
    if (!el) return
    el.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    const id = window.setInterval(() => {
      if (pausedRef.current) return
      scrollByCard(1)
    }, STEP_MS)
    return () => {
      el.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
      window.clearInterval(id)
    }
  }, [])

  return (
    <div
      className="cw-files-scroller-wrap"
      onMouseEnter={() => { pausedRef.current = true }}
      onMouseLeave={() => { pausedRef.current = false }}
      onFocusCapture={() => { pausedRef.current = true }}
      onBlurCapture={() => { pausedRef.current = false }}
    >
      <div ref={scrollerRef} className="cw-files-scroller">
        {products.map((p) => (
          <a key={p.id} className="cw-files-card" href={p.href} rel="noopener noreferrer">
            <img src={p.cover} alt="" width="196" height="124" />
            <div className="body">
              <h3>{p.title}</h3>
              <div className="price">${p.price}</div>
            </div>
          </a>
        ))}
      </div>
      {canForward && (
        <button
          type="button"
          className="cw-files-scroller-next"
          aria-label="Show more instant downloads"
          onClick={() => {
            pausedRef.current = true
            scrollByCard(1)
            window.setTimeout(() => { pausedRef.current = false }, 8000)
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      )}
    </div>
  )
}
