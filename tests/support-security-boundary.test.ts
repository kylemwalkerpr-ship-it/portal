import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const MIGRATION = join(
  ROOT,
  'supabase',
  'migrations',
  '20260915_support_security_boundary.sql',
)

function sql(): string {
  expect(existsSync(MIGRATION)).toBe(true)
  return readFileSync(MIGRATION, 'utf8').replace(/\s+/g, ' ')
}

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function expectRpcHardened(body: string, signature: string) {
  const sig = escapeRegex(signature)
  expect(body).toMatch(new RegExp(`to_regprocedure\\('${sig}'\\)`, 'i'))
  expect(body).toMatch(
    new RegExp(
      `revoke execute on function ${sig} from public, anon, authenticated`,
      'i',
    ),
  )
  expect(body).toMatch(
    new RegExp(`grant execute on function ${sig} to service_role`, 'i'),
  )
}
function expectViewHardened(body: string, view: string) {
  const qualified = `public.${view}`
  const rel = escapeRegex(qualified)
  expect(body).toMatch(new RegExp(`to_regclass\\('${rel}'\\)`, 'i'))
  expect(body).toMatch(
    new RegExp(`alter view ${rel} set \\(security_invoker = true\\)`, 'i'),
  )
  expect(body).toMatch(
    new RegExp(
      `revoke all privileges on table ${rel} from public, anon, authenticated`,
      'i',
    ),
  )
  expect(body).toMatch(
    new RegExp(`grant select on table ${rel} to service_role`, 'i'),
  )
}

describe('support/internal Supabase security boundary migration', () => {
  it('hardens the two live support SECURITY DEFINER RPCs', () => {
    const body = sql()
    expectRpcHardened(
      body,
      'public.support_notify(uuid,text,text,text,text,text)',
    )
    expectRpcHardened(
      body,
      'public.support_log_action(uuid,text,text,text,text,jsonb)',
    )
  })
  it('makes internal views invoker-safe and service-role only', () => {
    const body = sql()
    for (const view of [
      'content_job_health_summary',
      'inquiry_engagement',
      'seo_backlink_dashboard',
      'support_user_notes_v',
    ]) {
      expectViewHardened(body, view)
    }
  })

  it('guards drift-only objects so a fresh migration replay stays valid', () => {
    const body = sql()
    expect(body.match(/to_regprocedure\(/gi)?.length ?? 0).toBeGreaterThanOrEqual(2)
    expect(body.match(/to_regclass\(/gi)?.length ?? 0).toBeGreaterThanOrEqual(4)
  })
})
