/* eslint-disable react/prop-types */
// @ts-nocheck
const pT = window.YS_TOKENS;

// ── How it works ────────────────────────────────────────────────────────
const STEPS = [
  { n: '01', title: 'Tell us what you need', desc: 'Describe your situation in a short intake — university shortlist, visa pathway, or legal matter. Anonymous OK; an email is enough to start.', icon: 'Doc' },
  { n: '02', title: 'Get matched',           desc: 'For consulting, we assign a senior consultant. For legal, your inquiry is visible to the attorney panel and qualified attorneys reach out.',     icon: 'Spark' },
  { n: '03', title: 'Review &amp; accept',   desc: 'Compare scope, timeline and price. Pay once, in one secure transaction. Funds held in escrow until the work is complete.',                       icon: 'Coin' },
  { n: '04', title: 'Delivery &amp; release', desc: 'Chat in-thread, share files securely, track progress. Release payment when you approve the deliverable. Done.',                                  icon: 'Check' },
];

function HowItWorks() {
  return (
    <Section
      id="how"
      eyebrow="How it works"
      title="A clean line from inquiry to delivery."
      kicker="No back-and-forth. No surprise fees. No work without funds in escrow. The same 4-step flow whether you're booking a consultant or an attorney."
    >
      <div
        className="ys-how"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 28,
        }}
      >
        {STEPS.map((s, i) => {
          const IconC = Icon[s.icon] || Icon.Spark;
          return (
            <div key={s.n} style={{ position: 'relative' }}>
              {/* Connector line (between items, not after the last) */}
              {i < STEPS.length - 1 && (
                <div
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    top: 22,
                    left: 50,
                    right: -14,
                    height: 1,
                    background: `repeating-linear-gradient(90deg, ${pT.inkDim} 0 6px, transparent 6px 12px)`,
                  }}
                />
              )}
              <div
                style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: pT.ink, color: '#fff',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: pT.serif, fontWeight: 500, fontSize: 19,
                  letterSpacing: '0.02em',
                  position: 'relative',
                  zIndex: 2,
                  boxShadow: '0 6px 14px rgba(15,23,42,0.18)',
                }}
              >
                {s.n}
              </div>
              <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', gap: 8, color: pT.indigo }}>
                <IconC size={16} stroke={1.7} />
                <h3
                  style={{
                    margin: 0,
                    fontFamily: pT.serif,
                    fontSize: 22,
                    fontWeight: 500,
                    color: pT.ink,
                    lineHeight: 1.2,
                    letterSpacing: '-0.005em',
                  }}
                  dangerouslySetInnerHTML={{ __html: s.title }}
                />
              </div>
              <p
                style={{
                  margin: '10px 0 0',
                  color: pT.inkMid,
                  fontSize: 14,
                  lineHeight: 1.6,
                  maxWidth: 240,
                }}
                dangerouslySetInnerHTML={{ __html: s.desc }}
              />
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// ── Lane picker band (subtle in-page version) ───────────────────────────
function LaneBand({ onSignIn }) {
  return (
    <Section
      eyebrow="Member access"
      title="Four roles. One secure portal."
      kicker={(
        <span>
          Each role gets its own sign-in route and dashboard. Same security, same escrow, tailored workflow.
        </span>
      )}
      bg={pT.paper}
    >
      <div
        className="ys-categories"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 14,
        }}
      >
        {window.LANES.map((lane) => {
          const IconC = Icon[lane.icon] || Icon.Cap;
          return (
            <div
              key={lane.id}
              className="ys-card-lift"
              style={{
                background: '#fff',
                border: `1px solid ${pT.rule}`,
                borderRadius: 14,
                padding: '20px 20px 18px',
                color: 'inherit',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span
                  style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: `${lane.accent}14`, color: lane.accent,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <IconC size={18} stroke={1.6} />
                </span>
                <Icon.Arrow size={16} stroke={1.7} style={{ color: pT.inkSoft }} />
              </div>
              <div style={{ fontFamily: pT.serif, fontSize: 20, fontWeight: 500, color: pT.ink, marginTop: 8 }}>
                {lane.label}
              </div>
              <p style={{ margin: 0, fontSize: 13, color: pT.inkMid, lineHeight: 1.55 }}>
                {lane.blurb}
              </p>
              <div
                style={{
                  marginTop: 'auto',
                  paddingTop: 14,
                  borderTop: `1px solid ${pT.ruleSoft}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  fontSize: 12, fontWeight: 600,
                }}
              >
                <a
                  href={lane.signInHref}
                  target={lane.external ? '_blank' : undefined}
                  rel={lane.external ? 'noopener noreferrer' : undefined}
                  style={{ color: lane.accent, textDecoration: 'none' }}
                >
                  {lane.primary} {lane.external ? '↗' : '→'}
                </a>
                {lane.secondary && lane.signUpHref && (
                  <a href={lane.signUpHref} style={{ color: pT.inkSoft, fontWeight: 500, textDecoration: 'underline' }}>
                    {lane.secondary}
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button type="button" onClick={onSignIn} className="ys-btn ys-btn--primary" style={{ padding: '12px 24px', fontSize: 14 }}>
          Sign in to your account
          <Icon.Arrow size={14} stroke={2} />
        </button>
        <span style={{ fontSize: 13, color: pT.inkSoft }}>
          Not a member yet? <a href="https://portal.yousafeconsultancy.com/sign-up/student" style={{ color: pT.indigo, fontWeight: 600, textDecoration: 'none' }}>Create a free account →</a>
        </span>
      </div>
    </Section>
  );
}

// ── Featured providers strip (horizontal scroll) ────────────────────────
const PROVIDERS = [
  { id: 'aamir-khan',    name: 'Aamir Khan',     title: 'Senior consultant',         country: 'UK & Pakistan',   orders: 412, rating: 4.99, initial: 'A', accent: pT.indigo, badge: 'Top rated',     verified: 'Bar verified' },
  { id: 'linda-park',    name: 'Linda Park',     title: 'Immigration attorney',      country: 'United States',   orders: 198, rating: 4.96, initial: 'L', accent: pT.brick,  badge: 'Pro',           verified: 'AILA member' },
  { id: 'sofia-mendez',  name: 'Sofia Mendez',   title: 'Canada PR specialist',      country: 'Canada',          orders: 87,  rating: 5.00, initial: 'S', accent: pT.moss,   badge: 'Rising talent', verified: 'CICC reg.'  },
  { id: 'yusuf-adebayo', name: 'Yusuf Adebayo',  title: 'SOP & essay coach',         country: 'Nigeria \u2192 US', orders: 263, rating: 4.95, initial: 'Y', accent: pT.gold,   badge: 'Top rated',     verified: 'M.A. Columbia' },
  { id: 'priya-sharma',  name: 'Priya Sharma',   title: 'Visa documentation lead',   country: 'India',           orders: 156, rating: 4.92, initial: 'P', accent: pT.indigo, badge: 'Pro',           verified: '12 yrs experience' },
  { id: 'rajiv-mehta',   name: 'Rajiv Mehta',    title: 'UK immigration barrister',  country: 'United Kingdom',  orders: 74,  rating: 4.97, initial: 'R', accent: pT.brick,  badge: 'Pro',           verified: 'BSB regulated' },
];

function FeaturedProviders() {
  return (
    <Section
      eyebrow="Featured providers"
      title="The panel behind the portal."
      kicker={(
        <a href={window.YS_URLS.marketProviders} style={{ color: pT.indigo, fontWeight: 700, textDecoration: 'none', fontSize: 14 }}>
          Browse all providers <Icon.Arrow size={14} stroke={2} style={{ marginLeft: 4 }} />
        </a>
      )}
      bg="transparent"
    >
      <div className="ys-scroll-x">
        {PROVIDERS.map((p) => <ProviderCard key={p.name} p={p} />)}
      </div>
    </Section>
  );
}

function ProviderCard({ p }) {
  return (
    <article
      className="ys-card-lift"
      style={{
        width: 260,
        background: '#fff',
        border: `1px solid ${pT.rule}`,
        borderRadius: 14,
        padding: '18px 18px 16px',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span
          style={{
            width: 52, height: 52, borderRadius: '50%',
            background: `linear-gradient(135deg, ${p.accent}, ${p.accent}aa)`,
            color: '#fff',
            fontFamily: pT.serif, fontWeight: 600, fontSize: 22,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative',
            boxShadow: `0 4px 14px ${p.accent}33`,
          }}
        >
          {p.initial}
          <span
            aria-label="Verified"
            style={{
              position: 'absolute',
              right: -2, bottom: -2,
              width: 18, height: 18, borderRadius: '50%',
              background: pT.indigo, color: '#fff',
              border: '2px solid #fff',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Icon.Check size={10} stroke={3} />
          </span>
        </span>
        <div style={{ minWidth: 0, lineHeight: 1.2 }}>
          <div style={{ fontFamily: pT.serif, fontSize: 18, fontWeight: 500, color: pT.ink }}>{p.name}</div>
          <div style={{ fontSize: 12, color: pT.inkSoft, marginTop: 2 }}>{p.title}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <span
          style={{
            fontFamily: pT.mono, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em',
            padding: '3px 7px',
            background: `${p.accent}12`, color: p.accent,
            borderRadius: 4,
          }}
        >
          {p.badge}
        </span>
        <span
          style={{
            fontFamily: pT.mono, fontSize: 9.5, fontWeight: 600, letterSpacing: '0.06em',
            padding: '3px 7px',
            background: pT.ruleSoft, color: pT.inkMid,
            borderRadius: 4,
          }}
        >
          {p.verified}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
        <Icon.Star size={14} stroke={0} style={{ color: pT.gold, fill: pT.gold }} />
        <strong style={{ color: pT.ink, fontWeight: 700 }}>{p.rating.toFixed(2)}</strong>
        <span style={{ color: pT.inkSoft }}>· {p.orders} orders</span>
        <span style={{ flex: 1 }} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: pT.inkSoft, fontSize: 11 }}>
          <Icon.Globe size={11} stroke={1.6} /> {p.country}
        </span>
      </div>

      <a
        href={window.YS_URLS.marketProviderUrl(p.id)}
        className="ys-btn ys-btn--ghost"
        style={{ padding: '8px 14px', fontSize: 12.5, marginTop: 4 }}
      >
        View profile
      </a>
    </article>
  );
}

window.HowItWorks = HowItWorks;
window.LaneBand = LaneBand;
window.FeaturedProviders = FeaturedProviders;
