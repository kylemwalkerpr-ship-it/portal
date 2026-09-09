import { pathSlugConflict, routeSubtypeConflict } from '@/lib/seoFactory/routeSubtypeGuard'

describe('route subtype guard — plural student labels', () => {
  const housingTitle = 'Housing Deposit Dispute Letter for US Students (2026)'
  const housingPath =
    'landing-page/app/blog/international-student-housing-deposit-dispute-letter-template/page.tsx'

  it('treats "Students" as the same route signal as a student slug', () => {
    expect(pathSlugConflict(housingTitle, housingPath).conflict).toBe(false)
  })

  it('treats singular and plural student subjects as the same subtype', () => {
    expect(
      routeSubtypeConflict(
        housingTitle,
        'International Student Housing Deposit Dispute Letter Template',
      ).conflict,
    ).toBe(false)
  })

  it('still rejects an unrelated subject on a student-specific slug', () => {
    expect(
      pathSlugConflict('Housing Deposit Dispute Letter for US Tenants (2026)', housingPath).conflict,
    ).toBe(true)
  })
})
