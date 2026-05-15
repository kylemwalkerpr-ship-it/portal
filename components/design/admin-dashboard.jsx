// @ts-nocheck
'use client'
import React from 'react'

/**
 * Admin Command Centre — single-pane glance at the entire platform.
 * Pulls in parallel from ~8 endpoints, renders sparklines + live indicators.
 * "Nerdy" aesthetic: tabular numerals, monospace IDs, micro-charts, terminal vibes.
 */

const serif = "'Cormorant Garamond', 'Garamond', Georgia, serif"
const sans  = "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif"
const mono  = "'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace"

const NAVY = '#1B2D4F', NAVY2 = '#2C3F66'
const GOLD = '#9A7B3B', GOLD2 = '#C4A45A'
const GREEN = '#1A6B45', AMBER = '#8B5E0A', RED = '#8B1A1A', PURPLE = '#3D2B6B', CYAN = '#0E7C8E'
const INK = '#0F1729'         // deep navy for the command-center background panel
const TERM = '#0A1426'        // even deeper for terminal stripes

// ─── helpers ──────────────────────────────────────────────────────────────────
const $   = (v, compact=false) => {
  const n=Number(v)||0
  if(compact&&n>=1e6) return `$${(n/1e6).toFixed(2)}M`
  if(compact&&n>=1e3) return `$${(n/1e3).toFixed(1)}K`
  return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:0}).format(n)
}
const fmtN= (v, compact=false) => {
  const n=Number(v)||0
  if(compact&&n>=1e6) return `${(n/1e6).toFixed(1)}M`
  if(compact&&n>=1e3) return `${(n/1e3).toFixed(1)}K`
  return n.toLocaleString()
}
const fmtPct = v => `${(Number(v)||0).toFixed(1)}%`
const ago = s => { if(!s) return '—'; const d=Math.floor((Date.now()-new Date(s))/86400000); return d===0?'today':d===1?'1d':d<30?`${d}d`:`${Math.floor(d/30)}mo` }

// ─── live clock ───────────────────────────────────────────────────────────────
// SSR-safe (null on server → no hydration mismatch), aligned to the second
// boundary so seconds tick evenly, and re-syncs whenever the tab regains focus
// (setTimeout is throttled in background tabs and would otherwise leave the
// clock minutes behind when the user returns).
function useClock() {
  const [now,setNow]=React.useState(null)
  React.useEffect(()=>{
    let timer
    let mounted=true
    const tick=()=>{
      if(!mounted) return
      const d=new Date()
      setNow(d)
      // schedule the next tick at the *next* second boundary
      timer=setTimeout(tick, 1000 - (d.getTime() % 1000))
    }
    const resync=()=>{
      if(document.visibilityState!=='visible') return
      clearTimeout(timer)
      tick()
    }
    tick()
    document.addEventListener('visibilitychange', resync)
    window.addEventListener('focus', resync)
    return()=>{
      mounted=false
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', resync)
      window.removeEventListener('focus', resync)
    }
  },[])
  return now
}

// ─── relative "synced Xs ago" — updates every clock tick ──────────────────────
function syncedAgo(refreshedAt, now) {
  if(!refreshedAt) return 'syncing…'
  if(!now) return `synced ${refreshedAt.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`
  const s=Math.max(0, Math.floor((now.getTime()-refreshedAt.getTime())/1000))
  if(s<5)   return 'synced just now'
  if(s<60)  return `synced ${s}s ago`
  if(s<3600){const m=Math.floor(s/60);return `synced ${m}m ago`}
  return `synced ${refreshedAt.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}`
}

// ─── multi-endpoint fetch ─────────────────────────────────────────────────────
function useDashboardData() {
  const [data,setData] = React.useState({})
  const [loading,setLoading] = React.useState(true)
  const [refreshedAt,setRefreshedAt] = React.useState(null)

  const load = React.useCallback(async()=>{
    setLoading(true)
    const endpoints = {
      overview:     '/api/admin/analytics/overview',
      revenue:      '/api/admin/analytics/revenue?period=30d&granularity=day',
      users:        '/api/admin/analytics/users?period=30d',
      orders:       '/api/admin/analytics/orders?period=30d',
      providers:    '/api/admin/analytics/providers',
      marketplace:  '/api/admin/analytics/marketplace',
      payouts:      '/api/admin/payouts',
      connect:      '/api/admin/payouts/connect',
      escrow:       '/api/admin/escrow?state=all&page=1&page_size=1',
      gigStats:     '/api/admin/gigs/stats',
      modqueue:     '/api/admin/gigs/modqueue',
      orderStats:   '/api/admin/orders/stats',
      adminOrders:  '/api/admin/orders?status=&page=1&page_size=10',
    }
    const entries = await Promise.all(Object.entries(endpoints).map(async([k,url])=>{
      try{
        const r=await fetch(url,{credentials:'same-origin'})
        const j=await r.json().catch(()=>({}))
        return [k, j?.data ?? j]
      }catch{return[k,null]}
    }))
    const merged = Object.fromEntries(entries)
    setData(merged)
    setRefreshedAt(new Date())
    setLoading(false)
  },[])

  React.useEffect(()=>{load()},[load])
  return {data,loading,refreshedAt,reload:load}
}

// ─── primitives ───────────────────────────────────────────────────────────────

// Mini sparkline
function Spark({values=[], color=GOLD2, height=24, fill=true}) {
  if(!values.length) return null
  const max=Math.max(...values,1), min=Math.min(...values,0)
  const range=Math.max(1,max-min)
  const pts=values.map((v,i)=>({x:(i/(values.length-1||1))*100,y:height-((v-min)/range)*height}))
  const line=pts.map((p,i)=>`${i===0?'M':'L'}${p.x},${p.y}`).join(' ')
  const area=`${line} L100,${height} L0,${height} Z`
  return <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{width:'100%',height}}>
    {fill&&<path d={area} fill={`${color}22`}/>}
    <path d={line} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>
  </svg>
}

