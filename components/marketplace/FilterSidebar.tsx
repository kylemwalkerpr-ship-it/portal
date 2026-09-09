// @ts-nocheck
'use client'

import React from 'react'
import type { CSSProperties } from 'react'
import { Badge, Btn } from '../design/shared'
import { T } from './tokens'

const DISCOVERY_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Helvetica, Arial, sans-serif"

interface FilterOption {
  id: string
  label: string
  count?: number
}

interface FilterSectionProps {
  title: string
  options: FilterOption[]
  selected: string[]
  onChange: (selected: string[]) => void
  showCount?: boolean
}

const rowStyle: CSSProperties = {
  minHeight: 40,
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  cursor: 'pointer',
  fontFamily: DISCOVERY_FONT,
  fontSize: 14,
  lineHeight: 1.35,
  color: T.ink,
}

const checkboxStyle: CSSProperties = {
  width: 18,
  height: 18,
  flex: '0 0 18px',
  cursor: 'pointer',
  accentColor: T.ink,
}

const sectionTitle: CSSProperties = {
  margin: '0 0 8px',
  fontFamily: DISCOVERY_FONT,
  fontSize: 11,
  fontWeight: 750,
  letterSpacing: '.08em',
  textTransform: 'uppercase',
  color: T.inkSoft,
}

const rangeInput: CSSProperties = {
  width: '100%',
  minWidth: 0,
  height: 44,
  boxSizing: 'border-box',
  padding: '0 12px',
  border: `1px solid ${T.rule}`,
  borderRadius: 9,
  background: T.vellum,
  color: T.ink,
  fontFamily: DISCOVERY_FONT,
  fontSize: 14,
  outline: 'none',
}

function toggleValue(selected: string[], id: string) {
  return selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]
}

function countLabel(value: number) {
  if (value >= 1000) return `${Math.floor(value / 1000)}k+`
  return String(value)
}

