/**
 * Single provider application, DB-sourced roles, Clerk webhook sync and the
 * username-only provisioning helpers.
 */
import {
  applicationRow,
  OPEN_APPLICATION_STATUSES,
  profileStatusAfterSubmit,
  validateProviderApplication,
} from '@/lib/provider/application'
import {
  clientHasActivity,
  isPlaceholderClerkId,
  isUndeliverableEmail,
  mirrorProfileToClerk,
  normalizeProviderType,
  roleForProviderType,
} from '@/lib/auth/roles'
import { deletedClerkIdPlaceholder, handleClerkWebhookEvent, verifiedPrimaryEmail } from '@/lib/auth/clerkWebhook'
import {
  clerkUsernameFor,
  createUserBody,
  credentialsCsvLine,
  credentialsPath,
  csvEscape,
  deliverableEmail,
  frontendApiFromPublishableKey,
  generateTempPassword,
  isProductionSecretKey,
  planProvisioning,
  splitName,
  summarizePlan,
  usernameOnlySupport,
  type ProviderProfile,
} from '@/lib/clerk/providerProvisioning'
import { gatedReturnTo } from '@/components/marketplace/SignUpGateModal'

const licensed = {
  provider_type: 'attorney',
  full_name: 'Ada Lovelace',
  country: 'United Kingdom',
  regulator: 'Solicitors Regulation Authority (England & Wales)',
  licence_number: 'SRA 123456',
  jurisdictions: 'England & Wales, Scotland',
  register_url: 'https://www.sra.org.uk/consumers/register/person/?sraNumber=123456',
  practice_areas: 'Immigration, Student visas',
  capacity: '10',
  good_standing: true,
  scope_certified: true,
  terms_accepted: true,
}

describe('single provider application', () => {
  test('provider types map to the existing role + queue', () => {
    expect(normalizeProviderType('lawyer')).toBe('attorney')
    expect(normalizeProviderType('RCIC')).toBe('regulated_adviser')
    expect(normalizeProviderType('consultant')).toBe('consultant')
    expect(normalizeProviderType('client')).toBeNull()
    expect(roleForProviderType('regulated_adviser')).toBe('attorney')
    expect(roleForProviderType('consultant')).toBe('consultant')
  })

  test('licensed applications require a valid licence number and one good-standing attestation', () => {
    const ok = validateProviderApplication(licensed)
    expect(ok.ok).toBe(true)
    const bad = validateProviderApplication({ provider_type: 'regulated_adviser', full_name: 'X', country: 'CA', terms_accepted: true }) as any
    expect(bad.ok).toBe(false)
    expect(Object.keys(bad.errors).sort()).toEqual(['consent', 'licence_number', 'regulator'])
    expect((validateProviderApplication({}) as any).errors.provider_type).toBeTruthy()
    expect((validateProviderApplication({ ...licensed, terms_accepted: false }) as any).errors.consent).toBeTruthy()
    expect((validateProviderApplication({ ...licensed, year_admitted: '99' }) as any).errors.year_admitted).toBeTruthy()
  })

  test('consultants need a specialty; a credential is optional', () => {
    const ok = validateProviderApplication({ provider_type: 'consultant', full_name: 'C', country: 'US', practice_areas: ['Admissions'], credential_body: 'ICEF (agency / counsellor)', registration_number: 'ICEF-1234', terms_accepted: 'on' }) as any
    expect(ok.ok).toBe(true)
    expect(ok.role).toBe('consultant')
    const empty = validateProviderApplication({ provider_type: 'consultant' }) as any
    expect(empty.ok).toBe(false)
    expect(Object.keys(empty.errors)).toEqual(expect.arrayContaining(['full_name', 'country', 'specialty', 'consent']))
    expect(empty.errors.credential_body).toBeUndefined()
    expect(empty.errors.registration_number).toBeUndefined()
    expect(empty.errors.capacity).toBeUndefined()
  })

  test('rows fit the existing attorney/consultant queues with a structured notes block', () => {
    const { data } = validateProviderApplication(licensed) as any
    const { table, row } = applicationRow(data, { id: 'p1', email: 'a@x.com' }, '2026-10-02T06:00:00Z')
    expect(table).toBe('attorney_applications')
    expect(row).toMatchObject({ profile_id: 'p1', credential_type: licensed.regulator, bar_number: 'SRA 123456', profile_url: licensed.register_url, status: 'pending' })
    expect(String(row.notes)).toContain('Public register URL:')
    expect(String(row.notes)).toContain('Terms accepted: 2026-10')
    const consultant = validateProviderApplication({ provider_type: 'consultant', full_name: 'C', country: 'US', practice_areas: 'A, B', credential_body: 'Other credential', registration_number: 'M-77', terms_accepted: true }) as any
    const c = applicationRow(consultant.data, { id: 'p2', email: null }, 'now')
    expect(c.table).toBe('consultant_applications')
    expect(c.row.specialties).toEqual(['A', 'B'])
    expect(c.row.registration_number).toBe('M-77')
    expect(c.row.email).toBe('')
  })

  test('re-submitting never demotes an active provider or lifts a suspension', () => {
    expect(profileStatusAfterSubmit('active')).toBe('active')
    expect(profileStatusAfterSubmit('suspended')).toBe('suspended')
    expect(profileStatusAfterSubmit('incomplete')).toBe('pending')
    expect(profileStatusAfterSubmit(null)).toBe('pending')
    expect(OPEN_APPLICATION_STATUSES).toEqual(expect.arrayContaining(['pending', 'waitlist']))
  })
})

