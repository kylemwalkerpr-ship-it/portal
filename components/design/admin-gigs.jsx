'use client'
import React from 'react'
import { C, Card, Btn, Avatar } from './shared'

// ─── Design tokens ────────────────────────────────────────────────────────────
const serif = "'Cormorant Garamond', 'Garamond', Georgia, serif"
const sans  = C.sans
const NAVY = '#0F172A', GOLD = '#9A7B3B', GREEN = '#1A6B45'
const AMBER = '#8B5E0A', RED = '#8B1A1A', PURPLE = '#3D2B6B'

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CFG = {
  active:         { bg:'#EAF5EE', text:GREEN,  border:'rgba(26,107,69,.22)',  dot:'#22C55E', label:'Active'         },
  draft:          { bg:'#F5EDD6', text:'#7A6030', border:'rgba(154,123,59,.28)', dot:'#EAB308', label:'Draft'          },
  pending_review: { bg:'#EEF4FE', text:'#1E40AF', border:'rgba(30,64,175,.22)', dot:'#3B82F6', label:'Pending Review'  },
  suspended:      { bg:'#FEF5E4', text:AMBER,  border:'rgba(139,94,10,.25)',  dot:'#F59E0B', label:'Suspended'       },
  denied:         { bg:'#FAEAEA', text:RED,    border:'rgba(139,26,26,.22)',  dot:'#EF4444', label:'Denied'          },
  appeal_pending: { bg:'#F5F3FF', text:PURPLE, border:'rgba(61,43,107,.22)', dot:'#8B5CF6', label:'Appeal Pending'   },
  archived:       { bg:'#EDEAF7', text:PURPLE, border:'rgba(61,43,107,.22)', dot:'#8B5CF6', label:'Archived'         },
  deleted:        { bg:'#F2EFE9', text:'#9097A8', border:'rgba(0,0,0,.10)',  dot:'#9097A8', label:'Deleted'          },
  paused:         { bg:'#FEF5E4', text:AMBER,  border:'rgba(139,94,10,.25)',  dot:'#F59E0B', label:'Paused'          },
}

const PROVIDER_COLORS = { attorney:'#0F172A', consultant:'#7C3AED' }

const DENIAL_CATEGORIES = [
  { value:'quality',       label:'Quality — Below marketplace standard'    },
  { value:'misleading',    label:'Misleading — False or exaggerated claims' },
  { value:'spam',          label:'Spam — Duplicate or irrelevant content'   },
  { value:'ip_violation',  label:'IP Violation — Copyright/trademark issue' },
  { value:'harmful',       label:'Harmful — Violates community guidelines'  },
  { value:'pricing_abuse', label:'Pricing — Outside permitted range'        },
  { value:'duplicate',     label:'Duplicate — Near-identical to existing gig'},
  { value:'other',         label:'Other — See reason field'                 },
]

