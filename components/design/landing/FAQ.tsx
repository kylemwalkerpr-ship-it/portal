'use client'
import React from 'react'
import { T } from './tokens'
import { Plus, ArrowUR } from './icons'

const SUPPORT = 'https://support.yousafeconsultancy.com/'

const ITEMS = [
  {
    q: 'How does payment work?',
    a: 'You pay into escrow when you accept an offer. The funds stay there until you approve the delivered work, then they release to the provider. If something goes wrong, you can dispute the order and our support team mediates.',
  },
  {
    q: 'Who are the attorneys and consultants?',
    a: 'Every attorney on the panel is bar-verified in their stated jurisdiction; every consultant is credentialed (CICC, OISC, or equivalent). We check their licences on intake and again on every renewal cycle.',
  },
  {
    q: 'What countries do you cover?',
    a: 'Today: United States, United Kingdom and Canada. Country-specific compliance (ABA Rule 5.4 in the US, SRA in the UK, Law Society rules in Canada) is enforced at the platform level.',
  },
  {
    q: 'Is my information secure?',
    a: 'TLS 1.3 in transit, encrypted document storage at rest, and Clerk-secured sign-in with 2FA available. The members area is no-indexed and your data is never sold or shared with marketers.',
  },
  {
    q: 'How quickly can I get matched?',
    a: 'Most inquiries receive an offer within a few hours of intake. Complex matters (e.g. visa appeals, multi-jurisdictional cases) may take 24–48 hours as more attorneys review the brief.',
  },
  {
    q: 'What if I am not satisfied with the work?',
    a: 'Request revisions before approving. If revisions are not enough, open a dispute — support reviews the order history, messages, and deliverables and decides on a refund or release. Most disputes resolve within a week.',
  },
]

export default function FAQ() {
  const [openIdx, setOpenIdx] = React.useState<number | null>(0)

  return (
    <section id="faq" style={{ background: T.surface, padding: '88px 40px' }}>
      <style>{`
        .ys-faq-grid {
          display: grid;
          grid-template-columns: 320px minmax(0, 1fr);
          gap: 56px;
        }
        .ys-faq-items {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0 40px;
        }
        @media (max-width: 980px) {
          .ys-faq-grid { grid-template-columns: 1fr; gap: 32px; }
          .ys-faq-items { grid-template-columns: 1fr; }
        }
      `}</style>

      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        <div className="ys-faq-grid">
          <div style={{ position: 'sticky', top: 96, alignSelf: 'start' }}>
            <span style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: T.inkSoft }}>
              Frequently asked
            </span>
            <h2 style={{ margin: '12px 0 14px', fontFamily: T.serif, fontSize: 'clamp(28px,3vw,40px)', fontWeight: 500, color: T.ink, letterSpacing: '-0.014em' }}>
              The questions we get every week.
            </h2>
            <p style={{ margin: '0 0 22px', fontFamily: T.sans, fontSize: 14, lineHeight: 1.6, color: T.inkMid, maxWidth: 280 }}>
              Most answers are below. If something is not covered, the support team replies in business hours, usually within a few hours.
            </p>
            <a
              href={SUPPORT}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontFamily: T.sans, fontSize: 13, fontWeight: 500,
                color: T.ink, textDecoration: 'none',
                background: 'transparent',
                border: `1px solid rgba(0,0,0,0.15)`,
                borderRadius: 999, padding: '10px 18px',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              Talk to support <ArrowUR size={13} stroke={2} />
            </a>
          </div>

          <div className="ys-faq-items">
            {ITEMS.map((item, i) => {
              const isOpen = openIdx === i
              return (
                <div
                  key={i}
                  style={{
                    borderTop: i < 2 || (i === 2 && false) ? 'none' : `1px solid ${T.ruleSoft}`,
                  }}
                >
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpenIdx(isOpen ? null : i)}
                    style={{
                      width: '100%', textAlign: 'left',
                      background: 'transparent', border: 'none',
                      padding: '18px 0', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: 16, color: T.ink,
                      borderTop: `1px solid ${T.ruleSoft}`,
                    }}
                  >
                    <span style={{ fontFamily: T.serif, fontSize: 18, fontWeight: 500, lineHeight: 1.3, letterSpacing: '-0.005em' }}>
                      {item.q}
                    </span>
                    <span style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: T.surface2, color: T.ink,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)',
                      transition: 'transform 180ms ease',
                      flexShrink: 0,
                    }}>
                      <Plus size={14} stroke={2} />
                    </span>
                  </button>
                  {isOpen && (
                    <div style={{
                      paddingBottom: 18,
                      fontFamily: T.sans, fontSize: 14, lineHeight: 1.65,
                      color: T.inkMid,
                    }}>
                      {item.a}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
