import { notFound } from 'next/navigation'

export const dynamicParams = false

export async function generateStaticParams() {
  return []
}

/**
 * The paid preparation packs now live exclusively at /shop/<slug> with Payhip
 * checkout. Legacy marketplace template detail URLs intentionally return 404.
 */
export default function LegacyTemplateDetailPage() {
  notFound()
}