describe('role helpers', () => {
  test('placeholder detection', () => {
    expect(isPlaceholderClerkId('inactive:providers.invalid:ann-mccoy')).toBe(true)
    expect(isPlaceholderClerkId('user_123')).toBe(false)
    expect(isUndeliverableEmail('inactive+ann@providers.invalid')).toBe(true)
    expect(isUndeliverableEmail('person@gmail.com')).toBe(false)
  })

  test('mirrorProfileToClerk PATCHes public_metadata only for real users and never throws', async () => {
    const calls: any[] = []
    const fetchOk = (async (url: string, init: any) => { calls.push([url, init]); return { ok: true } }) as any
    expect(await mirrorProfileToClerk('user_1', { role: 'attorney', status: 'pending' }, fetchOk, { CLERK_SECRET_KEY: 'sk_test_x' })).toBe(true)
    expect(calls[0][0]).toBe('https://api.clerk.com/v1/users/user_1/metadata')
    expect(calls[0][1].method).toBe('PATCH')
    expect(JSON.parse(calls[0][1].body)).toEqual({ public_metadata: { role: 'attorney', status: 'pending' } })
    expect(await mirrorProfileToClerk('inactive:x', { role: 'client' }, fetchOk, { CLERK_SECRET_KEY: 'k' })).toBe(false)
    expect(await mirrorProfileToClerk('user_1', { role: 'client' }, fetchOk, {})).toBe(false)
    expect(await mirrorProfileToClerk('user_1', { role: 'client' }, fetchOk, { CLERK_SECRET_KEY: 'k', YS_CLERK_ROLE_MIRROR: 'off' })).toBe(false)
    const boom = (async () => { throw new Error('network') }) as any
    expect(await mirrorProfileToClerk('user_1', { role: 'client' }, boom, { CLERK_SECRET_KEY: 'k' })).toBe(false)
    expect(calls).toHaveLength(1)
  })

  test('clientHasActivity fails closed', async () => {
    const counted = (n: number) => ({ from: () => ({ select: () => ({ eq: async () => ({ count: n }) }) }) })
    expect(await clientHasActivity(counted(0), 'p')).toBe(false)
    expect(await clientHasActivity(counted(2), 'p')).toBe(true)
    const broken = { from: () => { throw new Error('db down') } }
    expect(await clientHasActivity(broken, 'p')).toBe(true)
  })
})

/** Minimal chainable Supabase double recording updates. */
function fakeDb(profiles: any[]) {
  const updates: any[] = []
  const db = {
    updates,
    from(table: string) {
      const filters: Array<(r: any) => boolean> = []
      let patch: any = null
      const rows = () => profiles.filter((r) => filters.every((f) => f(r)))
      const q: any = {
        select: () => q,
        update: (p: any) => { patch = p; return q },
        eq: (col: string, val: any) => { filters.push((r) => r[col] === val); return q },
        ilike: (col: string, val: string) => { filters.push((r) => String(r[col] ?? '').toLowerCase() === val.toLowerCase()); return q },
        maybeSingle: async () => ({ data: rows()[0] ?? null }),
        then: (resolve: any) => {
          const hit = rows()
          if (patch) { for (const r of hit) Object.assign(r, patch); updates.push({ table, patch, ids: hit.map((r) => r.id) }) }
          return Promise.resolve({ data: hit, error: null }).then(resolve)
        },
      }
      return q
    },
  }
  return db
}

