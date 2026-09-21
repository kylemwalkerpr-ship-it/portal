'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useMarketplaceTheme } from '@/contexts/palette-context'
import { T } from './tokens'
import { PATTERNS, getPattern, type PatternId } from './patterns'

/**
 * ThemePicker — one control for the marketplace colour palette + background
 * motif.
 *
 * Reliability contract (MARKETPLACE-PALETTE-FLORAL-RELIABILITY):
 *   - Palette AND pattern come from the shared provider store. This component
 *     keeps NO pattern state of its own and injects NO global style tag, so
 *     the desktop instance and the mobile-drawer instance always agree, and
 *     opening/closing the drawer can never rewrite the current pattern.
 *   - Selecting a motif is a single shared-store mutation; the provider
 *     repaints documentElement and every mounted .cw-market root.
 */

/** Motif preview swatch — same layered gradients the canvas uses. */
function PatternSwatch({ id, size = 22 }: { id: PatternId; size?: number }) {
  const def = getPattern(id)
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: 3,
        backgroundColor: 'var(--ys-cream, #F9FAFB)',
        backgroundImage: def.layers.length ? def.layers.join(', ') : undefined,
        backgroundSize: def.backgroundSize,
        backgroundPosition: def.backgroundPosition,
        border: '1px solid var(--ys-rule, rgba(15,23,42,0.10))',
      }}
    />
  )
}

export function ThemePicker() {
  const { palettes, palette, setPaletteName, patternId, setPatternId, pattern } = useMarketplaceTheme()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  // Click-outside / Esc to close
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  const handlePaletteSelect = useCallback((name: string) => {
    setPaletteName(name)
    setOpen(false)
  }, [setPaletteName])

  // Pattern stays open so several motifs can be compared against the live
  // page; the store persists + repaints on every pick.
  const handlePatternSelect = useCallback((id: PatternId) => {
    setPatternId(id)
  }, [setPatternId])

  return (
    <div
      ref={wrapRef}
      data-no-translate
      data-ys-theme-picker=""
      data-ys-selected-palette={palette.name}
      data-ys-selected-pattern={patternId}
      style={{
        position: 'relative',
        display: 'inline-flex',
        fontFamily: 'var(--portal-font-body, -apple-system, BlinkMacSystemFont, "Inter", sans-serif)',
      }}
    >
      <button
        type="button"
        aria-label={`Theme: ${palette.label} + ${pattern.label}. Click to change.`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          padding: '5px 10px',
          border: '1px solid rgba(148,163,184,0.35)',
          borderRadius: 6,
          background: 'rgba(255,255,255,0.96)',
          color: '#0f172a',
          boxShadow: '0 4px 12px rgba(15,23,42,0.08)',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '.04em',
          lineHeight: 1,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <span aria-hidden="true" style={{ fontSize: 12 }}>{palette.emoji}</span>
        <PatternSwatch id={patternId} size={14} />
        <span aria-hidden="true" style={{ fontSize: 9, opacity: 0.55, marginLeft: 1 }}>▾</span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Choose theme"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            minWidth: 300,
            border: '1px solid rgba(148,163,184,0.30)',
            borderRadius: 8,
            background: '#fff',
            boxShadow: '0 12px 28px rgba(15,23,42,0.16)',
            maxHeight: '65vh',
            overflowY: 'auto',
            zIndex: 250,
          }}
        >
          {/* Color palette section */}
          <div style={{ padding: '8px 10px 4px', fontSize: 9, fontWeight: 700, color: '#5C6070', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
            🌿 Colour Palette
          </div>
          {palettes.map(p => {
            const active = p.name === palette.name
            return (
              <button
                key={p.name}
                type="button"
                data-ys-palette-option={p.name}
                aria-selected={active}
                onClick={() => handlePaletteSelect(p.name)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '7px 10px',
                  border: 'none',
                  background: active ? T.indigoSoft : 'transparent',
                  color: active ? T.indigoDeep : T.ink,
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: active ? 700 : 500,
                  borderRadius: 5,
                  textAlign: 'left',
                  fontFamily: 'inherit',
                }}
              >
                <span style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 2, background: p.tokens.paper }} />
                  <span style={{ width: 12, height: 12, borderRadius: 2, background: p.tokens.vellum }} />
                  <span style={{ width: 12, height: 12, borderRadius: 2, background: p.tokens.indigo }} />
                </span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', lineHeight: 1.3 }}>{p.emoji} {p.label}</span>
                  <span style={{ display: 'block', fontSize: 10.5, fontWeight: 500, lineHeight: 1.35, color: active ? T.indigoDeep : T.inkSoft }}>
                    {p.description}
                  </span>
                </span>
                {active && (
                  <span style={{ fontSize: 11, fontWeight: 800, color: T.indigo, flexShrink: 0 }}>✓</span>
                )}
              </button>
            )
          })}

          {/* Divider */}
          <div style={{ height: 1, background: 'rgba(148,163,184,0.2)', margin: '4px 10px' }} />

          {/* Pattern section — motif names + matching swatches, not emoji-only */}
          <div style={{ padding: '4px 10px 4px', fontSize: 9, fontWeight: 700, color: '#5C6070', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
            🌸 Botanical Pattern
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4, padding: '4px 10px 10px' }}>
            {PATTERNS.map(p => {
              const active = p.id === patternId
              return (
                <button
                  key={p.id}
                  type="button"
                  role="option"
                  data-ys-pattern-option={p.id}
                  aria-selected={active}
                  title={p.description}
                  onClick={() => handlePatternSelect(p.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    padding: '6px 6px',
                    border: active ? `2px solid ${T.indigo}` : '1px solid rgba(148,163,184,0.25)',
                    borderRadius: 6,
                    background: active ? T.indigoSoft : '#FAFAF8',
                    cursor: 'pointer',
                    fontSize: 10.5,
                    fontWeight: active ? 700 : 500,
                    color: active ? T.indigoDeep : T.ink,
                    fontFamily: 'inherit',
                    textAlign: 'left',
                    transition: 'border-color 120ms, background 120ms',
                  }}
                >
                  <PatternSwatch id={p.id} size={20} />
                  <span style={{ lineHeight: 1.15 }}>{p.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
