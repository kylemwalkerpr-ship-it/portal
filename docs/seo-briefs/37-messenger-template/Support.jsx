/* ─────────────────────────────────────────────────────────────────────────
   Support + Admin — the third module of the messenger.

   ▸ SupportShell        — left rail when state.me.role === 'support'.
                           Lists every order with its underlying buyer
                           ↔ seller conversation. Filter by status.
   ▸ SupportConversation — center pane: full read-only view of the
                           buyer ↔ seller conversation, with a system-
                           message composer for support to inject
                           ("Reviewing your case…") and a CTA to raise a
                           refund/void ticket.
   ▸ RefundTicketModal   — modal: support files a ticket (kind, amount,
                           reason). Goes to PENDING; admin sees it.
   ▸ AdminTicketsShell   — left rail when role === 'admin'. Lists every
                           pending + decided ticket. Approve/Deny.
   ▸ TicketBubble        — message-bubble renderer for system-injected
                           ticket events shown inline in the conversation.

   The shapes here map 1:1 to the proposed `support_tickets` table
   (HANDOFF.md §11) and to the existing `chat_conversations` schema in
   the support-saas repo.
   ───────────────────────────────────────────────────────────────────── */

const TICKET_KINDS = [
  { id: 'void',           label: 'Void order (full refund)',    desc: 'Cancel the order and refund 100% from escrow to the buyer.' },
  { id: 'refund_partial', label: 'Partial refund',              desc: 'Refund a portion of escrow — typically a single milestone.' },
  { id: 'release_hold',   label: 'Release escrow early',        desc: 'Release the full balance to the seller before the 7-day clock.' },
  { id: 'other',          label: 'Other admin action',          desc: 'Anything that needs a superadmin\u2019s eye but isn\u2019t a refund.' },
];

const TICKET_STATUS_TONE = { pending: 'standard', approved: 'easy', denied: 'urgent', cancelled: 'neutral' };

function fmtMoneyCents(c) {
  if (c == null) return '—';
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(c / 100); }
  catch { return `$${(c / 100).toFixed(2)}`; }
}

/* ─────────────────────────────────────────────────────────────────────
   SUPPORT — left rail (replaces ChatList for support role)
   ─────────────────────────────────────────────────────────────────── */
