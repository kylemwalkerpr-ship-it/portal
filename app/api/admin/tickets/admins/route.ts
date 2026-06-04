/**
 * GET /api/admin/tickets/admins
 *
 * Returns the list of admin profiles that can be assigned a ticket. Used
 * by the admin tickets drawer's "Assign" dropdown. Kept under the tickets
 * tree so the data ownership / route boundary stays clean.
 *
 * Self-heal: if the profiles read fails we degrade to an empty list with a
 * data_warnings entry — the drawer's dropdown gracefully hides itself.
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'

export async function GET(_req: Request) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { db } = auth

  const warnings: string[] = []
  let admins: Array<{ id: string; name: string; email: string | null }> = []

  try {
    const { data, error } = await db
      .from('profiles')
      .select('id, full_name, email, role, status')
      .eq('role', 'admin')
      .order('full_name', { ascending: true })
      .limit(200)
    if (error) {
      warnings.push('admins_query_failed: ' + error.message)
    } else {
      admins = (data ?? [])
        .filter((p: any) => !p.status || p.status === 'active')
        .map((p: any) => ({
          id:    p.id,
          name:  p.full_name || p.email || 'Unnamed admin',
          email: p.email || null,
        }))
    }
  } catch (e: any) {
    warnings.push('admins_query_threw: ' + (e?.message || 'unknown'))
  }

  return ok({ admins }, {}, warnings.length ? { data_warnings: warnings } : {})
}