describe('Clerk webhook sync (DB is the source of truth)', () => {
  const verified = (email: string) => ({
    primary_email_address_id: 'e1',
    email_addresses: [{ id: 'e1', email_address: email, verification: { status: 'verified' } }],
  })

  test('only verified, deliverable primary emails count', () => {
    expect(verifiedPrimaryEmail(verified('A@Example.com'))).toBe('a@example.com')
    expect(verifiedPrimaryEmail({ primary_email_address_id: 'e1', email_addresses: [{ id: 'e1', email_address: 'a@b.com', verification: { status: 'unverified' } }] })).toBeNull()
    expect(verifiedPrimaryEmail(verified('x@providers.invalid'))).toBeNull()
    expect(verifiedPrimaryEmail({})).toBeNull()
  })

  test('links a provisioned user by external_id and mirrors the DB role', async () => {
    const db = fakeDb([{ id: 'p1', clerk_user_id: 'inactive:providers.invalid:ann', role: 'consultant', status: 'active', email: 'inactive+ann@providers.invalid', full_name: 'Ann', username: 'ann-mccoy' }])
    const mirror = jest.fn(async () => true)
    const out = await handleClerkWebhookEvent({ type: 'user.created', data: { id: 'user_9', external_id: 'p1', username: 'ann-mccoy', email_addresses: [], public_metadata: {} } }, db, mirror as any)
    expect(out).toMatchObject({ action: 'linked', profileId: 'p1', mirrored: true })
    expect(db.updates[0].patch).toEqual({ clerk_user_id: 'user_9' })
    expect(mirror).toHaveBeenCalledWith('user_9', { role: 'consultant', status: 'active' })
  })

  test('never steals a profile already linked to another Clerk user', async () => {
    const db = fakeDb([{ id: 'p1', clerk_user_id: 'user_other', role: 'attorney', status: 'active', email: 'a@x.com', full_name: 'A', username: null }])
    const out = await handleClerkWebhookEvent({ type: 'user.created', data: { id: 'user_9', external_id: 'p1', ...verified('a@x.com') } }, db, jest.fn() as any)
    expect(out.action).toBe('no_profile')
    expect(db.updates).toHaveLength(0)
  })

  test('syncs a verified email change and skips the mirror when metadata already matches', async () => {
    const db = fakeDb([{ id: 'p1', clerk_user_id: 'user_1', role: 'client', status: 'active', email: 'old@x.com', full_name: null, username: null }])
    const mirror = jest.fn(async () => true)
    const out = await handleClerkWebhookEvent({ type: 'user.updated', data: { id: 'user_1', first_name: 'Neo', ...verified('new@x.com'), public_metadata: { role: 'client', status: 'active' } } }, db, mirror as any)
    expect(out).toMatchObject({ action: 'synced', mirrored: false })
    expect(db.updates[0].patch).toEqual({ email: 'new@x.com', full_name: 'Neo' })
    expect(mirror).not.toHaveBeenCalled()
  })

  test('does not create profiles or roles for unknown users', async () => {
    const db = fakeDb([])
    expect((await handleClerkWebhookEvent({ type: 'user.created', data: { id: 'user_new', ...verified('n@x.com') } }, db, jest.fn() as any)).action).toBe('no_profile')
    expect((await handleClerkWebhookEvent({ type: 'session.created', data: { id: 'sess_1' } }, db)).action).toBe('ignored')
  })

  test('user.deleted soft-unlinks (profile and history are kept)', async () => {
    const db = fakeDb([{ id: 'p1', clerk_user_id: 'user_1', role: 'client', status: 'active' }])
    const out = await handleClerkWebhookEvent({ type: 'user.deleted', data: { id: 'user_1', deleted: true } }, db)
    expect(out).toEqual({ action: 'unlinked', profileId: 'p1' })
    expect(db.updates[0].patch).toEqual({ clerk_user_id: deletedClerkIdPlaceholder('user_1') })
  })

  test('route is a 200 no-op until CLERK_WEBHOOK_SECRET is configured', async () => {
    const previous = process.env.CLERK_WEBHOOK_SECRET
    delete process.env.CLERK_WEBHOOK_SECRET
    try {
      const { POST } = require('@/app/api/webhooks/clerk/route')
      const res: Response = await POST(new Request('https://portal.yousafeconsultancy.com/api/webhooks/clerk', { method: 'POST', body: '{}' }))
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ ok: true, skipped: true })
    } finally {
      if (previous !== undefined) process.env.CLERK_WEBHOOK_SECRET = previous
    }
  })
})

