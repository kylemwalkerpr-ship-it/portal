'use client'

import { notFound } from 'next/navigation'
import Checkout from '@/components/checkout/Checkout'
import { OfferPaymentModal } from '@/components/messaging/OfferPaymentModal'
import CheckoutReturnStatus from '@/app/checkout/return/status'
import type { AvailablePaymentMethod } from '@/components/checkout/useCheckout'

const previewMethods: AvailablePaymentMethod[] = [
  { methodKey: 'preview:card', provider: 'preview', id: 'card', label: 'Card payment', supportedBrands: ['visa', 'mastercard', 'amex'], logoAsset: '', mode: 'inline-token', displayCurrency: 'USD', chargeCurrency: 'USD', currencies: ['USD'], priority: 1, isDefault: true, supportsVault: false },
  { methodKey: 'preview:wallet', provider: 'preview', id: 'wallet', label: 'Wallet balance', logoAsset: '', mode: 'manual-invoice', displayCurrency: 'USD', chargeCurrency: 'USD', currencies: ['USD'], priority: 2, isDefault: false, supportsVault: false },
]

const offerFixture = { offer: { title: 'Contract review · fixed fee', currency: 'USD' }, breakdown: { total: 8500 }, balanceCents: 2000, savedCards: [] }

export default function CheckoutPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound()

  return (
    <main className="previewPage">
      <header className="previewHeader">
        <img src="/logo.svg" width="152" height="40" alt="YouSafe" />
        <h1>Payment, with clarity.</h1>
        <p>Local design fixtures for reviewing every buyer payment state. No payment requests are sent.</p>
      </header>
      <div className="previewGrid">
        <section aria-label="Checkout preview" className="previewSection">
          <h2>Card and wallet methods</h2>
          <Checkout title="Consultation package" amountUsdCents={12500} description="A 60-minute consultation with a legal specialist." purpose="order" walletBalanceCents={4500} previewMethods={previewMethods} previewState="idle" variant="cart" onSubmit={async () => ({})} />
        </section>
        <section aria-label="Offer payment preview" className="previewSection">
          <h2>Offer payment</h2>
          <OfferPaymentModal offerId="preview-offer" open onClose={() => {}} previewData={offerFixture} />
        </section>
        <section aria-label="Gig checkout preview" className="previewSection">
          <h2>Gig checkout</h2>
          <Checkout title="Brand identity package" amountUsdCents={17500} description="Standard package · 5 day delivery" source={{ sourceType: 'gig', sourceId: 'preview-gig', tierId: 'standard' }} walletBalanceCents={6000} previewMethods={previewMethods} previewState="idle" variant="gig" onSubmit={async () => ({})} />
        </section>
        <section aria-label="Wallet top-up preview" className="previewSection">
          <h2>Wallet top-up</h2>
          <div className="topupCard">
            <div className="topupHeader"><div><span className="topupEyebrow">WALLET</span><h3>Add funds</h3><p>Choose an amount to keep your next purchase moving.</p></div><span className="walletGlyph" aria-hidden="true">◈</span></div>
            <div className="topupSummary"><span>New wallet balance</span><strong>$85.00</strong><small>Includes your selected $25.00 top-up.</small></div>
            <label htmlFor="preview-topup-amount">Top-up amount</label>
            <p className="topupHelp" id="preview-topup-help">Enter at least $1.00. Choose a common amount or type your own.</p>
            <input id="preview-topup-amount" aria-describedby="preview-topup-help" value="$25.00" readOnly />
            <div className="presets" aria-label="Suggested amounts">{['$10', '$25', '$50', '$100'].map((n) => <button type="button" key={n} aria-pressed={n === '$25'}>{n}</button>)}</div>
            <div className="brandRow" aria-label="Accepted cards"><span className="visaWord">VISA</span><span className="mcMark"><i /><i /></span><span className="amexWord">AMEX</span></div>
            <div className="topupTrust"><span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 10V7a5 5 0 0 1 10 0v3"/><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M12 14v3"/></svg></span><strong>Secured by YouSafe</strong><small>Payment details stay protected.</small></div>
            <div className="topupActions"><button type="button" className="quietButton">Cancel</button><button type="button" className="strongButton">Continue with $25.00</button></div>
          </div>
        </section>
        <section aria-label="Finishing securely preview" className="previewSection">
          <h2>Finishing securely</h2>
          <Checkout title="Consultation package" amountUsdCents={12500} walletBalanceCents={0} previewMethods={previewMethods} previewState="redirecting" variant="cart" onSubmit={async () => ({})} />
        </section>
        <section aria-label="Return page preview" className="previewSection returnPair">
          <h2>Payment return</h2>
          <CheckoutReturnStatus trackingId="YS-ORDER-2048" merchantReference="ORDER-2048" cancelled={false} previewStatus={{ status: 'confirmed', confirmed: true }} />
          <CheckoutReturnStatus trackingId="YS-ORDER-2049" merchantReference="ORDER-2049" cancelled={false} previewStatus={{ status: 'pending' }} />
        </section>
      </div>
      <style jsx>{`
        .previewPage { min-height:100vh; padding:44px 20px 72px; color:var(--ys-ink,#0f172a); background:radial-gradient(ellipse at 0 0,rgba(196,160,83,.12),transparent 36%),var(--ys-paper,#f7f8fa); font-family:var(--font-inter),Inter,sans-serif; }
        .previewHeader { max-width:1240px; margin:0 auto 34px; padding:0 4px; }
        .previewHeader img { display:block; margin-bottom:20px; }
        .previewHeader h1 { margin:0; font:600 clamp(34px,5vw,52px)/1 var(--font-cormorant),'Cormorant Garamond',Georgia,serif; letter-spacing:-.025em; }
        .previewHeader p { max-width:60ch; color:var(--ys-inkMid,#334155); font-size:16px; line-height:1.55; }
        .previewGrid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:28px; max-width:1240px; margin:auto; }
        .previewSection { min-width:0; padding:20px; border:1px solid rgba(15,23,42,.08); border-radius:22px; background:rgba(255,255,255,.55); }
        .previewSection h2 { margin:0 0 16px; font:600 25px/1.1 var(--font-cormorant),'Cormorant Garamond',Georgia,serif; }
        .topupCard { max-width:640px; margin:auto; padding:28px; border:1px solid rgba(196,160,83,.35); border-radius:22px; background:radial-gradient(ellipse at 100% 0,rgba(196,160,83,.14),transparent 45%),linear-gradient(145deg,#fff,#f7f5ef); box-shadow:0 20px 50px rgba(15,23,42,.09); }
        .topupHeader { display:flex; justify-content:space-between; gap:16px; margin-bottom:20px; }
        .topupEyebrow { color:var(--ys-inkSoft,#526072); font-size:12px; font-weight:700; letter-spacing:.12em; }
        .topupHeader h3 { margin:5px 0; font:600 34px/1 var(--font-cormorant),'Cormorant Garamond',Georgia,serif; }
        .topupHeader p,.topupHelp { color:var(--ys-inkMid,#334155); font-size:14px; line-height:1.5; }
        .walletGlyph { display:grid; width:48px; height:48px; place-items:center; border-radius:16px 16px 16px 5px; background:var(--ys-indigo,#272852); color:white; font-size:24px; }
        .topupSummary { display:grid; grid-template-columns:1fr auto; gap:4px; margin:20px 0; padding:17px; border-radius:14px; background:rgba(39,40,82,.06); }
        .topupSummary span { align-self:end; font-size:14px; font-weight:650; }.topupSummary strong { grid-column:2; grid-row:1/3; align-self:center; font-size:27px; }.topupSummary small { color:var(--ys-inkSoft,#526072); font-size:13px; }
        .topupCard label { display:block; font-size:14px; font-weight:650; }.topupHelp { margin:4px 0 8px; font-size:13px; }.topupCard input { width:100%; box-sizing:border-box; min-height:52px; padding:12px 15px; border:1px solid #9aa5b4; border-radius:11px; background:white; color:var(--ys-ink,#0f172a); font:600 19px var(--font-inter),Inter,sans-serif; }
        .topupCard input:focus-visible,.presets button:focus-visible,.quietButton:focus-visible,.strongButton:focus-visible { outline:3px solid var(--ys-gold,#7a5000); outline-offset:3px; }
        .presets { display:flex; flex-wrap:wrap; gap:8px; margin:12px 0 16px; }.presets button { min-height:42px; padding:0 16px; border:1px solid var(--ys-rule,#d8dde3); border-radius:999px; background:white; color:var(--ys-ink,#0f172a); font:600 14px var(--font-inter),Inter,sans-serif; }.presets button[aria-pressed=true] { border:2px solid var(--ys-indigo,#272852); background:rgba(39,40,82,.07); }
        .brandRow { display:flex; align-items:center; gap:8px; margin:12px 0; }.visaWord,.mcMark,.amexWord { display:flex; width:44px; height:28px; align-items:center; justify-content:center; border-radius:4px; background:#fff; }.visaWord { color:#1434cb; font-weight:900; font-style:italic; }.mcMark { position:relative; }.mcMark i { width:18px;height:18px;border-radius:50%;background:#eb001b; }.mcMark i+i { margin-left:-8px;background:#f79e1b;mix-blend-mode:multiply; }.amexWord { background:#2e77bc;color:white;font-size:10px;font-weight:800; }
        .topupTrust { display:grid; grid-template-columns:36px 1fr; align-items:center; column-gap:10px; margin-top:16px; padding:12px; border:1px solid rgba(15,23,42,.08); border-radius:12px; background:rgba(255,255,255,.72); }.topupTrust span { grid-row:span 2;display:grid;width:36px;height:36px;place-items:center;border-radius:12px 12px 12px 4px;background:var(--ys-indigo,#272852);color:white; }.topupTrust svg { width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round; }.topupTrust strong { font-size:14px; }.topupTrust small { color:var(--ys-inkMid,#334155);font-size:13px; }
        .topupActions { display:flex; align-items:center; gap:12px; margin-top:18px; }.quietButton { min-height:48px; padding:0 18px; border:0; background:transparent; color:var(--ys-inkMid,#334155); font:600 15px var(--font-inter),Inter,sans-serif; text-decoration:underline; text-underline-offset:3px; }.strongButton { min-height:52px; margin-left:auto; padding:0 22px; border:0; border-radius:12px; background:var(--ys-indigo,#272852); color:#fff; font:650 15px var(--font-inter),Inter,sans-serif; }
        .returnPair { display:grid; grid-template-columns:1fr 1fr; gap:16px; }.returnPair h2 { grid-column:1/-1; }
        .returnPair :global(.returnPage) { min-height:0; padding:0; background:transparent; }
        .returnPair :global(.returnCard) { padding:20px; }
        @media(max-width:820px) { .previewGrid { grid-template-columns:1fr; }.returnPair { grid-template-columns:1fr; } }
        @media(max-width:390px) { .previewPage { padding:28px 12px 48px; }.previewSection { padding:12px; }.topupCard { padding:20px 16px; }.topupActions { align-items:stretch; flex-direction:column-reverse; }.strongButton { margin-left:0; width:100%; }.quietButton { width:100%; } }
      `}</style>
    </main>
  )
}
