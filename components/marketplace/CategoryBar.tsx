'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { CATEGORIES } from '@/lib/categories'
import { T, F } from './tokens'
import { CategoryMegaDropdown } from './CategoryMegaDropdown'

interface Props {
  country: 'all' | 'us' | 'uk' | 'ca'
}

export function CategoryBar({ country }: Props) {
  const searchParams = useSearchParams()
  const activeCategory = searchParams?.get('category') ?? ''
  const [openId, setOpenId] = useState<string | null>(null)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({})

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

  return (
    <div
      style={{
        borderBottom: `1px solid ${T.rule}`,
        background: T.vellum,
      }}
    >
      <div
        style={{
          maxWidth: '1280px',
          margin: '0 auto',
          padding: '0 28px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          height: '52px',
          overflowX: 'auto',
          scrollbarWidth: 'none',
        }}
      >
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
                  padding: '0 14px',
                  height: '36px',
                  borderRadius: '999px',
                  border: '1px solid transparent',
                  background: isOpen ? T.ink : 'transparent',
                  fontFamily: F.ui,
                  fontSize: '13.5px',
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? T.ink : isOpen ? '#fff' : T.inkMid,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  transition: 'all 0.12s',
                }}
                onMouseEnter={(e) => {
                  if (!isOpen) {
                    e.currentTarget.style.color = T.ink
                    e.currentTarget.style.background = T.paper2
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isOpen) {
                    e.currentTarget.style.color = isActive ? T.ink : T.inkMid
                    e.currentTarget.style.background = 'transparent'
                  }
                }}
              >
                <span aria-hidden="true">{cat.icon}</span>
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
  )
}
