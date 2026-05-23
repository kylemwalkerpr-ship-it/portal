/* ─────────────────────────────────────────────────────────────────────────
   ChatList — the left sidebar.
   ▸ Search bar (debounced, searches names + last-message snippets).
   ▸ Filter tabs: All · Unread · Favourites · Groups.
   ▸ Archived header row (clickable, with unread count).
   ▸ Pinned section (up to 3) shown above the rest.
   ▸ Each row: avatar, name, snippet, time, unread badge, pin glyph,
     mute glyph, double-tick for "from me & read", swipe gesture & ⌄ menu.
   ▸ Row context menu (right-click or ⌄): Mark unread, Pin, Mute, Archive,
     Block, Delete.
   ───────────────────────────────────────────────────────────────────── */

const { useState, useMemo, useRef, useEffect } = React;

/* The list itself is implemented in ChatListImpl below, wrapped by
   ChatListContainer (the only thing exported to window.ChatList).
   ChatListContainer reads the store at render time and threads the
   shimmed setters down so the impl can stay testable. */

function ChatListContainer(props) {
  const store = window.useStore();
  /* shim the setters used in ChatList */
  const setSearch = (v) => store.setUI({ search: v });
  const setFilter = (v) => store.setUI({ filter: v });
  return <ChatListImpl {...props} store={store} setSearch={setSearch} setFilter={setFilter}/>;
}

