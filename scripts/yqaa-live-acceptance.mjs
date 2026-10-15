#!/usr/bin/env node
/**
 * Bounded, manual-only production acceptance for authenticated YQAA Messenger.
 * All app records are owned test fixtures; no customer profile is edited.
 */
import { randomBytes, createHash } from 'node:crypto'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { AsyncLocalStorage } from 'node:async_hooks'
import releaseIdentityModule from './yqaa-release-identity.cjs'
import path from 'node:path'
import { chromium } from '@playwright/test'
import registryModule from './yqaa-fixture-registry.cjs'
import acceptanceAssertions from './yqaa-acceptance-assertions.cjs'
import incidentQuality from './yqaa-incident-quality.cjs'
import ownedOffers from './yqaa-owned-offers.cjs'
import browserNavigation from './yqaa-browser-navigation.cjs'

const { registerOwnedGig, registerOwnedConversation, providerForThread, assertFreshParticipantPair, verifyOwnedConversation, fixtureProviderRole } = registryModule
const { loadOwnedThreadOffers, cancelOwnedThreadOffers } = ownedOffers

const BASE = 'https://portal.yousafeconsultancy.com'
const MAX_TURNS = 6
const MAX_INCIDENT_TURNS = 12
const MAX_WAIT_MS = 45_000
const RUN_ID = process.env.GITHUB_RUN_ID || `manual-${Date.now()}`
const RUN_ATTEMPT = process.env.GITHUB_RUN_ATTEMPT || '1'
const CURRENT_RUN_MARKER = safeHash(`${RUN_ID}:${RUN_ATTEMPT}`)
const PROVIDER_USERNAME = `yqaa_live_acceptance_${RUN_ID}_${RUN_ATTEMPT}`.slice(0, 64)
const DESIGNATED_CLIENT_ID = '35c89030-b9bd-4a51-877f-739e97fe2d04'
const INCIDENT_MODE = 'foley_taylor_20261005'
const ARTIFACT_DIR = process.env.GITHUB_STEP_SUMMARY ? path.join(process.env.RUNNER_TEMP || path.resolve('artifacts'), 'yqaa-live-acceptance') : path.resolve('artifacts/yqaa-live-acceptance')
const receipt = { version: 1, started_at: new Date().toISOString(), checks: [], scenarios: [], cleanup: 'pending' }
let browser
let browserServer
let clientPage
let providerPage
let fixtureProviders = []
let fixtureThreads = []
let supabaseUrl
let serviceKey
const runController = new AbortController()
const acceptancePhase = new AsyncLocalStorage()
const ACCEPTANCE_RUN_BUDGET_MS = 30 * 60_000

function safeHash(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 12)
}

