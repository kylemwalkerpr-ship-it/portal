import Link from 'next/link'
import type { ReactNode } from 'react'
import { resolveCategoryOrSubcategory } from '@/lib/categories'
import styles from './category-discovery.module.css'

type CategoryLayoutProps = {
  children: ReactNode
  params: Promise<{ categoryId: string }>
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.arrowIcon}>
      <path d="M5 12h13M13 7l5 5-5 5" />
    </svg>
  )
}

function ServiceIcon({ index }: { index: number }) {
  const variant = index % 4

  if (variant === 1) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.serviceIcon}>
        <path d="M4 5h16v14H4z" />
        <path d="M8 9h8M8 13h5" />
      </svg>
    )
  }

  if (variant === 2) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.serviceIcon}>
        <circle cx="12" cy="12" r="8" />
        <path d="M4 12h16M12 4c2.3 2.2 3.5 4.8 3.5 8S14.3 17.8 12 20M12 4C9.7 6.2 8.5 8.8 8.5 12S9.7 17.8 12 20" />
      </svg>
    )
  }

  if (variant === 3) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.serviceIcon}>
        <path d="M7 3h10v4H7zM5 7h14v14H5z" />
        <path d="m8 14 2.5 2.5L16 11" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.serviceIcon}>
      <path d="M4 6.5h16v11H4z" />
      <path d="M8 6.5V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1.5M4 11h16M10 11v2h4v-2" />
    </svg>
  )
}

export default async function CategoryDiscoveryLayout({ children, params }: CategoryLayoutProps) {
  const { categoryId } = await params
  const resolved = resolveCategoryOrSubcategory(categoryId)

  if (!resolved) return children

  const { category, subcategory } = resolved
  const display = subcategory ?? category
  const related = [...category.subcategories]
    .filter((item) => item.id !== subcategory?.id)
    .sort((a, b) => Number(b.popular) - Number(a.popular) || a.order - b.order)
    .slice(0, 6)

  return (
    <>
      <section className={styles.categoryExperience} aria-labelledby="ys-category-experience-title">
        <div className={styles.shell}>
          <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
            <Link href="/">Marketplace</Link>
            <span aria-hidden="true">/</span>
            <Link href="/categories">Categories</Link>
            {subcategory ? (
              <>
                <span aria-hidden="true">/</span>
                <Link href={`/categories/${category.id}`}>{category.name}</Link>
              </>
            ) : null}
            <span aria-hidden="true">/</span>
            <span aria-current="page">{display.name}</span>
          </nav>

          <div className={styles.hero}>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}>YouSafe Marketplace</p>
              <h1 id="ys-category-experience-title">{display.name}</h1>
              <p className={styles.description}>{display.description || category.description}</p>
            </div>

            <div className={styles.heroAssurance} aria-label="Marketplace assurances">
              <span>Vetted specialists</span>
              <span>Clear fixed-price scopes</span>
              <span>Secure order workflow</span>
            </div>
          </div>

          {related.length > 0 ? (
            <div className={styles.exploreBlock}>
              <div className={styles.sectionHeading}>
                <h2>{subcategory ? `Related ${category.name}` : `Explore ${category.name}`}</h2>
                <Link href="/categories">View all categories</Link>
              </div>

              <div className={styles.cardRail}>
                {related.map((item, index) => (
                  <Link key={item.id} href={`/categories/${item.id}`} className={styles.serviceCard}>
                    <span className={styles.iconTile}><ServiceIcon index={index} /></span>
                    <span className={styles.cardLabel}>{item.name}</span>
                    <ArrowIcon />
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {children}
    </>
  )
}
