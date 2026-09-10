import type { Metadata } from 'next'
import Link from 'next/link'
import { CATEGORIES } from '@/lib/categories'
import { IMMIGRATION_SHOP_PRODUCTS } from '@/lib/immigration-shop-products'
import styles from './sitemap-page.module.css'

const MARKET = 'https://market.yousafeconsultancy.com'

export const metadata: Metadata = {
  title: 'Marketplace Sitemap | YouSafe',
  description: 'Browse the public YouSafe Marketplace, categories, providers, shop and preparation packs from one clean directory.',
  alternates: { canonical: `${MARKET}/sitemap/` },
  robots: { index: true, follow: true },
}

const primary = [
  { href: '/', label: 'Marketplace home', copy: 'Discover fixed-price professional services and current recommendations.' },
  { href: '/categories', label: 'All categories', copy: 'Browse the Marketplace service taxonomy by need.' },
  { href: '/providers', label: 'Providers', copy: 'Compare public attorney and consultant profiles.' },
  { href: '/shop', label: 'File shop', copy: 'Browse instant-download tools and preparation packs.' },
]

export default function MarketplaceSitemapPage() {
  const packs = IMMIGRATION_SHOP_PRODUCTS.filter((product) => product.payhip_published)

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>YouSafe Marketplace</p>
        <h1>Marketplace sitemap</h1>
        <p>Clean public routes for services, providers, categories and the file shop.</p>
        <a className={styles.xml} href="/sitemap.xml">View technical XML sitemap</a>
      </header>

      <section className={styles.section} aria-labelledby="marketplace-links">
        <h2 id="marketplace-links">Explore Marketplace</h2>
        <div className={styles.primaryGrid}>
          {primary.map((item) => (
            <Link key={item.href} href={item.href} className={styles.primaryCard}>
              <strong>{item.label}</strong>
              <span>{item.copy}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="category-links">
        <h2 id="category-links">Service categories</h2>
        <div className={styles.categoryGrid}>
          {CATEGORIES.map((category) => (
            <article key={category.id} className={styles.categoryCard}>
              <Link href={`/categories/${category.id}`} className={styles.categoryTitle}>{category.name}</Link>
              <div className={styles.subcategories}>
                {category.subcategories.map((subcategory) => (
                  <Link key={subcategory.id} href={`/categories/${subcategory.id}`}>{subcategory.name}</Link>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="shop-links">
        <div className={styles.sectionHeading}>
          <div>
            <h2 id="shop-links">Immigration preparation packs</h2>
            <p>Canonical shop pages with Payhip checkout.</p>
          </div>
          <Link href="/shop">Browse all shop files</Link>
        </div>
        <div className={styles.packGrid}>
          {packs.map((product) => (
            <Link key={product.slug} href={`/shop/${product.slug}`}>{product.name}</Link>
          ))}
        </div>
      </section>
    </main>
  )
}
