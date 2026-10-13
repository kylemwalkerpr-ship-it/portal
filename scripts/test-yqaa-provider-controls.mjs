#!/usr/bin/env node
import { randomUUID } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
const migrationPaths = [
  '../supabase/migrations/20261013120000_yqaa_offer_idempotency.sql',
  '../supabase/migrations/20261013150000_yqaa_provider_controls.sql',
  '../supabase/migrations/20261013170000_yqaa_provider_controls_offer_authority.sql',
].map((path) => fileURLToPath(new URL(path, import.meta.url)))
const psqlBin = '/opt/homebrew/opt/postgresql@16/bin/psql'
const databaseUrl = process.env.YQAA_TEST_DATABASE_URL || 'postgresql://postgres@127.0.0.1:55432/yqaa_test'
const parsed = new URL(databaseUrl)
const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname) || !/(test|local|yqaa)/i.test(databaseName)) {
  throw new Error('Refusing database test: URL must use a loopback host and a database name containing test, local, or yqaa.')
}

function psql(sql, expected = true) {
  const result = spawnSync(psqlBin, ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', databaseUrl], { input: sql, encoding: 'utf8' })
  if (expected && result.status !== 0) throw new Error(result.stderr || `psql exited ${result.status}`)
  if (!expected && result.status === 0) throw new Error('Expected the approval-backed offer transaction to fail.')
  return result.stdout.trim()
}

function psqlAsync(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn(psqlBin, ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', databaseUrl], { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk })
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr || `psql exited ${code}`)))
    child.stdin.end(sql)
  })
}

for (const migration of migrationPaths) psql(`\\i ${migration.replaceAll("'", "''")}\n`)

const fixtures = new Map()
function setup({ status = 'approved', approval = true, scope = 'scope-original' } = {}) {
  const provider = randomUUID()
  const client = randomUUID()
  const conversation = randomUUID()
  const trigger = randomUUID()
  const request = randomUUID()
  const version = 3
  const ids = { provider, client, conversation, trigger, request, version, scope }
  fixtures.set(conversation, ids)
  const lower = provider.localeCompare(client) < 0 ? provider : client
  const upper = lower === provider ? client : provider
  psql(`
    begin;
    insert into public.profiles (id, clerk_user_id, role, status, full_name, email) values
      ('${provider}', 'yqaa-controls-${provider}', 'consultant', 'active', 'YQAA Approval Test Provider', 'yqaa-${provider}@example.invalid'),
      ('${client}', 'yqaa-controls-${client}', 'client', 'active', 'YQAA Approval Test Client', 'yqaa-${client}@example.invalid');
    insert into public.conversations (id, participant_a, participant_b, context_kind, metadata) values
      ('${conversation}', '${lower}', '${upper}', 'general', jsonb_build_object(
        -- resolve_yqaa_pricing_approval changes status but Phase 2 keeps this
        -- request bit until the committed offer applies next-turn metadata.
        'ai_mode','auto','ai_pricing_approval_status','approved','ai_pricing_approval_pending',true,
        'ai_pricing_approval_request_id','${request}','ai_pricing_approval_version',${version},
        'ai_pricing_approval_price_cents',8400,'ai_pricing_approval_scope_hash','${scope}','ai_pricing_approval_gig_id',null
      ));
    insert into public.conversation_messages (id, conversation_id, sender_id, type, body)
      values ('${trigger}', '${conversation}', '${client}', 'text', 'Please prepare the approved scoped offer.');
    ${approval ? `insert into public.yqaa_pricing_approvals (conversation_id,request_id,version,provider_id,price_cents,scope_hash,status)
      values ('${conversation}','${request}',${version},'${provider}',8400,'${scope}','${status}');` : ''}
    commit;
  `)
  return ids
}

function rpcCall(ids, { marker = true, currentScope = ids.scope, trigger = ids.trigger, price = 8400 } = {}) {
  const markerPayload = marker ? `,'approval',jsonb_build_object(
    'conversation_id','${ids.conversation}','request_id','${ids.request}','version',${ids.version},
    'provider_id','${ids.provider}','price_cents',8400,'scope_hash','${ids.scope}','gig_id',null
  )` : ''
  const auditMarker = marker ? `,'approval_authority',jsonb_build_object(
    'conversation_id','${ids.conversation}','request_id','${ids.request}','version',${ids.version},
    'provider_id','${ids.provider}','price_cents',8400,'scope_hash','${ids.scope}','gig_id',null
  )` : ''
  return `select set_config('request.jwt.claim.role','service_role',false);
    select public.commit_yqaa_reply_with_pricing_approval(
      '${ids.conversation}','${trigger}',
      jsonb_build_object('sender_id','${ids.provider}','body','The approved offer is ready.','metadata','{}'::jsonb),
      jsonb_build_object('idempotency_key','yqaa:${ids.conversation}:${trigger}',
        'row',jsonb_build_object('chat_id','${ids.conversation}','sender_id','${ids.provider}','sender_type','consultant',
          'recipient_id','${ids.client}','title','Approval-backed scoped offer','description','A test description for the approval-backed scoped offer.',
          'price',${price},'currency','usd','delivery_days',5,'revisions',1,'expires_at',now()+interval '5 days',
          'yqaa_idempotency_key','yqaa:${ids.conversation}:${trigger}','gig_id',null)${markerPayload},
        'message',jsonb_build_object('body','Approved scoped offer','metadata',jsonb_build_object('ai_generated',true)),
        'audit',jsonb_build_object('conversation_id','${ids.conversation}','provider_id','${ids.provider}','client_id','${ids.client}'${auditMarker})),
      jsonb_build_object('ai_mode','auto','ai_last_scope_hash','${currentScope}')
    );`
}

