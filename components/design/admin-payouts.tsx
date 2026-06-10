'use client'
import React from 'react'
import { C, Card, Btn, Avatar } from './shared'

// ─── Tokens ───────────────────────────────────────────────────────────────────
const serif = "var(--portal-font-display, 'Cormorant Garamond', Georgia, serif)"
const sans  = C.sans
const NAVY  = 'var(--portal-ink, #0F172A)', GOLD = 'var(--portal-gold, #9A7B3B)', GREEN = 'var(--portal-moss, #1A6B45)'
const AMBER = '#8B5E0A', RED  = 'var(--portal-brick, #8B1A1A)', PURPLE = '#3D2B6B'

const PAYOUT_STATUS = {
  pending:     { bg:'#FEF5E4', text:AMBER,  border:'rgba(139,94,10,.25)',  dot:'#F59E0B', label:'Pending'     },
  transferred: { bg:'#EAF5EE', text:GREEN,  border:'rgba(26,107,69,.22)',  dot:'#22C55E', label:'Transferred'  },
  failed:      { bg:'#FAEAEA', text:RED,    border:'rgba(139,26,26,.22)',  dot:'#EF4444', label:'Failed'       },
  skipped:     { bg:'var(--portal-rule-soft, #F2EFE9)', text:'var(--portal-ink-soft, #9097A8)', border:'rgba(0,0,0,.10)',   dot:'var(--portal-ink-soft, #9097A8)', label:'Skipped'      },
}

const CONNECT_STATUS = {
  active:      { bg:'#EAF5EE', text:GREEN,  label:'Active'      },
  pending:     { bg:'#FEF5E4', text:AMBER,  label:'Pending'     },
  not_started: { bg:'var(--portal-rule-soft, #F2EFE9)', text:'var(--portal-ink-soft, #9097A8)', label:'Not started'},
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const $ = (n, compact=false) => {
  const v=Number(n)||0
  if(compact&&v>=1e6) return `$${(v/1e6).toFixed(1)}M`
  if(compact&&v>=1e3) return `$${(v/1e3).toFixed(1)}K`
  return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:0}).format(v)
}
const $c = n => $(n/100)  // cents to formatted
const ago = (s: any) => { if(!s) return '—'; const d=Math.floor((Date.now()-new Date(s).getTime())/86400000); return d===0?'Today':d===1?'Yesterday':d<30?`${d}d ago`:`${new Date(s).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}`; }

const PayPill = ({status}: any) => { const c=PAYOUT_STATUS[status]||PAYOUT_STATUS.pending; return <span style={{display:'inline-flex',alignItems:'center',gap:'4px',padding:'3px 8px 3px 6px',borderRadius:'4px',fontSize:'11px',fontWeight:700,letterSpacing:'.04em',textTransform:'uppercase',background:c.bg,color:c.text,border:`1px solid ${c.border}`}}><span style={{width:'5px',height:'5px',borderRadius:'50%',background:c.dot,display:'inline-block'}}/>{c.label}</span>}
const ConnPill = ({status,bypass}: any) => { const c=CONNECT_STATUS[status]||CONNECT_STATUS.not_started; return <span style={{display:'inline-flex',alignItems:'center',gap:'4px',padding:'3px 8px',borderRadius:'4px',fontSize:'11px',fontWeight:700,background:c.bg,color:c.text}}>{bypass?'🔓 Bypass':c.label}</span>}

// ─── KPI card ─────────────────────────────────────────────────────────────────
const Kpi = ({label,value,sub,accent=NAVY,icon,onClick}: any) => {
  const [h,setH]=React.useState(false)
  return <div onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} onClick={onClick} style={{background:'#fff',border:`1px solid ${h&&onClick?NAVY:'var(--portal-rule, #DDD8CE)'}`,borderTop:`3px solid ${accent}`,borderRadius:'8px',padding:'16px 18px',cursor:onClick?'pointer':'default',boxShadow:h&&onClick?'0 4px 12px rgba(27,45,79,.12)':'0 1px 3px rgba(27,45,79,.05)',transition:'all .15s',display:'flex',flexDirection:'column',gap:'5px'}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}><span style={{fontSize:'11px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.08em',color:'var(--portal-ink-soft, #9097A8)'}}>{label}</span><span style={{fontSize:'15px',opacity:.4}}>{icon}</span></div>
    <div style={{fontWeight:800,fontSize:'24px',color:NAVY,letterSpacing:'-.02em',lineHeight:1,fontVariantNumeric:'tabular-nums'}}>{value}</div>
    {sub&&<div style={{fontSize:'12px',color:'var(--portal-ink-soft, #9097A8)',lineHeight:1.4}}>{sub}</div>}
  </div>
}

