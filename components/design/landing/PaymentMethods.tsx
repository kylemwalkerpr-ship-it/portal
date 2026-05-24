'use client'
import React from 'react'
import { T } from './tokens'
import { Lock, Shield, Globe } from './icons'

interface PaymentChipProps {
  brand: string
  ariaLabel: string
  available?: boolean
}

function PaymentChip({ brand, ariaLabel, available = true }: PaymentChipProps) {
  return (
    <div
      role="img"
      aria-label={ariaLabel}
      style={{
        background: T.surface,
        border: `1px solid ${T.rule}`,
        borderRadius: 10,
        height: 52,
        minWidth: 80,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        opacity: available ? 1 : 0.55,
        padding: '0 14px',
        boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
      }}
    >
      <span style={{
        fontFamily: T.sans,
        fontSize: 13,
        fontWeight: 700,
        color: T.ink,
        letterSpacing: '-0.01em',
        whiteSpace: 'nowrap',
      }}>
        {brand}
      </span>
      {!available && (
        <span style={{
          position: 'absolute',
          bottom: -8,
          left: '50%',
          transform: 'translateX(-50%)',
          fontFamily: T.mono,
          fontSize: 8.5,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: T.inkSoft,
          background: T.surface2,
          border: `1px solid ${T.rule}`,
          borderRadius: 4,
          padding: '2px 6px',
          whiteSpace: 'nowrap',
        }}>
          Coming soon
        </span>
      )}
    </div>
  )
}

const CHIPS = [
  { brand: 'VISA',         ariaLabel: 'Visa accepted',             available: true  },
  { brand: 'Mastercard',   ariaLabel: 'Mastercard accepted',       available: true  },
  { brand: 'Amex',         ariaLabel: 'American Express accepted', available: true  },
  { brand: 'Discover',     ariaLabel: 'Discover accepted',         available: true  },
  { brand: 'Apple Pay',    ariaLabel: 'Apple Pay coming soon',     available: false },
  { brand: 'Google Pay',   ariaLabel: 'Google Pay coming soon',    available: false },
  { brand: 'Samsung Pay',  ariaLabel: 'Samsung Pay coming soon',   available: false },
  { brand: 'PayPal',       ariaLabel: 'PayPal coming soon',        available: false },
]

export default function PaymentMethods() {
  return (
    <section style={{ background: T.surface, padding: '72px 40px', borderTop: `1px solid ${T.rule}`, borderBottom: `1px solid ${T.rule}` }}>
      <style>{`
        .ys-pay-grid {
          display: grid;
          grid-template-columns: 1fr 1.4fr;
          gap: 48px;
          align-items: center;
        }
        .ys-pay-chips {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px 14px;
        }
        @media (max-width: 900px) {
          .ys-pay-grid { grid-template-columns: 1fr; gap: 32px; }
          .ys-pay-chips { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>

      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        <div className="ys-pay-grid">
          <div>
            <span style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: T.inkSoft }}>
              Accepted payment methods
            </span>
            <h2 style={{ margin: '12px 0 16px', fontFamily: T.serif, fontSize: 'clamp(28px,3vw,40px)', fontWeight: 500, color: T.ink, letterSpacing: '-0.014em' }}>
              Pay the way you already pay everywhere else.
            </h2>
            <p style={{ margin: '0 0 22px', fontFamily: T.sans, fontSize: 14.5, lineHeight: 1.6, color: T.inkMid, maxWidth: 480 }}>
              All major card networks today — processed through our PCI-DSS Level 1 partners, with funds parked in escrow until you approve the work. Wallets and PayPal are on the roadmap.
            </p>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <li style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontFamily: T.sans, fontSize: 13, color: T.inkMid }}>
                <Lock size={14} stroke={1.7} style={{ color: T.indigo }} /> PCI-DSS Level 1 tokenisation
              </li>
              <li style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontFamily: T.sans, fontSize: 13, color: T.inkMid }}>
                <Shield size={14} stroke={1.7} style={{ color: T.moss }} /> 3-D Secure 2 (SCA) for UK & EU
              </li>
              <li style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontFamily: T.sans, fontSize: 13, color: T.inkMid }}>
                <Globe size={14} stroke={1.7} style={{ color: T.brick }} /> Wallets & PayPal availability varies by region
              </li>
            </ul>
          </div>

          <div className="ys-pay-chips">
            {CHIPS.map((c) => (
              <PaymentChip key={c.brand} brand={c.brand} ariaLabel={c.ariaLabel} available={c.available} />
            ))}
          </div>
        </div>

        <div style={{
          marginTop: 36,
          paddingTop: 18,
          borderTop: `1px solid ${T.ruleSoft}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 24, flexWrap: 'wrap',
          fontFamily: T.mono, fontSize: 11, fontWeight: 600,
          letterSpacing: '0.14em', textTransform: 'uppercase',
          color: T.inkSoft,
        }}>
          <span>PCI-DSS Level 1 partners</span>
          <span>USD · GBP · CAD</span>
          <span>SCA-ready</span>
        </div>
      </div>
    </section>
  )
}