describe('provider provisioning helpers (username-only, never .invalid emails)', () => {
  const profile = (over: Partial<ProviderProfile>): ProviderProfile => ({
    id: 'p', username: 'ann-mccoy', email: 'inactive+ann-mccoy@providers.invalid', full_name: 'Ann McCoy', role: 'consultant', status: 'active', clerk_user_id: 'inactive:providers.invalid:ann-mccoy', ...over,
  })

  test('usernames follow Clerk rules (4-64, [a-z0-9_-])', () => {
    expect(clerkUsernameFor({ username: 'Ann-McCoy' })).toEqual({ ok: true, username: 'ann-mccoy' })
    expect(clerkUsernameFor({ username: 'abc' }).ok).toBe(false)
    expect(clerkUsernameFor({ username: null }).ok).toBe(false)
    expect(clerkUsernameFor({ username: 'a.b.c.d' }).ok).toBe(false)
  })

  test('placeholder emails are never deliverable', () => {
    expect(deliverableEmail({ email: 'inactive+x@providers.invalid' })).toBeNull()
    expect(deliverableEmail({ email: 'Real@Firm.com' })).toBe('real@firm.com')
  })

  test('temporary passwords are long, mixed and CSPRNG-driven', () => {
    const { randomInt } = require('node:crypto')
    const seen = new Set<string>()
    for (let i = 0; i < 50; i += 1) {
      const pw = generateTempPassword(randomInt)
      expect(pw).toMatch(/^[A-Za-z2-9]{5}(-[A-Za-z2-9]{5}){3}$/)
      expect(pw).toMatch(/[a-z]/)
      expect(pw).toMatch(/[A-Z]/)
      expect(pw).toMatch(/[2-9]/)
      seen.add(pw)
    }
    expect(seen.size).toBe(50)
  })

  test('plan: create username-only, skip linked, link our earlier user, flag conflicts', () => {
    const providers = [
      profile({ id: 'a', username: 'ann-mccoy' }),
      profile({ id: 'b', username: 'real-person', email: 'real@firm.com', clerk_user_id: 'user_live' }),
      profile({ id: 'c', username: 'crashed-run' }),
      profile({ id: 'd', username: 'taken-name' }),
      profile({ id: 'e', username: 'ab' }),
      profile({ id: 'f', username: 'gone-user', clerk_user_id: 'user_gone' }),
    ]
    const clerkUsers = [
      { id: 'user_live', username: null, external_id: null, email_addresses: ['real@firm.com'] },
      { id: 'user_ours', username: 'crashed-run', external_id: 'c', email_addresses: [] },
      { id: 'user_stranger', username: 'taken-name', external_id: null, email_addresses: [] },
    ]
    const plan = planProvisioning(providers, clerkUsers)
    expect(plan.map((p) => p.action)).toEqual(['create', 'skip_linked', 'link_existing', 'conflict', 'invalid', 'stale_link'])
    expect(plan[0].email).toBeNull()
    expect(summarizePlan(plan)).toMatchObject({ create: 1, username_only: 1, with_email: 0, skip_linked: 1, link_existing: 1, conflict: 1, invalid: 1, stale_link: 1 })
  })

  test('create body: username + password + external_id + mustChangePassword, email only when deliverable', () => {
    const issued = new Date('2026-10-02T06:00:00Z')
    const [item] = planProvisioning([profile({ id: 'a' })], [])
    const body = createUserBody(item, 'Alice Mardelet-Santamaria (also styled Alice Santamaria)', 'Pw-1', issued) as any
    expect(body).toMatchObject({ username: 'ann-mccoy', password: 'Pw-1', external_id: 'a', first_name: 'Alice', last_name: 'Mardelet-Santamaria' })
    expect(body).not.toHaveProperty('email_address')
    expect(body.public_metadata).toMatchObject({ role: 'consultant', status: 'active', mustChangePassword: true, tempPasswordIssuedAt: issued.toISOString(), tempPasswordExpiresAt: '2026-10-16T06:00:00.000Z' })
    const [withEmail] = planProvisioning([profile({ id: 'b', email: 'real@firm.com' })], [])
    expect((createUserBody(withEmail, null, 'x', issued) as any).email_address).toEqual(['real@firm.com'])
    expect(splitName('Suzanne I. Rix, KC')).toEqual({ first_name: 'Suzanne I.', last_name: 'Rix' })
  })

  test('CSV is escaped and formula-safe; path is outside the repo', () => {
    expect(csvEscape('a,b')).toBe('"a,b"')
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""')
    expect(csvEscape('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(credentialsCsvLine(['a', null, 3])).toBe('a,,3\n')
    expect(credentialsPath(new Date('2026-10-02T12:00:00Z'))).toBe('/home/box/private/provider-credentials-2026-10-02.csv')
  })

  test('instance capability + production key detection', () => {
    expect(isProductionSecretKey('sk_live_x')).toBe(true)
    expect(isProductionSecretKey('sk_test_x')).toBe(false)
    expect(frontendApiFromPublishableKey('pk_live_Y2xlcmsucG9ydGFsLnlvdXNhZmVjb25zdWx0YW5jeS5jb20k')).toBe('https://clerk.portal.yousafeconsultancy.com')
    const today = { user_settings: { attributes: { username: { enabled: false }, email_address: { enabled: true, required: true }, password: { enabled: true } } } }
    expect(usernameOnlySupport(today).usernameOnlyAccepted).toBe(false)
    const target = { user_settings: { attributes: { username: { enabled: true }, email_address: { enabled: true, required: false }, password: { enabled: true } } } }
    expect(usernameOnlySupport(target).usernameOnlyAccepted).toBe(true)
  })
})

describe('market gate modal return target', () => {
  test('absolute market URL with the resumable action, safely encoded', () => {
    const url = new URL(gatedReturnTo('/gigs/visa?x=1', 'order', { pkg: 'basic', note: 'a+b/c=' }))
    expect(url.origin).toBe('https://market.yousafeconsultancy.com')
    expect(url.searchParams.get('resume')).toBe('order')
    expect(JSON.parse(url.searchParams.get('meta') as string)).toEqual({ pkg: 'basic', note: 'a+b/c=' })
    expect(gatedReturnTo('not a url', 'order')).toBe('https://market.yousafeconsultancy.com/')
  })
})

describe('SQL link mode (relink through Supabase MCP, no service-role key)', () => {
  const { backupProfilesSql, relinkProfilesSql, restoreProfilesSql } = require('@/lib/clerk/providerProvisioning')
  const links = [
    { profileId: '18636eef-d115-41b4-8aeb-0baa71e8618b', clerkUserId: 'user_3DAbcdefGhijkLmnop', previousClerkUserId: 'inactive:providers.invalid:kyle-walker-academic-editor' },
  ]

  test('backup is a read-only select of exactly the affected rows', () => {
    const sql = backupProfilesSql(links.map((l) => l.profileId))
    expect(sql.startsWith('select ')).toBe(true)
    expect(sql).toContain("'18636eef-d115-41b4-8aeb-0baa71e8618b'")
    expect(sql).not.toMatch(/\b(update|delete|insert)\b/i)
  })

  test('relink only touches placeholder rows and never an existing user_ link', () => {
    const sql = relinkProfilesSql(links)
    expect(sql).toContain("set clerk_user_id = v.clerk_user_id")
    expect(sql).toContain("p.clerk_user_id not like 'user\\_%'")
    expect(sql).toContain("p.clerk_user_id like 'inactive:%'")
    expect(sql).toContain('returning p.id, p.username, p.clerk_user_id;')
    expect(relinkProfilesSql([])).toBe('-- nothing to relink')
  })

  test('restore is the exact inverse, guarded on the new id', () => {
    const sql = restoreProfilesSql(links)
    expect(sql).toContain('set clerk_user_id = v.previous')
    expect(sql).toContain('p.clerk_user_id = v.clerk_user_id')
    expect(sql).toContain("'inactive:providers.invalid:kyle-walker-academic-editor'")
  })

  test('rejects injection-shaped ids', () => {
    expect(() => relinkProfilesSql([{ ...links[0], clerkUserId: "user_x'; drop table profiles;--" }])).toThrow()
    expect(() => backupProfilesSql(["1' or '1'='1"])).toThrow()
  })
})
