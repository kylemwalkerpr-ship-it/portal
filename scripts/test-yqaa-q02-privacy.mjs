// Offline execution of production privacy functions; not a DB/semantic TS test.
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import vm from 'node:vm'
import test from 'node:test'
import assert from 'node:assert/strict'
const source = stripTypeScriptTypes(readFileSync(new URL('../lib/yqaaPrivacy.ts', import.meta.url), 'utf8'))
const privacy = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const record = { conversation_id: 'scope', subject_id: 'client', provider_id: 'provider', version: 2,
  granted: true, cross_site_linking: false, memory_after: '2026-10-16T10:00:00Z' }
const envelope = { scopeId: 'scope', subjectId: 'client', providerId: 'provider', expectedVersion: 2 }
test('current scoped consent permits', () => assert.equal(privacy.consentCheckedAtCommit(record, envelope), true))
for (const [label, value] of [
  ['missing', null], ['withdrawn', { ...record, granted: false }],
  ['foreign user', { ...record, subject_id: 'other' }], ['foreign provider', { ...record, provider_id: 'other' }],
  ['foreign conversation', { ...record, conversation_id: 'other' }],
  ['cross-site', { ...record, cross_site_linking: true }], ['invalid date', { ...record, memory_after: '' }],
  ['zero epoch', { ...record, version: 0 }], ['stale epoch', { ...record, version: 3 }],
]) test(`${label} denies`, () => assert.equal(privacy.consentCheckedAtCommit(value, envelope), false))
test('in-flight withdrawal followed by regrant cannot revive a stale envelope', () => {
  assert.equal(privacy.consentCheckedAtCommit({ ...record, granted: false, version: 3 }, envelope), false)
  assert.equal(privacy.consentCheckedAtCommit({ ...record, version: 4 }, envelope), false)
})
test('next retrieval cannot rehydrate forgotten historical messages', () => {
  const rows = [{ id: 'old', created_at: '2026-10-16T09:59:59Z' }, { id: 'equal', created_at: record.memory_after },
    { id: 'new', created_at: '2026-10-16T10:00:01Z' }, { id: 'invalid', created_at: '' }]
  assert.deepEqual(privacy.privacyScopedMessages(rows, record).map(x => x.id), ['new'])
})
test('CAS/replay arguments reach the atomic SQL owner and errors propagate', async () => {
  const args = { scopeId: 'scope', subjectId: 'client', expectedVersion: 2, requestId: 'req', action: 'forget' }
  await privacy.applyMemoryMutation({ rpc: async (name, input) => {
    assert.equal(name, 'mutate_yqaa_privacy'); assert.equal(input.p_subject_id, 'client')
    assert.equal(input.p_expected_version, 2); assert.equal(input.p_request_id, 'req')
    return { data: { version: 3 } }
  } }, args)
  await assert.rejects(privacy.applyMemoryMutation({ rpc: async () => ({ error: new Error('offline') }) }, args), /offline/)
})
const route = stripTypeScriptTypes(readFileSync(new URL('../app/api/messages/conversations/[id]/privacy/route.ts', import.meta.url), 'utf8'))
const scope = '00000000-0000-0000-0000-000000000001'
function endpoint(auth, mutate = async () => ({})) {
  return vm.runInNewContext(`${route.replace(/^import .*$/gm, '').replaceAll('export async function', 'async function')}\nPOST`, {
    Response, URL, requirePortalUser: async () => auth, applyMemoryMutation: mutate, loadYqaaConsent: async () => record,
  })
}
const body = { requestId: scope, expectedVersion: 2, action: 'forget' }
function request(value = body, origin = 'https://portal.example') {
  return new Request('https://portal.example/api/privacy', { method: 'POST', body: JSON.stringify(value), headers: { origin } })
}
test('unauthenticated mutation never reaches storage', async () => {
  const post = endpoint({ error: 'Unauthorized', status: 401 }, () => { throw Error('unexpected') })
  assert.equal((await post(request(), { params: Promise.resolve({ id: scope }) })).status, 401)
})
test('foreign subject deletion fails at authorized RPC boundary', async () => {
  const post = endpoint({ profileId: 'outsider', db: {} }, async (_db, args) => {
    assert.equal(args.subjectId, 'outsider'); throw { code: '42501' }
  })
  assert.equal((await post(request({ ...body, subjectId: 'client' }), { params: Promise.resolve({ id: scope }) })).status, 403)
})
for (const [label, input, origin, status] of [
  ['grant without explicit opt-in', { ...body, action: 'grant' }, undefined, 400],
  ['cross-site linking', { ...body, crossSiteLinking: true }, undefined, 400],
  ['cross-origin request', body, 'https://foreign.example', 403],
  ['unsupported correction', { ...body, action: 'correct' }, undefined, 400],
]) test(`${label} denies before mutation`, async () => {
  const post = endpoint({ profileId: 'client', db: {} }, () => { throw Error('unexpected') })
  assert.equal((await post(request(input, origin), { params: Promise.resolve({ id: scope }) })).status, status)
})
test('concurrent CAS loser surfaces conflict, never success', async () => {
  const post = endpoint({ profileId: 'client', db: {} }, async () => { throw { code: '40001' } })
  assert.equal((await post(request(), { params: Promise.resolve({ id: scope }) })).status, 409)
})