function SupportShell({ onOpenSettings }) {
  const store = window.useStore();
  const { state, setUI } = store;
  const [filter, setFilter] = React.useState('all'); // 'all' | 'in_progress' | 'submitted' | 'flagged'

  /* For each order, find its DM conversation between buyer + seller. */
  const orders = React.useMemo(() => {
    return (state.orders || [])
      .map(o => {
        /* Support sees every order. Match the DM by either party id. */
        const conv = state.conversations.find(c =>
          c.type === 'dm' &&
          (c.counterpart_id === o.seller_id || c.counterpart_id === o.buyer_id)
        );
        const ticket = (state.tickets || []).find(t => t.order_id === o.id);
        return { ...o, conv, ticket };
      })
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  }, [state.orders, state.conversations, state.tickets]);

  const filtered = orders.filter(o => {
    if (filter === 'all') return true;
    if (filter === 'flagged')     return !!o.ticket;
    if (filter === 'in_progress') return o.status === 'in_progress' || o.status === 'submitted' || o.status === 'awaiting_buyer';
    if (filter === 'submitted')   return o.status === 'submitted';
    return true;
  });

  return (
    <aside className="cl sup-rail">
      <div className="cl-head">
        <div className="cl-title">
          <div className="cl-title-l">
            <div className="cl-avatar sup-avatar" title="Yousafe Support">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11a9 9 0 0 1 18 0v3a3 3 0 0 1-3 3h-2v-6h5"/><path d="M3 14v-3"/><path d="M3 11v3a3 3 0 0 0 3 3h2v-6"/></svg>
            </div>
            <div>
              <div className="cl-title-name">Support Console</div>
              <div className="cl-title-sub">Read-only oversight</div>
            </div>
          </div>
          <div className="cl-title-r">
            <button className="iconbtn" title="Settings" onClick={onOpenSettings}><Icons.Settings size={18}/></button>
          </div>
        </div>

        <div className="sup-stats">
          {(() => {
            const open = orders.filter(o => !['completed','released','cancelled','refunded'].includes(o.status)).length;
            const submitted = orders.filter(o => o.status === 'submitted').length;
            const flagged = orders.filter(o => o.ticket?.status === 'pending').length;
            return (
              <>
                <div className="sup-stat"><span className="sup-stat-num">{open}</span><span className="sup-stat-lbl">Active</span></div>
                <div className="sup-stat"><span className="sup-stat-num">{submitted}</span><span className="sup-stat-lbl">Delivered</span></div>
                <div className="sup-stat sup-stat-flag"><span className="sup-stat-num">{flagged}</span><span className="sup-stat-lbl">Flagged</span></div>
              </>
            );
          })()}
        </div>

        <div className="cl-filters">
          {[
            { id: 'all',         label: 'All orders' },
            { id: 'in_progress', label: 'In progress' },
            { id: 'submitted',   label: 'Delivered' },
            { id: 'flagged',     label: 'Flagged', count: orders.filter(o => o.ticket?.status === 'pending').length },
          ].map(f => (
            <button key={f.id} className={`cl-pill ${filter === f.id ? 'on' : ''}`} onClick={() => setFilter(f.id)}>
              {f.label}
              {f.count > 0 && <span className="cl-pill-count">{f.count}</span>}
            </button>
          ))}
        </div>

        <div className="mkt-live">
          <span className="mkt-live-dot"/>
          <span>Live · all orders + escrow</span>
        </div>
      </div>

      <div className="cl-scroll">
        {filtered.length === 0 && <div className="cl-empty">No orders match this filter.</div>}
        {filtered.map(o => <SupportOrderRow key={o.id} order={o} active={state.ui.active_id === (o.conv?.id || `sup_${o.id}`)} onOpen={() => setUI({ active_id: o.conv?.id || null, sup_focus_order: o.id })}/>)}
      </div>
    </aside>
  );
}

