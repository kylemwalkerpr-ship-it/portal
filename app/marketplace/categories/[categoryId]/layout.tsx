import Link from 'next/link'
import type { ReactNode } from 'react'
import { resolveCategoryOrSubcategory } from '@/lib/categories'
import { CategoryRecommendedGigsCarousel } from '@/components/marketplace/CategoryRecommendedGigsCarousel'
import styles from './category-discovery.module.css'

type CategoryLayoutProps = {
  children: ReactNode
  params: Promise<{ categoryId: string }>
}

export default async function CategoryDiscoveryLayout({ children, params }: CategoryLayoutProps) {
  const { categoryId } = await params
  const resolved = resolveCategoryOrSubcategory(categoryId)

  if (!resolved) return children

  const { category, subcategory } = resolved
  const display = subcategory ?? category

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

          <CategoryRecommendedGigsCarousel
            categoryId={display.id}
            fallbackCategoryId={subcategory ? category.id : undefined}
            displayName={display.name}
          />
        </div>
      </section>

      {children}
    </>
  )
}
