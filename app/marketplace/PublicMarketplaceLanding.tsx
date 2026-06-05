import {
  CATEGORIES,
  type Category,
  type CategoryId,
  LEGACY_CATEGORY_MAP,
  normalizeCategory,
} from '@/lib/categories'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { normalizeGallery, resolveCoverUrl } from '@/lib/galleryImages'
import { MarketplaceFooter } from '@/components/marketplace/MarketplaceFooter'
import { CountryPicker } from '@/components/marketplace/CountryTabs'
import { FaqAccordion } from '@/components/marketplace/FaqAccordion'
import { AllGigsDrawer } from '@/components/marketplace/AllGigsDrawer'
import MarketplaceFeed from '@/components/marketplace/MarketplaceFeed'
import HeroCaseFileSlideshow, { HeroSlide } from '@/components/marketplace/HeroCaseFileSlideshow'

/* ───────────────────────── Design tokens ────────────────────────── */

const T = {
  paper: '#F7F8FA',
  paper2: '#EEF1F6',
  paper3: '#DDE3EA',
  vellum: '#FFFFFF',
  ink: '#0F172A',
  inkMid: '#334155',
  inkSoft: '#64748B',
  rule: '#E2E8F0',
  ruleSoft: '#F1F5F9',
  indigo: '#3C3B6E',
  indigoDeep: '#2A2A55',
  indigoSoft: 'rgba(60,59,110,0.10)',
  brick: '#B22234',
  gold: '#C4A45A',
  moss: '#5F6B3A',
  star: '#C68B27',
}

const F = {
  display: "var(--font-lora), 'Lora', Georgia, 'Times New Roman', serif",
  ui: "var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  mono: "var(--font-plex-mono), 'IBM Plex Mono', ui-monospace, monospace",
}

const PORTAL_URL = 'https://portal.yousafeconsultancy.com'

type Country = 'all' | 'us' | 'uk' | 'ca'
type JxCode = Exclude<Country, 'all'>

function signUpHref(utm: string): string {
  return (
    `${PORTAL_URL}/sign-up/student` +
    `?source=marketing&return_to=/marketplace&utm_content=${encodeURIComponent(utm)}`
  )
}

/* ───────────────────────── Server data ─────────────────────────── */

interface LandingGig {
  id: string
  slug: string | null
  title: string
  category: string | null
  provider_type: 'attorney' | 'consultant' | null
  avg_rating: number
  review_count: number
  rank_score: number
  order_count: number
  starting_price: number | null
  delivery_days: number | null
  providerName: string
  providerCountry: string | null
  // Resolved headshot from the seller-specific table (attorneys.headshot_url
  // or consultants.headshot_url). profiles.avatar_url is rarely populated
  // for verified sellers, so the cards previously fell through to initials
  // even when the seller had uploaded a real photo on their profile.
  providerHeadshot: string | null
  jx: JxCode | null
  tiers: Array<{ price: number; delivery_days: number | null }>
  cover_image_url: string | null
  gallery_images: Array<{ url: string }>
}

interface CategoryStat {
  cat: Category
  count: number
  fromCents: number | null
}

interface JurisdictionStat {
  code: JxCode
  name: string
  currency: string
  count: number
  fromCents: number | null
  topCategories: Array<{ name: string; count: number }>
}

interface LandingReview {
  rating: number
  body: string
  gigTitle: string
  reviewerInitial: string
  reviewerName: string
}

interface Slice {
  featured: LandingGig[]
  caseFile: (LandingGig & { caseTiers: Array<{ tier: string; price: number }> }) | null
  categories: CategoryStat[]
  totalActive: number
  fromCents: number | null
  currency: string
  label: string
}

interface LandingData {
  slices: Record<Country, Slice>
  jurisdictions: JurisdictionStat[]
  reviews: LandingReview[]
}

const COUNTRY_CODE_MAP: Record<string, JxCode> = {
  US: 'us', USA: 'us', 'UNITED STATES': 'us',
  UK: 'uk', GB: 'uk', GBR: 'uk', 'UNITED KINGDOM': 'uk',
  CA: 'ca', CAN: 'ca', CANADA: 'ca',
}

const COUNTRY_META: Record<JxCode, { name: string; currency: string }> = {
  us: { name: 'United States', currency: 'USD' },
  uk: { name: 'United Kingdom', currency: 'GBP' },
  ca: { name: 'Canada', currency: 'CAD' },
}

function resolveJurisdiction(country?: string | null): JxCode | null {
  if (!country) return null
  return COUNTRY_CODE_MAP[country.toUpperCase().trim()] || null
}

function emptySlice(label: string, currency: string): Slice {
  return {
    featured: [],
    caseFile: null,
    categories: CATEGORIES.slice(0, 8).map((cat) => ({ cat, count: 0, fromCents: null })),
    totalActive: 0,
    fromCents: null,
    currency,
    label,
  }
}

function buildSlice(label: string, currency: string, gigs: LandingGig[]): Slice {
  const catCount = new Map<CategoryId, number>()
  const catMin = new Map<CategoryId, number>()
  let fromCents: number | null = null

  for (const g of gigs) {
    const catId = g.category
      ? (LEGACY_CATEGORY_MAP[g.category] || normalizeCategory(g.category))
      : null
    if (catId && CATEGORIES.some((c) => c.id === catId)) {
      catCount.set(catId, (catCount.get(catId) ?? 0) + 1)
      if (g.starting_price != null) {
        const cur = catMin.get(catId)
        if (cur == null || g.starting_price < cur) catMin.set(catId, g.starting_price)
      }
    }
    if (g.starting_price != null && (fromCents == null || g.starting_price < fromCents)) {
      fromCents = g.starting_price
    }
  }

  const featured = [...gigs]
    .sort((a, b) => b.rank_score - a.rank_score)
    .slice(0, 6)

  // "Case file" hero card = highest-impressions-or-most-reviews gig in the
  // slice. We use a composite signal (max(order_count, review_count)) since
  // there's no impressions column; both are valid signals of "the gig
  // everyone gravitates to" and we want either to qualify. Tie-break on
  // rank_score.
  const score = (g: LandingGig) =>
    Math.max(Number(g.order_count || 0), Number(g.review_count || 0)) * 1000 +
    Number(g.rank_score || 0)
  const top = [...gigs].sort((a, b) => score(b) - score(a))[0]
  let caseFile: Slice['caseFile'] = null
  if (top) {
    const labels = ['Brief', 'Standard', 'Filed']
    const tiers = [...top.tiers]
      .sort((a, b) => a.price - b.price)
      .slice(0, 3)
      .map((t, i) => ({ tier: labels[i] ?? `Tier ${i + 1}`, price: t.price }))
    caseFile = { ...top, caseTiers: tiers }
  }

  return {
    featured,
    caseFile,
    categories: CATEGORIES.slice(0, 8).map((cat) => ({
      cat,
      count: catCount.get(cat.id) ?? 0,
      fromCents: catMin.get(cat.id) ?? null,
    })),
    totalActive: gigs.length,
    fromCents,
    currency,
    label,
  }
}

