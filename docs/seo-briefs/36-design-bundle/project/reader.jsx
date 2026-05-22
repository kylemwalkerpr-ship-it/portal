// reader.jsx — Article reader with progress bar, TOC, highlight toolbar,
// claps, paywall, comments thread.

function Reader({ articleId }) {
  const article = getArticle(articleId) || ARTICLES[0];
  const author = getAuthor(article.author);
  const s = useStore().get();
  const isSaved = s.saved.has(article.id);
  const isFollowing = s.following.has(article.author);
  const userClaps = s.claps[article.id] || 0;
  const totalClaps = article.claps + userClaps;
  const t = useT();

  // Reading progress
  const [progress, setProgress] = React.useState(0);
  const [activeSection, setActiveSection] = React.useState(null);
  const articleRef = React.useRef(null);

  React.useEffect(() => {
    function onScroll() {
      const el = articleRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight + 200;
      const scrolled = -rect.top;
      const p = Math.max(0, Math.min(1, scrolled / total));
      setProgress(p);

      // active toc section
      const headings = el.querySelectorAll('h2[id]');
      let current = null;
      headings.forEach((h) => {
        if (h.getBoundingClientRect().top < 120) current = h.id;
      });
      setActiveSection(current);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [article.id]);

  // Highlight toolbar on text selection
  const [selection, setSelection] = React.useState(null);
  React.useEffect(() => {
    function onSelChange() {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) { setSelection(null); return; }
      const range = sel.getRangeAt(0);
      const el = articleRef.current;
      if (!el || !el.contains(range.commonAncestorContainer)) { setSelection(null); return; }
      const rect = range.getBoundingClientRect();
      if (rect.width < 4) { setSelection(null); return; }
      setSelection({
        text: sel.toString(),
        top: rect.top + window.scrollY,
        left: rect.left + rect.width / 2,
      });
    }
    document.addEventListener('selectionchange', onSelChange);
    return () => document.removeEventListener('selectionchange', onSelChange);
  }, []);

  // Member paywall (everything after section "Five" hidden if member-only & not subscribed)
  const paywallIdx = article.isMember ? BODY_I765.findIndex((b) => b.id === 'five-the-fee') : -1;
  const isLocked = article.isMember && s.membership !== 'member';

  // Build TOC from H2s in body
  const toc = React.useMemo(
    () => BODY_I765.filter((b) => b.type === 'h2').map((b) => ({ id: b.id, text: b.text })),
    []
  );

  // Clap with burst animation
  const [burst, setBurst] = React.useState(0);
  const onClap = () => {
    if (userClaps >= 50) return;
    clap(article.id);
    setBurst((x) => x + 1);
  };

  return (
    <main data-screen-label="reader" ref={articleRef} className="cw-reader-root">
      {/* Reading progress bar */}
      <div className="cw-progress" style={{ transform: `scaleX(${progress})` }}/>

      {/* Floating sidebar actions */}
      <FloatingActions
        article={article}
        isSaved={isSaved}
        totalClaps={totalClaps}
        userClaps={userClaps}
        onClap={onClap}
        burst={burst}
      />

      <article className="cw-article">
        {/* Article header */}
        <header className="cw-article-head">
          <button className="cw-topic-link ui" onClick={() => navigate('home')}>
            <Icon name="arrow" size={14} stroke={1.75}/>
            <span style={{ transform: 'scaleX(-1)', display: 'inline-block' }}/>
            Back to {getTopic(article.topic)?.label}
          </button>
          <h1 className="cw-article-title serif">{article.title}</h1>
          <p className="cw-article-sub serif">{article.subtitle}</p>

          <div className="cw-article-byline">
            <button className="cw-byline-row" onClick={() => navigate('author', { id: article.author })}>
              <span className="cw-avatar-lg" style={{ background: author.accent }}>{author.initials}</span>
              <div>
                <p className="cw-byline-row-name">
                  {author.name}
                  <span className="cw-byline-row-verified" title="Reviewed by bar attorney">✓</span>
                </p>
                <span className="cw-byline-row-meta ui">{author.role} · {author.firm}</span>
              </div>
            </button>
            <button className={`cw-follow-btn ui ${isFollowing ? 'is-on' : ''}`}
                    onClick={() => toggleFollow(article.author)}>
              {isFollowing ? <><Icon name="check" size={14}/> Following</> : <><Icon name="plus" size={14}/> Follow</>}
            </button>
            <div className="cw-byline-stats ui">
              <span>{article.date}</span>
              <span className="cw-byline-stats-dot">·</span>
              <span>{article.readingMinutes} min read</span>
            </div>
          </div>

          <div className="cw-article-actions ui">
            <button className="cw-action" onClick={onClap}>
              <Icon name="clap" size={18}/>
              <span>{formatCount(totalClaps)}</span>
            </button>
            <button className="cw-action">
              <Icon name="comment" size={18}/>
              <span>{article.responses}</span>
            </button>
            <div className="cw-action-spacer"/>
            <button className={`cw-action ${isSaved ? 'is-on' : ''}`}
                    onClick={() => toggleSave(article.id)}>
              <Icon name={isSaved ? 'bookmarkFill' : 'bookmark'} size={18}/>
              <span>{isSaved ? 'Saved' : 'Save'}</span>
            </button>
            <button className="cw-action"><Icon name="share" size={18}/></button>
            <button className="cw-action"><Icon name="more" size={18}/></button>
          </div>
        </header>

        {/* Hero image */}
        {article.hero !== 'pull' && (
          <figure className="cw-article-hero">
            <div className="imgph cw-hero-img" data-label={article.heroLabel}/>
            <figcaption className="ui">Caseworks — original photography for May 2026 issue.</figcaption>
          </figure>
        )}

        {/* TOC */}
        <TableOfContents toc={toc} active={activeSection}/>

        {/* Body */}
        <div className="cw-prose prose" style={{ maxWidth: t.readingWidth }}>
          {BODY_I765.map((block, i) => {
            const locked = isLocked && paywallIdx >= 0 && i >= paywallIdx;
            if (locked && i === paywallIdx) {
              return <Paywall key="paywall"/>;
            }
            if (locked) return null;
            if (block.type === 'p')
              return <p key={i}>{enrichInline(block.text, i)}</p>;
            if (block.type === 'h2')
              return <h2 key={i} id={block.id}>{block.text}</h2>;
            if (block.type === 'h3')
              return <h3 key={i}>{block.text}</h3>;
            if (block.type === 'blockquote')
              return <blockquote key={i}>{block.text}</blockquote>;
            return null;
          })}
        </div>

        {/* Bottom clap row */}
        {!isLocked && <BottomClap article={article} totalClaps={totalClaps} userClaps={userClaps} onClap={onClap}/>}

        {/* Author card */}
        <AuthorCard author={author} isFollowing={isFollowing}/>

        {/* Responses */}
        {!isLocked && <Responses article={article}/>}

        {/* Related */}
        <Related current={article}/>
      </article>

      {/* Highlight toolbar */}
      {selection && <HighlightToolbar selection={selection}/>}

      <style>{`
        .cw-reader-root{
          background: var(--paper);
          padding-bottom: 64px;
        }
        .cw-progress{
          position: fixed; top: 0; left: 0; right: 0; height: 3px;
          background: var(--accent);
          transform-origin: left center;
          z-index: 60;
          transition: transform .05s linear;
        }
        .cw-article{
          max-width: 880px; margin: 0 auto; padding: 56px 32px 0;
          position: relative;
        }
        .cw-article-head{ margin-bottom: 32px; }
        .cw-topic-link{
          display:inline-flex; align-items:center; gap: 6px;
          font-size: 12.5px; letter-spacing: 0.04em;
          color: var(--ink-soft); margin-bottom: 28px;
        }
        .cw-topic-link svg{ transform: rotate(180deg); }
        .cw-topic-link:hover{ color: var(--ink); }
        .cw-article-title{
          font-family: var(--font-display); font-weight: 600;
          font-size: 56px; line-height: 1.05; letter-spacing: -0.025em;
          margin: 0 0 18px; max-width: 780px;
          color: var(--ink); text-wrap: balance;
        }
        .cw-article-sub{
          font-family: var(--font-display);
          font-style: italic; font-size: 24px; line-height: 1.4;
          color: var(--ink-mid); margin: 0 0 36px;
          max-width: 720px; text-wrap: pretty;
        }
        .cw-article-byline{
          display:flex; align-items:center; gap: 16px;
          padding: 20px 0;
          border-top: 1px solid var(--rule);
          border-bottom: 1px solid var(--rule);
        }
        .cw-byline-row{
          display:flex; align-items:center; gap: 12px;
        }
        .cw-avatar-lg{
          width: 44px; height: 44px; border-radius: 50%;
          color: var(--paper); display:flex; align-items:center; justify-content:center;
          font-family: var(--font-ui); font-weight: 600; font-size: 14px;
        }
        .cw-byline-row-name{
          font-family: var(--font-display); font-weight: 600;
          font-size: 16px; margin: 0; color: var(--ink);
          display:flex; align-items:center; gap: 6px;
        }
        .cw-byline-row-verified{
          font-size: 10px; padding: 1px 4px;
          background: var(--ink); color: var(--paper);
          border-radius: 50%; width: 14px; height: 14px;
          display:inline-flex; align-items:center; justify-content:center;
          font-family: var(--font-ui);
        }
        .cw-byline-row-meta{
          font-size: 12.5px; color: var(--ink-soft);
        }
        .cw-byline-row:hover .cw-byline-row-name{ color: var(--accent-ink); }
        .cw-follow-btn{
          display:inline-flex; align-items:center; gap: 4px;
          font-size: 13px; font-weight: 500;
          padding: 7px 14px; border-radius: 999px;
          background: var(--ink); color: var(--paper);
        }
        .cw-follow-btn.is-on{
          background: transparent; color: var(--ink);
          border: 1px solid var(--rule);
          padding: 6px 13px;
        }
        .cw-follow-btn:hover{ background: var(--accent); color: var(--paper); border-color: transparent; padding: 7px 14px;}
        .cw-byline-stats{
          margin-left: auto;
          font-size: 12.5px; color: var(--ink-soft);
          display:flex; gap: 6px;
        }
        .cw-byline-stats-dot{ color: var(--ink-soft); }
        .cw-article-actions{
          display:flex; align-items:center; gap: 4px;
          padding: 12px 0;
          border-bottom: 1px solid var(--rule);
        }
        .cw-action{
          display:inline-flex; align-items:center; gap: 6px;
          padding: 8px 12px; border-radius: 999px;
          font-size: 13px; color: var(--ink-mid);
        }
        .cw-action:hover{ background: var(--paper-deep); color: var(--ink); }
        .cw-action.is-on{ color: var(--accent-ink); }
        .cw-action-spacer{ flex: 1; }

        .cw-article-hero{
          margin: 36px -32px;
        }
        .cw-hero-img{
          width: 100%; aspect-ratio: 16/9; max-height: 520px;
        }
        .cw-article-hero figcaption{
          font-size: 12px; color: var(--ink-soft);
          padding: 10px 32px 0;
          font-style: italic; font-family: var(--font-display);
        }
        .cw-prose{
          margin: 40px auto 0;
          max-width: var(--reading-width);
        }
        @media (max-width: 880px){
          .cw-article-title{ font-size: 36px; }
          .cw-article-sub{ font-size: 18px; }
          .cw-article-byline{ flex-wrap: wrap; }
          .cw-byline-stats{ width: 100%; margin-left: 0; }
        }
      `}</style>
    </main>
  );
}

// Sentences that should be linkable get wrapped during render.
function enrichInline(text, key) {
  // Add a couple of inline links to feel real on the first body paragraph.
  if (key === 0) {
    return (
      <>
        There is a particular silence in an immigration practice the morning a <a>denial letter</a> arrives.
        The associate reads it twice. The paralegal pulls the file. Somewhere there is a box that was
        ticked the wrong way, or a date that drifted by a week, or a photograph that has the right
        person and the wrong background. The rest of the case was fine.
      </>
    );
  }
  return text;
}

// ─── Floating actions (left rail on desktop) ────────────────────────────────

function FloatingActions({ article, isSaved, totalClaps, userClaps, onClap, burst }) {
  return (
    <aside className="cw-floating">
      <button className="cw-fl-btn cw-fl-clap" onClick={onClap}
              data-burst={burst}>
        <Icon name="clap" size={20}/>
        <span className="ui mono">{formatCount(totalClaps)}</span>
        {userClaps > 0 && <span className="cw-clap-count ui">+{userClaps}</span>}
      </button>
      <button className="cw-fl-btn">
        <Icon name="comment" size={20}/>
        <span className="ui mono">{article.responses}</span>
      </button>
      <button className={`cw-fl-btn ${isSaved ? 'is-on' : ''}`}
              onClick={() => toggleSave(article.id)}>
        <Icon name={isSaved ? 'bookmarkFill' : 'bookmark'} size={20}/>
      </button>
      <button className="cw-fl-btn"><Icon name="share" size={20}/></button>
      <style>{`
        .cw-floating{
          position: fixed; left: max(24px, calc(50vw - 580px));
          top: 50%; transform: translateY(-50%);
          display:flex; flex-direction:column; gap: 8px;
          z-index: 40;
        }
        .cw-fl-btn{
          position: relative;
          width: 44px; min-height: 44px;
          padding: 6px 4px;
          border-radius: 22px;
          display:flex; flex-direction:column; align-items:center; justify-content:center;
          gap: 2px;
          background: var(--paper);
          color: var(--ink-mid);
          border: 1px solid var(--rule);
          transition: all .15s var(--ease);
        }
        .cw-fl-btn:hover{
          color: var(--ink); border-color: var(--ink);
          transform: translateY(-1px);
        }
        .cw-fl-btn.is-on{ color: var(--accent-ink); border-color: var(--accent); }
        .cw-fl-btn span{ font-size: 10.5px; }
        .cw-clap-count{
          position: absolute; top: -6px; right: -6px;
          background: var(--accent); color: var(--paper);
          font-size: 9.5px; font-weight: 600;
          padding: 2px 5px; border-radius: 999px;
        }
        @keyframes claphop {
          0% { transform: scale(1); }
          40% { transform: scale(1.18) translateY(-2px); }
          100% { transform: scale(1); }
        }
        .cw-fl-clap[data-burst]{ animation: claphop .35s var(--ease); }
        @media (max-width: 1080px){
          .cw-floating{
            left: 0; right: 0; bottom: 16px; top: auto; transform: none;
            flex-direction: row; justify-content: center;
          }
          .cw-fl-btn{ box-shadow: 0 4px 16px rgba(0,0,0,.08); }
        }
      `}</style>
    </aside>
  );
}

// ─── Table of contents ──────────────────────────────────────────────────────

function TableOfContents({ toc, active }) {
  const [open, setOpen] = React.useState(false);
  return (
    <aside className="cw-toc">
      <button className="cw-toc-header ui" onClick={() => setOpen((x) => !x)}>
        <Icon name="list" size={14}/>
        <span>Table of contents</span>
        <span className="cw-toc-toggle">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <ol className="cw-toc-list">
          {toc.map((t, i) => (
            <li key={t.id} className={active === t.id ? 'is-on' : ''}>
              <a href={`#${t.id}`} onClick={(e) => {
                e.preventDefault();
                const el = document.getElementById(t.id);
                if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 80, behavior: 'smooth' });
              }}>
                <span className="cw-toc-num mono">{String(i + 1).padStart(2, '0')}</span>
                <span>{t.text}</span>
              </a>
            </li>
          ))}
        </ol>
      )}
      <style>{`
        .cw-toc{
          margin: 24px auto 0;
          max-width: var(--reading-width);
          border: 1px solid var(--rule);
          border-radius: 4px;
          background: var(--paper-dim);
        }
        .cw-toc-header{
          display:flex; align-items:center; gap: 10px;
          width: 100%; padding: 14px 18px;
          font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase;
          color: var(--ink-mid); font-weight: 600;
        }
        .cw-toc-toggle{
          margin-left: auto; font-size: 16px; color: var(--ink-soft);
          font-weight: 400;
        }
        .cw-toc-list{
          list-style: none; padding: 0 0 12px; margin: 0;
          border-top: 1px solid var(--rule);
        }
        .cw-toc-list li{}
        .cw-toc-list a{
          display:grid; grid-template-columns: 40px 1fr;
          gap: 8px; align-items: baseline;
          padding: 8px 18px;
          font-family: var(--font-display); font-size: 15px;
          color: var(--ink-mid);
          border-left: 2px solid transparent;
          line-height: 1.35;
        }
        .cw-toc-list a:hover{ color: var(--ink); background: var(--paper); }
        .cw-toc-list li.is-on a{
          color: var(--accent-ink); border-left-color: var(--accent);
          background: var(--paper);
        }
        .cw-toc-num{
          font-size: 11px; color: var(--ink-soft);
          letter-spacing: 0.02em;
        }
      `}</style>
    </aside>
  );
}

