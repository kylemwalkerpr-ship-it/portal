/**
 * MARKET-ROOT-TRANSFER-LATENCY — document payload budget + first-page contract.
 *
 * Production baseline after #263: market `/` was a static cache HIT and still
 * shipped a 524,455 byte document (identity), because the RSC client props
 * carried the whole active inventory (~217 brief records) and the landing
 * stylesheet was inline (serialized into BOTH the document and the flight
 * payload). This suite locks the data-shape contract that removes it, and runs
 * the shipped artifact gate (scripts/verify-market-landing-payload.mjs) against
 * synthetic built documents so the gate's pass/fail behavior is regression
 * tested rather than assumed — including the JSON-escaped published
 * cache-entry encoding, in which a quote-shape-sensitive occurrence count
 * read 0 against the real artifact while the document rendered every card.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
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
    expect(gridSource).toContain('landingCardsPath(country, pageToLoad)')
    expect(gridSource).toContain('parseLandingCardsPage(')
    expect(gridSource).toContain('mergeNewLandingCards(')
    // No local "slice the already-serialized inventory" paging left behind.
    expect(gridSource).not.toContain('gigs.slice(0, visibleCount)')
    // One narrow page request per navigation, and no request fan-out: the old
    // bounded "fetch until the target card count exists" loop is gone.
    expect(gridSource).toContain('applyLandingWindow(')
    expect(gridSource).not.toContain('MAX_PAGE_REQUESTS_PER_ACTION')
    expect(gridSource).toContain('aria-busy={pending}')
  })
})

describe('shipped artifact gate (scripts/verify-market-landing-payload.mjs)', () => {
  const fixtureRoot = join(repoRoot, '.next', 'payload-gate-test')
  const htmlPath = join(fixtureRoot, 'server', 'app', 'marketplace.html')
  const cacheDir = join(fixtureRoot, 'cache')
  const cacheFile = join(cacheDir, 'fixture', 'marketplace.cache')
  const assetsDir = join(fixtureRoot, 'assets')
  const stylesheetHref = '/_next/static/css/fixture.css'
  const baseArgs = ['--build-id', 'fixture', '--html', htmlPath, '--cache', cacheDir, '--assets', assetsDir]

  const cardMarkup = (count: number) =>
    Array.from(
      { length: count },
      (_, i) => `<a href="/gigs/brief-${i}" class="jsx-1 gig-link"><article></article></a>`,
    ).join('')

  // Flight escaping exactly as React emits it inside the document: one projected
  // first-page card record, and one FULL inventory record. `rank_score` /
  // `order_count` exist on LandingGig only, so their presence in the shipped
  // document is proof that whole gig records were serialized again.
  const cardRecord = '\\"providerHeadshot\\":null,\\"starting_price\\":25000,'
  const leakedRecord = '\\"rank_score\\":0.42,\\"order_count\\":3,'

  const document = (
    {
      cardCount = FEATURED_PAGE_SIZE,
      recordCount = FEATURED_PAGE_SIZE + 4,
      record = cardRecord,
      inlineStyleBytes = 1024,
    }: { cardCount?: number; recordCount?: number; record?: string; inlineStyleBytes?: number } = {},
  ) =>
    [
      `<!DOCTYPE html><html><head><link rel="stylesheet" href="${stylesheetHref}"/></head><body>`,
      `<style>${'.a{color:#fff}'.repeat(Math.ceil(inlineStyleBytes / 13))}</style>`,
      cardMarkup(cardCount),
      `<script>self.__next_f.push([1,"${record.repeat(recordCount)}"])</script>`,
      '</body></html>',
    ].join('')

  /**
   * The published cache entry is the runtime's JSON value (`response.json()`),
   * so the document travels as an escaped JSON string. This is the encoding the
   * deployed gate actually reads — and the one in which a quote-shape-sensitive
   * key count silently read 0 on the real artifact.
   */
  const cacheEntry = (html: string) => Buffer.from(JSON.stringify({ type: 'app', html }))

  /** Publish the stylesheet the fixture document links (assets are real). */
  const publishStylesheet = () => {
    const target = join(assetsDir, stylesheetHref.replace(/^\//, ''))
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, '.a{color:#fff}')
  }

  const runGate = (args: string[]) =>
    execFileSync('node', [gateScript, ...args], { cwd: repoRoot, encoding: 'utf8', stdio: 'pipe' })

  /** Run the gate expecting failure; returns its stderr for further assertions. */
  const expectGateFailure = (expected: string) => {
    let stderr = ''
    try {
      runGate(baseArgs)
    } catch (error: any) {
      stderr = String(error.stderr)
    }
    expect(stderr).not.toBe('')
    expect(stderr).toContain(expected)
    return stderr
  }

  beforeEach(() => {
    rmSync(fixtureRoot, { recursive: true, force: true })
    mkdirSync(join(fixtureRoot, 'server', 'app'), { recursive: true })
    mkdirSync(join(cacheDir, 'fixture'), { recursive: true })
  })

  afterAll(() => {
    rmSync(fixtureRoot, { recursive: true, force: true })
  })

  it('passes a document that carries exactly one page and no full records', () => {
    publishStylesheet()
    writeFileSync(htmlPath, document())
    const output = runGate(baseArgs)
    expect(output).toContain('OK cards=48')
    expect(output).toContain('rank_score=0')
    expect(output).toContain('order_count=0')
    // The linked-stylesheet publication check ran for real (not skipped).
    expect(output).toContain('verified 1 linked stylesheet(s)')
  })

  it('passes the same document in the published cache-entry (JSON) encoding', () => {
    publishStylesheet()
    writeFileSync(cacheFile, cacheEntry(document()))
    const output = runGate(baseArgs)
    expect(output).toContain('OK cards=48')
    expect(output).toContain('verified 1 linked stylesheet(s)')
  })

  it('fails when the document embeds later pages of briefs', () => {
    writeFileSync(htmlPath, document({ cardCount: FEATURED_PAGE_SIZE + 48 }))
    expectGateFailure('brief cards')
  })

  it('fails when full-inventory-only record fields leak back into the payload', () => {
    // 217 leaked full records, small enough that the byte budget and the
    // reduction floor both pass: only the leakage guard can reject this.
    writeFileSync(htmlPath, document({ record: leakedRecord, recordCount: 217 }))
    const stderr = expectGateFailure('full-inventory-only record field')
    expect(stderr).toContain('rank_score')
    expect(stderr).toContain('order_count')
    expect(stderr).not.toContain('byte budget')
  })

  it('fails the same leak through the published cache-entry (JSON) encoding', () => {
    writeFileSync(cacheFile, cacheEntry(document({ record: leakedRecord, recordCount: 217 })))
    expectGateFailure('rank_score')
  })

  it('fails an unescaped leak in the prerender-output encoding too', () => {
    writeFileSync(htmlPath, document({ record: '"rank_score":0.42,"order_count":3,', recordCount: 217 }))
    expectGateFailure('rank_score')
  })

  it('fails when the landing stylesheet is inline again', () => {
    writeFileSync(htmlPath, document({ inlineStyleBytes: 60000 }))
    expectGateFailure('inline <style> block')
  })

  it('fails when a linked stylesheet was not published with the assets', () => {
    writeFileSync(htmlPath, document())
    mkdirSync(assetsDir, { recursive: true })
    expectGateFailure('not published')
  })

  it('fails a pre-fix sized document against the budget', () => {
    // Well-formed (one page, no leaked records, no mega inline style) but big:
    // the budget alone must reject it, which is the exact pre-fix failure mode.
    const oversized = document().replace('</body>', `${' '.repeat(310000)}</body>`)
    writeFileSync(htmlPath, oversized)
    expectGateFailure('byte budget')
  })
})
