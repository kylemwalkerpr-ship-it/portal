/* ─────────────────────────────────────────────────────────────────────────
   Store — single source of truth.
   ▸ State is hydrated from SEED_* on first boot, then persisted to
     localStorage on every change. This lets the prototype survive
     reloads and demonstrate end-to-end behaviour without a backend.
   ▸ Every mutation is a thin pure function that ALSO matches an API
     call Claude Code will make on the real backend. See HANDOFF.md for
     the endpoint mapping next to each action.
   ───────────────────────────────────────────────────────────────────── */

const STORAGE_KEY = 'mc_whatsapp_v6';
const PINNED_LIMIT = 3;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      /* Backfill keys that may be missing from older snapshots */
      if (!s.orders)    s.orders    = JSON.parse(JSON.stringify(window.SEED_ORDERS || []));
      if (!s.inquiries) s.inquiries = JSON.parse(JSON.stringify(window.SEED_INQUIRIES || []));
      if (!s.statuses)  s.statuses  = JSON.parse(JSON.stringify(window.SEED_STATUSES  || {}));
      if (!s.tickets)   s.tickets   = JSON.parse(JSON.stringify(window.SEED_TICKETS   || []));
      if (!s.ui.show_orders_pane)   s.ui.show_orders_pane   = false;
      if (!s.ui.marketplace_filter) s.ui.marketplace_filter = 'all';
      if (!s.ui.view)               s.ui.view               = 'chats';
      return s;
    }
  } catch (e) { /* ignore */ }
  return {
    me: window.SEED_USER,
    people: Object.fromEntries(window.SEED_PEOPLE.map(p => [p.id, p])),
    conversations: window.SEED_CONVERSATIONS.map(c => ({ ...c })),
    messages: JSON.parse(JSON.stringify(window.SEED_MESSAGES)),
    orders:    JSON.parse(JSON.stringify(window.SEED_ORDERS    || [])),
    inquiries: JSON.parse(JSON.stringify(window.SEED_INQUIRIES || [])),
    statuses:  JSON.parse(JSON.stringify(window.SEED_STATUSES  || {})),
    tickets:   JSON.parse(JSON.stringify(window.SEED_TICKETS   || [])),
    ui: {
      active_id: 'c_renu',
      filter: 'all',
      search: '',
      show_archived: false,
      show_starred: false,
      show_info_panel: false,
      show_orders_pane: false,
      show_settings: false,
      view: 'chats',         // 'chats' | 'marketplace' | 'support' | 'admin'
      marketplace_filter: 'all',
      theme: 'paper',
      accent: 'indigo',
      wallpaper: 'doodle',
      density: 'cozy',
      font_size: 14,
    },
  };
}

function saveState(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* quota */ }
}

/* ───────── React Context ───────── */
const StoreCtx = React.createContext(null);

