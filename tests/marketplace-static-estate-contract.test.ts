/**
 * STATIC-ESTATE CONTRACT — Workers Free public Marketplace SEO pages.
 *
 * Production evidence: per-request rendering of the public Marketplace SEO
 * estate exceeded the Workers Free 10ms CPU budget, and the Free plan has no
 * real ISR queue (OpenNext's default queue is a dummy that throws). The public
 * estate is therefore build-static:
 *
 *  · /gigs is true SSG again, and query-string discovery moved to a client
 *    gate so the static directory stays the crawler-visible document;
 *  · /categories/<id>, /gigs/<slug> and /providers/<id> enumerate every
 *    canonical param at build time with `dynamicParams = false`, so nothing
 *    is resolved per request — and their param enumeration FAILS CLOSED: a
 *    query error throws at build time instead of silently shrinking the
 *    estate (which would turn live URLs into hard 404s);
 *  · the marketplace root (/) is true SSG as well: deterministic canonical
 *    metadata, the default `country="all" page={1}` landing as the static
 *    crawler document, and the shared client query gate for discovery deep
 *    links;
 *  · sitemap.xml is generated once at build time (`force-static` +
 *    `revalidate = false`).
 *
 * These are source contracts, not build assertions: they fail loudly if any
 * page drifts back to force-dynamic, regrows an ISR window, drops its static
 * param enumeration, or reintroduces server-side searchParams.
 */

import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const readRepo = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')

const gigsHub = readRepo('app/marketplace/gigs/page.tsx')
const gigDetail = readRepo('app/marketplace/gigs/[slug]/page.tsx')
const categoryDetail = readRepo('app/marketplace/categories/[categoryId]/page.tsx')
const providerDetail = readRepo('app/marketplace/providers/[id]/page.tsx')
const marketplaceRoot = readRepo('app/marketplace/page.tsx')
const sitemap = readRepo('app/sitemap.ts')
const queryGate = readRepo('components/marketplace/GigsDiscoveryQueryGate.tsx')

const FORCE_DYNAMIC_EXPORT = /export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/
const DYNAMIC_EXPORT = /^\s*export\s+const\s+dynamic\b/m
const REVALIDATE_EXPORT = /^\s*export\s+const\s+revalidate\b/m

/**
 * Source slice helper: returns the body of the first function whose signature
 * contains `signature`, using brace matching so the assertions below are
 * scoped to that function instead of the whole file.
 */
function functionBody(source: string, signature: string): string {
  const start = source.indexOf(signature)
  if (start < 0) throw new Error(`missing signature: ${signature}`)
  // The declaration's params and return type contain braces of their own
  // (`generateStaticParams(): Promise<Array<{ slug: string }>> {`), so track
  // generic `<>` depth and only accept a `{` at depth 0 as the real body.
  let angles = 0
  let open = -1
  for (let i = source.indexOf('(', start); i >= 0 && i < source.length; i += 1) {
    const ch = source[i]
    if (ch === '<') angles += 1
    else if (ch === '>') angles -= 1
    else if (ch === '{' && angles <= 0) {
      open = i
      break
    }
  }
  if (open < 0) throw new Error(`missing body: ${signature}`)
  let depth = 0
  for (let j = open; j < source.length; j += 1) {
    if (source[j] === '{') depth += 1
    else if (source[j] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(open, j + 1)
    }
  }
  throw new Error(`unterminated body: ${signature}`)
}

