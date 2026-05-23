/* ─────────────────────────────────────────────────────────────────────────
   Marketplace primitives — offers + orders.

   ▸ OfferCard       — the offer message bubble (status pending/accepted/
                       paid/declined/expired/cancelled, accept/decline/
                       withdraw, expiry countdown).
   ▸ OfferComposer   — modal to create an offer (title, price, delivery,
                       revisions, expires, optional description and gig).
   ▸ OfferPayModal   — buyer-side payment confirmation (escrow notice).
   ▸ OrdersPane      — right slide-in showing all ongoing orders between
                       me and the active counterparty: milestones, escrow
                       state, due date, primary action.
   ───────────────────────────────────────────────────────────────────── */

/* ───────── Money / status helpers ───────── */
function fmtMoney(cents, currency = 'USD') {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100); }
  catch { return `$${(cents / 100).toFixed(2)}`; }
}

const OFFER_STATUS = {
  pending:   { label: 'Awaiting response', tone: 'pending' },
  accepted:  { label: 'Accepted · paying', tone: 'good' },
  paid:      { label: 'Paid · order open',  tone: 'good' },
  declined:  { label: 'Declined',           tone: 'bad' },
  expired:   { label: 'Expired',            tone: 'neutral' },
  cancelled: { label: 'Withdrawn',          tone: 'neutral' },
};

const ORDER_STATUS = {
  pending:           { label: 'Order opened',       tone: 'pending' },
  in_progress:       { label: 'In progress',        tone: 'pending' },
  awaiting_buyer:    { label: 'Awaiting your input',tone: 'pending' },
  submitted:         { label: 'Delivered — review', tone: 'pending' },
  revision_requested:{ label: 'Revision requested', tone: 'pending' },
  completed:         { label: 'Completed',          tone: 'good' },
  released:          { label: 'Released',           tone: 'good' },
  cancelled:         { label: 'Cancelled',          tone: 'bad' },
  refunded:          { label: 'Refunded',           tone: 'bad' },
  disputed:          { label: 'In dispute',         tone: 'bad' },
};

