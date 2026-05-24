'use client'
import React from 'react'
import { T } from './tokens'
import { Star } from './icons'

interface StatsBandProps {
  stats: Array<{ value: string; label: string; star?: boolean }>
}

export default function StatsBand({ stats }: StatsBandProps) {
  return (
    <section
      style={{
        background: '#FFFFFF',
        borderTop: `1px solid ${T.rule}`,
        borderBottom: `1px solid ${T.rule}`,
      }}
    >
      <div className="ys-stats-band__inner">
        {stats.map((stat, i) => (
          <div
            key={i}
            className="ys-stats-band__item"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  fontFamily: T.serif,
                  fontSize: 'clamp(28px, 3vw, 40px)',
                  fontWeight: 500,
                  lineHeight: 1,
                  color: T.ink,
                }}
              >
                {stat.value}
              </span>
              {stat.star && (
                <Star
                  size={20}
                  style={{ color: T.gold, fill: T.gold }}
                  aria-hidden="true"
                />
              )}
            </div>
            <span
              style={{
                fontFamily: T.mono,
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: T.inkSoft,
              }}
            >
              {stat.label}
            </span>
          </div>
        ))}
      </div>

      <style jsx>{`
        .ys-stats-band__inner {
          max-width: 1240px;
          margin: 0 auto;
          padding: 48px 40px;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0;
        }
        .ys-stats-band__item {
          padding-left: 24px;
          border-left: 1px solid #E5E7EB;
        }
        @media (max-width: 720px) {
          .ys-stats-band__inner {
            grid-template-columns: repeat(2, 1fr);
            gap: 24px 0;
          }
          .ys-stats-band__item:nth-child(odd) {
            padding-left: 0;
            border-left: none;
          }
          .ys-stats-band__item:nth-child(even) {
            padding-left: 24px;
            border-left: 1px solid #E5E7EB;
          }
        }
      `}</style>
    </section>
  )
}