function safeFailure(value) {
  return String(value instanceof Error ? value.message : value || 'unknown acceptance failure')
    .replace(/(__clerk_ticket=)[^&\s"'<>]+/gi, '$1[redacted]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[redacted-token]')
    .replace(/\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9_-]+/g, '[redacted-key]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 240)
}

function check(name, ok, detail = '') {
  receipt.checks.push({ name, status: ok ? 'passed' : 'failed', ...(detail ? { detail } : {}) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`)
  if (!ok) throw new Error(`Acceptance check failed: ${name}`)
}

async function checkedFetch(url, init = {}, label = 'request', timeoutMs = 10_000) {
  let response
  try {
    const timeout = AbortSignal.timeout(timeoutMs)
    const phase = acceptancePhase.getStore()
    const signal = AbortSignal.any([timeout,phase?.phase === 'cleanup' ? phase.signal : runController.signal])
    response = await fetch(url, { ...init, signal })
  } catch {
    throw new Error(`${label}: network failure`)
  }
  return response
}

async function clerkApi(pathname, init = {}) {
  const response = await checkedFetch(`https://api.clerk.com/v1${pathname}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  }, 'Clerk backend')
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`Clerk backend ${response.status} at ${pathname}`)
  return body
}

function supabaseHeaders(extra = {}) {
  return { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', ...extra }
}

async function dbRequest(tablePath, { method = 'GET', body, prefer } = {}) {
  const headers = supabaseHeaders(prefer ? { Prefer: prefer } : {})
  const response = await checkedFetch(`${supabaseUrl}/rest/v1/${tablePath}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }, 'fixture database')
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const code = /^(?:PGRST\d{3}|[0-9A-Z]{5})$/.test(String(data?.code || '')) ? data.code : 'unknown'
    throw new Error(`Fixture database ${response.status} ${method} ${code} at ${tablePath.split('?')[0]}`)
  }
  return data
}

async function assertLiveIdentity() {
  const expectedSha = String(process.env.YQAA_EXPECTED_SHA || '').toLowerCase()
  const expectedBuild = String(process.env.YQAA_EXPECTED_BUILD_ID || '')
  if (process.env.YQAA_RELEASE_MODE === 'authorized-local') {
    const deployment = JSON.parse(await readFile(process.env.YQAA_LOCAL_RELEASE_RECEIPT || '', 'utf8'))
    check('authorized local release receipt', releaseIdentityModule.validateLocalReleaseReceipt(deployment, expectedSha, expectedBuild))
    const git = (...args) => releaseIdentityModule.boundedIdentityCommand('git',args)
    check('exact main checkout SHA', git('rev-parse','HEAD') === expectedSha)
    check('clean source checkout', git('status','--porcelain') === '')
    check('canonical repository remote', /^https:\/\/github\.com\/kylemwalkerpr-ship-it\/portal(?:\.git)?$/.test(git('remote','get-url','origin')))
    const remoteSha = git('ls-remote','origin','refs/heads/main').split(/\s+/)[0]
    check('GitHub main matches local release', remoteSha === expectedSha)
    const wrangler = (...args) => JSON.parse(releaseIdentityModule.boundedIdentityCommand(process.execPath,[path.resolve('node_modules/wrangler/bin/wrangler.js'),...args]))
    const active = wrangler('deployments','list','--name','yousafe-portal','--json')
    const version = wrangler('versions','view',deployment.worker_version,'--name','yousafe-portal','--json')
    check('active Worker matches source and build receipt',releaseIdentityModule.activeReleaseMatches(active,version,deployment))
    receipt.deployment = {sha:expectedSha,build_id_hash:safeHash(expectedBuild),worker_version:deployment.worker_version,mode:'authorized_local'}
  } else {
    const repo = process.env.GITHUB_REPOSITORY || ''
    const ref = process.env.GITHUB_REF || ''
    const checkoutSha = String(process.env.GITHUB_SHA || '').toLowerCase()
    check('manual main ref', ref === 'refs/heads/main' && /^[^/]+\/[^/]+$/.test(repo))
    check('exact main checkout SHA', /^[0-9a-f]{40}$/.test(expectedSha) && checkoutSha === expectedSha)
    check('expected deployed build ID supplied', /^[A-Za-z0-9_-]{10,}$/.test(expectedBuild))

    const runsUrl = `https://api.github.com/repos/${repo}/actions/workflows/deploy.yml/runs?branch=main&status=success&per_page=1`
    const runsResponse = await checkedFetch(runsUrl, { headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } }, 'official deployment identity')
    if (!runsResponse.ok) throw new Error(`Official deployment identity lookup failed (${runsResponse.status})`)
    const runs = await runsResponse.json()
    const latest = runs.workflow_runs?.[0]
    check('latest successful official deploy matches SHA', latest?.head_sha === expectedSha && latest?.conclusion === 'success', latest ? `run #${latest.run_number}` : 'no successful deploy run')
    receipt.deployment = {sha:expectedSha,build_id_hash:safeHash(expectedBuild),workflow_run:latest.run_number,mode:'official_workflow'}
  }

  const root = await checkedFetch(`${BASE}/?__yqaa_acceptance=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' } }, 'production build identity')
  if (!root.ok) throw new Error(`Production build identity page returned ${root.status}`)
  const html = await root.text()
  const ids = []
  for (const pattern of [/\\?"b\\?":\\?"([A-Za-z0-9_-]{10,})\\?"/, /buildId["']?\s*[:=]\s*["']([A-Za-z0-9_-]{10,})["']/i, /\/_next\/static\/([A-Za-z0-9_-]{10,})\//]) {
    const found = html.match(pattern)
    if (found?.[1]) ids.push(found[1])
  }
  check('production serves expected build ID', ids.includes(expectedBuild))
  const manifest = await checkedFetch(`${BASE}/_next/static/${expectedBuild}/_buildManifest.js`, {}, 'production build manifest')
  check('expected deployed build manifest is live', manifest.status === 200, `HTTP ${manifest.status}`)
  if (!receipt.deployment) receipt.deployment = { sha: expectedSha, build_id_hash: safeHash(expectedBuild), mode: 'official_workflow' }
}

async function publicGenerationProbe() {
  const startedAt = Date.now()
  const response = await checkedFetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: 'For a public service listing, what questions should someone ask before choosing a provider?' }],
      origin: BASE,
    }),
  }, 'public YQAA generation probe', 50_000)
  const timing = response.headers.get('server-timing') || ''
  const match = timing.match(/(?:^|,\s*)model;dur=\d+;desc="(ok|auth|config|protocol|network|timeout|other|failed)"/)
  const modelCategory = match?.[1] || 'missing'
  // Consume and discard the response. The receipt stores only HTTP status,
  // the bounded model category, and latency; never prompt or response text.
  const payload = await response.json().catch(() => null)
  const substantive = typeof payload?.reply === 'string' && payload.reply.trim().length >= 100 && /(?:questions?|ask|provider|service)/i.test(payload.reply)
  const latencyMs = Date.now() - startedAt
  receipt.public_generation = {
    status: response.status,
    model_category: modelCategory,
    substantive_output_present: substantive,
    latency_ms: latencyMs,
  }
  const ok = response.status === 200 && modelCategory === 'ok' && substantive
  receipt.checks.push({ name: 'public YQAA generation probe', status: ok ? 'passed' : 'failed', detail: `HTTP ${response.status}; model=${modelCategory}; ${latencyMs} ms` })
  console.log(`${ok ? 'PASS' : 'FAIL'} public YQAA generation probe: HTTP ${response.status}; model=${modelCategory}`)
  return ok
}

function initializeFixtureDatabase() {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_JWT
  if (!envUrl || !serviceKey) throw new Error('Supabase URL and service-role secret are required in CI.')
  supabaseUrl = envUrl.replace(/\/$/, '')
  if (new URL(supabaseUrl).hostname.endsWith('.supabase.co') !== true) throw new Error('Refusing non-production Supabase host.')
}

async function loadAndVerifyFixtures() {
  check('three distinct scoped service categories', categories.length >= 3 && new Set(categories.map((category) => category.id)).size === categories.length && new Set(categories.map((category) => category.subcategoryId)).size === categories.length)
  check('continuous negotiation plus isolated attention scenario per category', scenarios.filter((scenario) => scenario.name !== 'provider_attention').length === MAX_TURNS)
  initializeFixtureDatabase()
  const designatedProfileId = String(process.env.YQAA_CLIENT_PROFILE_ID || '').trim()
  let designatedClient = null
  if (designatedProfileId) {
    if (designatedProfileId !== DESIGNATED_CLIENT_ID) throw new Error('Designated client profile ID is not authorized.')
    const matches = await dbRequest(`profiles?select=id,email,role,status,is_test_account,is_hidden,clerk_user_id&id=eq.${encodeURIComponent(designatedProfileId)}`)
    if (matches?.length !== 1 || matches[0].id !== DESIGNATED_CLIENT_ID || !matches[0].email || matches[0].role !== 'client' || matches[0].status !== 'active' || matches[0].is_test_account !== false || matches[0].is_hidden !== false || !matches[0].clerk_user_id) throw new Error('Designated client profile does not uniquely match the authorized active client.')
    const clerkIdentity = await clerkApi(`/users/${encodeURIComponent(matches[0].clerk_user_id)}`)
    const verifiedEmail = (clerkIdentity.email_addresses || []).find((item) => item.id === clerkIdentity.primary_email_address_id && item.email_address?.toLowerCase() === matches[0].email.toLowerCase() && item.verification?.status === 'verified')
    if (clerkIdentity.id !== matches[0].clerk_user_id || !verifiedEmail) throw new Error('Designated client Clerk identity or verified primary email could not be confirmed.')
    designatedClient = { id: matches[0].id, clerkUserId: matches[0].clerk_user_id }
  }
  const capabilityResponse = await checkedFetch('https://clerk.portal.yousafeconsultancy.com/v1/environment', { headers: { Origin: BASE } }, 'Clerk username-only capability')
  if (!capabilityResponse.ok) throw new Error('Clerk username-only capability could not be verified; no fixture identities created.')
  const userSettings = (await capabilityResponse.json())?.user_settings?.attributes || {}
  if (!userSettings.username?.enabled || userSettings.email_address?.required || !userSettings.password?.enabled) throw new Error('Clerk does not support username-only fixture identities; no fixture identities created.')

  for (const category of categories) {
    const providerScenarios = designatedClient ? ['negotiation', 'attention'] : ['shared']
    for (const providerScenario of providerScenarios) {
    const providerUsername = `${PROVIDER_USERNAME}_${category.id}${providerScenario === 'shared' ? '' : `_${providerScenario}`}`.slice(0, 64)
    const providerUser = await fixtureClerkUser(providerUsername, 'yqaa_live_acceptance', 'Provider')
    const provider = await fixtureProfile(providerUser.id, `yqaa-live-${category.id}${providerScenario === 'shared' ? '' : `-${providerScenario}`}-${RUN_ID}-${RUN_ATTEMPT}@example.invalid`, 'consultant', 'YQAA Acceptance Provider')
    const slug = `yqaa-live-${RUN_ID}-${RUN_ATTEMPT}-${category.id}${providerScenario === 'shared' ? '' : `-${providerScenario}`}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 80)
    const priorGigs = await dbRequest(`gigs?select=id,provider_id,status,is_hidden,slug,title,category,subcategory,tags&slug=eq.${encodeURIComponent(slug)}`)
    let gig
      if (priorGigs?.length) {
        gig = priorGigs[0]
        if (gig.provider_id !== provider.id || gig.status !== 'paused' || gig.is_hidden !== true || gig.category !== category.id || gig.subcategory !== category.subcategoryId || gig.title !== category.gigTitle || !gig.tags?.includes('acceptance-fixture')) throw new Error('Existing gig fixture ownership, taxonomy, or hidden paused state could not be confirmed.')
        registerOwnedGig(fixtureProviders, { category: category.id, scenario: providerScenario, profileId: provider.id, clerkUserId: providerUser.id, providerRole: provider.role, gigId: gig.id, username: providerUsername })
      } else {
      const rows = await dbRequest('gigs?select=id,provider_id,status,is_hidden,slug,category,subcategory', {
        method: 'POST', prefer: 'return=representation',
        body: [{ provider_id: provider.id, provider_type: 'consultant', title: category.gigTitle, category: category.id, subcategory: category.subcategoryId, slug, pitch: 'Synthetic acceptance fixture only.', description: 'Paused, hidden test fixture for general organizational support. No actual clients, licensed credentials, advice, or paid services are represented.', requirements: 'No actual client materials. Test fixture only.', status: 'paused', is_hidden: true, tags: ['synthetic', 'acceptance-fixture'] }],
      })
        gig = rows?.[0]
        if (!gig?.id || gig.provider_id !== provider.id || gig.status !== 'paused' || gig.is_hidden !== true || gig.category !== category.id || gig.subcategory !== category.subcategoryId) throw new Error('Could not confirm hidden paused taxonomy gig fixture.')
        registerOwnedGig(fixtureProviders, { category: category.id, scenario: providerScenario, profileId: provider.id, clerkUserId: providerUser.id, providerRole: provider.role, gigId: gig.id, username: providerUsername })
        await dbRequest('gig_tiers', { method: 'POST', prefer: 'return=minimal', body: [
        { gig_id: gig.id, tier: 'basic', title: 'Three document checklist', description: 'Organize a checklist for up to 3 application documents; no advice or form completion.', price: 2500, delivery_days: 5, revisions: 1, scope_depth: 'partial', scope_units: 3, features: ['Synthetic test fixture'] },
        { gig_id: gig.id, tier: 'standard', title: 'Six document checklist', description: 'Organize a checklist for up to 6 application documents; no advice or form completion.', price: 5000, delivery_days: 7, revisions: 1, scope_depth: 'full', scope_units: 6, features: ['Synthetic test fixture'] },
      ] })
    }
    }
  }

  for (const category of categories) {
    for (const threadKey of ['negotiation', 'attention']) {
      const provider = providerForThread(fixtureProviders, category.id, threadKey, Boolean(designatedClient))
      if (!provider) throw new Error('Verified provider fixture mapping is missing.')
      let clientUserId
      let clientProfileId
      if (designatedClient) {
        clientUserId = designatedClient.clerkUserId
        clientProfileId = designatedClient.id
      } else {
      const username = `yqaa_live_${RUN_ID}_${RUN_ATTEMPT}_${provider.category}_${threadKey}`.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 64)
      const clientUser = await fixtureClerkUser(username, 'yqaa_live_acceptance_client', 'Client')
      const client = await fixtureProfile(clientUser.id, `${username}@example.invalid`, 'client', 'YQAA Acceptance Client')
      clientUserId = clientUser.id
      clientProfileId = client.id
      }
      const [participantA, participantB] = [clientProfileId, provider.profileId].sort()
      const preexisting = await dbRequest(`conversations?select=id,participant_a,participant_b,context_kind,context_id,status,metadata&participant_a=eq.${participantA}&participant_b=eq.${participantB}`)
      assertFreshParticipantPair(preexisting)
      const metadata = { ai_mode: 'auto', ai_disclosed: false, yqaa_live_acceptance: true, yqaa_live_acceptance_run: CURRENT_RUN_MARKER }
      let row
      const recoverUncertainInsert = async () => {
        const recovered = await dbRequest(`conversations?select=id,participant_a,participant_b,context_kind,context_id,status,metadata&participant_a=eq.${participantA}&participant_b=eq.${participantB}`)
        if (recovered?.length !== 1 || recovered[0].metadata?.yqaa_live_acceptance_run !== CURRENT_RUN_MARKER || recovered[0].metadata?.yqaa_live_acceptance !== true) return null
        return recovered[0]
      }
      try {
        const inserted = await dbRequest('conversations?select=id,participant_a,participant_b,context_kind,context_id,status,metadata', {
          method: 'POST', prefer: 'return=representation',
          body: [{ participant_a: participantA, participant_b: participantB, context_kind: 'gig', context_id: provider.gigId, status: 'active', metadata }],
        })
        row = inserted?.[0]
      } catch (error) {
        // A uniqueness conflict is definitive: never adopt an existing pair.
        if (/database 409/.test(String(error?.message))) throw error
        // POST may have committed before its response was lost. Only recover by
        // reading the exact pair and proving this run's marker; never retry POST.
        row = await recoverUncertainInsert()
        if (!row) throw error
      }
      if (!row) row = await recoverUncertainInsert()
      if (!row?.id || !/^[0-9a-f-]{36}$/i.test(row.id)) throw new Error('Conversation fixture insert did not return a representation.')
      const id = row.id
      const threadFixture = { id, participantA, participantB, profileId: clientProfileId, clerkUserId: clientUserId, clientKind: designatedClient ? 'designated' : 'synthetic', scenario: threadKey, category: provider.category, providerProfileId: provider.profileId, providerClerkUserId: provider.clerkUserId, providerRole: provider.providerRole, gigId: provider.gigId }
      verifyOwnedConversation(row, threadFixture, CURRENT_RUN_MARKER)
      const thread = registerOwnedConversation(fixtureThreads, threadFixture)
      const ownMessages = await dbRequest(`conversation_messages?select=id,metadata&conversation_id=eq.${id}&limit=1`)
      if (ownMessages?.length) throw new Error('This isolated run already has conversation messages; refusing a duplicate live run.')
    }
  }
  receipt.fixtures = { categories: [...new Set(fixtureProviders.map((p) => p.category))], provider_count: fixtureProviders.length, conversation_count: fixtureThreads.length, synthetic_client_count: designatedClient ? 0 : fixtureThreads.length, designated_client_mode: Boolean(designatedClient), hidden_test_profiles: true, provider_username_hashes: fixtureProviders.map((p) => safeHash(p.username)) }
}

function incidentUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''))
}

function incidentBudgetRange(turns) {
  const amounts = turns.flatMap(incidentQuality.moneyValues)
  if (!amounts.length) return 'unknown'
  const max = Math.max(...amounts)
  return max < 100 ? 'under_100' : max < 500 ? '100_499' : max < 1000 ? '500_999' : '1000_plus'
}