/* ───────── Offer expiry countdown ───────── */
function useTick(intervalMs = 30_000) {
  const [, set] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => set(t => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}

function OfferCountdown({ expiresAt }) {
  useTick(30_000);
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return <span className="of-countdown expired">Expired</span>;
  const days = Math.floor(diff / 86_400_000);
  const hrs  = Math.floor((diff % 86_400_000) / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  const label = days > 0 ? `${days}d ${hrs}h` : hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
  const urgent = diff < 3 * 86_400_000;
  return <span className={`of-countdown ${urgent ? 'urgent' : ''}`}>Expires in {label}</span>;
}

/* ───────── OfferCard (message bubble body) ───────── */
function OfferCard({ message, conv, mine }) {
  const store = window.useStore();
  const offer = message.attachment || message.offer || {};
  const status = offer.status || 'pending';
  const cfg = OFFER_STATUS[status] || OFFER_STATUS.pending;
  const currency = (offer.currency || 'USD').toUpperCase();
  const cents = offer.discount_cents ? offer.price_cents - offer.discount_cents : offer.price_cents;
  const isExpired = offer.expires_at && new Date(offer.expires_at).getTime() <= Date.now();
  const effectiveStatus = isExpired && status === 'pending' ? 'expired' : status;
  const effectiveCfg = OFFER_STATUS[effectiveStatus] || cfg;
  const viewerRole = mine ? 'seller' : 'buyer';

  const act = (newStatus) => {
    store.updateOffer(conv.id, message.id, newStatus);
  };

  return (
    <div className="of-card">
      <div className="of-stripe"/>
      <div className="of-head">
        <span className="of-eyebrow">Custom offer</span>
        <span className={`of-status of-${effectiveCfg.tone}`}>{effectiveCfg.label}</span>
      </div>

      <h4 className="of-title">{offer.title || 'Custom offer'}</h4>
      {offer.description && <p className="of-desc">{offer.description}</p>}

      <div className="of-price-row">
        <span className="of-price">{fmtMoney(cents, currency)}</span>
        {offer.discount_cents > 0 && (
          <>
            <span className="of-price-old">{fmtMoney(offer.price_cents, currency)}</span>
            <span className="of-discount-tag">−{fmtMoney(offer.discount_cents, currency)} OFF</span>
          </>
        )}
      </div>

      <div className="of-meta">
        <span><Icons.Clock size={13}/> {offer.delivery_days} day{offer.delivery_days === 1 ? '' : 's'} delivery</span>
        <span><Icons.Edit size={13}/> {offer.revisions >= 999 ? 'Unlimited revisions' : `${offer.revisions} revision${offer.revisions === 1 ? '' : 's'}`}</span>
        {offer.attachments?.length > 0 && <span><Icons.Paperclip size={13}/> {offer.attachments.length} file{offer.attachments.length === 1 ? '' : 's'}</span>}
      </div>

      {offer.expires_at && effectiveStatus === 'pending' && (
        <div className="of-expiry"><OfferCountdown expiresAt={offer.expires_at}/></div>
      )}

      {offer.linked_gig && (
        <a className="of-gig" href={`/marketplace/gigs/${offer.linked_gig.slug}`}>
          <Icons.Document size={12}/> {offer.linked_gig.title}
        </a>
      )}

      <div className="of-divider"/>

      <div className="of-actions">
        {effectiveStatus === 'pending' ? (
          viewerRole === 'buyer' ? (
            <>
              <button className="of-btn primary" onClick={() => act('accepted')}>Accept &amp; Pay</button>
              <button className="of-btn ghost"   onClick={() => act('declined')}>Decline</button>
            </>
          ) : (
            <button className="of-btn ghost full" onClick={() => act('cancelled')}>Withdraw offer</button>
          )
        ) : (
          <div className={`of-statemsg of-${effectiveCfg.tone}`}>{statusMessage(effectiveStatus)}</div>
        )}
      </div>
    </div>
  );
}

function statusMessage(s) {
  return {
    accepted:  'Payment processing — your order will open when the charge clears.',
    paid:      'Order open. Track milestones in the Orders pane →',
    declined:  'This offer was declined.',
    expired:   'This offer has expired. Ask the sender to renew.',
    cancelled: 'This offer was withdrawn.',
  }[s] || '';
}

/* ─────────────────────────────────────────────────────────────────────
   OfferComposer — role-aware modal.
   ▸ mode='send'    → seller (attorney / consultant) drafts a formal offer
                       with a live bubble preview, escrow breakdown,
                       optional gig template.
   ▸ mode='request' → buyer (student) sends a structured request — what
                       they need, budget range, deadline — for the seller
                       to respond with a formal offer.
   ─────────────────────────────────────────────────────────────────── */
function OfferComposer({ conv, mode = 'send', prefill, onClose }) {
  if (mode === 'request') {
    return <OfferRequestComposer conv={conv} onClose={onClose}/>;
  }
  return <OfferSendComposer conv={conv} prefill={prefill} onClose={onClose}/>;
}

/* ───── SELLER: create + send custom offer ───── */
function OfferSendComposer({ conv, prefill, onClose }) {
  const store = window.useStore();
  const counterpart = conv.type === 'dm' ? store.getPerson(conv.counterpart_id) : null;
  const buyerName = counterpart?.full_name?.split(' ')[0] || 'the buyer';

  /* Pull suggested title/description from prefill (inquiry or offer_request) */
  const initialTitle = prefill?.headline || prefill?.title || '';
  const initialDesc  = prefill?.summary || prefill?.description || '';
  const initialPrice = prefill?.tier?.price ? prefill.tier.price.replace(/[^\d]/g, '').slice(0, 3) : '';

  const [title, setTitle] = React.useState(initialTitle);
  const [description, setDescription] = React.useState(initialDesc);
  const [price, setPrice] = React.useState(initialPrice);
  const [delivery, setDelivery] = React.useState('7');
  const [revisions, setRevisions] = React.useState('2');
  const [unlimited, setUnlimited] = React.useState(false);
  const [expires, setExpires] = React.useState('7');
  const [template, setTemplate] = React.useState(null);
  const [error, setError] = React.useState(null);
  const titleRef = React.useRef(null);

  React.useEffect(() => { titleRef.current?.focus(); }, []);

  /* Pull templates from seed gigs (in production: /api/seller/gigs).
     Picking a template pre-fills the form. */
  const templates = React.useMemo(() => ([
    { id: 'g_i130',   title: 'I-130 evidence pack & cover memo', desc: 'Full evidence package, bona-fide declarations, and a cover memo. Three rounds of edits included.', price_cents: 68000, days: 10, revs: 3 },
    { id: 'g_s21',    title: 'Section 21 / s.8 defence response', desc: "Validity analysis of the served notice plus a defence response letter cited under the Renters Rights Act 2025.", price_cents: 12000, days: 4, revs: 1 },
    { id: 'g_1040nr', title: '1040-NR review & e-file',           desc: 'Treaty position, schedules, draft return — and signoff for e-file when you\'re ready.', price_cents: 18500, days: 5, revs: 2 },
    { id: 'g_pgwp',   title: 'PGWP eligibility opinion',          desc: 'Transcript review, written opinion, registrar request letter for the co-op exemption.', price_cents: 14000, days: 3, revs: 1 },
  ]), []);

  const pickTemplate = (t) => {
    setTemplate(t.id);
    setTitle(t.title);
    setDescription(t.desc);
    setPrice((t.price_cents / 100).toFixed(0));
    setDelivery(String(t.days));
    setRevisions(String(t.revs));
  };

  const priceNum = Number(price);
  const validPrice = Number.isFinite(priceNum) && priceNum > 0;
  const platformFee = validPrice ? Math.round(priceNum * 100 * 0.08) : 0;
  const sellerNet   = validPrice ? Math.round(priceNum * 100) - platformFee : 0;
  const dueDate = Number(delivery) >= 1
    ? new Date(Date.now() + Number(delivery) * 86_400_000)
    : null;

  const previewOffer = {
    kind: 'offer',
    title: title.trim() || 'Your offer title',
    description: description.trim() || null,
    price_cents: validPrice ? Math.round(priceNum * 100) : 0,
    currency: 'USD',
    delivery_days: Number(delivery) || 0,
    revisions: unlimited ? 999 : (Number(revisions) || 0),
    expires_at: new Date(Date.now() + (Number(expires) || 7) * 86_400_000).toISOString(),
    status: 'pending',
  };

  const send = () => {
    setError(null);
    if (!title.trim() || title.trim().length < 5) return setError('Add a short title (at least 5 characters).');
    if (!validPrice) return setError('Enter a price greater than $0.');
    const days = Number(delivery);
    if (!Number.isFinite(days) || days < 1) return setError('Delivery must be at least 1 day.');
    const exp = Number(expires);
    if (!Number.isFinite(exp) || exp < 1 || exp > 60) return setError('Expiry must be between 1 and 60 days.');
    const revsVal = unlimited ? 999 : Number(revisions);
    if (!Number.isFinite(revsVal) || revsVal < 0) return setError('Revisions must be 0 or more.');

    const scan = window.Safety.scanMessage(title + ' ' + description);
    if (!scan.ok) return setError("Offer text contains contact info that's not allowed off-platform. Edit and try again.");

    store.sendMessage(conv.id, {
      type: 'offer',
      attachment: { ...previewOffer, id: `of_${Date.now()}` },
    });
    onClose();
  };

  return (
    <div className="of-modal-backdrop" onClick={onClose}>
      <div className="of-modal of-modal-send" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="of-modal-head">
          <div className="of-modal-eyebrow"><Icons.Document size={11}/> Custom offer · Seller</div>
          <button className="iconbtn of-modal-close" onClick={onClose} aria-label="Close"><Icons.X size={18}/></button>
        </div>

        <h2 className="of-modal-title">Send a custom offer to {buyerName}</h2>
        <p className="of-modal-sub">
          Set scope, price and delivery — {buyerName} accepts and Yousafe holds payment in escrow until you mark the work complete.
        </p>

        <div className="of-modal-body">
          <div className="of-modal-form">
            <div className="of-section">
              <div className="of-section-head">
                <span className="of-section-kicker">01</span>
                <span>Start from a template</span>
                <span className="of-section-opt">Optional</span>
              </div>
              <div className="of-templates">
                {templates.map(t => (
                  <button key={t.id} type="button" className={`of-template ${template === t.id ? 'on' : ''}`} onClick={() => pickTemplate(t)}>
                    <div className="of-template-title">{t.title}</div>
                    <div className="of-template-meta">{fmtMoney(t.price_cents)} · {t.days}d · {t.revs} rev</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="of-section">
              <div className="of-section-head">
                <span className="of-section-kicker">02</span>
                <span>Scope</span>
              </div>
              <label className="of-field">
                <span className="of-label">Offer title</span>
                <input ref={titleRef} className="of-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. I-130 cover memo + checklist review" maxLength={120}/>
                <span className="of-helper">{title.length}/120 — keep it specific. {buyerName} sees this first.</span>
              </label>
              <label className="of-field">
                <span className="of-label">What's included <span className="of-label-opt">(recommended)</span></span>
                <textarea className="of-input of-textarea" value={description} onChange={e => setDescription(e.target.value)} placeholder="Spell out the deliverable, the file formats, and anything the buyer must provide. The clearer the scope, the fewer disputes." maxLength={1200} rows={4}/>
                <span className="of-helper">{description.length}/1200</span>
              </label>
            </div>

            <div className="of-section">
              <div className="of-section-head">
                <span className="of-section-kicker">03</span>
                <span>Pricing &amp; delivery</span>
              </div>
              <div className="of-grid3">
                <label className="of-field">
                  <span className="of-label">Price · USD</span>
                  <div className="of-price-wrap">
                    <span>$</span>
                    <input className="of-input" value={price} onChange={e => setPrice(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder="240"/>
                  </div>
                </label>
                <label className="of-field">
                  <span className="of-label">Delivery</span>
                  <div className="of-suffix-wrap">
                    <input className="of-input" value={delivery} onChange={e => setDelivery(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric"/>
                    <span>days</span>
                  </div>
                </label>
                <label className="of-field">
                  <span className="of-label">Offer expires</span>
                  <div className="of-suffix-wrap">
                    <input className="of-input" value={expires} onChange={e => setExpires(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric"/>
                    <span>days</span>
                  </div>
                </label>
              </div>
              <label className="of-field">
                <span className="of-label">Revisions included</span>
                <div className="of-suffix-wrap">
                  <input className="of-input" style={{maxWidth: 90}} value={unlimited ? '∞' : revisions} disabled={unlimited} onChange={e => setRevisions(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric"/>
                  <label className="of-toggle-inline">
                    <input type="checkbox" checked={unlimited} onChange={e => setUnlimited(e.target.checked)}/>
                    <span>Unlimited</span>
                  </label>
                </div>
              </label>
            </div>

            <div className="of-section">
              <div className="of-section-head">
                <span className="of-section-kicker">04</span>
                <span>Payout breakdown</span>
              </div>
              <div className="of-payout">
                <div className="of-payout-row">
                  <span>Buyer pays</span>
                  <span className="of-payout-amt">{validPrice ? fmtMoney(Math.round(priceNum * 100)) : '—'}</span>
                </div>
                <div className="of-payout-row of-payout-row-sub">
                  <span>Platform fee (8%)</span>
                  <span>{validPrice ? '−' + fmtMoney(platformFee) : '—'}</span>
                </div>
                <div className="of-payout-row of-payout-net">
                  <span>You receive</span>
                  <span className="of-payout-amt">{validPrice ? fmtMoney(sellerNet) : '—'}</span>
                </div>
                <div className="of-payout-note">
                  <Icons.Block size={12}/>
                  <span>
                    Funds are held in escrow at acceptance. They release to your account <b>7 days after delivery</b> unless {buyerName} requests a revision. Due {dueDate ? dueDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '—'}.
                  </span>
                </div>
              </div>
            </div>
          </div>

          <aside className="of-modal-preview">
            <div className="of-preview-label">
              <span className="of-preview-kicker">Live preview</span>
              <span>How {buyerName} sees it</span>
            </div>
            <div className="of-preview-stage">
              <div className="of-preview-bub">
                <div className="of-preview-author">{buyerName}'s view</div>
                <div className="bub type-offer" style={{maxWidth: 340, margin: 0}}>
                  <OfferCard message={{ id: '_preview', type: 'offer', attachment: previewOffer, sender_id: 'p_preview', conversation_id: conv.id }} conv={conv} mine={false}/>
                </div>
                <div className="of-preview-time">just now</div>
              </div>
            </div>
          </aside>
        </div>

        {error && <div className="of-modal-error"><Icons.Block size={13}/> {error}</div>}

        <div className="of-modal-foot">
          <div className="of-modal-foot-note">
            <Icons.Block size={12}/>
            Yousafe holds all payment in escrow. Off-platform requests are auto-blocked.
          </div>
          <div className="of-modal-foot-actions">
            <button type="button" className="of-btn ghost" onClick={onClose}>Cancel</button>
            <button type="button" className="of-btn primary" onClick={send}>
              <Icons.Send size={14}/> Send offer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───── BUYER: request a custom offer ───── */
function OfferRequestComposer({ conv, onClose }) {
  const store = window.useStore();
  const counterpart = conv.type === 'dm' ? store.getPerson(conv.counterpart_id) : null;
  const sellerName = counterpart?.full_name?.split(' ')[0] || 'the seller';
  const sellerRole = counterpart?.role === 'attorney' ? 'attorney' : counterpart?.role === 'consultant' ? 'consultant' : 'seller';

  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [budgetLow, setBudgetLow] = React.useState('');
  const [budgetHigh, setBudgetHigh] = React.useState('');
  const [openBudget, setOpenBudget] = React.useState(true);
  const [deadlineDays, setDeadlineDays] = React.useState('7');
  const [hasDeadline, setHasDeadline] = React.useState(true);
  const [error, setError] = React.useState(null);
  const titleRef = React.useRef(null);
  React.useEffect(() => { titleRef.current?.focus(); }, []);

  const examples = [
    'Review my I-130 evidence checklist',
    'Help me respond to a Section 21 notice',
    '1040-NR review with US-India treaty',
    'PGWP eligibility opinion · 3-year route',
  ];

  const send = () => {
    setError(null);
    if (!title.trim() || title.trim().length < 5) return setError('Add a short headline (at least 5 characters).');
    if (!description.trim() || description.trim().length < 20) return setError('Describe what you need — at least a couple of sentences.');
    const low  = openBudget ? null : (Number(budgetLow)  > 0 ? Math.round(Number(budgetLow)  * 100) : null);
    const high = openBudget ? null : (Number(budgetHigh) > 0 ? Math.round(Number(budgetHigh) * 100) : null);
    if (!openBudget && low === null && high === null) return setError('Add a budget range or set it to open.');

    const scan = window.Safety.scanMessage(title + ' ' + description);
    if (!scan.ok) return setError("Your request contains contact info that's not allowed off-platform. Edit and try again.");

    store.sendMessage(conv.id, {
      type: 'offer_request',
      attachment: {
        kind: 'offer_request',
        title: title.trim(),
        description: description.trim(),
        budget_low_cents:  low,
        budget_high_cents: high,
        budget_open: openBudget,
        deadline_at: hasDeadline && Number(deadlineDays) >= 1
          ? new Date(Date.now() + Number(deadlineDays) * 86_400_000).toISOString()
          : null,
        status: 'open',
      },
    });
    onClose();
  };

  return (
    <div className="of-modal-backdrop" onClick={onClose}>
      <div className="of-modal of-modal-request" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="of-modal-head">
          <div className="of-modal-eyebrow"><Icons.Document size={11}/> Custom offer · Buyer request</div>
          <button className="iconbtn of-modal-close" onClick={onClose} aria-label="Close"><Icons.X size={18}/></button>
        </div>

        <h2 className="of-modal-title">Ask {sellerName} for a custom offer</h2>
        <p className="of-modal-sub">
          Tell your {sellerRole} what you need. They'll reply with a formal offer — title, price, delivery — that you can accept right here in the chat. Nothing is charged until you tap <b>Accept &amp; Pay</b>.
        </p>

        <div className="of-modal-form of-modal-form-single">
          <div className="of-section">
            <div className="of-section-head">
              <span className="of-section-kicker">01</span>
              <span>Your request</span>
            </div>
            <label className="of-field">
              <span className="of-label">Headline</span>
              <input ref={titleRef} className="of-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Help me respond to a Section 21 notice" maxLength={120}/>
              <div className="of-examples">
                {examples.map(ex => (
                  <button key={ex} type="button" className="of-example-chip" onClick={() => setTitle(ex)}>{ex}</button>
                ))}
              </div>
            </label>
            <label className="of-field">
              <span className="of-label">Details</span>
              <textarea className="of-input of-textarea" value={description} onChange={e => setDescription(e.target.value)} placeholder={`Describe your situation. Include any deadlines, what you've already done, and any documents you can share. ${sellerName} sees this in the chat — keep contact details out, they're blocked anyway.`} maxLength={1500} rows={5}/>
              <span className="of-helper">{description.length}/1500 — more context = a more accurate offer.</span>
            </label>
          </div>

          <div className="of-section">
            <div className="of-section-head">
              <span className="of-section-kicker">02</span>
              <span>Your budget</span>
              <span className="of-section-opt">Optional</span>
            </div>
            <div className="of-budget-toggle">
              <button type="button" className={`of-radio ${openBudget ? 'on' : ''}`} onClick={() => setOpenBudget(true)}>
                <span className="of-radio-dot"/>
                <span>
                  <b>I'm open</b>
                  <span className="of-radio-sub">Let {sellerName} suggest a price</span>
                </span>
              </button>
              <button type="button" className={`of-radio ${!openBudget ? 'on' : ''}`} onClick={() => setOpenBudget(false)}>
                <span className="of-radio-dot"/>
                <span>
                  <b>I have a range</b>
                  <span className="of-radio-sub">Set a min / max in USD</span>
                </span>
              </button>
            </div>
            {!openBudget && (
              <div className="of-budget-range">
                <label className="of-field of-field-inline">
                  <span className="of-label">Min</span>
                  <div className="of-price-wrap">
                    <span>$</span>
                    <input className="of-input" value={budgetLow} onChange={e => setBudgetLow(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" placeholder="100"/>
                  </div>
                </label>
                <span className="of-budget-sep">to</span>
                <label className="of-field of-field-inline">
                  <span className="of-label">Max</span>
                  <div className="of-price-wrap">
                    <span>$</span>
                    <input className="of-input" value={budgetHigh} onChange={e => setBudgetHigh(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" placeholder="400"/>
                  </div>
                </label>
              </div>
            )}
          </div>

          <div className="of-section">
            <div className="of-section-head">
              <span className="of-section-kicker">03</span>
              <span>Timeline</span>
              <span className="of-section-opt">Optional</span>
            </div>
            <div className="of-budget-toggle">
              <button type="button" className={`of-radio ${hasDeadline ? 'on' : ''}`} onClick={() => setHasDeadline(true)}>
                <span className="of-radio-dot"/>
                <span><b>I need it by a date</b><span className="of-radio-sub">Pick a target turnaround</span></span>
              </button>
              <button type="button" className={`of-radio ${!hasDeadline ? 'on' : ''}`} onClick={() => setHasDeadline(false)}>
                <span className="of-radio-dot"/>
                <span><b>Flexible</b><span className="of-radio-sub">Whenever works</span></span>
              </button>
            </div>
            {hasDeadline && (
              <div className="of-deadline-presets">
                {[2, 5, 7, 14, 30].map(d => (
                  <button key={d} type="button" className={`of-preset ${deadlineDays === String(d) ? 'on' : ''}`} onClick={() => setDeadlineDays(String(d))}>
                    {d} days
                  </button>
                ))}
                <label className="of-field of-field-inline" style={{marginLeft: 'auto'}}>
                  <span className="of-label">Custom</span>
                  <div className="of-suffix-wrap">
                    <input className="of-input" style={{maxWidth: 70}} value={deadlineDays} onChange={e => setDeadlineDays(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric"/>
                    <span>days</span>
                  </div>
                </label>
              </div>
            )}
          </div>

          <div className="of-section of-next-section">
            <div className="of-next-head"><Icons.Info size={13}/> What happens next</div>
            <ol className="of-next-list">
              <li>{sellerName} reviews your request right inside this chat.</li>
              <li>They send back a formal offer with a fixed price, delivery date, and scope.</li>
              <li>You tap <b>Accept &amp; Pay</b> — Yousafe holds payment in escrow until you mark the work complete.</li>
            </ol>
          </div>
        </div>

        {error && <div className="of-modal-error"><Icons.Block size={13}/> {error}</div>}

        <div className="of-modal-foot">
          <div className="of-modal-foot-note">
            <Icons.Block size={12}/>
            Money-back guarantee. Off-platform requests are auto-blocked.
          </div>
          <div className="of-modal-foot-actions">
            <button type="button" className="of-btn ghost" onClick={onClose}>Cancel</button>
            <button type="button" className="of-btn primary" onClick={send}>
              <Icons.Send size={14}/> Send request
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───── Buyer-request card (rendered as a message bubble) ───── */
function OfferRequestCard({ message, conv, mine }) {
  const store = window.useStore();
  const a = message.attachment || {};
  const meIsSeller = ['attorney','consultant'].includes(store.state.me.role);
  const showSendButton = !mine && meIsSeller; /* I'm the seller, looking at the buyer's request */
  const status = a.status || 'open';

  let budgetStr = 'Open budget';
  if (!a.budget_open && (a.budget_low_cents || a.budget_high_cents)) {
    if (a.budget_low_cents && a.budget_high_cents)
      budgetStr = `${fmtMoney(a.budget_low_cents)} – ${fmtMoney(a.budget_high_cents)}`;
    else if (a.budget_high_cents)
      budgetStr = `Up to ${fmtMoney(a.budget_high_cents)}`;
    else
      budgetStr = `From ${fmtMoney(a.budget_low_cents)}`;
  }
  const deadlineStr = a.deadline_at
    ? `By ${new Date(a.deadline_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    : 'Flexible';

  return (
    <div className="of-req-card">
      <div className="of-stripe" style={{background: 'linear-gradient(90deg, #3C3B6E 0%, #5E5C9A 50%, #3C3B6E 100%)'}}/>
      <div className="of-head">
        <span className="of-eyebrow" style={{color: '#3C3B6E'}}>Request for offer</span>
        <span className={`of-status of-${status === 'open' ? 'pending' : status === 'fulfilled' ? 'good' : 'neutral'}`}>
          {status === 'open' ? 'Awaiting offer' : status === 'fulfilled' ? 'Offer sent' : status}
        </span>
      </div>
      <h4 className="of-title">{a.title || 'Custom request'}</h4>
      {a.description && <p className="of-desc" style={{WebkitLineClamp: 4}}>{a.description}</p>}
      <div className="of-req-meta">
        <div className="of-req-meta-row">
          <span className="of-req-meta-lbl">Budget</span>
          <span className="of-req-meta-val">{budgetStr}</span>
        </div>
        <div className="of-req-meta-row">
          <span className="of-req-meta-lbl">Timeline</span>
          <span className="of-req-meta-val">{deadlineStr}</span>
        </div>
      </div>
      {showSendButton && status === 'open' && (
        <div className="of-divider"/>
      )}
      {showSendButton && status === 'open' && (
        <div className="of-actions">
          <button className="of-btn primary" onClick={() => {
            /* mark request fulfilled then open the seller's send modal */
            store.setUI({}); /* noop trigger */
            const ev = new CustomEvent('mc-open-offer-composer', { detail: { conv_id: conv.id, prefill: a } });
            window.dispatchEvent(ev);
          }}><Icons.Send size={13}/> Send offer back</button>
          <button className="of-btn ghost" onClick={() => {
            window.dispatchEvent(new CustomEvent('mc-toast', { detail: `Replying to ${a.title}…` }));
          }}>Discuss first</button>
        </div>
      )}
      {!showSendButton && mine && status === 'open' && (
        <div className="of-statemsg of-pending" style={{margin: '0 16px 14px'}}>
          Waiting for {(store.getPerson(conv.counterpart_id)?.full_name || 'the seller').split(' ')[0]} to send a formal offer.
        </div>
      )}
    </div>
  );
}

/* ───────── Orders side pane ───────── */
function OrdersPane({ conv, counterpart, onClose }) {
  const store = window.useStore();
  const { state, getPerson } = store;
  /* All orders where the counterpart is involved with me */
  const cpId = conv?.counterpart_id;
  const orders = (state.orders || []).filter(o =>
    o.participants.includes(state.me.id) && (!cpId || o.participants.includes(cpId))
  ).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

  const active   = orders.filter(o => !['completed','released','cancelled','refunded'].includes(o.status));
  const finished = orders.filter(o =>  ['completed','released','cancelled','refunded'].includes(o.status));

  return (
    <aside className="info orders-pane">
      <div className="info-head">
        <button className="iconbtn" onClick={onClose}><Icons.X size={18}/></button>
        <span>Orders {counterpart ? `with ${counterpart.full_name.split(' ')[0]}` : ''}</span>
      </div>

      <div className="info-scroll">
        <div className="orders-summary">
          <div>
            <div className="orders-summary-num">{active.length}</div>
            <div className="orders-summary-lbl">Active</div>
          </div>
          <div>
            <div className="orders-summary-num">{fmtMoney(active.reduce((s,o) => s + o.escrow_amount_cents, 0))}</div>
            <div className="orders-summary-lbl">In escrow</div>
          </div>
          <div>
            <div className="orders-summary-num">{finished.length}</div>
            <div className="orders-summary-lbl">Completed</div>
          </div>
        </div>

        {orders.length === 0 && (
          <div className="info-empty" style={{padding: '50px 24px'}}>
            <Icons.Document size={32} color="var(--text-soft)" style={{margin: '0 auto 12px', opacity: 0.5}}/>
            No orders yet. Send a custom offer to open the first one.
          </div>
        )}

        {active.length > 0 && (
          <>
            <div className="orders-section-head">Active</div>
            {active.map(o => <OrderRow key={o.id} order={o} mine={o.seller_id === state.me.id ? false : true} store={store}/>)}
          </>
        )}

        {finished.length > 0 && (
          <>
            <div className="orders-section-head">History</div>
            {finished.map(o => <OrderRow key={o.id} order={o} mine={o.seller_id === state.me.id ? false : true} store={store}/>)}
          </>
        )}
      </div>
    </aside>
  );
}

/* ───────── Single order row inside the pane ───────── */
function OrderRow({ order, mine, store }) {
  const [open, setOpen] = React.useState(order.status === 'in_progress' || order.status === 'submitted' || order.status === 'awaiting_buyer');
  const cfg = ORDER_STATUS[order.status] || ORDER_STATUS.pending;
  const dueDate = order.due_at ? new Date(order.due_at) : null;
  const isLate  = dueDate && dueDate < new Date() && !['completed','released','cancelled','refunded'].includes(order.status);
  const buyerView = order.buyer_id === store.state.me.id;

  const advance = (next) => store.updateOrder(order.id, next);

  const milestones = order.milestones || [];
  const completedCount = milestones.filter(m => ['approved','released'].includes(m.status)).length;
  const pct = milestones.length > 0 ? Math.round((completedCount / milestones.length) * 100) : (order.status === 'completed' ? 100 : order.status === 'submitted' ? 80 : order.status === 'in_progress' ? 40 : 10);

  return (
    <div className={`order-row ${open ? 'open' : ''}`}>
      <button className="order-row-summary" onClick={() => setOpen(o => !o)}>
        <div className="order-row-l">
          <div className="order-row-title">{order.title}</div>
          <div className="order-row-meta">
            <span>#{order.id_short}</span>
            <span>·</span>
            <span>{fmtMoney(order.total_cents)}</span>
            {order.escrow_amount_cents > 0 && <>
              <span>·</span>
              <span className="order-escrow">{fmtMoney(order.escrow_amount_cents)} held</span>
            </>}
          </div>
        </div>
        <div className="order-row-r">
          <span className={`order-status order-${cfg.tone}`}>{cfg.label}</span>
          <Icons.ChevronDown size={14} style={{transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s'}}/>
        </div>
      </button>

      {open && (
        <div className="order-row-body">
          <div className="order-progress-row">
            <div className="order-progress-track"><div className="order-progress-fill" style={{width: pct + '%'}}/></div>
            <span className="order-progress-pct">{pct}%</span>
          </div>

          {dueDate && (
            <div className={`order-due ${isLate ? 'late' : ''}`}>
              <Icons.Clock size={12}/>
              {isLate ? 'Overdue · ' : 'Due '}
              {dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
          )}

          {milestones.length > 0 && (
            <div className="order-milestones">
              {milestones.map((m, i) => (
                <div key={i} className={`milestone milestone-${m.status}`}>
                  <span className={`milestone-dot milestone-${m.status}`}/>
                  <div className="milestone-body">
                    <div className="milestone-title">{m.title}</div>
                    <div className="milestone-meta">
                      {fmtMoney(m.amount_cents)}
                      {m.due_at && <> · due {new Date(m.due_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</>}
                      {m.status && <> · <span className={`milestone-status milestone-${m.status}`}>{m.status.replace('_', ' ')}</span></>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="order-actions">
            {/* Buyer actions */}
            {buyerView && order.status === 'submitted' && (
              <>
                <button className="of-btn primary small" onClick={() => advance('completed')}>Approve &amp; release</button>
                <button className="of-btn ghost  small" onClick={() => advance('revision_requested')}>Request revision</button>
              </>
            )}
            {buyerView && order.status === 'in_progress' && (
              <button className="of-btn ghost small" onClick={() => alert('Dispute filed (demo)')}>Open dispute</button>
            )}
            {/* Seller actions */}
            {!buyerView && (order.status === 'in_progress' || order.status === 'revision_requested') && (
              <>
                <button className="of-btn primary small" onClick={() => advance('submitted')}>Deliver work</button>
                <button className="of-btn ghost  small" onClick={() => alert('Scope-change request sent')}>Request scope change</button>
              </>
            )}
            <a className="order-link" href={`/orders/${order.id}`} target="_blank" rel="noreferrer">Open full order →</a>
          </div>
        </div>
      )}
    </div>
  );
}

window.OfferCard         = OfferCard;
window.OfferRequestCard  = OfferRequestCard;
window.OfferComposer     = OfferComposer;
window.OrdersPane        = OrdersPane;