async function loadLandingData(): Promise<LandingData> {
  const fallbackSlices: Record<Country, Slice> = {
    all: emptySlice('All jurisdictions', 'USD'),
    us: emptySlice('United States', 'USD'),
    uk: emptySlice('United Kingdom', 'GBP'),
    ca: emptySlice('Canada', 'CAD'),
  }
  const fallback: LandingData = {
    slices: fallbackSlices,
    jurisdictions: [
      { code: 'us', name: 'United States', currency: 'USD', count: 0, fromCents: null, topCategories: [] },
      { code: 'uk', name: 'United Kingdom', currency: 'GBP', count: 0, fromCents: null, topCategories: [] },
      { code: 'ca', name: 'Canada', currency: 'CAD', count: 0, fromCents: null, topCategories: [] },
    ],
    reviews: [],
  }

  let db
  try {
    db = createSupabaseAdminClient()
  } catch {
    return fallback
  }

  // One fat query: every active gig with provider country + tiers. The
  // marketplace inventory is small enough that pulling it whole on a public
  // landing is cheap, and partitioning happens in memory afterwards.
  // Do NOT request cover_image_url by name — that column is optional and
  // missing on some deployments; naming it triggers a PostgREST 42703 that
  // empties the whole inventory and leaves the marketplace blank.
  // resolveCoverUrl() below derives the cover from gallery_images[0] when
  // the column is absent, so card components still get an image.
  const inventoryP = db
    .from('gigs')
    .select(
      // provider_id is needed so we can join headshots from the seller-
      // specific tables (attorneys / consultants) below — profiles.avatar_url
      // is rarely set for verified sellers, so without that follow-up
      // query every gig card falls through to initials.
      'id, slug, title, category, provider_type, provider_id, jurisdiction, avg_rating, review_count, rank_score, order_count, gallery_images, tiers:gig_tiers(price, delivery_days, is_active), provider:profiles!gigs_provider_id_fkey(full_name, country)',
    )
    .eq('status', 'active')
    .order('rank_score', { ascending: false })
    .limit(400)

  const reviewsP = db
    .from('gig_reviews')
    .select(
      'rating, body, gig:gigs(title), reviewer:profiles!gig_reviews_reviewer_id_fkey(full_name)',
    )
    .eq('status', 'published')
    .gte('rating', 5)
    .not('body', 'is', null)
    .order('created_at', { ascending: false })
    .limit(3)

  const [inventoryRes, reviewsRes] = await Promise.all([inventoryP, reviewsP])

  // Batch-fetch headshots from the seller-specific tables. Each profile_id
  // is unique per attorney/consultant row (we added unique(profile_id) in
  // an earlier migration), so the two queries return at most one row per
  // provider. We index by profile_id so the gig-map below resolves in O(1)
  // regardless of how many gigs a single seller owns.
  const providerIds = Array.from(
    new Set(((inventoryRes.data ?? []) as any[]).map((r) => r.provider_id).filter(Boolean)),
  )
  const headshotByProfileId = new Map<string, string>()
  if (providerIds.length > 0) {
    const [attyHeadshots, consHeadshots] = await Promise.all([
      db.from('attorneys').select('profile_id, headshot_url').in('profile_id', providerIds),
      db.from('consultants').select('profile_id, headshot_url').in('profile_id', providerIds),
    ])
    for (const row of (attyHeadshots.data ?? []) as Array<{ profile_id: string; headshot_url: string | null }>) {
      if (row.headshot_url) headshotByProfileId.set(row.profile_id, row.headshot_url)
    }
    for (const row of (consHeadshots.data ?? []) as Array<{ profile_id: string; headshot_url: string | null }>) {
      if (row.headshot_url) headshotByProfileId.set(row.profile_id, row.headshot_url)
    }
  }

  const allGigs: LandingGig[] = ((inventoryRes.data ?? []) as any[]).map((row) => {
    const activeTiers = (row.tiers ?? [])
      .filter((t: any) => t.is_active && Number(t.price) > 0)
      .map((t: any) => ({ price: Number(t.price), delivery_days: t.delivery_days != null ? Number(t.delivery_days) : null }))
    const cheapest = activeTiers.sort((a: any, b: any) => a.price - b.price)[0]
    const country = row.provider?.country ?? null
    // Gig-level jurisdiction wins over provider.country — the column is the
    // contract going forward, profile country is only the legacy fallback
    // until the backfill catches every row.
    const gigJx: JxCode | null = ['us', 'uk', 'ca'].includes(String(row.jurisdiction || '').toLowerCase())
      ? (String(row.jurisdiction).toLowerCase() as JxCode)
      : null
    const gallery = normalizeGallery(row.gallery_images)
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      category: row.category,
      provider_type: row.provider_type,
      avg_rating: Number(row.avg_rating ?? 0),
      review_count: Number(row.review_count ?? 0),
      rank_score: Number(row.rank_score ?? 0),
      order_count: Number(row.order_count ?? 0),
      starting_price: cheapest ? cheapest.price : null,
      delivery_days: cheapest ? cheapest.delivery_days : null,
      providerName: row.provider?.full_name ?? 'YouSafe provider',
      providerCountry: country,
      providerHeadshot: headshotByProfileId.get(row.provider_id) ?? null,
      jx: gigJx ?? resolveJurisdiction(country),
      tiers: activeTiers,
      cover_image_url: resolveCoverUrl(row),
      gallery_images: gallery,
    }
  })

  const gigsByCountry: Record<JxCode, LandingGig[]> = { us: [], uk: [], ca: [] }
  for (const g of allGigs) {
    if (g.jx) gigsByCountry[g.jx].push(g)
  }

  const slices: Record<Country, Slice> = {
    all: buildSlice('All jurisdictions', 'USD', allGigs),
    us: buildSlice(COUNTRY_META.us.name, COUNTRY_META.us.currency, gigsByCountry.us),
    uk: buildSlice(COUNTRY_META.uk.name, COUNTRY_META.uk.currency, gigsByCountry.uk),
    ca: buildSlice(COUNTRY_META.ca.name, COUNTRY_META.ca.currency, gigsByCountry.ca),
  }

  /* ── Jurisdiction rail cards (always all 3, regardless of active slice) ── */
  const jurisdictions: JurisdictionStat[] = (Object.keys(COUNTRY_META) as JxCode[]).map((code) => {
    const slice = slices[code]
    const top = [...slice.categories]
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 4)
      .map((c) => ({ name: c.cat.name, count: c.count }))
    return {
      code,
      name: COUNTRY_META[code].name,
      currency: COUNTRY_META[code].currency,
      count: slice.totalActive,
      fromCents: slice.fromCents,
      topCategories: top,
    }
  })

  /* ── Reviews ────────────────────────────────────────────────── */
  const reviews: LandingReview[] = ((reviewsRes.data ?? []) as any[])
    .filter((r) => r.body && r.gig?.title && r.reviewer?.full_name)
    .slice(0, 3)
    .map((r) => {
      const name: string = r.reviewer.full_name
      const initial = name.trim().charAt(0).toUpperCase() || 'A'
      const displayName = `${name.split(' ')[0]} ${(name.split(' ')[1] ?? '').charAt(0) || ''}.`.trim()
      return {
        rating: Number(r.rating),
        body: String(r.body),
        gigTitle: String(r.gig.title),
        reviewerInitial: initial,
        reviewerName: displayName,
      }
    })

  return { slices, jurisdictions, reviews }
}

/* ───────────────────────── Helpers ─────────────────────────── */

function formatPrice(cents: number | null, currency = 'USD'): string {
  if (cents == null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(cents / 100))
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p.charAt(0).toUpperCase()).join('') || 'YS'
}

function glyphFor(gig: LandingGig): string {
  const cat = (gig.category ?? '').toLowerCase()
  const title = gig.title.toLowerCase()
  if (/i-?130|i130/.test(title)) return 'I-130'
  if (/i-?485|i485|green card/.test(title)) return 'I-485'
  if (/i-?765|i765|opt/.test(title)) return 'OPT'
  if (/i-?20|f-?1|f1\b/.test(title)) return 'F-1'
  if (/h-?1b|h1b/.test(title)) return 'H-1B'
  if (/ilr\b|spouse/.test(title)) return 'ILR'
  if (/section 21|s21|§21|renters? rights/.test(title)) return '§21'
  if (/express entry|crs/.test(title)) return 'CRS'
  if (/pgwp/.test(title)) return 'PGWP'
  if (/1040|tax|treaty/.test(title)) return '1040'
  if (/lmia/.test(title)) return 'LMIA'
  if (cat.includes('study')) return 'F-1'
  if (cat.includes('work')) return 'OPT'
  if (cat.includes('pr') || cat.includes('residency')) return 'PR'
  if (cat.includes('family')) return '§'
  if (cat.includes('document')) return 'Doc'
  if (cat.includes('tax')) return '1040'
  if (cat.includes('housing') || cat.includes('tenancy') || cat.includes('settlement')) return '§21'
  const firstWord = gig.title.split(' ')[0]
  return firstWord ? firstWord.slice(0, 4) : 'YS'
}

function deliveryLabel(days: number | null): string {
  if (!days || days < 1) return 'Flexible delivery'
  if (days === 1) return 'Same-day'
  if (days === 2) return '48-hour delivery'
  return `${days}-day delivery`
}

function avatarBgFor(provider_type: LandingGig['provider_type']): string {
  return provider_type === 'attorney' ? T.indigo : T.moss
}

function withCountry(href: string, country: Country): string {
  if (country === 'all') return href
  const sep = href.includes('?') ? '&' : '?'
  return `${href}${sep}country=${country}`
}

const POPULAR_CHIPS: Record<Country, Array<{ label: string; q: string }>> = {
  all: [
    { label: 'F-1 visa denial recovery', q: 'F-1 denial' },
    { label: 'I-485 evidence package', q: 'I-485' },
    { label: 'OPT & STEM OPT review', q: 'OPT' },
    { label: 'Spouse visa financial req.', q: 'Spouse' },
    { label: 'Section 21 defence letter', q: 'Section 21' },
    { label: 'PGWP eligibility opinion', q: 'PGWP' },
  ],
  us: [
    { label: 'F-1 visa denial recovery', q: 'F-1 denial' },
    { label: 'I-485 evidence package', q: 'I-485' },
    { label: 'OPT & STEM OPT review', q: 'OPT' },
    { label: 'I-130 spouse petition', q: 'I-130' },
    { label: 'H-1B cap-gap memo', q: 'H-1B' },
    { label: '1040-NR + treaty review', q: '1040-NR' },
  ],
  uk: [
    { label: 'Spouse visa financial req.', q: 'Spouse visa' },
    { label: 'ILR from Spouse Visa', q: 'ILR' },
    { label: 'Skilled Worker COS review', q: 'Skilled Worker' },
    { label: 'Section 21 defence letter', q: 'Section 21' },
    { label: 'Renters Rights Act 2025', q: 'Renters Rights' },
    { label: 'Student & Graduate Route', q: 'Graduate Route' },
  ],
  ca: [
    { label: 'Express Entry CRS audit', q: 'Express Entry' },
    { label: 'PGWP eligibility opinion', q: 'PGWP' },
    { label: 'Study Permit pack', q: 'Study Permit' },
    { label: 'PNP strategy review', q: 'PNP' },
    { label: 'Spousal sponsorship', q: 'Spousal sponsorship' },
    { label: 'LMIA support letter', q: 'LMIA' },
  ],
}

/* ───────────────────────── JSON-LD ─────────────────────────── */

const SERVICE_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'Service',
  name: 'YouSafe Marketplace',
  provider: {
    '@type': 'Organization',
    name: 'YouSafe Consultancy',
    url: 'https://yousafeconsultancy.com',
  },
  serviceType: 'Immigration and Tenancy Legal Marketplace',
  areaServed: [
    { '@type': 'Country', name: 'United States' },
    { '@type': 'Country', name: 'United Kingdom' },
    { '@type': 'Country', name: 'Canada' },
  ],
  hasOfferCatalog: {
    '@type': 'OfferCatalog',
    name: 'Service categories',
    itemListElement: CATEGORIES.slice(0, 8).map((cat) => ({
      '@type': 'Offer',
      itemOffered: { '@type': 'Service', name: cat.name, description: cat.description },
    })),
  },
}

const FAQS = [
  {
    q: 'Is YouSafe a law firm?',
    a:
      'No. YouSafe Consultancy operates a technology platform that connects students and immigrants with independent consultants and licensed attorneys. ' +
      "Legal advice comes from the attorney's own practice, not from YouSafe. The platform handles matching, messaging, file sharing, and escrow.",
  },
  {
    q: 'How do attorneys get vetted?',
    a:
      'Attorneys submit their bar or regulator number, malpractice insurance status, and jurisdiction. YouSafe checks registration against the relevant state or national database. ' +
      "This is a screening step, not an endorsement — verify the attorney's current standing with your local bar association.",
  },
  {
    q: 'How does escrow work?',
    a:
      'When you accept an offer, your payment is held in escrow by the platform. The provider is paid only after you confirm the deliverable meets the agreed brief. ' +
      "If the work isn't delivered as agreed, you can open a dispute through the platform.",
  },
  {
    q: 'What jurisdictions do you cover?',
    a:
      'The marketplace focuses on the United States, the United Kingdom, and Canada. Providers specialise in visas, work permits, permanent residency, family sponsorship, and tenancy law for those three countries.',
  },
]

