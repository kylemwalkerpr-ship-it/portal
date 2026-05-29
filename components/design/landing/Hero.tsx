'use client'
import React, { useEffect, useRef, useState } from 'react'
import { T } from './tokens'
import { Arrow, Shield, Scale, Lock, Coin } from './icons'

interface HeroProps {
  onSignup?: () => void
}

const MEDIA = 'https://media.yousafeconsultancy.com/hero'
const V = '20260524'

const A_POSTER = `${MEDIA}/student-working.poster.jpg?v=${V}`
const A_H264   = `${MEDIA}/student-working.h264.mp4?v=${V}`
const A_HEVC   = `${MEDIA}/student-working.hevc.mp4?v=${V}`
const B_POSTER = `${MEDIA}/students-walking.poster.jpg?v=${V}`
const B_H264   = `${MEDIA}/students-walking.h264.mp4?v=${V}`
const B_HEVC   = `${MEDIA}/students-walking.hevc.mp4?v=${V}`

const FADE_MS = 1200
const HOLD_MS = 9500

const MARKET_HOME = 'https://market.yousafeconsultancy.com/'

function shouldSkipVideo(): boolean {
  if (typeof window === 'undefined') return true
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
  const saveData = (navigator as any).connection?.saveData
  const slow = ['slow-2g', '2g', '3g'].includes((navigator as any).connection?.effectiveType)
  const mobile = window.matchMedia?.('(max-width: 720px)')?.matches
  return reducedMotion || saveData || slow || mobile
}

export default function Hero({ onSignup }: HeroProps) {
  const videoARef = useRef<HTMLVideoElement>(null)
  const videoBRef = useRef<HTMLVideoElement>(null)
  const [active, setActive] = useState(0)
  const [bothReady, setBothReady] = useState(false)
  const [videoEnabled, setVideoEnabled] = useState(false)

  // Determine whether video should load at all
  useEffect(() => {
    setVideoEnabled(!shouldSkipVideo())
  }, [])

  // IntersectionObserver: start preloading + playing when the hero enters viewport
  useEffect(() => {
    if (!videoEnabled) return
    const a = videoARef.current
    const b = videoBRef.current
    if (!a) return
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          a.preload = 'auto'
          if (b) b.preload = 'auto'
          // Force the muted DOM *property* (the JSX `muted` attribute does not
          // reliably set it) so the browser allows muted autoplay instead of
          // blocking play() and overlaying a native play button on the poster.
          a.muted = true; a.defaultMuted = true
          if (b) { b.muted = true; b.defaultMuted = true }
          a.play?.().catch(() => {})
          b?.play?.().catch(() => {})
          io.disconnect()
        }
      }
    })
    io.observe(a)
    return () => io.disconnect()
  }, [videoEnabled])

  // Crossfade controller: only start once both videos have loadedData
  useEffect(() => {
    if (!videoEnabled || !bothReady) return
    const id = setInterval(() => setActive(p => p ^ 1), HOLD_MS)
    return () => clearInterval(id)
  }, [videoEnabled, bothReady])

  // Track readiness per layer
  const readiness = useRef({ a: false, b: false })
  const markReady = (which: 'a' | 'b') => {
    readiness.current[which] = true
    if (readiness.current.a && readiness.current.b) {
      setBothReady(true)
    }
  }

  const videoBaseStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    filter: 'saturate(0.85) contrast(1.05) brightness(0.92)',
    transition: `opacity ${FADE_MS}ms ease`,
    zIndex: 1,
  }

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
          /* NO overflow:hidden here — the floating card breaks out right */
        }}
      >
        {/* Inner clip container for rounded video/image corners */}
        <div
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
          {/* Video layers (desktop only) */}
          {videoEnabled && (
            <>
              <video
                ref={videoARef}
                poster={A_POSTER}
                muted
                loop
                playsInline
                preload="none"
                onLoadedData={(e) => { e.currentTarget.muted = true; markReady('a') }}
                aria-hidden="true"
                style={{
                  ...videoBaseStyle,
                  opacity: active === 0 ? 1 : 0,
                }}
              >
                <source src={A_HEVC} type='video/mp4; codecs="hvc1"' />
                <source src={A_H264} type="video/mp4" />
              </video>
              <video
                ref={videoBRef}
                poster={B_POSTER}
                muted
                loop
                playsInline
                preload="none"
                onLoadedData={(e) => { e.currentTarget.muted = true; markReady('b') }}
                aria-hidden="true"
                style={{
                  ...videoBaseStyle,
                  opacity: active === 1 ? 1 : 0,
                }}
              >
                <source src={B_HEVC} type='video/mp4; codecs="hvc1"' />
                <source src={B_H264} type="video/mp4" />
              </video>
            </>
          )}

          {/* Poster fallback when video is skipped */}
          {!videoEnabled && (
            <img
              src={A_POSTER}
              alt=""
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                filter: 'saturate(0.85) contrast(1.05) brightness(0.92)',
                zIndex: 1,
              }}
            />
          )}

          {/* Overlays */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              background: `linear-gradient(180deg, rgba(15,23,42,0.10) 0%, rgba(15,23,42,0.45) 65%, rgba(15,23,42,0.78) 100%),
                         radial-gradient(circle at 75% 15%, rgba(196,164,90,0.22), transparent 55%)`,
              zIndex: 2,
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
              zIndex: 3,
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
              zIndex: 3,
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
              zIndex: 3,
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
              "The SOP review changed everything. Four rejections turned into three offers."
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
        </div>

        {/* Floating cost card — positioned on outer wrapper so it breaks out right */}
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
            zIndex: 4,
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
