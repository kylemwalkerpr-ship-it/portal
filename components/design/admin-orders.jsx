// @ts-nocheck
'use client'
import React from 'react'
import { C, Card, Btn, Avatar } from './shared'

// ─── Tokens ───────────────────────────────────────────────────────────────────
const serif = "'Cormorant Garamond', 'Garamond', Georgia, serif"
const sans  = C.sans
const NAVY = '#1B2D4F', GOLD = '#9A7B3B', GREEN = '#1A6B45'
const AMBER = '#8B5E0A', RED = '#8B1A1A', PURPLE = '#3D2B6B'

// ─── Order status config ──────────────────────────────────────────────────────
const STATUS_CFG = {
  pending:            { dot:'#9097A8', text:'#5C6070', bg:'#F2EFE9', label:'Pending'            },
  queued:             { dot:'#3B82F6', text:'#1E40AF', bg:'#EEF4FE', label:'Queued'             },
  created:            { dot:'#8B5CF6', text:PURPLE,   bg:'#F5F3FF', label:'Created'             },
  in_progress:        { dot:'#0891B2', text:'#0E7490', bg:'#EFF9FF', label:'In Progress'        },
  under_review:       { dot:GOLD,     text:AMBER,     bg:'#F5EDD6', label:'Under Review'        },
  revision_requested: { dot:'#F59E0B', text:AMBER,    bg:'#FEF5E4', label:'Revision'            },
  completed:          { dot:'#22C55E', text:GREEN,    bg:'#EAF5EE', label:'Completed'           },
  released:           { dot:GREEN,    text:GREEN,     bg:'#EAF5EE', label:'Released'            },
  cancelled:          { dot:RED,      text:RED,       bg:'#FAEAEA', label:'Cancelled'           },
  refunded:           { dot:RED,      text:RED,       bg:'#FAEAEA', label:'Refunded'            },
}

const ESCROW_CFG = {
  held:     { text:AMBER, bg:'#FEF5E4', icon:'🔒', label:'Held'     },
  released: { text:GREEN, bg:'#EAF5EE', icon:'✓',  label:'Released' },
  refunded: { text:RED,   bg:'#FAEAEA', icon:'↩',  label:'Refunded' },
}

const PAYOUT_CFG = {
  pending:     { text:AMBER,    label:'Pending'     },
  transferred: { text:GREEN,    label:'Paid'        },
  failed:      { text:RED,      label:'Failed'      },
}

const TABS = [
  { id:'all',       label:'All Orders',   icon:'📦' },
  { id:'active',    label:'Active',       icon:'⚡' },
  { id:'attention', label:'Needs Action', icon:'🔴' },
  { id:'financial', label:'Financial',    icon:'💰' },
  { id:'stats',     label:'Analytics',    icon:'📊' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
const $     = v => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:0}).format(Number(v)||0)
const $c    = v => $(v/100)
const fmtN  = v => (Number(v)||0).toLocaleString()
const fmtPct= v => `${(Number(v)||0).toFixed(1)}%`
const ago   = s => { if(!s) return '—'; const d=Math.floor((Date.now()-new Date(s))/86400000); return d===0?'Today':d===1?'Yesterday':d<30?`${d}d ago`:`${new Date(s).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'2-digit'})}` }
const fmtDate = s => s ? new Date(s).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—'

const StatusPill = ({status}) => { const c=STATUS_CFG[status]||STATUS_CFG.pending; return <span style={{display:'inline-flex',alignItems:'center',gap:'4px',padding:'3px 8px 3px 6px',borderRadius:'4px',fontSize:'11px',fontWeight:700,letterSpacing:'.04em',textTransform:'uppercase',background:c.bg,color:c.text}}><span style={{width:'5px',height:'5px',borderRadius:'50%',background:c.dot,display:'inline-block',flexShrink:0}}/>{c.label}</span> }

const EscrowPill = ({status}) => { const c=ESCROW_CFG[status]||ESCROW_CFG.held; return <span style={{display:'inline-flex',alignItems:'center',gap:'4px',padding:'3px 8px',borderRadius:'4px',fontSize:'11px',fontWeight:700,background:c.bg,color:c.text}}>{c.icon} {c.label}</span> }

const LateBadge = ({isLate}) => isLate ? <span style={{display:'inline-block',padding:'2px 6px',borderRadius:'3px',fontSize:'10px',fontWeight:700,background:'#FAEAEA',color:RED,border:`1px solid ${RED}25`}}>⚠ LATE</span> : null

// ─── KPI card ─────────────────────────────────────────────────────────────────
const Kpi = ({label,value,sub,accent=NAVY,icon,onClick}) => {
  const [h,setH]=React.useState(false)
  return <div onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} onClick={onClick}
    style={{background:'#fff',border:`1px solid ${h&&onClick?NAVY:'#DDD8CE'}`,borderTop:`3px solid ${accent}`,borderRadius:'8px',padding:'16px 18px',cursor:onClick?'pointer':'default',boxShadow:h&&onClick?'0 4px 12px rgba(27,45,79,.12)':'0 1px 3px rgba(27,45,79,.05)',transition:'all .15s',display:'flex',flexDirection:'column',gap:'5px'}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}><span style={{fontSize:'11px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.08em',color:'#9097A8'}}>{label}</span><span style={{fontSize:'15px',opacity:.4}}>{icon}</span></div>
    <div style={{fontWeight:800,fontSize:'24px',color:NAVY,letterSpacing:'-.02em',lineHeight:1,fontVariantNumeric:'tabular-nums'}}>{value}</div>
    {sub&&<div style={{fontSize:'12px',color:'#9097A8',lineHeight:1.4}}>{sub}</div>}
  </div>
}

// ─── Data table ───────────────────────────────────────────────────────────────
const DT = ({cols,rows,empty='No data'}) => <div style={{background:'#fff',border:'1px solid #DDD8CE',borderRadius:'8px',overflow:'hidden'}}>
  <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',minWidth:`${cols.length*100}px`}}>
    <thead><tr>{cols.map(c=><th key={c.k} style={{padding:'10px 13px',textAlign:c.r?'right':'left',fontSize:'11px',fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:'rgba(255,255,255,.70)',background:NAVY,whiteSpace:'nowrap',borderBottom:'2px solid rgba(255,255,255,.08)'}}>{c.l}</th>)}</tr></thead>
    <tbody>{rows.length===0?<tr><td colSpan={cols.length} style={{padding:'32px',textAlign:'center',color:'#9097A8',fontSize:'13px'}}>{empty}</td></tr>:rows.map((row,ri)=><tr key={ri} style={{background:ri%2===0?'#fff':'#FAFAF8',borderBottom:'1px solid #F2EFE9'}}>{cols.map(c=><td key={c.k} style={{padding:'10px 13px',fontSize:'13px',textAlign:c.r?'right':'left',color:c.dim?'#9097A8':NAVY,fontWeight:c.bold?700:400,whiteSpace:c.wrap?'normal':'nowrap',fontVariantNumeric:'tabular-nums'}}>{row[c.k]??'—'}</td>)}</tr>)}</tbody>
  </table></div>
</div>

// ─── Bar chart (inline SVG) ───────────────────────────────────────────────────
const BarChart = ({data=[],height=80,color=NAVY}) => {
  if(!data.length) return <div style={{height,display:'flex',alignItems:'center',justifyContent:'center',color:'#9097A8',fontSize:'12px'}}>No data</div>
  const max=Math.max(...data.map(d=>d.value),1), w=100/data.length
  return <svg viewBox={`0 0 100 ${height+16}`} preserveAspectRatio="none" style={{width:'100%',height:height+16,overflow:'visible'}}>
    {data.map((d,i)=>{const bh=(d.value/max)*height,x=i*w+w*.1,bw=w*.8;return(
      <g key={i}><title>{d.label}: {fmtN(d.value)}</title>
        <rect x={x} y={height-bh} width={bw} height={bh} fill={color} rx="1.5" opacity=".85"/>
        <text x={x+bw/2} y={height+11} textAnchor="middle" fontSize="4.5" fill="#9097A8" fontFamily={sans}>{d.label}</text>
      </g>)
    })}
  </svg>
}

