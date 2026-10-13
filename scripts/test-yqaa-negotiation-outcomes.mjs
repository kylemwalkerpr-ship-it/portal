#!/usr/bin/env node
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const databaseUrl = process.env.YQAA_TEST_DATABASE_URL
if (!databaseUrl) throw new Error('Set YQAA_TEST_DATABASE_URL to an isolated local PostgreSQL database.')
const parsed = new URL(databaseUrl)
const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname) || !/(test|local|yqaa)/i.test(databaseName)) {
  throw new Error('Refusing database test: URL must use a loopback host and a database name containing test, local, or yqaa.')
}
const migrations = [
  '../supabase/migrations/20261013120000_yqaa_offer_idempotency.sql',
  '../supabase/migrations/20261013150000_yqaa_provider_controls.sql',
  '../supabase/migrations/20261013170000_yqaa_provider_controls_offer_authority.sql',
  '../supabase/migrations/20261013190000_yqaa_decision_records.sql',
  '../supabase/migrations/20261013200000_yqaa_negotiation_outcomes.sql',
].map((relative) => fileURLToPath(new URL(relative, import.meta.url)))

function psql(sql, expected = true) {
  const result = spawnSync('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', databaseUrl], { input: sql, encoding: 'utf8' })
  if (expected && result.status !== 0) throw new Error(result.stderr || `psql exited ${result.status}`)
  if (!expected && result.status === 0) throw new Error('Expected the review duplicate constraint to reject a duplicate reviewer.')
  return result.stdout.trim()
}

for (const migration of migrations) {
  const result = spawnSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', databaseUrl, '-f', migration], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr || `Migration failed: ${migration}`)
}

const ids = { provider: randomUUID(), client: randomUUID(), adminA: randomUUID(), adminB: randomUUID(), conversation: randomUUID(), request: randomUUID(), decision: randomUUID(), offer: randomUUID(), revertedOffer: randomUUID(), nonYqaaOffer: randomUUID() }
const lower = ids.provider.localeCompare(ids.client) < 0 ? ids.provider : ids.client
const upper = lower === ids.provider ? ids.client : ids.provider
const expires = new Date(Date.now() + 86_400_000).toISOString()
const roleRows = [
  [ids.provider, 'consultant'], [ids.client, 'client'], [ids.adminA, 'admin'], [ids.adminB, 'admin'],
].map(([id, role]) => `('${id}','yqaa-outcome-${id}','${role}','active','YQAA outcome fixture','yqaa-${id}@example.invalid')`).join(',')

