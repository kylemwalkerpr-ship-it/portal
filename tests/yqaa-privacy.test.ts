import { applyMemoryMutation, consentCheckedAtCommit, privacyScopedMessages, type YqaaConsent } from '@/lib/yqaaPrivacy'

const record: YqaaConsent = {
  conversation_id: 'scope', subject_id: 'client', provider_id: 'provider',
  version: 2, granted: true, cross_site_linking: false, memory_after: '2026-10-16T10:00:00Z',
}
const envelope = { scopeId: 'scope', subjectId: 'client', providerId: 'provider', expectedVersion: 2 }

test('explicit scoped consent permits the current epoch', () => {
  expect(consentCheckedAtCommit(record, envelope)).toBe(true)
})
test.each([
  ['no consent', null], ['withdrawn', { ...record, granted: false }],
  ['foreign user', { ...record, subject_id: 'other' }],
  ['foreign provider', { ...record, provider_id: 'other' }],
  ['foreign scope', { ...record, conversation_id: 'other' }],
  ['cross-site link', { ...record, cross_site_linking: true }],
  ['unversioned', { ...record, version: 0 }], ['invalid boundary', { ...record, memory_after: 'invalid' }],
])('%s fails closed', (_label, value) => {
  expect(consentCheckedAtCommit(value as YqaaConsent | null, envelope)).toBe(false)
})
test('withdrawal after retrieval fences the pending envelope, including after regrant', () => {
  expect(consentCheckedAtCommit(record, envelope)).toBe(true)
  expect(consentCheckedAtCommit({ ...record, version: 3, granted: false }, envelope)).toBe(false)
  expect(consentCheckedAtCommit({ ...record, version: 4 }, envelope)).toBe(false)
})
test('forget invalidates prior facts at the next retrieval; invalid dates fail closed', () => {
  const rows = [
    { id: 'forgotten', created_at: '2026-10-16T09:59:59Z' },
    { id: 'boundary', created_at: record.memory_after },
    { id: 'new', created_at: '2026-10-16T10:00:01Z' }, { id: 'unknown' },
  ]
  expect(privacyScopedMessages(rows, record).map(row => row.id)).toEqual(['new'])
  expect(privacyScopedMessages(rows, { ...record, memory_after: 'invalid' })).toEqual([])
})
test('CAS version, replay key and authenticated subject are passed unchanged to the atomic RPC', async () => {
  const rpc = jest.fn().mockResolvedValue({ data: { version: 3, replayed: false }, error: null })
  await applyMemoryMutation({ rpc }, {
    subjectId: 'client', scopeId: 'scope', expectedVersion: 2, requestId: 'request', action: 'forget',
  })
  expect(rpc).toHaveBeenCalledWith('mutate_yqaa_privacy', {
    p_conversation_id: 'scope', p_subject_id: 'client', p_expected_version: 2,
    p_request_id: 'request', p_action: 'forget', p_explicit_opt_in: false,
  })
})
test('persistence failures are never reported as confirmed mutations', async () => {
  await expect(applyMemoryMutation({ rpc: async () => ({ error: new Error('offline') }) }, {
    subjectId: 'client', scopeId: 'scope', expectedVersion: 2, requestId: 'request', action: 'withdraw',
  })).rejects.toThrow('offline')
})