// Exercise the actual engine gate, with dependency boundaries stubbed. A denied
// consent record must stop before reading message bodies or calling a provider.
const engineSource = stripTypeScriptTypes(readFileSync(new URL('../lib/messengerAi.ts', import.meta.url), 'utf8'))
const engineStart = engineSource.indexOf('export async function maybeAutoReply(')
const engineEnd = engineSource.indexOf('\nexport function scheduleAutoReply(', engineStart)
for (const [label, consent, throws] of [
  ['missing consent', null, false], ['withdrawn consent', { ...record, granted: false }, false],
  ['foreign subject', { ...record, subject_id: 'outsider' }, false],
  ['unavailable privacy store', null, true],
]) test(`engine: ${label} stops before context retrieval even with force`, async () => {
  const fn = vm.runInNewContext(`${engineSource.slice(engineStart, engineEnd).replace('export ', '')}\nmaybeAutoReply`, {
    pendingLocks: new Map(), createSupabaseAdminClient: () => ({ from: () => { throw Error('history must not be read') } }),
    getConversationAiState: async () => ({ ai_mode: 'auto', metadata: {} }),
    resolveProviderAndClient: async () => ({ client: { id: 'client' }, provider: { id: 'provider' } }),
    loadYqaaConsent: async () => { if (throws) throw Error('offline'); return consent },
    consentCheckedAtCommit: privacy.consentCheckedAtCommit,
  })
  const result = await fn({ conversationId: 'scope', force: true })
  assert.equal(result.replied, false)
  assert.equal(result.skipped, throws ? 'privacy_unavailable' : 'consent_required')
})

test('SQL commit preserves Q01 effects/idempotency with consent fence and non-retryable business errors', () => {
  const baseline = readFileSync(new URL('../supabase/migrations/20261013120000_yqaa_offer_idempotency.sql', import.meta.url), 'utf8')
  const migration = readFileSync(new URL('../supabase/migrations/20261016090000_yqaa_privacy_lifecycle.sql', import.meta.url), 'utf8')
  const marker = 'create or replace function public.commit_yqaa_reply('
  const original = baseline.slice(baseline.indexOf(marker))
  const changed = migration.slice(migration.indexOf(marker))
  const gateStart = changed.indexOf('  if not exists (\n    select 1 from public.yqaa_consent s')
  const gateEnd = changed.indexOf("  if coalesce(v_conversation.metadata->>'ai_mode'", gateStart)
  assert.ok(gateStart > changed.indexOf("return jsonb_build_object('reply_message_id', v_existing.reply_message_id"))
  assert.ok(gateEnd < changed.indexOf('insert into public.conversation_messages'))
  assert.equal(changed.slice(0, gateStart) + changed.slice(gateEnd), original.replaceAll("errcode = '40001'", "errcode = 'P0001'"))
})

for (const [label, role, profileId, conversation, expected] of [
  ['own customer', 'client', 'client', { participant_a: 'client', participant_b: 'provider' }, 200],
  ['foreign customer', 'client', 'outsider', { participant_a: 'client', participant_b: 'provider' }, 403],
  ['provider participant', 'attorney', 'provider', { participant_a: 'client', participant_b: 'provider' }, 403],
]) test(`consent GET: ${label}`, async () => {
  const db = { from: () => { const q = { select: () => q, eq: () => q,
    maybeSingle: async () => ({ data: conversation }) }; return q } }
  const get = vm.runInNewContext(`${route.replace(/^import .*$/gm, '').replaceAll('export async function', 'async function')}\nGET`, {
    Response, requirePortalUser: async () => ({ db, role, profileId }), loadYqaaConsent: async () => record,
  })
  const result = await get(request(), { params: Promise.resolve({ id: scope }) })
  assert.equal(result.status, expected)
  if (expected === 200) assert.equal(result.headers.get('cache-control'), 'no-store')
})

test('engine applies SQL privacy boundary and newest-window ordering before retrieval', async () => {
  const calls = []
  const newest = { id: 'new', sender_id: 'client', created_at: '2026-10-16T10:02:00Z' }
  const older = { id: 'older', sender_id: 'provider', created_at: '2026-10-16T10:01:00Z' }
  const db = { from(table) {
    const q = {
      select: () => q,
      eq: (key, value) => { calls.push([table, 'eq', key, value]); return q },
      gt: (key, value) => { calls.push([table, 'gt', key, value]); return q },
      order: (key, value) => { calls.push([table, 'order', key, value.ascending]); return q },
      limit: value => { calls.push([table, 'limit', value]); return q },
      maybeSingle: async () => ({ data: null }),
      then: resolve => Promise.resolve({ data: [newest, older] }).then(resolve),
    }
    return q
  } }
  const fn = vm.runInNewContext(`${engineSource.slice(engineStart, engineEnd).replace('export ', '')}\nmaybeAutoReply`, {
    pendingLocks: new Map(), lastTriggerAt: new Map(), DEBOUNCE_MS: 8000,
    createSupabaseAdminClient: () => db,
    getConversationAiState: async () => ({ ai_mode: 'auto', metadata: {} }),
    resolveProviderAndClient: async () => ({ client: { id: 'client' }, provider: { id: 'provider' } }),
    loadYqaaConsent: async () => record, consentCheckedAtCommit: privacy.consentCheckedAtCommit,
    readYqaaMemory: async () => ({ consent: record, facts: [], excluded_source_ids: [] }),
    privacyScopedMessages: privacy.privacyScopedMessages,
  })
  await assert.rejects(fn({ conversationId: 'scope', runtime: { markStage: async stage => {
    assert.equal(stage, 'prepare_context'); throw Error('context reached with latest customer trigger')
  } } }), /context reached with latest customer trigger/)
  assert.deepEqual(calls.filter(x => x[0] === 'conversation_messages'), [
    ['conversation_messages', 'eq', 'conversation_id', 'scope'],
    ['conversation_messages', 'gt', 'created_at', record.memory_after],
    ['conversation_messages', 'order', 'created_at', false],
    ['conversation_messages', 'order', 'id', false],
    ['conversation_messages', 'limit', 120],
  ])
})
