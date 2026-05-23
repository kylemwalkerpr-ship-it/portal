/* ─────────────────────────────────────────────────────────────────────────
   Composer — the input bar at the bottom of every chat.
   Handles: typing draft (persisted), emoji picker, attachment menu
   (document / photos & videos / camera / audio / location / contact /
   poll), reply-quote preview, voice recording UI w/ live waveform,
   Enter-to-send + Shift+Enter newline, send button transforming into
   mic when input empty. All actions wire to store.sendMessage() and
   thus to the real API endpoints documented in HANDOFF.md.
   ───────────────────────────────────────────────────────────────────── */

const EMOJI = {
  'Smileys': ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','😎','🤓','🧐'],
  'Gestures': ['👍','👎','👌','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👋','🤚','🖐','✋','🖖','👏','🙌','🤲','🤝','🙏','✍️','💪'],
  'Hearts': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟'],
  'Symbols': ['✅','❌','⭐','✨','🎉','🔥','💯','📌','📎','📷','📄','📊','💼','📅','⏰','🔔','🔕','✉️','📨','📬','💬','💭'],
};

function Composer({ conv, replyingTo, onCancelReply, onForwardComposed }) {
  const store = window.useStore();
  const { state, sendMessage, setDraft } = store;
  const taRef = React.useRef(null);
  const [draft, setLocalDraft] = React.useState(conv.draft || '');
  const [showEmoji, setShowEmoji] = React.useState(false);
  const [showAttach, setShowAttach] = React.useState(false);
  const [recording, setRecording]   = React.useState(false);
  const [pollOpen, setPollOpen]     = React.useState(false);
  const [offerOpen, setOfferOpen]   = React.useState(false);
  const [offerPrefill, setOfferPrefill] = React.useState(null);
  const [safetyAlert, setSafetyAlert] = React.useState(null);  // { violations, attemptedBody }

  /* When the active chat changes, swap drafts */
  React.useEffect(() => { setLocalDraft(conv.draft || ''); }, [conv.id]);

  /* Persist draft on change (debounced) */
  React.useEffect(() => {
    const t = setTimeout(() => setDraft(conv.id, draft), 350);
    return () => clearTimeout(t);
  }, [draft, conv.id, setDraft]);

  /* Auto-grow textarea */
  React.useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(160, el.scrollHeight) + 'px';
  }, [draft]);

  /* Focus textarea when reply target appears */
  React.useEffect(() => { if (replyingTo) taRef.current?.focus(); }, [replyingTo]);

  /* Listen for "send offer back" / "send offer" CTAs fired from buyer-request
     bubbles, inquiry bubbles, or the chat header. Opens this conv's send-offer
     modal with the source object available as a prefill. */
  React.useEffect(() => {
    const onOpen = (e) => {
      if (e.detail?.conv_id && e.detail.conv_id !== conv.id) return;
      setOfferPrefill(e.detail?.prefill || null);
      setOfferOpen(true);
    };
    window.addEventListener('mc-open-offer-composer', onOpen);
    return () => window.removeEventListener('mc-open-offer-composer', onOpen);
  }, [conv.id]);

  /* Close popovers on outside click */
  React.useEffect(() => {
    if (!showEmoji && !showAttach) return;
    const onDoc = (e) => {
      if (!e.target.closest?.('[data-pop]')) {
        setShowEmoji(false);
        setShowAttach(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [showEmoji, showAttach]);

  const fileInputRef = React.useRef(null);
  const imageInputRef = React.useRef(null);
  const audioInputRef = React.useRef(null);

  const doSend = () => {
    const body = draft.trim();
    if (!body) return;
    /* Safety filter — block off-platform contact exfiltration. */
    const scan = window.Safety?.scanMessage(body);
    if (scan && !scan.ok) {
      setSafetyAlert({ violations: scan.hardViolations, attemptedBody: body, softViolations: scan.softViolations });
      return;
    }
    if (scan && scan.softViolations.length > 0 && !safetyAlert) {
      /* Soft prompt: confirm intent for things like "let's take this off-platform" */
      setSafetyAlert({ violations: [], attemptedBody: body, softViolations: scan.softViolations, soft: true });
      return;
    }
    sendMessage(conv.id, {
      type: 'text',
      body,
      reply_to_id: replyingTo?.id || null,
    });
    setLocalDraft('');
    setDraft(conv.id, '');
    onCancelReply?.();
    setSafetyAlert(null);
  };

  const sendAnyway = () => {
    /* For soft violations only — never bypass hard. */
    if (!safetyAlert?.soft) return;
    sendMessage(conv.id, { type: 'text', body: safetyAlert.attemptedBody, reply_to_id: replyingTo?.id || null });
    setLocalDraft('');
    setDraft(conv.id, '');
    onCancelReply?.();
    setSafetyAlert(null);
  };

  const onPickFile = (kind) => (e) => {
    const files = Array.from(e.target.files || []);
    const bad = files.find(f => !window.Safety?.scanAttachmentName(f.name).ok);
    if (bad) {
      setSafetyAlert({ violations: [{ type: 'filename', label: `file name "${bad.name}"` }], attemptedBody: bad.name });
      e.target.value = '';
      return;
    }
    files.forEach(f => {
      sendMessage(conv.id, attachmentMessageFromFile(f, kind, draft));
    });
    setLocalDraft('');
    e.target.value = '';
  };

  const sendLocation = () => {
    if (!navigator.geolocation) {
      sendMessage(conv.id, { type: 'location', attachment: { kind: 'location', label: 'Current location (mock)', lat: 40.7128, lng: -74.0060 } });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => sendMessage(conv.id, { type: 'location', attachment: { kind: 'location', label: 'Current location', lat: pos.coords.latitude, lng: pos.coords.longitude } }),
      () =>  sendMessage(conv.id, { type: 'location', attachment: { kind: 'location', label: 'Approximate location', lat: 40.7128, lng: -74.0060 } }),
    );
    setShowAttach(false);
  };

  const sendContact = () => {
    /* Quick demo: share own contact card */
    sendMessage(conv.id, { type: 'contact', attachment: {
      kind: 'contact',
      full_name: state.me.full_name,
      subtitle: state.me.status,
      initials: state.me.initials,
      avatar_color: state.me.avatar_color,
      phone: '+1 (212) 555-0119',
    }});
    setShowAttach(false);
  };

  if (conv.blocked) {
    return (
      <div className="comp comp-blocked">
        <Icons.Block size={16}/>
        <span>You blocked {window.useStore().getPerson(conv.counterpart_id)?.full_name?.split(' ')[0] || 'this contact'}. Unblock to message.</span>
        <button onClick={() => store.toggleBlock(conv.id)}>Unblock</button>
      </div>
    );
  }

  /* Offer button — sellers only (attorney/consultant). Buyers can REQUEST
     a custom offer via the same modal in "request" mode. */
  const counterpart = conv.type === 'dm' ? store.getPerson(conv.counterpart_id) : null;
  const meIsSeller = ['attorney', 'consultant'].includes(state.me.role);
  const cpIsSeller = ['attorney', 'consultant'].includes(counterpart?.role);
  const showOfferBtn = (meIsSeller && !cpIsSeller) || (!meIsSeller && cpIsSeller);
  const offerMode    = meIsSeller ? 'send' : 'request';

  return (
    <div className="comp">
      {replyingTo && (
        <div className="comp-reply">
          <div className="comp-reply-bar" style={{background: replyingTo.sender_id === state.me.id ? 'var(--accent)' : '#5C6070'}}/>
          <div className="comp-reply-body">
            <div className="comp-reply-name">
              {replyingTo.sender_id === state.me.id ? 'You' : (store.getPerson(replyingTo.sender_id)?.full_name || 'Member')}
            </div>
            <div className="comp-reply-snip">{shortReplySnip(replyingTo)}</div>
          </div>
          <button className="iconbtn" onClick={onCancelReply}><Icons.X size={16}/></button>
        </div>
      )}

      {recording ? (
        <RecordingBar onCancel={() => setRecording(false)} onSend={(secs, waveform) => {
          sendMessage(conv.id, { type: 'voice', attachment: { kind: 'voice', duration_seconds: secs, waveform } });
          setRecording(false);
        }}/>
      ) : (
        <div className="comp-row">
          {showOfferBtn && (
            <button className="comp-offer" title={offerMode === 'send' ? 'Send a custom offer' : 'Request a custom offer'} onClick={() => setOfferOpen(true)}>
              <span className="comp-offer-icon">💼</span>
              <span>{offerMode === 'send' ? 'Offer' : 'Request offer'}</span>
            </button>
          )}
          <button className={`iconbtn comp-emoji ${showEmoji ? 'on' : ''}`} data-pop onClick={() => { setShowEmoji(v => !v); setShowAttach(false); }}>
            <Icons.Smile size={22}/>
          </button>
          <button className={`iconbtn comp-attach ${showAttach ? 'on' : ''}`} data-pop onClick={() => { setShowAttach(v => !v); setShowEmoji(false); }}>
            <Icons.Plus size={22}/>
          </button>

          <textarea
            ref={taRef}
            className="comp-input"
            placeholder="Type a message"
            value={draft}
            rows={1}
            onChange={e => setLocalDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
              if (e.key === 'Escape' && replyingTo) onCancelReply?.();
            }}
          />

          {draft.trim()
            ? <button className="iconbtn comp-send" title="Send" onClick={doSend}><Icons.Send size={22} color="#fff"/></button>
            : <button className="iconbtn comp-mic"  title="Hold to record" onMouseDown={() => setRecording(true)}><Icons.Mic size={22} color="#fff"/></button>}

          {showEmoji && (
            <div className="pop emoji-pop" data-pop>
              {Object.entries(EMOJI).map(([cat, list]) => (
                <div key={cat}>
                  <div className="emoji-cat">{cat}</div>
                  <div className="emoji-grid">
                    {list.map(em => <button key={em} onClick={() => { setLocalDraft(d => d + em); taRef.current?.focus(); }}>{em}</button>)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {showAttach && (
            <div className="pop attach-pop" data-pop>
              <AttachItem icon={<Icons.Document size={18}/>} color="#8E44AD" label="Document" onClick={() => fileInputRef.current?.click()}/>
              <AttachItem icon={<Icons.Photo    size={18}/>} color="#3C8DBC" label="Photos & videos" onClick={() => imageInputRef.current?.click()}/>
              <AttachItem icon={<Icons.Camera   size={18}/>} color="#E91E63" label="Camera" onClick={() => imageInputRef.current?.click()}/>
              <AttachItem icon={<Icons.Audio    size={18}/>} color="#F39C12" label="Audio" onClick={() => audioInputRef.current?.click()}/>
              <AttachItem icon={<Icons.Location size={18}/>} color="#1A6B45" label="Location" onClick={sendLocation}/>
              <AttachItem icon={<Icons.Contact  size={18}/>} color="#2A6FDB" label="Contact" onClick={sendContact}/>
              <AttachItem icon={<Icons.Poll     size={18}/>} color="#F1C40F" label="Poll" onClick={() => { setPollOpen(true); setShowAttach(false); }}/>
            </div>
          )}

          <input ref={fileInputRef}  type="file" hidden multiple onChange={onPickFile('document')}/>
          <input ref={imageInputRef} type="file" hidden multiple accept="image/*,video/*" onChange={onPickFile('image')}/>
          <input ref={audioInputRef} type="file" hidden multiple accept="audio/*" onChange={onPickFile('audio')}/>
        </div>
      )}

      {pollOpen && (
        <PollComposer
          onCancel={() => setPollOpen(false)}
          onSend={(poll) => {
            sendMessage(conv.id, { type: 'poll', attachment: poll });
            setPollOpen(false);
          }}/>
      )}

      {offerOpen && <window.OfferComposer conv={conv} mode={offerMode} prefill={offerPrefill} onClose={() => { setOfferOpen(false); setOfferPrefill(null); }}/>}

      {safetyAlert && (
        <SafetyAlert
          alert={safetyAlert}
          onCancel={() => setSafetyAlert(null)}
          onEdit={() => { setSafetyAlert(null); taRef.current?.focus(); }}
          onSendAnyway={safetyAlert.soft ? sendAnyway : null}
        />
      )}
    </div>
  );
}

/* ───── safety alert dialog ───── */
function SafetyAlert({ alert, onCancel, onEdit, onSendAnyway }) {
  const labels = [...new Set(alert.violations.map(v => v.label))];
  const isSoft = !!alert.soft;
  return (
    <div className="poll-modal-backdrop" onClick={onCancel}>
      <div className="safety-modal" onClick={e => e.stopPropagation()}>
        <div className="safety-modal-icon">
          <Icons.Block size={36} color={isSoft ? 'var(--gold-deep)' : 'var(--danger)'}/>
        </div>
        <h3 className="safety-modal-title">{isSoft ? "Keep it on Yousafe" : "Message blocked"}</h3>
        <p className="safety-modal-body">
          {isSoft ? (
            <>It looks like this message might invite contact outside Yousafe. Sharing personal contact details breaks the platform terms and removes our ability to protect you and your money.</>
          ) : (
            <>This message was blocked because it contains {labels.length === 1 ? <b>{labels[0]}</b> : <>the following: <b>{labels.join(', ')}</b></>}. To protect both parties, all communication, file exchange and payment must stay on Yousafe.</>
          )}
        </p>
        {alert.violations.length > 0 && (
          <ul className="safety-modal-list">
            {alert.violations.slice(0, 4).map((v, i) => (
              <li key={i}><Icons.Block size={11}/> {v.label}: <code>{(v.raw || '').slice(0, 40)}</code></li>
            ))}
          </ul>
        )}
        <p className="safety-modal-foot">
          Need to share documents or coordinate? Use this chat, the attachment menu, or open a video call from the chat header. Every interaction is covered by our money-back guarantee.
        </p>
        <div className="safety-modal-actions">
          <button onClick={onEdit} className="primary">Edit message</button>
          {onSendAnyway && <button onClick={onSendAnyway} className="ghost">Send anyway</button>}
          <button onClick={onCancel} className="ghost">Cancel</button>
        </div>
      </div>
    </div>
  );
}

/* ───── attachment menu item ───── */
function AttachItem({ icon, color, label, onClick }) {
  return (
    <button className="attach-item" onClick={onClick}>
      <span className="attach-icon" style={{background: color}}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

/* ───── voice recording bar ───── */
function RecordingBar({ onCancel, onSend }) {
  const [secs, setSecs] = React.useState(0);
  const [wave, setWave] = React.useState([]);
  React.useEffect(() => {
    const t = setInterval(() => {
      setSecs(s => s + 0.1);
      setWave(w => [...w.slice(-60), 12 + Math.random() * 38]);
    }, 100);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="comp-row recording">
      <button className="iconbtn rec-cancel" onClick={onCancel} title="Cancel"><Icons.Trash size={20} color="var(--danger)"/></button>
      <div className="rec-dot"/>
      <div className="rec-time">{window.fmtDuration(secs)}</div>
      <div className="rec-wave">
        {wave.map((h, i) => <span key={i} style={{height: h}}/>)}
      </div>
      <div className="rec-hint">Tap send to share</div>
      <button className="iconbtn comp-send" onClick={() => onSend(Math.max(1, Math.round(secs)), wave)}>
        <Icons.Send size={22} color="#fff"/>
      </button>
    </div>
  );
}

/* ───── poll composer ───── */
function PollComposer({ onCancel, onSend }) {
  const [q, setQ] = React.useState('');
  const [opts, setOpts] = React.useState(['', '']);
  const update = (i, v) => setOpts(o => o.map((x, idx) => idx === i ? v : x));
  const add    = () => setOpts(o => o.length < 12 ? [...o, ''] : o);
  const remove = (i) => setOpts(o => o.length > 2 ? o.filter((_, idx) => idx !== i) : o);
  const valid = q.trim() && opts.filter(o => o.trim()).length >= 2;

  return (
    <div className="poll-modal-backdrop" onClick={onCancel}>
      <div className="poll-modal" onClick={e => e.stopPropagation()}>
        <div className="poll-modal-head">
          <div>Create poll</div>
          <button className="iconbtn" onClick={onCancel}><Icons.X size={18}/></button>
        </div>
        <label>Question</label>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Ask the group…" maxLength={140}/>
        <label style={{marginTop: 12}}>Options</label>
        {opts.map((o, i) => (
          <div key={i} className="poll-modal-opt">
            <input value={o} onChange={e => update(i, e.target.value)} placeholder={`Option ${i + 1}`} maxLength={50}/>
            {opts.length > 2 && <button className="iconbtn" onClick={() => remove(i)}><Icons.X size={16}/></button>}
          </div>
        ))}
        {opts.length < 12 && (
          <button className="poll-modal-add" onClick={add}><Icons.Plus size={14}/> Add option</button>
        )}
        <div className="poll-modal-actions">
          <button onClick={onCancel}>Cancel</button>
          <button disabled={!valid} className="primary" onClick={() => onSend({
            kind: 'poll',
            question: q.trim(),
            options: opts.filter(o => o.trim()).map(label => ({ label: label.trim(), votes: [] })),
            allow_multiple: false,
          })}>Send poll</button>
        </div>
      </div>
    </div>
  );
}

/* ───── helpers ───── */
function attachmentMessageFromFile(file, kind, caption) {
  const mime = file.type || 'application/octet-stream';
  const isImage = mime.startsWith('image/');
  const isVideo = mime.startsWith('video/');
  const isAudio = mime.startsWith('audio/');

  /* Generate a soft random gradient placeholder so the prototype shows
     something even though we never actually upload the file. */
  const palette = [
    ['#3C3B6E', '#1A1942'],
    ['#5F6B3A', '#3a4524'],
    ['#B22234', '#7a1722'],
    ['#C4A45A', '#8a702f'],
    ['#2A6FDB', '#15448e'],
    ['#1F8A5B', '#11503a'],
    ['#D97757', '#a04a30'],
  ];
  const grad = palette[Math.floor(Math.random() * palette.length)];

  if (isImage) {
    return {
      type: 'image',
      body: caption || null,
      attachment: { kind: 'image', file_name: file.name, mime_type: mime, file_size: file.size, gradient: grad, glyph: extOf(file.name) },
    };
  }
  if (isVideo) {
    return {
      type: 'video',
      body: caption || null,
      attachment: { kind: 'video', file_name: file.name, mime_type: mime, file_size: file.size, gradient: grad, duration_seconds: 12 },
    };
  }
  if (isAudio) {
    return {
      type: 'audio',
      attachment: { kind: 'audio', file_name: file.name, mime_type: mime, file_size: file.size,
        duration_seconds: 35,
        waveform: Array.from({length: 38}, () => 10 + Math.random() * 40) },
    };
  }
  return {
    type: 'document',
    attachment: { kind: 'document', file_name: file.name, mime_type: mime, file_size: file.size, pages: null },
  };
}

const extOf = (n) => (n || '').split('.').pop().toUpperCase().slice(0, 4);
const shortReplySnip = (m) => {
  if (m.type === 'text') return (m.body || '').slice(0, 80);
  if (m.type === 'image') return '📷 Photo';
  if (m.type === 'video') return '🎥 Video';
  if (m.type === 'voice') return '🎙 Voice message';
  if (m.type === 'document') return `📄 ${m.attachment?.file_name || 'Document'}`;
  if (m.type === 'location') return '📍 Location';
  return '(message)';
};

window.Composer = Composer;
