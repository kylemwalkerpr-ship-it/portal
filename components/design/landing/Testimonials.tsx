'use client'
import React from 'react'
import { T } from './tokens'
import { Star, Quote } from './icons'
import type { Testimonial } from './data/testimonials'

interface TestimonialsProps {
  testimonials: Testimonial[]
}

export default function Testimonials({ testimonials }: TestimonialsProps) {
  // Duplicate the array once for a seamless infinite loop
  const loop = [...testimonials, ...testimonials]
  return (
    <section style={{ background: T.surface2, padding: '88px 0' }}>
      <style>{`
        @keyframes ys-test-drift {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        .ys-test-strip {
          display: flex; gap: 18px; width: max-content;
          animation: ys-test-drift 90s linear infinite;
        }
        .ys-test-wrap:hover .ys-test-strip { animation-play-state: paused; }
        .ys-test-wrap {
          -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 6%, #000 94%, transparent 100%);
          mask-image: linear-gradient(90deg, transparent 0, #000 6%, #000 94%, transparent 100%);
          overflow: hidden;
        }
        @media (prefers-reduced-motion: reduce) {
          .ys-test-strip { animation: none; overflow-x: auto; }
          .ys-test-wrap { overflow-x: auto; mask-image: none; -webkit-mask-image: none; }
        }
      `}</style>

      <div style={{ maxWidth: 1240, margin: '0 auto 32px', padding: '0 40px' }}>
        <div style={{ textAlign: 'center' }}>
          <span style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: T.inkSoft }}>
            Member stories
          </span>
          <h2 style={{ margin: '12px 0 0', fontFamily: T.serif, fontSize: 'clamp(32px,3.6vw,48px)', fontWeight: 500, color: T.ink, letterSpacing: '-0.014em' }}>
            What members say after the work ships.
          </h2>
        </div>
      </div>

      <div className="ys-test-wrap">
        <div className="ys-test-strip">
          {loop.map((t, i) => (
            <article
              key={i}
              style={{
                flex: '0 0 380px',
                background: T.surface,
                border: `1px solid ${T.ruleSoft}`,
                borderRadius: 14,
                padding: 24,
                position: 'relative',
              }}
            >
              <Quote
                size={28} stroke={1}
                style={{ position: 'absolute', top: 16, right: 18, color: T.inkDim, opacity: 0.5 }}
                aria-hidden="true"
              />
              <div style={{ display: 'flex', gap: 3, marginBottom: 12 }}>
                {Array.from({ length: t.rating }).map((_, idx) => (
                  <Star key={idx} size={14} stroke={1.6} style={{ color: T.gold, fill: T.gold }} />
                ))}
              </div>
              <blockquote style={{
                margin: 0,
                fontFamily: T.serif, fontStyle: 'italic',
                fontSize: 18, lineHeight: 1.5,
                color: T.ink, letterSpacing: '-0.005em',
                display: '-webkit-box',
                WebkitLineClamp: 4,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}>
                "{t.text}"
              </blockquote>
              <div style={{
                marginTop: 18, paddingTop: 14, borderTop: `1px solid ${T.ruleSoft}`,
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <span style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: `linear-gradient(135deg, ${T.gold}, ${T.brick})`,
                  color: '#fff', fontFamily: T.serif, fontSize: 14, fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {t.name.split(' ').map(s => s[0]).slice(0, 2).join('')}
                </span>
                <div style={{ fontSize: 12.5, lineHeight: 1.3 }}>
                  <div style={{ fontWeight: 700, color: T.ink }}>{t.name}</div>
                  <div style={{ color: T.inkSoft }}>{t.country} · {t.role}</div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
