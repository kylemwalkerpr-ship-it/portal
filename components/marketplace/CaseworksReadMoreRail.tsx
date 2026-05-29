// "Read more from MyCaseworks" rail rendered on marketplace category pages.
// Closes the funnel loop: caseworks articles point readers to /marketplace
// (via MarketplaceClusterCTA in caseworks), and this rail points marketplace
// browsers back to the relevant caseworks editorial cluster, keeping the
// session inside the estate and feeding the §4 KPI on cross-property flow.

import { getCaseworksMapping, CASEWORKS_HOST } from '@/lib/caseworksClusterMap'

interface Props {
  categoryId: string
}

export function CaseworksReadMoreRail({ categoryId }: Props) {
  const mapping = getCaseworksMapping(categoryId)
  if (!mapping) return null

  return (
    <section
      aria-labelledby="caseworks-rail-heading"
      className="mt-12 rounded-lg border border-border bg-card p-6"
    >
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            Editorial
          </p>
          <h2
            id="caseworks-rail-heading"
            className="mt-1 font-serif text-xl font-semibold leading-snug text-foreground"
          >
            Read more from MyCaseworks · {mapping.cluster}
          </h2>
        </div>
        <a
          href={`${CASEWORKS_HOST}/`}
          className="hidden font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground motion-reduce:transition-none sm:inline-block"
          rel="noopener"
        >
          Browse the library →
        </a>
      </div>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {mapping.items.map(item => (
          <li key={item.path}>
            <a
              href={`${CASEWORKS_HOST}${item.path}/?utm_source=marketplace&utm_medium=caseworks-rail&utm_content=${encodeURIComponent(categoryId)}`}
              className="block rounded-md border border-border bg-background p-4 transition-colors hover:border-foreground/40 motion-reduce:transition-none"
              rel="noopener"
            >
              <p className="font-serif text-[15px] font-medium leading-snug text-foreground">
                {item.title}
              </p>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                legal.yousafeconsultancy.com{item.path}
              </p>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
