'use client'
import React from 'react'
import { T } from './tokens'
import { Arrow, Star, Check } from './icons'
import { FALLBACK_PROVIDERS, type FeaturedProvider } from './data/featured-providers'

const MARKET = 'https://market.yousafeconsultancy.com'
const fallbackProviderIds = new Set(FALLBACK_PROVIDERS.map((p) => p.id))

interface FeaturedProvidersProps {
  providers: FeaturedProvider[]
}

export default function FeaturedProviders({ providers }: FeaturedProvidersProps) {
  return (
    <section style={{ background: T.surface, padding: '88px 0' }}>
      <style>{`
        .ys-prov-strip {
          display: flex; gap: 16px;
          overflow-x: auto;
          scroll-snap-type: x mandatory;
          -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 4%, #000 96%, transparent 100%);
          mask-image: linear-gradient(90deg, transparent 0, #000 4%, #000 96%, transparent 100%);
          padding: 4px 40px;
          scrollbar-width: none;
        }
        .ys-prov-strip::-webkit-scrollbar { display: none; }
        .ys-prov-card { scroll-snap-align: start; }
      `}</style>

      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 40px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <span style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: T.inkSoft }}>
              Featured providers
            </span>
            <h2 style={{ margin: '8px 0 0', fontFamily: T.serif, fontSize: 'clamp(28px,3vw,40px)', fontWeight: 500, color: T.ink, letterSpacing: '-0.014em' }}>
              Vetted attorneys and consultants
            </h2>
          </div>
          <a href={`${MARKET}/providers`} style={{ fontFamily: T.sans, fontSize: 13, color: T.indigo, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            View all providers <Arrow size={14} stroke={2} />
          </a>
        </div>
      </div>

      <div className="ys-prov-strip">
        {providers.map((p, idx) => (
          <a
            key={`${p.id}-${idx}`}
            href={fallbackProviderIds.has(p.id) ? `${MARKET}/providers` : `${MARKET}/providers/${p.id}`}
            className="ys-prov-card"
            style={{
              flex: '0 0 260px',
              background: T.surface,
              border: `1px solid ${T.ruleSoft}`,
              borderRadius: 14,
              padding: 18,
              textDecoration: 'none',
              display: 'flex', flexDirection: 'column', gap: 12,
              transition: 'transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease',
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget
              el.style.transform = 'translateY(-2px)'
              el.style.borderColor = T.indigo
              el.style.boxShadow = '0 12px 24px rgba(15,23,42,0.08)'
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget
              el.style.transform = 'translateY(0)'
              el.style.borderColor = T.ruleSoft
              el.style.boxShadow = 'none'
            }}
          >
            <div style={{ position: 'relative', width: 60, height: 60 }}>
              <span style={{
                width: 60, height: 60, borderRadius: '50%',
                background: `linear-gradient(135deg, ${T.indigo}, ${T.brick})`,
                color: '#fff', fontFamily: T.serif, fontSize: 22, fontWeight: 600,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {p.name.split(' ').map(s => s[0]).slice(0, 2).join('')}
              </span>
              <span style={{
                position: 'absolute', right: -2, bottom: -2,
                width: 20, height: 20, borderRadius: '50%',
                background: T.moss, color: '#fff',
                border: '2px solid #fff',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Check size={11} stroke={2.5} />
              </span>
            </div>

            <div>
              <div style={{ fontFamily: T.serif, fontSize: 18, fontWeight: 500, color: T.ink, lineHeight: 1.2 }}>
                {p.name}
              </div>
              <div style={{ fontFamily: T.sans, fontSize: 12, color: T.inkSoft, marginTop: 2 }}>
                {p.role}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {p.badges.slice(0, 2).map((b) => (
                <span key={b} style={{
                  fontFamily: T.mono, fontSize: 9.5, fontWeight: 600, letterSpacing: '0.08em',
                  textTransform: 'uppercase', color: T.indigo,
                  background: T.indigoSoft, padding: '3px 8px', borderRadius: 6,
                }}>
                  {b}
                </span>
              ))}
            </div>

            <div style={{
              marginTop: 'auto', paddingTop: 10, borderTop: `1px solid ${T.ruleSoft}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              fontFamily: T.sans, fontSize: 12, color: T.inkMid,
            }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Star size={12} stroke={1.6} style={{ color: T.gold, fill: T.gold }} />
                {p.rating.toFixed(1)} · {p.orderCount}
              </span>
              <span>{p.country}</span>
            </div>
          </a>
        ))}
      </div>
    </section>
  )
}
