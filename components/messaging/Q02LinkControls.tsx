"use client"
import { useEffect, useRef, useState } from 'react'

// No credentials in URLs, storage, logs or broadcast channels. Messages go only
// to the explicitly opened window at the server-configured paired origin.
export default function Q02LinkControls({site}:{site:'support'|'portal'}) {
 const [state,setState]=useState<any>(null), [preferences,setPreferences]=useState(false), [summary,setSummary]=useState(false)
 const [pending,setPending]=useState<any>(null)
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('Loading consent…')
 const peer=useRef<Window|null>(null), continuation=useRef<any>(null), flow=useRef(''), inFlight=useRef(false)
 const endpoint=site==='support'?'/api/privacy/account/':'/api/privacy/reciprocal'
 async function call(action:string,body:any={}) {
  const response=await fetch(site==='support'?endpoint+action:endpoint,{method:action==='review'?'GET':'POST',cache:'no-store',headers:action==='review'?{}:{'Content-Type':'application/json'},...(action==='review'?{}:{body:JSON.stringify(site==='support'?body:{action,...body})})})
  const data=await response.json(); if(!response.ok) throw Error('Operation was not confirmed. Refresh and retry after checking both sessions.')
  return data
 }
 async function load(){try{setState(await call('review'));setMessage('')}catch{setMessage('Consent dependencies are unavailable. No link is confirmed.')}}
 useEffect(()=>{void load()},[])
 const otherOrigin=state?.peerOrigin
 function send(type:string,data:any={}) {
  if(!peer.current || !otherOrigin) throw Error('Open the paired account window to continue.')
  peer.current.postMessage({type,flow:flow.current,...data},otherOrigin)
 }
 useEffect(()=>{
  async function receive(event:MessageEvent){
   if(!otherOrigin || event.origin!==otherOrigin || event.source!==peer.current || !event.data || typeof event.data.type!=='string') return
   const m=event.data
   if(inFlight.current || (site==='support' && m.type==='q02-challenge' ? false : m.flow!==flow.current)) return
   inFlight.current=true; setBusy(true)
   try{
    if(site==='support' && m.type==='q02-challenge'){
     if(typeof m.challenge!=='string' || !/^[A-Za-z0-9_-]{43}$/.test(m.challenge)) return
     flow.current=m.challenge
     const intent=await call('issue',{accepted:true,disclosure:'q02-support-v1',scopes:['derived_summary','preferences'],nonce:m.challenge})
     continuation.current={supportCredential:intent.supportCredential}
     send('q02-intent',{supportProof:intent.proof,challenge:m.challenge})
    }else if(site==='portal' && m.type==='q02-intent'){
     const receipt=await call('receipt',{supportProof:m.supportProof,challenge:m.challenge})
     continuation.current={portalCredential:receipt.portalCredential}
     send('q02-receipt',{supportProof:m.supportProof,receipt:receipt.receipt,challenge:m.challenge,portalCredential:receipt.portalCredential})
    }else if(site==='support' && m.type==='q02-receipt'){
     const staged=await call('stage',{supportProof:m.supportProof,receipt:m.receipt,challenge:m.challenge,portalCredential:m.portalCredential})
     continuation.current=staged.continuation
     setPending({requestDigest:staged.requestDigest,eventDigest:staged.eventDigest})
     send('q02-stage',{requestDigest:staged.requestDigest,eventDigest:staged.eventDigest,peerCredential:staged.continuation.supportCredential})
     setMessage('The link is staged. Acknowledge it in Portal, then here in Support.')
    }else if(site==='portal' && m.type==='q02-stage'){
     continuation.current={...continuation.current,requestDigest:m.requestDigest,peerCredential:m.peerCredential}
     setPending({requestDigest:m.requestDigest,eventDigest:m.eventDigest})
     setMessage('Review the staged event, then acknowledge this link here.')
    }else if(site==='support' && m.type==='q02-portal-approved'){
     continuation.current.peerAck=m.peerAck
     setPending({requestDigest:m.requestDigest,eventDigest:m.eventDigest,peerApproved:true})
     setMessage('Portal approved this event. Acknowledge it here to continue.')
    }else if(site==='portal' && m.type==='q02-support-approved'){
     const local=continuation.current
     if(!local?.ownAck || local.requestDigest!==m.requestDigest) throw Error('Stage acknowledgment missing')
     await call('ack',{requestDigest:m.requestDigest,ownAck:local.ownAck,peerAck:m.peerAck,peerCredential:local.peerCredential})
     send('q02-ack-recorded',{requestDigest:m.requestDigest})
     setPending(null)
    }else if(site==='support' && m.type==='q02-ack-recorded'){
     const {ownAck,peerAck,...input}=continuation.current??{}
     const result=await call('consume',input)
     if(result.decision!=='LINKED' || result.requestDigest!==m.requestDigest) throw Error('Link not confirmed')
     continuation.current=null;setPending(null)
     setMessage('Both accounts verified and linked. Derived memory use, correction and forget remain unavailable.')
     send('q02-linked'); flow.current=''
    }else if(site==='portal' && m.type==='q02-linked'){
     continuation.current=null;flow.current='';setPending(null)
     setMessage('Both accounts verified and linked. Derived memory use, correction and forget remain unavailable.')
    }
   }catch(error){continuation.current=null;flow.current='';setPending(null);setMessage(error instanceof Error?error.message:'Link was not confirmed.')}
   finally{inFlight.current=false;setBusy(false)}
  }
  window.addEventListener('message',receive)
  return()=>window.removeEventListener('message',receive)
 },[otherOrigin])
 async function change(action:'grant'|'withdraw'){
  setBusy(true)
  try{await call(action,action==='grant'?{accepted:true,disclosure:site==='support'?'q02-support-v1':'portal-v7-1',scopes:['derived_summary','preferences']}:{});await load();setPreferences(false);setSummary(false);setMessage(action==='grant'?'Consent recorded. Continue to verify both accounts.':'Consent withdrawn. Derived access remains unavailable.');continuation.current=null;flow.current='';setPending(null)}catch{setMessage('Consent change was not confirmed. Refresh and retry.')}
  finally{setBusy(false)}
 }
 async function acknowledge(){
  if(!pending || !continuation.current) return
  setBusy(true)
  try{
   const own=await call('event',{requestDigest:pending.requestDigest})
   continuation.current.ownAck=own.ack
   if(site==='portal'){
    send('q02-portal-approved',{requestDigest:pending.requestDigest,eventDigest:pending.eventDigest,peerAck:own.ack})
    setPending(null);setMessage('Event approved here. Acknowledge the same event in Support before the short-lived proof expires.')
   }else{
    const local=continuation.current
    if(!local.peerAck) throw Error('Portal acknowledgment is required first.')
    await call('ack',{requestDigest:pending.requestDigest,ownAck:own.ack,peerAck:local.peerAck,peerCredential:local.portalCredential})
    send('q02-support-approved',{requestDigest:pending.requestDigest,peerAck:own.ack})
    setPending(null);setMessage('Support approved this event. Waiting for Portal to record its acknowledgment.')
   }
  }catch(error){setPending(null);continuation.current=null;flow.current='';setMessage(error instanceof Error?error.message:'Acknowledgment was not confirmed.')}
  finally{setBusy(false)}
 }
 async function begin(){
  setBusy(true)
  try{
   if(site==='support'){
    continuation.current=null;flow.current='';setPending(null)
    peer.current=window.open(otherOrigin+'/account/reciprocal-consent','q02-paired-consent','popup,width=720,height=850')
    if(!peer.current) throw Error('Allow the paired consent window to continue.')
    setMessage('Sign in and explicitly continue in the Portal window.')
   }else{
    peer.current=window.opener
    if(!peer.current) throw Error('Start from Support account linking, then return here.')
    const data=await call('challenge',{expectedEpoch:state.consent.epoch})
    flow.current=data.challenge
    send('q02-challenge',{challenge:data.challenge})
    setMessage('Verifying both signed-in accounts…')
   }
  }catch(error){setMessage(error instanceof Error?error.message:'Cannot start linking.')}
  finally{setBusy(false)}
 }
 return <section className="mx-auto max-w-2xl space-y-5 p-6" aria-labelledby="q02-title">
  <h1 id="q02-title" className="text-2xl font-semibold">Link Support and Portal accounts</h1>
  <p>Optional consent is separate from ordinary conversation memory. Sign in and choose both scopes at each site. Linking alone does not enable derived memory use, correction or forget.</p>
  <p>Current consent: <strong>{state?.consent?.active?'Active':state?'Off':'Unavailable'}</strong>. Disclosure: {site==='support'?'q02-support-v1':'portal-v7-1'}.</p>
  <fieldset disabled={busy || !state?.available} className="space-y-3"><legend>Choose both scopes to opt in</legend>
   <label className="flex gap-3"><input type="checkbox" checked={preferences} onChange={e=>setPreferences(e.target.checked)}/>Preferences across Support and Portal</label>
   <label className="flex gap-3"><input type="checkbox" checked={summary} onChange={e=>setSummary(e.target.checked)}/>Derived summaries across Support and Portal</label>
  </fieldset>
  <p>Withdrawal prevents future derived use. Transcripts and legal or commercial audit records have separate retention; withdrawal does not delete them.</p>
  <div className="flex flex-wrap gap-3">
   <button className="rounded border px-4 py-2 disabled:opacity-50" disabled={busy || !state?.available || !preferences || !summary} onClick={()=>change('grant')}>Opt in to both scopes</button>
   <button className="rounded border px-4 py-2 disabled:opacity-50" disabled={busy || !state?.consent?.active} onClick={()=>change('withdraw')}>Withdraw consent</button>
   <button className="rounded border px-4 py-2 disabled:opacity-50" disabled={busy || !state?.available || !state?.consent?.active || !otherOrigin} onClick={begin}>{site==='support'?'Open Portal and continue':'Verify both accounts and link'}</button>
   <button className="rounded border px-4 py-2" disabled={busy} onClick={load}>Refresh status</button>
  </div>
  {pending && <div className="space-y-3 border p-4"><p>Staged event to acknowledge:</p><code className="break-all">{pending.eventDigest}</code><p>The same event must be approved at both sites. If the short-lived proofs expire, restart linking.</p><button className="rounded border px-4 py-2 disabled:opacity-50" disabled={busy || (site==='support' && !pending.peerApproved)} onClick={acknowledge}>Acknowledge this staged link</button></div>}
  <p role="status" aria-live="polite">{message || (state?.available?'':'Linking dependencies are unavailable. No link is confirmed.')}</p>
 </section>
}