describe('/gigs hub — true SSG with client-side query discovery', () => {
  it('exports neither dynamic nor revalidate: no per-request render, no ISR', () => {
    expect(gigsHub).not.toMatch(FORCE_DYNAMIC_EXPORT)
    expect(gigsHub).not.toMatch(DYNAMIC_EXPORT)
    expect(gigsHub).not.toMatch(REVALIDATE_EXPORT)
    expect(gigsHub).not.toContain('export const revalidate')
  })

  it('keeps the complete SSR service directory and its clean metadata', () => {
    expect(gigsHub).toContain('export default async function MarketplaceServicesHub()')
    expect(gigsHub).toContain("getMarketplaceCanonicalUrl('/gigs')")
    expect(gigsHub).toContain('robots: { index: true, follow: true }')
    expect(gigsHub).toContain('Complete service directory')
    expect(gigsHub).toContain('Other services')
    expect(gigsHub).toContain('href={`/gigs/${gig.slug}`}')
  })

  it('resolves query-string discovery client-side, never through server searchParams', () => {
    expect(gigsHub).not.toContain('searchParams')
    expect(gigsHub).toContain(
      "import { GigsDiscoveryQueryGate } from '@/components/marketplace/GigsDiscoveryQueryGate'",
    )
    expect(gigsHub).toContain('<GigsDiscoveryQueryGate>{directory}</GigsDiscoveryQueryGate>')
    expect(gigsHub).toContain('<Suspense fallback={directory}>')

    // The gate is a client island: it reads the real URL after hydration and
    // swaps in the same discovery surface the landing/category shelves use.
    expect(queryGate).toContain("'use client'")
    expect(queryGate).toContain('useSearchParams')
    expect(queryGate).toContain('GigDiscoveryPage')
    expect(queryGate).toContain('GIG_DISCOVERY_QUERY_KEYS')
  })
})

describe('/categories/[categoryId] — taxonomy-driven static params', () => {
  it('enumerates every canonical category and subcategory at build time', () => {
    expect(categoryDetail).toContain('export function generateStaticParams()')
    expect(categoryDetail).toContain('for (const category of CATEGORIES)')
    expect(categoryDetail).toContain('for (const subcategory of category.subcategories)')
    expect(categoryDetail).toContain('return [...ids].map((categoryId) => ({ categoryId }))')
  })

  it('has no runtime param fallback and no server searchParams', () => {
    expect(categoryDetail).toContain('export const dynamicParams = false')
    expect(categoryDetail).not.toContain('searchParams')
    expect(categoryDetail).not.toMatch(FORCE_DYNAMIC_EXPORT)
    expect(categoryDetail).not.toMatch(REVALIDATE_EXPORT)
  })

  it('keeps the client discovery island inside a Suspense boundary so the page can be static', () => {
    expect(categoryDetail).toContain('<Suspense fallback={null}>')
    expect(categoryDetail).toContain(
      '<GigDiscoveryPage categoryId={filterId} categoryName={displayName} />',
    )
  })
})

describe('/gigs/[slug] — build-time slug estate', () => {
  it('exports no ISR window and no runtime param fallback', () => {
    expect(gigDetail).not.toMatch(REVALIDATE_EXPORT)
    expect(gigDetail).not.toContain('export const revalidate')
    expect(gigDetail).toContain('export const dynamicParams = false')
  })

  it('enumerates active provider-backed gigs with the sitemap eligibility rule', () => {
    expect(gigDetail).toContain('export async function generateStaticParams()')
    expect(gigDetail).toContain(".eq('status', 'active')")
    expect(gigDetail).toContain(".not('provider_id', 'is', null)")
    expect(gigDetail).toContain(".not('slug', 'is', null)")
    expect(gigDetail).toContain('slugs.add(String(gig.slug))')
  })

  it('pre-renders safe alias slugs so retired URLs keep their permanent redirect', () => {
    expect(gigDetail).toContain('LEGACY_GIG_SLUG_REDIRECTS')
    expect(gigDetail).toContain("from('gig_slug_redirects')")
    expect(gigDetail).toContain("select('old_slug, new_slug')")
    expect(gigDetail).toContain('slugs.add(String(row.old_slug))')
    expect(gigDetail).toContain('permanentRedirect(`/gigs/${redirected}`)')
  })

  it('fails the build closed when the gig or alias query errors', () => {
    const body = functionBody(gigDetail, 'export async function generateStaticParams')

    // `dynamicParams = false` makes every slug missing from this enumeration a
    // real 404, so a swallowed query error would silently shrink the indexable
    // estate to the legacy map. Both queries must throw, and the setup must
    // rethrow (no try/catch that turns the failure into a fallback set).
    expect(body).toContain('if (gigResult.error)')
    expect(body).toContain('if (redirectResult.error)')
    expect(body).toContain('throw new Error(`[gigs/static-params] gig slug query failed')
    expect(body).toContain('throw new Error(`[gigs/static-params] alias slug query failed')
    // Setup lives inside the same fail-closed scope, and the full slug set is
    // only returned after both error checks have passed.
    expect(body).toContain('createSupabaseAdminClient()')
    expect(body.indexOf('return [...slugs]')).toBeGreaterThan(body.indexOf('if (redirectResult.error)'))
    expect(body).not.toContain('try {')
    expect(body).not.toContain('catch')
    expect(gigDetail).not.toContain('using the static legacy map')
    expect(gigDetail).not.toContain('slug estate unavailable at build')
  })

  it('keeps JSON-LD and the crawlable SSR body', () => {
    expect(gigDetail).toContain('application/ld+json')
    expect(gigDetail).toContain('buildGigJsonLd')
    expect(gigDetail).toContain('SsrHydrateGate')
    expect(gigDetail).toContain('GigDetailPage')
  })
})

