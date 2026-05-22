import { getPopularCategories } from '@/lib/categories'
import { EstateFooter } from '@/components/EstateFooter'

const C = {
  bg: '#FBFAF7',
  surface: '#FFFFFF',
  surface2: '#F4F2EE',
  cyan: '#3C3B6E',
  text: '#1F2937',
  textMuted: '#6B7280',
  textDim: '#9CA3AF',
  border: 'rgba(0,0,0,0.08)',
  border2: 'rgba(0,0,0,0.14)',
}

const SERIF = "'Cormorant Garamond', 'Garamond', Georgia, 'Times New Roman', serif"
const SANS = "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif"

const PORTAL_URL = 'https://portal.yousafeconsultancy.com'

function ctaHref(utmContent: string): string {
  return (
    `${PORTAL_URL}/sign-up/student` +
    `?source=marketing` +
    `&return_to=/marketplace` +
    `&utm_content=${encodeURIComponent(utmContent)}`
  )
}

/* ── JSON-LD data ─────────────────────────────────────────────────────── */

const SERVICE_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'Service',
  name: 'YouSafe Marketplace',
  provider: {
    '@type': 'Organization',
    name: 'YouSafe Consultancy',
    url: 'https://yousafeconsultancy.com',
  },
  serviceType: 'Immigration and Tenancy Legal Marketplace',
  areaServed: [
    { '@type': 'Country', name: 'United States' },
    { '@type': 'Country', name: 'United Kingdom' },
    { '@type': 'Country', name: 'Canada' },
  ],
  hasOfferCatalog: {
    '@type': 'OfferCatalog',
    name: 'Service categories',
    itemListElement: getPopularCategories().map((cat) => ({
      '@type': 'Offer',
      itemOffered: {
        '@type': 'Service',
        name: cat.name,
        description: cat.description,
      },
    })),
  },
}

const FAQS = [
  {
    q: 'How is this different from finding an attorney directly?',
    a:
      'YouSafe is a marketplace, not a law firm. Attorneys and consultants set their own fees and keep full independence. ' +
      'You compare multiple providers side by side, read reviews, and message free before choosing. ' +
      'Payments sit in escrow until you approve the work. If you hire an attorney directly, you do not get comparison, escrow, or platform-backed dispute resolution.',
  },
  {
    q: 'Is YouSafe a law firm?',
    a:
      'No. YouSafe Consultancy operates a technology platform that connects students and immigrants with independent consultants and licensed attorneys. ' +
      'Legal advice comes from the attorney\'s own practice, not from YouSafe. ' +
      'The platform handles matching, messaging, file sharing, and escrow. It does not supervise, direct, or guarantee the quality of any attorney\'s work.',
  },
  {
    q: 'How do attorneys get vetted?',
    a:
      'Attorneys must submit their bar or regulator number, malpractice insurance status, and jurisdiction. ' +
      'YouSafe checks registration against the relevant state or national database. ' +
      'Attorneys also provide a professional profile URL. This is a screening step, not an endorsement. ' +
      'You should still verify the attorney\'s current standing with your local bar association.',
  },
  {
    q: 'What countries do you cover?',
    a:
      'The marketplace focuses on the United States, the United Kingdom, and Canada. ' +
      'Providers on the platform specialise in visas, work permits, permanent residency, family sponsorship, and tenancy law for those three countries. ' +
      'Some consultants also support university admissions and career coaching for additional destinations.',
  },
  {
    q: 'How do refunds work?',
    a:
      'Funds are held in escrow until you confirm the deliverable is complete. ' +
      'If the work is not delivered as agreed, you can open a dispute through the platform. ' +
      'Refund eligibility depends on the specific terms of the offer you accepted. ' +
      'YouSafe does not guarantee refunds. Read the provider\'s cancellation policy before you pay.',
  },
]

const FAQ_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQS.map(({ q, a }) => ({
    '@type': 'Question',
    name: q,
    acceptedAnswer: {
      '@type': 'Answer',
      text: a,
    },
  })),
}

