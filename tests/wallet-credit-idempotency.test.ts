const mockSelect = jest.fn()
const mockRpc = jest.fn()
jest.mock('@/lib/supabase', () => ({ createSupabaseAdminClient: () => ({
  rpc: mockRpc,
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mockSelect }) }) }),
}) }))

import { credit } from '@/lib/wallet'

describe('wallet credit references', () => {
  beforeEach(() => { mockRpc.mockReset(); mockSelect.mockReset() })
  test('a unique violation for a deterministic reference is idempotent success', async () => {
    const existing = { id: 'tx-1', reference: 'refund:debit-1', balance_after_cents: 1000 }
    mockRpc.mockReturnValue({ single: async () => ({ data: null, error: { code: '23505', message: 'duplicate key' } }) })
    mockSelect.mockResolvedValue({ data: existing, error: null })
    await expect(credit('profile-1', 100, 'Refund', 'refund:debit-1')).resolves.toEqual(existing)
  })
})
