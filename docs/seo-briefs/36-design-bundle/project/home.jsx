// home.jsx — Editorial home feed.

function Home() {
  const [topic, setTopic] = React.useState(null);
  const t = useT();
  const filtered = React.useMemo(
    () => topic ? ARTICLES.filter((a) => a.topic === topic) : ARTICLES,
    [topic]
  );
  const lead = filtered[0];
  const trio = filtered.slice(1, 4);
  const rest = filtered.slice(4);

  return (
    <main data-screen-label="home">
      <TopicBar active={topic} onPick={setTopic}/>

      <div className="cw-home-masthead">
        <div className="cw-home-masthead-inner">
          <div>
            <span className="cw-home-date ui">Friday, May 22, 2026 · Issue No. 142</span>
            <h1 className="cw-home-hed serif">
              <em>The brief</em> for international students, this week.
            </h1>
          </div>
          <div className="cw-home-stats ui">
            <div><b>47</b><span>new this week</span></div>
            <div><b>4</b><span>practicing reviewers</span></div>
            <div><b>2.1M</b><span>readers in May</span></div>
          </div>
        </div>
      </div>

      <div className="cw-home-shell">
        <div className="cw-home-main">
          {lead && <ArticleCardLarge article={lead}/>}

          {trio.length > 0 && (
            <section className="cw-section">
              <div className="cw-section-head">
                <h2 className="serif">Editor's picks</h2>
                <span className="cw-section-sub ui">Curated by Samira Okafor</span>
              </div>
              <div className="cw-trio">
                {trio.map((a) => <ArticleCardTile key={a.id} article={a}/>)}
              </div>
            </section>
          )}

          {rest.length > 0 && (
            <section className="cw-section">
              <div className="cw-section-head">
                <h2 className="serif">The reading list</h2>
                <span className="cw-section-sub ui">{rest.length} articles · refreshed Fridays</span>
              </div>
              <div className="cw-list">
                {rest.map((a, i) => <ArticleCardRow key={a.id} article={a} rank={i + 1}/>)}
              </div>
            </section>
          )}
        </div>

        <aside className="cw-home-rail">
          <RailSection title="Who's writing">
            <div className="cw-rail-authors">
              {AUTHOR_LIST.slice(0, 4).map((a) => <RailAuthor key={a.id} author={a}/>)}
            </div>
          </RailSection>

          <RailSection title="Trending today">
            <ol className="cw-rail-trending">
              {ARTICLES.slice().sort((x, y) => y.claps - x.claps).slice(0, 5).map((a, i) => (
                <li key={a.id} onClick={() => navigate('reader', { id: a.id })}>
                  <span className="cw-rail-rank serif">{String(i + 1).padStart(2, '0')}</span>
                  <div>
                    <p>{a.title}</p>
                    <span className="cw-rail-meta ui">{getAuthor(a.author).name} · {formatCount(a.claps)} applause</span>
                  </div>
                </li>
              ))}
            </ol>
          </RailSection>

          <RailSection title="Browse topics">
            <div className="cw-rail-topics">
              {TOPICS.map((t) => (
                <button key={t.slug}
                        className={`cw-rail-topic ${topic === t.slug ? 'is-on' : ''}`}
                        onClick={() => setTopic(t.slug)}>
                  {t.label}
                  <span className="cw-rail-topic-region ui">{t.region}</span>
                </button>
              ))}
            </div>
          </RailSection>

          <RailSection title="Membership">
            <div className="cw-rail-member">
              <p className="serif">Reading is free.<br/>Reviewing the deep stack is for members.</p>
              <ul className="ui">
                <li>The full template library</li>
                <li>Member-only walkthroughs</li>
                <li>Direct reader-to-attorney threads</li>
              </ul>
              <button className="cw-rail-cta ui">Try a month</button>
            </div>
          </RailSection>
        </aside>
      </div>

      <style>{`
        .cw-home-masthead{
          border-bottom: 1px solid var(--rule);
        }
        .cw-home-masthead-inner{
          max-width: var(--max-width); margin: 0 auto;
          padding: 56px 32px 40px;
          display:grid; grid-template-columns: minmax(0,1fr) auto;
          gap: 48px; align-items: end;
        }
        .cw-home-date{
          font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase;
          color: var(--ink-soft); font-weight: 500;
          display: block; margin-bottom: 16px;
        }
        .cw-home-hed{
          font-family: var(--font-display); font-weight: 600;
          font-size: 56px; line-height: 1.05; letter-spacing: -0.025em;
          margin: 0; max-width: 720px; color: var(--ink);
          text-wrap: balance;
        }
        .cw-home-hed em{ font-style: italic; color: var(--accent-ink); }
        .cw-home-stats{ display:flex; gap: 32px; color: var(--ink-mid); }
        .cw-home-stats div{ display:flex; flex-direction:column; gap: 4px; }
        .cw-home-stats b{
          font-family: var(--font-display); font-weight: 600;
          font-size: 28px; color: var(--ink); line-height: 1;
          letter-spacing: -0.012em;
        }
        .cw-home-stats span{
          font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase;
          color: var(--ink-soft);
        }
        .cw-home-shell{
          max-width: var(--max-width); margin: 0 auto;
          padding: 0 32px 32px;
          display: grid;
          grid-template-columns: minmax(0, 1fr) 320px;
          gap: 64px;
        }
        .cw-home-main{ min-width: 0; }
        .cw-section{ padding-top: 40px; }
        .cw-section-head{
          display:flex; align-items: baseline; gap: 12px;
          justify-content: space-between;
          padding-bottom: 8px;
          border-bottom: 1px solid var(--ink);
          margin-bottom: 8px;
        }
        .cw-section-head h2{
          font-family: var(--font-display); font-weight: 600;
          font-size: 22px; letter-spacing: -0.012em; margin: 0;
        }
        .cw-section-sub{
          font-size: 12px; color: var(--ink-soft);
          letter-spacing: 0.04em;
        }
        .cw-trio{
          display: grid; grid-template-columns: repeat(3, 1fr);
          gap: 40px; padding-top: 24px;
        }
        .cw-list{ padding-top: 12px; }

        .cw-home-rail{
          display:flex; flex-direction: column; gap: 36px;
          padding-top: 40px;
          position: sticky;
          align-self: start;
          top: 130px;
        }
        @media (max-width: 1080px){
          .cw-home-shell{ grid-template-columns: 1fr; gap: 32px; }
          .cw-home-rail{ position: static; }
          .cw-trio{ grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 720px){
          .cw-home-hed{ font-size: 36px; }
          .cw-home-masthead-inner{ grid-template-columns: 1fr; }
          .cw-trio{ grid-template-columns: 1fr; }
        }
      `}</style>
    </main>
  );
}

