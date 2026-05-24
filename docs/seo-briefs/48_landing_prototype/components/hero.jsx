/* eslint-disable react/prop-types */
// @ts-nocheck
const heroT = window.YS_TOKENS;
const { useState: hUseState, useEffect: hUseEffect, useRef: hUseRef } = React;

// ── Hero — split layout, text-first LCP, dim video on right ─────────────
function Hero({ videoEnabled = true, videoSources = [], onSignIn }) {
  const videoARef = hUseRef(null);
  const videoBRef = hUseRef(null);
  const [active, setActive] = hUseState(0); // 0 = A visible, 1 = B visible
  const [bothReady, setBothReady] = hUseState(false);

  // Defer / skip video on save-data, reduced-motion, mobile.
  hUseEffect(() => {
    if (!videoEnabled || videoSources.length === 0) return;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const saveData = navigator.connection?.saveData;
    const mobile = window.matchMedia?.('(max-width: 720px)').matches;
    if (reducedMotion || saveData || mobile) return;

    const a = videoARef.current;
    const b = videoBRef.current;
    if (!a) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          a.play?.().catch(() => {});
          // Pre-fetch B once A is on-screen and started — we'll need it within ~10s.
          if (b) b.play?.().catch(() => {});
          io.disconnect();
        }
      }
    }, { rootMargin: '0px' });
    io.observe(a);
    return () => io.disconnect();
  }, [videoEnabled, videoSources]);

  // Crossfade controller. Switches active layer every 10s; the 1.2s opacity
  // transition handled in CSS gives a clean cinematic dissolve.
  hUseEffect(() => {
    if (!videoEnabled || videoSources.length < 2 || !bothReady) return;
    const id = setInterval(() => {
      setActive(prev => (prev + 1) % 2);
    }, 9500);
    return () => clearInterval(id);
  }, [videoEnabled, videoSources, bothReady]);

  // Track readiness — only start the crossfade when BOTH videos have decoded
  // at least their first frame; otherwise the first fade may show a black layer.
  const readiness = hUseRef({ a: false, b: false });
  const markReady = (which) => {
    readiness.current[which] = true;
    if (readiness.current.a && readiness.current.b) setBothReady(true);
  };

  const srcA = videoSources[0];
  const srcB = videoSources[1] || videoSources[0];

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
            className="ys-eyebrow"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 12px',
              borderRadius: 999,
              border: `1px solid ${heroT.rule}`,
              background: 'rgba(255,255,255,0.7)',
              color: heroT.inkMid,
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: heroT.moss, boxShadow: `0 0 0 4px ${heroT.moss}1f` }} />
            Now serving US · UK · Canada
          </span>
        </div>

        <h1
          style={{
            margin: 0,
            fontFamily: heroT.serif,
            fontSize: 'clamp(48px, 6.4vw, 80px)',
            lineHeight: 1.02,
            letterSpacing: '-0.018em',
            color: heroT.ink,
            fontWeight: 500,
          }}
        >
          Your team for the
          <br />
          <em
            style={{
              fontStyle: 'italic',
              color: heroT.indigo,
              position: 'relative',
              display: 'inline-block',
            }}
          >
            moves that matter
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: 0, right: 0,
                bottom: '-0.06em',
                height: 8,
                background: `linear-gradient(90deg, ${heroT.gold}, ${heroT.brick})`,
                opacity: 0.22,
                borderRadius: 4,
                transform: 'skewX(-6deg)',
              }}
            />
          </em>
          <span style={{ color: heroT.inkMid }}>.</span>
        </h1>

        <p
          className="ys-hero__sub"
          style={{
            margin: '24px 0 32px',
            color: heroT.inkMid,
            fontSize: 19,
            lineHeight: 1.55,
            maxWidth: 560,
          }}
        >
          Study-abroad consulting and US, UK and Canadian legal document review — handled by{' '}
          <strong style={{ color: heroT.ink, fontWeight: 600 }}>vetted professionals</strong>, paid in escrow, and delivered through one secure portal.
        </p>

        <div className="ys-hero__cta" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <a href={window.YS_URLS.signUpDefault} className="ys-btn ys-btn--primary" style={{ padding: '15px 28px', fontSize: 15 }}>
            Start an inquiry
            <Icon.Arrow size={16} stroke={2} />
          </a>
          <a href={window.YS_URLS.marketHome} className="ys-btn ys-btn--ghost" style={{ padding: '14px 26px', fontSize: 15 }}>
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
            color: heroT.inkSoft,
            fontSize: 12,
            letterSpacing: '0.02em',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Icon.Shield size={14} stroke={1.6} style={{ color: heroT.indigo }} />
            Funds in <strong style={{ color: heroT.ink, fontWeight: 600, marginLeft: 4 }}>escrow</strong>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Icon.Scale size={14} stroke={1.6} style={{ color: heroT.brick }} />
            <strong style={{ color: heroT.ink, fontWeight: 600 }}>ABA Rule 5.4</strong>&nbsp;compliant
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Icon.Lock size={14} stroke={1.6} style={{ color: heroT.moss }} />
            Encrypted documents
          </span>
        </div>
      </div>

      {/* ── Right: video card ──────────────────────────────────────── */}
      <div
        className="ys-hero__media"
        style={{
          position: 'relative',
          borderRadius: 22,
          overflow: 'hidden',
          aspectRatio: '4 / 5',
          minHeight: 520,
          background: `linear-gradient(135deg, ${heroT.indigo}, ${heroT.indigoDeep})`,
          border: `1px solid ${heroT.rule}`,
          boxShadow: '0 30px 80px rgba(15,23,42,0.18), 0 0 0 1px rgba(255,255,255,0.4) inset',
        }}
      >
        {videoEnabled && srcA && (
          <video
            ref={videoARef}
            className="ys-hero-video"
            src={srcA}
            muted
            loop
            playsInline
            preload="metadata"
            onLoadedData={() => markReady('a')}
            aria-hidden="true"
            style={{
              opacity: active === 0 ? 1 : 0,
              transition: 'opacity 1.2s ease',
              zIndex: 1,
            }}
          />
        )}
        {videoEnabled && srcB && srcB !== srcA && (
          <video
            ref={videoBRef}
            className="ys-hero-video"
            src={srcB}
            muted
            loop
            playsInline
            preload="metadata"
            onLoadedData={() => markReady('b')}
            aria-hidden="true"
            style={{
              opacity: active === 1 ? 1 : 0,
              transition: 'opacity 1.2s ease',
              zIndex: 1,
            }}
          />
        )}

        {/* Dim overlay so type stays readable; layered duotone-feel */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', inset: 0,
            background: videoEnabled
              ? `linear-gradient(180deg, rgba(15,23,42,0.10) 0%, rgba(15,23,42,0.45) 65%, rgba(15,23,42,0.78) 100%),
                 radial-gradient(circle at 75% 15%, rgba(196,164,90,0.22), transparent 55%)`
              : `radial-gradient(circle at 70% 20%, rgba(196,164,90,0.35), transparent 55%),
                 radial-gradient(circle at 20% 80%, rgba(178,34,52,0.30), transparent 55%)`,
            transition: 'opacity 300ms',
          }}
        />

        {/* US-UK-CA flag bar at top */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 0, left: 0, right: 0,
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
            top: 24, left: 24,
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 11px',
            borderRadius: 999,
            background: 'rgba(255,255,255,0.18)',
            border: '1px solid rgba(255,255,255,0.32)',
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontFamily: heroT.mono,
            backdropFilter: 'blur(10px)',
            zIndex: 2,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#86efac', boxShadow: '0 0 0 4px rgba(134,239,172,0.25)' }} />
          Active across US · UK · Canada
        </div>

        {/* Bottom card — pull-quote */}
        <div
          style={{
            position: 'absolute',
            left: 24, right: 24, bottom: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            color: '#fff',
            zIndex: 2,
          }}
        >
          <div
            style={{
              fontFamily: heroT.serif,
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
              display: 'flex', alignItems: 'center', gap: 12,
              paddingTop: 12,
              borderTop: '1px solid rgba(255,255,255,0.20)',
            }}
          >
            <span
              style={{
                width: 32, height: 32, borderRadius: '50%',
                background: `linear-gradient(135deg, ${heroT.gold}, ${heroT.brick})`,
                color: '#fff',
                fontFamily: heroT.serif,
                fontWeight: 600,
                fontSize: 14,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              P
            </span>
            <span style={{ fontSize: 12.5, opacity: 0.95, lineHeight: 1.3 }}>
              <strong style={{ fontWeight: 700 }}>Priya S.</strong><br />
              <span style={{ opacity: 0.75, fontSize: 11 }}>India → Australia · Education member</span>
            </span>
            <span style={{ marginLeft: 'auto', fontFamily: heroT.mono, fontSize: 10, letterSpacing: '0.14em', opacity: 0.75 }}>
              VERIFIED
            </span>
          </div>
        </div>

        {/* Floating cost card on bottom-right */}
        <div
          style={{
            position: 'absolute',
            top: 84, right: -18,
            transform: 'rotate(2deg)',
            background: '#fff',
            borderRadius: 14,
            padding: '12px 14px',
            boxShadow: '0 20px 40px rgba(15,23,42,0.25)',
            border: `1px solid ${heroT.rule}`,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            zIndex: 3,
            minWidth: 200,
          }}
        >
          <span
            style={{
              width: 36, height: 36, borderRadius: 8,
              background: heroT.indigoSoft,
              color: heroT.indigo,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Icon.Coin size={20} stroke={1.6} />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
            <span className="ys-eyebrow" style={{ fontSize: 9.5, color: heroT.inkSoft }}>Escrow released</span>
            <span style={{ fontFamily: heroT.serif, fontWeight: 600, fontSize: 17, color: heroT.ink }}>
              $1,240.00
            </span>
            <span style={{ fontSize: 11, color: heroT.moss, fontWeight: 600, marginTop: 2 }}>
              Order #4382 · Approved
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}

window.Hero = Hero;
