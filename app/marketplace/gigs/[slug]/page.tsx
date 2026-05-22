import type { Metadata } from 'next'
import { GigDetailPage } from '@/components/marketplace/GigDetailPage'
import { createSupabaseAdminClient } from '@/lib/supabase'

/**
 * Defensive per-page SEO. Gig detail is auth-walled and noindex today, so
 * `robots: { index: false }` stays on — but the metadata is wired up so when
 * the gig surface is flipped to public we just remove that one line.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  try {
    const db = createSupabaseAdminClient()
    const { data: gig } = await db
      .from('gigs')
      .select('title, description, gallery_images, seo_title, seo_description')
      .eq('slug', slug)
      .eq('status', 'active')
      .maybeSingle()

    if (!gig) {
      return { title: 'Gig | YouSafe', robots: { index: false } }
    }

    const title = `${gig.seo_title || gig.title} | YouSafe`
    const description = (gig.seo_description || gig.description || '').toString().slice(0, 155)
    const cover = Array.isArray(gig.gallery_images) && gig.gallery_images.length
      ? (gig.gallery_images[0]?.url || gig.gallery_images[0])
      : undefined

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: 'website',
        images: cover ? [cover] : undefined,
      },
      twitter: { card: 'summary_large_image', title, description, images: cover ? [cover] : undefined },
      robots: { index: true, follow: true },
    }
  } catch {
    return { title: 'Gig | YouSafe', robots: { index: false } }
  }
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <GigDetailPage slug={slug} />
}
