#!/usr/bin/env node
/**
 * Bounded, manual-only production acceptance for authenticated YQAA Messenger.
 * All app records are owned test fixtures; no customer profile is edited.
 */
import { randomBytes, createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '@playwright/test'

const BASE = 'https://portal.yousafeconsultancy.com'
const STUDENT_PROFILE_ID = 'c2a46c19-abd0-4404-91e2-f4139938428d'
const MAX_TURNS = 9
const MAX_WAIT_MS = 60_000
const RUN_ID = process.env.GITHUB_RUN_ID || `manual-${Date.now()}`
const RUN_ATTEMPT = process.env.GITHUB_RUN_ATTEMPT || '1'
const PROVIDER_USERNAME = `yqaa_live_acceptance_${RUN_ID}_${RUN_ATTEMPT}`.slice(0, 64)
const ARTIFACT_DIR = process.env.GITHUB_STEP_SUMMARY ? (process.env.RUNNER_TEMP || path.resolve('artifacts/yqaa-live-acceptance')) : path.resolve('artifacts/yqaa-live-acceptance')
const receipt = { version: 1, started_at: new Date().toISOString(), checks: [], scenarios: [], cleanup: 'pending' }
let browser
let studentPage
let providerPage
let providerProfileId
let studentClerkId
let gigId
let fixtureThreads = []
let supabaseUrl
let serviceKey

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

async function checkedFetch(url, init = {}, label = 'request') {
  let response
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) })
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
  if (!response.ok) throw new Error(`Fixture database ${response.status} at ${tablePath.split('?')[0]}`)
  return data
}

async function assertLiveIdentity() {
  const expectedSha = String(process.env.YQAA_EXPECTED_SHA || '').toLowerCase()
  const expectedBuild = String(process.env.YQAA_EXPECTED_BUILD_ID || '')
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
  receipt.deployment = { sha: expectedSha, build_id_hash: safeHash(expectedBuild), workflow_run: latest.run_number }
}

