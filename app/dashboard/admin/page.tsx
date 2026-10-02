/**
 * /dashboard/admin had no index route (signed-in visitors got a 404; signed-out
 * ones only saw the sign-in hop because middleware runs first). The console's
 * home is the `dashboard` section, which owns the admin guard.
 */
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function AdminIndexPage(): never {
  redirect('/dashboard/admin/dashboard')
}
