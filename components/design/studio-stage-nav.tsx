'use client'

import React from 'react'
import { studioTokens as E } from './studio-tokens'
import type { StudioStage } from '@/lib/seoFactory/studioPipeline'

/** Local alias matching admin-content-studio.tsx (`type StudioTab = StudioStage`). */
type StudioTab = StudioStage

export type StudioStageNavTab = {
  key: StudioTab
  numeral: string
  label: string
  sub: string
  hint: string
}

/**
 * Horizontal bubble-pill stage navigation for the Content Studio pipeline.
 *
 * Preserves the E2E contract: `id="studio-tab-{key}"`, `role="tab"`,
 * `aria-selected` / `aria-controls` / `aria-disabled`, and the gold-filled
 * active bubble (`#A07E3A`). Polish adds a bottom progress rail, a
 * moss-green check badge on passed stages, hover lift + gold border, and a
 * gold focus ring for keyboard users.
 */
export function StudioStageNav({
  tabs,
  active,
  availability,
  onSelect,
}: {
  tabs: StudioStageNavTab[]
  active: StudioTab
  availability: Record<StudioTab, { available: boolean; reason: string }>
  onSelect: (key: StudioTab) => void
}) {
  const currentIdx = tabs.findIndex((t) => t.key === active)
  const progressPct =
    tabs.length > 0 ? Math.round(((currentIdx + 1) / tabs.length) * 100) : 0

  return (
    <>
      {/* Scoped hover / focus polish — injected once; values are static tokens. */}
      <style>{`
        .snav-pill:focus-visible { outline: none; }
        .snav-pill:focus-visible .snav-bubble { box-shadow: ${E.goldRing}; }
        .snav-pill:not(:disabled):hover .snav-bubble { transform: scale(1.07); border-color: ${E.gold}99; }
        .snav-pill:not(:disabled):hover .snav-label { color: ${E.inkBlack}; }
        .snav-pill:not(:disabled):active .snav-bubble { transform: scale(1.02); }
      `}</style>
      <nav
        aria-label="Content Studio pipeline"
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: 0,
          marginBottom: 18,
          padding: '18px 10px 22px',
          overflowX: 'auto',
          background: `linear-gradient(180deg, rgba(251,246,236,0.4) 0%, ${E.ivory} 100%)`,
          borderBottom: `1px solid ${E.hairline}`,
          justifyContent: 'center',
        }}
      >
        {/* Progress rail — fills from the left as the admin advances stages */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: '6%',
            right: '6%',
            bottom: 12,
            height: 2,
            borderRadius: 999,
            background: `linear-gradient(90deg, ${E.gold} ${progressPct}%, ${E.hairlineSoft} ${progressPct}%)`,
            transition: 'background 0.4s ease',
          }}
        />
        {tabs.map((t, i) => {
          const isActive = t.key === active
          const available = availability[t.key].available
          const isPast = currentIdx > i
          return (
            <React.Fragment key={t.key}>
              {i > 0 && (
                <div
                  aria-hidden="true"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 4px',
                    opacity: isPast ? 0.4 : 0.18,
                    transition: 'opacity 0.3s ease',
                  }}
                >
                  <svg width="20" height="14" viewBox="0 0 20 14" style={{ display: 'block' }}>
                    <path
                      d="M12 1l6 6-6 6"
                      stroke={E.inkDim}
                      strokeWidth="1.5"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path d="M18 7H2" stroke={E.inkDim} strokeWidth="1.5" fill="none" strokeLinecap="round" />
                  </svg>
                </div>
              )}
              <button
                id={`studio-tab-${t.key}`}
                role="tab"
                aria-selected={isActive}
                aria-controls={`studio-panel-${t.key}`}
                aria-disabled={!available}
                aria-label={`Stage ${t.numeral} · ${t.label}: ${t.hint}`}
                type="button"
                onClick={() => onSelect(t.key)}
                disabled={!available}
                title={available ? `Stage ${t.numeral} · ${t.label}: ${t.hint}` : availability[t.key].reason}
                className="snav-pill"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                  padding: '10px 14px',
                  borderRadius: 0,
                  cursor: available ? 'pointer' : 'not-allowed',
                  background: 'transparent',
                  border: 'none',
                  opacity: available ? 1 : 0.4,
                  transition: 'all 0.25s ease',
                  minWidth: 88,
                  maxWidth: 124,
                }}
              >
                <span style={{ position: 'relative' }}>
                  <span
                    className="snav-bubble"
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: isActive ? E.gold : isPast ? E.goldSoft : E.ivory,
                      border: isActive
                        ? `2px solid ${E.gold}`
                        : isPast
                          ? `1.5px solid ${E.gold}55`
                          : `1.5px solid ${E.hairline}`,
                      fontFamily: E.serif,
                      fontSize: 18,
                      fontWeight: 700,
                      color: isActive ? E.ivory : isPast ? E.goldDeep : E.inkMuted,
                      boxShadow: isActive ? E.goldGlow : 'none',
                      transform: isActive ? 'scale(1.08)' : 'scale(1)',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    }}
                  >
                    {t.numeral}
                  </span>
                  {/* Passed-stage check badge */}
                  {isPast && (
                    <span
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        right: -4,
                        bottom: -4,
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        background: E.mossGreen,
                        border: `2px solid ${E.ivory}`,
                        color: '#FFFFFF',
                        fontSize: 9,
                        fontWeight: 800,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 1px 3px rgba(17,21,28,0.25)',
                      }}
                    >
                      ✓
                    </span>
                  )}
                </span>
                <span
                  className="snav-label"
                  style={{
                    fontFamily: E.serif,
                    fontSize: 11,
                    fontWeight: 600,
                    color: isActive ? E.inkBlack : E.inkMuted,
                    textAlign: 'center',
                    lineHeight: 1.2,
                    transition: 'color 0.25s ease',
                  }}
                >
                  {t.label}
                </span>
                <span
                  style={{
                    fontFamily: E.mono,
                    fontSize: 7.5,
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: isActive ? E.goldDeep : E.inkDim,
                    textAlign: 'center',
                    lineHeight: 1.2,
                    maxWidth: 110,
                  }}
                >
                  {t.sub}
                </span>
                {isActive && (
                  <span
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: '50%',
                      background: E.gold,
                      marginTop: -2,
                    }}
                  />
                )}
              </button>
            </React.Fragment>
          )
        })}
      </nav>
    </>
  )
}
