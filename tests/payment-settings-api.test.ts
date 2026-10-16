import fs from 'node:fs'

const OWNER_ID = 'd90e74a5-b4cf-4f3e-81ed-9ef71e7235a7'
const OTHER_ID = '11111111-1111-4111-8111-111111111111'
let mockAuthContext: any
let mockDb: any
let mockSnapshot: any
const mockRpc = jest.fn()
const mockSendAlert = jest.fn()

jest.mock('@/lib/portalAuth', () => ({ requirePortalUser: jest.fn(async () => mockAuthContext) }))
jest.mock('@/lib/fiverr', () => ({ getPaymentSettingsForApi: jest.fn(async () => ({})) }))
jest.mock('@/lib/supabase', () => ({ getSupabaseAdminClient: jest.fn(() => mockDb) }))
jest.mock('@/lib/payments/settings', () => ({ getPaymentSettings: jest.fn(async () => mockSnapshot) }))
jest.mock('@/lib/payments/adminNotifications', () => ({ sendPaymentSettingsAlert: (...args: unknown[]) => mockSendAlert(...args) }))

function settingsSnapshot() {
  return {
    version: 1,
    providers: [
      { provider: 'nmi', enabled: true, retired: false, test_mode_owner_only: false, test_allowlist: [], priority: 10, is_default: true, updated_by: null, updated_at: null, version: 1 },
      { provider: 'authorizenet', enabled: true, retired: false, test_mode_owner_only: false, test_allowlist: [], priority: 20, is_default: false, updated_by: null, updated_at: null, version: 1 },
      { provider: 'manual', enabled: true, retired: false, test_mode_owner_only: false, test_allowlist: [], priority: 100, is_default: false, updated_by: null, updated_at: null, version: 1 },
      { provider: 'pesapal', enabled: false, retired: false, test_mode_owner_only: true, test_allowlist: [], priority: 200, is_default: false, updated_by: null, updated_at: null, version: 1 },
    ],
    methods: [],
    global: { country_default_routing_enabled: false, fx_markup_bps: 0, version: 1 },
  }
}

function patch(body: unknown) {
  return new Request('http://portal.test/api/admin/payment-settings', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'user-agent': 'jest' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  process.env.PAYMENT_SETTINGS_OWNER_IDS = OWNER_ID
  mockAuthContext = { db: null, profileId: OWNER_ID, role: 'admin', profile: { id: OWNER_ID } }
  mockDb = {
    from: jest.fn(() => ({ insert: jest.fn(async () => ({ error: null })) })),
    rpc: mockRpc,
  }
  mockAuthContext.db = mockDb
  mockSnapshot = settingsSnapshot()
  mockRpc.mockReset().mockResolvedValue({ data: 2, error: null })
  mockSendAlert.mockReset().mockResolvedValue(undefined)
})

describe('PATCH /api/admin/payment-settings', () => {
  it('rejects a non-admin with 403', async () => {
    mockAuthContext.role = 'support'
    const { PATCH } = await import('@/app/api/admin/payment-settings/route')
    const response = await PATCH(patch({ expectedVersion: 1, reason: 'test update', providerChanges: [{ provider: 'nmi', enabled: false }] }))
    expect(response.status).toBe(403)
    expect(mockRpc).not.toHaveBeenCalled()
    expect(mockSendAlert).toHaveBeenCalledWith(expect.objectContaining({ action: 'rejected' }))
  })

  it('rejects an admin who is not on the owner list with 403', async () => {
    mockAuthContext.profileId = OTHER_ID
    const { PATCH } = await import('@/app/api/admin/payment-settings/route')
    const response = await PATCH(patch({ expectedVersion: 1, reason: 'test update', providerChanges: [{ provider: 'nmi', enabled: false }] }))
    expect(response.status).toBe(403)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it.each([
    ['unknown provider', { providerChanges: [{ provider: 'unknown_gateway', enabled: true }] }],
    ['unknown method', { methodChanges: [{ provider: 'pesapal', method: 'cash', enabled: true }] }],
  ])('rejects an %s with 400', async (_label, change) => {
    const { PATCH } = await import('@/app/api/admin/payment-settings/route')
    const response = await PATCH(patch({ expectedVersion: 1, reason: 'validate registry', ...change }))
    expect(response.status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns 409 on a version conflict and records the rejection', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'payment_settings_version_conflict' } })
    const { PATCH } = await import('@/app/api/admin/payment-settings/route')
    const response = await PATCH(patch({ expectedVersion: 1, reason: 'disable card', providerChanges: [{ provider: 'nmi', enabled: false }] }))
    expect(response.status).toBe(409)
    expect(mockDb.from).toHaveBeenCalledWith('payment_settings_audit')
    expect(mockSendAlert).toHaveBeenCalledWith(expect.objectContaining({ action: 'rejected' }))
  })

  it('sends the change alert through the notification layer after one atomic audited patch', async () => {
    const { PATCH } = await import('@/app/api/admin/payment-settings/route')
    const response = await PATCH(patch({
      expectedVersion: 1,
      reason: 'Set NMI card priority',
      providerChanges: [{ provider: 'nmi', priority: 5 }],
      methodChanges: [{ provider: 'nmi', method: 'card', priority: 5 }],
    }))
    expect(response.status).toBe(200)
    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(mockRpc).toHaveBeenCalledWith('apply_payment_settings_patch', expect.objectContaining({
      p_expected_version: 1,
      p_provider_changes: [{ provider: 'nmi', priority: 5 }],
      p_method_changes: [{ provider: 'nmi', method: 'card', priority: 5 }],
    }))
    expect(mockSendAlert).toHaveBeenCalledWith(expect.objectContaining({ action: 'changed', reason: 'Set NMI card priority' }))
    expect(mockSendAlert).toHaveBeenCalledWith(expect.objectContaining({
      diff: expect.objectContaining({
        providerChanges: [expect.objectContaining({ before: expect.objectContaining({ priority: 10 }), after: expect.objectContaining({ priority: 5 }) })],
        methodChanges: [expect.objectContaining({ before: null, after: expect.objectContaining({ priority: 5 }) })],
      }),
    }))
  })

  it('uses row triggers for one audit entry per changed settings row and protects the log from edits', () => {
    const migration = fs.readFileSync('supabase/migrations/20261016000000_pesapal_payment_provider_settings.sql', 'utf8')
    expect(migration).toMatch(/create trigger payment_provider_settings_audit/i)
    expect(migration).toMatch(/create trigger payment_method_settings_audit/i)
    expect(migration).toMatch(/create trigger payment_global_settings_audit/i)
    expect(migration).toMatch(/insert into public\.payment_settings_audit/i)
    expect(migration).toMatch(/payment_settings_audit is append-only/i)
  })
})
