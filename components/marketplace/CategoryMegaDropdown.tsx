'use client'

import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import type { Category } from '@/lib/categories'
import { T, F } from './tokens'

interface Props {
  category: Category
  country: 'all' | 'us' | 'uk' | 'ca'
  anchorRect: DOMRect | null
  onClose: () => void
  onNavigate: () => void
}

export function CategoryMegaDropdown({ category, country, anchorRect, onClose, onNavigate }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [portalNode, setPortalNode] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    const node = document.createElement('div')
    document.body.appendChild(node)
    setPortalNode(node)
    return () => {
      document.body.removeChild(node)
    }
  }, [])

  useEffect(() => {
    if (!anchorRect) return
    const onDocClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [anchorRect, onClose])

  if (!anchorRect || !portalNode) return null

  const left = Math.min(anchorRect.left, window.innerWidth - 16 - 380)

  const buildHref = (subId?: string) => {
    const params = new URLSearchParams()
    params.set('category', category.id)
    if (subId) params.set('subcategory', subId)
    if (country !== 'all') params.set('country', country)
    return `/marketplace?${params.toString()}`
  }

  const subs = category.subcategories.slice(0, 12)

  const node = (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={`${category.name} subcategories`}
      style={{
        position: 'fixed',
        top: `${anchorRect.bottom + 8}px`,
        left: `${left}px`,
        zIndex: 240,
        width: '380px',
        maxWidth: 'calc(100vw - 32px)',
        background: T.vellum,
        border: `1px solid ${T.rule}`,
        borderRadius: '14px',
        padding: '22px 24px',
        boxShadow: '0 30px 60px -20px rgba(15,23,42,0.25)',
        fontFamily: F.ui,
      }}
    >
      <div
        style={{
          fontFamily: F.display,
          fontSize: '19px',
          fontWeight: 500,
          color: T.ink,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '6px',
        }}
      >
        <span aria-hidden="true">{category.icon}</span>
        <span>{category.name.replace(' Services', '')}</span>
      </div>
      <p
        style={{
          fontSize: '13px',
          lineHeight: 1.5,
          color: T.inkMid,
          margin: '0 0 14px',
        }}
      >
        {category.description}
      </p>

      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '6px 18px',
        }}
      >
        {subs.map(sub => (
          <li key={sub.id}>
            <Link
              href={buildHref(sub.id)}
              onClick={onNavigate}
              style={{
                display: 'block',
                padding: '5px 0',
                fontSize: '13px',
                color: T.inkMid,
                borderBottom: '1px dashed transparent',
                textDecoration: 'none',
                transition: 'all 0.12s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = T.ink
                e.currentTarget.style.borderBottomColor = T.rule
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = T.inkMid
                e.currentTarget.style.borderBottomColor = 'transparent'
              }}
            >
              {sub.name}
            </Link>
          </li>
        ))}
      </ul>

      <Link
        href={buildHref()}
        onClick={onNavigate}
        style={{
          display: 'block',
          marginTop: '14px',
          paddingTop: '10px',
          borderTop: `1px solid ${T.rule}`,
          fontFamily: F.mono,
          fontSize: '11px',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: T.indigo,
          textDecoration: 'none',
          transition: 'color 0.12s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = T.indigoDeep
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = T.indigo
        }}
      >
        See all {category.name} →
      </Link>
    </div>
  )

  return createPortal(node, portalNode)
}
