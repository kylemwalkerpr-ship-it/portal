/**
 * MARKET-ROOT-TRANSFER-LATENCY — document payload budget + first-page contract.
 *
 * Production baseline after #263: market `/` was a static cache HIT and still
 * shipped a 524,455 byte document (identity), because the RSC client props
 * carried the whole active inventory (~217 brief records) and the landing
 * stylesheet was inline (serialized into BOTH the document and the flight
 * payload). This suite locks the data-shape contract that removes it, and runs
 * the shipped artifact gate (scripts/verify-market-landing-payload.mjs) against
 * a synthetic built document so the gate's pass/fail behavior is regression
 * tested rather than assumed.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  FEATURED_PAGE_SIZE,
  toLandingCards,
  type LandingGig,
} from '@/lib/marketplaceDisplay'
import { rankedGigComparator } from '@/lib/marketplaceGigSort'

const repoRoot = process.cwd()
const landingSource = require('node:fs').readFileSync(
  join(repoRoot, 'app/marketplace/PublicMarketplaceLanding.tsx'),
  'utf8',
) as string
const gridSource = require('node:fs').readFileSync(
  join(repoRoot, 'components/marketplace/FeaturedBriefsGrid.tsx'),
  'utf8',
) as string
const gateScript = join(repoRoot, 'scripts/verify-market-landing-payload.mjs')

/** Deterministic 217-gig slice shaped like the live inventory (rank ties included). */
function fixtureSlice(count = 217): LandingGig[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    slug: `brief-${i}-immigration-consultation-package`,
    title: `Immigration brief ${i} — evidence review and filing strategy package`,
    category: i % 3 === 0 ? 'green_card' : i % 3 === 1 ? 'study_visa' : 'tenancy',
    provider_type: i % 2 === 0 ? 'attorney' : 'consultant',
    avg_rating: 4.5,
    review_count: i % 7,
    rank_score: i < 16 ? 0.42 : 0,
    order_count: i % 5,
    starting_price: 25000 + i * 100,
    delivery_days: (i % 7) + 1,
    providerName: `Provider Number ${i}`,
    providerCountry: 'US',
    providerHeadshot: `https://cdn.yousafeconsultancy.com/storage/v1/object/public/headshots/provider-${i}.jpg`,
    jx: 'us',
    tiers: [
      { price: 25000 + i * 100, delivery_days: (i % 7) + 1 },
      { price: 50000 + i * 100, delivery_days: 10 },
    ],
    cover_image_url: `https://cdn.yousafeconsultancy.com/storage/v1/object/public/covers/brief-${i}-cover-image.jpg`,
  }))
}

describe('landing snapshot projection', () => {
  const slice = fixtureSlice()

  it('ships the first ranked page, not the whole slice', () => {
    const ranked = [...slice].sort(rankedGigComparator)
    const cards = toLandingCards(ranked.slice(0, FEATURED_PAGE_SIZE))
    expect(cards).toHaveLength(FEATURED_PAGE_SIZE)

    const fullBytes = Buffer.byteLength(JSON.stringify(ranked))
    const pageBytes = Buffer.byteLength(JSON.stringify(cards))
    // Measured on the live document: the serialized array was 195,086 bytes for
    // 217 briefs; the projected first page must be a fraction of it.
    expect(pageBytes / fullBytes).toBeLessThan(0.35)
  })

  it('drops the fields only the server needs (tiers, rank_score, order_count)', () => {
    const [card] = toLandingCards(slice.slice(0, 1))
    expect(card).not.toHaveProperty('tiers')
    expect(card).not.toHaveProperty('rank_score')
    expect(card).not.toHaveProperty('order_count')
    expect(card).not.toHaveProperty('providerCountry')
    // …while every field the card renders survives.
    expect(Object.keys(card).sort()).toEqual(
      [
        'avg_rating',
        'category',
        'cover_image_url',
        'delivery_days',
        'id',
        'jx',
        'providerHeadshot',
        'providerName',
        'provider_type',
        'review_count',
        'slug',
        'starting_price',
        'title',
      ].sort(),
    )
  })

  it('ranks with the same total order the listing API paginates with', () => {
    const tied = [
      { ...slice[0], id: 'b', rank_score: 0, order_count: 1 },
      { ...slice[1], id: 'a', rank_score: 0, order_count: 1 },
      { ...slice[2], id: 'c', rank_score: 0, order_count: 5 },
    ]
    expect([...tied].sort(rankedGigComparator).map((g) => g.id)).toEqual(['c', 'a', 'b'])
  })
})

