'use client'
import { useState } from 'react'

interface FaqItem {
  q: string
  a: string
}

/**
 * On-page FAQ list with dynamic behavior — items auto-open on cursor
 * hover and auto-close on cursor leave. Click toggles "pinned" so the
 * answer stays after the cursor moves away.
 */
export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [hovered, setHovered] = useState<number | null>(null)
  const [pinned, setPinned] = useState<Set<number>>(new Set())

  const togglePin = (i: number) => {
    setPinned((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  return (
    <div className="faq-grid">
      {items.map((it, i) => {
        const isOpen = hovered === i || pinned.has(i)
        return (
          <div
            key={it.q}
            className={`faq-item${isOpen ? ' is-open' : ''}`}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            <button
              type="button"
              onClick={() => togglePin(i)}
              className="faq-summary"
              aria-expanded={isOpen}
            >
              <span>{it.q}</span>
              <span className="faq-sym" aria-hidden="true">{isOpen ? '−' : '+'}</span>
            </button>
            {isOpen && <p className="faq-body">{it.a}</p>}
          </div>
        )
      })}
    </div>
  )
}
