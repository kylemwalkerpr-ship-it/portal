// Execute production helpers with local dependency adapters; no network/auth proof.
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import vm from 'node:vm'
import test from 'node:test'
import assert from 'node:assert/strict'
const read = path => stripTypeScriptTypes(readFileSync(new URL('../' + path, import.meta.url), 'utf8'))
const escalation = read('lib/chatEscalation.ts').replaceAll('export ', '')
function support(fetch) {
  return vm.runInNewContext(escalation + '\nescalateToSupport', { process:{env:{}},fetch,Error })
}
for (const [label, input] of [
  ['conversation ID alone', {conversationId:'foreign'}],
  ['contact details plus conversation', {conversationId:'foreign',visitor:{email:'same@example.invalid'}}],
  ['orphan token', {visitorToken:'synthetic-capability'}],
]) test(`support: ${label} fails before transport`, async()=>{
  let calls=0
  await assert.rejects(support(async()=>{calls++; throw Error('unexpected transport')})({message:'help',visitor:null,...input}),/requires/)
  assert.equal(calls,0)
})
test('support continuation sends explicit visitor capability only to its requested conversation',async()=>{
  let calls=0
  const result=await support(async(url,opts)=>{
    calls++
    assert.equal(opts.headers['X-Chat-Token'],'synthetic-capability')
    const body=JSON.parse(opts.body)
    assert.equal(body.conversationId,'synthetic-thread')
    assert.equal(body.requestAgent,true)
    assert.equal(body.clerkUserId,undefined)
    return Response.json({conversation:{id:'synthetic-thread'}})
  })({message:'help',visitor:null,conversationId:'synthetic-thread',visitorToken:'synthetic-capability'})
  assert.equal(calls,1);assert.equal(result.visitorToken,null)
})
test('new support handoff sends no account binding or prior thread capability',async()=>{
  await support(async(_url,opts)=>{
    assert.equal(opts.headers['X-Chat-Token'],undefined)
    const body=JSON.parse(opts.body)
    assert.equal(body.conversationId,undefined)
    assert.deepEqual(Object.keys(body).sort(),['message','requestAgent','topic'])
    return Response.json({conversation:{id:'new-thread'},visitorToken:'new-capability'})
  })({message:'help',visitor:null})
})
for (const status of [401,403,429,500]) test(`support HTTP ${status} propagates without success fallback`,async()=>{
  await assert.rejects(support(async()=>new Response('denied',{status}))({message:'help',visitor:null}),new RegExp(String(status)))
})
test('support malformed queue response propagates',async()=>{
  await assert.rejects(support(async()=>new Response('{'))({message:'help',visitor:null}),/JSON/)
})
const chat=readFileSync(new URL('../app/api/chat/route.ts',import.meta.url),'utf8')
const snapshot=stripTypeScriptTypes(chat.slice(chat.indexOf('async function loadViewerSnapshot()'),chat.indexOf('async function boundedViewerSnapshot()')))
function viewer(profile,error=null,clerk='synthetic-owner') {
  let reads=0
  const q={select:()=>q,eq:(key,value)=>{assert.equal(key,'clerk_user_id');assert.equal(value,clerk);return q},maybeSingle:async()=>({data:profile,error})}
  const load=vm.runInNewContext(snapshot+'\nloadViewerSnapshot',{
    getClerkUserId:async()=>clerk,createSupabaseAdminClient:()=>({from:table=>{reads++;assert.equal(table,'profiles');return q}}),
  })
  return {load,reads:()=>reads}
}
for (const [label,profile,error] of [
  ['missing',null,null],['suspended',{status:'suspended',email:'private@example.invalid'},null],
  ['unknown status',{email:'private@example.invalid'},null],
  ['RLS or SQL error',{status:'active',email:'private@example.invalid'},new Error('denied')],
]) test(`public viewer: ${label} cannot provide contact or role context`,async()=>{
  const result=await viewer(profile,error).load()
  assert.equal(result.visitor,null);assert.equal(result.role,null)
})
test('anonymous public viewer does not query any subject store',async()=>{
  const v=viewer(null,null,null);await v.load();assert.equal(v.reads(),0)
})
test('active portal viewer uses only canonical profile contact data, not thread memory',async()=>{
  const v=viewer({status:'active',role:'client',full_name:' Synthetic ',email:'synthetic@example.invalid'})
  const result=await v.load();assert.equal(result.role,'student');assert.equal(result.visitor.name,'Synthetic');assert.equal(v.reads(),1)
})
