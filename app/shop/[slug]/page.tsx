import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  IMMIGRATION_SHOP_PRODUCTS,
  getImmigrationShopProduct,
  resolveImmigrationOfficialSource,
} from '@/lib/immigration-shop-products'

const SHOP_CANONICAL = 'https://market.yousafeconsultancy.com/shop'

export const dynamic = 'force-static'

export async function generateStaticParams() {
  return IMMIGRATION_SHOP_PRODUCTS.map((product) => ({ slug: product.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const product = getImmigrationShopProduct(slug)
  if (!product) return {}

  const title = product.name
  const description = product.short_description.slice(0, 160)
  const canonical = `${SHOP_CANONICAL}/${slug}`

  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      url: canonical,
      title,
      description,
      type: 'website',
      siteName: 'YouSafe Consultancy',
    },
  }
}

export default async function ImmigrationShopProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const product = getImmigrationShopProduct(slug)
  if (!product || !product.payhip_published || !product.payhip_url) notFound()

  const canonical = `${SHOP_CANONICAL}/${slug}`
  const officialSources = product.official_sources.map(resolveImmigrationOfficialSource).filter(Boolean)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.short_description,
    category: product.category,
    brand: { '@type': 'Brand', name: 'YouSafe Consultancy' },
    offers: {
      '@type': 'Offer',
      price: product.price_usd.toFixed(2),
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
      url: canonical,
    },
  }

  return (
    <main className="ys-pack-page">
      <style>{PACK_CSS}</style>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav className="ys-pack-crumbs" aria-label="Breadcrumb">
        <Link href="/">Marketplace</Link>
        <span>/</span>
        <Link href="/shop">File shop</Link>
        <span>/</span>
        <span>{product.category}</span>
      </nav>

      <section className="ys-pack-hero">
        <div>
          <p className="ys-pack-kicker">{product.category} · Instant download</p>
          <h1>{product.name}</h1>
          <p className="ys-pack-lede">{product.short_description}</p>
          <div className="ys-pack-tags">
            <span>{product.includes.length} resources</span>
            <span>Editable files</span>
            <span>One-time purchase</span>
          </div>
        </div>

        <aside className="ys-pack-buybox">
          <p>Complete preparation pack</p>
          <strong>${product.price_usd}</strong>
          <span>USD · Digital delivery</span>
          <a href={product.payhip_url} rel="noopener noreferrer nofollow" target="_blank">
            Buy on Payhip
          </a>
          <small>Preparation support only. No outcome is guaranteed.</small>
        </aside>
      </section>

      <div className="ys-pack-layout">
        <div>
          <section className="ys-pack-section">
            <p className="ys-pack-kicker">Inside the download</p>
            <h2>Everything included</h2>
            <ul className="ys-pack-includes">
              {product.includes.map((item) => (
                <li key={item}><span>✓</span>{item}</li>
              ))}
            </ul>
          </section>

          <section className="ys-pack-section">
            <p className="ys-pack-kicker">Built for careful preparation</p>
            <h2>Use the pack to organize a consistent file</h2>
            <p>
              Work through the included resources before opening the official portal. Keep names, dates,
              finances, travel history, school or employer details, and supporting evidence consistent
              across every document.
            </p>
            <ol>
              <li>Create one master folder for this application.</li>
              <li>Complete the worksheets using facts from your official records.</li>
              <li>Flag missing, unsigned, expired, or inconsistent evidence.</li>
              <li>Recheck the current government instructions before submitting.</li>
            </ol>
          </section>

          {officialSources.length > 0 ? (
            <section className="ys-pack-section">
              <p className="ys-pack-kicker">Verify before filing</p>
              <h2>Official government sources</h2>
              <p>Forms, fees, and requirements can change. Use these official pages as the final authority.</p>
              <ul className="ys-pack-sources">
                {officialSources.map((source) => (
                  <li key={source.url}>
                    <a href={source.url} target="_blank" rel="noopener noreferrer">{source.label}</a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="ys-pack-note">
          <h2>What this is—and is not</h2>
          <p>
            This is a self-guided document organization kit. It is not a completed filing, legal advice,
            or a substitute for current instructions from USCIS, the U.S. Department of State, DHS, or IRCC.
          </p>
          <Link href="/categories/immigration">Need professional help? Compare immigration services</Link>
        </aside>
      </div>
    </main>
  )
}

const PACK_CSS = `
  .ys-pack-page { width:min(1160px,calc(100vw - 40px)); margin:0 auto; padding:34px 0 76px; color:var(--ys-ink,#0F172A); font-family:var(--font-outfit),'Outfit',system-ui,sans-serif; }
  .ys-pack-crumbs { display:flex; flex-wrap:wrap; gap:8px; color:var(--ys-inkSoft,#526072); font-size:13px; margin-bottom:26px; }
  .ys-pack-crumbs a { color:var(--ys-ink,#0F172A); text-decoration:none; font-weight:700; }
  .ys-pack-hero { display:grid; grid-template-columns:minmax(0,1.45fr) minmax(280px,.55fr); gap:48px; align-items:center; padding:48px; border:1px solid var(--ys-rule,rgba(15,23,42,.10)); border-radius:24px; background:radial-gradient(120% 180% at 90% -20%,var(--ys-paper3,#E8EBEE),var(--ys-vellum,#fff) 58%); }
  .ys-pack-kicker { margin:0 0 10px; color:var(--ys-teal,#111827); font-size:11px; font-weight:800; letter-spacing:.14em; text-transform:uppercase; }
  .ys-pack-hero h1 { margin:0; max-width:18ch; font-family:var(--font-fraunces),'Fraunces',Georgia,serif; font-size:clamp(34px,5vw,56px); font-weight:800; letter-spacing:-.035em; line-height:1.04; }
  .ys-pack-lede { max-width:62ch; margin:18px 0 22px; color:var(--ys-inkMid,#334155); font-size:17px; line-height:1.65; }
  .ys-pack-tags { display:flex; flex-wrap:wrap; gap:8px; }
  .ys-pack-tags span { padding:6px 10px; border:1px solid var(--ys-rule,rgba(15,23,42,.10)); border-radius:999px; background:var(--ys-vellum,#fff); color:var(--ys-inkMid,#334155); font-size:12px; font-weight:700; }
  .ys-pack-buybox { padding:24px; border-radius:18px; background:var(--ys-vellum,#fff); border:1px solid var(--ys-rule,rgba(15,23,42,.10)); box-shadow:0 24px 48px -34px rgba(15,23,42,.35); }
  .ys-pack-buybox p { margin:0 0 10px; font-size:13px; font-weight:800; }
  .ys-pack-buybox strong { display:block; font-size:38px; line-height:1; }
  .ys-pack-buybox > span { display:block; margin:8px 0 20px; color:var(--ys-inkSoft,#526072); font-size:12px; }
  .ys-pack-buybox > a { display:block; padding:12px 18px; border-radius:999px; background:var(--ys-teal,#111827); color:#fff; text-align:center; text-decoration:none; font-weight:800; }
  .ys-pack-buybox small { display:block; margin-top:12px; color:var(--ys-inkSoft,#526072); font-size:11px; line-height:1.45; }
  .ys-pack-layout { display:grid; grid-template-columns:minmax(0,1fr) 330px; gap:44px; margin-top:54px; align-items:start; }
  .ys-pack-section { padding:0 0 38px; margin-bottom:38px; border-bottom:1px solid var(--ys-rule,rgba(15,23,42,.10)); }
  .ys-pack-section h2,.ys-pack-note h2 { margin:0 0 14px; font-family:var(--font-fraunces),'Fraunces',Georgia,serif; font-size:28px; letter-spacing:-.025em; }
  .ys-pack-section > p:not(.ys-pack-kicker),.ys-pack-section ol { color:var(--ys-inkMid,#334155); font-size:15px; line-height:1.7; }
  .ys-pack-section ol { padding-left:20px; }
  .ys-pack-includes,.ys-pack-sources { margin:0; padding:0; list-style:none; }
  .ys-pack-includes { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .ys-pack-includes li { display:flex; gap:10px; padding:13px 14px; border-radius:12px; background:var(--ys-vellum,#fff); border:1px solid var(--ys-rule,rgba(15,23,42,.10)); font-size:14px; font-weight:650; }
  .ys-pack-includes li span { color:#16724A; font-weight:900; }
  .ys-pack-sources { display:flex; flex-direction:column; gap:9px; }
  .ys-pack-sources a { color:var(--ys-teal,#111827); font-size:14px; font-weight:700; }
  .ys-pack-note { position:sticky; top:112px; padding:24px; border-radius:18px; background:var(--ys-paper2,#F1F3F5); border:1px solid var(--ys-rule,rgba(15,23,42,.10)); }
  .ys-pack-note h2 { font-size:22px; }
  .ys-pack-note p { color:var(--ys-inkMid,#334155); font-size:13px; line-height:1.65; }
  .ys-pack-note a { color:var(--ys-teal,#111827); font-size:13px; font-weight:800; }
  @media(max-width:820px){ .ys-pack-hero,.ys-pack-layout{grid-template-columns:1fr}.ys-pack-hero{padding:28px}.ys-pack-note{position:static}.ys-pack-includes{grid-template-columns:1fr} }
  @media(max-width:600px){ .ys-pack-page{width:min(1160px,calc(100vw - 28px));padding-top:24px}.ys-pack-hero h1{font-size:34px} }
`
