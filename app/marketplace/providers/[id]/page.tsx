import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { SellerProfilePage } from '@/components/marketplace/SellerProfilePage'
import { getMarketplaceCanonicalUrl } from '@/lib/marketplaceSeo'

export const dynamic = 'force-dynamic'

interface ProviderPageProps {
  params: Promise<{ id: string }>
}

/**
 * Resolve a provider URL token to a `profiles.id`. The token may be:
 *   • a username slug (e.g. `kyle-walker`)         — looked up on profiles.username
 *   • a `profiles.id` UUID                          — used directly
 *   • an `attorneys.id` UUID                        — looked up on attorneys
 *   • a `consultants.id` UUID                       — looked up on consultants
 *
 * This back-compat union is what unblocks links that already point at
 * `/marketplace/providers/<profile_uuid>` (the shape GigDetailPage emits) and
 * lets the canonical URL move to `/marketplace/providers/<username>` going
 * forward without breaking existing share links.
 */
async function resolveProfileId(
  db: ReturnType<typeof createSupabaseAdminClient>,
  token: string,
): Promise<string | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)

  if (!isUuid) {
    const { data: viaUsername } = await db
      .from('profiles')
      .select('id')
      .eq('username', token.toLowerCase())
      .maybeSingle()
    return viaUsername?.id ?? null
  }

  const { data: viaProfile } = await db.from('profiles').select('id').eq('id', token).maybeSingle()
  if (viaProfile?.id) return viaProfile.id

  const { data: viaAttorney } = await db.from('attorneys').select('profile_id').eq('id', token).maybeSingle()
  if (viaAttorney?.profile_id) return viaAttorney.profile_id

  const { data: viaConsultant } = await db.from('consultants').select('profile_id').eq('id', token).maybeSingle()
  if (viaConsultant?.profile_id) return viaConsultant.profile_id

  return null
}

export async function generateMetadata({ params }: ProviderPageProps): Promise<Metadata> {
  const { id } = await params
  const db = createSupabaseAdminClient()

  const profileId = await resolveProfileId(db, id)
  if (!profileId) return { title: 'Provider | YouSafe', robots: { index: false } }

  const { data: profile } = await db
    .from('profiles')
    .select('full_name, username, status')
    .eq('id', profileId)
    .maybeSingle()

  if (!profile || profile.status !== 'active') {
    return { title: 'Provider | YouSafe', robots: { index: false } }
  }

  // Pull seller editorial fields so meta description is not a thin template
  // string (GSC "Crawled - currently not indexed" / quality exclusions).
  let attorney: any = null
  let consultant: any = null
  let nGigs = 0
  try {
    const [aRes, cRes, gRes] = await Promise.all([
      db
        .from('attorneys')
        .select('tagline, bio, intro, practice_areas, jurisdictions, years_experience')
        .eq('profile_id', profileId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from('consultants')
        .select('tagline, bio, intro, specialties, years_experience')
        .eq('profile_id', profileId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from('gigs')
        .select('id', { count: 'exact', head: true })
        .eq('provider_id', profileId)
        .eq('status', 'active'),
    ])
    attorney = aRes.data
    consultant = cRes.data
    nGigs = gRes.count || 0
  } catch {
    /* best-effort enrichment */
  }

  const seller = attorney || consultant
  const name = profile.full_name || 'Provider'
  const roleLabel = attorney ? 'Immigration attorney' : consultant ? 'Consultant' : 'Provider'
  const areas = Array.isArray((attorney as any)?.practice_areas)
    ? (attorney as any).practice_areas.filter(Boolean).slice(0, 4).join(', ')
    : Array.isArray((consultant as any)?.specialties)
      ? (consultant as any).specialties.filter(Boolean).slice(0, 4).join(', ')
      : ''
  const jurisdictions = Array.isArray((attorney as any)?.jurisdictions)
    ? (attorney as any).jurisdictions.filter(Boolean).slice(0, 3).join(', ')
    : ''
  const editorial = (
    (seller as any)?.tagline ||
    (seller as any)?.intro ||
    (seller as any)?.bio ||
    ''
  )
    .toString()
    .replace(/\s+/g, ' ')
    .trim()

  const parts: string[] = []
  if (editorial) parts.push(editorial)
  else {
    parts.push(`${roleLabel} ${name} on YouSafe Marketplace.`)
    if (areas) parts.push(`Focus: ${areas}.`)
    if (jurisdictions) parts.push(`Jurisdictions: ${jurisdictions}.`)
  }
  if (nGigs > 0) parts.push(`${nGigs} active service${nGigs === 1 ? '' : 's'}.`)
  const years = (seller as any)?.years_experience
  if (typeof years === 'number' && years > 0) parts.push(`${years}+ years experience.`)
  const description = parts.join(' ').slice(0, 160)

  // Thin profiles without bio/tagline/gigs should not compete for index budget.
  const allowIndex = Boolean(editorial) || nGigs > 0 || Boolean(areas)

  const canonicalToken = profile.username || id
  const canonicalUrl = getMarketplaceCanonicalUrl(`/marketplace/providers/${canonicalToken}/`)
  const title = `${name} — ${roleLabel} | YouSafe Marketplace`
  return {
    title,
    description:
      description ||
      `Browse fixed-price services from ${name} on YouSafe Marketplace. Compare scope, delivery, and request secure checkout.`,
    alternates: { canonical: canonicalUrl },
    robots: allowIndex ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: {
      url: canonicalUrl,
      title,
      description:
        description ||
        `Browse fixed-price services from ${name} on YouSafe Marketplace.`,
      type: 'profile',
    },
  }
}

export default async function ProviderProfilePage({ params }: ProviderPageProps) {
  const { id: token } = await params
  const db = createSupabaseAdminClient()

  const profileId = await resolveProfileId(db, token)
  if (!profileId) notFound()

  const { data: profile } = await db
    .from('profiles')
    .select('id, status, full_name, username')
    .eq('id', profileId)
    .single()
  if (!profile || profile.status !== 'active') notFound()

  // SellerProfilePage is a client component that fetches its own data via
  // /api/sellers/[id] (which accepts profile_id, attorneys.id, or consultants.id).
  // It is the canonical, editorial-tokenised seller profile used everywhere; the
  // 69-line ProviderProfileView stub that used to live here has been deleted.
  return (
    <SellerProfilePage
      sellerId={profileId}
      initialSeller={{
        id: profile.id,
        full_name: profile.full_name || 'YouSafe provider',
      }}
    />
  )
}
