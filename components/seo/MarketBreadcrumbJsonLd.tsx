import { buildMarketBreadcrumb, type MarketCrumb } from '@/lib/marketBreadcrumb'

export type { MarketCrumb }

export default function MarketBreadcrumbJsonLd({ items }: { items: MarketCrumb[] }) {
  const json = JSON.stringify(buildMarketBreadcrumb(items)).replace(/</g, '\\u003c')
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
}
