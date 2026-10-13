'use strict'

function registerOwnedGig(registry, fixture) {
  if (!fixture?.gigId || !fixture?.profileId || !fixture?.clerkUserId) {
    throw new Error('Cannot register an unverified gig fixture for cleanup.')
  }
  registry.push(fixture)
  return fixture
}

module.exports = { registerOwnedGig }