describe('/providers/[id] — build-time provider estate', () => {
  it('is static with no runtime param fallback', () => {
    expect(providerDetail).not.toMatch(FORCE_DYNAMIC_EXPORT)
    expect(providerDetail).not.toMatch(DYNAMIC_EXPORT)
    expect(providerDetail).not.toMatch(REVALIDATE_EXPORT)
    expect(providerDetail).toContain('export const dynamicParams = false')
  })

  it('enumerates attorney/consultant row ids, profile ids and usernames', () => {
    expect(providerDetail).toContain('export async function generateStaticParams()')
    expect(providerDetail).toContain("from('attorneys')")
    expect(providerDetail).toContain("from('consultants')")
    expect(providerDetail).toContain('profiles!attorneys_profile_id_fkey(username)')
    expect(providerDetail).toContain('profiles!consultants_profile_id_fkey(username)')
    // Gig pages link `provider.username || provider_id`, so the provider ids of
    // the active gig estate must be enumerated too (known-good FK embed).
    expect(providerDetail).toContain("from('gigs')")
    expect(providerDetail).toContain('profiles!gigs_provider_id_fkey(username)')
    expect(providerDetail).toContain(".eq('status', 'active')")
    expect(providerDetail).toContain('tokens.add(String(row.provider_id))')
    expect(providerDetail).toContain('tokens.add(String(row.profile_id))')
    expect(providerDetail).toContain('tokens.add(String(row.id))')
  })

  it('fails the build closed when any token query errors', () => {
    const body = functionBody(providerDetail, 'export async function generateStaticParams')

    // A partial/empty token set would 404 live provider URLs (dynamicParams =
    // false), so every query must throw and the enclosing setup must rethrow.
    expect(body).toContain('if (attorneyResult.error)')
    expect(body).toContain('if (consultantResult.error)')
    expect(body).toContain('if (gigProviderResult.error)')
    expect(body).toContain('throw new Error(`[providers/static-params] attorney token query failed')
    expect(body).toContain('throw new Error(`[providers/static-params] consultant token query failed')
    expect(body).toContain('throw new Error(`[providers/static-params] gig provider token query failed')
    // No partial/empty token set can be returned: setup and all three error
    // checks run before the enumeration is returned.
    expect(body).toContain('createSupabaseAdminClient()')
    expect(body.indexOf('return [...tokens]')).toBeGreaterThan(body.indexOf('if (gigProviderResult.error)'))
    expect(body).not.toContain('try {')
    expect(body).not.toContain('catch')
    expect(providerDetail).not.toContain('provider estate unavailable at build')
  })

  it('keeps the SSR provider body and credential privacy', () => {
    expect(providerDetail).toContain('SsrHydrateGate')
    expect(providerDetail).toContain('readyEvent="yousafe:provider-ssr-ready"')
    expect(providerDetail).not.toMatch(/\bbar_number\s*:/)
    expect(providerDetail).not.toMatch(/\bregistration_number\s*:/)
  })
})