function incidentSignals(text) {
  const body = String(text || '')
  return {
    orientation: /(yqaa|ai-powered|artificial intelligence|i am an ai|i’m an ai|automated assistant)/i.test(body),
    internalLeak: /(internal floor|reference mean|pricing floor|minimum price is|revenue-safe floor)/i.test(body),
    amounts: incidentQuality.moneyValues(body),
  }
}

async function loadIncidentSource() {
  const sourceConversationId = process.env.YQAA_FT_SOURCE_CONVERSATION_ID
  const sourceClientId = process.env.YQAA_FT_SOURCE_CLIENT_ID
  const sourceProviderId = process.env.YQAA_FT_SOURCE_PROVIDER_ID
  if (![sourceConversationId, sourceClientId, sourceProviderId].every(incidentUuid)) throw new Error('Incident source identifiers are not configured as valid UUIDs.')
  const conversations = await dbRequest(`conversations?select=id,participant_a,participant_b,context_kind,context_id&id=eq.${encodeURIComponent(sourceConversationId)}`)
  const source = conversations?.[0]
  const participants = [source?.participant_a, source?.participant_b]
  const validSourceContext = source?.context_kind === 'gig' || (source?.context_kind === 'general' && source?.context_id == null)
  if (conversations?.length !== 1 || source.id !== sourceConversationId || !participants.includes(sourceClientId) || !participants.includes(sourceProviderId) || sourceClientId === sourceProviderId || !validSourceContext) throw new Error('Incident source conversation ownership could not be verified.')
  const [clientRows, providerRows, messages] = await Promise.all([
    dbRequest(`profiles?select=id,role&id=eq.${encodeURIComponent(sourceClientId)}`),
    dbRequest(`profiles?select=id,role&id=eq.${encodeURIComponent(sourceProviderId)}`),
    dbRequest(`conversation_messages?select=sender_id,body,created_at,metadata&conversation_id=eq.${encodeURIComponent(sourceConversationId)}&order=created_at.asc&limit=201`),
  ])
  if (clientRows?.length !== 1 || clientRows[0].role !== 'client' || providerRows?.length !== 1 || !['consultant', 'attorney'].includes(String(providerRows[0].role).toLowerCase())) throw new Error('Incident source participant roles could not be verified.')
  if (!Array.isArray(messages) || messages.length > 200) throw new Error('Incident source message count is outside the read bound.')
  const turns = []
  for (const message of messages) {
    if (message.sender_id === sourceClientId && typeof message.body === 'string' && message.body.trim()) turns.push(message.body)
  }
  const totalChars = turns.reduce((total, turn) => total + turn.length, 0)
  if (!turns.length || turns.length > MAX_INCIDENT_TURNS || turns.some((turn) => turn.length > 8_000) || totalChars > 48_000) throw new Error('Incident source client turn count or text size is outside the replay bound.')
  const sourceHumanProviderTurns = messages.filter(message => message.sender_id === sourceProviderId && !message.metadata?.ai_generated && typeof message.body === 'string' && message.body.trim()).length
  if (sourceHumanProviderTurns) throw new Error('This client-turn replay cannot represent original human provider messages; a separate explicit replay mode is required.')
  const sourceProviderRole = String(providerRows[0].role).toLowerCase()
  const profileFields = sourceProviderRole === 'attorney'
    ? 'tagline,bio,intro,jurisdictions,practice_areas,specialties,languages'
    : 'tagline,bio,intro,subjects,industries,specialties,languages'
  const publicProfiles = await dbRequest(`${sourceProviderRole === 'attorney' ? 'attorneys' : 'consultants'}?select=${profileFields}&profile_id=eq.${encodeURIComponent(sourceProviderId)}`)
  if (!Array.isArray(publicProfiles) || publicProfiles.length > 1) throw new Error('Source public provider profile could not be bounded.')
  return { sourceConversationId, sourceClientId, sourceProviderId, source, turns, sourceHumanProviderTurns, sourceProviderRole, publicProviderProfile: publicProfiles[0] || null }
}

