/* eslint-disable react/prop-types */
// @ts-nocheck
const sT = window.YS_TOKENS;
const { useState: sUseState } = React;

// ── Testimonials ────────────────────────────────────────────────────────
const TESTIMONIALS = [
  { name: 'Aisha R.',  country: 'Pakistan → UK', text: 'Got into Manchester with full scholarship. The team guided me through every step, from SOP to visa to opening a UK bank account.', avatarBg: sT.indigo, role: 'Student' },
  { name: 'Carlos M.', country: 'Colombia → Canada', text: 'Visa approved in three weeks. My consultant was thorough; I always knew the next step. Escrow released the same day my work permit landed.', avatarBg: sT.moss, role: 'Student' },
  { name: 'Sarah K.',  country: 'United States',     text: 'As an attorney on the panel I get qualified inquiries, not noise. Payouts hit my bank within 48 hours of release. It just works.', avatarBg: sT.brick, role: 'Attorney' },
  { name: 'Priya S.',  country: 'India → Australia', text: 'The SOP review changed everything. I went from four rejections to three offers — including one with a $24k scholarship.', avatarBg: sT.gold, role: 'Student' },
  { name: 'David L.',  country: 'United Kingdom',    text: 'I run a small consultancy and the portal handles intake, billing, escrow and messaging in one place. Replaced four tools for me.', avatarBg: sT.indigo, role: 'Consultant' },
];

function Testimonials() {
  const doubled = [...TESTIMONIALS, ...TESTIMONIALS];
  return (
    <Section
      id="testimonials"
      eyebrow="Outcomes our members shipped"
      title="From inquiry to approval, in their own words."
      bg={sT.surface2}
    >
      <div
        className="ys-testimonials-drift"
        style={{
          position: 'relative',
          marginInline: -40,
          paddingInline: 40,
        }}
      >
        <div className="ys-testimonials-track">
          {doubled.map((t, i) => <TestimonialCard key={`${t.name}-${i}`} t={t} />)}
        </div>
      </div>
    </Section>
  );
}

