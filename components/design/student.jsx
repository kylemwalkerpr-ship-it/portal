'use client'
// @ts-nocheck
import React from 'react'
import { C, Btn, Badge, Card, Input, Select, Avatar, StatusBadge, Divider, StatCard, ProgressBar, NavItem } from './shared'

const STUDENT_ORDERS = [];

const SERVICES_CATALOG = [
  // ── Study Permits ──
  { id: 'sp1', icon: '📋', title: 'Study Permit Starter Package', desc: 'Essential support for your Canadian study permit application — document checklist, guidance and review.', price: '$199', time: '5–7 days', popular: false, category: 'Study Permits', stripeUrl: 'https://buy.stripe.com/4gM3cvgsV1mK3azeDWgYU02' },
  { id: 'sp2', icon: '📋', title: 'Study Permit Standard Package', desc: 'Full study permit support including document prep, application review and submission strategy.', price: '$349', time: '7–10 days', popular: true, category: 'Study Permits', stripeUrl: 'https://buy.stripe.com/aFa8wP6Sl5D026v2VegYU03' },
  { id: 'sp3', icon: '📋', title: 'Study Permit Premium Package', desc: 'Premium end-to-end study permit service with dedicated consultant, priority support and follow-up.', price: '$549', time: '7–14 days', popular: false, category: 'Study Permits', stripeUrl: 'https://buy.stripe.com/14AaEX6Sl9TgcL91RagYU04' },
  { id: 'sp4', icon: '🌐', title: 'Study Permit & Visa Consulting', desc: 'Comprehensive consulting covering both your study permit and visitor visa requirements.', price: '$149', time: '3–5 days', popular: false, category: 'Study Permits', stripeUrl: 'https://buy.stripe.com/cNieVd0tX9Tgh1pgM4gYU00' },
  // ── University Admissions ──
  { id: 'ua1', icon: '🎓', title: 'University Admission Basic', desc: 'Foundational admissions support: school selection, application checklist and document review.', price: '$299', time: '5–7 days', popular: false, category: 'University Admissions', stripeUrl: 'https://buy.stripe.com/aFadR9ccF1mKdPd0N6gYU05' },
  { id: 'ua2', icon: '🎓', title: 'University Admission Comprehensive', desc: 'Full admissions package: university shortlist, SOP review, application submission and follow-up.', price: '$549', time: '7–14 days', popular: true, category: 'University Admissions', stripeUrl: 'https://buy.stripe.com/6oU5kDfoRc1o6mL2VegYU06' },
  { id: 'ua3', icon: '🎓', title: 'University Admission Elite', desc: 'White-glove admissions support with senior consultant, mock interviews and scholarship guidance.', price: '$849', time: '2–4 weeks', popular: false, category: 'University Admissions', stripeUrl: 'https://buy.stripe.com/fZu5kD6SlfdA4eDanGgYU07' },
  // ── Post-Graduate ──
  { id: 'pg1', icon: '🏫', title: 'PGWP Only Package', desc: 'Dedicated Post-Graduate Work Permit application support for recent Canadian graduates.', price: '$249', time: '5–7 days', popular: false, category: 'Post-Graduate', stripeUrl: 'https://buy.stripe.com/4gMeVd0tX5D08uT3ZigYU08' },
  // ── PR & Immigration ──
  { id: 'pr1', icon: '🍁', title: 'PR Roadmap Package', desc: 'Personalised permanent residency pathway analysis — Express Entry, PNP and other streams.', price: '$449', time: '7–10 days', popular: false, category: 'PR & Immigration', stripeUrl: 'https://buy.stripe.com/8x2aEXccF9Tg3az3ZigYU09' },
  { id: 'pr2', icon: '🍁', title: 'Full PR Acceleration Package', desc: 'Complete PR application support from profile optimisation to ITA and full application submission.', price: '$799', time: '2–6 weeks', popular: true, category: 'PR & Immigration', stripeUrl: 'https://buy.stripe.com/8x2fZhb8B0iGfXl2VegYU0a' },
  // ── Settlement ──
  { id: 'st1', icon: '🏠', title: 'Arrival Essentials Package', desc: 'Pre-arrival checklist, SIN, banking, accommodation and first-week setup support.', price: '$199', time: '3–5 days', popular: false, category: 'Settlement', stripeUrl: 'https://buy.stripe.com/aFacN590t3uS7qPanGgYU0b' },
  { id: 'st2', icon: '🏠', title: 'Full Settlement Package', desc: 'Comprehensive settlement support: housing, healthcare, banking, schools and community resources.', price: '$449', time: '5–10 days', popular: false, category: 'Settlement', stripeUrl: 'https://buy.stripe.com/4gM00jdgJ3uScL92VegYU0c' },
  { id: 'st3', icon: '🏠', title: 'Premium Integration Package', desc: 'Full integration package with ongoing support, mentorship and community connections for 3 months.', price: '$699', time: 'Ongoing', popular: false, category: 'Settlement', stripeUrl: 'https://buy.stripe.com/aFaeVd90taXkaD11RagYU0d' },
  // ── Mentorship ──
  { id: 'me1', icon: '🤝', title: 'Monthly Mentorship', desc: 'Monthly 1-on-1 sessions with a dedicated consultant covering any immigration or settlement topic.', price: '$149/mo', time: 'Ongoing', popular: false, category: 'Mentorship', stripeUrl: 'https://buy.stripe.com/bJe6oH5Oh1mKfXlcvOgYU0e' },
  { id: 'me2', icon: '🤝', title: 'Quarterly Mentorship', desc: 'Three months of structured mentorship with weekly check-ins and priority support.', price: '$349', time: '3 months', popular: false, category: 'Mentorship', stripeUrl: 'https://buy.stripe.com/dRmeVd90t7L826v1RagYU0f' },
  { id: 'me3', icon: '🤝', title: 'Annual Mentorship', desc: 'Full year of dedicated mentorship — the complete guidance package for your Canadian journey.', price: '$849', time: '12 months', popular: false, category: 'Mentorship', stripeUrl: 'https://buy.stripe.com/7sY14nfoRghE4eD53mgYU0g' },
  // ── Credentials ──
  { id: 'cr1', icon: '📜', title: 'Credential Assessment Guided', desc: 'Guided support through your Educational Credential Assessment (ECA) application process.', price: '$179', time: '5–7 days', popular: false, category: 'Credentials', stripeUrl: 'https://buy.stripe.com/4gMbJ12C50iG8uT9jCgYU0h' },
  { id: 'cr2', icon: '📜', title: 'Credential Assessment Full + Appeal', desc: 'Full ECA support including appeals, re-evaluations and additional documentation preparation.', price: '$299', time: '7–14 days', popular: false, category: 'Credentials', stripeUrl: 'https://buy.stripe.com/00wcN55Oh7L85iH53mgYU0i' },
  // ── Career ──
  { id: 'ca1', icon: '💼', title: 'Resume & LinkedIn Glow-Up', desc: 'Canadian-standard resume rewrite and LinkedIn profile optimisation for the local job market.', price: '$99', time: '3–5 days', popular: false, category: 'Career', stripeUrl: 'https://buy.stripe.com/28E7sL5Ohd5s7qP67qgYU0j' },
  { id: 'ca2', icon: '💼', title: 'Job Search Mastery', desc: 'Job search strategy, application coaching, interview prep and networking guidance for Canada.', price: '$199', time: '1–2 weeks', popular: false, category: 'Career', stripeUrl: 'https://buy.stripe.com/00weVdfoR3uS12rfI0gYU0k' },
  { id: 'ca3', icon: '💼', title: 'Premium Placement Package', desc: 'End-to-end job placement support: resume, cover letters, applications, interviews and offer negotiation.', price: '$349', time: '2–4 weeks', popular: true, category: 'Career', stripeUrl: 'https://buy.stripe.com/5kQ6oH5Ohd5s3az9jCgYU0l' },
];

