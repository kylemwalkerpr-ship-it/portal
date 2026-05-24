'use client'

import React from 'react'
import { PortalThemeId, PORTAL_THEMES, THEME_IDS } from '@/lib/portalThemes'
import { F } from '@/components/marketplace/tokens'

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
