/**
 * Streamlined attorney / consultant intake:
 *  - short form (fewest required fields), bar-state + bar-number validation,
 *    consultant credential fields, derived country, legacy payloads
 *  - NOT NULL placeholders for fields moved to the post-approval profile
 *  - resume values, confirmation email (+ reserved test domains skipped)
 *  - one-click admin decision helper (role/status, Clerk mirror, email, events)
 *  - in-place Clerk modal switching, cookie-banner spacing, UI pins
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  applicationRow,
  BAR_NUMBER_PATTERN,
  barJurisdictionInfo,
  formValuesFromApplication,
  isValidBarNumber,
  normalizeBarNumber,
  validateProviderApplication,
} from '@/lib/provider/application'
import { decideProviderApplication } from '@/lib/provider/decision'
import { isReservedTestEmail, providerApplicationReceivedEmail, sendEmail } from '@/lib/email'
import { footerSwitchTarget, handleModalFooterClick, openYsSignUp } from '@/lib/auth/ysAuthModal'
import { decisionSummary as attorneyDecisionSummary } from '@/lib/provider/decisionSummary'

const root = join(__dirname, '..')
const src = (p: string) => readFileSync(join(root, p), 'utf8')

const attorney = { provider_type: 'attorney', full_name: 'Ada Lovelace', bar_state: 'New York', bar_number: ' ny 4567890 ', consent: true }
const consultant = {
  provider_type: 'consultant', full_name: 'Cy Consult', country: 'Canada', specialty: 'Admissions & study abroad',
  credential_body: 'ICEF (agency / counsellor)', registration_number: 'ICEF-12345', consent: true,
}

describe('short provider application', () => {
  test('attorney applies with name + bar state + bar number + one consent box; country and regulator are derived', () => {
    const r = validateProviderApplication(attorney) as any
    expect(r.ok).toBe(true)
    expect(r.role).toBe('attorney')
    expect(r.data).toMatchObject({
      country: 'United States', regulator: 'US state bar', licence_number: 'NY 4567890',
      bar_state: 'New York', jurisdictions: ['New York'], good_standing: true, scope_certified: true,
    })
  })

  test('attorney required fields: bar state and bar number (FAQ promises bar checks)', () => {
    const r = validateProviderApplication({ provider_type: 'attorney', full_name: 'A', consent: true }) as any
    expect(r.ok).toBe(false)
    expect(Object.keys(r.errors).sort()).toEqual(['bar_number', 'bar_state', 'country'])
    const bad = validateProviderApplication({ ...attorney, bar_number: 'abc' }) as any
    expect(bad.errors.bar_number).toMatch(/as issued/)
    const noConsent = validateProviderApplication({ ...attorney, consent: false }) as any
    expect(noConsent.errors.consent).toBeTruthy()
  })

  test('"Other" bar jurisdiction needs free text and a country', () => {
    const r = validateProviderApplication({ ...attorney, bar_state: 'Other' }) as any
    expect(r.errors.bar_state_other).toBeTruthy()
    expect(r.errors.country).toBeTruthy()
    const ok = validateProviderApplication({ ...attorney, bar_state: 'Other', bar_state_other: 'Bar Council of India', country: 'India' }) as any
    expect(ok.ok).toBe(true)
    expect(ok.data).toMatchObject({ regulator: 'Other bar / law society', bar_state: 'Bar Council of India', country: 'India' })
  })

  test('non-US bars map to their regulator + country', () => {
    expect(barJurisdictionInfo('England & Wales (solicitor)')).toEqual({ regulator: 'Solicitors Regulation Authority (England & Wales)', country: 'United Kingdom' })
    expect(barJurisdictionInfo('District of Columbia')).toEqual({ regulator: 'US state bar', country: 'United States' })
    expect(barJurisdictionInfo('Narnia')).toBeNull()
  })

  test('bar number validation', () => {
    for (const ok of ['123456', 'SBN 287654', 'NY-4567890', 'R512345', 'F201900123', '12/3456', 'A.B 12']) {
      expect([ok, isValidBarNumber(ok)]).toEqual([ok, true])
    }
    for (const bad of ['', '12', 'ABCDEF', '-12345', '1234567890123456789012', '123$45', 'DROP TABLE']) {
      expect([bad, isValidBarNumber(bad)]).toEqual([bad, false])
    }
    expect(normalizeBarNumber('  ab   12 ')).toBe('AB 12')
    expect(BAR_NUMBER_PATTERN.test('AB 12')).toBe(true)
  })

  test('regulated adviser: regulator + licence number; country derived for known regulators', () => {
    const r = validateProviderApplication({ provider_type: 'regulated_adviser', full_name: 'R', regulator: 'College of Immigration and Citizenship Consultants (RCIC, Canada)', licence_number: 'R512345', consent: 'on' }) as any
    expect(r.ok).toBe(true)
    expect(r.data.country).toBe('Canada')
    const other = validateProviderApplication({ provider_type: 'regulated_adviser', full_name: 'R', regulator: 'Other immigration regulator', licence_number: 'X-123', consent: true }) as any
    expect(other.errors.country).toBeTruthy()
  })

  test('consultant credential fields are optional, validated only when filled; credential URL validated', () => {
    expect(validateProviderApplication(consultant).ok).toBe(true)
    const blank = validateProviderApplication({ ...consultant, credential_body: '', registration_number: '' }) as any
    expect(blank.ok).toBe(true)
    expect(blank.data.credential_body).toBeNull()
    expect(blank.data.registration_number).toBeNull()
    const onlyBody = validateProviderApplication({ ...consultant, registration_number: '' }) as any
    expect(onlyBody.ok).toBe(true)
    const badNumber = validateProviderApplication({ ...consultant, registration_number: 'X' }) as any
    expect(Object.keys(badNumber.errors)).toEqual(['registration_number'])
    const badBody = validateProviderApplication({ ...consultant, credential_body: 'Made-up body' }) as any
    expect(Object.keys(badBody.errors)).toEqual(['credential_body'])
    const url = validateProviderApplication({ ...consultant, credential_url: 'not a url' }) as any
    expect(url.errors.credential_url).toBeTruthy()
  })

  test('legacy long-form payloads still validate', () => {
    const legacy = {
      provider_type: 'attorney', full_name: 'L', country: 'United Kingdom', regulator: 'Solicitors Regulation Authority (England & Wales)',
      licence_number: 'SRA 123456', jurisdictions: 'England & Wales, Scotland', register_url: 'https://www.sra.org.uk/x',
      practice_areas: 'Immigration', capacity: '10', good_standing: true, scope_certified: true, terms_accepted: true,
    }
    const r = validateProviderApplication(legacy) as any
    expect(r.ok).toBe(true)
    expect(r.data.regulator).toBe(legacy.regulator)
    expect(r.data.jurisdictions).toEqual(['England & Wales', 'Scotland'])
  })
})

describe('queue rows for the short form', () => {
  test('attorney NOT NULL columns get safe values for fields moved after approval', () => {
    const { data } = validateProviderApplication(attorney) as any
    const { table, row } = applicationRow(data, { id: 'p1', email: 'a@x.com' }, '2026-10-02T10:00:00Z')
    expect(table).toBe('attorney_applications')
    expect(row).toMatchObject({
      credential_type: 'US state bar', jurisdictions: 'New York', bar_number: 'NY 4567890',
      practice_areas: '', profile_url: '', capacity: '', status: 'pending',
    })
    for (const col of ['email', 'full_name', 'credential_type', 'jurisdictions', 'bar_number', 'practice_areas', 'profile_url', 'capacity']) {
      expect([col, row[col] === null || row[col] === undefined]).toEqual([col, false])
    }
    expect(String(row.notes)).toContain('Bar jurisdiction: New York')
    expect(String(row.notes)).toContain('Bar number: NY 4567890')
    expect(String(row.notes)).toContain('completed after approval')
  })

  test('consultant row carries the credential', () => {
    const { data } = validateProviderApplication({ ...consultant, credential_url: 'https://icef.com/agency/123' }) as any
    const { table, row } = applicationRow(data, { id: 'p2', email: 'c@x.com' }, 'now')
    expect(table).toBe('consultant_applications')
    expect(row).toMatchObject({ registration_number: 'ICEF-12345', specialties: ['Admissions & study abroad'], profile_url: 'https://icef.com/agency/123', capacity: null })
    expect(String(row.notes)).toContain('Credential body: ICEF (agency / counsellor)')
  })

  test('resume values round-trip from the open application', () => {
    const a = validateProviderApplication(attorney) as any
    const aRow = applicationRow(a.data, { id: 'p', email: 'a@x.com' }, 'now').row
    expect(formValuesFromApplication('attorney_applications', aRow)).toMatchObject({
      full_name: 'Ada Lovelace', bar_state: 'New York', bar_number: 'NY 4567890', country: 'United States',
    })
    const c = validateProviderApplication(consultant) as any
    const cRow = applicationRow(c.data, { id: 'p', email: 'c@x.com' }, 'now').row
    expect(formValuesFromApplication('consultant_applications', cRow)).toMatchObject({
      specialty: 'Admissions & study abroad', credential_body: 'ICEF (agency / counsellor)', registration_number: 'ICEF-12345', country: 'Canada',
    })
    expect(formValuesFromApplication('attorney_applications', null)).toEqual({})
  })
})

describe('confirmation email', () => {
  test('reserved / test domains are never sent to', async () => {
    for (const e of ['x@example.com', 'x@EXAMPLE.org', 'a@foo.test', 'a@providers.invalid', 'a@b.example', 'nope', '']) {
      expect([e, isReservedTestEmail(e)]).toEqual([e, true])
    }
    expect(isReservedTestEmail('kyle@gmail.com')).toBe(false)
    const fetchSpy = jest.spyOn(global, 'fetch' as any).mockImplementation(() => { throw new Error('should not fetch') })
    await expect(sendEmail({ to: 'e2e@example.com', subject: 's', html: 'h' })).resolves.toBe('skipped')
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  test('application-received template explains the next steps and escapes the name', () => {
    const a = providerApplicationReceivedEmail({ fullName: '<b>Ada</b>', lane: 'attorney', licensed: true })
    expect(a.subject).toBe('We received your YouSafe attorney application')
    expect(a.html).toContain('&lt;b&gt;Ada&lt;/b&gt;')
    expect(a.html).toContain('under review')
    expect(a.html).toContain('bar / regulator')
    const c = providerApplicationReceivedEmail({ fullName: 'Cy', lane: 'consultant', licensed: false })
    expect(c.subject).toContain('consultant')
    expect(c.html).toContain('credential')
    // Consultants may apply without a credential: don't claim we're verifying one.
    const n = providerApplicationReceivedEmail({ fullName: 'Cy', lane: 'consultant', licensed: false, hasCredential: false })
    expect(n.html).not.toContain('verifying your credential')
    expect(n.html).toContain('reviewing your application')
    expect(src('app/api/provider/apply/route.ts')).toContain('hasCredential: data.provider_type !== \'consultant\' || Boolean(data.credential_body || data.registration_number)')
  })

  test('apply route sends it once per new application and reports the outcome', () => {
    const route = src('app/api/provider/apply/route.ts')
    expect(route).toContain('providerApplicationReceivedEmail')
    expect(route).toMatch(/if \(isNewApplication\)/)
    expect(route).toContain('confirmation_email')
  })
})

/** Minimal chainable Supabase double that records writes. */
function fakeDb(state: { app: Record<string, any> | null; profile: Record<string, any> | null; raceLost?: boolean }) {
  const writes: { table: string; op: string; payload?: any; filters: any[] }[] = []
  const from = (table: string) => {
    const q: any = { table, op: 'select', payload: undefined, filters: [] as any[] }
    const builder: any = {
      select: () => builder,
      eq: (c: string, v: unknown) => { q.filters.push(['eq', c, v]); return builder },
      in: (c: string, v: unknown) => { q.filters.push(['in', c, v]); return builder },
      update: (payload: any) => { q.op = 'update'; q.payload = payload; return builder },
      upsert: (payload: any) => { q.op = 'upsert'; q.payload = payload; writes.push({ table, op: 'upsert', payload, filters: [] }); return Promise.resolve({ error: null }) },
      insert: (payload: any) => { q.op = 'insert'; q.payload = payload; writes.push({ table, op: 'insert', payload, filters: [] }); return Promise.resolve({ error: null }) },
      maybeSingle: () => Promise.resolve({ data: table === 'profiles' ? state.profile : state.app, error: null }),
      then: (resolve: any, reject: any) => {
        if (q.op === 'update') writes.push({ table, op: 'update', payload: q.payload, filters: q.filters })
        const data = q.op === 'update' && table.endsWith('_applications') ? (state.raceLost ? [] : [{ id: state.app?.id }]) : null
        return Promise.resolve({ data, error: null }).then(resolve, reject)
      },
    }
    return builder
  }
  return { db: { from }, writes }
}

