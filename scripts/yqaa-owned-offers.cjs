'use strict'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Callers revalidate the conversation's current-run marker and test identities
// before cleanup. Attorney offers use an inquiry chat_id; the conversation's
// durable reply ledger and visible offer cards provide their association.
async function loadOwnedThreadOffers(request, fixture) {
  if (![fixture.id, fixture.providerProfileId, fixture.profileId].every(id => UUID.test(id)) || fixture.providerProfileId === fixture.profileId) {
    throw new Error('Invalid offer cleanup fixture identity')
  }
  const owner = `sender_id=eq.${fixture.providerProfileId}&recipient_id=eq.${fixture.profileId}`
  const [legacy, commits, cards] = await Promise.all([
    request(`offers?select=id,status,chat_id,sender_id,recipient_id&chat_id=eq.${fixture.id}&${owner}`),
    request(`yqaa_reply_commits?select=offer_id&conversation_id=eq.${fixture.id}`),
    request(`conversation_messages?select=ref_offer_id&conversation_id=eq.${fixture.id}&type=eq.offer&ref_offer_id=not.is.null`),
  ])
  if (![legacy, commits, cards].every(Array.isArray)) throw new Error('Offer ownership lookup was incomplete')
  if (legacy.some(row => row.chat_id !== fixture.id || row.sender_id !== fixture.providerProfileId || row.recipient_id !== fixture.profileId)) {
    throw new Error('Legacy offer ownership mismatch')
  }
  const ids = [...new Set([...legacy.map(row => row.id), ...commits.map(row => row.offer_id), ...cards.map(row => row.ref_offer_id)].filter(id => id != null))].sort()
  if (ids.length > 128 || ids.some(id => !UUID.test(id))) throw new Error('Invalid linked offer identity')
  if (!ids.length) return []
  const rows = await request(`offers?select=id,status,chat_id,sender_id,recipient_id&id=in.(${ids.join(',')})&${owner}`)
  if (!Array.isArray(rows) || rows.length !== ids.length || new Set(rows.map(row => row.id)).size !== ids.length || rows.some(row => !ids.includes(row.id) || typeof row.status !== 'string' || !row.status || row.sender_id !== fixture.providerProfileId || row.recipient_id !== fixture.profileId)) {
    throw new Error('Linked offer ownership could not be verified')
  }
  return rows
}

async function cancelOwnedThreadOffers(request, fixture) {
  const pending = (await loadOwnedThreadOffers(request, fixture)).filter(row => row.status === 'pending')
  if (pending.length) {
    await request(`offers?id=in.(${pending.map(row => row.id).join(',')})&sender_id=eq.${fixture.providerProfileId}&recipient_id=eq.${fixture.profileId}&status=eq.pending`, {
      method: 'PATCH', prefer: 'return=minimal', body: { status: 'cancelled', updated_at: new Date().toISOString() },
    })
  }
  return (await loadOwnedThreadOffers(request, fixture)).filter(row => row.status === 'pending')
}

module.exports = { loadOwnedThreadOffers, cancelOwnedThreadOffers }
