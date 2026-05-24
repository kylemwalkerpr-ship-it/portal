/* eslint-disable react/prop-types */
// @ts-nocheck
const T = window.YS_TOKENS;
const { useState, useEffect } = React;

// ── 4 roles — Student / Attorney / Consultant / Support ────────────────
const LANES = [
  {
    id: 'student',
    label: 'Student / Client',
    blurb: 'Place orders, talk to your consultant, manage documents and inquiries.',
    primary: 'Sign in',
    secondary: 'Create account',
    icon: 'Cap',
    accent: T.indigo,
    signInHref: 'https://portal.yousafeconsultancy.com/sign-in/student',
    signUpHref: 'https://portal.yousafeconsultancy.com/sign-up/student',
    external: false,
  },
  {
    id: 'attorney',
    label: 'Attorney',
    blurb: 'Review intake inquiries, message clients, send custom offers and manage payouts.',
    primary: 'Sign in',
    secondary: 'Apply to join',
    icon: 'Scale',
    accent: T.brick,
    signInHref: 'https://portal.yousafeconsultancy.com/sign-in/attorney',
    signUpHref: 'https://portal.yousafeconsultancy.com/sign-up/attorney',
    external: false,
  },
  {
    id: 'consultant',
    label: 'Consultant',
    blurb: 'Manage assigned students, deliverables, escrow releases and your profile.',
    primary: 'Sign in',
    secondary: 'Apply as consultant',
    icon: 'Briefcase',
    accent: T.moss,
    signInHref: 'https://portal.yousafeconsultancy.com/sign-in/consultant',
    signUpHref: 'https://portal.yousafeconsultancy.com/sign-up/consultant',
    external: false,
  },
  {
    id: 'support',
    label: 'Support team',
    blurb: 'Agent and admin tools for the YouSafe support desk — chats, tickets, escalations.',
    primary: 'Sign in to support',
    secondary: null,
    icon: 'Headset',
    accent: T.ink,
    signInHref: 'https://support.yousafeconsultancy.com/',
    signUpHref: null,
    external: true,
  },
];

// ── Top nav ─────────────────────────────────────────────────────────────
function Nav({ onSignIn }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 40px',
        borderBottom: scrolled ? `1px solid ${T.rule}` : '1px solid transparent',
        background: scrolled ? 'rgba(250,250,248,0.88)' : 'rgba(250,250,248,0.55)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        backdropFilter: 'saturate(180%) blur(14px)',
        WebkitBackdropFilter: 'saturate(180%) blur(14px)',
        transition: 'background 200ms ease, border-color 200ms ease',
        gap: '20px',
      }}
    >
      {/* Brand */}
      <a
        href="https://yousafeconsultancy.com/"
        aria-label="YouSafe Consultancy"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          textDecoration: 'none',
          color: T.ink,
          flex: '0 0 auto',
        }}
      >
        <span
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            background: T.indigo,
            color: '#fff',
            fontFamily: T.serif,
            fontWeight: 600,
            fontSize: 20,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 6px 16px rgba(60,59,110,0.22)',
            position: 'relative',
          }}
        >
          Y
          <span
            style={{
              position: 'absolute',
              top: -2,
              right: -2,
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: T.gold,
              border: '2px solid #FAFAF8',
            }}
            aria-hidden="true"
          />
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
          <span style={{ fontFamily: T.serif, fontSize: 22, fontWeight: 500, letterSpacing: '0.005em' }}>
            YouSafe
          </span>
          <span
            style={{
              fontFamily: T.mono,
              fontSize: 9.5,
              fontWeight: 600,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: T.inkSoft,
              marginTop: 4,
            }}
          >
            The Portal
          </span>
        </span>
      </a>

      {/* Center links */}
      <div
        className="ys-nav-links"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <a
          href="https://yousafeconsultancy.com/"
          className="ys-nav-link ys-nav-home"
          aria-label="YouSafe Consultancy home"
          title="YouSafe Consultancy home"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            paddingLeft: 12,
            paddingRight: 12,
          }}
        >
          <Icon.Home size={16} stroke={1.7} />
          <span>Home</span>
          <Icon.ArrowUR size={10} stroke={2} style={{ color: T.inkDim, marginLeft: 1 }} />
        </a>
        <span aria-hidden="true" style={{ width: 1, height: 18, background: T.rule, margin: '0 4px' }} />
        <a href="#categories" className="ys-nav-link">Categories</a>
        <a href="#practices" className="ys-nav-link">Practices</a>
        <a href="#how" className="ys-nav-link">How it works</a>
        <a href="#trust" className="ys-nav-link">Trust &amp; safety</a>
      </div>

      {/* Right side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto' }}>
        {/* Language pill (mirrors GlobalLanguageBar styling) */}
        <button
          type="button"
          aria-label="Choose language"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 12px',
            border: `1px solid ${T.rule}`,
            borderRadius: 999,
            background: 'rgba(255,255,255,0.96)',
            color: T.ink,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.06em',
            cursor: 'pointer',
            boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
          }}
        >
          <Icon.Globe size={13} stroke={1.7} style={{ color: T.inkMid }} />
          <span>EN</span>
          <Icon.ChevronDown size={11} stroke={2} style={{ color: T.inkSoft }} />
        </button>

        <button
          type="button"
          onClick={onSignIn}
          className="ys-btn ys-btn--ghost"
          style={{ padding: '9px 18px', fontSize: 13 }}
        >
          Sign in
        </button>
        <a
          href="https://portal.yousafeconsultancy.com/sign-up/student"
          className="ys-btn ys-btn--indigo"
          style={{ padding: '10px 20px', fontSize: 13 }}
        >
          Start an inquiry
          <Icon.Arrow size={14} stroke={2} />
        </a>
      </div>
    </nav>
  );
}