// ─── Assign modal ─────────────────────────────────────────────────────────────
function AssignModal({order,consultants=[],onAssign,onClose}) {
  const [search,setSearch]=React.useState('')
  if(!order) return null
  const filtered=(consultants||[]).filter(c=>!search||c.name?.toLowerCase().includes(search.toLowerCase()))
  return(
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.60)',zIndex:320,display:'flex',alignItems:'center',justifyContent:'center',padding:'24px'}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:'10px',padding:'28px',width:'100%',maxWidth:'460px',maxHeight:'80vh',display:'flex',flexDirection:'column',boxShadow:'0 20px 60px rgba(0,0,0,.22)',fontFamily:sans}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px'}}>
          <h3 style={{fontFamily:serif,fontWeight:600,fontSize:'20px',color:NAVY,margin:0}}>{order.provider_id?'Reassign':'Assign'} Provider</h3>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',fontSize:'20px',color:'#9097A8',lineHeight:1}}>×</button>
        </div>
        <div style={{fontSize:'13px',color:'#5C6070',background:'#F7F5F0',borderRadius:'6px',padding:'10px 14px',marginBottom:'14px'}}><strong>{order.service_title||'Order'}</strong> — currently: <strong style={{color:order.provider_id?NAVY:'#9097A8'}}>{order.provider_name||'Unassigned'}</strong></div>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search provider…" style={{padding:'8px 12px',borderRadius:'7px',border:'1px solid #DDD8CE',fontSize:'13px',fontFamily:sans,outline:'none',marginBottom:'12px'}}/>
        <div style={{overflowY:'auto',flex:1,display:'flex',flexDirection:'column',gap:'8px'}}>
          {filtered.map(c=>(
            <div key={c.id} style={{display:'flex',alignItems:'center',gap:'12px',padding:'12px 14px',background:'#F7F5F0',borderRadius:'8px',border:'1px solid #DDD8CE',cursor:'pointer'}} onClick={()=>onAssign(order.id,c)}>
              <div style={{width:'36px',height:'36px',borderRadius:'8px',background:PURPLE,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'13px',fontWeight:800,color:'#fff',flexShrink:0}}>{(c.name||'?')[0].toUpperCase()}</div>
              <div style={{flex:1}}><div style={{fontWeight:600,fontSize:'13px',color:NAVY}}>{c.name}</div><div style={{fontSize:'11px',color:'#9097A8'}}>{c.email}</div></div>
              <span style={{padding:'4px 10px',borderRadius:'4px',background:'#EAF5EE',color:GREEN,fontSize:'11px',fontWeight:700,border:`1px solid rgba(26,107,69,.22)`}}>Assign →</span>
            </div>
          ))}
          {filtered.length===0&&<div style={{padding:'20px',textAlign:'center',color:'#9097A8',fontSize:'13px'}}>No providers found.</div>}
        </div>
      </div>
    </div>
  )
}

