/** /dashboard/admin/templates had no index route (404); its only tool is the PDF maker, which owns the admin guard. */
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function AdminTemplatesIndexPage(): never {
  redirect('/dashboard/admin/templates/pdf-maker')
}
