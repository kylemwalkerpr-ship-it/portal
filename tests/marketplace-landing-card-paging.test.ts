/**
 * MARKET-ROOT-TRANSFER-LATENCY — on-demand landing card paging.
 *
 * The market root used to serialize every active gig into the document. The
 * first page now comes from the build snapshot and later windows are fetched
 * from /api/marketplace/gigs?view=card. These tests lock the request contract,
 * the tolerant record mapping, and the de-duplication that keeps "Load more"
 * from re-showing a brief whose rank moved between the build and the click.
 */

import {
  LANDING_CARDS_SORT,
  LANDING_CARDS_VIEW,
  landingCardsPath,
  listingRecordToLandingCard,
  mergeNewLandingCards,
  parseLandingCardsPage,
} from '@/lib/marketplaceLandingPaging'
import { FEATURED_PAGE_SIZE, type LandingCardGig } from '@/lib/marketplaceDisplay'

describe('landing card request contract', () => {
  it('asks the listing API for the narrow card view, ranked like the snapshot', () => {
    const path = landingCardsPath('all', 2)
    const url = new URL(path, 'https://market.example')
    expect(url.pathname).toBe('/api/marketplace/gigs')
    expect(url.searchParams.get('view')).toBe(LANDING_CARDS_VIEW)
    expect(url.searchParams.get('sort')).toBe(LANDING_CARDS_SORT)
    expect(url.searchParams.get('limit')).toBe(String(FEATURED_PAGE_SIZE))
    expect(url.searchParams.get('page')).toBe('2')
    // 'all' means unfiltered: the listing already buckets unresolvable
    // jurisdictions into every country tab, so no country param is sent.
    expect(url.searchParams.has('country')).toBe(false)
  })

  it('passes the jurisdiction through for country slices and clamps bad pages', () => {
    expect(new URL(landingCardsPath('uk', 3), 'https://x').searchParams.get('country')).toBe('uk')
    expect(new URL(landingCardsPath('all', 0), 'https://x').searchParams.get('page')).toBe('1')
    expect(new URL(landingCardsPath('all', Number.NaN), 'https://x').searchParams.get('page')).toBe('1')
  })
})

describe('listing record -> landing card mapping', () => {
  it('maps the view=card projection', () => {
    const card = listingRecordToLandingCard({
      id: 'gig-1',
      slug: 'i-485-evidence-package',
      title: 'I-485 evidence package',
      category: 'green_card',
      provider_type: 'attorney',
      avg_rating: 4.9,
      review_count: 12,
      starting_price: 49000,
      delivery_days: 5,
      provider_name: 'Jane Doe, Esq.',
      provider_country: 'US',
      provider_headshot_url: 'https://cdn.example/head.jpg',
      jx: 'us',
      cover_image_url: 'https://cdn.example/cover.jpg',
    })
    expect(card).toEqual({
      id: 'gig-1',
      slug: 'i-485-evidence-package',
      title: 'I-485 evidence package',
      category: 'green_card',
      provider_type: 'attorney',
      avg_rating: 4.9,
      review_count: 12,
      starting_price: 49000,
      delivery_days: 5,
      providerName: 'Jane Doe, Esq.',
      providerHeadshot: 'https://cdn.example/head.jpg',
      jx: 'us',
      cover_image_url: 'https://cdn.example/cover.jpg',
    })
  })

  it('still maps a legacy full-row listing record', () => {
    const card = listingRecordToLandingCard({
      id: 'gig-2',
      slug: 'section-21-defence',
      title: 'Section 21 defence letter',
      category: 'tenancy',
      provider_type: 'consultant',
      jurisdiction: 'UK',
      avg_rating: '4.5',
      review_count: '3',
      // Legacy rows carry the raw gallery + tiers and no provider_name.
      gallery_images: ['https://cdn.example/legacy-cover.jpg'],
      tiers: [
        { price: 15000, delivery_days: 7, is_active: true },
        { price: 9000, delivery_days: 3, is_active: true },
        { price: 500, delivery_days: 1, is_active: false },
      ],
      provider: { full_name: 'Ada Lovelace', country: 'GB' },
    })
    expect(card).toMatchObject({
      id: 'gig-2',
      providerName: 'Ada Lovelace',
      jx: 'uk',
      starting_price: 9000,
      delivery_days: 3,
      cover_image_url: 'https://cdn.example/legacy-cover.jpg',
      avg_rating: 4.5,
      review_count: 3,
    })
  })

  it('falls back to the provider country for gigs without a usable jurisdiction', () => {
    const card = listingRecordToLandingCard({
      id: 'gig-3',
      title: 'Study permit pack',
      jurisdiction: '',
      provider_country: 'Canada',
      provider: { full_name: '' },
    })
    expect(card?.jx).toBe('ca')
    // Blank provider names fall through providerDisplayName's chain, never to an
    // empty string rendered next to "Regulated consultant".
    expect(card?.providerName).toBe('YouSafe provider')
  })

  it('drops records without an id instead of rendering an unusable card', () => {
    expect(listingRecordToLandingCard(null)).toBeNull()
    expect(listingRecordToLandingCard({ title: 'no id' })).toBeNull()
    expect(listingRecordToLandingCard({ id: '' })).toBeNull()
  })
})

describe('listing response parsing', () => {
  const gig = { id: 'g1', title: 'Brief', provider: { full_name: 'A B' } }

  it('reads the ok() envelope and the bare payload', () => {
    expect(parseLandingCardsPage({ ok: true, data: { gigs: [gig], total: 217, hasMore: true } })).toMatchObject({
      total: 217,
      hasMore: true,
    })
    expect(parseLandingCardsPage({ gigs: [gig], total: 5, hasMore: false }).cards).toHaveLength(1)
  })

  it('never invents totals or hasMore', () => {
    const parsed = parseLandingCardsPage({ data: { gigs: [] } })
    expect(parsed).toEqual({ cards: [], total: 0, hasMore: false })
    // hasMore must be a literal true — a missing/odd value ends paging rather
    // than making the grid request forever.
    expect(parseLandingCardsPage({ gigs: [gig], total: 9, hasMore: 'yes' }).hasMore).toBe(false)
    expect(parseLandingCardsPage(null)).toEqual({ cards: [], total: 0, hasMore: false })
    expect(parseLandingCardsPage({ data: { gigs: [gig, null, { title: 'x' }] } }).cards).toHaveLength(1)
  })
})

describe('appended windows are de-duplicated', () => {
  const card = (id: string) => ({ id, title: id, slug: null, category: null, provider_type: null, avg_rating: 0, review_count: 0, starting_price: null, delivery_days: null, providerName: id, providerHeadshot: null, jx: null, cover_image_url: null }) as LandingCardGig

  it('keeps only unseen cards, in listing order', () => {
    const existing = [card('a'), card('b')]
    const merged = mergeNewLandingCards(existing, [card('b'), card('c'), card('a'), card('d')])
    expect(merged.map((c) => c.id)).toEqual(['c', 'd'])
  })

  it('ignores malformed rows', () => {
    expect(mergeNewLandingCards([], [null as unknown as LandingCardGig, { id: '' } as LandingCardGig])).toEqual([])
  })
})
