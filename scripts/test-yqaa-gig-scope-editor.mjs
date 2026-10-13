#!/usr/bin/env node
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

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
  if (!expected && result.status === 0) throw new Error('Expected invalid gig pricing or scope SQL to fail its database constraint.')
  return result.stdout.trim()
}

for (const name of [
  '20261013120000_yqaa_offer_idempotency.sql',
  '20261013150000_yqaa_provider_controls.sql',
  '20261013170000_yqaa_provider_controls_offer_authority.sql',
  '20261013180000_yqaa_gig_scope_editor.sql',
]) {
  psql(`\\i ${fileURLToPath(new URL(`../supabase/migrations/${name}`, import.meta.url))}\n`)
}

const provider = randomUUID()
const client = randomUUID()
const conversation = randomUUID()
const gig = randomUUID()
const tier = randomUUID()
const requestA = randomUUID()
const requestB = randomUUID()
const requestC = randomUUID()
const ids = [provider, client, conversation, gig, tier, requestA, requestB, requestC]
const [providerId, clientId, conversationId, gigId, tierId, requestIdA, requestIdB, requestIdC] = ids
const [participantA, participantB] = providerId.localeCompare(clientId) < 0
  ? [providerId, clientId]
  : [clientId, providerId]

function setup() {
  psql(`
    begin;
    insert into public.profiles (id,clerk_user_id,role,status,full_name,email) values
      ('${providerId}','yqaa-scope-${providerId}','consultant','active','YQAA Scope Provider','${providerId}@example.invalid'),
      ('${clientId}','yqaa-scope-${clientId}','client','active','YQAA Scope Client','${clientId}@example.invalid');
    insert into public.conversations (id,participant_a,participant_b,context_kind,metadata)
      values ('${conversationId}','${participantA}','${participantB}','general','{}'::jsonb);
    insert into public.gigs (id,provider_id,provider_type,title,slug,status)
      values ('${gigId}','${providerId}','consultant','YQAA scope test gig','yqaa-scope-${gigId}','active');
    insert into public.gig_tiers (id,gig_id,tier,title,price,delivery_days,scope_depth,scope_units)
      values ('${tierId}','${gigId}','basic','YQAA scope test tier',5000,5,'review',5);
    insert into public.yqaa_pricing_approvals (conversation_id,request_id,version,provider_id,price_cents,scope_hash,gig_id,status) values
      ('${conversationId}','${requestIdA}',1,'${providerId}',4200,'scope-a','${gigId}','pending'),
      ('${conversationId}','${requestIdB}',1,'${providerId}',4300,'scope-b','${gigId}','approved'),
      ('${conversationId}','${requestIdC}',1,'${providerId}',4400,'scope-c','${gigId}','pending');
    commit;
  `)
}

function cleanup() {
  psql(`delete from public.gigs where id='${gigId}';
    delete from public.conversations where id='${conversationId}';
    delete from public.profiles where id in ('${providerId}','${clientId}');`)
}

try {
  setup()
  psql(`update public.gigs set title=title where id='${gigId}';`)
  const unchanged = psql(`select count(*) from public.yqaa_pricing_approvals where conversation_id='${conversationId}' and status in ('pending','approved');`)
  if (unchanged !== '3') throw new Error('No-op gig update invalidated approvals.')

  psql(`update public.gigs set unit_pricing='{"unit":"page","unit_price_cents":800,"included_units":2}'::jsonb where id='${gigId}';`)
  const afterGigChange = psql(`select count(*) from public.yqaa_pricing_approvals where conversation_id='${conversationId}' and status='invalidated';`)
  if (afterGigChange !== '3') throw new Error(`Gig pricing change invalidated ${afterGigChange} approvals, expected 3.`)
  console.log('PASS: a changed gig unit-pricing context invalidates all outstanding pending and approved YQAA approvals; no-op updates preserve them.')

  const freshRequest = randomUUID()
  psql(`insert into public.yqaa_pricing_approvals (conversation_id,request_id,version,provider_id,price_cents,scope_hash,gig_id,status)
    values ('${conversationId}','${freshRequest}',1,'${providerId}',4500,'scope-fresh','${gigId}','pending');
    update public.gig_tiers set scope_units=8 where id='${tierId}';`)
  const afterTierChange = psql(`select status from public.yqaa_pricing_approvals where conversation_id='${conversationId}' and request_id='${freshRequest}';`)
  if (afterTierChange !== 'invalidated') throw new Error(`Tier scope change left approval status ${afterTierChange}.`)
  console.log('PASS: tier scope changes invalidate approvals for the gig.')

  const tierNameRequest = randomUUID()
  psql(`insert into public.yqaa_pricing_approvals (conversation_id,request_id,version,provider_id,price_cents,scope_hash,gig_id,status)
    values ('${conversationId}','${tierNameRequest}',1,'${providerId}',4600,'scope-tier-name','${gigId}','pending');
    update public.gig_tiers set tier='standard' where id='${tierId}';`)
  const afterTierNameChange = psql(`select status from public.yqaa_pricing_approvals where conversation_id='${conversationId}' and request_id='${tierNameRequest}';`)
  if (afterTierNameChange !== 'invalidated') throw new Error(`Tier name change left approval status ${afterTierNameChange}.`)
  console.log('PASS: tier-name changes invalidate approvals when inferred scope depth may change.')

  const categoryRequest = randomUUID()
  psql(`insert into public.yqaa_pricing_approvals (conversation_id,request_id,version,provider_id,price_cents,scope_hash,gig_id,status)
    values ('${conversationId}','${categoryRequest}',1,'${providerId}',4700,'scope-category','${gigId}','pending');
    update public.gigs set category='immigration' where id='${gigId}';`)
  const afterCategoryChange = psql(`select status from public.yqaa_pricing_approvals where conversation_id='${conversationId}' and request_id='${categoryRequest}';`)
  if (afterCategoryChange !== 'invalidated') throw new Error(`Category change left approval status ${afterCategoryChange}.`)

  const subcategoryRequest = randomUUID()
  psql(`insert into public.yqaa_pricing_approvals (conversation_id,request_id,version,provider_id,price_cents,scope_hash,gig_id,status)
    values ('${conversationId}','${subcategoryRequest}',1,'${providerId}',4800,'scope-subcategory','${gigId}','pending');
    update public.gigs set subcategory='study-permits' where id='${gigId}';`)
  const afterSubcategoryChange = psql(`select status from public.yqaa_pricing_approvals where conversation_id='${conversationId}' and request_id='${subcategoryRequest}';`)
  if (afterSubcategoryChange !== 'invalidated') throw new Error(`Subcategory change left approval status ${afterSubcategoryChange}.`)
  console.log('PASS: category and subcategory changes invalidate approvals when gig selection scope changes.')

  for (const sql of [
    `update public.gigs set unit_pricing='{"unit":"mile","unit_price_cents":800}'::jsonb where id='${gigId}';`,
    `update public.gigs set unit_pricing='{"unit":"page","unit_price_cents":0}'::jsonb where id='${gigId}';`,
    `update public.gigs set hourly_rate_cents=0 where id='${gigId}';`,
    `update public.gig_tiers set scope_depth='unknown' where id='${tierId}';`,
    `update public.gig_tiers set scope_units=0 where id='${tierId}';`,
  ]) psql(sql, false)
  console.log('PASS: PostgreSQL rejects unsupported units, non-positive rates/prices/units, and invalid tier scope depth.')
} finally {
  cleanup()
}
