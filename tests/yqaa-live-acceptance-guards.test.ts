import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..')
const workflow = fs.readFileSync(path.join(root, '.github/workflows/yqaa-live-acceptance.yml'), 'utf8')
const harness = fs.readFileSync(path.join(root, 'scripts/yqaa-live-acceptance.mjs'), 'utf8')
const { registerOwnedGig, registerOwnedConversation } = require('../scripts/yqaa-fixture-registry.cjs')

describe('manual YQAA live acceptance safety guards', () => {
  test('receipt path matches workflow upload and success rechecks deployment identity', () => {
    expect(harness).toContain("path.join(process.env.RUNNER_TEMP || path.resolve('artifacts'), 'yqaa-live-acceptance')")
    expect(workflow).toContain('yqaa-live-acceptance/yqaa-live-acceptance-receipt.json')
    expect(harness).toMatch(/await messengerSmoke\(\);?\s+await assertLiveIdentity\(\);?\s+receipt.status = 'passed'/)
  })

  test('a verified gig is registered for cleanup before tier setup can fail', async () => {
    const cleanupRegistry: Array<{ gigId: string; profileId: string; clerkUserId: string }> = []
    const verifiedGig = { gigId: 'owned-gig-1', profileId: 'owned-profile-1', clerkUserId: 'owned-user-1' }
    const setup = async () => {
      registerOwnedGig(cleanupRegistry, verifiedGig)
      throw new Error('simulated tier write failure')
    }
    const cleanupSpy = jest.fn(async (registered: typeof cleanupRegistry) => registered.map((fixture) => fixture.gigId))

    await expect(setup()).rejects.toThrow('simulated tier write failure')
    await expect(cleanupSpy(cleanupRegistry)).resolves.toEqual(['owned-gig-1'])
    expect(cleanupSpy).toHaveBeenCalledWith([verifiedGig])
    expect(harness.indexOf('registerOwnedGig(fixtureProviders, { category: category.id')).toBeLessThan(harness.indexOf("await dbRequest('gig_tiers'"))
  })

  test('conversation registry deduplicates seven scenarios into two fixtures per category', () => {
    const registry: Array<{ id: string; profileId: string; clerkUserId: string; providerProfileId: string; gigId: string }> = []
    for (const category of ['education', 'academic-writing', 'mentorship']) {
      for (const scenario of ['orientation', 'budget', 'scope_narrowing', 'counter', 'lowball', 'frustration', 'provider_attention']) {
        registerOwnedConversation(registry, { id: `${category}-${scenario === 'provider_attention' ? 'attention' : 'negotiation'}`, profileId: `client-${category}`, clerkUserId: `user-${category}`, providerProfileId: `provider-${category}`, gigId: `gig-${category}` })
      }
    }
    expect(registry).toHaveLength(6)
    expect(new Set(registry.map((fixture) => fixture.id)).size).toBe(6)
  })

  test('verified conversation is registered before a failed setup marker write and remains safely pausable', async () => {
    const registry: Array<{ id: string; profileId: string; clerkUserId: string; providerProfileId: string; providerClerkUserId: string; gigId: string }> = []
    const fixture = { id: 'conversation-1', profileId: 'client-profile', clerkUserId: 'client-user', providerProfileId: 'provider-profile', providerClerkUserId: 'provider-user', gigId: 'gig-1' }
    const setup = async () => {
      const verified = { participants: [fixture.profileId, fixture.providerProfileId], context: fixture.gigId }
      if (!verified.participants.includes(fixture.profileId) || !verified.participants.includes(fixture.providerProfileId) || verified.context !== fixture.gigId) throw new Error('ownership')
      registerOwnedConversation(registry, fixture)
      throw new Error('metadata marker PATCH failed')
    }
    await expect(setup()).rejects.toThrow('metadata marker PATCH failed')
    const pause = jest.fn(async (registered: typeof registry) => registered.map((item) => item.id))
    await expect(pause(registry)).resolves.toEqual(['conversation-1'])
    expect(harness.indexOf('registerOwnedConversation(fixtureThreads')).toBeLessThan(harness.indexOf('yqaa_live_acceptance_run:'))
    expect(harness).toContain("verifyOwnedFixtureProfile(thread.profileId, thread.clerkUserId, 'client')")
    expect(harness).toContain("verifyOwnedFixtureProfile(thread.providerProfileId, thread.providerClerkUserId, 'consultant')")
    expect(harness).not.toContain("rows[0].metadata?.yqaa_live_acceptance !== true) throw new Error('fixture ownership")
  })

  test('workflow is manual only, exact-main scoped, and contents-read only', () => {
    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).not.toMatch(/^\s+(push|pull_request):/m)
    expect(workflow).toContain("github.ref == 'refs/heads/main'")
    expect(workflow).toContain('permissions:\n  contents: read')
    expect(workflow).not.toContain('deployments: write')
  })

  test('workflow requires the exact deployed SHA and build identity before the live harness', () => {
    expect(workflow).toContain('inputs.expected_sha')
    expect(workflow).toContain('inputs.expected_build_id')
    expect(workflow).toContain('git rev-parse HEAD')
    expect(harness).toContain('/actions/workflows/deploy.yml/runs?branch=main&status=success&per_page=1')
    expect(harness).toContain('latest?.head_sha === expectedSha')
    expect(harness).toContain('ids.includes(expectedBuild)')
  })

  test('fixtures use supported username-only identities, hidden test data, and three continuous category threads', () => {
    expect(harness).toContain('Clerk username-only capability')
    expect(harness).toContain('userSettings.email_address?.required')
    expect(harness).toContain('is_test_account: true, is_hidden: true')
    expect(harness).toContain('gig.is_hidden !== true')
    expect(harness).toContain("status: 'paused'")
    expect(harness).toContain("strategy: 'ticket', ticket")
    expect(harness).not.toContain("strategy: 'sign_in_token'")
    expect(harness).toContain("id: 'education', subcategoryId: 'university-admissions'")
    expect(harness).toContain("id: 'academic-writing', subcategoryId: 'application-essays'")
    expect(harness).toContain("id: 'mentorship', subcategoryId: 'student-mentorship'")
    expect(harness).toContain("thread.scenario === 'negotiation'")
    expect(harness).toContain('for (let index = 0; index < MAX_TURNS; index++)')
    expect(harness).toContain('no quote produced in server conversation memory; refusing to invent one.')
    expect(harness).toContain('The server quote record for this scope is CAD $')
    expect(harness).toContain('Would you accept $${counterDollars} CAD')
    expect(harness).toContain('counterCents / 100')
    expect(harness).toContain('scopeHash !== scope?.scope_hash')
    expect(harness).toContain('Number(scopeValue) !== 3')
    expect(harness).toContain('scope_hash === scopeHash && Number(item.cents) > 0')
    expect(harness).toContain('provider_attention: true, ai_paused: true')
    expect(harness).toContain('frustration escalated and paused for provider within one turn')
    expect(harness).toContain('waste of my time')
    expect(harness).toContain('scope_depth: \'partial\', scope_units: 3')
    expect(harness).toContain('scope_depth: \'full\', scope_units: 12')
    expect(harness).not.toContain('The quoted total is CAD 600')
    expect(harness).not.toContain('would you accept CAD 510')
    expect(harness).toContain('frustration escalated and paused for provider within one turn')
    expect(harness).not.toContain('c2a46c19-abd0-4404-91e2-f4139938428d')
    expect(harness).toContain('/api/messages/conversations/')
    expect(harness).toContain('MAX_TURNS = 6')
    expect(harness).toContain("getByTitle('Jump to: Pricing', { exact: true })")
    expect(harness).toContain('MAX_WAIT_MS = 45_000')
    expect(harness).toContain('AbortSignal.timeout(10_000)')
    for (const scenario of ['orientation', 'budget', 'scope_narrowing', 'counter', 'lowball', 'frustration', 'provider_attention']) {
      expect(harness).toContain(`name: '${scenario}'`)
    }
  })

  test('acceptance requires a real generated reply and cleans up through soft actions only', () => {
    expect(harness).toContain('message.metadata?.ai_generated')
    expect(harness).toContain('message.metadata?.yqaa_trigger_message_id === triggerId')
    expect(harness).toContain('diagnostic.ai_last_error || diagnostic.ai_last_skip')
    expect(harness).toContain('function safeFailure')
    expect(harness).toContain("replace(/(__clerk_ticket=)")
    expect(harness).toContain("body: { status: 'archived'")
    expect(harness).toContain("status: 'cancelled'")
    expect(harness).toContain('ai_paused_reason: \'acceptance_cleanup\'')
    expect(harness).toContain('late_ai_replies: lateReplies.length')
    expect(harness).toContain('new_offers_after_pause: newOffers.length')
    expect(harness).toContain('quietOutcome.ai_paused !== true')
    expect(harness).not.toMatch(/\/api\/(orders|payments)/)
    expect(harness).toContain("status: 'paused'")
    expect(workflow).toContain('timeout-minutes: 45')
    expect(harness).toContain("archive_action: 'guarded_owner_scoped_database_update'")
    expect(harness).toContain('conversation_status: archivedRows?.[0]?.status || \'missing\'')
    expect(harness).toContain('pending_offers_remaining: Array.isArray(pending) ? pending.length : null')
    expect(harness).not.toMatch(/\.delete\(/)
    expect(harness).not.toMatch(/console\.(log|error)\([^\n]*(token|secret|reply\.body)/i)
  })

  test('workflow passes secrets only in its live CI step and retains a short sanitized receipt', () => {
    expect(workflow).toContain('CLERK_SECRET_KEY: ${{ secrets.CLERK_SECRET_KEY }}')
    expect(workflow).toContain('SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}')
    expect(workflow).toContain('retention-days: 7')
    expect(harness).toContain('reply_length_bucket')
    expect(harness).not.toContain('JSON.stringify(scenario')
    expect(harness).not.toContain('reply.body,')
  })
})