/* ── Component ────────────────────────────────────────────────────────── */

export function PublicMarketplaceLanding() {
  const categories = getPopularCategories()

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: SANS }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(SERVICE_JSONLD) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSONLD) }}
      />

      <style>{`.category-card:hover{border-color:rgba(0,0,0,0.18)!important;transform:translateY(-2px)!important;box-shadow:0 12px 28px rgba(0,0,0,0.06)!important}`}</style>

      <Nav />

      {/* 1. Hero */}
      <header
        style={{
          padding: '100px 24px 80px',
          maxWidth: '1080px',
          margin: '0 auto',
        }}
      >
        <div style={{ maxWidth: '760px' }}>
          <div
            style={{
              color: C.textMuted,
              fontSize: '12px',
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              fontWeight: 600,
              marginBottom: '20px',
            }}
          >
            YouSafe Marketplace
          </div>
          <h1
            style={{
              fontFamily: SERIF,
              fontSize: 'clamp(32px, 5vw, 56px)',
              lineHeight: 1.08,
              letterSpacing: '-0.015em',
              color: C.text,
              margin: '0 0 20px',
              fontWeight: 500,
            }}
          >
            Verified immigration and tenancy help, side by side
          </h1>
          <p
            style={{
              color: C.textMuted,
              fontSize: '17px',
              lineHeight: 1.65,
              maxWidth: '600px',
              margin: '0 0 36px',
            }}
          >
            Compare US, UK and Canada immigration consultants and attorneys, plus tenancy-law support.
            See pricing, languages, and response times before you message anyone.
            Every provider on the platform has passed identity and credential checks.
            You browse free and pay only when you accept an offer.
          </p>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <a
              href={ctaHref('hero')}
              style={{
                background: C.text,
                color: '#fff',
                border: 'none',
                borderRadius: '999px',
                padding: '14px 28px',
                fontSize: '15px',
                fontWeight: 600,
                textDecoration: 'none',
                fontFamily: SANS,
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              Browse providers -&gt;
            </a>
            <a
              href="#how-it-works"
              style={{
                background: 'transparent',
                color: C.text,
                border: `1px solid ${C.border2}`,
                borderRadius: '999px',
                padding: '13px 28px',
                fontSize: '15px',
                fontWeight: 500,
                textDecoration: 'none',
                fontFamily: SANS,
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              How it works
            </a>
          </div>
        </div>
      </header>

      {/* 2. Category grid */}
      <section
        style={{
          padding: '72px 24px',
          borderTop: `1px solid ${C.border}`,
        }}
      >
        <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
          <div
            style={{
              color: C.textMuted,
              fontSize: '12px',
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              fontWeight: 600,
              marginBottom: '14px',
            }}
          >
            Browse by category
          </div>
          <h2
            style={{
              fontFamily: SERIF,
              fontSize: 'clamp(28px, 3.2vw, 40px)',
              lineHeight: 1.15,
              letterSpacing: '-0.012em',
              color: C.text,
              margin: '0 0 40px',
              fontWeight: 500,
              maxWidth: '720px',
            }}
          >
            Find help for the exact stage you are in
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '20px',
            }}
          >
            {categories.map((cat) => (
              <a
                key={cat.id}
                href={ctaHref(`category-${cat.id}`)}
                className="category-card"
                style={{
                  background: C.surface,
                  border: `1px solid ${C.border}`,
                  borderRadius: '14px',
                  padding: '28px 24px',
                  textDecoration: 'none',
                  color: 'inherit',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  transition: 'border-color 160ms, transform 160ms, box-shadow 160ms',
                }}
              >
                <div style={{ fontSize: '28px', lineHeight: 1 }}>{cat.icon}</div>
                <h3
                  style={{
                    fontFamily: SERIF,
                    fontSize: '22px',
                    fontWeight: 500,
                    color: C.text,
                    margin: 0,
                    letterSpacing: '-0.005em',
                  }}
                >
                  {cat.name}
                </h3>
                <p
                  style={{
                    color: C.textMuted,
                    fontSize: '14px',
                    lineHeight: 1.6,
                    margin: 0,
                  }}
                >
                  {cat.description}
                </p>
                <span
                  style={{
                    marginTop: 'auto',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: C.cyan,
                  }}
                >
                  See options -&gt;
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* 3. How it works */}
      <section
        id="how-it-works"
        style={{
          padding: '72px 24px',
          borderTop: `1px solid ${C.border}`,
        }}
      >
        <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
          <div
            style={{
              color: C.textMuted,
              fontSize: '12px',
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              fontWeight: 600,
              marginBottom: '14px',
            }}
          >
            How it works
          </div>
          <h2
            style={{
              fontFamily: SERIF,
              fontSize: 'clamp(28px, 3.2vw, 40px)',
              lineHeight: 1.15,
              letterSpacing: '-0.012em',
              color: C.text,
              margin: '0 0 40px',
              fontWeight: 500,
              maxWidth: '720px',
            }}
          >
            Three steps from search to delivery
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '32px',
            }}
          >
            <StepCard
              n="01"
              title="Search providers by country and specialty"
              body="Filter by US, UK or Canada, then by visa type, legal matter, or settlement need. Every profile shows pricing, languages spoken, and average response time."
            />
            <StepCard
              n="02"
              title="Message free before you commit"
              body="Send a message to one or more providers. Ask about your case, timeline, and fee. There is no charge to start a conversation. You decide who to work with."
            />
            <StepCard
              n="03"
              title="Pay through escrow and release when satisfied"
              body="When you accept an offer, your payment sits in escrow. The provider receives it only after you confirm the deliverable is complete."
            />
          </div>
        </div>
      </section>

      {/* 4. Trust strip */}
      <section
        style={{
          padding: '72px 24px',
          borderTop: `1px solid ${C.border}`,
          background: C.surface2,
        }}
      >
        <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
          <div
            style={{
              color: C.textMuted,
              fontSize: '12px',
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              fontWeight: 600,
              marginBottom: '14px',
            }}
          >
            Why members trust the marketplace
          </div>
          <h2
            style={{
              fontFamily: SERIF,
              fontSize: 'clamp(28px, 3.2vw, 40px)',
              lineHeight: 1.15,
              letterSpacing: '-0.012em',
              color: C.text,
              margin: '0 0 40px',
              fontWeight: 500,
              maxWidth: '720px',
            }}
          >
            Honest checks, not marketing claims
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '24px',
            }}
          >
            <TrustCard
              title="Licensed attorneys reviewed before joining"
              body="US, UK and Canada licensed attorneys are checked against their state or national regulator before they can list services."
            />
            <TrustCard
              title="Escrow holds your payment"
              body="Your money stays in escrow until you confirm the work is complete. The provider is paid only after your approval."
            />
            <TrustCard
              title="Registration disclosed on every profile"
              body="Consultants disclose their registration (ICCRC, OISC, etc.) on their profile. You see credentials before you message them."
            />
          </div>
        </div>
      </section>

      {/* 5. Pricing band */}
      <section
        style={{
          padding: '72px 24px',
          borderTop: `1px solid ${C.border}`,
        }}
      >
        <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
          <div
            style={{
              color: C.textMuted,
              fontSize: '12px',
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              fontWeight: 600,
              marginBottom: '14px',
            }}
          >
            Pricing
          </div>
          <h2
            style={{
              fontFamily: SERIF,
              fontSize: 'clamp(28px, 3.2vw, 40px)',
              lineHeight: 1.15,
              letterSpacing: '-0.012em',
              color: C.text,
              margin: '0 0 24px',
              fontWeight: 500,
              maxWidth: '720px',
            }}
          >
            From $99 for an Essential document review
          </h2>
          <p
            style={{
              color: C.textMuted,
              fontSize: '16px',
              lineHeight: 1.65,
              maxWidth: '680px',
              margin: '0 0 24px',
            }}
          >
            Essential tier includes a 5-day standard turnaround.
            Enhanced and Professional tiers add attorney consultation and full engagement.
            Pricing is set by each provider and displayed upfront on their profile.
            You see the full cost before you accept any offer.
          </p>
          <a
            href={ctaHref('pricing')}
            style={{
              background: C.text,
              color: '#fff',
              borderRadius: '999px',
              padding: '14px 28px',
              fontSize: '15px',
              fontWeight: 600,
              textDecoration: 'none',
              fontFamily: SANS,
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            Browse providers -&gt;
          </a>
        </div>
      </section>

      {/* 6. Self-serve Templates */}
      <section
        style={{
          padding: '72px 24px',
          borderTop: `1px solid ${C.border}`,
        }}
      >
        <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
          <div
            style={{
              color: C.textMuted,
              fontSize: '12px',
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              fontWeight: 600,
              marginBottom: '14px',
            }}
          >
            Self-serve document template packs
          </div>
          <h2
            style={{
              fontFamily: SERIF,
              fontSize: 'clamp(28px, 3.2vw, 40px)',
              lineHeight: 1.15,
              letterSpacing: '-0.012em',
              color: C.text,
              margin: '0 0 16px',
              fontWeight: 500,
              maxWidth: '720px',
            }}
          >
            Prepare your documents at your own pace
          </h2>
          <p
            style={{
              color: C.textMuted,
              fontSize: '16px',
              lineHeight: 1.6,
              maxWidth: '640px',
              margin: '0 0 32px',
            }}
          >
            Digital worksheets, checklists, and letter templates for US and Canada student visas, work permits, and visitor visas. Buy once, use immediately.
          </p>
          <a
            href="/templates"
            style={{
              background: C.text,
              color: '#fff',
              borderRadius: '999px',
              padding: '14px 28px',
              fontSize: '15px',
              fontWeight: 600,
              textDecoration: 'none',
              fontFamily: SANS,
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            Browse template packs -&gt;
          </a>
        </div>
      </section>

      {/* 7. FAQ */}
      <section
        style={{
          padding: '72px 24px',
          borderTop: `1px solid ${C.border}`,
        }}
      >
        <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
          <div
            style={{
              color: C.textMuted,
              fontSize: '12px',
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              fontWeight: 600,
              marginBottom: '14px',
            }}
          >
            Frequently asked questions
          </div>
          <h2
            style={{
              fontFamily: SERIF,
              fontSize: 'clamp(28px, 3.2vw, 40px)',
              lineHeight: 1.15,
              letterSpacing: '-0.012em',
              color: C.text,
              margin: '0 0 40px',
              fontWeight: 500,
              maxWidth: '720px',
            }}
          >
            What you should know before you start
          </h2>
          <div style={{ display: 'grid', gap: '20px', maxWidth: '800px' }}>
            {FAQS.map(({ q, a }) => (
              <details
                key={q}
                style={{
                  background: C.surface,
                  border: `1px solid ${C.border}`,
                  borderRadius: '14px',
                  padding: '20px 24px',
                }}
              >
                <summary
                  style={{
                    fontFamily: SERIF,
                    fontSize: '18px',
                    fontWeight: 500,
                    color: C.text,
                    cursor: 'pointer',
                    listStyle: 'none',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    gap: '16px',
                  }}
                >
                  <span>{q}</span>
                  <span
                    style={{
                      fontFamily: SANS,
                      fontSize: '18px',
                      color: C.textMuted,
                      fontWeight: 300,
                      lineHeight: 1,
                      flexShrink: 0,
                    }}
                  >
                    +
                  </span>
                </summary>
                <p
                  style={{
                    color: C.textMuted,
                    fontSize: '15px',
                    lineHeight: 1.65,
                    margin: '14px 0 0',
                  }}
                >
                  {a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* 7. Bottom CTA */}
      <section
        style={{
          padding: '80px 24px',
          borderTop: `1px solid ${C.border}`,
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <h2
            style={{
              fontFamily: SERIF,
              fontSize: 'clamp(28px, 3.2vw, 40px)',
              lineHeight: 1.15,
              letterSpacing: '-0.012em',
              color: C.text,
              margin: '0 0 16px',
              fontWeight: 500,
            }}
          >
            Ready to find the right provider?
          </h2>
          <p
            style={{
              color: C.textMuted,
              fontSize: '17px',
              lineHeight: 1.65,
              margin: '0 0 32px',
            }}
          >
            Browse verified consultants and attorneys now. Free account. No visa or legal-outcome promises.
          </p>
          <a
            href={ctaHref('footer')}
            style={{
              background: C.text,
              color: '#fff',
              borderRadius: '999px',
              padding: '16px 36px',
              fontSize: '16px',
              fontWeight: 600,
              textDecoration: 'none',
              fontFamily: SANS,
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            Browse providers -&gt;
          </a>
        </div>
      </section>

      <EstateFooter />
    </div>
  )
}

/* ── Sub-components ───────────────────────────────────────────────────── */

function Nav() {
  return (
    <nav
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 24px',
        borderBottom: `1px solid ${C.border}`,
        background: 'rgba(251,250,247,0.92)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        backdropFilter: 'saturate(160%) blur(10px)',
        WebkitBackdropFilter: 'saturate(160%) blur(10px)',
      }}
    >
      <a
        href="https://yousafeconsultancy.com"
        aria-label="Back to Yousafe Consultancy"
        style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}
      >
        <span
          style={{
            width: '30px',
            height: '30px',
            borderRadius: '6px',
            background: C.cyan,
            color: '#fff',
            fontFamily: SERIF,
            fontWeight: 600,
            fontSize: '15px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          Y
        </span>
        <span style={{ fontFamily: SERIF, fontSize: '18px', color: C.text, letterSpacing: '0.01em' }}>
          YouSafe
        </span>
      </a>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <a href="#how-it-works" style={navLinkStyle}>How it works</a>
        <a href={ctaHref('nav')} style={navCtaStyle}>Browse providers</a>
      </div>
    </nav>
  )
}

const navLinkStyle = {
  color: C.textMuted,
  textDecoration: 'none',
  fontSize: '13px',
  padding: '8px 14px',
  fontWeight: 500,
}

const navCtaStyle = {
  background: C.text,
  color: '#fff',
  border: 'none',
  borderRadius: '999px',
  padding: '9px 18px',
  fontSize: '13px',
  fontWeight: 600,
  textDecoration: 'none',
  fontFamily: SANS,
  marginLeft: '8px',
}

function StepCard({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div>
      <div
        style={{
          fontFamily: SERIF,
          fontSize: '20px',
          color: C.cyan,
          fontWeight: 500,
          marginBottom: '12px',
          letterSpacing: '0.04em',
        }}
      >
        {n}
      </div>
      <div style={{ height: '1px', background: 'rgba(0,0,0,0.1)', marginBottom: '14px' }} />
      <h3
        style={{
          fontFamily: SERIF,
          fontSize: '20px',
          fontWeight: 500,
          color: C.text,
          margin: '0 0 10px',
          lineHeight: 1.25,
        }}
      >
        {title}
      </h3>
      <p style={{ color: C.textMuted, fontSize: '14px', lineHeight: 1.65, margin: 0 }}>{body}</p>
    </div>
  )
}

function TrustCard({ title, body }: { title: string; body: string }) {
  return (
    <div
      style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: '14px',
        padding: '28px 24px',
      }}
    >
      <h3
        style={{
          fontFamily: SERIF,
          fontSize: '20px',
          fontWeight: 500,
          color: C.text,
          margin: '0 0 10px',
          lineHeight: 1.25,
        }}
      >
        {title}
      </h3>
      <p style={{ color: C.textMuted, fontSize: '14px', lineHeight: 1.65, margin: 0 }}>{body}</p>
    </div>
  )
}
