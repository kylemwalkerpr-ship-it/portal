#!/usr/bin/env node
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const migration = fileURLToPath(new URL('../supabase/migrations/20261013120000_yqaa_offer_idempotency.sql', import.meta.url))
const databaseUrl = process.env.YQAA_TEST_DATABASE_URL
if (!databaseUrl) throw new Error('Set YQAA_TEST_DATABASE_URL to an isolated local PostgreSQL database.')
const parsed = new URL(databaseUrl)
const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname) || !/(test|local|yqaa)/i.test(databaseName)) {
  throw new Error('Refusing database test: URL must use a loopback host and a database name containing test, local, or yqaa.')
}

function psql(args, sql, expected = true) {
  const result = spawnSync('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', databaseUrl, ...args], {
    input: sql,
    encoding: 'utf8',
  })
  if (expected && result.status !== 0) throw new Error(result.stderr || `psql exited ${result.status}`)
  if (!expected && result.status === 0) throw new Error('Expected the malformed offer transaction to fail.')
  return result.stdout.trim()
}

function psqlAsync(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', databaseUrl], { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk })
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr || `psql exited ${code}`)))
    child.stdin.end(sql)
  })
}

psql(['-f', migration], '')
const providerId = randomUUID()
const clientId = randomUUID()
const conversationId = randomUUID()
const triggerId = randomUUID()
const failedTriggerId = randomUUID()
const commitId = randomUUID()
const lowerId = providerId.localeCompare(clientId) < 0 ? providerId : clientId
const upperId = lowerId === providerId ? clientId : providerId
const now = new Date(Date.now() + 86400000).toISOString()

const setup = `
begin;
insert into public.profiles (id, clerk_user_id, role, status, full_name, email)
values
  ('${providerId}', 'yqaa-db-test-${commitId}-provider', 'consultant', 'active', 'YQAA DB Test Provider', 'yqaa-${commitId}-provider@example.invalid'),
  ('${clientId}', 'yqaa-db-test-${commitId}-client', 'client', 'active', 'YQAA DB Test Client', 'yqaa-${commitId}-client@example.invalid');
insert into public.conversations (id, participant_a, participant_b, context_kind, metadata)
values ('${conversationId}', '${lowerId}', '${upperId}', 'general', '{"ai_mode":"auto"}');
insert into public.conversation_messages (id, conversation_id, sender_id, type, body)
values ('${triggerId}', '${conversationId}', '${clientId}', 'text', 'Please prepare a scoped offer.');
commit;
`

const call = `
select pg_sleep(0.25);
select set_config('request.jwt.claim.role', 'service_role', false);
select public.commit_yqaa_reply(
  '${conversationId}', '${triggerId}',
  jsonb_build_object('sender_id','${providerId}','body','I can prepare this scoped offer for you.','metadata',jsonb_build_object('ai_generated',true,'ai_escalate',true)),
  jsonb_build_object(
    'idempotency_key','yqaa:${conversationId}:${triggerId}',
    'row',jsonb_build_object(
      'chat_id','${conversationId}','sender_id','${providerId}','sender_type','consultant','recipient_id','${clientId}',
      'title','Integration test scoped offer','description','A scoped offer description used to verify atomic persistence.',
      'price',12500,'currency','usd','delivery_days',5,'revisions',1,'expires_at','${now}',
      'yqaa_idempotency_key','yqaa:${conversationId}:${triggerId}','gig_id',null
    ),
    'message',jsonb_build_object('body','Custom offer · Integration test scoped offer · USD 125 · 5-day delivery','metadata',jsonb_build_object('ai_generated',true)),
    'audit',jsonb_build_object('conversation_id','${conversationId}','provider_id','${providerId}','client_id','${clientId}','final_price_cents',12500)
  ),
  jsonb_build_object('ai_mode','paused','ai_provider_attention_requested',true,'ai_memory',jsonb_build_object('provider_attention',jsonb_build_object('pending',true),'last_offer',jsonb_build_object('offer_id','__YQAA_OFFER_ID__','title','Integration test scoped offer')))
);
`

let setupDone = false
try {
  psql([], setup)
  setupDone = true
  const results = await Promise.all([psqlAsync(call), psqlAsync(call)])
  const payloads = results.map((output) => JSON.parse(output.split('\n').filter((line) => line.startsWith('{')).at(-1)))
  if (payloads[0].reply_message_id !== payloads[1].reply_message_id || payloads[0].offer_id !== payloads[1].offer_id) {
    throw new Error('Concurrent commits did not return the same durable winner.')
  }
  const counts = psql([], `
    select json_build_object(
      'commits',(select count(*) from public.yqaa_reply_commits where conversation_id='${conversationId}' and trigger_message_id='${triggerId}'),
      'replies',(select count(*) from public.conversation_messages where conversation_id='${conversationId}' and metadata->>'yqaa_trigger_message_id'='${triggerId}'),
      'offers',(select count(*) from public.offers where yqaa_idempotency_key='yqaa:${conversationId}:${triggerId}'),
      'offer_cards',(select count(*) from public.conversation_messages where conversation_id='${conversationId}' and ref_offer_id='${payloads[0].offer_id}' and type='offer'),
      'memory_offer',(select metadata#>>'{ai_memory,last_offer,offer_id}' from public.conversations where id='${conversationId}'),
      'attention',(select metadata->>'ai_provider_attention_requested' from public.conversations where id='${conversationId}')
    );
  `)
  const result = JSON.parse(counts)
  if (result.commits !== 1 || result.replies !== 1 || result.offers !== 1 || result.offer_cards !== 1
      || result.memory_offer !== payloads[0].offer_id || result.attention !== 'true') {
    throw new Error(`Atomic persistence assertions failed: ${JSON.stringify(result)}`)
  }
  psql([], `insert into public.conversation_messages (id, conversation_id, sender_id, type, body)
    values ('${failedTriggerId}', '${conversationId}', '${clientId}', 'text', 'Please retry persistence safely.');`)
  psql([], `select set_config('request.jwt.claim.role', 'service_role', false);
    select public.commit_yqaa_reply('${conversationId}', '${failedTriggerId}',
      jsonb_build_object('sender_id','${providerId}','body','An offer is ready.','metadata','{}'::jsonb),
      '{}'::jsonb, jsonb_build_object('ai_mode','auto'));`, false)
  const rollbackCounts = JSON.parse(psql([], `select json_build_object(
    'commits',(select count(*) from public.yqaa_reply_commits where conversation_id='${conversationId}' and trigger_message_id='${failedTriggerId}'),
    'replies',(select count(*) from public.conversation_messages where conversation_id='${conversationId}' and metadata->>'yqaa_trigger_message_id'='${failedTriggerId}')
  );`))
  if (rollbackCounts.commits !== 0 || rollbackCounts.replies !== 0) {
    throw new Error(`Failed offer persistence left a partial reply: ${JSON.stringify(rollbackCounts)}`)
  }
  psql([], `set role authenticated; ${call}`, false)
  console.log('PASS: two concurrent PostgreSQL RPC calls produced one reply, offer, offer card, memory update, and provider-attention update.')
  console.log('PASS: an invalid offer rolls back its reply; authenticated role cannot execute the service-only RPC.')
} finally {
  if (setupDone) {
    psql([], `
      delete from public.admin_audit_log where target_table='offers' and payload_snapshot->>'conversation_id'='${conversationId}';
      delete from public.conversations where id='${conversationId}';
      delete from public.offers where yqaa_idempotency_key like 'yqaa:${conversationId}:%';
      delete from public.profiles where id in ('${providerId}','${clientId}');
    `)
  }
}
