'use client'
import React from 'react'
import { T } from './tokens'
import { Check, Arrow } from './icons'

const MARKET = 'https://market.yousafeconsultancy.com/'
const PORTAL_SIGNUP = 'https://portal.yousafeconsultancy.com/sign-up/student'

const PROMISE = [
  'Funds parked in escrow until you approve the work',
  'Bar-verified attorneys and credentialed consultants only',
  'Encrypted document storage with TLS 1.3',
  'Refund or remediation if anything goes wrong',
]

export default function FinalCTA() {
  return (
    <section style={{
      position: 'relative',
      padding: '88px 40px',
      background: `radial-gradient(circle at 10% 0%, #3C3B6E 0%, #2A2A55 60%, #14133b 100%)`,
      color: '#fff',
      overflow: 'hidden',
    }}>
      {/* Flag bar at top */}
      <div aria-hidden="true" style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 4,
        background: 'linear-gradient(90deg, #3c3b6e 0%, #3c3b6e 33%, #b22234 33%, #b22234 66%, #C4A45A 66%, #C4A45A 100%)',
      }} />
      {/* Gold + brick radial accents */}
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(circle at 85% 30%, rgba(196,164,90,0.18), transparent 45%), radial-gradient(circle at 20% 80%, rgba(178,34,52,0.14), transparent 50%)',
        pointerEvents: 'none',
      }} />

      <style>{`
        .ys-final-grid {
          display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 56px; align-items: center;
          position: relative;
        }
        @media (max-width: 900px) {
          .ys-final-grid { grid-template-columns: 1fr; gap: 32px; }
        }
      `}</style>

      <div style={{ maxWidth: 1240, margin: '0 auto', position: 'relative' }}>
        <div className="ys-final-grid">
          <div>
            <span style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)' }}>
              Start today
            </span>
            <h2 style={{ margin: '14px 0 18px', fontFamily: T.serif, fontSize: 'clamp(36px,4.4vw,60px)', fontWeight: 500, lineHeight: 1.05, letterSpacing: '-0.018em' }}>
              Move on the things that matter — with a team that has your back.
            </h2>
            <p style={{ margin: '0 0 28px', fontSize: 16, lineHeight: 1.55, color: 'rgba(255,255,255,0.78)', maxWidth: 500 }}>
              Submit an inquiry, get matched, pay into escrow, approve the work. That is the whole loop.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <a
                href={PORTAL_SIGNUP}
                style={{
                  background: '#fff', color: T.ink,
                  border: 'none', borderRadius: 999,
                  padding: '14px 26px',
                  fontSize: 15, fontWeight: 600,
                  textDecoration: 'none',
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  fontFamily: T.sans,
                }}
              >
                Start an inquiry <Arrow size={16} stroke={2} />
              </a>
              <a
                href={MARKET}
                style={{
                  background: 'transparent', color: '#fff',
                  border: '1px solid rgba(255,255,255,0.4)',
                  borderRadius: 999, padding: '13px 25px',
                  fontSize: 15, fontWeight: 500,
                  textDecoration: 'none',
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  fontFamily: T.sans,
                }}
              >
                Browse the marketplace
              </a>
            </div>
          </div>

          <div style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: 16,
            padding: 28,
            backdropFilter: 'blur(8px)',
          }}>
            <span style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: T.gold }}>
              The YouSafe promise
            </span>
            <ul style={{ margin: '16px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {PROMISE.map((p) => (
                <li key={p} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, fontSize: 14.5, lineHeight: 1.5, color: 'rgba(255,255,255,0.92)' }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: '50%',
                    background: 'rgba(196,164,90,0.22)', color: T.gold,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, marginTop: 1,
                  }}>
                    <Check size={12} stroke={2.5} />
                  </span>
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
