// Isolated local PostgreSQL only. Never accepts a URL or connects to an existing DB.
// Requires initdb, pg_ctl and psql on PATH; no npm packages or network access.
import { mkdtempSync, rmSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
const root = mkdtempSync(join(tmpdir(), 'q02-pg-'))
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
try {
  command('initdb', ['-D', data, '-U', 'q02_runner', '-A', 'trust', '--no-locale'])
  command('pg_ctl', ['-D', data, '-l', join(root, 'postgres.log'), '-o', `-k ${socket} -p ${port} -c listen_addresses='' -c shared_memory_type=mmap -c dynamic_shared_memory_type=posix`, '-w', 'start'])
  started = true
  check('quiet psql isolates JSON from SET and transaction command tags', () => {
    const query = `begin; set local application_name='q02-parser-proof'; select json_build_object('isolated',true); commit;`
    assert.deepEqual(JSON.parse(sql(query).trim()), { isolated: true })
  })
  const asyncParser = await asyncSql(`set application_name='q02-async-parser-proof'; select json_build_object('isolated',true);`)
  check('async quiet psql isolates JSON and retains SQL errors', () => {
    assert.equal(asyncParser.code,0,asyncParser.stderr)
    assert.deepEqual(JSON.parse(asyncParser.stdout.trim()), { isolated: true })
    denies(`set application_name='q02-error-proof'; select 1/0;`, /division by zero/)
  })
  const asyncError = await asyncSql('select 1/0; select 42;')
  check('async SQL errors remain fatal and stop subsequent statements', () => {
    assert.notEqual(asyncError.code,0)
    assert.match(asyncError.stderr,/division by zero/)
    assert.equal(asyncError.stdout.trim(),'')
  })
  sql(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create function auth.role() returns text language sql as $$ select current_setting('request.jwt.claim.role',true) $$;
    create table public.profiles(id uuid primary key,role text,clerk_user_id text default 'fixture_clerk',status text default 'active');
    create table public.conversations(id uuid primary key,participant_a uuid,participant_b uuid,metadata jsonb default '{}',updated_at timestamptz);
    create table public.conversation_messages(id uuid primary key default gen_random_uuid(),conversation_id uuid,sender_id uuid,type text,body text,metadata jsonb,created_at timestamptz default clock_timestamp(),ref_offer_id uuid,ref_inquiry_id uuid);
    create table public.offers(id uuid primary key default gen_random_uuid(),chat_id uuid,sender_id uuid,sender_type text,recipient_id uuid,title text,description text,price integer,currency text,delivery_days integer,revisions integer,expires_at timestamptz,gig_id uuid,status text default 'pending');
    create table public.inquiries(id uuid,client_profile_id uuid,target_attorney_profile_id uuid);
    create table public.gigs(id uuid,provider_id uuid,status text);
    create table public.inquiry_messages(inquiry_id uuid,sender_role text,sender_profile_id uuid,body text);
    create table public.admin_audit_log(admin_id uuid,action_type text,target_table text,target_id uuid,payload_snapshot jsonb,reason text);`)
  for (const file of ['20261013120000_yqaa_offer_idempotency.sql', '20261016090000_yqaa_privacy_lifecycle.sql', '20261016100000_yqaa_memory_facts.sql', '20261016110000_yqaa_portal_reciprocal.sql']) {
    const migration = readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8')
    console.log(`migration ${file} sha256=${createHash('sha256').update(migration).digest('hex')}`)
    sql(migration)
  }
  // V7 additive registry/consent/challenge verification alongside all V6/Q01 checks.
  sql(`insert into public.q02_portal_deployments values('portal','tenant','support','https://clerk.test','https://portal.test',true);
    insert into public.q02_portal_memberships values('portal','tenant','user_portal','active','disposable-test'),('portal','tenant','user_other','active','disposable-test');`)
  const token = 'A'.repeat(43), sessionHash = 'B'.repeat(43)
  const v7 = (action, epoch, tail = `false,null,null,null,null`, who='user_portal', tenant='tenant') =>
    `select public.q02_portal_transition('portal','${tenant}','${who}','https://clerk.test','https://portal.test','${action}',${epoch},${tail});`
  const grant7 = epoch => v7('grant',epoch,`true,'portal-v7-1',array['derived_summary','preferences'],null,null`)
  const challenge7 = (epoch, nonce=token, sid=sessionHash) => v7('challenge',epoch,`false,null,null,'${nonce}','${sid}'`)
  const review7 = () => JSON.parse(sql(service+v7('review','null')).trim())
  check('V7 direct tables and browser RPC denied',()=>{
    for(const role of ['anon','authenticated','service_role']) denies(`set role ${role}; select * from public.q02_portal_consents;`,/permission denied/)
    for(const role of ['anon','authenticated']) denies(`set role ${role};`+service+v7('review','null'),/permission denied/)
    denies(v7('review','null'),/Service only/)
  })
  check('V7 default off, owner tenant issuer party binding',()=>{
    assert.equal(review7().active,false)
    denies(service+v7('review','null',undefined,'user_unknown'),/Unknown membership/)
    denies(service+v7('review','null',undefined,'user_portal','foreign'),/Unknown deployment/)
    denies(service+v7('review','null').replace('https://portal.test','https://support.test'),/Unknown deployment/)
    denies(service+v7('review','null').replace('https://clerk.test','https://other.test'),/Unknown deployment/)
    denies(service+challenge7(0),/Active consent/)
  })
  check('V7 exact opt-in disclosure scopes and epoch CAS',()=>{
    denies(service+v7('grant',0),/Explicit versioned/)
    denies(service+grant7(0).replace('portal-v7-1','old'),/Explicit versioned/)
    denies(service+grant7(0).replace("array['derived_summary','preferences']","array['preferences','derived_summary']"),/Explicit versioned/)
    sql(service+grant7(0)); assert.equal(review7().epoch,1)
    denies(service+grant7(0),/Stale epoch/)
  })
  check('V7 challenge durable binding, unique nonce replay, cross-owner cancel denial',()=>{
    sql(service+challenge7(1));
    assert.equal(sql(`select epoch||':'||support_site||':'||state from public.q02_portal_challenges where digest='${token}';`).trim(),'1:support:pending')
    denies(service+challenge7(1),/duplicate key/)
    denies(service+v7('cancel',0,`false,null,null,'${token}','${sessionHash}'`,'user_other'),/Challenge unavailable/)
    denies(service+v7('cancel',1,`false,null,null,'${token}','${'C'.repeat(43)}'`),/Challenge unavailable/)
    denies(service+v7('consume',1),/Redemption disabled/)
  })
  check('V7 suspended membership and disabled deployment preserve withdrawal',()=>{
    sql(`update public.q02_portal_memberships set status='revoked' where subject='user_portal'; update public.q02_portal_deployments set enabled=false;`)
    denies(service+challenge7(1,'D'.repeat(43)),/Issuance unavailable/)
    sql(service+v7('withdraw',1)); assert.equal(review7().active,false); assert.equal(review7().epoch,2)
    assert.equal(sql(`select state from public.q02_portal_challenges where digest='${token}';`).trim(),'cancelled')
    assert.equal(sql(`select delivery_state from public.q02_portal_tombstones;`).trim(),'pending')
    denies(service+v7('withdraw',1),/Stale epoch/)
    sql(`update public.q02_portal_memberships set status='active' where subject='user_portal'; update public.q02_portal_deployments set enabled=true;`)
  })
  // Real transactions, lock acquisition observed before starting contender.
  async function v7Race(first, second) {
    const owner=asyncSql(service+`begin; ${first} select pg_advisory_xact_lock(716001); select pg_sleep(1); commit;`)
    let locked=false
    for(let i=0;i<100;i++) {
      locked=sql(`select exists(select 1 from pg_locks where locktype='advisory' and objid=716001 and granted);`).trim()==='t'
      if(locked) break
      await new Promise(resolve=>setTimeout(resolve,10))
    }
    assert.ok(locked,'V7 first owner lock observed')
    const contender=asyncSql(service+second)
    return Promise.all([owner,contender])
  }
  let results7=await v7Race(grant7(2),grant7(2))
  check('V7 concurrent grants have one CAS winner',()=>{
    assert.equal(results7[0].code,0); assert.notEqual(results7[1].code,0); assert.match(results7[1].stderr,/Stale epoch/);assert.equal(review7().epoch,3)
  })
  results7=await v7Race(v7('withdraw',3),challenge7(3,'E'.repeat(43)))
  check('V7 withdrawal wins challenge race, stale challenge never reserved',()=>{
    assert.equal(results7[0].code,0);assert.notEqual(results7[1].code,0)
    assert.equal(sql(`select count(*) from public.q02_portal_challenges where digest='${'E'.repeat(43)}';`).trim(),'0')
  })
  sql(service+grant7(4))
  results7=await v7Race(challenge7(5,'F'.repeat(43)),v7('withdraw',5))
  check('V7 reservation first is durably cancelled by concurrent withdrawal',()=>{
    assert.equal(results7[0].code,0);assert.equal(results7[1].code,0)
    assert.equal(sql(`select state from public.q02_portal_challenges where digest='${'F'.repeat(43)}';`).trim(),'cancelled')
  })
  sql(service+grant7(6))
  results7=await v7Race(challenge7(7,'G'.repeat(43)),challenge7(7,'G'.repeat(43)))
  check('V7 concurrent nonce reservation has one unique winner',()=>{
    assert.equal(results7[0].code,0);assert.notEqual(results7[1].code,0);assert.match(results7[1].stderr,/duplicate key/)
    sql(service+v7('cancel',7,`false,null,null,'${'G'.repeat(43)}','${sessionHash}'`))
    denies(service+v7('cancel',7,`false,null,null,'${'G'.repeat(43)}','${sessionHash}'`),/Challenge unavailable/)
  })
  sql(`insert into public.profiles(id,role) values('${subject}','client'),('${provider}','attorney'),('${outsider}','client'); insert into public.conversations(id,participant_a,participant_b) values('${c}','${subject}','${provider}');`)
  check('missing consent denies commit', () => {
    sql(`insert into public.conversation_messages(id,conversation_id,sender_id) values('${trigger}','${c}','${subject}');`)
    denies(service + commit(0), /consent changed/)
  })
  for (const role of ['anon','authenticated']) check(`${role} table and RPC grants deny`, () => {
    denies(`set role ${role}; select * from public.yqaa_consent;`, /permission denied/)
    denies(`set role ${role}; ${mutation('forget',0)}`, /permission denied/)
    // Temporarily grant SELECT inside a rolled-back transaction to exercise
    // RLS independently of the privilege denial above.
    assert.match(sql(`begin; grant select on public.yqaa_consent to ${role}; set local role ${role}; select count(*) from public.yqaa_consent; rollback;`), /^0$/m)
  })
  check('foreign subject and provider mutations deny', () => {
    denies(service + mutation('forget',0,outsider), /not authorized/)
    denies(service + mutation('forget',0,provider), /not authorized/)
  })
  const grant = mutation('grant',0)
  check('grant and exact replay are idempotent', () => {
    assert.match(sql(service + grant), /"version": 1/)
    assert.match(sql(service + grant), /"replayed": true/)
    denies(service + grant.replace("'grant',true", "'withdraw',false"), /request id reused/)
    denies(service + mutation('withdraw',0), /version conflict/)
  })
  const losers = await Promise.all([asyncSql(service + mutation('forget',1)), asyncSql(service + mutation('forget',1))])
  check('parallel CAS has exactly one winner', () => {
    assert.equal(losers.filter(x => x.code === 0).length,1)
    assert.match(losers.find(x => x.code !== 0).stderr,/version conflict/)
  })
  check('stale diagnostic snapshot cannot resurrect', () => denies(`update public.conversations set metadata='{"ai_memory":{"consent_version":1}}' where id='${c}';`, /stale or unconsented/))
  // Trigger must be newer than the forget boundary for the reply race.
  sql(`update public.conversation_messages set created_at=clock_timestamp() where id='${trigger}';`)
  const withdrawFirst = await orderedRace(mutation('withdraw',2),commit(2))
  check('withdraw first rejects late reply', () => {
    assert.equal(withdrawFirst[0].code,0,withdrawFirst[0].stderr)
    assert.notEqual(withdrawFirst[1].code,0)
    assert.match(withdrawFirst[1].stderr,/consent changed/)
    assert.equal(sql('select count(*) from public.yqaa_reply_commits').trim(),'0')
  })
  sql(service + mutation('grant',3))
  check('regrant cannot revive old epoch', () => denies(service + commit(2),/consent changed/))
  sql(`update public.conversation_messages set created_at=clock_timestamp() where id='${trigger}';`)
  const replyFirst = await orderedRace(commit(4),mutation('withdraw',4))
  check('reply first retains committed message then withdraws', () => {
    for (const r of replyFirst) assert.equal(r.code,0,r.stderr)
    assert.equal(sql('select count(*) from public.yqaa_reply_commits').trim(),'1')
    assert.equal(sql('select granted from public.yqaa_consent').trim(),'f')
    assert.equal(sql('select count(*) from public.conversation_messages').trim(),'2')
  })

  // All sessions retain PostgreSQL's strict ambiguity detection. No parser-only
  // assertion can substitute for executing each function and nested RETURN arm.
  check('strict PL/pgSQL conflict mode remains enabled', () => {
    assert.equal(sql('show plpgsql.variable_conflict').trim(),'error')
  })

  // V3 fact lifecycle uses the same disposable database and real row locks.
  const currentEpoch = () => Number(sql(`select version from public.yqaa_consent where conversation_id='${c}'`).trim())
  const uuid = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
  const learn = (version = currentEpoch(), who = subject) => `select public.read_yqaa_memory('${c}','${who}',${version},true);`
  const inspect = (who = subject) => `select public.read_yqaa_memory('${c}','${who}',null,false);`
  const state = () => JSON.parse(sql(service + inspect()).trim())
  function factMutation(fact, action, epoch, key = ++request, value = 'corrected goal') {
    const quoted = action === 'delete' ? 'null' : `'${value.replaceAll("'", "''")}'`
    return `select public.mutate_yqaa_fact('${c}','${subject}',${epoch},'${uuid(key)}','${fact.id}',${fact.version},'${action}',${quoted});`
  }
  check('denied read executes empty nested JSON queries without alias shadowing', () => {
    const denied = state()
    assert.equal(denied.consent.granted,false)
    assert.deepEqual(denied.facts,[])
    assert.deepEqual(denied.excluded_source_ids,[])
    assert.equal(denied.has_more,false)
    denies(service + learn(),/consent changed/)
  })
  check('internal epoch owner cannot bypass the public wrapper as service role', () => {
    denies(`set role service_role; ${service} select public.mutate_yqaa_privacy_epoch('${c}','${subject}',${currentEpoch()},'${uuid(900)}','grant',true);`,/permission denied/)
  })
  check('scope and invalidation helpers execute in isolation', () => {
    assert.equal(sql(service + `select public.lock_yqaa_privacy_scope('${c}','${subject}');`).trim(),provider)
    assert.deepEqual(JSON.parse(sql(service + `select public.invalidate_yqaa_derived_state('{"ai_memory":{},"ai_last_offer_id":"old","unrelated":"keep"}');`).trim()), {
      unrelated:'keep', ai_pricing_approval_status:'invalidated', ai_pricing_approval_pending:false,
    })
    denies(`set request.jwt.claim.role='authenticated'; select public.lock_yqaa_privacy_scope('${c}','${subject}');`,/service role required/)
  })
  check('cross-site consent cannot be enabled even by a server write', () => {
    denies(`update public.yqaa_consent set cross_site_linking=true where conversation_id='${c}';`,/check constraint/)
    assert.equal(sql(`select cross_site_linking from public.yqaa_consent where conversation_id='${c}'`).trim(),'f')
  })
  check('grant without explicit opt-in fails atomically in SQL', () => {
    const epoch = currentEpoch()
    const before = sql('select count(*) from public.yqaa_privacy_mutations').trim()
    denies(service + mutation('grant',epoch).replace("'grant',true","'grant',false"),/invalid privacy mutation/)
    assert.equal(currentEpoch(),epoch)
    assert.equal(sql(`select granted from public.yqaa_consent where conversation_id='${c}'`).trim(),'f')
    assert.equal(sql('select count(*) from public.yqaa_privacy_mutations').trim(),before)
  })
  check('every privacy RPC and trigger helper denies browser execution', () => {
    for (const role of ['anon','authenticated']) {
      for (const signature of [
        'lock_yqaa_privacy_scope(uuid,uuid)', 'invalidate_yqaa_derived_state(jsonb)',
        'mutate_yqaa_privacy(uuid,uuid,bigint,uuid,text,boolean)',
        'mutate_yqaa_privacy_epoch(uuid,uuid,bigint,uuid,text,boolean)',
        'read_yqaa_memory(uuid,uuid,bigint,boolean,integer)',
        'mutate_yqaa_fact(uuid,uuid,bigint,uuid,uuid,bigint,text,text)',
        'fence_yqaa_reply_scope()', 'fence_yqaa_memory_write()',
      ]) assert.equal(sql(`select has_function_privilege('${role}','public.${signature}','EXECUTE');`).trim(),'f',`${role}: ${signature}`)
    }
  })
  check('malformed pages deny before retrieval', () => {
    for (const offset of ['null','-1','2147483448']) {
      denies(service + `select public.read_yqaa_memory('${c}','${subject}',null,false,${offset});`,/invalid memory page/)
    }
  })
  sql(service + mutation('grant', currentEpoch()))
  sql(`insert into public.conversation_messages(id,conversation_id,sender_id,type,body,created_at)
    values('${uuid(101)}','${c}','${subject}','text','Remember goal: original goal',clock_timestamp()),
      ('${uuid(102)}','${c}','${subject}','text','Remember goal: winning goal',clock_timestamp());`)
  let firstState
  check('learning uses canonical sources and deterministic named-slot supersession', () => {
    const before = currentEpoch()
    firstState = JSON.parse(sql(service + learn()).trim())
    assert.equal(firstState.consent.version,before+1)
    assert.equal(firstState.facts.length,1)
    assert.equal(firstState.facts[0].value,'winning goal')
    assert.equal(firstState.facts[0].version,2)
    assert.equal(firstState.facts[0].source_message_id,uuid(102))
    assert.ok(firstState.excluded_source_ids.includes(uuid(101)))
    assert.equal(sql(`select count(*) from public.yqaa_memory_facts where superseded_epoch is not null and value is not null`).trim(),'0')
  })
  check('learning replay neither resurrects a source nor increments the epoch', () => {
    const before = currentEpoch()
    assert.equal(JSON.parse(sql(service + learn()).trim()).consent.version,before)
    assert.equal(sql('select count(*) from public.yqaa_memory_facts').trim(),'2')
  })
  check('unknown subject and foreign provider cannot inspect or learn facts', () => {
    denies(service + inspect(outsider),/not authorized/)
    denies(service + inspect(provider),/not authorized/)
    denies(service + inspect(uuid(999)),/not authorized/)
    denies(service + learn(currentEpoch(),outsider),/not authorized/)
  })
  for (const role of ['anon','authenticated']) check(`${role} fact tables, RLS and RPCs deny`, () => {
    for (const table of ['yqaa_memory_facts','yqaa_fact_mutations']) {
      denies(`set role ${role}; select * from public.${table};`,/permission denied/)
      assert.match(sql(`begin; grant select on public.${table} to ${role}; set local role ${role}; select count(*) from public.${table}; rollback;`),/^0$/m)
    }
    denies(`set role ${role}; ${inspect()}`,/permission denied/)
  })
  let goal = state().facts[0]
  const originalEpoch = currentEpoch()
  const correction = factMutation(goal,'correct',originalEpoch)
  check('correction CAS scrubs the old value and keeps source provenance', () => {
    assert.match(sql(service + correction),/"replayed": false/)
    const after = state()
    assert.equal(after.consent.version,originalEpoch+1)
    assert.equal(after.facts[0].value,'corrected goal')
    assert.equal(after.facts[0].source_message_id,goal.source_message_id)
    assert.equal(after.facts[0].version,goal.version+1)
    assert.equal(after.facts[0].corrected,true)
    assert.equal(sql(`select value is null from public.yqaa_memory_facts where id='${goal.id}'`).trim(),'t')
    assert.equal(sql(`select count(*) from public.conversations where id='${c}' and metadata ? 'ai_memory'`).trim(),'0')
  })
  check('correction replay is exact and changed narrative is rejected', () => {
    assert.match(sql(service + correction),/"replayed": true/)
    denies(service + correction.replace('corrected goal','changed payload'),/request id reused/)
    denies(service + factMutation(goal,'correct',originalEpoch),/version conflict/)
  })
  check('unknown fact and stale fact version deny', () => {
    denies(service + factMutation({ ...goal,id: uuid(999) },'delete',currentEpoch()),/unknown fact/)
    denies(service + factMutation(goal,'delete',currentEpoch()),/fact version conflict/)
  })
  check('post-correction retrieval cannot import retained historical sources', () => {
    const after = JSON.parse(sql(service + learn()).trim())
    assert.equal(after.facts.length,1)
    assert.equal(after.facts[0].value,'corrected goal')
    assert.equal(Number(sql(`select count(*) from public.conversation_messages where conversation_id='${c}' and created_at>(select memory_after from public.yqaa_consent where conversation_id='${c}')`).trim()),0)
    denies(`update public.conversations set metadata=jsonb_build_object('ai_memory',jsonb_build_object('consent_version',${originalEpoch})) where id='${c}';`,/stale or unconsented/)
  })
  goal = state().facts[0]
  const parallelEpoch = currentEpoch()
  const corrections = await Promise.all([asyncSql(service + factMutation(goal,'correct',parallelEpoch,++request,'race A')),
    asyncSql(service + factMutation(goal,'correct',parallelEpoch,++request,'race B'))])
  check('parallel corrections have exactly one CAS winner', () => {
    assert.equal(corrections.filter(x => x.code===0).length,1)
    assert.match(corrections.find(x => x.code!==0).stderr,/version conflict/)
    assert.equal(state().facts.length,1)
  })
  const changed = state().facts[0]
  check('single-fact deletion is idempotent and never revives through learning', () => {
    const deletion = factMutation(changed,'delete',currentEpoch())
    assert.match(sql(service + deletion),/"replayed": false/)
    assert.match(sql(service + deletion),/"replayed": true/)
    assert.equal(state().facts.length,0)
    assert.equal(JSON.parse(sql(service + learn()).trim()).facts.length,0)
    assert.equal(sql(`select count(*) from public.yqaa_memory_facts where value is not null`).trim(),'0')
  })
  // A later explicit source is new consented information, not resurrection.
  sql(`insert into public.conversation_messages(id,conversation_id,sender_id,type,body) values('${uuid(103)}','${c}','${subject}','text','Remember goal: newly supplied goal');`)
  sql(service + learn())
  check('a newly supplied source can replace a tombstoned named slot', () => {
    assert.equal(state().facts[0].value,'newly supplied goal')
    assert.equal(state().facts[0].source_message_id,uuid(103))
  })
  check('whole forgetting tombstones every active fact and exact replays do not revive', () => {
    const forget = mutation('forget',currentEpoch())
    sql(service + forget)
    assert.match(sql(service + forget),/"replayed": true/)
    assert.equal(state().facts.length,0)
    assert.equal(JSON.parse(sql(service + learn()).trim()).facts.length,0)
  })
  sql(`insert into public.conversation_messages(id,conversation_id,sender_id,type,body) values('${uuid(104)}','${c}','${subject}','text','Remember goal: permission race');`)
  sql(service + learn())
  check('permission changes deny reads, mutations and stale diagnostic writes', () => {
    const epoch = currentEpoch()
    sql(`update public.profiles set role='support' where id='${subject}';`)
    denies(service + inspect(),/not authorized/)
    denies(service + mutation('forget',epoch),/not authorized/)
    denies(service + `update public.conversations set metadata=jsonb_build_object('ai_memory',jsonb_build_object('consent_version',${epoch})) where id='${c}';`,/not authorized/)
    sql(`update public.profiles set role='client' where id='${subject}';`)
  })
  check('Clerk relink cannot silently inherit consent or remembered narrative', () => {
    sql(`update public.profiles set clerk_user_id='different_clerk' where id='${subject}';`)
    denies(service + inspect(),/scope changed/)
    denies(service + mutation('forget',currentEpoch()),/owner changed/)
    sql(`update public.profiles set clerk_user_id='fixture_clerk' where id='${subject}';`)
  })
  check('inactive canonical identities deny privacy access', () => {
    sql(`update public.profiles set status='suspended' where id='${subject}';`)
    denies(service + inspect(),/not authorized/)
    sql(`update public.profiles set status='active' where id='${subject}';`)
    sql(`update public.profiles set status='suspended' where id='${provider}';`)
    denies(service + inspect(),/not authorized/)
    sql(`update public.profiles set status='active' where id='${provider}';`)
  })
  // New trigger for effect races; old durable trigger intentionally still replays.
  const newTrigger = uuid(105)
  sql(`insert into public.conversation_messages(id,conversation_id,sender_id,type,body) values('${newTrigger}','${c}','${subject}','text','new reply trigger');`)
  sql(service + learn())
  const epochBeforeCorrection = currentEpoch()
  const toCorrect = state().facts.find(x => x.fact_key==='goal')
  const lateCommit = commit(epochBeforeCorrection).replace(trigger,newTrigger)
  const correctionFirst = await orderedRace(factMutation(toCorrect,'correct',epochBeforeCorrection),lateCommit)
  check('correction first rejects a reply retrieved at the old epoch', () => {
    assert.equal(correctionFirst[0].code,0,correctionFirst[0].stderr)
    assert.notEqual(correctionFirst[1].code,0)
    assert.match(correctionFirst[1].stderr,/consent changed/)
  })
  check('old completed Q01 effect replay survives privacy changes without another effect', () => {
    const count = sql('select count(*) from public.yqaa_reply_commits').trim()
    assert.match(sql(service + commit(4)),/reply_message_id/)
    assert.equal(sql('select count(*) from public.yqaa_reply_commits').trim(),count)
  })


  const inquiry = uuid(206)
  sql(`insert into public.inquiries(id,client_profile_id,target_attorney_profile_id) values('${inquiry}','${subject}','${provider}');`)
  function offerCommit(epoch, messageId) {
    const offer = { idempotency_key: `yqaa:${c}:${messageId}`, row: {
      chat_id: inquiry, sender_id: provider, recipient_id: subject, sender_type: 'attorney', title: 'Fixture offer',
      description: 'Synthetic service', price: 1000, currency: 'usd', delivery_days: 7, revisions: 0,
      expires_at: '2099-01-01T00:00:00Z', yqaa_idempotency_key: `yqaa:${c}:${messageId}`,
    }, message: { body: 'Synthetic offer', ref_inquiry_id: inquiry },
      inquiry_message: { inquiry_id: inquiry, sender_profile_id: provider, sender_role: 'attorney', body: 'Synthetic offer' },
      audit: { fixture: true } }
    return `select public.commit_yqaa_reply('${c}','${messageId}','{"sender_id":"${provider}","body":"reply","metadata":{"yqaa_consent_version":${epoch}}}','${JSON.stringify(offer)}','{}');`
  }
  function newSource(n) {
    const mid = uuid(n)
    sql(`insert into public.conversation_messages(id,conversation_id,sender_id,type,body) values('${mid}','${c}','${subject}','text','new commercial trigger');`)
    sql(service + learn())
    return mid
  }
  const forgetTrigger = newSource(207)
  const forgetEpoch = currentEpoch()
  const forgetOfferRace = await orderedRace(mutation('forget',forgetEpoch),offerCommit(forgetEpoch,forgetTrigger))
  check('forget first rolls back reply, offer, inquiry mirror and offer audit', () => {
    assert.equal(forgetOfferRace[0].code,0,forgetOfferRace[0].stderr)
    assert.notEqual(forgetOfferRace[1].code,0)
    for (const table of ['offers','inquiry_messages','admin_audit_log']) assert.equal(sql(`select count(*) from public.${table}`).trim(),'0')
    assert.equal(sql(`select count(*) from public.yqaa_reply_commits where trigger_message_id='${forgetTrigger}'`).trim(),'0')
  })
  const retainedTrigger = newSource(208)
  const retainedEpoch = currentEpoch()
  const offerFirstRace = await orderedRace(offerCommit(retainedEpoch,retainedTrigger),mutation('forget',retainedEpoch))
  check('offer first remains durable when later memory is forgotten', () => {
    for (const result of offerFirstRace) assert.equal(result.code,0,result.stderr)
    for (const table of ['offers','inquiry_messages','admin_audit_log']) assert.equal(sql(`select count(*) from public.${table}`).trim(),'1')
    assert.equal(state().facts.length,0)
    assert.match(sql(service + offerCommit(retainedEpoch,retainedTrigger)),/offer_id/)
    assert.equal(sql('select count(*) from public.offers').trim(),'1')
  })
  const permissionTrigger = newSource(209)
  check('provider permission change after retrieval blocks commercial effects', () => {
    const epoch = currentEpoch()
    sql(`update public.profiles set status='suspended' where id='${provider}';`)
    denies(service + offerCommit(epoch,permissionTrigger),/provider not authorized/)
    sql(`update public.profiles set status='active' where id='${provider}';`)
    assert.equal(sql('select count(*) from public.offers').trim(),'1')
  })
  check('changed conversation participants cannot reuse a retrieved offer envelope', () => {
    const epoch = currentEpoch()
    sql(`update public.conversations set participant_a='${outsider}' where id='${c}';`)
    denies(service + offerCommit(epoch,permissionTrigger),/participant mismatch/)
    sql(`update public.conversations set participant_a='${subject}' where id='${c}';`)
    assert.equal(sql('select count(*) from public.offers').trim(),'1')
  })
  check('nullable anonymous scope cannot authorize a foreign authenticated subject', () => {
    sql(`insert into public.conversations(id,participant_a,participant_b) values('${uuid(210)}',null,'${provider}');`)
    denies(service + `select public.read_yqaa_memory('${uuid(210)}','${subject}',null,false);`,/subject not authorized/)
  })
  check('derived approval pointers invalidate without deleting retained approvals or offers', () => {
    sql(`update public.conversations set metadata=metadata||'{"ai_pricing_approval_status":"approved","ai_pricing_approval_pending":true,"ai_pricing_approval_request_id":"old-request","ai_last_offer_id":"old-offer"}'::jsonb where id='${c}';`)
    sql(service + mutation('forget',currentEpoch()))
    const metadata = JSON.parse(sql(`select metadata from public.conversations where id='${c}'`).trim())
    assert.equal(metadata.ai_pricing_approval_status,'invalidated')
    assert.equal(metadata.ai_pricing_approval_pending,false)
    assert.equal(metadata.ai_pricing_approval_request_id,undefined)
    assert.equal(metadata.ai_last_offer_id,undefined)
    assert.equal(sql('select count(*) from public.offers').trim(),'1')
  })

  // A second independently granted scope uses the same authenticated pair.
  // It must neither inherit the first scope's consent nor import/replay its data.
  const otherConversation = uuid(300)
  sql(`insert into public.conversations(id,participant_a,participant_b) values('${otherConversation}','${subject}','${provider}');`)
  const otherRead = (learn = false, epoch = 'null', offset = 0) =>
    `select public.read_yqaa_memory('${otherConversation}','${subject}',${epoch},${learn},${offset});`
  const otherState = () => JSON.parse(sql(service + otherRead()).trim())
  const otherMutation = (action, epoch) => mutation(action,epoch).replace(c,otherConversation)
  check('same account and provider cannot infer consent across conversations', () => {
    assert.equal(otherState().consent,null)
    assert.deepEqual(otherState().facts,[])
    denies(service + otherRead(true,currentEpoch()),/consent changed/)
    denies(service + commit(currentEpoch()).replace(c,otherConversation),/does not belong/)
  })
  sql(service + otherMutation('grant',0))
  // Equal source timestamps deliberately arrive in reverse insertion order.
  sql(`insert into public.conversation_messages(id,conversation_id,sender_id,type,body,created_at) values
    ('${uuid(304)}','${otherConversation}','${subject}','text','Remember destination: latest destination',clock_timestamp()),
    ('${uuid(303)}','${otherConversation}','${subject}','text','Remember destination: obsolete destination',clock_timestamp()),
    ('${uuid(302)}','${otherConversation}','${subject}','text','Remember budget: initial budget',clock_timestamp()),
    ('${uuid(301)}','${otherConversation}','${subject}','text','Remember budget: obsolete budget',clock_timestamp());
    update public.conversation_messages set created_at=(select max(created_at) from public.conversation_messages where conversation_id='${otherConversation}') where conversation_id='${otherConversation}';`)
  check('multiple contradictory slots resolve by source time then ID, never insertion order', () => {
    const learned = JSON.parse(sql(service + otherRead(true,1)).trim())
    assert.equal(learned.consent.version,2)
    assert.equal(learned.facts.length,2)
    const slots = Object.fromEntries(learned.facts.map(f => [f.fact_key,f]))
    assert.equal(slots.budget.value,'initial budget')
    assert.equal(slots.destination.value,'latest destination')
    assert.equal(slots.budget.version,2)
    assert.equal(slots.destination.version,2)
    assert.deepEqual(new Set(learned.excluded_source_ids),new Set([uuid(301),uuid(303)]))
    assert.ok(learned.facts.every(f => f.conversation_id===otherConversation))
    assert.deepEqual(JSON.parse(sql(service + otherRead(false,'null',200)).trim()).facts,[])
  })
  check('backdated later arrival cannot replace a newer canonical source', () => {
    sql(`insert into public.conversation_messages(id,conversation_id,sender_id,type,body,created_at)
      select '${uuid(305)}','${otherConversation}','${subject}','text','Remember budget: backdated obsolete budget',min(created_at)-interval '1 microsecond'
      from public.conversation_messages where conversation_id='${otherConversation}';`)
    const learned = JSON.parse(sql(service + otherRead(true,2)).trim())
    assert.equal(learned.consent.version,2)
    assert.equal(learned.facts.find(f => f.fact_key==='budget').value,'initial budget')
  })
  check('fact IDs do not confer authority in another conversation', () => {
    const foreignFact = otherState().facts[0]
    denies(service + factMutation(foreignFact,'delete',currentEpoch()),/unknown fact/)
    const alteredScope = factMutation(foreignFact,'delete',2).replace(c,otherConversation).replace(subject,outsider)
    denies(service + alteredScope,/subject not authorized/)
    assert.equal(otherState().facts.length,2)
  })
  check('missing authenticated owner cannot leave a partial grant or receipt', () => {
    sql(`update public.profiles set clerk_user_id=null where id='${subject}';`)
    denies(service + otherMutation('grant',2),/verified owner required/)
    assert.equal(sql(`select version from public.yqaa_consent where conversation_id='${otherConversation}'`).trim(),'2')
    assert.equal(sql(`select count(*) from public.yqaa_privacy_mutations where conversation_id='${otherConversation}'`).trim(),'1')
    sql(`update public.profiles set clerk_user_id='fixture_clerk' where id='${subject}';`)
  })
  check('one fact correction preserves other active facts and retained source messages', () => {
    const prior = otherState()
    const budget = prior.facts.find(f => f.fact_key==='budget')
    const correction = factMutation(budget,'correct',2,++request,'revised budget').replace(c,otherConversation)
    sql(service + correction)
    const corrected = otherState()
    assert.equal(corrected.facts.length,2)
    assert.equal(corrected.facts.find(f => f.fact_key==='budget').value,'revised budget')
    assert.equal(corrected.facts.find(f => f.fact_key==='destination').value,'latest destination')
    assert.equal(sql(`select count(*) from public.conversation_messages where conversation_id='${otherConversation}'`).trim(),'5')
    assert.equal(state().facts.length,0)
  })

  // Exercise the insertion trigger outside commit_yqaa_reply as well: the
  // reader must see the post-lock epoch, not a consent snapshot taken before it.
  const directEpoch = currentEpoch()
  const directInsert = `insert into public.conversation_messages(conversation_id,sender_id,type,body,metadata)
    values('${c}','${provider}','text','late direct reply','{"yqaa_consent_version":${directEpoch}}');`
  const directRace = await orderedRace(mutation('withdraw',directEpoch),directInsert)
  check('direct insertion trigger reads consent only after the withdrawal lock', () => {
    assert.equal(directRace[0].code,0,directRace[0].stderr)
    assert.notEqual(directRace[1].code,0)
    assert.match(directRace[1].stderr,/consent changed/)
    assert.equal(sql(`select count(*) from public.conversation_messages where body='late direct reply'`).trim(),'0')
  })
  check('withdraw plus regrant cannot authorize delayed direct insertion', () => {
    sql(service + mutation('grant',currentEpoch()))
    denies(service + directInsert,/consent changed/)
  })
  check('reply insertion denies a null or foreign sender at the current epoch', () => {
    for (const sender of ['null',`'${outsider}'`]) {
      denies(service + `insert into public.conversation_messages(conversation_id,sender_id,type,body,metadata)
        values('${c}',${sender},'text','invalid reply','{"yqaa_consent_version":${currentEpoch()}}');`,/consent changed/)
    }
  })
  check('memory write trigger accepts current epoch and rejects delayed old epoch', () => {
    const epoch = currentEpoch()
    sql(service + `update public.conversations set metadata=jsonb_build_object('ai_memory',jsonb_build_object('consent_version',${epoch})) where id='${c}';`)
    sql(service + mutation('forget',epoch))
    denies(service + `update public.conversations set metadata=jsonb_build_object('ai_memory',jsonb_build_object('consent_version',${epoch})) where id='${c}';`,/stale or unconsented/)
  })

  // Synthetic fault injection after commercial effects have executed, before
  // transaction commit. Retrying must recover without duplicate durable effects.
  const recoveryTrigger = newSource(400)
  const recoveryEpoch = currentEpoch()
  const counts = () => ['conversation_messages','offers','inquiry_messages','admin_audit_log','yqaa_reply_commits']
    .map(table => sql(`select count(*) from public.${table}`).trim())
  const beforeFailure = counts()
  check('failure before commit rolls back every reply and commercial side effect', () => {
    denies(service + `begin; ${offerCommit(recoveryEpoch,recoveryTrigger)} select 1/0; commit;`, /division by zero/)
    assert.deepEqual(counts(),beforeFailure)
    assert.equal(currentEpoch(),recoveryEpoch)
  })
  const canceled = await asyncSql(service + `begin; ${offerCommit(recoveryEpoch,recoveryTrigger)} set local statement_timeout='50ms'; select pg_sleep(1); commit;`)
  check('statement cancellation rolls back prepared effects without losing consent', () => {
    assert.notEqual(canceled.code,0)
    assert.match(canceled.stderr,/statement timeout/)
    assert.deepEqual(counts(),beforeFailure)
    assert.equal(currentEpoch(),recoveryEpoch)
  })
  check('retry after aborted generation commits once and replays exactly', () => {
    const result = JSON.parse(sql(service + offerCommit(recoveryEpoch,recoveryTrigger)).trim())
    assert.ok(result.reply_message_id)
    const committedCounts = counts()
    const replay = JSON.parse(sql(service + offerCommit(recoveryEpoch,recoveryTrigger)).trim())
    assert.equal(replay.reply_message_id,result.reply_message_id)
    assert.deepEqual(counts(),committedCounts)
  })
  sql(service + mutation('withdraw',currentEpoch()))
  check('later failed transaction retains an already committed withdrawal', () => {
    const withdrawnEpoch = currentEpoch()
    denies(service + `begin; ${mutation('grant',withdrawnEpoch)} select 1/0; commit;`, /division by zero/)
    assert.equal(currentEpoch(),withdrawnEpoch)
    assert.equal(state().consent.granted,false)
    denies(service + learn(),/consent changed/)
  })

  console.log(`${passed} PostgreSQL checks passed; fixture schema is minimal, not full portal integration.`)
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
