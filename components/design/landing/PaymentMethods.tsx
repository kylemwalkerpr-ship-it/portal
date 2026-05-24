'use client'
import React from 'react'
import { T } from './tokens'
import { Lock, Shield, Globe } from './icons'

// Inline brand marks — recognizable acceptance-mark shapes, no external deps.
// Production note: swap to official assets from each network's brand resource
// centre when licensing is confirmed (per brief §3.12.1 table).

const VisaMark = () => (
  <svg viewBox="0 0 60 20" width="56" height="20" aria-hidden="true">
    <text x="0" y="16" fontFamily="Helvetica, Arial, sans-serif" fontSize="18" fontWeight="900" fontStyle="italic" fill="#1A1F71" letterSpacing="0.5">VISA</text>
  </svg>
)

const MastercardMark = () => (
  <svg viewBox="0 0 48 30" width="42" height="26" aria-hidden="true">
    <circle cx="19" cy="15" r="11" fill="#EB001B" />
    <circle cx="30" cy="15" r="11" fill="#F79E1B" />
    <path d="M24.5 7a11 11 0 0 1 0 16 11 11 0 0 1 0-16Z" fill="#FF5F00" />
  </svg>
)

const AmexMark = () => (
  <svg viewBox="0 0 56 30" width="50" height="26" aria-hidden="true">
    <rect x="0" y="0" width="56" height="30" rx="3" fill="#1F72CD" />
    <text x="28" y="13" fontFamily="Helvetica, Arial, sans-serif" fontSize="6" fontWeight="900" fill="#fff" textAnchor="middle" letterSpacing="0.4">AMERICAN</text>
    <text x="28" y="22" fontFamily="Helvetica, Arial, sans-serif" fontSize="6" fontWeight="900" fill="#fff" textAnchor="middle" letterSpacing="0.4">EXPRESS</text>
  </svg>
)

const DiscoverMark = () => (
  <svg viewBox="0 0 80 22" width="72" height="20" aria-hidden="true">
    <text x="0" y="16" fontFamily="Helvetica, Arial, sans-serif" fontSize="14" fontWeight="800" fill="#111" letterSpacing="-0.3">DISCOVER</text>
    <circle cx="68" cy="11" r="6.5" fill="#F58220" />
  </svg>
)

const ApplePayMark = () => (
  <svg viewBox="0 0 56 22" width="52" height="22" aria-hidden="true">
    <path d="M9.4 5.7c.5-.7.9-1.6.8-2.5-.7.04-1.6.5-2.1 1.1-.5.5-.9 1.4-.8 2.3.8.07 1.6-.4 2.1-.9Zm.8.9c-1.2-.07-2.1.7-2.7.7-.6 0-1.4-.6-2.3-.6-1.2.02-2.3.7-2.9 1.8-1.3 2.1-.3 5.3.9 7 .6.9 1.3 1.8 2.3 1.8.9-.04 1.3-.6 2.4-.6s1.5.6 2.4.6c1 0 1.7-.9 2.3-1.8.4-.6.7-1.3.9-2.1-2.4-.9-2.6-3.9-.2-5.1-.4-.5-1-1.7-3.1-1.7Z" fill="#111"/>
    <text x="16" y="17" fontFamily="Helvetica, Arial, sans-serif" fontSize="12" fontWeight="600" fill="#111">Pay</text>
  </svg>
)

const GooglePayMark = () => (
  <svg viewBox="0 0 56 22" width="52" height="22" aria-hidden="true">
    <text x="0" y="17" fontFamily="Helvetica, Arial, sans-serif" fontSize="13" fontWeight="700" fill="#4285F4">G</text>
    <text x="9" y="17" fontFamily="Helvetica, Arial, sans-serif" fontSize="13" fontWeight="700" fill="#EA4335">o</text>
    <text x="18" y="17" fontFamily="Helvetica, Arial, sans-serif" fontSize="13" fontWeight="700" fill="#FBBC04">o</text>
    <text x="27" y="17" fontFamily="Helvetica, Arial, sans-serif" fontSize="13" fontWeight="700" fill="#4285F4">g</text>
    <text x="36" y="17" fontFamily="Helvetica, Arial, sans-serif" fontSize="13" fontWeight="700" fill="#34A853">l</text>
    <text x="40" y="17" fontFamily="Helvetica, Arial, sans-serif" fontSize="13" fontWeight="700" fill="#EA4335">e</text>
    <text x="49" y="17" fontFamily="Helvetica, Arial, sans-serif" fontSize="12" fontWeight="600" fill="#5F6368">Pay</text>
  </svg>
)

const SamsungPayMark = () => (
  <svg viewBox="0 0 90 22" width="80" height="20" aria-hidden="true">
    <text x="0" y="16" fontFamily="Helvetica, Arial, sans-serif" fontSize="11" fontWeight="700" fill="#1428A0" letterSpacing="-0.2">SAMSUNG</text>
    <text x="60" y="16" fontFamily="Helvetica, Arial, sans-serif" fontSize="11" fontWeight="400" fill="#1428A0">Pay</text>
  </svg>
)

const PayPalMark = () => (
  <svg viewBox="0 0 64 22" width="60" height="20" aria-hidden="true">
    <text x="0" y="17" fontFamily="Helvetica, Arial, sans-serif" fontSize="14" fontWeight="900" fontStyle="italic" fill="#003087">Pay</text>
    <text x="25" y="17" fontFamily="Helvetica, Arial, sans-serif" fontSize="14" fontWeight="900" fontStyle="italic" fill="#009CDE">Pal</text>
  </svg>
)

interface PaymentChipProps {
  brand: string
  ariaLabel: string
  available?: boolean
  Mark: React.FC
}

function PaymentChip({ brand, ariaLabel, available = true, Mark }: PaymentChipProps) {
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
      <Mark />
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
  { brand: 'Visa',         ariaLabel: 'Visa accepted',             available: true,  Mark: VisaMark },
  { brand: 'Mastercard',   ariaLabel: 'Mastercard accepted',       available: true,  Mark: MastercardMark },
  { brand: 'Amex',         ariaLabel: 'American Express accepted', available: true,  Mark: AmexMark },
  { brand: 'Discover',     ariaLabel: 'Discover accepted',         available: true,  Mark: DiscoverMark },
  { brand: 'Apple Pay',    ariaLabel: 'Apple Pay coming soon',     available: false, Mark: ApplePayMark },
  { brand: 'Google Pay',   ariaLabel: 'Google Pay coming soon',    available: false, Mark: GooglePayMark },
  { brand: 'Samsung Pay',  ariaLabel: 'Samsung Pay coming soon',   available: false, Mark: SamsungPayMark },
  { brand: 'PayPal',       ariaLabel: 'PayPal coming soon',        available: false, Mark: PayPalMark },
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
              <PaymentChip key={c.brand} brand={c.brand} ariaLabel={c.ariaLabel} available={c.available} Mark={c.Mark} />
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
