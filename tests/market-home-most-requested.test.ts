import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  BOOSTED_GIG_SLUGS,
  MARKET_HOME_CATEGORY_TILES,
  MOST_REQUESTED_ENTRIES,
  gigDeliveryRange,
  orderWithBoostedFirst,
  packPriceUsd,
  resolveMostRequestedCards,
} from '@/lib/marketHomeMostRequested'

const gig = (slug: string, tiers: Array<[number, number]>, providerName = 'Kyle G Walker', provider_type = 'attorney') => ({
  slug,
  providerName,
  provider_type,
  tiers: tiers.map(([price, delivery_days]) => ({ price, delivery_days })),
})

describe('Market home "Most requested" rail', () => {
  it('curates 6–8 cards and every gig card is also boosted', () => {
    expect(MOST_REQUESTED_ENTRIES.length).toBeGreaterThanOrEqual(6)
    expect(MOST_REQUESTED_ENTRIES.length).toBeLessThanOrEqual(8)
    for (const entry of MOST_REQUESTED_ENTRIES.filter((e) => e.kind === 'gig')) {
      expect(BOOSTED_GIG_SLUGS).toContain(entry.slug)
    }
  })

  it('takes gig price and delivery from live tiers, with a rush label for a faster tier', () => {
    const cards = resolveMostRequestedCards([
      gig('review-i765-opt-application-before-filing', [[24900, 7], [34900, 2]]),
      gig('provide-immigration-expert-lawyer-services', [[39500, 7]]),
    ])
    const i765 = cards.find((c) => c.key === 'gig:review-i765-opt-application-before-filing')!
    expect(i765).toMatchObject({
      href: '/gigs/review-i765-opt-application-before-filing',
      priceLabel: 'From $249',
      deliveryLabel: '7-day delivery',
      rushLabel: '2-day rush $349',
      kicker: 'Attorney · Kyle G Walker',
    })
    const f1 = cards.find((c) => c.key === 'gig:provide-immigration-expert-lawyer-services')!
    expect(f1).toMatchObject({ priceLabel: 'From $395', deliveryLabel: '7-day delivery', rushLabel: null })
  })

  it('drops a gig card whose gig is not in the active inventory (no 404 links)', () => {
    const cards = resolveMostRequestedCards([])
    expect(cards.every((c) => c.kind === 'pack')).toBe(true)
  })

  it('prices packs from the audited Payhip manifests and links the on-site shop page', () => {
    expect(packPriceUsd('us-stem-opt-i765-i983-companion-pack')).toBe(18.99)
    expect(packPriceUsd('us-f1-student-visa-ds160-i20-pack')).toBe(16.99)
    expect(packPriceUsd('us-opt-i765-application-prep-pack')).toBe(15.99)
    expect(packPriceUsd('canada-proof-of-funds-sponsor-pack')).toBe(14.99)
    const packs = resolveMostRequestedCards([]).filter((c) => c.kind === 'pack')
    expect(packs).toHaveLength(4)
    expect(packs.map((p) => p.priceLabel)).toEqual(['$18.99', '$16.99', '$15.99', '$14.99'])
    for (const p of packs) {
      expect(p.href).toMatch(/^\/shop\/[a-z0-9-]+$/)
      expect(p.deliveryLabel).toBe('Instant download')
    }
  })

  it('never claims ratings, reviews or order counts in card copy', () => {
    for (const e of MOST_REQUESTED_ENTRIES) {
      expect(`${e.title} ${e.outcome}`).not.toMatch(/\b(ratings?|rated|\d+\s*reviews?|stars?|\d+\s*orders?|clients served|5\.0|4\.\d)\b|★/i)
    }
  })

  it('computes the turnaround range only from the rail gigs', () => {
    expect(
      gigDeliveryRange([
        gig('review-i765-opt-application-before-filing', [[24900, 7], [34900, 2]]),
        gig('some-other-gig', [[1000, 30]]),
      ]),
    ).toEqual({ min: 2, max: 7 })
    expect(gigDeliveryRange([])).toBeNull()
  })
})

describe('Market home category tiles', () => {
  it('links only to filtered /gigs views or the shop catalog', () => {
    expect(MARKET_HOME_CATEGORY_TILES.map((t) => t.label)).toEqual([
      'Student visas',
      'Work permits & OPT',
      'Admissions & academic editing',
      'Self-serve packs',
    ])
    for (const t of MARKET_HOME_CATEGORY_TILES) {
      expect(t.href).toMatch(/^(\/gigs\?q=[A-Za-z0-9%-]+|\/shop#catalog)$/)
    }
  })
})

describe('/gigs hub boost order', () => {
  it('pins boosted slugs first in curated order and keeps the rest stable', () => {
    const rows = [
      { slug: 'a' },
      { slug: 'edit-thesis-admissions-essay-us-university-applications' },
      { slug: 'b' },
      { slug: 'review-i765-opt-application-before-filing' },
      { slug: null },
    ]
    expect(orderWithBoostedFirst(rows).map((r) => r.slug)).toEqual([
      'review-i765-opt-application-before-filing',
      'edit-thesis-admissions-essay-us-university-applications',
      'a',
      'b',
      null,
    ])
  })
})

describe('React #418 guard: MarketplaceShell inline CSS', () => {
  it('keeps literal style/script tag names out of the <style> text', () => {
    const src = readFileSync(join(process.cwd(), 'components/marketplace/MarketplaceShell.tsx'), 'utf8')
    const blocks = [...src.matchAll(/<style>\{`([\s\S]*?)`\}<\/style>/g)].map((m) => m[1])
    expect(blocks.length).toBeGreaterThan(0)
    for (const css of blocks) expect(css).not.toMatch(/<\/?(style|script)/i)
  })
})
