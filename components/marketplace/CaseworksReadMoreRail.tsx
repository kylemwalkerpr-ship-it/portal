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
      className="mt-12 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm"
    >
      <div className="border-b border-border/60 px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
              MyCaseworks editorial
            </p>
            <h2
              id="caseworks-rail-heading"
              className="mt-1.5 text-xl font-semibold leading-snug tracking-[-0.02em] text-foreground sm:text-2xl"
            >
              Useful reading for {mapping.cluster}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Open a focused guide for practical context, checklists, and next-step information related to this category.
            </p>
          </div>

          <a
            href={`${CASEWORKS_HOST}/`}
            className="inline-flex w-fit shrink-0 items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground shadow-sm transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 motion-reduce:transition-none"
            rel="noopener"
          >
            Browse all guides
            <span aria-hidden="true">→</span>
          </a>
        </div>
      </div>

      <ul className="grid gap-3 p-4 sm:grid-cols-2 sm:p-6">
        {mapping.items.map((item) => (
          <li key={item.path} className="min-w-0">
            <a
              href={`${CASEWORKS_HOST}${item.path}/?utm_source=marketplace&utm_medium=caseworks-rail&utm_content=${encodeURIComponent(categoryId)}`}
              className="group flex h-full min-h-[132px] flex-col justify-between rounded-xl border border-border/70 bg-background p-4 shadow-sm transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 motion-reduce:transform-none motion-reduce:transition-none sm:p-5"
              rel="noopener"
              aria-label={`Read ${item.title} on MyCaseworks`}
            >
              <div>
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                    MyCaseworks guide
                  </span>
                  <span
                    aria-hidden="true"
                    className="text-base leading-none text-muted-foreground transition-colors group-hover:text-primary motion-reduce:transition-none"
                  >
                    ↗
                  </span>
                </div>

                <h3 className="mt-4 text-[15px] font-semibold leading-6 tracking-[-0.01em] text-foreground sm:text-base">
                  {item.title}
                </h3>
              </div>

              <div className="mt-5 flex items-center justify-between gap-3 border-t border-border/60 pt-3">
                <span className="text-xs font-medium text-muted-foreground">Editorial resource</span>
                <span className="shrink-0 text-xs font-semibold text-primary">
                  Read guide →
                </span>
              </div>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
