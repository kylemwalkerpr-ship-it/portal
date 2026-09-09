// @ts-nocheck
'use client'

import React from 'react'
import type { CSSProperties } from 'react'
import { T } from './tokens'

type Option = { id: string; label: string; count?: number }

type Props = {
  categories: Option[]
  providerTypes: Option[]
  jurisdictions: Option[]
  selectedCategories: string[]
  selectedProviderTypes: string[]
  selectedJurisdictions: string[]
  minPrice: string
  maxPrice: string
  selectedRating: string
  selectedDeliveryTimes: string[]
  onCategoriesChange: (value: string[]) => void
  onProviderTypesChange: (value: string[]) => void
  onJurisdictionsChange: (value: string[]) => void
  onPriceChange: (min: string, max: string) => void
  onRatingChange: (value: string) => void
  onDeliveryTimesChange: (value: string[]) => void
  onOpenAllFilters: () => void
  onResetPage: () => void
}

const uiFont = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Helvetica, Arial, sans-serif"

const pill: CSSProperties = {
  height: 48,
  padding: '0 18px',
  border: `1px solid ${T.rule}`,
  borderRadius: 10,
  background: T.vellum,
  color: T.ink,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
  fontFamily: uiFont,
  fontSize: 15,
  fontWeight: 650,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  boxShadow: '0 1px 0 rgba(15,23,42,0.02)',
}

const panel: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 10px)',
  left: 0,
  zIndex: 140,
  width: 330,
  maxWidth: 'min(92vw, 380px)',
  maxHeight: 430,
  overflowY: 'auto',
  padding: 16,
  background: T.vellum,
  border: `1px solid ${T.rule}`,
  borderRadius: 14,
  boxShadow: '0 18px 48px rgba(15,23,42,0.14)',
  fontFamily: uiFont,
}

const optionRow: CSSProperties = {
  minHeight: 38,
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  cursor: 'pointer',
  color: T.ink,
  fontSize: 14,
  lineHeight: 1.35,
}

const input: CSSProperties = {
  width: '100%',
  height: 44,
  border: `1px solid ${T.rule}`,
  borderRadius: 9,
  background: T.vellum,
  color: T.ink,
  padding: '0 12px',
  fontFamily: uiFont,
  fontSize: 14,
  outline: 'none',
}

function toggle(selected: string[], id: string) {
  return selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]
}

function countLabel(count: number) {
  return count > 999 ? `${Math.floor(count / 1000)}k+` : String(count)
}

function SelectionCount({ value }: { value: number }) {
  if (!value) return null
  return (
    <span style={{
      minWidth: 20,
      height: 20,
      padding: '0 6px',
      borderRadius: 999,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: T.ink,
      color: '#fff',
      fontSize: 11,
      fontWeight: 750,
      lineHeight: 1,
    }}>
      {value}
    </span>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms ease', opacity: 0.72 }}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

function FilterPopover({
  id,
  label,
  count = 0,
  openId,
  setOpenId,
  children,
}: {
  id: string
  label: string
  count?: number
  openId: string | null
  setOpenId: (value: string | null) => void
  children: React.ReactNode
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const open = openId === id

  React.useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpenId(null)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenId(null)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, setOpenId])

  return (
    <div ref={ref} style={{ position: 'relative', flex: '0 0 auto' }}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpenId(open ? null : id)}
        style={{
          ...pill,
          borderColor: open || count > 0 ? T.inkMid : T.rule,
          background: open ? T.paper2 : T.vellum,
        }}
      >
        <span>{label}</span>
        <SelectionCount value={count} />
        <Chevron open={open} />
      </button>
      {open && <div style={panel}>{children}</div>}
    </div>
  )
}

