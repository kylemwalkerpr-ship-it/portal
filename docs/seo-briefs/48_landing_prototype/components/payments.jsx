/* eslint-disable react/prop-types */
// @ts-nocheck
const payT = window.YS_TOKENS;

/* ═════════════════════════════════════════════════════════════════════
   Payment brand logos — drawn as inline SVG so the prototype has zero
   external image dependencies. Each logo lives inside a fixed 64×40
   viewBox; the outer pill is rendered separately in <PaymentChip>.

   Production note (for Kimi): swap these for the official brand assets
   from each network's brand resource centre (Visa, Mastercard, Amex,
   Discover, Apple, Google, Samsung, PayPal). The networks publish
   acceptance marks that are free to use when displayed accurately.
   ═════════════════════════════════════════════════════════════════════ */

const Logo = {
  Visa: () => (
    <svg viewBox="0 0 64 22" width="64" height="22" aria-label="Visa">
      <text
        x="32" y="17"
        textAnchor="middle"
        fontFamily="-apple-system, 'Helvetica Neue', Arial, sans-serif"
        fontWeight="900"
        fontStyle="italic"
        fontSize="20"
        letterSpacing="-0.5"
        fill="#1A1F71"
      >VISA</text>
      <rect x="6" y="19" width="52" height="2" fill="#F7B600" rx="0.5" />
    </svg>
  ),

  Mastercard: () => (
    <svg viewBox="0 0 64 40" width="48" height="32" aria-label="Mastercard">
      <circle cx="26" cy="20" r="13" fill="#EB001B" />
      <circle cx="38" cy="20" r="13" fill="#F79E1B" />
      <path
        d="M32 11.6a13 13 0 0 1 0 16.8 13 13 0 0 1 0-16.8z"
        fill="#FF5F00"
      />
    </svg>
  ),

  Amex: () => (
    <svg viewBox="0 0 64 40" width="60" height="36" aria-label="American Express">
      <rect x="2" y="4" width="60" height="32" rx="4" fill="#016FD0" />
      <text
        x="32" y="18"
        textAnchor="middle"
        fontFamily="-apple-system, 'Helvetica Neue', Arial, sans-serif"
        fontWeight="800"
        fontSize="7.5"
        letterSpacing="0.6"
        fill="#fff"
      >AMERICAN</text>
      <text
        x="32" y="29"
        textAnchor="middle"
        fontFamily="-apple-system, 'Helvetica Neue', Arial, sans-serif"
        fontWeight="800"
        fontSize="7.5"
        letterSpacing="0.6"
        fill="#fff"
      >EXPRESS</text>
    </svg>
  ),

  Discover: () => (
    <svg viewBox="0 0 92 22" width="88" height="22" aria-label="Discover">
      <text
        x="0" y="17"
        fontFamily="-apple-system, 'Helvetica Neue', Arial, sans-serif"
        fontWeight="800"
        fontSize="14"
        letterSpacing="0.2"
        fill="#231F20"
      >DISCOV</text>
      <text
        x="56" y="17"
        fontFamily="-apple-system, 'Helvetica Neue', Arial, sans-serif"
        fontWeight="800"
        fontSize="14"
        letterSpacing="0.2"
        fill="#231F20"
      >R</text>
      <circle cx="56" cy="11" r="6.5" fill="#FF6000" />
    </svg>
  ),

  ApplePay: () => (
    <svg viewBox="0 0 64 28" width="58" height="26" aria-label="Apple Pay">
      <rect x="0" y="0" width="64" height="28" rx="5" fill="#000" />
      {/* Apple mark */}
      <path
        d="M17.6 11.3c-.5.6-1.3 1-2 1-.1-.8.3-1.6.7-2.1.5-.6 1.3-1 2-1 .1.8-.2 1.5-.7 2.1zm.7.2c-1.1-.1-2 .6-2.6.6-.5 0-1.3-.6-2.2-.6-1.1 0-2.2.7-2.7 1.7-1.2 2-.3 4.9.8 6.5.5.8 1.1 1.7 2 1.6.8 0 1.1-.5 2.1-.5s1.3.5 2.1.5c.9 0 1.5-.8 2.1-1.6.6-.9.9-1.7.9-1.8 0 0-1.8-.7-1.8-2.7 0-1.7 1.4-2.5 1.4-2.5-.7-1.1-2-1.2-2.1-1.2z"
        fill="#fff"
      />
      <text
        x="24" y="19"
        fontFamily="-apple-system, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif"
        fontWeight="600"
        fontSize="14"
        fill="#fff"
      >Pay</text>
    </svg>
  ),

  GooglePay: () => (
    <svg viewBox="0 0 80 28" width="68" height="24" aria-label="Google Pay">
      {/* Multi-colour G */}
      <path d="M14 14.6v3h4.3a3.7 3.7 0 0 1-1.6 2.4c-.7.5-1.7.8-2.7.8-2.1 0-3.9-1.4-4.5-3.3-.2-.5-.3-1-.3-1.6s.1-1.1.3-1.6c.6-1.9 2.4-3.3 4.5-3.3 1.2 0 2.2.4 3 1.2l2.3-2.2A7.5 7.5 0 0 0 14 8C10.1 8 6.8 10.3 5.4 13.5c-.5 1.2-.8 2.5-.8 3.9s.3 2.7.8 3.9C6.8 24.5 10.1 26.8 14 26.8c2.2 0 4.1-.7 5.5-2 1.6-1.5 2.5-3.6 2.5-6.2 0-.6-.1-1.2-.2-1.8H14v-2.2z" fill="#4285F4"/>
      <text
        x="28" y="22"
        fontFamily="-apple-system, 'Helvetica Neue', Arial, sans-serif"
        fontWeight="500"
        fontSize="16"
        letterSpacing="-0.4"
        fill="#5F6368"
      >Pay</text>
    </svg>
  ),

  SamsungPay: () => (
    <svg viewBox="0 0 100 22" width="92" height="22" aria-label="Samsung Pay">
      <text
        x="0" y="17"
        fontFamily="-apple-system, 'Helvetica Neue', Arial, sans-serif"
        fontWeight="800"
        fontSize="13.5"
        letterSpacing="-0.3"
        fill="#1428A0"
      >SAMSUNG</text>
      <text
        x="72" y="17"
        fontFamily="-apple-system, 'Helvetica Neue', Arial, sans-serif"
        fontWeight="500"
        fontStyle="italic"
        fontSize="14"
        fill="#1428A0"
      >Pay</text>
    </svg>
  ),

  PayPal: () => (
    <svg viewBox="0 0 80 22" width="72" height="22" aria-label="PayPal">
      <text
        x="0" y="17"
        fontFamily="-apple-system, 'Helvetica Neue', Arial, sans-serif"
        fontWeight="800"
        fontStyle="italic"
        fontSize="15"
        letterSpacing="-0.3"
        fill="#003087"
      >Pay</text>
      <text
        x="29" y="17"
        fontFamily="-apple-system, 'Helvetica Neue', Arial, sans-serif"
        fontWeight="800"
        fontStyle="italic"
        fontSize="15"
        letterSpacing="-0.3"
        fill="#009CDE"
      >Pal</text>
    </svg>
  ),
};

