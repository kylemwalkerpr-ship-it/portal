import { fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'
import { userOwnsSlug } from '@/lib/templateEntitlements'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getTemplatePack } from '@/lib/template-packs'
import { recordDocumentAccess } from '@/lib/documentStorage'
import { generateTemplatePdf, buildPrefill } from '@/lib/pdfGenerator'
import { getManifest } from '@/lib/templatePdfManifests'
import { randomUUID } from 'crypto'

// Authenticated download endpoint for paid template packs.
//
// New (Jun 2026): prefers a generated, prefilled PDF when one exists in
// `template_pdf_renders`. Falls back to on-demand generation, and finally
// to the legacy `pack.zip` for slugs that have no manifest.
//
// Flow:
//   1. requirePortalUser — must be signed in
//   2. Look up the slug in the catalogue (404 if unknown)
//   3. Verify the user paid for THIS slug via userOwnsSlug
//   4. Prefer template_pdf_renders → on-demand gen → legacy pack.zip
//   5. Audit row via recordDocumentAccess on every mint

const SIGNED_URL_TTL_SECONDS = 60

export async function GET(req: Request, context: { params: Promise<{ slug: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { slug } = await context.params
  if (!slug) return fail('Missing template slug.', 400)

  const pack = getTemplatePack(slug)
  if (!pack) return fail('Template not found.', 404)

  // Entitlement check — admins bypass for audit / re-distribution.
  let isOwner = auth.role === 'admin'
  if (!isOwner) {
    const { data: profile } = await auth.db
      .from('profiles')
      .select('email')
      .eq('id', auth.profileId)
      .single()
    const email = (profile?.email || '').toLowerCase()
    if (!email) return fail('No email on profile — cannot verify purchase.', 403)
    isOwner = await userOwnsSlug(auth.db, email, slug)
    if (!isOwner) return fail('You haven\'t purchased this template yet.', 403)
  }

  const admin = createSupabaseAdminClient()

  // 1. Prefer a prefilled, generated PDF — these are produced at payment
  //    time. The newest row wins so admins can regenerate and supersede.
  const { data: existingRender } = await admin
    .from('template_pdf_renders')
    .select('storage_path, storage_bucket, order_id')
    .eq('profile_id', auth.profileId)
    .eq('slug', slug)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let objectPath: string | null = existingRender?.storage_path ?? null
  const bucket = existingRender?.storage_bucket ?? 'templates'

  // 2. No render yet — generate one on-demand and persist it.
  if (!objectPath) {
    const manifest = getManifest(slug)
    if (manifest) {
      try {
        // Pull the order id of the latest paid order containing this slug so
        // the on-demand file lives under a deterministic path.
        const { data: profile } = await admin
          .from('profiles')
          .select('email, full_name')
          .eq('id', auth.profileId)
          .single()
        const email = (profile?.email || auth.profile?.email || '').toLowerCase()
        let orderId = randomUUID()
        if (email) {
          const { data: order } = await admin
            .from('template_orders')
            .select('id, created_at')
            .eq('email', email)
            .eq('status', 'paid')
            .contains('slugs', [slug])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          if (order?.id) orderId = order.id
        }

        const prefill = buildPrefill({
          userFullName: profile?.full_name || auth.profile?.full_name || '',
          userEmail: profile?.email || auth.profile?.email || '',
          orderId,
          templateName: pack.name,
          templateBadge: pack.badge,
        })
        const pdfBytes = await generateTemplatePdf({
          manifest,
          prefillValues: prefill,
          meta: {
            templateName: pack.name,
            templateBadge: pack.badge,
            templateDescription: pack.short_description,
            keywords: pack.includes,
            userFullName: profile?.full_name || auth.profile?.full_name || '',
            userEmail: profile?.email || auth.profile?.email || '',
            orderId,
            generationDate: new Date(),
          },
        })
        const path = `templates-generated/${auth.profileId}/${slug}/${orderId}.pdf`
        const { error: upErr } = await admin.storage
          .from('templates')
          .upload(path, pdfBytes, { contentType: 'application/pdf', upsert: true })
        if (!upErr) {
          await admin.from('template_pdf_renders').insert({
            id: randomUUID(),
            profile_id: auth.profileId,
            slug,
            order_id: orderId,
            storage_bucket: 'templates',
            storage_path: path,
            size_bytes: pdfBytes.byteLength,
          })
          objectPath = path
        }
      } catch (e) {
        console.error('[templates/download] on-demand pdf gen failed', slug, e)
      }
    }
  }

  // 3. Final fallback — legacy pack.zip for slugs without a manifest, or
  //    if on-demand generation failed entirely.
  if (!objectPath) {
    const filename = pack.delivery_file && pack.delivery_file.includes('/')
      ? pack.delivery_file.split('/').pop()!
      : 'pack.zip'
    objectPath = `${slug}/${filename}`
  }

  const { data: signed, error: signErr } = await admin.storage
    .from(bucket)
    .createSignedUrl(objectPath, SIGNED_URL_TTL_SECONDS, { download: true })

  if (signErr || !signed?.signedUrl) {
    const msg = (signErr?.message || '').toLowerCase()
    if (msg.includes('object not found') || msg.includes('not_found')) {
      return fail('This template is still being prepared. Contact support@yousafeconsultancy.com if it stays unavailable.', 404)
    }
    return fail(signErr?.message || 'Could not generate download link.', 500)
  }

  await recordDocumentAccess(admin, {
    bucket,
    path: objectPath,
    action: 'download',
    accessorProfileId: auth.profileId,
    request: req,
    meta: { slug },
  })

  return Response.redirect(signed.signedUrl, 302)
}