function StoreProvider({ children }) {
  const [state, setState] = React.useState(loadState);
  /* persist after every change */
  React.useEffect(() => { saveState(state); }, [state]);

  /* Helpers that read but don't mutate */
  const getConv     = React.useCallback((id) => state.conversations.find(c => c.id === id) || null, [state.conversations]);
  const getPerson   = React.useCallback((id) => state.people[id] || null, [state.people]);
  const getMessages = React.useCallback((id) => state.messages[id] || [], [state.messages]);

  /* ───── Mutations ─────
     Each backed by a comment showing the real API call. */

  /* POST /api/messages/conversations/[id]   { body, attachments, reply_to_id }  */
  const sendMessage = React.useCallback((conversationId, partial) => {
    setState(s => {
      const id = `m_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
      const message = {
        id,
        conversation_id: conversationId,
        sender_id: 'me',
        type: partial.type || 'text',
        body: partial.body || null,
        attachment: partial.attachment || null,
        reply_to_id: partial.reply_to_id || null,
        forwarded_from: partial.forwarded_from || null,
        created_at: new Date().toISOString(),
        delivered_at: null,
        read_at: null,
        reactions: {},
        starred: [],
        deleted_for: [],
        status: 'sending',
      };
      const messages = { ...s.messages, [conversationId]: [...(s.messages[conversationId] || []), message] };
      const conversations = s.conversations.map(c => c.id === conversationId
        ? { ...c, last_message_id: id, last_message_at: message.created_at,
            last_message_snippet: snippetOf(message),
            last_message_from_me: true,
            archived_at: null /* sending un-archives */ }
        : c);
      return { ...s, messages, conversations };
    });
    /* Simulate the optimistic → delivered → read transition. */
    setTimeout(() => markStatus(conversationId, 'delivered'), 600);
    setTimeout(() => markStatus(conversationId, 'read'),     2400);
  }, []);

  const markStatus = React.useCallback((conversationId, status) => {
    setState(s => {
      const msgs = (s.messages[conversationId] || []).map(m =>
        m.sender_id === 'me' && m.status !== 'read'
          ? { ...m,
              status,
              delivered_at: status === 'delivered' || status === 'read' ? (m.delivered_at || new Date().toISOString()) : m.delivered_at,
              read_at:      status === 'read' ? (m.read_at || new Date().toISOString()) : m.read_at }
          : m);
      return { ...s, messages: { ...s.messages, [conversationId]: msgs } };
    });
  }, []);

  /* PATCH /api/messages/conversations/[id]  { read: true }   */
  const markRead = React.useCallback((conversationId) => {
    setState(s => {
      const msgs = (s.messages[conversationId] || []).map(m =>
        m.sender_id !== 'me' && m.sender_id !== 'system' && !m.read_at
          ? { ...m, read_at: new Date().toISOString() }
          : m);
      const conversations = s.conversations.map(c => c.id === conversationId ? { ...c, unread: 0 } : c);
      return { ...s, messages: { ...s.messages, [conversationId]: msgs }, conversations };
    });
  }, []);

  /* PATCH /api/messages/conversations/[id]  { pinned: true }  */
  const togglePin = React.useCallback((conversationId) => {
    setState(s => {
      const pinnedCount = s.conversations.filter(c => c.pinned_at).length;
      const conv = s.conversations.find(c => c.id === conversationId);
      const nextPin = !conv?.pinned_at;
      if (nextPin && pinnedCount >= PINNED_LIMIT) {
        alert(`You can pin up to ${PINNED_LIMIT} conversations. Unpin one first.`);
        return s;
      }
      const conversations = s.conversations.map(c => c.id === conversationId
        ? { ...c, pinned_at: nextPin ? new Date().toISOString() : null } : c);
      return { ...s, conversations };
    });
  }, []);

  /* PATCH /api/messages/conversations/[id]  { archived: true }  */
  const toggleArchive = React.useCallback((conversationId) => {
    setState(s => {
      const conversations = s.conversations.map(c => c.id === conversationId
        ? { ...c, archived_at: c.archived_at ? null : new Date().toISOString(), pinned_at: null }
        : c);
      const ui = (s.ui.active_id === conversationId)
        ? { ...s.ui, active_id: null }
        : s.ui;
      return { ...s, conversations, ui };
    });
  }, []);

  /* PATCH /api/messages/conversations/[id]  { muted_until: <iso|null> }  */
  const setMute = React.useCallback((conversationId, mutedUntil) => {
    setState(s => ({
      ...s,
      conversations: s.conversations.map(c => c.id === conversationId
        ? { ...c, muted_until: mutedUntil } : c),
    }));
  }, []);

  /* DELETE /api/messages/conversations/[id]   (deletes for me only) */
  const deleteConversation = React.useCallback((conversationId) => {
    if (!confirm('Delete this entire chat? Messages will be removed from your view. Your counterpart will keep their copy.')) return;
    setState(s => {
      const { [conversationId]: _, ...rest } = s.messages;
      return {
        ...s,
        messages: rest,
        conversations: s.conversations.filter(c => c.id !== conversationId),
        ui: s.ui.active_id === conversationId ? { ...s.ui, active_id: null } : s.ui,
      };
    });
  }, []);

  /* PATCH /api/messages/conversations/[id]/clear */
  const clearMessages = React.useCallback((conversationId) => {
    if (!confirm('Clear all messages in this chat? The conversation itself stays.')) return;
    setState(s => ({
      ...s,
      messages: { ...s.messages, [conversationId]: [] },
      conversations: s.conversations.map(c => c.id === conversationId
        ? { ...c, last_message_id: null, last_message_at: null, last_message_snippet: null, last_message_from_me: false, unread: 0 }
        : c),
    }));
  }, []);

  /* PATCH /api/messages/conversations/[id]  { blocked: true }  */
  const toggleBlock = React.useCallback((conversationId) => {
    setState(s => ({
      ...s,
      conversations: s.conversations.map(c => c.id === conversationId
        ? { ...c, blocked: !c.blocked } : c),
    }));
  }, []);

  /* POST /api/messages/conversations/[id]/messages/[mid]/react  { emoji } */
  const toggleReaction = React.useCallback((conversationId, messageId, emoji) => {
    setState(s => {
      const msgs = (s.messages[conversationId] || []).map(m => {
        if (m.id !== messageId) return m;
        const reactions = { ...(m.reactions || {}) };
        const list = reactions[emoji] || [];
        reactions[emoji] = list.includes('me') ? list.filter(u => u !== 'me') : [...list, 'me'];
        if (reactions[emoji].length === 0) delete reactions[emoji];
        return { ...m, reactions };
      });
      return { ...s, messages: { ...s.messages, [conversationId]: msgs } };
    });
  }, []);

  /* PATCH /api/messages/conversations/[id]/messages/[mid]  { starred: true } */
  const toggleStar = React.useCallback((conversationId, messageId) => {
    setState(s => {
      const msgs = (s.messages[conversationId] || []).map(m => {
        if (m.id !== messageId) return m;
        const starred = m.starred || [];
        return { ...m, starred: starred.includes('me') ? starred.filter(u => u !== 'me') : [...starred, 'me'] };
      });
      return { ...s, messages: { ...s.messages, [conversationId]: msgs } };
    });
  }, []);

  /* DELETE /api/messages/conversations/[id]/messages/[mid]  { scope: 'me'|'everyone' } */
  const deleteMessage = React.useCallback((conversationId, messageId, scope) => {
    setState(s => {
      const msgs = (s.messages[conversationId] || []).map(m => {
        if (m.id !== messageId) return m;
        if (scope === 'everyone') return { ...m, deleted_for: ['everyone'], body: null, attachment: null, type: 'text' };
        return { ...m, deleted_for: [...(m.deleted_for || []), 'me'] };
      });
      return { ...s, messages: { ...s.messages, [conversationId]: msgs } };
    });
  }, []);

  /* PATCH /api/messages/conversations/[id]/messages/[mid]  { body }  (within 15 min window) */
  const editMessage = React.useCallback((conversationId, messageId, newBody) => {
    setState(s => {
      const msgs = (s.messages[conversationId] || []).map(m =>
        m.id === messageId ? { ...m, body: newBody, edited_at: new Date().toISOString() } : m);
      return { ...s, messages: { ...s.messages, [conversationId]: msgs } };
    });
  }, []);

  /* POST /api/messages/forward   { source_message_id, target_conversation_ids[] } */
  const forwardMessage = React.useCallback((sourceMessage, targetConvIds) => {
    targetConvIds.forEach(cid => {
      sendMessage(cid, {
        type: sourceMessage.type,
        body: sourceMessage.body,
        attachment: sourceMessage.attachment,
        forwarded_from: { conversation_id: sourceMessage.conversation_id, message_id: sourceMessage.id },
      });
    });
  }, [sendMessage]);

  /* PATCH /api/offers/[id]/[accept|decline|withdraw] — also patches the
     embedded message attachment so the bubble reflects the new status. */
  const updateOffer = React.useCallback((conversationId, messageId, newStatus) => {
    setState(s => {
      const conv = s.conversations.find(c => c.id === conversationId);
      const msgs = (s.messages[conversationId] || []).map(m => {
        if (m.id !== messageId) return m;
        return { ...m, attachment: { ...(m.attachment || {}), status: newStatus } };
      });
      let orders = s.orders;
      if (newStatus === 'accepted') {
        const m = msgs.find(x => x.id === messageId);
        const o = m?.attachment;
        if (o && !s.orders.some(ord => ord.id === o.order_id)) {
          const orderId = o.order_id || `ord_${Date.now()}`;
          orders = [...s.orders, {
            id: orderId,
            id_short: orderId.toUpperCase().replace('ORD_', 'MC-'),
            title: o.title, currency: o.currency || 'USD',
            buyer_id: 'me', seller_id: conv?.counterpart_id,
            participants: ['me', conv?.counterpart_id].filter(Boolean),
            total_cents: o.price_cents, escrow_amount_cents: o.price_cents, escrow_status: 'held',
            status: 'in_progress',
            created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
            due_at: new Date(Date.now() + (o.delivery_days || 7) * 86_400_000).toISOString(),
            milestones: [{ title: o.title, amount_cents: o.price_cents, status: 'in_progress', due_at: new Date(Date.now() + (o.delivery_days || 7) * 86_400_000).toISOString() }],
          }];
        }
        /* simulate the payment clearing → flips offer to "paid" */
        setTimeout(() => {
          setState(ss => ({
            ...ss,
            messages: { ...ss.messages, [conversationId]: (ss.messages[conversationId] || []).map(m =>
              m.id === messageId ? { ...m, attachment: { ...m.attachment, status: 'paid' } } : m
            ) },
          }));
        }, 1600);
      }
      return { ...s, messages: { ...s.messages, [conversationId]: msgs }, orders };
    });
  }, []);

  /* PATCH /api/orders/[id]  { status } — escrow side-effects mirror the
     SQL trigger in escrow_system_v2.sql. */
  const updateOrder = React.useCallback((orderId, newStatus) => {
    setState(s => ({
      ...s,
      orders: s.orders.map(o => o.id === orderId ? {
        ...o,
        status: newStatus,
        escrow_status: newStatus === 'completed' ? 'released'
                     : newStatus === 'cancelled' ? 'refunded'
                     : o.escrow_status,
        escrow_amount_cents: newStatus === 'completed' ? 0 : o.escrow_amount_cents,
        updated_at: new Date().toISOString(),
      } : o),
    }));
  }, []);

  /* Drafts (client-only, no API) */
  const setDraft = React.useCallback((conversationId, draft) => {
    setState(s => ({
      ...s,
      conversations: s.conversations.map(c => c.id === conversationId ? { ...c, draft } : c),
    }));
  }, []);

  /* UI mutations */
  const setUI = React.useCallback((patch) => {
    setState(s => ({ ...s, ui: typeof patch === 'function' ? patch(s.ui) : { ...s.ui, ...patch } }));
  }, []);

  const setActive = React.useCallback((id) => {
    setUI({ active_id: id, show_info_panel: false });
    if (id) markRead(id);
  }, [setUI, markRead]);

  /* ─── INQUIRIES + STATUSES ────────────────────────────────────────
     Mirrors lib/intake-questions.ts + a new `inquiries` table on the
     server. Creating an inquiry:
     ▸ POST /api/inquiries           → returns inquiry row
     ▸ POST /api/statuses            → publishes a 24h status to followers
     ▸ Realtime fan-out via Supabase channel "marketplace:open" so every
       seller's MarketplaceFeed updates live.
     ───────────────────────────────────────────────────────────────── */

  /* POST /api/inquiries  { country, case_type, answers } */
  const createInquiry = React.useCallback((draft) => {
    const MAX_ACTIVE_STATUSES = 10;
    const id = `inq_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
    const country = window.INQUIRY_LOOKUP.country(draft.country);
    const caseType = window.INQUIRY_LOOKUP.caseType(draft.country, draft.case_type);
    const tier = window.INQUIRY_RECOMMEND_TIER(draft.answers || {});
    const nowIso = new Date().toISOString();
    const inquiry = {
      id,
      buyer_id: 'me',
      country: draft.country,
      country_label: country?.label,
      country_flag: country?.flag,
      case_type: draft.case_type,
      case_type_label: caseType?.label,
      case_type_icon: caseType?.icon,
      answers: draft.answers || {},
      urgency: draft.answers?.urgency,
      tier,
      headline: draft.headline || caseType?.label || 'New inquiry',
      summary: draft.summary || null,
      status: 'open',            // 'open' | 'claimed' | 'fulfilled' | 'closed'
      claimed_by: null,
      created_at: nowIso,
      updated_at: nowIso,
      expires_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
    };

    let rejected = false;
    setState(s => {
      const active = ((s.statuses?.['me']) || []).filter(st => new Date(st.expires_at).getTime() > Date.now());
      if (active.length >= MAX_ACTIVE_STATUSES) {
        rejected = true;
        return s;
      }
      const inquiries = [inquiry, ...(s.inquiries || [])];
      const statuses = { ...(s.statuses || {}) };
      statuses['me'] = [
        { id: `st_${id}`, kind: 'inquiry', inquiry_id: id,
          country_flag: country?.flag, case_type_label: caseType?.label,
          urgency: draft.answers?.urgency,
          created_at: nowIso,
          expires_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
          viewers: [] },
        ...(statuses['me'] || []),
      ];
      const me = { ...s.me, has_active_status: true };
      return { ...s, inquiries, statuses, me };
    });

    if (rejected) {
      window.dispatchEvent(new CustomEvent('mc-toast', { detail: `You can have up to ${MAX_ACTIVE_STATUSES} active inquiries. Wait for one to expire or close it first.` }));
      return null;
    }

    /* Broadcast for any live UI (realtime stand-in). */
    window.dispatchEvent(new CustomEvent('mc-inquiry-created', { detail: { inquiry } }));
    return inquiry;
  }, []);

  /* POST /api/inquiries/[id]/claim — seller claims, opens a conv */
  const claimInquiry = React.useCallback((inquiryId) => {
    let openedConvId = null;
    setState(s => {
      const inq = (s.inquiries || []).find(i => i.id === inquiryId);
      if (!inq) return s;

      /* Get-or-create DM with the buyer */
      let conv = s.conversations.find(c => c.type === 'dm' && c.counterpart_id === inq.buyer_id);
      if (!conv) {
        conv = {
          id: `c_inq_${inquiryId}`,
          type: 'dm',
          counterpart_id: inq.buyer_id,
          context_kind: 'inquiry',
          context_id: inquiryId,
          context_label: `Inquiry · ${inq.case_type_label}`,
          pinned_at: null, archived_at: null, muted_until: null,
          blocked: false, last_message_at: null, last_message_id: null,
          last_message_snippet: null, last_message_from_me: false,
          unread: 0,
        };
      } else {
        conv = { ...conv, context_kind: 'inquiry', context_id: inquiryId, context_label: `Inquiry · ${inq.case_type_label}`, archived_at: null };
      }
      openedConvId = conv.id;

      /* Inject a system message + the inquiry as a message */
      const sysId = `m_sys_${Date.now()}`;
      const inqMsgId = `m_inq_${Date.now()}`;
      const sysMsg = { id: sysId, conversation_id: conv.id, sender_id: 'system', type: 'system', body: `${s.me.full_name} replied to your inquiry`, created_at: new Date().toISOString() };
      const inqMsg = { id: inqMsgId, conversation_id: conv.id, sender_id: inq.buyer_id, type: 'inquiry', attachment: { kind: 'inquiry', inquiry_id: inq.id }, created_at: new Date().toISOString(), delivered_at: new Date().toISOString(), read_at: new Date().toISOString() };

      const existingMessages = s.messages[conv.id] || [];
      const messages = { ...s.messages, [conv.id]: [...existingMessages, sysMsg, inqMsg] };

      /* Update conv last-message */
      conv = { ...conv,
        last_message_id: inqMsgId,
        last_message_at: inqMsg.created_at,
        last_message_snippet: `📝 Inquiry · ${inq.case_type_label}`,
        last_message_from_me: false,
      };

      const conversations = s.conversations.find(c => c.id === conv.id)
        ? s.conversations.map(c => c.id === conv.id ? conv : c)
        : [conv, ...s.conversations];

      /* Mark inquiry as claimed */
      const inquiries = s.inquiries.map(i => i.id === inquiryId
        ? { ...i, status: 'claimed', claimed_by: s.me.id, updated_at: new Date().toISOString() }
        : i);

      return { ...s,
        conversations,
        messages,
        inquiries,
        ui: { ...s.ui, view: 'chats', active_id: conv.id },
      };
    });
    return openedConvId;
  }, []);

  const updateInquiryStatus = React.useCallback((inquiryId, status) => {
    setState(s => ({
      ...s,
      inquiries: (s.inquiries || []).map(i => i.id === inquiryId ? { ...i, status, updated_at: new Date().toISOString() } : i),
    }));
  }, []);

  /* POST /api/messages/conversations/[id]   { type: 'system', body }
     — used by support agents to inject a visible note into any conv. */
  const sendSystemMessage = React.useCallback((conversationId, body) => {
    if (!body || !conversationId) return;
    setState(s => {
      const id = `m_sys_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
      const message = {
        id, conversation_id: conversationId,
        sender_id: 'system', type: 'system',
        body, created_at: new Date().toISOString(),
      };
      const messages = { ...s.messages, [conversationId]: [...(s.messages[conversationId] || []), message] };
      const conversations = s.conversations.map(c => c.id === conversationId
        ? { ...c, last_message_id: id, last_message_at: message.created_at, last_message_snippet: body, last_message_from_me: false }
        : c);
      return { ...s, messages, conversations };
    });
  }, []);

  const markStatusViewed = React.useCallback((personId, statusId) => {
    setState(s => {
      const list = (s.statuses?.[personId] || []).map(st =>
        st.id === statusId && !st.viewers?.includes('me')
          ? { ...st, viewers: [...(st.viewers || []), 'me'] }
          : st);
      return { ...s, statuses: { ...s.statuses, [personId]: list } };
    });
  }, []);

  /* ─── SUPPORT TICKETS (void / refund) ─────────────────────────────
     Production:
     ▸ POST /api/support/tickets          (support agent creates)
     ▸ PATCH /api/admin/tickets/[id]      (admin approve/deny → triggers
                                           escrow refund or release via
                                           escrow_system_v2.sql RPCs)
     ───────────────────────────────────────────────────────────────── */
  const createSupportTicket = React.useCallback((draft) => {
    const id = `tk_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
    const ticket = {
      id,
      order_id: draft.order_id,
      conversation_id: draft.conversation_id || null,
      raised_by: 'me',                     // support agent
      kind: draft.kind || 'void',          // 'void' | 'refund_partial' | 'release_hold' | 'other'
      amount_cents: draft.amount_cents || null,
      reason: draft.reason || '',
      detail: draft.detail || '',
      status: 'pending',                   // 'pending' | 'approved' | 'denied' | 'cancelled'
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      decided_by: null,
      decided_at: null,
      decision_notes: null,
    };
    setState(s => ({ ...s, tickets: [ticket, ...(s.tickets || [])] }));

    /* Drop a SYSTEM message into the underlying conversation so both
       parties (and any future viewer) see support's intervention.
       Production: server-side trigger does this; the prototype mimics
       it client-side. */
    if (draft.conversation_id) {
      const sysId = `m_sys_tk_${Date.now()}`;
      const body = `Support has opened a ticket on this order (#${draft.order_id_short || draft.order_id}). Pending admin review.`;
      setState(s => ({
        ...s,
        messages: { ...s.messages, [draft.conversation_id]: [...(s.messages[draft.conversation_id] || []), {
          id: sysId, conversation_id: draft.conversation_id, sender_id: 'system', type: 'system', body,
          created_at: new Date().toISOString(),
        }]},
      }));
    }

    window.dispatchEvent(new CustomEvent('mc-toast', { detail: `Ticket raised · pending admin approval.` }));
    window.dispatchEvent(new CustomEvent('mc-ticket-created', { detail: { ticket } }));
    return ticket;
  }, []);

  const decideTicket = React.useCallback((ticketId, decision, notes) => {
    setState(s => {
      const ticket = (s.tickets || []).find(t => t.id === ticketId);
      if (!ticket) return s;
      const updated = { ...ticket, status: decision, decided_by: 'me', decided_at: new Date().toISOString(), decision_notes: notes || null };

      let nextOrders = s.orders;
      if (decision === 'approved' && ticket.kind === 'void') {
        nextOrders = s.orders.map(o => o.id === ticket.order_id
          ? { ...o, status: 'cancelled', escrow_status: 'refunded', escrow_amount_cents: 0, updated_at: new Date().toISOString() }
          : o);
      } else if (decision === 'approved' && ticket.kind === 'refund_partial' && ticket.amount_cents) {
        nextOrders = s.orders.map(o => o.id === ticket.order_id
          ? { ...o, escrow_amount_cents: Math.max(0, o.escrow_amount_cents - ticket.amount_cents), updated_at: new Date().toISOString() }
          : o);
      }

      /* Post a system message in the underlying conversation. */
      let nextMessages = s.messages;
      if (ticket.conversation_id) {
        const sysId = `m_sys_dec_${Date.now()}`;
        const body = decision === 'approved'
          ? `Admin approved support's ticket — ${ticket.kind === 'void' ? 'order voided and payment refunded' : 'partial refund processed'}.`
          : `Admin denied support's ticket. Order is unchanged.${notes ? ' Note: ' + notes : ''}`;
        nextMessages = { ...s.messages, [ticket.conversation_id]: [...(s.messages[ticket.conversation_id] || []), {
          id: sysId, conversation_id: ticket.conversation_id, sender_id: 'system', type: 'system', body,
          created_at: new Date().toISOString(),
        }]};
      }

      return {
        ...s,
        orders: nextOrders,
        messages: nextMessages,
        tickets: s.tickets.map(t => t.id === ticketId ? updated : t),
      };
    });
    window.dispatchEvent(new CustomEvent('mc-toast', { detail: `Ticket ${decision}.` }));
  }, []);

  /* Reset to seed (Tweaks) */
  const resetToSeed = React.useCallback(() => {
    if (!confirm('Reset all conversations to the demo seed? Your changes will be lost.')) return;
    localStorage.removeItem(STORAGE_KEY);
    setState(loadState());
  }, []);

  const api = React.useMemo(() => ({
    state,
    getConv, getPerson, getMessages,
    sendMessage, markRead,
    togglePin, toggleArchive, setMute, toggleBlock,
    deleteConversation, clearMessages,
    toggleReaction, toggleStar, deleteMessage, editMessage,
    forwardMessage,
    updateOffer, updateOrder,
    createInquiry, claimInquiry, updateInquiryStatus, markStatusViewed,
    createSupportTicket, decideTicket, sendSystemMessage,
    setDraft, setUI, setActive,
    resetToSeed,
  }), [state, getConv, getPerson, getMessages,
       sendMessage, markRead,
       togglePin, toggleArchive, setMute, toggleBlock,
       deleteConversation, clearMessages,
       toggleReaction, toggleStar, deleteMessage, editMessage,
       forwardMessage, updateOffer, updateOrder,
       createInquiry, claimInquiry, updateInquiryStatus, markStatusViewed,
       createSupportTicket, decideTicket, sendSystemMessage,
       setDraft, setUI, setActive, resetToSeed]);

  return React.createElement(StoreCtx.Provider, { value: api }, children);
}

function useStore() {
  const ctx = React.useContext(StoreCtx);
  if (!ctx) throw new Error('useStore must be inside StoreProvider');
  return ctx;
}

function snippetOf(m) {
  if (m.deleted_for?.includes('everyone')) return '🚫 This message was deleted';
  if (m.type === 'text')     return m.body || '';
  if (m.type === 'image')    return '📷 Photo';
  if (m.type === 'video')    return '🎥 Video';
  if (m.type === 'voice')    return '🎙 Voice message';
  if (m.type === 'document') return `📄 ${m.attachment?.file_name || 'Document'}`;
  if (m.type === 'location') return '📍 Location';
  if (m.type === 'contact')  return '👤 Contact';
  if (m.type === 'poll')     return '📊 Poll';
  if (m.type === 'offer')    return `💼 Custom offer · ${m.attachment?.title || ''}`;
  if (m.type === 'offer_request') return `📝 Request for offer · ${m.attachment?.title || ''}`;
  if (m.type === 'inquiry')  return `📝 Inquiry${m.attachment?.kind === 'inquiry' ? '' : ''}`;
  return '(message)';
}

window.StoreProvider = StoreProvider;
window.useStore = useStore;
