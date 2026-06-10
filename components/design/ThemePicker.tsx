'use client'

import React from 'react'
import { PortalThemeId, PORTAL_THEMES, THEME_IDS } from '@/lib/portalThemes'
import { F } from '@/components/marketplace/tokens'
import {
  usePortalAppearance,
  FONT_OPTIONS,
  KERNING_OPTIONS,
  PATTERN_OPTIONS,
} from '@/lib/portalAppearance'

interface ThemePickerProps {
  currentTheme: PortalThemeId
  onChange: (id: PortalThemeId) => void
}

const BRICK = '#B22234'

export default function ThemePicker({ currentTheme, onChange }: ThemePickerProps) {
  const [active, setActive] = React.useState(currentTheme)
  const [error, setError] = React.useState('')

  const handleClick = (id: PortalThemeId) => {
    if (id === active) return
    const previous = active
    setActive(id)
    setError('')
    onChange(id)
  }

  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: 12,
        }}
      >
        {THEME_IDS.map((id) => {
          const meta = PORTAL_THEMES[id]
          const isActive = id === active
          return (
            <button
              key={id}
              type="button"
              onClick={() => handleClick(id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 10,
                padding: 14,
                borderRadius: 10,
                border: `1.5px solid ${isActive ? meta.swatch.accent : 'transparent'}`,
                background: isActive
                  ? `${meta.swatch.accent}08`
                  : 'var(--portal-surface)',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'border-color 0.12s, background 0.12s',
              }}
            >
              {/* Swatch */}
              <div style={{ display: 'flex', gap: 4 }}>
                <span
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 4,
                    background: meta.swatch.bg,
                    border: '1px solid var(--portal-rule)',
                    display: 'inline-block',
                  }}
                />
                <span
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 4,
                    background: meta.swatch.ink,
                    display: 'inline-block',
                  }}
                />
                <span
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 4,
                    background: meta.swatch.accent,
                    display: 'inline-block',
                  }}
                />
              </div>

              {/* Name */}
              <div
                style={{
                  fontFamily: F.display,
                  fontSize: 15,
                  fontWeight: 600,
                  color: 'var(--portal-ink)',
                  lineHeight: 1.2,
                }}
              >
                {meta.name}
              </div>

              {/* Description */}
              <div
                style={{
                  fontFamily: F.mono,
                  fontSize: 10,
                  fontWeight: 500,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--portal-ink-soft)',
                  lineHeight: 1.3,
                }}
              >
                {meta.description}
              </div>

              {/* Checkmark */}
              {isActive && (
                <div
                  style={{
                    marginTop: 'auto',
                    paddingTop: 4,
                    fontSize: 12,
                    fontWeight: 600,
                    color: meta.swatch.accent,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Active
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Appearance: typography, kerning, background ─────────────────── */}
      <AppearanceSection />

      {error && (
        <div
          style={{
            marginTop: 12,
            padding: '10px 14px',
            borderRadius: 8,
            background: `${BRICK}10`,
            color: BRICK,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {error}
        </div>
      )}
    </div>
  )
}


// ── Appearance preferences (font / kerning / background pattern) ─────────
// Self-contained: reads + writes lib/portalAppearance, so every shell that
// renders ThemePicker (admin, student, attorney, consultant settings) gets
// the full appearance controls with zero extra wiring.

function OptionRow<T extends string>({ title, options, active, onSelect, renderPreview }: {
  title: string
  options: Array<{ id: T; name: string; description: string }>
  active: T
  onSelect: (id: T) => void
  renderPreview?: (id: T) => React.ReactNode
}) {
  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--portal-ink-soft)', marginBottom: 10 }}>
        {title}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
        {options.map((opt) => {
          const isActive = opt.id === active
          return (
            <button key={opt.id} type="button" onClick={() => onSelect(opt.id)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6,
                padding: 12, borderRadius: 10, textAlign: 'left', cursor: 'pointer',
                border: `1.5px solid ${isActive ? 'var(--portal-accent)' : 'var(--portal-rule)'}`,
                background: isActive ? 'var(--portal-accent-soft)' : 'var(--portal-surface)',
                transition: 'border-color 0.12s, background 0.12s',
              }}>
              {renderPreview?.(opt.id)}
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--portal-ink)', lineHeight: 1.2 }}>{opt.name}</div>
              <div style={{ fontSize: 11, color: 'var(--portal-ink-soft)', lineHeight: 1.35 }}>{opt.description}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

const PATTERN_PREVIEW: Record<string, string> = {
  plain: 'none',
  dots: 'radial-gradient(rgba(15,23,42,0.28) 1px, transparent 1px)',
  grid: 'linear-gradient(rgba(15,23,42,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.18) 1px, transparent 1px)',
  linen: 'repeating-linear-gradient(45deg, rgba(15,23,42,0.12) 0 1px, transparent 1px 4px), repeating-linear-gradient(-45deg, rgba(15,23,42,0.12) 0 1px, transparent 1px 4px)',
}

function AppearanceSection() {
  const [appearance, update] = usePortalAppearance()
  return (
    <div>
      <OptionRow
        title="Typography"
        options={FONT_OPTIONS}
        active={appearance.font}
        onSelect={(font) => update({ font })}
        renderPreview={(id) => {
          const opt = FONT_OPTIONS.find((o) => o.id === id)
          return <div style={{ fontFamily: opt?.preview, fontSize: 20, fontWeight: 600, color: 'var(--portal-ink)', lineHeight: 1 }}>Aa</div>
        }}
      />
      <OptionRow
        title="Letter spacing"
        options={KERNING_OPTIONS}
        active={appearance.kerning}
        onSelect={(kerning) => update({ kerning })}
        renderPreview={(id) => (
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--portal-ink)', letterSpacing: id === 'tight' ? '-0.01em' : id === 'relaxed' ? '0.05em' : '0em' }}>
            Spacing
          </div>
        )}
      />
      <OptionRow
        title="Background"
        options={PATTERN_OPTIONS}
        active={appearance.pattern}
        onSelect={(pattern) => update({ pattern })}
        renderPreview={(id) => (
          <div style={{
            width: '100%', height: 28, borderRadius: 6,
            border: '1px solid var(--portal-rule)', background: 'var(--portal-bg)',
            backgroundImage: PATTERN_PREVIEW[id],
            backgroundSize: id === 'dots' ? '10px 10px' : id === 'grid' ? '12px 12px' : undefined,
          }} />
        )}
      />
    </div>
  )
}