// ─── Highlight toolbar ──────────────────────────────────────────────────────

function HighlightToolbar({ selection }) {
  return (
    <div className="cw-highlight"
         style={{ top: selection.top - 56, left: selection.left }}>
      <button title="Highlight"><Icon name="highlight" size={16}/></button>
      <button title="Note"><Icon name="note" size={16}/></button>
      <button title="Copy"><Icon name="copy" size={16}/></button>
      <button title="Share quote"><Icon name="twitter" size={16}/></button>
      <span className="cw-highlight-rule"/>
      <button title="Reply" className="cw-highlight-reply ui">
        <Icon name="comment" size={14}/>
        Respond
      </button>
      <style>{`
        .cw-highlight{
          position: absolute; transform: translateX(-50%);
          display:flex; align-items:center; gap: 2px;
          padding: 6px;
          background: var(--ink);
          color: var(--paper);
          border-radius: 999px;
          box-shadow: 0 12px 32px rgba(0,0,0,.18);
          z-index: 70;
          animation: hltb .15s var(--ease);
        }
        @keyframes hltb {
          from { opacity: 0; transform: translate(-50%, 4px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
        .cw-highlight::after{
          content: ''; position: absolute; left: 50%; bottom: -5px;
          transform: translateX(-50%) rotate(45deg);
          width: 10px; height: 10px; background: var(--ink);
          border-radius: 2px;
        }
        .cw-highlight button{
          width: 32px; height: 32px;
          display:flex; align-items:center; justify-content:center;
          border-radius: 50%;
          color: var(--paper);
        }
        .cw-highlight button:hover{ background: color-mix(in oklch, var(--paper) 14%, transparent); }
        .cw-highlight-rule{ width: 1px; height: 20px; background: color-mix(in oklch, var(--paper) 20%, transparent); margin: 0 2px; }
        .cw-highlight-reply{
          width: auto !important; border-radius: 16px !important;
          padding: 0 12px !important; gap: 5px;
          font-size: 12px; font-weight: 500;
        }
      `}</style>
    </div>
  );
}