// ─── Data table ───────────────────────────────────────────────────────────────
const DT = ({cols,rows,empty='No data'}: any) => <div style={{background:'#fff',border:'1px solid #DDD8CE',borderRadius:'8px',overflow:'hidden'}}>
  <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',minWidth:`${cols.length*110}px`}}>
    <thead><tr>{cols.map(c=><th key={c.k} style={{padding:'10px 13px',textAlign:c.r?'right':'left',fontSize:'11px',fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:'rgba(255,255,255,.70)',background:NAVY,whiteSpace:'nowrap',borderBottom:'2px solid rgba(255,255,255,.08)'}}>{c.l}</th>)}</tr></thead>
    <tbody>{rows.length===0?<tr><td colSpan={cols.length} style={{padding:'32px',textAlign:'center',color:'var(--portal-ink-soft, #9097A8)',fontSize:'13px'}}>{empty}</td></tr>:rows.map((row,ri)=><tr key={ri} style={{background:ri%2===0?'#fff':'var(--portal-surface-2, #FAFAF8)',borderBottom:'1px solid #F2EFE9'}}>{cols.map(c=><td key={c.k} style={{padding:'10px 13px',fontSize:'13px',textAlign:c.r?'right':'left',color:c.dim?'var(--portal-ink-soft, #9097A8)':NAVY,fontWeight:c.bold?700:400,whiteSpace:c.wrap?'normal':'nowrap',fontVariantNumeric:'tabular-nums'}}>{row[c.k]??'—'}</td>)}</tr>)}</tbody>
  </table></div>
</div>

// ─── Section ──────────────────────────────────────────────────────────────────
const Sec = ({title,sub,right,children}: any) => <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
  <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',gap:'12px'}}>
    <div><h3 style={{fontFamily:serif,fontWeight:600,fontSize:'20px',color:NAVY,margin:0,letterSpacing:'-.01em'}}>{title}</h3>{sub&&<p style={{margin:'3px 0 0',fontSize:'13px',color:'var(--portal-ink-soft, #9097A8)'}}>{sub}</p>}</div>
    {right}
  </div>
  {children}
</div>

// ─── Notice bar ───────────────────────────────────────────────────────────────
const Notice = ({msg,type='ok',onClose}: any) => msg ? <div style={{padding:'10px 16px',borderRadius:'7px',fontSize:'13px',fontWeight:600,background:type==='ok'?'#EAF5EE':'#FAEAEA',color:type==='ok'?GREEN:RED,border:`1px solid ${type==='ok'?'rgba(26,107,69,.20)':'rgba(139,26,26,.20)'}`,display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px'}}>
  <span>{type==='ok'?'✓':type==='warn'?'⚠':'!'} {msg}</span>
  {onClose&&<button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',color:'inherit',fontSize:'14px'}}>✕</button>}
</div> : null

// ─── Confirm modal ────────────────────────────────────────────────────────────
const ConfirmModal = ({open,title,body,onConfirm,onClose,loading,danger=false}: any) => !open?null:(
  <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.55)',zIndex:400,display:'flex',alignItems:'center',justifyContent:'center',padding:'24px'}}>
    <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:'10px',padding:'28px',width:'100%',maxWidth:'420px',boxShadow:'0 20px 60px rgba(0,0,0,.22)',fontFamily:sans}}>
      <h3 style={{fontFamily:serif,fontWeight:600,fontSize:'20px',color:NAVY,margin:'0 0 12px'}}>{title}</h3>
      <p style={{fontSize:'13px',color:'var(--portal-ink-mid, #5C6070)',lineHeight:1.6,margin:'0 0 20px'}}>{body}</p>
      <div style={{display:'flex',gap:'8px',justifyContent:'flex-end'}}>
        <button onClick={onClose} disabled={loading} style={{padding:'8px 18px',borderRadius:'6px',border:'1px solid #DDD8CE',background:'#fff',color:'var(--portal-ink-mid, #5C6070)',cursor:'pointer',fontSize:'13px',fontWeight:600,fontFamily:sans}}>Cancel</button>
        <button onClick={onConfirm} disabled={loading} style={{padding:'8px 18px',borderRadius:'6px',border:'none',background:danger?RED:NAVY,color:'#fff',cursor:loading?'not-allowed':'pointer',fontSize:'13px',fontWeight:700,fontFamily:sans,opacity:loading?.7:1}}>
          {loading?'Processing…':'Confirm'}
        </button>
      </div>
    </div>
  </div>
)

// ─── Hook: fetch ──────────────────────────────────────────────────────────────
function useFetch(url: string) {
  const [data,setData]=React.useState(null)
  const [loading,setLoading]=React.useState(true)
  const [error,setError]=React.useState('')
  const load=React.useCallback(async()=>{
    setLoading(true);setError('')
    try{
      const res=await fetch(url,{credentials:'same-origin'})
      const json=await res.json().catch(()=>({}))
      if(!res.ok)throw new Error(json?.error?.message||json?.error||'Failed')
      setData(json?.data??json)
    }catch(e){setError(e.message)}finally{setLoading(false)}
  },[url])
  React.useEffect(()=>{load()},[load])
  return{data,loading,error,reload:load}
}

