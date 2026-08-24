/**
 * Shop Blog Generator — produces Next.js page.tsx articles for the Apex blog
 * from the Payhip product catalogue.
 *
 * Output matches the style of existing immigration blog posts on
 * yousafe-consultancy/landing-page/app/blog/:
 *  - SEO metadata (keywords, openGraph, twitter, canonical)
 *  - Article JSON-LD
 *  - Branded header
 *  - Hero section with category chip + date + read time
 *  - Structured content with cards, checklists, CTAs
 *  - Footer
 */

import type { ShopSeoProduct } from './shopSeo'
import { productBlogSlug, formatPrice } from './shopSeo'

const APEX_URL = 'https://yousafeconsultancy.com'
const APEX_TITLE = 'YouSafe Consultancy'

const CATEGORY_COLORS: Record<string, string> = {
  Spreadsheet: 'bg-emerald-100 text-emerald-800',
  Guide: 'bg-indigo-100 text-indigo-800',
  Template: 'bg-amber-100 text-amber-800',
  'Craft/Print': 'bg-pink-100 text-pink-800',
}

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$').replace(/"/g, '\\"')
}

function estimateReadTime(text: string): string {
  const words = text.split(/\s+/).length
  const minutes = Math.max(3, Math.ceil(words / 200))
  return `${minutes} min read`
}

function generateKeywords(product: ShopSeoProduct): string[] {
  const base = [product.productTitle.split('—')[0].trim(), 'digital product', 'downloadable template', 'YouSafe shop']
  return [...new Set([...base, ...product.tags.slice(0, 10)])]
}

function toPascalCase(slug: string): string {
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')
}

function plainText(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\\u2014/g, '—').replace(/\\u201c/g, '"').replace(/\\u201d/g, '"').trim()
}

function featureLines(product: ShopSeoProduct): string[] {
  const text = plainText(product.fullDescription)
  const skip = ['Built for', 'A ', 'Stop ', 'Delivered', 'Compatible', 'Instant', 'Works ', '10-page', '5-page', '7-page', '16-page']
  return text
    .split('\n')
    .map(l => l.trim().replace(/^[-•\u2013\u2014]+\s*/, '').trim())
    .filter(l => l && !skip.some(p => l.startsWith(p)))
    .slice(0, 6)
}