// ─── Paywall ────────────────────────────────────────────────────────────────

function Paywall() {
  return (
    <div className="cw-paywall">
      <div className="cw-paywall-fade"/>
      <div className="cw-paywall-card">
        <span className="cw-paywall-eyebrow ui">Member story</span>
        <h3 className="serif">There are four more sections to this brief.</h3>
        <p>The remainder of this article — including the fee mechanics, the signature rule, and the
        quiet ninth mistake — is part of Caseworks Membership. Members also get the template library,
        member-only walkthroughs, and direct reader threads with our reviewers.</p>
        <div className="cw-paywall-actions ui">
          <button className="cw-paywall-primary"
                  onClick={() => STORE.set((s) => ({ ...s, membership: 'member' }))}>
            Become a member · $9/mo
          </button>
          <button className="cw-paywall-secondary">Sign in</button>
        </div>
        <p className="cw-paywall-foot ui">Cancel anytime · 7-day refund</p>
      </div>
      <style>{`
        .cw-paywall{ position: relative; margin: 24px 0 0; }
        .cw-paywall-fade{
          position: absolute; left: 0; right: 0; top: -120px; height: 120px;
          background: linear-gradient(to bottom,
            color-mix(in oklch, var(--paper) 0%, transparent),
            var(--paper));
          pointer-events: none;
        }
        .cw-paywall-card{
          border: 1px solid var(--rule);
          background: var(--paper-dim);
          padding: 32px;
          border-radius: 4px;
          display:flex; flex-direction:column; gap: 14px;
          text-align: center;
          align-items: center;
        }
        .cw-paywall-eyebrow{
          font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase;
          color: var(--accent-ink); font-weight: 600;
        }
        .cw-paywall-card h3{
          font-family: var(--font-display); font-weight: 600;
          font-size: 26px; letter-spacing: -0.012em;
          margin: 0; color: var(--ink); max-width: 460px;
          text-wrap: balance;
        }
        .cw-paywall-card p{
          font-family: var(--font-display);
          font-size: 16px; line-height: 1.55; color: var(--ink-mid);
          max-width: 520px; margin: 0;
        }
        .cw-paywall-actions{
          display:flex; gap: 10px; flex-wrap: wrap;
          justify-content: center; margin-top: 8px;
        }
        .cw-paywall-primary{
          padding: 12px 22px; border-radius: 999px;
          background: var(--ink); color: var(--paper);
          font-weight: 500; font-size: 14px;
        }
        .cw-paywall-primary:hover{ background: var(--accent); }
        .cw-paywall-secondary{
          padding: 12px 22px; border-radius: 999px;
          color: var(--ink); font-weight: 500; font-size: 14px;
        }
        .cw-paywall-secondary:hover{ background: var(--paper); }
        .cw-paywall-foot{
          font-size: 11px; color: var(--ink-soft);
        }
      `}</style>
    </div>
  );
}

