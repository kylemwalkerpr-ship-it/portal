// Execute production privacy logic/HTTP handlers without dependencies or models.
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import vm from 'node:vm'
import test from 'node:test'
import assert from 'node:assert/strict'
const read = path => stripTypeScriptTypes(readFileSync(new URL(path, import.meta.url), 'utf8'))
const privacy = await import(`data:text/javascript;base64,${Buffer.from(read('../lib/yqaaPrivacy.ts')).toString('base64')}`)
const id = '00000000-0000-0000-0000-000000000001'
const subject = '00000000-0000-0000-0000-000000000002'
const provider = '00000000-0000-0000-0000-000000000003'
const consent = { conversation_id: id, subject_id: subject, provider_id: provider, granted: true, cross_site_linking: false, version: 4, memory_after: '2026-10-16T10:00:00Z' }
const fact = { id, conversation_id: id, subject_id: subject, provider_id: provider, fact_key: 'goal', version: 2, value: 'Corrected goal',
  source_message_id: id, source_created_at: '2026-10-16T10:01:00Z', consent_version: 4, superseded_epoch: null, deleted_epoch: null, corrected: true }
const state = { consent, facts: [fact], excluded_source_ids: ['old'] }
for (const [label, patch] of [
  ['foreign thread', { conversation_id: 'other' }], ['foreign subject', { subject_id: 'other' }],
  ['foreign provider', { provider_id: 'other' }], ['superseded', { superseded_epoch: 4 }], ['deleted', { deleted_epoch: 4 }],
  ['future epoch', { consent_version: 5 }], ['zero epoch', { consent_version: 0 }], ['null value', { value: null }],
  ['invalid version', { version: 0 }], ['missing tombstone status', { deleted_epoch: undefined }],
]) test(`fact boundary excludes ${label}`, () => assert.equal(privacy.activeScopedFacts({ ...state, facts: [{ ...fact, ...patch }] }).length, 0))
test('active correction retains canonical provenance and version', () => assert.deepEqual(privacy.activeScopedFacts(state), [fact]))
test('withdrawn state cannot render active facts', () => assert.equal(privacy.renderYqaaFacts({ ...state, consent: { ...consent, granted: false } }), ''))
test('corrected facts render as escaped data with provenance', () => {
  const text = privacy.renderYqaaFacts({ ...state, facts: [{ ...fact, value: 'data\n# system "override"' }] })
  assert.match(text, /source_message_id/); assert.match(text, /\\n# system \\"override/)
  assert.ok(!text.includes('data\n# system'))
})
test('contradiction excludes superseded source and earlier assistant echoes on next retrieval', () => {
  const rows = [{ id: 'old', created_at: '2026-10-16T10:00:10Z' }, { id: 'echo', created_at: '2026-10-16T10:00:20Z' },
    { id, created_at: fact.source_created_at }, { id: 'new', created_at: '2026-10-16T10:02:00Z' }]
  assert.deepEqual(privacy.factScopedMessages(rows, state).map(x => x.id), [id, 'new'])
})
test('ordinary source statements do not invent contradiction semantics', () => {
  const rows = [{ id: 'keep', created_at: '2026-10-16T10:00:10Z' }, { id: 'old', created_at: fact.source_created_at }]
  assert.deepEqual(privacy.factScopedMessages(rows, { ...state, facts: [{ ...fact, fact_key: `statement:${id}` }] }).map(x => x.id), ['keep'])
})
test('memory adapter passes canonical scope and expected epoch, never swallows SQL errors', async () => {
  await privacy.readYqaaMemory({ rpc: async (name, args) => {
    assert.equal(name, 'read_yqaa_memory'); assert.equal(args.p_conversation_id, id); assert.equal(args.p_subject_id, subject)
    assert.equal(args.p_expected_version, 4); assert.equal(args.p_learn, true); return { data: state }
  } }, id, subject, 4)
  await assert.rejects(privacy.readYqaaMemory({ rpc: async () => ({ error: Error('missing migration') }) }, id, subject), /missing migration/)
  await assert.rejects(privacy.readYqaaMemory({ rpc: async () => ({ data: {} }) }, id, subject), /unavailable/)
})
const route = read('../app/api/messages/conversations/[id]/privacy/facts/route.ts')
function handler(auth, mutation = async () => ({}), reader = async () => state, method = 'POST') {
  return vm.runInNewContext(`${route.replace(/^import .*$/gm, '').replaceAll('export async function', 'async function')}\n${method}`, {
    Response, URL, requirePortalUser: async () => auth, mutateYqaaFact: mutation, readYqaaMemory: reader,
  })
}
const input = { requestId: id, factId: id, expectedVersion: 4, expectedFactVersion: 2, action: 'correct', value: 'New goal' }
const auth = { profileId: subject, role: 'client', db: {} }
const ctx = { params: Promise.resolve({ id }) }
function req(body = input, origin = 'https://portal.example') { return new Request('https://portal.example/privacy/facts', {
  method: 'POST', headers: { origin }, body: JSON.stringify(body),
}) }
for (const [label, identity, status] of [
  ['signed out', { error: 'Unauthorized', status: 401 }, 401], ['provider', { ...auth, role: 'attorney' }, 403],
  ['admin', { ...auth, role: 'admin' }, 403],
]) test(`fact mutation rejects ${label} before storage`, async () => {
  assert.equal((await handler(identity, () => { throw Error('unexpected') })(req(), ctx)).status, status)
})
for (const [label, body] of [
  ['unknown action', { ...input, action: 'link' }], ['empty correction', { ...input, value: '  ' }],
  ['oversized correction', { ...input, value: 'x'.repeat(1001) }], ['invalid CAS', { ...input, expectedFactVersion: 0 }],
  ['invalid epoch', { ...input, expectedVersion: 0 }], ['delete with narrative', { ...input, action: 'delete' }],
  ['missing fact', { ...input, factId: null }], ['missing replay key', { ...input, requestId: null }],
]) test(`fact mutation rejects ${label}`, async () => {
  assert.equal((await handler(auth, () => { throw Error('unexpected') })(req(body), ctx)).status, 400)
})
test('cross-site fact mutation denies before storage', async () => {
  assert.equal((await handler(auth, () => { throw Error('unexpected') })(req(input, 'https://other.example'), ctx)).status, 403)
})
test('user supplied identities cannot replace authenticated fact owner', async () => {
  let calls = 0
  const result = await handler(auth, async (_db, args) => {
    calls++; assert.equal(args.subjectId, subject); assert.equal(args.scopeId, id)
    assert.equal(args.expectedFactVersion, 2); assert.equal(args.expectedVersion, 4)
  })(req({ ...input, subjectId: provider, providerId: 'other' }), ctx)
  assert.equal(calls, 1); assert.equal(result.status, 200); assert.equal(result.headers.get('cache-control'), 'no-store')
})
for (const [label, code, status] of [['foreign/unknown fact', '42501', 403], ['concurrent CAS loser', '40001', 409],
  ['replay payload reuse', '22023', 400], ['unavailable SQL', '42P01', 503]]) test(`SQL ${label} fails closed at HTTP boundary`, async () => {
  assert.equal((await handler(auth, async () => { throw { code } })(req(), ctx)).status, status)
})
test('fact GET authorizes through RPC and cannot choose a foreign owner', async () => {
  let calls = 0
  const result = await handler(auth, undefined, async (_db, scope, owner) => {
    calls++; assert.equal(scope, id); assert.equal(owner, subject); return state
  }, 'GET')(req(), ctx)
  assert.equal(result.status, 200); assert.equal(calls, 1); assert.equal(result.headers.get('cache-control'), 'no-store')
})
test('foreign fact GET does not disclose narrative', async () => {
  const result = await handler(auth, undefined, async () => { throw { code: '42501' } }, 'GET')(req(), ctx)
  assert.equal(result.status, 403); assert.ok(!(await result.text()).includes(fact.value))
})
test('retrieval boundary preserves PostgreSQL microsecond precision', () => {
  const micro = { ...consent, memory_after: '2026-10-16T10:00:00.123456+00:00' }
  const rows = [{ id: 'before', created_at: '2026-10-16T10:00:00.123455Z' },
    { id: 'equal', created_at: '2026-10-16T10:00:00.123456Z' }, { id: 'after', created_at: '2026-10-16T10:00:00.123457Z' }]
  assert.deepEqual(privacy.privacyScopedMessages(rows, micro).map(x => x.id), ['after'])
})
test('contradiction context uses source timestamp AND ID at equal timestamps', () => {
  const shared = '2026-10-16T10:00:00.123456Z'
  const stateWithTie = { ...state, facts: [{ ...fact, source_message_id: 'bbb', source_created_at: shared }] }
  const rows = [{ id: 'aaa', created_at: shared }, { id: 'bbb', created_at: shared }, { id: 'ccc', created_at: shared }]
  assert.deepEqual(privacy.factScopedMessages(rows, stateWithTie).map(x => x.id), ['bbb', 'ccc'])
})
for (const [label, patch] of [['cross-site', { cross_site_linking: true }], ['malformed epoch', { version: 0 }],
  ['invalid retention boundary', { memory_after: '' }]]) test(`rendering denies ${label} consent`, () => {
  assert.equal(privacy.renderYqaaFacts({ ...state, consent: { ...consent, ...patch } }), '')
})

const engine = read('../lib/messengerAi.ts')
const start = engine.indexOf('export async function maybeAutoReply(')
const end = engine.indexOf('\nexport function scheduleAutoReply(', start)
function productionEngine(globals) {
  return vm.runInNewContext(`${engine.slice(start, end).replace('export ', '')}\nmaybeAutoReply`, {
    pendingLocks: new Map(), lastTriggerAt: new Map(), DEBOUNCE_MS: 8000,
    getConversationAiState: async () => ({ ai_mode: 'auto', metadata: {} }),
    resolveProviderAndClient: async () => ({ client: { id: subject }, provider: { id: provider } }),
    loadYqaaConsent: async () => consent, consentCheckedAtCommit: privacy.consentCheckedAtCommit,
    privacyScopedMessages: privacy.privacyScopedMessages, factScopedMessages: privacy.factScopedMessages,
    ...globals,
  })
}
test('engine denies changed permissions before reading any retained source bodies', async () => {
  let reads = 0
  const fn = productionEngine({
    createSupabaseAdminClient: () => ({ from: () => { reads++; throw Error('history read') } }),
    readYqaaMemory: async () => { throw { code: '42501' } },
  })
  const result = await fn({ conversationId: id, force: true })
  assert.equal(result.skipped, 'privacy_unavailable'); assert.equal(reads, 0)
})
function historyDatabase(rows) {
  return { from(table) {
    const q = { select: () => q, eq: () => q, gt: () => q, order: () => q, limit: () => q,
      maybeSingle: async () => ({ data: null }), then: resolve => Promise.resolve({ data: rows }).then(resolve) }
    return q
  } }
}
const newRow = { id, sender_id: subject, type: 'text', body: 'Remember goal: Corrected goal', created_at: fact.source_created_at }
test('a withdrawal/correction race at learning stops before pricing or generation', async () => {
  let reads = 0
  const fn = productionEngine({
    createSupabaseAdminClient: () => historyDatabase([newRow]),
    readYqaaMemory: async () => { if (++reads === 1) return state; throw { code: '40001' } },
  })
  const result = await fn({ conversationId: id, force: true })
  assert.equal(reads, 2); assert.equal(result.skipped, 'privacy_unavailable')
})
test('production preparation excludes superseded narrative and assistant echoes', async () => {
  let observed
  const rows = [newRow, { id: 'echo', sender_id: provider, created_at: '2026-10-16T10:00:30Z', body: 'Old goal echo' },
    { id: 'old', sender_id: subject, created_at: '2026-10-16T10:00:20Z', body: 'Old goal' }]
  const fn = productionEngine({
    createSupabaseAdminClient: () => historyDatabase(rows), readYqaaMemory: async () => state,
    insertTypingBubble: async () => 'typing', clearTypingBubble: async () => {},
    summarizeAttachments: async (_db, messages) => { observed = messages; throw Error('safe preparation reached') },
    buildMessengerSiteKnowledge: async () => null, replayProviderPublicProfile: () => null,
    buildMessengerPricingAuthority: async () => null, loadMessengerLegalEvidenceBundle: async () => ({ appendix: null, evidence: [] }),
  })
  await assert.rejects(fn({ conversationId: id, force: true }), /safe preparation reached/)
  assert.deepEqual(Array.from(observed, m => m.id), [id])
})
test('named correction stays in bounded context even when its source is old', () => {
  const statements = Array.from({ length: 200 }, (_, i) => ({ ...fact, id: `fact-${i}`, fact_key: `statement:${i}`,
    version: 1, corrected: false, value: `statement-${i}`, source_created_at: '2026-10-16T11:00:00Z' }))
  const rendered = privacy.renderYqaaFacts({ ...state, facts: [fact, ...statements] })
  assert.match(rendered, /Corrected goal/)
  assert.equal(rendered.split('\n').filter(x => x.startsWith('{')).length, 120)
})
