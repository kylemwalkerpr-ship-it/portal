'use client'
import React from 'react'
import { T } from './tokens'
import { Arrow, Globe, Cap, Scale, House, Briefcase, Coin, Doc, Spark } from './icons'
import { CATEGORY_TILES } from './data/categories'

interface PopularCategoriesProps {
  counts: Record<string, number>
}

const ICON_MAP: Record<string, React.FC<{ size?: number; stroke?: number; style?: React.CSSProperties }>> = {
  Globe,
  Cap,
  Scale,
  House,
  Briefcase,
  Coin,
  Doc,
  Spark,
}

const TAG_BG: Record<string, string> = {
  POPULAR: T.indigo,
  TRENDING: T.brick,
  NEW: T.moss,
}

const MARKET_CATEGORIES = 'https://market.yousafeconsultancy.com/categories'

export default function PopularCategories({ counts }: PopularCategoriesProps) {
  return (
    <section
      id="categories"
      style={{
        background: T.paper,
        padding: '80px 40px',
      }}
    >
      <style>{`
        .ys-categories-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }
        @media (max-width: 720px) {
          .ys-categories-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
      `}</style>

      <div
        style={{
          maxWidth: 1240,
          margin: '0 auto',
        }}
      >
        {/* Eyebrow */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 32,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <span
            style={{
              fontFamily: T.mono,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: T.inkSoft,
            }}
          >
            Browse categories
          </span>
          <a
            href={MARKET_CATEGORIES}
            style={{
              fontFamily: T.sans,
              fontSize: 13,
              fontWeight: 500,
              color: T.indigo,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              transition: 'gap 140ms ease',
            }}
          >
            View all categories
            <Arrow size={14} stroke={2} />
          </a>
        </div>

        {/* Grid */}
        <div className="ys-categories-grid">
          {CATEGORY_TILES.map((tile) => {
            const Icon = ICON_MAP[tile.icon]
            const count = counts[tile.id] ?? 0
            const href = `${MARKET_CATEGORIES}/${tile.id}`

            return (
              <a
                key={tile.id}
                href={href}
                className="ys-category-tile"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: 168,
                  padding: 20,
                  background: T.surface,
                  border: `1px solid ${T.ruleSoft}`,
                  borderRadius: 14,
                  textDecoration: 'none',
                  transition: 'transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease',
                  position: 'relative',
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget
                  el.style.transform = 'translateY(-3px)'
                  el.style.borderColor = T.indigo
                  el.style.boxShadow = '0 12px 28px rgba(15,23,42,0.10)'
                  const arrow = el.querySelector('.ys-category-tile__arrow') as HTMLElement
                  if (arrow) arrow.style.transform = 'translateX(4px)'
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget
                  el.style.transform = 'translateY(0)'
                  el.style.borderColor = T.ruleSoft
                  el.style.boxShadow = 'none'
                  const arrow = el.querySelector('.ys-category-tile__arrow') as HTMLElement
                  if (arrow) arrow.style.transform = 'translateX(0)'
                }}
              >
                {/* Top row: icon chip + tag */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    marginBottom: 16,
                  }}
                >
                  <span
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: T.indigoSoft,
                      color: T.indigo,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {Icon && <Icon size={18} stroke={1.6} />}
                  </span>

                  {tile.tag && (
                    <span
                      style={{
                        fontFamily: T.mono,
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        color: '#fff',
                        background: TAG_BG[tile.tag] ?? T.indigo,
                        padding: '4px 8px',
                        borderRadius: 6,
                        lineHeight: 1,
                      }}
                    >
                      {tile.tag}
                    </span>
                  )}
                </div>

                {/* Title */}
                <h3
                  style={{
                    margin: 0,
                    fontFamily: T.serif,
                    fontSize: 20,
                    fontWeight: 500,
                    lineHeight: 1.25,
                    color: T.ink,
                    letterSpacing: '-0.01em',
                    flex: 1,
                  }}
                >
                  {tile.title}
                </h3>

                {/* Bottom row: count + arrow */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: 'auto',
                    paddingTop: 16,
                  }}
                >
                  <span
                    style={{
                      fontFamily: T.sans,
                      fontSize: 13,
                      color: T.inkSoft,
                      fontWeight: 500,
                    }}
                  >
                    {count} service{count !== 1 ? 's' : ''}
                  </span>
                  <span
                    className="ys-category-tile__arrow"
                    style={{
                      color: T.indigo,
                      display: 'inline-flex',
                      alignItems: 'center',
                      transition: 'transform 180ms ease',
                    }}
                  >
                    <Arrow size={16} stroke={2} />
                  </span>
                </div>
              </a>
            )
          })}
        </div>
      </div>
    </section>
  )
}
