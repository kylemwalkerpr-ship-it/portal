import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function AdminTicketsPage() {
  redirect('/dashboard?admin=tickets')
}
