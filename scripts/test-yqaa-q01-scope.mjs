// Dependency-free offline boundary tests executing the production functions.
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import vm from 'node:vm'
import test from 'node:test'
import assert from 'node:assert/strict'

const source = stripTypeScriptTypes(readFileSync(new URL('../lib/messengerAi.ts', import.meta.url), 'utf8'))
function load(start, end, name, globals) {
  const body = source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)))
  return vm.runInNewContext(`${body.replace(/^export /, '')}\n${name}`, globals)
}
function inquiries(rows, error = null) {
  return { from(table) {
    assert.equal(table, 'inquiries')
    const filters = []
    const q = { select: () => q, eq: (key, value) => { filters.push([key, value]); return q },
      order: () => q, limit: () => q,
      maybeSingle: async () => ({ data: rows.find(row => filters.every(([k, v]) => row[k] === v)) || null, error }) }
    return q
  } }
}
const findInquiry = load('async function findInquiryThread(', '\n\nasync function ', 'findInquiryThread', {})
const own = { id: 'own', client_profile_id: 'client', target_attorney_profile_id: 'provider' }
for (const [label, row] of [
  ['other customer', { ...own, id: 'foreign', client_profile_id: 'outsider' }],
  ['other provider', { ...own, id: 'foreign', target_attorney_profile_id: 'outsider' }],
]) {
  test(`inquiry scope excludes ${label}`, async () => {
    assert.equal(await findInquiry(inquiries([row]), 'provider', 'client', 'foreign'), null)
  })
}
test('valid context and participant-scoped fallback resolve', async () => {
  assert.equal(await findInquiry(inquiries([own]), 'provider', 'client', 'own'), 'own')
  assert.equal(await findInquiry(inquiries([own]), 'provider', 'client', 'foreign'), 'own')
})
test('inquiry persistence errors fail closed', async () => {
  await assert.rejects(findInquiry(inquiries([], new Error('offline failure')), 'provider', 'client', 'own'), /offline failure/)
  await assert.rejects(findInquiry(inquiries([], new Error('offline failure')), 'provider', 'client', null), /offline failure/)
})

function reply({ messages, committed = false }) {
  const queries = []
  const db = { from(table) {
    const filters = []
    queries.push({ table, filters })
    const result = () => ({ data: table === 'yqaa_reply_commits'
      ? committed ? { reply_message_id: 'durable' } : null : messages, error: null })
    const q = { select: () => q, eq: (k, v) => { filters.push([k, v]); return q },
      gt: () => q, order: () => q, limit: () => q, maybeSingle: async () => result(),
      then: resolve => Promise.resolve(result()).then(resolve) }
    return q
  } }
  const fn = load('export async function maybeAutoReply(', '\nexport function scheduleAutoReply(', 'maybeAutoReply', {
    createSupabaseAdminClient: () => db, pendingLocks: new Map(), lastTriggerAt: new Map(), DEBOUNCE_MS: 8000,
    getConversationAiState: async () => ({ ai_mode: 'auto', metadata: {} }),
    resolveProviderAndClient: async () => ({ client: { id: 'client' }, provider: { id: 'provider' } }),
    loadYqaaConsent: async () => ({ version: 1 }),
    readYqaaMemory: async () => ({ consent: { version: 1 }, facts: [], excluded_source_ids: [] }),
    consentCheckedAtCommit: () => true, privacyScopedMessages: rows => rows,
    console, Date,
  })
  return { fn, queries }
}
const customer = { id: 'turn', sender_id: 'client', body: 'Next question', created_at: '2026-10-16T10:00:00Z' }
for (const [label, message] of [
  ['outsider', { ...customer, sender_id: 'outsider' }],
  ['provider', { ...customer, sender_id: 'provider' }],
  ['typing', { ...customer, metadata: { ai_typing: true } }],
  ['AI generated', { ...customer, metadata: { ai_generated: true } }],
  ['AI assistant', { ...customer, metadata: { ai_assistant: true } }],
]) {
  test(`forced trigger excludes ${label}`, async () => {
    const { fn } = reply({ messages: [message] })
    const result = await fn({ conversationId: 'thread', triggerMessageId: 'turn', force: true })
    assert.equal(result.replied, false)
    assert.ok(['empty_thread', 'invalid_trigger_message'].includes(result.skipped))
  })
}
test('a foreign conversation trigger is rejected and history is scoped', async () => {
  const { fn, queries } = reply({ messages: [customer] })
  assert.equal((await fn({ conversationId: 'thread', triggerMessageId: 'foreign' })).skipped, 'invalid_trigger_message')
  assert.deepEqual(queries.find(q => q.table === 'conversation_messages').filters, [['conversation_id', 'thread']])
})
test('a genuine rapid follow-up reaches preparation', async () => {
  const { fn } = reply({ messages: [
    { id: 'prior', sender_id: 'provider', metadata: { ai_generated: true }, created_at: '2026-10-16T09:59:59.500Z' }, customer,
  ] })
  await assert.rejects(fn({ conversationId: 'thread', triggerMessageId: 'turn', runtime: {
    markStage: async stage => { assert.equal(stage, 'prepare_context'); throw new Error('preparation reached') },
  } }), /preparation reached/)
})
test('duplicate committed trigger returns durable result and scopes its lookup', async () => {
  const { fn, queries } = reply({ messages: [], committed: true })
  const result = await fn({ conversationId: 'thread', triggerMessageId: 'turn' })
  assert.equal(result.messageId, 'durable')
  assert.equal(queries.length, 1)
  assert.deepEqual(queries[0].filters, [['conversation_id', 'thread'], ['trigger_message_id', 'turn']])
})

