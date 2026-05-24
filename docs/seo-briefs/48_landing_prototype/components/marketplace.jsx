/* eslint-disable react/prop-types */
// @ts-nocheck
const mT = window.YS_TOKENS;

// ── Section wrapper ─────────────────────────────────────────────────────
function Section({ id, eyebrow, title, kicker, children, bg, divider = true, narrow = false, dark = false }) {
  return (
    <section
      id={id}
      className="ys-section"
      style={{
        padding: '88px 40px',
        borderTop: divider ? `1px solid ${dark ? 'rgba(255,255,255,0.06)' : mT.rule}` : 'none',
        background: bg || 'transparent',
        color: dark ? '#fff' : mT.ink,
      }}
    >
      <div style={{ maxWidth: narrow ? 880 : 1240, margin: '0 auto' }}>
        {(eyebrow || title) && (
          <div style={{ marginBottom: 40, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
            <div style={{ maxWidth: 640 }}>
              {eyebrow && (
                <div className="ys-eyebrow" style={{ marginBottom: 14, color: dark ? 'rgba(255,255,255,0.65)' : mT.inkSoft }}>
                  {eyebrow}
                </div>
              )}
              <h2
                style={{
                  margin: 0,
                  fontFamily: mT.serif,
                  fontSize: 'clamp(32px, 3.6vw, 48px)',
                  lineHeight: 1.08,
                  letterSpacing: '-0.014em',
                  color: dark ? '#fff' : mT.ink,
                  fontWeight: 500,
                }}
              >
                {title}
              </h2>
            </div>
            {kicker && (
              <div style={{ maxWidth: 380, color: dark ? 'rgba(255,255,255,0.75)' : mT.inkMid, fontSize: 15, lineHeight: 1.6 }}>
                {kicker}
              </div>
            )}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}

// ── Stats band ──────────────────────────────────────────────────────────
const STATS = [
  { value: '12,400+', label: 'Inquiries delivered' },
  { value: '94%',     label: 'On-time delivery' },
  { value: '38',      label: 'Countries served' },
  { value: '4.93',    label: 'Avg. order rating',  star: true },
];

function StatsBand() {
  return (
    <section
      className="ys-section"
      style={{
        padding: '48px 40px',
        background: '#fff',
        borderTop: `1px solid ${mT.rule}`,
        borderBottom: `1px solid ${mT.rule}`,
      }}
    >
      <div
        className="ys-stats"
        style={{
          maxWidth: 1240,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 28,
        }}
      >
        {STATS.map((s) => (
          <div key={s.label} style={{ borderLeft: `2px solid ${mT.rule}`, paddingLeft: 20 }}>
            <div
              style={{
                fontFamily: mT.serif,
                fontSize: 'clamp(32px, 3vw, 44px)',
                fontWeight: 500,
                color: mT.ink,
                letterSpacing: '-0.014em',
                lineHeight: 1,
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              {s.value}
              {s.star && <Icon.Star size={22} stroke={1.5} style={{ color: mT.gold, fill: mT.gold }} />}
            </div>
            <div className="ys-eyebrow" style={{ marginTop: 10 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Popular categories grid ─────────────────────────────────────────────
const CATEGORIES = [
  { id: 'immigration', title: 'Immigration services',     count: '218 services', icon: 'Globe',     accent: mT.indigo, eyebrow: 'POPULAR' },
  { id: 'education',   title: 'Education & admissions',     count: '146 services', icon: 'Cap',       accent: mT.brick,  eyebrow: 'TRENDING' },
  { id: 'legal',       title: 'Legal services',             count: '184 services', icon: 'Scale',     accent: mT.indigo },
  { id: 'settlement',  title: 'Settlement & integration',   count: '92 services',  icon: 'House',     accent: mT.brick },
  { id: 'career',      title: 'Career development',         count: '108 services', icon: 'Briefcase', accent: mT.moss },
  { id: 'business',    title: 'Business services',          count: '76 services',  icon: 'Coin',      accent: mT.indigo },
  { id: 'credentials', title: 'Credentials & assessment',   count: '54 services',  icon: 'Doc',       accent: mT.gold,   eyebrow: 'NEW' },
  { id: 'mentorship',  title: 'Mentorship & coaching',      count: '38 services',  icon: 'Spark',     accent: mT.ink },
];

function PopularCategories() {
  return (
    <Section
      id="categories"
      eyebrow="Popular categories"
      title="Browse the marketplace by what you actually need."
      kicker={(
        <a href={window.YS_URLS.marketCategories} style={{ color: mT.indigo, fontWeight: 700, textDecoration: 'none', fontSize: 14 }}>
          See all categories <Icon.Arrow size={14} stroke={2} style={{ marginLeft: 4 }} />
        </a>
      )}
      bg={mT.paper}
      divider={false}
    >
      <div
        className="ys-categories"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 16,
        }}
      >
        {CATEGORIES.map((c) => {
          const IconC = Icon[c.icon] || Icon.Cap;
          return (
            <a key={c.id} href={window.YS_URLS.marketCategoryUrl(c.id)} className="ys-cat-tile">
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <span
                  style={{
                    width: 44, height: 44, borderRadius: 11,
                    background: `${c.accent}14`, color: c.accent,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <IconC size={22} stroke={1.5} />
                </span>
                {c.eyebrow && (
                  <span
                    style={{
                      fontFamily: mT.mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em',
                      padding: '4px 7px',
                      background: c.eyebrow === 'NEW' ? `${mT.moss}15` : c.eyebrow === 'TRENDING' ? `${mT.brick}12` : mT.indigoSoft,
                      color: c.eyebrow === 'NEW' ? mT.moss : c.eyebrow === 'TRENDING' ? mT.brick : mT.indigo,
                      borderRadius: 4,
                    }}
                  >
                    {c.eyebrow}
                  </span>
                )}
              </div>
              <div>
                <div style={{ fontFamily: mT.serif, fontSize: 19, fontWeight: 500, lineHeight: 1.25, color: mT.ink, marginBottom: 8 }}>
                  {c.title}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: mT.inkSoft }}>
                  <span>{c.count}</span>
                  <Icon.Arrow size={16} stroke={1.8} className="ys-cat-tile__arrow" />
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </Section>
  );
}

// ── Featured services row (Fiverr-style gig cards) ──────────────────────
const FEATURED = [
  {
    id: 1,
    seller: 'Aamir Khan, MBA',
    role: 'Senior consultant',
    initial: 'A',
    rating: 4.99,
    reviews: 412,
    title: 'Craft your UK Master\u2019s application from shortlist to offer letter',
    price: 380,
    delivery: '14-day delivery',
    tier: 'Top rated',
    accent: mT.indigo,
    category: 'Education',
    slug: 'uk-masters-application-shortlist-to-offer',
  },
  {
    id: 2,
    seller: 'Linda Park, Esq.',
    role: 'US immigration attorney',
    initial: 'L',
    rating: 4.96,
    reviews: 198,
    title: 'Review your H-1B amendment filing and flag every risk',
    price: 540,
    delivery: '5-day delivery',
    tier: 'Verified attorney',
    accent: mT.brick,
    category: 'Legal',
    slug: 'h1b-amendment-attorney-review',
  },
  {
    id: 3,
    seller: 'Sofia Mendez',
    role: 'Canada PR specialist',
    initial: 'S',
    rating: 5.00,
    reviews: 87,
    title: 'Build your Express Entry profile and CRS-optimised package',
    price: 290,
    delivery: '10-day delivery',
    tier: 'Rising talent',
    accent: mT.moss,
    category: 'Immigration',
    slug: 'canada-express-entry-crs-package',
  },
  {
    id: 4,
    seller: 'Yusuf Adebayo',
    role: 'SOP & essay coach',
    initial: 'Y',
    rating: 4.95,
    reviews: 263,
    title: 'Write a personal statement that gets you into top-30 US programmes',
    price: 220,
    delivery: '7-day delivery',
    tier: 'Top rated',
    accent: mT.gold,
    category: 'Education',
    slug: 'personal-statement-top-30-us-programmes',
  },
];

function FeaturedServices() {
  return (
    <Section
      eyebrow="Featured services"
      title="A sample of what the panel ships this week."
      kicker={(
        <a href={window.YS_URLS.marketHome} style={{ color: mT.indigo, fontWeight: 700, textDecoration: 'none', fontSize: 14 }}>
          Browse all services <Icon.Arrow size={14} stroke={2} style={{ marginLeft: 4 }} />
        </a>
      )}
      bg="transparent"
    >
      <div
        className="ys-categories"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 18,
        }}
      >
        {FEATURED.map((g) => <GigCard key={g.id} gig={g} />)}
      </div>
    </Section>
  );
}

function GigCard({ gig }) {
  return (
    <a
      href={window.YS_URLS.marketGigUrl(gig.slug)}
      className="ys-card-lift"
      style={{
        background: '#fff',
        border: `1px solid ${mT.rule}`,
        borderRadius: 14,
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      {/* Faux cover image — Kimi to swap to <img> with seller-supplied photo */}
      <div
        style={{
          position: 'relative',
          aspectRatio: '16 / 11',
          background: `linear-gradient(135deg, ${gig.accent}, ${gig.accent}cc),
            repeating-linear-gradient(135deg, rgba(255,255,255,0.06) 0 6px, transparent 6px 14px)`,
          color: '#fff',
          display: 'flex',
          alignItems: 'flex-end',
          padding: 14,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 12, left: 12,
            fontFamily: mT.mono,
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            padding: '4px 8px',
            background: 'rgba(255,255,255,0.95)',
            color: gig.accent,
            borderRadius: 4,
          }}
        >
          {gig.tier}
        </span>
        <span
          style={{
            position: 'absolute',
            top: 12, right: 12,
            fontFamily: mT.mono,
            fontSize: 9.5,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.85)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          {gig.category}
        </span>
        <span
          style={{
            fontFamily: mT.serif, fontStyle: 'italic',
            fontSize: 13, opacity: 0.75,
            letterSpacing: '0.005em',
          }}
        >
          {gig.category} · cover
        </span>
      </div>

      {/* Body */}
      <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              width: 28, height: 28, borderRadius: '50%',
              background: `linear-gradient(135deg, ${gig.accent}, ${gig.accent}aa)`,
              color: '#fff',
              fontFamily: mT.serif,
              fontWeight: 600,
              fontSize: 13,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {gig.initial}
          </span>
          <div style={{ minWidth: 0, lineHeight: 1.2 }}>
            <div style={{ fontSize: 13, color: mT.ink, fontWeight: 600 }}>{gig.seller}</div>
            <div style={{ fontSize: 11, color: mT.inkSoft, marginTop: 1 }}>{gig.role}</div>
          </div>
        </div>

        <h3
          style={{
            margin: 0,
            fontFamily: mT.sans,
            fontSize: 14.5,
            fontWeight: 500,
            lineHeight: 1.45,
            color: mT.ink,
            letterSpacing: 0,
            // Clamp to 3 lines
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {gig.title}
        </h3>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: mT.ink, fontSize: 12.5, fontWeight: 700 }}>
          <Icon.Star size={13} stroke={0} style={{ color: mT.gold, fill: mT.gold }} />
          {gig.rating.toFixed(2)}
          <span style={{ color: mT.inkSoft, fontWeight: 500 }}>({gig.reviews})</span>
          <span style={{ flex: 1 }} />
          <span style={{ color: mT.inkSoft, fontWeight: 500, fontSize: 11 }}>{gig.delivery}</span>
        </div>

        <div
          style={{
            borderTop: `1px solid ${mT.rule}`,
            marginTop: 'auto',
            paddingTop: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}
        >
          <span className="ys-eyebrow" style={{ fontSize: 10, color: mT.inkSoft }}>From</span>
          <span style={{ fontFamily: mT.serif, fontSize: 22, fontWeight: 500, color: mT.ink, lineHeight: 1, letterSpacing: '-0.01em' }}>
            ${gig.price}
          </span>
        </div>
      </div>
    </a>
  );
}

// ── Two practices ───────────────────────────────────────────────────────
function TwoPractices() {
  return (
    <Section
      id="practices"
      eyebrow="What we do"
      title="Two practices, one portal."
      kicker="A clean separation between education advisory and licensed legal work — each with its own compliance regime, payment flow, and panel of professionals."
      bg={mT.surface2}
    >
      <div
        className="ys-practices"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 22,
        }}
      >
        <PracticeCard
          eyebrow="Study abroad"
          accent={mT.indigo}
          icon="Cap"
          title="Visa &amp; university advisory."
          desc="Senior consultants guide students through admissions, SOPs, visa documentation and settlement. Funds sit in escrow until you approve every deliverable."
          bullets={[
            'Senior consultants matched to your country pathway',
            'Funds in escrow until you approve the work',
            'SOPs, shortlisting, visa packs, post-arrival',
          ]}
          href={window.YS_URLS.marketCategoryUrl('education')}
        />
        <PracticeCard
          eyebrow="Legal document prep"
          accent={mT.brick}
          icon="Scale"
          title="US, UK &amp; Canada legal review."
          desc="Licensed attorneys claim your case from a vetted panel, message you directly, then send a custom offer. Their fee is paid in full to them; the platform fee is disclosed separately, per ABA Rule 5.4."
          bullets={[
            'Vetted panel of US, UK & Canadian attorneys',
            'Direct attorney messaging from intake',
            'ABA Rule 5.4 compliant fee separation',
          ]}
          href={window.YS_URLS.marketCategoryUrl('legal')}
        />
      </div>
    </Section>
  );
}

function PracticeCard({ eyebrow, title, desc, bullets, accent, icon, href }) {
  const IconC = Icon[icon] || Icon.Cap;
  return (
    <article
      className="ys-card-lift"
      style={{
        background: '#fff',
        border: `1px solid ${mT.rule}`,
        borderRadius: 18,
        padding: '38px 36px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute', top: 0, left: 0, height: 3, width: 80, background: accent,
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <span
          style={{
            width: 44, height: 44, borderRadius: 11,
            background: `${accent}12`, color: accent,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <IconC size={22} stroke={1.5} />
        </span>
        <div className="ys-eyebrow" style={{ color: accent }}>
          {eyebrow}
        </div>
      </div>
      <h3
        style={{
          margin: 0,
          fontFamily: mT.serif,
          fontSize: 30,
          fontWeight: 500,
          color: mT.ink,
          lineHeight: 1.15,
          letterSpacing: '-0.01em',
        }}
        dangerouslySetInnerHTML={{ __html: title }}
      />
      <p style={{ margin: '14px 0 22px', color: mT.inkMid, fontSize: 15, lineHeight: 1.65 }}>
        {desc}
      </p>
      <ul
        style={{
          listStyle: 'none', margin: 0, padding: 0,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}
      >
        {bullets.map((b) => (
          <li key={b} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, color: mT.inkMid, lineHeight: 1.5 }}>
            <Icon.Check size={16} stroke={2} style={{ color: accent, marginTop: 2, flex: '0 0 auto' }} />
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <div style={{ marginTop: 26 }}>
        <a
          href={href}
          style={{
            background: 'transparent',
            color: accent,
            padding: '10px 0',
            fontSize: 14,
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            textDecoration: 'none',
          }}
        >
          {eyebrow.toLowerCase().includes('legal') ? 'Browse legal services' : 'Browse education services'}
          <Icon.Arrow size={14} stroke={2} />
        </a>
      </div>
    </article>
  );
}

window.Section = Section;
window.StatsBand = StatsBand;
window.PopularCategories = PopularCategories;
window.FeaturedServices = FeaturedServices;
window.TwoPractices = TwoPractices;