const run = psql(`
begin;
insert into public.profiles (id,clerk_user_id,role,status,full_name,email) values ${roleRows};
insert into public.conversations (id,participant_a,participant_b,context_kind,metadata) values ('${ids.conversation}','${lower}','${upper}','general','{}');
insert into public.offers (id,chat_id,sender_id,sender_type,recipient_id,title,description,price,currency,delivery_days,revisions,expires_at,yqaa_idempotency_key)
values ('${ids.offer}','${ids.conversation}','${ids.provider}','consultant','${ids.client}','YQAA outcome fixture offer','YQAA outcome test description with enough characters.',12500,'usd',3,1,'${expires}','yqaa:${ids.conversation}:${ids.offer}');
insert into public.offers (id,chat_id,sender_id,sender_type,recipient_id,title,description,price,currency,delivery_days,revisions,expires_at,yqaa_idempotency_key)
values ('${ids.revertedOffer}','${ids.conversation}','${ids.provider}','consultant','${ids.client}','YQAA reverted offer fixture','YQAA reverted offer test description with enough characters.',12500,'usd',3,1,'${expires}','yqaa:${ids.conversation}:${ids.revertedOffer}');
insert into public.offers (id,chat_id,sender_id,sender_type,recipient_id,title,description,price,currency,delivery_days,revisions,expires_at)
values ('${ids.nonYqaaOffer}','${ids.conversation}','${ids.provider}','consultant','${ids.client}','Regular offer fixture','Regular offer test description with enough characters.',12500,'usd',3,1,'${expires}');
update public.offers set status='processing' where id='${ids.offer}';
update public.offers set status='accepted' where id='${ids.offer}';
update public.offers set status='pending' where id='${ids.offer}';
update public.offers set status='processing' where id='${ids.offer}';
update public.offers set status='accepted' where id='${ids.offer}';
update public.offers set status='paid' where id='${ids.offer}';
update public.offers set status='paid' where id='${ids.offer}';
update public.offers set status='accepted' where id='${ids.revertedOffer}';
update public.offers set status='pending' where id='${ids.revertedOffer}';
insert into public.yqaa_pricing_approvals (conversation_id,request_id,version,provider_id,price_cents,scope_hash,status)
values ('${ids.conversation}','${ids.request}',1,'${ids.provider}',12500,'opaque-scope-ref','pending');
update public.yqaa_pricing_approvals set status='approved' where conversation_id='${ids.conversation}' and request_id='${ids.request}' and version=1;
update public.yqaa_pricing_approvals set status='invalidated' where conversation_id='${ids.conversation}' and request_id='${ids.request}' and version=1;
insert into public.yqaa_pricing_approvals (conversation_id,request_id,version,provider_id,price_cents,scope_hash,status)
values ('${ids.conversation}','${ids.request}',2,'${ids.provider}',12500,'opaque-scope-ref-v2','pending');
update public.yqaa_pricing_approvals set status='approved' where conversation_id='${ids.conversation}' and request_id='${ids.request}' and version=2;
update public.yqaa_pricing_approvals set status='invalidated' where conversation_id='${ids.conversation}' and request_id='${ids.request}' and version=2;
update public.yqaa_pricing_approvals set status='approved' where conversation_id='${ids.conversation}' and request_id='${ids.request}' and version=2;
update public.yqaa_pricing_approvals set status='approved' where conversation_id='${ids.conversation}' and request_id='${ids.request}' and version=2;
insert into public.yqaa_decision_records (id,record_version,policy_version,rubric_version,channel,interaction_hash,posture,escalated,reason_codes)
values ('${ids.decision}',1,'test-policy','test-rubric','dm',repeat('a',64),'ESCALATE_PROVIDER',true,array['high_stakes']);
insert into public.yqaa_review_submissions (decision_record_id,reviewer_profile_id,human_safe,is_critical,reviewer_qualification_claim,provenance_ref)
values ('${ids.decision}','${ids.adminA}',false,true,'licensed attorney','test-batch-001');
insert into public.yqaa_review_submissions (decision_record_id,reviewer_profile_id,human_safe,is_critical,reviewer_qualification_claim,provenance_ref)
values ('${ids.decision}','${ids.adminB}',false,true,'licensed attorney','test-batch-001');
do $$ begin
  begin
    insert into public.yqaa_review_submissions (decision_record_id,reviewer_profile_id,human_safe,is_critical,reviewer_qualification_claim,provenance_ref)
    values ('${ids.decision}','${ids.adminA}',false,true,'licensed attorney','test-batch-001');
    raise exception 'duplicate reviewer unexpectedly accepted';
  exception when unique_violation then
    null;
  end;
  if (select count(*) from public.yqaa_negotiation_outcomes where source_kind='offer' and source_id='${ids.offer}') <> 7 then raise exception 'offer transitions were deduplicated by revisited state or duplicate no-op was captured'; end if;
  if (select count(*) from public.yqaa_negotiation_outcomes where source_kind='offer' and source_id='${ids.offer}' and state='processing') <> 2 then raise exception 'payment processing transitions were omitted'; end if;
  if (select count(*) from public.yqaa_negotiation_outcomes where source_kind='offer' and source_id='${ids.revertedOffer}') <> 3 then raise exception 'reverted offer transitions were not all captured'; end if;
  if (select count(distinct event_order) from public.yqaa_negotiation_outcomes where source_kind='offer' and source_id in ('${ids.offer}','${ids.revertedOffer}')) <> 10 then raise exception 'offer transition order is not unique'; end if;
  if (select count(*) from public.yqaa_negotiation_outcomes where source_kind='offer' and source_id='${ids.offer}' and state in ('pending','accepted','paid')) <> 5 then raise exception 'accepted-pending-accepted-paid transition history is incomplete'; end if;
  if exists (select 1 from public.yqaa_negotiation_outcomes where source_kind='offer' and source_id='${ids.nonYqaaOffer}') then raise exception 'non-YQAA offer was captured'; end if;
  if (select count(*) from public.yqaa_negotiation_outcomes where source_kind='provider_approval' and event_key like 'approval:${ids.conversation}:${ids.request}:1:%') <> 3 then raise exception 'approval invalidation was not captured'; end if;
  if (select count(*) from public.yqaa_negotiation_outcomes where source_kind='provider_approval' and event_key like 'approval:${ids.conversation}:${ids.request}:2:%') <> 4 then raise exception 're-request invalidation, revisit, or duplicate no-op handling failed'; end if;
  if (select count(distinct event_order) from public.yqaa_negotiation_outcomes) <> (select count(*) from public.yqaa_negotiation_outcomes) then raise exception 'event order is not globally distinct'; end if;
  if (select count(*) from (
    select distinct on (source_id) source_id, state from public.yqaa_negotiation_outcomes
    where source_kind='offer' and source_id in ('${ids.offer}','${ids.revertedOffer}')
    order by source_id, event_order desc
  ) latest where state in ('accepted','paid','declined','expired','cancelled')) <> 1 then raise exception 'latest offer rate includes refunded/reverted pending offer as accepted'; end if;
  if (select count(*) from (
    select distinct on (source_id) source_id, state from public.yqaa_negotiation_outcomes
    where source_kind='offer' and source_id in ('${ids.offer}','${ids.revertedOffer}')
    order by source_id, event_order desc
  ) latest where state in ('accepted','paid')) <> 1 then raise exception 'latest positive offer count is not truthful after reversion'; end if;
  if (select count(*) from (
    select distinct on (source_id) source_id, state from public.yqaa_negotiation_outcomes
    where source_kind='provider_approval' and event_key like 'approval:${ids.conversation}:${ids.request}:%'
    order by source_id, event_order desc
  ) latest where state in ('approved','declined','invalidated')) <> 2 then raise exception 'latest approval resolution ignored invalidation or re-request version'; end if;
  if (select count(*) from (
    select distinct on (source_id) source_id, state from public.yqaa_negotiation_outcomes
    where source_kind='provider_approval' and event_key like 'approval:${ids.conversation}:${ids.request}:%'
    order by source_id, event_order desc
  ) latest where state='approved') <> 1 then raise exception 'latest approval rate counted invalidated version as approved'; end if;
  if (select count(distinct reviewer_profile_id) from public.yqaa_review_submissions where decision_record_id='${ids.decision}') <> 2 then raise exception 'critical dual-review intake did not persist independently'; end if;
  if has_table_privilege('authenticated','public.yqaa_negotiation_outcomes','select') or has_table_privilege('anon','public.yqaa_negotiation_outcomes','select') then raise exception 'outcomes exposed to client roles'; end if;
  if has_table_privilege('authenticated','public.yqaa_review_submissions','insert') or has_table_privilege('anon','public.yqaa_review_submissions','select') then raise exception 'review intake exposed to client roles'; end if;
  if (select count(*) from public.yqaa_negotiation_outcomes where (source_kind='offer' and source_id='${ids.offer}' or event_key like 'approval:${ids.conversation}:${ids.request}:1:%') and (event_key ilike '%@%' or event_key ilike '%http%')) <> 0 then raise exception 'outcome contains contact data or a URL'; end if;
end $$;
select 'outcome and dual-review invariants passed';
rollback;
`)
if (!run.includes('outcome and dual-review invariants passed')) throw new Error('PostgreSQL outcome checks did not complete.')

console.log('PASS: YQAA transition identity/order, no-op idempotence, truthful latest states after reversion and approval re-request, source isolation, service-only grants, and critical dual-review invariants.')