async function createIncidentFixtures(sourceData) {
  const designatedProfileId = String(process.env.YQAA_CLIENT_PROFILE_ID || '').trim()
  if (designatedProfileId !== DESIGNATED_CLIENT_ID) throw new Error('Foley/Taylor replay requires the authorized designated client profile.')
  const targets = await dbRequest(`profiles?select=id,email,role,status,is_test_account,is_hidden,clerk_user_id&id=eq.${encodeURIComponent(DESIGNATED_CLIENT_ID)}`)
  const target = targets?.[0]
  if (targets?.length !== 1 || target.id !== DESIGNATED_CLIENT_ID || target.role !== 'client' || target.status !== 'active' || target.is_test_account !== false || target.is_hidden !== false || !target.clerk_user_id) throw new Error('Authorized replay client profile could not be verified.')
  const identity = await clerkApi(`/users/${encodeURIComponent(target.clerk_user_id)}`)
  const verifiedEmail = (identity.email_addresses || []).find((item) => item.id === identity.primary_email_address_id && item.email_address?.toLowerCase() === target.email?.toLowerCase() && item.verification?.status === 'verified')
  if (identity.id !== target.clerk_user_id || !verifiedEmail) throw new Error('Authorized replay client Clerk identity could not be verified.')

  const publicGigs = await dbRequest(`gigs?select=id,title,category,subcategory,status,is_hidden,unit_pricing,hourly_rate_cents,pitch,description,jurisdiction&provider_id=eq.${encodeURIComponent(sourceData.sourceProviderId)}&status=eq.active&is_hidden=eq.false&order=created_at.asc&limit=10`)
  if (!Array.isArray(publicGigs) || !publicGigs.length || publicGigs.length > 10) throw new Error('No bounded set of public source gigs was available to mirror.')
  const [sourceTiers, sourcePrefs] = await Promise.all([
    dbRequest(`gig_tiers?select=gig_id,tier,title,description,price,delivery_days,revisions,is_active,features,scope_depth,scope_units&gig_id=in.(${publicGigs.map((gig) => gig.id).join(',')})&is_active=eq.true&order=tier.asc`),
    dbRequest(`provider_pricing_preferences?select=negotiation_enabled,auto_accept_pct,flex_pct,approval_band_pct,max_auto_concessions,prefer_accept,hourly_rate_cents,min_effective_rate_cents,min_floor_cents&provider_id=eq.${encodeURIComponent(sourceData.sourceProviderId)}`),
  ])
  if (!Array.isArray(sourceTiers) || sourceTiers.length > 30) throw new Error('Source gig scope and pricing count is outside the mirror bound.')
  const username = `${PROVIDER_USERNAME}_foley_taylor`.slice(0, 64)
  const providerUser = await fixtureClerkUser(username, 'yqaa_live_acceptance', 'Provider')
  const provider = await fixtureProfile(providerUser.id, `yqaa-foley-taylor-${RUN_ID}-${RUN_ATTEMPT}@example.invalid`, sourceData.sourceProviderRole, 'Synthetic Replay Provider')
  const ownedGigs = new Map()
  for (const [index, sourceGig] of publicGigs.entries()) {
    if (!/^[a-z0-9-]{2,80}$/i.test(String(sourceGig.category || '')) || !/^[a-z0-9-]{2,80}$/i.test(String(sourceGig.subcategory || ''))) throw new Error('Source public gig taxonomy is not safe to mirror.')
    const slug = `yqaa-ft-${RUN_ID}-${RUN_ATTEMPT}-${index}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 80)
    const prior = await dbRequest(`gigs?select=id,provider_id,status,is_hidden,category,subcategory,slug&slug=eq.${encodeURIComponent(slug)}`)
    let gig = prior?.[0]
    if (gig && (gig.provider_id !== provider.id || gig.status !== 'paused' || gig.is_hidden !== true || gig.category !== sourceGig.category || gig.subcategory !== sourceGig.subcategory)) throw new Error('Existing replay listing ownership could not be verified.')
    if (!gig) {
      try {
        const inserted = await dbRequest('gigs?select=id,provider_id,status,is_hidden,category,subcategory', { method: 'POST', prefer: 'return=representation', body: [{
          provider_id: provider.id, provider_type: sourceData.sourceProviderRole, title: `Synthetic replay: ${String(sourceGig.title || `listing ${index + 1}`).slice(0, 150)}`, category: sourceGig.category, subcategory: sourceGig.subcategory, slug, jurisdiction: sourceGig.jurisdiction,
          pitch: String(sourceGig.pitch || 'Hidden synthetic test listing for bounded replay only.').slice(0, 500), description: `Public service scope copied for a hidden synthetic replay; no provider credentials or licensure are verified by this fixture.\n\n${String(sourceGig.description || '').slice(0, 8000)}`, requirements: 'Replay fixture only.',
          status: 'paused', is_hidden: true, tags: ['synthetic', 'acceptance-fixture', 'foley-taylor-replay'], unit_pricing: sourceGig.unit_pricing, hourly_rate_cents: sourceGig.hourly_rate_cents,
        }] })
        gig = inserted?.[0]
      } catch (error) {
        const recovered = await dbRequest(`gigs?select=id,provider_id,status,is_hidden,category,subcategory,slug&slug=eq.${encodeURIComponent(slug)}`)
        gig = recovered?.length === 1 ? recovered[0] : null
        if (!gig) throw error
      }
    }
    if (!gig?.id || gig.provider_id !== provider.id || gig.status !== 'paused' || gig.is_hidden !== true || gig.category !== sourceGig.category || gig.subcategory !== sourceGig.subcategory) throw new Error('Hidden replay gig ownership could not be verified.')
    const registered = { category: sourceGig.category, scenario: 'foley_taylor', profileId: provider.id, clerkUserId: providerUser.id, providerRole: provider.role, gigId: gig.id, username }
    registerOwnedGig(fixtureProviders, registered)
    ownedGigs.set(sourceGig.id, gig)
    const tiers = sourceTiers.filter((tier) => tier.gig_id === sourceGig.id)
    const priorTiers = await dbRequest(`gig_tiers?select=id,tier,price,scope_depth,scope_units&gig_id=eq.${encodeURIComponent(gig.id)}`)
    if (!priorTiers?.length && tiers.length) await dbRequest('gig_tiers', { method: 'POST', prefer: 'return=minimal', body: tiers.map((tier) => ({ gig_id: gig.id, tier: tier.tier, title: String(tier.title || `Synthetic ${tier.tier} scope`).slice(0, 160), description: String(tier.description || 'Synthetic replay pricing and scope mirror.').slice(0, 4000), price: tier.price, delivery_days: tier.delivery_days, revisions: tier.revisions, is_active: true, features: Array.isArray(tier.features) ? tier.features.slice(0, 20).map(value => String(value).slice(0, 500)) : ['Synthetic replay fixture'], scope_depth: tier.scope_depth, scope_units: tier.scope_units })) })
  }
  if (sourcePrefs?.length) {
    const preference = sourcePrefs[0]
    await dbRequest('provider_pricing_preferences?on_conflict=provider_id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: [{ provider_id: provider.id, ...preference }] })
  }
  const sourceContextGig = publicGigs.find((gig) => gig.id === sourceData.source.context_id)
  const contextGig = sourceContextGig ? ownedGigs.get(sourceContextGig.id) : publicGigs[0] && ownedGigs.get(publicGigs[0].id)
  if (!contextGig) throw new Error('Source conversation gig is not among the public gigs mirrored for replay.')
  const participantA = [DESIGNATED_CLIENT_ID, provider.id].sort()[0]
  const participantB = [DESIGNATED_CLIENT_ID, provider.id].sort()[1]
  assertFreshParticipantPair(await dbRequest(`conversations?select=id&participant_a=eq.${participantA}&participant_b=eq.${participantB}`))
  const runMarker = CURRENT_RUN_MARKER
  const metadata = { ai_mode: 'auto', ai_disclosed: false, yqaa_live_acceptance: true, yqaa_live_acceptance_run: runMarker, yqaa_foley_taylor_replay: true, yqaa_replay_provider_public_profile: sourceData.publicProviderProfile ? {source_provider_id:sourceData.sourceProviderId,role:sourceData.sourceProviderRole,profile:sourceData.publicProviderProfile} : null }
  let row
  try {
    const created = await dbRequest('conversations?select=id,participant_a,participant_b,context_kind,context_id,status,metadata', { method: 'POST', prefer: 'return=representation', body: [{ participant_a: participantA, participant_b: participantB, context_kind: 'gig', context_id: contextGig.id, status: 'active', metadata }] })
    row = created?.[0]
  } catch (error) {
    if (/database 409/.test(String(error?.message))) throw error
    const recovered = await dbRequest(`conversations?select=id,participant_a,participant_b,context_kind,context_id,status,metadata&participant_a=eq.${participantA}&participant_b=eq.${participantB}`)
    if (recovered?.length === 1 && recovered[0].metadata?.yqaa_foley_taylor_replay === true && recovered[0].metadata?.yqaa_live_acceptance_run === runMarker) row = recovered[0]
    else throw error
  }
  if (!row) {
    const recovered = await dbRequest(`conversations?select=id,participant_a,participant_b,context_kind,context_id,status,metadata&participant_a=eq.${participantA}&participant_b=eq.${participantB}`)
    if (recovered?.length === 1 && recovered[0].metadata?.yqaa_foley_taylor_replay === true && recovered[0].metadata?.yqaa_live_acceptance_run === runMarker) row = recovered[0]
  }
  if (!row?.id) throw new Error('Replay conversation insert did not return a row.')
  const fixture = { id: row.id, participantA, participantB, profileId: DESIGNATED_CLIENT_ID, clerkUserId: target.clerk_user_id, clientKind: 'designated', scenario: 'foley_taylor', category: contextGig.category, providerProfileId: provider.id, providerClerkUserId: providerUser.id, providerRole: provider.role, gigId: contextGig.id, incident: true, runMarker }
  verifyOwnedConversation(row, fixture, runMarker)
  registerOwnedConversation(fixtureThreads, fixture)
  if ((await dbRequest(`conversation_messages?select=id&conversation_id=eq.${encodeURIComponent(row.id)}&limit=1`))?.length) throw new Error('New replay conversation unexpectedly contains messages.')
  return { fixture, clientUserId: target.clerk_user_id, runMarker, providerCount: 1, gigCount: ownedGigs.size, sourcePreferenceMirrored: Boolean(sourcePrefs?.length) }
}

async function runIncidentReplay(sourceData, fixtureData) {
  const { fixture } = fixtureData
  const auth = await authenticatedPage(fixtureData.clientUserId, '/dashboard?page=messages')
  clientPage = auth.page
  const turns = [...sourceData.turns]
  const metrics = { orientation_present: false, budget_first: false, internal_leak_count: 0, stale_number_count: 0, budget_range: incidentBudgetRange(turns), duplicate_reply_count: 0, source_client_turns: turns.length, posted_verbatim_turns: 0, turns_after_pause: 0, useful_first_orientation: false, reply_turns: [], attention_state: 'not_observed', latency_ms: [], evidence_count: 0, posture: 'held_at_turn_bound' }
  const replyFingerprints = new Set()
  const firstBudgetTurn = turns.findIndex(turn => incidentQuality.moneyValues(turn).length > 0)
  const seenBudget = firstBudgetTurn >= 0
  const priorNumbers = []
  let firstQuoteTurn = null
  const conversationId = fixture.id
  try {
    for (let index = 0; index < turns.length && index < MAX_INCIDENT_TURNS; index++) {
      const currentNumbers = incidentQuality.moneyValues(turns[index])
      const before = await dbRequest(`conversations?select=id,participant_a,participant_b,context_kind,context_id,status,metadata&id=eq.${encodeURIComponent(conversationId)}`)
      verifyOwnedConversation(before?.[0], fixture, fixtureData.runMarker)
      const alreadyPaused = before[0].metadata?.ai_mode === 'paused'
      if (alreadyPaused) { metrics.attention_state = before[0].metadata?.ai_provider_attention_requested ? 'paused_for_provider' : 'paused'; metrics.posture = 'stopped_on_pause' }
      const started = Date.now()
      const sent = await api(clientPage, `/api/messages/conversations/${conversationId}`, { method: 'POST', body: { body: turns[index] } })
      if (sent.status !== 200 || typeof sent.data.message?.id !== 'string' || sent.data.message?.sender_id !== fixture.profileId) throw new Error('Incident replay client turn was not accepted by the owned conversation.')
      metrics.evidence_count++
      const triggerId = sent.data.message.id
      const stored = await dbRequest(`conversation_messages?select=id,sender_id,body&conversation_id=eq.${encodeURIComponent(conversationId)}&id=eq.${encodeURIComponent(triggerId)}`)
      if (stored?.length !== 1 || stored[0].sender_id !== fixture.profileId || stored[0].body !== turns[index]) throw new Error('Incident source turn was not stored word for word.')
      metrics.posted_verbatim_turns++
      if (alreadyPaused) {
        metrics.turns_after_pause++
        metrics.reply_turns.push({turn:index + 1,status:'not_expected_ai_paused'})
        continue
      }
      const deadline = Date.now() + MAX_WAIT_MS
      let reply = null
      let state = null
      while (Date.now() < deadline) {
        await releaseIdentityModule.abortableDelay(1500,runController.signal)
        const [threadResult, stateRows] = await Promise.all([
          api(clientPage, `/api/messages/conversations/${conversationId}`),
          dbRequest(`conversations?select=id,participant_a,participant_b,context_kind,context_id,status,metadata&id=eq.${encodeURIComponent(conversationId)}`),
        ])
        if (threadResult.status !== 200) throw new Error('Incident replay conversation could not be read through its owner session.')
        verifyOwnedConversation(stateRows?.[0], fixture, fixtureData.runMarker)
        state = stateRows?.[0]?.metadata || {}
        reply = (threadResult.data.messages || []).find((message) => message.metadata?.ai_generated && !message.metadata?.ai_typing && message.metadata?.yqaa_trigger_message_id === triggerId)
        if (reply || state.ai_mode === 'paused') break
      }
      metrics.latency_ms.push(Date.now() - started)
      if (reply && typeof reply.body === 'string') {
        metrics.evidence_count++
        const signals = incidentSignals(reply.body)
        if (index === 0) {
          metrics.orientation_present = signals.orientation
          metrics.useful_first_orientation = incidentQuality.usefulFirstOrientation(reply.body)
          if (/\*\*[^*]+\*\*/.test(reply.body)) {
            await browserNavigation.navigateOwnedPage(clientPage, `${BASE}/dashboard?page=messages&thread=${encodeURIComponent(conversationId)}`, ms => releaseIdentityModule.abortableDelay(ms, runController.signal))
            await clientPage.locator('.bub-text strong').first().waitFor({ state: 'visible', timeout: 15_000 })
            const visibleBodies = await clientPage.locator('.bub-text').allTextContents()
            metrics.bold_rendered = !(visibleBodies.some(body => /\*\*[^*]+\*\*/.test(body)))
          } else metrics.bold_rendered = null
        }
        metrics.reply_turns.push({turn:index + 1,status:'reply_received'})
        if (signals.internalLeak) metrics.internal_leak_count++
        if (signals.amounts.some((amount) => priorNumbers.includes(amount) && !currentNumbers.includes(amount))) metrics.stale_number_count++
        const fingerprint = createHash('sha256').update(reply.body).digest('hex')
        if (replyFingerprints.has(fingerprint)) metrics.duplicate_reply_count++
        replyFingerprints.add(fingerprint)
        if (signals.amounts.length && firstQuoteTurn === null) firstQuoteTurn = index
      }
      if (state?.ai_mode === 'paused' || state?.ai_provider_attention_requested === true) {
        metrics.attention_state = state.ai_provider_attention_requested ? 'paused_for_provider' : 'paused'
        metrics.posture = 'stopped_on_pause'
        continue
      }
      if (!reply) { metrics.posture = 'held_after_reply_timeout'; break }
      priorNumbers.push(...currentNumbers)
    }
    metrics.budget_first = seenBudget && firstQuoteTurn !== null && firstBudgetTurn <= firstQuoteTurn
    if (metrics.posture === 'held_at_turn_bound' && metrics.evidence_count > 0) metrics.posture = 'source_turns_exhausted'
    receipt.incident = { name: INCIDENT_MODE, status: 'completed', ...metrics }
    initializeFixtureDatabase()
    receipt.mode = 'incident'
    receipt.status = 'incident_completed'
    if (!metrics.useful_first_orientation || metrics.bold_rendered === false || metrics.posted_verbatim_turns !== turns.length || metrics.internal_leak_count || metrics.stale_number_count || metrics.duplicate_reply_count || metrics.posture === 'held_after_reply_timeout') {
      receipt.incident.status = 'failed_quality'
      throw new Error('Incident replay failed useful first orientation, complete verbatim delivery, or reply safety checks.')
    }
  } finally {
    // The incident path never resumes AI. Explicitly leave the owned thread held.
    const rows = await dbRequest(`conversations?select=id,participant_a,participant_b,context_kind,context_id,status,metadata&id=eq.${encodeURIComponent(conversationId)}`)
    verifyOwnedConversation(rows?.[0], fixture, fixtureData.runMarker)
    await dbRequest(`conversations?id=eq.${encodeURIComponent(conversationId)}&participant_a=eq.${encodeURIComponent(fixture.participantA)}&participant_b=eq.${encodeURIComponent(fixture.participantB)}`, { method: 'PATCH', prefer: 'return=minimal', body: { metadata: { ...(rows[0].metadata || {}), ai_mode: 'paused', ai_mode_set_by: 'yqaa_foley_taylor_replay', ai_paused_reason: 'incident_replay_hold' } } })
    const held = await dbRequest(`conversations?select=id,metadata&id=eq.${encodeURIComponent(conversationId)}`)
    if (held?.[0]?.metadata?.ai_mode !== 'paused') throw new Error('Incident replay could not verify the final held state.')
    metrics.attention_state = held[0].metadata?.ai_provider_attention_requested ? 'paused_for_provider' : 'held'
    if (receipt.incident) receipt.incident.attention_state = metrics.attention_state
    if (receipt.incident) receipt.incident.posture = metrics.posture
    turns.fill('')
    await auth.context.close()
    clientPage = null
  }
}

async function fixtureClerkUser(username, marker, suffix) {
  const found = await clerkApi(`/users?username=${encodeURIComponent(username)}`)
  let user = Array.isArray(found) ? found[0] : null
  if (user && user.public_metadata?.[marker] !== true) throw new Error('Existing username is not marked as an acceptance fixture.')
  if (!user) user = await clerkApi('/users', { method: 'POST', body: JSON.stringify({ username, password: `Yqaa-${randomBytes(32).toString('base64url')}!`, first_name: 'YQAA', last_name: `Acceptance ${suffix}`, public_metadata: { [marker]: true, synthetic: true } }) })
  if (!user?.id || user.public_metadata?.[marker] !== true || (user.email_addresses || []).length !== 0) throw new Error('Could not establish username-only synthetic Clerk identity.')
  return user
}

async function fixtureProfile(clerkUserId, email, role, fullName) {
  const prior = await dbRequest(`profiles?select=id,clerk_user_id,role,is_test_account,is_hidden&clerk_user_id=eq.${encodeURIComponent(clerkUserId)}`)
  if (prior?.length && (prior[0].role !== role || prior[0].is_test_account !== true || prior[0].is_hidden !== true)) throw new Error('Synthetic Clerk identity is linked to a non-fixture profile; refusing to mutate it.')
  const rows = await dbRequest('profiles?on_conflict=clerk_user_id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=representation', body: [{ clerk_user_id: clerkUserId, email, role, status: 'active', full_name: fullName, is_test_account: true, is_hidden: true }] })
  const profile = rows?.[0]
  if (!profile?.id || profile.clerk_user_id !== clerkUserId || profile.role !== role || profile.is_test_account !== true || profile.is_hidden !== true) throw new Error('Hidden test profile ownership could not be confirmed.')
  return profile
}

async function authenticatedPage(clerkUserId, landing) {
  const token = await clerkApi('/sign_in_tokens', { method: 'POST', body: JSON.stringify({ user_id: clerkUserId, expires_in_seconds: 600 }) })
  if (!token?.token) throw new Error('Clerk Backend API did not issue a one-time sign-in token.')
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  try {
    await page.goto(`${BASE}/sign-in`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  } catch {
    await context.close()
    throw new Error('Clerk sign-in page could not be reached.')
  }
  const result = await page.evaluate(async ({ ticket, expectedUserId }) => {
    for (let i = 0; i < 80; i++) {
      const root = window.Clerk
      if (root?.loaded && root?.client && root?.setActive) break
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    const root = window.Clerk
    if (!root?.loaded || !root?.setActive) return { ok: false, category: 'clerk_not_loaded' }
    try {
      const client = await root.client
      const attempt = await client.signIn.create({ strategy: 'ticket', ticket })
      if (!attempt.createdSessionId) return { ok: false, category: 'clerk_session_missing' }
      await root.setActive({ session: attempt.createdSessionId })
      let userId = null
      for (let i = 0; i < 40; i++) {
        userId = root.user?.id || (await root.session?.user)?.id || null
        if (userId) break
        await new Promise((resolve) => setTimeout(resolve, 250))
      }
      if (userId !== expectedUserId) return { ok: false, category: 'clerk_identity_mismatch' }
      return { ok: true }
    } catch (failure) {
      const status = Number(failure?.status)
      const code = String(failure?.errors?.[0]?.code || failure?.code || '')
      const safeCode = ['ticket_invalid', 'ticket_expired', 'ticket_already_used', 'session_exists'].includes(code) ? code : null
      return { ok: false, category: safeCode || (status >= 400 && status < 500 ? 'clerk_http_4xx' : status >= 500 && status < 600 ? 'clerk_http_5xx' : 'clerk_sdk_rejected') }
    }
  }, { ticket: token.token, expectedUserId: clerkUserId })
  if (!result?.ok) { await context.close(); throw new Error(`Clerk one-time token session failed (${result?.category || 'clerk_session_failed'}).`) }
  try {
    await browserNavigation.navigateOwnedPage(page, `${BASE}${landing}`, ms => releaseIdentityModule.abortableDelay(ms, runController.signal))
  } catch (error) { await context.close(); throw error }
  return { context, page }
}

async function api(page, route, { method = 'GET', body } = {}) {
  const response = await page.request.fetch(`${BASE}${route}`, {
    method,
    ...(body === undefined ? {} : { data: body }),
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    timeout: 10_000,
    // Playwright retries ECONNRESET only. A single read retry is safe; an
    // uncertain POST/PATCH must never be replayed by the acceptance runner.
    maxRetries: method === 'GET' ? 1 : 0,
  })
  const data = await response.json().catch(() => ({}))
  return { status: response.status(), data }
}

async function providerUiChecks() {
  const fixture = fixtureProviders[0]
  const auth = await authenticatedPage(fixture.clerkUserId, '/dashboard/pricing')
  providerPage = auth.page
  const prefsApi = await api(providerPage, '/api/provider/pricing-preferences')
  check('provider controls authenticated API', prefsApi.status === 200 && prefsApi.data.available === true)
  await providerPage.getByText('Negotiation limits', { exact: true }).waitFor({ timeout: 20_000 })
  await providerPage.getByText('Allow YQAA to negotiate within my pricing preferences', { exact: true }).waitFor({ timeout: 20_000 })
  check('provider pricing controls UI', true)

  await providerPage.goto(`${BASE}/dashboard/gigs/${fixture.gigId}/edit`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  await providerPage.getByRole('heading', { name: 'Edit Your Gig' }).waitFor({ timeout: 20_000 })
  const pageText = await providerPage.locator('body').innerText({ timeout: 20_000 })
  check('paused fixture gig editor authenticated UI', pageText.toLowerCase().includes('pricing'))
  const gigApi = await api(providerPage, `/api/gigs/${fixture.gigId}`)
  const payload = gigApi.data?.data?.gig || gigApi.data?.gig
  check('gig scope fixture loaded through provider API', gigApi.status === 200 && payload?.id === fixture.gigId && payload?.status === 'paused' && payload?.is_hidden === true && Array.isArray(payload?.tiers) && payload.tiers.length >= 2)
  await providerPage.getByTitle('Jump to: Pricing', { exact: true }).click()
  const pricingText = (await providerPage.locator('body').innerText()).toLowerCase()
  check('gig pricing and scope editor UI', pricingText.includes('scope units') && pricingText.includes('scope depth') && pricingText.includes('tier description'))
  await auth.context.close()
  providerPage = null
}

const categories = [
  { id: 'education', subcategoryId: 'university-admissions', gigTitle: 'Synthetic university application checklist organization', request: 'university application checklist', fullRequest: 'organizing the full application for university admissions across 6 documents', narrowRequest: 'organizing only a portion: 3 documents for a university application' },
  { id: 'academic-writing', subcategoryId: 'application-essays', gigTitle: 'Synthetic application essay organization support', request: 'application essay editing checklist', fullRequest: 'organizing the full application essay packet across 6 documents', narrowRequest: 'organizing only a portion: 3 documents for an application essay' },
  { id: 'mentorship', subcategoryId: 'student-mentorship', gigTitle: 'Synthetic student planning checklist support', request: 'student study planning checklist', fullRequest: 'organizing the full application for student planning across 6 documents', narrowRequest: 'organizing only a portion: 3 documents for study planning' },
]

const scenarios = [
  { name: 'orientation', text: 'Hi. I am planning to get help with %FULL_REQUEST%. What can this service help me understand, what should I clarify first, and are you an AI or a human?' },
  { name: 'budget', text: 'My budget is USD 450 for help organizing %REQUEST%. What can fit that budget? Please clarify the proposed scope and price.' },
  { name: 'scope_narrowing', text: 'Let us narrow the previous full request to %NARROW_REQUEST%. Leave form completion and advice out of scope.' },
  { name: 'counter', text: null },
  { name: 'lowball', text: 'My maximum is USD 1 for organizing %REQUEST%. Please say what, if anything, could realistically fit that amount without promising the full request.' },
  { name: 'frustration', text: 'This is not helpful and feels like a waste of my time; I still do not understand what is included or what happens next. Can you explain it plainly?' },
  { name: 'provider_attention', text: 'Please ask the provider to review this request personally and pause automated negotiation until they respond.' },
]

async function messengerSmoke() {
  let currentScenarioIndex = -1
  return acceptanceAssertions.runIndependentCategories(categories, {
    signal: runController.signal,
    negotiation: async (category) => {
    currentScenarioIndex = -1
    const categoryIndex = categories.indexOf(category)
    const fixture = fixtureThreads.find((thread) => thread.category === category.id && thread.scenario === 'negotiation')
    if (!fixture) throw new Error(`${category.id}/negotiation: continuous fixture mapping is missing.`)
    const conversationId = fixture.id
    const auth = await authenticatedPage(fixture.clerkUserId, '/dashboard?page=messages')
    clientPage = auth.page
    let quoteCents = null
    let quoteScopeHash = null
    try {
    for (let index = 0; index < MAX_TURNS; index++) {
      currentScenarioIndex = index
      const baseScenario = scenarios[index]
      const scenario = { ...baseScenario, text: baseScenario.text?.replaceAll('%REQUEST%', category.request).replaceAll('%FULL_REQUEST%', category.fullRequest).replaceAll('%NARROW_REQUEST%', category.narrowRequest) }
      const label = `${category.id}/${scenario.name}`
    let priorScopeHash = null
    if (index > 0) {
      const beforeTurn = (await dbRequest(`conversations?select=metadata&id=eq.${conversationId}`))?.[0]?.metadata || {}
      if (beforeTurn.ai_mode === 'paused') throw new Error(`${label}: AI paused before this required scenario; refusing to send a message with no expected AI response.`)
      priorScopeHash = beforeTurn.ai_last_scope_hash || beforeTurn.ai_memory?.negotiation?.scope_current?.scope_hash || null
    }
    if (categoryIndex === 0 && index === 0) {
      const unauth = await fetch(`${BASE}/api/messages/conversations/${conversationId}`, { headers: { Accept: 'application/json' } })
      check('messenger rejects unauthenticated access', unauth.status === 401)
    }
    const initial = await api(clientPage, `/api/messages/conversations/${conversationId}`)
    check(`${label}: authenticated client owns fixture conversation`, initial.status === 200 && initial.data.conversation?.id === conversationId && initial.data.conversation?.counterpart?.id === fixture.providerProfileId)
    const started = Date.now()
    if (scenario.name === 'counter') {
      const memory = (await dbRequest(`conversations?select=metadata&id=eq.${conversationId}`))?.[0]?.metadata?.ai_memory
      const quotes = memory?.negotiation?.quotes_made || []
      const quote = [...quotes].reverse().find((item) => Number.isFinite(Number(item.cents)) && Number(item.cents) > 0)
      if (!quote) throw new Error(`${label}: no quote produced in server conversation memory; refusing to invent one.`)
      quoteCents = Number(quote.cents)
      quoteScopeHash = quote.scope_hash
      const counterCents = Math.max(1, Math.round(quoteCents * 0.9))
      const quoteDollars = (quoteCents / 100).toFixed(2)
      const counterDollars = (counterCents / 100).toFixed(2)
      scenario.text = `The server quote record for this scope is USD $${quoteDollars}. Would you accept $${counterDollars} USD for the same narrowed scope?`
    }
    const sent = await api(clientPage, `/api/messages/conversations/${conversationId}`, { method: 'POST', body: { body: scenario.text } })
    check(`${label}: authenticated DM message accepted`, sent.status === 200 && sent.data.message?.sender_id === fixture.profileId && typeof sent.data.message?.id === 'string')
    const triggerId = sent.data.message.id
    const deadline = Date.now() + MAX_WAIT_MS
    let reply = null
    let latestThread = null
    while (Date.now() < deadline) {
      await releaseIdentityModule.abortableDelay(1500,runController.signal)
      const thread = await api(clientPage, `/api/messages/conversations/${conversationId}`)
      if (thread.status !== 200) throw new Error(`${label}: authenticated thread read returned HTTP ${thread.status}`)
      latestThread = thread.data
      reply = (thread.data.messages || []).find((message) => message.metadata?.ai_generated && !message.metadata?.ai_typing && message.metadata?.yqaa_trigger_message_id === triggerId)
      if (reply) {
        const conversation = thread.data.conversation || {}
        if (conversation.ai_disclosed !== true) throw new Error(`${label}: disclosure metadata was not recorded.`)
        break
      }
    }
    if (!reply || typeof reply.body !== 'string' || reply.body.trim().length < 20) throw new Error(`${label}: no substantive AI-generated reply within the bound.`)
    const diagnosticRows = await dbRequest(`conversations?select=metadata&id=eq.${conversationId}`)
    const diagnostic = diagnosticRows?.[0]?.metadata || {}
    if (diagnostic.ai_last_trigger_message_id !== triggerId || diagnostic.ai_last_error || diagnostic.ai_last_skip) throw new Error(`${label}: model/provider diagnostic indicates an unavailable or skipped response.`)
    if (latestThread?.conversation?.ai_disclosed !== true) throw new Error(`${label}: authenticated thread did not expose disclosure state.`)
    if (/\*\*[^*\n]+\*\*/.test(reply.body)) {
      await browserNavigation.navigateOwnedPage(clientPage, `${BASE}/dashboard?page=messages&thread=${encodeURIComponent(conversationId)}`, ms => releaseIdentityModule.abortableDelay(ms, runController.signal))
      const expectedVisibleText = reply.body.replace(/\*\*([^*\n]+)\*\*/g, (_match, content) => String(content).trim()).replace(/\s+/g, ' ').trim()
      const renderedBodies = await clientPage.locator('.bub-text').allTextContents()
      const boldWasRendered = renderedBodies.some(body => body.replace(/\s+/g, ' ').trim() === expectedVisibleText && !/\*\*[^*\n]+\*\*/.test(body))
      check(`${label}: bold formatting rendered in the client UI`, boldWasRendered)
      if (!boldWasRendered) throw new Error(`${label}: message body contains Markdown bold markers that did not render as emphasis in the client UI.`)
    }
    if (scenario.name === 'orientation' && !/(yqaa|ai-powered|artificial intelligence|i am an ai|i’m an ai|automated assistant)/i.test(reply.body)) throw new Error(`${label}: actual response did not disclose AI identity.`)
    const lower = reply.body.toLowerCase()
    if (scenario.name === 'orientation' && acceptanceAssertions.containsMechanicalOrientationCopy(reply.body)) throw new Error(`${label}: response used canned, mechanical orientation wording.`)
    if (scenario.name === 'orientation' && !acceptanceAssertions.orientationAddressesContext(category.id, reply.body)) throw new Error(`${label}: response did not address the ${category.id} context.`)
    if (scenario.name === 'budget' && !/(budget|cad|450|price|scope|cost)/i.test(reply.body)) throw new Error('budget: response did not address budget or scope.')
    if (scenario.name === 'scope_narrowing' && !/(checklist|scope|organ|exclude|form)/i.test(reply.body)) throw new Error('scope_narrowing: response did not preserve the narrowed scope.')
    if (scenario.name === 'lowball' && !/(budget|narrow|scope|provider|fit|offer|realistic|cannot|can.t|not able)/i.test(reply.body)) throw new Error('lowball: response did not address the stated budget and viable options.')
    if (scenario.name === 'frustration' && !/(understand|sorry|clear|plain|next|frustrat|included)/i.test(reply.body)) throw new Error('frustration: response did not address the request for a plain explanation.')
    if (/(internal floor|reference mean|pricing floor|minimum price is|revenue-safe floor)/i.test(lower)) throw new Error(`${label}: reply exposed internal floor language.`)
    const currentRows = await dbRequest(`conversations?select=metadata&id=eq.${conversationId}`)
    const current = currentRows?.[0]?.metadata || {}
    const memory = current.ai_memory || {}
    if (scenario.name === 'scope_narrowing') {
      const scope = memory.negotiation?.scope_current
      const scopeHash = current.ai_last_scope_hash || scope?.scope_hash
      const scopeValue = scope?.units?.qty
      if (memory.marketplace_scope?.category_id !== category.id || memory.marketplace_scope?.subcategory_id !== category.subcategoryId || !(memory.document_highlights || []).some((value) => /checklist/i.test(value))) throw new Error(`${label}: server memory did not retain taxonomy and narrowed checklist scope.`)
      if (!scopeHash || scopeHash !== scope?.scope_hash || scopeHash === priorScopeHash || !(memory.negotiation?.quotes_made || []).some((item) => item.scope_hash === scopeHash && Number(item.cents) > 0) || !Number.isFinite(Number(scopeValue)) || Number(scopeValue) !== 3 || scope?.units?.unit !== 'document' || scope?.depth !== 'partial') throw new Error(`${label}: actual new quote scope hash/value did not reflect the three-document narrowed scope.`)
      if (!current.ai_last_pricing_status) throw new Error(`${label}: narrowed scope did not produce a pricing decision.`)
    }
    if (scenario.name === 'budget' && (Number(memory.budget?.maxCents || memory.negotiation?.budget_latest?.maxCents || 0) < 1 || !current.ai_last_pricing_status)) throw new Error(`${label}: server memory did not retain client budget and pricing state.`)
    if (scenario.name === 'counter') {
      let committedOffer
      if (typeof current.ai_last_offer_id === 'string' && /^[0-9a-f-]{36}$/i.test(current.ai_last_offer_id)) {
        const offerId = current.ai_last_offer_id
        const [commits, offers, cards] = await Promise.all([
          dbRequest(`yqaa_reply_commits?select=conversation_id,trigger_message_id,reply_message_id,offer_id&conversation_id=eq.${conversationId}&trigger_message_id=eq.${triggerId}`),
          dbRequest(`offers?select=id,chat_id,sender_id,recipient_id,price,currency,status&id=eq.${offerId}&chat_id=eq.${conversationId}&sender_id=eq.${fixture.providerProfileId}&recipient_id=eq.${fixture.profileId}`),
          dbRequest(`conversation_messages?select=id,conversation_id,sender_id,type,ref_offer_id,metadata&conversation_id=eq.${conversationId}&ref_offer_id=eq.${offerId}&type=eq.offer`),
        ])
        if (commits?.length === 1 && offers?.length === 1 && cards?.length === 1) committedOffer = {
          conversationId, triggerMessageId: triggerId, replyMessageId: reply.id,
          providerId: fixture.providerProfileId, clientId: fixture.profileId,
          commit: commits[0], offer: offers[0], card: cards[0],
          visibleCard: (latestThread?.messages || []).find(message => message.id === cards[0].id && message.ref_offer_id === offerId),
        }
      }
      if (!acceptanceAssertions.counterofferAcknowledged(String(reply.body), { quoteCents, counterCents: Math.max(1, Math.round(quoteCents * 0.9)), scopeHash: quoteScopeHash, metadata: current, committedOffer, triggerMessageId: triggerId })) throw new Error(`${label}: reply and authorized server state did not acknowledge the actual counter.`)
      if (!(memory.negotiation?.quotes_made || []).some((item) => Number(item.cents) === quoteCents)) throw new Error(`${label}: server memory did not retain the actual quote used for the counter.`)
      const counterCents = Math.max(1, Math.round(quoteCents * 0.9))
      if (!(memory.negotiation?.client_counters || []).some((item) => Number(item.cents) === counterCents)) throw new Error(`${label}: server memory did not retain the counter derived from its quote.`)
      if (current.ai_pricing_approval_pending === true) {
        const providerRole = fixtureProviderRole(fixture)
        const requestId = current.ai_pricing_approval_request_id
        const version = Number(current.ai_pricing_approval_version)
        if (!acceptanceAssertions.exactSyntheticCounterApproval(current, { triggerMessageId: triggerId, counterCents, scopeHash: quoteScopeHash, runMarker: CURRENT_RUN_MARKER, providerRole })) throw new Error(`${label}: approval is not bound to this run's hidden provider fixture and exact counter scope.`)
        const providerAuth = await authenticatedPage(fixture.providerClerkUserId, '/dashboard?page=messages')
        try {
          const providerThread = await api(providerAuth.page, `/api/messages/conversations/${conversationId}`)
          if (providerThread.status !== 200 || providerThread.data.conversation?.id !== conversationId || providerThread.data.conversation?.counterpart?.id !== fixture.profileId) throw new Error(`${label}: authenticated fixture provider could not verify the approval conversation.`)
          const decision = await api(providerAuth.page, `/api/messages/conversations/${conversationId}/pricing-approval`, { method: 'POST', body: { request_id: requestId, version, decision: 'approved' } })
          const approval = decision.data?.approval
          if (decision.status !== 200 || approval?.status !== 'approved' || Number(approval.price_cents) !== counterCents || approval.scope_hash !== quoteScopeHash || Number(approval.version) !== version) throw new Error(`${label}: real provider pricing-approval route did not record the exact synthetic counter.`)
          const resumed = await api(providerAuth.page, `/api/messages/conversations/${conversationId}/ai-mode`, { method: 'PATCH', body: { ai_mode: 'auto' } })
          if (resumed.status !== 200 || resumed.data?.ai_mode !== 'auto') throw new Error(`${label}: authenticated fixture provider could not resume YQAA after approval.`)
          const afterApproval = (await dbRequest(`conversations?select=metadata&id=eq.${conversationId}`))?.[0]?.metadata || {}
          const approvalRow = (await dbRequest(`yqaa_pricing_approvals?select=status,price_cents,scope_hash,version,provider_id,request_id,conversation_id&conversation_id=eq.${conversationId}&request_id=eq.${encodeURIComponent(requestId)}&version=eq.${version}`))?.[0]
          if (afterApproval.ai_pricing_approval_status !== 'approved' || afterApproval.ai_mode !== 'auto' || !approvalRow || approvalRow.status !== 'approved' || Number(approvalRow.price_cents) !== counterCents || approvalRow.scope_hash !== quoteScopeHash || approvalRow.provider_id !== fixture.providerProfileId || approvalRow.request_id !== requestId || approvalRow.conversation_id !== conversationId) throw new Error(`${label}: durable provider approval and resumed mode did not reconcile to the exact fixture scope.`)
          receipt.provider_approval_followthrough ||= []
          receipt.provider_approval_followthrough.push({ category: category.id, status: 'synthetic_provider_approved_exact_counter', version, price_cents: counterCents, scope_hash: safeHash(quoteScopeHash), ai_mode_after_approval: 'auto' })
          console.log(`PASS ${label}: hidden fixture provider approved the exact counter and resumed this conversation`)
        } finally {
          await providerAuth.context.close()
        }
      }
    }
    if (scenario.name === 'frustration') {
      const attention = memory.provider_attention
      const pausedForProvider = current.ai_mode === 'paused' && current.ai_provider_attention_requested === true && (attention?.pending === true || attention?.status === 'pending')
      check(`${label}: frustration escalated and paused for provider within one turn`, pausedForProvider)
      const latency = Date.now() - started
      receipt.scenarios.push({ category: category.id, name: scenario.name, status: 'passed', provider_attention: true, ai_paused: true, latency_ms: latency, http_status: sent.status, reply_length_bucket: reply.body.length < 160 ? 'short' : reply.body.length < 600 ? 'medium' : 'long' })
      console.log(`PASS ${label}: provider attention and pause recorded (${latency} ms)`)
      break
    }
    const latency = Date.now() - started
    receipt.scenarios.push({ category: category.id, name: scenario.name, status: 'passed', latency_ms: latency, http_status: sent.status, reply_length_bucket: reply.body.length < 160 ? 'short' : reply.body.length < 600 ? 'medium' : 'long' })
    console.log(`PASS ${label}: YQAA reply recorded (${latency} ms)`)
    }
    } finally {
      await auth.context.close()
      clientPage = null
    }
    },
    attention: attentionSmoke,
    onFailure: (category, name, error) => {
      const failedName = name === 'negotiation' ? (currentScenarioIndex < 0 ? 'fixture_setup' : scenarios[currentScenarioIndex].name) : name
      receipt.scenarios.push({ category: category.id, name: failedName, status: 'failed', failure: safeFailure(error) })
      if (name === 'negotiation') {
        for (const scenario of scenarios.slice(currentScenarioIndex + 1, MAX_TURNS)) receipt.scenarios.push({ category: category.id, name: scenario.name, status: 'not_reached', reason: 'negotiation_prerequisite_failed' })
      }
      console.log(`FAIL ${category.id}/${failedName}: ${safeFailure(error)}`)
    },
  })
}