// Stat number — "nerdy" tabular nums
function Stat({label,value,accent='#fff',sub,spark,sparkColor=GOLD2,big=false}) {
  return <div style={{display:'flex',flexDirection:'column',gap:'2px'}}>
    <div style={{fontSize:'9px',fontWeight:700,letterSpacing:'.15em',textTransform:'uppercase',color:'rgba(255,255,255,.45)',fontFamily:mono}}>{label}</div>
    <div style={{fontFamily:serif,fontWeight:600,fontSize:big?'34px':'24px',color:accent,fontVariantNumeric:'tabular-nums',letterSpacing:'-.02em',lineHeight:1.05}}>{value}</div>
    {sub&&<div style={{fontSize:'10px',color:'rgba(255,255,255,.50)',fontFamily:mono}}>{sub}</div>}
    {spark&&<div style={{marginTop:'4px'}}><Spark values={spark} color={sparkColor}/></div>}
  </div>
}

// Terminal-style alert pill
function AlertPill({color,count,label,onClick}) {
  return <button onClick={onClick} disabled={!onClick} style={{display:'inline-flex',alignItems:'center',gap:'8px',padding:'8px 14px',borderRadius:'4px',border:`1px solid ${color}55`,background:`${color}15`,color,fontSize:'12px',fontFamily:mono,fontWeight:600,cursor:onClick?'pointer':'default',letterSpacing:'.04em'}}>
    <span style={{width:'6px',height:'6px',borderRadius:'50%',background:color,boxShadow:`0 0 6px ${color}`,animation:'pulse 1.6s ease-in-out infinite'}}/>
    <span style={{fontFamily:mono,fontWeight:800,fontSize:'13px'}}>{fmtN(count)}</span>
    <span style={{opacity:.75}}>{label}</span>
  </button>
}

// Section card with gold rule + serif heading
function Section({title,subtitle,right,children,accent=GOLD2}) {
  return <section style={{background:'#fff',border:'1px solid #DDD8CE',borderRadius:'10px',boxShadow:'0 1px 3px rgba(27,45,79,.06)',overflow:'hidden'}}>
    <div style={{padding:'18px 22px 14px',display:'flex',alignItems:'flex-end',justifyContent:'space-between',gap:'12px',borderBottom:`1px solid #F2EFE9`}}>
      <div>
        <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'2px'}}>
          <span style={{width:'14px',height:'2px',background:accent,display:'inline-block'}}/>
          <span style={{fontSize:'9px',fontWeight:700,letterSpacing:'.18em',textTransform:'uppercase',color:'#9097A8',fontFamily:mono}}>System Module</span>
        </div>
        <h3 style={{fontFamily:serif,fontWeight:600,fontSize:'19px',color:NAVY,margin:0,letterSpacing:'-.012em'}}>{title}</h3>
        {subtitle&&<div style={{fontSize:'12px',color:'#9097A8',marginTop:'2px'}}>{subtitle}</div>}
      </div>
      {right}
    </div>
    <div style={{padding:'18px 22px'}}>{children}</div>
  </section>
}

// Mini KPI block (in light section bodies)
function MiniKpi({label,value,accent=NAVY,sub,trend,onClick}) {
  const [h,setH]=React.useState(false)
  return <div onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} onClick={onClick} style={{background:h&&onClick?'#FAFAF8':'#F7F5F0',border:'1px solid #E8E4DC',borderRadius:'7px',padding:'12px 14px',cursor:onClick?'pointer':'default',transition:'background .12s'}}>
    <div style={{fontSize:'10px',fontWeight:700,letterSpacing:'.10em',textTransform:'uppercase',color:'#9097A8',fontFamily:mono,marginBottom:'4px'}}>{label}</div>
    <div style={{fontFamily:serif,fontWeight:600,fontSize:'21px',color:accent,fontVariantNumeric:'tabular-nums',letterSpacing:'-.015em',lineHeight:1.1}}>{value}</div>
    {sub&&<div style={{fontSize:'11px',color:'#9097A8',marginTop:'3px'}}>{sub}</div>}
    {trend!=null&&<div style={{fontSize:'10px',fontWeight:700,color:trend>=0?GREEN:RED,marginTop:'2px',fontFamily:mono}}>{trend>=0?'▲':'▼'} {Math.abs(trend).toFixed(1)}%</div>}
  </div>
}

// Progress bar
function Bar({value,max=100,color=NAVY,label,track='#F2EFE9'}) {
  const pct=Math.min(100,Math.max(0,(Number(value)||0)/(max||1)*100))
  return <div>
    {label&&<div style={{display:'flex',justifyContent:'space-between',marginBottom:'4px',fontSize:'11px',color:'#5C6070'}}><span>{label}</span><span style={{fontWeight:700,fontFamily:mono,color:NAVY}}>{pct.toFixed(0)}%</span></div>}
    <div style={{height:'5px',borderRadius:'3px',background:track,overflow:'hidden'}}>
      <div style={{height:'100%',width:`${pct}%`,background:color,borderRadius:'3px',transition:'width .5s'}}/>
    </div>
  </div>
}

