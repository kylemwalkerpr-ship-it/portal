import type { Metadata } from 'next'
import { SellerProfilePage } from '@/components/marketplace/SellerProfilePage'
import { requirePortalUser } from '@/lib/portalAuth'
import { redirect } from 'next/navigation'
import { createSupabaseAdminClient } from '@/lib/supabase'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  try {
    const db = createSupabaseAdminClient()
    const { data: seller } = await db
      .from('profiles')
      .select('full_name, role, country, avatar_url')
      .eq('id', id)
      .maybeSingle()

    if (!seller) return { title: 'Seller | YouSafe', robots: { index: false } }

    const title = `${seller.full_name || 'Seller'} | YouSafe`
    const role = seller.role ? String(seller.role).charAt(0).toUpperCase() + String(seller.role).slice(1) : 'Provider'
    const description = `${role} on YouSafe Consultancy${seller.country ? ` — ${seller.country}` : ''}. View services, reviews, and contact options.`.slice(0, 155)

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: 'profile',
        images: seller.avatar_url ? [seller.avatar_url] : undefined,
      },
      // TODO: flip to { index: true } when seller profiles go public.
      robots: { index: false, follow: true },
    }
  } catch {
    return { title: 'Seller | YouSafe', robots: { index: false } }
  }
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) redirect('/sign-in/student?return_to=/sellers/[id]')

  const { id } = await params

  return <SellerProfilePage sellerId={id} />
}
