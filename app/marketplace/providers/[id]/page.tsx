import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { SellerProfilePage } from '@/components/marketplace/SellerProfilePage'
import { SsrHydrateGate } from '@/components/marketplace/SsrHydrateGate'
import { getMarketplaceCanonicalUrl } from '@/lib/marketplaceSeo'
import { MARKETPLACE_OG_IMAGE } from '@/lib/publicOgImages'
import {
  assertMarketplaceEstateNonEmpty,
  assertMarketplaceServiceRoleAuthority,
} from '@/lib/marketplaceBuildAuthority'

// TRUE SSG — no `dynamic`, no `revalidate`. Production evidence: per-request
// rendering of the provider estate exceeded the Workers Free 10ms CPU budget,
// and the Free plan has no real ISR queue (OpenNext's default queue is a dummy
// that throws). Every resolvable token is enumerated once at build time below;
// tokens outside that estate are real 404s instead of a per-request lookup.
export const dynamicParams = false

interface ProviderPageProps {
  params: Promise<{ id: string }>
}

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

/** PostgREST can hand the embedded profile back either bare or as an array. */
function joinedProfileUsername(row: any): string | null {
  const profile = Array.isArray(row?.provider) ? row.provider[0] : row?.provider
  const username = profile?.username
  return typeof username === 'string' && username.trim() ? username : null
}

/**
 * Build-time provider estate. Mirrors the sitemap token rule (profile username
 * when present, otherwise the attorney/consultant row id) and additionally
 * enumerates the tokens the marketplace actually links to: the profile id and
 * the provider id of every active gig, because gig pages link
 * `provider.username || provider_id` and messaging previews link profile ids.
 */