// ─── Bottom clap ────────────────────────────────────────────────────────────

function BottomClap({ article, totalClaps, userClaps, onClap }) {
  return (
    <div className="cw-bottom-clap">
      <button className="cw-big-clap" onClick={onClap}>
        <Icon name="clap" size={28}/>
      </button>
      <div className="cw-big-clap-info">
        <p className="serif">
          {userClaps > 0
            ? `You applauded this ${userClaps} time${userClaps === 1 ? '' : 's'}.`
            : 'Found this useful?'}
        </p>
        <span className="ui">{formatCount(totalClaps)} readers have applauded · tap up to 50 times</span>
      </div>
      <style>{`
        .cw-bottom-clap{
          margin: 64px auto 0;
          max-width: var(--reading-width);
          padding: 28px 0;
          border-top: 1px solid var(--rule);
          border-bottom: 1px solid var(--rule);
          display:flex; align-items:center; gap: 20px;
        }
        .cw-big-clap{
          width: 64px; height: 64px; border-radius: 50%;
          border: 1.5px solid var(--ink);
          color: var(--ink);
          display:flex; align-items:center; justify-content:center;
          flex: 0 0 auto;
        }
        .cw-big-clap:hover{ background: var(--ink); color: var(--paper); }
        .cw-big-clap-info p{
          font-family: var(--font-display); font-size: 20px;
          margin: 0; color: var(--ink); line-height: 1.3;
        }
        .cw-big-clap-info span{
          font-size: 13px; color: var(--ink-soft);
        }
      `}</style>
    </div>
  );
}