async function loadAndVerifyFixtures() {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_JWT
  if (!envUrl || !serviceKey) throw new Error('Supabase URL and service-role secret are required in CI.')
  supabaseUrl = envUrl.replace(/\/$/, '')
  if (new URL(supabaseUrl).hostname.endsWith('.supabase.co') !== true) throw new Error('Refusing non-production Supabase host.')
  const students = await dbRequest(`profiles?select=id,clerk_user_id,role,status,is_test_account&id=eq.${STUDENT_PROFILE_ID}`)
  const student = students?.[0]
  check('existing E2E student is an isolated test account', student?.id === STUDENT_PROFILE_ID && typeof student?.clerk_user_id === 'string' && student.clerk_user_id.startsWith('user_') && student?.role === 'client' && student?.status === 'active' && student?.is_test_account === true)
  studentClerkId = student.clerk_user_id

  const existing = await clerkApi(`/users?username=${encodeURIComponent(PROVIDER_USERNAME)}`)
  let providerUser = Array.isArray(existing) ? existing[0] : null
  if (providerUser) {
    if (providerUser.public_metadata?.yqaa_live_acceptance !== true) throw new Error('Existing synthetic provider identity is not marked as an acceptance fixture.')
  } else {
    providerUser = await clerkApi('/users', {
      method: 'POST',
      body: JSON.stringify({
        username: PROVIDER_USERNAME,
        password: `Yqaa-${randomBytes(32).toString('base64url')}!`,
        first_name: 'YQAA',
        last_name: 'Acceptance Provider',
        public_metadata: { yqaa_live_acceptance: true, synthetic: true },
      }),
    })
  }
  if (!providerUser?.id || providerUser.public_metadata?.yqaa_live_acceptance !== true) throw new Error('Could not establish isolated synthetic provider identity.')

  const priorProviderProfiles = await dbRequest(`profiles?select=id,clerk_user_id,role,is_test_account&clerk_user_id=eq.${encodeURIComponent(providerUser.id)}`)
  if (priorProviderProfiles?.length && (priorProviderProfiles[0].role !== 'consultant' || priorProviderProfiles[0].is_test_account !== true)) throw new Error('Synthetic provider identity is linked to a non-fixture profile; refusing to mutate it.')
  const providerFixtureEmail = `yqaa-live-provider-${RUN_ID}-${RUN_ATTEMPT}@providers.invalid`
  const profiles = await dbRequest('profiles?on_conflict=clerk_user_id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: [{ clerk_user_id: providerUser.id, email: providerFixtureEmail, role: 'consultant', status: 'active', full_name: 'YQAA Acceptance Provider', is_test_account: true }],
  })
  const provider = profiles?.[0]
  if (!provider?.id || provider.clerk_user_id !== providerUser.id || provider.role !== 'consultant' || provider.is_test_account !== true) throw new Error('Synthetic provider profile ownership could not be confirmed.')
  providerProfileId = provider.id
  const slug = `yqaa-live-${RUN_ID}-${RUN_ATTEMPT}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 80)
  const priorGigs = await dbRequest(`gigs?select=id,provider_id,status,slug,title,tags&slug=eq.${encodeURIComponent(slug)}`)
  if (priorGigs?.length) {
    const prior = priorGigs[0]
    if (prior.provider_id !== providerProfileId || prior.status !== 'paused' || prior.title !== 'Synthetic document organization support' || !prior.tags?.includes('acceptance-fixture')) throw new Error('Existing gig fixture ownership or paused state could not be confirmed.')
    gigId = prior.id
  } else {
    const gigs = await dbRequest('gigs?select=id,provider_id,status,slug', {
      method: 'POST', prefer: 'return=representation',
      body: [{ provider_id: providerProfileId, provider_type: 'consultant', title: 'Synthetic document organization support', category: 'Education', subcategory: 'Study Abroad', slug, pitch: 'Synthetic acceptance fixture. No actual clients, credentials, or professional services.', description: 'Synthetic acceptance fixture for general document organization and checklist preparation. This paused listing is not available to the public and does not represent a real consultant, licensed credential, client, or paid service.', requirements: 'No actual client materials. Test fixture only.', status: 'paused', tags: ['synthetic', 'acceptance-fixture'] }],
    })
    if (!gigs?.[0]?.id || gigs[0].provider_id !== providerProfileId || gigs[0].status !== 'paused') throw new Error('Could not create a hidden paused gig fixture.')
    gigId = gigs[0].id
    await dbRequest('gig_tiers', { method: 'POST', prefer: 'return=minimal', body: [
      { gig_id: gigId, tier: 'basic', title: 'Checklist only', description: 'Synthetic fixture tier; checklist organization only.', price: 2500, delivery_days: 5, revisions: 1, features: ['Synthetic test fixture'] },
      { gig_id: gigId, tier: 'standard', title: 'Checklist plus review', description: 'Synthetic fixture tier; no actual client records.', price: 5000, delivery_days: 7, revisions: 1, features: ['Synthetic test fixture'] },
    ] })
  }
  const clientFixtures = [{ scenario: 'orientation', profileId: STUDENT_PROFILE_ID, clerkUserId: studentClerkId }]
  for (const scenario of scenarios.slice(1)) {
    const username = `yqaa_live_acceptance_${RUN_ID}_${RUN_ATTEMPT}_${scenario.name}`.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 64)
    const found = await clerkApi(`/users?username=${encodeURIComponent(username)}`)
    let clientUser = Array.isArray(found) ? found[0] : null
    if (clientUser) {
      if (clientUser.public_metadata?.yqaa_live_acceptance_client !== true) throw new Error('Existing synthetic client identity is not marked as an acceptance fixture.')
    } else {
      clientUser = await clerkApi('/users', { method: 'POST', body: JSON.stringify({
        username,
        password: `Yqaa-${randomBytes(32).toString('base64url')}!`,
        first_name: 'YQAA',
        last_name: 'Acceptance Client',
        public_metadata: { yqaa_live_acceptance_client: true, synthetic: true },
      }) })
    }
    if (!clientUser?.id) throw new Error('Could not establish isolated synthetic client identity.')
    const priorProfiles = await dbRequest(`profiles?select=id,clerk_user_id,role,is_test_account&clerk_user_id=eq.${encodeURIComponent(clientUser.id)}`)
    if (priorProfiles?.length && (priorProfiles[0].role !== 'client' || priorProfiles[0].is_test_account !== true)) throw new Error('Synthetic client identity is linked to a non-fixture profile; refusing to mutate it.')
    const clientFixtureEmail = `${username}@example.invalid`
    const rows = await dbRequest('profiles?on_conflict=clerk_user_id', {
      method: 'POST', prefer: 'resolution=merge-duplicates,return=representation',
      body: [{ clerk_user_id: clientUser.id, email: clientFixtureEmail, role: 'client', status: 'active', full_name: 'YQAA Acceptance Client', is_test_account: true }],
    })
    const profile = rows?.[0]
    if (!profile?.id || profile.clerk_user_id !== clientUser.id || profile.role !== 'client' || profile.is_test_account !== true) throw new Error('Synthetic client profile ownership could not be confirmed.')
    clientFixtures.push({ scenario: scenario.name, profileId: profile.id, clerkUserId: clientUser.id })
  }

  for (const client of clientFixtures) {
    const [participantA, participantB] = [client.profileId, providerProfileId].sort()
    const preexisting = await dbRequest(`conversations?select=id,participant_a,participant_b,context_kind,context_id,status,metadata&participant_a=eq.${participantA}&participant_b=eq.${participantB}`)
    if (preexisting?.length && preexisting[0].metadata?.yqaa_live_acceptance !== true) throw new Error('Existing conversation is not marked as an acceptance fixture; refusing to reuse it.')
    const result = await dbRequest('rpc/get_or_create_conversation', {
      method: 'POST', prefer: 'return=representation',
      body: { p_a: client.profileId, p_b: providerProfileId, p_context_kind: 'gig', p_context_id: gigId },
    })
    const id = typeof result === 'string' ? result.replaceAll('"', '') : result
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Conversation fixture RPC did not return an id.')
    fixtureThreads.push({ id, profileId: client.profileId, clerkUserId: client.clerkUserId, scenario: client.scenario })
    const rows = await dbRequest(`conversations?select=id,participant_a,participant_b,context_kind,context_id,status,metadata&id=eq.${id}`)
    const row = rows?.[0]
    if (!row || ![row.participant_a, row.participant_b].includes(client.profileId) || ![row.participant_a, row.participant_b].includes(providerProfileId) || row.context_kind !== 'gig' || row.context_id !== gigId) throw new Error('Conversation fixture ownership is ambiguous.')
    const ownMessages = await dbRequest(`conversation_messages?select=id,metadata&conversation_id=eq.${id}&limit=1`)
    if (ownMessages?.length) throw new Error('This isolated run already has conversation messages; refusing a duplicate live run.')
    await dbRequest(`conversations?id=eq.${id}`, { method: 'PATCH', prefer: 'return=minimal', body: { status: 'active', metadata: { ...(row.metadata || {}), ai_mode: 'auto', ai_disclosed: false, yqaa_live_acceptance: true, yqaa_live_acceptance_run: safeHash(`${RUN_ID}:${RUN_ATTEMPT}`) } } })
  }
  receipt.fixtures = { provider_profile_hash: safeHash(providerProfileId), gig_hash: safeHash(gigId), conversation_count: fixtureThreads.length, synthetic_client_count: fixtureThreads.length - 1, provider_username_hash: safeHash(PROVIDER_USERNAME) }
}

async function authenticatedPage(clerkUserId, landing) {
  const token = await clerkApi('/sign_in_tokens', { method: 'POST', body: JSON.stringify({ user_id: clerkUserId, expires_in_seconds: 600 }) })
  if (!token?.token) throw new Error('Clerk Backend API did not issue a one-time sign-in token.')
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  try {
    await page.goto(`${BASE}/sign-in?__clerk_ticket=${encodeURIComponent(token.token)}&return_to=${encodeURIComponent(landing)}`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  } catch {
    await context.close()
    throw new Error('Clerk sign-in page could not be reached.')
  }
  const result = await page.evaluate(async (ticket) => {
    for (let i = 0; i < 80; i++) {
      const root = window.Clerk
      if (root?.client && root?.setActive) break
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    const root = window.Clerk
    if (!root?.setActive) return { ok: false }
    try {
      const client = await root.client
      const attempt = await client.signIn.create({ strategy: 'sign_in_token', token: ticket })
      if (!attempt.createdSessionId) return { ok: false }
      await root.setActive({ session: attempt.createdSessionId })
      return { ok: true }
    } catch { return { ok: false } }
  }, token.token)
  if (!result?.ok) { await context.close(); throw new Error('Clerk one-time token could not establish a browser session.') }
  await page.goto(`${BASE}${landing}`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  return { context, page }
}

async function api(page, route, { method = 'GET', body } = {}) {
  const response = await page.request.fetch(`${BASE}${route}`, {
    method,
    ...(body === undefined ? {} : { data: body }),
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    timeout: 45_000,
  })
  const data = await response.json().catch(() => ({}))
  return { status: response.status(), data }
}

async function providerUiChecks() {
  const auth = await authenticatedPage((await clerkApi(`/users?username=${encodeURIComponent(PROVIDER_USERNAME)}`))[0].id, '/dashboard/pricing')
  providerPage = auth.page
  const prefsApi = await api(providerPage, '/api/provider/pricing-preferences')
  check('provider controls authenticated API', prefsApi.status === 200 && prefsApi.data.available === true)
  await providerPage.getByText('Negotiation limits', { exact: true }).waitFor({ timeout: 20_000 })
  await providerPage.getByText('Allow YQAA to negotiate within my pricing preferences', { exact: true }).waitFor({ timeout: 20_000 })
  check('provider pricing controls UI', true)

  await providerPage.goto(`${BASE}/dashboard/gigs/${gigId}/edit`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  await providerPage.getByRole('heading', { name: 'Edit Your Gig' }).waitFor({ timeout: 20_000 })
  const pageText = await providerPage.locator('body').innerText({ timeout: 20_000 })
  check('paused fixture gig editor authenticated UI', pageText.toLowerCase().includes('pricing'))
  const gigApi = await api(providerPage, `/api/gigs/${gigId}`)
  const payload = gigApi.data?.data?.gig || gigApi.data?.gig
  check('gig scope fixture loaded through provider API', gigApi.status === 200 && payload?.id === gigId && payload?.status === 'paused' && Array.isArray(payload?.tiers) && payload.tiers.length >= 2)
  await providerPage.getByRole('button', { name: /^pricing$/i }).first().click()
  const pricingText = (await providerPage.locator('body').innerText()).toLowerCase()
  check('gig pricing and scope editor UI', pricingText.includes('scope units') && pricingText.includes('scope depth') && pricingText.includes('tier description'))
  await auth.context.close()
  providerPage = null
}

const scenarios = [
  { name: 'orientation', text: 'Hi. I am planning to study in Canada next year. What can this service help me understand, and what should I clarify first?' },
  { name: 'budget', text: 'I have about CAD 450 for help organizing a study permit document checklist. Is that enough for a clearly defined task?' },
  { name: 'scope_narrowing', text: 'I first considered organizing the full study permit packet, but let us narrow the request to my existing checklist only. Please leave form completion and advice out of scope.' },
  { name: 'counter', text: 'For a checklist-only document review, I can pay CAD 450. The quoted total is CAD 600; would you accept CAD 510, which is 15 percent off, for exactly the same scope?' },
  { name: 'lowball', text: 'My maximum is CAD 25 for everything. Please say what, if anything, could realistically fit that amount without promising the full request.' },
  { name: 'frustration', text: 'This is frustrating; I still do not understand what is included or what happens next. Can you explain it plainly?' },
  { name: 'disclosure', text: 'Before we continue, who is responding in this chat and are you a human?' },
  { name: 'no_stale_floors', text: 'For a checklist-only document review, what limited scope and price would you suggest? Please do not quote internal minimums or stale pricing floors.' },
  { name: 'provider_attention', text: 'Please ask the provider to review this request personally and pause automated negotiation until they respond.' },
]

async function messengerSmoke() {
  for (let index = 0; index < Math.min(scenarios.length, MAX_TURNS); index++) {
    const scenario = scenarios[index]
    const fixture = fixtureThreads[index]
    const conversationId = fixture?.id
    if (!fixture || fixture.scenario !== scenario.name) throw new Error(`${scenario.name}: isolated fixture mapping is missing.`)
    if (index === 0) {
      const unauth = await fetch(`${BASE}/api/messages/conversations/${conversationId}`, { headers: { Accept: 'application/json' } })
      check('messenger rejects unauthenticated access', unauth.status === 401)
    }
    const auth = await authenticatedPage(fixture.clerkUserId, '/messenger')
    studentPage = auth.page
    const initial = await api(studentPage, `/api/messages/conversations/${conversationId}`)
    check(`${scenario.name}: authenticated client owns fixture conversation`, initial.status === 200 && initial.data.conversation?.id === conversationId && initial.data.conversation?.counterpart?.id === providerProfileId)
    const started = Date.now()
    const sent = await api(studentPage, `/api/messages/conversations/${conversationId}`, { method: 'POST', body: { body: scenario.text } })
    check(`${scenario.name}: authenticated DM message accepted`, sent.status === 200 && sent.data.message?.sender_id === fixture.profileId && typeof sent.data.message?.id === 'string')
    const triggerId = sent.data.message.id
    const deadline = Date.now() + MAX_WAIT_MS
    let reply = null
    let latestThread = null
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1500))
      const thread = await api(studentPage, `/api/messages/conversations/${conversationId}`)
      if (thread.status !== 200) throw new Error(`${scenario.name}: authenticated thread read returned HTTP ${thread.status}`)
      latestThread = thread.data
      reply = (thread.data.messages || []).find((message) => message.metadata?.ai_generated && !message.metadata?.ai_typing && message.metadata?.yqaa_trigger_message_id === triggerId)
      if (reply) {
        const conversation = thread.data.conversation || {}
        if (conversation.ai_disclosed !== true) throw new Error(`${scenario.name}: disclosure metadata was not recorded.`)
        break
      }
    }
    if (!reply || typeof reply.body !== 'string' || reply.body.trim().length < 20) throw new Error(`${scenario.name}: no substantive AI-generated reply within the bound.`)
    const diagnosticRows = await dbRequest(`conversations?select=metadata&id=eq.${conversationId}`)
    const diagnostic = diagnosticRows?.[0]?.metadata || {}
    if (diagnostic.ai_last_trigger_message_id !== triggerId || diagnostic.ai_last_error || diagnostic.ai_last_skip) throw new Error(`${scenario.name}: model/provider diagnostic indicates an unavailable or skipped response.`)
    if (latestThread?.conversation?.ai_disclosed !== true) throw new Error(`${scenario.name}: authenticated thread did not expose disclosure state.`)
    const lower = reply.body.toLowerCase()
    if (scenario.name === 'orientation' && !/(canada|study|checklist|documents|clarif|service)/i.test(reply.body)) throw new Error('orientation: response did not address the stated context.')
    if (scenario.name === 'budget' && !/(budget|cad|450|price|scope|cost)/i.test(reply.body)) throw new Error('budget: response did not address budget or scope.')
    if (scenario.name === 'scope_narrowing' && !/(checklist|scope|organ|exclude|form)/i.test(reply.body)) throw new Error('scope_narrowing: response did not preserve the narrowed scope.')
    if (scenario.name === 'counter' && !/(15|510|counter|reduc|adjust|review|provider|negotia)/i.test(reply.body)) throw new Error('counter: response did not address the requested price change or review.')
    if (scenario.name === 'lowball' && !/(budget|narrow|scope|provider|fit|offer|realistic|cannot|can.t|not able)/i.test(reply.body)) throw new Error('lowball: response did not address the stated budget and viable options.')
    if (scenario.name === 'frustration' && !/(understand|sorry|clear|plain|next|frustrat|included)/i.test(reply.body)) throw new Error('frustration: response did not address the request for a plain explanation.')
    if (scenario.name === 'disclosure' && !/(yqaa|ai-powered|artificial intelligence|i am an ai|i’m an ai)/i.test(reply.body)) throw new Error('disclosure: reply did not identify YQAA as AI.')
    if (scenario.name === 'no_stale_floors' && /(internal floor|reference mean|pricing floor|minimum price is)/i.test(lower)) throw new Error('no_stale_floors: reply exposed internal floor language.')
    if (scenario.name === 'provider_attention') {
      const current = await dbRequest(`conversations?select=metadata&id=eq.${conversationId}`)
      const metadata = current?.[0]?.metadata || {}
      if (metadata.ai_provider_attention_requested !== true || metadata.ai_mode !== 'paused') throw new Error('provider_attention: provider review was not requested and automated mode was not paused.')
    }
    const latency = Date.now() - started
    receipt.scenarios.push({ name: scenario.name, status: 'passed', latency_ms: latency, http_status: sent.status, reply_length_bucket: reply.body.length < 160 ? 'short' : reply.body.length < 600 ? 'medium' : 'long' })
    console.log(`PASS ${scenario.name}: YQAA reply recorded (${latency} ms)`)
    await auth.context.close()
    studentPage = null
  }
}

async function cleanup() {
  const outcomes = []
  try { if (studentPage) await studentPage.context().close() } catch {}
  studentPage = null
  for (const thread of fixtureThreads) {
    let archived = false
    try {
      const { context, page } = await authenticatedPage(thread.clerkUserId, '/messenger')
      const r = await api(page, `/api/messages/conversations/${thread.id}`, { method: 'PATCH', body: { archived: true } })
      archived = r.status === 200
      await context.close()
    } catch {}
    if (!archived) {
      try {
        const rows = await dbRequest(`conversations?select=id,participant_a,participant_b&id=eq.${thread.id}`)
        if (rows?.length === 1 && [rows[0].participant_a, rows[0].participant_b].includes(thread.profileId) && [rows[0].participant_a, rows[0].participant_b].includes(providerProfileId)) {
          await dbRequest(`conversations?id=eq.${thread.id}&participant_a=eq.${rows[0].participant_a}&participant_b=eq.${rows[0].participant_b}`, { method: 'PATCH', prefer: 'return=minimal', body: { status: 'archived', updated_at: new Date().toISOString() } })
          archived = true
        }
        outcomes.push(archived ? 'thread_archived_fixture_fallback' : 'thread_archive_failed')
      } catch { outcomes.push('thread_archive_failed') }
    } else outcomes.push('thread_archived')
    try {
      await dbRequest(`offers?chat_id=eq.${thread.id}&status=eq.pending`, { method: 'PATCH', prefer: 'return=minimal', body: { status: 'cancelled', updated_at: new Date().toISOString() } })
      outcomes.push('pending_offers_cancelled')
    } catch { outcomes.push('offer_cleanup_failed') }
  }
  try {
    if (gigId) {
      await dbRequest(`gigs?id=eq.${gigId}&provider_id=eq.${providerProfileId}`, { method: 'PATCH', prefer: 'return=minimal', body: { status: 'paused', updated_at: new Date().toISOString() } })
      outcomes.push('gig_paused')
    }
  } catch { outcomes.push('gig_pause_failed') }
  try { if (providerPage) await providerPage.context().close() } catch {}
  try { if (studentPage) await studentPage.context().close() } catch {}
  try { if (browser) await browser.close() } catch {}
  receipt.cleanup = outcomes
  const failed = outcomes.some((item) => item.endsWith('_failed'))
  if (!outcomes.includes('gig_paused')) receipt.cleanup.push('no_gig_created')
  return !failed
}

async function persistReceipt() {
  receipt.finished_at = new Date().toISOString()
  const dest = path.join(ARTIFACT_DIR, 'yqaa-live-acceptance-receipt.json')
  await mkdir(path.dirname(dest), { recursive: true })
  await writeFile(dest, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 })
  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows = receipt.scenarios.map((item) => `| ${item.name} | ${item.status} | ${item.latency_ms} ms |`).join('\n')
    const summary = `\n## YQAA live acceptance receipt\n\n| Scenario | Status | Latency |\n|---|---|---:|\n${rows || '| — | not run | — |'}\n\nCleanup: ${receipt.cleanup.join(', ') || receipt.cleanup}\n`
    await writeFile(process.env.GITHUB_STEP_SUMMARY, summary, { flag: 'a', mode: 0o600 })
  }
}

let error = null
try {
  for (const key of ['CLERK_SECRET_KEY', 'YQAA_EXPECTED_SHA', 'YQAA_EXPECTED_BUILD_ID', 'GITHUB_SHA', 'GITHUB_REF', 'GITHUB_REPOSITORY']) if (!process.env[key]) throw new Error(`Required CI setting missing: ${key}`)
  await assertLiveIdentity()
  browser = await chromium.launch({ headless: true })
  await loadAndVerifyFixtures()
  await providerUiChecks()
  await messengerSmoke()
  receipt.status = 'passed'
} catch (caught) {
  error = safeFailure(caught)
  receipt.status = 'failed'
  receipt.failure = error.slice(0, 240)
} finally {
  const cleanupOk = await cleanup()
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