export async function generateStaticParams(): Promise<Array<{ id: string }>> {
  // FAIL CLOSED. `dynamicParams = false` turns every token missing from this
  // set into a hard 404, so neither an authority downgrade nor a failed query
  // can be allowed to publish a partial (or empty) provider estate:
  //   · authority — attorneys/consultants/profiles embeds are not
  //     anon-readable, so an anon-scoped enumeration returns nothing (often
  //     without an error); only genuine service-role authority may enumerate;
  //   · estate — a service-role read that yields zero tokens is never a
  //     publishable provider estate.
  // Any setup/query failure rethrows and fails the build instead.
  assertMarketplaceServiceRoleAuthority('providers/[id] static params')

  const tokens = new Set<string>()

  const addRow = (row: any) => {
    const username = joinedProfileUsername(row)
    if (username) {
      tokens.add(username)
      // resolveProfileId() lowercases the token before matching, so the
      // lowercased form of a live link must pre-render the same page.
      tokens.add(username.toLowerCase())
    }
    if (row?.profile_id) tokens.add(String(row.profile_id))
    if (row?.provider_id) tokens.add(String(row.provider_id))
    if (row?.id) tokens.add(String(row.id))
  }

  const db = createSupabaseAdminClient()
  const [attorneyResult, consultantResult, gigProviderResult] = await Promise.all([
    db
      .from('attorneys')
      .select('id, profile_id, provider:profiles!attorneys_profile_id_fkey(username)')
      .limit(5000),
    db
      .from('consultants')
      .select('id, profile_id, provider:profiles!consultants_profile_id_fkey(username)')
      .limit(5000),
    // Same FK embed the public landing already uses, so it is a known-good
    // PostgREST path rather than an untested join.
    db
      .from('gigs')
      .select('provider_id, provider:profiles!gigs_provider_id_fkey(username)')
      .eq('status', 'active')
      .not('provider_id', 'is', null)
      .limit(5000),
  ])

  if (attorneyResult.error) {
    throw new Error(`[providers/static-params] attorney token query failed: ${attorneyResult.error.message}`)
  }
  if (consultantResult.error) {
    throw new Error(`[providers/static-params] consultant token query failed: ${consultantResult.error.message}`)
  }
  if (gigProviderResult.error) {
    throw new Error(`[providers/static-params] gig provider token query failed: ${gigProviderResult.error.message}`)
  }

  for (const row of attorneyResult.data ?? []) addRow(row)
  for (const row of consultantResult.data ?? []) addRow(row)
  for (const row of gigProviderResult.data ?? []) addRow(row)

  assertMarketplaceEstateNonEmpty('providers/[id] static params', tokens.size, 'provider tokens')

  return [...tokens].map((id) => ({ id }))
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

  let attorney: any = null
  let consultant: any = null
  let nGigs = 0
  try {
    const [aRes, cRes, gRes] = await Promise.all([
      db
        .from('attorneys')
        // Credential identifiers are intentionally excluded from metadata and
        // SSR prose. They are a controlled bio-card field only.
        .select('tagline, bio, intro, practice_areas, jurisdictions, years_experience, credential_type')
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
  const editorial = ((seller as any)?.tagline || (seller as any)?.intro || (seller as any)?.bio || '')
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
  const allowIndex = Boolean(editorial) || nGigs > 0 || Boolean(areas)

  const canonicalToken = profile.username || id
  const canonicalUrl = getMarketplaceCanonicalUrl(`/providers/${canonicalToken}`)
  const title = `${name} — ${roleLabel} | YouSafe Marketplace`
  return {
    title,
    description: description || `Browse fixed-price services from ${name} on YouSafe Marketplace. Compare scope, delivery, and request secure checkout.`,
    alternates: { canonical: canonicalUrl },
    robots: allowIndex ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: {
      url: canonicalUrl,
      title,
      description: description || `Browse fixed-price services from ${name} on YouSafe Marketplace.`,
      type: 'profile',
      images: allowIndex ? [MARKETPLACE_OG_IMAGE] : undefined,
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

  let attorney: any = null
  let consultant: any = null
  let gigs: Array<{ slug: string; title: string; pitch?: string | null }> = []
  try {
    const [aRes, cRes, gRes] = await Promise.all([
      db
        .from('attorneys')
        // Do not select or render bar/licence identifiers in SSR. The client
        // bio card fetch applies the provider/admin visibility contract.
        .select('tagline, bio, intro, practice_areas, jurisdictions, years_experience, languages, credential_type')
        .eq('profile_id', profileId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from('consultants')
        .select('tagline, bio, intro, specialties, years_experience, languages')
        .eq('profile_id', profileId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from('gigs')
        .select('slug, title, pitch')
        .eq('provider_id', profileId)
        .eq('status', 'active')
        .limit(12),
    ])
    attorney = aRes.data
    consultant = cRes.data
    gigs = (gRes.data as typeof gigs) || []
  } catch { /* best-effort */ }

  const seller = attorney || consultant
  const roleLabel = attorney ? 'Immigration attorney' : consultant ? 'Consultant' : 'Provider'
  const name = profile.full_name || 'YouSafe provider'
  const tagline = (seller?.tagline || '').toString().trim()
  const intro = (seller?.intro || '').toString().trim()
  const bio = (seller?.bio || '').toString().trim()
  const areas = Array.isArray(attorney?.practice_areas)
    ? attorney.practice_areas.filter(Boolean)
    : Array.isArray(consultant?.specialties)
      ? consultant.specialties.filter(Boolean)
      : []
  const jurisdictions = Array.isArray(attorney?.jurisdictions) ? attorney.jurisdictions.filter(Boolean) : []
  const languages = Array.isArray(seller?.languages) ? seller.languages.filter(Boolean) : []
  const years = seller?.years_experience

  return (
    <>
      <SsrHydrateGate readyEvent="yousafe:provider-ssr-ready">
        <article
          aria-label="Provider overview"
          style={{ maxWidth: 880, margin: '0 auto', padding: '28px 20px 12px', fontFamily: 'var(--font-inter), system-ui, sans-serif', color: '#0F172A' }}
        >
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#64748B', margin: '0 0 8px' }}>
            {roleLabel}{typeof years === 'number' && years > 0 ? ` · ${years}+ years experience` : ''}
          </p>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 10px', lineHeight: 1.2 }}>{name}</h1>
          {tagline && <p style={{ fontSize: 17, fontWeight: 500, margin: '0 0 12px', lineHeight: 1.5 }}>{tagline}</p>}
          {intro && <p style={{ fontSize: 15, lineHeight: 1.7, margin: '0 0 12px' }}>{intro}</p>}
          {bio && <div style={{ fontSize: 15, lineHeight: 1.7, marginBottom: 16, whiteSpace: 'pre-wrap' }}>{bio}</div>}
          {!tagline && !intro && !bio && (
            <p style={{ fontSize: 15, lineHeight: 1.7, margin: '0 0 16px' }}>
              {roleLabel} on YouSafe Marketplace offering fixed-price services for students and families. Compare active briefs below and request work through secure checkout.
            </p>
          )}
          {areas.length > 0 && <p style={{ fontSize: 14, margin: '0 0 8px' }}><strong>Focus:</strong> {areas.slice(0, 8).join(', ')}</p>}
          {jurisdictions.length > 0 && <p style={{ fontSize: 14, margin: '0 0 8px' }}><strong>Jurisdictions:</strong> {jurisdictions.slice(0, 6).join(', ')}</p>}
          {languages.length > 0 && <p style={{ fontSize: 14, margin: '0 0 12px' }}><strong>Languages:</strong> {languages.slice(0, 8).join(', ')}</p>}
          {gigs.length > 0 && (
            <section style={{ marginTop: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 10px' }}>Active services</h2>
              <ul style={{ margin: 0, paddingLeft: '1.2rem', lineHeight: 1.6 }}>
                {gigs.map((g) => (
                  <li key={g.slug} style={{ marginBottom: 8 }}>
                    <a href={`/gigs/${g.slug}`} style={{ color: '#1E3A5F', fontWeight: 600 }}>{g.title}</a>
                    {g.pitch ? ` — ${String(g.pitch).slice(0, 160)}` : ''}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p style={{ fontSize: 13, color: '#64748B', margin: '16px 0 0' }}>
            Profiles and services are marketplace listings. Engagement terms and licensing depend on the provider and order. Not legal advice unless you hire a licensed attorney for a specific matter.
          </p>
        </article>
      </SsrHydrateGate>
      <SellerProfilePage
        sellerId={profileId}
        initialSeller={{
          id: profile.id,
          profile_id: profile.id,
          full_name: profile.full_name || 'YouSafe provider',
          role: attorney ? 'attorney' : consultant ? 'consultant' : null,
          tagline: tagline || null,
          intro: intro || null,
          bio: bio || null,
          practice_areas: attorney && areas.length ? areas.join(', ') : null,
          specialties: consultant && areas.length ? areas : null,
          jurisdictions: jurisdictions.length ? jurisdictions.join(', ') : null,
          languages: languages.length ? languages : null,
          years_experience: typeof years === 'number' ? years : null,
          credential_type: attorney?.credential_type || null,
          total_gigs: gigs.length,
        }}
      />
    </>
  )
}