function SupportOrderRow({ order, active, onOpen }) {
  const store = window.useStore();
  const buyer = order.buyer_id === 'me' ? store.state.me : store.getPerson(order.buyer_id);
  const seller = store.getPerson(order.seller_id);
  const ticket = order.ticket;
  return (
    <button className={`sup-row ${active ? 'on' : ''}`} onClick={onOpen}>
      <div className="sup-row-pair">
        <div className="sup-row-avatars">
          <div className="row-avatar sup-row-av" style={{background: buyer?.avatar_color || '#3C3B6E'}}>{buyer?.initials || '?'}</div>
          <div className="row-avatar sup-row-av sup-row-av-2" style={{background: seller?.avatar_color || '#3C3B6E'}}>{seller?.initials || '?'}</div>
        </div>
        <div className="sup-row-meta">
          <div className="sup-row-pair-names">{buyer?.full_name?.split(' ')[0] || 'Buyer'} ↔ {seller?.full_name?.split(' ')[0] || 'Seller'}</div>
          <div className="sup-row-pair-when">{window.fmtRelative(order.updated_at)}</div>
        </div>
        <span className={`order-status order-${ticket?.status === 'pending' ? 'bad' : ['completed','released'].includes(order.status) ? 'good' : 'pending'}`}>
          {ticket?.status === 'pending' ? 'Ticket open' : order.status.replace('_', ' ')}
        </span>
      </div>
      <div className="sup-row-title">{order.title}</div>
      <div className="sup-row-foot">
        <span className="sup-row-id">#{order.id_short}</span>
        <span className="sup-row-money">{fmtMoneyCents(order.total_cents)}</span>
        {order.escrow_amount_cents > 0 && <span className="sup-row-escrow">{fmtMoneyCents(order.escrow_amount_cents)} held</span>}
      </div>
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   SUPPORT CONVERSATION — replaces ChatView for support role
   ─────────────────────────────────────────────────────────────────── */
function SupportConversationView({ onOpenTicketModal }) {
  const store = window.useStore();
  const { state, getConv, getMessages, getPerson } = store;
  const conv = state.ui.active_id ? getConv(state.ui.active_id) : null;

  if (!conv) return (
    <section className="cv cv-empty-full">
      <div className="cv-empty-art"><Icons.Document size={80} color="currentColor"/></div>
      <h2>Support Console</h2>
      <p>Select an order from the left to inspect the buyer ↔ seller conversation, drop a system note, or raise a refund ticket.</p>
    </section>
  );

  const order = (state.orders || []).find(o =>
    (o.buyer_id === 'me' && o.seller_id === conv.counterpart_id) ||
    o.participants?.includes(conv.counterpart_id)
  );

  /* Support sees both parties; derive from the linked order when present,
     otherwise fall back to me (buyer) ↔ counterpart (seller). */
  const buyer = order
    ? (order.buyer_id === 'me' ? state.me : getPerson(order.buyer_id))
    : state.me;
  const seller = order
    ? getPerson(order.seller_id)
    : getPerson(conv.counterpart_id);

  const messages = getMessages(conv.id);
  const ticket = (state.tickets || []).find(t => t.order_id === order?.id);

  return (
    <section className="cv">
      <header className="cv-head sup-head">
        <div className="cv-head-info" style={{cursor: 'default'}}>
          <div className="sup-head-pair">
            <div className="cv-head-avatar" style={{background: buyer?.avatar_color || '#3C3B6E', width: 36, height: 36, fontSize: 13}}>{buyer?.initials || '?'}</div>
            <div className="sup-head-link">↔</div>
            <div className="cv-head-avatar" style={{background: seller?.avatar_color || '#3C3B6E', width: 36, height: 36, fontSize: 13}}>{seller?.initials || '?'}</div>
          </div>
          <div className="cv-head-text">
            <div className="cv-head-name">
              {buyer?.full_name || 'Buyer'} <span className="sup-head-link-txt">×</span> {seller?.full_name || 'Seller'}
            </div>
            <div className="cv-head-status">
              {order ? `Order #${order.id_short} · ${order.title}` : 'Conversation'}
            </div>
          </div>
        </div>
        <div className="cv-head-actions">
          {order && (
            <button className="cv-head-offer-cta sup-head-cta" onClick={() => onOpenTicketModal(order, conv)}>
              <Icons.Block size={13}/> Raise refund ticket
            </button>
          )}
        </div>
      </header>

      <div className="sup-banner">
        <div className="sup-banner-l">
          <Icons.Block size={14}/>
          <span><b>Support read-only view.</b> You can only post system notes here. Neither party can see what you write privately.</span>
        </div>
        {ticket && (
          <div className={`sup-banner-ticket sup-banner-ticket-${TICKET_STATUS_TONE[ticket.status] || 'neutral'}`}>
            Ticket #{ticket.id.slice(-6)} · {ticket.status}
          </div>
        )}
      </div>

      <div className="cv-body">
        <div className="cv-scroll">
          {messages.length === 0 && <div className="cv-empty">No messages in this conversation yet.</div>}
          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const showDate = !prev || !window.sameDay(m.created_at, prev.created_at);
            return (
              <React.Fragment key={m.id}>
                {showDate && <div className="cv-divider"><span>{window.dateDivider(m.created_at)}</span></div>}
                <div data-mid={m.id}>
                  <window.MessageBubble
                    message={m}
                    prev={prev}
                    next={messages[i + 1]}
                    conv={conv}
                    onReply={() => {}}
                    onForward={() => {}}
                    onImageClick={() => {}}
                    onJumpTo={() => {}}
                  />
                </div>
              </React.Fragment>
            );
          })}
          <div style={{height: 10}}/>
        </div>
      </div>

      <SupportComposer conv={conv} order={order}/>
    </section>
  );
}

