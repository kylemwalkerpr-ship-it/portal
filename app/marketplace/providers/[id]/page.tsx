import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { ProviderProfileView } from './ProviderProfileView'
import { getMarketplaceCanonicalUrl } from '@/lib/marketplaceSeo'

export const dynamic = 'force-dynamic'

interface ProviderPageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: ProviderPageProps): Promise<Metadata> {
  const { id } = await params
  const db = createSupabaseAdminClient()

  const { data: attorney } = await db
    .from('attorneys')
    .select('profile_id')
    .eq('id', id)
    .maybeSingle()

  let profileId = attorney?.profile_id
  if (!profileId) {
    const { data: consultant } = await db
      .from('consultants')
      .select('profile_id')
      .eq('id', id)
      .maybeSingle()
    profileId = consultant?.profile_id
  }

  if (!profileId) return { title: 'Provider | YouSafe', robots: { index: false } }

  const { data: profile } = await db
    .from('profiles')
    .select('full_name')
    .eq('id', profileId)
    .maybeSingle()

  const name = profile?.full_name || 'Provider'
  const canonicalUrl = await getMarketplaceCanonicalUrl(`/marketplace/providers/${id}/`)
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
  const { id } = await params
  const db = createSupabaseAdminClient()

  // Try attorney first
  const { data: attorney } = await db
    .from('attorneys')
    .select('id, profile_id, headshot_url, tagline, bio, intro, jurisdictions, practice_areas, specialties, languages, years_experience, starting_price, offers_free_consult, timezone, available, created_at')
    .eq('id', id)
    .maybeSingle()

  let provider: any = null
  let role: 'attorney' | 'consultant' | null = null

  if (attorney) {
    const { data: profile } = await db.from('profiles').select('id, full_name, email, status').eq('id', attorney.profile_id).single()
    if (profile && profile.status === 'active') {
      const { data: apps } = await db
        .from('attorney_applications')
        .select('credential_type, capacity, profile_url')
        .eq('profile_id', attorney.profile_id)
        .eq('status', 'approved')
        .maybeSingle()
      const { data: ratings } = await db.from('attorney_ratings').select('stars').eq('attorney_id', id)
      const ratingCount = ratings?.length ?? 0
      const ratingSum = (ratings ?? []).reduce((s, r: any) => s + (r.stars || 0), 0)
      const ratingAvg = ratingCount > 0 ? Number((ratingSum / ratingCount).toFixed(2)) : null
      const { data: gigs } = await db
        .from('gigs')
        .select('id, slug, title, starting_price, avg_rating, gallery_images')
        .eq('provider_id', attorney.profile_id)
        .eq('status', 'active')
      provider = {
        id: attorney.id,
        profile_id: attorney.profile_id,
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
        capacity: apps?.capacity,
        profile_url: apps?.profile_url,
        gigs: gigs ?? [],
      }
      role = 'attorney'
    }
  }

  // Try consultant
  if (!provider) {
    const { data: consultant } = await db
      .from('consultants')
      .select('id, profile_id, headshot_url, tagline, bio, intro, specialties, languages, years_experience, starting_price, offers_free_consult, timezone, available, created_at')
      .eq('id', id)
      .maybeSingle()

    if (consultant) {
      const { data: profile } = await db.from('profiles').select('id, full_name, email, status').eq('id', consultant.profile_id).single()
      if (profile && profile.status === 'active') {
        const { data: ratings } = await db.from('consultant_ratings').select('stars').eq('consultant_id', id)
        const ratingCount = ratings?.length ?? 0
        const ratingSum = (ratings ?? []).reduce((s, r: any) => s + (r.stars || 0), 0)
        const ratingAvg = ratingCount > 0 ? Number((ratingSum / ratingCount).toFixed(2)) : null
        const { data: gigs } = await db
          .from('gigs')
          .select('id, slug, title, starting_price, avg_rating, gallery_images')
          .eq('provider_id', consultant.profile_id)
          .eq('status', 'active')
        provider = {
          id: consultant.id,
          profile_id: consultant.profile_id,
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
  }

  if (!provider) notFound()

  return <ProviderProfileView provider={provider} role={role} />
}