// Wider offline regressions for the existing channel and HTTP auth owners.
const orchestrator = stripTypeScriptTypes(readFileSync(new URL('../lib/yqaaDecisionOrchestrator.ts', import.meta.url), 'utf8'))
const capabilitiesBody = orchestrator.slice(orchestrator.indexOf('export const COMPANION_CHANNEL_CAPABILITIES'), orchestrator.indexOf('\nfunction publicDecision'))
const { capabilities, check } = vm.runInNewContext(`${capabilitiesBody.replace('export const', 'const')}\n({ capabilities: COMPANION_CHANNEL_CAPABILITIES, check: assertChannelCapabilities })`)
for (const channel of ['dm', 'public', 'support']) {
  test(`canonical ${channel} channel capability contract remains valid`, () => {
    assert.doesNotThrow(() => check(channel, capabilities[channel]))
  })
}
for (const channel of ['public', 'support']) {
  test(`${channel} cannot claim DM commerce authority`, () => {
    assert.throws(() => check(channel, capabilities.dm), /Invalid capabilities/)
  })
}
const routeSource = stripTypeScriptTypes(readFileSync(new URL('../app/api/messages/conversations/[id]/ai-reply/route.ts', import.meta.url), 'utf8'))
for (const [label, role, profileId, expected] of [
  ['unrelated provider', 'attorney', 'outsider', 403],
  ['customer participant', 'client', 'client', 403],
  ['student participant', 'student', 'client', 403],
  ['provider participant', 'attorney', 'provider', 200],
  ['authorized admin', 'admin', 'admin', 200],
]) {
  test(`manual reply auth: ${label}`, async () => {
    let calls = 0
    const post = vm.runInNewContext(`${routeSource.slice(routeSource.indexOf('export async function POST')).replace('export ', '')}\nPOST`, {
      Response, Date,
      requirePortalUser: async () => ({ role, profileId, db: {} }),
      getConversationAiState: async () => ({ participant_a: 'client', participant_b: 'provider', ai_mode: 'auto' }),
      isProviderRole: value => ['attorney', 'consultant'].includes(value),
      maybeAutoReply: async () => { calls++; return { replied: true } },
    })
    const response = await post(new Request('https://offline.invalid', { method: 'POST', body: '{}' }), { params: Promise.resolve({ id: 'thread' }) })
    assert.equal(response.status, expected)
    assert.equal(calls, expected === 200 ? 1 : 0)
  })
}
for (const role of ['client', 'student']) {
  test(`canonical ${role}/provider role resolution uses conversation participants`, async () => {
    const resolve = load('async function resolveProviderAndClient(', '\nasync function findInquiryThread(', 'resolveProviderAndClient', {
      PROVIDER_ROLES: new Set(['attorney', 'consultant']), CLIENT_ROLES: new Set(['client', 'student']),
    })
    const profiles = [{ id: 'client', role }, { id: 'provider', role: 'attorney' }, { id: 'outsider', role: 'consultant' }]
    const db = { from: () => ({ select: () => ({ in: async (key, ids) => {
      assert.equal(key, 'id')
      assert.deepEqual(Array.from(ids), ['client', 'provider'])
      return { data: profiles.filter(p => ids.includes(p.id)) }
    } }) }) }
    const result = await resolve(db, { participant_a: 'client', participant_b: 'provider' })
    assert.equal(result.client.id, 'client')
    assert.equal(result.provider.id, 'provider')
  })
}
