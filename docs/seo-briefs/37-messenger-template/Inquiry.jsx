/* ─────────────────────────────────────────────────────────────────────────
   Inquiry + Status + Marketplace UI
   ─────────────────────────────────────────────────────────────────────────
   ▸ InquiryComposer  — 5-step, picker-heavy modal a buyer fills out to
                        broadcast a new inquiry.
   ▸ InquiryStatusRing — green-gradient ring around an avatar when its
                        owner has an active 24h status.
   ▸ InquiryStatusViewer — WhatsApp-style story viewer for status posts.
   ▸ MarketplaceFeed  — seller-side live feed of open inquiries.
   ▸ InquiryBubble    — message-bubble renderer for a posted inquiry
                        injected into a conv by claimInquiry().

   The five steps are non-negotiable: 1) Country, 2) Case type,
   3) Pickers about the case, 4) Urgency + prior issues, 5) Review &
   post. Steps 3 and 4 self-skip if the underlying case type has nothing
   to ask. Every question uses a tappable card / chip; no naked text
   fields except the optional summary on Review.
   ───────────────────────────────────────────────────────────────────── */

/* ───── 5-step inquiry composer ───── */
function InquiryComposer({ onClose }) {
  const store = window.useStore();
  const [step, setStep]       = React.useState(0);
  const [country, setCountry] = React.useState(null);
  const [caseType, setCaseType] = React.useState(null);
  const [answers, setAnswers] = React.useState({});
  const [headline, setHeadline] = React.useState('');
  const [summary, setSummary]   = React.useState('');
  const [error, setError]       = React.useState(null);

  const countryObj  = country  ? window.INQUIRY_LOOKUP.country(country) : null;
  const caseTypeObj = caseType ? window.INQUIRY_LOOKUP.caseType(country, caseType) : null;

  /* What questions go in Step 3? Pickers only — keep it frictionless. */
  const stepThreeQuestions = React.useMemo(() => {
    if (!caseTypeObj) return [];
    return caseTypeObj.questions.filter(q => q.type === 'select' || q.type === 'multiselect');
  }, [caseTypeObj]);

  /* Step 4 always asks urgency; prior-denial only for immigration tracks. */
  const stepFourQuestions = React.useMemo(() => {
    const q = [window.INQUIRY_URGENCY_QUESTION];
    if (caseType && !['tenancy', 'loan', 'other_us', 'other_uk', 'other_ca'].includes(caseType)) {
      q.push(window.INQUIRY_PRIOR_DENIAL_QUESTION);
    }
    return q;
  }, [caseType]);

  /* Auto-headline from the case type when it changes */
  React.useEffect(() => {
    if (caseTypeObj && !headline) setHeadline(caseTypeObj.label);
  }, [caseTypeObj]);

  const STEPS = [
    { id: 'country',  label: 'Country',   short: '01' },
    { id: 'case',     label: 'Case type', short: '02' },
    { id: 'details',  label: 'Details',   short: '03' },
    { id: 'urgency',  label: 'Urgency',   short: '04' },
    { id: 'review',   label: 'Review',    short: '05' },
  ];

  const canGoNext = () => {
    if (step === 0) return !!country;
    if (step === 1) return !!caseType;
    if (step === 2) {
      return stepThreeQuestions.filter(q => q.required).every(q => answers[q.id]);
    }
    if (step === 3) {
      return stepFourQuestions.filter(q => q.required).every(q => answers[q.id]);
    }
    return !!headline.trim();
  };

  const goNext = () => {
    setError(null);
    if (!canGoNext()) { setError('Pick an option to continue.'); return; }
    /* Self-skip step 3 if no picker questions; self-skip step 4 if no Qs. */
    let next = step + 1;
    if (next === 2 && stepThreeQuestions.length === 0) next = 3;
    if (next === 3 && stepFourQuestions.length === 0)  next = 4;
    if (next > 4) return submit();
    setStep(next);
  };
  const goBack = () => {
    setError(null);
    let prev = step - 1;
    if (prev === 3 && stepFourQuestions.length === 0)  prev = 2;
    if (prev === 2 && stepThreeQuestions.length === 0) prev = 1;
    if (prev < 0) prev = 0;
    setStep(prev);
  };

  const submit = () => {
    if (!headline.trim() || headline.trim().length < 5) {
      setError('Give your inquiry a short headline.');
      setStep(4);
      return;
    }
    const scan = window.Safety.scanMessage(headline + ' ' + (summary || ''));
    if (!scan.ok) {
      setError("Contact info isn't allowed — keep it on Yousafe.");
      setStep(4);
      return;
    }
    const inquiry = store.createInquiry({
      country, case_type: caseType,
      answers,
      headline: headline.trim(),
      summary: summary.trim() || null,
    });
    onClose?.(inquiry);
  };

  return (
    <div className="of-modal-backdrop" onClick={onClose}>
      <div className="of-modal inq-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="of-modal-head">
          <div className="of-modal-eyebrow"><Icons.Document size={11}/> Marketplace · New inquiry</div>
          <button className="iconbtn of-modal-close" onClick={onClose} aria-label="Close"><Icons.X size={18}/></button>
        </div>

        <div className="inq-progress">
          {STEPS.map((s, i) => (
            <button key={s.id}
                    className={`inq-step ${i === step ? 'on' : ''} ${i < step ? 'done' : ''}`}
                    onClick={() => i < step && setStep(i)}
                    disabled={i > step}>
              <span className="inq-step-num">{s.short}</span>
              <span className="inq-step-lbl">{s.label}</span>
              {i < STEPS.length - 1 && <span className="inq-step-bar" aria-hidden="true"/>}
            </button>
          ))}
        </div>

        <div className="inq-modal-body">
          {step === 0 && <StepCountry value={country} onPick={(c) => { setCountry(c); setCaseType(null); setAnswers({}); setStep(1); }}/>}
          {step === 1 && <StepCaseType country={countryObj} value={caseType} onPick={(c) => { setCaseType(c); setAnswers(a => ({})); setStep(2); }}/>}
          {step === 2 && <StepQuestions questions={stepThreeQuestions} answers={answers} setAnswers={setAnswers}/>}
          {step === 3 && <StepQuestions questions={stepFourQuestions} answers={answers} setAnswers={setAnswers}/>}
          {step === 4 && (
            <StepReview
              country={countryObj} caseType={caseTypeObj} answers={answers}
              headline={headline} setHeadline={setHeadline}
              summary={summary} setSummary={setSummary}
            />
          )}
        </div>

        {error && <div className="of-modal-error"><Icons.Block size={13}/> {error}</div>}

        <div className="of-modal-foot">
          <div className="of-modal-foot-note">
            <Icons.Block size={12}/>
            Posts as a 24h status on your avatar so prior sellers can see it instantly.
          </div>
          <div className="of-modal-foot-actions">
            {step > 0
              ? <button type="button" className="of-btn ghost" onClick={goBack}><Icons.ChevronLeft size={14}/> Back</button>
              : <button type="button" className="of-btn ghost" onClick={onClose}>Cancel</button>}
            <button type="button" className="of-btn primary" onClick={goNext}>
              {step < 4 ? <>Next <Icons.ChevronRight size={14}/></> : <><Icons.Send size={14}/> Post inquiry</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Step 1: country ── */
function StepCountry({ value, onPick }) {
  return (
    <div className="inq-step-pane">
      <h3 className="inq-step-title">Which country is your case in?</h3>
      <p className="inq-step-help">Routing rules and the legal questions we ask next depend on your jurisdiction.</p>
      <div className="inq-country-grid">
        {window.INQUIRY_COUNTRIES.map(c => (
          <button key={c.id} className={`inq-country-card ${value === c.id ? 'on' : ''}`} onClick={() => onPick(c.id)}>
            <div className="inq-country-flag">{c.flag}</div>
            <div className="inq-country-name">{c.label}</div>
            <div className="inq-country-blurb">{c.blurb}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Step 2: case type ── */
function StepCaseType({ country, value, onPick }) {
  if (!country) return null;
  return (
    <div className="inq-step-pane">
      <h3 className="inq-step-title">What's the case about?</h3>
      <p className="inq-step-help">Pick the closest match — you can add nuance on the next screen.</p>
      <div className="inq-case-grid">
        {country.caseTypes.map(ct => (
          <button key={ct.id} className={`inq-case-card ${value === ct.id ? 'on' : ''}`} onClick={() => onPick(ct.id)}>
            <div className="inq-case-icon" aria-hidden="true">{ct.icon || '📋'}</div>
            <div className="inq-case-body">
              <div className="inq-case-label">
                {ct.label}
                {ct.hot && <span className="inq-case-hot">Hot</span>}
              </div>
              <div className="inq-case-count">{ct.questions.length} quick question{ct.questions.length === 1 ? '' : 's'}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Generic picker step (used by step 3 + step 4) ── */
function StepQuestions({ questions, answers, setAnswers }) {
  if (!questions || questions.length === 0) {
    return <div className="inq-step-pane"><p className="inq-step-help">Nothing to ask here. Tap Next.</p></div>;
  }

  const setOne = (id, val) => setAnswers(a => ({ ...a, [id]: val }));

  return (
    <div className="inq-step-pane">
      {questions.map(q => (
        <div key={q.id} className="inq-question">
          <div className="inq-question-head">
            <span className="inq-question-label">
              {q.label}
              {q.required && <span className="inq-question-req">*</span>}
            </span>
            {q.help && <span className="inq-question-help">{q.help}</span>}
          </div>
          {(q.type === 'select' || q.type === 'multiselect') && (
            <div className="inq-options">
              {q.options.map(opt => {
                const selected = q.type === 'multiselect'
                  ? (Array.isArray(answers[q.id]) && answers[q.id].includes(opt.id))
                  : answers[q.id] === opt.id;
                return (
                  <button key={opt.id}
                          className={`inq-option ${selected ? 'on' : ''}`}
                          onClick={() => {
                            if (q.type === 'multiselect') {
                              const cur = Array.isArray(answers[q.id]) ? answers[q.id] : [];
                              setOne(q.id, cur.includes(opt.id) ? cur.filter(x => x !== opt.id) : [...cur, opt.id]);
                            } else {
                              setOne(q.id, opt.id);
                            }
                          }}>
                    <span className="inq-option-dot" aria-hidden="true">
                      {selected && <Icons.Check size={12} color="#fff"/>}
                    </span>
                    <span className="inq-option-body">
                      <span className="inq-option-label">{opt.label}</span>
                      {opt.help && <span className="inq-option-help">{opt.help}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Step 5: review + headline ── */
function StepReview({ country, caseType, answers, headline, setHeadline, summary, setSummary }) {
  const tier = window.INQUIRY_RECOMMEND_TIER(answers || {});
  const tierTone = tier.tier === 'Professional' ? 'urgent' : tier.tier === 'Enhanced' ? 'standard' : 'easy';

  /* List selected answers for display */
  const allQuestions = [
    ...(caseType?.questions || []),
    window.INQUIRY_URGENCY_QUESTION,
    window.INQUIRY_PRIOR_DENIAL_QUESTION,
  ];
  const lines = [];
  for (const q of allQuestions) {
    const v = answers[q.id];
    if (!v) continue;
    if (q.options) {
      const opt = q.options.find(o => o.id === v);
      if (opt) lines.push({ label: q.label, value: opt.label });
    } else if (typeof v === 'string' && v.trim()) {
      lines.push({ label: q.label, value: v });
    }
  }

  return (
    <div className="inq-step-pane inq-review">
      <h3 className="inq-step-title">Review your inquiry</h3>
      <p className="inq-step-help">Sellers see this exactly as you write it. Keep contact details out — they're auto-blocked.</p>

      <div className="inq-review-grid">
        <div className="inq-review-form">
          <label className="of-field">
            <span className="of-label">Headline</span>
            <input className="of-input" value={headline} onChange={e => setHeadline(e.target.value)} placeholder={caseType?.label || 'Short headline'} maxLength={120}/>
            <span className="of-helper">{headline.length}/120</span>
          </label>
          <label className="of-field">
            <span className="of-label">Short summary <span className="of-label-opt">(optional)</span></span>
            <textarea className="of-input of-textarea" value={summary} onChange={e => setSummary(e.target.value)} placeholder="2–3 sentences. The first attorney to reply gets the conversation." rows={3} maxLength={400}/>
            <span className="of-helper">{summary.length}/400</span>
          </label>
        </div>

        <aside className="inq-review-side">
          <div className="inq-side-card">
            <div className="inq-side-head">
              <div className="inq-side-flag">{country?.flag}</div>
              <div>
                <div className="inq-side-country">{country?.label}</div>
                <div className="inq-side-case">{caseType?.label}</div>
              </div>
            </div>
            <div className="inq-side-answers">
              {lines.map((l, i) => (
                <div key={i} className="inq-side-answer">
                  <span className="inq-side-answer-l">{l.label}</span>
                  <span className="inq-side-answer-v">{l.value}</span>
                </div>
              ))}
              {lines.length === 0 && <div className="inq-side-empty">No specifics yet.</div>}
            </div>
          </div>

          <div className={`inq-tier-card inq-tier-${tierTone}`}>
            <div className="inq-tier-eyebrow">Suggested tier</div>
            <div className="inq-tier-name">{tier.tier}</div>
            <div className="inq-tier-price">{tier.price}</div>
            <div className="inq-tier-desc">{tier.description}</div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   STATUS RING — pure presentational. Wraps an avatar with a
   ring that indicates "this person has an active inquiry / status".
   Pass an existing avatar element as `children`.
   ─────────────────────────────────────────────────────────────────── */
function InquiryStatusRing({ personId, size = 48, onClick, viewed, children, className = '' }) {
  const store = window.useStore();
  const list = store.state.statuses?.[personId] || [];
  const active = list.filter(s => new Date(s.expires_at).getTime() > Date.now());
  if (active.length === 0) return <>{children}</>;
  const allViewed = active.every(s => s.viewers?.includes('me') || s.viewers?.includes(store.state.me.id));
  return (
    <button type="button"
            className={`statusring ${allViewed || viewed ? 'viewed' : ''} ${className}`}
            style={{width: size + 8, height: size + 8}}
            onClick={(e) => { e.stopPropagation(); onClick?.(personId); }}
            title={`${active.length} active inquiry · tap to view`}
            aria-label="View status">
      <div className="statusring-inner" style={{width: size, height: size}}>
        {children}
      </div>
    </button>
  );
}

/* ─── Status viewer (WhatsApp story-style) ─── */
function InquiryStatusViewer({ personId, onClose }) {
  const store = window.useStore();
  const person = personId === 'me' ? store.state.me : store.getPerson(personId);
  const list = (store.state.statuses?.[personId] || []).filter(s => new Date(s.expires_at).getTime() > Date.now());
  const [idx, setIdx] = React.useState(0);
  const [progress, setProgress] = React.useState(0);
  const status = list[idx];
  const inquiry = status?.inquiry_id ? store.state.inquiries?.find(i => i.id === status.inquiry_id) : null;
  const isMine = personId === 'me' || personId === store.state.me.id;

  /* progress bar / auto-advance */
  React.useEffect(() => {
    if (!status) return;
    setProgress(0);
    const start = performance.now();
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / 5000);
      setProgress(p);
      if (p < 1) raf = requestAnimationFrame(tick);
      else if (idx < list.length - 1) setIdx(i => i + 1);
      else onClose?.();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [idx, status?.id]);

  React.useEffect(() => {
    if (status && !isMine) store.markStatusViewed(personId, status.id);
  }, [status?.id]);

  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
      if (e.key === 'ArrowLeft')  setIdx(i => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setIdx(i => i < list.length - 1 ? i + 1 : i);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [list.length]);

  if (!status) return null;
  const urgency = status.urgency;
  const urgencyLabel = urgency === 'now' ? 'Within 30 days' : urgency === 'soon' ? '1–3 months' : urgency === 'later' ? '3–6 months' : 'Just exploring';
  const tone = urgency === 'now' ? 'urgent' : urgency === 'soon' ? 'standard' : 'easy';

  const meIsSeller = ['attorney','consultant'].includes(store.state.me.role);

  return (
    <div className="status-viewer" onClick={onClose}>
      <div className="status-stage" onClick={e => e.stopPropagation()}>
        <div className="status-progress">
          {list.map((_, i) => (
            <div key={i} className="status-progress-track">
              <div className="status-progress-fill"
                   style={{width: i < idx ? '100%' : i === idx ? `${progress * 100}%` : '0%'}}/>
            </div>
          ))}
        </div>

        <div className="status-head">
          <div className="status-author">
            <div className="row-avatar" style={{background: person?.avatar_color || '#3C3B6E', width: 38, height: 38}}>{person?.initials || '?'}</div>
            <div>
              <div className="status-author-name">{isMine ? 'You' : person?.full_name}</div>
              <div className="status-author-time">{window.fmtRelative(status.created_at)} · {isMine ? `${(status.viewers || []).length} viewer${(status.viewers || []).length === 1 ? '' : 's'}` : 'New inquiry'}</div>
            </div>
          </div>
          <button className="iconbtn" onClick={onClose}><Icons.X size={20} color="#fff"/></button>
        </div>

        <div className="status-card">
          <div className="status-card-eyebrow">
            <span className="status-card-flag">{status.country_flag}</span>
            <span>New marketplace inquiry</span>
          </div>
          <h3 className="status-card-title">{status.case_type_label}</h3>
          {inquiry && (
            <>
              <p className="status-card-summary">{inquiry.summary || inquiry.headline}</p>
              <div className="status-card-meta">
                <span className={`status-card-chip status-chip-${tone}`}>{urgencyLabel}</span>
                <span className="status-card-chip status-card-chip-tier">{inquiry.tier?.tier}</span>
              </div>
            </>
          )}
          {!inquiry && (
            <div className="status-card-meta"><span className={`status-card-chip status-chip-${tone}`}>{urgencyLabel}</span></div>
          )}
        </div>

        <div className="status-foot">
          {meIsSeller && !isMine && inquiry?.status === 'open' && (
            <button className="of-btn primary" onClick={() => { store.claimInquiry(inquiry.id); onClose?.(); }}>
              <Icons.Send size={14}/> Reply to inquiry
            </button>
          )}
          {isMine && <span className="status-foot-note">Posted to your prior sellers. Visible to attorneys + consultants on the marketplace.</span>}
          {!meIsSeller && !isMine && <span className="status-foot-note">Only attorneys and consultants can respond to inquiries.</span>}
        </div>

        <button className="status-nav status-nav-l" onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0}><Icons.ChevronLeft size={28} color="#fff"/></button>
        <button className="status-nav status-nav-r" onClick={() => idx < list.length - 1 && setIdx(i => i + 1)} disabled={idx >= list.length - 1}><Icons.ChevronRight size={28} color="#fff"/></button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   MARKETPLACE FEED — seller's left rail when "view" === 'marketplace'.
   ─────────────────────────────────────────────────────────────────── */
function MarketplaceFeed({ onOpenSettings, onOpenStarred, onNewChat, onOpenStatus }) {
  const store = window.useStore();
  const { state, setUI } = store;
  const filter = state.ui.marketplace_filter || 'all';
  const meCountry = null; /* could come from seller profile in prod */

  const inquiries = React.useMemo(() => {
    let list = (state.inquiries || []).filter(i => i.status === 'open');
    if (filter === 'urgent') list = list.filter(i => i.urgency === 'now');
    if (filter === 'matching' && meCountry) list = list.filter(i => i.country === meCountry);
    return list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [state.inquiries, filter]);

  const urgentCount = (state.inquiries || []).filter(i => i.status === 'open' && i.urgency === 'now').length;
  const openCount   = (state.inquiries || []).filter(i => i.status === 'open').length;

  /* Realtime simulator: every ~25 seconds, pretend a new inquiry rolls in.
     In production this hooks into the Supabase realtime channel. */
  const [pulse, setPulse] = React.useState(false);
  React.useEffect(() => {
    const onCreate = () => { setPulse(true); setTimeout(() => setPulse(false), 1200); };
    window.addEventListener('mc-inquiry-created', onCreate);
    return () => window.removeEventListener('mc-inquiry-created', onCreate);
  }, []);

  return (
    <aside className={`cl mkt-feed ${pulse ? 'mkt-pulse' : ''}`}>
      <div className="cl-head">
        <div className="cl-title">
          <div className="cl-title-l">
            <div className="cl-avatar" style={{background: state.me.avatar_color}}>{state.me.initials}</div>
            <div>
              <div className="cl-title-name">Marketplace</div>
              <div className="cl-title-sub">{openCount} open · {urgentCount} urgent</div>
            </div>
          </div>
          <div className="cl-title-r">
            <button className="iconbtn" title="Settings" onClick={onOpenSettings}><Icons.Settings size={18}/></button>
          </div>
        </div>
        <div className="cl-filters">
          {[
            { id: 'all',      label: 'All open',  count: openCount },
            { id: 'urgent',   label: 'Urgent',    count: urgentCount },
            { id: 'matching', label: 'Matching',  count: 0 },
          ].map(f => (
            <button key={f.id} className={`cl-pill ${filter === f.id ? 'on' : ''}`} onClick={() => setUI({ marketplace_filter: f.id })}>
              {f.label}
              {f.count > 0 && <span className="cl-pill-count">{f.count}</span>}
            </button>
          ))}
        </div>
        <div className="mkt-live">
          <span className="mkt-live-dot"/>
          <span>Live · updates as buyers post</span>
        </div>
      </div>

      <div className="cl-scroll">
        {inquiries.length === 0 && (
          <div className="cl-empty">
            No open inquiries match this filter. Try widening it, or check back — new inquiries land in real time.
          </div>
        )}
        {inquiries.map(inq => <InquiryRow key={inq.id} inquiry={inq} onOpenStatus={onOpenStatus}/>)}
      </div>
    </aside>
  );
}

function InquiryRow({ inquiry, onOpenStatus }) {
  const store = window.useStore();
  const buyer = inquiry.buyer_id === 'me' ? store.state.me : store.getPerson(inquiry.buyer_id);
  const urgency = inquiry.urgency;
  const tone = urgency === 'now' ? 'urgent' : urgency === 'soon' ? 'standard' : 'easy';
  const urgencyLabel = urgency === 'now' ? 'Within 30 days' : urgency === 'soon' ? '1–3 months' : urgency === 'later' ? '3–6 months' : 'Just exploring';

  return (
    <div className="mkt-row">
      <div className="mkt-row-top">
        <InquiryStatusRing personId={inquiry.buyer_id} size={44} onClick={onOpenStatus}>
          <div className="row-avatar" style={{background: buyer?.avatar_color || '#3C3B6E', width: 44, height: 44}}>
            {buyer?.initials || '?'}
          </div>
        </InquiryStatusRing>
        <div className="mkt-row-meta">
          <div className="mkt-row-name">
            {buyer?.full_name || 'Buyer'}
            <span className="mkt-row-flag">{inquiry.country_flag}</span>
          </div>
          <div className="mkt-row-when">{window.fmtRelative(inquiry.created_at)}</div>
        </div>
        <span className={`mkt-chip mkt-chip-${tone}`}>{urgencyLabel}</span>
      </div>
      <div className="mkt-row-head">
        <span className="mkt-row-icon">{inquiry.case_type_icon || '📋'}</span>
        <span className="mkt-row-headline">{inquiry.headline}</span>
      </div>
      {inquiry.summary && <div className="mkt-row-summary">{inquiry.summary}</div>}
      <div className="mkt-row-foot">
        <span className="mkt-row-tier">{inquiry.tier?.tier} · {inquiry.tier?.price}</span>
        <div className="mkt-row-actions">
          <button className="of-btn ghost small" onClick={() => onOpenStatus?.(inquiry.buyer_id)}>View status</button>
          <button className="of-btn primary small" onClick={() => store.claimInquiry(inquiry.id)}>
            <Icons.Send size={12}/> Reply
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   INQUIRY MESSAGE BUBBLE — full brief.
   When a seller claims an inquiry (or responds to a buyer status),
   `claimInquiry` injects this card into the chat. The card lays out
   every form answer so it doubles as the conversation brief.
   ─────────────────────────────────────────────────────────────────── */
function InquiryBubble({ message, conv, mine }) {
  const store = window.useStore();
  const a = message.attachment || {};
  const inquiry = store.state.inquiries?.find(i => i.id === a.inquiry_id);
  if (!inquiry) return <div className="bub-text">Inquiry no longer available.</div>;

  const urgency = inquiry.urgency;
  const tone = urgency === 'now' ? 'urgent' : urgency === 'soon' ? 'standard' : 'easy';
  const urgencyLabel = urgency === 'now' ? 'Within 30 days' : urgency === 'soon' ? '1–3 months' : urgency === 'later' ? '3–6 months' : 'Just exploring';

  /* Build the full Q+A brief from the answer set. */
  const caseType = window.INQUIRY_LOOKUP.caseType(inquiry.country, inquiry.case_type);
  const allQuestions = [
    ...(caseType?.questions || []),
    window.INQUIRY_URGENCY_QUESTION,
    window.INQUIRY_PRIOR_DENIAL_QUESTION,
  ];
  const brief = [];
  const seen = new Set();
  for (const q of allQuestions) {
    if (seen.has(q.id)) continue;
    seen.add(q.id);
    const v = inquiry.answers?.[q.id];
    if (!v) continue;
    let val = v;
    if (q.options) {
      const opt = q.options.find(o => o.id === v);
      if (!opt) continue;
      val = opt.label;
    }
    brief.push({ q: q.label, v: val });
  }

  const buyer = inquiry.buyer_id === 'me' ? store.state.me : store.getPerson(inquiry.buyer_id);
  const meIsSeller = ['attorney','consultant'].includes(store.state.me.role);

  return (
    <div className="inq-card">
      <div className="of-stripe" style={{background: 'linear-gradient(90deg, #3C3B6E 0%, #5E5C9A 50%, #3C3B6E 100%)'}}/>
      <div className="inq-card-head">
        <span className="inq-card-eyebrow">
          {meIsSeller ? "Buyer's brief · auto-generated" : 'Marketplace inquiry'}
        </span>
        <span className={`mkt-chip mkt-chip-${tone}`}>{urgencyLabel}</span>
      </div>
      <h4 className="inq-card-title">{inquiry.headline}</h4>
      <div className="inq-card-meta">
        <span><span className="inq-card-flag">{inquiry.country_flag}</span> {inquiry.country_label}</span>
        <span>·</span>
        <span>{inquiry.case_type_label}</span>
        <span>·</span>
        <span>From {buyer?.full_name?.split(' ')[0] || 'buyer'}</span>
      </div>

      {inquiry.summary && <p className="inq-card-summary">{inquiry.summary}</p>}

      {brief.length > 0 && (
        <div className="inq-card-brief">
          <div className="inq-card-brief-head">Buyer's responses</div>
          <dl className="inq-card-brief-list">
            {brief.map((row, i) => (
              <div key={i} className="inq-card-brief-row">
                <dt>{row.q}</dt>
                <dd>{row.v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div className="inq-card-tier">
        <span className="inq-card-tier-lbl">Suggested tier</span>
        <span className="inq-card-tier-val">{inquiry.tier?.tier} · {inquiry.tier?.price}</span>
      </div>

      {meIsSeller && conv?.type === 'dm' && (
        <div className="inq-card-cta">
          <button className="of-btn primary" onClick={() => window.dispatchEvent(new CustomEvent('mc-open-offer-composer', { detail: { conv_id: conv.id, prefill: inquiry } }))}>
            <Icons.Send size={13}/> Send custom offer
          </button>
        </div>
      )}
    </div>
  );
}

/* Expose */
window.InquiryComposer     = InquiryComposer;
window.InquiryStatusRing   = InquiryStatusRing;
window.InquiryStatusViewer = InquiryStatusViewer;
window.MarketplaceFeed     = MarketplaceFeed;
window.InquiryBubble       = InquiryBubble;
