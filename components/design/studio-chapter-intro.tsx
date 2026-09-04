'use client'

import React from 'react'
import { studioTokens as E } from './studio-tokens'
import type { StudioStage } from '@/lib/seoFactory/studioPipeline'

/** Local alias matching admin-content-studio.tsx (`type StudioTab = StudioStage`). */
type StudioTab = StudioStage

/**
 * Mini-pill ORDER mirrors the LIVE nav (admin-content-studio `TABS`):
 * I Discover · II Research · III Draft & Review · IV Approve & Track ·
 * V Configure. 'shop' is a valid StudioStage for deep links but is NOT a live
 * tab until the product-blog pipeline ships through shipContent, so it is
 * omitted from the pills (and from the prev/next jump ring).
 */
const ORDER: StudioTab[] = ['discover', 'research', 'draft', 'approve', 'configure']

const NUMERALS: Record<StudioTab, string> = {
  discover: 'I',
  research: 'II',
  draft: 'III',
  approve: 'IV',
  configure: 'V',
  shop: 'VI',
}

const TITLES: Record<StudioTab, string> = {
  discover: 'Discover',
  research: 'Research & Plan',
  draft: 'Draft & Review',
  approve: 'Approve & Track',
  configure: 'Configure',
  shop: 'Shop SEO',
}

/**
 * Editorial stage header for the Content Studio — numeral, title, scope
 * chips, prev/next jump buttons, and the mini bubble-pill strip that mirrors
 * the pipeline order. Preserves the `chapter-intro` class + `data-chapter`
 * contract used by E2E; polish adds a gold gradient rule, pill-shaped jump
 * buttons with hover/focus states, and hover lift on the mini pills.
 */
