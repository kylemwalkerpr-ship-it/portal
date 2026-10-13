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

module.exports = { registerOwnedGig, registerOwnedConversation }