const post = async(url,body={}) => {
  const res=await fetch(url,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
  const json=await res.json().catch(()=>({}))
  if(!res.ok)throw new Error(json?.error?.message||json?.error||'Request failed')
  return json?.data??json
}

const patch = async(url,body={}) => {
  const res=await fetch(url,{method:'PATCH',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
  const json=await res.json().catch(()=>({}))
  if(!res.ok)throw new Error(json?.error?.message||json?.error||'Request failed')
  return json?.data??json
}

// ─── TABS ─────────────────────────────────────────────────────────────────────
const TABS=[
  {id:'overview',  label:'Overview',        icon:'📊'},
  {id:'queue',     label:'Payout Queue',    icon:'⚡'},
  {id:'providers', label:'Provider Ledger', icon:'👤'},
  {id:'connect',   label:'Payout Connect',  icon:'🔗'},
  {id:'refunds',   label:'Refunds',         icon:'↩'},
]

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function AdminPayouts({ formatPrimary }: any) {
  const [tab,setTab]           = React.useState('overview')
  const [notice,setNotice]     = React.useState({msg:'',type:'ok'})
  const [confirm,setConfirm]   = React.useState(null)
  const [busy,setBusy]         = React.useState(false)
  const [selectedRows,setSelectedRows] = React.useState(new Set())
  const [queueFilter,setQueueFilter]   = React.useState('all')
  const [searchQ,setSearchQ]           = React.useState('')

  const queueData    = useFetch('/api/admin/payouts')
  const providerData = useFetch('/api/admin/payouts/providers')
  const connectData  = useFetch('/api/admin/payouts/connect')
  const refundData   = useFetch('/api/admin/payouts/refunds')
  const [batchRunning,setBatchRunning] = React.useState(false)

  const flash = (msg,type='ok') => { setNotice({msg,type}); setTimeout(()=>setNotice({msg:'',type:'ok'}),5000) }

  const runWeeklyBatch = async () => {
    if (batchRunning) return
    if (typeof window !== 'undefined' && !window.confirm('Run the weekly payout batch now? This pays out all releasable earnings, grouped per provider.')) return
    setBatchRunning(true)
    try {
      const r = await post('/api/admin/payouts/run-weekly-batch', {})
      flash(`Weekly batch ${r.weekTag}: paid ${r.providerCount} provider${r.providerCount===1?'':'s'} · ${$c(r.totalCents)} total${r.skipped?.length?` · ${r.skipped.length} skipped`:''}`, 'ok')
      queueData.reload(); providerData.reload()
    } catch (e) {
      flash(e.message || 'Weekly batch failed', 'err')
    } finally {
      setBatchRunning(false)
    }
  }

  const releaseOne = async(orderId, providerName) => {
    setConfirm({
      title:'Release Payout',
      body:`Transfer earnings to ${providerName} for this order. This will create a transfer immediately.`,
      onConfirm: async()=>{
        setBusy(true)
        try{
          const r=await post('/api/admin/payouts/release',{order_id:orderId,reason:'Admin manual release'})
          if(r.transferred) flash(`✓ Transfer successful — ${r.transfer_id}`)
          else if(r.skipped) flash(`Skipped: ${r.reason}`,'warn')
          else flash(`Failed: ${r.error}`,'err')
          queueData.reload(); providerData.reload()
        }catch(e){flash(e.message,'err')}
        finally{setBusy(false);setConfirm(null)}
      }
    })
  }

  const releaseBatch = async() => {
    const ids=[...selectedRows]
    if(!ids.length)return
    setConfirm({
      title:`Release ${ids.length} Payout${ids.length>1?'s':''}`,
      body:`This will create payout transfers for ${ids.length} order${ids.length>1?'s':''} simultaneously. Only providers with completed payout setup will receive funds.`,
      onConfirm: async()=>{
        setBusy(true)
        try{
          const r=await post('/api/admin/payouts/release?batch=true',{order_ids:ids,reason:'Admin batch release'})
          flash(`Batch complete: ${r.transferred} transferred, ${r.failed} failed`)
          setSelectedRows(new Set())
          queueData.reload(); providerData.reload()
        }catch(e){flash(e.message,'err')}
        finally{setBusy(false);setConfirm(null)}
      }
    })
  }

  const toggleBypass = async(provider, currentBypass) => {
    setConfirm({
      title: currentBypass ? 'Disable Payout Bypass' : 'Enable Payout Bypass',
      body:  currentBypass
        ? `Remove bypass for ${provider.name}. They will need a completed payout setup to receive payouts.`
        : `Grant ${provider.name} a payout bypass. Payouts will process even before their account is fully verified. Use carefully.`,
      danger: !currentBypass,
      onConfirm: async()=>{
        setBusy(true)
        try{
          await patch('/api/admin/payouts/connect',{provider_id:provider.provider_id,provider_role:provider.role,bypass:!currentBypass,reason:'Admin toggle'})
          flash(`Bypass ${!currentBypass?'enabled':'disabled'} for ${provider.name}`)
          connectData.reload()
        }catch(e){flash(e.message,'err')}
        finally{setBusy(false);setConfirm(null)}
      }
    })
  }

  // Queue data
  const qOrders = (queueData.data?.orders||[])
  const qSummary= queueData.data?.summary||{}
  const filteredQueue = qOrders
    .filter(o=> queueFilter==='all' || o.payout_status===queueFilter)
    .filter(o=> !searchQ || o.provider_name?.toLowerCase().includes(searchQ.toLowerCase()) || o.id?.toLowerCase().includes(searchQ.toLowerCase()))

  const allPageSelected = filteredQueue.length>0 && filteredQueue.every(o=>selectedRows.has(o.id))
  const toggleAll = () => setSelectedRows(prev => allPageSelected ? new Set() : new Set(filteredQueue.map(o=>o.id)))

  return (
    <div style={{padding:'28px',display:'flex',flexDirection:'column',gap:'22px',fontFamily:sans,background:'var(--portal-bg, #F7F5F0)',minHeight:'100vh'}}>

      {/* Header */}
      <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',gap:'12px',flexWrap:'wrap'}}>
        <div>
          <div style={{fontSize:'11px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.14em',color:'var(--portal-ink-soft, #9097A8)',marginBottom:'4px'}}>Finance</div>
          <h2 style={{fontFamily:serif,fontWeight:600,fontSize:'34px',color:NAVY,margin:0,letterSpacing:'-.015em',lineHeight:1.1}}>Payout Centre</h2>
          <p style={{color:'var(--portal-ink-soft, #9097A8)',fontSize:'13px',margin:'5px 0 0'}}>Full payout management — queue, release, monitor, and audit every disbursement.</p>
        </div>
        <div style={{display:'flex',gap:'8px'}}>
          <button onClick={()=>{queueData.reload();providerData.reload();connectData.reload();refundData.reload()}} style={{padding:'8px 16px',borderRadius:'6px',border:'1px solid #DDD8CE',background:'#fff',color:NAVY,cursor:'pointer',fontSize:'13px',fontWeight:600,fontFamily:sans}}>↻ Refresh all</button>
        </div>
      </div>

      {/* Notice */}
      <Notice msg={notice.msg} type={notice.type} onClose={()=>setNotice({msg:'',type:'ok'})}/>

      {/* Tabs */}
      <div style={{display:'flex',borderBottom:'1px solid #DDD8CE',gap:0,overflowX:'auto',background:'#fff',borderRadius:'8px 8px 0 0',boxShadow:'0 1px 3px rgba(27,45,79,.05)'}}>
        {TABS.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{display:'inline-flex',alignItems:'center',gap:'5px',padding:'12px 18px',fontSize:'13px',fontWeight:tab===t.id?600:400,color:tab===t.id?NAVY:'var(--portal-ink-soft, #9097A8)',background:'none',border:'none',borderBottom:tab===t.id?`2px solid ${NAVY}`:'2px solid transparent',cursor:'pointer',whiteSpace:'nowrap',fontFamily:sans}}>
          <span style={{opacity:tab===t.id?1:.6}}>{t.icon}</span> {t.label}
          {t.id==='queue'&&qSummary.pending>0&&<span style={{marginLeft:'4px',padding:'1px 6px',borderRadius:'10px',background:AMBER,color:'#fff',fontSize:'10px',fontWeight:700}}>{qSummary.pending}</span>}
        </button>)}
      </div>

      {/* ── OVERVIEW ──────────────────────────────────────────────────────── */}
      {tab==='overview'&&(
        <>
          {/* Weekly payout batch — auto-reconciled from provider_earnings */}
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap',background:'#fff',border:'1px solid #DDD8CE',borderRadius:10,padding:'14px 18px',marginBottom:12}}>
            <div>
              <div style={{fontWeight:700,color:NAVY,fontSize:14}}>Weekly payout batch</div>
              <div style={{color:'var(--portal-ink-mid, #5C6070)',fontSize:12.5,marginTop:2,lineHeight:1.5}}>
                {$c(qSummary.total_pending_cents)} releasable across {qSummary.pending||0} order{qSummary.pending===1?'':'s'} is queued for payout.
                Processed automatically every <strong>Tuesday</strong>; run it now if needed.
              </div>
            </div>
            <button type="button" onClick={runWeeklyBatch} disabled={batchRunning}
              style={{background:NAVY,color:'#fff',border:'none',borderRadius:8,padding:'9px 16px',fontSize:13,fontWeight:700,cursor:batchRunning?'wait':'pointer',opacity:batchRunning?0.7:1,whiteSpace:'nowrap'}}>
              {batchRunning?'Processing…':'Run weekly batch now'}
            </button>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(185px,1fr))',gap:'12px'}}>
            <Kpi label="Pending Release" value={$c(qSummary.total_pending_cents)} sub={`${qSummary.pending||0} orders waiting`} accent={AMBER} icon="⏳" onClick={()=>setTab('queue')}/>
            <Kpi label="Total Transferred" value={$c(qSummary.total_transferred_cents)} sub={`${qSummary.transferred||0} completed`} accent={GREEN} icon="✅"/>
            <Kpi label="Failed Payouts" value={$c(qSummary.total_failed_cents)} sub={`${qSummary.failed||0} orders`} accent={qSummary.failed>0?RED:'var(--portal-ink-soft, #9097A8)'} icon="⚠" onClick={()=>{setQueueFilter('failed');setTab('queue')}}/>
            <Kpi label="Active Providers" value={connectData.data?.summary?.active||0} sub={`${connectData.data?.summary?.bypassed||0} on bypass`} accent={NAVY} icon="🔗" onClick={()=>setTab('connect')}/>
            <Kpi label="Pending Connect" value={connectData.data?.summary?.not_started||0} sub="Need payout onboarding" accent={connectData.data?.summary?.not_started>0?AMBER:'var(--portal-ink-soft, #9097A8)'} icon="🔓" onClick={()=>setTab('connect')}/>
            <Kpi label="Total Refunds" value={$(refundData.data?.summary?.total_amount)} sub={`${refundData.data?.summary?.total_refunds||0} refunds`} accent={PURPLE} icon="↩" onClick={()=>setTab('refunds')}/>
          </div>

          {/* Transfer ledger summary */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px'}}>
            <Sec title="Payout Status Breakdown">
              <Card style={{padding:'20px'}}>
                {[
                  {label:'Pending release', value:qSummary.pending||0, amount:$c(qSummary.total_pending_cents), color:AMBER},
                  {label:'Transferred', value:qSummary.transferred||0, amount:$c(qSummary.total_transferred_cents), color:GREEN},
                  {label:'Failed', value:qSummary.failed||0, amount:$c(qSummary.total_failed_cents), color:RED},
                ].map(row=>(
                  <div key={row.label} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 0',borderBottom:'1px solid #F2EFE9'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                      <span style={{width:'8px',height:'8px',borderRadius:'50%',background:row.color,display:'inline-block'}}/>
                      <span style={{fontSize:'13px',color:'var(--portal-ink-mid, #5C6070)'}}>{row.label}</span>
                    </div>
                    <div style={{textAlign:'right'}}>
                      <div style={{fontWeight:700,fontSize:'13px',color:NAVY}}>{row.amount}</div>
                      <div style={{fontSize:'11px',color:'var(--portal-ink-soft, #9097A8)'}}>{row.value} order{row.value!==1?'s':''}</div>
                    </div>
                  </div>
                ))}
              </Card>
            </Sec>

            <Sec title="Payout Setup Health">
              <Card style={{padding:'20px'}}>
                {connectData.loading ? <div style={{color:'var(--portal-ink-soft, #9097A8)',fontSize:'13px'}}>Loading…</div> : [
                  {label:'Fully onboarded', value:connectData.data?.summary?.active||0, color:GREEN},
                  {label:'Pending verification', value:connectData.data?.summary?.pending||0, color:AMBER},
                  {label:'Not started', value:connectData.data?.summary?.not_started||0, color:RED},
                  {label:'Admin bypass active', value:connectData.data?.summary?.bypassed||0, color:GOLD},
                ].map(row=>(
                  <div key={row.label} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 0',borderBottom:'1px solid #F2EFE9'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                      <span style={{width:'8px',height:'8px',borderRadius:'50%',background:row.color,display:'inline-block'}}/>
                      <span style={{fontSize:'13px',color:'var(--portal-ink-mid, #5C6070)'}}>{row.label}</span>
                    </div>
                    <span style={{fontWeight:700,fontSize:'14px',color:NAVY}}>{row.value}</span>
                  </div>
                ))}
              </Card>
            </Sec>
          </div>

          <Sec title="Top Providers by Pending Payout" sub="Ranked by amount awaiting transfer">
            <DT
              cols={[{k:'rank',l:'#',dim:true},{k:'name',l:'Provider'},{k:'role',l:'Type'},{k:'pending',l:'Pending',r:true,bold:true},{k:'transferred',l:'Transferred',r:true},{k:'orders',l:'Orders',r:true,dim:true},{k:'connect',l:'Connect'}]}
              rows={(providerData.data?.providers||[]).filter(p=>p.pending>0).slice(0,10).map((p,i)=>({rank:`#${i+1}`,name:p.name,role:p.role==='attorney'?'⚖️ Attorney':'👤 Consultant',pending:$(p.pending),transferred:$(p.transferred),orders:p.order_count,connect:<ConnPill status={p.connect_ready?'active':'not_started'} bypass={p.bypass_active}/>}))}
              empty="No pending payouts"/>
          </Sec>
        </>
      )}

      {/* ── QUEUE ─────────────────────────────────────────────────────────── */}
      {tab==='queue'&&(
        <>
          {/* Toolbar */}
          <div style={{display:'flex',gap:'10px',flexWrap:'wrap',alignItems:'center'}}>
            <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="Search provider or order ID…"
              style={{flex:'1 1 220px',maxWidth:'320px',padding:'8px 12px',borderRadius:'7px',border:'1px solid #DDD8CE',fontSize:'13px',fontFamily:sans,outline:'none'}}/>
            <div style={{display:'flex',gap:'6px'}}>
              {['all','pending','transferred','failed'].map(s=>(
                <button key={s} onClick={()=>setQueueFilter(s)} style={{padding:'7px 14px',borderRadius:'6px',border:`1px solid ${queueFilter===s?NAVY:'var(--portal-rule, #DDD8CE)'}`,background:queueFilter===s?NAVY:'#fff',color:queueFilter===s?'#fff':'var(--portal-ink-mid, #5C6070)',cursor:'pointer',fontSize:'12px',fontWeight:600,fontFamily:sans,textTransform:'capitalize'}}>
                  {s==='all'?'All':s}
                </button>
              ))}
            </div>
            <span style={{marginLeft:'auto',fontSize:'12px',color:'var(--portal-ink-soft, #9097A8)'}}>
              {filteredQueue.length} orders{selectedRows.size>0&&<span style={{marginLeft:'8px',fontWeight:700,color:NAVY}}>· {selectedRows.size} selected</span>}
            </span>
          </div>

          {/* Bulk actions bar */}
          {selectedRows.size>0&&(
            <div style={{background:NAVY,borderRadius:'8px',padding:'12px 16px',display:'flex',alignItems:'center',gap:'12px',flexWrap:'wrap'}}>
              <span style={{fontSize:'13px',fontWeight:600,color:'#fff'}}>{selectedRows.size} selected</span>
              <button onClick={releaseBatch} disabled={busy} style={{padding:'7px 16px',borderRadius:'5px',border:'1px solid rgba(255,255,255,.20)',background:'rgba(255,255,255,.10)',color:'#fff',cursor:busy?'not-allowed':'pointer',fontSize:'12px',fontWeight:600,fontFamily:sans}}>
                ⚡ Release {selectedRows.size} payout{selectedRows.size>1?'s':''}
              </button>
              <button onClick={()=>setSelectedRows(new Set())} style={{padding:'7px 12px',borderRadius:'5px',border:'1px solid rgba(255,255,255,.15)',background:'transparent',color:'rgba(255,255,255,.60)',cursor:'pointer',fontSize:'12px',fontFamily:sans}}>Clear</button>
            </div>
          )}

          {/* Queue table */}
          <div style={{background:'#fff',border:'1px solid #DDD8CE',borderRadius:'8px',overflow:'hidden',boxShadow:'0 1px 4px rgba(27,45,79,.06)'}}>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',minWidth:'860px'}}>
                <thead>
                  <tr>
                    <th style={{padding:'10px 10px 10px 16px',background:NAVY,borderBottom:'2px solid rgba(255,255,255,.08)',width:'40px'}}>
                      <input type="checkbox" checked={allPageSelected} onChange={toggleAll} style={{width:'14px',height:'14px',cursor:'pointer',accentColor:'#C4A45A'}}/>
                    </th>
                    {[{l:'Order ID',r:false},{l:'Provider',r:false},{l:'Status',r:false},{l:'Connect',r:false},{l:'Gross',r:true},{l:'Provider Share',r:true},{l:'Platform Fee',r:true},{l:'Wait',r:false},{l:'Action',r:false}].map(h=>(
                      <th key={h.l} style={{padding:'10px 13px',textAlign:h.r?'right':'left',fontSize:'11px',fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:'rgba(255,255,255,.70)',background:NAVY,whiteSpace:'nowrap',borderBottom:'2px solid rgba(255,255,255,.08)'}}>{h.l}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {queueData.loading ? [1,2,3,4,5].map(i=>(
                    <tr key={i} style={{background:i%2===0?'#fff':'var(--portal-surface-2, #FAFAF8)'}}>
                      {Array.from({length:10}).map((_,j)=><td key={j} style={{padding:'13px'}}><div style={{height:'14px',background:'var(--portal-rule-soft, #F2EFE9)',borderRadius:'3px',width:j===0?'80%':'60%'}}/></td>)}
                    </tr>
                  )) : filteredQueue.length===0 ? (
                    <tr><td colSpan={10} style={{padding:'48px',textAlign:'center',color:'var(--portal-ink-soft, #9097A8)',fontSize:'14px'}}>No orders match the current filter.</td></tr>
                  ) : filteredQueue.map((o,i)=>{
                    const isSelected=selectedRows.has(o.id)
                    return(
                      <tr key={o.id} style={{background:isSelected?'rgba(196,164,90,.07)':i%2===0?'#fff':'var(--portal-surface-2, #FAFAF8)',borderBottom:'1px solid #F2EFE9'}}>
                        <td style={{padding:'11px 10px 11px 16px'}}><input type="checkbox" checked={isSelected} onChange={()=>setSelectedRows(prev=>{const n=new Set(prev);n.has(o.id)?n.delete(o.id):n.add(o.id);return n})} style={{width:'14px',height:'14px',cursor:'pointer',accentColor:'#C4A45A'}}/></td>
                        <td style={{padding:'11px 13px'}}><span style={{fontSize:'12px',color:'var(--portal-ink-soft, #9097A8)',fontFamily:'monospace'}}>{o.id?.slice(0,8)}…</span></td>
                        <td style={{padding:'11px 13px'}}>
                          <div style={{fontWeight:600,fontSize:'13px',color:NAVY}}>{o.provider_name}</div>
                          <div style={{fontSize:'11px',color:'var(--portal-ink-soft, #9097A8)'}}>{o.provider_role==='attorney'?'⚖️':'👤'} {o.provider_email}</div>
                        </td>
                        <td style={{padding:'11px 13px'}}><PayPill status={o.payout_status}/></td>
                        <td style={{padding:'11px 13px'}}><ConnPill status={o.connect_ready?'active':'not_started'} bypass={o.bypass_active}/></td>
                        <td style={{padding:'11px 13px',textAlign:'right',fontWeight:700,fontSize:'13px',color:NAVY,fontVariantNumeric:'tabular-nums'}}>{$(o.gross)}</td>
                        <td style={{padding:'11px 13px',textAlign:'right',fontWeight:700,fontSize:'13px',color:GREEN,fontVariantNumeric:'tabular-nums'}}>{$(o.payout)}</td>
                        <td style={{padding:'11px 13px',textAlign:'right',fontSize:'13px',color:'var(--portal-ink-soft, #9097A8)',fontVariantNumeric:'tabular-nums'}}>{$(o.fee)}</td>
                        <td style={{padding:'11px 13px',fontSize:'12px',color:o.days_waiting>7?RED:o.days_waiting>3?AMBER:'var(--portal-ink-soft, #9097A8)',fontWeight:o.days_waiting>7?700:400,whiteSpace:'nowrap'}}>
                          {o.days_waiting}d
                        </td>
                        <td style={{padding:'11px 13px',whiteSpace:'nowrap'}}>
                          {o.payout_status!=='transferred'&&(
                            <button onClick={()=>releaseOne(o.id,o.provider_name)} disabled={!o.connect_ready} style={{padding:'5px 12px',borderRadius:'5px',border:`1px solid ${o.connect_ready?'rgba(26,107,69,.30)':'var(--portal-rule, #DDD8CE)'}`,background:o.connect_ready?'#EAF5EE':'var(--portal-bg, #F7F5F0)',color:o.connect_ready?GREEN:'var(--portal-ink-soft, #9097A8)',cursor:o.connect_ready?'pointer':'not-allowed',fontSize:'12px',fontWeight:600,fontFamily:sans}} title={!o.connect_ready?'Provider has no active payout setup':''}>
                              {o.payout_status==='failed'?'↺ Retry':'Release'}
                            </button>
                          )}
                          {o.payout_status==='transferred'&&o.transfer_id&&(
                            <span style={{fontSize:'11px',color:'var(--portal-ink-soft, #9097A8)',fontFamily:'monospace'}}>{o.transfer_id.slice(0,12)}…</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {filteredQueue.length>0&&!queueData.loading&&(
                  <tfoot>
                    <tr style={{background:'#F8F7F4',borderTop:'2px solid #DDD8CE'}}>
                      <td colSpan={5} style={{padding:'9px 13px',fontSize:'12px',color:'var(--portal-ink-soft, #9097A8)',fontWeight:600}}>
                        {filteredQueue.length} orders shown
                      </td>
                      <td style={{padding:'9px 13px',textAlign:'right',fontSize:'12px',fontWeight:700,color:GREEN}}>
                        {$(filteredQueue.reduce((s,o)=>s+o.payout,0))} provider share
                      </td>
                      <td style={{padding:'9px 13px',textAlign:'right',fontSize:'12px',fontWeight:700,color:'var(--portal-ink-soft, #9097A8)'}}>
                        {$(filteredQueue.reduce((s,o)=>s+o.fee,0))} platform fee
                      </td>
                      <td colSpan={3}/>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── PROVIDER LEDGER ───────────────────────────────────────────────── */}
      {tab==='providers'&&(
        <>
          <Sec title="Provider Earnings Ledger" sub="Aggregated earnings per provider — all time">
            <DT
              cols={[{k:'rank',l:'#',dim:true},{k:'name',l:'Provider'},{k:'role',l:'Type'},{k:'orders',l:'Orders',r:true},{k:'gross',l:'Gross Revenue',r:true,bold:true},{k:'fee',l:'Platform Fee',r:true,dim:true},{k:'transferred',l:'Paid Out',r:true},{k:'pending',l:'Pending',r:true},{k:'failed',l:'Failed',r:true},{k:'connect',l:'Connect'}]}
              rows={(providerData.data?.providers||[]).map((p,i)=>({rank:`#${i+1}`,name:p.name,role:p.role==='attorney'?'⚖️ Attorney':'👤 Consultant',orders:p.order_count,gross:$(p.total_gross),fee:$(p.total_fee),transferred:p.transferred>0?$(p.transferred):'—',pending:p.pending>0?<span style={{color:AMBER,fontWeight:700}}>{$(p.pending)}</span>:'—',failed:p.failed>0?<span style={{color:RED,fontWeight:700}}>{$(p.failed)}</span>:'—',connect:<ConnPill status={p.connect_ready?'active':'not_started'} bypass={p.bypass_active}/>}))}
              empty="No provider data"/>
          </Sec>
        </>
      )}

      {/* ── PAYOUT CONNECT ────────────────────────────────────────────────── */}
      {tab==='connect'&&(
        <>
          {/* Summary */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:'12px'}}>
            {[
              {label:'Total Providers', value:connectData.data?.summary?.total||0, accent:NAVY, icon:'👤'},
              {label:'Fully Active', value:connectData.data?.summary?.active||0, accent:GREEN, icon:'✅'},
              {label:'Pending Verification', value:connectData.data?.summary?.pending||0, accent:AMBER, icon:'⏳'},
              {label:'Not Started', value:connectData.data?.summary?.not_started||0, accent:RED, icon:'⚠'},
              {label:'Bypass Enabled', value:connectData.data?.summary?.bypassed||0, accent:GOLD, icon:'🔓'},
            ].map(k=><Kpi key={k.label} label={k.label} value={k.value} accent={k.accent} icon={k.icon}/>)}
          </div>

          {/* Connect table */}
          <Sec title="Provider Connect Status" sub="Manage payout onboarding and admin bypass per provider">
            <div style={{background:'#fff',border:'1px solid #DDD8CE',borderRadius:'8px',overflow:'hidden'}}>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',minWidth:'700px'}}>
                  <thead><tr>
                    {[{l:'Provider'},{l:'Role'},{l:'Connect Status'},{l:'Payout Account'},{l:'Bypass'},{l:'Action'}].map(h=>(
                      <th key={h.l} style={{padding:'10px 13px',textAlign:'left',fontSize:'11px',fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:'rgba(255,255,255,.70)',background:NAVY,whiteSpace:'nowrap',borderBottom:'2px solid rgba(255,255,255,.08)'}}>{h.l}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {connectData.loading ? [1,2,3].map(i=><tr key={i}><td colSpan={6} style={{padding:'14px'}}><div style={{height:'14px',background:'var(--portal-rule-soft, #F2EFE9)',borderRadius:'3px'}}/></td></tr>)
                    : (connectData.data?.providers||[]).map((p,i)=>(
                      <tr key={p.provider_id} style={{background:i%2===0?'#fff':'var(--portal-surface-2, #FAFAF8)',borderBottom:'1px solid #F2EFE9'}}>
                        <td style={{padding:'11px 13px'}}>
                          <div style={{fontWeight:600,fontSize:'13px',color:NAVY}}>{p.name}</div>
                          <div style={{fontSize:'11px',color:'var(--portal-ink-soft, #9097A8)'}}>{p.email}</div>
                        </td>
                        <td style={{padding:'11px 13px'}}><span style={{fontSize:'12px',color:'var(--portal-ink-mid, #5C6070)'}}>{p.role==='attorney'?'⚖️ Attorney':'👤 Consultant'}</span></td>
                        <td style={{padding:'11px 13px'}}><ConnPill status={p.status} bypass={p.bypass}/></td>
                        <td style={{padding:'11px 13px',fontSize:'11px',fontFamily:'monospace',color:'var(--portal-ink-soft, #9097A8)'}}>{p.payout_account||'—'}</td>
                        <td style={{padding:'11px 13px'}}>
                          <label style={{display:'flex',alignItems:'center',gap:'6px',cursor:'pointer'}}>
                            <input type="checkbox" checked={p.bypass} readOnly onClick={()=>toggleBypass(p,p.bypass)} style={{width:'15px',height:'15px',cursor:'pointer',accentColor:GOLD}}/>
                            <span style={{fontSize:'12px',color:p.bypass?GOLD:'var(--portal-ink-soft, #9097A8)',fontWeight:p.bypass?600:400}}>{p.bypass?'On':'Off'}</span>
                          </label>
                        </td>
                        <td style={{padding:'11px 13px'}}>
                          {p.payout_account&&(
                            <span style={{fontSize:'12px',color:'var(--portal-ink-soft, #9097A8)'}}>ID: {p.payout_account.slice(0,14)}…</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Sec>

          {/* Bypass explanation */}
          <Card style={{padding:'18px 20px',borderLeft:`4px solid ${GOLD}`}}>
            <div style={{fontFamily:serif,fontWeight:600,fontSize:'16px',color:NAVY,marginBottom:'6px'}}>About Payout Bypass</div>
            <p style={{fontSize:'13px',color:'var(--portal-ink-mid, #5C6070)',lineHeight:1.65,margin:0}}>
              The bypass flag allows a provider to receive orders and send paid offers <strong>before</strong> their payout setup is fully verified. This is useful during onboarding or for trusted providers with account issues. <strong style={{color:AMBER}}>Payouts will remain pending</strong> until the payout setup is verified — the bypass only removes the order-blocking restriction, not the transfer requirement. Always audit bypass usage in the audit log.
            </p>
          </Card>
        </>
      )}

      {/* ── REFUNDS ───────────────────────────────────────────────────────── */}
      {tab==='refunds'&&(
        <>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:'12px'}}>
            <Kpi label="Total Refunds" value={refundData.data?.summary?.total_refunds||0} sub={$(refundData.data?.summary?.total_amount)} accent={PURPLE} icon="↩"/>
            <Kpi label="Pending" value={refundData.data?.summary?.pending||0} accent={AMBER} icon="⏳"/>
            <Kpi label="Completed" value={refundData.data?.summary?.completed||0} accent={GREEN} icon="✅"/>
            <Kpi label="Cancelled Orders" value={refundData.data?.summary?.cancelled_orders||0} accent={RED} icon="✗"/>
          </div>

          <Sec title="Refund Ledger" sub="All processed refunds from the refund_ledger table">
            <DT
              cols={[{k:'date',l:'Date',dim:true},{k:'order_id',l:'Order',dim:true},{k:'amount',l:'Amount',r:true,bold:true},{k:'method',l:'Method'},{k:'status',l:'Status'}]}
              rows={(refundData.data?.refunds||[]).map(r=>({date:ago(r.created_at),order_id:r.order_id?.slice(0,8)+'…',amount:$(r.amount),method:r.method||'—',status:<PayPill status={r.status==='completed'?'transferred':r.status||'pending'}/>}))}
              empty="No refunds on record"/>
          </Sec>

          <Sec title="Cancelled / Refunded Orders" sub="Orders with cancelled or refunded status">
            <DT
              cols={[{k:'id',l:'Order ID',dim:true},{k:'amount',l:'Amount',r:true,bold:true},{k:'status',l:'Status'},{k:'cancelled',l:'Cancelled',dim:true}]}
              rows={(refundData.data?.cancelled_orders||[]).map(o=>({id:o.id?.slice(0,8)+'…',amount:$(o.total_amount),status:o.status,cancelled:ago(o.cancelled_at||o.created_at)}))}
              empty="No cancelled orders"/>
          </Sec>
        </>
      )}

      {/* Confirm modal */}
      <ConfirmModal
        open={Boolean(confirm)}
        title={confirm?.title||''}
        body={confirm?.body||''}
        onConfirm={confirm?.onConfirm}
        onClose={()=>setConfirm(null)}
        loading={busy}
        danger={confirm?.danger}
      />
    </div>
  )
}