// Tag pill
function Tag({color,children,bg}) {
  return <span style={{display:'inline-block',padding:'2px 7px',borderRadius:'3px',fontSize:'10px',fontWeight:700,letterSpacing:'.05em',textTransform:'uppercase',background:bg||`${color}15`,color,fontFamily:mono}}>{children}</span>
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function AdminDashboard({onNav}) {
  const {data,loading,refreshedAt,reload} = useDashboardData()
  const now = useClock()

  const ov  = data.overview     || {}
  const rev = data.revenue      || {}
  const usr = data.users        || {}
  const ord = data.orders       || {}
  const prv = data.providers    || {}
  const mkt = data.marketplace  || {}
  const py  = data.payouts      || {}
  const con = data.connect      || {}
  const esc = data.escrow       || {}
  const gst = data.gigStats     || {}
  const mq  = data.modqueue     || {}
  const ost = data.orderStats   || {}
  const aor = data.adminOrders  || {}

  // Revenue sparkline data (last 30 days gross)
  const revSeries = (rev.time_series||[]).map(d=>Number(d.gross)||0)
  const usrGrowth = (usr.growth_series||[]).map(d=>Number(d.new_users)||0)
  const orderSeries = (ost.monthly_volume||[]).slice(-12).map(d=>Number(d.count)||0)

  // Computed aggregates
  const allUsers = (ov.by_role?.student||0)+(ov.by_role?.consultant||0)+(ov.by_role?.attorney||0)+(ov.by_role?.support||0)

  // Critical alerts
  const alerts = []
  if(mq.counts?.pending_review>0) alerts.push({color:'#3B82F6',count:mq.counts.pending_review,label:'gigs awaiting review',target:'gigs'})
  if(mq.counts?.appeals>0)        alerts.push({color:PURPLE,count:mq.counts.appeals,label:'gig appeals pending',target:'gigs'})
  if(esc.summary?.disputed_count>0) alerts.push({color:RED,count:esc.summary.disputed_count,label:'escrow disputes open',target:'escrow'})
  if(esc.summary?.auto_release_ready>0) alerts.push({color:GOLD2,count:esc.summary.auto_release_ready,label:'auto-releases ready',target:'escrow'})
  if(py.summary?.failed>0)        alerts.push({color:RED,count:py.summary.failed,label:'failed payouts',target:'payouts'})
  if(ord.late_delivery_count>0)   alerts.push({color:'#F59E0B',count:ord.late_delivery_count,label:'late orders',target:'orders'})
  if(con.summary?.not_started>0)  alerts.push({color:AMBER,count:con.summary.not_started,label:'providers without Stripe',target:'payouts'})

  return <div style={{padding:'24px 28px 60px',display:'flex',flexDirection:'column',gap:'18px',fontFamily:sans,background:'#F7F5F0',minHeight:'100vh'}}>

    {/* ──────── HERO BANNER ─────────────────────────────────────────────────── */}
    <div style={{background:`linear-gradient(135deg, ${INK} 0%, ${NAVY} 100%)`,borderRadius:'12px',padding:'28px 32px',position:'relative',overflow:'hidden',boxShadow:'0 8px 24px rgba(15,23,41,.18)'}}>
      {/* Decorative gold lines */}
      <div style={{position:'absolute',top:0,left:0,right:0,height:'2px',background:`linear-gradient(90deg, transparent, ${GOLD2}, transparent)`}}/>
      <svg style={{position:'absolute',right:'-40px',top:'-40px',opacity:.06}} width="280" height="280" viewBox="0 0 280 280">
        <circle cx="140" cy="140" r="130" fill="none" stroke={GOLD2} strokeWidth="0.5"/>
        <circle cx="140" cy="140" r="100" fill="none" stroke={GOLD2} strokeWidth="0.5"/>
        <circle cx="140" cy="140" r="70"  fill="none" stroke={GOLD2} strokeWidth="0.5"/>
        <circle cx="140" cy="140" r="40"  fill="none" stroke={GOLD2} strokeWidth="0.5"/>
      </svg>

      {/* Top row: title + clock */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'24px',gap:'16px',flexWrap:'wrap',position:'relative'}}>
        <div>
          <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'4px'}}>
            <span style={{width:'8px',height:'8px',borderRadius:'50%',background:GREEN,boxShadow:`0 0 8px ${GREEN}`,animation:'pulse 1.5s ease-in-out infinite'}}/>
            <span style={{fontSize:'10px',fontWeight:700,letterSpacing:'.16em',textTransform:'uppercase',color:'rgba(255,255,255,.55)',fontFamily:mono}}>System Operational</span>
            <span style={{fontSize:'10px',color:'rgba(255,255,255,.30)',fontFamily:mono}}>· uptime live</span>
          </div>
          <h1 style={{fontFamily:serif,fontWeight:600,fontSize:'34px',color:'#fff',margin:0,letterSpacing:'-.018em',lineHeight:1.05}}>Command Centre</h1>
          <div style={{fontSize:'13px',color:'rgba(255,255,255,.50)',marginTop:'4px',fontFamily:mono}}>
            yousafe.portal/admin · {syncedAgo(refreshedAt, now)}
          </div>
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{fontFamily:mono,fontSize:'11px',color:'rgba(255,255,255,.45)',letterSpacing:'.10em',marginBottom:'2px'}}>{now ? now.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'}) : ' '}</div>
          <div style={{fontFamily:mono,fontSize:'24px',color:GOLD2,fontWeight:300,letterSpacing:'.08em',fontVariantNumeric:'tabular-nums'}}>{now ? now.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}) : '--:--:--'}</div>
          <button onClick={reload} disabled={loading} style={{marginTop:'8px',padding:'5px 12px',background:'rgba(255,255,255,.10)',border:'1px solid rgba(255,255,255,.18)',borderRadius:'4px',color:'rgba(255,255,255,.80)',cursor:loading?'wait':'pointer',fontSize:'11px',fontFamily:mono,fontWeight:600,letterSpacing:'.04em'}}>{loading?'⟳ syncing':'↻ resync'}</button>
        </div>
      </div>

      {/* Top stats — 6-column tactical readout */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:'24px',position:'relative'}}>
        <Stat label="Gross Revenue"      value={$(ov.gross_revenue,true)} sub={`+${$(ov.gross_30d,true)} · 30d`} spark={revSeries} sparkColor={GREEN} accent="#fff" big/>
        <Stat label="Net Platform"        value={$(ov.net_revenue,true)}   sub={`${(ov.platform_fee_pct||30).toFixed(0)}% take rate`} spark={revSeries.map(v=>v*0.3)} sparkColor={GOLD2} accent="#fff"/>
        <Stat label="Active Users"        value={fmtN(allUsers,true)}      sub={`+${ov.new_users_30d||0} this month`} spark={usrGrowth} sparkColor={CYAN} accent="#fff"/>
        <Stat label="Total Orders"        value={fmtN(ov.total_orders,true)} sub={`${fmtN(ov.orders_30d)} · 30d`} spark={orderSeries} sparkColor={GOLD2} accent="#fff"/>
        <Stat label="Active Gigs"         value={fmtN(ov.active_gigs)}     sub={`of ${fmtN(ov.total_gigs)} total`} accent={GOLD2}/>
        <Stat label="Completion"           value={fmtPct(ov.completion_rate)} sub={`${fmtPct(ov.cancellation_rate)} cancel`} accent={ov.completion_rate>=70?GREEN:RED}/>
      </div>
    </div>

    {/* ──────── ALERT STRIP — real-time signals ─────────────────────────────── */}
    {alerts.length>0&&(
      <div style={{background:'#fff',border:`1px solid #DDD8CE`,borderRadius:'10px',padding:'14px 18px',display:'flex',alignItems:'center',gap:'10px',flexWrap:'wrap'}}>
        <div style={{display:'flex',alignItems:'center',gap:'6px',padding:'2px 10px 2px 0',borderRight:'1px solid #E8E4DC',marginRight:'4px'}}>
          <span style={{fontSize:'12px'}}>🔔</span>
          <span style={{fontSize:'10px',fontWeight:700,letterSpacing:'.10em',textTransform:'uppercase',color:NAVY,fontFamily:mono}}>{alerts.length} signal{alerts.length>1?'s':''}</span>
        </div>
        {alerts.map((a,i)=><AlertPill key={i} {...a} onClick={a.target?()=>onNav?.(a.target):undefined}/>)}
      </div>
    )}

    {/* ──────── FINANCIAL FLOW — money in motion ────────────────────────────── */}
    <Section title="Money in Motion" subtitle="Live financial flow across escrow, payouts, and refunds"
      right={<button onClick={()=>onNav?.('financials')} style={{fontSize:'11px',color:NAVY,fontFamily:mono,background:'none',border:'1px solid #DDD8CE',padding:'5px 10px',borderRadius:'4px',cursor:'pointer'}}>view financials →</button>}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:'10px'}}>
        <MiniKpi label="Escrow Held"   value={$(esc.summary?.held_total,true)} sub={`${fmtN(esc.summary?.held_count||0)} orders`} accent={AMBER} onClick={()=>onNav?.('escrow')}/>
        <MiniKpi label="Partial Release" value={$(esc.summary?.partial_released_total,true)} sub={`${fmtN(esc.summary?.partial_released_count||0)} active`} accent={CYAN} onClick={()=>onNav?.('escrow')}/>
        <MiniKpi label="Auto-Release Ready" value={fmtN(esc.summary?.auto_release_ready||0)} sub="eligible now" accent={esc.summary?.auto_release_ready>0?GOLD:'#9097A8'} onClick={()=>onNav?.('escrow')}/>
        <MiniKpi label="Disputed"      value={fmtN(esc.summary?.disputed_count||0)} sub={$(esc.summary?.disputed_total)} accent={esc.summary?.disputed_count>0?RED:'#9097A8'} onClick={()=>onNav?.('escrow')}/>
        <MiniKpi label="Frozen"        value={fmtN(esc.summary?.frozen_count||0)} sub={$(esc.summary?.frozen_total)} accent={esc.summary?.frozen_count>0?PURPLE:'#9097A8'} onClick={()=>onNav?.('escrow')}/>
        <MiniKpi label="Released (all-time)" value={$(esc.summary?.released_total,true)} sub={`${fmtN(esc.summary?.released_count||0)} orders`} accent={GREEN} onClick={()=>onNav?.('escrow')}/>
      </div>

      {/* Payout pipeline */}
      <div style={{marginTop:'16px',padding:'14px 16px',background:TERM,borderRadius:'8px',color:'#fff'}}>
        <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'10px'}}>
          <span style={{width:'6px',height:'6px',borderRadius:'50%',background:GOLD2}}/>
          <span style={{fontSize:'10px',fontWeight:700,letterSpacing:'.16em',textTransform:'uppercase',color:'rgba(255,255,255,.55)',fontFamily:mono}}>payout pipeline</span>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:'18px'}}>
          <div>
            <div style={{fontSize:'9px',fontWeight:700,letterSpacing:'.10em',color:'rgba(255,255,255,.50)',fontFamily:mono,marginBottom:'3px'}}>PENDING</div>
            <div style={{fontFamily:mono,fontSize:'18px',color:GOLD2,fontWeight:600,fontVariantNumeric:'tabular-nums'}}>{$(((py.summary?.total_pending_cents)||0)/100,true)}</div>
            <div style={{fontSize:'10px',color:'rgba(255,255,255,.45)',fontFamily:mono}}>{fmtN(py.summary?.pending||0)} orders</div>
          </div>
          <div>
            <div style={{fontSize:'9px',fontWeight:700,letterSpacing:'.10em',color:'rgba(255,255,255,.50)',fontFamily:mono,marginBottom:'3px'}}>TRANSFERRED</div>
            <div style={{fontFamily:mono,fontSize:'18px',color:GREEN,fontWeight:600,fontVariantNumeric:'tabular-nums'}}>{$(((py.summary?.total_transferred_cents)||0)/100,true)}</div>
            <div style={{fontSize:'10px',color:'rgba(255,255,255,.45)',fontFamily:mono}}>{fmtN(py.summary?.transferred||0)} completed</div>
          </div>
          <div>
            <div style={{fontSize:'9px',fontWeight:700,letterSpacing:'.10em',color:'rgba(255,255,255,.50)',fontFamily:mono,marginBottom:'3px'}}>FAILED</div>
            <div style={{fontFamily:mono,fontSize:'18px',color:py.summary?.failed>0?'#FF6B6B':'rgba(255,255,255,.50)',fontWeight:600,fontVariantNumeric:'tabular-nums'}}>{fmtN(py.summary?.failed||0)}</div>
            <div style={{fontSize:'10px',color:'rgba(255,255,255,.45)',fontFamily:mono}}>{$(((py.summary?.total_failed_cents)||0)/100,true)}</div>
          </div>
          <div>
            <div style={{fontSize:'9px',fontWeight:700,letterSpacing:'.10em',color:'rgba(255,255,255,.50)',fontFamily:mono,marginBottom:'3px'}}>CONNECT</div>
            <div style={{fontFamily:mono,fontSize:'18px',color:CYAN,fontWeight:600,fontVariantNumeric:'tabular-nums'}}>{fmtN(con.summary?.active||0)}<span style={{fontSize:'12px',color:'rgba(255,255,255,.50)'}}>/{fmtN(con.summary?.total||0)}</span></div>
            <div style={{fontSize:'10px',color:'rgba(255,255,255,.45)',fontFamily:mono}}>{con.summary?.bypassed||0} bypassed</div>
          </div>
        </div>
      </div>
    </Section>

    {/* ──────── DUAL — Marketplace + Orders ─────────────────────────────────── */}
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'18px'}}>

      {/* Marketplace pulse */}
      <Section title="Marketplace Pulse" subtitle="Discovery funnel · gig health · ratings" accent={CYAN}
        right={<button onClick={()=>onNav?.('gigs')} style={{fontSize:'11px',color:NAVY,fontFamily:mono,background:'none',border:'1px solid #DDD8CE',padding:'5px 10px',borderRadius:'4px',cursor:'pointer'}}>service mgmt →</button>}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'14px'}}>
          <MiniKpi label="Impressions" value={fmtN(mkt.funnel?.impressions||0,true)} sub={fmtPct((mkt.funnel?.clicks||0)/(mkt.funnel?.impressions||1)*100)+' CTR'} accent={NAVY}/>
          <MiniKpi label="Saves"       value={fmtN(mkt.funnel?.saves||0,true)} sub="user favourites" accent={GOLD}/>
          <MiniKpi label="Content Score" value={fmtPct(mkt.avg_content_score||0)} sub="platform avg" accent={mkt.avg_content_score>=70?GREEN:AMBER}/>
          <MiniKpi label="Mod Queue" value={fmtN((mq.counts?.pending_review||0)+(mq.counts?.appeals||0)+(mq.counts?.auto_flagged||0))} sub="awaiting review" accent={(mq.counts?.pending_review||0)>0?'#3B82F6':'#9097A8'} onClick={()=>onNav?.('gigs')}/>
        </div>

        {/* Discovery funnel — 4-stage micro funnel */}
        <div style={{padding:'12px 14px',background:'#F7F5F0',borderRadius:'7px',border:'1px solid #E8E4DC'}}>
          <div style={{fontSize:'9px',fontWeight:700,letterSpacing:'.12em',textTransform:'uppercase',color:'#9097A8',fontFamily:mono,marginBottom:'8px'}}>DISCOVERY → ORDER FUNNEL</div>
          {[
            {l:'Impressions',v:mkt.funnel?.impressions||0,c:NAVY},
            {l:'Clicks',v:mkt.funnel?.clicks||0,c:CYAN},
            {l:'Saves',v:mkt.funnel?.saves||0,c:GOLD},
            {l:'Orders',v:mkt.funnel?.orders||0,c:GREEN},
          ].map((s,i,arr)=>{
            const max=Math.max(...arr.map(x=>x.v),1)
            const conv=i>0&&arr[i-1].v>0?((s.v/arr[i-1].v)*100).toFixed(1):null
            return <div key={s.l} style={{marginBottom:'5px'}}>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:'11px',marginBottom:'2px'}}>
                <span style={{color:'#5C6070'}}>{s.l}</span>
                <span style={{fontFamily:mono,color:NAVY,fontWeight:700}}>{fmtN(s.v,true)} {conv&&<span style={{color:GREEN,marginLeft:'6px'}}>{conv}% →</span>}</span>
              </div>
              <div style={{height:'4px',background:'#E8E4DC',borderRadius:'2px',overflow:'hidden'}}>
                <div style={{height:'100%',width:`${(s.v/max)*100}%`,background:s.c,borderRadius:'2px'}}/>
              </div>
            </div>
          })}
        </div>
      </Section>

      {/* Order pipeline */}
      <Section title="Order Pipeline" subtitle="State machine · escrow health · throughput" accent={GOLD}
        right={<button onClick={()=>onNav?.('orders')} style={{fontSize:'11px',color:NAVY,fontFamily:mono,background:'none',border:'1px solid #DDD8CE',padding:'5px 10px',borderRadius:'4px',cursor:'pointer'}}>all orders →</button>}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'14px'}}>
          <MiniKpi label="AOV"          value={$(ord.avg_order_value)}      sub="avg order value" accent={NAVY}/>
          <MiniKpi label="Days to Complete" value={`${Number(ord.avg_days_to_complete||0).toFixed(1)}d`} sub="median" accent={CYAN}/>
          <MiniKpi label="Revision Rate" value={fmtPct(ord.revision_rate||0)} sub="of orders" accent={AMBER}/>
          <MiniKpi label="Late Orders"  value={fmtN(ord.late_delivery_count||0)} sub={ord.late_delivery_count>0?'needs attention':'all on time'} accent={ord.late_delivery_count>0?RED:GREEN} onClick={()=>onNav?.('orders')}/>
        </div>

        {/* Status distribution */}
        <div style={{padding:'12px 14px',background:'#F7F5F0',borderRadius:'7px',border:'1px solid #E8E4DC'}}>
          <div style={{fontSize:'9px',fontWeight:700,letterSpacing:'.12em',textTransform:'uppercase',color:'#9097A8',fontFamily:mono,marginBottom:'8px'}}>STATUS DISTRIBUTION</div>
          {Object.entries(ord.by_status||{}).slice(0,6).map(([s,n])=>{
            const total=Math.max(1,Object.values(ord.by_status||{}).reduce((a,v)=>a+v,0))
            const color=s==='completed'||s==='released'?GREEN:s.includes('cancel')||s.includes('refund')?RED:s==='in_progress'?CYAN:'#9097A8'
            return <div key={s} style={{display:'flex',alignItems:'center',gap:'8px',padding:'4px 0'}}>
              <span style={{width:'5px',height:'5px',borderRadius:'50%',background:color}}/>
              <span style={{fontSize:'11px',color:'#5C6070',textTransform:'capitalize',flex:1}}>{s.replace(/_/g,' ')}</span>
              <div style={{width:'60px',height:'4px',background:'#E8E4DC',borderRadius:'2px',overflow:'hidden'}}>
                <div style={{height:'100%',width:`${(n/total)*100}%`,background:color,borderRadius:'2px'}}/>
              </div>
              <span style={{fontFamily:mono,fontSize:'11px',color:NAVY,fontWeight:700,minWidth:'30px',textAlign:'right'}}>{fmtN(n)}</span>
            </div>
          })}
        </div>
      </Section>
    </div>

    {/* ──────── PROVIDER ECOSYSTEM ──────────────────────────────────────────── */}
    <Section title="Provider Ecosystem" subtitle="Top earners · Stripe Connect health · seller levels" accent={PURPLE}
      right={<button onClick={()=>onNav?.('users')} style={{fontSize:'11px',color:NAVY,fontFamily:mono,background:'none',border:'1px solid #DDD8CE',padding:'5px 10px',borderRadius:'4px',cursor:'pointer'}}>all providers →</button>}>
      <div style={{display:'grid',gridTemplateColumns:'1.5fr 1fr',gap:'18px'}}>
        {/* Leaderboard */}
        <div>
          <div style={{fontSize:'10px',fontWeight:700,letterSpacing:'.10em',textTransform:'uppercase',color:'#9097A8',fontFamily:mono,marginBottom:'8px'}}>TOP EARNERS · 30D</div>
          {(prv.leaderboard||[]).slice(0,6).map((p,i)=>(
            <div key={i} style={{display:'flex',alignItems:'center',gap:'10px',padding:'8px 10px',borderRadius:'6px',background:i===0?'rgba(196,164,90,.10)':'transparent',marginBottom:'2px'}}>
              <span style={{fontFamily:mono,fontSize:'11px',fontWeight:700,color:i===0?GOLD:i<3?NAVY:'#9097A8',width:'22px'}}>{i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:'13px',fontWeight:600,color:NAVY,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.name||p.email||'—'}</div>
                <div style={{fontSize:'10px',color:'#9097A8',fontFamily:mono,letterSpacing:'.04em'}}>{p.role==='attorney'?'⚖ ATTORNEY':'👤 CONSULTANT'} · {fmtN(p.completed_orders||0)} orders {p.avg_rating?` · ${Number(p.avg_rating).toFixed(1)}★`:''}</div>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontFamily:mono,fontSize:'14px',fontWeight:700,color:GREEN,fontVariantNumeric:'tabular-nums'}}>{$(p.gross_earnings,true)}</div>
              </div>
            </div>
          ))}
          {(!prv.leaderboard||prv.leaderboard.length===0)&&<div style={{padding:'24px',textAlign:'center',color:'#9097A8',fontSize:'12px'}}>No provider data yet</div>}
        </div>

        {/* Connect health donut + breakdown */}
        <div>
          <div style={{fontSize:'10px',fontWeight:700,letterSpacing:'.10em',textTransform:'uppercase',color:'#9097A8',fontFamily:mono,marginBottom:'8px'}}>STRIPE CONNECT HEALTH</div>
          <div style={{padding:'14px',background:'#F7F5F0',borderRadius:'7px',border:'1px solid #E8E4DC',display:'flex',flexDirection:'column',gap:'8px'}}>
            <Bar value={con.summary?.active||0} max={con.summary?.total||1} color={GREEN} label="Active"/>
            <Bar value={con.summary?.pending||0} max={con.summary?.total||1} color={AMBER} label="Pending"/>
            <Bar value={con.summary?.not_started||0} max={con.summary?.total||1} color={RED} label="Not started"/>
            <div style={{display:'flex',justifyContent:'space-between',paddingTop:'8px',borderTop:'1px solid #E8E4DC',marginTop:'4px'}}>
              <span style={{fontSize:'11px',color:'#5C6070'}}>Admin bypass</span>
              <Tag color={GOLD}>{con.summary?.bypassed||0} active</Tag>
            </div>
          </div>

          {/* Provider breakdown */}
          <div style={{marginTop:'12px',display:'flex',gap:'8px'}}>
            <div style={{flex:1,padding:'10px 12px',background:'#F7F5F0',borderRadius:'6px',border:'1px solid #E8E4DC'}}>
              <div style={{fontSize:'10px',color:'#9097A8',fontFamily:mono,letterSpacing:'.05em',marginBottom:'2px'}}>⚖ ATTORNEYS</div>
              <div style={{fontFamily:mono,fontSize:'18px',fontWeight:700,color:NAVY,fontVariantNumeric:'tabular-nums'}}>{fmtN(prv.provider_count_by_role?.attorney||ov.by_role?.attorney||0)}</div>
            </div>
            <div style={{flex:1,padding:'10px 12px',background:'#F7F5F0',borderRadius:'6px',border:'1px solid #E8E4DC'}}>
              <div style={{fontSize:'10px',color:'#9097A8',fontFamily:mono,letterSpacing:'.05em',marginBottom:'2px'}}>👤 CONSULTANTS</div>
              <div style={{fontFamily:mono,fontSize:'18px',fontWeight:700,color:NAVY,fontVariantNumeric:'tabular-nums'}}>{fmtN(prv.provider_count_by_role?.consultant||ov.by_role?.consultant||0)}</div>
            </div>
          </div>
        </div>
      </div>
    </Section>

    {/* ──────── USER GROWTH + GIG HEALTH ────────────────────────────────────── */}
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'18px'}}>

      {/* User ecosystem */}
      <Section title="User Ecosystem" subtitle="Growth · roles · churn risk" accent={CYAN}
        right={<button onClick={()=>onNav?.('users')} style={{fontSize:'11px',color:NAVY,fontFamily:mono,background:'none',border:'1px solid #DDD8CE',padding:'5px 10px',borderRadius:'4px',cursor:'pointer'}}>manage users →</button>}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'8px',marginBottom:'14px'}}>
          {[{l:'Students',k:'student',c:CYAN},{l:'Consultants',k:'consultant',c:PURPLE},{l:'Attorneys',k:'attorney',c:NAVY},{l:'Support',k:'support',c:AMBER}].map(r=>(
            <div key={r.k} style={{padding:'10px 12px',background:'#F7F5F0',borderRadius:'6px',border:'1px solid #E8E4DC',borderTop:`2px solid ${r.c}`}}>
              <div style={{fontSize:'9px',color:'#9097A8',fontFamily:mono,letterSpacing:'.08em',marginBottom:'2px'}}>{r.l.toUpperCase()}</div>
              <div style={{fontFamily:mono,fontSize:'17px',fontWeight:700,color:NAVY,fontVariantNumeric:'tabular-nums'}}>{fmtN(ov.by_role?.[r.k]||0)}</div>
            </div>
          ))}
        </div>
        <div style={{padding:'12px 14px',background:'#F7F5F0',borderRadius:'7px',border:'1px solid #E8E4DC'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}}>
            <span style={{fontSize:'9px',fontWeight:700,letterSpacing:'.12em',textTransform:'uppercase',color:'#9097A8',fontFamily:mono}}>NEW USER GROWTH · 30D</span>
            <span style={{fontFamily:mono,fontSize:'12px',fontWeight:700,color:GREEN}}>+{ov.new_users_30d||0}</span>
          </div>
          <Spark values={usrGrowth} color={CYAN} height={36}/>
          <div style={{display:'flex',justifyContent:'space-between',marginTop:'10px',paddingTop:'8px',borderTop:'1px solid #E8E4DC'}}>
            <div>
              <div style={{fontSize:'9px',color:'#9097A8',fontFamily:mono,letterSpacing:'.05em'}}>ACTIVATION</div>
              <div style={{fontFamily:mono,fontSize:'14px',fontWeight:700,color:NAVY}}>{fmtPct(usr.activation_rate||0)}</div>
            </div>
            <div>
              <div style={{fontSize:'9px',color:'#9097A8',fontFamily:mono,letterSpacing:'.05em'}}>CHURN RISK</div>
              <div style={{fontFamily:mono,fontSize:'14px',fontWeight:700,color:usr.churn_risk_count>5?RED:AMBER}}>{fmtN(usr.churn_risk_count||0)}</div>
            </div>
            <div>
              <div style={{fontSize:'9px',color:'#9097A8',fontFamily:mono,letterSpacing:'.05em'}}>NEW PROVIDERS</div>
              <div style={{fontFamily:mono,fontSize:'14px',fontWeight:700,color:GREEN}}>+{usr.new_providers_30d||0}</div>
            </div>
          </div>
        </div>
      </Section>

      {/* Gig health */}
      <Section title="Gig Health" subtitle="Status mix · auto-flags · content quality" accent={GOLD}
        right={<button onClick={()=>onNav?.('gigs')} style={{fontSize:'11px',color:NAVY,fontFamily:mono,background:'none',border:'1px solid #DDD8CE',padding:'5px 10px',borderRadius:'4px',cursor:'pointer'}}>service mgmt →</button>}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'14px'}}>
          <MiniKpi label="Active" value={fmtN(gst.by_status?.active||0)} accent={GREEN}/>
          <MiniKpi label="Pending Review" value={fmtN(gst.by_status?.pending_review||0)} accent="#3B82F6"/>
          <MiniKpi label="Suspended" value={fmtN(gst.by_status?.suspended||0)} accent={AMBER}/>
          <MiniKpi label="Needs Attention" value={fmtN(gst.gigs_needing_attention||0)} accent={gst.gigs_needing_attention>0?RED:'#9097A8'}/>
        </div>
        <div style={{padding:'12px 14px',background:'#F7F5F0',borderRadius:'7px',border:'1px solid #E8E4DC'}}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:'8px'}}>
            <span style={{fontSize:'9px',fontWeight:700,letterSpacing:'.12em',textTransform:'uppercase',color:'#9097A8',fontFamily:mono}}>PLATFORM AVG SCORES</span>
          </div>
          <Bar value={gst.avg_content_score||0} max={100} color={GOLD} label="Content score"/>
          <div style={{marginTop:'10px'}}>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:'11px',marginBottom:'4px'}}>
              <span style={{color:'#5C6070'}}>Platform CTR</span>
              <span style={{fontFamily:mono,fontWeight:700,color:NAVY}}>{fmtPct(gst.platform_ctr||0)}</span>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:'11px',marginBottom:'4px'}}>
              <span style={{color:'#5C6070'}}>Total impressions</span>
              <span style={{fontFamily:mono,fontWeight:700,color:NAVY}}>{fmtN(gst.total_impressions||0,true)}</span>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:'11px'}}>
              <span style={{color:'#5C6070'}}>Total clicks</span>
              <span style={{fontFamily:mono,fontWeight:700,color:NAVY}}>{fmtN(gst.total_clicks||0,true)}</span>
            </div>
          </div>
        </div>
      </Section>
    </div>

    {/* ──────── RECENT ACTIVITY TICKER ──────────────────────────────────────── */}
    <Section title="Recent Activity" subtitle="Live order stream" accent={NAVY}
      right={<button onClick={()=>onNav?.('orders')} style={{fontSize:'11px',color:NAVY,fontFamily:mono,background:'none',border:'1px solid #DDD8CE',padding:'5px 10px',borderRadius:'4px',cursor:'pointer'}}>view all →</button>}>
      <div style={{background:TERM,borderRadius:'7px',padding:'12px 14px',color:'#fff'}}>
        <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'10px'}}>
          <span style={{width:'6px',height:'6px',borderRadius:'50%',background:GREEN,boxShadow:`0 0 6px ${GREEN}`,animation:'pulse 1.6s ease-in-out infinite'}}/>
          <span style={{fontSize:'9px',fontWeight:700,letterSpacing:'.14em',color:'rgba(255,255,255,.55)',fontFamily:mono}}>LIVE STREAM</span>
          <span style={{flex:1,height:'1px',background:'rgba(255,255,255,.10)'}}/>
          <span style={{fontSize:'10px',color:'rgba(255,255,255,.40)',fontFamily:mono}}>showing {Math.min(10,(aor.orders||[]).length)} most recent</span>
        </div>
        {(aor.orders||[]).slice(0,8).map((o,i)=>(
          <div key={i} style={{display:'flex',alignItems:'center',gap:'10px',padding:'7px 0',borderBottom:i<7?'1px solid rgba(255,255,255,.06)':'none'}}>
            <span style={{fontFamily:mono,fontSize:'10px',color:'rgba(255,255,255,.40)',width:'72px'}}>{new Date(o.created_at).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}</span>
            <span style={{fontFamily:mono,fontSize:'10px',color:'rgba(255,255,255,.50)',width:'80px'}}>{(o.order_number||o.id||'').slice(0,8)}</span>
            <span style={{flex:1,fontSize:'12px',color:'rgba(255,255,255,.85)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{o.service_title||'service order'}</span>
            <span style={{fontFamily:mono,fontSize:'11px',color:'rgba(255,255,255,.55)'}}>{o.client_name||'—'}</span>
            <span style={{padding:'2px 6px',borderRadius:'3px',fontSize:'9px',fontWeight:700,letterSpacing:'.05em',textTransform:'uppercase',background:o.status==='completed'?'rgba(34,197,94,.20)':o.status==='cancelled'?'rgba(239,68,68,.20)':'rgba(196,164,90,.18)',color:o.status==='completed'?'#86EFAC':o.status==='cancelled'?'#FCA5A5':'#FCD34D',fontFamily:mono}}>{o.status?.replace('_',' ')}</span>
            <span style={{fontFamily:mono,fontSize:'12px',color:GOLD2,fontWeight:600,fontVariantNumeric:'tabular-nums',width:'70px',textAlign:'right'}}>{$(o.gross||0)}</span>
          </div>
        ))}
        {(!aor.orders||aor.orders.length===0)&&!loading&&<div style={{padding:'24px',textAlign:'center',color:'rgba(255,255,255,.40)',fontSize:'12px',fontFamily:mono}}>// no orders yet</div>}
      </div>
    </Section>

    {/* ──────── FOOTER SYSTEM STATUS ────────────────────────────────────────── */}
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 18px',background:'#fff',border:'1px solid #DDD8CE',borderRadius:'8px',fontFamily:mono,fontSize:'10px',color:'#9097A8',letterSpacing:'.06em',flexWrap:'wrap',gap:'10px'}}>
      <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
        <span style={{display:'inline-flex',alignItems:'center',gap:'5px'}}>
          <span style={{width:'5px',height:'5px',borderRadius:'50%',background:GREEN}}/>
          API: OK
        </span>
        <span style={{display:'inline-flex',alignItems:'center',gap:'5px'}}>
          <span style={{width:'5px',height:'5px',borderRadius:'50%',background:GREEN}}/>
          DB: OK
        </span>
        <span style={{display:'inline-flex',alignItems:'center',gap:'5px'}}>
          <span style={{width:'5px',height:'5px',borderRadius:'50%',background:con.summary?.active>0?GREEN:AMBER}}/>
          STRIPE: {con.summary?.active>0?'OK':'CHECK'}
        </span>
      </div>
      <div>
        v2.0 · yousafe-portal · {fmtN(allUsers)} active users · {fmtN(ov.total_orders||0)} orders processed
      </div>
    </div>

    {/* keyframes for pulse animation */}
    <style>{`
      @keyframes pulse {
        0%,100% { opacity: 1; transform: scale(1); }
        50%     { opacity: .55; transform: scale(.85); }
      }
    `}</style>
  </div>
}
