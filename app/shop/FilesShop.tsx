'use client'

import { useState } from 'react'
import { FILE_SHOP_FILTERS, FILE_SHOP_PRODUCTS, type FileShopCategory } from '@/lib/files-shop-catalog'

type FilterId = 'all' | FileShopCategory

export default function FilesShop() {
  const [filter, setFilter] = useState<FilterId>('all')
  const visible = FILE_SHOP_PRODUCTS.filter((p) => filter === 'all' || p.cat === filter)

  return (
    <div className="files-shop">
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,500&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
        rel="stylesheet"
      />
      <style>{SHOP_CSS}</style>
      <header>
        <div className="wrap header-row">
          <div className="wordmark">Yousafe <span>Consultancy</span></div>
          <nav>
            <a href="#catalog">Tools</a>
            <a href="#trust">Why Us</a>
            <a href="/">Marketplace</a>
            <a href="/templates">Visa kits</a>
          </nav>
        </div>
      </header>

      <section className="hero">
        <div className="wrap">
          <div className="eyebrow">Field-tested tools, not theory</div>
          <h1>Systems for people who <em>run their business alone.</em></h1>
          <p>
            Spreadsheets, templates, and short guides — built for freelancers, consultants, and solo
            operators. Pay once, download instantly. Checkout is handled securely on Payhip.
          </p>
          <div className="file-index">
            <span>CATALOG — {FILE_SHOP_PRODUCTS.length} FILES</span>
            <span>FORMAT — INSTANT DOWNLOAD</span>
            <span>NO SUBSCRIPTION REQUIRED</span>
          </div>
        </div>
      </section>

      <section className="catalog" id="catalog">
        <div className="wrap">
          <div className="catalog-head">
            <div>
              <div className="eyebrow">Open files — {FILE_SHOP_PRODUCTS.length} on record</div>
              <h2>Pick your tool</h2>
            </div>
          </div>

          <div className="filter-row">
            {FILE_SHOP_FILTERS.map((pill) => (
              <button
                key={pill.id}
                type="button"
                className={`filter-pill${filter === pill.id ? ' active' : ''}`}
                onClick={() => setFilter(pill.id)}
              >
                {pill.label}
              </button>
            ))}
          </div>

          <div className="files">
            {visible.map((p) => (
              <article key={p.id} className="file-card">
                <div className="file-tab">FILE {p.file}</div>
                <div className="stamp">
                  {p.stamp.split('\n').map((line) => (
                    <span key={line}>
                      {line}
                      <br />
                    </span>
                  ))}
                </div>
                <div className="file-format">{p.format}</div>
                <h3>{p.title}</h3>
                <p className="desc">{p.desc}</p>
                <ul>
                  <li>{p.bullets[0]}</li>
                  <li>{p.bullets[1]}</li>
                </ul>
                <div className="file-footer">
                  <div className="price">
                    ${p.price}
                    <sup>.00</sup>
                  </div>
                  {p.published ? (
                    <a className="buy-btn" href={p.href} data-product={p.id} rel="noopener noreferrer">
                      Get file →
                    </a>
                  ) : (
                    <span className="buy-btn soon">Coming soon</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="trust" id="trust">
        <div className="wrap">
          <div className="eyebrow">Why these files</div>
          <div className="trust-grid">
            <div className="trust-item">
              <h4>Built for one-person operations</h4>
              <p>No team seats, no onboarding calls. Every file is designed to be opened and used the same day, by someone with no time to learn new software.</p>
            </div>
            <div className="trust-item">
              <h4>No subscriptions, ever</h4>
              <p>Pay once, own it. No recurring charges, no feature paywalls, no “upgrade to unlock” tricks.</p>
            </div>
            <div className="trust-item">
              <h4>Delivered instantly</h4>
              <p>Checkout is on Payhip. Your download link arrives in seconds — no waiting, no manual fulfillment.</p>
            </div>
          </div>
        </div>
      </section>

      <footer>
        <div className="wrap footer-row">
          <p>YOUSAFE CONSULTANCY — MARKET.YOUSAFECONSULTANCY.COM/SHOP</p>
          <p>
            QUESTIONS:{' '}
            <a href="mailto:hello@yousafeconsultancy.com">HELLO@YOUSAFECONSULTANCY.COM</a>
            {' · '}
            <a href="/">BACK TO MARKETPLACE</a>
          </p>
        </div>
      </footer>
    </div>
  )
}

const SHOP_CSS = `
  .files-shop{
    --navy:#1B2436;
    --navy-soft:#3A4459;
    --paper:#F1EFE6;
    --paper-raised:#FBFAF5;
    --mustard:#C28E1B;
    --teal:#0F766E;
    --line:#D8D4C4;
    --muted:#6B6A5F;
    background:var(--paper);
    color:var(--navy);
    font-family:'IBM Plex Sans', sans-serif;
    -webkit-font-smoothing:antialiased;
    min-height:100vh;
    background-image:
      radial-gradient(circle at 20% 10%, rgba(194,142,27,0.05), transparent 40%),
      radial-gradient(circle at 90% 30%, rgba(15,118,110,0.05), transparent 45%);
  }
  .files-shop *{box-sizing:border-box;}
  .files-shop .wrap{max-width:1080px;margin:0 auto;padding:0 28px;}
  .files-shop a{color:inherit;}
  .files-shop header{padding:28px 0 20px;border-bottom:1px solid var(--line);}
  .files-shop .header-row{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;}
  .files-shop .wordmark{font-family:'Fraunces', serif;font-weight:600;font-size:20px;letter-spacing:0.02em;}
  .files-shop .wordmark span{color:var(--teal);}
  .files-shop nav a{
    font-family:'IBM Plex Mono', monospace;font-size:12px;text-transform:uppercase;
    letter-spacing:0.08em;text-decoration:none;color:var(--navy-soft);margin-left:22px;
  }
  .files-shop .eyebrow{
    font-family:'IBM Plex Mono', monospace;font-size:12px;letter-spacing:0.14em;
    text-transform:uppercase;color:var(--mustard);display:flex;align-items:center;gap:10px;
  }
  .files-shop .eyebrow::before{content:"";width:22px;height:1px;background:var(--mustard);display:inline-block;}
  .files-shop .hero{padding:76px 0 56px;}
  .files-shop .hero h1{
    font-family:'Fraunces', serif;font-weight:600;font-size:clamp(34px, 5.2vw, 58px);
    line-height:1.08;margin:18px 0 20px;max-width:820px;
  }
  .files-shop .hero h1 em{font-style:italic;font-weight:500;color:var(--teal);}
  .files-shop .hero p{max-width:560px;font-size:17px;line-height:1.6;color:var(--navy-soft);margin-bottom:0;}
  .files-shop .file-index{
    font-family:'IBM Plex Mono', monospace;font-size:12px;color:var(--muted);
    margin-top:34px;padding-top:18px;border-top:1px dashed var(--line);display:flex;gap:36px;flex-wrap:wrap;
  }
  .files-shop section.catalog{padding:36px 0 70px;}
  .files-shop .catalog-head{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:34px;flex-wrap:wrap;gap:14px;}
  .files-shop .catalog-head h2{font-family:'Fraunces', serif;font-weight:600;font-size:28px;margin:6px 0 0;}
  .files-shop .files{display:grid;grid-template-columns:repeat(3, 1fr);gap:22px;}
  @media (max-width:920px){ .files-shop .files{grid-template-columns:1fr 1fr;} }
  @media (max-width:600px){ .files-shop .files{grid-template-columns:1fr;} }
  .files-shop .file-card{
    background:var(--paper-raised);border:1px solid var(--line);position:relative;
    padding:28px 24px 24px;display:flex;flex-direction:column;
    transition:transform .18s ease, box-shadow .18s ease;
  }
  .files-shop .file-card:hover{transform:translateY(-3px);box-shadow:0 14px 30px -18px rgba(27,36,54,0.35);}
  .files-shop .file-tab{
    position:absolute;top:-13px;left:28px;background:var(--navy);color:var(--paper-raised);
    font-family:'IBM Plex Mono', monospace;font-size:11px;letter-spacing:0.08em;padding:5px 12px;
  }
  .files-shop .file-format{
    font-family:'IBM Plex Mono', monospace;font-size:11px;letter-spacing:0.06em;
    color:var(--muted);text-transform:uppercase;margin-bottom:14px;
  }
  .files-shop .file-card h3{font-family:'Fraunces', serif;font-weight:600;font-size:19px;line-height:1.28;margin:0 0 10px;}
  .files-shop .file-card p.desc{font-size:13.5px;line-height:1.55;color:var(--navy-soft);margin:0 0 16px;flex-grow:1;}
  .files-shop .file-card ul{list-style:none;padding:0;margin:0 0 18px;font-size:12.5px;color:var(--navy-soft);}
  .files-shop .file-card ul li{padding-left:16px;position:relative;margin-bottom:6px;line-height:1.45;}
  .files-shop .file-card ul li::before{content:"—";position:absolute;left:0;color:var(--teal);}
  .files-shop .file-footer{margin-top:auto;display:flex;align-items:center;justify-content:space-between;padding-top:18px;border-top:1px dashed var(--line);}
  .files-shop .price{font-family:'Fraunces', serif;font-weight:600;font-size:19px;}
  .files-shop .price sup{font-size:11px;font-weight:500;}
  .files-shop .buy-btn{
    font-family:'IBM Plex Mono', monospace;font-size:11px;letter-spacing:0.05em;text-transform:uppercase;
    text-decoration:none;background:var(--navy);color:var(--paper-raised);padding:10px 16px;display:inline-block;
  }
  .files-shop .buy-btn:hover{background:var(--teal);}
  .files-shop .buy-btn.soon{
    background:transparent;color:var(--muted);border:1px solid var(--line);cursor:default;padding:9px 16px;
  }
  .files-shop .buy-btn.soon:hover{background:transparent;color:var(--muted);}
  .files-shop .stamp{
    position:absolute;top:20px;right:20px;width:44px;height:44px;border:1.5px solid var(--mustard);
    border-radius:50%;display:flex;align-items:center;justify-content:center;transform:rotate(-8deg);
    font-family:'IBM Plex Mono', monospace;font-size:7px;letter-spacing:0.04em;color:var(--mustard);
    text-align:center;line-height:1.25;opacity:0.85;
  }
  .files-shop .filter-row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:28px;}
  .files-shop .filter-pill{
    font-family:'IBM Plex Mono', monospace;font-size:11px;letter-spacing:0.04em;text-transform:uppercase;
    padding:7px 14px;border:1px solid var(--line);background:transparent;color:var(--navy-soft);cursor:pointer;
  }
  .files-shop .filter-pill:hover, .files-shop .filter-pill.active{
    background:var(--navy);color:var(--paper-raised);border-color:var(--navy);
  }
  .files-shop .trust{padding:50px 0 60px;border-top:1px solid var(--line);}
  .files-shop .trust-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:30px;margin-top:30px;}
  @media (max-width:720px){ .files-shop .trust-grid{grid-template-columns:1fr;} }
  .files-shop .trust-item h4{
    font-family:'IBM Plex Mono', monospace;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;
    color:var(--teal);margin:0 0 10px;
  }
  .files-shop .trust-item p{font-size:14.5px;line-height:1.6;color:var(--navy-soft);margin:0;}
  .files-shop footer{border-top:1px solid var(--line);padding:30px 0 40px;}
  .files-shop .footer-row{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;}
  .files-shop footer p{font-family:'IBM Plex Mono', monospace;font-size:12px;color:var(--muted);margin:0;}
`
