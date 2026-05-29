import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'
import { resolveAttorneyCredential } from '@/lib/attorneyCredential'
import {
  allowedFieldsForRole,
  draftProfileField,
  type ProfileContext,
  type ProfileField,
  type ProfileRole,
} from '@/lib/profileSuggest'

// Profile-field AI draft endpoint. Used by the attorney + consultant
// profile editors. Safety design: the body only carries `field` and an
// optional `hint`. The seller's actual jurisdictions / years / credentials
// are loaded SERVER-SIDE from the DB and injected into the prompt, so a
// client can't trick the model into fabricating credentials by passing
// false context.
//
// Body: { field: <ProfileField>, hint?: string }
export async function POST(req: Request) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  if (auth.role !== 'attorney' && auth.role !== 'consultant') {
    return fail('Only attorneys and consultants can draft profile copy.', 403)
  }
  const role = auth.role as ProfileRole

  const body = await req.json().catch(() => ({}))
  const field = String(body.field || '') as ProfileField
  // Enforce the per-ROLE allow-list, not just the global one, so a role can
  // never draft an off-role field (e.g. an attorney requesting `subjects`).
  if (!allowedFieldsForRole(role).includes(field)) {
    return fail(`Field "${field}" is not AI-editable for this account.`, 400)
  }
  const hint = typeof body.hint === 'string' ? body.hint : ''
  // Regeneration: button sends the previous draft so the prompt can ask for
  // a distinct alternative instead of returning the same text again.
  const previousValue = typeof body.previousValue === 'string'
    ? String(body.previousValue).slice(0, 4000)
    : null

  // Load profile + seller-table row to ground the prompt. The seller can't
  // override jurisdictions/years/credentials from the client.
  const { db, profile, profileId } = auth
  const sellerTable = role === 'attorney' ? 'attorneys' : 'consultants'
  // Role-aware column list: attorneys carry jurisdictions/practice_areas;
  // consultants carry subjects/industries. The two tables do NOT share these
  // columns, so a single SELECT naming all four 500s on whichever table lacks
  // the pair it doesn't own.
  const baseCols = 'tagline, intro, bio, languages, years_experience, education, specialties'
  const roleCols = role === 'attorney' ? 'jurisdictions, practice_areas' : 'subjects, industries'
  const { data: sellerRow } = await db
    .from(sellerTable)
    .select(`${baseCols}, ${roleCols}`)
    .eq('profile_id', profileId)
    .maybeSingle()
  // The role-aware select makes PostgREST infer a union row type that omits
  // whichever column pair this role doesn't own; read through a loose view.
  const seller = sellerRow as Record<string, any> | null

  // Attorneys: credential_type is the editable attorneys-row value (falling
  // back to the approved application) so AI drafts reflect the latest edit.
  let credentialType: string | null = null
  if (role === 'attorney') {
    const credential = await resolveAttorneyCredential(db, profileId)
    credentialType = credential.credential_type
  }

  const ctx: ProfileContext = {
    role,
    full_name: (profile.full_name as string | null) ?? null,
    credential_type: credentialType,
    years_experience: typeof seller?.years_experience === 'number' ? seller.years_experience : null,
    subjects: (seller?.subjects as string | null) ?? null,
    industries: (seller?.industries as string | null) ?? null,
    jurisdictions: (seller?.jurisdictions as string | null) ?? null,
    practice_areas: (seller?.practice_areas as string | null) ?? null,
    specialties: Array.isArray(seller?.specialties) ? (seller.specialties as string[]) : null,
    languages: Array.isArray(seller?.languages) ? (seller.languages as string[]) : null,
    education: (seller?.education as string | null) ?? null,
    tagline: (seller?.tagline as string | null) ?? null,
    intro: (seller?.intro as string | null) ?? null,
    bio: (seller?.bio as string | null) ?? null,
    previousValue,
  }

  const result = await draftProfileField(field, ctx, hint)
  if (result.ok === false) return fail(result.message, result.status)
  return ok({ field, value: result.value })
}
