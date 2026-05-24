'use client'

import React from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { T, F } from './tokens'

interface Props {
  active: 'all' | 'us' | 'uk' | 'ca'
}

const OPTIONS: { value: Props['active']; label: string }[] = [
  { value: 'all', label: 'All jurisdictions' },
  { value: 'us', label: 'United States' },
  { value: 'uk', label: 'United Kingdom' },
  { value: 'ca', label: 'Canada' },
]

export function JurisdictionDropdown({ active }: Props) {
  const [open, setOpen] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  React.useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
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

  const activeLabel = OPTIONS.find(o => o.value === active)?.label ?? 'All jurisdictions'

  const handleSelect = (value: Props['active']) => {
    setOpen(false)
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    if (value === 'all') {
      params.delete('country')
    } else {
      params.set('country', value)
    }
    const query = params.toString()
    router.push(`${pathname ?? ''}${query ? `?${query}` : ''}`)
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '0 14px',
          height: '32px',
          borderRadius: '999px',
          border: `1px solid ${T.rule}`,
          background: T.vellum,
          fontFamily: F.ui,
          fontSize: '13px',
          fontWeight: 500,
          color: T.inkSoft,
          cursor: 'pointer',
          transition: 'all 0.12s',
          minWidth: '180px',
          ...(open
            ? { background: T.ink, color: '#fff', borderColor: T.ink }
            : {}),
        }}
        onMouseEnter={(e) => {
          if (!open) {
            e.currentTarget.style.color = T.ink
            e.currentTarget.style.borderColor = T.inkMid
          }
        }}
        onMouseLeave={(e) => {
          if (!open) {
            e.currentTarget.style.color = T.inkSoft
            e.currentTarget.style.borderColor = T.rule
          }
        }}
      >
        <span aria-hidden="true">🌐</span>
        <span>{activeLabel}</span>
        <span aria-hidden="true" style={{ marginLeft: 'auto', fontSize: '10px' }}>▼</span>
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            zIndex: 220,
            minWidth: '220px',
            background: T.vellum,
            border: `1px solid ${T.rule}`,
            borderRadius: '12px',
            boxShadow: '0 20px 40px -16px rgba(15,23,42,0.18)',
            padding: '6px',
            fontFamily: F.ui,
          }}
        >
          {OPTIONS.map(opt => {
            const isActive = opt.value === active
            return (
              <div
                key={opt.value}
                role="option"
                aria-selected={isActive}
                onClick={() => handleSelect(opt.value)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  color: T.ink,
                  cursor: 'pointer',
                  fontWeight: isActive ? 600 : 400,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = T.paper2
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                <span>{opt.label}</span>
                {isActive && <span style={{ color: T.indigo, fontWeight: 600 }}>✓</span>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