function RailSection({ title, children }) {
  return (
    <section className="cw-rail-section">
      <h3 className="ui">{title}</h3>
      {children}
      <style>{`
        .cw-rail-section h3{
          font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase;
          color: var(--ink-soft); font-weight: 600;
          margin: 0 0 16px;
          padding-bottom: 8px; border-bottom: 1px solid var(--rule);
        }
        .cw-rail-trending{
          list-style: none; padding: 0; margin: 0;
          display:flex; flex-direction:column; gap: 14px;
        }
        .cw-rail-trending li{
          display:grid; grid-template-columns: 32px 1fr;
          gap: 8px; align-items: start;
        }
        .cw-rail-trending li:hover p{ color: var(--accent-ink); }
        .cw-rail-rank{
          font-family: var(--font-display); font-weight: 500;
          color: var(--ink-soft); font-size: 22px; line-height: 1.2;
        }
        .cw-rail-trending p{
          font-family: var(--font-display); font-size: 15px;
          line-height: 1.3; margin: 0 0 4px; color: var(--ink);
          font-weight: 500;
        }
        .cw-rail-meta{ font-size: 11.5px; color: var(--ink-soft); }
        .cw-rail-topics{ display:flex; flex-wrap: wrap; gap: 6px; }
        .cw-rail-topic{
          font-family: var(--font-ui); font-size: 12px;
          padding: 6px 10px; border-radius: 999px;
          background: var(--paper-deep);
          color: var(--ink-mid);
          display:flex; align-items:center; gap: 6px;
        }
        .cw-rail-topic.is-on{
          background: var(--ink); color: var(--paper);
        }
        .cw-rail-topic-region{
          font-size: 9.5px; letter-spacing: 0.06em;
          color: var(--ink-soft);
          padding-left: 6px; border-left: 1px solid var(--rule);
        }
        .cw-rail-topic.is-on .cw-rail-topic-region{
          color: color-mix(in oklch, var(--paper) 70%, transparent);
          border-color: color-mix(in oklch, var(--paper) 30%, transparent);
        }
        .cw-rail-member{ display:flex; flex-direction:column; gap: 12px; }
        .cw-rail-member p{
          font-family: var(--font-display); font-size: 18px;
          line-height: 1.35; color: var(--ink); margin: 0;
          font-style: italic;
        }
        .cw-rail-member ul{
          list-style: none; padding: 0; margin: 0;
          display:flex; flex-direction:column; gap: 6px;
          font-size: 13px; color: var(--ink-mid);
        }
        .cw-rail-member li{ padding-left: 16px; position: relative; }
        .cw-rail-member li::before{
          content: ''; position: absolute; left: 0; top: 8px;
          width: 8px; height: 1px; background: var(--accent);
        }
        .cw-rail-cta{
          font-family: var(--font-ui); font-size: 13px; font-weight: 500;
          padding: 10px 16px; border-radius: 999px;
          background: var(--ink); color: var(--paper);
          margin-top: 8px; align-self: flex-start;
        }
        .cw-rail-cta:hover{ background: var(--accent); }
      `}</style>
    </section>
  );
}

