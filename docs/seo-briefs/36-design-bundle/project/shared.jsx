// shared.jsx — Nav, Footer, ArticleCard, store, formatters.

const { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } = React;

// ─── Store ──────────────────────────────────────────────────────────────────
// Tiny pub-sub store so save / follow / clap counts persist across screens.

function createStore(initial) {
  let state = initial;
  const subs = new Set();
  return {
    get: () => state,
    set: (updater) => {
      state = typeof updater === 'function' ? updater(state) : { ...state, ...updater };
      subs.forEach((s) => s());
    },
    sub: (fn) => { subs.add(fn); return () => subs.delete(fn); },
  };
}

const STORE = createStore({
  page: { name: 'home', params: {} },  // { name: 'home'|'reader'|'author', params }
  saved: new Set(),                     // article ids
  following: new Set(['priya-chowdhury']),
  claps: {},                            // articleId -> user clap count (0-50)
  membership: 'free',                   // 'free' | 'member'
});

function useStore() {
  const [, force] = useState(0);
  useEffect(() => STORE.sub(() => force((x) => x + 1)), []);
  return STORE;
}

function navigate(name, params = {}) {
  STORE.set((s) => ({ ...s, page: { name, params } }));
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function toggleSave(articleId) {
  STORE.set((s) => {
    const next = new Set(s.saved);
    next.has(articleId) ? next.delete(articleId) : next.add(articleId);
    return { ...s, saved: next };
  });
}

function toggleFollow(authorId) {
  STORE.set((s) => {
    const next = new Set(s.following);
    next.has(authorId) ? next.delete(authorId) : next.add(authorId);
    return { ...s, following: next };
  });
}

function clap(articleId) {
  STORE.set((s) => {
    const cur = s.claps[articleId] || 0;
    if (cur >= 50) return s;
    return { ...s, claps: { ...s.claps, [articleId]: cur + 1 } };
  });
}

// ─── Tweaks context ─────────────────────────────────────────────────────────

const TweaksCtx = createContext({});
const useT = () => useContext(TweaksCtx);

// ─── Formatters ─────────────────────────────────────────────────────────────

function formatCount(n) {
  if (n < 1000) return String(n);
  if (n < 10_000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  if (n < 1_000_000) return Math.round(n / 1000) + 'K';
  return (n / 1_000_000).toFixed(1) + 'M';
}

function getAuthor(id) { return AUTHORS[id]; }
function getTopic(slug) { return TOPICS.find((t) => t.slug === slug); }
function getArticle(id) { return ARTICLES.find((a) => a.id === id); }

// ─── Icons (line, 1.5px, ink) ──────────────────────────────────────────────

const Icon = ({ name, size = 18, stroke = 1.5 }) => {
  const paths = {
    search:    <><circle cx="11" cy="11" r="6"/><path d="m20 20-3.5-3.5"/></>,
    bookmark:  <path d="M6 4h12v17l-6-3.6L6 21V4Z"/>,
    bookmarkFill: <path d="M6 4h12v17l-6-3.6L6 21V4Z" fill="currentColor"/>,
    clap:      <><path d="M9 13.5 5.5 17a2 2 0 0 0 0 2.8l1.7 1.7a2 2 0 0 0 2.8 0L13.5 18M14 9.5l4 4M11.5 7l5.5 5.5M9 9.5l8 8M14.5 4l2.5 2.5M11 5.5l1.5 1.5"/></>,
    comment:   <path d="M4 5h16v11H10l-5 4V5Z"/>,
    share:     <><path d="M4 12v7h16v-7M12 4v12M8 8l4-4 4 4"/></>,
    more:      <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
    arrow:     <path d="M5 12h14M13 6l6 6-6 6"/>,
    check:     <path d="m5 12 5 5L20 7"/>,
    plus:      <path d="M12 5v14M5 12h14"/>,
    minus:     <path d="M5 12h14"/>,
    close:     <path d="M6 6l12 12M18 6 6 18"/>,
    sun:       <><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/></>,
    moon:      <path d="M20 14a8 8 0 1 1-9-11 6.5 6.5 0 0 0 9 11Z"/>,
    list:      <><path d="M4 6h16M4 12h16M4 18h10"/></>,
    user:      <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    highlight: <path d="m4 17 5-5 8 8H4v-3Zm6-6 6-6a2.8 2.8 0 1 1 4 4l-6 6"/>,
    note:      <><path d="M4 5h12l4 4v10H4V5Z"/><path d="M16 5v4h4"/></>,
    copy:      <><rect x="8" y="4" width="12" height="14" rx="1"/><path d="M4 8v12h12"/></>,
    link:      <><path d="M10 14a4 4 0 0 0 5.6 0l3-3a4 4 0 1 0-5.6-5.6L11.5 7"/><path d="M14 10a4 4 0 0 0-5.6 0l-3 3a4 4 0 1 0 5.6 5.6L12.5 17"/></>,
    twitter:   <path d="M18 5h2l-6.5 7.5L21 21h-5.5l-4.5-5.5L5.5 21H3.5l7-8L3 5h5.5l4 5L18 5Z"/>,
    feed:      <><path d="M4 4v16M4 4h16M4 12h14M4 20h10"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
};

// ─── Nav ────────────────────────────────────────────────────────────────────

function Nav() {
  const s = useStore().get();
  const t = useT();
  const [searchFocus, setSearchFocus] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  return (
    <header className="cw-nav" data-screen-label="nav">
      <div className="cw-nav-inner">
        <div className="cw-nav-left">
          <button className="cw-logo" onClick={() => navigate('home')} aria-label="Caseworks home">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect x="2.5" y="2.5" width="23" height="23" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M8 18V9h12M8 13h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <span className="cw-wordmark">Caseworks</span>
          </button>
          <div className={`cw-search ${searchFocus ? 'is-focus' : ''}`}>
            <Icon name="search" size={16}/>
            <input
              type="text"
              placeholder="Search articles, authors, topics"
              onFocus={() => setSearchFocus(true)}
              onBlur={() => setSearchFocus(false)}
            />
            <span className="cw-search-kbd mono">⌘K</span>
          </div>
        </div>
        <nav className="cw-nav-right ui">
          <button className="cw-link" onClick={() => navigate('home')}>Read</button>
          <button className="cw-link">Library</button>
          <button className="cw-link">Topics</button>
          <span className="cw-nav-rule"/>
          <button className="cw-btn cw-btn-text">Sign in</button>
          <button className="cw-btn cw-btn-fill" onClick={() => navigate('reader', { id: 'i765-eight-mistakes' })}>
            Start reading
          </button>
          <button className="cw-avatar" onClick={() => setAccountOpen((x) => !x)} aria-label="Account">
            <span>R</span>
          </button>
        </nav>
      </div>
      <style>{`
        .cw-nav{
          position: sticky; top: 0; z-index: 50;
          background: color-mix(in oklch, var(--paper) 88%, transparent);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          backdrop-filter: blur(14px) saturate(140%);
          border-bottom: 1px solid var(--rule);
        }
        .cw-nav-inner{
          max-width: var(--max-width); margin: 0 auto;
          padding: 0 32px; height: 64px;
          display: flex; align-items: center; justify-content: space-between;
          gap: 24px;
        }
        .cw-nav-left{ display:flex; align-items:center; gap: 24px; flex: 1; min-width: 0;}
        .cw-logo{ display:flex; align-items:center; gap: 10px; color: var(--ink); }
        .cw-logo svg{ flex:0 0 auto; }
        .cw-wordmark{
          font-family: var(--font-display); font-size: 22px; font-weight: 600;
          letter-spacing: -0.012em; line-height: 1;
        }
        .cw-search{
          flex: 1; max-width: 440px;
          display:flex; align-items:center; gap: 10px;
          padding: 8px 12px; background: var(--paper-deep);
          border: 1px solid transparent; border-radius: 8px;
          color: var(--ink-soft); font-family: var(--font-ui);
          transition: all .15s var(--ease);
        }
        .cw-search.is-focus{
          border-color: var(--rule); background: var(--paper);
          box-shadow: 0 0 0 4px color-mix(in oklch, var(--accent) 12%, transparent);
          color: var(--ink);
        }
        .cw-search input{
          flex: 1; border: 0; outline: 0; background: transparent;
          font: inherit; color: inherit;
        }
        .cw-search input::placeholder{ color: var(--ink-soft); }
        .cw-search-kbd{
          font-size: 11px; color: var(--ink-soft);
          padding: 2px 6px; border: 1px solid var(--rule);
          border-radius: 4px; background: var(--paper);
        }
        .cw-nav-right{ display:flex; align-items:center; gap: 16px; }
        .cw-link{
          font-family: var(--font-ui); font-size: 14px; color: var(--ink-mid);
          padding: 6px 0;
        }
        .cw-link:hover{ color: var(--ink); }
        .cw-nav-rule{
          width: 1px; height: 22px; background: var(--rule);
        }
        .cw-btn{
          font-family: var(--font-ui); font-size: 14px; font-weight: 500;
          padding: 8px 16px; border-radius: 999px;
          transition: all .15s var(--ease);
        }
        .cw-btn-text{ color: var(--ink-mid); padding: 8px 0; }
        .cw-btn-text:hover{ color: var(--ink); }
        .cw-btn-fill{
          background: var(--ink); color: var(--paper);
        }
        .cw-btn-fill:hover{ background: var(--accent); }
        .cw-avatar{
          width: 34px; height: 34px; border-radius: 50%;
          background: var(--accent);
          color: var(--paper);
          display:flex; align-items:center; justify-content:center;
          font-family: var(--font-ui); font-weight: 600; font-size: 13px;
        }
        @media (max-width: 880px){
          .cw-search{ display:none; }
          .cw-link{ display:none; }
        }
      `}</style>
    </header>
  );
}

// ─── Topic chip bar ─────────────────────────────────────────────────────────

function TopicBar({ active, onPick }) {
  return (
    <div className="cw-topicbar">
      <div className="cw-topicbar-inner">
        <button className={`cw-chip ${!active ? 'is-on' : ''}`} onClick={() => onPick(null)}>
          <span className="cw-chip-dot"/> For you
        </button>
        <span className="cw-chip-rule"/>
        {TOPICS.map((t) => (
          <button key={t.slug}
                  className={`cw-chip ${active === t.slug ? 'is-on' : ''}`}
                  onClick={() => onPick(t.slug)}>
            {t.label}
          </button>
        ))}
      </div>
      <style>{`
        .cw-topicbar{
          border-bottom: 1px solid var(--rule);
          background: var(--paper);
          position: sticky; top: 64px; z-index: 40;
        }
        .cw-topicbar-inner{
          max-width: var(--max-width); margin: 0 auto;
          padding: 0 32px;
          display:flex; align-items:center; gap: 10px;
          overflow-x: auto; scrollbar-width: none;
          font-family: var(--font-ui);
        }
        .cw-topicbar-inner::-webkit-scrollbar{ display:none; }
        .cw-chip{
          padding: 14px 4px;
          font-size: 13.5px; color: var(--ink-soft);
          white-space: nowrap;
          border-bottom: 1px solid transparent;
          margin-bottom: -1px;
          display:flex; align-items:center; gap: 6px;
        }
        .cw-chip:hover{ color: var(--ink); }
        .cw-chip.is-on{
          color: var(--ink);
          border-bottom-color: var(--ink);
        }
        .cw-chip-dot{
          width: 6px; height: 6px; border-radius: 50%;
          background: var(--accent);
        }
        .cw-chip-rule{
          width: 1px; height: 16px; background: var(--rule);
          margin: 0 6px;
        }
      `}</style>
    </div>
  );
}

// ─── Article card variants ──────────────────────────────────────────────────

function AuthorByline({ authorId, date, compact }) {
  const a = getAuthor(authorId);
  if (!a) return null;
  return (
    <button className={`cw-byline ${compact ? 'is-compact' : ''}`}
            onClick={(e) => { e.stopPropagation(); navigate('author', { id: authorId }); }}>
      <span className="cw-avatar-sm" style={{ background: a.accent }}>{a.initials}</span>
      <span className="cw-byline-name">{a.name}</span>
      {date && <span className="cw-byline-sep">·</span>}
      {date && <span className="cw-byline-date">{date}</span>}
      <style>{`
        .cw-byline{
          display:flex; align-items:center; gap: 8px;
          font-family: var(--font-ui); font-size: 13px;
          color: var(--ink-mid);
        }
        .cw-byline:hover .cw-byline-name{ color: var(--ink); text-decoration: underline; text-underline-offset: 3px; }
        .cw-byline.is-compact{ font-size: 12px; gap: 6px; }
        .cw-avatar-sm{
          width: 22px; height: 22px; border-radius: 50%;
          color: var(--paper); display:flex; align-items:center; justify-content:center;
          font-weight: 600; font-size: 10px;
        }
        .cw-byline.is-compact .cw-avatar-sm{ width: 18px; height: 18px; font-size: 9px; }
        .cw-byline-sep{ color: var(--ink-soft); }
        .cw-byline-date{ color: var(--ink-soft); }
      `}</style>
    </button>
  );
}

function ArticleMeta({ article }) {
  const t = useT();
  const s = useStore().get();
  const isSaved = s.saved.has(article.id);
  return (
    <div className="cw-meta ui">
      <span className="cw-meta-time">{article.readingMinutes} min read</span>
      <span className="cw-meta-dot">·</span>
      <span className="cw-meta-claps">{formatCount(article.claps + (s.claps[article.id] || 0))} applause</span>
      <span className="cw-meta-dot">·</span>
      <span className="cw-meta-responses">{article.responses}</span>
      <span className="cw-meta-spacer"/>
      {article.isMember && <span className="cw-member-pill">Member</span>}
      <button className={`cw-save ${isSaved ? 'is-on' : ''}`}
              onClick={(e) => { e.stopPropagation(); toggleSave(article.id); }}
              aria-label={isSaved ? 'Saved' : 'Save'}>
        <Icon name={isSaved ? 'bookmarkFill' : 'bookmark'} size={18}/>
      </button>
      <style>{`
        .cw-meta{
          display:flex; align-items:center; gap: 8px;
          font-size: 12.5px; color: var(--ink-soft);
        }
        .cw-meta-dot{ color: var(--ink-soft); }
        .cw-meta-spacer{ flex: 1; }
        .cw-member-pill{
          font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase;
          padding: 2px 7px; border-radius: 3px;
          background: oklch(85% 0.06 95);
          color: oklch(35% 0.08 80);
          font-weight: 600;
        }
        html[data-theme="dark"] .cw-member-pill{
          background: oklch(35% 0.08 95); color: oklch(90% 0.08 95);
        }
        .cw-save{ color: var(--ink-soft); padding: 4px; }
        .cw-save:hover, .cw-save.is-on{ color: var(--ink); }
      `}</style>
    </div>
  );
}

function ArticleCardLarge({ article }) {
  const t = useT();
  const topic = getTopic(article.topic);
  return (
    <article className="cw-card cw-card-lead" onClick={() => navigate('reader', { id: article.id })}>
      <div className="cw-card-lead-grid">
        <div className="cw-card-lead-body">
          {topic && <span className="cw-eyebrow ui">{topic.label} · {topic.region}</span>}
          {t.showBylines && <AuthorByline authorId={article.author} date={article.date}/>}
          <h2 className="cw-card-lead-title serif">{article.title}</h2>
          <p className="cw-card-lead-sub">{article.subtitle}</p>
          <ArticleMeta article={article}/>
        </div>
        <div className="cw-card-lead-image imgph" data-label={article.heroLabel || 'lead photograph'}/>
      </div>
      <style>{`
        .cw-card-lead{
          padding: 32px 0; border-bottom: 1px solid var(--rule);
          cursor: default;
        }
        .cw-card-lead-grid{
          display:grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
          gap: 48px; align-items: center;
        }
        .cw-card-lead-body{ display:flex; flex-direction: column; gap: 14px; min-width: 0; }
        .cw-eyebrow{
          font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase;
          color: var(--accent-ink); font-weight: 600;
        }
        .cw-card-lead-title{
          font-family: var(--font-display); font-weight: 600;
          font-size: 44px; line-height: 1.08; letter-spacing: -0.02em;
          margin: 0;
          text-wrap: balance;
          color: var(--ink);
        }
        .cw-card-lead:hover .cw-card-lead-title{ color: var(--accent-ink); }
        .cw-card-lead-sub{
          font-family: var(--font-display); font-size: 20px; line-height: 1.45;
          color: var(--ink-mid); margin: 0;
          font-style: italic;
          text-wrap: pretty;
        }
        .cw-card-lead-image{
          width: 100%; aspect-ratio: 4/3;
          border-radius: 2px;
        }
        @media (max-width: 880px){
          .cw-card-lead-grid{ grid-template-columns: 1fr; gap: 24px; }
          .cw-card-lead-title{ font-size: 32px; }
        }
      `}</style>
    </article>
  );
}

function ArticleCardRow({ article, rank }) {
  const t = useT();
  const topic = getTopic(article.topic);
  return (
    <article className="cw-card cw-card-row" onClick={() => navigate('reader', { id: article.id })}>
      {typeof rank === 'number' && <div className="cw-rank serif">{String(rank).padStart(2, '0')}</div>}
      <div className="cw-row-body">
        {t.showBylines && <AuthorByline authorId={article.author} date={article.date}/>}
        <h3 className="cw-row-title serif">{article.title}</h3>
        <p className="cw-row-sub">{article.excerpt}</p>
        <ArticleMeta article={article}/>
      </div>
      <div className="cw-row-image imgph" data-label={article.heroLabel || 'thumbnail'}/>
      <style>{`
        .cw-card-row{
          display:grid;
          grid-template-columns: ${typeof rank === 'number' ? '52px ' : ''}minmax(0,1fr) 200px;
          gap: 28px;
          padding: 24px 0;
          border-bottom: 1px solid var(--rule);
          align-items: center;
        }
        .cw-rank{
          font-family: var(--font-display); font-weight: 500;
          font-size: 40px; color: var(--ink-soft);
          line-height: 1;
        }
        .cw-row-body{ display:flex; flex-direction:column; gap: 8px; min-width: 0; }
        .cw-row-title{
          font-family: var(--font-display); font-weight: 600;
          font-size: 22px; line-height: 1.22; letter-spacing: -0.012em;
          margin: 0;
          color: var(--ink);
          text-wrap: balance;
        }
        .cw-card-row:hover .cw-row-title{ color: var(--accent-ink); }
        .cw-row-sub{
          font-size: 15px; line-height: 1.5; color: var(--ink-mid);
          margin: 0;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .cw-row-image{
          width: 200px; height: 134px; border-radius: 2px;
        }
        @media (max-width: 720px){
          .cw-card-row{ grid-template-columns: 1fr; }
          .cw-row-image{ width: 100%; height: 180px; }
          .cw-rank{ display: none; }
        }
      `}</style>
    </article>
  );
}

function ArticleCardTile({ article }) {
  const t = useT();
  const topic = getTopic(article.topic);
  return (
    <article className="cw-card cw-card-tile" onClick={() => navigate('reader', { id: article.id })}>
      <div className="cw-tile-image imgph" data-label={article.heroLabel || 'thumbnail'}/>
      <div className="cw-tile-body">
        {topic && <span className="cw-eyebrow ui">{topic.label}</span>}
        <h3 className="cw-tile-title serif">{article.title}</h3>
        {t.showBylines && <AuthorByline authorId={article.author} compact/>}
        <ArticleMeta article={article}/>
      </div>
      <style>{`
        .cw-card-tile{
          display:flex; flex-direction:column; gap: 16px;
          padding: 0 0 28px;
          border-bottom: 1px solid var(--rule);
        }
        .cw-tile-image{
          width: 100%; aspect-ratio: 5/3;
          border-radius: 2px;
        }
        .cw-tile-body{ display:flex; flex-direction:column; gap: 8px; }
        .cw-tile-title{
          font-family: var(--font-display); font-weight: 600;
          font-size: 22px; line-height: 1.22; letter-spacing: -0.012em;
          margin: 0; color: var(--ink);
          text-wrap: balance;
        }
        .cw-card-tile:hover .cw-tile-title{ color: var(--accent-ink); }
      `}</style>
    </article>
  );
}

// ─── Footer ─────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="cw-footer ui">
      <div className="cw-footer-inner">
        <div className="cw-footer-brand">
          <span className="cw-wordmark serif">Caseworks</span>
          <p>Editorial coverage of immigration, tenancy, and family law for students and early-career professionals. Reviewed by practising attorneys.</p>
        </div>
        <div className="cw-footer-col">
          <h4>Read</h4>
          <a>For you</a><a>Latest</a><a>Topics</a><a>Authors</a>
        </div>
        <div className="cw-footer-col">
          <h4>Practice</h4>
          <a>Intake</a><a>Find an attorney</a><a>Compare</a><a>Library</a>
        </div>
        <div className="cw-footer-col">
          <h4>About</h4>
          <a>Editorial policy</a><a>Corrections</a><a>Contact</a><a>Disclaimer</a>
        </div>
      </div>
      <div className="cw-footer-base">
        <span>© 2026 Caseworks Editorial</span>
        <span>·</span>
        <span>Not legal advice. Articles are reviewed; cases are individual.</span>
      </div>
      <style>{`
        .cw-footer{
          border-top: 1px solid var(--rule);
          background: var(--paper-dim);
          margin-top: 80px;
        }
        .cw-footer-inner{
          max-width: var(--max-width); margin: 0 auto;
          padding: 56px 32px 32px;
          display:grid;
          grid-template-columns: 2fr 1fr 1fr 1fr;
          gap: 48px;
        }
        .cw-footer-brand p{
          font-family: var(--font-display); font-style: italic;
          font-size: 15px; line-height: 1.55;
          color: var(--ink-mid); margin: 12px 0 0;
          max-width: 360px;
        }
        .cw-footer-col h4{
          font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase;
          color: var(--ink-soft); margin: 0 0 12px; font-weight: 600;
        }
        .cw-footer-col a{
          display: block; padding: 6px 0; font-size: 14px;
          color: var(--ink-mid);
        }
        .cw-footer-col a:hover{ color: var(--ink); }
        .cw-footer-base{
          max-width: var(--max-width); margin: 0 auto;
          padding: 24px 32px;
          border-top: 1px solid var(--rule);
          display:flex; gap: 12px; flex-wrap: wrap;
          font-size: 12px; color: var(--ink-soft);
        }
        @media (max-width: 880px){
          .cw-footer-inner{ grid-template-columns: 1fr 1fr; }
        }
      `}</style>
    </footer>
  );
}

Object.assign(window, {
  STORE, useStore, useT, TweaksCtx, navigate,
  toggleSave, toggleFollow, clap,
  formatCount, getAuthor, getTopic, getArticle,
  Icon, Nav, TopicBar, ArticleCardLarge, ArticleCardRow, ArticleCardTile,
  AuthorByline, ArticleMeta, Footer,
});