async function attentionSmoke(category) {
  const fixture = fixtureThreads.find((thread) => thread.category === category.id && thread.scenario === 'attention')
  if (!fixture) throw new Error(`${category.id}/provider_attention: isolated fixture mapping is missing.`)
  const auth = await authenticatedPage(fixture.clerkUserId, '/dashboard?page=messages')
  clientPage = auth.page
  try {
  const conversationId = fixture.id
  const sent = await api(clientPage, `/api/messages/conversations/${conversationId}`, { method: 'POST', body: { body: scenarios.find((s) => s.name === 'provider_attention').text } })
  check(`${category.id}/provider_attention: request accepted`, sent.status === 200 && typeof sent.data.message?.id === 'string')
  const started = Date.now()
  const deadline = started + MAX_WAIT_MS
  let state = {}
  let reply = null
  let thread = null
  while (Date.now() < deadline) {
    await releaseIdentityModule.abortableDelay(1500,runController.signal)
    state = (await dbRequest(`conversations?select=metadata&id=eq.${conversationId}`))?.[0]?.metadata || {}
    thread = await api(clientPage, `/api/messages/conversations/${conversationId}`)
    reply = (thread.data.messages || []).find((message) => message.metadata?.ai_generated && !message.metadata?.ai_typing && message.metadata?.yqaa_trigger_message_id === sent.data.message.id)
    if (state.ai_provider_attention_requested === true && state.ai_mode === 'paused' && (reply || Date.now() - started >= 3000)) break
  }
  check(`${category.id}/provider_attention: AI paused for provider`, state.ai_provider_attention_requested === true && state.ai_mode === 'paused')
  if (reply) {
    check(`${category.id}/provider_attention: actual response and disclosure state`, typeof reply.body === 'string' && reply.body.trim().length >= 20 && thread.data.conversation?.ai_disclosed === true)
    check(`${category.id}/provider_attention: actual response hides pricing floors`, !/(internal floor|reference mean|pricing floor|minimum price is|revenue-safe floor)/i.test(reply.body.toLowerCase()))
  }
  const memory = state.ai_memory || {}
  check(`${category.id}/provider_attention: attention persisted`, memory.provider_attention?.pending === true || state.ai_provider_attention_requested === true)
  receipt.scenarios.push({ category: category.id, name: 'provider_attention', status: 'passed', latency_ms: Date.now() - started, reply_length_bucket: !reply ? 'no_reply' : reply.body.length < 160 ? 'short' : reply.body.length < 600 ? 'medium' : 'long' })
  } finally {
    await auth.context.close()
    clientPage = null
  }
}