// ─── Escrow Approval Card ─────────────────────────────────────────────────────
function EscrowApprovalCard({ order }) {
  const [state, setState] = React.useState('review'); // review | approved | rejected
  const [rejectStep, setRejectStep] = React.useState(null); // null | choose | refund | reassign
  const [refundRequested, setRefundRequested] = React.useState(false);
  const [reassigned, setReassigned] = React.useState(false);

  if (state === 'approved') return (
    <div style={{ background: `${C.green}12`, border: `1px solid ${C.green}33`, borderRadius: '14px', padding: '20px' }}>
      <div style={{ fontWeight: 700, fontSize: '15px', color: C.green }}>✅ Payment released from escrow!</div>
      <div style={{ fontSize: '13px', color: C.textMuted, marginTop: '6px' }}>60% sent to your consultant · 40% to platform. Your order is complete.</div>
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
            Your consultant has completed the deliverable. Review the files, then approve to release payment — <strong style={{ color: C.cyan }}>60%</strong> goes to your consultant, <strong style={{ color: C.green }}>40%</strong> to the platform.
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
              ['3% processing fee (from consultant)', `-£${Math.round(parseInt(order.price.replace('£','')) * 0.03)}`],
              ['You receive', `£${Math.round(parseInt(order.price.replace('£','')) * 0.97)}`],
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
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState(null);

  // Keep Stripe instances in refs to avoid re-render timing issues
  const stripeRef = React.useRef(null);
  const cardElementRef = React.useRef(null);
  const mountDivRef = React.useRef(null);

  // Load Stripe.js eagerly on mount
  React.useEffect(() => {
    const pubKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!pubKey) return;
    const init = () => { stripeRef.current = window.Stripe(pubKey); };
    if (window.Stripe) { init(); return; }
    const s = document.createElement('script');
    s.src = 'https://js.stripe.com/v3/';
    s.async = true;
    s.onload = init;
    document.head.appendChild(s);
  }, []);

  const fetchCards = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/wallet/payment-methods');
      if (res.ok) { const d = await res.json(); setCards(d.cards ?? []); }
    } finally { setLoading(false); }
  };

  React.useEffect(() => { fetchCards(); }, []);

  // Mount card element after the form div renders — use a short delay so the
  // DOM is guaranteed to exist even if Stripe.js was still loading
  React.useEffect(() => {
    if (!addingCard) {
      if (cardElementRef.current) {
        try { cardElementRef.current.destroy(); } catch (_) {}
        cardElementRef.current = null;
      }
      return;
    }
    const mount = () => {
      if (!stripeRef.current || !mountDivRef.current) return;
      if (cardElementRef.current) { try { cardElementRef.current.destroy(); } catch (_) {} }
      const elements = stripeRef.current.elements({ appearance: { theme: 'stripe' } });
      const card = elements.create('card', {
        hidePostalCode: true,
        style: { base: { color: '#1F2937', fontFamily: 'inherit', fontSize: '15px', '::placeholder': { color: '#9CA3AF' } }, invalid: { color: '#EF4444' } },
      });
      card.mount(mountDivRef.current);
      cardElementRef.current = card;
    };
    // 100 ms gives React time to commit the div to the DOM
    const t = setTimeout(mount, 100);
    return () => clearTimeout(t);
  }, [addingCard]);

  const handleSave = async () => {
    if (!stripeRef.current || !cardElementRef.current) {
      setErrorMsg('Stripe is still loading — please try again in a moment.');
      return;
    }
    setSaving(true); setErrorMsg(null);
    try {
      const res = await fetch('/api/wallet/setup-intent', { method: 'POST' });
      const { clientSecret, error: apiErr } = await res.json();
      if (apiErr) throw new Error(apiErr);
      const { error: stripeErr } = await stripeRef.current.confirmCardSetup(clientSecret, {
        payment_method: { card: cardElementRef.current },
      });
      if (stripeErr) throw new Error(stripeErr.message);
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
        <Btn variant="secondary" size="sm" onClick={() => { setErrorMsg(null); setAddingCard(true); }}>+ Add new card</Btn>
      ) : (
        <div style={{ background: C.surface2, borderRadius: '14px', padding: '20px', border: `1px solid ${C.border2}` }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: C.textMuted, marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
            <span>Add payment method</span>
            <span style={{ background: '#635bff', color: '#fff', fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px' }}>powered by stripe</span>
          </div>
          {/* Stripe mounts its card input into this div */}
          <div
            ref={mountDivRef}
            style={{ padding: '12px 14px', background: '#fff', borderRadius: '10px', border: '1px solid #E5E7EB', minHeight: '44px', marginBottom: '16px' }}
          />
          <div style={{ fontSize: '12px', color: C.textDim, marginBottom: '16px' }}>
            🔒 Your card is encrypted and stored securely via Stripe. YouSafe never sees your full card number.
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <Btn variant="primary" size="sm" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save card securely'}</Btn>
            <Btn variant="ghost" size="sm" onClick={() => { setAddingCard(false); setErrorMsg(null); }}>Cancel</Btn>
          </div>
        </div>
      )}
    </Card>
  );
}

window.EscrowApprovalCard = EscrowApprovalCard;
window.StripePaymentSection = StripePaymentSection;

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
    const [payMethod, setPayMethod] = React.useState('stripe'); // 'stripe' | 'wallet'
    const [walletBalance, setWalletBalance] = React.useState(null);
    const [paying, setPaying] = React.useState(false);
    const [payError, setPayError] = React.useState(null);
    const categories = ['All', ...Array.from(new Set(SERVICES_CATALOG.map(s => s.category)))];
    const filtered = catFilter === 'All' ? SERVICES_CATALOG : SERVICES_CATALOG.filter(s => s.category === catFilter);

    // Fetch wallet balance when checkout opens
    React.useEffect(() => {
      if (!showCheckout) return;
      fetch('/api/wallet/balance')
        .then(r => r.json())
        .then(d => setWalletBalance(d.available?.usd ?? 0))
        .catch(() => setWalletBalance(0));
    }, [showCheckout]);

    if (showCheckout && cart) {
      const priceNum = parseInt(cart.price.replace(/[^0-9]/g, '')) || 0;
      const amountCents = priceNum * 100;
      const canUseWallet = walletBalance !== null && walletBalance >= priceNum;

      const handleWalletPay = async () => {
        setPaying(true); setPayError(null);
        try {
          const res = await fetch('/api/checkout/wallet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: cart.title, amountCents }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Payment failed');
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
                <div style={{ color: C.textMuted, fontSize: '13px', marginTop: '4px' }}>{cart.desc}</div>
                <div style={{ fontSize: '12px', color: C.textMuted, marginTop: '8px' }}>⏱ {cart.time}</div>
              </div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: C.cyan }}>{cart.price}</div>
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
                    {!canUseWallet && walletBalance !== null && <span style={{ color: '#EF4444', marginLeft: '6px' }}>— insufficient</span>}
                  </div>
                </div>
              </div>
              {payMethod === 'wallet' && <span style={{ color: C.cyan, fontWeight: 700 }}>✓</span>}
            </div>
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
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>Pay with Card</div>
                  <div style={{ fontSize: '12px', color: C.textMuted }}>Secure checkout via Stripe</div>
                </div>
              </div>
              {payMethod === 'stripe' && <span style={{ color: C.cyan, fontWeight: 700 }}>✓</span>}
            </div>
          </Card>
          {/* Order summary */}
          <Card style={{ marginBottom: '24px' }}>
            <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '14px' }}>Order summary</div>
            {[['Service', cart.title], ['Delivery', cart.time]].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${C.border}`, fontSize: '13px' }}>
                <span style={{ color: C.textMuted }}>{k}</span>
                <span style={{ fontWeight: 600 }}>{v}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', fontSize: '16px', fontWeight: 800 }}>
              <span>Total</span><span style={{ color: C.cyan }}>{cart.price}</span>
            </div>
          </Card>
          {payError && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '10px 14px', fontSize: '13px', color: '#EF4444', marginBottom: '14px' }}>⚠ {payError}</div>}
          {payMethod === 'wallet' ? (
            <Btn variant="primary" fullWidth size="lg" onClick={handleWalletPay} disabled={paying || !canUseWallet}>
              {paying ? 'Processing…' : `Pay ${cart.price} from Wallet`}
            </Btn>
          ) : (
            <Btn variant="primary" fullWidth size="lg" onClick={() => {
              const stripeUrl = userId ? `${cart.stripeUrl}?client_reference_id=${userId}` : cart.stripeUrl;
              window.open(stripeUrl, '_blank');
              setTimeout(() => { setShowCheckout(false); setCart(null); setOrderPlaced(true); setTimeout(() => setOrderPlaced(false), 6000); }, 500);
            }}>
              Pay {cart.price} — Checkout with Stripe →
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
          {filtered.map(s => (
            <Card key={s.id} hover style={{ display: 'flex', flexDirection: 'column', gap: '14px', position: 'relative' }}>
              {s.popular && <div style={{ position: 'absolute', top: '16px', right: '16px', background: C.cyan, color: '#000', fontSize: '10px', fontWeight: 800, padding: '2px 8px', borderRadius: '99px' }}>POPULAR</div>}
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <div style={{ fontSize: '28px' }}>{s.icon}</div>
                <Badge color="gray" style={{ fontSize: '11px', marginTop: '4px' }}>{s.category}</Badge>
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '6px' }}>{s.title}</div>
                <div style={{ color: C.textMuted, fontSize: '13px', lineHeight: 1.6 }}>{s.desc}</div>
              </div>
              <div style={{ fontSize: '12px', color: C.textDim }}>⏱ {s.time} · 🔒 Escrow protected</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                <span style={{ fontSize: '20px', fontWeight: 800, color: C.cyan }}>{s.price}</span>
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
    React.useEffect(() => {
      fetch('/api/wallet/balance')
        .then(r => r.json())
        .then(d => setWalletBal(d.available?.usd ?? 0))
        .catch(() => setWalletBal(0));
    }, []);
    return (
      <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Billing</h2>
        {/* Wallet balance */}
        <Card style={{ background: `linear-gradient(135deg, ${C.surface}, rgba(60,59,110,0.06))`, border: `1px solid rgba(60,59,110,0.18)` }}>
          <div style={{ fontSize: '12px', color: C.textMuted, marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Wallet Balance</div>
          <div style={{ fontSize: '36px', fontWeight: 800, color: C.text, lineHeight: 1 }}>
            {walletBal === null ? '—' : `$${walletBal.toFixed(2)}`}
          </div>
          <div style={{ fontSize: '12px', color: C.textMuted, marginTop: '6px' }}>Available to spend on services</div>
        </Card>
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