function result(sql) {
  const lines = psql(sql).split('\n')
  return JSON.parse(lines.at(-1))
}

function cleanup(ids) {
  psql(`delete from public.admin_audit_log where target_table='offers' and target_id in (select id from public.offers where chat_id='${ids.conversation}');
    delete from public.conversations where id='${ids.conversation}';
    delete from public.offers where yqaa_idempotency_key like 'yqaa:${ids.conversation}:%';
    delete from public.provider_pricing_preferences where provider_id='${ids.provider}';
    delete from public.profiles where id in ('${ids.provider}','${ids.client}');`)
  fixtures.delete(ids.conversation)
}

try {
  const approved = setup()
  const committed = result(rpcCall(approved))
  const retry = result(rpcCall(approved))
  if (committed.offer_id !== retry.offer_id || committed.reply_message_id !== retry.reply_message_id) throw new Error('Retry did not return the original offer and reply.')
  const consumed = psql(`select count(*) from public.yqaa_pricing_approvals where conversation_id='${approved.conversation}' and consumed_at is not null`)
  if (consumed !== '1') throw new Error(`Approval consumption count is ${consumed}, expected one.`)
  const auditAuthority = psql(`select payload_snapshot->'approval_authority' from public.admin_audit_log where target_id='${committed.offer_id}'::uuid;`)
  const durableAudit = JSON.parse(auditAuthority)
  if (durableAudit.request_id !== approved.request || durableAudit.price_cents !== 8400 || durableAudit.scope_hash !== approved.scope) {
    throw new Error('Offer audit did not durably record its exact approval identity, price, and scope.')
  }
  console.log('PASS: exact approved below-band price committed in normal mode; retry returned the same offer and consumed approval once.')

  // A later ordinary/autonomous offer is valid without borrowing consumed approval authority.
  const laterTrigger = randomUUID()
  psql(`insert into public.conversation_messages (id,conversation_id,sender_id,type,body) values ('${laterTrigger}','${approved.conversation}','${approved.client}','text','Please send the regular offer.');`)
  const ordinary = rpcCall(approved, { marker: false, trigger: laterTrigger, price: 11000 })
    .replace('commit_yqaa_reply_with_pricing_approval(', 'commit_yqaa_reply(')
  result(ordinary)
  console.log('PASS: a later ordinary offer commits without reusing the consumed approval.')

  const race = setup()
  const raceSql = `select pg_sleep(0.2);\n${rpcCall(race)}`
  const concurrent = await Promise.all([psqlAsync(raceSql), psqlAsync(raceSql)])
  const winners = concurrent.map((out) => JSON.parse(out.split('\n').at(-1)))
  if (winners[0].offer_id !== winners[1].offer_id || winners[0].reply_message_id !== winners[1].reply_message_id) throw new Error('Concurrent approval-backed commits produced different winners.')
  console.log('PASS: concurrent attempts returned one durable offer and reply.')

  for (const scenario of [
    { name: 'missing', opts: { approval: false } },
    { name: 'pending', opts: { status: 'pending' } },
    { name: 'declined', opts: { status: 'declined' } },
    { name: 'already consumed', opts: { status: 'approved' }, consume: true },
    { name: 'scope changed', opts: {}, currentScope: 'scope-changed', invalidate: true },
  ]) {
    const ids = setup(scenario.opts)
    if (scenario.consume) psql(`update public.yqaa_pricing_approvals set consumed_at=now() where conversation_id='${ids.conversation}';`)
    if (scenario.invalidate) {
      const invalidated = psql(`select set_config('request.jwt.claim.role','service_role',false);
        select public.invalidate_yqaa_pricing_approval('${ids.conversation}','${ids.request}',${ids.version});`)
      if (invalidated.split('\n').at(-1) !== 't') throw new Error('Scope change did not invalidate its durable approval.')
    }
    psql(rpcCall(ids, { currentScope: scenario.currentScope || ids.scope }), false)
    const partial = psql(`select count(*) from public.conversation_messages where conversation_id='${ids.conversation}' and metadata->>'yqaa_trigger_message_id'='${ids.trigger}'`)
    if (partial !== '0') throw new Error(`${scenario.name} approval left a partial reply.`)
    if (scenario.invalidate) {
      const status = psql(`select status from public.yqaa_pricing_approvals where conversation_id='${ids.conversation}';`)
      if (status !== 'invalidated') throw new Error(`Scope change left approval status ${status}.`)
    }
    console.log(`PASS: ${scenario.name} approval is rejected without a partial reply.`)
  }

  const changedPreference = setup()
  psql(`insert into public.provider_pricing_preferences (provider_id,flex_pct) values ('${changedPreference.provider}',10);
    update public.provider_pricing_preferences set flex_pct=11 where provider_id='${changedPreference.provider}';`)
  psql(rpcCall(changedPreference), false)
  const preferenceStatus = psql(`select status from public.yqaa_pricing_approvals where conversation_id='${changedPreference.conversation}';`)
  if (preferenceStatus !== 'invalidated') throw new Error(`Preference change left approval status ${preferenceStatus}.`)
  console.log('PASS: provider preference change invalidates an approval and blocks its offer.')
} finally {
  for (const ids of fixtures.values()) cleanup(ids)
}
