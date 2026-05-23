/* ─────────────────────────────────────────────────────────────────────────
   ChatView — the right pane.
   ▸ Header: avatar, name, online/typing/last-seen, search-in-chat,
     voice/video buttons, info toggle, more menu.
   ▸ Messages area: scrollable, date dividers, "↓ new message" pill on
     unread incoming, smooth bottom-pinning when sending, jump-to on
     reply-quote click.
   ▸ Composer at the bottom.
   ▸ Right-side Info panel (slide-in) with profile, media gallery,
     starred messages, mute/block, group members.
   ───────────────────────────────────────────────────────────────────── */

function ChatView({ onForwardMessage, onOpenImageViewer, onOpenStatus }) {
  const store = window.useStore();
  const { state, getConv, getPerson, getMessages, markRead } = store;
  const active = state.ui.active_id ? getConv(state.ui.active_id) : null;

  if (!active) return <EmptyChatView/>;

  const counterpart = active.type === 'dm' ? getPerson(active.counterpart_id) : null;
  const messages = getMessages(active.id);
  const [replyingTo, setReplyingTo] = React.useState(null);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searchQ, setSearchQ] = React.useState('');
  const [moreOpen, setMoreOpen] = React.useState(false);

  const scrollerRef = React.useRef(null);
  const nearBottomRef = React.useRef(true);
  const [newMsgPill, setNewMsgPill] = React.useState(false);
  const lastCountRef = React.useRef(messages.length);

  /* Cancel reply / search on chat switch */
  React.useEffect(() => {
    setReplyingTo(null);
    setSearchOpen(false);
    setSearchQ('');
    /* jump to bottom on activation */
    requestAnimationFrame(() => {
      const el = scrollerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
      nearBottomRef.current = true;
    });
    lastCountRef.current = messages.length;
  }, [active.id]);

  /* Auto-scroll on new messages */
  React.useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    if (messages.length > lastCountRef.current) {
      if (nearBottomRef.current) {
        el.scrollTop = el.scrollHeight;
      } else {
        const last = messages[messages.length - 1];
        if (last && last.sender_id !== state.me.id) setNewMsgPill(true);
      }
    }
    lastCountRef.current = messages.length;
  }, [messages.length, state.me.id]);

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    nearBottomRef.current = dist < 80;
    if (nearBottomRef.current) setNewMsgPill(false);
  };

  const scrollToBottom = () => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    setNewMsgPill(false);
  };

  const jumpTo = (messageId) => {
    const el = document.querySelector(`[data-mid="${messageId}"]`);
    if (el && scrollerRef.current) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('highlight');
      setTimeout(() => el.classList.remove('highlight'), 1400);
    }
  };

  /* Filter visible messages by search */
  const visible = React.useMemo(() => {
    if (!searchQ.trim()) return messages;
    const q = searchQ.toLowerCase();
    return messages.filter(m =>
      (m.body || '').toLowerCase().includes(q) ||
      (m.attachment?.file_name || '').toLowerCase().includes(q),
    );
  }, [messages, searchQ]);

  const handleForward = (m) => onForwardMessage?.(m);

  return (
    <section className="cv">
      <ChatHeader
        conv={active}
        counterpart={counterpart}
        searchOpen={searchOpen}
        searchQ={searchQ}
        onSearchOpen={() => setSearchOpen(true)}
        onSearchClose={() => { setSearchOpen(false); setSearchQ(''); }}
        onSearchChange={setSearchQ}
        moreOpen={moreOpen}
        onMoreOpen={() => setMoreOpen(true)}
        onMoreClose={() => setMoreOpen(false)}
        onOpenInfo={() => store.setUI({ show_info_panel: !state.ui.show_info_panel })}
        onOpenStatus={onOpenStatus}
        store={store}
      />

      <div className="cv-body">
        <div className="cv-scroll" ref={scrollerRef} onScroll={onScroll}>
          <div className="cv-encrypted">
            <Icons.Block size={11} color="currentColor"/>
            <span><b>Yousafe-protected.</b> Payments are held in escrow until delivery. Keep contact details and payment on-platform — off-platform requests are blocked.</span>
          </div>

          {visible.length === 0 && searchQ && (
            <div className="cv-empty">No messages match <b>“{searchQ}”</b>.</div>
          )}

          {visible.map((m, i) => {
            const prev = visible[i - 1];
            const next = visible[i + 1];
            const showDate = !prev || !window.sameDay(m.created_at, prev.created_at);
            return (
              <React.Fragment key={m.id}>
                {showDate && (
                  <div className="cv-divider"><span>{window.dateDivider(m.created_at)}</span></div>
                )}
                <div data-mid={m.id}>
                  <window.MessageBubble
                    message={m}
                    prev={prev}
                    next={next}
                    conv={active}
                    onReply={setReplyingTo}
                    onForward={handleForward}
                    onImageClick={onOpenImageViewer}
                    onJumpTo={jumpTo}
                  />
                </div>
              </React.Fragment>
            );
          })}

          {/* counterpart typing */}
          {messages.some(m => m._typing) && (
            <div className="cv-typing-bubble">
              <span className="dot"/><span className="dot"/><span className="dot"/>
            </div>
          )}

          <div style={{height: 10}}/>
        </div>

        {newMsgPill && (
          <button className="cv-newpill" onClick={scrollToBottom}>
            <Icons.ChevronDown size={14}/> New messages
          </button>
        )}
      </div>

      <window.Composer
        conv={active}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
      />

      {state.ui.show_info_panel && (
        <InfoPanel conv={active} counterpart={counterpart} store={store} onClose={() => store.setUI({ show_info_panel: false })}/>
      )}
      {state.ui.show_orders_pane && (
        <window.OrdersPane conv={active} counterpart={counterpart} onClose={() => store.setUI({ show_orders_pane: false })}/>
      )}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
function ChatHeader({ conv, counterpart, searchOpen, searchQ, onSearchOpen, onSearchClose, onSearchChange, moreOpen, onMoreOpen, onMoreClose, onOpenInfo, onOpenStatus, store }) {
  const muted = window.isMuted(conv);
  const name = conv.type === 'group' ? conv.name : (counterpart?.full_name || 'Conversation');
  const initials = conv.type === 'group' ? (conv.initials || 'G') : (counterpart?.initials || '?');
  const avatarBg = conv.type === 'group' ? (conv.avatar_color || '#3C3B6E') : (counterpart?.avatar_color || '#3C3B6E');

  /* Status line: typing > online > last seen > group members */
  const msgs = store.getMessages(conv.id);
  const isTyping = msgs.some(m => m._typing);
  let status;
  if (conv.type === 'group') status = conv.subtitle || 'Tap for group info';
  else if (isTyping)         status = 'typing…';
  else if (counterpart)      status = window.lastSeenString(counterpart, conv);

  React.useEffect(() => {
    if (!moreOpen) return;
    const onDoc = (e) => { if (!e.target.closest?.('[data-headmore]')) onMoreClose(); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [moreOpen, onMoreClose]);

  if (searchOpen) {
    return (
      <header className="cv-head search">
        <button className="iconbtn" onClick={onSearchClose}><Icons.ChevronLeft size={20}/></button>
        <div className="cv-head-search">
          <Icons.Search size={16}/>
          <input autoFocus value={searchQ} onChange={e => onSearchChange(e.target.value)} placeholder={`Search in chat with ${name}`}/>
          {searchQ && <button className="iconbtn" onClick={() => onSearchChange('')}><Icons.X size={14}/></button>}
        </div>
      </header>
    );
  }

  return (
    <header className="cv-head">
      <button className="cv-head-info" onClick={onOpenInfo}>
        {conv.type === 'dm' && counterpart
          ? <window.InquiryStatusRing personId={counterpart.id} size={42} onClick={(pid) => { onOpenStatus?.(pid); }}>
              <div className="cv-head-avatar" style={{background: avatarBg}}>
                {initials}
                {counterpart?.online && <span className="row-online"/>}
              </div>
            </window.InquiryStatusRing>
          : <div className="cv-head-avatar" style={{background: avatarBg}}>
              {initials}
              {counterpart?.online && <span className="row-online"/>}
            </div>}
        <div className="cv-head-text">
          <div className="cv-head-name">
            {name}
            {counterpart?.verified && <Icons.Verified size={14} color="#2A6FDB" style={{verticalAlign:'-2px', marginLeft:4}}/>}
            {muted && <Icons.BellOff size={13} color="currentColor" style={{opacity:.45, marginLeft:6, verticalAlign:'-1px'}}/>}
          </div>
          <div className="cv-head-status">{status}</div>
        </div>
      </button>

      {conv.context_label && (
        <a className="cv-head-ctx" href="#" title={conv.context_label}>
          {conv.context_label}
        </a>
      )}

      {(() => {
        const meIsSeller = ['attorney','consultant'].includes(store.state.me.role);
        const cpIsBuyer  = counterpart && !['attorney','consultant'].includes(counterpart.role);
        if (!meIsSeller || !cpIsBuyer || conv.type !== 'dm') return null;
        return (
          <button className="cv-head-offer-cta" title="Send a custom offer to this buyer" onClick={() => window.dispatchEvent(new CustomEvent('mc-open-offer-composer', { detail: { conv_id: conv.id } }))}>
            <Icons.Send size={13}/> Send offer
          </button>
        );
      })()}

      <div className="cv-head-actions">
        <button className="iconbtn" title="Orders with this contact" onClick={() => store.setUI({ show_orders_pane: !store.state.ui.show_orders_pane, show_info_panel: false })}>
          <Icons.Document size={18}/>
          {(() => {
            const cpId = conv.type === 'dm' ? conv.counterpart_id : null;
            const activeCount = (store.state.orders || []).filter(o => o.participants.includes('me') && (!cpId || o.participants.includes(cpId)) && !['completed','released','cancelled','refunded'].includes(o.status)).length;
            return activeCount > 0 ? <span className="iconbtn-badge">{activeCount}</span> : null;
          })()}
        </button>
        <button className="iconbtn" title="Voice call"><Icons.Phone size={18}/></button>
        <button className="iconbtn" title="Video call"><Icons.Video size={18}/></button>
        <button className="iconbtn" title="Search in chat" onClick={onSearchOpen}><Icons.Search size={18}/></button>
        <button className="iconbtn" data-headmore onClick={onMoreOpen}><Icons.More size={18}/></button>
        {moreOpen && (
          <div data-headmore className="ctxmenu" style={{ position: 'absolute', right: 14, top: 56 }}>
            <button className="ctxmenu-item" onClick={() => { onOpenInfo(); onMoreClose(); }}>
              <Icons.Info size={16}/> Contact info
            </button>
            <button className="ctxmenu-item" onClick={() => { store.markRead(conv.id); onMoreClose(); }}>
              <Icons.Check size={16}/> Mark as read
            </button>
            <button className="ctxmenu-item" onClick={() => { store.togglePin(conv.id); onMoreClose(); }}>
              <Icons.Pin size={16}/> {conv.pinned_at ? 'Unpin chat' : 'Pin chat'}
            </button>
            <button className="ctxmenu-item" onClick={() => {
              const mins = prompt('Mute for how many hours? (blank = forever)', '8');
              if (mins === null) return;
              const m = mins.trim() === '' ? 0 : parseFloat(mins);
              const until = m ? new Date(Date.now() + m * 3600_000).toISOString() : new Date(Date.now() + 100 * 365 * 86400_000).toISOString();
              store.setMute(conv.id, until); onMoreClose();
            }}>
              <Icons.BellOff size={16}/> Mute notifications
            </button>
            <button className="ctxmenu-item" onClick={() => { store.toggleArchive(conv.id); onMoreClose(); }}>
              <Icons.Archive size={16}/> {conv.archived_at ? 'Unarchive' : 'Archive chat'}
            </button>
            <div className="ctxmenu-sep"/>
            <button className="ctxmenu-item" onClick={() => { store.clearMessages(conv.id); onMoreClose(); }}>
              <Icons.Edit size={16}/> Clear messages
            </button>
            {conv.type === 'dm' && (
              <button className="ctxmenu-item danger" onClick={() => { store.toggleBlock(conv.id); onMoreClose(); }}>
                <Icons.Block size={16}/> {conv.blocked ? 'Unblock' : 'Block'}
              </button>
            )}
            <button className="ctxmenu-item danger" onClick={() => { store.deleteConversation(conv.id); onMoreClose(); }}>
              <Icons.Trash size={16}/> Delete chat
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
function EmptyChatView() {
  return (
    <section className="cv cv-empty-full">
      <div className="cv-empty-art">
        <Icons.Chats size={80} color="currentColor"/>
      </div>
      <h2>MyCaseworks Messaging</h2>
      <p>Pick a conversation from the left, or start a new one. Files are end-to-end encrypted and scanned for malware.</p>
      <p className="cv-empty-note">Tip: Long-press or right-click any message for the full action menu — reply, react, forward, star, edit, delete.</p>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
function InfoPanel({ conv, counterpart, store, onClose }) {
  const [tab, setTab] = React.useState('media');   // 'media' | 'starred' | 'docs'
  const msgs = store.getMessages(conv.id);
  const media = msgs.filter(m => (m.type === 'image' || m.type === 'video') && !m.deleted_for?.includes('everyone'));
  const docs  = msgs.filter(m => m.type === 'document');
  const links = msgs.filter(m => m.type === 'text' && /(https?:\/\/[^\s]+)/.test(m.body || ''));
  const starred = msgs.filter(m => m.starred?.includes(store.state.me.id));
  const muted = window.isMuted(conv);

  return (
    <aside className="info">
      <div className="info-head">
        <button className="iconbtn" onClick={onClose}><Icons.X size={18}/></button>
        <span>{conv.type === 'group' ? 'Group info' : 'Contact info'}</span>
      </div>
      <div className="info-scroll">
        <div className="info-hero">
          <div className="info-avatar" style={{background: conv.type === 'group' ? conv.avatar_color : counterpart?.avatar_color}}>
            {conv.type === 'group' ? conv.initials : counterpart?.initials}
          </div>
          <div className="info-name">
            {conv.type === 'group' ? conv.name : counterpart?.full_name}
            {counterpart?.verified && <Icons.Verified size={16} color="#2A6FDB" style={{verticalAlign:'-3px', marginLeft:4}}/>}
          </div>
          <div className="info-sub">
            {conv.type === 'group'
              ? `${conv.members?.length || 0} members`
              : (counterpart?.subtitle || '')}
          </div>
          {counterpart?.about && <div className="info-about">{counterpart.about}</div>}
          <div className="info-actions">
            <button><Icons.Phone size={18}/><span>Call</span></button>
            <button><Icons.Video size={18}/><span>Video</span></button>
            <button onClick={() => store.togglePin(conv.id)}>
              <Icons.Pin size={18}/><span>{conv.pinned_at ? 'Unpin' : 'Pin'}</span>
            </button>
            <button onClick={() => store.setMute(conv.id, muted ? null : new Date(Date.now() + 8 * 3600_000).toISOString())}>
              {muted ? <Icons.Bell size={18}/> : <Icons.BellOff size={18}/>}<span>{muted ? 'Unmute' : 'Mute'}</span>
            </button>
          </div>
        </div>

        <div className="info-tabs">
          {[
            { id: 'media',   label: 'Media',     count: media.length },
            { id: 'docs',    label: 'Documents', count: docs.length },
            { id: 'starred', label: 'Starred',   count: starred.length },
          ].map(t => (
            <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
              {t.label} <span>{t.count}</span>
            </button>
          ))}
        </div>

        {tab === 'media' && (
          <div className="info-media">
            {media.map(m => (
              <button key={m.id} className="info-media-cell" style={{
                background: `linear-gradient(135deg, ${m.attachment?.gradient?.[0] || '#ccc'}, ${m.attachment?.gradient?.[1] || '#888'})`,
              }} title={m.attachment?.file_name}>
                <span>{m.attachment?.glyph || (m.type === 'video' ? '▶' : '🖼')}</span>
              </button>
            ))}
            {media.length === 0 && <div className="info-empty">No photos or videos in this chat.</div>}
          </div>
        )}

        {tab === 'docs' && (
          <div className="info-docs">
            {docs.map(m => (
              <div key={m.id} className="info-doc">
                <Icons.Document size={20}/>
                <div>
                  <div className="info-doc-name">{m.attachment?.file_name}</div>
                  <div className="info-doc-meta">{window.fmtFileSize(m.attachment?.file_size)} · {window.fmtRelative(m.created_at)}</div>
                </div>
                <Icons.Download size={18}/>
              </div>
            ))}
            {docs.length === 0 && <div className="info-empty">No documents shared yet.</div>}
          </div>
        )}

        {tab === 'starred' && (
          <div className="info-docs">
            {starred.map(m => (
              <div key={m.id} className="info-doc">
                <Icons.Star size={16} color="#C68B27"/>
                <div>
                  <div className="info-doc-name">{(m.body || m.attachment?.file_name || '').slice(0, 80)}</div>
                  <div className="info-doc-meta">
                    {m.sender_id === store.state.me.id ? 'You' : (store.getPerson(m.sender_id)?.full_name || 'Member')} · {window.fmtRelative(m.created_at)}
                  </div>
                </div>
              </div>
            ))}
            {starred.length === 0 && <div className="info-empty">No starred messages in this chat.</div>}
          </div>
        )}

        {conv.type === 'group' && conv.members && (
          <div className="info-members">
            <div className="info-section-head">{conv.members.length} participants</div>
            {conv.members.map(mid => {
              const p = mid === store.state.me.id ? store.state.me : store.getPerson(mid);
              return p && (
                <div key={mid} className="info-member">
                  <div className="info-member-av" style={{background: p.avatar_color}}>{p.initials}</div>
                  <div>
                    <div className="info-member-name">{p.full_name || p.short_name}</div>
                    <div className="info-member-sub">{p.subtitle || p.status || ''}</div>
                  </div>
                  {conv.admins?.includes(mid) && <span className="info-member-badge">Admin</span>}
                </div>
              );
            })}
          </div>
        )}

        <div className="info-danger">
          <button onClick={() => store.toggleArchive(conv.id)}>
            <Icons.Archive size={16}/> {conv.archived_at ? 'Unarchive chat' : 'Archive chat'}
          </button>
          <button onClick={() => store.clearMessages(conv.id)}>
            <Icons.Edit size={16}/> Clear messages
          </button>
          {conv.type === 'dm' && (
            <button className="danger" onClick={() => store.toggleBlock(conv.id)}>
              <Icons.Block size={16}/> {conv.blocked ? `Unblock ${counterpart?.full_name?.split(' ')[0]}` : `Block ${counterpart?.full_name?.split(' ')[0]}`}
            </button>
          )}
          <button className="danger" onClick={() => store.deleteConversation(conv.id)}>
            <Icons.Trash size={16}/> Delete chat
          </button>
        </div>
      </div>
    </aside>
  );
}

window.ChatView = ChatView;
