import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..')
const workflow = fs.readFileSync(path.join(root, '.github/workflows/yqaa-live-acceptance.yml'), 'utf8')
const harness = fs.readFileSync(path.join(root, 'scripts/yqaa-live-acceptance.mjs'), 'utf8')
const { registerOwnedGig, registerOwnedConversation, providerForThread, assertFreshParticipantPair, verifyOwnedConversation } = require('../scripts/yqaa-fixture-registry.cjs')

describe('manual YQAA live acceptance safety guards', () => {
  test('local runtime is bounded and cleanup has independent request allowance',()=>{
    expect(harness).toContain('ACCEPTANCE_RUN_BUDGET_MS = 30 * 60_000')
    expect(harness).toContain('runWithDeadline(runAcceptance,ACCEPTANCE_RUN_BUDGET_MS,runController')
    expect(harness).toContain("acceptancePhase.run({phase:'cleanup',signal:cleanupController.signal},cleanup)")
    expect(harness).toContain("phase?.phase === 'cleanup' ? phase.signal : runController.signal")
    expect(harness).toContain("requiredAcceptanceSettings(process.env.YQAA_RELEASE_MODE)")
    expect(harness).toContain('activeReleaseMatches(active,version,deployment)')
    expect(harness).toContain('chromium.launchServer({headless:true,timeout:15_000})')
    expect(harness).toContain("browserServer.process()?.kill('SIGKILL')")
  })

  test('incident mode initializes database before loading source', () => {
    expect(harness).toMatch(/if \(replayIncident === INCIDENT_MODE\) \{\s+initializeFixtureDatabase\(\)/)
  })

  test('a failed public probe permits independent DM checks but cannot mark full acceptance passed', () => {
    expect(harness).toContain('return ok')
    expect(harness).toContain("if (!publicGenerationOk) throw new Error('Public generation gate failed; DM results do not clear full acceptance.')")
  })

  test('quiet cleanup fetches every ownership field before validating the current-run thread', () => {
    const quiet = harness.slice(harness.indexOf('const quietOutcome ='))
    expect(quiet).toContain('conversations?select=id,participant_a,participant_b,context_kind,context_id,status,metadata&id=eq.${thread.id}')
    expect(quiet).not.toContain('conversations?select=metadata&id=eq.${thread.id}')
    expect(quiet).toContain('verifyOwnedConversation(conversations?.[0], thread, CURRENT_RUN_MARKER)')
  })

  test('category fixture setup failures do not masquerade as orientation failures', () => {
    expect(harness).toContain('let currentScenarioIndex = -1')
    expect(harness).toContain("currentScenarioIndex < 0 ? 'fixture_setup' : scenarios[currentScenarioIndex].name")
    expect(harness).toContain('scenarios.slice(currentScenarioIndex + 1, MAX_TURNS)')
  })

  test('receipt path matches workflow upload and success rechecks deployment identity', () => {
    expect(harness).toContain("path.join(process.env.RUNNER_TEMP || path.resolve('artifacts'), 'yqaa-live-acceptance')")
    expect(workflow).toContain('yqaa-live-acceptance/yqaa-live-acceptance-receipt.json')
    expect(harness).toMatch(/const messengerOk = await messengerSmoke\(\);?\s+await assertLiveIdentity\(\);?\s+if \(!messengerOk\)[^\n]+\s+if \(!publicGenerationOk\) throw new Error\([^\n]+\);?\s+receipt.status = 'passed'/)
  })

  test('orientation scenario rejects mechanically phrased copy', () => {
    expect(harness).toContain('acceptanceAssertions.containsMechanicalOrientationCopy(reply.body)')
    expect(harness).toContain('response used canned, mechanical orientation wording')
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
    expect(harness.indexOf('registerOwnedConversation(fixtureThreads')).toBeGreaterThan(harness.indexOf('verifyOwnedConversation(row, threadFixture, CURRENT_RUN_MARKER)'))
    expect(harness).toContain("if (thread.clientKind === 'designated') return verifyDesignatedClient(thread.profileId, thread.clerkUserId)")
    expect(harness).toContain("verifyOwnedFixtureProfile(thread.providerProfileId, thread.providerClerkUserId, fixtureProviderRole(thread))")
    expect(harness).not.toContain("rows[0].metadata?.yqaa_live_acceptance !== true) throw new Error('fixture ownership")
  })

  test('current-run ownership fence rejects a different run even for the same participants', () => {
    const fixture = { id: 'conversation-1', participantA: 'client-a', participantB: 'provider-b', gigId: 'gig-1' }
    const row = { id: fixture.id, participant_a: 'client-a', participant_b: 'provider-b', context_kind: 'gig', context_id: 'gig-1', metadata: { yqaa_live_acceptance: true, yqaa_live_acceptance_run: 'run-current' } }
    expect(() => verifyOwnedConversation(row, fixture, 'run-current')).not.toThrow()
    expect(() => verifyOwnedConversation({ ...row, metadata: { ...row.metadata, yqaa_live_acceptance_run: 'other-run' } }, fixture, 'run-current')).toThrow('current-run marker')
    expect(() => verifyOwnedConversation({ ...row, participant_a: 'someone-else' }, fixture, 'run-current')).toThrow('current-run marker')
    expect(harness).toContain("method: 'POST', prefer: 'return=representation'")
    expect(harness).toContain("ai_mode: 'auto', ai_disclosed: false, yqaa_live_acceptance: true, yqaa_live_acceptance_run: CURRENT_RUN_MARKER")
    expect(harness).not.toContain("rpc/get_or_create_conversation")
  })

  test('conversation ownership is registered immediately after atomic insert or verified uncertain recovery', () => {
    const createAt = harness.indexOf("method: 'POST', prefer: 'return=representation'", harness.indexOf('for (const threadKey'))
    const registerAt = harness.indexOf('registerOwnedConversation(fixtureThreads, threadFixture)', createAt)
    const messagesAt = harness.indexOf('conversation_messages?select=id,metadata&conversation_id=eq.${id}', createAt)
    expect(createAt).toBeGreaterThan(-1)
    expect(registerAt).toBeGreaterThan(createAt)
    expect(messagesAt).toBeGreaterThan(registerAt)
    expect(harness).toContain("if (/database 409/.test(String(error?.message))) throw error")
    expect(harness).toContain('const recovered = await dbRequest(`conversations?select=id,participant_a,participant_b,context_kind,context_id,status,metadata&participant_a=eq.${participantA}&participant_b=eq.${participantB}`)')
    expect(harness).toContain('verifyOwnedConversation(rows?.[0], thread, CURRENT_RUN_MARKER)')
  })

  test('workflow is manual only, exact-main scoped, and contents-read only', () => {
    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).not.toMatch(/^\s+(push|pull_request):/m)
    expect(workflow).toContain("github.ref == 'refs/heads/main'")
    expect(workflow).toContain('permissions:\n  contents: read')
    expect(workflow).not.toContain('deployments: write')
  })

  test('Foley/Taylor replay is a separate bounded incident mode with secret source IDs', () => {
    expect(workflow).toContain('replay_incident:')
    expect(workflow).toContain('- none')
    expect(workflow).toContain('- foley_taylor_20261005')
    expect(workflow).toContain('YQAA_FT_SOURCE_CONVERSATION_ID: ${{ secrets.YQAA_FT_SOURCE_CONVERSATION_ID }}')
    expect(workflow).toContain('YQAA_FT_SOURCE_CLIENT_ID: ${{ secrets.YQAA_FT_SOURCE_CLIENT_ID }}')
    expect(workflow).toContain('YQAA_FT_SOURCE_PROVIDER_ID: ${{ secrets.YQAA_FT_SOURCE_PROVIDER_ID }}')
    expect(harness).toContain('const MAX_INCIDENT_TURNS = 12')
    expect(harness).toContain("const INCIDENT_MODE = 'foley_taylor_20261005'")
    expect(harness).toContain("receipt.status = 'incident_completed'")
    expect(harness).toContain("receipt.mode = 'full_acceptance'")
    expect(harness).toContain("const replayIncident = String(process.env.YQAA_REPLAY_INCIDENT || 'none')")
    expect(harness).toMatch(/if \(replayIncident === INCIDENT_MODE\)[\s\S]*?await runIncidentReplay\(sourceData, fixtureData\)[\s\S]*?\} else \{[\s\S]*?await messengerSmoke\(\)/)
    expect(harness).toContain('metrics.posture = \'stopped_on_pause\'')
    expect(harness).toContain("ai_paused_reason: 'incident_replay_hold'")
    expect(harness).toContain('turns.fill(\'\')')
    expect(harness).not.toContain('c8d71ea4-8129-415f-9890-7f674e68c83c')
    expect(harness).not.toContain('6c82f2a2-5e47-4ae1-a1ab-7958922860a3')
    expect(harness).not.toContain('0921bc5f-9686-4505-8648-9c55bbda72df')
  })

  test('incident replay reads source without writes and emits finite metrics only', () => {
    const source = harness.slice(harness.indexOf('async function loadIncidentSource()'), harness.indexOf('async function createIncidentFixtures'))
    const replay = harness.slice(harness.indexOf('async function runIncidentReplay'), harness.indexOf('async function fixtureClerkUser'))
    expect(source).toContain('conversation_messages?select=sender_id,body,created_at')
    expect(source).toContain("source?.context_kind === 'gig' || (source?.context_kind === 'general' && source?.context_id == null)")
    expect(source).toContain('!participants.includes(sourceClientId) || !participants.includes(sourceProviderId)')
    expect(source).toContain('sourceClientId === sourceProviderId || !validSourceContext')
    expect(source).not.toContain("method: 'PATCH'")
    expect(source).not.toContain("method: 'POST'")
    expect(replay).toContain('MAX_INCIDENT_TURNS')
    expect(replay).toContain('state.ai_mode === \'paused\'')
    expect(replay).toContain('metrics.orientation_present')
    expect(replay).toContain('budget_range: incidentBudgetRange(turns)')
    expect(replay).toContain('metrics.duplicate_reply_count')
    expect(replay).toContain('metrics.evidence_count')
    expect(replay).not.toContain('receipt.incident = { ...metrics, reply')
    expect(replay).not.toContain('reply.body,')
    expect(replay).not.toMatch(/console\.(log|error).*turns|console\.(log|error).*reply/i)
  })

  test('incident gig mirror uses deployed columns and provider preferences', () => {
    const fixtures = harness.slice(harness.indexOf('async function createIncidentFixtures'), harness.indexOf('async function runIncidentReplay'))
    expect(fixtures).toContain('unit_pricing,hourly_rate_cents,pitch,description,jurisdiction&provider_id=eq.')
    expect(fixtures).not.toContain('negotiation_flex_pct')
    expect(fixtures).not.toContain('min_floor_cents: sourceGig')
    expect(fixtures).toContain('provider_pricing_preferences?select=negotiation_enabled')
    expect(harness).toContain('const code = /^(?:PGRST\\d{3}|[0-9A-Z]{5})$/')
    const request = harness.slice(harness.indexOf('async function dbRequest'), harness.indexOf('async function dbRequest') + 900)
    expect(request).not.toContain('data.message')
  })

  test('workflow requires the exact deployed SHA and build identity before the live harness', () => {
    expect(workflow).toContain('inputs.expected_sha')
    expect(workflow).toContain('inputs.expected_build_id')
    expect(workflow).toContain('git rev-parse HEAD')
    expect(harness).toContain('/actions/workflows/deploy.yml/runs?branch=main&status=success&per_page=1')
    expect(harness).toContain('latest?.head_sha === expectedSha')
    expect(harness).toContain('ids.includes(expectedBuild)')
  })

  test('public generation health probe runs after deployed identity and stores only bounded diagnostics', () => {
    expect(harness).toMatch(/\} else \{\s+const publicGenerationOk = await publicGenerationProbe\(\);?\s+await launchOwnedBrowser\(\)/)
    expect(harness).toContain("'For a public service listing, what questions should someone ask before choosing a provider?'")
    expect(harness).toContain('model_category: modelCategory')
    expect(harness).toContain('await response.json().catch(() => null)')
    expect(harness).toMatch(/model;dur=\\d\+;desc=.*auth\|config\|protocol\|network\|timeout\|other/)
    expect(harness).not.toContain('reply: await response.json()')
    expect(harness).not.toContain('response_body:')
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
    expect(harness).toContain('The server quote record for this scope is USD $')
    expect(harness).toContain('Would you accept $${counterDollars} USD')
    expect(harness).toContain('counterCents / 100')
    expect(harness).toContain('scopeHash !== scope?.scope_hash')
    expect(harness).toContain('Number(scopeValue) !== 3')
    expect(harness).toContain('scope_hash === scopeHash && Number(item.cents) > 0')
    expect(harness).toContain('provider_attention: true, ai_paused: true')
    expect(harness).toContain('frustration escalated and paused for provider within one turn')
    expect(harness).toContain('waste of my time')
    expect(harness).toContain('scope_depth: \'partial\', scope_units: 3')
    expect(harness).toContain('scope_depth: \'full\', scope_units: 6')
    expect(harness).not.toContain('The quoted total is CAD 600')
    expect(harness).not.toContain('would you accept CAD 510')
    expect(harness).toContain('frustration escalated and paused for provider within one turn')
    expect(harness).not.toContain('c2a46c19-abd0-4404-91e2-f4139938428d')
    expect(harness).toContain('/api/messages/conversations/')
    expect(harness).toContain('MAX_TURNS = 6')
    expect(harness).toContain("getByTitle('Jump to: Pricing', { exact: true })")
    expect(harness).toContain('MAX_WAIT_MS = 45_000')
    expect(harness).toContain("label = 'request', timeoutMs = 10_000")
    expect(harness).toContain('AbortSignal.timeout(timeoutMs)')
    for (const scenario of ['orientation', 'budget', 'scope_narrowing', 'counter', 'lowball', 'frustration', 'provider_attention']) {
      expect(harness).toContain(`name: '${scenario}'`)
    }
  })

  test('optional designated client stays read-only and gets six distinct participant pairs', () => {
    expect(workflow).toContain('client_profile_id:')
    expect(workflow).toContain('YQAA_CLIENT_PROFILE_ID: ${{ inputs.client_profile_id }}')
    expect(workflow).not.toContain('client_email')
    expect(workflow).not.toContain('YQAA_CLIENT_EMAIL')
    expect(harness).toContain("const DESIGNATED_CLIENT_ID = '35c89030-b9bd-4a51-877f-739e97fe2d04'")
    expect(harness).toContain("matches[0].role !== 'client' || matches[0].status !== 'active'")
    expect(harness).toContain('item.verification?.status === \'verified\'')
    expect(harness).toContain("['negotiation', 'attention'] : ['shared']")
    expect(harness).toContain('providerForThread(fixtureProviders, category.id, threadKey, Boolean(designatedClient))')
    expect(harness).toContain("clientKind: designatedClient ? 'designated' : 'synthetic'")
    expect(harness).toContain('if (profileId !== DESIGNATED_CLIENT_ID || !clerkUserId)')
    expect(harness).toContain("profile.role !== 'client' || profile.status !== 'active'")
    expect(harness).not.toContain('profiles?on_conflict=id')
    expect(harness).not.toContain('email: designatedEmail')
    expect(harness).toContain('assertFreshParticipantPair(preexisting)')
    expect(harness).toContain('if (ownMessages?.length) throw new Error')
    const providers = ['education', 'academic-writing', 'mentorship'].flatMap((category) => ['negotiation', 'attention'].map((scenario) => ({ category, scenario, profileId: `${category}-${scenario}-provider` })))
    const pairs = ['education', 'academic-writing', 'mentorship'].flatMap((category) => ['negotiation', 'attention'].map((scenario) => [`known-client`, providerForThread(providers, category, scenario, true)?.profileId].sort().join(':')))
    expect(pairs).toHaveLength(6)
    expect(new Set(pairs).size).toBe(6)
    expect(() => assertFreshParticipantPair([])).not.toThrow()
    expect(() => assertFreshParticipantPair([{ id: 'existing' }])).toThrow('refusing reuse or reset')
    expect(providerForThread(providers, 'education', 'negotiation', false)?.profileId).toBe('education-negotiation-provider')
  })

  test('designated Clerk ticket is consumed once from plain sign-in and exact identity is enforced', () => {
    const auth = harness.slice(harness.indexOf('async function authenticatedPage'), harness.indexOf('async function api('))
    expect(auth).toContain('await page.goto(`${BASE}/sign-in`')
    expect(auth).not.toContain('__clerk_ticket=')
    expect(auth.match(/client\.signIn\.create\(/g)).toHaveLength(1)
    expect(auth).toContain("strategy: 'ticket', ticket")
    expect(auth).toContain('await root.setActive({ session: attempt.createdSessionId })')
    expect(auth).toContain('userId !== expectedUserId')
    expect(auth).toContain('clerk_identity_mismatch')
    expect(auth).toContain('clerk_http_4xx')
    expect(auth).toContain('clerk_http_5xx')
    expect(auth).toContain('clerk_sdk_rejected')
    expect(auth).not.toMatch(/failure\.(message|toString)|JSON\.stringify\(failure/)
  })

  test('designated cleanup verifies the known profile and never mutates its profile or Clerk identity', () => {
    const cleanup = harness.slice(harness.indexOf('async function cleanup()'))
    expect(cleanup).toContain('verifyDesignatedClient(thread.profileId, thread.clerkUserId)')
    expect(cleanup).toContain("profile.is_test_account !== false || profile.is_hidden !== false")
    expect(cleanup).toContain('const identity = await clerkApi(`/users/${encodeURIComponent(clerkUserId)}`)')
    expect(cleanup).not.toMatch(/profiles[^\n]*(PATCH|POST)/)
    expect(cleanup).not.toMatch(/clerkApi\([^\n]*method:\s*['"](POST|PATCH|DELETE)/)
    expect(cleanup).toContain("body: { status: 'archived'")
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

 test('cleanup requires the verified provider role and never defaults to consultant', () => {
 const { fixtureProviderRole } = require('../scripts/yqaa-fixture-registry.cjs')
 expect(fixtureProviderRole({providerRole:'attorney'})).toBe('attorney')
 expect(fixtureProviderRole({providerRole:'consultant'})).toBe('consultant')
 expect(()=>fixtureProviderRole({})).toThrow()
 expect(()=>fixtureProviderRole({providerRole:'client'})).toThrow()
 expect(harness.match(/verifyOwnedFixtureProfile\(thread.providerProfileId, thread.providerClerkUserId, fixtureProviderRole\(thread\)\)/g)).toHaveLength(3)
 })
