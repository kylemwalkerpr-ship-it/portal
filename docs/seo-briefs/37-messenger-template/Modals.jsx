/* ─────────────────────────────────────────────────────────────────────────
   Modals — all the secondary panels:
   ▸ ImageViewer (lightbox with download / forward / star)
   ▸ ForwardPicker (multi-select chat list to forward to)
   ▸ ArchivedView (full-screen list of archived chats)
   ▸ StarredView (all starred messages across all chats)
   ▸ SettingsPanel (theme / accent / wallpaper / density / data export)
   ▸ NewChatModal (start a new conversation with a contact)
   ▸ ToastHost (small inline status messages)
   ───────────────────────────────────────────────────────────────────── */

function Backdrop({ children, onClose }) {
  React.useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="backdrop-inner" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

/* ─────────────── Image viewer ─────────────── */
function ImageViewer({ message, conv, onClose, onForward }) {
  const store = window.useStore();
  const allImages = store.getMessages(conv.id).filter(m => m.type === 'image' || m.type === 'video');
  const startIdx = Math.max(0, allImages.findIndex(m => m.id === message.id));
  const [idx, setIdx] = React.useState(startIdx);
  const m = allImages[idx];
  if (!m) return null;
  const a = m.attachment || {};
  const grad = a.gradient || ['#ECE6D5', '#D9D1BD'];
  const sender = m.sender_id === store.state.me.id ? store.state.me : store.getPerson(m.sender_id);

  React.useEffect(() => {
    const k = (e) => {
      if (e.key === 'ArrowLeft')  setIdx(i => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setIdx(i => Math.min(allImages.length - 1, i + 1));
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [allImages.length]);

  return (
    <Backdrop onClose={onClose}>
      <div className="viewer">
        <div className="viewer-head">
          <div className="viewer-meta">
            <div className="viewer-av" style={{background: sender?.avatar_color}}>{sender?.initials || '?'}</div>
            <div>
              <div className="viewer-name">{sender?.full_name || sender?.short_name}</div>
              <div className="viewer-time">{window.fmtFullDate(m.created_at)}</div>
            </div>
          </div>
          <div className="viewer-actions">
            <button className="iconbtn" onClick={() => onForward(m)} title="Forward"><Icons.Forward size={18} color="#fff"/></button>
            <button className="iconbtn" onClick={() => store.toggleStar(conv.id, m.id)} title="Star"><Icons.Star size={18} color="#fff"/></button>
            <button className="iconbtn" title="Download"><Icons.Download size={18} color="#fff"/></button>
            <button className="iconbtn" onClick={onClose} title="Close"><Icons.X size={20} color="#fff"/></button>
          </div>
        </div>

        <button className="viewer-arrow l" disabled={idx === 0} onClick={() => setIdx(i => Math.max(0, i - 1))}><Icons.ChevronLeft size={28} color="#fff"/></button>
        <div className="viewer-stage">
          <div className="viewer-canvas" style={{
            background: `linear-gradient(135deg, ${grad[0]}, ${grad[1]})`,
            aspectRatio: a.width && a.height ? `${a.width}/${a.height}` : '4 / 3',
          }}>
            <div className="viewer-glyph">{m.type === 'video' ? <Icons.PlayCircle size={80} color="#fff"/> : a.glyph || a.file_name}</div>
          </div>
          {m.body && <div className="viewer-caption">{m.body}</div>}
        </div>
        <button className="viewer-arrow r" disabled={idx === allImages.length - 1} onClick={() => setIdx(i => Math.min(allImages.length - 1, i + 1))}><Icons.ChevronRight size={28} color="#fff"/></button>

        <div className="viewer-filmstrip">
          {allImages.map((im, i) => (
            <button key={im.id}
                    className={`viewer-thumb ${i === idx ? 'on' : ''}`}
                    onClick={() => setIdx(i)}
                    style={{background: `linear-gradient(135deg, ${im.attachment?.gradient?.[0]||'#888'}, ${im.attachment?.gradient?.[1]||'#444'})`}}/>
          ))}
        </div>
      </div>
    </Backdrop>
  );
}

window.fmtFullDate = (s) => new Date(s).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/* ─────────────── Forward picker ─────────────── */
function ForwardPicker({ message, onClose }) {
  const store = window.useStore();
  const { state, forwardMessage, getPerson } = store;
  const [selected, setSelected] = React.useState(new Set());
  const [q, setQ] = React.useState('');
  const chats = state.conversations
    .filter(c => !c.archived_at)
    .filter(c => {
      if (!q.trim()) return true;
      const name = c.type === 'group' ? c.name : getPerson(c.counterpart_id)?.full_name || '';
      return name.toLowerCase().includes(q.toLowerCase());
    });

  const toggle = (id) => setSelected(s => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const send = () => {
    forwardMessage(message, [...selected]);
    onClose();
  };

  return (
    <Backdrop onClose={onClose}>
      <div className="modal forward-modal">
        <div className="modal-head">
          <button className="iconbtn" onClick={onClose}><Icons.X size={18}/></button>
          <div>Forward message to…</div>
          <button className="modal-action" disabled={selected.size === 0} onClick={send}>
            <Icons.Send size={16}/> Send {selected.size > 0 && `(${selected.size})`}
          </button>
        </div>
        <div className="modal-search">
          <Icons.Search size={14}/>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search chats" autoFocus/>
        </div>
        <div className="modal-list">
          {chats.map(c => {
            const person = c.type === 'dm' ? getPerson(c.counterpart_id) : null;
            const name = c.type === 'group' ? c.name : (person?.full_name || 'Conversation');
            const initials = c.type === 'group' ? (c.initials || 'G') : (person?.initials || '?');
            const bg = c.type === 'group' ? c.avatar_color : person?.avatar_color;
            return (
              <button key={c.id} className={`modal-row ${selected.has(c.id) ? 'on' : ''}`} onClick={() => toggle(c.id)}>
                <div className="modal-row-check">{selected.has(c.id) ? <Icons.Check size={14} color="#fff"/> : null}</div>
                <div className="row-avatar" style={{background: bg, width: 36, height: 36}}>{initials}</div>
                <div className="modal-row-body">
                  <div className="modal-row-name">{name}</div>
                  <div className="modal-row-sub">{c.last_message_snippet || ''}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </Backdrop>
  );
}

/* ─────────────── Archived view ─────────────── */
function ArchivedView({ onClose }) {
  const store = window.useStore();
  const { state, getPerson, toggleArchive, setActive } = store;
  const archived = state.conversations.filter(c => c.archived_at)
    .sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0));

  return (
    <Backdrop onClose={onClose}>
      <div className="modal archived-modal">
        <div className="modal-head">
          <button className="iconbtn" onClick={onClose}><Icons.ChevronLeft size={20}/></button>
          <div>Archived ({archived.length})</div>
          <div style={{width: 32}}/>
        </div>
        <div className="modal-list">
          {archived.length === 0 && <div className="modal-empty">No archived chats. Right-click any chat → Archive.</div>}
          {archived.map(c => {
            const person = c.type === 'dm' ? getPerson(c.counterpart_id) : null;
            const name = c.type === 'group' ? c.name : (person?.full_name || 'Conversation');
            const initials = c.type === 'group' ? (c.initials || 'G') : (person?.initials || '?');
            const bg = c.type === 'group' ? c.avatar_color : person?.avatar_color;
            return (
              <div key={c.id} className="modal-row" style={{cursor: 'default'}}>
                <div className="row-avatar" style={{background: bg, width: 40, height: 40}}>{initials}</div>
                <div className="modal-row-body">
                  <div className="modal-row-name">{name}</div>
                  <div className="modal-row-sub">{c.last_message_snippet || ''}</div>
                </div>
                <div className="modal-row-actions">
                  <button onClick={() => { toggleArchive(c.id); setActive(c.id); onClose(); }}>Unarchive</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Backdrop>
  );
}

/* ─────────────── Starred view ─────────────── */
function StarredView({ onClose }) {
  const store = window.useStore();
  const { state, getPerson, setActive } = store;
  const me = state.me.id;
  const all = [];
  Object.entries(state.messages).forEach(([cid, msgs]) => {
    msgs.forEach(m => {
      if (m.starred?.includes(me)) all.push({ ...m, _conv: state.conversations.find(c => c.id === cid) });
    });
  });
  all.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return (
    <Backdrop onClose={onClose}>
      <div className="modal starred-modal">
        <div className="modal-head">
          <button className="iconbtn" onClick={onClose}><Icons.ChevronLeft size={20}/></button>
          <div><Icons.Star size={16} color="#C68B27" style={{verticalAlign:'-2px', marginRight:6}}/> Starred ({all.length})</div>
          <div style={{width: 32}}/>
        </div>
        <div className="modal-list">
          {all.length === 0 && <div className="modal-empty">Long-press any message → Star to keep it here.</div>}
          {all.map(m => {
            const conv = m._conv;
            const person = conv?.type === 'dm' ? getPerson(conv.counterpart_id) : null;
            const sender = m.sender_id === me ? state.me : getPerson(m.sender_id);
            const chatName = conv?.type === 'group' ? conv.name : (person?.full_name || '');
            return (
              <button key={m.id} className="modal-row starred-row" onClick={() => { setActive(conv.id); onClose(); }}>
                <div className="starred-meta">
                  <span className="starred-from">{m.sender_id === me ? 'You' : sender?.full_name?.split(' ')[0]}</span>
                  <span className="starred-arrow">→</span>
                  <span className="starred-chat">{chatName}</span>
                  <span className="starred-time">{window.fmtRelative(m.created_at)}</span>
                </div>
                <div className="starred-body">{
                  m.type === 'text' ? (m.body || '').slice(0, 200)
                  : m.type === 'document' ? `📄 ${m.attachment?.file_name}`
                  : m.type === 'image' ? '📷 Photo'
                  : m.type === 'voice' ? '🎙 Voice message'
                  : m.type === 'location' ? '📍 Location'
                  : '(message)'
                }</div>
              </button>
            );
          })}
        </div>
      </div>
    </Backdrop>
  );
}

/* ─────────────── Settings ─────────────── */
function SettingsPanel({ onClose }) {
  const store = window.useStore();
  const { state, setUI, resetToSeed } = store;
  const ui = state.ui;

  return (
    <Backdrop onClose={onClose}>
      <div className="modal settings-modal">
        <div className="modal-head">
          <button className="iconbtn" onClick={onClose}><Icons.X size={18}/></button>
          <div>Settings</div>
          <div style={{width: 32}}/>
        </div>
        <div className="settings-scroll">
          <SettingSection title="Profile">
            <div className="modal-row" style={{cursor:'default'}}>
              <div className="row-avatar" style={{background: state.me.avatar_color, width: 56, height: 56, fontSize: 18}}>{state.me.initials}</div>
              <div className="modal-row-body">
                <div className="modal-row-name" style={{fontSize: 16}}>{state.me.full_name}</div>
                <div className="modal-row-sub">{state.me.status}</div>
              </div>
            </div>
          </SettingSection>

          <SettingSection title="View as (demo)">
            <div className="seg seg-wrap">
              {[
                { id: 'student',    label: 'Buyer' },
                { id: 'attorney',   label: 'Attorney' },
                { id: 'consultant', label: 'Consultant' },
                { id: 'support',    label: 'Support' },
                { id: 'admin',      label: 'Superadmin' },
              ].map(r => (
                <button key={r.id} className={state.me.role === r.id ? 'on' : ''} onClick={() => {
                  store.state.me.role = r.id;
                  /* Reset view per-role so each lands on its native shell */
                  setUI({ _t: Date.now(), view: r.id === 'attorney' || r.id === 'consultant' ? 'marketplace' : 'chats', active_id: r.id === 'support' ? null : r.id === 'admin' ? null : 'c_renu' });
                }}>{r.label}</button>
              ))}
            </div>
            <div style={{fontSize: 11, color: 'var(--text-soft)', marginTop: 8, lineHeight: 1.5}}>
              Demo-only: the prototype's roles map to <code>profiles.role</code> in production (<code>client / consultant / attorney / support / admin</code>). Each role has its own shell.
            </div>
          </SettingSection>

          <SettingSection title="Platform safety">
            <div className="settings-list">
              <div className="settings-row">
                <div><b>Off-platform contact filter</b><div className="settings-sub">Blocks phone numbers, emails, external URLs, payment-app handles and social IDs in every message.</div></div>
                <div className="settings-val">Enforced</div>
              </div>
              <div className="settings-row">
                <div><b>Attachment scanning</b><div className="settings-sub">Every uploaded file is scanned for malware before delivery.</div></div>
                <div className="settings-val">On</div>
              </div>
              <div className="settings-row">
                <div><b>Escrow protection</b><div className="settings-sub">Payments are held by Yousafe until you mark the work complete or 7 days after delivery.</div></div>
                <div className="settings-val">On</div>
              </div>
            </div>
          </SettingSection>

          <SettingSection title="Theme">
            <div className="seg">
              {['light', 'dark', 'paper'].map(t => (
                <button key={t} className={ui.theme === t ? 'on' : ''} onClick={() => setUI({ theme: t })}>{t}</button>
              ))}
            </div>
          </SettingSection>

          <SettingSection title="Accent">
            <div className="swatches">
              {[
                { id: 'green',  color: '#00A884' },
                { id: 'indigo', color: '#3C3B6E' },
                { id: 'brick',  color: '#B22234' },
                { id: 'gold',   color: '#C4A45A' },
              ].map(s => (
                <button key={s.id} className={`sw ${ui.accent === s.id ? 'on' : ''}`} style={{background: s.color}} onClick={() => setUI({ accent: s.id })}/>
              ))}
            </div>
          </SettingSection>

          <SettingSection title="Chat wallpaper">
            <div className="seg">
              {['doodle', 'plain', 'minimal', 'paper'].map(w => (
                <button key={w} className={ui.wallpaper === w ? 'on' : ''} onClick={() => setUI({ wallpaper: w })}>{w}</button>
              ))}
            </div>
          </SettingSection>

          <SettingSection title="Density">
            <div className="seg">
              {['compact', 'cozy', 'roomy'].map(d => (
                <button key={d} className={ui.density === d ? 'on' : ''} onClick={() => setUI({ density: d })}>{d}</button>
              ))}
            </div>
          </SettingSection>

          <SettingSection title="Font size">
            <input type="range" min="12" max="18" value={ui.font_size} onChange={e => setUI({ font_size: parseInt(e.target.value) })}/>
            <span style={{fontSize: 12, color: 'var(--ink-soft)'}}>{ui.font_size}px</span>
          </SettingSection>

          <SettingSection title="Privacy">
            <div className="settings-list">
              <div className="settings-row">
                <div><b>Last seen & online</b><div className="settings-sub">Anyone you've messaged in the last 30 days</div></div>
                <div className="settings-val">Contacts</div>
              </div>
              <div className="settings-row">
                <div><b>Read receipts</b><div className="settings-sub">When enabled, blue double-ticks confirm reads</div></div>
                <div className="settings-val">On</div>
              </div>
              <div className="settings-row">
                <div><b>Disappearing messages</b><div className="settings-sub">Default duration for new chats</div></div>
                <div className="settings-val">Off</div>
              </div>
            </div>
          </SettingSection>

          <SettingSection title="Data">
            <button className="settings-btn" onClick={() => {
              const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = 'mycaseworks-chats.json'; a.click();
              URL.revokeObjectURL(url);
            }}><Icons.Download size={14}/> Export all conversations (JSON)</button>
            <button className="settings-btn danger" onClick={resetToSeed}>
              <Icons.Trash size={14}/> Reset to demo seed
            </button>
          </SettingSection>
        </div>
      </div>
    </Backdrop>
  );
}

function SettingSection({ title, children }) {
  return (
    <div className="settings-section">
      <div className="settings-section-title">{title}</div>
      {children}
    </div>
  );
}

/* ─────────────── New chat modal ─────────────── */
function NewChatModal({ onClose }) {
  const store = window.useStore();
  const { state, setActive } = store;
  const [q, setQ] = React.useState('');
  /* Only show people we don't already have a DM with */
  const existingPartners = new Set(state.conversations
    .filter(c => c.type === 'dm')
    .map(c => c.counterpart_id));
  const candidates = Object.values(state.people)
    .filter(p => p.id !== state.me.id)
    .filter(p => !q.trim() || p.full_name.toLowerCase().includes(q.toLowerCase()) || (p.subtitle || '').toLowerCase().includes(q.toLowerCase()));

  const startWith = (personId) => {
    /* If a conv already exists, just open it (matches real backend
       behaviour: get_or_create_conversation). */
    const existing = state.conversations.find(c => c.type === 'dm' && c.counterpart_id === personId);
    if (existing) { setActive(existing.id); onClose(); return; }
    /* Otherwise, push a new empty conv into state. In production, this
       triggers POST /api/messages/start. */
    const id = `c_new_${Date.now()}`;
    store.setUI({}); /* noop to keep referential transparency */
    /* We'll directly mutate via a thin helper exposed on store. Since
       store doesn't expose direct setState, we synthesise a tiny send
       to materialise the conversation. */
    const target = state.people[personId];
    /* Use sendMessage with an empty system kickoff so the row appears. */
    /* Easier: extend the conversations list manually via a special API. */
    window._mc_startChat?.(personId);
    onClose();
  };

  return (
    <Backdrop onClose={onClose}>
      <div className="modal newchat-modal">
        <div className="modal-head">
          <button className="iconbtn" onClick={onClose}><Icons.X size={18}/></button>
          <div>New chat</div>
          <div style={{width: 32}}/>
        </div>
        <div className="modal-search">
          <Icons.Search size={14}/>
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search people on MyCaseworks"/>
        </div>
        {existingPartners.size === 0
          ? <div style={{padding: '8px 18px', fontSize: 12, color: 'var(--ink-soft)'}}>Tip: Pin your top contacts so they stay on top of the inbox.</div>
          : null}
        <div className="modal-list">
          {candidates.map(p => (
            <button key={p.id} className="modal-row" onClick={() => startWith(p.id)}>
              <div className="row-avatar" style={{background: p.avatar_color, width: 40, height: 40}}>{p.initials}</div>
              <div className="modal-row-body">
                <div className="modal-row-name">{p.full_name}</div>
                <div className="modal-row-sub">{p.subtitle || ''}</div>
              </div>
              {existingPartners.has(p.id) && <span className="modal-row-tag">Existing</span>}
            </button>
          ))}
          {candidates.length === 0 && <div className="modal-empty">No one matches.</div>}
        </div>
      </div>
    </Backdrop>
  );
}

/* ─────────────── Toast host ─────────────── */
function ToastHost() {
  const [msg, setMsg] = React.useState(null);
  React.useEffect(() => {
    const onToast = (e) => {
      setMsg(e.detail);
      setTimeout(() => setMsg(null), 2200);
    };
    window.addEventListener('mc-toast', onToast);
    return () => window.removeEventListener('mc-toast', onToast);
  }, []);
  if (!msg) return null;
  return <div className="toast">{msg}</div>;
}

window.Modals = { ImageViewer, ForwardPicker, ArchivedView, StarredView, SettingsPanel, NewChatModal, ToastHost };
