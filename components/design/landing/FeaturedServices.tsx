'use client'
import React from 'react'
import { T } from './tokens'
import { Star, Arrow, Clock } from './icons'
import { FeaturedGig, FALLBACK_GIGS } from './data/featured-services'

interface FeaturedServicesProps {
  gigs: FeaturedGig[]
}

const MARKET_HOME = 'https://market.yousafeconsultancy.com'
const fallbackSlugs = new Set(FALLBACK_GIGS.map((g) => g.slug))

function accentFor(role: string): string {
  if (role === 'attorney') return T.brick
  if (role === 'consultant') return T.moss
  return T.indigo
}

function formatPrice(cents: number | null): string | null {
  if (cents == null || !Number.isFinite(cents)) return null
  const dollars = Math.round(cents / 100)
  return `$${dollars.toLocaleString()}`
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export default function FeaturedServices({ gigs }: FeaturedServicesProps) {
  const items = gigs.slice(0, 4)

  return (
    <section style={{ background: T.paper, padding: '80px 24px' }}>
      <style>{`
        .ys-feat-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 18px;
        }
        @media (max-width: 1024px) {
          .ys-feat-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 640px) {
          .ys-feat-grid { grid-template-columns: 1fr; }
        }
        .ys-feat-card {
          transition: transform 200ms ease, box-shadow 200ms ease;
        }
        .ys-feat-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.10);
        }
      `}</style>

      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 32,
          }}
        >
          <div>
            <span
              style={{
                display: 'block',
                fontFamily: T.mono,
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: T.inkDim,
                marginBottom: 6,
              }}
            >
              Popular services
            </span>
            <h2
              style={{
                fontFamily: T.serif,
                fontSize: 32,
                fontWeight: 600,
                color: T.ink,
                lineHeight: 1.15,
                margin: 0,
              }}
            >
              Featured services
            </h2>
          </div>
          <a
            href={MARKET_HOME}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontFamily: T.sans,
              fontSize: 14,
              fontWeight: 500,
              color: T.indigo,
              textDecoration: 'none',
            }}
          >
            Browse marketplace
            <Arrow size={16} stroke={2} />
          </a>
        </div>

        {/* Grid */}
        <div className="ys-feat-grid">
          {items.map((gig, idx) => {
            const accent = accentFor(gig.providerRole)
            const isPlaceholder =
              process.env.NODE_ENV !== 'production' &&
              fallbackSlugs.has(gig.slug)

            return (
              <a
                key={`${gig.slug}-${idx}`}
                href={fallbackSlugs.has(gig.slug) ? MARKET_HOME : `${MARKET_HOME}/marketplace/gigs/${gig.slug}`}
                className="ys-feat-card"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  background: T.surface,
                  borderRadius: 12,
                  overflow: 'hidden',
                  border: `1px solid ${T.rule}`,
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                {/* Cover */}
                <div
                  style={{
                    position: 'relative',
                    width: '100%',
                    paddingTop: '68.75%', // 16:11
                  }}
                >
                  {gig.coverUrl ? (
                    <img
                      src={gig.coverUrl}
                      alt={`${gig.title} — preview by ${gig.providerName || 'YouSafe provider'}`}
                      loading="lazy"
                      style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                    />
                  ) : gig.providerAvatarUrl ? (
                    // No gig cover → centred provider avatar on a clean tile.
                    // Never invent imagery; show who the seller actually is.
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: T.surface2,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <img
                        src={gig.providerAvatarUrl}
                        alt={`${gig.providerName || 'YouSafe provider'} avatar`}
                        loading="lazy"
                        style={{
                          width: 96,
                          height: 96,
                          borderRadius: '50%',
                          objectFit: 'cover',
                          boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
                          border: `3px solid ${T.surface}`,
                        }}
                      />
                    </div>
                  ) : (
                    // Neither a gig cover nor a provider headshot. Fall back to
                    // a centred initials avatar — still real provider data.
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: T.surface2,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <div
                        style={{
                          width: 96,
                          height: 96,
                          borderRadius: '50%',
                          background: accent,
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontFamily: T.serif,
                          fontSize: 32,
                          fontWeight: 600,
                          boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
                          border: `3px solid ${T.surface}`,
                        }}
                      >
                        {initials(gig.providerName)}
                      </div>
                    </div>
                  )}

                  {/* Top-left tag */}
                  <span
                    style={{
                      position: 'absolute',
                      top: 12,
                      left: 12,
                      background: T.surface,
                      color: accent,
                      fontFamily: T.sans,
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '4px 10px',
                      borderRadius: 999,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      lineHeight: 1,
                    }}
                  >
                    {gig.tag}
                  </span>

                  {/* Top-right stack */}
                  <div
                    style={{
                      position: 'absolute',
                      top: 12,
                      right: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-end',
                      gap: 4,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: T.mono,
                        fontSize: 10,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        color: '#fff',
                        background: 'rgba(0,0,0,0.35)',
                        padding: '2px 6px',
                        borderRadius: 4,
                        lineHeight: 1,
                      }}
                    >
                      {gig.category}
                    </span>
                    {isPlaceholder && (
                      <span
                        style={{
                          fontFamily: T.mono,
                          fontSize: 9,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          color: '#fff',
                          background: 'rgba(0,0,0,0.5)',
                          padding: '2px 6px',
                          borderRadius: 4,
                          lineHeight: 1,
                        }}
                      >
                        placeholder
                      </span>
                    )}
                  </div>
                </div>

                {/* Body */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    padding: 16,
                    flex: 1,
                  }}
                >
                  {/* Seller */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    {gig.providerAvatarUrl ? (
                      <img
                        src={gig.providerAvatarUrl}
                        alt={`${gig.providerName || 'YouSafe provider'} avatar`}
                        loading="lazy"
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          objectFit: 'cover',
                          flexShrink: 0,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          background: accent,
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontFamily: T.sans,
                          fontSize: 12,
                          fontWeight: 600,
                          flexShrink: 0,
                        }}
                      >
                        {initials(gig.providerName)}
                      </div>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontFamily: T.sans,
                          fontSize: 13,
                          fontWeight: 600,
                          color: T.ink,
                          lineHeight: 1.3,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {gig.providerName}
                      </div>
                      <div
                        style={{
                          fontFamily: T.sans,
                          fontSize: 12,
                          color: T.inkSoft,
                          lineHeight: 1.3,
                          textTransform: 'capitalize',
                        }}
                      >
                        {gig.providerRole}
                      </div>
                    </div>
                  </div>

                  {/* Title */}
                  <h3
                    style={{
                      fontFamily: T.sans,
                      fontSize: 15,
                      fontWeight: 600,
                      color: T.ink,
                      lineHeight: 1.35,
                      margin: 0,
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {gig.title}
                  </h3>

                  {/* Rating + delivery row — only render facts we actually have.
                      Never invent a rating or a delivery window. */}
                  {(gig.reviewCount > 0 || gig.deliveryDays != null) && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontFamily: T.sans,
                        fontSize: 13,
                        color: T.inkSoft,
                      }}
                    >
                      {gig.reviewCount > 0 && (
                        <>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              color: T.gold,
                              fontWeight: 600,
                            }}
                          >
                            <Star size={14} stroke={2} />
                            {gig.avgRating.toFixed(1)}
                          </span>
                          <span>({gig.reviewCount.toLocaleString()})</span>
                        </>
                      )}
                      {gig.reviewCount > 0 && gig.deliveryDays != null && (
                        <span style={{ color: T.inkDim }}>·</span>
                      )}
                      {gig.deliveryDays != null && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <Clock size={14} stroke={1.5} />
                          {gig.deliveryDays} day{gig.deliveryDays !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Footer — only when we have a real price from gig_tiers */}
                  {formatPrice(gig.startingPrice) && (
                    <div
                      style={{
                        marginTop: 'auto',
                        borderTop: `1px solid ${T.rule}`,
                        paddingTop: 12,
                        fontFamily: T.sans,
                        fontSize: 14,
                        fontWeight: 600,
                        color: T.ink,
                      }}
                    >
                      From {formatPrice(gig.startingPrice)}
                    </div>
                  )}
                </div>
              </a>
            )
          })}
        </div>
      </div>
    </section>
  )
}