describe('/ — marketplace root is true SSG', () => {
  it('exports neither dynamic nor an ISR window', () => {
    expect(marketplaceRoot).not.toMatch(FORCE_DYNAMIC_EXPORT)
    expect(marketplaceRoot).not.toMatch(DYNAMIC_EXPORT)
    expect(marketplaceRoot).not.toMatch(REVALIDATE_EXPORT)
    expect(marketplaceRoot).not.toContain('export const revalidate')
    expect(marketplaceRoot).not.toContain('revalidate')
  })

  it('never parses server searchParams (no filter, country or page fallbacks)', () => {
    expect(marketplaceRoot).not.toContain('searchParams')
    expect(marketplaceRoot).not.toContain('parseCountry')
    expect(marketplaceRoot).not.toContain('parsePage')
  })

  it('keeps deterministic static canonical root metadata', () => {
    expect(marketplaceRoot).toMatch(/export\s+const\s+metadata\b|export\s+async\s+function\s+generateMetadata/)
    expect(marketplaceRoot).toContain("getMarketplaceCanonicalUrl('/')")
    expect(marketplaceRoot).toContain('alternates: { canonical: canonicalUrl }')
    expect(marketplaceRoot).toContain('robots: { index: true, follow: true }')
  })

  it('renders the default country=all page=1 landing as the static document', () => {
    expect(marketplaceRoot).toContain('<PublicMarketplaceLanding country="all" page={1} />')
  })

  it('swaps to client discovery for ANY recognized query key through the shared gate', () => {
    // One gate, reused from /gigs — the root must not fork a second island.
    expect(marketplaceRoot).toContain(
      "import { GigsDiscoveryQueryGate } from '@/components/marketplace/GigsDiscoveryQueryGate'",
    )
    expect(marketplaceRoot).toContain('<Suspense fallback={landing}>')
    expect(marketplaceRoot).toContain('<GigsDiscoveryQueryGate>{landing}</GigsDiscoveryQueryGate>')
    expect(marketplaceRoot).not.toContain('useSearchParams')

    // The gate checks every key GigDiscoveryPage hydrates from, not just q/
    // category/sort, so jurisdiction/provider-type/country/page deep links
    // still resolve to the discovery surface after hydration.
    for (const key of ['q', 'category', 'country', 'jurisdiction', 'provider_type', 'sort', 'page']) {
      expect(queryGate).toContain(`'${key}'`)
    }
    expect(queryGate).toContain(
      'GIG_DISCOVERY_QUERY_KEYS.some((key) => Boolean(searchParams?.get(key)?.trim()))',
    )
  })
})

describe('sitemap.xml — build-static, no ISR', () => {
  it('is force-static with revalidation disabled', () => {
    expect(sitemap).toContain("export const dynamic = 'force-static'")
    expect(sitemap).toContain('export const revalidate = false')
    expect(sitemap).not.toMatch(FORCE_DYNAMIC_EXPORT)
    expect(sitemap).not.toContain("import { headers } from 'next/headers'")
  })

  it('keeps the full canonical URL set', () => {
    expect(sitemap).toContain("{ url: `${base}/gigs`, changeFrequency: 'weekly', priority: 0.75 }")
    expect(sitemap).toContain("{ url: `${base}/providers`, changeFrequency: 'weekly', priority: 0.7 }")
    expect(sitemap).toContain('clean(`/gigs/${gig.slug}`)')
    expect(sitemap).toContain('clean(`/providers/${token}`)')
    expect(sitemap).toContain('clean(`/categories/${cat.id}`)')
  })
})
