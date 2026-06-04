/**
 * PATCH /api/profile/country
 *
 * Lets the signed-in user override the IP-detected country on their
 * profile. Stamps `country_source='user'` so future signup-flow backfills
 * don't clobber the manual choice. Validates the code against the ISO
 * allowlist in lib/countryList.ts — anything outside that set is rejected
 * with a 422.
 *
 * Self-heal: if the operator hasn't run the country migration yet, the
 * route returns a 503 with a clear error message instead of 500-ing.
 */
import { requirePortalUser } from '@/lib/portalAuth'
import { ok, fail } from '@/lib/apiEnvelope'
import { normalizeCountryCode } from '@/lib/countryList'

export async function PATCH(req: Request) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return fail('Invalid JSON.', 400)
  }

  const code = normalizeCountryCode(body.country_code ?? body.country ?? body.code)
  if (!code) {
    return fail('Choose a valid country.', 422, { field: 'country_code' })
  }

  const { db, profile } = auth
  const { data, error } = await db
    .from('profiles')
    .update({ country_code: code, country_source: 'user' })
    .eq('id', profile.id)
    .select('id, country_code, country_source')
    .single()

  if (error) {
    if (/column .*(country_code|country_source).*does not exist/i.test(error.message || '')) {
      return fail(
        'Country tracking is not enabled on this environment. Ask an operator to run the country_code migration on profiles.',
        503,
      )
    }
    return fail(error.message, 500)
  }

  return ok({
    profile: {
      id: data?.id,
      country_code: data?.country_code,
      country_source: data?.country_source,
    },
  })
}
