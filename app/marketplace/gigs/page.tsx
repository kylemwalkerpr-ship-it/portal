import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { GigsDiscoveryQueryGate } from '@/components/marketplace/GigsDiscoveryQueryGate'
import { CATEGORIES } from '@/lib/categories'
import { getCached, setCached, generateVersionedCacheKey } from '@/lib/cache'
import { getMarketplaceCanonicalUrl } from '@/lib/marketplaceSeo'
import { createSupabaseAdminClient } from '@/lib/supabase'

// TRUE SSG — no `dynamic`, no `revalidate`. Production evidence: rendering
// this hub per request exceeded the Workers Free 10ms CPU budget, and the Free
// plan has no real ISR queue (OpenNext's default queue is a dummy that throws).
// The complete service directory is therefore rendered once at build time and
// served as a static asset. The versioned KV read-through below stays as the
// shared cache contract with the rest of the marketplace; outside the Worker it
// is a fail-open no-op, so the build reads the DB directly.

const canonicalUrl = getMarketplaceCanonicalUrl('/gigs')

// ── Versioned KV read-through (same pattern as the marketplace landing) ──
// The directory pulls every active provider-backed gig (up to 5000 rows) to
// build the grouped "Complete service directory". That fan-out is identical
// for every visitor, so it is read through a versioned KV entry in the `gigs`
// namespace: the same namespace and TTL the rest of the marketplace uses, so
// publish/pause/moderate (bumpCacheVersion('gigs')) keeps behaving the same
// way wherever this snapshot is read. On this build-static route the Worker KV
// binding is absent during `next build`, so the entry is resolved once from
// the DB at build time and refreshed by the next deploy.
const GIGS_DIRECTORY_CACHE_TTL_SECONDS = 300
const GIGS_DIRECTORY_CACHE_PATH = '/cache/gigs-directory'
const GIGS_DIRECTORY_CACHE_QUERY = 'v1'

export const metadata: Metadata = {
  title: 'Browse Immigration & Tenancy Services | YouSafe Marketplace',
  description:
    'Browse active YouSafe Marketplace services from vetted immigration consultants and independent attorneys across the US, UK, Canada and Australia.',
  alternates: { canonical: canonicalUrl },
  robots: { index: true, follow: true },
  openGraph: {
    url: canonicalUrl,
    title: 'Browse Immigration & Tenancy Services | YouSafe Marketplace',
    description:
      'Compare active immigration, document-preparation and tenancy services on YouSafe Marketplace.',
    type: 'website',
  },
}

type HubGig = {
  id: string
  slug: string | null
  title: string | null
  description: string | null
  category: string | null
  jurisdiction: string | null
  provider_type: string | null
  avg_rating: number | null
  review_count: number | null
  published_at: string | null
  provider_id: string | null
}

/**
 * A cached directory must still look like the rows the page renders: an
 * array of objects carrying a string id. Malformed/legacy entries are treated
 * as a miss and overwritten instead of crashing the hub.
 */
function isHubGigDirectory(value: unknown): value is HubGig[] {
  return (
    Array.isArray(value) &&
    value.every((gig) => Boolean(gig && typeof gig === 'object' && typeof (gig as HubGig).id === 'string'))
  )
}

/**
 * DB-backed directory snapshot. `null` = the admin client could not be
 * created or the query failed — callers serve an empty directory WITHOUT
 * persisting it, so a transient blip cannot blank the hub for the whole TTL.
 */
async function computeActiveGigs(): Promise<HubGig[] | null> {
  try {
    const db = createSupabaseAdminClient()
    const { data, error } = await db
      .from('gigs')
      .select(
        'id, slug, title, description, category, jurisdiction, provider_type, avg_rating, review_count, published_at, provider_id',
      )
      .eq('status', 'active')
      .not('provider_id', 'is', null)
      .not('slug', 'is', null)
      .order('published_at', { ascending: false })
      .limit(5000)

    if (error) {
      console.warn('[marketplace/gigs] active-gig directory query failed', error.message)
      return null
    }

    return (data ?? []).filter((gig: any) => Boolean(gig?.slug && gig?.provider_id)) as HubGig[]
  } catch (error) {
    console.warn('[marketplace/gigs] active-gig directory unavailable', error)
    return null
  }
}

