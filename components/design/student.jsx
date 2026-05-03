'use client'
// @ts-nocheck
import React from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { C, Btn, Badge, Card, Input, Select, Avatar, StatusBadge, Divider, StatCard, ProgressBar, NavItem } from './shared'

const STRIPE_PUB_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

const STUDENT_ORDERS = [];

const formatUSD = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value || 0));
const formatMoney = (value, currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency: String(currency || 'USD').toUpperCase(), minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value || 0));
const serviceIcon = category => ({
  'Study Permits': '📋',
  'University Admissions': '🎓',
  'Post-Graduate': '🏫',
  'PR & Immigration': '🍁',
  Settlement: '🏠',
  Mentorship: '🤝',
  Credentials: '📜',
  Career: '💼',
})[category] || '🛒';
const deliveryLabel = days => {
  const n = Number(days || 0);
  if (!n) return 'Timeline TBD';
  if (n >= 365) return '12 months';
  if (n >= 90) return '3 months';
  if (n >= 28) return '2–4 weeks';
  return `${n} day${n === 1 ? '' : 's'}`;
};

// ─── Escrow Approval Card ─────────────────────────────────────────────────────
function EscrowApprovalCard({ order }) {
  const [state, setState] = React.useState('review'); // review | approved | rejected
  const [rejectStep, setRejectStep] = React.useState(null); // null | choose | refund | reassign
  const [refundRequested, setRefundRequested] = React.useState(false);
  const [reassigned, setReassigned] = React.useState(false);

  if (state === 'approved') return (
    <div style={{ background: `${C.green}12`, border: `1px solid ${C.green}33`, borderRadius: '14px', padding: '20px' }}>
      <div style={{ fontWeight: 700, fontSize: '15px', color: C.green }}>✅ Payment released from escrow!</div>
      <div style={{ fontSize: '13px', color: C.textMuted, marginTop: '6px' }}>80% sent to your consultant · 20% to platform. Your order is complete.</div>
    </div>
  );

  if (refundRequested) return (
    <div style={{ background: 'rgba(245,158,11,0.1)', border: `1px solid rgba(245,158,11,0.3)`, borderRadius: '14px', padding: '20px' }}>
      <div style={{ fontWeight: 700, fontSize: '15px', color: C.orange }}>🔄 Refund in progress</div>
      <div style={{ fontSize: '13px', color: C.textMuted, marginTop: '6px' }}>Your refund (minus 3% fee) is being processed. A 3% charge has been deducted from your consultant's balance.</div>
    </div>
  );

  if (reassigned) return (
    <div style={{ background: `${C.navy}20`, border: `1px solid ${C.navy}44`, borderRadius: '14px', padding: '20px' }}>
      <div style={{ fontWeight: 700, fontSize: '15px', color: '#7aadff' }}>🔁 Finding a new consultant</div>
      <div style={{ fontSize: '13px', color: C.textMuted, marginTop: '6px' }}>We're matching you with another available consultant. You'll be notified within 24 hours.</div>
    </div>
  );

  return (
    <div>
      {/* Main approval banner */}
      {!rejectStep && (
        <div style={{ background: `${C.green}12`, border: `1px solid ${C.green}33`, borderRadius: '14px', padding: '20px' }}>
          <div style={{ fontWeight: 700, fontSize: '15px', color: C.green, marginBottom: '8px' }}>🎉 Ready for your approval</div>
          <p style={{ fontSize: '13px', color: C.textMuted, lineHeight: 1.6, marginBottom: '16px' }}>
            Your consultant has completed the deliverable. Review the files, then approve to release payment — <strong style={{ color: C.cyan }}>80%</strong> goes to your consultant, <strong style={{ color: C.green }}>20%</strong> to the platform.
          </p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <Btn variant="success" size="sm" onClick={() => setState('approved')}>✓ Approve &amp; release payment</Btn>
            <Btn variant="danger" size="sm" onClick={() => setRejectStep('choose')}>✕ Reject delivery</Btn>
          </div>
        </div>
      )}

      {/* Rejection choice */}
      {rejectStep === 'choose' && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: `1px solid rgba(239,68,68,0.3)`, borderRadius: '14px', padding: '20px' }}>
          <div style={{ fontWeight: 700, fontSize: '15px', color: C.red, marginBottom: '8px' }}>Reject delivery — what would you like to do?</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
            <div onClick={() => setRejectStep('reassign')} style={{ padding: '14px', background: C.surface2, borderRadius: '12px', border: `1px solid ${C.border2}`, cursor: 'pointer', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '20px' }}>🔁</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: '14px' }}>Find a new consultant</div>
                <div style={{ fontSize: '12px', color: C.textMuted, marginTop: '3px' }}>Your payment stays in escrow. We'll match you with another consultant at no extra cost.</div>
              </div>
            </div>
            <div onClick={() => setRejectStep('refund')} style={{ padding: '14px', background: C.surface2, borderRadius: '12px', border: `1px solid ${C.border2}`, cursor: 'pointer', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '20px' }}>💳</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: '14px' }}>Request a refund</div>
                <div style={{ fontSize: '12px', color: C.textMuted, marginTop: '3px' }}>Get your full payment back minus a <strong style={{ color: C.orange }}>3% processing fee</strong>, charged from the consultant's balance.</div>
              </div>
            </div>
          </div>
          <Btn variant="ghost" size="sm" onClick={() => setRejectStep(null)}>← Go back</Btn>
        </div>
      )}

      {/* Reassign confirmation */}
      {rejectStep === 'reassign' && (
        <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: '14px', padding: '20px' }}>
          <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '8px' }}>Confirm — find a new consultant?</div>
          <p style={{ fontSize: '13px', color: C.textMuted, lineHeight: 1.6, marginBottom: '16px' }}>
            Your payment of <strong style={{ color: C.cyan }}>{order.price}</strong> stays in escrow. The current consultant will be unassigned. You'll be matched with a new one within 24 hours.
          </p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <Btn variant="navy" size="sm" onClick={() => setReassigned(true)}>Confirm — reassign</Btn>
            <Btn variant="ghost" size="sm" onClick={() => setRejectStep('choose')}>← Back</Btn>
          </div>
        </div>
      )}

      {/* Refund confirmation */}
      {rejectStep === 'refund' && (
        <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: '14px', padding: '20px' }}>
          <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '14px' }}>Confirm refund breakdown</div>
          <div style={{ background: C.surface3, borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
            {[
              ['Original payment', order.price],
              ['3% processing fee (from consultant)', `-${formatUSD((Number(String(order.price).replace(/[^0-9.]/g, '')) || 0) * 0.03)}`],
              ['You receive', formatUSD((Number(String(order.price).replace(/[^0-9.]/g, '')) || 0) * 0.97)],
            ].map(([k, v], i) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: i < 2 ? `1px solid ${C.border}` : 'none', fontSize: '14px' }}>
                <span style={{ color: C.textMuted }}>{k}</span>
                <span style={{ fontWeight: 700, color: i === 2 ? C.green : i === 1 ? C.red : C.text }}>{v}</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: '12px', color: C.textDim, marginBottom: '16px' }}>The 3% fee is deducted from the consultant's available balance. If insufficient balance exists, it will be deducted from their next payout.</p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <Btn variant="danger" size="sm" onClick={() => setRefundRequested(true)}>Confirm refund</Btn>
            <Btn variant="ghost" size="sm" onClick={() => setRejectStep('choose')}>← Back</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Stripe Payment Method Component ─────────────────────────────────────────