// ─── Author card after article ──────────────────────────────────────────────

function AuthorCard({ author, isFollowing }) {
  return (
    <div className="cw-author-card">
      <div className="cw-author-card-head">
        <span className="cw-avatar-xl" style={{ background: author.accent }}>{author.initials}</span>
        <div>
          <span className="cw-author-card-label ui">Written by</span>
          <button className="cw-author-card-name serif"
                  onClick={() => navigate('author', { id: author.id })}>
            {author.name}
          </button>
          <span className="cw-author-card-role ui">
            {author.role} · {author.firm} · {formatCount(author.following)} followers
          </span>
        </div>
        <button className={`cw-follow-btn ui ${isFollowing ? 'is-on' : ''}`}
                onClick={() => toggleFollow(author.id)}>
          {isFollowing ? <><Icon name="check" size={14}/> Following</> : <><Icon name="plus" size={14}/> Follow</>}
        </button>
      </div>
      <p className="cw-author-card-bio">{author.bio}</p>
      <style>{`
        .cw-author-card{
          margin: 48px auto 0;
          max-width: var(--reading-width);
          padding: 28px;
          border: 1px solid var(--rule);
          border-radius: 4px;
          background: var(--paper-dim);
        }
        .cw-author-card-head{
          display:flex; align-items:center; gap: 16px;
        }
        .cw-avatar-xl{
          width: 56px; height: 56px; border-radius: 50%;
          color: var(--paper); display:flex; align-items:center; justify-content:center;
          font-family: var(--font-ui); font-weight: 600; font-size: 18px;
          flex: 0 0 auto;
        }
        .cw-author-card-label{
          font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase;
          color: var(--ink-soft); display: block;
        }
        .cw-author-card-name{
          font-family: var(--font-display); font-weight: 600;
          font-size: 22px; color: var(--ink); display: block;
          letter-spacing: -0.012em;
        }
        .cw-author-card-name:hover{ color: var(--accent-ink); }
        .cw-author-card-role{
          font-size: 12.5px; color: var(--ink-soft);
        }
        .cw-author-card-head .cw-follow-btn{ margin-left: auto; }
        .cw-author-card-bio{
          font-family: var(--font-display); font-size: 16px; line-height: 1.55;
          color: var(--ink-mid); margin: 16px 0 0;
          font-style: italic;
        }
      `}</style>
    </div>
  );
}

