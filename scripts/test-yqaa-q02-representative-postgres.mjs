// Isolated local PostgreSQL only. Never accepts a URL or connects to an existing DB.
// Requires initdb, pg_ctl and psql on PATH; no npm packages or network access.
import { mkdtempSync, rmSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
const root = mkdtempSync(join(tmpdir(), 'q02-representative-pg-'))
const data = join(root, 'data'), socket = join(root, 'socket')
mkdirSync(socket)
let started = false, passed = 0
const port = '55439'
function command(name, args) {
  const r = spawnSync(name, args, { encoding: 'utf8', env: { ...process.env, PGCONNECT_TIMEOUT: '5', PGOPTIONS: '-c plpgsql.variable_conflict=error' } })
  if (r.error || r.status !== 0) throw new Error(`${name} failed: ${r.error?.message || r.stderr || r.stdout}`)
  return r.stdout
}
// Quiet suppresses command tags (SET/BEGIN/etc), not stderr or SQL failures.
const psqlArgs = ['-X', '-q', '-h', socket, '-p', port, '-U', 'q02_runner', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At']
function sql(text) { return command('psql', [...psqlArgs, '-c', text]) }
function asyncSql(text) {
  const child = spawn('psql', [...psqlArgs, '-c', text], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PGCONNECT_TIMEOUT: '5', PGOPTIONS: '-c plpgsql.variable_conflict=error' } })
  let stdout = '', stderr = ''
  child.stdout.on('data', x => { stdout += x })
  child.stderr.on('data', x => { stderr += x })
  return new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', code => resolve({ code, stdout, stderr }))
  })
}
const c = '00000000-0000-0000-0000-000000000001'
const subject = '00000000-0000-0000-0000-000000000002'
const provider = '00000000-0000-0000-0000-000000000003'
const outsider = '00000000-0000-0000-0000-000000000004'
const trigger = '00000000-0000-0000-0000-000000000005'
const service = `set request.jwt.claim.role = 'service_role';`
let request = 10
function mutation(action, version, who = subject, key = ++request) {
  return `select public.mutate_yqaa_privacy('${c}','${who}',${version},'00000000-0000-0000-0000-${String(key).padStart(12,'0')}','${action}',${action === 'grant'});`
}
function check(label, fn) { fn(); passed++; console.log(`ok ${passed} - ${label}`) }
function denies(text, pattern) { assert.throws(() => sql(text), pattern) }
function commit(version) {
  return `select public.commit_yqaa_reply('${c}','${trigger}', '{"sender_id":"${provider}","body":"reply","metadata":{"yqaa_consent_version":${version}}}',null,'{}');`
}
// A separate session holds the real conversation lock. Poll pg_locks to prove
// acquisition before starting the contender; timing alone cannot establish order.
async function orderedRace(first, second) {
  const owner = asyncSql(`${service} begin; select * from public.conversations where id='${c}' for update; ${first} select pg_sleep(2); commit;`)
  let locked = false
  for (let i = 0; i < 100; i++) {
    locked = sql(`select exists(select 1 from pg_locks l join pg_stat_activity a on a.pid=l.pid where a.pid<>pg_backend_pid() and l.relation='public.conversations'::regclass and l.mode='RowExclusiveLock' and l.granted);`).trim() === 't'
    if (locked) break
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  assert.ok(locked, 'first transaction did not acquire its mutation lock')
  const contender = asyncSql(service + second)
  return Promise.all([owner, contender])
}
// Extract exact DDL, never silently substitute a weakened fixture definition.
function repository(path) { return readFileSync(new URL('../supabase/' + path, import.meta.url), 'utf8') }
function apply(path, text = repository(path)) {
  console.log(`repository SQL ${path} sha256=${createHash('sha256').update(text).digest('hex')}`)
  sql(text)
}
function table(path, name) {
  const source = repository(path)
  const start = source.indexOf(`create table if not exists public.${name} (`)
  assert.ok(start >= 0, `missing authoritative DDL: ${name}`)
  const stop = source.indexOf('\n);', start)
  assert.ok(stop > start)
  apply(path + '#' + name, source.slice(start, stop + 4))
}
try {
  command('initdb', ['-D', data, '-U', 'q02_runner', '-A', 'trust', '--no-locale', '-c', 'shared_memory_type=mmap', '-c', 'dynamic_shared_memory_type=posix'])
  command('pg_ctl', ['-D', data, '-l', join(root, 'postgres.log'), '-o', `-k ${socket} -p ${port} -c listen_addresses='' -c shared_memory_type=mmap -c dynamic_shared_memory_type=posix`, '-w', 'start'])
  started = true
  sql(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.role() returns text language sql as $$ select current_setting('request.jwt.claim.role',true) $$;
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create table public.profiles(id uuid primary key,role text,clerk_user_id text,status text default 'active', email text,full_name text,country text);
    create table public.attorneys(id uuid primary key);
    create table public.gigs(id uuid primary key,provider_id uuid references public.profiles(id),status text);`)
  table('unified_conversations.sql','conversations')
  table('unified_conversations.sql','conversation_messages')
  table('inquiries_pipeline.sql','inquiries')
  table('inquiries_pipeline.sql','inquiry_messages')
  table('fiverr_gig_system.sql','offers')
  table('fiverr_gig_system.sql','admin_audit_log')
  apply('inquiry_attorney_targeting.sql')
  // Only the status constraint block: later lifecycle sections require cron.
  const lifecycle = repository('inquiry_full_lifecycle.sql')
  apply('inquiry_full_lifecycle.sql#status', lifecycle.slice(0,lifecycle.indexOf('-- 2.')))
  const unified = repository('unified_conversations.sql')
  apply('unified_conversations.sql#bump-trigger', unified.slice(unified.indexOf('create or replace function public.trg_conversation_messages_after_insert()'), unified.indexOf('-- ─── Unread helper')))
  for (const file of [
    '20260907_conversation_ai_mode.sql','20261013120000_yqaa_offer_idempotency.sql',
    '20261013150000_yqaa_provider_controls.sql','20261013170000_yqaa_provider_controls_offer_authority.sql',
    '20261013230000_yqaa_runtime_diagnostics_and_atomic_inquiry.sql',
    '20261014090000_yqaa_reply_runtime_deadline.sql','20261014230000_yqaa_runtime_retry_backoff.sql',
    '20261016090000_yqaa_privacy_lifecycle.sql','20261016100000_yqaa_memory_facts.sql',
    '20261016110000_yqaa_portal_reciprocal.sql',
  ]) apply('migrations/' + file)
  sql(`insert into public.profiles(id,role,clerk_user_id) values('${subject}','client','synthetic_client'),('${provider}','attorney','synthetic_provider'),('${outsider}','client','synthetic_outsider');
    insert into public.conversations(id,participant_a,participant_b) values('${c}','${subject}','${provider}');`)
  const uuid = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
  const epoch = () => Number(sql(`select version from public.yqaa_consent where conversation_id='${c}'`).trim())
  sql(service + mutation('grant',0))
  let next = 500
  function source(body='commercial request') {
    const id = uuid(++next)
    sql(`insert into public.conversation_messages(id,conversation_id,sender_id,body) values('${id}','${c}','${subject}','${body}');`)
    return id
  }
  function offer(id, approval) {
    const key = `yqaa:${c}:${id}`
    return { idempotency_key:key, row:{ sender_id:provider,recipient_id:subject,sender_type:'attorney',
      title:'Synthetic fixture offer',description:'Synthetic service description for isolated verification only.',price:1000,
      currency:'usd',delivery_days:7,revisions:0,expires_at:'2099-01-01T00:00:00Z',yqaa_idempotency_key:key },
      inquiry_seed:{client_profile_id:subject,target_attorney_profile_id:provider},
      message:{body:'Synthetic offer'},inquiry_message:{sender_profile_id:provider,sender_role:'attorney',body:'Synthetic mirror'},
      audit:approval ? {approval_authority:approval} : {fixture:true}, ...(approval ? {approval} : {}) }
  }
  function call(id, version=epoch(), approval, rpc=approval ? 'commit_yqaa_reply_with_atomic_inquiry_and_pricing_approval' : 'commit_yqaa_reply_with_atomic_inquiry', deadline="clock_timestamp()+interval '10 seconds'") {
    const reply={sender_id:provider,body:'Synthetic reply',metadata:{yqaa_consent_version:version}}
    return `select public.commit_yqaa_reply_with_runtime_deadline('${c}','${id}','${JSON.stringify(reply)}','${JSON.stringify(offer(id,approval))}','${JSON.stringify(approval ? {ai_last_scope_hash:approval.scope_hash} : {})}',${deadline},'${rpc}');`
  }
  const tables=['inquiries','offers','conversation_messages','inquiry_messages','admin_audit_log','yqaa_reply_commits']
  const counts=()=>tables.map(t=>sql(`select count(*) from public.${t}`).trim())
  check('production table constraints reject assumptions allowed by minimal V5 fixture',()=>{
    denies(`insert into public.conversations(participant_a,participant_b) values('${subject}','${provider}');`,/unique constraint/)
    denies(`insert into public.conversations(participant_a,participant_b) values(null,'${provider}');`,/not-null constraint/)
    denies(`insert into public.conversations(participant_a,participant_b) values('${provider}','${subject}');`,/check constraint/)
    denies(`insert into public.conversation_messages(conversation_id,sender_id,type) values('${c}','${subject}','invalid');`,/check constraint/)
  })
  check('privacy upgrade preserves Q01 non-retryable commercial rejections',()=>{
    const definition=sql(`select pg_get_functiondef('public.commit_yqaa_reply(uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure)`)
    assert.ok(!definition.includes("errcode = '40001'"))
    assert.ok(definition.includes("errcode = 'P0001'"))
  })
  let id=source()
  check('atomic inquiry rejects foreign seed without orphan effects',()=>{
    const before=counts()
    denies(service+call(id).replace(`"client_profile_id":"${subject}"`,`"client_profile_id":"${outsider}"`),/participant mismatch/)
    assert.deepEqual(counts(),before)
  })
  check('error after all atomic inquiry effects rolls back inquiry and message bump',()=>{
    const before=counts(), metadata=sql(`select row_to_json(c) from public.conversations c`)
    denies(service+`begin; ${call(id)} select 1/0; commit;`,/division by zero/)
    assert.deepEqual(counts(),before)
    assert.equal(sql(`select row_to_json(c) from public.conversations c`),metadata)
  })
  const beforeCancel=counts()
  const canceled=await asyncSql(service+`begin; ${call(id)} set local statement_timeout='30ms'; select pg_sleep(1); commit;`)
  check('cancellation after atomic effects leaves no inquiry or ledger',()=>{
    assert.notEqual(canceled.code,0); assert.match(canceled.stderr,/statement timeout/); assert.deepEqual(counts(),beforeCancel)
  })
  check('forward retry commits atomic inquiry once and replay retains exact IDs',()=>{
    const first=JSON.parse(sql(service+call(id)).trim()), before=counts()
    assert.ok(first.offer_id); assert.ok(first.reply_message_id)
    assert.deepEqual(JSON.parse(sql(service+call(id)).trim()),first); assert.deepEqual(counts(),before)
    assert.equal(sql('select count(*) from public.inquiries').trim(),'1')
  })
  function approval() {
    const requestId=uuid(++next)
    const a={conversation_id:c,request_id:requestId,version:1,provider_id:provider,price_cents:1000,scope_hash:'synthetic-scope',gig_id:null}
    sql(`update public.conversations set metadata=metadata||'${JSON.stringify({ai_pricing_approval_pending:true,ai_pricing_approval_request_id:requestId,ai_pricing_approval_version:1,ai_pricing_approval_price_cents:1000,ai_pricing_approval_scope_hash:a.scope_hash})}' where id='${c}';`)
    sql(service+`select public.resolve_yqaa_pricing_approval('${c}','${requestId}',1,'${provider}','approved');`)
    return a
  }
  id=source(); let a=approval()
  const consumed=()=>sql(`select consumed_at is not null from public.yqaa_pricing_approvals where request_id='${a.request_id}'`).trim()
  check('combined pricing wrapper rollback restores unconsumed approval and all effects',()=>{
    const before=counts()
    denies(service+`begin; ${call(id,epoch(),a)} select 1/0; commit;`,/division by zero/)
    assert.equal(consumed(),'f'); assert.deepEqual(counts(),before)
  })
  check('combined wrapper consumes approval exactly once with atomic inquiry reuse',()=>{
    const first=JSON.parse(sql(service+call(id,epoch(),a)).trim()), before=counts()
    assert.equal(consumed(),'t'); assert.deepEqual(JSON.parse(sql(service+call(id,epoch(),a)).trim()),first)
    assert.deepEqual(counts(),before); assert.equal(sql('select count(*) from public.inquiries').trim(),'1')
  })
  id=source(); a=approval()
  const stale=epoch(), late=call(id,stale,a)
  const race=await orderedRace(mutation('withdraw',stale),late)
  check('withdrawal first rejects combined wrapper and rolls approval consumption back',()=>{
    assert.equal(race[0].code,0,race[0].stderr); assert.notEqual(race[1].code,0)
    assert.match(race[1].stderr,/no longer current|consent changed/); assert.equal(consumed(),'f')
  })
  sql(service+mutation('grant',epoch()))
  check('regrant cannot revive combined envelope or invalidated quote pointers',()=>{
    const before=counts(); denies(service+late,/no longer current|consent changed/); assert.deepEqual(counts(),before)
  })
  id=source(); a=approval()
  check('deadline entry rejects without consuming approval',()=>{
    const before=counts()
    const result=JSON.parse(sql(service+call(id,epoch(),a,undefined,"clock_timestamp()-interval '1 second'")).trim())
    assert.equal(result.runtime_deadline_exceeded,true); assert.equal(consumed(),'f'); assert.deepEqual(counts(),before)
  })
  // Delay at the final ledger boundary, after offer/inquiry/audit preparation.
  sql(`create function public.fixture_delay() returns trigger language plpgsql as $$ begin perform pg_sleep(0.15); return new; end $$;
    create trigger aaa_fixture_delay before insert on public.yqaa_reply_commits for each row execute function public.fixture_delay();`)
  check('deadline expiring after effects rolls entire combined transaction back',()=>{
    const before=counts()
    denies(service+call(id,epoch(),a,undefined,"clock_timestamp()+interval '80 milliseconds'"),/runtime deadline exceeded/)
    assert.equal(consumed(),'f'); assert.deepEqual(counts(),before)
  })
  sql('drop trigger aaa_fixture_delay on public.yqaa_reply_commits; drop function public.fixture_delay();')
  check('forward recovery after deadline commits and preserves retained audit on forget',()=>{
    sql(service+call(id,epoch(),a)); const before=counts()
    sql(service+mutation('forget',epoch())); assert.deepEqual(counts(),before); assert.equal(consumed(),'t')
  })
  id=source()
  const claim=()=>`select public.patch_yqaa_runtime_diagnostic('${c}','${id}','{"ai_last_run_status":"running"}',true);`
  check('lease rejects duplicate, then recovers expired claim; completed replay stays denied',()=>{
    assert.equal(sql(service+claim()).trim(),'t'); assert.equal(sql(service+claim()).trim(),'f')
    sql(`update public.conversations set metadata=metadata||jsonb_build_object('ai_last_run_started_at',clock_timestamp()-interval '33 seconds') where id='${c}';`)
    assert.equal(sql(service+claim()).trim(),'t')
    sql(service+`select public.patch_yqaa_runtime_diagnostic('${c}','${id}','{"ai_last_run_status":"completed"}',false);`)
    assert.equal(sql(service+claim()).trim(),'f')
  })
  for (const role of ['anon','authenticated']) check(`${role} wrapper privileges and real pricing/ledger RLS deny`,()=>{
    for (const fn of ['commit_yqaa_reply_with_atomic_inquiry','commit_yqaa_reply_with_pricing_approval','commit_yqaa_reply_with_atomic_inquiry_and_pricing_approval'])
      assert.equal(sql(`select has_function_privilege('${role}','public.${fn}(uuid,uuid,jsonb,jsonb,jsonb)','EXECUTE');`).trim(),'f')
    for (const table of ['yqaa_pricing_approvals','provider_pricing_preferences','yqaa_reply_commits']) {
      denies(`set role ${role}; select * from public.${table};`,/permission denied/)
      assert.equal(sql(`begin; grant select on public.${table} to ${role}; set local role ${role}; select count(*) from public.${table}; rollback;`).trim(),'0')
    }
  })
  const foreign=uuid(800)
  sql(`insert into public.conversations(id,participant_a,participant_b) values('${foreign}','${provider}','${outsider}');`)
  check('real distinct conversation cannot borrow consent, trigger or atomic inquiry seed',()=>{
    const before=counts()
    denies(service+`select public.read_yqaa_memory('${foreign}','${subject}',null,false);`,/subject not authorized/)
    denies(service+call(id).replaceAll(c,foreign),/participant mismatch/)
    assert.deepEqual(counts(),before)
  })
  id=source('Remember goal: synthetic original')
  const learned=JSON.parse(sql(service+`select public.read_yqaa_memory('${c}','${subject}',${epoch()},true);`).trim())
  const fact=learned.facts.find(f=>f.fact_key==='goal')
  assert.ok(fact,'canonical fact source must be learned')
  const oldEpoch=epoch(), oldCall=call(id,oldEpoch)
  const correction=`select public.mutate_yqaa_fact('${c}','${subject}',${oldEpoch},'${uuid(++next)}','${fact.id}',${fact.version},'correct','synthetic corrected');`
  const correctionRace=await orderedRace(correction,oldCall)
  check('fact correction first fences atomic inquiry wrapper at old retrieval epoch',()=>{
    assert.equal(correctionRace[0].code,0,correctionRace[0].stderr)
    assert.notEqual(correctionRace[1].code,0);assert.match(correctionRace[1].stderr,/consent changed/)
    assert.equal(sql(`select count(*) from public.yqaa_reply_commits where trigger_message_id='${id}'`).trim(),'0')
    assert.equal(sql(`select value is null from public.yqaa_memory_facts where id='${fact.id}'`).trim(),'t')
  })
  check('failed privacy transaction restores consent, facts, derived snapshot and receipt together',()=>{
    const snapshot=()=>['yqaa_consent','yqaa_memory_facts','yqaa_privacy_mutations','conversations'].map(t=>sql(`select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),'[]') from public.${t} x`))
    const before=snapshot()
    denies(service+`begin; ${mutation('withdraw',epoch())} select 1/0; commit;`,/division by zero/)
    assert.deepEqual(snapshot(),before)
  })
  check('failed lease has bounded retry backoff, stale trigger cannot claim',()=>{
    id=source()
    assert.equal(sql(service+claim()).trim(),'t')
    sql(service+`select public.patch_yqaa_runtime_diagnostic('${c}','${id}','{"ai_last_run_status":"failed","ai_last_run_finished_at":"2099-01-01T00:00:00Z"}',false);`)
    assert.equal(sql(service+claim()).trim(),'f')
    sql(`update public.conversations set metadata=metadata||jsonb_build_object('ai_last_run_finished_at',clock_timestamp()-interval '61 seconds') where id='${c}';`)
    assert.equal(sql(service+claim()).trim(),'t')
    const previous=id;id=source()
    assert.equal(sql(service+claim().replaceAll(id,previous)).trim(),'f')
  })
  console.log(`${passed} representative PostgreSQL checks passed; production-shape subset, not full portal or authenticated integration.`)
} catch (error) {
  console.error(`PostgreSQL verification failed after ${passed} checks: ${error.message}`)
  process.exitCode = 1
} finally {
  try {
    if (started) command('pg_ctl', ['-D',data,'-m','immediate','-w','stop'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}