const FAQ_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQS.map(({ q, a }) => ({
    '@type': 'Question',
    name: q,
    acceptedAnswer: { '@type': 'Answer', text: a },
  })),
}

/* ───────────────────────── CSS ─────────────────────────── */

const CSS = `
.cw-market { color: ${T.ink}; background: ${T.paper}; font-family: ${F.ui}; -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
.cw-market, .cw-market *, .cw-market *::before, .cw-market *::after { box-sizing: border-box; }
.cw-market a { color: inherit; text-decoration: none; }
.cw-market button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; padding: 0; }
.cw-market img, .cw-market svg { display: block; max-width: 100%; }
.cw-market .wrap { width: min(1280px, calc(100vw - 32px)); margin: 0 auto; }
.cw-market .serif { font-family: ${F.display}; }
.cw-market .mono  { font-family: ${F.mono}; }

.cw-market .topbar { border-bottom: 1px solid ${T.rule}; background: rgba(255,254,249,0.85); backdrop-filter: blur(6px); font-size: 12px; color: ${T.inkMid}; }
.cw-market .topbar-inner { display: flex; align-items: center; justify-content: space-between; height: 32px; }
.cw-market .topbar-left { display: flex; gap: 22px; align-items: center; }
.cw-market .topbar-left .mono { letter-spacing: 0.08em; text-transform: uppercase; font-size: 11px; }
.cw-market .topbar-right { display: flex; gap: 18px; align-items: center; }
.cw-market .pill-mini { display: inline-flex; align-items: center; gap: 6px; padding: 3px 9px; border-radius: 999px; background: ${T.paper2}; border: 1px solid ${T.rule}; font-size: 11px; font-weight: 600; color: ${T.inkMid}; }
.cw-market .pill-mini::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: ${T.moss}; box-shadow: 0 0 0 3px rgba(95,107,58,0.18); }

.cw-market header.nav { position: sticky; top: 0; z-index: 50; background: rgba(251,250,247,0.92); backdrop-filter: blur(10px); border-bottom: 1px solid ${T.rule}; }
.cw-market .nav-inner { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 24px; height: 60px; }
.cw-market .brand { display: inline-flex; align-items: center; gap: 12px; }
.cw-market .brand-mark { width: 38px; height: 38px; border-radius: 8px; background: ${T.indigo}; color: #fff; display: inline-grid; place-items: center; font-family: ${F.display}; font-size: 22px; font-weight: 600; box-shadow: 0 10px 22px -10px rgba(60,59,110,0.55); position: relative; overflow: hidden; }
.cw-market .brand-mark::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: linear-gradient(90deg, ${T.indigo} 0 42%, #fff 42% 58%, ${T.brick} 58% 100%); }
.cw-market .brand-name { line-height: 1.1; }
.cw-market .brand-name b { display: block; font-family: ${F.display}; font-weight: 600; font-size: 20px; letter-spacing: -0.01em; }
.cw-market .brand-name span { display: block; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: ${T.inkSoft}; margin-top: 2px; font-weight: 600; }

.cw-market .nav-search { display: flex; align-items: center; background: ${T.vellum}; border: 1px solid ${T.rule}; border-radius: 999px; height: 40px; padding: 0 6px 0 16px; gap: 10px; transition: border-color .15s, box-shadow .15s; }
.cw-market .nav-search:focus-within { border-color: ${T.ink}; box-shadow: 0 0 0 4px rgba(29,36,51,0.06); }
.cw-market .nav-search svg { color: ${T.inkSoft}; flex: 0 0 18px; }
.cw-market .nav-search input { flex: 1; height: 100%; border: 0; background: transparent; font: inherit; font-size: 14px; color: ${T.ink}; outline: none; }
.cw-market .nav-search input::placeholder { color: ${T.inkSoft}; }
.cw-market .nav-search button.go { height: 32px; padding: 0 14px; border-radius: 999px; background: ${T.ink}; color: #fff; font-size: 12.5px; font-weight: 600; letter-spacing: 0.01em; }
.cw-market nav.nav-links { display: flex; align-items: center; gap: 6px; }
.cw-market nav.nav-links a { padding: 8px 12px; font-size: 14px; font-weight: 500; color: ${T.inkMid}; border-radius: 8px; }
.cw-market nav.nav-links a:hover { color: ${T.ink}; background: ${T.paper2}; }
.cw-market nav.nav-links a.cta { margin-left: 4px; padding: 10px 18px; background: ${T.indigo}; color: #fff; border-radius: 999px; font-weight: 600; }
.cw-market nav.nav-links a.cta:hover { background: ${T.indigoDeep}; }

.cw-market .country-bar { border-bottom: 1px solid ${T.rule}; background: ${T.vellum}; }
.cw-market .country-bar-inner { display: flex; align-items: center; gap: 8px; padding: 8px 0; flex-wrap: wrap; }
.cw-market .country-bar .label { font-family: ${F.mono}; font-size: 10.5px; letter-spacing: 0.12em; text-transform: uppercase; color: ${T.inkSoft}; margin-right: 4px; }
.cw-market .country-bar a { padding: 6px 14px; border: 1px solid ${T.rule}; background: ${T.paper}; border-radius: 999px; font-size: 13px; font-weight: 500; color: ${T.inkMid}; transition: all .12s; cursor: pointer; }
.cw-market .country-bar a:hover { color: ${T.ink}; border-color: ${T.inkMid}; }
.cw-market .country-bar a.active { background: ${T.ink}; color: #fff; border-color: ${T.ink}; font-weight: 600; }
.cw-market .country-bar .divider { height: 18px; width: 1px; background: ${T.rule}; margin: 0 6px; }

.cw-cat-trigger { display: inline-flex; align-items: center; gap: 7px; padding: 7px 14px; border: 1px solid ${T.rule}; background: ${T.paper}; border-radius: 999px; font-size: 13px; font-weight: 600; color: ${T.ink}; font-family: ${F.ui}; transition: all .12s; }
.cw-cat-trigger:hover { background: ${T.ink}; color: #fff; border-color: ${T.ink}; }
.cw-cat-panel { position: absolute; top: calc(100% + 8px); left: 0; z-index: 60; display: grid; grid-template-columns: 240px 380px; background: ${T.vellum}; border: 1px solid ${T.rule}; border-radius: 14px; box-shadow: 0 30px 60px -20px rgba(29,36,51,0.25); overflow: hidden; min-width: 620px; max-width: calc(100vw - 32px); }
@media (max-width: 720px) { .cw-cat-panel { grid-template-columns: 1fr; min-width: min(360px, calc(100vw - 32px)); } .cw-cat-detail { display: none; } }
.cw-cat-list { list-style: none; margin: 0; padding: 10px 0; border-right: 1px solid ${T.ruleSoft}; background: ${T.paper}; max-height: 440px; overflow-y: auto; }
.cw-cat-list li a { display: grid; grid-template-columns: 22px 1fr auto auto; gap: 10px; align-items: center; padding: 9px 16px; font-size: 13.5px; color: ${T.ink}; }
.cw-cat-list li a:hover, .cw-cat-list li a.is-focus { background: ${T.paper2}; }
.cw-cat-icon { font-size: 14px; line-height: 1; }
.cw-cat-name { font-weight: 500; }
.cw-cat-count { font-family: ${F.mono}; font-size: 10.5px; color: ${T.inkSoft}; letter-spacing: 0.04em; }
.cw-cat-arrow { color: ${T.inkSoft}; }
.cw-cat-detail { padding: 22px 24px; background: ${T.vellum}; display: flex; flex-direction: column; gap: 12px; max-height: 440px; overflow-y: auto; }
.cw-cat-detail-eyebrow { font-family: ${F.display}; font-size: 19px; font-weight: 500; letter-spacing: -0.01em; color: ${T.ink}; }
.cw-cat-detail-desc { margin: 0; font-size: 13px; line-height: 1.5; color: ${T.inkMid}; }
.cw-cat-sublist { list-style: none; margin: 0; padding: 8px 0 4px; display: grid; grid-template-columns: 1fr 1fr; gap: 4px 18px; }
.cw-cat-sublist a { font-size: 13px; color: ${T.inkMid}; padding: 4px 0; display: block; border-bottom: 1px dashed transparent; }
.cw-cat-sublist a:hover { color: ${T.ink}; border-bottom-color: ${T.rule}; }
.cw-cat-detail-cta { margin-top: auto; padding-top: 10px; font-family: ${F.mono}; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: ${T.indigo}; border-top: 1px solid ${T.ruleSoft}; }
.cw-cat-detail-cta:hover { color: ${T.indigoDeep}; }

.cw-market .hero { padding: 24px 0 28px; border-bottom: 1px solid ${T.rule}; }
.cw-market .hero-grid { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 28px; align-items: center; }
@keyframes slideFadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
.cw-market .hero-eyebrow { display: inline-flex; align-items: center; gap: 10px; font-family: ${F.mono}; font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: ${T.inkMid}; }
.cw-market .flagbar { width: 28px; height: 8px; background: linear-gradient(90deg, ${T.indigo} 0 33.3%, #fff 33.3% 66.6%, ${T.brick} 66.6% 100%); border: 1px solid ${T.rule}; }
.cw-market .flagbar.uk { background: linear-gradient(90deg, #012169 0 33%, #fff 33% 66%, #C8102E 66% 100%); }
.cw-market .flagbar.ca { background: linear-gradient(90deg, #C8102E 0 28%, #fff 28% 72%, #C8102E 72% 100%); }
.cw-market .hero h1 { font-family: ${F.display}; font-size: clamp(32px, 4.2vw, 52px); line-height: 1.04; letter-spacing: -0.02em; font-weight: 500; margin: 12px 0 12px; color: ${T.ink}; text-wrap: balance; }
.cw-market .hero h1 em { font-style: italic; font-weight: 500; color: ${T.indigo}; }
.cw-market .hero p.lede { max-width: 52ch; font-size: 15px; line-height: 1.55; color: ${T.inkMid}; margin: 0 0 20px; }
.cw-market .hero-search { display: flex; align-items: center; background: ${T.vellum}; border: 1px solid ${T.ink}; border-radius: 12px; padding: 6px 6px 6px 18px; gap: 12px; box-shadow: 0 1px 0 rgba(29,36,51,0.05), 0 20px 40px -28px rgba(29,36,51,0.22); }
.cw-market .hero-search svg { color: ${T.ink}; flex: 0 0 20px; }
.cw-market .hero-search input { flex: 1; border: 0; background: transparent; outline: none; font: inherit; font-size: 15px; height: 44px; color: ${T.ink}; min-width: 0; }
.cw-market .hero-search input::placeholder { color: ${T.inkSoft}; }
.cw-market .hero-search .pick { display: inline-flex; align-items: center; gap: 8px; padding: 0 12px; height: 44px; border-left: 1px dashed ${T.rule}; color: ${T.inkMid}; font-size: 12.5px; }
.cw-market .hero-search .pick b { color: ${T.ink}; font-weight: 600; }
.cw-market .hero-search button.search-go { height: 44px; padding: 0 22px; background: ${T.ink}; color: #fff; border-radius: 8px; font-weight: 600; font-size: 13.5px; letter-spacing: 0.01em; }
.cw-market .hero-search button.search-go:hover { background: #000; }
.cw-market .suggest { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; font-size: 12px; }
.cw-market .suggest span.lbl { font-family: ${F.mono}; color: ${T.inkSoft}; letter-spacing: 0.08em; text-transform: uppercase; font-size: 10.5px; padding-top: 6px; margin-right: 4px; }
.cw-market .suggest a { display: inline-flex; align-items: center; padding: 5px 11px; background: ${T.paper2}; border: 1px solid ${T.rule}; border-radius: 999px; color: ${T.inkMid}; font-weight: 500; }
.cw-market .suggest a:hover { background: ${T.paper3}; color: ${T.ink}; }

.cw-market .hero-card { position: relative; background: ${T.vellum}; border: 1px solid ${T.rule}; border-radius: 14px; padding: 20px 22px 18px; box-shadow: 0 1px 0 rgba(29,36,51,0.05), 0 22px 44px -28px rgba(29,36,51,0.22); transform: rotate(0.5deg); }
.cw-market .hero-card-link:hover .hero-card { transform: rotate(0) translateY(-2px); }
.cw-market .hero-card::before { content: ""; position: absolute; left: 22px; right: 22px; top: 0; height: 5px; background: linear-gradient(90deg, ${T.indigo} 0 33.3%, #fff 33.3% 66.6%, ${T.brick} 66.6% 100%); border-radius: 0 0 3px 3px; }
.cw-market .hero-card[data-c="uk"]::before { background: linear-gradient(90deg, #012169 0 33%, #fff 33% 66%, #C8102E 66% 100%); }
.cw-market .hero-card[data-c="ca"]::before { background: linear-gradient(90deg, #C8102E 0 28%, #fff 28% 72%, #C8102E 72% 100%); }
.cw-market .hero-card .file-meta { display: flex; justify-content: space-between; font-family: ${F.mono}; font-size: 10.5px; letter-spacing: 0.12em; text-transform: uppercase; color: ${T.inkSoft}; margin-top: 6px; }
.cw-market .hero-card h3 { font-family: ${F.display}; font-weight: 500; font-size: 18px; line-height: 1.3; letter-spacing: -0.01em; margin: 10px 0 12px; color: ${T.ink}; }
.cw-market .hero-card h3 em { color: ${T.indigo}; font-style: italic; }
.cw-market .hero-card .attorney { display: flex; gap: 10px; align-items: center; padding: 8px 0; border-top: 1px solid ${T.ruleSoft}; }
.cw-market .hero-card .avatar { width: 36px; height: 36px; border-radius: 50%; color: #fff; display: grid; place-items: center; font-family: ${F.display}; font-weight: 600; font-size: 14px; flex: 0 0 36px; }
.cw-market .hero-card .attorney-name { line-height: 1.2; flex: 1; }
.cw-market .hero-card .attorney-name b { font-size: 14px; font-weight: 600; }
.cw-market .hero-card .attorney-name span { display: block; font-size: 12px; color: ${T.inkSoft}; margin-top: 2px; }
.cw-market .stars { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 600; }
.cw-market .stars svg { color: ${T.star}; width: 14px; height: 14px; }
.cw-market .stars span.rev { color: ${T.inkSoft}; font-weight: 500; margin-left: 2px; }
.cw-market .hero-card .tiers { margin-top: 2px; border-top: 1px solid ${T.ruleSoft}; padding-top: 10px; }
.cw-market .hero-card .tier-row { display: grid; grid-template-columns: auto 1fr auto; align-items: baseline; gap: 10px; padding: 5px 0; font-size: 12.5px; border-bottom: 1px dotted ${T.rule}; }
.cw-market .hero-card .tier-row:last-child { border: 0; padding-bottom: 0; }
.cw-market .hero-card .tier-row .lbl { font-family: ${F.mono}; font-size: 10.5px; letter-spacing: 0.12em; text-transform: uppercase; color: ${T.inkSoft}; width: 70px; }
.cw-market .hero-card .tier-row .name { color: ${T.inkMid}; }
.cw-market .hero-card .tier-row .price { font-family: ${F.display}; font-weight: 600; font-size: 16px; color: ${T.ink}; }
.cw-market .hero-card .stamp { position: absolute; right: -14px; top: 32px; transform: rotate(8deg); padding: 6px 12px; border: 2px solid ${T.brick}; color: ${T.brick}; font-family: ${F.mono}; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; background: rgba(178,34,52,0.05); border-radius: 3px; }
.cw-market .hero-empty { background: ${T.vellum}; border: 1px dashed ${T.rule}; border-radius: 18px; padding: 48px 32px; text-align: center; color: ${T.inkSoft}; font-family: ${F.display}; font-style: italic; font-size: 18px; line-height: 1.5; }

.cw-market .trust { padding: 12px 0; border-bottom: 1px solid ${T.rule}; font-family: ${F.mono}; font-size: 10.5px; letter-spacing: 0.12em; text-transform: uppercase; color: ${T.inkSoft}; }
.cw-market .trust-inner { display: flex; align-items: center; gap: 28px; flex-wrap: wrap; justify-content: space-between; }
.cw-market .trust-inner .label { color: ${T.inkMid}; font-weight: 600; }
.cw-market .trust-inner .item { display: inline-flex; align-items: center; gap: 8px; }
.cw-market .trust-inner .item .dot { width: 5px; height: 5px; border-radius: 50%; background: ${T.inkMid}; }

.cw-market .section-head { display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 16px; gap: 24px; }
.cw-market .section-head h2 { font-family: ${F.display}; font-weight: 500; font-size: clamp(22px, 2.6vw, 30px); line-height: 1.15; letter-spacing: -0.014em; margin: 0; color: ${T.ink}; max-width: 24ch; }
.cw-market .section-head h2 em { font-style: italic; color: ${T.indigo}; }
.cw-market .section-head .meta { display: flex; flex-direction: column; gap: 6px; font-family: ${F.mono}; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: ${T.inkSoft}; text-align: right; }
.cw-market .section-head .meta a { color: ${T.ink}; border-bottom: 1px solid ${T.ink}; padding-bottom: 1px; }
.cw-market .section-head .meta a:hover { color: ${T.indigo}; border-color: ${T.indigo}; }

.cw-market .featured { padding: 28px 0 28px; border-top: 1px solid ${T.rule}; }
.cw-market .filters { display: flex; gap: 6px; flex-wrap: wrap; margin: 0 0 16px; }
.cw-market .filters a { padding: 5px 12px; border: 1px solid ${T.rule}; background: ${T.vellum}; border-radius: 999px; font-size: 12px; font-weight: 500; color: ${T.inkMid}; transition: all .15s; }
.cw-market .filters a:hover { color: ${T.ink}; border-color: ${T.inkMid}; }
.cw-market .filters a.on { background: ${T.ink}; color: #fff; border-color: ${T.ink}; }
.cw-market .filters a .ct { font-family: ${F.mono}; font-size: 10.5px; margin-left: 6px; color: currentColor; opacity: 0.7; }
.cw-market .gig-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 16px; }
@media (max-width: 1400px) { .cw-market .gig-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
@media (max-width: 1180px) { .cw-market .gig-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 900px)  { .cw-market .gig-grid { grid-template-columns: repeat(2, 1fr); } .cw-market .hero-grid { grid-template-columns: 1fr; } }
@media (max-width: 700px) {
  .cw-market .gig-grid { grid-template-columns: 1fr; }
  .cw-market .nav-search { display: none; }
  /* Hero search becomes a stack so it fits a phone width without overflow.
     The button and jurisdiction picker get their own row under the input. */
  .cw-market .hero-search { flex-wrap: wrap; padding: 8px; gap: 8px; border-radius: 14px; }
  .cw-market .hero-search > svg { display: none; }
  .cw-market .hero-search input { flex-basis: 100%; min-width: 0; height: 40px; font-size: 14px; padding: 0 6px; }
  .cw-market .hero-search .pick { border-left: 0; padding: 0 6px; height: 36px; font-size: 12px; flex: 1 1 auto; }
  .cw-market .hero-search button.search-go { height: 36px; padding: 0 16px; font-size: 12.5px; flex: 0 0 auto; }
  .cw-market .hero h1 { font-size: clamp(28px, 9vw, 38px); }
  .cw-market .hero p.lede { font-size: 14px; }
  /* Topbar (announcements row) becomes more compact and wraps. */
  .cw-market .topbar-inner { flex-wrap: wrap; gap: 6px 12px; height: auto; padding: 6px 0; }
  .cw-market .topbar-left, .cw-market .topbar-right { gap: 10px; }
  /* Country-bar's pills already wrap; just trim padding so they fit. */
  .cw-market .country-bar a { padding: 5px 10px; font-size: 12px; }
  /* Trust strip wraps cleanly on mobile already; tighten spacing. */
  .cw-market .trust-inner { gap: 10px 18px; }
  /* Section heads stack vertically so meta doesn't crash into the title. */
  .cw-market .section-head { flex-direction: column; align-items: flex-start; gap: 8px; }
  .cw-market .section-head .meta { text-align: left; }
  /* Filters wrap (they already do via flex-wrap) — just verify spacing. */
  .cw-market .filters { gap: 4px; }
  /* Suggest chips shrink. */
  .cw-market .suggest { gap: 4px; }
  .cw-market .suggest a { padding: 4px 9px; font-size: 11.5px; }
}

.cw-market .gig { background: ${T.vellum}; border: 1px solid ${T.rule}; border-radius: 14px; overflow: hidden; display: flex; flex-direction: column; transition: transform .25s, box-shadow .25s, border-color .25s; }
.cw-market .gig:hover { transform: translateY(-3px); box-shadow: 0 1px 0 rgba(29,36,51,0.04), 0 18px 38px -28px rgba(29,36,51,0.22); border-color: ${T.ink}; }
.cw-market .gig .plate { position: relative; aspect-ratio: 16/7; background: ${T.paper2}; border-bottom: 1px solid ${T.rule}; overflow: hidden; }
.cw-market .gig .plate::before { content: ""; position: absolute; inset: 0; background: repeating-linear-gradient(135deg, rgba(29,36,51,0.04) 0 14px, transparent 14px 32px), radial-gradient(ellipse at 30% 20%, rgba(60,59,110,0.10), transparent 55%), linear-gradient(180deg, ${T.paper2}, ${T.paper3}); }
.cw-market .gig .plate::after { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 4px; background: linear-gradient(90deg, ${T.indigo} 0 42%, #fff 42% 58%, ${T.brick} 58% 100%); }
.cw-market .gig[data-c="uk"] .plate::after { background: linear-gradient(90deg, #012169 0 33%, #fff 33% 66%, #C8102E 66% 100%); }
.cw-market .gig[data-c="ca"] .plate::after { background: linear-gradient(90deg, #C8102E 0 28%, #fff 28% 72%, #C8102E 72% 100%); }
.cw-market .gig .plate-tag { position: absolute; left: 14px; bottom: 12px; padding: 4px 9px; background: rgba(29,36,51,0.85); color: #fff; font-family: ${F.mono}; font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; border-radius: 3px; }
.cw-market .gig .plate-glyph { position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%); text-align: center; font-family: ${F.display}; font-style: italic; font-size: 56px; color: rgba(60,59,110,0.18); letter-spacing: -0.02em; font-weight: 500; pointer-events: none; }
.cw-market .gig .plate-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
.cw-market .gig .plate.has-cover { background: ${T.ink}; }
.cw-market .gig .plate.has-cover::before { content: none; }
.cw-market .gig .plate.has-cover .plate-tag { background: rgba(15,23,42,0.78); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); }
.cw-market .gig .body { padding: 12px 14px 12px; display: flex; flex-direction: column; gap: 8px; flex: 1; }
.cw-market .gig .seller { display: flex; align-items: center; gap: 10px; }
.cw-market .gig .seller .av { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font-family: ${F.display}; font-weight: 600; font-size: 13px; color: #fff; flex: 0 0 30px; }
.cw-market .gig .seller .info { line-height: 1.15; }
.cw-market .gig .seller .info b { font-size: 13px; font-weight: 600; color: ${T.ink}; }
.cw-market .gig .seller .info span { display: block; margin-top: 2px; font-family: ${F.mono}; font-size: 10.5px; color: ${T.inkSoft}; letter-spacing: 0.06em; text-transform: uppercase; }
.cw-market .gig .seller .pro { margin-left: auto; padding: 2px 8px; border-radius: 4px; background: rgba(196,164,90,0.18); color: #6c5314; border: 1px solid rgba(196,164,90,0.4); font-family: ${F.mono}; font-size: 9.5px; letter-spacing: 0.16em; text-transform: uppercase; font-weight: 600; }
.cw-market .gig h4 { font-family: ${F.display}; font-weight: 500; font-size: 15px; line-height: 1.3; letter-spacing: -0.005em; margin: 0; color: ${T.ink}; text-wrap: balance; }
.cw-market .gig h4 a:hover { color: ${T.indigo}; }
.cw-market .gig .gig-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: auto; padding-top: 10px; border-top: 1px solid ${T.ruleSoft}; }
.cw-market .gig .price { text-align: right; }
.cw-market .gig .price .from { font-family: ${F.mono}; font-size: 9.5px; letter-spacing: 0.14em; text-transform: uppercase; color: ${T.inkSoft}; }
.cw-market .gig .price b { display: block; font-family: ${F.display}; font-weight: 600; font-size: 18px; color: ${T.ink}; line-height: 1; margin-top: 1px; }
.cw-market .gig .delivery { font-family: ${F.mono}; font-size: 11px; color: ${T.inkSoft}; letter-spacing: .1em; text-transform: uppercase; }

.cw-market .how { padding: 28px 0; border-top: 1px solid ${T.rule}; background: linear-gradient(180deg, ${T.paper} 0%, ${T.paper2} 100%); }
.cw-market .how-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; border: 1px solid ${T.rule}; border-radius: 14px; background: ${T.vellum}; overflow: hidden; }
@media (max-width: 800px) { .cw-market .how-grid { grid-template-columns: 1fr; } }
.cw-market .how-step { padding: 20px 22px; border-right: 1px solid ${T.rule}; position: relative; }
.cw-market .how-step:last-child { border-right: 0; }
@media (max-width: 800px) { .cw-market .how-step { border-right: 0; border-bottom: 1px solid ${T.rule}; } .cw-market .how-step:last-child { border-bottom: 0; } }
.cw-market .how-step .step-num { font-family: ${F.mono}; font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: ${T.inkSoft}; display: flex; align-items: center; gap: 10px; }
.cw-market .how-step .step-num::before { content: ""; width: 22px; height: 1px; background: ${T.inkMid}; }
.cw-market .how-step h3 { font-family: ${F.display}; font-weight: 500; font-size: 19px; line-height: 1.25; letter-spacing: -0.01em; margin: 8px 0 6px; color: ${T.ink}; }
.cw-market .how-step h3 em { font-style: italic; color: ${T.indigo}; }
.cw-market .how-step p { margin: 0; font-size: 13px; line-height: 1.55; color: ${T.inkMid}; }
.cw-market .how-step .icon { position: absolute; top: 18px; right: 20px; font-family: ${F.display}; font-style: italic; font-size: 36px; color: ${T.paper3}; line-height: 1; }

.cw-market .quotes { padding: 28px 0; border-top: 1px solid ${T.rule}; }
.cw-market .quotes-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
@media (max-width: 900px) { .cw-market .quotes-grid { grid-template-columns: 1fr; gap: 28px; } }
.cw-market .quote { border-top: 2px solid ${T.ink}; padding-top: 14px; }
.cw-market .quote .stars { margin-bottom: 10px; }
.cw-market .quote blockquote { margin: 0 0 12px; font-family: ${F.display}; font-size: 16px; line-height: 1.45; color: ${T.ink}; letter-spacing: -0.005em; text-wrap: pretty; }
.cw-market .quote blockquote em { color: ${T.indigo}; font-style: italic; }
.cw-market .quote cite { display: flex; align-items: center; gap: 10px; font-style: normal; font-size: 13px; color: ${T.inkMid}; }
.cw-market .quote cite b { color: ${T.ink}; font-weight: 600; }
.cw-market .quote cite .av { width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #c3b69a, #826f4a); color: #fff; display: grid; place-items: center; font-family: ${F.display}; font-weight: 600; }

.cw-market .seller-cta { padding: 28px 0 32px; border-top: 1px solid ${T.rule}; }
.cw-market .seller-card { position: relative; overflow: hidden; border-radius: 14px; background: ${T.indigo}; color: #fff; padding: 32px 36px; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 28px; align-items: center; box-shadow: 0 1px 0 rgba(29,36,51,0.05), 0 24px 48px -28px rgba(29,36,51,0.22); }
@media (max-width: 800px) { .cw-market .seller-card { grid-template-columns: 1fr; padding: 24px 22px; } }
.cw-market .seller-card::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 4px; background: linear-gradient(90deg, ${T.indigo} 0 42%, #fff 42% 58%, ${T.brick} 58% 100%); }
.cw-market .seller-card::after { content: "§"; position: absolute; right: 32px; bottom: -50px; font-family: ${F.display}; font-style: italic; font-weight: 500; font-size: 240px; color: rgba(255,255,255,0.05); pointer-events: none; line-height: 1; }
.cw-market .seller-card .mono-eyebrow { font-family: ${F.mono}; font-size: 10.5px; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(255,255,255,0.7); }
.cw-market .seller-card h2 { font-family: ${F.display}; font-weight: 500; font-size: clamp(22px, 2.8vw, 32px); line-height: 1.1; letter-spacing: -0.014em; margin: 8px 0 10px; color: #fff; max-width: 20ch; }
.cw-market .seller-card h2 em { font-style: italic; color: #FFE9A3; }
.cw-market .seller-card p { margin: 0 0 14px; max-width: 56ch; font-size: 13.5px; line-height: 1.55; color: rgba(255,255,255,0.78); }
.cw-market .seller-card .actions { display: flex; gap: 8px; flex-wrap: wrap; }
.cw-market .seller-card .btn { display: inline-flex; align-items: center; gap: 8px; height: 38px; padding: 0 18px; border-radius: 999px; font-weight: 600; font-size: 13px; transition: transform .12s, background .12s; }
.cw-market .seller-card .btn.primary { background: #fff; color: ${T.indigo}; }
.cw-market .seller-card .btn.primary:hover { transform: translateY(-1px); }
.cw-market .seller-card .btn.ghost { border: 1px solid rgba(255,255,255,0.4); color: #fff; }
.cw-market .seller-card .btn.ghost:hover { background: rgba(255,255,255,0.08); }
.cw-market .seller-card .stats { display: grid; grid-template-columns: 1fr; gap: 14px; padding: 0 4px; position: relative; z-index: 1; }
.cw-market .seller-card .stat { border-left: 2px solid rgba(255,255,255,0.3); padding-left: 12px; }
.cw-market .seller-card .stat b { display: block; font-family: ${F.display}; font-weight: 500; font-size: 22px; line-height: 1; color: #fff; letter-spacing: -0.01em; }
.cw-market .seller-card .stat span { display: block; margin-top: 4px; font-family: ${F.mono}; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(255,255,255,0.72); }

.cw-market .hero-card-link { display: block; transition: transform .25s ease; }
.cw-market .hero-fallback-hint { margin-top: 10px; padding: 8px 10px; background: ${T.paper2}; border: 1px dashed ${T.rule}; border-radius: 8px; font-family: ${F.mono}; font-size: 10.5px; letter-spacing: 0.06em; color: ${T.inkMid}; text-transform: none; }
.cw-market .hero-fallback-hint b { color: ${T.ink}; }

.cw-market .quotes-empty { margin: 0; padding: 18px 22px; background: ${T.vellum}; border: 1px dashed ${T.rule}; border-radius: 12px; font-family: ${F.display}; font-style: italic; font-size: 15px; line-height: 1.5; color: ${T.inkMid}; }
.cw-market .quotes-empty a { color: ${T.indigo}; text-decoration: none; }

.cw-market .payments { padding: 24px 0; background: ${T.paper}; border-top: 1px solid ${T.rule}; border-bottom: 1px solid ${T.rule}; }
.cw-market .payments-inner { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; align-items: center; }
@media (max-width: 760px) { .cw-market .payments-inner { grid-template-columns: 1fr; gap: 16px; } }
.cw-market .payments-label { font-family: ${F.mono}; font-size: 10.5px; letter-spacing: 0.14em; text-transform: uppercase; color: ${T.inkSoft}; margin-bottom: 10px; }
.cw-market .payments-rail { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.cw-market .paymark { display: inline-flex; align-items: center; justify-content: center; height: 28px; min-width: 50px; padding: 0 10px; border: 1px solid ${T.rule}; background: ${T.vellum}; border-radius: 6px; font-family: ${F.ui}; font-weight: 700; font-size: 11px; letter-spacing: 0.06em; color: ${T.ink}; }
.cw-market .paymark.visa { color: #1A1F71; letter-spacing: 0.14em; }
.cw-market .paymark.mc { gap: 0; position: relative; padding: 0 18px; }
.cw-market .paymark.mc .mc-c1, .cw-market .paymark.mc .mc-c2 { width: 16px; height: 16px; border-radius: 50%; }
.cw-market .paymark.mc .mc-c1 { background: #EB001B; }
.cw-market .paymark.mc .mc-c2 { background: #F79E1B; margin-left: -6px; mix-blend-mode: multiply; }
.cw-market .paymark.amex { color: #2E77BC; letter-spacing: 0.14em; }
.cw-market .paymark.disc { color: #FF6000; letter-spacing: 0.1em; font-size: 9.5px; }
.cw-market .paymark.apple { color: ${T.ink}; gap: 4px; }
.cw-market .paymark.google { color: ${T.ink}; gap: 4px; font-weight: 500; }
.cw-market .payments-trust { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; color: ${T.inkMid}; }
.cw-market .payments-trust li { display: flex; align-items: center; gap: 8px; }

.cw-market .faq-section { padding: 28px 0 32px; border-top: 1px solid ${T.rule}; }
.cw-market .faq-grid { display: grid; gap: 8px; max-width: 820px; }
.cw-market .faq-item { background: ${T.vellum}; border: 1px solid ${T.rule}; border-radius: 10px; padding: 10px 16px; transition: border-color .12s, box-shadow .12s; }
.cw-market .faq-item:hover, .cw-market .faq-item.is-open { border-color: ${T.ink}; box-shadow: 0 4px 14px -8px rgba(29,36,51,0.18); }
.cw-market .faq-summary { width: 100%; display: flex; align-items: baseline; justify-content: space-between; gap: 16px; padding: 0; background: none; border: 0; cursor: pointer; text-align: left; font-family: ${F.display}; font-size: 15px; font-weight: 500; color: ${T.ink}; }
.cw-market .faq-sym { font-family: ${F.ui}; font-size: 18px; color: ${T.inkSoft}; font-weight: 300; line-height: 1; flex-shrink: 0; }
.cw-market .faq-body { color: ${T.inkMid}; font-size: 13px; line-height: 1.55; margin: 8px 0 0; }

.cw-all-trigger { background: none; border: 0; padding: 0; cursor: pointer; color: ${T.ink}; border-bottom: 1px solid ${T.ink}; font: inherit; font-family: ${F.mono}; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; }
.cw-all-trigger:hover { color: ${T.indigo}; border-bottom-color: ${T.indigo}; }
.cw-all-overlay { position: fixed; inset: 0; z-index: 200; font-family: ${F.ui}; }
.cw-all-backdrop { position: absolute; inset: 0; background: rgba(15, 19, 30, 0.45); backdrop-filter: blur(2px); }
.cw-all-drawer { position: absolute; top: 0; right: 0; bottom: 0; width: min(1100px, 100vw); background: ${T.paper}; box-shadow: -24px 0 60px -20px rgba(29,36,51,0.35); display: flex; flex-direction: column; animation: cw-drawer-in .2s ease-out; }
@keyframes cw-drawer-in { from { transform: translateX(40px); opacity: 0.5; } to { transform: translateX(0); opacity: 1; } }
.cw-all-head { display: flex; align-items: flex-start; justify-content: space-between; padding: 18px 22px 14px; border-bottom: 1px solid ${T.rule}; gap: 16px; }
.cw-all-eyebrow { font-family: ${F.mono}; font-size: 10.5px; letter-spacing: 0.14em; text-transform: uppercase; color: ${T.inkSoft}; }
.cw-all-title { margin: 4px 0 0; font-family: ${F.display}; font-size: 22px; font-weight: 500; color: ${T.ink}; letter-spacing: -0.012em; }
.cw-all-close { width: 36px; height: 36px; border-radius: 999px; border: 1px solid ${T.rule}; background: ${T.vellum}; color: ${T.ink}; font-size: 20px; cursor: pointer; display: grid; place-items: center; }
.cw-all-close:hover { background: ${T.ink}; color: #fff; border-color: ${T.ink}; }
.cw-all-body { flex: 1; min-height: 0; display: grid; grid-template-columns: 260px 1fr; }
@media (max-width: 760px) { .cw-all-body { grid-template-columns: 1fr; } .cw-all-side { border-right: 0 !important; border-bottom: 1px solid ${T.rule}; } }
.cw-all-side { border-right: 1px solid ${T.rule}; background: ${T.paper2}; padding: 16px 18px; overflow-y: auto; }
.cw-all-filterblock { margin-bottom: 18px; }
.cw-all-filter-label { font-family: ${F.mono}; font-size: 10.5px; letter-spacing: 0.14em; text-transform: uppercase; color: ${T.inkSoft}; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between; }
.cw-all-bulk { display: inline-flex; gap: 6px; align-items: center; font-family: ${F.ui}; font-size: 11px; letter-spacing: 0; text-transform: none; }
.cw-all-bulk button { background: none; border: 0; padding: 0; cursor: pointer; color: ${T.indigo}; font-size: 11px; }
.cw-all-bulk button:disabled { color: ${T.inkSoft}; cursor: default; }
.cw-all-jx { display: flex; gap: 6px; flex-wrap: wrap; }
.cw-all-jx button { padding: 5px 12px; border: 1px solid ${T.rule}; background: ${T.vellum}; border-radius: 999px; font-size: 12px; color: ${T.inkMid}; cursor: pointer; }
.cw-all-jx button.on { background: ${T.ink}; color: #fff; border-color: ${T.ink}; }
.cw-all-cats { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.cw-all-cats label { display: flex; align-items: center; gap: 8px; padding: 4px 6px; border-radius: 6px; font-size: 13px; color: ${T.ink}; cursor: pointer; }
.cw-all-cats label:hover { background: ${T.vellum}; }
.cw-all-cats input { width: 14px; height: 14px; accent-color: ${T.ink}; }
.cw-all-cat-icon { font-size: 12px; line-height: 1; }
.cw-all-sort { width: 100%; height: 34px; padding: 0 10px; border: 1px solid ${T.rule}; background: ${T.vellum}; border-radius: 8px; font-family: ${F.ui}; font-size: 13px; color: ${T.ink}; }
.cw-all-results { padding: 16px 22px 22px; overflow-y: auto; }
.cw-all-count { font-family: ${F.mono}; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: ${T.inkSoft}; margin-bottom: 12px; }
.cw-all-empty { padding: 28px; background: ${T.vellum}; border: 1px dashed ${T.rule}; border-radius: 12px; font-family: ${F.display}; font-style: italic; color: ${T.inkMid}; text-align: center; }
.cw-all-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
.cw-all-card { display: block; background: ${T.vellum}; border: 1px solid ${T.rule}; border-radius: 12px; overflow: hidden; text-decoration: none; color: inherit; transition: transform .15s, border-color .15s, box-shadow .15s; }
.cw-all-card:hover { transform: translateY(-2px); border-color: ${T.ink}; box-shadow: 0 12px 24px -16px rgba(29,36,51,0.2); }
.cw-all-card-plate { position: relative; aspect-ratio: 16/6; background: ${T.paper2}; border-bottom: 1px solid ${T.rule}; }
.cw-all-card-plate::before { content: ""; position: absolute; inset: 0; background: repeating-linear-gradient(135deg, rgba(29,36,51,0.04) 0 14px, transparent 14px 32px), linear-gradient(180deg, ${T.paper2}, ${T.paper3}); }
.cw-all-card-plate::after { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 3px; background: linear-gradient(90deg, ${T.indigo} 0 42%, #fff 42% 58%, ${T.brick} 58% 100%); }
.cw-all-card-plate[data-c="uk"]::after { background: linear-gradient(90deg, #012169 0 33%, #fff 33% 66%, #C8102E 66% 100%); }
.cw-all-card-plate[data-c="ca"]::after { background: linear-gradient(90deg, #C8102E 0 28%, #fff 28% 72%, #C8102E 72% 100%); }
.cw-all-card-tag { position: absolute; left: 10px; bottom: 8px; padding: 3px 7px; background: rgba(29,36,51,0.85); color: #fff; font-family: ${F.mono}; font-size: 9.5px; letter-spacing: 0.14em; text-transform: uppercase; border-radius: 3px; }
.cw-all-card-body { padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 6px; }
.cw-all-card-body h4 { margin: 0; font-family: ${F.display}; font-size: 14px; font-weight: 500; line-height: 1.3; color: ${T.ink}; }
.cw-all-card-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11.5px; color: ${T.inkSoft}; }
.cw-all-card-rating { color: ${T.inkMid}; }
.cw-all-card-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 4px; padding-top: 8px; border-top: 1px solid ${T.ruleSoft}; }
.cw-all-card-delivery { font-family: ${F.mono}; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: ${T.inkSoft}; }
.cw-all-card-price { font-family: ${F.display}; font-weight: 600; font-size: 16px; color: ${T.ink}; }

.cw-help-trigger { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px 3px 6px; border: 1px solid transparent; border-radius: 999px; font-family: ${F.ui}; font-size: 12px; font-weight: 500; color: ${T.inkMid}; cursor: pointer; transition: all .12s; }
.cw-help-trigger:hover, .cw-help[aria-expanded="true"] .cw-help-trigger { color: ${T.ink}; background: ${T.paper2}; border-color: ${T.rule}; }
.cw-help-icon { display: inline-grid; place-items: center; width: 16px; height: 16px; border-radius: 50%; background: ${T.indigo}; color: #fff; font-family: ${F.display}; font-style: italic; font-size: 11px; font-weight: 600; line-height: 1; }
.cw-help-panel { position: absolute; top: calc(100% + 8px); right: 0; z-index: 80; width: min(360px, calc(100vw - 32px)); background: ${T.vellum}; border: 1px solid ${T.rule}; border-radius: 12px; box-shadow: 0 24px 48px -16px rgba(29,36,51,0.28); overflow: hidden; font-family: ${F.ui}; }
.cw-help-panel-head { display: flex; align-items: baseline; justify-content: space-between; padding: 12px 16px 10px; border-bottom: 1px solid ${T.ruleSoft}; font-family: ${F.mono}; font-size: 10.5px; letter-spacing: 0.14em; text-transform: uppercase; color: ${T.inkSoft}; }
.cw-help-panel-head > span:first-child { color: ${T.ink}; font-weight: 600; }
.cw-help-panel-hint { font-size: 9.5px; }
.cw-help-list { list-style: none; margin: 0; padding: 4px 0; }
.cw-help-list li { border-bottom: 1px solid ${T.ruleSoft}; }
.cw-help-list li:last-child { border-bottom: 0; }
.cw-help-q { width: 100%; display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 10px 16px; background: none; border: 0; cursor: pointer; text-align: left; font-family: ${F.display}; font-size: 14px; font-weight: 500; color: ${T.ink}; line-height: 1.3; }
.cw-help-q:hover { background: ${T.paper2}; }
.cw-help-q-sym { font-family: ${F.ui}; font-size: 16px; color: ${T.inkSoft}; flex: 0 0 auto; line-height: 1; }
.cw-help-a { margin: 0; padding: 0 16px 12px; font-size: 12.5px; line-height: 1.55; color: ${T.inkMid}; }
`

