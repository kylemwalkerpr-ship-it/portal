/**
 * Intake risk rule (migration 20261002104000): the short provider application
 * no longer collects a register link or practice areas, so blanks must not be
 * scored as suspicious_profile_url / missing_practice_areas at application time.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { applicationRow, validateProviderApplication } from '@/lib/provider/application'

const sql = readFileSync(join(__dirname, '..', 'supabase/migrations/20261002104000_intake_risk_blank_link_practice_areas.sql'), 'utf8')
const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
const fn = (name: string) => {
  const start = code.indexOf(`create or replace function public.${name}(`)
  const end = code.indexOf('end $function$;', start)
  expect(start).toBeGreaterThanOrEqual(0)
  return code.slice(start, end)
}

describe('intake risk rule', () => {
  const attorney = fn('compute_attorney_application_risk')
  const consultant = fn('compute_consultant_application_risk')

  test('attorney: practice areas are not scored at application time', () => {
    expect(attorney).not.toContain('missing_practice_areas')
    expect(attorney).not.toContain('v.practice_areas')
  })

  test('blank / whitespace profile_url is "not provided", not suspicious (both lanes)', () => {
    for (const body of [attorney, consultant]) {
      expect(body).toContain(
        "if v.profile_url is not null and length(trim(v.profile_url)) > 0 and v.profile_url !~* '^https?://' then",
      )
      expect(body).toContain('"suspicious_profile_url"')
    }
  })

  test('every other rule and weight is unchanged', () => {
    for (const [flag, pts] of [['no_bar_number', 30], ['no_insurance', 20], ['free_email', 10], ['missing_jurisdictions', 15]] as const) {
      expect(attorney).toMatch(new RegExp(`"${flag}"'::jsonb;\\s+score := score \\+ ${pts};`))
    }
    for (const [flag, pts] of [['no_registration_number', 25], ['no_insurance', 15], ['free_email', 10], ['missing_jurisdictions', 15], ['missing_specialties', 10]] as const) {
      expect(consultant).toMatch(new RegExp(`"${flag}"'::jsonb;\\s+score := score \\+ ${pts};`))
    }
    expect(attorney).toContain('risk_score = least(score, 100)')
    expect(consultant).toContain('risk_score = least(score, 100)')
  })

  test('the short attorney form produces exactly the blanks this rule now tolerates', () => {
    const r = validateProviderApplication({ provider_type: 'attorney', full_name: 'A', bar_state: 'Texas', bar_number: '24012345', consent: true }) as any
    const { row } = applicationRow(r.data, { id: 'p', email: 'a@firm.com' }, 'now')
    expect(row.profile_url).toBe('')
    expect(row.practice_areas).toBe('')
  })

  test('migration is idempotent and transaction-safe (create or replace, ends with ;)', () => {
    expect(code.match(/create or replace function/g)).toHaveLength(2)
    expect(sql.trimEnd().endsWith(';')).toBe(true)
    expect(code).not.toMatch(/\b(begin|commit)\s*;/i)
  })
})
