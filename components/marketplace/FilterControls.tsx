// @ts-nocheck
'use client'
import React from 'react'
import type { CSSProperties } from 'react'
import { C, Card, Btn, Badge } from '../design/shared'

const drawerOverlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.5)',
  zIndex: 1000,
  display: 'flex',
  alignItems: 'flex-end',
}

const drawerContent: CSSProperties = {
  width: '100%',
  maxWidth: '480px',
  margin: '0 auto',
  background: C.surface,
  borderTopLeftRadius: '20px',
  borderTopRightRadius: '20px',
  maxHeight: '90vh',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
}

const drawerHeader: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '20px',
  borderBottom: `1px solid ${C.border}`,
}

const drawerTitle: CSSProperties = {
  fontSize: '18px',
  fontWeight: 700,
  margin: 0,
  color: C.text,
}

const drawerBody: CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: '20px',
}

const drawerFooter: CSSProperties = {
  padding: '20px',
  borderTop: `1px solid ${C.border}`,
  display: 'flex',
  gap: '12px',
}

const closeButton: CSSProperties = {
  width: '32px',
  height: '32px',
  borderRadius: '50%',
  border: `1px solid ${C.border}`,
  background: C.surface2,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  color: C.text,
  fontSize: '18px',
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
  if (!isOpen) return null

  return (
    <div style={drawerOverlay} onClick={onClose}>
      <div style={drawerContent} onClick={e => e.stopPropagation()}>
        <div style={drawerHeader}>
          <h2 style={drawerTitle}>Filters</h2>
          <button onClick={onClose} style={closeButton} aria-label="Close">
            ×
          </button>
        </div>
        <div style={drawerBody}>{children}</div>
        <div style={drawerFooter}>
          {hasActiveFilters && (
            <Btn variant="secondary" onClick={onClear}>
              Clear all
            </Btn>
          )}
          <Btn variant="primary" onClick={onApply} style={{ flex: 1 }}>
            Apply Filters
          </Btn>
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

  const selectedOption = options.find(opt => opt.value === value)

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 16px',
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: '10px',
          color: C.text,
          fontSize: '14px',
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <span>Sort:</span>
        <span>{selectedOption?.label || 'Relevance'}</span>
        <span style={{ fontSize: '10px', opacity: 0.6 }}>▼</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '8px',
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: '12px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            zIndex: 100,
            minWidth: '200px',
            overflow: 'hidden',
          }}
        >
          {options.map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value)
                setOpen(false)
              }}
              style={{
                width: '100%',
                padding: '12px 16px',
                background: value === option.value ? `${C.cyan}10` : 'transparent',
                border: 'none',
                color: C.text,
                fontSize: '14px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                textAlign: 'left',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>{option.label}</span>
              {value === option.value && (
                <span style={{ color: C.cyan, fontSize: '12px' }}>✓</span>
              )}
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
    <div
      style={{
        display: 'flex',
        background: C.surface2,
        borderRadius: '10px',
        padding: '4px',
        border: `1px solid ${C.border}`,
      }}
    >
      <button
        type="button"
        onClick={() => onChange('grid')}
        style={{
          padding: '8px 12px',
          background: view === 'grid' ? C.surface : 'transparent',
          border: 'none',
          borderRadius: '8px',
          color: C.text,
          fontSize: '16px',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
        aria-label="Grid view"
      >
        ⊞
      </button>
      <button
        type="button"
        onClick={() => onChange('list')}
        style={{
          padding: '8px 12px',
          background: view === 'list' ? C.surface : 'transparent',
          border: 'none',
          borderRadius: '8px',
          color: C.text,
          fontSize: '16px',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
        aria-label="List view"
      >
        ☰
      </button>
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
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
        alignItems: 'center',
        padding: '12px 16px',
        background: `${C.cyan}08`,
        borderRadius: '12px',
        marginBottom: '20px',
      }}
    >
      <span style={{ fontSize: '13px', color: C.textMuted, fontWeight: 600 }}>Active filters:</span>
      {filters.map(filter => (
        <Badge
          key={filter.id}
          color="cyan"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 10px',
            cursor: 'pointer',
          }}
          onClick={() => onRemove(filter.id)}
        >
          {filter.label}
          <span style={{ fontSize: '10px' }}>×</span>
        </Badge>
      ))}
      <button
        onClick={onClearAll}
        style={{
          fontSize: '13px',
          color: C.cyan,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontWeight: 600,
          padding: '4px 8px',
        }}
      >
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
    <div style={{ fontSize: '14px', color: C.textMuted }}>
      <span style={{ fontWeight: 700, color: C.text }}>{total}</span> services found
      {showing < total && ` (showing ${showing})`}
    </div>
  )
}
