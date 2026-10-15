const { loadOwnedThreadOffers, cancelOwnedThreadOffers } = require('../scripts/yqaa-owned-offers.cjs')

const fixture = { id: '00000000-0000-4000-8000-000000000001', providerProfileId: '00000000-0000-4000-8000-000000000002', profileId: '00000000-0000-4000-8000-000000000003' }
const offer = { id: '00000000-0000-4000-8000-000000000004', chat_id: '00000000-0000-4000-8000-000000000005', sender_id: fixture.providerProfileId, recipient_id: fixture.profileId, status: 'pending' }

function database({ row = { ...offer }, linked = true, legacy = false, missing = false, persist = true } = {}) {
  const request = jest.fn(async (query: string, init?: any): Promise<any> => {
    if (init?.method === 'PATCH') { if (persist) row.status = 'cancelled'; return null }
    if (query.startsWith('yqaa_reply_commits?')) return linked ? [{ offer_id: row.id }] : []
    if (query.startsWith('conversation_messages?')) return linked ? [{ ref_offer_id: row.id }] : []
    if (query.startsWith('offers?') && query.includes('&chat_id=')) return legacy ? [row] : []
    if (query.startsWith('offers?') && query.includes('&id=in.')) return missing ? [] : [row]
    throw new Error('Unexpected database operation')
  })
  return request
}

it('finds an attorney offer through the conversation ledger even though chat_id is an inquiry', async () => {
  expect(offer.chat_id).not.toBe(fixture.id)
  expect(await loadOwnedThreadOffers(database(), fixture)).toEqual([offer])
})

it('cancels only the linked offer ID with sender, recipient and pending-state fences', async () => {
  const request = database()
  expect(await cancelOwnedThreadOffers(request, fixture)).toEqual([])
  const mutation = request.mock.calls.find(([, init]) => init?.method === 'PATCH')!
  expect(mutation[0]).toBe(`offers?id=in.(${offer.id})&sender_id=eq.${fixture.providerProfileId}&recipient_id=eq.${fixture.profileId}&status=eq.pending`)
  expect(mutation[1].body.status).toBe('cancelled')
})

it('does not report cleanup success when a cancellation failed to persist', async () => {
  expect(await cancelOwnedThreadOffers(database({ persist: false }), fixture)).toHaveLength(1)
})

it('supports legacy consultant offers associated directly with the conversation', async () => {
  const row = { ...offer, chat_id: fixture.id }
  expect(await loadOwnedThreadOffers(database({ row, legacy: true, linked: false }), fixture)).toEqual([row])
})

it('detects a new inquiry-scoped offer during a quiet-period resample', async () => {
  const before = await loadOwnedThreadOffers(database({ linked: false }), fixture)
  const after = await loadOwnedThreadOffers(database(), fixture)
  expect(after.filter((row: any) => !before.some((old: any) => old.id === row.id))).toHaveLength(1)
})

it('refuses a linked offer belonging to another recipient before any mutation', async () => {
  const request = database({ row: { ...offer, recipient_id: '00000000-0000-4000-8000-000000000099' } })
  await expect(cancelOwnedThreadOffers(request, fixture)).rejects.toThrow(/ownership/)
  expect(request.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false)
})

it('fails closed when a linked offer cannot be read', async () => {
  await expect(loadOwnedThreadOffers(database({ missing: true }), fixture)).rejects.toThrow(/ownership/)
})

it('rejects malformed linked IDs before constructing a mutation', async () => {
  const request = database({ row: { ...offer, id: 'not-a-uuid' } })
  await expect(cancelOwnedThreadOffers(request, fixture)).rejects.toThrow(/identity/)
  expect(request.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false)
})
