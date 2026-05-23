// @ts-nocheck
'use client'
import React from 'react'
import type { CSSProperties } from 'react'
import { Card, Input, Select, Badge, Btn } from '../design/shared'
import { T, F } from './tokens'

const sidebarStyle: CSSProperties = {
  width: '280px',
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
}

const sectionStyle: CSSProperties = {
  borderBottom: `1px solid ${T.rule}`,
  paddingBottom: '20px',
}

const sectionTitle: CSSProperties = {
  fontSize: '11px',
  fontWeight: 700,
  color: T.ink,
  margin: '0 0 12px',
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  fontFamily: F.mono,
}

const checkboxStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '8px 0',
  cursor: 'pointer',
  fontSize: '14px',
  color: T.ink,
}

const checkboxInput: CSSProperties = {
  width: '18px',
  height: '18px',
  cursor: 'pointer',
  accentColor: T.indigo,
}

const rangeStyle: CSSProperties = {
  display: 'flex',
  gap: '8px',
  alignItems: 'center',
}

const rangeInput: CSSProperties = {
  flex: 1,
  padding: '8px 12px',
  border: `1px solid ${T.ruleSoft}`,
  borderRadius: '8px',
  background: T.paper2,
  color: T.ink,
  fontSize: '14px',
  fontFamily: 'inherit',
}

const clearButton: CSSProperties = {
  fontSize: '13px',
  color: T.indigo,
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontWeight: 600,
  padding: 0,
}

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

export function FilterSection({ title, options, selected, onChange, showCount = false }: FilterSectionProps) {
  const toggleOption = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter(s => s !== id))
    } else {
      onChange([...selected, id])
    }
  }

  return (
    <div style={sectionStyle}>
      <h3 style={sectionTitle}>{title}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {options.map(option => (
          <label key={option.id} style={checkboxStyle}>
            <input
              type="checkbox"
              checked={selected.includes(option.id)}
              onChange={() => toggleOption(option.id)}
              style={checkboxInput}
            />
            <span>{option.label}</span>
            {showCount && option.count !== undefined && (
              <Badge color="gray" style={{ marginLeft: 'auto', fontSize: '11px' }}>
                {option.count}
              </Badge>
            )}
          </label>
        ))}
      </div>
    </div>
  )
}

interface PriceRangeProps {
  min: string
  max: string
  onChange: (min: string, max: string) => void
}

export function PriceRange({ min, max, onChange }: PriceRangeProps) {
  return (
    <div style={sectionStyle}>
      <h3 style={sectionTitle}>Price Range</h3>
      <div style={rangeStyle}>
        <input
          type="number"
          placeholder="Min"
          value={min}
          onChange={e => onChange(e.target.value, max)}
          style={rangeInput}
        />
        <span>—</span>
        <input
          type="number"
          placeholder="Max"
          value={max}
          onChange={e => onChange(min, e.target.value)}
          style={rangeInput}
        />
      </div>
    </div>
  )
}

interface RatingFilterProps {
  selected: string
  onChange: (rating: string) => void
}

export function RatingFilter({ selected, onChange }: RatingFilterProps) {
  const ratings = [
    { id: '4.5', label: '4.5+ ★★★★★' },
    { id: '4', label: '4.0+ ★★★★' },
    { id: '3', label: '3.0+ ★★★' },
  ]

  return (
    <div style={sectionStyle}>
      <h3 style={sectionTitle}>Minimum Rating</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {ratings.map(rating => (
          <label key={rating.id} style={checkboxStyle}>
            <input
              type="radio"
              name="rating"
              checked={selected === rating.id}
              onChange={() => onChange(rating.id)}
              style={checkboxInput}
            />
            <span>{rating.label}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

interface DeliveryTimeProps {
  selected: string[]
  onChange: (selected: string[]) => void
}

export function DeliveryTime({ selected, onChange }: DeliveryTimeProps) {
  const options = [
    { id: '1', label: 'Express (24h)' },
    { id: '3', label: 'Fast (3 days)' },
    { id: '7', label: 'Standard (7 days)' },
    { id: '14', label: 'Extended (14+ days)' },
  ]

  return (
    <div style={sectionStyle}>
      <h3 style={sectionTitle}>Delivery Time</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {options.map(option => (
          <label key={option.id} style={checkboxStyle}>
            <input
              type="checkbox"
              checked={selected.includes(option.id)}
              onChange={() => {
                if (selected.includes(option.id)) {
                  onChange(selected.filter(s => s !== option.id))
                } else {
                  onChange([...selected, option.id])
                }
              }}
              style={checkboxInput}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

interface FilterSidebarProps {
  categories: FilterOption[]
  providerTypes: FilterOption[]
  selectedCategories: string[]
  selectedProviderTypes: string[]
  minPrice: string
  maxPrice: string
  selectedRating: string
  selectedDeliveryTimes: string[]
  onCategoriesChange: (selected: string[]) => void
  onProviderTypesChange: (selected: string[]) => void
  onPriceChange: (min: string, max: string) => void
  onRatingChange: (rating: string) => void
  onDeliveryTimesChange: (selected: string[]) => void
  onClear: () => void
  onApply: () => void
  hasActiveFilters: boolean
}

export function FilterSidebar({
  categories,
  providerTypes,
  selectedCategories,
  selectedProviderTypes,
  minPrice,
  maxPrice,
  selectedRating,
  selectedDeliveryTimes,
  onCategoriesChange,
  onProviderTypesChange,
  onPriceChange,
  onRatingChange,
  onDeliveryTimesChange,
  onClear,
  onApply,
  hasActiveFilters,
}: FilterSidebarProps) {
  return (
    <aside style={sidebarStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: T.ink }}>Filters</h2>
        {hasActiveFilters && (
          <button onClick={onClear} style={clearButton}>
            Clear all
          </button>
        )}
      </div>

      <FilterSection
        title="Categories"
        options={categories}
        selected={selectedCategories}
        onChange={onCategoriesChange}
        showCount
      />

      <FilterSection
        title="Provider Type"
        options={providerTypes}
        selected={selectedProviderTypes}
        onChange={onProviderTypesChange}
      />

      <PriceRange min={minPrice} max={maxPrice} onChange={onPriceChange} />

      <RatingFilter selected={selectedRating} onChange={onRatingChange} />

      <DeliveryTime selected={selectedDeliveryTimes} onChange={onDeliveryTimesChange} />

      <Btn variant="primary" fullWidth onClick={onApply}>
        Apply Filters
      </Btn>
    </aside>
  )
}
