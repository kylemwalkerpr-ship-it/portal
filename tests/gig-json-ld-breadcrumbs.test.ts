/// <reference types="jest" />

import { buildGigJsonLd } from '@/lib/gigJsonLd'

describe('marketplace gig breadcrumb JSON-LD', () => {
  it('uses Marketplace > Category > Subcategory > Service without changing the gig URL', () => {
    const canonicalUrl = 'https://market.yousafeconsultancy.com/gigs/canada-study-permit-review'
    const graph = buildGigJsonLd({
      gig: {
        id: 'gig-1',
        slug: 'canada-study-permit-review',
        title: 'Canada Study Permit Review',
        description: 'Review a study permit document pack.',
        category: 'immigration',
        subcategory: 'study-permits',
        provider_type: 'attorney',
      },
      tiers: [],
      provider: { id: 'provider-1', full_name: 'Example Provider', username: 'example-provider' },
      canonicalUrl,
      marketplaceBaseUrl: 'https://market.yousafeconsultancy.com',
      categoryLabel: 'Immigration Services',
      subcategoryLabel: 'Study Permits',
    }) as any

    const breadcrumb = graph['@graph'].find((node: any) => node['@type'] === 'BreadcrumbList')
    expect(breadcrumb.itemListElement).toEqual([
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Marketplace',
        item: 'https://market.yousafeconsultancy.com/',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Immigration Services',
        item: 'https://market.yousafeconsultancy.com/categories/immigration',
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: 'Study Permits',
        item: 'https://market.yousafeconsultancy.com/categories/study-permits',
      },
      {
        '@type': 'ListItem',
        position: 4,
        name: 'Canada Study Permit Review',
        item: canonicalUrl,
      },
    ])
  })
})
