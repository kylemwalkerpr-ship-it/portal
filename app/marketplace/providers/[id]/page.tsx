import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { ProviderProfileView } from './ProviderProfileView'
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

  // UUID: try profiles first (this is the value that gig.provider_id holds).
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
    .select('full_name, username')
    .eq('id', profileId)
    .maybeSingle()

  const name = profile?.full_name || 'Provider'
  // Canonical URL always uses the username when present so SEO collapses
  // duplicate UUID/username links onto a single page.
  const canonicalToken = profile?.username || id
  const canonicalUrl = await getMarketplaceCanonicalUrl(`/marketplace/providers/${canonicalToken}/`)
  return {
    title: `${name} | YouSafe Marketplace`,
    description: `Browse services by ${name} on YouSafe Marketplace.`,
    alternates: { canonical: canonicalUrl },
    robots: { index: true, follow: true },
    openGraph: {
      url: canonicalUrl,
      title: `${name} | YouSafe Marketplace`,
      description: `Browse services by ${name} on YouSafe Marketplace.`,
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
    .select('id, full_name, email, status, username')
    .eq('id', profileId)
    .single()
  if (!profile || profile.status !== 'active') notFound()

  // Try attorney first
  const { data: attorney } = await db
    .from('attorneys')
    .select('id, profile_id, headshot_url, tagline, bio, intro, jurisdictions, practice_areas, specialties, languages, years_experience, starting_price, offers_free_consult, timezone, available, created_at')
    .eq('profile_id', profileId)
    .maybeSingle()

  let provider: any = null
  let role: 'attorney' | 'consultant' | null = null

  if (attorney) {
    const { data: apps } = await db
      .from('attorney_applications')
      .select('credential_type, bar_number, capacity, profile_url')
      .eq('profile_id', profileId)
      .eq('status', 'approved')
      .maybeSingle()
    const { data: ratings } = await db.from('attorney_ratings').select('stars').eq('attorney_id', attorney.id)
    const ratingCount = ratings?.length ?? 0
    const ratingSum = (ratings ?? []).reduce((s, r: any) => s + (r.stars || 0), 0)
    const ratingAvg = ratingCount > 0 ? Number((ratingSum / ratingCount).toFixed(2)) : null
    const { data: gigs } = await db
      .from('gigs')
      .select('id, slug, title, starting_price, avg_rating, gallery_images')
      .eq('provider_id', profileId)
      .eq('status', 'active')
    provider = {
      id: attorney.id,
      profile_id: profileId,
      username: profile.username ?? null,
      full_name: profile.full_name || profile.email?.split('@')[0] || 'Attorney',
      headshot_url: attorney.headshot_url,
      tagline: attorney.tagline,
      bio: attorney.bio,
      intro: attorney.intro,
      jurisdictions: attorney.jurisdictions,
      practice_areas: attorney.practice_areas,
      specialties: attorney.specialties,
      languages: attorney.languages,
      years_experience: attorney.years_experience,
      starting_price: attorney.starting_price,
      offers_free_consult: attorney.offers_free_consult,
      timezone: attorney.timezone,
      available: attorney.available !== false,
      member_since: attorney.created_at,
      rating_count: ratingCount,
      rating_avg: ratingAvg,
      credential_type: apps?.credential_type,
      bar_number: apps?.bar_number,
      capacity: apps?.capacity,
      profile_url: apps?.profile_url,
      gigs: gigs ?? [],
    }
    role = 'attorney'
  }

  // Try consultant
  if (!provider) {
    const { data: consultant } = await db
      .from('consultants')
      .select('id, profile_id, headshot_url, tagline, bio, intro, specialties, languages, years_experience, starting_price, offers_free_consult, timezone, available, created_at')
      .eq('profile_id', profileId)
      .maybeSingle()

    if (consultant) {
      const { data: ratings } = await db.from('consultant_ratings').select('stars').eq('consultant_id', consultant.id)
      const ratingCount = ratings?.length ?? 0
      const ratingSum = (ratings ?? []).reduce((s, r: any) => s + (r.stars || 0), 0)
      const ratingAvg = ratingCount > 0 ? Number((ratingSum / ratingCount).toFixed(2)) : null
      const { data: gigs } = await db
        .from('gigs')
        .select('id, slug, title, starting_price, avg_rating, gallery_images')
        .eq('provider_id', profileId)
        .eq('status', 'active')
      provider = {
        id: consultant.id,
        profile_id: profileId,
        username: profile.username ?? null,
        full_name: profile.full_name || profile.email?.split('@')[0] || 'Consultant',
        headshot_url: consultant.headshot_url,
        tagline: consultant.tagline,
        bio: consultant.bio,
        intro: consultant.intro,
        specialties: consultant.specialties,
        languages: consultant.languages,
        years_experience: consultant.years_experience,
        starting_price: consultant.starting_price,
        offers_free_consult: consultant.offers_free_consult,
        timezone: consultant.timezone,
        available: consultant.available !== false,
        member_since: consultant.created_at,
        rating_count: ratingCount,
        rating_avg: ratingAvg,
        gigs: gigs ?? [],
      }
      role = 'consultant'
    }
  }

  if (!provider) notFound()

  return <ProviderProfileView provider={provider} role={role} />
}