async function loadActiveGigs(): Promise<HubGig[]> {
  const cacheKey = await generateVersionedCacheKey(
    'gigs',
    GIGS_DIRECTORY_CACHE_PATH,
    GIGS_DIRECTORY_CACHE_QUERY,
  )
  const cached = await getCached<HubGig[]>(cacheKey, GIGS_DIRECTORY_CACHE_TTL_SECONDS)
  if (isHubGigDirectory(cached)) return cached

  const fresh = await computeActiveGigs()
  if (!fresh) return []

  await setCached(cacheKey, fresh, GIGS_DIRECTORY_CACHE_TTL_SECONDS)
  return fresh
}

function categoryLabel(id: string | null): string {
  if (!id) return 'Marketplace service'
  return CATEGORIES.find((category) => category.id === id)?.name ?? 'Marketplace service'
}

function jurisdictionLabel(code: string | null): string | null {
  switch ((code ?? '').toLowerCase()) {
    case 'us': return 'United States'
    case 'uk': return 'United Kingdom'
    case 'ca': return 'Canada'
    case 'au': return 'Australia'
    default: return code ? code.toUpperCase() : null
  }
}

function excerpt(value: string | null): string {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)
}

export default async function MarketplaceServicesHub() {
  const gigs = await loadActiveGigs()
  const featured = gigs.slice(0, 24)
  const grouped = CATEGORIES.map((category) => ({
    ...category,
    gigs: gigs.filter((gig) => gig.category === category.id),
  })).filter((category) => category.gigs.length > 0)
  const uncategorized = gigs.filter(
    (gig) => !gig.category || !CATEGORIES.some((category) => category.id === gig.category),
  )

  // `directory` is also the Suspense fallback below: the static HTML a crawler
  // receives is always the complete service directory.
  const directory = (
    <main className="ys-gigs-hub">
      <style>{`
        .ys-gigs-hub{width:min(1280px,calc(100vw - 32px));margin:0 auto;padding:42px 0 72px;color:var(--ys-ink,#0f172a)}
        .ys-gigs-hero{max-width:850px;margin-bottom:32px}
        .ys-gigs-kicker{font-size:12px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:#64748b;margin:0 0 9px}
        .ys-gigs-h1{font-size:clamp(34px,5vw,56px);line-height:1.03;letter-spacing:-.035em;margin:0 0 14px;font-weight:650}
        .ys-gigs-lead{font-size:17px;line-height:1.65;color:#475569;margin:0;max-width:760px}
        .ys-gigs-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px}
        .ys-gigs-actions a,.ys-gigs-cat-link{display:inline-flex;align-items:center;text-decoration:none;border:1px solid rgba(15,23,42,.14);border-radius:999px;padding:9px 14px;font-weight:700;color:inherit;background:rgba(255,255,255,.72)}
        .ys-gigs-actions a:first-child{background:#172554;color:#fff;border-color:#172554}
        .ys-gigs-section{margin-top:38px}
        .ys-gigs-section h2{font-size:25px;letter-spacing:-.02em;margin:0 0 14px}
        .ys-gigs-categories{display:flex;gap:8px;flex-wrap:wrap}
        .ys-gigs-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}
        .ys-gig-card{display:flex;flex-direction:column;min-height:205px;text-decoration:none;color:inherit;background:rgba(255,255,255,.78);border:1px solid rgba(15,23,42,.11);border-radius:16px;padding:18px;box-shadow:0 8px 24px rgba(15,23,42,.035)}
        .ys-gig-card:hover{border-color:rgba(15,23,42,.28);transform:translateY(-1px)}
        .ys-gig-meta{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.055em;color:#64748b;margin-bottom:8px}
        .ys-gig-card h3{font-size:17px;line-height:1.35;margin:0 0 9px;letter-spacing:-.01em}
        .ys-gig-card p{font-size:13px;line-height:1.55;color:#64748b;margin:0 0 16px}
        .ys-gig-card-footer{margin-top:auto;font-size:12px;font-weight:700;color:#334155}
        .ys-gigs-directory{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:18px}
        .ys-gigs-group{background:rgba(255,255,255,.58);border:1px solid rgba(15,23,42,.09);border-radius:14px;padding:17px}
        .ys-gigs-group h3{margin:0 0 10px;font-size:17px}
        .ys-gigs-group ul{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:7px}
        .ys-gigs-group a{font-size:13px;line-height:1.35;color:#334155;text-decoration:none}
        .ys-gigs-group a:hover{text-decoration:underline}
        .ys-gigs-empty{border:1px dashed rgba(15,23,42,.2);border-radius:14px;padding:20px;color:#64748b;background:rgba(255,255,255,.5)}
        @media(max-width:640px){.ys-gigs-hub{padding-top:28px}.ys-gigs-grid{grid-template-columns:1fr}.ys-gigs-directory{grid-template-columns:1fr}}
      `}</style>

      <header className="ys-gigs-hero">
        <p className="ys-gigs-kicker">YouSafe Marketplace · Service directory</p>
        <h1 className="ys-gigs-h1">Browse active services</h1>
        <p className="ys-gigs-lead">
          Compare immigration, study, work, document-preparation and tenancy help from marketplace providers.
          Provider credentials and service scope vary by listing. YouSafe is not a law firm; legal advice is provided only by independently engaged licensed attorneys.
        </p>
        <div className="ys-gigs-actions">
          <Link href="/">Search marketplace</Link>
          <Link href="/providers">Browse providers</Link>
          <Link href="/categories">Browse categories</Link>
        </div>
      </header>

      <section className="ys-gigs-section" aria-labelledby="service-categories-heading">
        <h2 id="service-categories-heading">Explore by category</h2>
        <div className="ys-gigs-categories">
          {CATEGORIES.map((category) => (
            <Link key={category.id} className="ys-gigs-cat-link" href={`/categories/${category.id}`}>
              {category.name}
            </Link>
          ))}
        </div>
      </section>

      <section className="ys-gigs-section" aria-labelledby="active-services-heading">
        <h2 id="active-services-heading">Active marketplace services</h2>
        {featured.length > 0 ? (
          <div className="ys-gigs-grid">
            {featured.map((gig) => {
              const location = jurisdictionLabel(gig.jurisdiction)
              const reviews = Number(gig.review_count ?? 0)
              return (
                <Link key={gig.id} href={`/gigs/${gig.slug}`} className="ys-gig-card">
                  <div className="ys-gig-meta">
                    {[categoryLabel(gig.category), location, gig.provider_type].filter(Boolean).join(' · ')}
                  </div>
                  <h3>{gig.title || 'Marketplace service'}</h3>
                  {excerpt(gig.description) && <p>{excerpt(gig.description)}</p>}
                  <div className="ys-gig-card-footer">
                    {typeof gig.avg_rating === 'number' && reviews > 0
                      ? `${Number(gig.avg_rating).toFixed(1)}★ · ${reviews} review${reviews === 1 ? '' : 's'}`
                      : 'View service details'}
                  </div>
                </Link>
              )
            })}
          </div>
        ) : (
          <div className="ys-gigs-empty">
            Service inventory is temporarily unavailable. Browse the category and provider directories above while listings refresh.
          </div>
        )}
      </section>

      {gigs.length > 0 && (
        <section className="ys-gigs-section" aria-labelledby="complete-directory-heading">
          <h2 id="complete-directory-heading">Complete service directory</h2>
          <div className="ys-gigs-directory">
            {grouped.map((category) => (
              <section key={category.id} className="ys-gigs-group" aria-labelledby={`gig-group-${category.id}`}>
                <h3 id={`gig-group-${category.id}`}>
                  <Link href={`/categories/${category.id}`}>{category.name}</Link>
                </h3>
                <ul>
                  {category.gigs.map((gig) => (
                    <li key={gig.id}>
                      <Link href={`/gigs/${gig.slug}`}>{gig.title || gig.slug}</Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {uncategorized.length > 0 && (
              <section className="ys-gigs-group" aria-labelledby="gig-group-other">
                <h3 id="gig-group-other">Other services</h3>
                <ul>
                  {uncategorized.map((gig) => (
                    <li key={gig.id}>
                      <Link href={`/gigs/${gig.slug}`}>{gig.title || gig.slug}</Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </section>
      )}
    </main>
  )

  // ── Client-side query discovery ──
  // The hub is build-static, so it never reads the URL on the server. Deep
  // links that carry discovery filters (/gigs?q=…&category=…&country=…) still
  // resolve to the same client-side GigDiscoveryPage used by the landing and
  // category shelves: the gate reads useSearchParams() after hydration and
  // swaps the directory for the results view. The gate sits inside its own
  // Suspense boundary (required by Next for useSearchParams on a static page);
  // the fallback is the server-rendered directory above. Those variant URLs
  // stay out of the index via the market-host edge rule (middleware.ts); this
  // page keeps its clean, indexable `/gigs` canonical metadata.
  return (
    <Suspense fallback={directory}>
      <GigsDiscoveryQueryGate>{directory}</GigsDiscoveryQueryGate>
    </Suspense>
  )
}
