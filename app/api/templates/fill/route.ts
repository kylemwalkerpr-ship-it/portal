/**
 * POST /api/templates/fill
 *
 * Create or update a template fill session.
 *
 * Body (start):
 *   { action: 'start', slug: 'us-f1-student-visa-ds160-i20-pack' }
 * Returns the session id + the manifest for rendering the form.
 *
 * Body (save):
 *   { action: 'save', sessionId: 'uuid', fillData: { field_id: 'value' } }
 * Auto-saves draft fields (idempotent, merges with existing data).
 *
 * Body (complete):
 *   { action: 'complete', sessionId: 'uuid' }
 * Marks the fill as completed — ready for checkout.
 */
import { fail, ok } from '@/lib/apiEnvelope'
import { getCurrentStudent } from '@/lib/student'
import { getTemplatePack, getTemplatePackPriceCents } from '@/lib/template-packs'
import { getManifest } from '@/lib/templatePdfManifests'
import { createSupabaseAdminClient } from '@/lib/supabase'

export async function POST(req: Request) {
  const auth = await getCurrentStudent()
  if ('error' in auth) return fail(auth.error, auth.status)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return fail('Invalid JSON body.', 400)
  }

  const action = String(body.action || '')

  if (action === 'start') {
    const slug = String(body.slug || '')
    if (!slug) return fail('Slug is required.', 400)

    const pack = getTemplatePack(slug)
    if (!pack) return fail('Template pack not found.', 404)

    const manifest = getManifest(slug)
    if (!manifest) return fail('No fillable form manifest for this template.', 400)

    const admin = createSupabaseAdminClient()
    const profile = auth.profile

    // Close any existing drafting sessions for this slug
    await admin
      .from('template_fill_sessions')
      .update({ status: 'abandoned', updated_at: new Date().toISOString() })
      .eq('profile_id', profile.id)
      .eq('slug', slug)
      .eq('status', 'drafting')

    // Build prefill values from student profile
    const prefill: Record<string, string> = {
      client_full_name: profile.full_name || '',
      client_email: profile.email || '',
      date_prepared: new Date().toISOString().slice(0, 10),
    }

    const { data: session, error } = await admin
      .from('template_fill_sessions')
      .insert({
        profile_id: profile.id,
        slug,
        status: 'drafting',
        fill_data: prefill,
      })
      .select('id, fill_data, created_at')
      .single()

    if (error || !session) {
      return fail(error?.message || 'Failed to create fill session.', 500)
    }

    return ok({
      sessionId: session.id,
      slug,
      name: pack.name,
      description: pack.short_description,
      priceCents: getTemplatePackPriceCents(slug),
      badge: pack.badge,
      includes: pack.includes,
      manifest,
      fillData: session.fill_data,
      createdAt: session.created_at,
    })
  }

  if (action === 'save') {
    const sessionId = String(body.sessionId || '')
    const fillData = body.fillData as Record<string, string> | undefined

    if (!sessionId || !fillData || typeof fillData !== 'object') {
      return fail('sessionId and fillData (object) are required.', 400)
    }

    const admin = createSupabaseAdminClient()

    // Verify ownership & status
    const { data: session } = await admin
      .from('template_fill_sessions')
      .select('id, profile_id, status, fill_data')
      .eq('id', sessionId)
      .single()

    if (!session) return fail('Session not found.', 404)
    if (session.profile_id !== auth.profile.id) return fail('Forbidden.', 403)
    if (session.status !== 'drafting') return fail('Session is not in drafting status.', 409)

    // Merge: keep existing fields, overwrite with new
    const merged = { ...(session.fill_data as Record<string, string> || {}), ...fillData }

    const { error } = await admin
      .from('template_fill_sessions')
      .update({
        fill_data: merged,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId)

    if (error) return fail(error.message, 500)
    return ok({ sessionId, saved: true })
  }

  if (action === 'complete') {
    const sessionId = String(body.sessionId || '')
    if (!sessionId) return fail('sessionId is required.', 400)

    const admin = createSupabaseAdminClient()

    const { data: session } = await admin
      .from('template_fill_sessions')
      .select('id, profile_id, status, slug, fill_data')
      .eq('id', sessionId)
      .single()

    if (!session) return fail('Session not found.', 404)
    if (session.profile_id !== auth.profile.id) return fail('Forbidden.', 403)
    if (session.status !== 'drafting') return fail('Session is not in drafting status.', 409)

    // Validate required fields against the manifest
    const manifest = getManifest(session.slug)
    if (manifest) {
      const fillValues = session.fill_data as Record<string, string> || {}
      const missing: string[] = []
      for (const section of manifest.sections) {
        for (const field of section.fields) {
          if (field.required) {
            const val = fillValues[field.id] || fillValues[field.id.replace(/[^a-zA-Z0-9_]+/g, '_').toLowerCase()] || ''
            if (!val.trim()) missing.push(field.label)
          }
        }
      }
      if (missing.length > 0) {
        return fail(`Please fill in all required fields: ${missing.join(', ')}`, 400)
      }
    }

    const { error } = await admin
      .from('template_fill_sessions')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId)

    if (error) return fail(error.message, 500)

    const pack = getTemplatePack(session.slug)
    return ok({
      sessionId,
      status: 'completed',
      slug: session.slug,
      name: pack?.name || session.slug,
      priceCents: getTemplatePackPriceCents(session.slug),
    })
  }

  return fail('Unknown action. Supported: start, save, complete.', 400)
}
