import { GigDetailPage } from '@/components/marketplace/GigDetailPage'

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <GigDetailPage slug={slug} />
}
