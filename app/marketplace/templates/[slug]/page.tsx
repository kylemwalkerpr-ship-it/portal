import { permanentRedirect } from 'next/navigation'

interface LegacyTemplateDetailPageProps {
  params: Promise<{ slug: string }>
}

/**
 * Preserve historical template detail links with one permanent hop to the
 * canonical File Shop product URL. Unknown slugs naturally remain 404 there.
 */
export default async function LegacyTemplateDetailPage({ params }: LegacyTemplateDetailPageProps) {
  const { slug } = await params
  permanentRedirect(`https://market.yousafeconsultancy.com/shop/${encodeURIComponent(slug)}`)
}
