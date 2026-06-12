'use client'
import React from 'react'
import { T } from './tokens'
import { Doc, Spark, Coin, Check } from './icons'
import SectionVideoBackdrop from './SectionVideoBackdrop'

const STEPS = [
  {
    n: 1,
    title: 'Submit your inquiry',
    body: 'Tell us about your case — admissions, visa, legal document review, anything. One quick form, no signup wall.',
    Icon: Doc,
  },
  {
    n: 2,
    title: 'Get matched',
    body: 'Vetted attorneys and consultants review your inquiry and send custom offers within hours.',
    Icon: Spark,
  },
  {
    n: 3,
    title: 'Pay into escrow',
    body: 'Your funds sit in escrow with a PCI-DSS Level 1 partner — released only after you approve the work.',
    Icon: Coin,
  },
  {
    n: 4,
    title: 'Approve and release',
    body: 'Review the deliverable, request revisions, and release the payment when you are satisfied.',
    Icon: Check,
  },
]

export default function HowItWorks() {
  return (
    <section
      id="how"
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: T.paper,
        padding: '88px 40px',
      }}
    >
      <SectionVideoBackdrop
        overlay="linear-gradient(135deg, rgba(250,250,248,0.68), rgba(241,238,230,0.54))"
        opacity={0.66}
      />
      <style>{`
        .ys-how-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
          position: relative;
        }
        .ys-how-step {
          padding: 22px 24px 24px;
          position: relative;
          background: rgba(255,255,255,0.82);
          border: 1px solid rgba(255,255,255,0.5);
          border-radius: 16px;
          box-shadow: 0 22px 60px -50px rgba(15,23,42,0.42);
          backdrop-filter: blur(10px);
        }
        .ys-how-step::after {
          content: '';
          position: absolute;
          top: 22px;
          right: -2px;
          width: 60%;
          height: 2px;
          background: repeating-linear-gradient(90deg, ${T.inkDim} 0 6px, transparent 6px 12px);
        }
        .ys-how-step:last-child::after { display: none; }
        @media (max-width: 720px) {
          .ys-how-grid { grid-template-columns: 1fr; gap: 18px; }
          .ys-how-step::after { display: none; }
          .ys-how-step { padding: 22px; }
        }
      `}</style>

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1240, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <span style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: T.inkSoft }}>
            How it works
          </span>
          <h2 style={{ margin: '12px 0 0', fontFamily: T.serif, fontSize: 'clamp(32px,3.6vw,48px)', fontWeight: 500, color: T.ink, letterSpacing: '-0.014em' }}>
            From inquiry to approval in four steps.
          </h2>
        </div>

        <div className="ys-how-grid">
          {STEPS.map(({ n, title, body, Icon }) => (
            <div key={n} className="ys-how-step">
              <span
                style={{
                  width: 44, height: 44, borderRadius: 10,
                  background: T.ink, color: '#fff',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: T.serif, fontSize: 20, fontWeight: 600,
                  marginBottom: 18,
                }}
              >
                {n}
              </span>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Icon size={16} stroke={1.7} style={{ color: T.indigo }} />
                <h3 style={{ margin: 0, fontFamily: T.serif, fontSize: 20, fontWeight: 500, color: T.ink, letterSpacing: '-0.005em' }}>
                  {title}
                </h3>
              </div>
              <p style={{ margin: 0, fontFamily: T.sans, fontSize: 14, lineHeight: 1.6, color: T.inkMid, maxWidth: 240 }}>
                {body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