describe('one-click decision helper', () => {
  const app = { id: 'app1', profile_id: 'prof1', email: 'ada@lawfirm.com', full_name: 'Ada', jurisdictions: 'New York', practice_areas: '', credential_type: 'US state bar', bar_number: 'NY 4567890', notes: 'Bar jurisdiction: New York', status: 'pending' }
  const profile = { id: 'prof1', clerk_user_id: 'user_abc', role: 'client', status: 'pending' }

  test('approve sets role + status, upserts the attorney, activates listings, mirrors Clerk, emails, logs', async () => {
    const { db, writes } = fakeDb({ app: { ...app }, profile: { ...profile } })
    const mirror = jest.fn().mockResolvedValue(true)
    const send = jest.fn().mockResolvedValue('sent')
    const activate = jest.fn().mockResolvedValue({})
    const r = await decideProviderApplication(db, { lane: 'attorney', applicationId: 'app1', action: 'approve', adminProfileId: 'admin1' }, { mirror, send, activate, now: () => 'T' })
    expect(r).toEqual({ ok: true, status: 'approved', profileId: 'prof1', role: 'attorney', profileStatus: 'active', clerkMirrored: true, email: 'sent' })
    const appUpdate = writes.find((w) => w.table === 'attorney_applications' && w.op === 'update')!
    expect(appUpdate.payload).toMatchObject({ status: 'approved', decided_by: 'admin1', decided_at: 'T' })
    expect(appUpdate.filters).toContainEqual(['in', 'status', ['pending', 'waitlist', 'needs_info']])
    expect(writes.find((w) => w.table === 'profiles')!.payload).toEqual({ role: 'attorney', status: 'active' })
    expect(writes.find((w) => w.table === 'attorneys')!.payload).toMatchObject({ profile_id: 'prof1', bar_number: 'NY 4567890', bar_state: 'New York', credential_type: 'US state bar' })
    expect(activate).toHaveBeenCalledWith(db, 'prof1')
    expect(mirror).toHaveBeenCalledWith('user_abc', { role: 'attorney', status: 'active' })
    expect(send.mock.calls[0][0]).toMatchObject({ to: 'ada@lawfirm.com', subject: 'Your YouSafe attorney application is approved' })
    expect(writes.find((w) => w.table === 'attorney_application_events')!.payload).toMatchObject({ event_type: 'approve', from_status: 'pending', to_status: 'approved' })
  })

  test('reject sets declined, mirrors Clerk and emails (consultant lane)', async () => {
    const cApp = { id: 'c1', profile_id: 'prof2', email: 'cy@x.org', full_name: 'Cy', jurisdictions: null, specialties: ['Mentorship'], registration_number: 'M-1', status: 'waitlist' }
    const { db, writes } = fakeDb({ app: cApp, profile: { id: 'prof2', clerk_user_id: 'user_c', role: 'consultant', status: 'pending' } })
    const mirror = jest.fn().mockResolvedValue(true)
    const send = jest.fn().mockResolvedValue('sent')
    const r = await decideProviderApplication(db, { lane: 'consultant', applicationId: 'c1', action: 'decline', adminProfileId: 'admin1' }, { mirror, send, activate: jest.fn() })
    expect(r).toMatchObject({ ok: true, status: 'declined', role: 'consultant', profileStatus: 'declined' })
    expect(writes.find((w) => w.table === 'profiles')!.payload).toEqual({ status: 'declined' })
    expect(writes.find((w) => w.table === 'consultants')).toBeUndefined()
    expect(mirror).toHaveBeenCalledWith('user_c', { role: 'consultant', status: 'declined' })
    expect(send.mock.calls[0][0].subject).toMatch(/consultant/i)
  })

  test('already-decided or race-lost applications are a 409 with no side effects', async () => {
    const decided = fakeDb({ app: { ...app, status: 'approved' }, profile })
    const send = jest.fn()
    expect(await decideProviderApplication(decided.db, { lane: 'attorney', applicationId: 'app1', action: 'approve', adminProfileId: 'a' }, { send })).toMatchObject({ ok: false, httpStatus: 409 })
    expect(decided.writes).toHaveLength(0)
    const race = fakeDb({ app: { ...app }, profile, raceLost: true })
    expect(await decideProviderApplication(race.db, { lane: 'attorney', applicationId: 'app1', action: 'approve', adminProfileId: 'a' }, { send })).toMatchObject({ ok: false, httpStatus: 409 })
    expect(race.writes.filter((w) => w.table !== 'attorney_applications')).toHaveLength(0)
    expect(send).not.toHaveBeenCalled()
  })

  test('staff profiles are never re-roled; missing application is a 404', async () => {
    const { db, writes } = fakeDb({ app: { ...app }, profile: { ...profile, role: 'admin' } })
    const mirror = jest.fn()
    const r = await decideProviderApplication(db, { lane: 'attorney', applicationId: 'app1', action: 'approve', adminProfileId: 'a' }, { mirror, send: jest.fn().mockResolvedValue('skipped'), activate: jest.fn() })
    expect(r).toMatchObject({ ok: true, role: 'admin', email: 'skipped' })
    expect(writes.find((w) => w.table === 'profiles')).toBeUndefined()
    expect(mirror).not.toHaveBeenCalled()
    const missing = fakeDb({ app: null, profile: null })
    expect(await decideProviderApplication(missing.db, { lane: 'consultant', applicationId: 'x', action: 'decline', adminProfileId: 'a' })).toMatchObject({ ok: false, httpStatus: 404 })
  })

  test('single + bulk routes for both lanes go through the shared helper', () => {
    for (const lane of ['attorney', 'consultant']) {
      for (const file of [`app/api/admin/${lane}-applications/[id]/route.ts`, `app/api/admin/${lane}-applications/bulk/route.ts`]) {
        const code = src(file)
        expect([file, code.includes('decideProviderApplication')]).toEqual([file, true])
        expect([file, /ApprovalEmail\(/.test(code)]).toEqual([file, false])
      }
    }
  })

  test('queue UIs have inline Approve / Reject on open rows and a decision summary toast', () => {
    for (const f of ['components/design/admin-attorney-applications.jsx', 'components/design/admin-consultant-management.jsx']) {
      const code = src(f)
      expect(code).toContain('data-testid="row-approve"')
      expect(code).toContain('data-testid="row-reject"')
      expect(code).toContain("decideRow(a, 'approve')")
      expect(code).toContain("decideRow(a, 'decline')")
      expect(code).toContain("from '@/lib/provider/decisionSummary'")
    }
    expect(attorneyDecisionSummary('approve', { role: 'attorney', profileStatus: 'active', clerkMirrored: true, email: 'sent' }))
      .toBe('Application approved · profile attorney / active · Clerk updated · applicant emailed.')
    expect(attorneyDecisionSummary('decline', { profileStatus: 'declined', clerkMirrored: false, email: 'failed' }))
      .toBe('Application rejected · profile declined · Clerk not updated · email failed.')
  })
})

describe('in-modal Sign in / Sign up switch', () => {
  test('footer link target', () => {
    expect(footerSwitchTarget('sign-up', 'Sign in')).toBe('sign-in')
    expect(footerSwitchTarget('sign-in', 'Sign up')).toBe('sign-up')
    expect(footerSwitchTarget('sign-in', 'Use another method')).toBeNull()
    expect(footerSwitchTarget('sign-up', 'Sign up')).toBeNull()
    expect(footerSwitchTarget(null, 'Sign in')).toBeNull()
  })

  test('swaps modals in place, keeping return_to + intent, instead of navigating', () => {
    const listeners: any[] = []
    const g = global as any
    const prevDoc = g.document
    g.document = { addEventListener: (_t: string, fn: any) => listeners.push(fn) }
    try {
      const clerk = { openSignIn: jest.fn(), openSignUp: jest.fn(), closeSignIn: jest.fn(), closeSignUp: jest.fn() }
      openYsSignUp(clerk, { returnTo: 'https://portal.yousafeconsultancy.com/onboarding/provider?type=attorney', intent: 'attorney' })
      expect(listeners).toHaveLength(1)
      const link = { textContent: 'Sign in', closest: (sel: string) => (sel === '.cl-footerActionLink' ? link : null) }
      const event = { target: link, preventDefault: jest.fn(), stopImmediatePropagation: jest.fn() }
      expect(handleModalFooterClick(event as any)).toBe(true)
      expect(event.preventDefault).toHaveBeenCalled()
      expect(clerk.closeSignUp).toHaveBeenCalled()
      const props = clerk.openSignIn.mock.calls[0][0]
      expect(props.forceRedirectUrl).toBe('https://portal.yousafeconsultancy.com/onboarding/provider?type=attorney')
      expect(props.signUpForceRedirectUrl).toContain('intent=attorney')
      const other = { target: { closest: () => null }, preventDefault: jest.fn(), stopImmediatePropagation: jest.fn() }
      expect(handleModalFooterClick(other as any)).toBe(false)
      expect(other.preventDefault).not.toHaveBeenCalled()
    } finally {
      g.document = prevDoc
    }
  })
})

describe('form + banner UX pins', () => {
  const form = src('app/onboarding/provider/ProviderApplicationForm.tsx')
  test('step indicator, saved progress, Clerk email prefill, short field set', () => {
    expect(form).toContain("PROVIDER_STEPS = ['Create account', 'Apply', 'Under review', 'Approval & profile']")
    expect(form).toContain('<StepIndicator current={1} />')
    expect(form).toContain('window.localStorage.setItem(draftKey')
    expect(form).toContain('window.localStorage.removeItem(draftKey)')
    expect(form).toContain('data-testid="applicant-email"')
    for (const gone of ["'practice_areas'", "'capacity'", "'languages'", "'years_experience'", "'display_name'", "'phone'", "'insurance'", "'notes'"]) {
      expect([gone, form.includes(`text(${gone}`)]).toEqual([gone, false])
    }
    expect(form).toContain("text('bar_number'")
    expect(form).toContain("select('bar_state'")
    expect(form).toContain("select('credential_body'")
    expect(src('app/dashboard/client.tsx')).toContain('<StepIndicator current={2} />')
    const page = src('app/onboarding/provider/page.tsx')
    expect(page).toContain('email={identity?.email')
    expect(page).toContain('formValuesFromApplication')
  })

  test('cookie banner reserves its height so it cannot cover "Submit application"', () => {
    const banner = src('components/CookieConsentBanner.tsx')
    expect(banner).toContain('body.style.paddingBottom')
    expect(banner).toContain('ResizeObserver')
    expect(banner).toMatch(/body\.style\.paddingBottom = previous/)
  })

  test('FAQ bar-check wording is unchanged', () => {
    expect(src('components/design/landing/FAQ.tsx')).toContain(
      'Every attorney on the panel is bar-verified in their stated jurisdiction;',
    )
  })

  test('consultant copy no longer claims every consultant is credentialed', () => {
    const faq = src('components/design/landing/FAQ.tsx')
    expect(faq).toContain('consultants are reviewed before approval, and credentials are shown where held.')
    expect(faq).not.toContain('every consultant is credentialed')
    expect(faq).not.toContain('is verified first')
    expect(src('components/design/landing/FinalCTA.tsx')).toContain("'Bar-verified attorneys; consultants reviewed before approval'")
    expect(src('components/design/landing/FinalCTA.tsx')).not.toContain('reviewed consultants only')
    expect(src('content/messenger-kb/faq.md')).toContain('consultants are reviewed before approval, and credentials are shown where held.')
    // No other Market / portal / assistant surface claims consultants are credentialed or verified.
    for (const file of [
      'content/messenger-kb/faq.md',
      'content/messenger-kb/brand-identity.md',
      'content/messenger-kb/platform.md',
      'components/design/landing/FAQ.tsx',
      'components/design/landing/data/featured-services.ts',
      'app/marketplace/PublicMarketplaceLanding.tsx',
      'lib/seoFactory/providerAuthors.ts',
      'lib/seoSuggest.ts',
      'app/api/compliance/route.ts',
    ]) {
      expect(src(file)).not.toMatch(/every consultant is credentialed|credentialed consultants?|verified consultants?|ICCRC-registered|Consultant body — ICCRC/i)
    }
    for (const file of [
      'components/design/landing/FinalCTA.tsx',
      'components/marketplace/GigDetailPage.tsx',
      'components/marketplace/HeroCaseFileSlideshow.tsx',
      'components/marketplace/FeaturedBriefsGrid.tsx',
      'components/marketplace/MarketplaceGigTrustBar.tsx',
      'components/marketplace/LandingDiscoveryControls.tsx',
      'app/marketplace/PublicMarketplaceLanding.tsx',
      'lib/providerDisplayName.ts',
      'lib/assistantFastReplies.ts',
    ]) {
      expect(src(file)).not.toMatch(/regulated consultant|credentialed consultant/i)
    }
    expect(src('components/marketplace/FeaturedBriefsGrid.tsx')).not.toContain("'Reg.'")
  })
})