async function cleanup() {
  const outcomes = []
  try { if (clientPage) await clientPage.context().close() } catch {}
  clientPage = null
  // Pause every owned thread first, then allow any already queued model work to settle.
  const quietSnapshots = new Map()
  async function verifyOwnedFixtureProfile(profileId, clerkUserId, role) {
    const rows = await dbRequest(`profiles?select=id,clerk_user_id,role,is_test_account,is_hidden&id=eq.${encodeURIComponent(profileId)}`)
    const profile = rows?.[0]
    if (rows?.length !== 1 || profile.id !== profileId || profile.clerk_user_id !== clerkUserId || profile.role !== role || profile.is_test_account !== true || profile.is_hidden !== true) throw new Error('synthetic fixture profile ownership could not be revalidated')
  }
  async function verifyDesignatedClient(profileId, clerkUserId) {
    if (profileId !== DESIGNATED_CLIENT_ID || !clerkUserId) throw new Error('designated client identity does not match the authorized known profile')
    const rows = await dbRequest(`profiles?select=id,clerk_user_id,role,status,is_test_account,is_hidden&id=eq.${encodeURIComponent(DESIGNATED_CLIENT_ID)}`)
    const profile = rows?.[0]
    if (rows?.length !== 1 || profile.id !== DESIGNATED_CLIENT_ID || profile.clerk_user_id !== clerkUserId || profile.role !== 'client' || profile.status !== 'active' || profile.is_test_account !== false || profile.is_hidden !== false) throw new Error('designated client profile ownership could not be revalidated')
    const identity = await clerkApi(`/users/${encodeURIComponent(clerkUserId)}`)
    if (identity.id !== clerkUserId) throw new Error('designated client Clerk identity could not be revalidated')
  }
  async function verifyThreadClient(thread) {
    if (thread.clientKind === 'designated') return verifyDesignatedClient(thread.profileId, thread.clerkUserId)
    return verifyOwnedFixtureProfile(thread.profileId, thread.clerkUserId, 'client')
  }
  for (const thread of fixtureThreads) {
    try {
      await verifyThreadClient(thread)
      await verifyOwnedFixtureProfile(thread.providerProfileId, thread.providerClerkUserId, fixtureProviderRole(thread))
      const rows = await dbRequest(`conversations?select=id,participant_a,participant_b,context_kind,context_id,status,metadata&id=eq.${thread.id}`)
      verifyOwnedConversation(rows?.[0], thread, CURRENT_RUN_MARKER)
      await dbRequest(`conversations?id=eq.${thread.id}&participant_a=eq.${rows[0].participant_a}&participant_b=eq.${rows[0].participant_b}`, { method: 'PATCH', prefer: 'return=minimal', body: { metadata: { ...(rows[0].metadata || {}), ai_mode: 'paused', ai_mode_set_by: 'yqaa_live_acceptance_cleanup', ai_paused_reason: 'acceptance_cleanup' } } })
      const paused = await dbRequest(`conversations?select=id,metadata&id=eq.${thread.id}`)
      if (paused?.[0]?.metadata?.ai_mode !== 'paused') throw new Error('AI pause could not be verified')
      const [messages, offers] = await Promise.all([
        dbRequest(`conversation_messages?select=id,metadata&conversation_id=eq.${thread.id}`),
        loadOwnedThreadOffers(dbRequest, thread),
      ])
      quietSnapshots.set(thread.id, { messageIds: new Set((messages || []).map((row) => row.id)), offerIds: new Set((offers || []).map((row) => row.id)) })
    } catch {
      outcomes.push({ category: thread.category, scenario: thread.scenario, ai_paused: false, quiet_period: 'verification_failed' })
    }
  }
  if (quietSnapshots.size) await releaseIdentityModule.abortableDelay(MAX_WAIT_MS,acceptancePhase.getStore().signal)
  for (const thread of fixtureThreads) {
    const snapshot = quietSnapshots.get(thread.id)
    const quietOutcome = await (async () => {
      try {
        if (!snapshot) throw new Error('AI pause snapshot missing')
        const [messages, offers, conversations] = await Promise.all([
          dbRequest(`conversation_messages?select=id,metadata&conversation_id=eq.${thread.id}`),
          loadOwnedThreadOffers(dbRequest, thread),
          dbRequest(`conversations?select=id,participant_a,participant_b,context_kind,context_id,status,metadata&id=eq.${thread.id}`),
        ])
        const lateReplies = (messages || []).filter((row) => !snapshot.messageIds.has(row.id) && row.metadata?.ai_generated)
        const newOffers = (offers || []).filter((row) => !snapshot.offerIds.has(row.id))
        verifyOwnedConversation(conversations?.[0], thread, CURRENT_RUN_MARKER)
        return { category: thread.category, scenario: thread.scenario, ai_paused: conversations?.[0]?.metadata?.ai_mode === 'paused', quiet_period_ms: MAX_WAIT_MS, late_ai_replies: lateReplies.length, new_offers_after_pause: newOffers.length }
      } catch { return { category: thread.category, scenario: thread.scenario, ai_paused: false, quiet_period_ms: 'verification_failed', late_ai_replies: 'verification_failed', new_offers_after_pause: 'verification_failed' } }
    })()
    outcomes.push(quietOutcome)
    const [archiveOutcome, offerOutcome] = await Promise.all([
      (async () => {
        try {
          await verifyThreadClient(thread)
          await verifyOwnedFixtureProfile(thread.providerProfileId, thread.providerClerkUserId, fixtureProviderRole(thread))
          const rows = await dbRequest(`conversations?select=id,participant_a,participant_b,context_kind,context_id,status,metadata&id=eq.${thread.id}`)
          verifyOwnedConversation(rows?.[0], thread, CURRENT_RUN_MARKER)
          await dbRequest(`conversations?id=eq.${thread.id}&participant_a=eq.${rows[0].participant_a}&participant_b=eq.${rows[0].participant_b}`, { method: 'PATCH', prefer: 'return=minimal', body: { status: 'archived', updated_at: new Date().toISOString() } })
          const archivedRows = await dbRequest(`conversations?select=id,status&id=eq.${thread.id}`)
          return { category: thread.category, scenario: thread.scenario, conversation_status: archivedRows?.[0]?.status || 'missing', archive_action: 'guarded_owner_scoped_database_update' }
        } catch { return { category: thread.category, scenario: thread.scenario, conversation_status: 'verification_failed', archive_action: 'failed' } }
      })(),
      (async () => {
        try {
          if (!snapshot || quietOutcome.ai_paused !== true || quietOutcome.late_ai_replies !== 0 || quietOutcome.new_offers_after_pause !== 0) throw new Error('AI was not verified stopped before offer cleanup')
          await verifyThreadClient(thread)
          await verifyOwnedFixtureProfile(thread.providerProfileId, thread.providerClerkUserId, fixtureProviderRole(thread))
          const ownedRows = await dbRequest(`conversations?select=id,participant_a,participant_b,context_kind,context_id,status,metadata&id=eq.${thread.id}`)
          verifyOwnedConversation(ownedRows?.[0], thread, CURRENT_RUN_MARKER)
          const pending = await cancelOwnedThreadOffers(dbRequest, thread)
          return { category: thread.category, scenario: thread.scenario, pending_offers_remaining: pending.length }
        } catch { return { category: thread.category, scenario: thread.scenario, pending_offers_remaining: 'verification_failed' } }
      })(),
    ])
    outcomes.push(archiveOutcome, offerOutcome)
  }
  for (const provider of fixtureProviders) {
    try {
      await dbRequest(`gigs?id=eq.${provider.gigId}&provider_id=eq.${provider.profileId}`, { method: 'PATCH', prefer: 'return=minimal', body: { status: 'paused', is_hidden: true, updated_at: new Date().toISOString() } })
      const rows = await dbRequest(`gigs?select=id,status,is_hidden&id=eq.${provider.gigId}&provider_id=eq.${provider.profileId}`)
      outcomes.push({ category: provider.category, gig_status: rows?.[0]?.status || 'missing', gig_hidden: rows?.[0]?.is_hidden === true })
    } catch { outcomes.push({ category: provider.category, gig_status: 'verification_failed', gig_hidden: false }) }
  }
  try { if (providerPage) await providerPage.context().close() } catch {}
  try { if (clientPage) await clientPage.context().close() } catch {}
  try { if (browser) await browser.close() } catch {}
  receipt.cleanup = outcomes
  const failed = outcomes.some((item) => typeof item !== 'object' || item.conversation_status !== undefined && item.conversation_status !== 'archived' || item.pending_offers_remaining !== undefined && item.pending_offers_remaining !== 0 || item.gig_status !== undefined && item.gig_status !== 'paused' || item.gig_hidden !== undefined && item.gig_hidden !== true || item.ai_paused !== undefined && item.ai_paused !== true || item.late_ai_replies !== undefined && item.late_ai_replies !== 0 || item.new_offers_after_pause !== undefined && item.new_offers_after_pause !== 0 || item.quiet_period_ms === 'verification_failed' || item.pending_offers_remaining === 'verification_failed')
  if (fixtureThreads.length === 0) receipt.cleanup.push({ status: 'no_conversations_created' })
  return !failed
}