// ── Lane picker modal ───────────────────────────────────────────────────
function LanePickerModal({ open, onClose }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="ys-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Member sign-in">
      <div className="ys-modal" onClick={(e) => e.stopPropagation()}>
        {/* Flag bar — mirrors ys-auth-flag-bar in globals.css */}
        <div
          aria-hidden="true"
          style={{
            height: 4,
            background:
              'linear-gradient(90deg, #3c3b6e 0%, #3c3b6e 42%, #fff 42%, #fff 58%, #b22234 58%, #b22234 100%)',
          }}
        />
        <div style={{ padding: '32px 36px 12px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div className="ys-eyebrow" style={{ marginBottom: 10 }}>Member access</div>
            <h2 style={{ margin: 0, fontSize: 36, color: T.ink, lineHeight: 1.05, fontFamily: T.serif, fontWeight: 500, letterSpacing: '-0.014em' }}>
              Sign in to the portal.
            </h2>
            <p style={{ margin: '10px 0 0', color: T.inkMid, fontSize: 14, lineHeight: 1.6, maxWidth: 520 }}>
              Four sign-in routes — one secure portal. Pick the role that matches you.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: `1px solid ${T.rule}`,
              borderRadius: 10,
              width: 36, height: 36,
              cursor: 'pointer',
              color: T.inkMid,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Icon.Close size={16} stroke={1.8} />
          </button>
        </div>

        <div
          className="ys-lane-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 12,
            padding: '20px 36px 32px',
          }}
        >
          {LANES.map((lane) => (
            <LaneCardModal key={lane.id} lane={lane} />
          ))}
        </div>

        <div
          style={{
            borderTop: `1px solid ${T.rule}`,
            background: T.surface2,
            padding: '14px 36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 14,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: T.inkSoft }}>
            <Icon.Lock size={13} stroke={1.6} />
            <span>Clerk-secured sign-in · TLS &amp; 2FA · noindex members area</span>
          </div>
          <a href="https://support.yousafeconsultancy.com/" style={{ fontSize: 12, color: T.indigo, fontWeight: 700, textDecoration: 'none' }}>
            Need help signing in? →
          </a>
        </div>
      </div>
    </div>
  );
}

function LaneCardModal({ lane }) {
  const IconC = Icon[lane.icon] || Icon.Cap;
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: '#fff',
        border: `1px solid ${hover ? lane.accent : T.rule}`,
        borderRadius: 14,
        padding: '18px 18px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        transition: 'border-color 160ms, transform 160ms, box-shadow 160ms',
        transform: hover ? 'translateY(-2px)' : 'none',
        boxShadow: hover ? `0 10px 24px ${lane.accent}22` : '0 1px 2px rgba(15,23,42,0.04)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          style={{
            width: 34, height: 34,
            borderRadius: 8,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: `${lane.accent}14`,
            color: lane.accent,
          }}
        >
          <IconC size={18} stroke={1.6} />
        </span>
        <div style={{ fontFamily: T.serif, fontSize: 22, fontWeight: 500, color: T.ink, lineHeight: 1.1 }}>
          {lane.label}
        </div>
      </div>
      <p style={{ margin: '4px 0 8px', fontSize: 13, color: T.inkMid, lineHeight: 1.55, minHeight: 44 }}>
        {lane.blurb}
      </p>
      <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
        <a
          href={lane.signInHref}
          target={lane.external ? '_blank' : undefined}
          rel={lane.external ? 'noopener noreferrer' : undefined}
          className="ys-btn"
          style={{
            background: T.ink, color: '#fff',
            padding: '8px 16px', fontSize: 12,
            flex: '1 1 auto',
          }}
        >
          {lane.primary}
          {lane.external
            ? <Icon.ArrowUR size={12} stroke={2} />
            : <Icon.Arrow size={12} stroke={2} />}
        </a>
        {lane.secondary && lane.signUpHref && (
          <a
            href={lane.signUpHref}
            className="ys-btn ys-btn--ghost"
            style={{ padding: '7px 14px', fontSize: 12, flex: '0 0 auto' }}
          >
            {lane.secondary}
          </a>
        )}
      </div>
    </div>
  );
}

window.Nav = Nav;
window.LanePickerModal = LanePickerModal;
window.LANES = LANES;