const SELLER_LEVEL_CFG = {
  new_seller:  { label:'New',       color:'#9097A8', bg:'#F2EFE9' },
  level_1:     { label:'Level 1',   color:GOLD,      bg:'#F5EDD6' },
  level_2:     { label:'Level 2',   color:GOLD,      bg:'#F5EDD6' },
  top_rated:   { label:'Top Rated', color:NAVY,      bg:'#EAF0F7' },
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
const TABS = [
  { id:'modqueue',  label:'Mod Queue',      icon:'🔍' },
  { id:'all',       label:'All Services',   icon:'📋' },
  { id:'metrics',   label:'Platform Stats', icon:'📊' },
  { id:'levels',    label:'Seller Levels',  icon:'⭐' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt  = v => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:0}).format(Number(v)||0)
const fmtN = (v,c=false) => { const n=Number(v)||0; if(c&&n>=1e3) return `${(n/1e3).toFixed(1)}k`; return n.toLocaleString() }
const ago  = s => { if(!s) return '—'; const d=Math.floor((Date.now()-new Date(s))/86400000); return d===0?'Today':d===1?'Yesterday':d<30?`${d}d ago`:`${new Date(s).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}` }

const StatusPill = ({status}) => { const cfg=STATUS_CFG[status]||STATUS_CFG.draft; return <span style={{display:'inline-flex',alignItems:'center',gap:'4px',padding:'3px 8px 3px 6px',borderRadius:'4px',fontSize:'11px',fontWeight:700,letterSpacing:'.04em',textTransform:'uppercase',background:cfg.bg,color:cfg.text,border:`1px solid ${cfg.border}`}}><span style={{width:'5px',height:'5px',borderRadius:'50%',background:cfg.dot,flexShrink:0,display:'inline-block'}}/>{cfg.label}</span> }

const LevelBadge = ({level}) => { if(!level) return null; const cfg=SELLER_LEVEL_CFG[level]||SELLER_LEVEL_CFG.new_seller; return <span style={{display:'inline-block',padding:'2px 7px',borderRadius:'4px',fontSize:'10px',fontWeight:700,letterSpacing:'.05em',textTransform:'uppercase',background:cfg.bg,color:cfg.color}}>{cfg.label}</span> }

const FlagBadge = ({score}) => { if(!score||score<20) return null; const c=score>=70?RED:score>=40?AMBER:GOLD; return <span style={{display:'inline-flex',alignItems:'center',gap:'3px',padding:'2px 6px',borderRadius:'3px',fontSize:'10px',fontWeight:700,background:`${c}15`,color:c,border:`1px solid ${c}25`}}>⚑ {score}%</span> }

const ScoreBar = ({score,compact=false}) => { const pct=Math.min(100,Math.max(0,Number(score)||0)); const color=pct>=75?GREEN:pct>=50?AMBER:RED; if(compact) return <div style={{display:'flex',alignItems:'center',gap:'5px'}}><div style={{width:'40px',height:'4px',borderRadius:'2px',background:'#F2EFE9',overflow:'hidden'}}><div style={{height:'100%',width:`${pct}%`,background:color,borderRadius:'2px'}}/></div><span style={{fontSize:'11px',color:'#9097A8'}}>{pct}%</span></div>; return null }

// ─── Suspension modal ─────────────────────────────────────────────────────────
function SuspendModal({gig,onConfirm,onClose}) {
  const [reason,setReason]=React.useState('')
  const [category,setCategory]=React.useState('quality')
  const [busy,setBusy]=React.useState(false)
  if(!gig) return null
  return(
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.60)',zIndex:320,display:'flex',alignItems:'center',justifyContent:'center',padding:'24px'}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:'10px',padding:'28px',width:'100%',maxWidth:'480px',boxShadow:'0 20px 60px rgba(0,0,0,.22)',fontFamily:sans}}>
        <h3 style={{fontFamily:serif,fontWeight:600,fontSize:'20px',color:NAVY,margin:'0 0 6px'}}>Suspend Service</h3>
        <p style={{fontSize:'13px',color:AMBER,background:'#FEF5E4',border:'1px solid rgba(139,94,10,.20)',borderRadius:'6px',padding:'10px 14px',margin:'0 0 16px',lineHeight:1.6}}><strong>"{gig.title}"</strong> — will be hidden from marketplace immediately. Reason is shown to the provider.</p>
        <label style={{display:'block',marginBottom:'12px'}}>
          <div style={{fontSize:'11px',fontWeight:700,color:'#5C6070',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:'5px'}}>Category <span style={{color:RED}}>*</span></div>
          <select value={category} onChange={e=>setCategory(e.target.value)} style={{width:'100%',padding:'9px 12px',borderRadius:'7px',border:'1px solid #DDD8CE',fontSize:'13px',fontFamily:sans,background:'#fff'}}>
            {DENIAL_CATEGORIES.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>
        <label style={{display:'block',marginBottom:'16px'}}>
          <div style={{fontSize:'11px',fontWeight:700,color:'#5C6070',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:'5px'}}>Reason for provider <span style={{color:RED}}>*</span></div>
          <textarea rows={3} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Explain clearly what needs to be fixed…" style={{width:'100%',boxSizing:'border-box',border:'1px solid #DDD8CE',borderRadius:'7px',padding:'10px 12px',fontSize:'13px',fontFamily:sans,resize:'vertical',outline:'none',lineHeight:1.55}}/>
        </label>
        <div style={{display:'flex',gap:'8px',justifyContent:'flex-end'}}>
          <button onClick={onClose} style={{padding:'8px 18px',borderRadius:'6px',border:'1px solid #DDD8CE',background:'#fff',color:'#5C6070',cursor:'pointer',fontSize:'13px',fontWeight:600,fontFamily:sans}}>Cancel</button>
          <button disabled={!reason.trim()||busy} onClick={async()=>{setBusy(true);await onConfirm(gig.id,reason.trim(),category);setBusy(false)}} style={{padding:'8px 18px',borderRadius:'6px',border:'none',background:!reason.trim()?'#9097A8':AMBER,color:'#fff',cursor:!reason.trim()?'not-allowed':'pointer',fontSize:'13px',fontWeight:700,fontFamily:sans}}>{busy?'Suspending…':'Suspend'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Deny modal ───────────────────────────────────────────────────────────────
function DenyModal({gig,onConfirm,onClose}) {
  const [reason,setReason]=React.useState('')
  const [category,setCategory]=React.useState('quality')
  const [busy,setBusy]=React.useState(false)
  if(!gig) return null
  return(
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.60)',zIndex:320,display:'flex',alignItems:'center',justifyContent:'center',padding:'24px'}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:'10px',padding:'28px',width:'100%',maxWidth:'480px',boxShadow:'0 20px 60px rgba(0,0,0,.22)',fontFamily:sans}}>
        <h3 style={{fontFamily:serif,fontWeight:600,fontSize:'20px',color:RED,margin:'0 0 6px'}}>Deny Service</h3>
        <p style={{fontSize:'13px',color:'#5C6070',margin:'0 0 16px',lineHeight:1.6}}>This will move the service to <strong>Denied</strong> status. The provider will be notified and may submit an appeal.</p>
        <label style={{display:'block',marginBottom:'12px'}}>
          <div style={{fontSize:'11px',fontWeight:700,color:'#5C6070',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:'5px'}}>Denial Category <span style={{color:RED}}>*</span></div>
          <select value={category} onChange={e=>setCategory(e.target.value)} style={{width:'100%',padding:'9px 12px',borderRadius:'7px',border:'1px solid #DDD8CE',fontSize:'13px',fontFamily:sans,background:'#fff'}}>
            {DENIAL_CATEGORIES.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>
        <label style={{display:'block',marginBottom:'16px'}}>
          <div style={{fontSize:'11px',fontWeight:700,color:'#5C6070',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:'5px'}}>Reason <span style={{color:RED}}>*</span></div>
          <textarea rows={3} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Specific, actionable feedback for the provider…" style={{width:'100%',boxSizing:'border-box',border:'1px solid #DDD8CE',borderRadius:'7px',padding:'10px 12px',fontSize:'13px',fontFamily:sans,resize:'vertical',outline:'none',lineHeight:1.55}}/>
        </label>
        <div style={{display:'flex',gap:'8px',justifyContent:'flex-end'}}>
          <button onClick={onClose} style={{padding:'8px 18px',borderRadius:'6px',border:'1px solid #DDD8CE',background:'#fff',color:'#5C6070',cursor:'pointer',fontSize:'13px',fontWeight:600,fontFamily:sans}}>Cancel</button>
          <button disabled={!reason.trim()||busy} onClick={async()=>{setBusy(true);await onConfirm(gig.id,reason.trim(),category);setBusy(false)}} style={{padding:'8px 18px',borderRadius:'6px',border:'none',background:!reason.trim()?'#9097A8':RED,color:'#fff',cursor:!reason.trim()?'not-allowed':'pointer',fontSize:'13px',fontWeight:700,fontFamily:sans}}>{busy?'Denying…':'Deny Service'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Promote modal ────────────────────────────────────────────────────────────
function PromoteModal({gig,onConfirm,onClose}) {
  const [days,setDays]=React.useState(7)
  const [type,setType]=React.useState('boost')
  const [busy,setBusy]=React.useState(false)
  if(!gig) return null
  return(
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.60)',zIndex:320,display:'flex',alignItems:'center',justifyContent:'center',padding:'24px'}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:'10px',padding:'28px',width:'100%',maxWidth:'420px',boxShadow:'0 20px 60px rgba(0,0,0,.22)',fontFamily:sans}}>
        <h3 style={{fontFamily:serif,fontWeight:600,fontSize:'20px',color:NAVY,margin:'0 0 12px'}}>Promote Service</h3>
        <div style={{display:'flex',gap:'8px',marginBottom:'14px'}}>
          {[{v:'boost',l:'🚀 Boost'},{v:'featured',l:'⭐ Feature'}].map(o=><button key={o.v} onClick={()=>setType(o.v)} style={{flex:1,padding:'8px',borderRadius:'6px',border:`1px solid ${type===o.v?NAVY:'#DDD8CE'}`,background:type===o.v?NAVY:'#fff',color:type===o.v?'#fff':'#5C6070',cursor:'pointer',fontSize:'13px',fontWeight:600,fontFamily:sans}}>{o.l}</button>)}
        </div>
        <label style={{display:'block',marginBottom:'16px'}}>
          <div style={{fontSize:'11px',fontWeight:700,color:'#5C6070',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:'5px'}}>Duration</div>
          <select value={days} onChange={e=>setDays(Number(e.target.value))} style={{width:'100%',padding:'9px 12px',borderRadius:'7px',border:'1px solid #DDD8CE',fontSize:'13px',fontFamily:sans,background:'#fff'}}>
            {[1,3,7,14,30].map(d=><option key={d} value={d}>{d} day{d>1?'s':''}</option>)}
          </select>
        </label>
        <div style={{display:'flex',gap:'8px',justifyContent:'flex-end'}}>
          <button onClick={onClose} style={{padding:'8px 18px',borderRadius:'6px',border:'1px solid #DDD8CE',background:'#fff',color:'#5C6070',cursor:'pointer',fontSize:'13px',fontWeight:600,fontFamily:sans}}>Cancel</button>
          <button onClick={async()=>{setBusy(true);await onConfirm(gig.id,type,days);setBusy(false)}} style={{padding:'8px 18px',borderRadius:'6px',border:'none',background:GOLD,color:'#fff',cursor:'pointer',fontSize:'13px',fontWeight:700,fontFamily:sans}}>{busy?'Applying…':`Apply ${days}d ${type}`}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Rank adjust modal ────────────────────────────────────────────────────────
function RankModal({gig,onConfirm,onClose}) {
  const [score,setScore]=React.useState(Number(gig?.rank_score||0).toFixed(4))
  const [reason,setReason]=React.useState('')
  const [busy,setBusy]=React.useState(false)
  if(!gig) return null
  const parsed=Math.min(1,Math.max(0,Number(score)||0))
  return(
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.60)',zIndex:320,display:'flex',alignItems:'center',justifyContent:'center',padding:'24px'}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:'10px',padding:'28px',width:'100%',maxWidth:'420px',boxShadow:'0 20px 60px rgba(0,0,0,.22)',fontFamily:sans}}>
        <h3 style={{fontFamily:serif,fontWeight:600,fontSize:'20px',color:NAVY,margin:'0 0 6px'}}>Adjust Rank Score</h3>
        <p style={{fontSize:'13px',color:'#5C6070',margin:'0 0 16px'}}>Current: <strong>{Number(gig.rank_score||0).toFixed(4)}</strong>. Enter 0–1 (higher = better ranking).</p>
        <label style={{display:'block',marginBottom:'12px'}}>
          <div style={{fontSize:'11px',fontWeight:700,color:'#5C6070',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:'5px'}}>New Score (0–1)</div>
          <input type="number" min="0" max="1" step="0.0001" value={score} onChange={e=>setScore(e.target.value)} style={{width:'100%',boxSizing:'border-box',padding:'9px 12px',borderRadius:'7px',border:'1px solid #DDD8CE',fontSize:'13px',fontFamily:sans,outline:'none'}}/>
          {parsed>0&&<div style={{display:'flex',height:'6px',background:'#F2EFE9',borderRadius:'3px',marginTop:'8px',overflow:'hidden'}}><div style={{width:`${parsed*100}%`,background:parsed>=.7?GREEN:parsed>=.4?AMBER:RED,transition:'width .2s'}}/></div>}
        </label>
        <label style={{display:'block',marginBottom:'16px'}}>
          <div style={{fontSize:'11px',fontWeight:700,color:'#5C6070',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:'5px'}}>Reason (audit)</div>
          <input value={reason} onChange={e=>setReason(e.target.value)} placeholder="e.g. Penalty for duplicate content" style={{width:'100%',boxSizing:'border-box',padding:'9px 12px',borderRadius:'7px',border:'1px solid #DDD8CE',fontSize:'13px',fontFamily:sans,outline:'none'}}/>
        </label>
        <div style={{display:'flex',gap:'8px',justifyContent:'flex-end'}}>
          <button onClick={onClose} style={{padding:'8px 18px',borderRadius:'6px',border:'1px solid #DDD8CE',background:'#fff',color:'#5C6070',cursor:'pointer',fontSize:'13px',fontWeight:600,fontFamily:sans}}>Cancel</button>
          <button onClick={async()=>{setBusy(true);await onConfirm(gig.id,parsed,reason);setBusy(false)}} disabled={busy} style={{padding:'8px 18px',borderRadius:'6px',border:'none',background:NAVY,color:'#fff',cursor:'pointer',fontSize:'13px',fontWeight:700,fontFamily:sans}}>{busy?'Adjusting…':'Apply'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Gig detail drawer ────────────────────────────────────────────────────────
function GigDrawer({gig,onClose,onAction}) {
  const [section,setSection]=React.useState('overview')
  const [history,setHistory]=React.useState(null)
  const SECTIONS=['overview','content','pricing','metrics','moderation','audit','history']

  React.useEffect(()=>{
    if(section==='history'&&!history&&gig?.id){
      fetch(`/api/admin/gigs/${gig.id}/history`,{credentials:'same-origin'})
        .then(r=>r.json()).then(d=>setHistory(d?.data?.history||d?.history||[]))
        .catch(()=>setHistory([]))
    }
  },[section,gig?.id,history])

  if(!gig) return null
  const tiers=gig.tiers||[]
  const activeTiers=tiers.filter(t=>t.is_active)

  return(
    <div style={{position:'fixed',inset:0,zIndex:300,display:'flex',justifyContent:'flex-end'}}>
      <div onClick={onClose} style={{position:'absolute',inset:0,background:'rgba(0,0,0,.40)'}}/>
      <div style={{position:'relative',width:'min(640px,100vw)',height:'100vh',background:'#fff',boxShadow:'-4px 0 40px rgba(0,0,0,.18)',display:'flex',flexDirection:'column',fontFamily:sans}}>

        {/* Header */}
        <div style={{background:NAVY,padding:'20px 24px',flexShrink:0}}>
          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:'12px',marginBottom:'12px'}}>
            <div style={{minWidth:0}}>
              <div style={{fontSize:'10px',color:'rgba(255,255,255,.50)',letterSpacing:'.12em',textTransform:'uppercase',marginBottom:'4px'}}>{gig.provider_type==='attorney'?'⚖️ Attorney':'👤 Consultant'} Service</div>
              <h2 style={{fontFamily:serif,fontWeight:600,fontSize:'19px',color:'#fff',margin:0,lineHeight:1.25,overflow:'hidden',textOverflow:'ellipsis',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>{gig.title||'Untitled'}</h2>
              <div style={{fontSize:'11px',color:'rgba(255,255,255,.40)',marginTop:'3px'}}>{gig.slug}</div>
            </div>
            <button onClick={onClose} style={{background:'rgba(255,255,255,.10)',border:'1px solid rgba(255,255,255,.15)',borderRadius:'6px',color:'#fff',cursor:'pointer',fontSize:'16px',padding:'5px 10px',flexShrink:0}}>✕</button>
          </div>
          {/* Status + flags */}
          <div style={{display:'flex',gap:'6px',flexWrap:'wrap',alignItems:'center',marginBottom:'12px'}}>
            <StatusPill status={gig.status}/>
            {gig.seller_level&&<LevelBadge level={gig.seller_level}/>}
            {gig.auto_flag_score>0&&<FlagBadge score={gig.auto_flag_score}/>}
            {gig.featured_until&&new Date(gig.featured_until)>new Date()&&<span style={{background:'rgba(196,164,90,.20)',color:'#C4A45A',border:'1px solid rgba(196,164,90,.35)',padding:'2px 7px',borderRadius:'4px',fontSize:'11px',fontWeight:700}}>⭐ Featured</span>}
            {gig.boost_until&&new Date(gig.boost_until)>new Date()&&<span style={{background:'rgba(196,164,90,.20)',color:'#C4A45A',border:'1px solid rgba(196,164,90,.35)',padding:'2px 7px',borderRadius:'4px',fontSize:'11px',fontWeight:700}}>🚀 Boosted</span>}
          </div>
          {/* Section tabs */}
          <div style={{display:'flex',gap:0,borderBottom:'1px solid rgba(255,255,255,.08)',overflowX:'auto'}}>
            {SECTIONS.map(s=><button key={s} onClick={()=>setSection(s)} style={{padding:'6px 13px',fontSize:'11px',fontWeight:section===s?600:400,color:section===s?'#fff':'rgba(255,255,255,.45)',background:'none',border:'none',borderBottom:section===s?'2px solid #C4A45A':'2px solid transparent',cursor:'pointer',whiteSpace:'nowrap',textTransform:'capitalize',fontFamily:sans}}>{s.replace('_',' ')}</button>)}
          </div>
        </div>

        {/* Body */}
        <div style={{flex:1,overflowY:'auto',padding:'20px 24px'}}>

          {/* OVERVIEW */}
          {section==='overview'&&(
            <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>
              {/* Provider */}
              <div style={{background:'#F7F5F0',border:'1px solid #DDD8CE',borderRadius:'8px',padding:'14px 16px'}}>
                <div style={{fontSize:'10px',fontWeight:700,color:'#9097A8',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'8px'}}>Provider</div>
                <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
                  <div style={{width:'36px',height:'36px',borderRadius:'8px',background:PROVIDER_COLORS[gig.provider_type]||NAVY,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'13px',fontWeight:800,color:'#fff',flexShrink:0}}>{(gig.provider?.name||'?')[0].toUpperCase()}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:600,fontSize:'14px',color:NAVY}}>{gig.provider?.name||'Unknown'}</div>
                    <div style={{fontSize:'11px',color:'#9097A8'}}>{gig.provider?.email}</div>
                  </div>
                  {gig.seller_level&&<LevelBadge level={gig.seller_level}/>}
                </div>
              </div>
              {/* Key facts */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}}>
                {[
                  ['Category',gig.category||'—'],['Subcategory',gig.subcategory||'—'],
                  ['Content Score',gig.content_score!=null?`${gig.content_score}/100`:'—'],
                  ['Rank Score',gig.rank_score!=null?Number(gig.rank_score).toFixed(4):'—'],
                  ['Tiers',`${activeTiers.length} active`],['CTR',`${gig.ctr||'0.0'}%`],
                  ['Created',ago(gig.created_at)],['Updated',ago(gig.updated_at)],
                ].map(([l,v])=>(
                  <div key={l} style={{background:'#F7F5F0',border:'1px solid #DDD8CE',borderRadius:'7px',padding:'10px 12px'}}>
                    <div style={{fontSize:'10px',fontWeight:700,color:'#9097A8',textTransform:'uppercase',letterSpacing:'.06em'}}>{l}</div>
                    <div style={{fontSize:'13px',fontWeight:600,color:NAVY,marginTop:'2px'}}>{v}</div>
                  </div>
                ))}
              </div>
              {/* Auto-flags */}
              {gig.auto_flag_score>0&&(
                <div style={{background:'#FEF5E4',border:'1px solid rgba(139,94,10,.22)',borderRadius:'8px',padding:'14px 16px'}}>
                  <div style={{fontWeight:700,color:AMBER,fontSize:'13px',marginBottom:'8px'}}>⚑ Auto-flag Score: {gig.auto_flag_score}%</div>
                  {(gig.auto_flag_reasons||[]).map((f,i)=>(
                    <div key={i} style={{fontSize:'12px',color:'#5C6070',padding:'3px 0',borderBottom:'1px solid rgba(139,94,10,.10)'}}>{f.type}: {f.description}</div>
                  ))}
                </div>
              )}
              {/* Tags */}
              {gig.tags?.length>0&&(
                <div>
                  <div style={{fontSize:'10px',fontWeight:700,color:'#9097A8',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'6px'}}>Tags</div>
                  <div style={{display:'flex',gap:'5px',flexWrap:'wrap'}}>{gig.tags.map(t=><span key={t} style={{padding:'2px 7px',borderRadius:'4px',background:'#F2EFE9',border:'1px solid #DDD8CE',fontSize:'12px',color:'#5C6070'}}>{t}</span>)}</div>
                </div>
              )}
              {/* Gallery */}
              {gig.gallery_images?.length>0&&(
                <div>
                  <div style={{fontSize:'10px',fontWeight:700,color:'#9097A8',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'6px'}}>Gallery ({gig.gallery_images.length})</div>
                  <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>{gig.gallery_images.slice(0,4).map((img,i)=>{const url=typeof img==='string'?img:img?.url;return url?<img key={i} src={url} alt={gig.title || 'Gallery image'} style={{width:'70px',height:'70px',objectFit:'cover',borderRadius:'6px',border:'1px solid #DDD8CE'}}/>:null})}</div>
                </div>
              )}
            </div>
          )}

          {/* CONTENT */}
          {section==='content'&&(
            <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>
              {gig.pitch&&<div><div style={{fontSize:'10px',fontWeight:700,color:'#9097A8',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'5px'}}>Pitch ({gig.pitch.length} chars)</div><p style={{margin:0,fontSize:'13px',color:NAVY,lineHeight:1.6,fontStyle:'italic',background:'#F7F5F0',border:'1px solid #DDD8CE',borderRadius:'7px',padding:'12px 14px'}}>{gig.pitch}</p></div>}
              {gig.description&&<div><div style={{fontSize:'10px',fontWeight:700,color:'#9097A8',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'5px'}}>Description ({gig.description.length} chars)</div><p style={{margin:0,fontSize:'13px',color:'#5C6070',lineHeight:1.7,maxHeight:'220px',overflowY:'auto',background:'#F7F5F0',border:'1px solid #DDD8CE',borderRadius:'7px',padding:'12px 14px',whiteSpace:'pre-wrap'}}>{gig.description}</p></div>}
              {gig.requirements&&<div><div style={{fontSize:'10px',fontWeight:700,color:'#9097A8',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'5px'}}>Requirements</div><p style={{margin:0,fontSize:'13px',color:'#5C6070',lineHeight:1.6,background:'#F7F5F0',border:'1px solid #DDD8CE',borderRadius:'7px',padding:'12px 14px',whiteSpace:'pre-wrap'}}>{gig.requirements}</p></div>}
              {gig.faq?.length>0&&<div><div style={{fontSize:'10px',fontWeight:700,color:'#9097A8',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'6px'}}>FAQ ({gig.faq.length})</div>{gig.faq.map((f,i)=><div key={i} style={{marginBottom:'8px',background:'#F7F5F0',border:'1px solid #DDD8CE',borderRadius:'7px',padding:'10px 14px'}}><div style={{fontWeight:600,fontSize:'13px',color:NAVY,marginBottom:'2px'}}>{f.q||f.question}</div><div style={{fontSize:'12px',color:'#5C6070',lineHeight:1.55}}>{f.a||f.answer}</div></div>)}</div>}
              {gig.seo_title&&<div style={{background:'#F7F5F0',border:'1px solid #DDD8CE',borderRadius:'7px',padding:'12px 14px'}}><div style={{fontSize:'10px',fontWeight:700,color:'#9097A8',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'5px'}}>SEO</div><div style={{fontSize:'13px',fontWeight:600,color:NAVY,marginBottom:'2px'}}>{gig.seo_title}</div><div style={{fontSize:'12px',color:'#5C6070'}}>{gig.seo_description}</div></div>}
            </div>
          )}

          {/* PRICING */}
          {section==='pricing'&&(
            <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
              {tiers.length===0?<p style={{color:'#9097A8',fontSize:'13px'}}>No tiers.</p>:tiers.map(t=>(
                <div key={t.id||t.tier} style={{background:'#F7F5F0',border:`1px solid ${t.is_active?'#DDD8CE':'rgba(0,0,0,.06)'}`,borderRadius:'8px',padding:'14px 16px',opacity:t.is_active?1:.55}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'6px'}}>
                    <div><span style={{fontSize:'10px',fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'#9097A8'}}>{t.tier}</span><div style={{fontWeight:700,fontSize:'15px',color:NAVY}}>{t.title}</div></div>
                    <div style={{textAlign:'right'}}><div style={{fontWeight:800,fontSize:'18px',color:NAVY}}>{fmt(t.price)}</div>{!t.is_active&&<span style={{fontSize:'11px',color:'#9097A8'}}>Inactive</span>}</div>
                  </div>
                  <div style={{display:'flex',gap:'12px',fontSize:'12px',color:'#5C6070'}}>
                    <span>🕐 {t.delivery_days}d</span>
                    <span>🔄 {t.revisions===0?'Unlimited':`${t.revisions} rev`}</span>
                  </div>
                </div>
              ))}
              <div style={{borderTop:'1px solid #DDD8CE',paddingTop:'10px',display:'flex',justifyContent:'space-between',fontSize:'13px',color:'#5C6070'}}>
                <span>Price range</span>
                <span style={{fontWeight:700,color:NAVY}}>{gig.min_price===gig.max_price?fmt(gig.min_price):`${fmt(gig.min_price)} – ${fmt(gig.max_price)}`}</span>
              </div>
            </div>
          )}

          {/* METRICS */}
          {section==='metrics'&&(
            <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
                {[
                  {l:'Impressions',v:fmtN(gig.impressions,true),i:'👁',c:NAVY},
                  {l:'Clicks',v:fmtN(gig.clicks,true),i:'🖱',c:NAVY},
                  {l:'Saves',v:fmtN(gig.saves,true),i:'♡',c:GOLD},
                  {l:'CTR',v:`${gig.ctr||'0.0'}%`,i:'📊',c:GREEN},
                  {l:'Rank Score',v:Number(gig.rank_score||0).toFixed(4),i:'🏆',c:PURPLE},
                  {l:'Content Score',v:gig.content_score!=null?`${gig.content_score}%`:'—',i:'📋',c:gig.content_score>=75?GREEN:gig.content_score>=50?AMBER:RED},
                ].map(m=>(
                  <div key={m.l} style={{background:'#F7F5F0',border:'1px solid #DDD8CE',borderRadius:'8px',padding:'14px 16px'}}>
                    <div style={{fontSize:'10px',fontWeight:700,color:'#9097A8',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'5px'}}>{m.i} {m.l}</div>
                    <div style={{fontWeight:800,fontSize:'22px',color:m.c,fontVariantNumeric:'tabular-nums'}}>{m.v}</div>
                  </div>
                ))}
              </div>
              {gig.content_score!=null&&(
                <div style={{background:'#F7F5F0',border:'1px solid #DDD8CE',borderRadius:'8px',padding:'14px 16px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:'6px'}}><span style={{fontSize:'12px',fontWeight:600,color:'#5C6070'}}>Profile Completeness</span><span style={{fontSize:'13px',fontWeight:700,color:NAVY}}>{gig.content_score}%</span></div>
                  <div style={{height:'7px',borderRadius:'4px',background:'#E8E4DC',overflow:'hidden'}}><div style={{height:'100%',width:`${gig.content_score}%`,background:gig.content_score>=75?GREEN:gig.content_score>=50?AMBER:RED,borderRadius:'4px',transition:'width .4s'}}/></div>
                </div>
              )}
            </div>
          )}

          {/* MODERATION */}
          {section==='moderation'&&(
            <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
              {/* Current state details */}
              {gig.status==='suspended'&&(
                <div style={{background:'#FEF5E4',border:'1px solid rgba(139,94,10,.25)',borderRadius:'8px',padding:'14px 16px'}}>
                  <div style={{fontSize:'12px',fontWeight:700,color:AMBER,marginBottom:'4px'}}>Suspended — {gig.denial_category||'No category'}</div>
                  <div style={{fontSize:'13px',color:'#5C6070',lineHeight:1.55,marginBottom:'5px'}}>{gig.gig_status_reason||'No reason recorded.'}</div>
                  {gig.suspended_at&&<div style={{fontSize:'11px',color:'#9097A8'}}>{ago(gig.suspended_at)}{gig.suspended_by_name?` by ${gig.suspended_by_name}`:''}</div>}
                </div>
              )}
              {gig.status==='denied'&&(
                <div style={{background:'#FAEAEA',border:'1px solid rgba(139,26,26,.22)',borderRadius:'8px',padding:'14px 16px'}}>
                  <div style={{fontSize:'12px',fontWeight:700,color:RED,marginBottom:'4px'}}>Denied — {gig.denial_category||'No category'}</div>
                  <div style={{fontSize:'13px',color:'#5C6070',lineHeight:1.55}}>{gig.denial_reason||gig.gig_status_reason||'No reason recorded.'}</div>
                </div>
              )}
              {gig.status==='appeal_pending'&&gig.appeal_reason&&(
                <div style={{background:'#F5F3FF',border:'1px solid rgba(61,43,107,.22)',borderRadius:'8px',padding:'14px 16px'}}>
                  <div style={{fontSize:'12px',fontWeight:700,color:PURPLE,marginBottom:'4px'}}>Appeal Submitted {ago(gig.appeal_submitted_at)}</div>
                  <div style={{fontSize:'13px',color:'#5C6070',lineHeight:1.55}}>{gig.appeal_reason}</div>
                </div>
              )}
              {/* Action buttons */}
              <div style={{background:'#F7F5F0',border:'1px solid #DDD8CE',borderRadius:'8px',padding:'14px 16px'}}>
                <div style={{fontSize:'10px',fontWeight:700,color:'#9097A8',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'10px'}}>Moderation Actions</div>
                <div style={{display:'flex',flexDirection:'column',gap:'7px'}}>
                  {gig.status==='pending_review'&&<><button onClick={()=>onAction('approve',gig)} style={{padding:'9px 14px',borderRadius:'6px',border:'1px solid rgba(26,107,69,.30)',background:'#EAF5EE',color:GREEN,cursor:'pointer',fontSize:'13px',fontWeight:600,textAlign:'left',fontFamily:sans}}>✓ Approve — publish to marketplace</button><button onClick={()=>onAction('deny',gig)} style={{padding:'9px 14px',borderRadius:'6px',border:'1px solid rgba(139,26,26,.25)',background:'#FAEAEA',color:RED,cursor:'pointer',fontSize:'13px',fontWeight:600,textAlign:'left',fontFamily:sans}}>✗ Deny — reject with reason</button></>}
                  {gig.status==='appeal_pending'&&<><button onClick={()=>onAction('approve_appeal',gig)} style={{padding:'9px 14px',borderRadius:'6px',border:'1px solid rgba(26,107,69,.30)',background:'#EAF5EE',color:GREEN,cursor:'pointer',fontSize:'13px',fontWeight:600,textAlign:'left',fontFamily:sans}}>✓ Approve Appeal — restore to active</button><button onClick={()=>onAction('deny_appeal',gig)} style={{padding:'9px 14px',borderRadius:'6px',border:'1px solid rgba(139,26,26,.25)',background:'#FAEAEA',color:RED,cursor:'pointer',fontSize:'13px',fontWeight:600,textAlign:'left',fontFamily:sans}}>✗ Deny Appeal — remain denied</button></>}
                  {!['suspended','deleted'].includes(gig.status)&&<button onClick={()=>onAction('suspend',gig)} style={{padding:'9px 14px',borderRadius:'6px',border:'1px solid rgba(139,94,10,.30)',background:'#FEF5E4',color:AMBER,cursor:'pointer',fontSize:'13px',fontWeight:600,textAlign:'left',fontFamily:sans}}>⚠ Suspend — hide with reason</button>}
                  {gig.status==='suspended'&&<button onClick={()=>onAction('unsuspend',gig)} style={{padding:'9px 14px',borderRadius:'6px',border:'1px solid rgba(26,107,69,.30)',background:'#EAF5EE',color:GREEN,cursor:'pointer',fontSize:'13px',fontWeight:600,textAlign:'left',fontFamily:sans}}>↑ Unsuspend — restore to active</button>}
                  {!['archived','deleted'].includes(gig.status)&&<button onClick={()=>onAction('archive',gig)} style={{padding:'9px 14px',borderRadius:'6px',border:'1px solid rgba(61,43,107,.22)',background:'#EDEAF7',color:PURPLE,cursor:'pointer',fontSize:'13px',fontWeight:600,textAlign:'left',fontFamily:sans}}>📦 Archive</button>}
                  <button onClick={()=>onAction('promote',gig)} style={{padding:'9px 14px',borderRadius:'6px',border:'1px solid rgba(154,123,59,.30)',background:'#F5EDD6',color:GOLD,cursor:'pointer',fontSize:'13px',fontWeight:600,textAlign:'left',fontFamily:sans}}>⭐ Boost / Feature (admin)</button>
                  <button onClick={()=>onAction('rank_adjust',gig)} style={{padding:'9px 14px',borderRadius:'6px',border:'1px solid rgba(27,45,79,.25)',background:'#EAF0F7',color:NAVY,cursor:'pointer',fontSize:'13px',fontWeight:600,textAlign:'left',fontFamily:sans}}>🏆 Adjust Rank Score</button>
                </div>
              </div>
              <a href={`/marketplace/gigs/${gig.slug}`} target="_blank" rel="noreferrer" style={{display:'block',padding:'9px 14px',borderRadius:'6px',border:'1px solid #DDD8CE',background:'#fff',color:NAVY,cursor:'pointer',fontSize:'13px',fontWeight:600,textDecoration:'none',textAlign:'left'}}>↗ Preview public gig page</a>
            </div>
          )}

          {/* AUDIT */}
          {section==='audit'&&(
            <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
              <div style={{fontSize:'12px',color:'#9097A8',marginBottom:'4px'}}>Last 5 admin actions on this service.</div>
              {!gig.audit_log?.length?<p style={{color:'#9097A8',fontSize:'13px',padding:'16px',textAlign:'center',background:'#F7F5F0',borderRadius:'8px'}}>No moderation history.</p>:gig.audit_log.map((e,i)=>(
                <div key={i} style={{background:'#F7F5F0',border:'1px solid #DDD8CE',borderRadius:'7px',padding:'12px 14px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:'8px',marginBottom:'3px'}}>
                    <span style={{fontWeight:700,fontSize:'13px',color:NAVY,textTransform:'capitalize'}}>{e.action_type?.replace(/_/g,' ')}</span>
                    <span style={{fontSize:'11px',color:'#9097A8',flexShrink:0}}>{ago(e.created_at)}</span>
                  </div>
                  {e.reason&&<div style={{fontSize:'12px',color:'#5C6070',lineHeight:1.5,fontStyle:'italic'}}>"{e.reason}"</div>}
                </div>
              ))}
            </div>
          )}

          {/* HISTORY */}
          {section==='history'&&(
            <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
              <div style={{fontSize:'12px',color:'#9097A8',marginBottom:'4px'}}>Version history — every edit to this service.</div>
              {history===null?<p style={{color:'#9097A8',fontSize:'13px',padding:'16px',textAlign:'center'}}>Loading…</p>:history.length===0?<p style={{color:'#9097A8',fontSize:'13px',padding:'16px',textAlign:'center',background:'#F7F5F0',borderRadius:'8px'}}>No version history yet.</p>:history.map((v,i)=>(
                <div key={i} style={{background:'#F7F5F0',border:'1px solid #DDD8CE',borderRadius:'7px',padding:'12px 14px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:'8px',marginBottom:'3px'}}>
                    <span style={{fontWeight:700,fontSize:'13px',color:NAVY}}>v{v.version_num} — {v.change_summary||'Updated'}</span>
                    <span style={{fontSize:'11px',color:'#9097A8',flexShrink:0}}>{ago(v.created_at)}</span>
                  </div>
                  <div style={{fontSize:'11px',color:'#9097A8'}}>{v.changed_by_role==='admin'?'Admin':v.changed_by_role||'Provider'} edit</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Moderation Queue tab ─────────────────────────────────────────────────────
function ModQueueTab({onSelectGig,onAction}) {
  const [data,setData]=React.useState(null)
  const [loading,setLoading]=React.useState(true)
  const [runningFlags,setRunningFlags]=React.useState(false)
  const [flagMsg,setFlagMsg]=React.useState('')

  const load=React.useCallback(async()=>{
    setLoading(true)
    const res=await fetch('/api/admin/gigs/modqueue',{credentials:'same-origin'})
    const json=await res.json().catch(()=>({}))
    setData(json?.data??json)
    setLoading(false)
  },[])

  React.useEffect(()=>{load()},[load])

  const runAutoFlag=async()=>{
    setRunningFlags(true);setFlagMsg('')
    try{
      const res=await fetch('/api/admin/gigs/autoflag',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({})})
      const json=await res.json().catch(()=>({}))
      const r=json?.data??json
      setFlagMsg(`Auto-flag complete: ${r.flagged||0} flagged, ${r.high_priority||0} urgent`)
      load()
    }catch(e){setFlagMsg(e.message)}
    finally{setRunningFlags(false)}
  }

  if(loading) return <div style={{padding:'40px',textAlign:'center',color:'#9097A8',fontSize:'14px'}}>Loading moderation queue…</div>

  const pendingReview=data?.pending_review||[]
  const appeals=data?.appeals||[]
  const autoFlagged=data?.auto_flagged||[]
  const counts=data?.counts||{}

  const GigQueueRow=({gig,badge,badgeColor,actions})=>(
    <div style={{display:'flex',alignItems:'center',gap:'14px',padding:'13px 16px',borderBottom:'1px solid #F2EFE9',background:'#fff'}}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:'flex',alignItems:'center',gap:'8px',flexWrap:'wrap',marginBottom:'4px'}}>
          <StatusPill status={gig.status}/>
          {badge&&<span style={{padding:'2px 7px',borderRadius:'4px',fontSize:'10px',fontWeight:700,background:badgeColor+'20',color:badgeColor,border:`1px solid ${badgeColor}30`}}>{badge}</span>}
          {gig.auto_flag_score>0&&<FlagBadge score={gig.auto_flag_score}/>}
        </div>
        <div style={{fontWeight:600,fontSize:'13px',color:NAVY,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'280px'}}>{gig.title||'Untitled'}</div>
        <div style={{fontSize:'11px',color:'#9097A8'}}>{gig.provider?.name||'—'} · {gig.category||'—'} · {ago(gig.created_at)}</div>
        <ScoreBar score={gig.content_score} compact/>
      </div>
      <div style={{display:'flex',gap:'5px',flexShrink:0}}>
        <button onClick={()=>onSelectGig(gig)} style={{padding:'5px 11px',borderRadius:'5px',border:'1px solid #DDD8CE',background:'#F7F5F0',color:NAVY,cursor:'pointer',fontSize:'12px',fontWeight:600,fontFamily:sans}}>Review</button>
        {actions}
      </div>
    </div>
  )

  return(
    <div style={{display:'flex',flexDirection:'column',gap:'20px'}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'12px'}}>
        <div>
          <h3 style={{fontFamily:serif,fontWeight:600,fontSize:'22px',color:NAVY,margin:0}}>Moderation Queue</h3>
          <p style={{color:'#9097A8',fontSize:'13px',margin:'3px 0 0'}}>{(counts.pending_review||0)+(counts.appeals||0)} requiring decision · {counts.auto_flagged||0} auto-flagged</p>
        </div>
        <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
          {flagMsg&&<span style={{fontSize:'12px',color:GREEN,fontWeight:600}}>{flagMsg}</span>}
          <button onClick={runAutoFlag} disabled={runningFlags} style={{padding:'8px 16px',borderRadius:'6px',border:'1px solid rgba(139,94,10,.30)',background:'#FEF5E4',color:AMBER,cursor:runningFlags?'not-allowed':'pointer',fontSize:'13px',fontWeight:600,fontFamily:sans,opacity:runningFlags?.7:1}}>
            {runningFlags?'Running…':'⚑ Run Auto-Flag'}
          </button>
          <button onClick={load} style={{padding:'8px 14px',borderRadius:'6px',border:'1px solid #DDD8CE',background:'#fff',color:NAVY,cursor:'pointer',fontSize:'13px',fontWeight:600,fontFamily:sans}}>↻</button>
        </div>
      </div>

      {/* Priority order: Pending Review → Appeals → Auto-flagged */}
      {pendingReview.length>0&&(
        <div style={{background:'#fff',border:'1px solid #DDD8CE',borderRadius:'8px',overflow:'hidden',boxShadow:'0 1px 4px rgba(27,45,79,.05)'}}>
          <div style={{padding:'12px 16px',background:'#EEF4FE',borderBottom:'1px solid rgba(30,64,175,.15)',display:'flex',alignItems:'center',gap:'8px'}}>
            <span style={{width:'8px',height:'8px',borderRadius:'50%',background:'#3B82F6',display:'inline-block'}}/>
            <span style={{fontWeight:700,fontSize:'13px',color:'#1E40AF'}}>Pending Review ({pendingReview.length})</span>
            <span style={{fontSize:'12px',color:'#6B80A8'}}>New submissions waiting for approval</span>
          </div>
          {pendingReview.map(g=><GigQueueRow key={g.id} gig={g}
            actions={<><button onClick={()=>onAction('approve',g)} style={{padding:'5px 11px',borderRadius:'5px',border:'1px solid rgba(26,107,69,.30)',background:'#EAF5EE',color:GREEN,cursor:'pointer',fontSize:'12px',fontWeight:600,fontFamily:sans}}>✓ Approve</button><button onClick={()=>onAction('deny',g)} style={{padding:'5px 11px',borderRadius:'5px',border:'1px solid rgba(139,26,26,.22)',background:'#FAEAEA',color:RED,cursor:'pointer',fontSize:'12px',fontWeight:600,fontFamily:sans}}>✗ Deny</button></>}
          />)}
        </div>
      )}

      {appeals.length>0&&(
        <div style={{background:'#fff',border:'1px solid #DDD8CE',borderRadius:'8px',overflow:'hidden',boxShadow:'0 1px 4px rgba(27,45,79,.05)'}}>
          <div style={{padding:'12px 16px',background:'#F5F3FF',borderBottom:'1px solid rgba(61,43,107,.15)',display:'flex',alignItems:'center',gap:'8px'}}>
            <span style={{width:'8px',height:'8px',borderRadius:'50%',background:'#8B5CF6',display:'inline-block'}}/>
            <span style={{fontWeight:700,fontSize:'13px',color:PURPLE}}>Appeals ({appeals.length})</span>
            <span style={{fontSize:'12px',color:'#8B7AB0'}}>Providers contesting decisions</span>
          </div>
          {appeals.map(g=><GigQueueRow key={g.id} gig={g} badge="Appeal" badgeColor={PURPLE}
            actions={<><button onClick={()=>onAction('approve_appeal',g)} style={{padding:'5px 11px',borderRadius:'5px',border:'1px solid rgba(26,107,69,.30)',background:'#EAF5EE',color:GREEN,cursor:'pointer',fontSize:'12px',fontWeight:600,fontFamily:sans}}>✓ Allow</button><button onClick={()=>onAction('deny_appeal',g)} style={{padding:'5px 11px',borderRadius:'5px',border:'1px solid rgba(139,26,26,.22)',background:'#FAEAEA',color:RED,cursor:'pointer',fontSize:'12px',fontWeight:600,fontFamily:sans}}>✗ Deny</button></>}
          />)}
        </div>
      )}

      {autoFlagged.length>0&&(
        <div style={{background:'#fff',border:'1px solid #DDD8CE',borderRadius:'8px',overflow:'hidden',boxShadow:'0 1px 4px rgba(27,45,79,.05)'}}>
          <div style={{padding:'12px 16px',background:'#FEF5E4',borderBottom:'1px solid rgba(139,94,10,.15)',display:'flex',alignItems:'center',gap:'8px'}}>
            <span style={{width:'8px',height:'8px',borderRadius:'50%',background:'#F59E0B',display:'inline-block'}}/>
            <span style={{fontWeight:700,fontSize:'13px',color:AMBER}}>Auto-flagged Active Gigs ({autoFlagged.length})</span>
            <span style={{fontSize:'12px',color:'#8B7030'}}>Suspicious patterns detected — review and action</span>
          </div>
          {autoFlagged.map(g=><GigQueueRow key={g.id} gig={g} badge={`Score ${g.auto_flag_score}%`} badgeColor={g.auto_flag_score>=70?RED:AMBER}
            actions={<button onClick={()=>onAction('suspend',g)} style={{padding:'5px 11px',borderRadius:'5px',border:'1px solid rgba(139,94,10,.30)',background:'#FEF5E4',color:AMBER,cursor:'pointer',fontSize:'12px',fontWeight:600,fontFamily:sans}}>Suspend</button>}
          />)}
        </div>
      )}

      {pendingReview.length===0&&appeals.length===0&&autoFlagged.length===0&&(
        <div style={{background:'#fff',border:'1px dashed #C8C2B6',borderRadius:'8px',padding:'48px 24px',textAlign:'center'}}>
          <div style={{fontSize:'32px',marginBottom:'12px',opacity:.35}}>✅</div>
          <div style={{fontFamily:serif,fontWeight:600,fontSize:'20px',color:NAVY,marginBottom:'8px'}}>Queue is clear</div>
          <div style={{fontSize:'13px',color:'#9097A8',lineHeight:1.6}}>No pending reviews, appeals, or auto-flagged gigs. Run auto-flag to scan active listings.</div>
        </div>
      )}
    </div>
  )
}

// ─── Platform stats tab ───────────────────────────────────────────────────────
function StatsTab() {
  const [stats,setStats]=React.useState(null)
  const [loading,setLoading]=React.useState(true)

  React.useEffect(()=>{
    fetch('/api/admin/gigs/stats',{credentials:'same-origin'}).then(r=>r.json()).then(j=>setStats(j?.data??j)).catch(()=>{}).finally(()=>setLoading(false))
  },[])

  if(loading) return <div style={{padding:'40px',textAlign:'center',color:'#9097A8'}}>Loading stats…</div>

  const Kpi=({label,value,accent='#0F172A',icon})=><div style={{background:'#fff',border:`1px solid #DDD8CE`,borderTop:`3px solid ${accent}`,borderRadius:'8px',padding:'16px 18px'}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}}><span style={{fontSize:'11px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.08em',color:'#9097A8'}}>{label}</span><span style={{fontSize:'15px',opacity:.4}}>{icon}</span></div>
    <div style={{fontWeight:800,fontSize:'22px',color:NAVY,fontVariantNumeric:'tabular-nums'}}>{value}</div>
  </div>

  return(
    <div style={{display:'flex',flexDirection:'column',gap:'20px'}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:'12px'}}>
        <Kpi label="Total Gigs" value={Object.values(stats?.by_status||{}).reduce((s,v)=>s+v,0)} icon="📋"/>
        <Kpi label="Active" value={stats?.by_status?.active||0} accent={GREEN} icon="✅"/>
        <Kpi label="Avg Content Score" value={`${Number(stats?.avg_content_score||0).toFixed(1)}%`} accent={GOLD} icon="📊"/>
        <Kpi label="Avg Rank Score" value={Number(stats?.avg_rank_score||0).toFixed(3)} accent={PURPLE} icon="🏆"/>
        <Kpi label="Platform Impressions" value={fmtN(stats?.total_impressions,true)} icon="👁"/>
        <Kpi label="Platform CTR" value={`${Number(stats?.platform_ctr||0).toFixed(2)}%`} icon="🖱"/>
        <Kpi label="Needs Attention" value={stats?.gigs_needing_attention||0} accent={RED} icon="⚠"/>
        <Kpi label="Mod Queue" value={stats?.modqueue_count||0} accent={AMBER} icon="🔍"/>
      </div>

      {/* Status breakdown */}
      <div style={{background:'#fff',border:'1px solid #DDD8CE',borderRadius:'8px',padding:'20px'}}>
        <div style={{fontFamily:serif,fontWeight:600,fontSize:'17px',color:NAVY,marginBottom:'14px'}}>By Status</div>
        <div style={{display:'flex',flexDirection:'column',gap:'2px'}}>
          {Object.entries(stats?.by_status||{}).map(([status,count])=>{
            const cfg=STATUS_CFG[status]||STATUS_CFG.draft
            const total=Object.values(stats?.by_status||{}).reduce((s,v)=>s+v,1)
            return(
              <div key={status} style={{display:'flex',alignItems:'center',gap:'10px',padding:'6px 0',borderBottom:'1px solid #F2EFE9'}}>
                <span style={{width:'8px',height:'8px',borderRadius:'50%',background:cfg.dot,flexShrink:0}}/>
                <span style={{fontSize:'13px',color:'#5C6070',flex:1,textTransform:'capitalize'}}>{status.replace(/_/g,' ')}</span>
                <div style={{width:'80px',height:'5px',background:'#F2EFE9',borderRadius:'2px',overflow:'hidden'}}><div style={{height:'100%',width:`${(count/total)*100}%`,background:cfg.dot,borderRadius:'2px'}}/></div>
                <span style={{fontSize:'13px',fontWeight:700,color:NAVY,minWidth:'30px',textAlign:'right'}}>{count}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* By category */}
      {(stats?.by_category||[]).length>0&&(
        <div style={{background:'#fff',border:'1px solid #DDD8CE',borderRadius:'8px',overflow:'hidden'}}>
          <div style={{padding:'16px 18px',background:NAVY,borderBottom:'2px solid rgba(255,255,255,.08)'}}><span style={{fontFamily:serif,fontWeight:600,fontSize:'16px',color:'#fff'}}>Top Categories</span></div>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <tbody>
              {stats.by_category.slice(0,10).map((c,i)=>(
                <tr key={c.category} style={{background:i%2===0?'#fff':'#FAFAF8',borderBottom:'1px solid #F2EFE9'}}>
                  <td style={{padding:'9px 14px',fontSize:'13px',color:NAVY,fontWeight:600}}>{c.category}</td>
                  <td style={{padding:'9px 14px',fontSize:'13px',color:'#9097A8',textAlign:'right'}}>{c.count} gigs</td>
                  <td style={{padding:'9px 14px',fontSize:'13px',color:GOLD,fontWeight:600,textAlign:'right'}}>{c.avg_rating?`${Number(c.avg_rating).toFixed(1)}★`:'—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Seller levels tab ────────────────────────────────────────────────────────
function SellerLevelsTab() {
  return(
    <div style={{display:'flex',flexDirection:'column',gap:'20px'}}>
      <div style={{fontFamily:serif,fontWeight:600,fontSize:'22px',color:NAVY}}>Seller Level Thresholds</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:'14px'}}>
        {[
          {level:'new_seller',label:'New Seller',color:'#9097A8',icon:'🌱',min_orders:0,min_rating:'—',completion:'—',tenure:'< 60 days',multiplier:'0.80×'},
          {level:'level_1',label:'Level 1',color:GOLD,icon:'⭐',min_orders:10,min_rating:'4.6+',completion:'90%+',tenure:'60+ days',multiplier:'1.00×'},
          {level:'level_2',label:'Level 2',color:GOLD,icon:'⭐⭐',min_orders:50,min_rating:'4.7+',completion:'95%+',tenure:'365+ days',multiplier:'1.10×'},
          {level:'top_rated',label:'Top Rated',color:NAVY,icon:'👑',min_orders:100,min_rating:'4.8+',completion:'98%+',tenure:'2+ years',multiplier:'1.25×'},
        ].map(l=>(
          <div key={l.level} style={{background:'#fff',border:'1px solid #DDD8CE',borderTop:`3px solid ${l.color}`,borderRadius:'8px',padding:'18px'}}>
            <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'12px'}}>
              <span style={{fontSize:'20px'}}>{l.icon}</span>
              <div>
                <div style={{fontWeight:700,fontSize:'15px',color:NAVY}}>{l.label}</div>
                <div style={{fontSize:'11px',color:'#9097A8'}}>Rank multiplier: <strong style={{color:l.color}}>{l.multiplier}</strong></div>
              </div>
            </div>
            {[['Min Orders',l.min_orders],['Min Rating',l.min_rating],['Completion',l.completion],['Tenure',l.tenure]].map(([k,v])=>(
              <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid #F2EFE9',fontSize:'12px'}}>
                <span style={{color:'#9097A8'}}>{k}</span>
                <span style={{fontWeight:600,color:NAVY}}>{v}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div style={{background:'#F7F5F0',border:'1px solid #DDD8CE',borderLeft:`4px solid ${GOLD}`,borderRadius:'8px',padding:'16px 18px'}}>
        <div style={{fontFamily:serif,fontWeight:600,fontSize:'16px',color:NAVY,marginBottom:'6px'}}>How Seller Levels Affect Search Ranking</div>
        <p style={{fontSize:'13px',color:'#5C6070',lineHeight:1.65,margin:0}}>
          Seller level contributes <strong>10%</strong> of the total rank score. A Top Rated provider's gigs receive a 25% multiplier on that component vs a New Seller's 80%. Combined with the 15% new-seller boost (first 14 days, under 5 orders), this creates a balanced discovery curve that rewards quality over time without completely burying new entrants.
        </p>
      </div>
    </div>
  )
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function AdminGigsManager({ formatPrimary }) {
  const [tab,setTab]       = React.useState('modqueue')
  const [gigs,setGigs]     = React.useState([])
  const [loading,setLoading]=React.useState(true)
  const [error,setError]   = React.useState('')
  const [notice,setNotice] = React.useState({type:'',msg:''})
  const [selectedGig,setSelectedGig]     = React.useState(null)
  const [suspendTarget,setSuspendTarget] = React.useState(null)
  const [denyTarget,setDenyTarget]       = React.useState(null)
  const [promoteTarget,setPromoteTarget] = React.useState(null)
  const [rankTarget,setRankTarget]       = React.useState(null)
  const [selectedRows,setSelectedRows]   = React.useState(new Set())
  const [sortCol,setSortCol]     = React.useState('created_at')
  const [sortDir,setSortDir]     = React.useState('desc')
  const [searchQ,setSearchQ]     = React.useState('')
  const [statusFilter,setStatusFilter]     = React.useState('all')
  const [typeFilter,setTypeFilter]         = React.useState('all')
  const [categoryFilter,setCategoryFilter] = React.useState('all')
  const [includeDeleted,setIncludeDeleted] = React.useState(false)
  const [localPage,setLocalPage] = React.useState(1)
  const PER_PAGE = 20

  const flash=(type,msg)=>{setNotice({type,msg});setTimeout(()=>setNotice({type:'',msg:''}),5000)}

  const [serverTotal,setServerTotal]   = React.useState(0)
  const [byStatusCounts,setByStatusCounts] = React.useState({})
  const [categoriesList,setCategoriesList] = React.useState([])
  const [debouncedQ,setDebouncedQ] = React.useState('')

  // Debounce search input — avoids hammering the API on every keystroke
  React.useEffect(()=>{
    const t=setTimeout(()=>{setDebouncedQ(searchQ);setLocalPage(1)},300)
    return()=>clearTimeout(t)
  },[searchQ])

  // Server-side fetch — all filtering, sorting, pagination happens in Postgres
  const load=React.useCallback(async()=>{
    setLoading(true);setError('')
    try{
      const params=new URLSearchParams()
      if(includeDeleted)               params.set('include_deleted','true')
      if(statusFilter!=='all')         params.set('status',statusFilter)
      if(typeFilter!=='all')           params.set('provider_type',typeFilter)
      if(categoryFilter!=='all')       params.set('category',categoryFilter)
      if(debouncedQ.trim())            params.set('q',debouncedQ.trim())
      params.set('page',String(localPage))
      params.set('page_size',String(PER_PAGE))
      params.set('sort',sortCol)
      params.set('dir',sortDir)
      const res=await fetch(`/api/admin/gigs?${params}`,{credentials:'same-origin'})
      const data=await res.json().catch(()=>({}))
      if(!res.ok) throw new Error(data?.error?.message||data?.error||'Failed')
      const payload=data?.data??data
      setGigs(payload?.gigs??[])
      setServerTotal(payload?.total??0)
      setByStatusCounts(payload?.byStatus??{})
      setCategoriesList(payload?.categories??[])
    }catch(e){setError(e.message)}
    finally{setLoading(false)}
  },[includeDeleted,statusFilter,typeFilter,categoryFilter,debouncedQ,localPage,sortCol,sortDir])

  React.useEffect(()=>{load()},[load])

  const moderate=async(gigId,action,reason='',category='')=>{
    try{
      const res=await fetch(`/api/admin/gigs/${gigId}/moderate`,{method:'PATCH',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({action,reason,denial_category:category,action_type:action})})
      const data=await res.json().catch(()=>({}))
      if(!res.ok) throw new Error(data?.error?.message||data?.error||'Action failed')
      flash('ok',`Service ${action}d.`)
      await load()
      setSelectedGig(g=>g?.id===gigId?{...g,...(data?.data?.gig||{})}:g)
    }catch(e){flash('err',e.message)}
  }

  const promote=async(gigId,type,days)=>{
    try{
      const res=await fetch(`/api/admin/gigs/${gigId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({[type==='boost'?'boost_days':'feature_days']:days,action_type:'admin_promote'})})
      if(!res.ok){const d=await res.json().catch(()=>({}));throw new Error(d?.error?.message||'Promote failed')}
      flash('ok',`Service ${type}ed for ${days} days.`);await load()
    }catch(e){flash('err',e.message)}
  }

  const rankAdjust=async(gigId,score,reason)=>{
    try{
      const res=await fetch(`/api/admin/gigs/${gigId}/moderate`,{method:'PATCH',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({action:'rank_adjust',rank_score:score,reason,action_type:'rank_adjust'})})
      if(!res.ok){const d=await res.json().catch(()=>({}));throw new Error(d?.error?.message||'Failed')}
      flash('ok',`Rank score set to ${score.toFixed(4)}.`);await load()
    }catch(e){flash('err',e.message)}
  }

  const handleAction=(action,gig)=>{
    if(action==='suspend')        {setSuspendTarget(gig);return}
    if(action==='deny')           {setDenyTarget(gig);return}
    if(action==='promote')        {setPromoteTarget(gig);return}
    if(action==='rank_adjust')    {setRankTarget(gig);return}
    moderate(gig.id,action)
  }

  // Server returns the page already filtered, sorted, and paginated.
  // Keep these locals as pass-throughs so the rest of the JSX needs no rewrite.
  const afterFilters = gigs
  const pagedGigs    = gigs
  const totalPages   = Math.max(1, Math.ceil(serverTotal / PER_PAGE))
  const categories   = categoriesList
  // byStatus comes from the server (counts across all gigs, not just current page)
  const byStatus = byStatusCounts

  const handleSort=col=>{if(sortCol===col)setSortDir(d=>d==='asc'?'desc':'asc');else{setSortCol(col);setSortDir('asc')};setLocalPage(1)}
  const SortArrow=({col})=>sortCol!==col?<span style={{opacity:.25,marginLeft:'3px',fontSize:'10px'}}>⇅</span>:<span style={{color:'#C4A45A',marginLeft:'3px',fontSize:'10px'}}>{sortDir==='asc'?'▲':'▼'}</span>
  const thStyle=col=>({padding:'10px 12px',textAlign:'left',fontSize:'11px',fontWeight:700,color:sortCol===col?'#C4A45A':'rgba(255,255,255,.68)',background:NAVY,whiteSpace:'nowrap',cursor:'pointer',letterSpacing:'.06em',textTransform:'uppercase',borderBottom:'2px solid rgba(255,255,255,.08)',userSelect:'none',transition:'color .12s'})

  const toggleAll=()=>setSelectedRows(prev=>prev.size===pagedGigs.length?new Set():new Set(pagedGigs.map(g=>g.id)))

  return(
    <div style={{padding:'28px',display:'flex',flexDirection:'column',gap:'22px',fontFamily:sans,background:'#F7F5F0',minHeight:'100vh'}}>

      {/* Header */}
      <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',gap:'12px',flexWrap:'wrap'}}>
        <div>
          <div style={{fontSize:'11px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.14em',color:'#9097A8',marginBottom:'4px'}}>Marketplace</div>
          <h2 style={{fontFamily:serif,fontWeight:600,fontSize:'32px',color:NAVY,margin:0,letterSpacing:'-.015em',lineHeight:1.1}}>Service Management</h2>
          <p style={{color:'#9097A8',fontSize:'13px',margin:'5px 0 0'}}>Fiverr-grade gig management — moderation queue, ranking, content scoring, version history.</p>
        </div>
        <button onClick={load} style={{padding:'8px 16px',borderRadius:'6px',border:'1px solid #DDD8CE',background:'#fff',color:NAVY,cursor:'pointer',fontSize:'13px',fontWeight:600,fontFamily:sans}}>↻ Refresh</button>
      </div>

      {/* Notice */}
      {notice.msg&&<div style={{padding:'10px 16px',borderRadius:'7px',fontSize:'13px',fontWeight:600,background:notice.type==='ok'?'#EAF5EE':'#FAEAEA',color:notice.type==='ok'?GREEN:RED,border:`1px solid ${notice.type==='ok'?'rgba(26,107,69,.20)':'rgba(139,26,26,.20)'}`,display:'flex',alignItems:'center',gap:'8px'}}><span>{notice.type==='ok'?'✓':'!'}</span>{notice.msg}</div>}

      {/* Tabs */}
      <div style={{display:'flex',borderBottom:'1px solid #DDD8CE',gap:0,overflowX:'auto',background:'#fff',borderRadius:'8px 8px 0 0',boxShadow:'0 1px 3px rgba(27,45,79,.05)'}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{display:'inline-flex',alignItems:'center',gap:'5px',padding:'12px 18px',fontSize:'13px',fontWeight:tab===t.id?600:400,color:tab===t.id?NAVY:'#9097A8',background:'none',border:'none',borderBottom:tab===t.id?`2px solid ${NAVY}`:'2px solid transparent',cursor:'pointer',whiteSpace:'nowrap',fontFamily:sans}}>
            <span style={{opacity:tab===t.id?1:.6}}>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* ── MOD QUEUE ──────────────────────────────────────────────────────── */}
      {tab==='modqueue'&&<ModQueueTab onSelectGig={setSelectedGig} onAction={handleAction}/>}

      {/* ── ALL SERVICES ───────────────────────────────────────────────────── */}
      {tab==='all'&&(
        <>
          {/* Status strip */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))',gap:'10px'}}>
            {[{k:'all',l:'Total',c:NAVY,n:Object.values(byStatus).reduce((s,v)=>s+v,0)},{k:'active',l:'Active',c:GREEN,n:byStatus.active||0},{k:'pending_review',l:'Pending',c:'#3B82F6',n:byStatus.pending_review||0},{k:'suspended',l:'Suspended',c:AMBER,n:byStatus.suspended||0},{k:'denied',l:'Denied',c:RED,n:byStatus.denied||0},{k:'archived',l:'Archived',c:PURPLE,n:byStatus.archived||0}].map(s=>(
              <button key={s.k} onClick={()=>{setStatusFilter(s.k);setLocalPage(1)}} style={{padding:'12px 14px',borderRadius:'8px',border:`1px solid ${statusFilter===s.k?s.c:'#DDD8CE'}`,background:statusFilter===s.k?`${s.c}12`:'#fff',cursor:'pointer',textAlign:'left',fontFamily:sans}}>
                <div style={{fontSize:'11px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'#9097A8',marginBottom:'4px'}}>{s.l}</div>
                <div style={{fontWeight:800,fontSize:'20px',color:s.c,fontVariantNumeric:'tabular-nums'}}>{loading?'—':s.n}</div>
              </button>
            ))}
          </div>

          {/* Toolbar */}
          <div style={{display:'flex',gap:'10px',flexWrap:'wrap',alignItems:'center'}}>
            <input value={searchQ} onChange={e=>{setSearchQ(e.target.value);setLocalPage(1)}} placeholder="Search title, provider, category…" style={{flex:'1 1 220px',maxWidth:'340px',padding:'8px 12px',borderRadius:'7px',border:'1px solid #DDD8CE',fontSize:'13px',fontFamily:sans,outline:'none'}}/>
            <select value={typeFilter} onChange={e=>{setTypeFilter(e.target.value);setLocalPage(1)}} style={{padding:'8px 12px',borderRadius:'7px',border:'1px solid #DDD8CE',fontSize:'13px',fontFamily:sans,background:'#fff',cursor:'pointer'}}>
              <option value="all">All types</option><option value="attorney">Attorneys</option><option value="consultant">Consultants</option>
            </select>
            <select value={categoryFilter} onChange={e=>{setCategoryFilter(e.target.value);setLocalPage(1)}} style={{padding:'8px 12px',borderRadius:'7px',border:'1px solid #DDD8CE',fontSize:'13px',fontFamily:sans,background:'#fff',cursor:'pointer'}}>
              <option value="all">All categories</option>{categories.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
            <label style={{display:'flex',alignItems:'center',gap:'6px',fontSize:'13px',color:'#5C6070',cursor:'pointer'}}>
              <input type="checkbox" checked={includeDeleted} onChange={e=>setIncludeDeleted(e.target.checked)} style={{accentColor:NAVY}}/> Show deleted
            </label>
            <span style={{marginLeft:'auto',fontSize:'12px',color:'#9097A8'}}>{serverTotal.toLocaleString()} results{selectedRows.size>0&&<span style={{marginLeft:'8px',fontWeight:700,color:NAVY}}>· {selectedRows.size} selected</span>}</span>
          </div>

          {/* Bulk bar */}
          {selectedRows.size>0&&(
            <div style={{background:NAVY,borderRadius:'8px',padding:'12px 16px',display:'flex',alignItems:'center',gap:'12px',flexWrap:'wrap'}}>
              <span style={{fontSize:'13px',fontWeight:600,color:'#fff'}}>{selectedRows.size} selected</span>
              <button onClick={()=>[...selectedRows].forEach(id=>moderate(id,'suspend','Bulk admin action','spam'))} style={{padding:'6px 14px',borderRadius:'5px',border:'1px solid rgba(255,255,255,.20)',background:'rgba(255,255,255,.08)',color:'#fff',cursor:'pointer',fontSize:'12px',fontWeight:600,fontFamily:sans}}>⚠ Bulk Suspend</button>
              <button onClick={()=>[...selectedRows].forEach(id=>moderate(id,'archive'))} style={{padding:'6px 14px',borderRadius:'5px',border:'1px solid rgba(255,255,255,.20)',background:'rgba(255,255,255,.08)',color:'#fff',cursor:'pointer',fontSize:'12px',fontWeight:600,fontFamily:sans}}>📦 Bulk Archive</button>
              <button onClick={()=>setSelectedRows(new Set())} style={{padding:'6px 12px',borderRadius:'5px',border:'1px solid rgba(255,255,255,.15)',background:'transparent',color:'rgba(255,255,255,.60)',cursor:'pointer',fontSize:'12px',fontFamily:sans}}>Clear</button>
            </div>
          )}

          {/* Table */}
          {error?<div style={{background:'#FAEAEA',border:'1px solid rgba(139,26,26,.20)',borderRadius:'8px',padding:'20px',fontSize:'14px',color:RED}}>{error} — <button onClick={load} style={{background:'none',border:'none',color:RED,cursor:'pointer',textDecoration:'underline',fontSize:'13px'}}>Retry</button></div>:(
            <div style={{background:'#fff',border:'1px solid #DDD8CE',borderRadius:'8px',overflow:'hidden',boxShadow:'0 1px 4px rgba(27,45,79,.06)'}}>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',minWidth:'960px'}}>
                  <thead>
                    <tr>
                      <th style={{...thStyle(''),width:'40px',cursor:'default',padding:'10px 10px 10px 16px'}}><input type="checkbox" checked={pagedGigs.length>0&&selectedRows.size===pagedGigs.length} onChange={toggleAll} style={{width:'14px',height:'14px',cursor:'pointer',accentColor:'#C4A45A'}}/></th>
                      {[{col:'title',label:'Service'},{col:'provider_type',label:'Type'},{col:'status',label:'Status'},{col:'category',label:'Category'},{col:'min_price',label:'From'},{col:'content_score',label:'Score'},{col:'rank_score',label:'Rank'},{col:'auto_flag_score',label:'Flag'},{col:'impressions',label:'Views'},{col:'created_at',label:'Created'}].map(({col,label})=>(
                        <th key={col} style={thStyle(col)} onClick={()=>handleSort(col)}>{label}<SortArrow col={col}/></th>
                      ))}
                      <th style={{...thStyle(''),cursor:'default'}}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading?[1,2,3,4,5].map(i=><tr key={i} style={{background:i%2===0?'#fff':'#FAFAF8'}}>{Array.from({length:12}).map((_,j)=><td key={j} style={{padding:'13px'}}><div style={{height:'13px',background:'#F2EFE9',borderRadius:'3px',width:j===0?'80%':'55%'}}/></td>)}</tr>)
                    :pagedGigs.length===0?<tr><td colSpan={12} style={{padding:'48px',textAlign:'center',color:'#9097A8',fontSize:'14px'}}>No services match the current filters.</td></tr>
                    :pagedGigs.map((g,i)=>{
                      const isSelected=selectedRows.has(g.id)
                      return(
                        <tr key={g.id} style={{background:isSelected?'rgba(196,164,90,.07)':i%2===0?'#fff':'#FAFAF8',borderBottom:'1px solid #F2EFE9',transition:'background 80ms'}}>
                          <td style={{padding:'11px 10px 11px 16px'}}><input type="checkbox" checked={isSelected} onChange={()=>setSelectedRows(prev=>{const n=new Set(prev);n.has(g.id)?n.delete(g.id):n.add(g.id);return n})} style={{width:'14px',height:'14px',cursor:'pointer',accentColor:'#C4A45A'}}/></td>
                          <td style={{padding:'11px 12px'}}>
                            <div style={{fontWeight:600,fontSize:'13px',color:NAVY,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'200px'}} title={g.title}>{g.title||'Untitled'}</div>
                            <div style={{fontSize:'11px',color:'#9097A8',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'200px'}}>{g.provider?.name||'—'}</div>
                          </td>
                          <td style={{padding:'11px 12px'}}><span style={{display:'inline-block',padding:'2px 7px',borderRadius:'4px',fontSize:'11px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em',background:g.provider_type==='attorney'?'#EAF0F7':'#F5F3FF',color:PROVIDER_COLORS[g.provider_type]||NAVY}}>{g.provider_type==='attorney'?'⚖':'👤'} {g.provider_type}</span></td>
                          <td style={{padding:'11px 12px'}}><StatusPill status={g.status}/></td>
                          <td style={{padding:'11px 12px',fontSize:'12px',color:'#9097A8'}}>{g.category||'—'}</td>
                          <td style={{padding:'11px 12px',fontWeight:700,fontSize:'13px',color:NAVY,fontVariantNumeric:'tabular-nums'}}>{g.min_price?fmt(g.min_price):'—'}</td>
                          <td style={{padding:'11px 12px'}}><ScoreBar score={g.content_score} compact/></td>
                          <td style={{padding:'11px 12px',fontSize:'12px',color:'#9097A8',fontVariantNumeric:'tabular-nums'}}>{g.rank_score!=null?Number(g.rank_score).toFixed(3):'—'}</td>
                          <td style={{padding:'11px 12px'}}><FlagBadge score={g.auto_flag_score}/></td>
                          <td style={{padding:'11px 12px',fontSize:'13px',color:'#9097A8',textAlign:'right',fontVariantNumeric:'tabular-nums'}}>{fmtN(g.impressions,true)}</td>
                          <td style={{padding:'11px 12px',fontSize:'12px',color:'#9097A8',whiteSpace:'nowrap'}}>{ago(g.created_at)}</td>
                          <td style={{padding:'11px 12px',whiteSpace:'nowrap'}}>
                            <div style={{display:'flex',gap:'5px'}}>
                              <button onClick={()=>setSelectedGig(g)} style={{padding:'5px 10px',borderRadius:'5px',border:'1px solid #DDD8CE',background:'#F7F5F0',color:NAVY,cursor:'pointer',fontSize:'12px',fontWeight:600,fontFamily:sans}}>View</button>
                              {!['suspended','deleted'].includes(g.status)&&<button onClick={()=>setSuspendTarget(g)} style={{padding:'5px 10px',borderRadius:'5px',border:'1px solid rgba(139,94,10,.30)',background:'#FEF5E4',color:AMBER,cursor:'pointer',fontSize:'12px',fontWeight:600,fontFamily:sans}}>Suspend</button>}
                              {g.status==='suspended'&&<button onClick={()=>moderate(g.id,'unsuspend')} style={{padding:'5px 10px',borderRadius:'5px',border:'1px solid rgba(26,107,69,.30)',background:'#EAF5EE',color:GREEN,cursor:'pointer',fontSize:'12px',fontWeight:600,fontFamily:sans}}>Restore</button>}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {pagedGigs.length>0&&!loading&&(
                    <tfoot><tr style={{background:'#F8F7F4',borderTop:'2px solid #DDD8CE'}}>
                      <td colSpan={5} style={{padding:'9px 12px',fontSize:'12px',color:'#9097A8',fontWeight:600}}>{(localPage-1)*PER_PAGE+1}–{Math.min(localPage*PER_PAGE,serverTotal)} of {serverTotal.toLocaleString()}</td>
                      <td colSpan={7}/>
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

      {tab==='metrics'&&<StatsTab/>}
      {tab==='levels'&&<SellerLevelsTab/>}

      {/* Drawers + modals */}
      {selectedGig&&<GigDrawer gig={selectedGig} onClose={()=>setSelectedGig(null)} onAction={handleAction}/>}
      {suspendTarget&&<SuspendModal gig={suspendTarget} onClose={()=>setSuspendTarget(null)} onConfirm={async(id,reason,category)=>{await moderate(id,'suspend',reason,category);setSuspendTarget(null)}}/>}
      {denyTarget&&<DenyModal gig={denyTarget} onClose={()=>setDenyTarget(null)} onConfirm={async(id,reason,category)=>{await moderate(id,'deny',reason,category);setDenyTarget(null)}}/>}
      {promoteTarget&&<PromoteModal gig={promoteTarget} onClose={()=>setPromoteTarget(null)} onConfirm={async(id,type,days)=>{await promote(id,type,days);setPromoteTarget(null)}}/>}
      {rankTarget&&<RankModal gig={rankTarget} onClose={()=>setRankTarget(null)} onConfirm={async(id,score,reason)=>{await rankAdjust(id,score,reason);setRankTarget(null)}}/>}
    </div>
  )
}
