'use client'
import React from 'react'
import { T } from './tokens'
import { Cap, Scale, Check, Arrow } from './icons'

const MARKET_CATEGORIES = 'https://market.yousafeconsultancy.com/categories'

interface PracticeCard {
  eyebrow: string
  title: string
  body: string
  bullets: string[]
  linkText: string
  linkHref: string
  accent: string
  accentSoft: string
  Icon: React.FC<{ size?: number; stroke?: number; style?: React.CSSProperties }>
}

const PRACTICES: PracticeCard[] = [
  {
    eyebrow: 'Study abroad',
    title: 'Visa & university advisory',
    body: 'Senior consultants guide students through admissions, SOPs, visa documentation and settlement, with funds in escrow until you approve the work.',
    bullets: ['University shortlist & applications', 'SOP & essay review', 'Visa documentation'],
    linkText: 'Browse education services',
    linkHref: `${MARKET_CATEGORIES}/education`,
    accent: T.indigo,
    accentSoft: T.indigoSoft,
    Icon: Cap,
  },
  {
    eyebrow: 'Legal document prep',
    title: 'US, UK & Canada legal review',
    body: 'Licensed attorneys claim your case from a vetted panel, message you directly, then send a custom offer. Their fee is paid in full to them; the platform fee is disclosed separately, per ABA Rule 5.4.',
    bullets: ['Document review & preparation', 'Attorney consultation', 'Compliance check'],
    linkText: 'Browse legal services',
    linkHref: `${MARKET_CATEGORIES}/legal`,
    accent: T.brick,
    accentSoft: 'rgba(178,34,52,0.08)',
    Icon: Scale,
  },
]

export default function TwoPractices() {
  return (
    <section
      style={{
        background: T.surface2,
        padding: '80px 40px',
      }}
    >
      <style>{`
        .ys-practices-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 28px;
        }
        @media (max-width: 720px) {
          .ys-practices-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div
        style={{
          maxWidth: 1240,
          margin: '0 auto',
        }}
      >
        <div className="ys-practices-grid">
          {PRACTICES.map((p) => (
            <div
              key={p.eyebrow}
              style={{
                position: 'relative',
                background: T.surface,
                borderRadius: 18,
                padding: 38,
                overflow: 'hidden',
              }}
            >
              {/* Accent top-left bar */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: 80,
                  height: 3,
                  background: p.accent,
                  borderRadius: '0 0 2px 0',
                }}
              />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {/* Icon chip */}
                <span
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: p.accentSoft,
                    color: p.accent,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <p.Icon size={20} stroke={1.6} />
                </span>

                {/* Eyebrow */}
                <span
                  style={{
                    fontFamily: T.mono,
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: T.inkSoft,
                  }}
                >
                  {p.eyebrow}
                </span>

                {/* Serif title */}
                <h3
                  style={{
                    margin: 0,
                    fontFamily: T.serif,
                    fontSize: 28,
                    fontWeight: 600,
                    lineHeight: 1.15,
                    color: T.ink,
                    letterSpacing: '-0.01em',
                  }}
                >
                  {p.title}
                </h3>

                {/* Body */}
                <p
                  style={{
                    margin: 0,
                    fontFamily: T.sans,
                    fontSize: 15,
                    lineHeight: 1.6,
                    color: T.inkMid,
                  }}
                >
                  {p.body}
                </p>

                {/* Bullets */}
                <ul
                  style={{
                    margin: 0,
                    padding: 0,
                    listStyle: 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  {p.bullets.map((bullet) => (
                    <li
                      key={bullet}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        fontFamily: T.sans,
                        fontSize: 14,
                        color: T.inkMid,
                      }}
                    >
                      <span
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 6,
                          background: p.accentSoft,
                          color: p.accent,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <Check size={12} stroke={2} />
                      </span>
                      {bullet}
                    </li>
                  ))}
                </ul>

                {/* Link */}
                <a
                  href={p.linkHref}
                  style={{
                    fontFamily: T.sans,
                    fontSize: 14,
                    fontWeight: 600,
                    color: p.accent,
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    marginTop: 4,
                    transition: 'gap 140ms ease',
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget
                    el.style.gap = '10px'
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget
                    el.style.gap = '6px'
                  }}
                >
                  {p.linkText}
                  <Arrow size={14} stroke={2} />
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
