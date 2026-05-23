'use client'
import { useEffect, useRef, useState } from 'react'

interface FaqItem {
  q: string
  a: string
}

interface Props {
  items: FaqItem[]
  /** Visible trigger label. */
  label?: string
}

/**
 * Topbar Help — opens on cursor hover/focus, stays open while the cursor is
 * over either the trigger or the panel, click toggles "pinned" so the panel
 * survives the next mouseleave. Outside-click or Escape closes.
 */
export function HelpDropdown({ items, label = 'Help' }: Props) {
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [openQ, setOpenQ] = useState<number | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }
  const scheduleClose = () => {
    cancelClose()
    closeTimer.current = setTimeout(() => {
      if (!pinned) setOpen(false)
    }, 160)
  }

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
        setPinned(false)
      }
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        setPinned(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', onDocClick)
      document.addEventListener('keydown', onEsc)
    }
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  return (
    <div
      ref={wrapRef}
      className="cw-help"
      onMouseEnter={() => {
        cancelClose()
        setOpen(true)
      }}
      onMouseLeave={scheduleClose}
      onFocus={() => setOpen(true)}
      style={{ position: 'relative', display: 'inline-block' }}
    >
      <button
        type="button"
        onClick={() => {
          if (open && pinned) {
            setOpen(false)
            setPinned(false)
          } else {
            setOpen(true)
            setPinned(true)
          }
        }}
        aria-haspopup="true"
        aria-expanded={open}
        className="cw-help-trigger"
      >
        <span className="cw-help-icon" aria-hidden="true">?</span>
        {label}
      </button>

      {open && (
        <div className="cw-help-panel" role="dialog" aria-label="Common questions">
          <div className="cw-help-panel-head">
            <span>Before you start</span>
            <span className="cw-help-panel-hint">{pinned ? 'Click trigger to close' : 'Move cursor away to close'}</span>
          </div>
          <ul className="cw-help-list">
            {items.map((item, i) => {
              const isOpen = openQ === i
              return (
                <li key={item.q} className={isOpen ? 'is-open' : ''}>
                  <button
                    type="button"
                    onClick={() => setOpenQ(isOpen ? null : i)}
                    onMouseEnter={() => setOpenQ(i)}
                    className="cw-help-q"
                    aria-expanded={isOpen}
                  >
                    <span>{item.q}</span>
                    <span className="cw-help-q-sym" aria-hidden="true">{isOpen ? '−' : '+'}</span>
                  </button>
                  {isOpen && <p className="cw-help-a">{item.a}</p>}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
