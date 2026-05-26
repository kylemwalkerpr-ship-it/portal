import { fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'
import { userOwnsSlug } from '@/lib/templateEntitlements'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getTemplatePack } from '@/lib/template-packs'

// Authenticated download endpoint for paid template packs.
//
// Flow:
//   1. requirePortalUser — must be signed in
//   2. Look up the slug in the catalogue (404 if unknown)
//   3. Verify the user paid for THIS slug via userOwnsSlug
//      (403 if they haven't — never leak file existence)
//   4. Mint a short-lived (60s) signed URL from the private
//      `templates` bucket and 302 the browser to it
//
// We never stream the file through our worker — Supabase Storage
// handles the bytes and the signed URL gives us a tight auth window.
// Re-downloads work because each click re-mints a fresh signed URL.
//
// Object key convention: <slug>/pack.zip — see supabase/template_storage.sql.

const SIGNED_URL_TTL_SECONDS = 60

export async function GET(_req: Request, context: { params: Promise<{ slug: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { slug } = await context.params
  if (!slug) return fail('Missing template slug.', 400)

  // 1. Catalogue lookup — protects against accidental probes for slugs
  //    that aren't real, and gives us the canonical delivery filename
  //    so the bucket layout stays predictable.
  const pack = getTemplatePack(slug)
  if (!pack) return fail('Template not found.', 404)

  // 2. Entitlement check — the email on the profile MUST match a paid
  //    template_orders row that contains this slug.
  const { data: profile } = await auth.db
    .from('profiles')
    .select('email')
    .eq('id', auth.profileId)
    .single()
  const email = (profile?.email || '').toLowerCase()
  if (!email) return fail('No email on profile — cannot verify purchase.', 403)
  const owns = await userOwnsSlug(auth.db, email, slug)
  if (!owns) return fail('You haven\'t purchased this template yet.', 403)

  // 3. Mint a signed URL via the service-role client. We never expose
  //    the bucket via the anon key; the service role is the only path
  //    in and it lives server-side.
  // The path convention is <slug>/pack.<ext>. If the pack catalogue
  // names a specific delivery_file, prefer that filename inside the
  // slug folder — otherwise fall back to pack.zip.
  const filename = pack.delivery_file && pack.delivery_file.includes('/')
    ? pack.delivery_file.split('/').pop()!
    : 'pack.zip'
  const objectPath = `${slug}/${filename}`

  const admin = createSupabaseAdminClient()
  const { data: signed, error: signErr } = await admin.storage
    .from('templates')
    .createSignedUrl(objectPath, SIGNED_URL_TTL_SECONDS, { download: true })

  if (signErr || !signed?.signedUrl) {
    // Distinguish missing-file from infra failure so the UI can
    // tell the user "still being prepared" vs. "try again".
    const msg = (signErr?.message || '').toLowerCase()
    if (msg.includes('object not found') || msg.includes('not_found')) {
      return fail('This template is still being prepared. Contact support@yousafeconsultancy.com if it stays unavailable.', 404)
    }
    return fail(signErr?.message || 'Could not generate download link.', 500)
  }

  return Response.redirect(signed.signedUrl, 302)
}