/* The real implementation lives in ChatListImpl — keeps logic readable */
function ChatListImpl({ store, setSearch, setFilter, onOpenArchived, onOpenStarred, onOpenSettings, onNewChat, onPostInquiry, onOpenStatus }) {
  const { state, getPerson } = store;
  const { ui } = state;
  const meIsSeller = ['attorney', 'consultant'].includes(state.me.role);
  const [menuFor, setMenuFor] = useState(null);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });

  const filtered = useMemo(() => {
    const q = ui.search.trim().toLowerCase();
    return state.conversations.filter(c => {
      if (c.archived_at) return false;
      if (ui.filter === 'unread'     && !(c.unread > 0)) return false;
      if (ui.filter === 'groups'     && c.type !== 'group') return false;
      if (ui.filter === 'favourites' && !c.pinned_at) return false;
      if (q) {
        const person = c.type === 'dm' ? getPerson(c.counterpart_id) : null;
        const hay = [
          c.type === 'group' ? c.name : (person?.full_name || ''),
          c.last_message_snippet || '',
          c.context_label || '',
        ].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [state.conversations, ui.filter, ui.search, getPerson]);

  const pinned = filtered.filter(c => c.pinned_at).sort((a,b) => new Date(b.pinned_at) - new Date(a.pinned_at));
  const others = filtered.filter(c => !c.pinned_at).sort((a,b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0));
  const archivedAll    = state.conversations.filter(c => c.archived_at);
  const archivedCount  = archivedAll.length;
  const archivedUnread = archivedAll.filter(c => c.unread > 0).length;
  const totalUnread    = state.conversations.filter(c => !c.archived_at && c.unread > 0).reduce((s,c) => s + c.unread, 0);

  /* close menu on doc click */
  useEffect(() => {
    if (!menuFor) return;
    const onDoc = (e) => { if (!e.target.closest?.('[data-rowmenu]')) setMenuFor(null); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuFor]);

  const openMenu = (convId, e) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    /* Position menu to the right of and below the chevron, but clamp to viewport */
    const x = Math.min(window.innerWidth - 240, rect.right - 16);
    const y = rect.bottom + 6;
    setMenuPos({ x, y });
    setMenuFor(convId);
  };

  return (
    <aside className="cl">
      <div className="cl-head">
        <div className="cl-title">
          <div className="cl-title-l">
            <window.InquiryStatusRing personId="me" size={40} onClick={onOpenStatus}>
              <div className="cl-avatar" style={{background: state.me.avatar_color}}>{state.me.initials}</div>
            </window.InquiryStatusRing>
            <div>
              <div className="cl-title-name">Chats</div>
              <div className="cl-title-sub">{totalUnread ? `${totalUnread} unread` : 'All caught up'}</div>
            </div>
          </div>
          <div className="cl-title-r">
            {!meIsSeller && (
              <button className="cl-post-inq" title="Post a new inquiry" onClick={onPostInquiry}>
                <Icons.Plus size={13}/> Inquiry
              </button>
            )}
            <button className="iconbtn" title="Starred messages" onClick={onOpenStarred}><Icons.Star size={18}/></button>
            <button className="iconbtn" title="New chat"         onClick={onNewChat}    ><Icons.NewChat size={18}/></button>
            <button className="iconbtn" title="Settings"         onClick={onOpenSettings}><Icons.Settings size={18}/></button>
          </div>
        </div>

        {meIsSeller && (
          <div className="cl-view-tabs" role="tablist">
            <button className={`cl-view-tab ${ui.view !== 'marketplace' ? 'on' : ''}`} role="tab" onClick={() => store.setUI({ view: 'chats' })}>
              <Icons.Chats size={14}/> Chats
            </button>
            <button className={`cl-view-tab ${ui.view === 'marketplace' ? 'on' : ''}`} role="tab" onClick={() => store.setUI({ view: 'marketplace' })}>
              <Icons.Document size={14}/> Marketplace
              {(state.inquiries || []).filter(i => i.status === 'open').length > 0 && (
                <span className="cl-view-tab-badge">{(state.inquiries || []).filter(i => i.status === 'open').length}</span>
              )}
            </button>
          </div>
        )}

        <div className="cl-search">
          <Icons.Search size={16}/>
          <input placeholder="Search or start new chat" value={ui.search} onChange={e => setSearch(e.target.value)}/>
          {ui.search && <button className="cl-search-x" onClick={() => setSearch('')}><Icons.X size={14}/></button>}
        </div>

        <div className="cl-filters">
          {[
            { id: 'all',        label: 'All' },
            { id: 'unread',     label: 'Unread',     count: totalUnread },
            { id: 'favourites', label: 'Favourites', count: state.conversations.filter(c => c.pinned_at && !c.archived_at).length },
            { id: 'groups',     label: 'Groups',     count: state.conversations.filter(c => c.type === 'group' && !c.archived_at).length },
          ].map(f => (
            <button key={f.id} className={`cl-pill ${ui.filter === f.id ? 'on' : ''}`} onClick={() => setFilter(f.id)}>
              {f.label}{f.count > 0 && <span className="cl-pill-count">{f.count.toLocaleString()}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="cl-scroll">
        {archivedCount > 0 && (
          <button className="cl-archived" onClick={onOpenArchived}>
            <div className="cl-archived-l">
              <div className="cl-archived-icon"><Icons.Archive size={18}/></div>
              <span>Archived</span>
            </div>
            <div className="cl-archived-r">
              {archivedUnread > 0 && <span className="cl-archived-count">{archivedUnread}</span>}
              <span className="cl-archived-total">{archivedCount}</span>
            </div>
          </button>
        )}

        {pinned.length > 0 && <div className="cl-section-label"><Icons.PinSmall size={11}/> Pinned</div>}
        {pinned.map(c => <Row key={c.id} conv={c} pinned store={store} openMenu={openMenu} onOpenStatus={onOpenStatus}/>)}

        {pinned.length > 0 && others.length > 0 && <div className="cl-section-label">All chats</div>}
        {others.map(c => <Row key={c.id} conv={c} store={store} openMenu={openMenu} onOpenStatus={onOpenStatus}/>)}

        {filtered.length === 0 && (
          <div className="cl-empty">
            {ui.search
              ? <>No conversations match <b>“{ui.search}”</b>.</>
              : ui.filter === 'unread' ? "You're all caught up."
              : ui.filter === 'favourites' ? "No pinned conversations yet. Open a chat → ⋮ → Pin to keep it here."
              : ui.filter === 'groups' ? "No groups yet."
              : "No conversations yet."}
          </div>
        )}
      </div>

      {menuFor && (
        <RowMenu
          conv={state.conversations.find(c => c.id === menuFor)}
          x={menuPos.x} y={menuPos.y}
          store={store}
          onClose={() => setMenuFor(null)}/>
      )}
    </aside>
  );
}

/* ───── individual row ───── */
function Row({ conv, pinned, store, openMenu, onOpenStatus }) {
  const { state, getPerson, setActive, markRead } = store;
  const active = state.ui.active_id === conv.id;
  const person = conv.type === 'dm' ? getPerson(conv.counterpart_id) : null;
  const muted = window.isMuted(conv);
  const rowRef = useRef(null);

  const name = conv.type === 'group' ? conv.name : (person?.full_name || 'Conversation');
  const initials = conv.type === 'group' ? (conv.initials || 'G') : (person?.initials || '?');
  const avatarBg = conv.type === 'group' ? (conv.avatar_color || '#3C3B6E') : (person?.avatar_color || '#3C3B6E');
  const ringPersonId = conv.type === 'dm' ? person?.id : null;

  /* Last message — show sender prefix in groups, "You:" if from me */
  let snippet = conv.last_message_snippet || '';
  let snippetPrefix = '';
  if (conv.draft) { snippetPrefix = 'Draft:'; snippet = conv.draft; }
  else if (conv.last_message_from_me) snippetPrefix = 'You:';

  const fromMeRead = conv.last_message_from_me && !!state.messages[conv.id]?.find(m => m.id === conv.last_message_id)?.read_at;
  const fromMeDeliv= conv.last_message_from_me && !!state.messages[conv.id]?.find(m => m.id === conv.last_message_id)?.delivered_at;
  const fromMeSent = conv.last_message_from_me && !fromMeDeliv;

  /* typing indicator */
  const isTyping = conv.typing;

  return (
    <button
      ref={rowRef}
      className={`row ${active ? 'on' : ''} ${conv.unread > 0 ? 'unread' : ''}`}
      onClick={() => setActive(conv.id)}
      onContextMenu={e => openMenu(conv.id, e)}>
      {ringPersonId
        ? <window.InquiryStatusRing personId={ringPersonId} size={48} onClick={onOpenStatus}>
            <div className="row-avatar" style={{background: avatarBg}}>
              {initials}
              {person?.online && <span className="row-online"/>}
              {person?.verified && <span className="row-verified" title="Verified">✓</span>}
            </div>
          </window.InquiryStatusRing>
        : <div className="row-avatar" style={{background: avatarBg}}>
            {initials}
            {person?.online && <span className="row-online"/>}
            {person?.verified && <span className="row-verified" title="Verified">✓</span>}
          </div>}
      <div className="row-body">
        <div className="row-line1">
          <span className="row-name">{name}</span>
          <span className={`row-time ${conv.unread > 0 ? 'on' : ''}`}>{window.fmtRelative(conv.last_message_at)}</span>
        </div>
        <div className="row-line2">
          <span className="row-snippet">
            {fromMeRead && <Icons.CheckDouble size={14} color="#53BDEB" style={{flexShrink:0, marginRight:3, verticalAlign:'-2px'}}/>}
            {fromMeDeliv && !fromMeRead && <Icons.CheckDouble size={14} color="currentColor" style={{flexShrink:0, marginRight:3, opacity:.55, verticalAlign:'-2px'}}/>}
            {fromMeSent  && <Icons.Check size={14} color="currentColor" style={{flexShrink:0, marginRight:3, opacity:.55, verticalAlign:'-2px'}}/>}
            {snippetPrefix && <span className={snippetPrefix === 'Draft:' ? 'draft' : 'you'}>{snippetPrefix} </span>}
            {isTyping ? <span className="typing-text">typing…</span> : snippet}
          </span>
          <span className="row-icons">
            {muted && <Icons.BellOff size={13} color="currentColor" style={{opacity:.55}}/>}
            {pinned && <Icons.PinSmall size={13} color="currentColor" style={{opacity:.55}}/>}
            {conv.unread > 0 && <span className="row-unread">{conv.unread > 99 ? '99+' : conv.unread}</span>}
            <span className="row-chev" onClick={e => { e.stopPropagation(); openMenu(conv.id, e); }}><Icons.ChevronDown size={14}/></span>
          </span>
        </div>
        {conv.context_label && (
          <div className="row-ctx">{conv.context_label}</div>
        )}
      </div>
    </button>
  );
}

/* ───── per-row context menu ───── */
function RowMenu({ conv, x, y, store, onClose }) {
  const { togglePin, toggleArchive, setMute, markRead, deleteConversation, clearMessages, toggleBlock, getPerson } = store;
  const muted = window.isMuted(conv);
  const [muteSubmenu, setMuteSubmenu] = useState(false);
  const person = conv.type === 'dm' ? getPerson(conv.counterpart_id) : null;

  const muteFor = (mins) => {
    const until = mins ? new Date(Date.now() + mins * 60_000).toISOString() : new Date(Date.now() + 100 * 365 * 86400_000).toISOString();
    setMute(conv.id, until);
    onClose();
  };
  const unmute = () => { setMute(conv.id, null); onClose(); };

  if (muteSubmenu) {
    return (
      <div data-rowmenu className="ctxmenu" style={{ left: x, top: y }}>
        <div className="ctxmenu-head">Mute notifications</div>
        <button className="ctxmenu-item" onClick={() => muteFor(8 * 60)}><Icons.Clock size={16}/> 8 hours</button>
        <button className="ctxmenu-item" onClick={() => muteFor(7 * 24 * 60)}><Icons.Clock size={16}/> 1 week</button>
        <button className="ctxmenu-item" onClick={() => muteFor(0)}><Icons.BellOff size={16}/> Always</button>
        <div className="ctxmenu-sep"/>
        <button className="ctxmenu-item" onClick={() => setMuteSubmenu(false)}><Icons.ChevronLeft size={16}/> Back</button>
      </div>
    );
  }

  return (
    <div data-rowmenu className="ctxmenu" style={{ left: x, top: y }}>
      <button className="ctxmenu-item" onClick={() => { markRead(conv.id); onClose(); }}>
        <Icons.Check size={16}/> Mark as read
      </button>
      <button className="ctxmenu-item" onClick={() => { togglePin(conv.id); onClose(); }}>
        <Icons.Pin size={16}/> {conv.pinned_at ? 'Unpin chat' : 'Pin chat'}
      </button>
      {muted
        ? <button className="ctxmenu-item" onClick={unmute}><Icons.Bell size={16}/> Unmute notifications</button>
        : <button className="ctxmenu-item" onClick={() => setMuteSubmenu(true)}><Icons.BellOff size={16}/> Mute notifications <span className="ctxmenu-chev">›</span></button>}
      <button className="ctxmenu-item" onClick={() => { toggleArchive(conv.id); onClose(); }}>
        <Icons.Archive size={16}/> {conv.archived_at ? 'Unarchive' : 'Archive chat'}
      </button>
      <div className="ctxmenu-sep"/>
      <button className="ctxmenu-item" onClick={() => { clearMessages(conv.id); onClose(); }}>
        <Icons.Edit size={16}/> Clear messages
      </button>
      {conv.type === 'dm' && person && (
        <button className="ctxmenu-item danger" onClick={() => { toggleBlock(conv.id); onClose(); }}>
          <Icons.Block size={16}/> {conv.blocked ? `Unblock ${person.full_name.split(' ')[0]}` : `Block ${person.full_name.split(' ')[0]}`}
        </button>
      )}
      <button className="ctxmenu-item danger" onClick={() => { deleteConversation(conv.id); onClose(); }}>
        <Icons.Trash size={16}/> Delete chat
      </button>
    </div>
  );
}

window.ChatList = ChatListContainer;
