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
    .select('full_name, username')
    .eq('id', profileId)
    .maybeSingle()

  const name = profile?.full_name || 'Provider'
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