export function FilterSection({ title, options, selected, onChange, showCount = false }: FilterSectionProps) {
  return (
    <section className="ys-filter-expanded-section">
      <h3 style={sectionTitle}>{title}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {options.map((option) => (
          <label key={option.id} style={rowStyle}>
            <input
              type="checkbox"
              checked={selected.includes(option.id)}
              onChange={() => onChange(toggleValue(selected, option.id))}
              style={checkboxStyle}
            />
            <span style={{ flex: 1 }}>{option.label}</span>
            {showCount && option.count !== undefined && (
              <span style={{ color: T.inkSoft, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                {countLabel(option.count)}
              </span>
            )}
          </label>
        ))}
      </div>
    </section>
  )
}

interface PriceRangeProps {
  min: string
  max: string
  onChange: (min: string, max: string) => void
}

export function PriceRange({ min, max, onChange }: PriceRangeProps) {
  return (
    <section className="ys-filter-expanded-section">
      <h3 style={sectionTitle}>Budget</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label style={{ color: T.inkSoft, fontFamily: DISCOVERY_FONT, fontSize: 12 }}>
          Minimum
          <input type="number" min="0" placeholder="Any" value={min} onChange={(e) => onChange(e.target.value, max)} style={{ ...rangeInput, marginTop: 6 }} />
        </label>
        <label style={{ color: T.inkSoft, fontFamily: DISCOVERY_FONT, fontSize: 12 }}>
          Maximum
          <input type="number" min="0" placeholder="Any" value={max} onChange={(e) => onChange(min, e.target.value)} style={{ ...rangeInput, marginTop: 6 }} />
        </label>
      </div>
    </section>
  )
}

interface RatingFilterProps {
  selected: string
  onChange: (rating: string) => void
}

export function RatingFilter({ selected, onChange }: RatingFilterProps) {
  const ratings = [
    { id: '4.5', label: '4.5 and above' },
    { id: '4', label: '4.0 and above' },
    { id: '3', label: '3.0 and above' },
  ]

  return (
    <section className="ys-filter-expanded-section">
      <h3 style={sectionTitle}>Minimum rating</h3>
      {ratings.map((rating) => (
        <label key={rating.id} style={rowStyle}>
          <input
            type="radio"
            name="rating"
            checked={selected === rating.id}
            onChange={() => onChange(rating.id)}
            style={checkboxStyle}
          />
          <span style={{ flex: 1 }}>{rating.label}</span>
          <span aria-hidden="true">★</span>
        </label>
      ))}
      {selected && (
        <button type="button" onClick={() => onChange('')} style={{ marginTop: 6, padding: 0, border: 0, background: 'transparent', color: T.inkMid, fontFamily: DISCOVERY_FONT, fontSize: 13, fontWeight: 650, cursor: 'pointer' }}>
          Clear rating
        </button>
      )}
    </section>
  )
}

interface DeliveryTimeProps {
  selected: string[]
  onChange: (selected: string[]) => void
}

export function DeliveryTime({ selected, onChange }: DeliveryTimeProps) {
  const options = [
    { id: '1', label: 'Within 24 hours' },
    { id: '3', label: 'Within 3 days' },
    { id: '7', label: 'Within 7 days' },
    { id: '14', label: '14 days or longer' },
  ]

  return (
    <section className="ys-filter-expanded-section">
      <h3 style={sectionTitle}>Delivery time</h3>
      {options.map((option) => (
        <label key={option.id} style={rowStyle}>
          <input type="checkbox" checked={selected.includes(option.id)} onChange={() => onChange(toggleValue(selected, option.id))} style={checkboxStyle} />
          <span>{option.label}</span>
        </label>
      ))}
    </section>
  )
}

interface FilterSidebarProps {
  categories: FilterOption[]
  providerTypes: FilterOption[]
  jurisdictions?: FilterOption[]
  selectedCategories: string[]
  selectedProviderTypes: string[]
  selectedJurisdictions?: string[]
  minPrice: string
  maxPrice: string
  selectedRating: string
  selectedDeliveryTimes: string[]
  onCategoriesChange: (selected: string[]) => void
  onProviderTypesChange: (selected: string[]) => void
  onJurisdictionsChange?: (selected: string[]) => void
  onPriceChange: (min: string, max: string) => void
  onRatingChange: (rating: string) => void
  onDeliveryTimesChange: (selected: string[]) => void
  onClear: () => void
  onApply: () => void
  hasActiveFilters: boolean
}

function SelectionCount({ value }: { value: number }) {
  if (!value) return null
  return (
    <span className="ys-filter-count">
      {value}
    </span>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms ease', opacity: .72 }}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

function Popover({
  id,
  label,
  selectedCount,
  openId,
  setOpenId,
  children,
}: {
  id: string
  label: string
  selectedCount: number
  openId: string | null
  setOpenId: (value: string | null) => void
  children: React.ReactNode
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const open = openId === id

  React.useEffect(() => {
    if (!open) return
    const closeOutside = (event: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpenId(null)
    }
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenId(null)
    }
    document.addEventListener('mousedown', closeOutside)
    document.addEventListener('touchstart', closeOutside)
    document.addEventListener('keydown', closeEscape)
    return () => {
      document.removeEventListener('mousedown', closeOutside)
      document.removeEventListener('touchstart', closeOutside)
      document.removeEventListener('keydown', closeEscape)
    }
  }, [open, setOpenId])

  return (
    <div className="ys-filter-popover-wrap" ref={ref}>
      <button type="button" className={`ys-filter-pill${open || selectedCount ? ' is-active' : ''}`} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpenId(open ? null : id)}>
        <span>{label}</span>
        <SelectionCount value={selectedCount} />
        <Chevron open={open} />
      </button>
      {open && <div className="ys-filter-popover" role="dialog" aria-label={`${label} filters`}>{children}</div>}
    </div>
  )
}

function ToggleControl({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" className="ys-filter-toggle" aria-pressed={active} onClick={onClick}>
      <span className={`ys-filter-toggle-track${active ? ' is-on' : ''}`} aria-hidden="true"><span /></span>
      <span>{label}</span>
    </button>
  )
}

export function FilterSidebar({
  categories,
  providerTypes,
  jurisdictions = [],
  selectedCategories,
  selectedProviderTypes,
  selectedJurisdictions = [],
  minPrice,
  maxPrice,
  selectedRating,
  selectedDeliveryTimes,
  onCategoriesChange,
  onProviderTypesChange,
  onJurisdictionsChange,
  onPriceChange,
  onRatingChange,
  onDeliveryTimesChange,
  onClear,
  onApply,
  hasActiveFilters,
}: FilterSidebarProps) {
  const [openId, setOpenId] = React.useState<string | null>(null)
  const providerCount = selectedProviderTypes.length + selectedJurisdictions.length + (selectedRating ? 1 : 0)
  const budgetCount = minPrice || maxPrice ? 1 : 0
  const attorneysOnly = selectedProviderTypes.length === 1 && selectedProviderTypes[0] === 'attorney'
  const fastDelivery = selectedDeliveryTimes.includes('3')

  return (
    <aside className="ys-discovery-filters" aria-label="Marketplace filters">
      <div className="ys-filter-desktop-row">
        <Popover id="service" label="Service options" selectedCount={selectedCategories.length} openId={openId} setOpenId={setOpenId}>
          <h3 style={sectionTitle}>Categories</h3>
          <div className="ys-filter-scroll-list">
            {categories.map((option) => (
              <label key={option.id} style={rowStyle}>
                <input type="checkbox" checked={selectedCategories.includes(option.id)} onChange={() => onCategoriesChange(toggleValue(selectedCategories, option.id))} style={checkboxStyle} />
                <span style={{ flex: 1 }}>{option.label}</span>
                {option.count !== undefined && <span className="ys-filter-option-count">{countLabel(option.count)}</span>}
              </label>
            ))}
          </div>
        </Popover>

        <Popover id="provider" label="Provider details" selectedCount={providerCount} openId={openId} setOpenId={setOpenId}>
          <h3 style={sectionTitle}>Provider type</h3>
          {providerTypes.map((option) => (
            <label key={option.id} style={rowStyle}>
              <input type="checkbox" checked={selectedProviderTypes.includes(option.id)} onChange={() => onProviderTypesChange(toggleValue(selectedProviderTypes, option.id))} style={checkboxStyle} />
              <span style={{ flex: 1 }}>{option.label}</span>
              {option.count !== undefined && <span className="ys-filter-option-count">{countLabel(option.count)}</span>}
            </label>
          ))}
          {jurisdictions.length > 0 && onJurisdictionsChange && (
            <>
              <div className="ys-filter-divider" />
              <h3 style={sectionTitle}>Jurisdiction</h3>
              {jurisdictions.map((option) => (
                <label key={option.id} style={rowStyle}>
                  <input type="checkbox" checked={selectedJurisdictions.includes(option.id)} onChange={() => onJurisdictionsChange(toggleValue(selectedJurisdictions, option.id))} style={checkboxStyle} />
                  <span style={{ flex: 1 }}>{option.label}</span>
                  {option.count !== undefined && <span className="ys-filter-option-count">{countLabel(option.count)}</span>}
                </label>
              ))}
            </>
          )}
          <div className="ys-filter-divider" />
          <h3 style={sectionTitle}>Minimum rating</h3>
          {[
            { id: '4.5', label: '4.5 and above' },
            { id: '4', label: '4.0 and above' },
            { id: '3', label: '3.0 and above' },
          ].map((rating) => (
            <label key={rating.id} style={rowStyle}>
              <input type="radio" name="ys-desktop-rating" checked={selectedRating === rating.id} onChange={() => onRatingChange(rating.id)} style={checkboxStyle} />
              <span style={{ flex: 1 }}>{rating.label}</span><span aria-hidden="true">★</span>
            </label>
          ))}
          {selectedRating && <button type="button" className="ys-filter-clear-inline" onClick={() => onRatingChange('')}>Clear rating</button>}
        </Popover>

        <Popover id="budget" label="Budget" selectedCount={budgetCount} openId={openId} setOpenId={setOpenId}>
          <h3 style={sectionTitle}>Price range</h3>
          <div className="ys-filter-budget-grid">
            <label>Minimum<input type="number" min="0" placeholder="Any" value={minPrice} onChange={(e) => onPriceChange(e.target.value, maxPrice)} style={rangeInput} /></label>
            <label>Maximum<input type="number" min="0" placeholder="Any" value={maxPrice} onChange={(e) => onPriceChange(minPrice, e.target.value)} style={rangeInput} /></label>
          </div>
          <p className="ys-filter-help">Enter whole currency units. Leave either side open.</p>
        </Popover>

        <Popover id="delivery" label="Delivery time" selectedCount={selectedDeliveryTimes.length} openId={openId} setOpenId={setOpenId}>
          <h3 style={sectionTitle}>Turnaround</h3>
          {[
            { id: '1', label: 'Within 24 hours' },
            { id: '3', label: 'Within 3 days' },
            { id: '7', label: 'Within 7 days' },
            { id: '14', label: '14 days or longer' },
          ].map((option) => (
            <label key={option.id} style={rowStyle}>
              <input type="checkbox" checked={selectedDeliveryTimes.includes(option.id)} onChange={() => onDeliveryTimesChange(toggleValue(selectedDeliveryTimes, option.id))} style={checkboxStyle} />
              <span>{option.label}</span>
            </label>
          ))}
        </Popover>

        <div className="ys-filter-quick-controls">
          <ToggleControl active={attorneysOnly} label="Attorneys only" onClick={() => onProviderTypesChange(attorneysOnly ? [] : ['attorney'])} />
          <ToggleControl active={fastDelivery} label="Delivery ≤ 3 days" onClick={() => onDeliveryTimesChange(fastDelivery ? selectedDeliveryTimes.filter((value) => value !== '3') : [...selectedDeliveryTimes.filter((value) => value !== '14'), '3'])} />
        </div>

        {hasActiveFilters && <button type="button" className="ys-filter-clear-all" onClick={onClear}>Clear all</button>}
      </div>

      <div className="ys-filter-mobile-expanded">
        {jurisdictions.length > 0 && onJurisdictionsChange && <FilterSection title="Jurisdiction" options={jurisdictions} selected={selectedJurisdictions} onChange={onJurisdictionsChange} showCount />}
        <FilterSection title="Service options" options={categories} selected={selectedCategories} onChange={onCategoriesChange} showCount />
        <FilterSection title="Provider type" options={providerTypes} selected={selectedProviderTypes} onChange={onProviderTypesChange} showCount />
        <PriceRange min={minPrice} max={maxPrice} onChange={onPriceChange} />
        <RatingFilter selected={selectedRating} onChange={onRatingChange} />
        <DeliveryTime selected={selectedDeliveryTimes} onChange={onDeliveryTimesChange} />
        {hasActiveFilters && <Btn variant="secondary" fullWidth onClick={onClear}>Clear all</Btn>}
        <Btn variant="primary" fullWidth onClick={onApply}>Apply filters</Btn>
      </div>

      <style jsx global>{`
        /* Discovery is intentionally wide and horizontal: the permanent
           280px sidebar made the service cards feel cramped even on desktop.
           The filter row now owns that first grid slot and results use the
           full content width, like mature marketplace discovery surfaces. */
        @media (min-width: 1025px) {
          .ys-content-layout {
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 0 !important;
          }
          .ys-filter-sidebar {
            display: block !important;
            min-width: 0 !important;
            width: 100% !important;
            margin: 0 0 28px !important;
          }
        }

        .ys-discovery-filters {
          width: 100%;
          min-width: 0;
          font-family: ${DISCOVERY_FONT};
          color: ${T.ink};
        }
        .ys-filter-desktop-row {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
          min-width: 0;
          padding: 18px 0 22px;
          border-top: 1px solid ${T.ruleSoft};
          border-bottom: 1px solid ${T.ruleSoft};
        }
        .ys-filter-popover-wrap { position: relative; flex: 0 0 auto; }
        .ys-filter-pill {
          height: 48px;
          padding: 0 18px;
          border: 1px solid ${T.rule};
          border-radius: 10px;
          background: ${T.vellum};
          color: ${T.ink};
          display: inline-flex;
          align-items: center;
          gap: 10px;
          font-family: ${DISCOVERY_FONT};
          font-size: 15px;
          font-weight: 650;
          white-space: nowrap;
          cursor: pointer;
          box-shadow: 0 1px 0 rgba(15,23,42,.02);
          transition: border-color .15s ease, box-shadow .15s ease, background .15s ease;
        }
        .ys-filter-pill:hover,
        .ys-filter-pill.is-active {
          border-color: ${T.inkMid};
          box-shadow: 0 2px 8px rgba(15,23,42,.06);
        }
        .ys-filter-count {
          min-width: 20px;
          height: 20px;
          padding: 0 6px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: ${T.ink};
          color: #fff;
          font-size: 11px;
          font-weight: 750;
          line-height: 1;
        }
        .ys-filter-popover {
          position: absolute;
          top: calc(100% + 10px);
          left: 0;
          z-index: 160;
          width: 330px;
          max-width: min(92vw, 390px);
          max-height: 440px;
          overflow-y: auto;
          padding: 16px;
          background: ${T.vellum};
          border: 1px solid ${T.rule};
          border-radius: 14px;
          box-shadow: 0 20px 50px rgba(15,23,42,.14);
        }
        .ys-filter-scroll-list { max-height: 365px; overflow-y: auto; padding-right: 3px; }
        .ys-filter-option-count { color: ${T.inkSoft}; font-size: 12px; font-variant-numeric: tabular-nums; }
        .ys-filter-divider { height: 1px; background: ${T.ruleSoft}; margin: 13px 0; }
        .ys-filter-budget-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .ys-filter-budget-grid label { display: grid; gap: 6px; color: ${T.inkSoft}; font-size: 12px; }
        .ys-filter-help { margin: 10px 0 0; color: ${T.inkSoft}; font-size: 12px; line-height: 1.45; }
        .ys-filter-clear-inline,
        .ys-filter-clear-all {
          border: 0;
          background: transparent;
          color: ${T.inkMid};
          font-family: ${DISCOVERY_FONT};
          font-size: 13px;
          font-weight: 650;
          cursor: pointer;
        }
        .ys-filter-clear-all { margin-left: 4px; padding: 10px 4px; white-space: nowrap; }
        .ys-filter-clear-all:hover,
        .ys-filter-clear-inline:hover { color: ${T.ink}; text-decoration: underline; text-underline-offset: 3px; }
        .ys-filter-quick-controls {
          margin-left: auto;
          display: flex;
          align-items: center;
          gap: 16px;
          min-width: max-content;
        }
        .ys-filter-toggle {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          padding: 0;
          border: 0;
          background: transparent;
          color: ${T.inkMid};
          font-family: ${DISCOVERY_FONT};
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
        }
        .ys-filter-toggle-track {
          width: 34px;
          height: 20px;
          padding: 2px;
          border-radius: 999px;
          background: ${T.paper3};
          display: inline-flex;
          align-items: center;
          justify-content: flex-start;
          transition: background .15s ease;
        }
        .ys-filter-toggle-track.is-on { justify-content: flex-end; background: ${T.ink}; }
        .ys-filter-toggle-track > span {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #fff;
          box-shadow: 0 1px 3px rgba(15,23,42,.24);
        }
        .ys-filter-mobile-expanded { display: none; }
        .ys-filter-expanded-section { padding: 0 0 18px; margin: 0 0 18px; border-bottom: 1px solid ${T.ruleSoft}; }

        @media (max-width: 1280px) and (min-width: 1025px) {
          .ys-filter-desktop-row { overflow-x: auto; scrollbar-width: none; padding-bottom: 18px; }
          .ys-filter-desktop-row::-webkit-scrollbar { display: none; }
          .ys-filter-quick-controls { margin-left: 8px; }
        }

        @media (max-width: 1024px) {
          .ys-filter-desktop-row { display: none; }
          .ys-filter-mobile-expanded { display: block; }
          .ys-discovery-filters { width: 100%; }
        }
      `}</style>
    </aside>
  )
}
