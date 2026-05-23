/* ─────────────────────────────────────────────────────────────────────────
   MessageBubble — the heart of the WhatsApp feel.
   Handles every message type and exposes a full action menu via hover
   chevron or right-click. Renders reply quotes, reactions, ticks,
   timestamps, forwarded badges, edited indicator, and per-type bodies
   (text / image / video / voice / document / location / contact / poll /
   system / deleted).
   ───────────────────────────────────────────────────────────────────── */

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '+'];
const EMOJI_PICKER = ['👍','❤️','😂','😮','😢','😡','🙏','🎉','🔥','👏','💯','✅','❌','⭐','📌','📎','📷','💬','✨','😊','😎','🤔','😅','😍','🥲','👌','💪','🚀','📅','💼'];

function MessageBubble({ message, prev, next, conv, onReply, onReact, onForward, onImageClick, onJumpTo }) {
  const store = window.useStore();
  const { state, getPerson, toggleReaction, toggleStar, deleteMessage, editMessage } = store;
  const me = state.me.id;
  const mine = message.sender_id === me;
  const isSystem = message.type === 'system' || message.sender_id === 'system';
  const deletedForEveryone = message.deleted_for?.includes('everyone');
  const deletedForMe       = message.deleted_for?.includes('me');
  if (deletedForMe) return null;

  const sameAuthorPrev = prev && prev.sender_id === message.sender_id && !isSystem;
  const sameAuthorNext = next && next.sender_id === message.sender_id && !isSystem;
  const isFirstOfGroup = !sameAuthorPrev;
  const isLastOfGroup  = !sameAuthorNext;
  const showHeader = conv.type === 'group' && !mine && isFirstOfGroup && !isSystem;
  const sender = getPerson(message.sender_id);

  /* ── system message ── */
  if (isSystem) {
    return (
      <div className="sys">
        <span>{message.body}</span>
      </div>
    );
  }

  const [menuOpen, setMenuOpen] = React.useState(false);
  const [menuPos, setMenuPos]   = React.useState({ x: 0, y: 0, mineSide: mine });
  const [showReactPicker, setShowReactPicker] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [editDraft, setEditDraft] = React.useState(message.body || '');

  React.useEffect(() => {
    if (!menuOpen && !showReactPicker) return;
    const onDoc = (e) => {
      if (!e.target.closest?.('[data-msgmenu]')) {
        setMenuOpen(false);
        setShowReactPicker(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen, showReactPicker]);

  const openMenu = (e) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuPos({
      x: mine ? rect.right - 200 : rect.left,
      y: rect.bottom + 6,
      mineSide: mine,
    });
    setMenuOpen(true);
  };

  const replyTo = message.reply_to_id ? findMessageById(state, conv.id, message.reply_to_id) : null;

  return (
    <div
      className={`bubrow ${mine ? 'mine' : 'theirs'} ${isLastOfGroup ? 'last' : ''} ${isFirstOfGroup ? 'first' : ''}`}
      data-msgmenu
      onContextMenu={openMenu}>
      <div className={`bub ${tailClass(isLastOfGroup, mine)} type-${message.type}`}>
        {showHeader && (
          <div className="bub-author" style={{color: sender?.avatar_color || '#3C3B6E'}}>
            {sender?.full_name || 'Member'}
          </div>
        )}

        {message.forwarded_from && (
          <div className="bub-forwarded"><Icons.Forward size={12}/> Forwarded</div>
        )}

        {replyTo && (
          <button className="bub-reply" onClick={() => onJumpTo?.(replyTo.id)}>
            <span className="bub-reply-bar"/>
            <div className="bub-reply-body">
              <div className="bub-reply-name">{
                replyTo.sender_id === me ? 'You' : (getPerson(replyTo.sender_id)?.full_name || 'Member')
              }</div>
              <div className="bub-reply-snip">{shortSnippet(replyTo)}</div>
            </div>
          </button>
        )}

        {deletedForEveryone ? (
          <div className="bub-deleted"><Icons.Block size={14}/> This message was deleted</div>
        ) : (
          <BubBody message={message} editing={editing} editDraft={editDraft} setEditDraft={setEditDraft}
                   onSaveEdit={() => { editMessage(conv.id, message.id, editDraft.trim()); setEditing(false); }}
                   onCancelEdit={() => { setEditDraft(message.body || ''); setEditing(false); }}
                   onImageClick={onImageClick}/>
        )}

        <div className="bub-foot">
          {message.starred?.includes(me) && <Icons.Star size={11} color="currentColor" style={{opacity:.55, marginRight:2}}/>}
          {message.edited_at && <span className="bub-edited">edited</span>}
          <span className="bub-time">{window.fmtTime(message.created_at)}</span>
          {mine && !deletedForEveryone && <BubTicks status={statusOf(message)}/>}
        </div>

        {Object.keys(message.reactions || {}).length > 0 && (
          <div className={`bub-reactions ${mine ? 'mine' : ''}`}>
            {Object.entries(message.reactions).map(([emoji, users]) => (
              <button
                key={emoji}
                className={`bub-react ${users.includes(me) ? 'mine' : ''}`}
                onClick={() => toggleReaction(conv.id, message.id, emoji)}
                title={users.length === 1 && users[0] === me ? 'You' : `${users.length}`}>
                <span className="bub-react-emoji">{emoji}</span>
                {users.length > 1 && <span className="bub-react-count">{users.length}</span>}
              </button>
            ))}
          </div>
        )}

        <button className="bub-chev" onClick={openMenu} aria-label="More"><Icons.ChevronDown size={14}/></button>
      </div>

      {menuOpen && !deletedForEveryone && (
        <div data-msgmenu className="msgmenu" style={{ left: menuPos.x, top: menuPos.y }}>
          {!showReactPicker ? (
            <>
              <div className="msgmenu-react">
                {QUICK_REACTIONS.map(em => em === '+' ? (
                  <button key="+" className="msgmenu-react-more" onClick={() => setShowReactPicker(true)}>+</button>
                ) : (
                  <button key={em} className="msgmenu-react-em"
                          onClick={() => { toggleReaction(conv.id, message.id, em); setMenuOpen(false); }}>{em}</button>
                ))}
              </div>
              <button className="ctxmenu-item" onClick={() => { onReply(message); setMenuOpen(false); }}>
                <Icons.Reply size={16}/> Reply
              </button>
              <button className="ctxmenu-item" onClick={() => { onForward(message); setMenuOpen(false); }}>
                <Icons.Forward size={16}/> Forward
              </button>
              <button className="ctxmenu-item" onClick={() => { navigator.clipboard?.writeText(message.body || message.attachment?.file_name || ''); setMenuOpen(false); }}>
                <Icons.Copy size={16}/> Copy
              </button>
              <button className="ctxmenu-item" onClick={() => { toggleStar(conv.id, message.id); setMenuOpen(false); }}>
                <Icons.Star size={16}/> {message.starred?.includes(me) ? 'Unstar' : 'Star'}
              </button>
              {mine && message.type === 'text' && !message.attachment && withinEditWindow(message) && (
                <button className="ctxmenu-item" onClick={() => { setEditing(true); setMenuOpen(false); }}>
                  <Icons.Edit size={16}/> Edit
                </button>
              )}
              {message.attachment && (
                <button className="ctxmenu-item" onClick={() => { downloadAttachment(message); setMenuOpen(false); }}>
                  <Icons.Download size={16}/> Save
                </button>
              )}
              <div className="ctxmenu-sep"/>
              <button className="ctxmenu-item danger" onClick={() => { deleteMessage(conv.id, message.id, 'me'); setMenuOpen(false); }}>
                <Icons.Trash size={16}/> Delete for me
              </button>
              {mine && withinDeleteWindow(message) && (
                <button className="ctxmenu-item danger" onClick={() => { deleteMessage(conv.id, message.id, 'everyone'); setMenuOpen(false); }}>
                  <Icons.Trash size={16}/> Delete for everyone
                </button>
              )}
            </>
          ) : (
            <div className="msgmenu-emoji">
              {EMOJI_PICKER.map(em => (
                <button key={em} onClick={() => { toggleReaction(conv.id, message.id, em); setMenuOpen(false); setShowReactPicker(false); }}>{em}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ───── ticks ───── */
function BubTicks({ status }) {
  if (status === 'sending')   return <span className="bub-tick"><Icons.Clock size={13} color="currentColor"/></span>;
  if (status === 'sent')      return <span className="bub-tick"><Icons.Check size={14} color="currentColor"/></span>;
  if (status === 'delivered') return <span className="bub-tick"><Icons.CheckDouble size={14} color="currentColor"/></span>;
  if (status === 'read')      return <span className="bub-tick read"><Icons.CheckDouble size={14} color="#53BDEB"/></span>;
  return null;
}

function statusOf(m) {
  if (m.read_at) return 'read';
  if (m.delivered_at) return 'delivered';
  if (m.status === 'sending') return 'sending';
  return 'sent';
}

/* ───── body by type ───── */
function BubBody({ message, editing, editDraft, setEditDraft, onSaveEdit, onCancelEdit, onImageClick }) {
  if (editing) {
    return (
      <div className="bub-edit">
        <textarea
          autoFocus
          value={editDraft}
          onChange={e => setEditDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSaveEdit(); }
            if (e.key === 'Escape') onCancelEdit();
          }}
        />
        <div className="bub-edit-actions">
          <button onClick={onCancelEdit}>Cancel</button>
          <button onClick={onSaveEdit} className="primary">Save</button>
        </div>
      </div>
    );
  }

  switch (message.type) {
    case 'text':
      return <SafeText body={message.body || ''}/>;

    case 'image':
      return <ImageBody m={message} onImageClick={onImageClick}/>;

    case 'video':
      return <VideoBody m={message} onImageClick={onImageClick}/>;

    case 'document':
      return <DocumentBody m={message}/>;

    case 'voice':
      return <VoiceBody m={message}/>;

    case 'audio':
      return <VoiceBody m={message} isAudio/>;

    case 'location':
      return <LocationBody m={message}/>;

    case 'contact':
      return <ContactBody m={message}/>;

    case 'poll':
      return <PollBody m={message}/>;

    case 'offer':
      return <window.OfferCard message={message} conv={window.useStore().state.conversations.find(c => c.id === message.conversation_id)} mine={message.sender_id === 'me'}/>;

    case 'offer_request':
      return <window.OfferRequestCard message={message} conv={window.useStore().state.conversations.find(c => c.id === message.conversation_id)} mine={message.sender_id === 'me'}/>;

    case 'inquiry':
      return <window.InquiryBubble message={message} conv={window.useStore().state.conversations.find(c => c.id === message.conversation_id)} mine={message.sender_id === 'me'}/>;

    default:
      return <SafeText body={message.body || ''}/>;
  }
}

/* SafeText — runs every text body through the safety filter at render
   time. If anything matches (phone, email, external URL, payment app,
   handle), we replace it with ⛔ inline and show a banner under the
   bubble explaining why. This is defense-in-depth — the composer also
   blocks at send time, and the server blocks again. */
function SafeText({ body }) {
  if (!body) return null;
  const result = window.Safety?.redactForDisplay(body);
  if (result && typeof result === 'object' && result.redacted) {
    return (
      <>
        <div className="bub-text">{linkify(result.body)}</div>
        <div className="bub-safety">
          <Icons.Block size={11}/>
          <span>{result.labels.join(' · ')} hidden by safety filter — keep all contact on the platform.</span>
        </div>
      </>
    );
  }
  return <div className="bub-text">{linkify(body)}</div>;
}

/* ───── image ───── */
function ImageBody({ m, onImageClick }) {
  const a = m.attachment || {};
  const grad = a.gradient || ['#ECE6D5', '#D9D1BD'];
  return (
    <button className="bub-image" onClick={() => onImageClick?.(m)}>
      <div className="bub-image-canvas" style={{
        background: `linear-gradient(135deg, ${grad[0]}, ${grad[1]})`,
        aspectRatio: a.width && a.height ? `${a.width} / ${a.height}` : '4 / 5',
      }}>
        <span className="bub-image-glyph">{a.glyph || '🖼'}</span>
        <span className="bub-image-shimmer"/>
      </div>
      {m.body && <div className="bub-text" style={{paddingTop: 6}}>{linkify(m.body)}</div>}
    </button>
  );
}

function VideoBody({ m, onImageClick }) {
  const a = m.attachment || {};
  const grad = a.gradient || ['#3C3B6E', '#1A1942'];
  return (
    <button className="bub-image" onClick={() => onImageClick?.(m)}>
      <div className="bub-image-canvas" style={{ background: `linear-gradient(135deg, ${grad[0]}, ${grad[1]})`, aspectRatio: '16 / 9' }}>
        <span className="bub-image-glyph" style={{color:'#fff'}}><Icons.PlayCircle size={48}/></span>
        {a.duration_seconds && <span className="bub-video-dur">{window.fmtDuration(a.duration_seconds)}</span>}
      </div>
      {m.body && <div className="bub-text" style={{paddingTop: 6}}>{linkify(m.body)}</div>}
    </button>
  );
}

/* ───── document ───── */
function DocumentBody({ m }) {
  const a = m.attachment || {};
  const ext = (a.file_name || '').split('.').pop().toUpperCase().slice(0, 4);
  return (
    <a className="bub-doc" href="#" onClick={e => { e.preventDefault(); downloadAttachment(m); }}>
      <div className="bub-doc-icon">
        <Icons.Document size={22}/>
        <span className="bub-doc-ext">{ext}</span>
      </div>
      <div className="bub-doc-body">
        <div className="bub-doc-name">{a.file_name || 'Document'}</div>
        <div className="bub-doc-meta">
          {a.pages ? `${a.pages} page${a.pages === 1 ? '' : 's'} · ` : ''}{window.fmtFileSize(a.file_size)} · {ext}
        </div>
      </div>
      <Icons.Download size={18}/>
    </a>
  );
}

/* ───── voice ───── */
function VoiceBody({ m, isAudio }) {
  const a = m.attachment || {};
  const [playing, setPlaying] = React.useState(false);
  const [pos, setPos] = React.useState(0);   // 0..1
  const rafRef = React.useRef(null);
  const startRef = React.useRef(0);
  const startPosRef = React.useRef(0);
  const dur = a.duration_seconds || 30;
  const wave = a.waveform || Array.from({length: 36}, (_, i) => 12 + Math.sin(i * 0.7) * 18 + Math.random() * 8);

  const tick = () => {
    const elapsed = (performance.now() - startRef.current) / 1000;
    const p = startPosRef.current + elapsed / dur;
    if (p >= 1) { setPos(1); setPlaying(false); return; }
    setPos(p);
    rafRef.current = requestAnimationFrame(tick);
  };
  React.useEffect(() => {
    if (playing) {
      startRef.current = performance.now();
      startPosRef.current = pos >= 1 ? 0 : pos;
      rafRef.current = requestAnimationFrame(tick);
    } else if (rafRef.current) cancelAnimationFrame(rafRef.current);
    return () => rafRef.current && cancelAnimationFrame(rafRef.current);
  }, [playing]);

  const display = playing ? Math.round(dur * pos) : (pos > 0 ? Math.round(dur * pos) : dur);

  return (
    <div className="bub-voice">
      <button className="bub-voice-play" onClick={() => setPlaying(p => !p)}>
        {playing ? <Icons.Pause size={18}/> : <Icons.Play size={18}/>}
      </button>
      <div className="bub-voice-wave">
        {wave.map((h, i) => {
          const played = (i / wave.length) <= pos;
          return <span key={i} className={`wbar ${played ? 'on' : ''}`} style={{height: Math.max(3, h * 0.55)}}/>;
        })}
      </div>
      <div className="bub-voice-time">{window.fmtDuration(display)}</div>
      {isAudio && <Icons.Audio size={14}/>}
    </div>
  );
}

/* ───── location ───── */
function LocationBody({ m }) {
  const a = m.attachment || {};
  return (
    <a className="bub-location" target="_blank" rel="noreferrer"
       href={`https://www.openstreetmap.org/?mlat=${a.lat}&mlon=${a.lng}#map=15/${a.lat}/${a.lng}`}>
      <div className="bub-location-map">
        <svg viewBox="0 0 240 140" preserveAspectRatio="xMidYMid slice">
          <defs>
            <pattern id="mapgrid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#D9D1BD" strokeWidth="0.5"/>
            </pattern>
          </defs>
          <rect width="240" height="140" fill="#ECE6D5"/>
          <rect width="240" height="140" fill="url(#mapgrid)"/>
          <path d="M 0 80 Q 60 60 120 75 T 240 70" stroke="#7B7B72" strokeWidth="2" fill="none"/>
          <path d="M 30 0 L 30 140 M 120 0 L 120 140 M 200 0 L 200 140" stroke="#C9BFA6" strokeWidth="1"/>
          <circle cx="120" cy="70" r="6" fill="#B22234"/>
          <circle cx="120" cy="70" r="14" fill="#B22234" fillOpacity="0.2"/>
        </svg>
      </div>
      <div className="bub-location-meta">
        <Icons.Location size={16}/>
        <div>
          <div className="bub-location-label">{a.label || 'Shared location'}</div>
          <div className="bub-location-coords">{a.lat?.toFixed(4)}, {a.lng?.toFixed(4)}</div>
        </div>
      </div>
    </a>
  );
}

/* ───── contact ───── */
function ContactBody({ m }) {
  const a = m.attachment || {};
  return (
    <div className="bub-contact">
      <div className="bub-contact-av" style={{background: a.avatar_color || '#3C3B6E'}}>{a.initials || '?'}</div>
      <div className="bub-contact-body">
        <div className="bub-contact-name">{a.full_name || 'Contact'}</div>
        <div className="bub-contact-sub">{a.subtitle || a.phone || ''}</div>
      </div>
      <div className="bub-contact-actions">
        <button title="Message"><Icons.Chats size={16}/></button>
      </div>
    </div>
  );
}

/* ───── poll ───── */
function PollBody({ m }) {
  const a = m.attachment || {};
  const total = (a.options || []).reduce((s, o) => s + (o.votes?.length || 0), 0) || 1;
  return (
    <div className="bub-poll">
      <div className="bub-poll-q">{a.question || 'Poll'}</div>
      {(a.options || []).map((o, i) => {
        const pct = Math.round(((o.votes?.length || 0) / total) * 100);
        return (
          <div key={i} className="bub-poll-opt">
            <div className="bub-poll-bar" style={{width: `${pct}%`}}/>
            <div className="bub-poll-row">
              <span>{o.label}</span>
              <span className="bub-poll-pct">{pct}%</span>
            </div>
          </div>
        );
      })}
      <div className="bub-poll-foot">{total} vote{total === 1 ? '' : 's'} · View poll</div>
    </div>
  );
}

/* ───── helpers ───── */
function findMessageById(state, convId, id) {
  return (state.messages[convId] || []).find(m => m.id === id) || null;
}
function shortSnippet(m) {
  if (m.type === 'text') return (m.body || '').slice(0, 80);
  if (m.type === 'image') return '📷 Photo';
  if (m.type === 'video') return '🎥 Video';
  if (m.type === 'voice') return '🎙 Voice message';
  if (m.type === 'document') return `📄 ${m.attachment?.file_name || 'Document'}`;
  if (m.type === 'location') return '📍 Location';
  return '(message)';
}
function tailClass(isLastOfGroup, mine) {
  return isLastOfGroup ? (mine ? 'tail-r' : 'tail-l') : 'no-tail';
}
function withinEditWindow(m)   { return (Date.now() - new Date(m.created_at).getTime()) < 15 * 60_000; }
function withinDeleteWindow(m) { return (Date.now() - new Date(m.created_at).getTime()) < 60 * 60_000 * 2; }

function downloadAttachment(m) {
  /* Real backend: GET /api/messages/attachments/[id] returns a signed URL.
     Prototype: surface a tiny toast. */
  const evt = new CustomEvent('mc-toast', { detail: `Downloading ${m.attachment?.file_name || 'file'}…` });
  window.dispatchEvent(evt);
}

/* Linkify URLs and @mentions in plain text */
function linkify(text) {
  if (!text) return null;
  const parts = [];
  const re = /(https?:\/\/[^\s]+)|(\bord_[a-z0-9]+|MC-\d+)/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1])      parts.push(<a key={m.index} href={m[1]} target="_blank" rel="noreferrer" className="bub-link">{m[1]}</a>);
    else if (m[2]) parts.push(<a key={m.index} href="#" className="bub-link">{m[2]}</a>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  /* preserve line breaks */
  return parts.flatMap((p, i) => typeof p === 'string'
    ? p.split('\n').flatMap((line, j, arr) => j < arr.length - 1 ? [line, <br key={`${i}-${j}`}/>] : [line])
    : [p]);
}

window.MessageBubble = MessageBubble;
