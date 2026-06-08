'use client'
import React from 'react'
import { C, Card, Btn } from './shared'

// ─── Tokens ───────────────────────────────────────────────────────────────────
const serif = "'Cormorant Garamond', 'Garamond', Georgia, serif"
const sans  = C.sans
const NAVY = '#0F172A', GOLD = '#9A7B3B', GREEN = '#1A6B45'
const AMBER = '#8B5E0A', RED = '#8B1A1A', PURPLE = '#3D2B6B', CYAN = '#0E7C8E'

const ESCROW_CFG = {
  held:             { dot:AMBER, bg:'#FEF5E4', text:AMBER, label:'Held',             icon:'🔒' },
  partial_released: { dot:CYAN,  bg:'#E0F3F7', text:CYAN,  label:'Partial Released', icon:'⚡' },
  released:         { dot:GREEN, bg:'#EAF5EE', text:GREEN, label:'Released',         icon:'✓' },
  disputed:         { dot:RED,   bg:'#FAEAEA', text:RED,   label:'Disputed',         icon:'⚠' },
  frozen:           { dot:PURPLE,bg:'#F5F3FF', text:PURPLE,label:'Frozen',           icon:'🧊' },
  refunded:         { dot:'#9097A8', bg:'#F2EFE9', text:'#9097A8', label:'Refunded',  icon:'↩' },
}

const TABS = [
  { id:'overview',   label:'Overview',         icon:'📊' },
  { id:'held',       label:'Held',             icon:'🔒' },
  { id:'auto',       label:'Auto-Release',     icon:'⏰' },
  { id:'partial',    label:'Partial',          icon:'⚡' },
  { id:'disputed',   label:'Disputed',         icon:'⚠' },
  { id:'frozen',     label:'Frozen',           icon:'🧊' },
  { id:'released',   label:'Released',         icon:'✓' },
  { id:'refunded',   label:'Refunded',         icon:'↩' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
const $    = v => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:0}).format(Number(v)||0)
const fmtN = v => (Number(v)||0).toLocaleString()
const ago  = s => { if(!s) return '—'; const d=Math.floor((Date.now()-new Date(s))/86400000); return d===0?'Today':d===1?'Yesterday':d<30?`${d}d ago`:`${new Date(s).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'2-digit'})}` }
const inFuture = s => s && new Date(s) > new Date()
const daysUntil = s => { if(!s) return null; const d=Math.ceil((new Date(s)-Date.now())/86400000); return d }

const EscrowPill = ({status}) => { const c=ESCROW_CFG[status]||ESCROW_CFG.held; return <span style={{display:'inline-flex',alignItems:'center',gap:'4px',padding:'3px 8px 3px 6px',borderRadius:'4px',fontSize:'11px',fontWeight:700,letterSpacing:'.04em',textTransform:'uppercase',background:c.bg,color:c.text}}><span style={{width:'5px',height:'5px',borderRadius:'50%',background:c.dot,display:'inline-block',flexShrink:0}}/>{c.label}</span> }

// ─── KPI card ─────────────────────────────────────────────────────────────────
const Kpi = ({label,value,sub,accent=NAVY,icon,onClick}) => {
  const [h,setH]=React.useState(false)
  return <div onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} onClick={onClick}
    style={{background:'#fff',border:`1px solid ${h&&onClick?NAVY:'#DDD8CE'}`,borderTop:`3px solid ${accent}`,borderRadius:'8px',padding:'16px 18px',cursor:onClick?'pointer':'default',boxShadow:h&&onClick?'0 4px 12px rgba(27,45,79,.12)':'0 1px 3px rgba(27,45,79,.05)',transition:'all .15s',display:'flex',flexDirection:'column',gap:'5px'}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}><span style={{fontSize:'11px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.08em',color:'#9097A8'}}>{label}</span><span style={{fontSize:'15px',opacity:.4}}>{icon}</span></div>
    <div style={{fontWeight:800,fontSize:'22px',color:NAVY,letterSpacing:'-.02em',lineHeight:1,fontVariantNumeric:'tabular-nums'}}>{value}</div>
    {sub&&<div style={{fontSize:'12px',color:'#9097A8',lineHeight:1.4}}>{sub}</div>}
  </div>
}