describe('landing source contract', () => {
  it('passes the first page plus real counts to the client grid', () => {
    expect(landingSource).toContain('const featured = toLandingCards(ranked.slice(0, FEATURED_PAGE_SIZE))')
    expect(landingSource).toContain('totalFeatured: ranked.length')
    expect(landingSource).toContain('categoryCounts: Object.fromEntries(catCount.entries())')
    expect(landingSource).toContain('cards={firstPageCards}')
    expect(landingSource).toContain('total={totalRanked}')
    expect(landingSource).toContain('categoryCounts={categoryCounts}')
    expect(landingSource).not.toMatch(/gigs=\{fullList\}/)
  })

  it('keeps the stylesheet out of the RSC payload', () => {
    expect(landingSource).toContain("import './marketplace-landing.css'")
    expect(landingSource).not.toContain('<style dangerouslySetInnerHTML')
    expect(landingSource).not.toContain('const CSS = `')
  })

  it('never serves a pre-fix (whole-inventory) cached snapshot', () => {
    expect(landingSource).toContain("const LANDING_CACHE_QUERY = 'v2'")
    expect(landingSource).toContain('v.slices.all.featured.length <= FEATURED_PAGE_SIZE')
  })

  it('fetches later windows from the listing API instead of bundling them', () => {
    expect(gridSource).toContain("from '@/lib/marketplaceLandingPaging'")
    expect(gridSource).toContain('landingCardsPath(country, page)')
    expect(gridSource).toContain('parseLandingCardsPage(')
    expect(gridSource).toContain('mergeNewLandingCards(')
    // No local "slice the already-serialized inventory" paging left behind.
    expect(gridSource).not.toContain('gigs.slice(0, visibleCount)')
    expect(gridSource).toContain('MAX_PAGE_REQUESTS_PER_ACTION')
    expect(gridSource).toContain('aria-busy={pending}')
  })
})

describe('shipped artifact gate (scripts/verify-market-landing-payload.mjs)', () => {
  const fixtureRoot = join(repoRoot, '.next', 'payload-gate-test')
  const htmlPath = join(fixtureRoot, 'server', 'app', 'marketplace.html')
  const cacheDir = join(fixtureRoot, 'cache')
  const assetsDir = join(fixtureRoot, 'assets')

  const cards = (count: number) =>
    Array.from({ length: count }, (_, i) => `<a href="/gigs/brief-${i}" class="jsx-1 gig-link"><article></article></a>`).join('')

  // The flight payload escapes quotes: the marker the gate counts is
  // \"providerHeadshot\": exactly as React serializes a card record.
  const serializedRecord = '\\"providerHeadshot\\":null,'

  const document = (cardCount: number, serializedRecords: number, inlineStyleBytes: number) =>
    [
      '<!DOCTYPE html><html><head><link rel="stylesheet" href="/_next/static/css/fixture.css"/></head><body>',
      `<style>${'.a{color:#fff}'.repeat(Math.ceil(inlineStyleBytes / 13))}</style>`,
      cards(cardCount),
      `<script>self.__next_f.push([1,"${serializedRecord.repeat(serializedRecords)}"])</script>`,
      '</body></html>',
    ].join('')

  const runGate = (args: string[]) =>
    execFileSync('node', [gateScript, ...args], { cwd: repoRoot, encoding: 'utf8', stdio: 'pipe' })

  beforeEach(() => {
    rmSync(fixtureRoot, { recursive: true, force: true })
    mkdirSync(join(fixtureRoot, 'server', 'app'), { recursive: true })
    mkdirSync(cacheDir, { recursive: true })
  })

  afterAll(() => {
    rmSync(fixtureRoot, { recursive: true, force: true })
  })

  const baseArgs = ['--build-id', 'fixture', '--html', htmlPath, '--cache', cacheDir, '--assets', assetsDir]

  it('passes a document that carries exactly one page and no inline stylesheet', () => {
    writeFileSync(htmlPath, document(FEATURED_PAGE_SIZE, FEATURED_PAGE_SIZE + 4, 1024))
    const output = runGate(baseArgs)
    expect(output).toContain('OK cards=48')
  })

  it('fails when the document embeds later pages of briefs', () => {
    writeFileSync(htmlPath, document(FEATURED_PAGE_SIZE + 48, 217, 1024))
    expect(() => runGate(baseArgs)).toThrow()
    try {
      runGate(baseArgs)
    } catch (error: any) {
      expect(String(error.stderr)).toContain('brief cards')
    }
  })

  it('fails when the serialized brief records exceed one page + hero slides', () => {
    writeFileSync(htmlPath, document(FEATURED_PAGE_SIZE, 217, 1024))
    try {
      runGate(baseArgs)
      throw new Error('gate should have failed')
    } catch (error: any) {
      expect(String(error.stderr)).toContain('serializes 217 brief records')
    }
  })

  it('fails when the landing stylesheet is inline again', () => {
    writeFileSync(htmlPath, document(FEATURED_PAGE_SIZE, FEATURED_PAGE_SIZE + 4, 60000))
    try {
      runGate(baseArgs)
      throw new Error('gate should have failed')
    } catch (error: any) {
      expect(String(error.stderr)).toContain('inline <style> block')
    }
  })

  it('fails when a linked stylesheet was not published with the assets', () => {
    writeFileSync(htmlPath, document(FEATURED_PAGE_SIZE, FEATURED_PAGE_SIZE + 4, 1024))
    mkdirSync(assetsDir, { recursive: true })
    try {
      runGate(baseArgs)
      throw new Error('gate should have failed')
    } catch (error: any) {
      expect(String(error.stderr)).toContain('not published')
    }
  })

  it('fails a pre-fix sized document against the budget', () => {
    // Well-formed (one page, no mega inline style) but big: the budget alone
    // must reject it, which is the exact pre-fix failure mode.
    const oversized = document(FEATURED_PAGE_SIZE, FEATURED_PAGE_SIZE + 4, 1024).replace(
      '</body>',
      `${' '.repeat(310000)}</body>`,
    )
    writeFileSync(htmlPath, oversized)
    try {
      runGate(baseArgs)
      throw new Error('gate should have failed')
    } catch (error: any) {
      expect(String(error.stderr)).toContain('byte budget')
    }
  })
})