async function persistReceipt() {
  receipt.finished_at = new Date().toISOString()
  const dest = path.join(ARTIFACT_DIR, 'yqaa-live-acceptance-receipt.json')
  await mkdir(path.dirname(dest), { recursive: true })
  await writeFile(dest, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 })
  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows = receipt.scenarios.map((item) => `| ${item.category} | ${item.name} | ${item.status} | ${item.latency_ms} ms |`).join('\n')
    const summary = `\n## YQAA live acceptance receipt\n\n| Category | Scenario | Status | Latency |\n|---|---|---|---:|\n${rows || '| — | — | not run | — |'}\n\nCleanup state: ${JSON.stringify(receipt.cleanup)}\n`
    await writeFile(process.env.GITHUB_STEP_SUMMARY, summary, { flag: 'a', mode: 0o600 })
  }
}

async function launchOwnedBrowser() {
  runController.signal.throwIfAborted()
  browserServer = await chromium.launchServer({headless:true,timeout:15_000})
  if (runController.signal.aborted) {
    browserServer.process()?.kill('SIGKILL')
    runController.signal.throwIfAborted()
  }
  browser = await chromium.connect(browserServer.wsEndpoint(),{timeout:10_000})
  runController.signal.throwIfAborted()
}

async function runAcceptance() {
  for (const key of releaseIdentityModule.requiredAcceptanceSettings(process.env.YQAA_RELEASE_MODE)) if (!process.env[key]) throw new Error(`Required CI setting missing: ${key}`)
  await assertLiveIdentity()
  const replayIncident = String(process.env.YQAA_REPLAY_INCIDENT || 'none')
  if (replayIncident !== 'none' && replayIncident !== INCIDENT_MODE) throw new Error('Unsupported incident replay mode.')
  if (replayIncident === INCIDENT_MODE) {
    initializeFixtureDatabase()
    receipt.mode = 'incident'
    receipt.incident = { name: INCIDENT_MODE, status: 'running' }
    await launchOwnedBrowser()
    const sourceData = await loadIncidentSource()
    const fixtureData = await createIncidentFixtures(sourceData)
    receipt.fixtures = { provider_count: fixtureData.providerCount, gig_count: fixtureData.gigCount, conversation_count: 1, designated_client_mode: true, hidden_test_profiles: true, source_preferences_mirrored: fixtureData.sourcePreferenceMirrored }
    await runIncidentReplay(sourceData, fixtureData)
  } else {
  const publicGenerationOk = await publicGenerationProbe()
  await launchOwnedBrowser()
  await loadAndVerifyFixtures()
  await providerUiChecks()
  const messengerOk = await messengerSmoke()
  await assertLiveIdentity()
  if (!messengerOk) throw new Error('One or more independent Messenger scenarios failed.')
  if (!publicGenerationOk) throw new Error('Public generation gate failed; DM results do not clear full acceptance.')
  receipt.status = 'passed'
  receipt.mode = 'full_acceptance'
  }
}
let error = null
try {
  await releaseIdentityModule.runWithDeadline(runAcceptance,ACCEPTANCE_RUN_BUDGET_MS,runController,()=>{
    // This is solely the browser process launched for this acceptance run.
    browserServer?.process()?.kill('SIGKILL')
  })
} catch (caught) {
  error = safeFailure(caught)
  receipt.status = 'failed'
  receipt.failure = error.slice(0, 240)
} finally {
  const cleanupController = new AbortController()
  let cleanupOk = false
  try {
    cleanupOk = await releaseIdentityModule.runWithDeadline(
      ()=>acceptancePhase.run({phase:'cleanup',signal:cleanupController.signal},cleanup),
      10 * 60_000,cleanupController,()=>{},
    )
  } catch { receipt.cleanup = [{status:'cleanup_deadline_or_failure'}] }
  if (!cleanupOk) {
    receipt.status = 'failed'
    error ||= 'One or more fixture cleanup steps failed.'
  }
  await persistReceipt()
}

if (error) {
  console.error(`YQAA acceptance failed: ${error}`)
  process.exitCode = 1
} else {
  console.log(`YQAA live acceptance ${receipt.status}; receipt saved with scenario names, statuses, and latencies only.`)
}
