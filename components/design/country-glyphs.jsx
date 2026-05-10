// @ts-nocheck
'use client'
import React from 'react'

// Refined monoline national symbols used as quiet accents on country chips,
// section headers, and stat cards. They are deliberately small and minimal —
// the goal is brand richness without cartoonish flag motifs.

export function CountryGlyph({ country, size = 18, color = 'currentColor' }) {
  const c = (country || '').toUpperCase()
  if (c === 'US') return <EagleGlyph size={size} color={color} />
  if (c === 'CA') return <MapleGlyph size={size} color={color} />
  if (c === 'UK' || c === 'GB') return <LionGlyph size={size} color={color} />
  return null
}

export function CountryChip({ country, label }) {
  const meta = COUNTRY_META[(country || '').toUpperCase()]
  if (!meta) return null
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '3px 10px 3px 8px',
        borderRadius: '999px',
        background: meta.bg,
        border: `1px solid ${meta.border}`,
        color: meta.fg,
        fontSize: '11px',
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        lineHeight: 1,
      }}
    >
      <CountryGlyph country={country} size={14} color={meta.fg} />
      {label || meta.label}
    </span>
  )
}

export const COUNTRY_META = {
  US: { label: 'US', fg: '#1F2D5F', bg: 'rgba(31,45,95,0.08)', border: 'rgba(31,45,95,0.20)' },
  CA: { label: 'CA', fg: '#A4243B', bg: 'rgba(164,36,59,0.08)', border: 'rgba(164,36,59,0.22)' },
  UK: { label: 'UK', fg: '#5B3A2A', bg: 'rgba(91,58,42,0.08)', border: 'rgba(91,58,42,0.20)' },
  GB: { label: 'UK', fg: '#5B3A2A', bg: 'rgba(91,58,42,0.08)', border: 'rgba(91,58,42,0.20)' },
}

// ── Eagle (US) — heraldic profile ──
export function EagleGlyph({ size = 18, color = 'currentColor' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* head facing left */}
      <path d="M14 6c0-1.5 1-2.5 2.5-2.5S19 4.5 19 6" />
      <path d="M16 5.5h.01" stroke={color} strokeWidth="1.6" />
      {/* beak */}
      <path d="M19 6l2 0.5L19 7.4" />
      {/* wing arc */}
      <path d="M6 14c0-4 3-7 8-7 0 4-2 7-5.5 7" />
      {/* second wing */}
      <path d="M5 18c1-3 3-4.5 6-4.5" />
      {/* tail feathers */}
      <path d="M9 16l-2 4M11 16l-1 4M13 16l0 4" />
    </svg>
  )
}

// ── Maple (Canada) — 11-point silhouette, simplified ──
export function MapleGlyph({ size = 18, color = 'currentColor' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      aria-hidden="true"
    >
      <path d="M12 2.5l1.4 3.4 3.6-1-1.5 3.5 4 .4-3 2.5 1 3.6-3.7-1.7L12 16l-1.8-2.8-3.7 1.7 1-3.6-3-2.5 4-.4-1.5-3.5 3.6 1L12 2.5zM11 16l-1 5.5 2-2 2 2L13 16h-2z" />
    </svg>
  )
}

// ── Lion (UK) — passant guardant, simplified ──
export function LionGlyph({ size = 18, color = 'currentColor' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* mane circle */}
      <circle cx="7.5" cy="9" r="3.4" />
      {/* eye */}
      <circle cx="7.6" cy="8.6" r="0.4" fill={color} />
      {/* body */}
      <path d="M11 11c2.5 0 5 1.4 5.5 3.5L17 16h-2l-.6-1.5H10c-2 0-3.5-1.5-3.5-3" />
      {/* legs */}
      <path d="M9 16v3M11.5 16v3M14 16v3M16 16v3" />
      {/* tail */}
      <path d="M17 14.5c1 0 2 0.5 2 2 0 1-1 1.5-1.5 1" />
      {/* mane tufts */}
      <path d="M5.8 6l.5 1.5M9.2 6l-.5 1.5M4.5 9.5l1.5.3M11 9.5l-1.5.3" />
    </svg>
  )
}

// Banner header that takes the active country's accent color. Used at the top
// of country-scoped sections (e.g. an inquiry detail for a US case).
export function CountryAccentBar({ country, height = 4 }) {
  const meta = COUNTRY_META[(country || '').toUpperCase()] || { fg: '#3C3B6E' }
  return (
    <div
      style={{
        height,
        background: `linear-gradient(90deg, ${meta.fg} 0%, ${meta.fg}88 50%, transparent 100%)`,
        borderTopLeftRadius: '14px',
        borderTopRightRadius: '14px',
      }}
    />
  )
}
