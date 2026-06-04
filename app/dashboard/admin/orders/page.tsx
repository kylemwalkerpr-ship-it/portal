import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function AdminOrdersPage() {
  redirect('/dashboard?admin=orders')
}