// ─── Action modal ─────────────────────────────────────────────────────────────
const Modal = ({open,title,body,onConfirm,onClose,busy,danger=false,inputs=[]}) => {
  const [values,setValues]=React.useState({})
  if(!open) return null
  return(
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.55)',zIndex:400,display:'flex',alignItems:'center',justifyContent:'center',padding:'24px'}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:'10px',padding:'24px',width:'100%',maxWidth:'460px',boxShadow:'0 20px 60px rgba(0,0,0,.22)',fontFamily:sans}}>
        <h3 style={{fontFamily:serif,fontWeight:600,fontSize:'20px',color:NAVY,margin:'0 0 8px'}}>{title}</h3>
        <p style={{fontSize:'13px',color:'#5C6070',lineHeight:1.55,margin:'0 0 16px'}}>{body}</p>
        {inputs.map(inp=>(
          <label key={inp.name} style={{display:'block',marginBottom:'12px'}}>
            <div style={{fontSize:'11px',fontWeight:700,color:'#5C6070',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:'5px'}}>{inp.label}{inp.required?' *':''}</div>
            {inp.type==='textarea'?(
              <textarea rows={3} value={values[inp.name]||''} onChange={e=>setValues({...values,[inp.name]:e.target.value})} placeholder={inp.placeholder} style={{width:'100%',boxSizing:'border-box',border:'1px solid #DDD8CE',borderRadius:'7px',padding:'9px 12px',fontSize:'13px',fontFamily:sans,resize:'vertical',outline:'none',lineHeight:1.5}}/>
            ):inp.type==='select'?(
              <select value={values[inp.name]||inp.options?.[0]?.value} onChange={e=>setValues({...values,[inp.name]:e.target.value})} style={{width:'100%',padding:'9px 12px',borderRadius:'7px',border:'1px solid #DDD8CE',fontSize:'13px',fontFamily:sans,background:'#fff'}}>
                {inp.options?.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ):(
              <input type={inp.type||'text'} step="0.01" value={values[inp.name]||''} onChange={e=>setValues({...values,[inp.name]:e.target.value})} placeholder={inp.placeholder} style={{width:'100%',boxSizing:'border-box',padding:'9px 12px',borderRadius:'7px',border:'1px solid #DDD8CE',fontSize:'13px',fontFamily:sans,outline:'none'}}/>
            )}
          </label>
        ))}
        <div style={{display:'flex',gap:'8px',justifyContent:'flex-end'}}>
          <button onClick={onClose} disabled={busy} style={{padding:'8px 18px',borderRadius:'6px',border:'1px solid #DDD8CE',background:'#fff',color:'#5C6070',cursor:'pointer',fontSize:'13px',fontWeight:600,fontFamily:sans}}>Cancel</button>
          <button onClick={()=>onConfirm(values)} disabled={busy} style={{padding:'8px 18px',borderRadius:'6px',border:'none',background:danger?RED:NAVY,color:'#fff',cursor:busy?'not-allowed':'pointer',fontSize:'13px',fontWeight:700,fontFamily:sans,opacity:busy?.7:1}}>{busy?'Processing…':'Confirm'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Hook: fetch ──────────────────────────────────────────────────────────────
function useFetch(url, deps=[]) {
  const [data,setData]=React.useState(null)
  const [loading,setLoading]=React.useState(true)
  const [error,setError]=React.useState('')
  const load=React.useCallback(async()=>{
    setLoading(true);setError('')
    try{
      const res=await fetch(url,{credentials:'same-origin'})
      const json=await res.json().catch(()=>({}))
      if(!res.ok) throw new Error(json?.error?.message||json?.error||'Failed')
      setData(json?.data??json)
    }catch(e){setError(e.message)}finally{setLoading(false)}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[url,...deps])
  React.useEffect(()=>{load()},[load])
  return{data,loading,error,reload:load}
}

const post = async(url,body={}) => {
  const res=await fetch(url,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
  const json=await res.json().catch(()=>({}))
  if(!res.ok) throw new Error(json?.error?.message||json?.error||'Request failed')
  return json?.data??json
}

const patch = async(url,body={}) => {
  const res=await fetch(url,{method:'PATCH',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
  const json=await res.json().catch(()=>({}))
  if(!res.ok) throw new Error(json?.error?.message||json?.error||'Request failed')
  return json?.data??json
}

// ─── Detail drawer ────────────────────────────────────────────────────────────
function EscrowDrawer({order,onClose,onAction}) {
  const [section,setSection]=React.useState('overview')
  const [milestones,setMilestones]=React.useState(null)
  const [scopeChanges,setScopeChanges]=React.useState(null)
  const [events,setEvents]=React.useState(null)

  React.useEffect(()=>{
    if(!order?.id) return
    if(section==='milestones'&&!milestones){
      fetch(`/api/admin/escrow/${order.id}/milestones`,{credentials:'same-origin'})
        .then(r=>r.json()).then(d=>setMilestones(d?.data?.milestones||d?.milestones||[])).catch(()=>setMilestones([]))
    }
    if(section==='scope'&&!scopeChanges){
      fetch(`/api/admin/escrow/${order.id}/scope-changes`,{credentials:'same-origin'})
        .then(r=>r.json()).then(d=>setScopeChanges(d?.data?.scope_changes||d?.scope_changes||[])).catch(()=>setScopeChanges([]))
    }
    if(section==='events'&&!events){
      fetch(`/api/admin/escrow/${order.id}/events`,{credentials:'same-origin'})
        .then(r=>r.json()).then(d=>setEvents(d?.data?.events||d?.events||[])).catch(()=>setEvents([]))
    }
  },[section,order?.id,milestones,scopeChanges,events])

  if(!order) return null
  const escrowStatus = order.escrow_status||'held'
  const SECTIONS=['overview','milestones','scope','events']

  return(
    <div style={{position:'fixed',inset:0,zIndex:300,display:'flex',justifyContent:'flex-end'}}>
      <div onClick={onClose} style={{position:'absolute',inset:0,background:'rgba(0,0,0,.40)'}}/>
      <div style={{position:'relative',width:'min(620px,100vw)',height:'100vh',background:'#fff',boxShadow:'-4px 0 40px rgba(0,0,0,.18)',display:'flex',flexDirection:'column',fontFamily:sans}}>
        {/* Header */}
        <div style={{background:NAVY,padding:'18px 24px',flexShrink:0}}>
          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:'12px',marginBottom:'10px'}}>
            <div style={{minWidth:0}}>
              <div style={{fontSize:'10px',color:'rgba(255,255,255,.50)',letterSpacing:'.12em',textTransform:'uppercase',marginBottom:'3px'}}>Escrow · Order {order.order_number||order.id?.slice(0,8)}</div>
              <h2 style={{fontFamily:serif,fontWeight:600,fontSize:'19px',color:'#fff',margin:0,lineHeight:1.25}}>{order.service_title||'Service Order'}</h2>
            </div>
            <button onClick={onClose} style={{background:'rgba(255,255,255,.10)',border:'1px solid rgba(255,255,255,.15)',borderRadius:'6px',color:'#fff',cursor:'pointer',fontSize:'15px',padding:'4px 10px',flexShrink:0}}>✕</button>
          </div>
          <div style={{display:'flex',gap:'6px',flexWrap:'wrap',alignItems:'center',marginBottom:'12px'}}>
            <EscrowPill status={escrowStatus}/>
            {order.auto_release_eligible_at&&inFuture(order.auto_release_eligible_at)&&(
              <span style={{padding:'3px 8px',borderRadius:'4px',fontSize:'11px',fontWeight:700,background:'rgba(196,164,90,.20)',color:'#C4A45A',border:'1px solid rgba(196,164,90,.30)'}}>⏰ Auto-release in {daysUntil(order.auto_release_eligible_at)}d</span>
            )}
            {order.auto_release_eligible_at&&!inFuture(order.auto_release_eligible_at)&&order.escrow_status==='held'&&(
              <span style={{padding:'3px 8px',borderRadius:'4px',fontSize:'11px',fontWeight:700,background:'rgba(255,255,255,.10)',color:'#fff'}}>⏰ Eligible NOW</span>
            )}
          </div>
          <div style={{display:'flex',gap:0,borderBottom:'1px solid rgba(255,255,255,.08)',overflowX:'auto'}}>
            {SECTIONS.map(s=><button key={s} onClick={()=>setSection(s)} style={{padding:'7px 14px',fontSize:'11px',fontWeight:section===s?600:400,color:section===s?'#fff':'rgba(255,255,255,.45)',background:'none',border:'none',borderBottom:section===s?'2px solid #C4A45A':'2px solid transparent',cursor:'pointer',whiteSpace:'nowrap',textTransform:'capitalize',fontFamily:sans}}>{s.replace('_',' ')}</button>)}
          </div>
        </div>

        {/* Body */}
        <div style={{flex:1,overflowY:'auto',padding:'20px 24px'}}>

          {/* OVERVIEW */}
          {section==='overview'&&(
            <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>
              {/* Money breakdown */}
              <div style={{background:'#F7F5F0',border:'1px solid #DDD8CE',borderRadius:'8px',padding:'16px'}}>
                <div style={{fontFamily:serif,fontWeight:600,fontSize:'16px',color:NAVY,marginBottom:'10px'}}>Escrow Balance</div>
                {[
                  {l:'Currently Held',v:$(order.escrow_amount),c:AMBER,bold:true},
                  {l:'Released to Provider',v:$(order.escrow_released_amount),c:GREEN},
                  {l:'Refunded to Client',v:$(order.escrow_refunded_amount),c:RED},
                  {l:'Original Order Amount',v:$(order.gross),c:'#9097A8'},
                ].map(r=>(
                  <div key={r.l} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid #E8E4DC'}}>
                    <span style={{fontSize:'13px',color:'#5C6070'}}>{r.l}</span>
                    <span style={{fontSize:'13px',fontWeight:r.bold?700:500,color:r.c,fontVariantNumeric:'tabular-nums'}}>{r.v}</span>
                  </div>
                ))}
              </div>
              {/* Counterparty */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
                <div style={{background:'#F7F5F0',border:'1px solid #DDD8CE',borderRadius:'8px',padding:'12px 14px'}}>
                  <div style={{fontSize:'10px',fontWeight:700,color:'#9097A8',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'6px'}}>Client</div>
                  <div style={{fontWeight:600,fontSize:'13px',color:NAVY}}>{order.client_name||'—'}</div>
                  <div style={{fontSize:'11px',color:'#9097A8'}}>{order.client_email||'—'}</div>
                </div>
                <div style={{background:'#F7F5F0',border:'1px solid #DDD8CE',borderRadius:'8px',padding:'12px 14px'}}>
                  <div style={{fontSize:'10px',fontWeight:700,color:'#9097A8',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'6px'}}>Provider</div>
                  <div style={{fontWeight:600,fontSize:'13px',color:order.provider_id?NAVY:'#9097A8'}}>{order.provider_name||'Unassigned'}</div>
                  <div style={{fontSize:'11px',color:'#9097A8'}}>{order.provider_email||'—'}</div>
                </div>
              </div>
              {/* Dispute / freeze details */}
              {escrowStatus==='disputed'&&order.escrow_dispute_reason&&(
                <div style={{background:'#FAEAEA',border:'1px solid rgba(139,26,26,.22)',borderRadius:'8px',padding:'14px 16px'}}>
                  <div style={{fontSize:'12px',fontWeight:700,color:RED,marginBottom:'4px'}}>⚠ Disputed — {ago(order.escrow_disputed_at)}</div>
                  <div style={{fontSize:'13px',color:'#5C6070',lineHeight:1.55}}>{order.escrow_dispute_reason}</div>
                </div>
              )}
              {escrowStatus==='frozen'&&order.escrow_frozen_reason&&(
                <div style={{background:'#F5F3FF',border:'1px solid rgba(61,43,107,.22)',borderRadius:'8px',padding:'14px 16px'}}>
                  <div style={{fontSize:'12px',fontWeight:700,color:PURPLE,marginBottom:'4px'}}>🧊 Frozen — {ago(order.escrow_frozen_at)}</div>
                  <div style={{fontSize:'13px',color:'#5C6070',lineHeight:1.55}}>{order.escrow_frozen_reason}</div>
                </div>
              )}
              {/* Action buttons */}
              <div style={{background:'#F7F5F0',border:'1px solid #DDD8CE',borderRadius:'8px',padding:'14px 16px'}}>
                <div style={{fontSize:'10px',fontWeight:700,color:'#9097A8',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'10px'}}>Admin Actions</div>
                <div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
                  {['held','partial_released','frozen'].includes(escrowStatus)&&(
                    <button onClick={()=>onAction('release',order)} style={{padding:'9px 14px',borderRadius:'6px',border:'1px solid rgba(26,107,69,.30)',background:'#EAF5EE',color:GREEN,cursor:'pointer',fontSize:'13px',fontWeight:600,textAlign:'left',fontFamily:sans}}>✓ Full Release — pay provider their share</button>
                  )}
                  {order.escrow_amount>0&&!['refunded'].includes(escrowStatus)&&(
                    <button onClick={()=>onAction('refund',order)} style={{padding:'9px 14px',borderRadius:'6px',border:'1px solid rgba(139,26,26,.22)',background:'#FAEAEA',color:RED,cursor:'pointer',fontSize:'13px',fontWeight:600,textAlign:'left',fontFamily:sans}}>↩ Refund — return funds to client (full or partial)</button>
                  )}
                  {escrowStatus!=='disputed'?(
                    <button onClick={()=>onAction('open_dispute',order)} style={{padding:'9px 14px',borderRadius:'6px',border:'1px solid rgba(139,94,10,.30)',background:'#FEF5E4',color:AMBER,cursor:'pointer',fontSize:'13px',fontWeight:600,textAlign:'left',fontFamily:sans}}>⚠ Open Dispute — flag for review</button>
                  ):(
                    <button onClick={()=>onAction('resolve_dispute',order)} style={{padding:'9px 14px',borderRadius:'6px',border:'1px solid rgba(26,107,69,.30)',background:'#EAF5EE',color:GREEN,cursor:'pointer',fontSize:'13px',fontWeight:600,textAlign:'left',fontFamily:sans}}>✓ Resolve Dispute</button>
                  )}
                  {escrowStatus!=='frozen'?(
                    <button onClick={()=>onAction('freeze',order)} style={{padding:'9px 14px',borderRadius:'6px',border:'1px solid rgba(61,43,107,.25)',background:'#F5F3FF',color:PURPLE,cursor:'pointer',fontSize:'13px',fontWeight:600,textAlign:'left',fontFamily:sans}}>🧊 Freeze Escrow — block all releases</button>
                  ):(
                    <button onClick={()=>onAction('unfreeze',order)} style={{padding:'9px 14px',borderRadius:'6px',border:'1px solid rgba(26,107,69,.30)',background:'#EAF5EE',color:GREEN,cursor:'pointer',fontSize:'13px',fontWeight:600,textAlign:'left',fontFamily:sans}}>♨ Unfreeze</button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* MILESTONES */}
          {section==='milestones'&&(
            <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
              <button onClick={()=>onAction('add_milestone',order)} style={{padding:'8px 14px',borderRadius:'6px',border:'1px solid #DDD8CE',background:'#fff',color:NAVY,cursor:'pointer',fontSize:'13px',fontWeight:600,fontFamily:sans,alignSelf:'flex-start'}}>+ Add Milestone</button>
              {milestones===null?<p style={{color:'#9097A8',fontSize:'13px',padding:'16px',textAlign:'center'}}>Loading milestones…</p>:milestones.length===0?<div style={{background:'#F7F5F0',border:'1px dashed #C8C2B6',borderRadius:'8px',padding:'24px',textAlign:'center'}}><div style={{fontSize:'28px',marginBottom:'8px',opacity:.4}}>🎯</div><div style={{fontFamily:serif,fontWeight:600,fontSize:'16px',color:NAVY}}>No milestones yet</div><p style={{fontSize:'12px',color:'#9097A8',margin:'4px 0 0',lineHeight:1.5}}>Milestones split escrow into staged releases. Add one for projects with deliverable phases.</p></div>:milestones.map(m=>(
                <div key={m.id} style={{background:'#F7F5F0',border:'1px solid #DDD8CE',borderRadius:'8px',padding:'14px 16px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'6px'}}>
                    <div><span style={{fontSize:'10px',fontWeight:700,color:'#9097A8',textTransform:'uppercase',letterSpacing:'.06em'}}>Milestone {m.sequence}</span><div style={{fontWeight:700,fontSize:'14px',color:NAVY}}>{m.title}</div></div>
                    <div style={{textAlign:'right'}}><div style={{fontWeight:800,fontSize:'16px',color:NAVY}}>{$(m.amount)}</div><span style={{fontSize:'10px',fontWeight:700,letterSpacing:'.05em',textTransform:'uppercase',color:m.status==='released'?GREEN:m.status==='approved'?CYAN:m.status==='rejected'?RED:'#9097A8'}}>{m.status?.replace('_',' ')}</span></div>
                  </div>
                  {m.description&&<div style={{fontSize:'12px',color:'#5C6070',lineHeight:1.55,marginBottom:'8px'}}>{m.description}</div>}
                  {m.due_date&&<div style={{fontSize:'11px',color:'#9097A8'}}>Due {new Date(m.due_date).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'2-digit'})}</div>}
                  {['submitted','approved'].includes(m.status)&&(
                    <div style={{display:'flex',gap:'6px',marginTop:'10px'}}>
                      {m.status==='submitted'&&<button onClick={()=>onAction('approve_milestone',{...m,_order_id:order.id})} style={{padding:'5px 11px',borderRadius:'5px',border:'1px solid rgba(26,107,69,.30)',background:'#EAF5EE',color:GREEN,cursor:'pointer',fontSize:'12px',fontWeight:600,fontFamily:sans}}>Approve</button>}
                      {m.status==='approved'&&<button onClick={()=>onAction('release_milestone',{...m,_order_id:order.id})} style={{padding:'5px 11px',borderRadius:'5px',border:'1px solid rgba(26,107,69,.30)',background:'#EAF5EE',color:GREEN,cursor:'pointer',fontSize:'12px',fontWeight:600,fontFamily:sans}}>Release {$(m.amount)}</button>}
                      <button onClick={()=>onAction('reject_milestone',{...m,_order_id:order.id})} style={{padding:'5px 11px',borderRadius:'5px',border:'1px solid rgba(139,26,26,.22)',background:'#FAEAEA',color:RED,cursor:'pointer',fontSize:'12px',fontWeight:600,fontFamily:sans}}>Reject</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* SCOPE CHANGES */}
          {section==='scope'&&(
            <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
              {scopeChanges===null?<p style={{color:'#9097A8',fontSize:'13px',padding:'16px',textAlign:'center'}}>Loading scope changes…</p>:scopeChanges.length===0?<div style={{background:'#F7F5F0',border:'1px dashed #C8C2B6',borderRadius:'8px',padding:'24px',textAlign:'center'}}><div style={{fontSize:'28px',marginBottom:'8px',opacity:.4}}>📐</div><div style={{fontFamily:serif,fontWeight:600,fontSize:'16px',color:NAVY}}>No scope changes</div><p style={{fontSize:'12px',color:'#9097A8',margin:'4px 0 0',lineHeight:1.5}}>Providers can request escrow increases when revisions exceed original scope. Client must approve before funds move.</p></div>:scopeChanges.map(sc=>(
                <div key={sc.id} style={{background:'#F7F5F0',border:'1px solid #DDD8CE',borderRadius:'8px',padding:'14px 16px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'6px'}}>
                    <div style={{flex:1,minWidth:0}}>
                      <span style={{fontSize:'10px',fontWeight:700,color:'#9097A8',textTransform:'uppercase',letterSpacing:'.06em'}}>{sc.change_type?.replace('_',' ')} · {sc.requested_by_role}</span>
                      <div style={{fontWeight:700,fontSize:'14px',color:NAVY}}>{sc.amount_delta>=0?'+':''}{$(sc.amount_delta)}</div>
                    </div>
                    <span style={{fontSize:'10px',fontWeight:700,letterSpacing:'.05em',textTransform:'uppercase',color:sc.status==='approved'?GREEN:sc.status==='rejected'?RED:sc.status==='expired'?'#9097A8':AMBER}}>{sc.status}</span>
                  </div>
                  <div style={{fontSize:'12px',color:'#5C6070',lineHeight:1.55,marginBottom:'8px'}}>{sc.reason}</div>
                  <div style={{fontSize:'11px',color:'#9097A8'}}>Requested {ago(sc.created_at)}{sc.client_decision_at&&` · Client decided ${ago(sc.client_decision_at)}`}</div>
                  {sc.status==='pending'&&(
                    <div style={{display:'flex',gap:'6px',marginTop:'10px'}}>
                      <button onClick={()=>onAction('approve_scope',{...sc,_order_id:order.id})} style={{padding:'5px 11px',borderRadius:'5px',border:'1px solid rgba(26,107,69,.30)',background:'#EAF5EE',color:GREEN,cursor:'pointer',fontSize:'12px',fontWeight:600,fontFamily:sans}}>Admin Approve</button>
                      <button onClick={()=>onAction('reject_scope',{...sc,_order_id:order.id})} style={{padding:'5px 11px',borderRadius:'5px',border:'1px solid rgba(139,26,26,.22)',background:'#FAEAEA',color:RED,cursor:'pointer',fontSize:'12px',fontWeight:600,fontFamily:sans}}>Reject</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* EVENTS */}
          {section==='events'&&(
            <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
              <div style={{fontSize:'12px',color:'#9097A8',marginBottom:'4px'}}>Every escrow state change, in chronological order.</div>
              {events===null?<p style={{color:'#9097A8',fontSize:'13px',padding:'16px',textAlign:'center'}}>Loading…</p>:events.length===0?<p style={{color:'#9097A8',fontSize:'13px',padding:'16px',textAlign:'center',background:'#F7F5F0',borderRadius:'8px'}}>No escrow events yet.</p>:events.map((e,i)=>(
                <div key={i} style={{background:'#F7F5F0',border:'1px solid #DDD8CE',borderRadius:'7px',padding:'10px 14px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',gap:'8px',marginBottom:'3px'}}>
                    <span style={{fontWeight:700,fontSize:'13px',color:NAVY,textTransform:'capitalize'}}>{e.event_type?.replace(/_/g,' ')}</span>
                    <span style={{fontSize:'11px',color:'#9097A8'}}>{ago(e.created_at)}</span>
                  </div>
                  {e.amount!==null&&e.amount!==undefined&&<div style={{fontSize:'13px',fontWeight:700,color:Number(e.amount)>=0?GREEN:RED,fontVariantNumeric:'tabular-nums'}}>{Number(e.amount)>=0?'+':''}{$(e.amount)} → balance {$(e.balance_after)}</div>}
                  {e.reason&&<div style={{fontSize:'12px',color:'#5C6070',lineHeight:1.5,marginTop:'2px'}}>{e.reason}</div>}
                  <div style={{fontSize:'10px',color:'#9097A8',marginTop:'3px'}}>{e.actor_role||'system'}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function AdminEscrow() {
  const [tab,setTab]               = React.useState('overview')
  const [searchQ,setSearchQ]       = React.useState('')
  const [debouncedQ,setDebouncedQ] = React.useState('')
  const [page,setPage]             = React.useState(1)
  const [sortCol,setSortCol]       = React.useState('escrow_amount')
  const [sortDir,setSortDir]       = React.useState('desc')
  const [selectedOrder,setSelectedOrder] = React.useState(null)
  const [modal,setModal]           = React.useState(null)
  const [busy,setBusy]             = React.useState(false)
  const [notice,setNotice]         = React.useState({type:'',msg:''})
  const [ledgerData,setLedgerData] = React.useState(null)
  const [auditEntries,setAuditEntries] = React.useState(null)
  const [loadingAudit,setLoadingAudit] = React.useState(false)
  const PER_PAGE = 25

  const flash=(type,msg)=>{setNotice({type,msg});setTimeout(()=>setNotice({type:'',msg:''}),5000)}
  React.useEffect(()=>{const t=setTimeout(()=>{setDebouncedQ(searchQ);setPage(1)},300);return()=>clearTimeout(t)},[searchQ])
  // ── Canonical ledger fetch — pulls escrow totals from the unified ledger
  //    so operators can verify the escrow API matches the ledger. ────────────
  React.useEffect(()=>{
    let cancelled = false
    fetch('/api/admin/analytics/ledger?view=overview', { credentials: 'same-origin' })
      .then(r=>r.json()).then(j=>{if(!cancelled)setLedgerData(j?.data??j)})
      .catch(()=>{}) // non-critical
    return ()=>{cancelled=true}
  },[])

  // ── Audit log fetch — cron + manual auto-release sweep history ─────────
  React.useEffect(()=>{
    let cancelled = false
    setLoadingAudit(true)
    fetch('/api/admin/escrow/audit', { credentials: 'same-origin' })
      .then(r=>r.json()).then(j=>{if(!cancelled)setAuditEntries(j?.data?.entries??j?.entries??null)})
      .catch(()=>{}) // non-critical
      .finally(()=>{if(!cancelled)setLoadingAudit(false)})
    return ()=>{cancelled=true}
  },[])

  // State mapping for tabs
  const tabToState = {overview:'all',held:'held',auto:'auto_release_ready',partial:'partial_released',disputed:'disputed',frozen:'frozen',released:'released',refunded:'refunded'}
  const state = tabToState[tab] || 'all'
  const apiUrl = `/api/admin/escrow?state=${state}&q=${encodeURIComponent(debouncedQ)}&page=${page}&page_size=${PER_PAGE}&sort=${sortCol}&dir=${sortDir}`
  const list = useFetch(apiUrl,[tab,debouncedQ,page,sortCol,sortDir])

  const orders     = list.data?.orders||[]
  const summary    = list.data?.summary||{}
  const serverTotal= list.data?.total||0
  const totalPages = Math.max(1,Math.ceil(serverTotal/PER_PAGE))

  const handleAction = (action,target) => {
    if(action==='release') return setModal({type:'release',order:target,title:'Force Release Escrow',body:`Release the full held amount (${$(target.escrow_amount)}) to ${target.provider_name||'the provider'}. This triggers an immediate payout transfer.`,inputs:[{name:'reason',label:'Reason',type:'textarea',placeholder:'e.g. Client confirmed delivery via email outside the platform'}]})
    if(action==='refund')  return setModal({type:'refund', order:target,title:'Refund Escrow',body:`Refund up to ${$(target.escrow_amount)} to ${target.client_name||'the client'}. Leave amount blank for full refund.`,danger:true,inputs:[{name:'amount',label:'Refund Amount (USD)',type:'number',placeholder:`Max ${target.escrow_amount}`},{name:'reason',label:'Reason',type:'textarea',required:true,placeholder:'e.g. Provider missed deadline by 2 weeks'}]})
    if(action==='open_dispute')   return setModal({type:'open_dispute',order:target,title:'Open Dispute',body:`Flag this escrow as disputed. All releases are blocked until resolved.`,inputs:[{name:'reason',label:'Dispute Reason',type:'textarea',required:true,placeholder:'e.g. Client and provider disagree on scope completion'}]})
    if(action==='resolve_dispute')return setModal({type:'resolve_dispute',order:target,title:'Resolve Dispute',body:'Choose how to resolve this dispute.',inputs:[{name:'resolution',label:'Resolution',type:'select',options:[{value:'release',label:'Release to provider'},{value:'refund',label:'Refund client'},{value:'split',label:'Split (handle manually)'},{value:'none',label:'No action — clear flag'}]},{name:'reason',label:'Resolution Notes',type:'textarea',required:true}]})
    if(action==='freeze')  return setModal({type:'freeze',order:target,title:'Freeze Escrow',body:'Block all releases on this order until unfrozen. Use for compliance holds or pending investigations.',inputs:[{name:'reason',label:'Reason',type:'textarea',required:true,placeholder:'e.g. Compliance review pending'}]})
    if(action==='unfreeze')return setModal({type:'unfreeze',order:target,title:'Unfreeze Escrow',body:'Restore the escrow to held status so normal release/refund actions can resume.',inputs:[{name:'reason',label:'Reason',type:'textarea'}]})
    if(action==='add_milestone') return setModal({type:'add_milestone',order:target,title:'Add Milestone',body:'Split the escrow into a staged release. Provider submits work per milestone; admin approves and releases each amount independently.',inputs:[{name:'title',label:'Title',type:'text',required:true,placeholder:'e.g. Phase 1: Discovery'},{name:'description',label:'Description',type:'textarea'},{name:'amount',label:'Amount (USD)',type:'number',required:true},{name:'due_date',label:'Due Date',type:'date'}]})
    if(action==='approve_milestone') return runAction('approve_milestone',target,{status:'approved'})
    if(action==='reject_milestone')  return setModal({type:'reject_milestone',milestone:target,title:'Reject Milestone',body:'Send back to the provider with feedback.',inputs:[{name:'rejection_reason',label:'Reason',type:'textarea',required:true}]})
    if(action==='release_milestone') return runAction('release_milestone',target,{status:'released'})
    if(action==='approve_scope')     return runAction('approve_scope',target,{scope_change_id:target.id,action:'approve'})
    if(action==='reject_scope')      return setModal({type:'reject_scope',scope:target,title:'Reject Scope Change',body:'Decline this scope change request.',inputs:[{name:'reason',label:'Reason',type:'textarea',required:true}]})
  }

  const runAction = async(action,target,extraValues={}) => {
    setBusy(true)
    try{
      if(action==='release')           await post(`/api/admin/escrow/${target.id}/release`,extraValues)
      else if(action==='refund')       await post(`/api/admin/escrow/${target.id}/refund`,extraValues)
      else if(action==='open_dispute') await patch(`/api/admin/escrow/${target.id}/dispute`,{action:'open',...extraValues})
      else if(action==='resolve_dispute') await patch(`/api/admin/escrow/${target.id}/dispute`,{action:'resolve',...extraValues})
      else if(action==='freeze')       await patch(`/api/admin/escrow/${target.id}/freeze`,{action:'freeze',...extraValues})
      else if(action==='unfreeze')     await patch(`/api/admin/escrow/${target.id}/freeze`,{action:'unfreeze',...extraValues})
      else if(action==='add_milestone')await post(`/api/admin/escrow/${target.id}/milestones`,{...extraValues,amount:Number(extraValues.amount),sequence:1})
      else if(action==='approve_milestone'||action==='reject_milestone'||action==='release_milestone'){
        await patch(`/api/admin/escrow/${target._order_id}/milestones?milestone_id=${target.id}`,extraValues)
      }
      else if(action==='approve_scope'||action==='reject_scope'){
        await post(`/api/admin/escrow/${target._order_id}/scope-changes`,extraValues)
      }
      flash('ok','Action completed.')
      list.reload()
      setModal(null)
      if(selectedOrder?.id===target.id||selectedOrder?.id===target._order_id) setSelectedOrder(null)
    }catch(e){flash('err',e.message)}
    finally{setBusy(false)}
  }

  const runAutoSweep = async() => {
    setBusy(true)
    try{
      const r=await post('/api/admin/escrow/run-auto-releases',{})
      flash('ok',`Auto-release: ${r.released_count||0} orders released (${$(r.released_total||0)})`)
      list.reload()
    }catch(e){flash('err',e.message)}
    finally{setBusy(false)}
  }

  const handleSort=col=>{if(sortCol===col)setSortDir(d=>d==='asc'?'desc':'asc');else{setSortCol(col);setSortDir('desc')};setPage(1)}
  const SortArrow=({col})=>sortCol!==col?<span style={{opacity:.25,marginLeft:'3px',fontSize:'10px'}}>⇅</span>:<span style={{color:'#C4A45A',marginLeft:'3px',fontSize:'10px'}}>{sortDir==='asc'?'▲':'▼'}</span>
  const thStyle=col=>({padding:'10px 12px',textAlign:'left',fontSize:'11px',fontWeight:700,color:sortCol===col?'#C4A45A':'rgba(255,255,255,.68)',background:NAVY,whiteSpace:'nowrap',cursor:'pointer',letterSpacing:'.06em',textTransform:'uppercase',borderBottom:'2px solid rgba(255,255,255,.08)',userSelect:'none'})

  return(
    <div style={{padding:'28px',display:'flex',flexDirection:'column',gap:'22px',fontFamily:sans,background:'#F7F5F0',minHeight:'100vh'}}>

      {/* Header */}
      <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',gap:'12px',flexWrap:'wrap'}}>
        <div>
          <div style={{fontSize:'11px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.14em',color:'#9097A8',marginBottom:'4px'}}>Money in Motion</div>
          <h2 style={{fontFamily:serif,fontWeight:600,fontSize:'32px',color:NAVY,margin:0,letterSpacing:'-.015em',lineHeight:1.1}}>Escrow Control</h2>
          <p style={{color:'#9097A8',fontSize:'13px',margin:'5px 0 0'}}>Automated state machine. Mirror visibility to clients. Override every scenario.</p>
        </div>
        <div style={{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}}>
          <button onClick={runAutoSweep} disabled={busy} style={{padding:'8px 16px',borderRadius:'6px',border:summary.auto_release_ready>0?'none':'1px solid #DDD8CE',background:summary.auto_release_ready>0?GOLD:'#fff',color:summary.auto_release_ready>0?'#fff':NAVY,cursor:busy?'not-allowed':'pointer',fontSize:'13px',fontWeight:700,fontFamily:sans,opacity:busy?.7:1}}>⏰ Run Auto-Release Sweep{summary.auto_release_ready>0?` (${summary.auto_release_ready})`:''}</button>
          <button onClick={list.reload} style={{padding:'8px 16px',borderRadius:'6px',border:'1px solid #DDD8CE',background:'#fff',color:NAVY,cursor:'pointer',fontSize:'13px',fontWeight:600,fontFamily:sans}}>↻ Refresh</button>
        </div>
      </div>

      {/* Notice */}
      {notice.msg&&<div style={{padding:'10px 16px',borderRadius:'7px',fontSize:'13px',fontWeight:600,background:notice.type==='ok'?'#EAF5EE':'#FAEAEA',color:notice.type==='ok'?GREEN:RED,border:`1px solid ${notice.type==='ok'?'rgba(26,107,69,.20)':'rgba(139,26,26,.20)'}`,display:'flex',alignItems:'center',gap:'8px'}}><span>{notice.type==='ok'?'✓':'!'}</span>{notice.msg}</div>}

      {/* Tabs */}
      <div style={{display:'flex',borderBottom:'1px solid #DDD8CE',gap:0,overflowX:'auto',background:'#fff',borderRadius:'8px 8px 0 0',boxShadow:'0 1px 3px rgba(27,45,79,.05)'}}>
        {TABS.map(t=>{
          const counts={overview:'',held:summary.held_count,auto:summary.auto_release_ready,partial:summary.partial_released_count,disputed:summary.disputed_count,frozen:summary.frozen_count,released:summary.released_count,refunded:summary.refunded_count}
          const n=counts[t.id]
          return(
            <button key={t.id} onClick={()=>{setTab(t.id);setPage(1)}} style={{display:'inline-flex',alignItems:'center',gap:'5px',padding:'12px 18px',fontSize:'13px',fontWeight:tab===t.id?600:400,color:tab===t.id?NAVY:'#9097A8',background:'none',border:'none',borderBottom:tab===t.id?`2px solid ${NAVY}`:'2px solid transparent',cursor:'pointer',whiteSpace:'nowrap',fontFamily:sans}}>
              <span style={{opacity:tab===t.id?1:.6}}>{t.icon}</span>{t.label}
              {n>0&&<span style={{marginLeft:'4px',padding:'1px 6px',borderRadius:'10px',background:t.id==='disputed'?RED:t.id==='auto'?GOLD:'rgba(0,0,0,.08)',color:t.id==='disputed'||t.id==='auto'?'#fff':NAVY,fontSize:'10px',fontWeight:700}}>{n}</span>}
            </button>
          )
        })}
      </div>

      {/* OVERVIEW */}
      {tab==='overview'&&(
        <>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:'12px'}}>
            <Kpi label="Total Held" value={$(summary.held_total)} sub={`${summary.held_count||0} orders`} accent={AMBER} icon="🔒" onClick={()=>setTab('held')}/>
            <Kpi label="Auto-Release Ready" value={summary.auto_release_ready||0} sub="Eligible NOW" accent={GOLD} icon="⏰" onClick={()=>setTab('auto')}/>
            <Kpi label="Auto-Release Pending" value={summary.auto_release_pending||0} sub="Countdown active" accent={'#0E7C8E'} icon="⏳"/>
            <Kpi label="Partial Released" value={$(summary.partial_released_total)} sub={`${summary.partial_released_count||0} orders`} accent={CYAN} icon="⚡" onClick={()=>setTab('partial')}/>
            <Kpi label="Disputed" value={summary.disputed_count||0} sub={$(summary.disputed_total)} accent={summary.disputed_count>0?RED:'#9097A8'} icon="⚠" onClick={()=>setTab('disputed')}/>
            <Kpi label="Frozen" value={summary.frozen_count||0} sub={$(summary.frozen_total)} accent={summary.frozen_count>0?PURPLE:'#9097A8'} icon="🧊" onClick={()=>setTab('frozen')}/>
            <Kpi label="Released (all time)" value={$(summary.released_total)} sub={`${summary.released_count||0} orders`} accent={GREEN} icon="✓" onClick={()=>setTab('released')}/>
            <Kpi label="Refunded" value={$(summary.refunded_total)} sub={`${summary.refunded_count||0} orders`} accent={'#9097A8'} icon="↩" onClick={()=>setTab('refunded')}/>
          </div>
          {/* ── Canonical Ledger Reconciliation ──────────────────────────────
              Shows the same escrow totals from the canonical ledger so the
              operator can spot discrepancies between the escrow API and the
              unified ledger at a glance. */}
          {ledgerData&&(
            <div>
              <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'10px'}}>
                <span style={{fontSize:'11px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.12em',color:'#9097A8'}}>Canonical Ledger Check</span>
                <span style={{fontSize:'10px',padding:'2px 6px',borderRadius:'4px',background:'#EAF5EE',color:'#1A6B45',fontWeight:700}}>live</span>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:'10px'}}>
                <Kpi label="Ledger: Deposits"   value={$( (ledgerData.escrow_held_cents||0) / 100 )}     sub={`${ledgerData.escrow_held_count||0} entries`} accent={AMBER} icon="📒"/>
                <Kpi label="Ledger: Released"   value={$( (ledgerData.escrow_released_cents||0) / 100 )} sub={`${ledgerData.escrow_released_count||0} entries`} accent={GREEN} icon="📒"/>
                <Kpi label="Ledger: Refunded"   value={$( (ledgerData.escrow_refunded_cents||0) / 100 )} sub={`${ledgerData.escrow_refunded_count||0} entries`} accent={RED} icon="📒"/>
                <Kpi label="Ledger: Net Outs."  value={$( (ledgerData.escrow_net_outstanding_cents||0) / 100 )} sub="deposits − released − refunded" accent={PURPLE} icon="⚖️"/>
              </div>
              <div style={{fontSize:'11px',color:'#9097A8',marginTop:'6px',lineHeight:1.5,paddingLeft:'2px'}}>
                Totals from <code style={{fontSize:'10px',background:'#F2EFE9',padding:'1px 5px',borderRadius:'3px'}}>canonical_ledger</code> — {ledgerData.escrow_held_count||0} deposits, {ledgerData.escrow_released_count||0} releases, {ledgerData.escrow_refunded_count||0} refunds
              </div>
            </div>
          )}

          {/* Quick reference */}
          <Card style={{padding:'18px 20px',borderLeft:`4px solid ${GOLD}`}}>
            <div style={{fontFamily:serif,fontWeight:600,fontSize:'16px',color:NAVY,marginBottom:'6px'}}>How the automated escrow flow works</div>
            <ol style={{margin:0,paddingLeft:'18px',fontSize:'13px',color:'#5C6070',lineHeight:1.7}}>
              <li><strong>Order paid</strong> → escrow funds are <strong>held</strong>. Provider can start work but cannot withdraw.</li>
              <li><strong>Order completed</strong> → auto-release timer starts (default 7 days). Client gets notified.</li>
              <li><strong>Revision requested</strong> → timer cancels. Escrow stays held until next completion.</li>
              <li><strong>Auto-release expires</strong> → funds release to provider automatically. Use the sweep button to process eligible orders.</li>
              <li><strong>Scope changes</strong> → provider can request more budget for out-of-scope work. Client approves or rejects. Approved changes update escrow_amount.</li>
              <li><strong>Milestones</strong> → split escrow into staged releases. Approve and release each independently.</li>
              <li><strong>Disputes / freeze</strong> → admin overrides. Block all releases until resolved.</li>
            </ol>
          </Card>
        </>
      )}

      {/* LIST TABS */}
      {tab!=='overview'&&(
        <>
          {/* ── Cron Job Monitor (Auto-Release tab only) ────────────────
              Shows recent cron_auto_release_escrow and escrow_run_auto_releases
              entries from admin_audit_log so operators can monitor sweep health. */}
          {tab==='auto'&&(
            <div>
              <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'10px'}}>
                <span style={{fontSize:'11px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.12em',color:'#9097A8'}}>Cron Job Monitor</span>
                <span style={{fontSize:'10px',padding:'2px 6px',borderRadius:'4px',background:loadingAudit?'#F2EFE9':'#EAF5EE',color:loadingAudit?'#9097A8':'#1A6B45',fontWeight:700,transition:'all .2s'}}>{loadingAudit?'loading…':'admin_audit_log'}</span>
              </div>
              {loadingAudit&&!auditEntries?(
                <div style={{background:'#fff',border:'1px solid #DDD8CE',borderRadius:'8px',padding:'24px',textAlign:'center',fontSize:'13px',color:'#9097A8'}}>Loading sweep history…</div>
              ):!auditEntries||auditEntries.length===0?(
                <div style={{background:'#fff',border:'1px dashed #C8C2B6',borderRadius:'8px',padding:'20px',textAlign:'center'}}>
                  <div style={{fontSize:'24px',marginBottom:'6px',opacity:.4}}>⏰</div>
                  <div style={{fontFamily:serif,fontWeight:600,fontSize:'14px',color:NAVY,marginBottom:'4px'}}>No sweep history yet</div>
                  <div style={{fontSize:'12px',color:'#9097A8',lineHeight:1.5}}>
                    No entries in <code style={{fontSize:'11px',background:'#F2EFE9',padding:'1px 5px',borderRadius:'3px'}}>admin_audit_log</code> for auto-release sweeps.
                    The daily cron job or manual sweep will appear here once it runs.
                  </div>
                </div>
              ):(
                <div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
                  {auditEntries.slice(0,10).map((e,i)=>{
                    const payload = e.payload || {}
                    const releasedCount = payload.released_count ?? payload.rpc_result?.released_count ?? null
                    const releasedTotal = payload.released_total ?? payload.rpc_result?.released_total ?? null
                    const earningsReleased = payload.earnings_released ?? null
                    const isCron = e.source === 'cron'
                    return(
                      <div key={e.id||i} style={{display:'flex',alignItems:'center',gap:'12px',background:'#fff',border:'1px solid #DDD8CE',borderRadius:'7px',padding:'11px 14px',transition:'all .12s'}}>
                        <div style={{flexShrink:0,width:'28px',height:'28px',borderRadius:'50%',background:isCron?'rgba(196,164,90,.15)':'rgba(15,23,42,.08)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'14px'}}>{isCron?'🕐':'👤'}</div>
                        <div style={{flex:'1',minWidth:0}}>
                          <div style={{display:'flex',alignItems:'center',gap:'6px',flexWrap:'wrap'}}>
                            <span style={{fontWeight:700,fontSize:'13px',color:NAVY}}>{isCron?'Cron: Daily Auto-Release':'Manual: Admin Sweep'}</span>
                            {releasedCount!==null&&<span style={{padding:'1px 6px',borderRadius:'4px',background:releasedCount>0?'#EAF5EE':'#F2EFE9',color:releasedCount>0?GREEN:'#9097A8',fontSize:'10px',fontWeight:700}}>{fmtN(releasedCount)} released</span>}
                            {!isCron&&<span style={{fontSize:'10px',padding:'1px 5px',borderRadius:'3px',background:'rgba(15,23,42,.06)',color:'#5C6070',fontWeight:500}}>by admin</span>}
                          </div>
                          <div style={{display:'flex',gap:'10px',flexWrap:'wrap',marginTop:'3px'}}>
                            {releasedTotal!==null&&<span style={{fontSize:'11px',color:'#5C6070'}}>Total: <strong style={{color:GREEN}}>{$(releasedTotal)}</strong></span>}
                            {earningsReleased!==null&&<span style={{fontSize:'11px',color:'#5C6070'}}>Earnings released: <strong style={{color:NAVY}}>{fmtN(earningsReleased)}</strong></span>}
                            <span style={{fontSize:'11px',color:'#9097A8'}}>{ago(e.ran_at)}</span>
                          </div>
                        </div>
                        <div style={{flexShrink:0,fontSize:'10px',color:'#9097A8',fontWeight:600,fontFamily:'monospace'}}>{new Date(e.ran_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</div>
                      </div>
                    )
                  })}
                  {auditEntries.length>10&&(
                    <div style={{textAlign:'center',fontSize:'12px',color:'#9097A8',padding:'8px 0'}}>
                      Showing 10 of {auditEntries.length} entries
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Toolbar */}
          <div style={{display:'flex',gap:'10px',flexWrap:'wrap',alignItems:'center'}}>
            <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="Search order #, client, provider…" style={{flex:'1 1 220px',maxWidth:'380px',padding:'8px 12px',borderRadius:'7px',border:'1px solid #DDD8CE',fontSize:'13px',fontFamily:sans,outline:'none'}}/>
            <span style={{marginLeft:'auto',fontSize:'12px',color:'#9097A8'}}>{serverTotal.toLocaleString()} orders</span>
          </div>

          {/* Table */}
          {list.error?<div style={{background:'#FAEAEA',border:'1px solid rgba(139,26,26,.20)',borderRadius:'8px',padding:'20px',fontSize:'14px',color:RED}}>{list.error} — <button onClick={list.reload} style={{background:'none',border:'none',color:RED,cursor:'pointer',textDecoration:'underline',fontSize:'13px'}}>Retry</button></div>:(
            <div style={{background:'#fff',border:'1px solid #DDD8CE',borderRadius:'8px',overflow:'hidden',boxShadow:'0 1px 4px rgba(27,45,79,.06)'}}>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',minWidth:'1000px'}}>
                  <thead>
                    <tr>
                      {[{c:'order_number',l:'Order#'},{c:'service_title',l:'Service'},{c:'client_name',l:'Client'},{c:'provider_name',l:'Provider'},{c:'escrow_status',l:'Status'},{c:'escrow_amount',l:'Held',r:true},{c:'escrow_released_amount',l:'Released',r:true},{c:'auto_release_eligible_at',l:'Auto-Release'},{c:'days_in_escrow',l:'Age'}].map(({c,l,r})=>(
                        <th key={c} style={{...thStyle(c),textAlign:r?'right':'left'}} onClick={()=>handleSort(c)}>{l}<SortArrow col={c}/></th>
                      ))}
                      <th style={{...thStyle(''),cursor:'default'}}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.loading?[1,2,3,4,5].map(i=><tr key={i} style={{background:i%2===0?'#fff':'#FAFAF8'}}>{Array.from({length:10}).map((_,j)=><td key={j} style={{padding:'13px'}}><div style={{height:'13px',background:'#F2EFE9',borderRadius:'3px',width:j===0?'80%':'55%'}}/></td>)}</tr>)
                    :orders.length===0?<tr><td colSpan={10} style={{padding:'48px',textAlign:'center',color:'#9097A8',fontSize:'14px'}}>No orders match this filter.</td></tr>
                    :orders.map((o,i)=>{
                      const eligibleNow = o.auto_release_eligible_at && !inFuture(o.auto_release_eligible_at)
                      const daysAge = o.days_in_escrow ?? Math.floor((Date.now()-new Date(o.status_updated_at||o.created_at))/86400000)
                      return(
                        <tr key={o.id} style={{background:i%2===0?'#fff':'#FAFAF8',borderBottom:'1px solid #F2EFE9'}}>
                          <td style={{padding:'11px 12px',fontSize:'12px',fontFamily:'monospace',color:NAVY,fontWeight:600}}>{o.order_number||o.id?.slice(0,8)}</td>
                          <td style={{padding:'11px 12px',fontSize:'13px',color:NAVY,fontWeight:600,maxWidth:'200px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={o.service_title}>{o.service_title||'—'}</td>
                          <td style={{padding:'11px 12px',fontSize:'13px',color:'#5C6070',whiteSpace:'nowrap'}}>{o.client_name||'—'}</td>
                          <td style={{padding:'11px 12px',fontSize:'13px',color:o.provider_id?NAVY:'#9097A8',fontStyle:o.provider_id?'normal':'italic'}}>{o.provider_name||'Unassigned'}</td>
                          <td style={{padding:'11px 12px'}}><EscrowPill status={o.escrow_status||'held'}/></td>
                          <td style={{padding:'11px 12px',textAlign:'right',fontWeight:700,fontSize:'13px',color:Number(o.escrow_amount)>0?AMBER:'#9097A8',fontVariantNumeric:'tabular-nums'}}>{$(o.escrow_amount)}</td>
                          <td style={{padding:'11px 12px',textAlign:'right',fontSize:'13px',color:GREEN,fontWeight:600,fontVariantNumeric:'tabular-nums'}}>{$(o.escrow_released_amount)}</td>
                          <td style={{padding:'11px 12px',fontSize:'12px',whiteSpace:'nowrap'}}>
                            {o.auto_release_eligible_at?(
                              eligibleNow?<span style={{color:GOLD,fontWeight:700}}>NOW</span>:<span style={{color:'#9097A8'}}>{daysUntil(o.auto_release_eligible_at)}d</span>
                            ):<span style={{color:'#9097A8'}}>—</span>}
                          </td>
                          <td style={{padding:'11px 12px',fontSize:'12px',color:daysAge>14?RED:daysAge>7?AMBER:'#9097A8',whiteSpace:'nowrap'}}>{daysAge}d</td>
                          <td style={{padding:'11px 12px',whiteSpace:'nowrap'}}>
                            <div style={{display:'flex',gap:'5px'}}>
                              <button onClick={()=>setSelectedOrder(o)} style={{padding:'5px 10px',borderRadius:'5px',border:'1px solid #DDD8CE',background:'#F7F5F0',color:NAVY,cursor:'pointer',fontSize:'12px',fontWeight:600,fontFamily:sans}}>Manage</button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {orders.length>0&&!list.loading&&(
                    <tfoot><tr style={{background:'#F8F7F4',borderTop:'2px solid #DDD8CE'}}>
                      <td colSpan={5} style={{padding:'9px 12px',fontSize:'12px',color:'#9097A8',fontWeight:600}}>{(page-1)*PER_PAGE+1}–{Math.min(page*PER_PAGE,serverTotal)} of {serverTotal.toLocaleString()}</td>
                      <td style={{padding:'9px 12px',textAlign:'right',fontSize:'12px',fontWeight:700,color:AMBER}} title="This page only">{$(orders.reduce((s,o)=>s+Number(o.escrow_amount||0),0))}</td>
                      <td style={{padding:'9px 12px',textAlign:'right',fontSize:'12px',fontWeight:700,color:GREEN}} title="This page only">{$(orders.reduce((s,o)=>s+Number(o.escrow_released_amount||0),0))}</td>
                      <td colSpan={3}/>
                    </tr></tfoot>
                  )}
                </table>
              </div>
              {/* Pagination */}
              {totalPages>1&&(
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',borderTop:'1px solid #F2EFE9',background:'#FAFAF8'}}>
                  <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1} style={{padding:'6px 14px',borderRadius:'6px',border:'1px solid #DDD8CE',background:page===1?'#F7F5F0':'#fff',color:page===1?'#9097A8':NAVY,cursor:page===1?'not-allowed':'pointer',fontSize:'13px',fontWeight:600,fontFamily:sans}}>← Prev</button>
                  <span style={{fontSize:'13px',color:'#5C6070'}}>Page {page} of {totalPages}</span>
                  <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages} style={{padding:'6px 14px',borderRadius:'6px',border:'1px solid #DDD8CE',background:page===totalPages?'#F7F5F0':'#fff',color:page===totalPages?'#9097A8':NAVY,cursor:page===totalPages?'not-allowed':'pointer',fontSize:'13px',fontWeight:600,fontFamily:sans}}>Next →</button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {selectedOrder&&<EscrowDrawer order={selectedOrder} onClose={()=>setSelectedOrder(null)} onAction={handleAction}/>}
      <Modal open={!!modal} {...modal} busy={busy} onClose={()=>setModal(null)} onConfirm={async v=>{await runAction(modal.type, modal.order||modal.milestone||modal.scope, v)}}/>
    </div>
  )
}
