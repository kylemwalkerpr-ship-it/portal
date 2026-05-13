import { GigDiscoveryPage } from '@/components/marketplace/GigDiscoveryPage'
import { requirePortalUser } from '@/lib/portalAuth'
import { redirect } from 'next/navigation'
import { getCategoryById } from '@/lib/categories'

interface CategoryPageProps {
  params: Promise<{ categoryId: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const auth = await requirePortalUser()
  if ('error' in auth) redirect('/sign-in/student?return_to=/marketplace')
  if (auth.role !== 'client') redirect('/dashboard')

  const { categoryId } = await params
  const category = getCategoryById(categoryId)

  if (!category) {
    redirect('/marketplace')
  }

  return <GigDiscoveryPage categoryId={categoryId} categoryName={category.name} />
}