function OptionList({
  options,
  selected,
  onChange,
}: {
  options: Option[]
  selected: string[]
  onChange: (value: string[]) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {options.map((option) => (
        <label key={option.id} style={optionRow}>
          <input
            type="checkbox"
            checked={selected.includes(option.id)}
            onChange={() => onChange(toggle(selected, option.id))}
            style={{ width: 18, height: 18, accentColor: T.ink, flex: '0 0 18px' }}
          />
          <span style={{ flex: 1 }}>{option.label}</span>
          {option.count !== undefined && (
            <span style={{ color: T.inkSoft, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
              {countLabel(option.count)}
            </span>
          )}
        </label>
      ))}
    </div>
  )
}

function GroupTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      margin: '2px 0 8px',
      color: T.inkSoft,
      fontSize: 11,
      fontWeight: 750,
      letterSpacing: '.08em',
      textTransform: 'uppercase',
    }}>
      {children}
    </div>
  )
}

export function DiscoveryFilterBar(props: Props) {
  const [openId, setOpenId] = React.useState<string | null>(null)

  const providerCount = props.selectedProviderTypes.length + props.selectedJurisdictions.length + (props.selectedRating ? 1 : 0)
  const budgetCount = props.minPrice || props.maxPrice ? 1 : 0

  const setCategories = (value: string[]) => { props.onCategoriesChange(value); props.onResetPage() }
  const setProviderTypes = (value: string[]) => { props.onProviderTypesChange(value); props.onResetPage() }
  const setJurisdictions = (value: string[]) => { props.onJurisdictionsChange(value); props.onResetPage() }
  const setRating = (value: string) => { props.onRatingChange(value); props.onResetPage() }
  const setDelivery = (value: string[]) => { props.onDeliveryTimesChange(value); props.onResetPage() }

  const attorneysOnly = props.selectedProviderTypes.length === 1 && props.selectedProviderTypes[0] === 'attorney'
  const fastDelivery = props.selectedDeliveryTimes.includes('3')

  return (
    <div className="ys-discovery-filterbar" style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      minWidth: 0,
      fontFamily: uiFont,
    }}>
      <button
        type="button"
        className="ys-all-filters-trigger"
        onClick={props.onOpenAllFilters}
        style={{ ...pill, display: 'none' }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M4 6h16M7 12h10M10 18h4" />
        </svg>
        All filters
      </button>

      <FilterPopover
        id="service"
        label="Service options"
        count={props.selectedCategories.length}
        openId={openId}
        setOpenId={setOpenId}
      >
        <GroupTitle>Categories</GroupTitle>
        <OptionList options={props.categories} selected={props.selectedCategories} onChange={setCategories} />
      </FilterPopover>

      <FilterPopover
        id="provider"
        label="Provider details"
        count={providerCount}
        openId={openId}
        setOpenId={setOpenId}
      >
        <GroupTitle>Provider type</GroupTitle>
        <OptionList options={props.providerTypes} selected={props.selectedProviderTypes} onChange={setProviderTypes} />
        <div style={{ height: 1, background: T.ruleSoft, margin: '13px 0' }} />
        <GroupTitle>Jurisdiction</GroupTitle>
        <OptionList options={props.jurisdictions} selected={props.selectedJurisdictions} onChange={setJurisdictions} />
        <div style={{ height: 1, background: T.ruleSoft, margin: '13px 0' }} />
        <GroupTitle>Minimum rating</GroupTitle>
        {[
          { id: '4.5', label: '4.5 and above' },
          { id: '4', label: '4.0 and above' },
          { id: '3', label: '3.0 and above' },
        ].map((rating) => (
          <label key={rating.id} style={optionRow}>
            <input
              type="radio"
              name="ys-discovery-rating"
              checked={props.selectedRating === rating.id}
              onChange={() => setRating(rating.id)}
              style={{ width: 18, height: 18, accentColor: T.ink }}
            />
            <span style={{ flex: 1 }}>{rating.label}</span>
            <span aria-hidden="true">★</span>
          </label>
        ))}
        {props.selectedRating && (
          <button type="button" onClick={() => setRating('')} style={{ marginTop: 8, color: T.inkMid, fontSize: 13, fontWeight: 650, background: 'none', border: 0, cursor: 'pointer' }}>
            Clear rating
          </button>
        )}
      </FilterPopover>

      <FilterPopover
        id="budget"
        label="Budget"
        count={budgetCount}
        openId={openId}
        setOpenId={setOpenId}
      >
        <GroupTitle>Price range</GroupTitle>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label style={{ fontSize: 12, color: T.inkSoft }}>
            Minimum
            <input
              type="number"
              min="0"
              placeholder="Any"
              value={props.minPrice}
              onChange={(event) => { props.onPriceChange(event.target.value, props.maxPrice); props.onResetPage() }}
              style={{ ...input, marginTop: 6 }}
            />
          </label>
          <label style={{ fontSize: 12, color: T.inkSoft }}>
            Maximum
            <input
              type="number"
              min="0"
              placeholder="Any"
              value={props.maxPrice}
              onChange={(event) => { props.onPriceChange(props.minPrice, event.target.value); props.onResetPage() }}
              style={{ ...input, marginTop: 6 }}
            />
          </label>
        </div>
        <p style={{ margin: '10px 0 0', color: T.inkSoft, fontSize: 12, lineHeight: 1.45 }}>
          Enter whole currency units. You can leave either side open.
        </p>
      </FilterPopover>

      <FilterPopover
        id="delivery"
        label="Delivery time"
        count={props.selectedDeliveryTimes.length}
        openId={openId}
        setOpenId={setOpenId}
      >
        <GroupTitle>Turnaround</GroupTitle>
        <OptionList
          options={[
            { id: '1', label: 'Within 24 hours' },
            { id: '3', label: 'Within 3 days' },
            { id: '7', label: 'Within 7 days' },
            { id: '14', label: '14 days or longer' },
          ]}
          selected={props.selectedDeliveryTimes}
          onChange={setDelivery}
        />
      </FilterPopover>

      <div className="ys-discovery-quickfilters" style={{ marginLeft: 'auto', display: 'flex', gap: 16, alignItems: 'center', flex: '0 0 auto' }}>
        <button
          type="button"
          aria-pressed={attorneysOnly}
          onClick={() => setProviderTypes(attorneysOnly ? [] : ['attorney'])}
          className="ys-filter-toggle"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 9, border: 0, background: 'transparent', color: T.inkMid, fontFamily: uiFont, fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          <span aria-hidden="true" style={{
            width: 34,
            height: 20,
            borderRadius: 999,
            padding: 2,
            background: attorneysOnly ? T.ink : T.paper3,
            display: 'inline-flex',
            justifyContent: attorneysOnly ? 'flex-end' : 'flex-start',
            alignItems: 'center',
            transition: 'background 150ms ease',
          }}>
            <span style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(15,23,42,.22)' }} />
          </span>
          Attorneys only
        </button>

        <button
          type="button"
          aria-pressed={fastDelivery}
          onClick={() => setDelivery(fastDelivery ? props.selectedDeliveryTimes.filter((value) => value !== '3') : [...props.selectedDeliveryTimes.filter((value) => value !== '14'), '3'])}
          className="ys-filter-toggle"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 9, border: 0, background: 'transparent', color: T.inkMid, fontFamily: uiFont, fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          <span aria-hidden="true" style={{
            width: 34,
            height: 20,
            borderRadius: 999,
            padding: 2,
            background: fastDelivery ? T.ink : T.paper3,
            display: 'inline-flex',
            justifyContent: fastDelivery ? 'flex-end' : 'flex-start',
            alignItems: 'center',
            transition: 'background 150ms ease',
          }}>
            <span style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(15,23,42,.22)' }} />
          </span>
          Delivery ≤ 3 days
        </button>
      </div>
    </div>
  )
}
