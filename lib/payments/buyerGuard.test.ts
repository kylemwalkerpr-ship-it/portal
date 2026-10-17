import { guardBuyer } from './buyerGuard'

describe('guardBuyer', () => {
  it('requires authentication', () => expect(guardBuyer(null, {})).toEqual({ error: 'Unauthorized', status: 401 }))
  it('allows client and legacy student roles', () => {
    expect(guardBuyer({ profileId: 'c', role: 'client' }, {})).toBeNull()
    expect(guardBuyer({ profileId: 's', role: 'student' }, {})).toBeNull()
  })
  it('rejects non buyer roles by default', () => expect(guardBuyer({ profileId: 'a', role: 'admin' }, {})).toEqual({ error: 'Buyer account required', status: 403 }))
  it('allows explicitly configured test and settings owner ids', () => {
    expect(guardBuyer({ profileId: 'test-id', role: 'admin' }, { PAYMENT_TEST_BUYER_IDS: 'x, test-id' })).toBeNull()
    const ownerId = '123e4567-e89b-12d3-a456-426614174000'
    expect(guardBuyer({ profileId: ownerId, role: 'attorney' }, { PAYMENT_SETTINGS_OWNER_IDS: ownerId })).toBeNull()
  })
})
