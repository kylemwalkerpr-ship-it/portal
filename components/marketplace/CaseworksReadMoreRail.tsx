// "Read more from MyCaseworks" rail rendered on marketplace category pages.
// Closes the funnel loop: caseworks articles point readers to /marketplace
// (via MarketplaceClusterCTA in caseworks), and this rail points marketplace
// browsers back to the relevant caseworks editorial cluster, keeping the
// session inside the estate and feeding the §4 KPI on cross-property flow.

import { getCaseworksMapping, CASEWORKS_HOST } from '@/lib/caseworksClusterMap'
import styles from './CaseworksReadMoreRail.module.css'

interface Props {
  categoryId: string
}

function ArrowIcon() {
  return (
    <svg
      aria-hidden="true"
      className={styles.arrow}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M4.5 10H15.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M11.5 6L15.5 10L11.5 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function CaseworksReadMoreRail({ categoryId }: Props) {
  const mapping = getCaseworksMapping(categoryId)
  if (!mapping) return null

  return (
    <section aria-labelledby="caseworks-rail-heading" className={styles.rail}>
      <header className={styles.header}>
        <div className={styles.headingGroup}>
          <div className={styles.eyebrow}>
            <span className={styles.eyebrowDot} aria-hidden="true" />
            MyCaseworks editorial
          </div>

          <h2 id="caseworks-rail-heading" className={styles.title}>
            {mapping.cluster} guides
          </h2>
          <p className={styles.description}>
            Practical explainers, checklists and next-step guidance from the MyCaseworks library.
          </p>
        </div>

        <a
          href={`${CASEWORKS_HOST}/`}
          className={styles.browse}
          rel="noopener"
          aria-label="Browse all MyCaseworks guides"
        >
          Browse all guides
          <ArrowIcon />
        </a>
      </header>

      <ul className={styles.grid} role="list">
        {mapping.items.map((item, index) => (
          <li key={item.path} className={styles.item}>
            <a
              href={`${CASEWORKS_HOST}${item.path}/?utm_source=marketplace&utm_medium=caseworks-rail&utm_content=${encodeURIComponent(categoryId)}`}
              className={styles.card}
              rel="noopener"
              aria-label={`Read ${item.title} on MyCaseworks`}
            >
              <div className={styles.cardHeader}>
                <span className={styles.cardNumber} aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className={styles.cardType}>MyCaseworks guide</span>
              </div>

              <h3 className={styles.cardTitle}>{item.title}</h3>

              <div className={styles.cardFooter}>
                <span className={styles.readLabel}>Read guide</span>
                <ArrowIcon />
              </div>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