function RailAuthor({ author }) {
  const s = useStore().get();
  const isFollowing = s.following.has(author.id);
  return (
    <div className="cw-rail-author">
      <button className="cw-rail-author-info" onClick={() => navigate('author', { id: author.id })}>
        <span className="cw-avatar-md" style={{ background: author.accent }}>{author.initials}</span>
        <div>
          <p className="cw-rail-author-name">{author.name}</p>
          <span className="cw-rail-author-role ui">{author.role}</span>
        </div>
      </button>
      <button className={`cw-follow-mini ui ${isFollowing ? 'is-on' : ''}`}
              onClick={() => toggleFollow(author.id)}>
        {isFollowing ? 'Following' : '+ Follow'}
      </button>
      <style>{`
        .cw-rail-authors{ display:flex; flex-direction:column; gap: 14px; }
        .cw-rail-author{
          display:flex; align-items:center; justify-content: space-between; gap: 8px;
        }
        .cw-rail-author-info{
          display:flex; align-items:center; gap: 10px; flex: 1; min-width: 0;
        }
        .cw-avatar-md{
          width: 36px; height: 36px; border-radius: 50%;
          color: var(--paper); display:flex; align-items:center; justify-content:center;
          font-family: var(--font-ui); font-weight: 600; font-size: 12px;
          flex: 0 0 auto;
        }
        .cw-rail-author-name{
          font-family: var(--font-display); font-size: 15px;
          font-weight: 500; margin: 0; color: var(--ink);
          line-height: 1.2;
        }
        .cw-rail-author-info:hover .cw-rail-author-name{ color: var(--accent-ink); }
        .cw-rail-author-role{
          font-size: 11px; color: var(--ink-soft);
        }
        .cw-follow-mini{
          font-size: 11.5px; font-weight: 500;
          padding: 5px 11px; border-radius: 999px;
          border: 1px solid var(--ink);
          color: var(--ink);
          background: transparent;
        }
        .cw-follow-mini:hover{ background: var(--ink); color: var(--paper); }
        .cw-follow-mini.is-on{
          background: var(--paper-deep); color: var(--ink-mid);
          border-color: var(--rule);
        }
      `}</style>
    </div>
  );
}

Object.assign(window, { Home });