/* ───────────────────────── Component ─────────────────────────── */

const HERO_HEADLINES: Record<Country, { eyebrow: string; h1: React.ReactNode; lede: string }> = {
  all: {
    eyebrow: 'US · UK · CA — fixed-fee, no consultation traps',
    h1: <>Talk to an attorney about your case — <em>by the brief, not the hour.</em></>,
    lede:
      'A vetted marketplace of licensed immigration attorneys, regulated consultants and tenancy specialists. ' +
      'Pick a fixed-fee brief, review samples and timelines, and pay only when the work clears review.',
  },
  us: {
    eyebrow: 'United States · F-1 · OPT · I-130 · I-485',
    h1: <>U.S. immigration help — <em>by the brief, not the billable hour.</em></>,
    lede:
      'Licensed U.S. attorneys handling F-1 reinstatement, OPT and STEM OPT, marriage green cards, and family petitions. ' +
      'Fixed-fee briefs, evidence packs reviewed before filing, payment held in escrow until you approve.',
  },
  uk: {
    eyebrow: 'United Kingdom · ILR · Spouse · Skilled Worker · § Tenancy',
    h1: <>U.K. immigration & tenancy briefs — <em>fixed fee, no surprises.</em></>,
    lede:
      'OISC-regulated consultants and U.K. solicitors handling Spouse visas, ILR, Skilled Worker COS, Graduate Route, ' +
      'and Renters Rights Act 2025 disputes. Each brief is scoped and priced upfront.',
  },
  ca: {
    eyebrow: 'Canada · Study Permit · PGWP · Express Entry · Provincial tenancy',
    h1: <>Canadian immigration help — <em>by the brief, not the meter.</em></>,
    lede:
      'ICCRC-registered consultants and Canadian attorneys covering Study Permit packs, PGWP, Express Entry CRS, ' +
      'PNP strategy, spousal sponsorship, and provincial tenancy law. Fixed-fee, escrowed, refundable.',
  },
}

