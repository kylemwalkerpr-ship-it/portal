import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'
import {
  ALLOWED_PROFILE_FIELDS,
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
  if (!ALLOWED_PROFILE_FIELDS.includes(field)) {
    return fail(`Field "${field}" is not AI-editable.`, 400)
  }
  const hint = typeof body.hint === 'string' ? body.hint : ''

  // Load profile + seller-table row to ground the prompt. The seller can't
  // override jurisdictions/years/credentials from the client.
  const { db, profile, profileId } = auth
  const sellerTable = role === 'attorney' ? 'attorneys' : 'consultants'
  const { data: seller } = await db
    .from(sellerTable)
    .select('tagline, intro, bio, languages, years_experience, education, specialties, jurisdictions, practice_areas')
    .eq('profile_id', profileId)
    .maybeSingle()

  // Attorneys carry their credential type on the application row.
  let credentialType: string | null = null
  if (role === 'attorney') {
    const { data: app } = await db
      .from('attorney_applications')
      .select('credential_type')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    credentialType = (app?.credential_type as string | null) ?? null
  }

  const ctx: ProfileContext = {
    role,
    full_name: (profile.full_name as string | null) ?? null,
    credential_type: credentialType,
    years_experience: typeof seller?.years_experience === 'number' ? seller.years_experience : null,
    jurisdictions: (seller?.jurisdictions as string | null) ?? null,
    practice_areas: (seller?.practice_areas as string | null) ?? null,
    specialties: Array.isArray(seller?.specialties) ? (seller.specialties as string[]) : null,
    languages: Array.isArray(seller?.languages) ? (seller.languages as string[]) : null,
    education: (seller?.education as string | null) ?? null,
    tagline: (seller?.tagline as string | null) ?? null,
    intro: (seller?.intro as string | null) ?? null,
    bio: (seller?.bio as string | null) ?? null,
  }

  const result = await draftProfileField(field, ctx, hint)
  if (result.ok === false) return fail(result.message, result.status)
  return ok({ field, value: result.value })
}