export function ChapterIntro({
  numeral,
  title,
  subtitle,
  chapterKey,
  scope,
  next,
  prev,
  onJump,
}: {
  numeral: string
  title: string
  subtitle: string
  chapterKey: StudioTab
  scope: Array<{ chip: string; text: string }>
  next?: string
  prev?: string
  onJump?: (k: StudioTab) => void
}) {
  return (
    <>
      <style>{`
        .chapter-intro .ch-jump:focus-visible { outline: none; box-shadow: ${E.goldRing}; }
        .chapter-intro .ch-jump:hover { transform: translateY(-1px); }
        .chapter-intro .ch-jump-prev:hover { border-color: ${E.gold}88; color: ${E.ink}; }
        .chapter-intro .ch-jump-next:hover { background: ${E.goldDeep}; border-color: ${E.goldDeep}; }
        .chapter-intro .ch-mini:not(:disabled):hover .ch-mini-bubble { transform: scale(1.1); border-color: ${E.gold}88; }
        .chapter-intro .ch-mini:not(:disabled):hover .ch-mini-label { color: ${E.ink}; }
        .chapter-intro .ch-scope { transition: background 0.2s ease, border-color 0.2s ease; }
        .chapter-intro .ch-scope:hover { background: ${E.paper}; border-color: ${E.gold}44; }
      `}</style>
      <div
        className="chapter-intro"
        data-chapter={chapterKey}
        style={{
          marginBottom: 14,
          padding: '20px 26px 18px',
          background: `linear-gradient(180deg, ${E.paper} 0%, ${E.ivory} 100%)`,
          border: `1px solid ${E.hairline}`,
          boxShadow: E.panelShadow,
          fontFamily: E.serif,
          position: 'relative',
        }}
      >
        {/* Gold gradient rule under the header row */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 0,
            left: 26,
            right: 26,
            height: 2,
            borderRadius: 999,
            background: `linear-gradient(90deg, ${E.gold} 0%, ${E.goldSoft} 55%, transparent 100%)`,
            opacity: 0.8,
          }}
        />
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 6 }}>
          <span
            style={{
              fontSize: 38,
              fontWeight: 700,
              color: E.gold,
              lineHeight: 1,
              fontFamily: E.serif,
              letterSpacing: '-0.02em',
            }}
          >
            {numeral}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span
              style={{
                fontSize: 10,
                color: E.gold,
                fontFamily: E.mono,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                marginBottom: 3,
                fontWeight: 700,
              }}
            >
              Chapter {numeral}
            </span>
            <h2
              style={{
                margin: 0,
                fontSize: 24,
                fontFamily: E.serif,
                fontWeight: 700,
                color: E.ink,
                letterSpacing: '-0.01em',
              }}
            >
              {title}
            </h2>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            {prev && onJump && (
              <button
                onClick={() => onJump(ORDER[Math.max(0, ORDER.indexOf(chapterKey) - 1)])}
                className="ch-jump ch-jump-prev"
                style={{
                  fontFamily: E.serif,
                  fontSize: 11,
                  color: E.inkMuted,
                  background: 'transparent',
                  border: `1px solid ${E.hairline}`,
                  borderRadius: 999,
                  padding: '5px 14px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                ← {prev}
              </button>
            )}
            {next && onJump && (
              <button
                onClick={() => onJump(ORDER[Math.min(ORDER.length - 1, ORDER.indexOf(chapterKey) + 1)])}
                className="ch-jump ch-jump-next"
                style={{
                  fontFamily: E.serif,
                  fontSize: 11,
                  color: E.ivory,
                  background: E.gold,
                  border: `1px solid ${E.gold}`,
                  borderRadius: 999,
                  padding: '5px 14px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  transition: 'all 0.2s ease',
                }}
              >
                {next} →
              </button>
            )}
          </div>
        </div>
        <p
          style={{
            margin: '0 0 12px',
            fontSize: 14,
            color: E.inkMuted,
            fontFamily: E.serif,
            fontStyle: 'italic',
            maxWidth: 880,
            lineHeight: 1.5,
          }}
        >
          {subtitle}
        </p>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {scope.map((s, i) => (
            <div
              key={i}
              className="ch-scope"
              style={{
                flex: '1 1 240px',
                minWidth: 220,
                padding: '9px 12px',
                borderLeft: `2px solid ${E.goldSoft}`,
                background: E.paper,
                boxShadow: '0 1px 0 rgba(17,21,28,0.04)',
              }}
            >
              <span
                style={{
                  fontSize: 9,
                  fontFamily: E.mono,
                  letterSpacing: '0.16em',
                  color: E.gold,
                  textTransform: 'uppercase',
                  fontWeight: 700,
                }}
              >
                {s.chip}
              </span>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: E.ink, lineHeight: 1.45, fontFamily: E.serif }}>
                {s.text}
              </p>
            </div>
          ))}
        </div>
        {/* Pipeline mini bubble pills — horizontal stage navigation with arrows */}
        <div
          style={{
            marginTop: 16,
            paddingTop: 14,
            borderTop: `1px dashed ${E.hairline}`,
            display: 'flex',
            gap: 0,
            flexWrap: 'nowrap',
            alignItems: 'center',
            overflowX: 'auto',
            justifyContent: 'center',
          }}
        >
          {ORDER.map((k, i) => {
            const active = k === chapterKey
            const currentIdx = ORDER.indexOf(chapterKey)
            const isPast = currentIdx > i
            return (
              <React.Fragment key={k}>
                {i > 0 && (
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '0 4px',
                      opacity: isPast ? 0.35 : 0.15,
                      transition: 'opacity 0.3s ease',
                    }}
                  >
                    <svg width="16" height="12" viewBox="0 0 16 12" style={{ display: 'block' }}>
                      <path
                        d="M9 1l4 5-4 5"
                        stroke={active ? E.gold : E.inkDim}
                        strokeWidth="1.4"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M13 6H2"
                        stroke={active ? E.gold : E.inkDim}
                        strokeWidth="1.4"
                        fill="none"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                )}
                <button
                  key={k}
                  onClick={() => onJump && onJump(k)}
                  disabled={!onJump}
                  className="ch-mini"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 3,
                    padding: '6px 12px',
                    borderRadius: 0,
                    cursor: onJump ? 'pointer' : 'default',
                    background: 'transparent',
                    border: 'none',
                    opacity: active ? 1 : 0.7,
                    transition: 'all 0.25s ease',
                    minWidth: 60,
                  }}
                  title={`${NUMERALS[k]} · ${TITLES[k]}`}
                >
                  <span
                    className="ch-mini-bubble"
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: '50%',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: active ? E.gold : isPast ? E.goldSoft : 'transparent',
                      border: active
                        ? `1.5px solid ${E.gold}`
                        : isPast
                          ? `1.5px solid ${E.gold}44`
                          : `1px solid ${E.hairline}`,
                      fontFamily: E.serif,
                      fontSize: 14,
                      fontWeight: 700,
                      color: active ? E.ivory : isPast ? E.goldDeep : E.inkMuted,
                      boxShadow: active ? E.goldGlow : 'none',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    }}
                  >
                    {NUMERALS[k]}
                  </span>
                  <span
                    className="ch-mini-label"
                    style={{
                      fontFamily: E.serif,
                      fontSize: 9,
                      fontWeight: active ? 700 : 500,
                      color: active ? E.ink : E.inkMuted,
                      transition: 'color 0.25s ease',
                    }}
                  >
                    {TITLES[k]}
                  </span>
                </button>
              </React.Fragment>
            )
          })}
        </div>
      </div>
    </>
  )
}
