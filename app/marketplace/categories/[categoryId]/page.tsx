import type { Metadata } from 'next'
import { GigDiscoveryPage } from '@/components/marketplace/GigDiscoveryPage'
import { redirect } from 'next/navigation'
import { getCategoryById } from '@/lib/categories'
import { createSupabaseAdminClient } from '@/lib/supabase'

interface CategoryPageProps {
  params: Promise<{ categoryId: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { categoryId } = await params
  const category = getCategoryById(categoryId)
  if (!category) return { title: 'Marketplace | YouSafe', robots: { index: false } }

  let count = 0
  try {
    const db = createSupabaseAdminClient()
    const { count: c } = await db
      .from('gigs')
      .select('id', { count: 'exact', head: true })
      .eq('category', categoryId)
      .eq('status', 'active')
    count = c || 0
  } catch { /* count is best-effort */ }

  const title = `${category.name}${count ? ` (${count} services)` : ''} | YouSafe Marketplace`
  const description = (category.description || `Browse ${category.name} services on YouSafe Consultancy.`).slice(0, 155)

  return {
    title,
    description,
    openGraph: { title, description, type: 'website' },
    robots: { index: true, follow: true },
  }
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { categoryId } = await params
  const category = getCategoryById(categoryId)

  if (!category) {
    redirect('/marketplace')
  }

  return <GigDiscoveryPage categoryId={categoryId} categoryName={category.name} />
}
