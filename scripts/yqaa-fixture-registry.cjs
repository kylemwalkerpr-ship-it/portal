'use strict'

function registerOwnedGig(registry, fixture) {
  if (!fixture?.gigId || !fixture?.profileId || !fixture?.clerkUserId) {
    throw new Error('Cannot register an unverified gig fixture for cleanup.')
  }
  registry.push(fixture)
  return fixture
}

function registerOwnedConversation(registry, fixture) {
  if (!fixture?.id || !fixture?.profileId || !fixture?.clerkUserId || !fixture?.providerProfileId || !fixture?.gigId) {
    throw new Error('Cannot register an unverified conversation fixture for cleanup.')
  }
  const existing = registry.find((item) => item.id === fixture.id)
  if (existing) return existing
  registry.push(fixture)
  return fixture
}

function fixtureProviderRole(fixture) {
  if (!['attorney', 'consultant'].includes(fixture?.providerRole)) throw new Error('Verified fixture provider role is missing or unsupported.')
  return fixture.providerRole
}

function providerForThread(providers, category, scenario, designatedMode) {
  return providers.find((item) => item.category === category && (!designatedMode || item.scenario === scenario)) || null
}

function assertFreshParticipantPair(existingRows) {
  if (Array.isArray(existingRows) && existingRows.length > 0) {
    throw new Error('Conversation already exists for this participant pair; refusing reuse or reset.')
  }
  return true
}

function verifyOwnedConversation(row, fixture, runMarker) {
  if (!row || row.id !== fixture.id || !runMarker ||
      row.participant_a !== fixture.participantA || row.participant_b !== fixture.participantB ||
      row.context_kind !== 'gig' || row.context_id !== fixture.gigId ||
      row.metadata?.yqaa_live_acceptance !== true ||
      row.metadata?.yqaa_live_acceptance_run !== runMarker) {
    throw new Error('Conversation fixture ownership or current-run marker could not be revalidated.')
  }
  return true
}

module.exports = { registerOwnedGig, registerOwnedConversation, providerForThread, assertFreshParticipantPair, verifyOwnedConversation, fixtureProviderRole }
