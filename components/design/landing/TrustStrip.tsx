'use client'
import React from 'react'
import { T } from './tokens'

const CHIPS = [
  'PCI-DSS Level 1 payments',
  'Funds held in escrow',
  'ABA Rule 5.4 compliant',
  'Encrypted document storage',
  'Clerk-secured sign-in',
  '3-D Secure 2 (SCA) ready',
  'GDPR & DPA 2018 ready',
  'TLS 1.3 across the board',
]

export default function TrustStrip() {
  const loop = [...CHIPS, ...CHIPS]
  return (
    <section id="trust" style={{ background: T.surface, padding: '48px 0', borderTop: `1px solid ${T.rule}`, borderBottom: `1px solid ${T.rule}` }}>
      <style>{`
        @keyframes ys-trust-drift {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        .ys-trust-strip {
          display: flex; gap: 14px; width: max-content;
          animation: ys-trust-drift 42s linear infinite;
        }
        .ys-trust-wrap {
          -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 6%, #000 94%, transparent 100%);
          mask-image: linear-gradient(90deg, transparent 0, #000 6%, #000 94%, transparent 100%);
          overflow: hidden;
        }
        @media (prefers-reduced-motion: reduce) {
          .ys-trust-strip { animation: none; }
        }
      `}</style>

      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <span style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: T.inkSoft }}>
          Trust & safety
        </span>
      </div>

      <div className="ys-trust-wrap">
        <div className="ys-trust-strip">
          {loop.map((chip, i) => (
            <span key={i} style={{
              flex: '0 0 auto',
              fontFamily: T.mono, fontSize: 11.5, fontWeight: 600,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              color: T.inkMid,
              border: `1px solid ${T.rule}`,
              borderRadius: 999,
              padding: '8px 16px',
              whiteSpace: 'nowrap',
            }}>
              {chip}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