export function generateShopBlogPageTsx(product: ShopSeoProduct): string {
  const slug = productBlogSlug(product.slug)
  const today = new Date().toISOString().split('T')[0]
  const readTime = estimateReadTime(`${product.title}\n${product.shortDescription}\n${plainText(product.fullDescription)}`)
  const kw = generateKeywords(product)
  const catColor = CATEGORY_COLORS[product.category] || 'bg-blue-100 text-blue-800'
  const price = formatPrice(product.price)
  const payhipUrl = product.payhipUrl.replace('placeholder-', '')
  const dateFormatted = new Date(today).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const features = featureLines(product)

  // Build the page content in parts
  const parts: string[] = []
  parts.push(`import type { Metadata } from "next"`)
  parts.push(`import Image from "next/image"`)
  parts.push(`import Link from "next/link"`)
  parts.push(`import { ArrowLeft, Calendar, Clock, ShoppingBag, Download, CheckCircle2, FileText, Star } from "lucide-react"`)
  parts.push(``)
  parts.push(`export const metadata: Metadata = {`)
  parts.push(`  title: "${esc(product.title)} | YouSafe Consultancy Shop",`)
  parts.push(`  description: "${esc(product.shortDescription)}",`)
  parts.push(`  keywords: ${JSON.stringify(kw.slice(0, 25))},`)
  parts.push(`  openGraph: {`)
  parts.push(`    title: "${esc(product.title)}",`)
  parts.push(`    description: "${esc(product.shortDescription)}",`)
  parts.push(`    type: "article",`)
  parts.push(`    url: "${APEX_URL}/blog/${slug}",`)
  parts.push(`    siteName: "${APEX_TITLE}",`)
  parts.push(`    publishedTime: "${today}",`)
  parts.push(`    images: [{ url: "/images/shop-hero.jpg", width: 1200, height: 630, alt: "${esc(product.productTitle)}" }],`)
  parts.push(`  },`)
  parts.push(`  twitter: {`)
  parts.push(`    card: "summary_large_image",`)
  parts.push(`    title: "${esc(product.title)}",`)
  parts.push(`    description: "${esc(product.shortDescription)}",`)
  parts.push(`    images: ["/images/shop-hero.jpg"],`)
  parts.push(`  },`)
  parts.push(`  alternates: { canonical: "${APEX_URL}/blog/${slug}" },`)
  parts.push(`}`)
  parts.push(``)
  parts.push(`function ArticleJsonLd() {`)
  parts.push(`  const jsonLd = {`)
  parts.push(`    "@context": "https://schema.org",`)
  parts.push(`    "@type": "Article",`)
  parts.push(`    headline: "${esc(product.title)}",`)
  parts.push(`    description: "${esc(product.shortDescription)}",`)
  parts.push(`    image: "${APEX_URL}/images/shop-hero.jpg",`)
  parts.push(`    author: { "@type": "Organization", name: "${APEX_TITLE}", url: "${APEX_URL}" },`)
  parts.push(`    publisher: { "@type": "Organization", name: "${APEX_TITLE}", logo: { "@type": "ImageObject", url: "${APEX_URL}/logo.png" } },`)
  parts.push(`    datePublished: "${today}",`)
  parts.push(`    dateModified: "${today}",`)
  parts.push(`    mainEntityOfPage: { "@type": "WebPage", "@id": "${APEX_URL}/blog/${slug}" }`)
  parts.push(`  }`)
  parts.push(`  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />`)
  parts.push(`}`)
  parts.push(``)
  parts.push(`const features = [`)
  for (const f of features) {
    parts.push(`  "${esc(f)}",`)
  }
  parts.push(`]`)
  parts.push(``)
  parts.push(`export default function Shop${toPascalCase(product.slug)}Page() {`)
  parts.push(`  return (`)
  parts.push(`    <>`)
  parts.push(`      <ArticleJsonLd />`)
  parts.push(`      <div className="flex min-h-screen flex-col bg-background">`)
  parts.push(`        <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">`)
  parts.push(`          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">`)
  parts.push(`            <Link href="/" className="flex items-center gap-3">`)
  parts.push(`              <Image src="/logo.png" alt="${APEX_TITLE} Logo" width={48} height={48} className="h-12 w-12 object-contain" />`)
  parts.push(`              <span className="text-xl font-bold text-foreground">Yousafe <span className="text-primary">Consultancy</span></span>`)
  parts.push(`            </Link>`)
  parts.push(`            <nav className="hidden items-center gap-6 md:flex">`)
  parts.push(`              <Link href="/blog" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">Blog</Link>`)
  parts.push(`              <a href="#shop" className="text-sm font-medium text-primary transition-colors hover:text-primary/80">Shop</a>`)
  parts.push(`            </nav>`)
  parts.push(`          </div>`)
  parts.push(`        </header>`)
  parts.push(``)
  parts.push(`        <main className="flex-1">`)
  parts.push(`          <article className="mx-auto max-w-4xl px-4 py-8 md:py-12">`)
  parts.push(`            <Link href="/blog" className="mb-6 inline-flex items-center text-sm text-muted-foreground hover:text-primary transition-colors">`)
  parts.push(`              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Blog`)
  parts.push(`            </Link>`)
  parts.push(``)
  parts.push(`            <header className="mb-10">`)
  parts.push(`              <div className="mb-4 flex flex-wrap items-center gap-3">`)
  parts.push(`                <span className="inline-flex items-center rounded-full ${catColor} px-3 py-1 text-xs font-medium">${product.category}</span>`)
  parts.push(`                <span className="inline-flex items-center gap-1 text-sm text-muted-foreground"><Calendar className="h-4 w-4" /> ${dateFormatted}</span>`)
  parts.push(`                <span className="inline-flex items-center gap-1 text-sm text-muted-foreground"><Clock className="h-4 w-4" /> ${readTime}</span>`)
  parts.push(`              </div>`)
  parts.push(`              <h1 className="text-balance text-3xl font-bold tracking-tight text-foreground md:text-4xl leading-tight">`)
  parts.push(`                ${esc(product.title)}`)
  parts.push(`              </h1>`)
  parts.push(`              <p className="mt-6 text-lg text-muted-foreground leading-relaxed">`)
  parts.push(`                ${esc(product.shortDescription)}`)
  parts.push(`              </p>`)
  parts.push(`            </header>`)
  parts.push(``)
  parts.push(`            <div className="relative mb-10 aspect-[16/9] overflow-hidden rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20">`)
  parts.push(`              <div className="flex h-full items-center justify-center">`)
  parts.push(`                <ShoppingBag className="h-20 w-20 text-primary opacity-40" />`)
  parts.push(`              </div>`)
  parts.push(`            </div>`)
  parts.push(``)
  parts.push(`            <section className="mb-10 grid gap-6 md:grid-cols-3">`)
  parts.push(`              <div className="rounded-xl border border-border/60 bg-card p-6 text-center">`)
  parts.push(`                <FileText className="mx-auto h-8 w-8 text-primary mb-2" />`)
  parts.push(`                <p className="text-2xl font-bold text-foreground">${product.format}</p>`)
  parts.push(`                <p className="text-sm text-muted-foreground">Format</p>`)
  parts.push(`              </div>`)
  parts.push(`              <div className="rounded-xl border border-border/60 bg-card p-6 text-center">`)
  parts.push(`                <Download className="mx-auto h-8 w-8 text-primary mb-2" />`)
  parts.push(`                <p className="text-2xl font-bold text-foreground">Instant</p>`)
  parts.push(`                <p className="text-sm text-muted-foreground">Download</p>`)
  parts.push(`              </div>`)
  parts.push(`              <div className="rounded-xl border border-border/60 bg-card p-6 text-center">`)
  parts.push(`                <Star className="mx-auto h-8 w-8 text-primary mb-2" />`)
  parts.push(`                <p className="text-2xl font-bold text-foreground">${price}</p>`)
  parts.push(`                <p className="text-sm text-muted-foreground">One-time purchase</p>`)
  parts.push(`              </div>`)
  parts.push(`            </section>`)
  parts.push(``)
  parts.push(`            <div className="prose prose-lg max-w-none">`)
  parts.push(`              <section className="mb-10">`)
  parts.push(`                <h2 className="flex items-center gap-3 text-2xl font-bold text-foreground mb-6">`)
  parts.push(`                  <CheckCircle2 className="h-6 w-6 text-primary" />`)
  parts.push(`                  What's Inside`)
  parts.push(`                </h2>`)
  parts.push(`                <div className="grid gap-3">`)
  parts.push(`                  {features.map((item, index) => (`)
  parts.push(`                    <div key={index} className="flex items-start gap-3 rounded-lg border border-border/40 bg-card p-4">`)
  parts.push(`                      <CheckCircle2 className="h-5 w-5 shrink-0 text-primary mt-0.5" />`)
  parts.push(`                      <span className="text-foreground">{item}</span>`)
  parts.push(`                    </div>`)
  parts.push(`                  ))}`)
  parts.push(`                </div>`)
  parts.push(`              </section>`)
  parts.push(``)
  parts.push(`              <section className="mb-10">`)
  parts.push(`                <h2 className="flex items-center gap-3 text-2xl font-bold text-foreground mb-6">Full Details</h2>`)
  parts.push(`                <div className="rounded-xl border border-border/60 bg-card p-6">`)
  parts.push(`                  <div className="space-y-4 text-muted-foreground leading-relaxed">`)
  for (const line of product.fullDescription.split('\n')) {
    const t = line.trim()
    if (t) parts.push(`                    <p>${esc(t)}</p>`)
    else parts.push(`                    <br />`)
  }
  parts.push(`                  </div>`)
  parts.push(`                </div>`)
  parts.push(`              </section>`)
  parts.push(``)
  parts.push(`              <section className="mb-10 rounded-2xl bg-gradient-to-r from-primary/10 to-accent/10 p-8 text-center md:p-12">`)
  parts.push(`                <h2 className="text-2xl font-bold text-foreground md:text-3xl">Get This ${product.category} Now</h2>`)
  parts.push(`                <p className="mx-auto mt-3 max-w-xl text-muted-foreground">`)
  parts.push(`                  Instant download. ${price}. One-time purchase — no subscription.`)
  parts.push(`                </p>`)
  parts.push(`                <a href="${payhipUrl}"`)
  parts.push(`                  className="mt-6 inline-flex items-center justify-center rounded-lg bg-primary px-8 py-3 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90"`)
  parts.push(`                  target="_blank" rel="noopener noreferrer">`)
  parts.push(`                  <ShoppingBag className="mr-2 h-5 w-5" /> Buy on Payhip — ${price}`)
  parts.push(`                </a>`)
  parts.push(`              </section>`)
  parts.push(``)
  parts.push(`              <section className="mt-12 pt-8 border-t border-border">`)
  parts.push(`                <h3 className="text-lg font-semibold text-foreground mb-4">Browse more</h3>`)
  parts.push(`                <div className="flex flex-wrap gap-3">`)
  parts.push(`                  <a href="${APEX_URL}/blog" className="text-sm text-primary hover:underline">← Back to Blog</a>`)
  parts.push(`                </div>`)
  parts.push(`              </section>`)
  parts.push(`            </div>`)
  parts.push(`          </article>`)
  parts.push(`        </main>`)
  parts.push(``)
  parts.push(`        <footer className="border-t border-border/40 bg-card">`)
  parts.push(`          <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-6 py-8 md:flex-row md:justify-between">`)
  parts.push(`            <p className="text-sm text-muted-foreground">&copy; 2026 ${APEX_TITLE}. All rights reserved.</p>`)
  parts.push(`            <nav className="flex flex-wrap items-center justify-center gap-6">`)
  parts.push(`              <Link href="/" className="text-sm text-muted-foreground transition-colors hover:text-primary">Home</Link>`)
  parts.push(`              <Link href="/blog" className="text-sm text-muted-foreground transition-colors hover:text-primary">Blog</Link>`)
  parts.push(`              <a href="#shop" className="text-sm text-muted-foreground transition-colors hover:text-primary">Shop</a>`)
  parts.push(`            </nav>`)
  parts.push(`          </div>`)
  parts.push(`        </footer>`)
  parts.push(`      </div>`)
  parts.push(`    </>`)
  parts.push(`  )`)
  parts.push(`}`)
  parts.push(``)

  return parts.join('\n')
}