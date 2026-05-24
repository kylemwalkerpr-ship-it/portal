'use client'
import React from 'react'
import { T } from './tokens'
import { Arrow, Shield, Scale, Lock, Coin } from './icons'

interface HeroProps {
  onSignup?: () => void
}

const POSTER_A = 'https://media.yousafeconsultancy.com/hero/student-working.poster.jpg?v=20260524'
const MARKET_HOME = 'https://market.yousafeconsultancy.com/'

export default function Hero({ onSignup }: HeroProps) {
  return (
    <header
      className="ys-hero"
      style={{
        display: 'grid',
        gridTemplateColumns: '1.05fr 0.95fr',
        gap: 56,
        alignItems: 'center',
        padding: '72px 40px 96px',
        maxWidth: 1240,
        margin: '0 auto',
      }}
    >
      {/* ── Left: copy ──────────────────────────────────────────────── */}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 12px',
              borderRadius: 999,
              border: `1px solid ${T.rule}`,
              background: 'rgba(255,255,255,0.7)',
              fontFamily: T.mono,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: T.inkMid,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: T.moss,
                boxShadow: `0 0 0 4px rgba(95,107,58,0.12)`,
              }}
            />
            Now serving US · UK · Canada
          </span>
        </div>

        <h1
          style={{
            margin: 0,
            fontFamily: T.serif,
            fontSize: 'clamp(48px, 6.4vw, 80px)',
            lineHeight: 1.02,
            letterSpacing: '-0.018em',
            color: T.ink,
            fontWeight: 500,
          }}
        >
          Your team for the
          <br />
          <em
            style={{
              fontStyle: 'italic',
              color: T.indigo,
              position: 'relative',
              display: 'inline-block',
            }}
          >
            moves that matter
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: '-0.06em',
                height: 8,
                background: `linear-gradient(90deg, ${T.gold}, ${T.brick})`,
                opacity: 0.22,
                borderRadius: 4,
                transform: 'skewX(-6deg)',
              }}
            />
          </em>
          <span style={{ color: T.inkMid }}>.</span>
        </h1>

        <p
          className="ys-hero__sub"
          style={{
            margin: '24px 0 32px',
            color: T.inkMid,
            fontSize: 19,
            lineHeight: 1.55,
            maxWidth: 560,
          }}
        >
          Study-abroad consulting and US, UK and Canadian legal document review — handled by{' '}
          <strong style={{ color: T.ink, fontWeight: 600 }}>vetted professionals</strong>, paid in escrow, and delivered through one secure portal.
        </p>

        <div className="ys-hero__cta" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onSignup}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              background: T.ink,
              color: '#fff',
              border: 'none',
              borderRadius: 999,
              padding: '15px 28px',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: T.sans,
              textDecoration: 'none',
              transition: 'transform 140ms ease, box-shadow 140ms ease',
            }}
          >
            Start an inquiry
            <Arrow size={16} stroke={2} />
          </button>
          <a
            href={MARKET_HOME}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              color: T.ink,
              border: '1px solid rgba(0,0,0,0.15)',
              borderRadius: 999,
              padding: '14px 26px',
              fontSize: 15,
              fontWeight: 500,
              textDecoration: 'none',
              fontFamily: T.sans,
              transition: 'transform 140ms ease, border-color 140ms ease, background 140ms ease',
            }}
          >
            Browse marketplace
          </a>
        </div>

        {/* Trust micro-row */}
        <div
          style={{
            marginTop: 40,
            display: 'flex',
            gap: 28,
            flexWrap: 'wrap',
            color: T.inkSoft,
            fontSize: 12,
            letterSpacing: '0.02em',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Shield size={14} stroke={1.6} style={{ color: T.indigo }} />
            Funds in <strong style={{ color: T.ink, fontWeight: 600, marginLeft: 4 }}>escrow</strong>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Scale size={14} stroke={1.6} style={{ color: T.brick }} />
            <strong style={{ color: T.ink, fontWeight: 600 }}>ABA Rule 5.4</strong>&nbsp;compliant
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Lock size={14} stroke={1.6} style={{ color: T.moss }} />
            Encrypted documents
          </span>
        </div>
      </div>

      {/* ── Right: media card ──────────────────────────────────────── */}
      <div
        className="ys-hero__media"
        style={{
          position: 'relative',
          borderRadius: 22,
          overflow: 'hidden',
          aspectRatio: '4 / 5',
          minHeight: 520,
          background: `linear-gradient(135deg, ${T.indigo}, ${T.indigoDeep})`,
          border: `1px solid ${T.rule}`,
          boxShadow: '0 30px 80px rgba(15,23,42,0.18), 0 0 0 1px rgba(255,255,255,0.4) inset',
        }}
      >
        {/* Poster layer (Phase 1: static image only, no video) */}
        <img
          src={POSTER_A}
          alt=""
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: 'saturate(0.85) contrast(1.05) brightness(0.92)',
          }}
        />

        {/* Overlays */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background: `linear-gradient(180deg, rgba(15,23,42,0.10) 0%, rgba(15,23,42,0.45) 65%, rgba(15,23,42,0.78) 100%),
                       radial-gradient(circle at 75% 15%, rgba(196,164,90,0.22), transparent 55%)`,
            zIndex: 1,
          }}
        />

        {/* US-UK-CA flag bar at top */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 4,
            background:
              'linear-gradient(90deg, #3c3b6e 0%, #3c3b6e 33%, #b22234 33%, #b22234 66%, #C4A45A 66%, #C4A45A 100%)',
            zIndex: 2,
          }}
        />

        {/* Top-left chip */}
        <div
          style={{
            position: 'absolute',
            top: 24,
            left: 24,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 11px',
            borderRadius: 999,
            background: 'rgba(255,255,255,0.18)',
            border: '1px solid rgba(255,255,255,0.32)',
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontFamily: T.mono,
            backdropFilter: 'blur(10px)',
            zIndex: 2,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#86efac',
              boxShadow: '0 0 0 4px rgba(134,239,172,0.25)',
            }}
          />
          Active across US · UK · Canada
        </div>

        {/* Bottom card — pull-quote */}
        <div
          style={{
            position: 'absolute',
            left: 24,
            right: 24,
            bottom: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            color: '#fff',
            zIndex: 2,
          }}
        >
          <div
            style={{
              fontFamily: T.serif,
              fontSize: 22,
              fontWeight: 500,
              lineHeight: 1.32,
              letterSpacing: '-0.005em',
            }}
          >
            “The SOP review changed everything. Four rejections turned into three offers.”
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              paddingTop: 12,
              borderTop: '1px solid rgba(255,255,255,0.20)',
            }}
          >
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: `linear-gradient(135deg, ${T.gold}, ${T.brick})`,
                color: '#fff',
                fontFamily: T.serif,
                fontWeight: 600,
                fontSize: 14,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              P
            </span>
            <span style={{ fontSize: 12.5, opacity: 0.95, lineHeight: 1.3 }}>
              <strong style={{ fontWeight: 700 }}>Priya S.</strong>
              <br />
              <span style={{ opacity: 0.75, fontSize: 11 }}>India → Australia · Education member</span>
            </span>
            <span
              style={{
                marginLeft: 'auto',
                fontFamily: T.mono,
                fontSize: 10,
                letterSpacing: '0.14em',
                opacity: 0.75,
              }}
            >
              VERIFIED
            </span>
          </div>
        </div>

        {/* Floating cost card on bottom-right */}
        <div
          style={{
            position: 'absolute',
            top: 84,
            right: -18,
            transform: 'rotate(2deg)',
            background: '#fff',
            borderRadius: 14,
            padding: '12px 14px',
            boxShadow: '0 20px 40px rgba(15,23,42,0.25)',
            border: `1px solid ${T.rule}`,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            zIndex: 3,
            minWidth: 200,
          }}
        >
          <span
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: T.indigoSoft,
              color: T.indigo,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Coin size={20} stroke={1.6} />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
            <span
              style={{
                fontFamily: T.mono,
                fontSize: 9.5,
                fontWeight: 600,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: T.inkSoft,
              }}
            >
              Escrow released
            </span>
            <span style={{ fontFamily: T.serif, fontWeight: 600, fontSize: 17, color: T.ink }}>
              $1,240.00
            </span>
            <span style={{ fontSize: 11, color: T.moss, fontWeight: 600, marginTop: 2 }}>
              Order #4382 · Approved
            </span>
          </div>
        </div>
      </div>
    </header>
  )
}
