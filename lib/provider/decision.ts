/**
 * One-click admin decision for a provider application (attorney lane =
 * attorney_applications, consultant lane = consultant_applications).
 *
 * approve: application -> approved; profiles.role = lane, profiles.status =
 *          active; provider row upserted; draft gigs/profile activated; Clerk
 *          publicMetadata mirrored; applicant emailed; event logged.
 * reject:  application -> declined; profiles.status = declined; Clerk
 *          mirrored; applicant emailed; event logged.
 *
 * Shared by the single-application PATCH routes and the bulk routes so the
 * side effects can never drift apart. Open statuses (pending / waitlist /
 * needs_info) can be decided; the status guard on the UPDATE makes a double
 * click or two admins racing a no-op instead of a double email.
 */
import { activateProviderListings as defaultActivate } from '../activateProviderListings'
import { mirrorProfileToClerk as defaultMirror } from '../auth/roles'
import {
  attorneyApprovalEmail,
  attorneyDeclineEmail,
  consultantApprovalEmail,
  consultantDeclineEmail,
  sendEmail as defaultSend,
} from '../email'
import { OPEN_APPLICATION_STATUSES } from './application'

export type ProviderLane = 'attorney' | 'consultant'
export type DecisionAction = 'approve' | 'decline'

export interface DecisionDeps {
  mirror?: (clerkUserId: string, meta: { role: string; status: string }) => Promise<boolean>
  send?: (args: { to: string; subject: string; html: string }) => Promise<unknown>
  activate?: (db: any, profileId: string) => Promise<unknown>
  now?: () => string
}

export type DecisionResult =
  | {
      ok: true
      status: 'approved' | 'declined'
      profileId: string | null
      role: string | null
      profileStatus: string | null
      clerkMirrored: boolean
      email: 'sent' | 'skipped' | 'failed'
    }
  | { ok: false; httpStatus: 400 | 404 | 409 | 500; error: string }

const TABLE: Record<ProviderLane, string> = {
  attorney: 'attorney_applications',
  consultant: 'consultant_applications',
}
const EVENTS: Record<ProviderLane, string> = {
  attorney: 'attorney_application_events',
  consultant: 'consultant_application_events',
}
const SELECT: Record<ProviderLane, string> = {
  attorney: 'id, profile_id, email, full_name, jurisdictions, practice_areas, credential_type, bar_number, notes, status',
  consultant: 'id, profile_id, email, full_name, jurisdictions, specialties, registration_number, status',
}

function barJurisdictionFromNotes(notes: unknown): string | null {
  if (typeof notes !== 'string') return null
  const line = notes.split('\n').find((l) => l.startsWith('Bar jurisdiction: '))
  return line ? line.slice('Bar jurisdiction: '.length).trim() || null : null
}

export function isProviderLane(value: unknown): value is ProviderLane {
  return value === 'attorney' || value === 'consultant'
}

