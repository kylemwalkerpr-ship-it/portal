import {
  getVerifiedPrimaryEmail,
  profileEmailMatchesExactly,
} from '@/lib/clerkVerifiedEmail'

describe('getVerifiedPrimaryEmail', () => {
  test('accepts a verified SDK primary email and normalizes it', () => {
    expect(getVerifiedPrimaryEmail({
      primaryEmailAddressId: 'email-primary',
      emailAddresses: [
        {
          id: 'email-primary',
          emailAddress: ' Person@Example.COM ',
          verification: { status: 'verified' },
        },
      ],
    })).toBe('person@example.com')
  })

  test('accepts a verified REST primary email and normalizes it', () => {
    expect(getVerifiedPrimaryEmail({
      primary_email_address_id: 'email-primary',
      email_addresses: [
        {
          id: 'email-primary',
          email_address: ' Person@Example.COM ',
          verification: { status: 'verified' },
        },
      ],
    })).toBe('person@example.com')
  })

  test.each(['unverified', 'transferable', 'failed', 'expired', null])(
    'rejects a primary address with verification status %s',
    (status) => {
      expect(getVerifiedPrimaryEmail({
        primaryEmailAddressId: 'email-primary',
        emailAddresses: [{
          id: 'email-primary',
          emailAddress: 'person@example.com',
          verification: status === null ? null : { status },
        }],
      })).toBeNull()
    },
  )

  test('rejects a verified non-primary address', () => {
    expect(getVerifiedPrimaryEmail({
      primaryEmailAddressId: 'email-primary',
      emailAddresses: [
        {
          id: 'email-secondary',
          emailAddress: 'secondary@example.com',
          verification: { status: 'verified' },
        },
        {
          id: 'email-primary',
          emailAddress: 'primary@example.com',
          verification: { status: 'unverified' },
        },
      ],
    })).toBeNull()
  })

  test.each([
    ['missing primary ID', { emailAddresses: [{ id: 'email-first', emailAddress: 'first@example.com', verification: { status: 'verified' } }] }],
    ['null primary ID', { primaryEmailAddressId: null, emailAddresses: [{ id: 'email-first', emailAddress: 'first@example.com', verification: { status: 'verified' } }] }],
    ['primary ID absent from list', { primaryEmailAddressId: 'missing', emailAddresses: [{ id: 'email-first', emailAddress: 'first@example.com', verification: { status: 'verified' } }] }],
    ['empty email list', { primaryEmailAddressId: 'email-primary', emailAddresses: [] }],
  ])('rejects fallback when there is %s', (_label, user) => {
    expect(getVerifiedPrimaryEmail(user)).toBeNull()
  })

  test('rejects REST data with no primary ID instead of selecting the first address', () => {
    expect(getVerifiedPrimaryEmail({
      email_addresses: [{
        id: 'email-first',
        email_address: 'first@example.com',
        verification: { status: 'verified' },
      }],
    })).toBeNull()
  })
})

describe('profileEmailMatchesExactly', () => {
  test('matches only after trimming and lowercasing both addresses', () => {
    expect(profileEmailMatchesExactly(' Person@Example.COM ', 'person@example.com')).toBe(true)
  })

  test.each([
    ['underscore pattern collision', 'personX@example.com', 'person_@example.com'],
    ['percent pattern collision', 'personX@example.com', 'person%@example.com'],
    ['different address', 'other@example.com', 'person@example.com'],
    ['missing profile email', null, 'person@example.com'],
    ['missing Clerk email', 'person@example.com', null],
  ])('rejects %s', (_label, profileEmail, clerkEmail) => {
    expect(profileEmailMatchesExactly(profileEmail, clerkEmail)).toBe(false)
  })
})
