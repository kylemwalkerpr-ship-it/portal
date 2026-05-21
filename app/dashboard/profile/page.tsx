import { redirect } from 'next/navigation'
import { requirePortalUser } from '@/lib/portalAuth'

/**
 * /dashboard/profile — canonical entry point for "edit my profile".
 *
 * Profile editing already exists, fully built and auto-saving, inside the
 * role dashboard apps:
 *   - attorney  → AttorneyApp "My Profile" tab   (?goto=profile)
 *   - consultant → ConsultantApp "Settings" page (?goto=settings — holds
 *                  name, email, bio, avatar)
 * Both apps read the `goto` query param on mount. This route is a thin
 * server-side shim so a single stable URL (linked from the public seller
 * profile's "Edit Profile" button) lands every role on its real editor,
 * without duplicating the editor UI.
 */
export default async function ProfileRedirectPage() {
  const auth = await requirePortalUser()
  if ('error' in auth) {
    redirect('/sign-in/student?return_to=/dashboard/profile')
  }
  if (auth.role === 'attorney') {
    redirect('/dashboard?goto=profile')
  }
  if (auth.role === 'consultant') {
    redirect('/dashboard?goto=settings')
  }
  // clients and admins have no marketplace seller profile — send them home.
  redirect('/dashboard')
}