function StripePaymentSection() {
  const [cards, setCards] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [addingCard, setAddingCard] = React.useState(false);
  const [cardMounted, setCardMounted] = React.useState(false);
  const [stripe, setStripe] = React.useState(null);
  const [stripeStatus, setStripeStatus] = React.useState('idle'); // idle | loading | ready | error
  const [stripeErr, setStripeErr] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState(null);

  const cardElemRef = React.useRef(null);
  const mountNodeRef = React.useRef(null);

  const fetchCards = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/wallet/payment-methods');
      const d = await res.json();
      setCards(d.cards ?? []);
    } finally { setLoading(false); }
  };

  React.useEffect(() => { fetchCards(); }, []);

  // Lazy-load Stripe ON DEMAND when the user clicks "Add new card"
  const handleAddCard = async () => {
    setErrorMsg(null);
    setStripeErr(null);

    // If already loaded, just open the form
    if (stripe) { setAddingCard(true); return; }

    if (!STRIPE_PUB_KEY) {
      setStripeErr('Stripe is not configured. Add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY to the environment.');
      return;
    }

    setStripeStatus('loading');
    setAddingCard(true);    // open the form immediately so user sees "Loading…" inside it

    try {
      const s = await loadStripe(STRIPE_PUB_KEY);
      if (!s) throw new Error('loadStripe() returned null — Stripe.js may have been blocked by a browser extension or ad blocker.');
      setStripe(s);
      setStripeStatus('ready');
    } catch (err) {
      console.error('[Stripe] load failed:', err);
      setStripeErr(err.message || 'Failed to load Stripe');
      setStripeStatus('error');
    }
  };

  // Mount card element whenever stripe instance AND addingCard are both ready
  React.useEffect(() => {
    if (!stripe || !addingCard) return;
    const node = mountNodeRef.current;
    if (!node) return;

    if (cardElemRef.current) { try { cardElemRef.current.destroy(); } catch (_) {} }

    try {
      const elements = stripe.elements();
      const card = elements.create('card', {
        hidePostalCode: true,
        style: {
          base: { color: '#111827', fontFamily: 'inherit', fontSize: '15px', '::placeholder': { color: '#9CA3AF' } },
          invalid: { color: '#EF4444' },
        },
      });
      card.mount(node);
      cardElemRef.current = card;
      setCardMounted(true);
    } catch (err) {
      console.error('[Stripe] mount failed:', err);
      setStripeErr(err.message || 'Failed to mount card element');
    }

    return () => {
      try { cardElemRef.current?.destroy(); } catch (_) {}
      cardElemRef.current = null;
      setCardMounted(false);
    };
  }, [stripe, addingCard]);

  const handleSave = async () => {
    if (!stripe || !cardElemRef.current) {
      setErrorMsg('Card fields are not ready — please wait a moment.');
      return;
    }
    setSaving(true); setErrorMsg(null);
    try {
      const res = await fetch('/api/wallet/setup-intent', { method: 'POST' });
      let body;
      try { body = await res.json(); }
      catch { body = { error: `Server returned status ${res.status} with a non-JSON response (likely a Worker crash).` }; }
      const { clientSecret, error: apiErr } = body;
      if (!res.ok || apiErr || !clientSecret) {
        throw new Error(`${apiErr || 'SetupIntent failed'} (HTTP ${res.status}). Run /api/wallet/diagnose for details.`);
      }
      const { error: confirmErr } = await stripe.confirmCardSetup(clientSecret, {
        payment_method: { card: cardElemRef.current },
      });
      if (confirmErr) throw new Error(confirmErr.message);
      setAddingCard(false); setSaved(true);
      await fetchCards();
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setErrorMsg(e.message);
    } finally { setSaving(false); }
  };

  const handleRemove = async (pmId) => {
    try {
      await fetch(`/api/wallet/payment-methods/${pmId}`, { method: 'DELETE' });
      await fetchCards();
    } catch (e) { console.error('Remove failed', e); }
  };

  const brandColor = b => ({ visa: '#1a1f71', mastercard: '#eb001b', amex: '#007bc1' }[b] ?? C.textMuted);

  return (
    <Card>
      <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '6px' }}>Payment Methods</div>
      <div style={{ fontSize: '12px', color: C.textMuted, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ background: '#635bff', color: '#fff', fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px' }}>stripe</span>
        Secured by Stripe — we never store card details directly.
      </div>
      {saved && <div style={{ background: `${C.green}15`, border: `1px solid ${C.green}33`, borderRadius: '10px', padding: '10px 14px', fontSize: '13px', color: C.green, marginBottom: '14px' }}>✓ Card saved securely via Stripe</div>}
      {errorMsg && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '10px 14px', fontSize: '13px', color: '#EF4444', marginBottom: '14px' }}>⚠ {errorMsg}</div>}
      {stripeErr && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '10px 14px', fontSize: '13px', color: '#EF4444', marginBottom: '14px' }}>⚠ Stripe error: {stripeErr}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
        {loading ? (
          <div style={{ color: C.textMuted, fontSize: '13px', padding: '8px 0' }}>Loading…</div>
        ) : cards.length === 0 && !addingCard ? (
          <div style={{ color: C.textMuted, fontSize: '13px', textAlign: 'center', padding: '16px 0' }}>No cards saved yet.</div>
        ) : cards.map(card => (
          <div key={card.id} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px', background: C.surface2, borderRadius: '12px', border: `1px solid ${C.border}` }}>
            <div style={{ width: '44px', height: '28px', borderRadius: '6px', background: brandColor(card.brand), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 800, color: '#fff', flexShrink: 0 }}>{card.brand.slice(0,4).toUpperCase()}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '14px', fontWeight: 600 }}>•••• •••• •••• {card.last4}</div>
              <div style={{ fontSize: '12px', color: C.textMuted }}>Expires {card.exp_month}/{card.exp_year}</div>
            </div>
            <Btn variant="ghost" size="sm" onClick={() => handleRemove(card.id)}>Remove</Btn>
          </div>
        ))}
      </div>
      {!addingCard ? (
        <Btn variant="secondary" size="sm" onClick={handleAddCard} disabled={stripeStatus === 'loading'}>
          {stripeStatus === 'loading' ? 'Loading Stripe…' : '+ Add new card'}
        </Btn>
      ) : (
        <div style={{ background: '#F9FAFB', borderRadius: '14px', padding: '20px', border: '1px solid #E5E7EB' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#6B7280', marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
            <span>Add payment method</span>
            <span style={{ background: '#635bff', color: '#fff', fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px' }}>powered by stripe</span>
          </div>
          <div style={{ position: 'relative', marginBottom: '16px' }}>
            <div
              ref={mountNodeRef}
              style={{ padding: '12px 14px', background: '#ffffff', borderRadius: '8px', border: '1px solid #D1D5DB', minHeight: '46px' }}
            />
            {!cardMounted && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', paddingLeft: '14px', fontSize: '13px', color: '#9CA3AF', pointerEvents: 'none' }}>
                {stripe ? 'Initialising…' : 'Loading Stripe…'}
              </div>
            )}
          </div>
          <div style={{ fontSize: '12px', color: '#9CA3AF', marginBottom: '16px' }}>
            🔒 Your card is encrypted and stored securely via Stripe. YouSafe never sees your full card number.
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <Btn variant="primary" size="sm" onClick={handleSave} disabled={saving || !cardMounted}>
              {saving ? 'Saving…' : !cardMounted ? 'Loading…' : 'Save card securely'}
            </Btn>
            <Btn variant="ghost" size="sm" onClick={() => { setAddingCard(false); setErrorMsg(null); }}>Cancel</Btn>
          </div>
        </div>
      )}
    </Card>
  );
}

window.EscrowApprovalCard = EscrowApprovalCard;
window.StripePaymentSection = StripePaymentSection;

// ─── Top-up Dialog ───────────────────────────────────────────────────────────
function TopUpDialog({ onClose, onSuccess }) {
  const [cards, setCards] = React.useState([]);
  const [loadingCards, setLoadingCards] = React.useState(true);
  const [selectedCardId, setSelectedCardId] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [errMsg, setErrMsg] = React.useState(null);
  const [success, setSuccess] = React.useState(false);

  React.useEffect(() => {
    fetch('/api/wallet/payment-methods')
      .then(r => r.json())
      .then(d => {
        const list = d.cards ?? [];
        setCards(list);
        if (list[0]) setSelectedCardId(list[0].id);
      })
      .finally(() => setLoadingCards(false));
  }, []);

  const PRESETS = [10, 25, 50, 100, 250];
  const amountNum = parseFloat(amount);
  const validAmount = !Number.isNaN(amountNum) && amountNum >= 1;
  const canSubmit = validAmount && !!selectedCardId && !submitting;

  const handleSubmit = async () => {
    setErrMsg(null);
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/wallet/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentMethodId: selectedCardId,
          amount: Math.round(amountNum * 100), // cents
        }),
      });
      let body;
      try { body = await res.json(); } catch { body = { error: `Server returned ${res.status}` }; }
      if (!res.ok || body.error) throw new Error(body.error || `Top-up failed (${res.status})`);
      setSuccess(true);
      setTimeout(() => onSuccess(), 1200);
    } catch (e) {
      setErrMsg(e.message);
    } finally { setSubmitting(false); }
  };

  const brandColor = b => ({ visa: '#1a1f71', mastercard: '#eb001b', amex: '#007bc1' }[b] ?? C.textMuted);

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '20px' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: C.surface, borderRadius: '16px', padding: '28px', maxWidth: '460px', width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 800, marginBottom: '4px' }}>Top up wallet</div>
            <div style={{ fontSize: '13px', color: C.textMuted }}>Add funds to your wallet using a saved card</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: C.textMuted, lineHeight: 1 }}>×</button>
        </div>

        {success ? (
          <div style={{ background: `${C.green}15`, border: `1px solid ${C.green}33`, borderRadius: '12px', padding: '20px', textAlign: 'center' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>✓</div>
            <div style={{ fontWeight: 700, color: C.green }}>Top-up successful!</div>
            <div style={{ fontSize: '13px', color: C.textMuted, marginTop: '4px' }}>Your wallet will update in a moment.</div>
          </div>
        ) : (
          <>
            {/* Amount */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: C.text, marginBottom: '10px' }}>Amount (USD)</div>
              <div style={{ position: 'relative', marginBottom: '10px' }}>
                <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '18px', fontWeight: 700, color: C.textMuted }}>$</span>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  style={{ width: '100%', padding: '12px 14px 12px 28px', fontSize: '18px', fontWeight: 600, background: C.surface2, border: `1px solid ${C.border2}`, borderRadius: '10px', color: C.text, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {PRESETS.map(p => (
                  <button
                    key={p}
                    onClick={() => setAmount(String(p))}
                    style={{
                      padding: '6px 14px', borderRadius: '20px', border: `1px solid ${amount === String(p) ? C.cyan : C.border}`,
                      background: amount === String(p) ? `${C.cyan}15` : C.surface2, color: amount === String(p) ? C.cyan : C.textMuted,
                      fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
                    }}
                  >${p}</button>
                ))}
              </div>
            </div>

            {/* Card selector */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: C.text, marginBottom: '10px' }}>Pay with</div>
              {loadingCards ? (
                <div style={{ color: C.textMuted, fontSize: '13px', padding: '12px' }}>Loading cards…</div>
              ) : cards.length === 0 ? (
                <div style={{ background: 'rgba(245,158,11,0.1)', border: `1px solid rgba(245,158,11,0.3)`, borderRadius: '10px', padding: '14px', fontSize: '13px', color: C.orange }}>
                  No saved cards. Add a card first using the "+ Add new card" button below.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {cards.map(card => (
                    <label
                      key={card.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px',
                        background: C.surface2, borderRadius: '10px',
                        border: `2px solid ${selectedCardId === card.id ? C.cyan : C.border}`,
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="radio"
                        checked={selectedCardId === card.id}
                        onChange={() => setSelectedCardId(card.id)}
                        style={{ accentColor: C.cyan }}
                      />
                      <div style={{ width: '36px', height: '24px', borderRadius: '4px', background: brandColor(card.brand), color: '#fff', fontSize: '9px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {card.brand.slice(0, 4).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, fontSize: '14px' }}>
                        •••• {card.last4} <span style={{ color: C.textMuted, fontSize: '12px' }}>· {card.exp_month}/{card.exp_year}</span>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {errMsg && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '10px 14px', fontSize: '13px', color: '#EF4444', marginBottom: '16px' }}>⚠ {errMsg}</div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <Btn variant="primary" size="md" onClick={handleSubmit} disabled={!canSubmit} fullWidth>
                {submitting ? 'Charging…' : validAmount ? `Charge $${amountNum.toFixed(2)}` : 'Enter an amount'}
              </Btn>
              <Btn variant="ghost" size="md" onClick={onClose}>Cancel</Btn>
            </div>
            <div style={{ fontSize: '11px', color: C.textDim, textAlign: 'center', marginTop: '12px' }}>
              🔒 Charged securely via Stripe. Funds added to your wallet for future orders.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StudentApp({ onLogout, userId, userName }) {
  const [page, setPage] = React.useState('dashboard');
  const [selectedOrder, setSelectedOrder] = React.useState(null);
  const [msgInput, setMsgInput] = React.useState('');
  const [messages, setMessages] = React.useState([]);
  const [orderFilter, setOrderFilter] = React.useState('all');
  const [notifOpen, setNotifOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [orderPlaced, setOrderPlaced] = React.useState(false);

  const filteredOrders = orderFilter === 'all' ? STUDENT_ORDERS : STUDENT_ORDERS.filter(o => o.status === orderFilter);

  const sendMessage = () => {
    if (!msgInput.trim()) return;
    setMessages(prev => [...prev, { from: 'student', text: msgInput, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
    setMsgInput('');
  };

  const activeOrders = STUDENT_ORDERS.filter(o => o.status === 'active' || o.status === 'review').length;
  const completedOrders = STUDENT_ORDERS.filter(o => o.status === 'completed').length;

  // ── SIDEBAR ──
  const Sidebar = () => (
    <div style={{
      width: '240px', flexShrink: 0, background: C.surface, borderRight: `1px solid ${C.border}`,
      display: 'flex', flexDirection: 'column', height: '100vh', position: 'sticky', top: 0,
    }}>
      <div style={{ padding: '20px 16px', borderBottom: `1px solid ${C.border}`, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '3px', background: `linear-gradient(90deg, ${C.cyan} 0%, ${C.cyan} 40%, #fff 40%, #fff 60%, ${C.navy} 60%, ${C.navy} 100%)` }} />
        <a href="https://yousafeconsultancy.com" style={{ display: 'inline-flex' }}>
          <img src="logo.png" style={{ height: '32px', filter: 'invert(1)' }} alt="YouSafe" />
        </a>
      </div>
      <div style={{ padding: '12px 8px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <NavItem icon="⬛" label="Dashboard" active={page === 'dashboard'} onClick={() => setPage('dashboard')} />
        <NavItem icon="📦" label="My Orders" active={page === 'orders'} onClick={() => setPage('orders')} badge={activeOrders > 0 ? activeOrders : null} />
        <NavItem icon="🛒" label="Browse Services" active={page === 'services'} onClick={() => setPage('services')} />
        <NavItem icon="💬" label="Messages" active={page === 'messages'} onClick={() => setPage('messages')} />
        <NavItem icon="📋" label="Documents" active={page === 'documents'} onClick={() => setPage('documents')} />
        <div style={{ height: '1px', background: C.border, margin: '8px 6px' }} />
        <NavItem icon="💳" label="Billing" active={page === 'billing'} onClick={() => setPage('billing')} />
        <NavItem icon="⚙️" label="Settings" active={page === 'settings'} onClick={() => setPage('settings')} />
      </div>
      <div style={{ padding: '12px', borderTop: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '10px', background: C.surface2 }}>
          <Avatar name={userName || 'Student'} size={32} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userName || 'Student'}</div>
            <div style={{ fontSize: '11px', color: C.textMuted }}>Student</div>
          </div>
          <button onClick={onLogout} style={{ background: 'none', border: 'none', color: C.textDim, cursor: 'pointer', fontSize: '16px' }} title="Log out">⏻</button>
        </div>
      </div>
    </div>
  );

  // ── TOPBAR ──
  const TopBar = ({ title }) => (
    <div style={{
      height: '60px', background: C.surface, borderBottom: `1px solid ${C.border}`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 28px', position: 'sticky', top: 0, zIndex: 10,
    }}>
      <h1 style={{ fontSize: '16px', fontWeight: 700, color: C.text }}>{title}</h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setNotifOpen(!notifOpen)} style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '7px 10px', cursor: 'pointer', color: C.textMuted, fontSize: '16px' }}>🔔</button>
          {notifOpen && (
            <div style={{ position: 'absolute', right: 0, top: '44px', width: '300px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', zIndex: 100 }}>
              <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, fontSize: '13px', fontWeight: 700 }}>Notifications</div>
              <div style={{ padding: '28px 16px', textAlign: 'center', color: C.textMuted, fontSize: '13px' }}>No notifications yet.</div>
            </div>
          )}
        </div>
        <Avatar name={userName || 'User'} size={32} />
      </div>
    </div>
  );

  // ── DASHBOARD ──
  const Dashboard = () => (
    <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h2 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '4px' }}>Welcome, {userName || 'there'} 👋</h2>
        <p style={{ color: C.textMuted, fontSize: '14px' }}>
          {activeOrders > 0 ? `You have ${activeOrders} active order${activeOrders !== 1 ? 's' : ''} in progress.` : 'Browse services and place your first order to get started.'}
        </p>
      </div>
      {/* Stats — only shown once there's real activity */}
      {STUDENT_ORDERS.length > 0 && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
        <StatCard label="Active Orders" value={activeOrders} icon="📦" color={C.cyan} />
        <StatCard label="Completed" value={completedOrders} icon="✅" color={C.green} />
      </div>
      )}
      {/* Active Orders */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontWeight: 700, fontSize: '15px' }}>Active Orders</h3>
          <Btn variant="ghost" size="sm" onClick={() => setPage('orders')}>View all →</Btn>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {STUDENT_ORDERS.filter(o => o.status !== 'completed').map(order => (
            <Card key={order.id} style={{ padding: '18px', cursor: 'pointer' }} onClick={() => { setSelectedOrder(order); setPage('order-detail'); }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                <Avatar name={order.consultant} size={40} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '14px' }}>{order.service}</div>
                      <div style={{ color: C.textMuted, fontSize: '12px', marginTop: '2px' }}>with {order.consultant}</div>
                    </div>
                    <StatusBadge status={order.status} />
                  </div>
                  <ProgressBar value={order.progress} style={{ marginTop: '8px' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                    <span style={{ fontSize: '12px', color: C.textMuted }}>{order.deliverable}</span>
                    <span style={{ fontSize: '12px', color: C.textMuted }}>{order.progress}%</span>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
      {/* Quick actions */}
      <div>
        <h3 style={{ fontWeight: 700, fontSize: '15px', marginBottom: '16px' }}>Quick Actions</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px' }}>
          {[
            { icon: '🛒', label: 'Browse services', action: () => setPage('services') },
            { icon: '💬', label: 'Message consultant', action: () => setPage('messages') },
            { icon: '📋', label: 'Upload document', action: () => setPage('documents') },
            { icon: '💳', label: 'Manage billing', action: () => setPage('billing') },
          ].map(({ icon, label, action }) => (
            <button key={label} onClick={action} style={{
              background: C.surface2, border: `1px solid ${C.border}`, borderRadius: '12px',
              padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px',
              cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', transition: 'all 0.15s',
            }}>
              <span style={{ fontSize: '22px' }}>{icon}</span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: C.text }}>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  // ── ORDERS LIST ──
  const OrdersList = () => (
    <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '4px' }}>My Orders</h2>
          <p style={{ color: C.textMuted, fontSize: '14px' }}>{STUDENT_ORDERS.length} total orders</p>
        </div>
        <Btn variant="primary" size="sm" onClick={() => setPage('services')}>+ New Order</Btn>
      </div>
      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {['all', 'active', 'review', 'pending', 'completed'].map(f => (
          <button key={f} onClick={() => setOrderFilter(f)} style={{
            padding: '6px 16px', borderRadius: '20px', border: `1px solid ${orderFilter === f ? C.cyan : C.border}`,
            background: orderFilter === f ? `${C.cyan}18` : C.surface2,
            color: orderFilter === f ? C.cyan : C.textMuted,
            fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: orderFilter === f ? 600 : 400,
            transition: 'all 0.15s', textTransform: 'capitalize',
          }}>{f}</button>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {filteredOrders.map(order => (
          <Card key={order.id} hover style={{ padding: '20px', cursor: 'pointer' }} onClick={() => { setSelectedOrder(order); setPage('order-detail'); }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <Avatar name={order.consultant} size={44} />
              <div style={{ flex: 1, minWidth: '200px' }}>
                <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '2px' }}>{order.service}</div>
                <div style={{ color: C.textMuted, fontSize: '13px' }}>{order.id} · with {order.consultant} · {order.date}</div>
                <ProgressBar value={order.progress} style={{ marginTop: '8px', maxWidth: '240px' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
                <StatusBadge status={order.status} />
                <span style={{ fontSize: '14px', fontWeight: 700, color: C.text }}>{order.price}</span>
                {order.messages > 0 && <Badge color="red" style={{ fontSize: '11px' }}>{order.messages} new</Badge>}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );

  // ── ORDER DETAIL ──
  const OrderDetail = ({ order }) => {
    const timeline = [
      { label: 'Order placed', date: 'Apr 10', done: true },
      { label: 'Consultant assigned', date: 'Apr 11', done: true },
      { label: 'Documents reviewed', date: 'Apr 14', done: true },
      { label: 'Draft delivered', date: 'Apr 18', done: order.progress >= 80 },
      { label: 'Final delivery', date: 'Apr 22', done: order.status === 'completed' },
    ];
    return (
      <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Btn variant="ghost" size="sm" onClick={() => setPage('orders')}>← Back</Btn>
          <h2 style={{ fontSize: '18px', fontWeight: 800 }}>{order.service}</h2>
          <StatusBadge status={order.status} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px' }}>
          {/* Main */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Progress */}
            <Card>
              <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '16px' }}>Progress</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', color: C.textMuted }}>Overall completion</span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: C.cyan }}>{order.progress}%</span>
              </div>
              <ProgressBar value={order.progress} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '20px' }}>
                {timeline.map((t, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: t.done ? C.cyan : C.surface3, border: `2px solid ${t.done ? C.cyan : C.border2}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: t.done ? '#000' : C.textDim, fontWeight: 700, flexShrink: 0 }}>{t.done ? '✓' : ''}</div>
                    <span style={{ flex: 1, fontSize: '14px', color: t.done ? C.text : C.textMuted }}>{t.label}</span>
                    <span style={{ fontSize: '12px', color: C.textDim }}>{t.date}</span>
                  </div>
                ))}
              </div>
            </Card>
            {/* Escrow approval */}
            {order.status === 'review' && (
              <EscrowApprovalCard order={order} />
            )}
            {/* Messages */}
            <Card style={{ padding: '20px' }}>
              <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '16px' }}>Messages</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '260px', overflowY: 'auto', marginBottom: '16px' }}>
                {messages.map((m, i) => (
                  <div key={i} style={{ display: 'flex', gap: '10px', flexDirection: m.from === 'student' ? 'row-reverse' : 'row' }}>
                    {m.from === 'consultant' && <Avatar name={m.name} size={30} />}
                    <div style={{ maxWidth: '70%' }}>
                      <div style={{
                        padding: '10px 14px', borderRadius: '12px', fontSize: '14px', lineHeight: 1.5,
                        background: m.from === 'student' ? C.cyan : C.surface2,
                        color: m.from === 'student' ? '#000' : C.text,
                      }}>{m.text}</div>
                      <div style={{ fontSize: '11px', color: C.textDim, marginTop: '4px', textAlign: m.from === 'student' ? 'right' : 'left' }}>{m.time}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input value={msgInput} onChange={e => setMsgInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendMessage()}
                  placeholder="Type a message…"
                  style={{ flex: 1, padding: '10px 14px', background: C.surface2, border: `1px solid ${C.border2}`, borderRadius: '10px', color: C.text, fontSize: '14px', fontFamily: 'inherit', outline: 'none' }} />
                <Btn variant="primary" size="sm" onClick={sendMessage}>Send</Btn>
              </div>
            </Card>
          </div>
          {/* Sidebar info */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <Card style={{ padding: '20px' }}>
              <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '16px' }}>Order Details</div>
              {[['Order ID', order.id], ['Date placed', order.date], ['Price', order.price], ['Deliverable', order.deliverable]].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${C.border}`, fontSize: '13px' }}>
                  <span style={{ color: C.textMuted }}>{k}</span>
                  <span style={{ color: C.text, fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </Card>
            <Card style={{ padding: '20px' }}>
              <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '14px' }}>Your Consultant</div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <Avatar name={order.consultant} size={44} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '14px' }}>{order.consultant}</div>
                  <div style={{ color: C.textMuted, fontSize: '12px' }}>Senior Consultant</div>
                  <div style={{ color: C.cyan, fontSize: '12px', marginTop: '2px' }}>⭐ 4.9 (128 reviews)</div>
                </div>
              </div>
              <Btn variant="secondary" fullWidth size="sm" style={{ marginTop: '14px' }} onClick={() => setPage('messages')}>Send message</Btn>
            </Card>
            <Card style={{ padding: '20px' }}>
              <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '12px' }}>Documents</div>
              {['Transcript.pdf', 'CV_2025.pdf', 'Passport_copy.pdf'].map(f => (
                <div key={f} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${C.border}`, fontSize: '13px' }}>
                  <span style={{ color: C.text }}>📄 {f}</span>
                  <Btn variant="ghost" size="sm">↓</Btn>
                </div>
              ))}
              <Btn variant="secondary" fullWidth size="sm" style={{ marginTop: '10px' }}>+ Upload file</Btn>
            </Card>
          </div>
        </div>
      </div>
    );
  };

  // ── SERVICES BROWSE ──
  const ServicesBrowse = () => {
    const [catFilter, setCatFilter] = React.useState('All');
    const [cart, setCart] = React.useState(null);
    const [showCheckout, setShowCheckout] = React.useState(false);
    const [services, setServices] = React.useState([]);
    const [servicesLoading, setServicesLoading] = React.useState(true);
    const [servicesError, setServicesError] = React.useState(null);
    const [payMethod, setPayMethod] = React.useState('stripe'); // 'stripe' | 'wallet' | 'saved_card'
    const [savedCards, setSavedCards] = React.useState([]);
    const [cardsLoading, setCardsLoading] = React.useState(false);
    const [selectedCardId, setSelectedCardId] = React.useState('');
    const [walletBalance, setWalletBalance] = React.useState(null);
    const [paying, setPaying] = React.useState(false);
    const [payError, setPayError] = React.useState(null);
    const categories = ['All', ...Array.from(new Set(services.map(s => s.category || 'General')))];
    const filtered = catFilter === 'All' ? services : services.filter(s => (s.category || 'General') === catFilter);

    React.useEffect(() => {
      setServicesLoading(true);
      fetch('/api/services')
        .then(async r => {
          const d = await r.json();
          if (!r.ok) throw new Error(d.error || 'Unable to load services');
          setServices(d.services ?? []);
          setServicesError(null);
        })
        .catch(e => setServicesError(e.message))
        .finally(() => setServicesLoading(false));
    }, []);

    // Fetch wallet balance when checkout opens
    React.useEffect(() => {
      if (!showCheckout) return;
      fetch('/api/wallet/balance')
        .then(r => r.json())
        .then(d => setWalletBalance(d.available?.usd ?? 0))
        .catch(() => setWalletBalance(0));

      setCardsLoading(true);
      fetch('/api/wallet/payment-methods')
        .then(r => r.json())
        .then(d => {
          const cards = d.cards ?? [];
          setSavedCards(cards);
          setSelectedCardId(current => current || cards[0]?.id || '');
        })
        .catch(() => setSavedCards([]))
        .finally(() => setCardsLoading(false));
    }, [showCheckout]);

    if (showCheckout && cart) {
      const priceNum = Number(cart.price || 0);
      const amountCents = priceNum * 100;
      const serviceCurrency = String(cart.currency || 'usd').toLowerCase();
      const isUsdService = serviceCurrency === 'usd';
      const usdPriceNum = Number(cart.usd_price || (isUsdService ? priceNum : 0));
      const hasUsdEquivalent = !isUsdService && usdPriceNum > 0;
      const canUseWallet = isUsdService && walletBalance !== null && walletBalance >= priceNum;
      const selectedCard = savedCards.find(card => card.id === selectedCardId);
      const canUseSavedCard = Boolean(selectedCardId);

      const handleWalletPay = async () => {
        setPaying(true); setPayError(null);
        try {
          const res = await fetch('/api/checkout/wallet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: cart.title, amountCents, serviceId: cart.id }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Payment failed');
          setShowCheckout(false); setCart(null); setOrderPlaced(true);
          setTimeout(() => setOrderPlaced(false), 6000);
        } catch (e) {
          setPayError(e.message);
        } finally { setPaying(false); }
      };

      const handleSavedCardPay = async () => {
        if (!selectedCardId) {
          setPayError('Choose a saved card first.');
          return;
        }

        setPaying(true); setPayError(null);
        try {
          const res = await fetch('/api/checkout/card', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ serviceId: cart.id, paymentMethodId: selectedCardId }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Payment failed');

          if (data.requiresAction) {
            if (!STRIPE_PUB_KEY) throw new Error('Stripe is not configured.');
            const stripe = await loadStripe(STRIPE_PUB_KEY);
            if (!stripe) throw new Error('Unable to load Stripe.');
            const result = await stripe.confirmCardPayment(data.clientSecret);
            if (result.error) throw new Error(result.error.message);

            const completeRes = await fetch('/api/checkout/card', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ paymentIntentId: data.paymentIntentId }),
            });
            const completeData = await completeRes.json();
            if (!completeRes.ok) throw new Error(completeData.error || 'Payment confirmation failed');
          }

          setShowCheckout(false); setCart(null); setOrderPlaced(true);
          setTimeout(() => setOrderPlaced(false), 6000);
        } catch (e) {
          setPayError(e.message);
        } finally { setPaying(false); }
      };

      return (
        <div style={{ padding: '28px', maxWidth: '560px' }}>
          <Btn variant="ghost" size="sm" onClick={() => { setShowCheckout(false); setPayError(null); }} style={{ marginBottom: '20px' }}>← Back to services</Btn>
          <h2 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '24px' }}>Checkout</h2>
          {/* Service summary */}
          <Card style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
              <div style={{ fontSize: '32px' }}>{cart.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '15px' }}>{cart.title}</div>
                <div style={{ color: C.textMuted, fontSize: '13px', marginTop: '4px' }}>{cart.category || 'General'}</div>
                <div style={{ fontSize: '12px', color: C.textMuted, marginTop: '8px' }}>⏱ {deliveryLabel(cart.delivery_days)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '20px', fontWeight: 800, color: C.cyan }}>{formatMoney(cart.price, serviceCurrency)}</div>
                {hasUsdEquivalent && <div style={{ color: C.textMuted, fontSize: '12px', marginTop: '3px' }}>{formatMoney(usdPriceNum, 'usd')}</div>}
              </div>
            </div>
          </Card>
          {/* Payment method selector */}
          <Card style={{ marginBottom: '16px' }}>
            <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '14px' }}>Choose payment method</div>
            {/* Wallet option */}
            <div
              onClick={() => canUseWallet && setPayMethod('wallet')}
              style={{
                padding: '14px', borderRadius: '12px', border: `2px solid ${payMethod === 'wallet' ? C.cyan : C.border}`,
                background: payMethod === 'wallet' ? `${C.cyan}10` : C.surface2,
                cursor: canUseWallet ? 'pointer' : 'not-allowed', opacity: canUseWallet ? 1 : 0.5,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px',
              }}
            >
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <span style={{ fontSize: '20px' }}>💰</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>Pay with Wallet</div>
                  <div style={{ fontSize: '12px', color: C.textMuted }}>
                    Balance: {walletBalance === null ? '…' : `$${walletBalance.toFixed(2)}`}
                    {!isUsdService && <span style={{ color: C.textMuted, marginLeft: '6px' }}>— USD only</span>}
                    {isUsdService && !canUseWallet && walletBalance !== null && <span style={{ color: '#EF4444', marginLeft: '6px' }}>— insufficient</span>}
                  </div>
                </div>
              </div>
              {payMethod === 'wallet' && <span style={{ color: C.cyan, fontWeight: 700 }}>✓</span>}
            </div>
            {/* Saved card option */}
            <div
              onClick={() => canUseSavedCard && setPayMethod('saved_card')}
              style={{
                padding: '14px', borderRadius: '12px', border: `2px solid ${payMethod === 'saved_card' ? C.cyan : C.border}`,
                background: payMethod === 'saved_card' ? `${C.cyan}10` : C.surface2,
                cursor: canUseSavedCard ? 'pointer' : 'not-allowed', opacity: canUseSavedCard ? 1 : 0.55,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px',
              }}
            >
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <span style={{ fontSize: '20px' }}>💳</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>Pay with Saved Card</div>
                  <div style={{ fontSize: '12px', color: C.textMuted }}>
                    {cardsLoading ? 'Loading saved cards…' : selectedCard ? `${selectedCard.brand?.toUpperCase?.() || 'CARD'} ending ${selectedCard.last4}` : 'No saved cards yet'}
                  </div>
                </div>
              </div>
              {payMethod === 'saved_card' && <span style={{ color: C.cyan, fontWeight: 700 }}>✓</span>}
            </div>
            {payMethod === 'saved_card' && savedCards.length > 0 && (
              <div style={{ display: 'grid', gap: '8px', margin: '-2px 0 10px 0' }}>
                {savedCards.map(card => (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => setSelectedCardId(card.id)}
                    style={{
                      width: '100%', padding: '10px 12px', borderRadius: '10px', border: `1px solid ${selectedCardId === card.id ? C.cyan : C.border}`,
                      background: selectedCardId === card.id ? `${C.cyan}0f` : '#fff', display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center', cursor: 'pointer', color: C.text,
                    }}
                  >
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>{card.brand?.toUpperCase?.() || 'CARD'} •••• {card.last4}</span>
                    <span style={{ fontSize: '12px', color: C.textMuted }}>Exp {card.exp_month}/{card.exp_year}</span>
                  </button>
                ))}
              </div>
            )}
            {/* Stripe option */}
            <div
              onClick={() => setPayMethod('stripe')}
              style={{
                padding: '14px', borderRadius: '12px', border: `2px solid ${payMethod === 'stripe' ? C.cyan : C.border}`,
                background: payMethod === 'stripe' ? `${C.cyan}10` : C.surface2,
                cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <span style={{ fontSize: '20px' }}>💳</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>Stripe Hosted Checkout</div>
                  <div style={{ fontSize: '12px', color: C.textMuted }}>Open the secure hosted payment page</div>
                </div>
              </div>
              {payMethod === 'stripe' && <span style={{ color: C.cyan, fontWeight: 700 }}>✓</span>}
            </div>
          </Card>
          {/* Order summary */}
          <Card style={{ marginBottom: '24px' }}>
            <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '14px' }}>Order summary</div>
            {[['Service', cart.title], ['Delivery', deliveryLabel(cart.delivery_days)]].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${C.border}`, fontSize: '13px' }}>
                <span style={{ color: C.textMuted }}>{k}</span>
                <span style={{ fontWeight: 600 }}>{v}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', fontSize: '16px', fontWeight: 800 }}>
              <span>Total</span><span style={{ color: C.cyan }}>{formatMoney(cart.price, serviceCurrency)}</span>
            </div>
            {hasUsdEquivalent && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 0 4px', fontSize: '12px', color: C.textMuted }}>
                <span>USD equivalent</span><span>{formatMoney(usdPriceNum, 'usd')}</span>
              </div>
            )}
          </Card>
          {payError && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '10px 14px', fontSize: '13px', color: '#EF4444', marginBottom: '14px' }}>⚠ {payError}</div>}
          {payMethod === 'wallet' ? (
            <Btn variant="primary" fullWidth size="lg" onClick={handleWalletPay} disabled={paying || !canUseWallet}>
              {paying ? 'Processing…' : `Pay ${formatMoney(cart.price, serviceCurrency)} from Wallet`}
            </Btn>
          ) : payMethod === 'saved_card' ? (
            <Btn variant="primary" fullWidth size="lg" onClick={handleSavedCardPay} disabled={paying || !canUseSavedCard}>
              {paying ? 'Processing…' : selectedCard ? `Pay ${formatMoney(cart.price, serviceCurrency)} with •••• ${selectedCard.last4}` : 'Choose a saved card'}
            </Btn>
          ) : (
            <Btn variant="primary" fullWidth size="lg" disabled={paying} onClick={async () => {
              setPaying(true); setPayError(null);
              try {
                const res = await fetch('/api/checkout/service', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ serviceId: cart.id }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Checkout failed');
                window.location.href = data.url;
              } catch (e) {
                setPayError(e.message);
                setPaying(false);
              }
            }}>
              {paying ? 'Opening checkout…' : `Pay ${formatMoney(cart.price, serviceCurrency)} with Stripe →`}
            </Btn>
          )}
          <p style={{ fontSize: '12px', color: C.textDim, textAlign: 'center', marginTop: '12px' }}>
            Funds held in escrow until you approve delivery. Full refund if no consultant is assigned.
          </p>
        </div>
      );
    }

    return (
      <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '4px' }}>Browse Services</h2>
          <p style={{ color: C.textMuted, fontSize: '14px' }}>Expert support at every stage of your study abroad journey. Payment held in escrow until you approve.</p>
        </div>
        {orderPlaced && (
          <div style={{ background: `${C.green}15`, border: `1px solid ${C.green}33`, borderRadius: '12px', padding: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span style={{ fontSize: '20px' }}>✅</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: '14px', color: C.green }}>Order placed! Payment held in escrow.</div>
              <div style={{ fontSize: '13px', color: C.textMuted }}>Funds are safe. A consultant will be assigned within 24 hours. You release payment on approval.</div>
            </div>
            <Btn variant="ghost" size="sm" onClick={() => setPage('orders')}>View order →</Btn>
          </div>
        )}
        {/* Category filter */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {categories.map(c => (
            <button key={c} onClick={() => setCatFilter(c)} style={{
              padding: '6px 16px', borderRadius: '20px', border: `1px solid ${catFilter === c ? C.cyan : C.border}`,
              background: catFilter === c ? `${C.cyan}18` : C.surface2,
              color: catFilter === c ? C.cyan : C.textMuted,
              fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: catFilter === c ? 600 : 400, transition: 'all 0.15s',
            }}>{c}</button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
          {servicesLoading && <div style={{ color: C.textMuted, fontSize: '14px', padding: '20px' }}>Loading services…</div>}
          {servicesError && <div style={{ color: C.red, fontSize: '14px', padding: '20px' }}>{servicesError}</div>}
          {!servicesLoading && !servicesError && filtered.length === 0 && <div style={{ color: C.textMuted, fontSize: '14px', padding: '20px' }}>No active services are available yet.</div>}
          {filtered.map(s => (
            <Card key={s.id} hover style={{ display: 'flex', flexDirection: 'column', gap: '14px', position: 'relative' }}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <div style={{ fontSize: '28px' }}>{serviceIcon(s.category)}</div>
                <Badge color="gray" style={{ fontSize: '11px', marginTop: '4px' }}>{s.category || 'General'}</Badge>
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '6px' }}>{s.title}</div>
                <div style={{ color: C.textMuted, fontSize: '13px', lineHeight: 1.6 }}>Professional YouSafe consultancy service with escrow-protected payment.</div>
              </div>
              <div style={{ fontSize: '12px', color: C.textDim }}>⏱ {deliveryLabel(s.delivery_days)} · 🔒 Escrow protected</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                <div>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: C.cyan }}>{formatMoney(s.price, s.currency)}</div>
                  {String(s.currency || 'usd').toLowerCase() !== 'usd' && Number(s.usd_price || 0) > 0 && (
                    <div style={{ color: C.textMuted, fontSize: '12px', marginTop: '3px' }}>{formatMoney(s.usd_price, 'usd')}</div>
                  )}
                </div>
                <Btn variant="primary" size="sm" onClick={() => { setCart(s); setShowCheckout(true); }}>Order now</Btn>              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  };

  // ── DOCUMENTS ──
  const Documents = () => (
    <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '4px' }}>Documents</h2>
          <p style={{ color: C.textMuted, fontSize: '14px' }}>Manage your application documents securely.</p>
        </div>
        <Btn variant="primary" size="sm">+ Upload</Btn>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '260px', flexDirection: 'column', gap: '12px', color: C.textMuted }}>
        <span style={{ fontSize: '40px' }}>📄</span>
        <p style={{ fontSize: '15px' }}>No documents uploaded yet.</p>
        <p style={{ fontSize: '13px', color: C.textDim }}>Upload your transcripts, passport, or other documents to get started.</p>
      </div>
    </div>
  );

  // ── BILLING ──
  const Billing = () => {
    const [walletBal, setWalletBal] = React.useState(null);
    const [topUpOpen, setTopUpOpen] = React.useState(false);

    const refreshBalance = React.useCallback(() => {
      fetch('/api/wallet/balance')
        .then(r => r.json())
        .then(d => setWalletBal(d.available?.usd ?? d.available ?? 0))
        .catch(() => setWalletBal(0));
    }, []);

    React.useEffect(() => { refreshBalance(); }, [refreshBalance]);

    return (
      <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Billing</h2>

        {/* Wallet balance */}
        <Card style={{ background: `linear-gradient(135deg, ${C.surface}, rgba(60,59,110,0.06))`, border: `1px solid rgba(60,59,110,0.18)` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '12px', color: C.textMuted, marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Wallet Balance</div>
              <div style={{ fontSize: '36px', fontWeight: 800, color: C.text, lineHeight: 1 }}>
                {walletBal === null ? '—' : `$${Number(walletBal).toFixed(2)}`}
              </div>
              <div style={{ fontSize: '12px', color: C.textMuted, marginTop: '6px' }}>Available to spend on services</div>
            </div>
            <Btn variant="primary" size="sm" onClick={() => setTopUpOpen(true)}>+ Top up</Btn>
          </div>
        </Card>

        {topUpOpen && (
          <TopUpDialog
            onClose={() => setTopUpOpen(false)}
            onSuccess={() => { setTopUpOpen(false); refreshBalance(); }}
          />
        )}

        <StripePaymentSection />

        <Card>
          <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '16px' }}>Payment History</div>
          <div style={{ padding: '28px 0', textAlign: 'center', color: C.textMuted, fontSize: '13px' }}>
            No payments yet. Your order history will appear here once you place an order.
          </div>
        </Card>
      </div>
    );
  };

  // ── SETTINGS ──
  const Settings = () => {
    const [notifs, setNotifs] = React.useState({ messages: true, orders: true, promo: false });
    return (
      <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '640px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Settings</h2>
        <Card>
          <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '20px' }}>Profile</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
            <Avatar name={userName || 'User'} size={60} />
            <div>
              <div style={{ fontWeight: 700 }}>{userName || 'User'}</div>
              <Btn variant="secondary" size="sm" style={{ marginTop: '8px' }}>Change photo</Btn>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <Input label="Full name" value={userName || ''} onChange={() => {}} />
            <Input label="Email" type="email" value="" onChange={() => {}} />
            <Input label="Phone" value="" onChange={() => {}} placeholder="+44 7700 000000" />
            <Btn variant="primary" size="sm" style={{ alignSelf: 'flex-start' }}>Save changes</Btn>
          </div>
        </Card>
        <Card>
          <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '20px' }}>Notifications</div>
          {[['messages', 'New messages from consultants'], ['orders', 'Order status updates'], ['promo', 'Promotions and offers']].map(([key, label]) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontSize: '14px' }}>{label}</span>
              <button onClick={() => setNotifs(n => ({ ...n, [key]: !n[key] }))} style={{
                width: '44px', height: '24px', borderRadius: '99px', border: 'none', cursor: 'pointer',
                background: notifs[key] ? C.cyan : C.surface3, position: 'relative', transition: 'background 0.2s',
              }}>
                <div style={{ position: 'absolute', top: '3px', left: notifs[key] ? '22px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
              </button>
            </div>
          ))}
        </Card>
        <Card>
          <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '16px' }}>Password</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <Input label="Current password" type="password" value="" onChange={() => {}} placeholder="••••••••" />
            <Input label="New password" type="password" value="" onChange={() => {}} placeholder="••••••••" />
            <Btn variant="secondary" size="sm" style={{ alignSelf: 'flex-start' }}>Update password</Btn>
          </div>
        </Card>
      </div>
    );
  };

  // ── RENDER ──
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: C.bg }}>
      <Sidebar />
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        <TopBar title={{
          dashboard: 'Dashboard', orders: 'My Orders', services: 'Browse Services',
          messages: 'Messages', documents: 'Documents', billing: 'Billing', settings: 'Settings',
          'order-detail': 'Order Details',
        }[page] || 'Dashboard'} />
        <div style={{ flex: 1 }}>
          {page === 'dashboard' && <Dashboard />}
          {page === 'orders' && <OrdersList />}
          {page === 'order-detail' && selectedOrder && <OrderDetail order={selectedOrder} />}
          {page === 'services' && <ServicesBrowse />}
          {page === 'documents' && <Documents />}
          {page === 'billing' && <Billing />}
          {page === 'settings' && <Settings />}
          {page === 'messages' && !selectedOrder && (
            <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Messages</h2>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px', color: C.textMuted, flexDirection: 'column', gap: '12px' }}>
                <span style={{ fontSize: '40px' }}>💬</span>
                <p style={{ fontSize: '15px' }}>No active orders yet. Place an order to chat with your consultant.</p>
              </div>
            </div>
          )}
          {page === 'messages' && selectedOrder && (
            <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Messages</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '20px', height: 'calc(100vh - 180px)' }}>
                <div style={{ background: C.surface, borderRadius: '16px', border: `1px solid ${C.border}`, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ padding: '14px', borderBottom: `1px solid ${C.border}`, fontSize: '13px', fontWeight: 700, color: C.textMuted }}>CONVERSATIONS</div>
                  {STUDENT_ORDERS.map(o => (
                    <div key={o.id} onClick={() => setSelectedOrder(o)} style={{
                      padding: '14px', display: 'flex', gap: '10px', cursor: 'pointer',
                      background: selectedOrder?.id === o.id ? C.surface2 : 'transparent',
                      borderBottom: `1px solid ${C.border}`,
                    }}>
                      <Avatar name={o.consultant} size={36} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.consultant}</div>
                        <div style={{ fontSize: '12px', color: C.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.service}</div>
                      </div>
                      {o.messages > 0 && <Badge color="red" style={{ fontSize: '10px', alignSelf: 'flex-start', padding: '1px 6px' }}>{o.messages}</Badge>}
                    </div>
                  ))}
                </div>
                <Card style={{ display: 'flex', flexDirection: 'column', padding: '0', overflow: 'hidden' }}>
                  <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <Avatar name={selectedOrder.consultant} size={36} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '14px' }}>{selectedOrder.consultant}</div>
                      <div style={{ fontSize: '12px', color: C.green }}>● Online</div>
                    </div>
                  </div>
                  <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {messages.map((m, i) => (
                      <div key={i} style={{ display: 'flex', gap: '10px', flexDirection: m.from === 'student' ? 'row-reverse' : 'row' }}>
                        {m.from === 'consultant' && <Avatar name={m.name} size={30} />}
                        <div style={{ maxWidth: '60%' }}>
                          <div style={{
                            padding: '10px 14px', borderRadius: '12px', fontSize: '14px', lineHeight: 1.5,
                            background: m.from === 'student' ? C.cyan : C.surface2,
                            color: m.from === 'student' ? '#000' : C.text,
                          }}>{m.text}</div>
                          <div style={{ fontSize: '11px', color: C.textDim, marginTop: '4px', textAlign: m.from === 'student' ? 'right' : 'left' }}>{m.time}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ padding: '16px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: '8px' }}>
                    <input value={msgInput} onChange={e => setMsgInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && sendMessage()}
                      placeholder="Type a message…"
                      style={{ flex: 1, padding: '10px 14px', background: C.surface2, border: `1px solid ${C.border2}`, borderRadius: '10px', color: C.text, fontSize: '14px', fontFamily: 'inherit', outline: 'none' }} />
                    <Btn variant="primary" size="sm" onClick={sendMessage}>Send</Btn>
                  </div>
                </Card>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default StudentApp;