export async function decideProviderApplication(
  db: any,
  args: {
    lane: ProviderLane
    applicationId: string
    action: DecisionAction
    adminProfileId: string
    notes?: string | null
    /** Already-loaded row (bulk route) — skips the fetch. */
    application?: Record<string, any> | null
  },
  deps: DecisionDeps = {},
): Promise<DecisionResult> {
  const mirror = deps.mirror ?? defaultMirror
  const send = deps.send ?? defaultSend
  const activate = deps.activate ?? defaultActivate
  const now = (deps.now ?? (() => new Date().toISOString()))()
  const { lane, applicationId, action, adminProfileId } = args
  if (action !== 'approve' && action !== 'decline') {
    return { ok: false, httpStatus: 400, error: 'action must be "approve" or "decline".' }
  }
  const decisionNotes = typeof args.notes === 'string' && args.notes.trim() ? args.notes.slice(0, 2000) : null
  const table = TABLE[lane]

  let app = args.application ?? null
  if (!app) {
    const { data, error } = await db.from(table).select(SELECT[lane]).eq('id', applicationId).maybeSingle()
    if (error || !data) return { ok: false, httpStatus: 404, error: 'Application not found.' }
    app = data
  }
  if (!OPEN_APPLICATION_STATUSES.includes(app!.status)) {
    return { ok: false, httpStatus: 409, error: `Application already ${app!.status}.` }
  }

  const toStatus = action === 'approve' ? 'approved' : 'declined'
  const { data: updated, error: updateErr } = await db
    .from(table)
    .update({
      status: toStatus,
      decided_at: now,
      decided_by: adminProfileId,
      decision_notes: decisionNotes,
      last_reviewed_at: now,
      last_reviewed_by: adminProfileId,
    })
    .eq('id', app!.id)
    .in('status', OPEN_APPLICATION_STATUSES as string[])
    .select('id')
  if (updateErr) return { ok: false, httpStatus: 500, error: updateErr.message }
  if (!updated || (Array.isArray(updated) && updated.length === 0)) {
    return { ok: false, httpStatus: 409, error: 'Application was already decided.' }
  }

  // Profile: role + status are the DB source of truth; Clerk mirrors them.
  let profile: { id: string; clerk_user_id: string | null; role: string | null; status: string | null } | null = null
  if (app!.profile_id) {
    const { data } = await db
      .from('profiles')
      .select('id, clerk_user_id, role, status')
      .eq('id', app!.profile_id)
      .maybeSingle()
    profile = data ?? null
  }

  let role: string | null = profile?.role ?? null
  let profileStatus: string | null = profile?.status ?? null
  let clerkMirrored = false
  const staff = role === 'admin' || role === 'support'

  if (profile && !staff) {
    const patch: Record<string, unknown> =
      action === 'approve' ? { role: lane, status: 'active' } : { status: 'declined' }
    const { error: profileErr } = await db.from('profiles').update(patch).eq('id', profile.id)
    if (profileErr) {
      console.error(`[provider-decision] profile update failed`, profileErr.message)
    } else {
      role = action === 'approve' ? lane : role
      profileStatus = action === 'approve' ? 'active' : 'declined'
    }

    if (action === 'approve') {
      const providerRow: Record<string, unknown> =
        lane === 'attorney'
          ? {
              profile_id: profile.id,
              application_id: app!.id,
              jurisdictions: app!.jurisdictions,
              practice_areas: app!.practice_areas || null,
              credential_type: app!.credential_type ?? null,
              bar_number: app!.bar_number ?? null,
              bar_state: barJurisdictionFromNotes(app!.notes) ?? (String(app!.jurisdictions ?? '').split(',')[0]?.trim() || null),
              available: true,
            }
          : {
              profile_id: profile.id,
              application_id: app!.id,
              jurisdictions: app!.jurisdictions,
              specialties: app!.specialties ?? [],
              registration_number: app!.registration_number,
            }
      const { error: upsertErr } = await db
        .from(lane === 'attorney' ? 'attorneys' : 'consultants')
        .upsert(providerRow, { onConflict: 'profile_id' })
      if (upsertErr) console.error(`[provider-decision] ${lane} upsert failed`, upsertErr.message)
      try {
        await activate(db, profile.id)
      } catch (err) {
        console.error('[provider-decision] activateProviderListings failed', err)
      }
    }

    if (profile.clerk_user_id && role && profileStatus) {
      try {
        clerkMirrored = await mirror(profile.clerk_user_id, { role, status: profileStatus })
      } catch {
        clerkMirrored = false
      }
    }
  }

  let email: 'sent' | 'skipped' | 'failed' = 'skipped'
  if (app!.email) {
    const template =
      lane === 'attorney'
        ? action === 'approve' ? attorneyApprovalEmail(app!.full_name) : attorneyDeclineEmail(app!.full_name)
        : action === 'approve' ? consultantApprovalEmail(app!.full_name) : consultantDeclineEmail(app!.full_name)
    try {
      const out = await send({ to: app!.email, subject: template.subject, html: template.html })
      email = out === 'skipped' ? 'skipped' : 'sent'
    } catch (err) {
      email = 'failed'
      console.error(`[provider-decision] ${action} email failed`, err instanceof Error ? err.message : err)
    }
  }

  await Promise.resolve(
    db.from(EVENTS[lane]).insert({
      application_id: app!.id,
      actor_id: adminProfileId,
      event_type: action,
      from_status: app!.status,
      to_status: toStatus,
      notes: decisionNotes,
      metadata: { role, profile_status: profileStatus, clerk_mirrored: clerkMirrored, email },
    }),
  ).then(() => null, () => null)

  return { ok: true, status: toStatus, profileId: profile?.id ?? null, role, profileStatus, clerkMirrored, email }
}
