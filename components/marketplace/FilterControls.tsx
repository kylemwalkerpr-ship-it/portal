// @ts-nocheck
'use client'
import React from 'react'
import type { CSSProperties } from 'react'
import { Btn, Badge } from '../design/shared'
import { T } from './tokens'

const DISCOVERY_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Helvetica, Arial, sans-serif"

const drawerOverlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15,23,42,0.46)',
  zIndex: 1000,
  display: 'flex',
  alignItems: 'flex-end',
}

const drawerContent: CSSProperties = {
  width: '100%',
  maxWidth: '520px',
  margin: '0 auto',
  background: T.vellum,
  borderTopLeftRadius: 20,
  borderTopRightRadius: 20,
  maxHeight: '92dvh',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: DISCOVERY_FONT,
}

const drawerHeader: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '20px 22px',
  borderBottom: `1px solid ${T.rule}`,
}

const drawerTitle: CSSProperties = {
  fontSize: 19,
  fontWeight: 720,
  letterSpacing: '-0.015em',
  margin: 0,
  color: T.ink,
}

const drawerBody: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'auto',
  padding: 22,
}

const drawerFooter: CSSProperties = {
  padding: 18,
  borderTop: `1px solid ${T.rule}`,
  display: 'flex',
  gap: 12,
  background: T.vellum,
}

const closeButton: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: '50%',
  border: `1px solid ${T.rule}`,
  background: T.paper2,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  color: T.ink,
  fontSize: 20,
}

interface FilterDrawerProps {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  onApply: () => void
  onClear: () => void
  hasActiveFilters: boolean
}

export function FilterDrawer({ isOpen, onClose, children, onApply, onClear, hasActiveFilters }: FilterDrawerProps) {
  React.useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="ys-filter-drawer" style={drawerOverlay} onClick={onClose} role="presentation">
      <div style={drawerContent} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Marketplace filters">
        <div style={drawerHeader}>
          <h2 style={drawerTitle}>All filters</h2>
          <button onClick={onClose} style={closeButton} aria-label="Close filters">×</button>
        </div>
        <div style={drawerBody}>{children}</div>
        <div style={drawerFooter}>
          {hasActiveFilters && <Btn variant="secondary" onClick={onClear}>Clear all</Btn>}
          <Btn variant="primary" onClick={onApply} style={{ flex: 1 }}>Show results</Btn>
        </div>
      </div>
    </div>
  )
}

interface SortDropdownProps {
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}

export function SortDropdown({ value, onChange, options }: SortDropdownProps) {
  const [open, setOpen] = React.useState(false)
  const dropdownRef = React.useRef<HTMLDivElement>(null)
  const selectedOption = options.find((opt) => opt.value === value)

  React.useEffect(() => {
    if (!open) return
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setOpen(false)
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  return (
    <div ref={dropdownRef} className="ys-sort-dropdown" style={{ position: 'relative', fontFamily: DISCOVERY_FONT }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="listbox"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          minHeight: 42,
          padding: '0 4px',
          background: 'transparent',
          border: 0,
          color: T.ink,
          fontFamily: DISCOVERY_FONT,
          fontSize: 14,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ color: T.inkSoft, fontWeight: 500 }}>Sort by:</span>
        <strong style={{ fontWeight: 720 }}>{selectedOption?.label || 'Recommended'}</strong>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s ease' }}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 8,
            background: T.vellum,
            border: `1px solid ${T.rule}`,
            borderRadius: 12,
            boxShadow: '0 18px 42px rgba(15,23,42,.14)',
            zIndex: 180,
            minWidth: 220,
            padding: 6,
          }}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={value === option.value}
              onClick={() => { onChange(option.value); setOpen(false) }}
              style={{
                width: '100%',
                minHeight: 42,
                padding: '0 11px',
                background: value === option.value ? T.paper2 : 'transparent',
                border: 0,
                borderRadius: 8,
                color: T.ink,
                fontFamily: DISCOVERY_FONT,
                fontSize: 14,
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>{option.label}</span>
              {value === option.value && <span style={{ color: T.ink, fontSize: 12 }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface ViewToggleProps {
  view: 'grid' | 'list'
  onChange: (view: 'grid' | 'list') => void
}

export function ViewToggle({ view, onChange }: ViewToggleProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: 2, border: `1px solid ${T.rule}`, borderRadius: 9, background: T.vellum }}>
      <button type="button" onClick={() => onChange('grid')} style={{ width: 36, height: 34, display: 'grid', placeItems: 'center', background: view === 'grid' ? T.paper2 : 'transparent', border: 0, borderRadius: 7, color: T.ink, fontSize: 18, cursor: 'pointer' }} aria-label="Grid view" aria-pressed={view === 'grid'}>⊞</button>
      <button type="button" onClick={() => onChange('list')} style={{ width: 36, height: 34, display: 'grid', placeItems: 'center', background: view === 'list' ? T.paper2 : 'transparent', border: 0, borderRadius: 7, color: T.ink, fontSize: 17, cursor: 'pointer' }} aria-label="List view" aria-pressed={view === 'list'}>☰</button>
    </div>
  )
}

interface ActiveFiltersProps {
  filters: Array<{ id: string; label: string }>
  onRemove: (id: string) => void
  onClearAll: () => void
}

export function ActiveFilters({ filters, onRemove, onClearAll }: ActiveFiltersProps) {
  if (filters.length === 0) return null

  return (
    <div className="ys-active-filters" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', margin: '-4px 0 16px', fontFamily: DISCOVERY_FONT }}>
      {filters.map((filter) => (
        <button
          type="button"
          key={filter.id}
          onClick={() => onRemove(filter.id)}
          aria-label={`Remove ${filter.label} filter`}
          style={{
            minHeight: 34,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            padding: '0 11px',
            border: `1px solid ${T.rule}`,
            borderRadius: 999,
            background: T.vellum,
            color: T.inkMid,
            fontFamily: DISCOVERY_FONT,
            fontSize: 12.5,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {filter.label}<span aria-hidden="true" style={{ fontSize: 15, lineHeight: 1 }}>×</span>
        </button>
      ))}
      <button type="button" onClick={onClearAll} style={{ minHeight: 34, padding: '0 6px', border: 0, background: 'transparent', color: T.inkMid, fontFamily: DISCOVERY_FONT, fontSize: 12.5, fontWeight: 650, cursor: 'pointer' }}>
        Clear all
      </button>
    </div>
  )
}

interface ResultsCountProps {
  total: number
  showing: number
}

export function ResultsCount({ total, showing }: ResultsCountProps) {
  return (
    <div className="ys-results-count" style={{ marginTop: 7, fontFamily: DISCOVERY_FONT, fontSize: 14, lineHeight: 1.4, color: T.inkSoft }}>
      <span style={{ fontWeight: 520 }}>{total.toLocaleString('en-US')} result{total === 1 ? '' : 's'}</span>
      {showing < total && <span style={{ opacity: .76 }}> · showing {showing.toLocaleString('en-US')}</span>}
    </div>
  )
}
