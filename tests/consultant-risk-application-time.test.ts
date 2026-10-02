/**
 * Consultant risk at application time (migration 20261002194500): credentials,
 * insurance and jurisdictions aren't required on the short consultant form, so
 * their absence is not scored. A credential that IS provided is still validated.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { validateProviderApplication } from '@/lib/provider/application'

const sql = readFileSync(join(__dirname, '..', 'supabase/migrations/20261002194500_consultant_risk_application_time.sql'), 'utf8')
const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')

describe('consultant risk score at application time', () => {
  test('defines only the consultant risk function', () => {
    expect(code).toContain('create or replace function public.compute_consultant_application_risk(app_id uuid)')
    expect(code).not.toContain('compute_attorney_application_risk')
  })

  test('drops no_registration_number, no_insurance and missing_jurisdictions', () => {
    for (const flag of ['no_registration_number', 'no_insurance', 'missing_jurisdictions']) expect(code).not.toContain(flag)
    expect(code).not.toMatch(/v\.(registration_number|malpractice_insurance|jurisdictions)\b/)
  })

  test('keeps the remaining signals and weights, capped at 100', () => {
    expect(code).toMatch(/"free_email"'::jsonb;\s+score := score \+ 10;/)
    expect(code).toMatch(/"missing_specialties"'::jsonb;\s+score := score \+ 10;/)
    expect(code).toContain("v.profile_url is not null and length(trim(v.profile_url)) > 0 and v.profile_url !~* '^https?://'")
    expect(code).toMatch(/"suspicious_profile_url"'::jsonb;\s+score := score \+ 5;/)
    expect(code).toContain('risk_score = least(score, 100)')
  })

  test('a credential that is provided is still validated; none is fine', () => {
    const base = { provider_type: 'consultant', full_name: 'C', country: 'US', practice_areas: ['Mentorship'], consent: true }
    expect(validateProviderApplication(base).ok).toBe(true)
    const badNumber = validateProviderApplication({ ...base, credential_body: 'ICEF (agency / counsellor)', registration_number: 'X' }) as any
    expect(badNumber.errors.registration_number).toBeTruthy()
    const badBody = validateProviderApplication({ ...base, credential_body: 'Made-up body', registration_number: 'ICEF-1' }) as any
    expect(badBody.errors.credential_body).toBeTruthy()
    const badUrl = validateProviderApplication({ ...base, credential_url: 'not a url' }) as any
    expect(badUrl.errors.credential_url).toBeTruthy()
    expect(validateProviderApplication({ ...base, credential_body: 'ICEF (agency / counsellor)', registration_number: 'ICEF-12345' }).ok).toBe(true)
  })
})