// ── A single chip with brand padding & subtle border ────────────────────
function PaymentChip({ children, label, available = true }) {
  return (
    <div
      title={label}
      aria-label={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '10px 14px',
        background: '#fff',
        border: `1px solid ${payT.rule}`,
        borderRadius: 10,
        minWidth: 80,
        height: 52,
        boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
        opacity: available ? 1 : 0.55,
        position: 'relative',
        transition: 'transform 160ms ease, box-shadow 160ms ease',
      }}
    >
      {children}
    </div>
  );
}

// ── Payment methods section ─────────────────────────────────────────────
function PaymentMethods() {
  return (
    <section
      id="payments"
      className="ys-section"
      style={{
        padding: '72px 40px',
        background: '#fff',
        borderTop: `1px solid ${payT.rule}`,
        borderBottom: `1px solid ${payT.rule}`,
      }}
    >
      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1.4fr',
            gap: 48,
            alignItems: 'center',
          }}
          className="ys-two-col"
        >
          {/* Copy */}
          <div>
            <div className="ys-eyebrow" style={{ marginBottom: 14 }}>Accepted payment methods</div>
            <h2
              style={{
                margin: 0,
                fontFamily: payT.serif,
                fontSize: 'clamp(28px, 3vw, 40px)',
                lineHeight: 1.1,
                letterSpacing: '-0.014em',
                fontWeight: 500,
                color: payT.ink,
              }}
            >
              Pay the way you already pay everywhere else.
            </h2>
            <p
              style={{
                margin: '16px 0 0',
                color: payT.inkMid,
                fontSize: 15,
                lineHeight: 1.65,
                maxWidth: 460,
              }}
            >
              All major card networks, three mobile wallets, and PayPal — processed through our secure payment partners, with funds parked in escrow until you approve the work.
            </p>
            <div
              style={{
                marginTop: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                fontSize: 13,
                color: payT.inkSoft,
              }}
            >
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Icon.Lock size={14} stroke={1.6} style={{ color: payT.indigo }} />
                PCI-DSS Level 1 tokenisation — your card details never touch our servers.
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Icon.Shield size={14} stroke={1.6} style={{ color: payT.moss }} />
                3-D Secure 2 (SCA) enforced for UK &amp; EU cards.
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Icon.Globe size={14} stroke={1.6} style={{ color: payT.brick }} />
                Wallets &amp; PayPal availability varies by region.
              </div>
            </div>
          </div>

          {/* Logo grid */}
          <div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 12,
              }}
              className="ys-payments-grid"
            >
              <PaymentChip label="Visa"><Logo.Visa /></PaymentChip>
              <PaymentChip label="Mastercard"><Logo.Mastercard /></PaymentChip>
              <PaymentChip label="American Express"><Logo.Amex /></PaymentChip>
              <PaymentChip label="Discover"><Logo.Discover /></PaymentChip>
              <PaymentChip label="Apple Pay"><Logo.ApplePay /></PaymentChip>
              <PaymentChip label="Google Pay"><Logo.GooglePay /></PaymentChip>
              <PaymentChip label="Samsung Pay"><Logo.SamsungPay /></PaymentChip>
              <PaymentChip label="PayPal"><Logo.PayPal /></PaymentChip>
            </div>
            <div
              style={{
                marginTop: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
                fontFamily: payT.mono,
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: payT.inkSoft,
                paddingTop: 14,
                borderTop: `1px solid ${payT.ruleSoft}`,
              }}
            >
              <span>PCI-DSS Level 1 partners</span>
              <span>USD · GBP · CAD</span>
              <span>SCA-ready</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

window.PaymentMethods = PaymentMethods;
