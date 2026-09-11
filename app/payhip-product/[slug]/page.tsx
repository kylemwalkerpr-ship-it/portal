import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  PAYHIP_BATCHES_2_4_PRODUCTS,
  getPayhipBatches24Product,
  getPayhipBatches24RelatedProducts,
} from '@/lib/payhipBatches24'

const MARKET = 'https://market.yousafeconsultancy.com'
const PAYHIP = 'https://shop.yousafeconsultancy.com/b'
const APEX = 'https://yousafeconsultancy.com/blog'

export const dynamic = 'force-static'

export function generateStaticParams() {
  return PAYHIP_BATCHES_2_4_PRODUCTS.map((product) => ({ slug: product.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const product = getPayhipBatches24Product(slug)
  if (!product) return {}

  const canonical = `${MARKET}/shop/${product.slug}`
  const shortName = product.name.split(' — ')[0]
  const description = product.description.slice(0, 160)

  return {
    title: `${shortName} | YouSafe Marketplace`,
    description,
    keywords: product.tags,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      type: 'website',
      url: canonical,
      title: product.name,
      description,
      siteName: 'YouSafe Consultancy',
      images: [{ url: product.imageUrl, width: 1200, height: 800, alt: product.imageAlt }],
    },
    twitter: {
      card: 'summary_large_image',
      title: product.name,
      description,
      images: [product.imageUrl],
    },
  }
}

function truthBoundary(productNumber: number) {
  if (productNumber <= 16) {
    return 'Self-guided immigration preparation only. This is not an official government form, legal advice, legal representation or a guarantee of approval. Verify current government instructions before filing.'
  }
  if (productNumber === 18 || productNumber === 28) {
    return 'Personal reflection and planning resource only. It is not medical, psychological or mental-health diagnosis or treatment.'
  }
  if ([30, 33, 34, 35].includes(productNumber)) {
    return 'Operational planning tool only. It is not tax, accounting, investment or financial advice, and calculated estimates should be checked against your real records and professional obligations.'
  }
  if ([29, 36].includes(productNumber)) {
    return 'Prompt resource only. AI output can be wrong or incomplete. Verify factual, legal, financial, medical and other high-stakes output independently before using it.'
  }
  return 'Digital self-service resource. Edit, test and proof the file in your own software and workflow before relying on a final output.'
}

export default async function PayhipProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const product = getPayhipBatches24Product(slug)
  if (!product) notFound()

  const canonical = `${MARKET}/shop/${product.slug}`
  const payhipUrl = `${PAYHIP}/${product.payhipId}`
  const apexUrl = `${APEX}/${product.apexSlug}`
  const related = getPayhipBatches24RelatedProducts(product)
  const boundary = truthBoundary(product.productNumber)

  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description,
    image: product.imageUrl,
    category: product.marketplaceCategory,
    brand: { '@type': 'Brand', name: 'YouSafe Consultancy' },
    offers: {
      '@type': 'Offer',
      url: payhipUrl,
      price: product.price.toFixed(2),
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
    },
  }
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Marketplace', item: MARKET },
      { '@type': 'ListItem', position: 2, name: 'File Shop', item: `${MARKET}/shop` },
      { '@type': 'ListItem', position: 3, name: product.name, item: canonical },
    ],
  }

  return (
    <main className="ys-audited-product">
      <style>{PRODUCT_CSS}</style>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      <nav className="ys-ap-crumbs" aria-label="Breadcrumb">
        <Link href="/">Marketplace</Link><span>/</span><Link href="/shop">File shop</Link><span>/</span><span>{product.marketplaceCategory}</span>
      </nav>

      <section className="ys-ap-hero">
        <div className="ys-ap-copy">
          <p className="ys-ap-kicker">Audited digital product · Instant delivery</p>
          <h1>{product.name}</h1>
          <p className="ys-ap-lede">{product.description}</p>
          <div className="ys-ap-tags" aria-label="Search tags">
            {product.tags.map((tag) => (
              <Link key={tag} href={`/?q=${encodeURIComponent(tag)}`} aria-label={`Search Marketplace for ${tag}`}>{tag}</Link>
            ))}
          </div>
        </div>

        <aside className="ys-ap-buybox">
          <img src={product.imageUrl} alt={product.imageAlt} width="720" height="480" />
          <div className="ys-ap-buybox-body">
            <p>{product.deliveryLabel}</p>
            <strong>${product.price.toFixed(2)}</strong>
            <span>USD · One-time purchase</span>
            <a href={payhipUrl} target="_blank" rel="noopener noreferrer nofollow">Buy on Payhip</a>
            <small>Buyer file, price and cover were verified during the Payhip Phase-A QA pass.</small>
          </div>
        </aside>
      </section>

      <div className="ys-ap-layout">
        <div>
          <section className="ys-ap-section">
            <p className="ys-ap-kicker">What you receive</p>
            <h2>{product.deliveryLabel}</h2>
            <p>{product.description}</p>
          </section>

          <section className="ys-ap-section ys-ap-guide">
            <p className="ys-ap-kicker">Use it well</p>
            <h2>Read the full YouSafe workflow guide before you start</h2>
            <p>The Apex guide explains how to use this exact product, where its limits are, and what should be verified separately before you rely on the finished work.</p>
            <a href={apexUrl} target="_blank" rel="noopener noreferrer">Read the product workflow guide →</a>
          </section>

          {product.authorityLinks.length > 0 ? (
            <section className="ys-ap-section">
              <p className="ys-ap-kicker">Current authority layer</p>
              <h2>Verify current official requirements</h2>
              <p>Forms, fees, filing windows, eligibility and documentary requirements can change. The official source—not the paid workbook—is the final authority.</p>
              <div className="ys-ap-authority">
                {product.authorityLinks.map((link) => (
                  <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer">{link.label} ↗</a>
                ))}
              </div>
            </section>
          ) : null}

          {related.length > 0 ? (
            <section className="ys-ap-section">
              <p className="ys-ap-kicker">Related tools</p>
              <h2>Add another product only when it solves a separate job</h2>
              <div className="ys-ap-related">
                {related.map((item) => (
                  <Link key={item.slug} href={`/shop/${item.slug}`}>
                    <img src={item.imageUrl} alt={item.imageAlt} width="280" height="180" />
                    <span><strong>{item.name}</strong><small>${item.price.toFixed(2)}</small></span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="ys-ap-note">
          <p className="ys-ap-kicker">Truth boundary</p>
          <h2>Know what the product does—and what it does not do</h2>
          <p>{boundary}</p>
          <a href={payhipUrl} target="_blank" rel="noopener noreferrer nofollow">Open exact Payhip product →</a>
        </aside>
      </div>
    </main>
  )
}

const PRODUCT_CSS = `
.ys-audited-product{width:min(1160px,calc(100vw - 36px));margin:0 auto;padding:34px 0 80px;color:var(--ys-ink,#0f172a);font-family:var(--font-outfit),'Outfit',system-ui,sans-serif}.ys-ap-crumbs{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:26px;color:var(--ys-inkSoft,#526072);font-size:13px}.ys-ap-crumbs a{color:inherit;text-decoration:none;font-weight:700}.ys-ap-hero{display:grid;grid-template-columns:minmax(0,1.28fr) minmax(310px,.72fr);gap:44px;align-items:center;padding:46px;border:1px solid var(--ys-rule,rgba(15,23,42,.1));border-radius:24px;background:radial-gradient(120% 180% at 90% -20%,var(--ys-paper3,#e8ebee),var(--ys-vellum,#fff) 58%)}.ys-ap-kicker{margin:0 0 10px;font-size:11px;font-weight:850;letter-spacing:.14em;text-transform:uppercase;color:var(--ys-teal,#111827)}.ys-ap-copy h1{max-width:19ch;margin:0;font-family:var(--font-fraunces),'Fraunces',Georgia,serif;font-size:clamp(34px,5vw,56px);line-height:1.04;letter-spacing:-.035em}.ys-ap-lede{max-width:66ch;margin:18px 0 22px;color:var(--ys-inkMid,#334155);font-size:17px;line-height:1.65}.ys-ap-tags{display:flex;flex-wrap:wrap;gap:8px}.ys-ap-tags a{padding:7px 11px;border:1px solid var(--ys-rule,rgba(15,23,42,.12));border-radius:999px;background:#fff;color:var(--ys-inkMid,#334155);font-size:12px;font-weight:750;text-decoration:none}.ys-ap-tags a:hover{border-color:rgba(15,23,42,.34)}.ys-ap-buybox{overflow:hidden;border:1px solid var(--ys-rule,rgba(15,23,42,.1));border-radius:18px;background:#fff;box-shadow:0 24px 48px -34px rgba(15,23,42,.35)}.ys-ap-buybox>img{display:block;width:100%;height:230px;object-fit:cover}.ys-ap-buybox-body{padding:20px}.ys-ap-buybox-body p{margin:0 0 10px;font-size:13px;font-weight:800}.ys-ap-buybox-body strong{display:block;font-size:38px;line-height:1}.ys-ap-buybox-body>span{display:block;margin:8px 0 20px;color:var(--ys-inkSoft,#526072);font-size:12px}.ys-ap-buybox-body>a{display:block;padding:13px 18px;border-radius:999px;background:var(--ys-teal,#111827);color:#fff;text-align:center;text-decoration:none;font-weight:850}.ys-ap-buybox-body small{display:block;margin-top:12px;color:var(--ys-inkSoft,#526072);font-size:11px;line-height:1.45}.ys-ap-layout{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:44px;margin-top:54px;align-items:start}.ys-ap-section{padding:0 0 38px;margin-bottom:38px;border-bottom:1px solid var(--ys-rule,rgba(15,23,42,.1))}.ys-ap-section h2,.ys-ap-note h2{margin:0 0 14px;font-family:var(--font-fraunces),'Fraunces',Georgia,serif;font-size:28px;letter-spacing:-.025em}.ys-ap-section>p:not(.ys-ap-kicker),.ys-ap-note p{color:var(--ys-inkMid,#334155);font-size:15px;line-height:1.7}.ys-ap-guide>a,.ys-ap-note>a{color:var(--ys-teal,#111827);font-weight:850}.ys-ap-authority{display:grid;gap:9px}.ys-ap-authority a{padding:13px 15px;border:1px solid var(--ys-rule,rgba(15,23,42,.1));border-radius:12px;color:var(--ys-ink,#0f172a);font-size:14px;font-weight:800;text-decoration:none}.ys-ap-related{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.ys-ap-related>a{overflow:hidden;border:1px solid var(--ys-rule,rgba(15,23,42,.1));border-radius:14px;background:#fff;color:inherit;text-decoration:none}.ys-ap-related img{display:block;width:100%;height:150px;object-fit:cover}.ys-ap-related span{display:grid;gap:7px;padding:14px}.ys-ap-related strong{font-size:14px;line-height:1.35}.ys-ap-related small{color:var(--ys-inkSoft,#526072);font-weight:800}.ys-ap-note{position:sticky;top:96px;padding:22px;border:1px solid var(--ys-rule,rgba(15,23,42,.1));border-radius:18px;background:var(--ys-paper2,#f8fafc)}@media(max-width:820px){.ys-ap-hero,.ys-ap-layout{grid-template-columns:1fr}.ys-ap-hero{padding:26px}.ys-ap-note{position:static}.ys-ap-related{grid-template-columns:1fr}}@media(max-width:520px){.ys-audited-product{width:min(100% - 24px,1160px);padding-top:22px}.ys-ap-hero{padding:20px;border-radius:18px}.ys-ap-copy h1{font-size:34px}.ys-ap-buybox>img{height:200px}}
`
