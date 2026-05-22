// author.jsx — Author profile page.

function AuthorPage({ authorId }) {
  const author = getAuthor(authorId) || AUTHOR_LIST[0];
  const s = useStore().get();
  const isFollowing = s.following.has(author.id);
  const articles = ARTICLES.filter((a) => a.author === author.id);
  const [tab, setTab] = React.useState('writing');
  const t = useT();

  return (
    <main data-screen-label="author">
      <div className="cw-author-hero">
        <div className="cw-author-hero-inner">
          <button className="cw-topic-link ui" onClick={() => navigate('home')}>
            ← Caseworks
          </button>
          <div className="cw-author-id">
            <span className="cw-avatar-hero" style={{ background: author.accent }}>{author.initials}</span>
            <div>
              <span className="cw-author-eyebrow ui">{author.role}</span>
              <h1 className="cw-author-name serif">{author.name}</h1>
              <p className="cw-author-meta ui">
                {author.firm} · {author.location}{author.bar ? ` · ${author.bar}` : ''}
              </p>
            </div>
          </div>
          <div className="cw-author-actions">
            <button className={`cw-follow-btn cw-follow-big ui ${isFollowing ? 'is-on' : ''}`}
                    onClick={() => toggleFollow(author.id)}>
              {isFollowing ? <><Icon name="check" size={16}/> Following</> : <><Icon name="plus" size={16}/> Follow</>}
            </button>
            <button className="cw-author-action ui"><Icon name="comment" size={16}/> Message</button>
            <button className="cw-author-action ui"><Icon name="feed" size={16}/> Subscribe to digest</button>
          </div>
          <p className="cw-author-bio serif">{author.bio}</p>
          <div className="cw-author-stats ui">
            <div><b>{formatCount(author.following)}</b><span>followers</span></div>
            <div><b>{author.articles}</b><span>articles</span></div>
            <div><b>{formatCount(articles.reduce((s, a) => s + a.claps, 0))}</b><span>applause</span></div>
            <div><b>4.9</b><span>reviewer score</span></div>
          </div>
        </div>
      </div>

      <div className="cw-author-shell">
        <div className="cw-author-tabs ui">
          {['writing', 'about', 'pinned', 'list'].map((id) => (
            <button key={id}
                    className={`cw-author-tab ${tab === id ? 'is-on' : ''}`}
                    onClick={() => setTab(id)}>
              {id === 'writing' ? 'Writing' : id === 'about' ? 'About' : id === 'pinned' ? 'Pinned' : 'Reading list'}
            </button>
          ))}
        </div>

        <div className="cw-author-body">
          {tab === 'writing' && (
            <div className="cw-author-articles">
              {articles.length === 0 && <p className="cw-author-empty serif">No published writing in this view.</p>}
              {articles.map((a, i) => (
                <ArticleCardRow key={a.id} article={a} rank={i + 1}/>
              ))}
            </div>
          )}
          {tab === 'about' && (
            <div className="cw-author-about prose">
              <h2>About {author.name.split(' ')[0]}</h2>
              <p>{author.bio}</p>
              <h2>Practice areas</h2>
              <ul>
                <li>Student visa filings and consular preparation</li>
                <li>Optional Practical Training applications and extensions</li>
                <li>Status maintenance, reinstatement, and SEVIS issues</li>
                <li>Bar-supervised contributor to the Caseworks Editorial desk</li>
              </ul>
              <h2>Editorial review policy</h2>
              <p>{author.name.split(' ')[0]} reviews every article published under their byline against the most recent USCIS, Department of State, and SEVP guidance. Articles older than ninety days carry a "last reviewed" date in the masthead and are revisited when the underlying rules change.</p>
              <h2>Contact</h2>
              <p>For corrections or to flag an issue with an article, write to <a>corrections@caseworks.example</a>. For client matters, {author.firm} is the appropriate route. Caseworks does not establish an attorney–client relationship through its editorial pages.</p>
            </div>
          )}
          {tab === 'pinned' && articles[0] && (
            <div className="cw-author-pinned">
              <p className="cw-pinned-label ui">Pinned by {author.name}</p>
              <ArticleCardLarge article={articles[0]}/>
            </div>
          )}
          {tab === 'list' && (
            <div className="cw-author-list">
              <p className="cw-pinned-label ui">{author.name.split(' ')[0]}'s public reading list · 12 articles</p>
              {ARTICLES.slice(0, 5).map((a) => (
                <ArticleCardRow key={a.id} article={a}/>
              ))}
            </div>
          )}
        </div>

        <aside className="cw-author-rail">
          <div className="cw-rail-section">
            <h3 className="ui">Reviewed by</h3>
            <div className="cw-rail-authors">
              {AUTHOR_LIST.filter((a) => a.id !== author.id).slice(0, 3).map((a) => (
                <RailAuthor key={a.id} author={a}/>
              ))}
            </div>
          </div>
          <div className="cw-rail-section">
            <h3 className="ui">Writes about</h3>
            <div className="cw-rail-topics">
              {Array.from(new Set(articles.map((a) => a.topic))).map((slug) => (
                <button key={slug} className="cw-rail-topic">{getTopic(slug)?.label}</button>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <style>{`
        .cw-author-hero{
          border-bottom: 1px solid var(--rule);
          background: var(--paper);
        }
        .cw-author-hero-inner{
          max-width: 880px; margin: 0 auto;
          padding: 56px 32px 48px;
        }
        .cw-author-hero .cw-topic-link{ margin-bottom: 32px; }
        .cw-author-id{
          display:flex; align-items:center; gap: 24px;
          margin-bottom: 28px;
        }
        .cw-avatar-hero{
          width: 88px; height: 88px; border-radius: 50%;
          color: var(--paper); display:flex; align-items:center; justify-content:center;
          font-family: var(--font-ui); font-weight: 600; font-size: 30px;
          flex: 0 0 auto;
        }
        .cw-author-eyebrow{
          font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase;
          color: var(--accent-ink); font-weight: 600; display: block; margin-bottom: 4px;
        }
        .cw-author-name{
          font-family: var(--font-display); font-weight: 600;
          font-size: 56px; line-height: 1; letter-spacing: -0.025em;
          margin: 0 0 6px; color: var(--ink);
        }
        .cw-author-meta{ font-size: 13px; color: var(--ink-soft); }
        .cw-author-actions{
          display:flex; flex-wrap: wrap; gap: 8px;
          margin-bottom: 28px;
        }
        .cw-follow-big{ font-size: 14px; padding: 9px 18px; }
        .cw-author-action{
          display:inline-flex; align-items:center; gap: 6px;
          font-size: 13px; color: var(--ink-mid);
          padding: 9px 14px; border-radius: 999px;
          border: 1px solid var(--rule);
        }
        .cw-author-action:hover{ background: var(--paper-deep); color: var(--ink); }
        .cw-author-bio{
          font-family: var(--font-display);
          font-size: 22px; line-height: 1.45;
          color: var(--ink); margin: 0 0 28px;
          max-width: 640px; font-style: italic;
          text-wrap: pretty;
        }
        .cw-author-stats{
          display:flex; gap: 40px; padding-top: 20px;
          border-top: 1px solid var(--rule);
        }
        .cw-author-stats div{ display:flex; flex-direction:column; gap: 2px; }
        .cw-author-stats b{
          font-family: var(--font-display); font-weight: 600;
          font-size: 22px; color: var(--ink); line-height: 1.1;
        }
        .cw-author-stats span{
          font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase;
          color: var(--ink-soft);
        }
        .cw-author-shell{
          max-width: var(--max-width); margin: 0 auto;
          padding: 0 32px 32px;
          display:grid; grid-template-columns: minmax(0,1fr) 280px;
          gap: 64px;
        }
        .cw-author-tabs{
          grid-column: 1 / -1;
          display:flex; gap: 4px;
          border-bottom: 1px solid var(--rule);
          margin-bottom: 16px;
          overflow-x: auto;
        }
        .cw-author-tab{
          padding: 16px 0; margin-right: 28px;
          font-size: 14px; color: var(--ink-soft);
          border-bottom: 1px solid transparent;
          margin-bottom: -1px;
          white-space: nowrap;
        }
        .cw-author-tab:hover{ color: var(--ink); }
        .cw-author-tab.is-on{ color: var(--ink); border-bottom-color: var(--ink); }
        .cw-author-body{ padding-top: 16px; min-width: 0; }
        .cw-author-empty{ color: var(--ink-soft); font-style: italic; padding: 32px 0; }
        .cw-author-rail{
          padding-top: 32px;
          display:flex; flex-direction:column; gap: 36px;
        }
        .cw-pinned-label{
          font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase;
          color: var(--ink-soft); font-weight: 600;
          padding-bottom: 12px;
        }
        .cw-author-about{ max-width: 680px; }
        .cw-author-about h2{ font-size: 24px; }
        @media (max-width: 1080px){
          .cw-author-shell{ grid-template-columns: 1fr; }
          .cw-author-rail{ display:none; }
        }
        @media (max-width: 720px){
          .cw-author-id{ flex-direction: column; align-items: flex-start; gap: 16px; }
          .cw-author-name{ font-size: 36px; }
          .cw-author-stats{ gap: 24px; flex-wrap: wrap; }
        }
      `}</style>
    </main>
  );
}

Object.assign(window, { AuthorPage });
