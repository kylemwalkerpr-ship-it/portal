import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  IMMIGRATION_SHOP_PRODUCTS,
  getImmigrationShopProduct,
  resolveImmigrationOfficialSource,
} from '@/lib/immigration-shop-products'
import { getPayhipBundleComponents } from '@/lib/payhipProductBundles'
import {
  applyPayhipBatch1Commercial,
  getPayhipBatch1Commercial,
  getPayhipBatch1CrossSells,
} from '@/lib/payhipBatch1Commercial'

const SHOP_CANONICAL = 'https://market.yousafeconsultancy.com/shop'

export const dynamic = 'force-static'

export async function generateStaticParams() {
  return IMMIGRATION_SHOP_PRODUCTS.map((product) => ({ slug: product.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const baseProduct = getImmigrationShopProduct(slug)
  if (!baseProduct) return {}
  const product = applyPayhipBatch1Commercial(baseProduct)
  const commercial = getPayhipBatch1Commercial(slug)

  const title = `${product.name} | YouSafe File Shop`
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
      images: commercial
        ? [{ url: commercial.cover.imageUrl, width: 1200, height: 800, alt: commercial.cover.alt }]
        : undefined,
    },
  }
}

export default async function ImmigrationShopProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const baseProduct = getImmigrationShopProduct(slug)
  if (!baseProduct || !baseProduct.payhip_published || !baseProduct.payhip_url) notFound()

  const product = applyPayhipBatch1Commercial(baseProduct)
  const commercial = getPayhipBatch1Commercial(slug)
  const payhipUrl = commercial
    ? `https://shop.yousafeconsultancy.com/b/${commercial.payhipId}`
    : product.payhip_url
  const canonical = `${SHOP_CANONICAL}/${slug}`
  const officialSources = product.official_sources.map(resolveImmigrationOfficialSource).filter(Boolean)
  const bundleComponentSlugs = getPayhipBundleComponents(slug) ?? []
  const isBundle = bundleComponentSlugs.length > 0
  const displayIncludes = isBundle
    ? bundleComponentSlugs.map((componentSlug) => getImmigrationShopProduct(componentSlug)?.name ?? componentSlug)
    : product.includes
  const resourceLabel = commercial?.deliveryLabel ?? (isBundle
    ? `${displayIncludes.length} complete preparation packs`
    : `${displayIncludes.length} guided sections`)
  const crossSells = getPayhipBatch1CrossSells(slug, IMMIGRATION_SHOP_PRODUCTS)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.short_description,
    category: product.category,
    image: commercial?.cover.imageUrl,
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
          <p className="ys-pack-kicker">{product.category} · Instant digital delivery</p>
          <h1>{product.name}</h1>
          <p className="ys-pack-lede">{product.short_description}</p>
          <div className="ys-pack-tags">
            <span>{resourceLabel}</span>
            <span>{isBundle ? '15 individually named PDFs' : 'Fillable PDF workbook'}</span>
            <span>Official-source guidance</span>
            <span>One-time purchase</span>
          </div>
        </div>

        <aside className="ys-pack-buybox">
          {commercial ? (
            <figure className="ys-pack-cover">
              <img src={commercial.cover.imageUrl} alt={commercial.cover.alt} width="640" height="420" />
              <figcaption>{commercial.cover.credit}</figcaption>
            </figure>
          ) : null}
          <p>{isBundle ? 'Complete preparation bundle' : 'Self-guided preparation workbook'}</p>
          <strong>${product.price_usd.toFixed(2)}</strong>
          <span>USD · Digital delivery</span>
          <a href={payhipUrl} rel="noopener noreferrer nofollow" target="_blank">
            Buy on Payhip
          </a>
          <small>Preparation and organization support only. No immigration outcome is guaranteed.</small>
        </aside>
      </section>

      <div className="ys-pack-layout">
        <div>
          <section className="ys-pack-section">
            <p className="ys-pack-kicker">Exactly what you receive</p>
            <h2>{isBundle ? '15 separately named preparation workbooks' : 'One workbook with the guided sections below'}</h2>
            {commercial ? <p className="ys-pack-delivery">{commercial.deliveryPromise}</p> : null}
            <ul className="ys-pack-includes">
              {displayIncludes.map((item) => (
                <li key={item}><span>✓</span>{item}</li>
              ))}
            </ul>
          </section>

          <section className="ys-pack-section">
            <p className="ys-pack-kicker">Built for careful preparation</p>
            <h2>Use the workbook before you transfer facts to an official process</h2>
            <p>
              Work from official records rather than memory. Keep names, dates, finances, travel history,
              school or employer details, and supporting evidence consistent across every document.
            </p>
            <ol>
              <li>Create one master folder for the application.</li>
              <li>Complete the workbook from passports, school, employer, financial and prior-filing records.</li>
              <li>Flag missing, unsigned, expired, untranslated or inconsistent evidence.</li>
              <li>Open the current government instructions and make the final filing decision from those sources.</li>
            </ol>
          </section>

          {commercial ? (
            <section className="ys-pack-section ys-pack-guide">
              <p className="ys-pack-kicker">Read before you buy or file</p>
              <h2>{commercial.apex.title}</h2>
              <p>
                The YouSafe article explains the preparation workflow and links into the deeper authority library.
                The paid download stays focused on organizing your own facts and evidence.
              </p>
              <a
                href={`https://yousafeconsultancy.com/blog/${commercial.apex.slug}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Read the full YouSafe guide →
              </a>
              {commercial.apex.authorityLinks.length > 0 ? (
                <div className="ys-pack-guide-links">
                  {commercial.apex.authorityLinks.map((link) => (
                    <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer">{link.label}</a>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          {officialSources.length > 0 ? (
            <section className="ys-pack-section">
              <p className="ys-pack-kicker">Verify before filing</p>
              <h2>Official government sources</h2>
              <p>Forms, fees, eligibility rules and documentary requirements can change. These pages—not the paid workbook—are the final authority.</p>
              <ul className="ys-pack-sources">
                {officialSources.map((source) => (
                  <li key={source.url}>
                    <a href={source.url} target="_blank" rel="noopener noreferrer">{source.label}</a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {crossSells.length > 0 ? (
            <section className="ys-pack-section">
              <p className="ys-pack-kicker">Related preparation tools</p>
              <h2>Only add a workbook when it matches your actual situation</h2>
              <div className="ys-pack-cross">
                {crossSells.map((related) => {
                  const relatedCommercial = getPayhipBatch1Commercial(related.slug)
                  return (
                    <Link key={related.slug} href={`/shop/${related.slug}`} className="ys-pack-cross-card">
                      {relatedCommercial ? (
                        <img src={relatedCommercial.cover.imageUrl} alt={relatedCommercial.cover.alt} width="260" height="150" />
                      ) : null}
                      <div>
                        <strong>{related.name}</strong>
                        <span>${related.price_usd.toFixed(2)}</span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="ys-pack-note">
          <h2>What this is—and is not</h2>
          <p>
            This is a self-guided preparation and document-organization resource. It is not an official government
            form, a completed filing, legal advice, legal representation, or a substitute for current USCIS,
            Department of State, DHS, or IRCC instructions. No approval or immigration outcome is guaranteed.
          </p>
          {commercial ? (
            <>
              <h3>Search tags</h3>
              <div className="ys-pack-mini-tags">
                {commercial.tags.map((tag) => <span key={tag}>{tag}</span>)}
              </div>
            </>
          ) : null}
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
  .ys-pack-hero { display:grid; grid-template-columns:minmax(0,1.35fr) minmax(300px,.65fr); gap:48px; align-items:center; padding:48px; border:1px solid var(--ys-rule,rgba(15,23,42,.10)); border-radius:24px; background:radial-gradient(120% 180% at 90% -20%,var(--ys-paper3,#E8EBEE),var(--ys-vellum,#fff) 58%); }
  .ys-pack-kicker { margin:0 0 10px; color:var(--ys-teal,#111827); font-size:11px; font-weight:800; letter-spacing:.14em; text-transform:uppercase; }
  .ys-pack-hero h1 { margin:0; max-width:19ch; font-family:var(--font-fraunces),'Fraunces',Georgia,serif; font-size:clamp(34px,5vw,56px); font-weight:800; letter-spacing:-.035em; line-height:1.04; }
  .ys-pack-lede { max-width:62ch; margin:18px 0 22px; color:var(--ys-inkMid,#334155); font-size:17px; line-height:1.65; }
  .ys-pack-tags { display:flex; flex-wrap:wrap; gap:8px; }
  .ys-pack-tags span { padding:6px 10px; border:1px solid var(--ys-rule,rgba(15,23,42,.10)); border-radius:999px; background:var(--ys-vellum,#fff); color:var(--ys-inkMid,#334155); font-size:12px; font-weight:700; }
  .ys-pack-buybox { overflow:hidden; padding:18px; border-radius:18px; background:var(--ys-vellum,#fff); border:1px solid var(--ys-rule,rgba(15,23,42,.10)); box-shadow:0 24px 48px -34px rgba(15,23,42,.35); }
  .ys-pack-cover { margin:0 0 18px; }
  .ys-pack-cover img { display:block; width:100%; height:190px; object-fit:cover; border-radius:12px; }
  .ys-pack-cover figcaption { margin-top:6px; color:var(--ys-inkSoft,#526072); font-size:10px; }
  .ys-pack-buybox p { margin:0 0 10px; font-size:13px; font-weight:800; }
  .ys-pack-buybox strong { display:block; font-size:38px; line-height:1; }
  .ys-pack-buybox > span { display:block; margin:8px 0 20px; color:var(--ys-inkSoft,#526072); font-size:12px; }
  .ys-pack-buybox > a { display:block; padding:12px 18px; border-radius:999px; background:var(--ys-teal,#111827); color:#fff; text-align:center; text-decoration:none; font-weight:800; }
  .ys-pack-buybox small { display:block; margin-top:12px; color:var(--ys-inkSoft,#526072); font-size:11px; line-height:1.45; }
  .ys-pack-layout { display:grid; grid-template-columns:minmax(0,1fr) 330px; gap:44px; margin-top:54px; align-items:start; }
  .ys-pack-section { padding:0 0 38px; margin-bottom:38px; border-bottom:1px solid var(--ys-rule,rgba(15,23,42,.10)); }
  .ys-pack-section h2,.ys-pack-note h2 { margin:0 0 14px; font-family:var(--font-fraunces),'Fraunces',Georgia,serif; font-size:28px; letter-spacing:-.025em; }
  .ys-pack-section > p:not(.ys-pack-kicker),.ys-pack-section ol { color:var(--ys-inkMid,#334155); font-size:15px; line-height:1.7; }
  .ys-pack-delivery { padding:14px 16px; border-left:3px solid #16724A; background:rgba(22,114,74,.06); }
  .ys-pack-section ol { padding-left:20px; }
  .ys-pack-includes,.ys-pack-sources { margin:0; padding:0; list-style:none; }
  .ys-pack-includes { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .ys-pack-includes li { display:flex; gap:10px; padding:13px 14px; border-radius:12px; background:var(--ys-vellum,#fff); border:1px solid var(--ys-rule,rgba(15,23,42,.10)); font-size:14px; font-weight:650; }
  .ys-pack-includes li span { color:#16724A; font-weight:900; }
  .ys-pack-sources { display:flex; flex-direction:column; gap:9px; }
  .ys-pack-sources a,.ys-pack-guide > a { color:var(--ys-teal,#111827); font-size:14px; font-weight:800; }
  .ys-pack-guide-links { display:flex; flex-wrap:wrap; gap:8px; margin-top:16px; }
  .ys-pack-guide-links a { padding:7px 10px; border-radius:999px; border:1px solid var(--ys-rule,rgba(15,23,42,.12)); color:var(--ys-inkMid,#334155); font-size:12px; font-weight:700; text-decoration:none; }
  .ys-pack-cross { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }
  .ys-pack-cross-card { overflow:hidden; border:1px solid var(--ys-rule,rgba(15,23,42,.10)); border-radius:14px; background:#fff; color:inherit; text-decoration:none; }
  .ys-pack-cross-card img { width:100%; height:112px; object-fit:cover; display:block; }
  .ys-pack-cross-card div { padding:12px; }
  .ys-pack-cross-card strong { display:block; font-size:13px; line-height:1.35; }
  .ys-pack-cross-card span { display:block; margin-top:8px; font-size:13px; font-weight:900; }
  .ys-pack-note { position:sticky; top:112px; padding:24px; border-radius:18px; background:var(--ys-paper2,#F1F3F5); border:1px solid var(--ys-rule,rgba(15,23,42,.10)); }
  .ys-pack-note h2 { font-size:22px; }
  .ys-pack-note h3 { margin:20px 0 8px; font-size:13px; }
  .ys-pack-note p { color:var(--ys-inkMid,#334155); font-size:13px; line-height:1.65; }
  .ys-pack-note > a { display:inline-block; margin-top:18px; color:var(--ys-teal,#111827); font-size:13px; font-weight:800; }
  .ys-pack-mini-tags { display:flex; flex-wrap:wrap; gap:6px; }
  .ys-pack-mini-tags span { padding:4px 7px; border-radius:999px; background:#fff; border:1px solid var(--ys-rule,rgba(15,23,42,.10)); font-size:10px; }
  @media(max-width:900px){ .ys-pack-cross{grid-template-columns:1fr 1fr} }
  @media(max-width:820px){ .ys-pack-hero,.ys-pack-layout{grid-template-columns:1fr}.ys-pack-hero{padding:28px}.ys-pack-note{position:static}.ys-pack-includes{grid-template-columns:1fr} }
  @media(max-width:600px){ .ys-pack-page{width:min(1160px,calc(100vw - 28px));padding-top:24px}.ys-pack-hero h1{font-size:34px}.ys-pack-cross{grid-template-columns:1fr} }
`