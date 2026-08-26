import { providerDisplayName, providerDisplayLabel } from '../lib/providerDisplayName'

describe('providerDisplayName — blank-name gig card fix', () => {
  it('uses full_name when present', () => {
    expect(providerDisplayName({ full_name: 'Jane Attorney' })).toBe('Jane Attorney')
  })

  it('treats an empty-string full_name as missing (the gig-card blank-name bug)', () => {
    expect(providerDisplayName({ full_name: '' })).toBe('YouSafe provider')
    expect(providerDisplayName({ full_name: '   ' })).toBe('YouSafe provider')
  })

  it('falls through to username then email', () => {
    expect(providerDisplayName({ full_name: '', username: 'jane_law' })).toBe('jane_law')
    expect(providerDisplayName({ full_name: '', username: '', email: 'jane@law.com' })).toBe('jane@law.com')
  })

  it('falls back to the caller-supplied label', () => {
    expect(providerDisplayName(null, 'Service provider')).toBe('Service provider')
    expect(providerDisplayName(undefined, 'X')).toBe('X')
  })

  it('providerDisplayLabel is role-aware', () => {
    expect(providerDisplayLabel({ full_name: '' }, 'consultant')).toBe('Regulated consultant')
    expect(providerDisplayLabel({ full_name: '' }, 'attorney')).toBe('Licensed attorney')
    expect(providerDisplayLabel({ full_name: 'Jane' }, 'attorney')).toBe('Jane')
  })
})