/* Support's composer can only inject SYSTEM notes (visible to both parties) */
function SupportComposer({ conv, order }) {
  const store = window.useStore();
  const [draft, setDraft] = React.useState('');
  const send = () => {
    const body = draft.trim();
    if (!body) return;
    store.sendSystemMessage(conv.id, `[Support] ${body}`);
    setDraft('');
  };

  return (
    <div className="comp sup-comp">
      <div className="comp-row sup-comp-row">
        <span className="sup-comp-tag">SYSTEM NOTE</span>
        <textarea
          className="comp-input sup-comp-input"
          placeholder="Drop a system note both parties will see (e.g. “We’re reviewing your dispute and will respond within 24h.”)"
          value={draft}
          rows={1}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
        />
        <button className="iconbtn comp-send" title="Post system note" onClick={send}><Icons.Send size={20} color="#fff"/></button>
      </div>
      <div className="sup-comp-hint">
        <Icons.Info size={11}/> Notes you post here are tagged <b>[Support]</b> in the chat and visible to both parties. For private notes use the ticket detail field.
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   REFUND TICKET MODAL — support raises a void/refund for admin review
   ─────────────────────────────────────────────────────────────────── */
function RefundTicketModal({ order, conv, onClose }) {
  const store = window.useStore();
  const [kind, setKind] = React.useState('void');
  const [amount, setAmount] = React.useState(String((order.escrow_amount_cents || 0) / 100));
  const [reason, setReason] = React.useState('');
  const [detail, setDetail] = React.useState('');
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (kind === 'void') setAmount(String((order.escrow_amount_cents || 0) / 100));
    if (kind === 'release_hold') setAmount(String((order.escrow_amount_cents || 0) / 100));
  }, [kind, order]);

  const submit = () => {
    setError(null);
    if (!reason.trim() || reason.trim().length < 8) return setError('Add a one-line reason (8+ characters).');
    const amountCents = Math.round(Number(amount) * 100);
    if (kind !== 'other' && (!Number.isFinite(amountCents) || amountCents <= 0)) return setError('Amount must be greater than $0.');
    store.createSupportTicket({
      order_id: order.id, order_id_short: order.id_short,
      conversation_id: conv?.id,
      kind, amount_cents: kind === 'other' ? null : amountCents,
      reason: reason.trim(), detail: detail.trim() || null,
    });
    onClose();
  };

  return (
    <div className="of-modal-backdrop" onClick={onClose}>
      <div className="of-modal sup-ticket-modal" onClick={e => e.stopPropagation()}>
        <div className="of-modal-head">
          <div className="of-modal-eyebrow"><Icons.Block size={11}/> Support · raise ticket for admin</div>
          <button className="iconbtn of-modal-close" onClick={onClose}><Icons.X size={18}/></button>
        </div>
        <h2 className="of-modal-title">Raise a ticket on order #{order.id_short}</h2>
        <p className="of-modal-sub">
          Goes to admin review. No funds move until a superadmin approves. The order's chat receives a system note when you submit and again when the decision lands.
        </p>

        <div className="of-modal-form of-modal-form-single sup-ticket-form">
          <div className="sup-ticket-order">
            <div className="sup-ticket-order-l">
              <div className="sup-ticket-order-title">{order.title}</div>
              <div className="sup-ticket-order-meta">
                #{order.id_short} · {order.status.replace('_', ' ')} · Escrow {fmtMoneyCents(order.escrow_amount_cents)}
              </div>
            </div>
            <div className="sup-ticket-order-r">{fmtMoneyCents(order.total_cents)}</div>
          </div>

          <div className="of-section">
            <div className="of-section-head">
              <span className="of-section-kicker">01</span>
              <span>Ticket type</span>
            </div>
            <div className="sup-ticket-kinds">
              {TICKET_KINDS.map(k => (
                <button key={k.id} type="button" className={`of-radio ${kind === k.id ? 'on' : ''}`} onClick={() => setKind(k.id)}>
                  <span className="of-radio-dot"/>
                  <span>
                    <b>{k.label}</b>
                    <span className="of-radio-sub">{k.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {kind !== 'other' && (
            <div className="of-section">
              <div className="of-section-head">
                <span className="of-section-kicker">02</span>
                <span>Amount</span>
              </div>
              <label className="of-field">
                <span className="of-label">USD</span>
                <div className="of-price-wrap">
                  <span>$</span>
                  <input className="of-input" value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" disabled={kind === 'void' || kind === 'release_hold'}/>
                </div>
                <span className="of-helper">
                  {kind === 'void' ? 'Full escrow balance — locked.' : kind === 'release_hold' ? 'Releases full balance to seller — locked.' : 'Partial refund amount (caps at escrow balance).'}
                </span>
              </label>
            </div>
          )}

          <div className="of-section">
            <div className="of-section-head">
              <span className="of-section-kicker">{kind === 'other' ? '02' : '03'}</span>
              <span>Reason &amp; admin notes</span>
            </div>
            <label className="of-field">
              <span className="of-label">One-line reason (visible to both parties)</span>
              <input className="of-input" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Duplicate charge — second of two consecutive accepts" maxLength={120}/>
            </label>
            <label className="of-field">
              <span className="of-label">Detail for admin <span className="of-label-opt">(private)</span></span>
              <textarea className="of-input of-textarea" value={detail} onChange={e => setDetail(e.target.value)} placeholder="Full timeline, links to evidence, Stripe charge IDs, etc. Only support + admin see this." rows={4} maxLength={2000}/>
            </label>
          </div>
        </div>

        {error && <div className="of-modal-error"><Icons.Block size={13}/> {error}</div>}

        <div className="of-modal-foot">
          <div className="of-modal-foot-note">
            <Icons.Block size={12}/>
            Pending → Admin queue → Approve = funds move via <code>escrow_system_v2</code> RPC.
          </div>
          <div className="of-modal-foot-actions">
            <button type="button" className="of-btn ghost" onClick={onClose}>Cancel</button>
            <button type="button" className="of-btn primary" onClick={submit}>
              <Icons.Send size={14}/> Raise ticket
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   ADMIN TICKETS SHELL — replaces ChatList when role === 'admin'
   ─────────────────────────────────────────────────────────────────── */
function AdminTicketsShell({ onOpenSettings }) {
  const store = window.useStore();
  const { state, setUI } = store;
  const [filter, setFilter] = React.useState('pending'); // 'pending' | 'all' | 'approved' | 'denied'

  const tickets = (state.tickets || []).filter(t => filter === 'all' ? true : t.status === filter)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const pendingCount = (state.tickets || []).filter(t => t.status === 'pending').length;

  return (
    <aside className="cl admin-rail">
      <div className="cl-head">
        <div className="cl-title">
          <div className="cl-title-l">
            <div className="cl-avatar admin-avatar" title="Yousafe Superadmin">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15 8.5 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 8.5 12 2"/></svg>
            </div>
            <div>
              <div className="cl-title-name">Admin Tickets</div>
              <div className="cl-title-sub">{pendingCount ? `${pendingCount} awaiting approval` : 'Inbox clear'}</div>
            </div>
          </div>
          <div className="cl-title-r">
            <button className="iconbtn" title="Settings" onClick={onOpenSettings}><Icons.Settings size={18}/></button>
          </div>
        </div>

        <div className="cl-filters">
          {[
            { id: 'pending',  label: 'Pending', count: pendingCount },
            { id: 'approved', label: 'Approved' },
            { id: 'denied',   label: 'Denied' },
            { id: 'all',      label: 'All' },
          ].map(f => (
            <button key={f.id} className={`cl-pill ${filter === f.id ? 'on' : ''}`} onClick={() => setFilter(f.id)}>
              {f.label}{f.count > 0 && <span className="cl-pill-count">{f.count}</span>}
            </button>
          ))}
        </div>
        <div className="mkt-live">
          <span className="mkt-live-dot"/>
          <span>Live · escrow control plane</span>
        </div>
      </div>

      <div className="cl-scroll">
        {tickets.length === 0 && <div className="cl-empty">No tickets here.</div>}
        {tickets.map(t => <AdminTicketRow key={t.id} ticket={t} active={state.ui.active_id === `tk_${t.id}`} onOpen={() => setUI({ active_id: `tk_${t.id}` })}/>)}
      </div>
    </aside>
  );
}

function AdminTicketRow({ ticket, active, onOpen }) {
  const store = window.useStore();
  const order = (store.state.orders || []).find(o => o.id === ticket.order_id);
  return (
    <button className={`sup-row ${active ? 'on' : ''}`} onClick={onOpen}>
      <div className="sup-row-pair">
        <div className="admin-row-icon">
          <Icons.Block size={18}/>
        </div>
        <div className="sup-row-meta">
          <div className="sup-row-pair-names">Ticket · {ticket.kind.replace('_', ' ')}</div>
          <div className="sup-row-pair-when">{window.fmtRelative(ticket.created_at)}</div>
        </div>
        <span className={`order-status order-${TICKET_STATUS_TONE[ticket.status] || 'neutral'}`}>{ticket.status}</span>
      </div>
      <div className="sup-row-title">{ticket.reason}</div>
      <div className="sup-row-foot">
        <span className="sup-row-id">#{ticket.order_id_short || (order?.id_short)}</span>
        {ticket.amount_cents && <span className="sup-row-money">{fmtMoneyCents(ticket.amount_cents)}</span>}
        <span className="sup-row-escrow">{order?.title?.slice(0, 36) || ''}</span>
      </div>
    </button>
  );
}

/* Admin's center pane: ticket detail + Approve/Deny */
function AdminTicketView() {
  const store = window.useStore();
  const { state } = store;
  const ticketId = state.ui.active_id?.startsWith('tk_') ? state.ui.active_id.slice(3) : null;
  const ticket = (state.tickets || []).find(t => t.id === ticketId);
  const [notes, setNotes] = React.useState('');

  if (!ticket) return (
    <section className="cv cv-empty-full">
      <div className="cv-empty-art"><Icons.Block size={80} color="currentColor"/></div>
      <h2>Admin · Ticket Review</h2>
      <p>Pick a ticket from the left to inspect support's reasoning, review the underlying conversation, and approve or deny the escrow change.</p>
    </section>
  );

  const order = (state.orders || []).find(o => o.id === ticket.order_id);
  const conv = (state.conversations || []).find(c => c.id === ticket.conversation_id);
  const buyer = order && (order.buyer_id === 'me' ? state.me : store.getPerson(order.buyer_id));
  const seller = order && store.getPerson(order.seller_id);
  const raiser = store.getPerson(ticket.raised_by);
  const decide = (decision) => {
    if (decision === 'denied' && !notes.trim()) {
      window.dispatchEvent(new CustomEvent('mc-toast', { detail: 'Add a note explaining the denial.' }));
      return;
    }
    store.decideTicket(ticket.id, decision, notes.trim() || null);
    setNotes('');
  };

  const messages = conv ? store.getMessages(conv.id) : [];

  return (
    <section className="cv admin-detail">
      <header className="cv-head sup-head">
        <div className="cv-head-info" style={{cursor: 'default'}}>
          <div className="cv-head-text">
            <div className="cv-head-name">Ticket #{ticket.id.slice(-6)} · {ticket.kind.replace('_', ' ')}</div>
            <div className="cv-head-status">Raised by {raiser?.full_name || 'Support'} · {window.fmtRelative(ticket.created_at)}</div>
          </div>
        </div>
        <div className="cv-head-actions">
          <span className={`order-status order-${TICKET_STATUS_TONE[ticket.status] || 'neutral'}`} style={{padding: '4px 12px'}}>{ticket.status}</span>
        </div>
      </header>

      <div className="admin-detail-body">
        <div className="admin-detail-left">
          <div className="admin-sec">
            <div className="admin-sec-h">Order</div>
            {order ? (
              <div className="admin-order">
                <div className="admin-order-t">{order.title}</div>
                <div className="admin-order-m">
                  #{order.id_short} · {order.status.replace('_', ' ')} · Total {fmtMoneyCents(order.total_cents)} · Escrow {fmtMoneyCents(order.escrow_amount_cents)}
                </div>
                <div className="admin-order-pair">
                  <span><b>Buyer:</b> {buyer?.full_name}</span>
                  <span><b>Seller:</b> {seller?.full_name}</span>
                </div>
              </div>
            ) : <div className="admin-order">Order not found.</div>}
          </div>

          <div className="admin-sec">
            <div className="admin-sec-h">Support's case</div>
            <div className="admin-case">
              <div className="admin-case-row"><span className="admin-case-l">Type</span><span className="admin-case-v">{ticket.kind.replace('_', ' ')}</span></div>
              {ticket.amount_cents != null && <div className="admin-case-row"><span className="admin-case-l">Amount</span><span className="admin-case-v">{fmtMoneyCents(ticket.amount_cents)}</span></div>}
              <div className="admin-case-row"><span className="admin-case-l">Reason</span><span className="admin-case-v">{ticket.reason}</span></div>
              {ticket.detail && (
                <div className="admin-case-detail">
                  <div className="admin-case-l" style={{marginBottom: 4}}>Private detail</div>
                  <p>{ticket.detail}</p>
                </div>
              )}
            </div>
          </div>

          {conv && messages.length > 0 && (
            <div className="admin-sec">
              <div className="admin-sec-h">Last 6 messages</div>
              <div className="admin-msgs">
                {messages.slice(-6).map(m => {
                  const sender = m.sender_id === 'me' ? store.state.me
                    : m.sender_id === 'system' ? { full_name: 'System', initials: '·', avatar_color: '#9097A8' }
                    : store.getPerson(m.sender_id);
                  return (
                    <div key={m.id} className="admin-msg">
                      <div className="row-avatar admin-msg-av" style={{background: sender?.avatar_color || '#9097A8'}}>{sender?.initials || '?'}</div>
                      <div className="admin-msg-body">
                        <div className="admin-msg-h"><b>{sender?.full_name || 'Member'}</b> · <span>{window.fmtRelative(m.created_at)}</span></div>
                        <div className="admin-msg-t">{m.body || `[${m.type}]`}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {ticket.status === 'pending' && (
          <aside className="admin-detail-right">
            <div className="admin-sec admin-action-card">
              <div className="admin-sec-h">Decision</div>
              <textarea
                className="of-input of-textarea"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Add a decision note (required for denials, optional for approvals). Visible to support, not to buyer or seller."
                rows={4}
                maxLength={500}/>
              <div className="admin-action-btns">
                <button type="button" className="of-btn primary" onClick={() => decide('approved')}>
                  <Icons.Check size={14}/> Approve
                </button>
                <button type="button" className="of-btn ghost danger" onClick={() => decide('denied')}>
                  <Icons.X size={14}/> Deny
                </button>
              </div>
              <p className="admin-action-warn">
                <Icons.Block size={12}/>
                Approving routes through <code>escrow_system_v2</code>. Funds move immediately. Both parties see a system notice.
              </p>
            </div>
          </aside>
        )}

        {ticket.status !== 'pending' && (
          <aside className="admin-detail-right">
            <div className="admin-sec">
              <div className="admin-sec-h">Decision</div>
              <div className={`admin-decided admin-decided-${TICKET_STATUS_TONE[ticket.status]}`}>
                <div><b>{ticket.status.toUpperCase()}</b></div>
                <div className="admin-decided-meta">By {ticket.decided_by} · {window.fmtRelative(ticket.decided_at)}</div>
                {ticket.decision_notes && <p>{ticket.decision_notes}</p>}
              </div>
            </div>
          </aside>
        )}
      </div>
    </section>
  );
}

/* Expose */
window.SupportShell             = SupportShell;
window.SupportConversationView  = SupportConversationView;
window.RefundTicketModal        = RefundTicketModal;
window.AdminTicketsShell        = AdminTicketsShell;
window.AdminTicketView          = AdminTicketView;
