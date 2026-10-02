/**
 * POST /api/provider/apply — the single provider application
 * (attorney / regulated adviser / consultant). See lib/provider/application.ts.
 *
 * - Authenticated (Clerk). Role is decided HERE from the validated
 *   provider_type and written to the DB (source of truth), then mirrored to
 *   Clerk publicMetadata. Never from unsafeMetadata or the URL.
 * - Idempotent: an open application is updated in place.
 * - Never demotes an active provider; never converts a transacting client.
 */
import { NextResponse } from 'next/server'
import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getVerifiedClerkIdentity } from '@/lib/auth/clerkIdentity'
import {
  clientHasActivity,
  createProfile,
  findOrLinkProfile,
  isProviderRole,
  mirrorProfileToClerk,
} from '@/lib/auth/roles'
import {
  applicationRow,
  OPEN_APPLICATION_STATUSES,
  profileStatusAfterSubmit,
  validateProviderApplication,
} from '@/lib/provider/application'
import { providerApplicationReceivedEmail, sendEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const userId = await getClerkUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthenticated.' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  const result = validateProviderApplication(body)
  if (result.ok === false) {
    const { errors } = result as Extract<typeof result, { ok: false }>
    return NextResponse.json({ error: 'Please fix the highlighted fields.', fields: errors }, { status: 400 })
  }
  const { data, role } = result as Extract<typeof result, { ok: true }>

  const db = createSupabaseAdminClient()
  const identity = await getVerifiedClerkIdentity(userId)
  let profile = await findOrLinkProfile(db, userId, identity?.email)

  if (!profile) {
    profile = await createProfile(db, {
      clerkUserId: userId,
      email: identity?.email ?? null,
      fullName: data.full_name,
      role,
      status: 'pending',
    })
    if (!profile) return NextResponse.json({ error: 'Could not create your profile.' }, { status: 500 })
  }

  if (profile.role === 'admin' || profile.role === 'support') {
    return NextResponse.json({ error: 'Staff accounts cannot apply as providers.' }, { status: 403 })
  }

  if (profile.role === 'client') {
    if (await clientHasActivity(db, profile.id)) {
      return NextResponse.json({
        error: 'This account already has client activity. Please contact support@yousafeconsultancy.com to open a provider account.',
      }, { status: 409 })
    }
  } else if (isProviderRole(profile.role) && profile.role !== role && profile.status === 'active') {
    return NextResponse.json({
      error: `This account is already an approved ${profile.role}. Contact support to change provider type.`,
    }, { status: 409 })
  }

  const submittedAt = new Date().toISOString()
  const { table, row } = applicationRow(data, { id: profile.id, email: profile.email }, submittedAt)

  const { data: existing } = await db
    .from(table)
    .select('id, status')
    .eq('profile_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let applicationId: string | null = null
  let isNewApplication = false
  if (existing && OPEN_APPLICATION_STATUSES.includes(existing.status)) {
    const { data: updated, error } = await db.from(table).update(row).eq('id', existing.id).select('id').single()
    if (error) {
      console.error('[provider/apply] update failed', error.message)
      return NextResponse.json({ error: 'Could not save your application.' }, { status: 500 })
    }
    applicationId = updated?.id ?? existing.id
  } else {
    const { data: inserted, error } = await db.from(table).insert(row).select('id').single()
    if (error) {
      console.error('[provider/apply] insert failed', error.message)
      return NextResponse.json({ error: 'Could not save your application.' }, { status: 500 })
    }
    applicationId = inserted?.id ?? null
    isNewApplication = true
  }

  const nextStatus = profileStatusAfterSubmit(profile.role === role ? profile.status : null)
  const profilePatch: Record<string, unknown> = { role, status: nextStatus, full_name: data.full_name }
  if (data.phone) profilePatch.phone = data.phone
  if (data.timezone) profilePatch.timezone = data.timezone
  const { error: profileErr } = await db.from('profiles').update(profilePatch).eq('id', profile.id)
  if (profileErr) {
    console.error('[provider/apply] profile update failed', profileErr.message)
    return NextResponse.json({ error: 'Application saved, but your profile could not be updated.' }, { status: 500 })
  }

  await mirrorProfileToClerk(userId, { role, status: nextStatus })

  // "We received your application" — once per new application, best-effort
  // (never fails the submit). Re-saves of an open application don't re-send.
  let confirmationEmail: 'sent' | 'skipped' | 'failed' | 'not_new' = 'not_new'
  const recipient = profile.email || identity?.email || null
  if (isNewApplication) {
    if (!recipient) {
      confirmationEmail = 'skipped'
    } else {
      try {
        const email = providerApplicationReceivedEmail({
          fullName: data.full_name,
          lane: role === 'consultant' ? 'consultant' : 'attorney',
          licensed: data.provider_type !== 'consultant',
          hasCredential: data.provider_type !== 'consultant' || Boolean(data.credential_body || data.registration_number),
        })
        confirmationEmail = await sendEmail({ to: recipient, subject: email.subject, html: email.html })
      } catch (err) {
        confirmationEmail = 'failed'
        console.error('[provider/apply] confirmation email failed', err instanceof Error ? err.message : err)
      }
    }
  }

  return NextResponse.json({
    ok: true,
    application_id: applicationId,
    role,
    status: nextStatus,
    confirmation_email: confirmationEmail,
  })
}