// ─── Responses ──────────────────────────────────────────────────────────────

function Responses({ article }) {
  const [draft, setDraft] = React.useState('');
  const [posted, setPosted] = React.useState([]);
  return (
    <section className="cw-responses">
      <header className="cw-responses-head">
        <h3 className="serif">Responses ({COMMENTS_I765.length + posted.length})</h3>
        <select className="ui">
          <option>Most relevant</option>
          <option>Newest</option>
          <option>From authors I follow</option>
        </select>
      </header>

      <div className="cw-response-form">
        <span className="cw-avatar-md" style={{ background: 'var(--accent)' }}>R</span>
        <div className="cw-response-form-body">
          <textarea
            placeholder="Write a response. Quote a passage by selecting text in the article above."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={draft ? 3 : 1}
          />
          {draft && (
            <div className="cw-response-form-actions ui">
              <button className="cw-r-cancel" onClick={() => setDraft('')}>Cancel</button>
              <button className="cw-r-submit"
                      onClick={() => { setPosted([{ text: draft, id: 'me-' + Date.now() }, ...posted]); setDraft(''); }}>
                Respond
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="cw-response-list">
        {posted.map((p) => (
          <Comment key={p.id} comment={{
            author: 'samira-okafor', date: 'just now',
            text: p.text, claps: 0, replies: [],
            isYou: true,
          }}/>
        ))}
        {COMMENTS_I765.map((c) => <Comment key={c.id} comment={c}/>)}
      </div>

      <style>{`
        .cw-responses{
          margin: 56px auto 0;
          max-width: var(--reading-width);
        }
        .cw-responses-head{
          display:flex; align-items:baseline; gap: 12px;
          justify-content: space-between;
          padding-bottom: 14px;
          border-bottom: 1px solid var(--ink);
          margin-bottom: 20px;
        }
        .cw-responses-head h3{
          font-family: var(--font-display); font-weight: 600;
          font-size: 22px; margin: 0; color: var(--ink);
          letter-spacing: -0.012em;
        }
        .cw-responses-head select{
          font-size: 12px; color: var(--ink-mid);
          border: 1px solid var(--rule);
          border-radius: 999px; background: var(--paper);
          padding: 5px 10px;
        }
        .cw-response-form{
          display:flex; gap: 12px;
          padding: 16px 0; border-bottom: 1px solid var(--rule);
        }
        .cw-response-form-body{ flex: 1; }
        .cw-response-form textarea{
          width: 100%; border: 0; outline: 0;
          background: transparent; resize: none;
          font: 15px/1.5 var(--font-display);
          color: var(--ink); padding: 6px 0;
        }
        .cw-response-form textarea::placeholder{ color: var(--ink-soft); }
        .cw-response-form-actions{
          display:flex; gap: 8px; justify-content: flex-end;
          margin-top: 8px;
        }
        .cw-r-cancel{
          font-size: 13px; color: var(--ink-mid); padding: 6px 12px;
          border-radius: 999px;
        }
        .cw-r-submit{
          font-size: 13px; padding: 6px 14px; border-radius: 999px;
          background: var(--ink); color: var(--paper); font-weight: 500;
        }
        .cw-response-list{ display:flex; flex-direction:column; gap: 24px; padding-top: 16px; }
      `}</style>
    </section>
  );
}

function Comment({ comment }) {
  const a = getAuthor(comment.author);
  const [open, setOpen] = React.useState(false);
  const [clapped, setClapped] = React.useState(0);
  return (
    <div className="cw-comment">
      <div className="cw-comment-head">
        <span className="cw-avatar-sm" style={{ background: a?.accent || 'var(--accent)' }}>{a?.initials}</span>
        <div>
          <p className="cw-comment-name">{a?.name}{comment.isYou && <span className="cw-comment-you ui"> · you</span>}</p>
          <span className="cw-comment-date ui">{comment.date}</span>
        </div>
      </div>
      <p className="cw-comment-text">{comment.text}</p>
      <div className="cw-comment-actions ui">
        <button onClick={() => setClapped((x) => Math.min(x + 1, 10))}>
          <Icon name="clap" size={14}/> {comment.claps + clapped}
        </button>
        <button onClick={() => setOpen((x) => !x)}>
          <Icon name="comment" size={14}/> Reply{comment.replies?.length ? ` (${comment.replies.length})` : ''}
        </button>
      </div>
      {comment.replies?.length > 0 && (
        <div className="cw-comment-replies">
          {comment.replies.map((r) => <Comment key={r.id} comment={r}/>)}
        </div>
      )}
      <style>{`
        .cw-comment{ padding-left: 0; }
        .cw-comment-head{ display:flex; align-items:center; gap: 10px; margin-bottom: 8px; }
        .cw-comment-name{
          font-family: var(--font-display); font-size: 14px; font-weight: 600;
          margin: 0; color: var(--ink); line-height: 1.2;
        }
        .cw-comment-you{ color: var(--accent-ink); font-weight: 500; font-size: 11px; }
        .cw-comment-date{ font-size: 11.5px; color: var(--ink-soft); }
        .cw-comment-text{
          font-family: var(--font-display); font-size: 15.5px; line-height: 1.55;
          color: var(--ink); margin: 0 0 8px;
        }
        .cw-comment-actions{
          display:flex; gap: 4px;
        }
        .cw-comment-actions button{
          display:inline-flex; align-items:center; gap: 5px;
          font-size: 12px; color: var(--ink-soft);
          padding: 4px 8px; border-radius: 999px;
        }
        .cw-comment-actions button:hover{ background: var(--paper-deep); color: var(--ink); }
        .cw-comment-replies{
          margin: 16px 0 0 12px;
          padding-left: 20px;
          border-left: 1px solid var(--rule);
          display:flex; flex-direction:column; gap: 18px;
        }
      `}</style>
    </div>
  );
}

// ─── Related ────────────────────────────────────────────────────────────────

function Related({ current }) {
  const others = ARTICLES.filter((a) => a.id !== current.id).slice(0, 3);
  return (
    <section className="cw-related">
      <div className="cw-related-head">
        <span className="ui">More from Caseworks</span>
        <h3 className="serif">Continue reading</h3>
      </div>
      <div className="cw-related-grid">
        {others.map((a) => <ArticleCardTile key={a.id} article={a}/>)}
      </div>
      <style>{`
        .cw-related{
          margin: 80px auto 0;
          max-width: 960px;
          padding-top: 40px;
          border-top: 1px solid var(--ink);
        }
        .cw-related-head{
          display:flex; align-items: baseline; gap: 16px;
          margin-bottom: 24px;
        }
        .cw-related-head span{
          font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase;
          color: var(--ink-soft); font-weight: 600;
        }
        .cw-related-head h3{
          font-family: var(--font-display); font-weight: 600;
          font-size: 26px; margin: 0; color: var(--ink);
          letter-spacing: -0.012em;
        }
        .cw-related-grid{
          display:grid; grid-template-columns: repeat(3, 1fr);
          gap: 32px;
        }
        @media (max-width: 880px){
          .cw-related-grid{ grid-template-columns: 1fr; }
        }
      `}</style>
    </section>
  );
}

Object.assign(window, { Reader });