function TestimonialCard({ t }) {
  return (
    <figure
      style={{
        margin: 0,
        flex: '0 0 auto',
        width: 380,
        background: '#fff',
        border: `1px solid ${sT.rule}`,
        borderRadius: 16,
        padding: '24px 24px',
        display: 'flex', flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <Icon.Quote size={28} stroke={0} style={{ color: `${sT.indigo}1f`, fill: sT.indigo, opacity: 0.18, position: 'absolute', top: 18, right: 18 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: sT.gold, marginBottom: 14 }}>
        {[0,1,2,3,4].map(i => <Icon.Star key={i} size={14} stroke={0} style={{ fill: sT.gold }} />)}
      </div>
      <blockquote
        style={{
          margin: 0,
          fontFamily: sT.serif,
          fontSize: 17,
          fontStyle: 'italic',
          lineHeight: 1.45,
          color: sT.ink,
          letterSpacing: '-0.005em',
          display: '-webkit-box',
          WebkitLineClamp: 4,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        “{t.text}”
      </blockquote>
      <figcaption
        style={{
          marginTop: 22,
          paddingTop: 16,
          borderTop: `1px solid ${sT.ruleSoft}`,
          display: 'flex', alignItems: 'center', gap: 12,
        }}
      >
        <span
          style={{
            width: 36, height: 36, borderRadius: '50%',
            background: `linear-gradient(135deg, ${t.avatarBg}, ${t.avatarBg}aa)`,
            color: '#fff',
            fontFamily: sT.serif, fontWeight: 600, fontSize: 15,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {t.name[0]}
        </span>
        <div style={{ lineHeight: 1.2, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: sT.ink }}>{t.name}</div>
          <div style={{ fontSize: 11.5, color: sT.inkSoft, marginTop: 2 }}>{t.country}</div>
        </div>
        <span
          style={{
            fontFamily: sT.mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
            padding: '3px 7px', borderRadius: 4,
            background: `${t.avatarBg}14`, color: t.avatarBg,
          }}
        >
          {t.role.toUpperCase()}
        </span>
      </figcaption>
    </figure>
  );
}

// ── Trust strip ─────────────────────────────────────────────────────────
const TRUST_ITEMS = [
  { label: 'PCI-DSS Level 1 payments',   icon: 'Lock' },
  { label: 'Funds held in escrow',       icon: 'Shield' },
  { label: 'ABA Rule 5.4 compliant',     icon: 'Scale' },
  { label: 'Encrypted document storage', icon: 'Doc' },
  { label: 'Clerk-secured sign-in',      icon: 'Check' },
  { label: '3-D Secure 2 (SCA) ready',   icon: 'Shield' },
  { label: 'GDPR & DPA 2018 ready',      icon: 'Globe' },
  { label: 'TLS 1.3 across the board',   icon: 'Bolt' },
];

function TrustStrip() {
  // Duplicate the list so the marquee can loop seamlessly
  const doubled = [...TRUST_ITEMS, ...TRUST_ITEMS];
  return (
    <section
      id="trust"
      className="ys-section"
      style={{
        padding: '40px 0',
        borderTop: `1px solid ${sT.rule}`,
        borderBottom: `1px solid ${sT.rule}`,
        background: '#fff',
        overflow: 'hidden',
      }}
    >
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 40px 18px' }}>
        <div className="ys-eyebrow" style={{ textAlign: 'center' }}>Trust &amp; safety</div>
      </div>
      <div style={{ position: 'relative', maskImage: 'linear-gradient(90deg, transparent 0, #000 12%, #000 88%, transparent 100%)', WebkitMaskImage: 'linear-gradient(90deg, transparent 0, #000 12%, #000 88%, transparent 100%)' }}>
        <div className="ys-marquee">
          {doubled.map((it, i) => {
            const IconC = Icon[it.icon] || Icon.Shield;
            return (
              <div
                key={i}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 10,
                  fontSize: 13, fontWeight: 600,
                  color: sT.inkMid,
                  whiteSpace: 'nowrap',
                }}
              >
                <IconC size={16} stroke={1.6} style={{ color: sT.indigo }} />
                {it.label}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── FAQ ─────────────────────────────────────────────────────────────────
const FAQS = [
  {
    q: 'How is the portal different from a regular law firm or consultancy?',
    a: 'YouSafe is a marketplace, not a law firm or single agency. You see scope, price, reviews and timelines up front, choose your provider, and pay into escrow. The provider is paid only when you approve the work. For legal matters, attorneys remain independent and the platform fee is disclosed separately, per ABA Rule 5.4.',
  },
  {
    q: 'Who pays whom? How does escrow work?',
    a: 'You pay the full price once, into a regulated escrow account held with our payment partner. Funds sit there until you approve the deliverable. On approval, the provider is paid in full; the platform deducts its fee from a separately disclosed line item. If something goes wrong, you can request revisions or dispute through support before release.',
  },
  {
    q: 'Are the attorneys actually licensed?',
    a: 'Yes. Every attorney on the panel is verified against their state bar (US), the SRA/BSB (UK), or the law society (Canada) before joining. Verified credentials show on their profile and are re-checked annually.',
  },
  {
    q: 'Can I see prices before signing up?',
    a: 'You can browse the marketplace and see starting prices without an account. To message a provider, accept an offer, or pay into escrow, you create a free Student/Client account — takes about 90 seconds.',
  },
  {
    q: 'Which countries do you serve?',
    a: 'Right now: the US, the UK and Canada for legal document review; 38 destination countries for study-abroad advisory (including the US, UK, Canada, Australia, Germany, Netherlands, Ireland, and most of the EU).',
  },
  {
    q: 'Do you offer refunds?',
    a: 'If work hasn\'t been started, you can cancel with a full refund. If work has started and the deliverable doesn\'t meet the agreed scope, you can request revisions or open a dispute — funds stay in escrow until resolution.',
  },
];

function FAQ() {
  const [open, setOpen] = sUseState(0);
  const mid = Math.ceil(FAQS.length / 2);
  const cols = [FAQS.slice(0, mid), FAQS.slice(mid)];

  return (
    <section
      id="faq"
      className="ys-section"
      style={{
        padding: '88px 40px',
        borderTop: `1px solid ${sT.rule}`,
      }}
    >
      <div
        style={{
          maxWidth: 1240,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: '320px minmax(0, 1fr)',
          gap: 56,
          alignItems: 'start',
        }}
        className="ys-faq-shell"
      >
        {/* Left rail: header + support CTA */}
        <div style={{ position: 'sticky', top: 96 }} className="ys-faq-rail">
          <div className="ys-eyebrow" style={{ marginBottom: 14 }}>Frequently asked</div>
          <h2
            style={{
              margin: 0,
              fontFamily: sT.serif,
              fontSize: 'clamp(30px, 3vw, 44px)',
              lineHeight: 1.05,
              letterSpacing: '-0.014em',
              fontWeight: 500,
              color: sT.ink,
            }}
          >
            The questions we get every week.
          </h2>
          <p style={{ margin: '16px 0 24px', color: sT.inkMid, fontSize: 15, lineHeight: 1.65 }}>
            If yours isn’t here, our team usually replies within an hour.
          </p>
          <a
            href="https://support.yousafeconsultancy.com/"
            className="ys-btn ys-btn--ghost"
            style={{ padding: '10px 20px', fontSize: 13 }}
          >
            Talk to support
            <Icon.Arrow size={14} stroke={2} />
          </a>
        </div>

        {/* Right: 2-column accordion grid */}
        <div
          className="ys-faq-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '0 40px',
          }}
        >
          {cols.map((col, colIdx) => (
            <div key={colIdx} role="list">
              {col.map((f, i) => {
                const idx = colIdx * mid + i;
                return (
                  <div key={f.q} className="ys-faq__item ys-faq__item--compact" data-open={open === idx}>
                    <button
                      className="ys-faq__btn ys-faq__btn--compact"
                      type="button"
                      aria-expanded={open === idx}
                      onClick={() => setOpen(open === idx ? -1 : idx)}
                    >
                      <span>{f.q}</span>
                      <span className="ys-faq__icon">
                        <Icon.Plus size={18} stroke={1.7} />
                      </span>
                    </button>
                    <div className="ys-faq__body ys-faq__body--compact">
                      <p style={{ margin: 0, padding: '4px 28px 4px 0' }}>{f.a}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Final CTA band ──────────────────────────────────────────────────────
function FinalCTA() {
  return (
    <section
      id="start"
      className="ys-section ys-cta-band"
      style={{
        padding: '88px 40px',
        background: `radial-gradient(circle at 10% 0%, ${sT.indigo} 0%, ${sT.indigoDeep} 60%, #14133b 100%)`,
        color: '#fff',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Decorative grain + flag bar */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0,
          backgroundImage:
            'radial-gradient(circle at 80% 30%, rgba(196,164,90,0.18), transparent 40%), radial-gradient(circle at 20% 90%, rgba(178,34,52,0.18), transparent 45%)',
          pointerEvents: 'none',
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          height: 4,
          background: 'linear-gradient(90deg, #3c3b6e 0%, #3c3b6e 33%, #b22234 33%, #b22234 66%, #C4A45A 66%, #C4A45A 100%)',
        }}
      />

      <div
        style={{
          maxWidth: 1240,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: '1.4fr 1fr',
          gap: 60,
          alignItems: 'center',
          position: 'relative',
        }}
        className="ys-two-col"
      >
        <div>
          <div className="ys-eyebrow" style={{ color: 'rgba(255,255,255,0.7)', marginBottom: 16 }}>
            Ready when you are
          </div>
          <h2
            style={{
              margin: 0,
              fontFamily: sT.serif,
              fontSize: 'clamp(42px, 5.4vw, 72px)',
              lineHeight: 1.02,
              letterSpacing: '-0.018em',
              fontWeight: 500,
            }}
          >
            Start your inquiry. <em style={{ color: sT.gold, fontStyle: 'italic' }}>It's free.</em>
          </h2>
          <p style={{ margin: '22px 0 32px', color: 'rgba(255,255,255,0.78)', fontSize: 18, lineHeight: 1.55, maxWidth: 540 }}>
            Anonymous OK. An email is enough to start. No commitment until you accept an offer and approve the scope.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a href={window.YS_URLS.signUpDefault} className="ys-btn" style={{ background: '#fff', color: sT.indigoDeep, padding: '16px 28px', fontSize: 15 }}>
              Start an inquiry
              <Icon.Arrow size={16} stroke={2} />
            </a>
            <a href={window.YS_URLS.marketHome} className="ys-btn ys-btn--outline-light" style={{ padding: '15px 26px', fontSize: 15 }}>
              Browse the marketplace
            </a>
          </div>
        </div>

        {/* Side promise card */}
        <div
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.18)',
            borderRadius: 18,
            padding: '28px 28px',
            backdropFilter: 'blur(12px)',
          }}
        >
          <div className="ys-eyebrow" style={{ color: sT.gold, marginBottom: 14 }}>The YouSafe promise</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              'Pay nothing until you accept an offer',
              'Funds stay in escrow until you approve',
              'Talk to a human within one business hour',
              'Cancel anytime before work starts, full refund',
            ].map((line) => (
              <li key={line} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, fontSize: 15, lineHeight: 1.5, color: 'rgba(255,255,255,0.92)' }}>
                <span
                  style={{
                    width: 22, height: 22, borderRadius: '50%',
                    background: sT.gold, color: sT.indigoDeep,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    flex: '0 0 auto',
                  }}
                >
                  <Icon.Check size={12} stroke={3} />
                </span>
                {line}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

window.Testimonials = Testimonials;
window.TrustStrip = TrustStrip;
window.FAQ = FAQ;
window.FinalCTA = FinalCTA;