export async function PublicMarketplaceLanding({ country = 'all' as Country }: { country?: Country }) {
  const data = await loadLandingData()
  const active: Country = (['all', 'us', 'uk', 'ca'] as Country[]).includes(country) ? country : 'all'
  const slice = data.slices[active]
  const { reviews } = data
  const headline = HERO_HEADLINES[active]
  const chips = POPULAR_CHIPS[active]
  const totalActive = slice.totalActive
  const currency = slice.currency
  const baseCountryParam = active === 'all' ? '' : `&country=${active}`

  // Build one slide per jurisdiction that has a caseFile (most-popular gig).
  // Always include the active slice first, then remaining jurisdictions.
  // Fallback to the global top brief only for jurisdictions with zero gigs.
  const slides: HeroSlide[] = []
  const jxOrder: Country[] = [active, ...(['all', 'us', 'uk', 'ca'] as Country[]).filter((c) => c !== active)]
  for (const jx of jxOrder) {
    const s = data.slices[jx]
    if (!s) continue
    if (s.caseFile) {
      slides.push({
        id: s.caseFile.id,
        title: s.caseFile.title,
        providerName: s.caseFile.providerName,
        providerHeadshot: s.caseFile.providerHeadshot,
        provider_type: s.caseFile.provider_type,
        providerCountry: s.caseFile.providerCountry,
        jx: s.caseFile.jx,
        avg_rating: s.caseFile.avg_rating,
        review_count: s.caseFile.review_count,
        slug: s.caseFile.slug,
        caseTiers: s.caseFile.caseTiers,
        isFallback: false,
        label: s.label,
      })
    } else if (data.slices.all.caseFile) {
      slides.push({
        id: data.slices.all.caseFile.id,
        title: data.slices.all.caseFile.title,
        providerName: data.slices.all.caseFile.providerName,
        providerHeadshot: data.slices.all.caseFile.providerHeadshot,
        provider_type: data.slices.all.caseFile.provider_type,
        providerCountry: data.slices.all.caseFile.providerCountry,
        jx: data.slices.all.caseFile.jx,
        avg_rating: data.slices.all.caseFile.avg_rating,
        review_count: data.slices.all.caseFile.review_count,
        slug: data.slices.all.caseFile.slug,
        caseTiers: data.slices.all.caseFile.caseTiers,
        isFallback: true,
        label: s.label,
      })
    }
  }
  // Deduplicate by id.
  const deduped: HeroSlide[] = []
  const seen = new Set<string>()
  for (const s of slides) {
    if (!seen.has(s.id)) {
      seen.add(s.id)
      deduped.push(s)
    }
  }
  // Featured grid fallback: same idea — fill with global top 6 if the slice
  // has nothing.
  const featuredToShow = slice.featured.length > 0 ? slice.featured : data.slices.all.featured
  const featuredIsFallback = slice.featured.length === 0 && data.slices.all.featured.length > 0

  const trustItems: Array<{ label: string }> = []
  if (totalActive > 0) trustItems.push({ label: `${totalActive.toLocaleString('en-US')} active briefs` })
  trustItems.push({ label: 'Escrow on every brief — released on approval' })
  trustItems.push({ label: 'Licensed attorneys & regulated consultants only' })

  return (
    <div className="cw-market" style={{ minHeight: '100vh' }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(SERVICE_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSONLD) }} />

      {/* Hero */}
      <section className="hero">
        <div className="wrap hero-grid">
          <div>
            <span className="hero-eyebrow">
              <span className={`flagbar ${active !== 'all' ? active : ''}`} aria-hidden="true" />
              {headline.eyebrow}
            </span>

            <h1>{headline.h1}</h1>
            <p className="lede">{headline.lede}</p>

            <form className="hero-search" action="/marketplace" method="get">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input name="q" placeholder="What do you need help with?" />
              {active !== 'all' && <input type="hidden" name="country" value={active} />}
              <span className="pick">
                Jurisdiction:&nbsp;<CountryPicker active={active} />
              </span>
              <button type="submit" className="search-go">Find help</button>
            </form>

            <div className="suggest">
              <span className="lbl">Popular:</span>
              {chips.map((c) => (
                <a key={c.q} href={withCountry(`/marketplace?q=${encodeURIComponent(c.q)}`, active)}>{c.label}</a>
              ))}
            </div>
          </div>

          <HeroCaseFileSlideshow
            slides={deduped}
            currency={currency}
            T={T}
            F={F}
          />
        </div>
      </section>

      {/* Trust bar */}
      <div className="trust">
        <div className="wrap trust-inner">
          <span className="label">Trusted by</span>
          {trustItems.map((it) => (
            <span key={it.label} className="item"><span className="dot" /> {it.label}</span>
          ))}
        </div>
      </div>

      {/* Featured gigs */}
      {featuredToShow.length > 0 ? (
        <section className="featured">
          <div className="wrap">
            <div className="section-head">
              <h2>{featuredIsFallback ? (
                <>Global <em>top briefs.</em></>
              ) : (
                <>This week's <em>recommended {active !== 'all' ? slice.label.split(' ')[0] : ''} briefs.</em></>
              )}</h2>
              <div className="meta">
                <span>{featuredIsFallback ? `No ${slice.label} listings yet · showing global top` : 'Ranked by demand & review score'}</span>
                <span><AllGigsDrawer initialCountry={active} /></span>
              </div>
            </div>

            <div className="filters">
              <a className="on" href={withCountry('/marketplace', active)}>All <span className="ct">({totalActive})</span></a>
              {slice.categories.filter((c) => c.count > 0).slice(0, 5).map((cs) => (
                <a key={cs.cat.id} href={withCountry(`/marketplace?category=${cs.cat.id}`, active)}>
                  {cs.cat.name.replace(' Services', '')} <span className="ct">({cs.count})</span>
                </a>
              ))}
              <a href={withCountry('/marketplace?delivery_days=3', active)}>· Delivery ≤ 3d</a>
            </div>

            <div className="gig-grid">
              {featuredToShow.map((g) => {
                const tag = `${(g.jx ?? active === 'all' ? (g.jx ?? 'us') : active).toUpperCase()} · ${(g.category ?? 'Brief').replace(/Services?$/i, '').trim()}`
                const proLabel = g.provider_type === 'attorney' ? 'J.D.' : 'Reg.'
                const cardCountry = g.jx ?? (active !== 'all' ? active : 'us')
                const localCurrency = COUNTRY_META[cardCountry as JxCode]?.currency ?? currency
                const href = g.slug
                  ? `/marketplace/gigs/${g.slug}`
                  : withCountry(`/marketplace?category=${g.category ? (LEGACY_CATEGORY_MAP[g.category] || normalizeCategory(g.category)) : ''}`, active)
                return (
                  <a key={g.id} href={href} className="gig-link" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
                  <article className="gig" data-c={cardCountry}>
                    <div className={`plate${g.cover_image_url ? ' has-cover' : ''}`}>
                      {g.cover_image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="plate-img" src={g.cover_image_url} alt={`${g.title || 'Service'} — preview`} loading="lazy" />
                      ) : (
                        <span className="plate-glyph">{glyphFor(g)}</span>
                      )}
                      <span className="plate-tag">{tag}</span>
                    </div>
                    <div className="body">
                      <div className="seller">
                        {g.providerHeadshot ? (
                          // Real headshot. `next/image` would be ideal but
                          // this surface already uses plain <img> elsewhere
                          // (PNG flag tiles, gig covers) so we stay
                          // consistent. The CSS .av rule already sets
                          // size/circle clipping; object-fit:cover prevents
                          // the photo from squashing into the 36px circle.
                          <img
                            className="av"
                            src={g.providerHeadshot}
                            alt={g.providerName}
                            loading="lazy"
                            style={{ objectFit: 'cover' }}
                          />
                        ) : (
                          <span className="av" style={{ background: avatarBgFor(g.provider_type) }}>{initialsOf(g.providerName)}</span>
                        )}
                        <span className="info">
                          <b>{g.providerName}</b>
                          <span>{g.provider_type === 'attorney' ? 'Licensed attorney' : 'Regulated consultant'}</span>
                        </span>
                        <span className="pro">{proLabel}</span>
                      </div>
                      <h4>{g.title}</h4>
                      {g.review_count > 0 && (
                        <div className="stars">
                          <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9" /></svg>
                          {g.avg_rating.toFixed(2)} <span className="rev">· ({g.review_count})</span>
                        </div>
                      )}
                      <div className="gig-foot">
                        <span className="delivery">{deliveryLabel(g.delivery_days)}</span>
                        <span className="price">
                          <span className="from">From</span>
                          <b>{formatPrice(g.starting_price, localCurrency)}</b>
                        </span>
                      </div>
                    </div>
                  </article>
                  </a>
                )
              })}
            </div>
          </div>
        </section>
      ) : null}

      {/* Live marketplace pulse */}
      <section style={{ padding: '48px 24px', background: '#F7F5F0', borderTop: '1px solid #F1F5F9' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <MarketplaceFeed />
        </div>
      </section>

      {/* How it works */}
      <section className="how" id="how-it-works">
        <div className="wrap">
          <div className="section-head">
            <h2>A <em>brief, not a billable.</em></h2>
            <div className="meta">
              <span>Fixed fees · Escrowed · Refundable</span>
            </div>
          </div>

          <div className="how-grid">
            <div className="how-step">
              <span className="icon">i</span>
              <span className="step-num">Step 01</span>
              <h3>Tell us the <em>case</em></h3>
              <p>Pick a brief by jurisdiction and topic. Each gig lists exactly what the attorney delivers, the timeline, and the price — no opaque hourly meters.</p>
            </div>
            <div className="how-step">
              <span className="icon">ii</span>
              <span className="step-num">Step 02</span>
              <h3>Funds sit in <em>escrow</em></h3>
              <p>Your payment is held by YouSafe. Attorneys see funds are committed before they begin work; you stay in control until the deliverable lands.</p>
            </div>
            <div className="how-step">
              <span className="icon">iii</span>
              <span className="step-num">Step 03</span>
              <h3>Approve &amp; <em>release</em></h3>
              <p>Review the file, request revisions inside the bundled limit, and release funds. If the work doesn't clear our standards, we refund — no questions.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Become a seller */}
      <section className="seller-cta">
        <div className="wrap">
          <div className="seller-card">
            <div>
              <span className="mono-eyebrow">For attorneys &amp; regulated consultants</span>
              <h2>Take on the <em>cases you want.</em> Skip the intake calls.</h2>
              <p>List fixed-fee briefs in your wheelhouse, choose your jurisdictions, and let clients arrive vetted, scoped, and pre-paid. Funds are escrowed before you begin work; payouts release on client approval.</p>
              <div className="actions">
                <a className="btn primary" href={`${PORTAL_URL}/sign-up/attorney`}>Apply as an attorney →</a>
                <a className="btn ghost" href={`${PORTAL_URL}/sign-up/consultant`}>Apply as a consultant →</a>
              </div>
            </div>
            <div className="stats">
              <div className="stat"><b>0%</b><span>Hourly intake calls</span></div>
              <div className="stat"><b>Fixed fees</b><span>Set per brief by the seller</span></div>
              <div className="stat"><b>Escrowed</b><span>Paid out on client approval</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials — always shown near bottom; uses real reviews if any */}
      <section className="quotes">
        <div className="wrap">
          <div className="section-head">
            <h2>Testimonials <em>from buyers.</em></h2>
            <div className="meta">
              <span>From completed briefs across the platform</span>
            </div>
          </div>

          {reviews.length > 0 ? (
            <div className="quotes-grid">
              {reviews.map((r, i) => (
                <div key={i} className="quote">
                  <span className="stars">
                    {Array.from({ length: 5 }).map((_, k) => (
                      <svg key={k} viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style={{ opacity: k < r.rating ? 1 : 0.3 }}>
                        <polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9" />
                      </svg>
                    ))}
                    {r.rating.toFixed(1)}
                  </span>
                  <blockquote>{r.body}</blockquote>
                  <cite>
                    <span className="av">{r.reviewerInitial}</span>
                    <b>{r.reviewerName}</b> · on "{r.gigTitle}"
                  </cite>
                </div>
              ))}
            </div>
          ) : (
            <p className="quotes-empty">
              No published reviews yet — every brief on YouSafe is escrowed and refundable, and reviewer names appear here once a buyer publishes one. Be the first to <a href={withCountry('/marketplace', active)} style={{ borderBottom: `1px solid ${T.indigo}`, color: T.indigo }}>commission a brief</a>.
            </p>
          )}
        </div>
      </section>

      {/* Payments & trust strip */}
      <section className="payments">
        <div className="wrap payments-inner">
          <div className="payments-block">
            <div className="payments-label">Payments accepted</div>
            <div className="payments-rail" aria-label="Cards and methods accepted">
              <span className="paymark visa" aria-label="Visa">VISA</span>
              <span className="paymark mc" aria-label="Mastercard">
                <span className="mc-c1" /><span className="mc-c2" />
              </span>
              <span className="paymark amex" aria-label="American Express">AMEX</span>
              <span className="paymark disc" aria-label="Discover">DISCOVER</span>
              <span className="paymark apple" aria-label="Apple Pay">  Pay</span>
              <span className="paymark google" aria-label="Google Pay">G Pay</span>
            </div>
          </div>
          <div className="payments-block">
            <div className="payments-label">Buyer protection</div>
            <ul className="payments-trust">
              <li><span aria-hidden="true">🔒</span> PCI-compliant card processing</li>
              <li><span aria-hidden="true">⚖️</span> Funds held in escrow until you approve</li>
              <li><span aria-hidden="true">↩️</span> Refundable when work doesn't clear review</li>
            </ul>
          </div>
        </div>
      </section>

      {/* FAQ — restored near bottom with dynamic hover-to-expand */}
      <section className="faq-section" id="faq">
        <div className="wrap">
          <div className="section-head">
            <h2>Before you <em>start.</em></h2>
            <div className="meta">
              <span>Hover any question to reveal the answer</span>
            </div>
          </div>
          <FaqAccordion items={FAQS} />
        </div>
      </section>

      <MarketplaceFooter />
    </div>
  )
}