// ─── Deadline modal ───────────────────────────────────────────────────────────
function DeadlineModal({order,onConfirm,onClose}) {
  const [date,setDate]=React.useState(order?.deadline?.slice(0,10)||'')
  const [reason,setReason]=React.useState('')
  const [busy,setBusy]=React.useState(false)
  if(!order) return null
  return(
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.60)',zIndex:320,display:'flex',alignItems:'center',justifyContent:'center',padding:'24px'}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:'10px',padding:'28px',width:'100%',maxWidth:'420px',boxShadow:'0 20px 60px rgba(0,0,0,.22)',fontFamily:sans}}>
        <h3 style={{fontFamily:serif,fontWeight:600,fontSize:'20px',color:NAVY,margin:'0 0 6px'}}>Extend Deadline</h3>
        <p style={{fontSize:'13px',color:'#5C6070',margin:'0 0 16px'}}>Current deadline: <strong>{order.deadline?fmtDate(order.deadline):'Not set'}</strong></p>
        <label style={{display:'block',marginBottom:'12px'}}>
          <div style={{fontSize:'11px',fontWeight:700,color:'#5C6070',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:'5px'}}>New Deadline <span style={{color:RED}}>*</span></div>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{width:'100%',boxSizing:'border-box',padding:'9px 12px',borderRadius:'7px',border:'1px solid #DDD8CE',fontSize:'13px',fontFamily:sans,outline:'none'}}/>
        </label>
        <label style={{display:'block',marginBottom:'16px'}}>
          <div style={{fontSize:'11px',fontWeight:700,color:'#5C6070',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:'5px'}}>Reason</div>
          <input value={reason} onChange={e=>setReason(e.target.value)} placeholder="e.g. Provider requested extension" style={{width:'100%',boxSizing:'border-box',padding:'9px 12px',borderRadius:'7px',border:'1px solid #DDD8CE',fontSize:'13px',fontFamily:sans,outline:'none'}}/>
        </label>
        <div style={{display:'flex',gap:'8px',justifyContent:'flex-end'}}>
          <button onClick={onClose} style={{padding:'8px 18px',borderRadius:'6px',border:'1px solid #DDD8CE',background:'#fff',color:'#5C6070',cursor:'pointer',fontSize:'13px',fontWeight:600,fontFamily:sans}}>Cancel</button>
          <button disabled={!date||busy} onClick={async()=>{setBusy(true);await onConfirm(order.id,date,reason);setBusy(false)}} style={{padding:'8px 18px',borderRadius:'6px',border:'none',background:!date?'#9097A8':NAVY,color:'#fff',cursor:!date?'not-allowed':'pointer',fontSize:'13px',fontWeight:700,fontFamily:sans}}>{busy?'Updating…':'Extend Deadline'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Note modal ───────────────────────────────────────────────────────────────
function NoteModal({order,onConfirm,onClose}) {
  const [note,setNote]=React.useState('')
  const [busy,setBusy]=React.useState(false)
  if(!order) return null
  return(
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.60)',zIndex:320,display:'flex',alignItems:'center',justifyContent:'center',padding:'24px'}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:'10px',padding:'28px',width:'100%',maxWidth:'420px',boxShadow:'0 20px 60px rgba(0,0,0,.22)',fontFamily:sans}}>
        <h3 style={{fontFamily:serif,fontWeight:600,fontSize:'20px',color:NAVY,margin:'0 0 6px'}}>Add Admin Note</h3>
        <p style={{fontSize:'13px',color:'#5C6070',margin:'0 0 16px'}}>Visible only to admin. Logged in the order timeline.</p>
        <label style={{display:'block',marginBottom:'16px'}}>
          <textarea rows={4} value={note} onChange={e=>setNote(e.target.value)} placeholder="Internal note about this order…" style={{width:'100%',boxSizing:'border-box',border:'1px solid #DDD8CE',borderRadius:'7px',padding:'10px 12px',fontSize:'13px',fontFamily:sans,resize:'vertical',outline:'none',lineHeight:1.55}}/>
        </label>
        <div style={{display:'flex',gap:'8px',justifyContent:'flex-end'}}>
          <button onClick={onClose} style={{padding:'8px 18px',borderRadius:'6px',border:'1px solid #DDD8CE',background:'#fff',color:'#5C6070',cursor:'pointer',fontSize:'13px',fontWeight:600,fontFamily:sans}}>Cancel</button>
          <button disabled={!note.trim()||busy} onClick={async()=>{setBusy(true);await onConfirm(order.id,note.trim());setBusy(false)}} style={{padding:'8px 18px',borderRadius:'6px',border:'none',background:!note.trim()?'#9097A8':NAVY,color:'#fff',cursor:!note.trim()?'not-allowed':'pointer',fontSize:'13px',fontWeight:700,fontFamily:sans}}>{busy?'Saving…':'Add Note'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Order detail drawer ──────────────────────────────────────────────────────
function OrderDrawer({order,onClose,onAction}) {
  const [section,setSection]=React.useState('overview')
  const [timeline,setTimeline]=React.useState(null)
  const SECTIONS=['overview','financial','timeline','actions']

  React.useEffect(()=>{
    if(section==='timeline'&&!timeline&&order?.id){
      fetch(`/api/admin/orders/${order.id}/timeline`,{credentials:'same-origin'})
        .then(r=>r.json()).then(d=>setTimeline(d?.data?.timeline||d?.timeline||[]))
        .catch(()=>setTimeline([]))
    }
  },[section,order?.id,timeline])

  if(!order) return null
  const esc=order.escrow_status||'held'
  const pay=order.payout_status||'pending'

  return(
    <div style={{position:'fixed',inset:0,zIndex:300,display:'flex',justifyContent:'flex-end'}}>
      <div onClick={onClose} style={{position:'absolute',inset:0,background:'rgba(0,0,0,.40)'}}/>
      <div style={{position:'relative',width:'min(600px,100vw)',height:'100vh',background:'#fff',boxShadow:'-4px 0 40px rgba(0,0,0,.18)',display:'flex',flexDirection:'column',fontFamily:sans}}>

        {/* Header */}
        <div style={{background:NAVY,padding:'20px 24px',flexShrink:0}}>
          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:'12px',marginBottom:'12px'}}>
            <div style={{minWidth:0}}>
              <div style={{fontSize:'10px',color:'rgba(255,255,255,.50)',letterSpacing:'.12em',textTransform:'uppercase',marginBottom:'4px'}}>Order {order.order_number||order.id?.slice(0,8)}</div>
              <h2 style={{fontFamily:serif,fontWeight:600,fontSize:'19px',color:'#fff',margin:0,lineHeight:1.25,overflow:'hidden',textOverflow:'ellipsis',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>{order.service_title||'Service Order'}</h2>
            </div>
            <button onClick={onClose} style={{background:'rgba(255,255,255,.10)',border:'1px solid rgba(255,255,255,.15)',borderRadius:'6px',color:'#fff',cursor:'pointer',fontSize:'16px',padding:'5px 10px',flexShrink:0}}>✕</button>
          </div>
          <div style={{display:'flex',gap:'6px',flexWrap:'wrap',alignItems:'center',marginBottom:'12px'}}>
            <StatusPill status={order.status}/>
            <EscrowPill status={esc}/>
            {order.is_late&&<LateBadge isLate/>}
            {order.payout_status&&<span style={{padding:'3px 8px',borderRadius:'4px',fontSize:'11px',fontWeight:700,background:'rgba(255,255,255,.10)',color:'rgba(255,255,255,.75)'}}>{PAYOUT_CFG[pay]?.label||pay}</span>}
          </div>
          <div style={{display:'flex',gap:0,borderBottom:'1px solid rgba(255,255,255,.08)',overflowX:'auto'}}>
            {SECTIONS.map(s=><button key={s} onClick={()=>setSection(s)} style={{padding:'7px 14px',fontSize:'11px',fontWeight:section===s?600:400,color:section===s?'#fff':'rgba(255,255,255,.45)',background:'none',border:'none',borderBottom:section===s?'2px solid #C4A45A':'2px solid transparent',cursor:'pointer',whiteSpace:'nowrap',textTransform:'capitalize',fontFamily:sans}}>{s}</button>)}
          </div>
        </div>

        {/* Body */}
        <div style={{flex:1,overflowY:'auto',padding:'20px 24px'}}>

          {/* OVERVIEW */}
          {section==='overview'&&(
            <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
                {/* Client */}
                <div style={{background:'#F7F5F0',border:'1px solid #DDD8CE',borderRadius:'8px',padding:'12px 14px'}}>
                  <div style={{fontSize:'10px',fontWeight:700,color:'#9097A8',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'6px'}}>Client</div>
                  <div style={{fontWeight:600,fontSize:'13px',color:NAVY}}>{order.client_name||'—'}</div>
                  <div style={{fontSize:'11px',color:'#9097A8'}}>{order.client_email}</div>
                </div>
                {/* Provider */}
                <div style={{background:'#F7F5F0',border:'1px solid #DDD8CE',borderRadius:'8px',padding:'12px 14px'}}>
                  <div style={{fontSize:'10px',fontWeight:700,color:'#9097A8',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'6px'}}>Provider</div>
                  <div style={{fontWeight:600,fontSize:'13px',color:order.provider_id?NAVY:'#9097A8',fontStyle:order.provider_id?'normal':'italic'}}>{order.provider_name||'Unassigned'}</div>
                  <div style={{fontSize:'11px',color:'#9097A8'}}>{order.provider_email||order.provider_role}</div>
                </div>
              </div>
              {/* Key facts */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}}>
                {[
                  ['Order ID',order.id?.slice(0,8)+'…'],
                  ['Created',ago(order.created_at)],
                  ['Deadline',order.deadline?fmtDate(order.deadline):'Not set'],
                  ['Events',order.event_count||0],
                  ['Messages',order.message_count||0],
                  ['Days Open',order.days_open!=null?`${order.days_open}d`:'—'],
                ].map(([l,v])=>(
                  <div key={l} style={{background:'#F7F5F0',border:'1px solid #DDD8CE',borderRadius:'7px',padding:'10px 12px'}}>
                    <div style={{fontSize:'10px',fontWeight:700,color:'#9097A8',textTransform:'uppercase',letterSpacing:'.06em'}}>{l}</div>
                    <div style={{fontSize:'13px',fontWeight:600,color:NAVY,marginTop:'2px'}}>{v}</div>
                  </div>
                ))}
              </div>
              {order.revision_reason&&(
                <div style={{background:'#FEF5E4',border:'1px solid rgba(139,94,10,.22)',borderRadius:'8px',padding:'12px 14px'}}>
                  <div style={{fontSize:'11px',fontWeight:700,color:AMBER,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:'4px'}}>Revision Reason</div>
                  <div style={{fontSize:'13px',color:'#5C6070',lineHeight:1.55}}>{order.revision_reason}</div>
                </div>
              )}
            </div>
          )}

          {/* FINANCIAL */}
          {section==='financial'&&(
            <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
              <div style={{background:'#F7F5F0',border:'1px solid #DDD8CE',borderRadius:'8px',padding:'16px'}}>
                <div style={{fontFamily:serif,fontWeight:600,fontSize:'16px',color:NAVY,marginBottom:'12px'}}>Revenue Breakdown</div>
                {[
                  {l:'Gross Revenue',v:$(order.gross),color:NAVY,bold:true},
                  {l:'Platform Fee',v:$(order.fee),color:'#9097A8'},
                  {l:'Provider Payout',v:$(order.payout),color:GREEN,bold:true},
                ].map(r=>(
                  <div key={r.l} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid #E8E4DC'}}>
                    <span style={{fontSize:'13px',color:'#5C6070'}}>{r.l}</span>
                    <span style={{fontSize:'13px',fontWeight:r.bold?700:400,color:r.color}}>{r.v}</span>
                  </div>
                ))}
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
                <div style={{background:'#F7F5F0',border:'1px solid #DDD8CE',borderRadius:'8px',padding:'12px 14px'}}>
                  <div style={{fontSize:'10px',fontWeight:700,color:'#9097A8',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'5px'}}>Escrow</div>
                  <EscrowPill status={order.escrow_status||'held'}/>
                </div>
                <div style={{background:'#F7F5F0',border:'1px solid #DDD8CE',borderRadius:'8px',padding:'12px 14px'}}>
                  <div style={{fontSize:'10px',fontWeight:700,color:'#9097A8',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'5px'}}>Payout</div>
                  <span style={{fontSize:'13px',fontWeight:600,color:PAYOUT_CFG[order.payout_status||'pending']?.text||'#9097A8'}}>{PAYOUT_CFG[order.payout_status||'pending']?.label||'—'}</span>
                </div>
              </div>
              {order.stripe_pi&&<div style={{background:'#F7F5F0',border:'1px solid #DDD8CE',borderRadius:'8px',padding:'12px 14px'}}>
                <div style={{fontSize:'10px',fontWeight:700,color:'#9097A8',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'4px'}}>Stripe Payment Intent</div>
                <div style={{fontSize:'12px',fontFamily:'monospace',color:NAVY}}>{order.stripe_pi}</div>
              </div>}
              {order.stripe_transfer&&<div style={{background:'#F7F5F0',border:'1px solid #DDD8CE',borderRadius:'8px',padding:'12px 14px'}}>
                <div style={{fontSize:'10px',fontWeight:700,color:'#9097A8',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'4px'}}>Stripe Transfer</div>
                <div style={{fontSize:'12px',fontFamily:'monospace',color:GREEN}}>{order.stripe_transfer}</div>
              </div>}
            </div>
          )}

          {/* TIMELINE */}
          {section==='timeline'&&(
            <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
              <div style={{fontSize:'12px',color:'#9097A8',marginBottom:'4px'}}>Chronological event + message history.</div>
              {timeline===null&&<p style={{color:'#9097A8',fontSize:'13px',padding:'16px',textAlign:'center'}}>Loading…</p>}
              {timeline?.length===0&&<p style={{color:'#9097A8',fontSize:'13px',padding:'16px',textAlign:'center',background:'#F7F5F0',borderRadius:'8px'}}>No timeline events yet.</p>}
              {(timeline||[]).map((e,i)=>(
                <div key={i} style={{display:'flex',gap:'10px',paddingBottom:'8px',borderBottom:'1px solid #F2EFE9'}}>
                  <div style={{width:'6px',height:'6px',borderRadius:'50%',background:e.type==='message'?GOLD:e.to_status?STATUS_CFG[e.to_status]?.dot||NAVY:NAVY,marginTop:'5px',flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',justifyContent:'space-between',gap:'8px',marginBottom:'2px'}}>
                      <span style={{fontSize:'12px',fontWeight:600,color:NAVY}}>
                        {e.type==='message'?`${e.actor_role||'User'} message`:e.to_status?`→ ${e.to_status.replace(/_/g,' ')}`:'Note'}
                      </span>
                      <span style={{fontSize:'11px',color:'#9097A8',flexShrink:0}}>{ago(e.timestamp)}</span>
                    </div>
                    {e.content&&<div style={{fontSize:'12px',color:'#5C6070',lineHeight:1.5}}>{e.content}</div>}
                    <div style={{fontSize:'10px',color:'#9097A8',marginTop:'2px'}}>{e.actor_name||e.actor_role||'System'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ACTIONS */}
          {section==='actions'&&(
            <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
              <div style={{background:'#F7F5F0',border:'1px solid #DDD8CE',borderRadius:'8px',padding:'14px 16px'}}>
                <div style={{fontSize:'10px',fontWeight:700,color:'#9097A8',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'10px'}}>Status Actions</div>
                <div style={{display:'flex',flexDirection:'column',gap:'7px'}}>
                  {order.escrow_status==='held'&&order.status==='completed'&&<button onClick={()=>onAction('release',order)} style={{padding:'9px 14px',borderRadius:'6px',border:'1px solid rgba(26,107,69,.30)',background:'#EAF5EE',color:GREEN,cursor:'pointer',fontSize:'13px',fontWeight:600,textAlign:'left',fontFamily:sans}}>✓ Release Escrow — transfer funds to provider</button>}
                  {!['cancelled','refunded'].includes(order.status)&&<button onClick={()=>onAction('cancel',order)} style={{padding:'9px 14px',borderRadius:'6px',border:'1px solid rgba(139,26,26,.25)',background:'#FAEAEA',color:RED,cursor:'pointer',fontSize:'13px',fontWeight:600,textAlign:'left',fontFamily:sans}}>✗ Cancel Order</button>}
                  {!['cancelled','refunded'].includes(order.status)&&order.stripe_pi&&<button onClick={()=>onAction('refund',order)} style={{padding:'9px 14px',borderRadius:'6px',border:'1px solid rgba(139,26,26,.22)',background:'#FAEAEA',color:RED,cursor:'pointer',fontSize:'13px',fontWeight:600,textAlign:'left',fontFamily:sans}}>↩ Refund via Stripe</button>}
                  <button onClick={()=>onAction('assign',order)} style={{padding:'9px 14px',borderRadius:'6px',border:'1px solid rgba(27,45,79,.25)',background:'#EAF0F7',color:NAVY,cursor:'pointer',fontSize:'13px',fontWeight:600,textAlign:'left',fontFamily:sans}}>{order.provider_id?'⇄ Reassign Provider':'+ Assign Provider'}</button>
                  <button onClick={()=>onAction('deadline',order)} style={{padding:'9px 14px',borderRadius:'6px',border:'1px solid rgba(154,123,59,.30)',background:'#F5EDD6',color:GOLD,cursor:'pointer',fontSize:'13px',fontWeight:600,textAlign:'left',fontFamily:sans}}>📅 Extend Delivery Deadline</button>
                  <button onClick={()=>onAction('note',order)} style={{padding:'9px 14px',borderRadius:'6px',border:'1px solid #DDD8CE',background:'#F7F5F0',color:'#5C6070',cursor:'pointer',fontSize:'13px',fontWeight:600,textAlign:'left',fontFamily:sans}}>📝 Add Admin Note</button>
                  {!['cancelled','refunded'].includes(order.status)&&order.payout_status!=='transferred'&&<button onClick={()=>onAction('payout',order)} style={{padding:'9px 14px',borderRadius:'6px',border:'1px solid rgba(26,107,69,.25)',background:'#EAF5EE',color:GREEN,cursor:'pointer',fontSize:'13px',fontWeight:600,textAlign:'left',fontFamily:sans}}>💸 Trigger Manual Payout</button>}
                </div>
              </div>
              <button onClick={()=>onAction('delete',order)} style={{padding:'9px 14px',borderRadius:'6px',border:'1px solid rgba(139,26,26,.20)',background:'#fff',color:RED,cursor:'pointer',fontSize:'13px',fontWeight:600,textAlign:'left',fontFamily:sans}}>🗑 Delete Order (permanent)</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Stats tab ────────────────────────────────────────────────────────────────
function StatsTab() {
  const [stats,setStats]=React.useState(null)
  const [loading,setLoading]=React.useState(true)

  React.useEffect(()=>{
    fetch('/api/admin/orders/stats',{credentials:'same-origin'}).then(r=>r.json()).then(j=>setStats(j?.data??j)).catch(()=>{}).finally(()=>setLoading(false))
  },[])

  if(loading) return <div style={{padding:'40px',textAlign:'center',color:'#9097A8',fontSize:'13px'}}>Loading analytics…</div>
  if(!stats)  return <div style={{padding:'40px',textAlign:'center',color:RED,fontSize:'13px'}}>Could not load order stats.</div>

  const monthlyBarData=(stats.monthly_volume||[]).slice(-12).map(m=>({label:new Date(m.month+'-01').toLocaleDateString('en-GB',{month:'short'}),value:m.count}))
  const revenueBarData=(stats.monthly_volume||[]).slice(-12).map(m=>({label:new Date(m.month+'-01').toLocaleDateString('en-GB',{month:'short'}),value:Number(m.gross)||0}))

  return(
    <div style={{display:'flex',flexDirection:'column',gap:'20px'}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:'12px'}}>
        <Kpi label="Total Orders"       value={fmtN(Object.values(stats.by_status||{}).reduce((s,v)=>s+v,0))} icon="📦" accent={NAVY}/>
        <Kpi label="Completion Rate"    value={fmtPct(stats.completion_rate)}   icon="✅" accent={GREEN}/>
        <Kpi label="Cancellation Rate"  value={fmtPct(stats.cancellation_rate)} icon="✗"  accent={RED}/>
        <Kpi label="Avg Order Value"    value={$(stats.avg_order_value)}        icon="💰" accent={GOLD}/>
        <Kpi label="Avg Days to Complete" value={`${Number(stats.avg_days_to_complete||0).toFixed(1)}d`} icon="🕐" accent={PURPLE}/>
        <Kpi label="Revision Rate"      value={fmtPct(stats.revision_rate)}     icon="🔄" accent={AMBER}/>
        <Kpi label="Late Deliveries"    value={fmtN(stats.late_delivery_count)} icon="⚠" accent={stats.late_delivery_count>0?RED:'#9097A8'}/>
        <Kpi label="Total Refunds"      value={$(stats.refund_stats?.total)}     icon="↩" accent={PURPLE}/>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px'}}>
        <div style={{background:'#fff',border:'1px solid #DDD8CE',borderRadius:'8px',padding:'18px'}}>
          <div style={{fontFamily:serif,fontWeight:600,fontSize:'16px',color:NAVY,marginBottom:'12px'}}>Monthly Order Volume</div>
          <BarChart data={monthlyBarData} height={90} color={NAVY}/>
        </div>
        <div style={{background:'#fff',border:'1px solid #DDD8CE',borderRadius:'8px',padding:'18px'}}>
          <div style={{fontFamily:serif,fontWeight:600,fontSize:'16px',color:NAVY,marginBottom:'12px'}}>Monthly Revenue</div>
          <BarChart data={revenueBarData} height={90} color={GREEN}/>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px'}}>
        <div style={{background:'#fff',border:'1px solid #DDD8CE',borderRadius:'8px',padding:'18px'}}>
          <div style={{fontFamily:serif,fontWeight:600,fontSize:'16px',color:NAVY,marginBottom:'12px'}}>By Status</div>
          <div style={{display:'flex',flexDirection:'column',gap:'2px'}}>
            {Object.entries(stats.by_status||{}).map(([s,n])=>{
              const cfg=STATUS_CFG[s]||STATUS_CFG.pending
              const total=Math.max(1,Object.values(stats.by_status||{}).reduce((a,v)=>a+v,0))
              return <div key={s} style={{display:'flex',alignItems:'center',gap:'8px',padding:'5px 0',borderBottom:'1px solid #F2EFE9'}}>
                <span style={{width:'7px',height:'7px',borderRadius:'50%',background:cfg.dot,flexShrink:0}}/>
                <span style={{fontSize:'12px',color:'#5C6070',flex:1,textTransform:'capitalize'}}>{s.replace(/_/g,' ')}</span>
                <div style={{width:'60px',height:'4px',background:'#F2EFE9',borderRadius:'2px',overflow:'hidden'}}><div style={{height:'100%',width:`${(n/total)*100}%`,background:cfg.dot,borderRadius:'2px'}}/></div>
                <span style={{fontSize:'12px',fontWeight:700,color:NAVY,minWidth:'24px',textAlign:'right'}}>{n}</span>
              </div>
            })}
          </div>
        </div>
        <div style={{background:'#fff',border:'1px solid #DDD8CE',borderRadius:'8px',padding:'18px'}}>
          <div style={{fontFamily:serif,fontWeight:600,fontSize:'16px',color:NAVY,marginBottom:'12px'}}>Top Services by Orders</div>
          <div style={{display:'flex',flexDirection:'column',gap:'2px'}}>
            {(stats.top_services||[]).slice(0,8).map((s,i)=>(
              <div key={i} style={{display:'flex',alignItems:'center',gap:'8px',padding:'5px 0',borderBottom:'1px solid #F2EFE9'}}>
                <span style={{fontSize:'11px',color:'#9097A8',width:'16px',textAlign:'right'}}>{i+1}</span>
                <span style={{fontSize:'12px',color:'#5C6070',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={s.title}>{s.title}</span>
                <span style={{fontSize:'12px',fontWeight:700,color:NAVY}}>{fmtN(s.count)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <DT
        cols={[{k:'type',l:'Provider Type'},{k:'count',l:'Orders',r:true,bold:true},{k:'gross',l:'Gross Revenue',r:true}]}
        rows={Object.entries(stats.by_provider_type||{}).map(([type,d])=>({type:type==='attorney'?'⚖️ Attorney':'👤 Consultant',count:fmtN(d.count),gross:$(d.gross)}))}
        empty="No provider data"/>
    </div>
  )
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function AdminOrders({ consultants=[], formatPrimary, refreshAdminData }) {
  const [tab,setTab]         = React.useState('all')
  const [orders,setOrders]   = React.useState([])
  const [loading,setLoading] = React.useState(true)
  const [error,setError]     = React.useState('')
  const [notice,setNotice]   = React.useState({type:'',msg:''})
  const [summary,setSummary] = React.useState({})
  const [selectedOrder,setSelectedOrder]   = React.useState(null)
  const [assignTarget,setAssignTarget]     = React.useState(null)
  const [deadlineTarget,setDeadlineTarget] = React.useState(null)
  const [noteTarget,setNoteTarget]         = React.useState(null)
  const [selectedRows,setSelectedRows]     = React.useState(new Set())
  const [sortCol,setSortCol]   = React.useState('created_at')
  const [sortDir,setSortDir]   = React.useState('desc')
  const [searchQ,setSearchQ]   = React.useState('')
  const [statusFilter,setStatusFilter]   = React.useState('all')
  const [escrowFilter,setEscrowFilter]   = React.useState('all')
  const [payoutFilter,setPayoutFilter]   = React.useState('all')
  const [localPage,setLocalPage] = React.useState(1)
  const PER_PAGE = 25

  const flash=(type,msg)=>{setNotice({type,msg});setTimeout(()=>setNotice({type:'',msg:''}),5000)}

  const [serverTotal,setServerTotal] = React.useState(0)
  const [debouncedQ,setDebouncedQ]   = React.useState('')

  // Debounce search input — avoids per-keystroke API calls
  React.useEffect(()=>{
    const t=setTimeout(()=>{setDebouncedQ(searchQ);setLocalPage(1)},300)
    return()=>clearTimeout(t)
  },[searchQ])

  // Server-side paginated fetch — every filter/sort/page change triggers one
  // targeted query; we never load the full table into memory.
  const load=React.useCallback(async()=>{
    setLoading(true);setError('')
    try{
      const params=new URLSearchParams()
      if(tab!=='all'&&tab!=='stats')   params.set('tab',tab)
      if(statusFilter!=='all')         params.set('status',statusFilter)
      if(escrowFilter!=='all')         params.set('escrow',escrowFilter)
      if(payoutFilter!=='all')         params.set('payout',payoutFilter)
      if(debouncedQ.trim())            params.set('q',debouncedQ.trim())
      params.set('page',String(localPage))
      params.set('page_size',String(PER_PAGE))
      params.set('sort',sortCol)
      params.set('dir',sortDir)
      const res=await fetch(`/api/admin/orders?${params}`,{credentials:'same-origin'})
      const data=await res.json().catch(()=>({}))
      if(!res.ok) throw new Error(data?.error?.message||data?.error||'Failed')
      const d=data?.data??data
      setOrders(d?.orders??[])
      setSummary(d?.summary??{})
      setServerTotal(d?.total??0)
    }catch(e){setError(e.message)}
    finally{setLoading(false)}
  },[tab,statusFilter,escrowFilter,payoutFilter,debouncedQ,localPage,sortCol,sortDir])

  React.useEffect(()=>{load()},[load])

  const adminPatch=async(orderId,payload,successMsg)=>{
    try{
      const res=await fetch(`/api/admin/orders/${orderId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(payload)})
      const d=await res.json().catch(()=>({}))
      if(!res.ok) throw new Error(d?.error?.message||d?.error||'Failed')
      flash('ok',successMsg||'Order updated.')
      await load()
      if(refreshAdminData) refreshAdminData()
    }catch(e){flash('err',e.message)}
  }

  const handleAction=async(action,order)=>{
    if(action==='assign')   {setAssignTarget(order);return}
    if(action==='deadline') {setDeadlineTarget(order);return}
    if(action==='note')     {setNoteTarget(order);return}
    if(action==='release')  {await adminPatch(order.id,{escrow_status:'released',force:true},'Escrow released.');return}
    if(action==='cancel')   {if(!confirm('Cancel this order?')) return;await adminPatch(order.id,{status:'cancelled',note:'Cancelled by admin'},'Order cancelled.');setSelectedOrder(null);return}
    if(action==='refund')   {if(!confirm('Issue full Stripe refund?')) return;await adminPatch(order.id,{refund:true,status:'refunded'},'Refund initiated.');setSelectedOrder(null);return}
    if(action==='payout'){
      try{
        const res=await fetch('/api/admin/payouts/release',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({order_id:order.id,reason:'Admin manual trigger'})})
        const d=await res.json().catch(()=>({}))
        if(!res.ok) throw new Error(d?.error?.message||'Payout failed')
        const r=d?.data??d
        flash('ok',r.transferred?`Payout sent — ${r.transfer_id}`:r.skipped?`Skipped: ${r.reason}`:'Payout processed.')
        await load()
      }catch(e){flash('err',e.message)}
      return
    }
    if(action==='delete'){if(!confirm('Permanently delete this order? Cannot be undone.')) return;const res=await fetch(`/api/admin/orders/${order.id}`,{method:'DELETE',credentials:'same-origin'});if(!res.ok){flash('err','Delete failed')}else{flash('ok','Order deleted.');setSelectedOrder(null);await load();if(refreshAdminData)refreshAdminData()}}
  }

  const handleAssign=async(orderId,provider)=>{
    await adminPatch(orderId,{consultant_id:provider.id,status:'active'},`Assigned to ${provider.name}.`)
    setAssignTarget(null)
    setSelectedOrder(null)
  }

  const handleDeadline=async(orderId,date,reason)=>{
    try{
      const res=await fetch(`/api/admin/orders/${orderId}/deadline`,{method:'PATCH',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({deadline:date+'T23:59:59Z',reason})})
      if(!res.ok){const d=await res.json().catch(()=>({}));throw new Error(d?.error?.message||'Failed')}
      flash('ok','Deadline extended.')
      setDeadlineTarget(null)
      await load()
    }catch(e){flash('err',e.message)}
  }

  const handleNote=async(orderId,note)=>{
    try{
      const res=await fetch(`/api/admin/orders/${orderId}/note`,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({note})})
      if(!res.ok){const d=await res.json().catch(()=>({}));throw new Error(d?.error?.message||'Failed')}
      flash('ok','Note added to timeline.')
      setNoteTarget(null)
    }catch(e){flash('err',e.message)}
  }

  // Server returns the page already filtered, sorted, and paginated.
  // Keep these locals as pass-throughs so the rest of the JSX needs no rewrite.
  const afterFilters = orders
  const pagedOrders  = orders
  const totalPages   = Math.max(1, Math.ceil(serverTotal / PER_PAGE))

  const handleSort=col=>{if(sortCol===col)setSortDir(d=>d==='asc'?'desc':'asc');else{setSortCol(col);setSortDir('asc')};setLocalPage(1)}
  const SortArrow=({col})=>sortCol!==col?<span style={{opacity:.25,marginLeft:'3px',fontSize:'10px'}}>⇅</span>:<span style={{color:'#C4A45A',marginLeft:'3px',fontSize:'10px'}}>{sortDir==='asc'?'▲':'▼'}</span>
  const thStyle=col=>({padding:'10px 12px',textAlign:'left',fontSize:'11px',fontWeight:700,color:sortCol===col?'#C4A45A':'rgba(255,255,255,.68)',background:NAVY,whiteSpace:'nowrap',cursor:'pointer',letterSpacing:'.06em',textTransform:'uppercase',borderBottom:'2px solid rgba(255,255,255,.08)',userSelect:'none',transition:'color .12s'})
  const toggleAll=()=>setSelectedRows(prev=>prev.size===pagedOrders.length?new Set():new Set(pagedOrders.map(o=>o.id)))

  return(
    <div style={{padding:'28px',display:'flex',flexDirection:'column',gap:'22px',fontFamily:sans,background:'#F7F5F0',minHeight:'100vh'}}>

      {/* Header */}
      <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',gap:'12px',flexWrap:'wrap'}}>
        <div>
          <div style={{fontSize:'11px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.14em',color:'#9097A8',marginBottom:'4px'}}>Engagements</div>
          <h2 style={{fontFamily:serif,fontWeight:600,fontSize:'32px',color:NAVY,margin:0,letterSpacing:'-.015em',lineHeight:1.1}}>Order Management</h2>
          <p style={{color:'#9097A8',fontSize:'13px',margin:'5px 0 0'}}>Full lifecycle control — state management, escrow, payouts, deadlines, and timeline.</p>
        </div>
        <button onClick={load} style={{padding:'8px 16px',borderRadius:'6px',border:'1px solid #DDD8CE',background:'#fff',color:NAVY,cursor:'pointer',fontSize:'13px',fontWeight:600,fontFamily:sans}}>↻ Refresh</button>
      </div>

      {/* Notice */}
      {notice.msg&&<div style={{padding:'10px 16px',borderRadius:'7px',fontSize:'13px',fontWeight:600,background:notice.type==='ok'?'#EAF5EE':'#FAEAEA',color:notice.type==='ok'?GREEN:RED,border:`1px solid ${notice.type==='ok'?'rgba(26,107,69,.20)':'rgba(139,26,26,.20)'}`,display:'flex',alignItems:'center',gap:'8px'}}><span>{notice.type==='ok'?'✓':'!'}</span>{notice.msg}</div>}

      {/* Summary strip */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:'10px'}}>
        {[
          {l:'Total',n:orders.length,c:NAVY,tab:'all'},
          {l:'Active',n:summary.in_progress||0,c:'#0891B2',tab:'active'},
          {l:'Needs Action',n:(summary.late_count||0)+(summary.revision_requested||0),c:AMBER,tab:'attention'},
          {l:'Escrow Held',n:summary.escrow_held_count||0,c:GOLD,tab:'financial'},
          {l:'Completed',n:summary.completed||0,c:GREEN,tab:'all'},
          {l:'Cancelled',n:summary.cancelled||0,c:RED,tab:'all'},
        ].map(s=>(
          <button key={s.l} onClick={()=>{setTab(s.tab);if(s.tab==='all'&&s.l!=='Total'){setStatusFilter(s.l.toLowerCase())}else{setStatusFilter('all')}setLocalPage(1)}} style={{padding:'12px 14px',borderRadius:'8px',border:`1px solid ${tab===s.tab?s.c:'#DDD8CE'}`,background:tab===s.tab?`${s.c}12`:'#fff',cursor:'pointer',textAlign:'left',fontFamily:sans}}>
            <div style={{fontSize:'11px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'#9097A8',marginBottom:'4px'}}>{s.l}</div>
            <div style={{fontWeight:800,fontSize:'20px',color:s.c,fontVariantNumeric:'tabular-nums'}}>{loading?'—':s.n}</div>
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div style={{display:'flex',borderBottom:'1px solid #DDD8CE',gap:0,overflowX:'auto',background:'#fff',borderRadius:'8px 8px 0 0',boxShadow:'0 1px 3px rgba(27,45,79,.05)'}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>{setTab(t.id);setStatusFilter('all');setLocalPage(1)}} style={{display:'inline-flex',alignItems:'center',gap:'5px',padding:'12px 18px',fontSize:'13px',fontWeight:tab===t.id?600:400,color:tab===t.id?NAVY:'#9097A8',background:'none',border:'none',borderBottom:tab===t.id?`2px solid ${NAVY}`:'2px solid transparent',cursor:'pointer',whiteSpace:'nowrap',fontFamily:sans}}>
            <span style={{opacity:tab===t.id?1:.6}}>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* Stats tab */}
      {tab==='stats'&&<StatsTab/>}

      {/* All other tabs — shared table */}
      {tab!=='stats'&&(
        <>
          {/* Toolbar */}
          <div style={{display:'flex',gap:'10px',flexWrap:'wrap',alignItems:'center'}}>
            <input value={searchQ} onChange={e=>{setSearchQ(e.target.value);setLocalPage(1)}} placeholder="Search ID, order#, client, provider, service…" style={{flex:'1 1 220px',maxWidth:'380px',padding:'8px 12px',borderRadius:'7px',border:'1px solid #DDD8CE',fontSize:'13px',fontFamily:sans,outline:'none'}}/>
            <select value={statusFilter} onChange={e=>{setStatusFilter(e.target.value);setLocalPage(1)}} style={{padding:'8px 12px',borderRadius:'7px',border:'1px solid #DDD8CE',fontSize:'13px',fontFamily:sans,background:'#fff',cursor:'pointer'}}>
              <option value="all">All statuses</option>
              {Object.keys(STATUS_CFG).map(s=><option key={s} value={s}>{STATUS_CFG[s].label}</option>)}
            </select>
            <select value={escrowFilter} onChange={e=>{setEscrowFilter(e.target.value);setLocalPage(1)}} style={{padding:'8px 12px',borderRadius:'7px',border:'1px solid #DDD8CE',fontSize:'13px',fontFamily:sans,background:'#fff',cursor:'pointer'}}>
              <option value="all">All escrow</option>
              <option value="held">Held</option>
              <option value="released">Released</option>
              <option value="refunded">Refunded</option>
            </select>
            <select value={payoutFilter} onChange={e=>{setPayoutFilter(e.target.value);setLocalPage(1)}} style={{padding:'8px 12px',borderRadius:'7px',border:'1px solid #DDD8CE',fontSize:'13px',fontFamily:sans,background:'#fff',cursor:'pointer'}}>
              <option value="all">All payouts</option>
              <option value="pending">Pending</option>
              <option value="transferred">Paid</option>
              <option value="failed">Failed</option>
            </select>
            <span style={{marginLeft:'auto',fontSize:'12px',color:'#9097A8'}}>{serverTotal.toLocaleString()} orders{selectedRows.size>0&&<span style={{marginLeft:'8px',fontWeight:700,color:NAVY}}>· {selectedRows.size} selected</span>}</span>
          </div>

          {/* Bulk bar */}
          {selectedRows.size>0&&(
            <div style={{background:NAVY,borderRadius:'8px',padding:'12px 16px',display:'flex',alignItems:'center',gap:'12px',flexWrap:'wrap'}}>
              <span style={{fontSize:'13px',fontWeight:600,color:'#fff'}}>{selectedRows.size} selected</span>
              <button onClick={async()=>{for(const id of selectedRows)await adminPatch(id,{status:'cancelled'},'');flash('ok',`${selectedRows.size} orders cancelled`);setSelectedRows(new Set())}} style={{padding:'6px 14px',borderRadius:'5px',border:'1px solid rgba(255,255,255,.20)',background:'rgba(255,255,255,.08)',color:'#fff',cursor:'pointer',fontSize:'12px',fontWeight:600,fontFamily:sans}}>✗ Bulk Cancel</button>
              <button onClick={async()=>{for(const id of selectedRows)await adminPatch(id,{escrow_status:'released',force:true},'');flash('ok',`Escrow released for ${selectedRows.size} orders`);setSelectedRows(new Set())}} style={{padding:'6px 14px',borderRadius:'5px',border:'1px solid rgba(255,255,255,.20)',background:'rgba(255,255,255,.08)',color:'#fff',cursor:'pointer',fontSize:'12px',fontWeight:600,fontFamily:sans}}>✓ Bulk Release Escrow</button>
              <button onClick={()=>setSelectedRows(new Set())} style={{padding:'6px 12px',borderRadius:'5px',border:'1px solid rgba(255,255,255,.15)',background:'transparent',color:'rgba(255,255,255,.60)',cursor:'pointer',fontSize:'12px',fontFamily:sans}}>Clear</button>
            </div>
          )}

          {/* Table */}
          {error?<div style={{background:'#FAEAEA',border:'1px solid rgba(139,26,26,.20)',borderRadius:'8px',padding:'20px',fontSize:'14px',color:RED}}>{error} — <button onClick={load} style={{background:'none',border:'none',color:RED,cursor:'pointer',textDecoration:'underline',fontSize:'13px'}}>Retry</button></div>:(
            <div style={{background:'#fff',border:'1px solid #DDD8CE',borderRadius:'8px',overflow:'hidden',boxShadow:'0 1px 4px rgba(27,45,79,.06)'}}>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',minWidth:'1000px'}}>
                  <thead>
                    <tr>
                      <th style={{...thStyle(''),width:'40px',cursor:'default',padding:'10px 10px 10px 16px'}}><input type="checkbox" checked={pagedOrders.length>0&&selectedRows.size===pagedOrders.length} onChange={toggleAll} style={{width:'14px',height:'14px',cursor:'pointer',accentColor:'#C4A45A'}}/></th>
                      {[{col:'order_number',l:'Order#'},{col:'service_title',l:'Service'},{col:'client_name',l:'Client'},{col:'provider_name',l:'Provider'},{col:'status',l:'Status'},{col:'escrow_status',l:'Escrow'},{col:'gross',l:'Amount',r:true},{col:'payout',l:'Provider Share',r:true},{col:'deadline',l:'Deadline'},{col:'created_at',l:'Created'}].map(({col,l,r})=>(
                        <th key={col} style={{...thStyle(col),textAlign:r?'right':'left'}} onClick={()=>handleSort(col)}>{l}<SortArrow col={col}/></th>
                      ))}
                      <th style={{...thStyle(''),cursor:'default'}}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading?[1,2,3,4,5].map(i=><tr key={i} style={{background:i%2===0?'#fff':'#FAFAF8'}}>{Array.from({length:12}).map((_,j)=><td key={j} style={{padding:'13px'}}><div style={{height:'13px',background:'#F2EFE9',borderRadius:'3px',width:j===0?'80%':'55%'}}/></td>)}</tr>)
                    :pagedOrders.length===0?<tr><td colSpan={12} style={{padding:'48px',textAlign:'center',color:'#9097A8',fontSize:'14px'}}>No orders match the current filters.</td></tr>
                    :pagedOrders.map((o,i)=>{
                      const isSelected=selectedRows.has(o.id)
                      return(
                        <tr key={o.id} style={{background:isSelected?'rgba(196,164,90,.07)':i%2===0?'#fff':'#FAFAF8',borderBottom:'1px solid #F2EFE9',transition:'background 80ms'}}>
                          <td style={{padding:'11px 10px 11px 16px'}}><input type="checkbox" checked={isSelected} onChange={()=>setSelectedRows(prev=>{const n=new Set(prev);n.has(o.id)?n.delete(o.id):n.add(o.id);return n})} style={{width:'14px',height:'14px',cursor:'pointer',accentColor:'#C4A45A'}}/></td>
                          <td style={{padding:'11px 12px',fontSize:'12px',fontFamily:'monospace',color:NAVY,fontWeight:600}}>{o.order_number||o.id?.slice(0,8)}</td>
                          <td style={{padding:'11px 12px'}}>
                            <div style={{fontWeight:600,fontSize:'13px',color:NAVY,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'180px'}} title={o.service_title}>{o.service_title||'—'}</div>
                          </td>
                          <td style={{padding:'11px 12px',fontSize:'13px',color:'#5C6070',whiteSpace:'nowrap'}}>{o.client_name||'—'}</td>
                          <td style={{padding:'11px 12px'}}>
                            {o.provider_id?<span style={{fontSize:'13px',color:NAVY}}>{o.provider_name}</span>:<span style={{fontSize:'12px',color:AMBER,fontStyle:'italic'}}>Unassigned</span>}
                          </td>
                          <td style={{padding:'11px 12px'}}>
                            <div style={{display:'flex',alignItems:'center',gap:'5px'}}>
                              <StatusPill status={o.status}/>
                              {o.is_late&&<LateBadge isLate/>}
                            </div>
                          </td>
                          <td style={{padding:'11px 12px'}}><EscrowPill status={o.escrow_status||'held'}/></td>
                          <td style={{padding:'11px 12px',textAlign:'right',fontWeight:700,fontSize:'13px',color:NAVY,fontVariantNumeric:'tabular-nums'}}>{$(o.gross)}</td>
                          <td style={{padding:'11px 12px',textAlign:'right',fontSize:'13px',color:GREEN,fontWeight:600,fontVariantNumeric:'tabular-nums'}}>{$(o.payout)}</td>
                          <td style={{padding:'11px 12px',fontSize:'12px',color:o.is_late?RED:'#9097A8',fontWeight:o.is_late?700:400,whiteSpace:'nowrap'}}>{o.deadline?ago(o.deadline):'—'}</td>
                          <td style={{padding:'11px 12px',fontSize:'12px',color:'#9097A8',whiteSpace:'nowrap'}}>{ago(o.created_at)}</td>
                          <td style={{padding:'11px 12px',whiteSpace:'nowrap'}}>
                            <div style={{display:'flex',gap:'5px'}}>
                              <button onClick={()=>setSelectedOrder(o)} style={{padding:'5px 10px',borderRadius:'5px',border:'1px solid #DDD8CE',background:'#F7F5F0',color:NAVY,cursor:'pointer',fontSize:'12px',fontWeight:600,fontFamily:sans}}>View</button>
                              {o.escrow_status==='held'&&o.status==='completed'&&<button onClick={()=>handleAction('release',o)} style={{padding:'5px 10px',borderRadius:'5px',border:'1px solid rgba(26,107,69,.30)',background:'#EAF5EE',color:GREEN,cursor:'pointer',fontSize:'12px',fontWeight:600,fontFamily:sans}}>Release</button>}
                              {!o.provider_id&&!['cancelled','refunded','released'].includes(o.status)&&<button onClick={()=>handleAction('assign',o)} style={{padding:'5px 10px',borderRadius:'5px',border:'1px solid rgba(27,45,79,.25)',background:'#EAF0F7',color:NAVY,cursor:'pointer',fontSize:'12px',fontWeight:600,fontFamily:sans}}>Assign</button>}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {pagedOrders.length>0&&!loading&&(
                    <tfoot><tr style={{background:'#F8F7F4',borderTop:'2px solid #DDD8CE'}}>
                      <td colSpan={7} style={{padding:'9px 12px',fontSize:'12px',color:'#9097A8',fontWeight:600}}>{(localPage-1)*PER_PAGE+1}–{Math.min(localPage*PER_PAGE,serverTotal)} of {serverTotal.toLocaleString()}</td>
                      <td style={{padding:'9px 12px',textAlign:'right',fontSize:'12px',fontWeight:700,color:NAVY}} title="Sum across this page only">{$(orders.reduce((s,o)=>s+o.gross,0))}</td>
                      <td style={{padding:'9px 12px',textAlign:'right',fontSize:'12px',fontWeight:700,color:GREEN}} title="Sum across this page only">{$(orders.reduce((s,o)=>s+o.payout,0))}</td>
                      <td colSpan={3}/>
                    </tr></tfoot>
                  )}
                </table>
              </div>
              {/* Pagination */}
              {totalPages>1&&(
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',borderTop:'1px solid #F2EFE9',background:'#FAFAF8'}}>
                  <button onClick={()=>setLocalPage(p=>Math.max(1,p-1))} disabled={localPage===1} style={{padding:'6px 14px',borderRadius:'6px',border:'1px solid #DDD8CE',background:localPage===1?'#F7F5F0':'#fff',color:localPage===1?'#9097A8':NAVY,cursor:localPage===1?'not-allowed':'pointer',fontSize:'13px',fontWeight:600,fontFamily:sans}}>← Prev</button>
                  <div style={{display:'flex',gap:'4px'}}>
                    {Array.from({length:totalPages},(_, i)=>i+1).filter(p=>p===1||p===totalPages||Math.abs(p-localPage)<=1).reduce((acc,p,idx,arr)=>{if(idx>0&&p-arr[idx-1]>1)acc.push('…');acc.push(p);return acc},[]).map((p,i)=>p==='…'?<span key={`e${i}`} style={{padding:'6px 4px',color:'#9097A8',fontSize:'13px'}}>…</span>:<button key={p} onClick={()=>setLocalPage(p)} style={{width:'32px',height:'32px',borderRadius:'6px',border:`1px solid ${p===localPage?NAVY:'#DDD8CE'}`,background:p===localPage?NAVY:'#fff',color:p===localPage?'#fff':NAVY,cursor:'pointer',fontSize:'13px',fontWeight:p===localPage?700:400,fontFamily:sans}}>{p}</button>)}
                  </div>
                  <button onClick={()=>setLocalPage(p=>Math.min(totalPages,p+1))} disabled={localPage===totalPages} style={{padding:'6px 14px',borderRadius:'6px',border:'1px solid #DDD8CE',background:localPage===totalPages?'#F7F5F0':'#fff',color:localPage===totalPages?'#9097A8':NAVY,cursor:localPage===totalPages?'not-allowed':'pointer',fontSize:'13px',fontWeight:600,fontFamily:sans}}>Next →</button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Drawers + modals */}
      {selectedOrder&&<OrderDrawer order={selectedOrder} onClose={()=>setSelectedOrder(null)} onAction={handleAction}/>}
      {assignTarget&&<AssignModal order={assignTarget} consultants={consultants} onAssign={handleAssign} onClose={()=>setAssignTarget(null)}/>}
      {deadlineTarget&&<DeadlineModal order={deadlineTarget} onConfirm={handleDeadline} onClose={()=>setDeadlineTarget(null)}/>}
      {noteTarget&&<NoteModal order={noteTarget} onConfirm={handleNote} onClose={()=>setNoteTarget(null)}/>}
    </div>
  )
}
