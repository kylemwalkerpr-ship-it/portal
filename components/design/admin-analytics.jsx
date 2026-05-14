// @ts-nocheck
'use client'
import React from 'react'
import { C, Card, Badge, Btn } from './shared'

// ─── Design tokens ────────────────────────────────────────────────────────────
const serif = "'Cormorant Garamond', 'Garamond', Georgia, serif"
const sans  = C.sans
const NAVY  = '#1B2D4F'
const GOLD  = '#9A7B3B'
const GREEN = '#1A6B45'
const AMBER = '#8B5E0A'
const RED   = '#8B1A1A'
const PURPLE= '#3D2B6B'

const TABS = [
  { id: 'overview',    label: 'Overview',    icon: '📊' },
  { id: 'revenue',     label: 'Revenue',     icon: '💰' },
  { id: 'users',       label: 'Users',       icon: '👥' },
  { id: 'marketplace', label: 'Marketplace', icon: '🏬' },
  { id: 'orders',      label: 'Orders',      icon: '📦' },
  { id: 'providers',   label: 'Providers',   icon: '⚖️' },
  { id: 'engagement',  label: 'Engagement',  icon: '📈' },
]

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmtCurrency = (n, compact = false) => {
  const v = Number(n) || 0
  if (compact && v >= 1e6) return `$${(v/1e6).toFixed(1)}M`
  if (compact && v >= 1e3) return `$${(v/1e3).toFixed(1)}K`
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)
}
const fmtNum   = (n, compact = false) => { const v = Number(n)||0; if(compact&&v>=1e6) return `${(v/1e6).toFixed(1)}M`; if(compact&&v>=1e3) return `${(v/1e3).toFixed(1)}K`; return v.toLocaleString() }
const fmtPct   = n => `${(Number(n)||0).toFixed(1)}%`
const fmtDate  = s => s ? new Date(s).toLocaleDateString('en-GB',{day:'numeric',month:'short'}) : '—'
const ago      = s => { if(!s) return '—'; const d=Math.floor((Date.now()-new Date(s))/86400000); return d===0?'Today':d===1?'Yesterday':d<30?`${d}d ago`:d<365?`${Math.floor(d/30)}mo ago`:`${Math.floor(d/365)}y ago` }

// ─── SVG chart primitives ─────────────────────────────────────────────────────
function BarChart({ data=[], height=100, color=NAVY, labelColor='#9097A8', showValues=false }) {
  if (!data.length) return <EmptyChart height={height} />
  const max = Math.max(...data.map(d=>d.value),1)
  const w = 100/data.length
  return (
    <svg viewBox={`0 0 100 ${height+18}`} preserveAspectRatio="none" style={{width:'100%',height:height+18,overflow:'visible'}}>
      {data.map((d,i)=>{
        const bh=(d.value/max)*height, x=i*w+w*.1, bw=w*.8
        return(
          <g key={i}>
            <title>{d.label}: {typeof d.value==='number'&&d.value>100?fmtCurrency(d.value):fmtNum(d.value)}</title>
            <rect x={x} y={height-bh} width={bw} height={bh} fill={d.highlight?GOLD:color} rx="1.5" opacity=".92"/>
            <text x={x+bw/2} y={height+12} textAnchor="middle" fontSize="4.5" fill={labelColor} fontFamily={sans}>{d.shortLabel||d.label}</text>
            {showValues&&bh>10&&<text x={x+bw/2} y={height-bh-2} textAnchor="middle" fontSize="4" fill={color} fontFamily={sans} fontWeight="700">{fmtNum(d.value,true)}</text>}
          </g>
        )
      })}
    </svg>
  )
}

function LineChart({ data=[], height=80, color=NAVY, fill=`rgba(27,45,79,0.07)`, showDots=true }) {
  if (data.length<2) return <EmptyChart height={height} />
  const max=Math.max(...data.map(d=>d.value),1), min=0
  const pts=data.map((d,i)=>({ x:(i/(data.length-1))*100, y:height-((d.value-min)/(max-min))*height }))
  const line=pts.map((p,i)=>`${i===0?'M':'L'}${p.x},${p.y}`).join(' ')
  const area=`${line} L${pts[pts.length-1].x},${height} L0,${height} Z`
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{width:'100%',height}}>
      <path d={area} fill={fill}/>
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>
      {showDots&&pts.map((p,i)=>(
        <circle key={i} cx={p.x} cy={p.y} r="1.8" fill={color} vectorEffect="non-scaling-stroke">
          <title>{data[i].label}: {fmtCurrency(data[i].value)}</title>
        </circle>
      ))}
    </svg>
  )
}

function MultiLineChart({ series=[], height=100, labels=[] }) {
  if (!series.length||!series[0]?.length) return <EmptyChart height={height}/>
  const allVals=series.flatMap(s=>s.map(d=>d.value))
  const max=Math.max(...allVals,1)
  const colors=[NAVY,GOLD,GREEN,AMBER,PURPLE]
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{width:'100%',height,overflow:'visible'}}>
      {series.map((s,si)=>{
        const pts=s.map((d,i)=>({x:(i/(s.length-1))*100,y:height-(d.value/max)*height}))
        const line=pts.map((p,i)=>`${i===0?'M':'L'}${p.x},${p.y}`).join(' ')
        return <path key={si} d={line} fill="none" stroke={colors[si%colors.length]} strokeWidth="1.5" vectorEffect="non-scaling-stroke" opacity=".9"/>
      })}
    </svg>
  )
}

function DonutChart({ segments=[], size=72, thick=10 }) {
  const total=segments.reduce((s,g)=>s+g.value,0)
  if (!total) return <div style={{width:size,height:size,borderRadius:'50%',background:'#F2EFE9'}}/>
  const r=(size-thick)/2-2, cx=size/2, cy=size/2, circ=2*Math.PI*r
  let cum=0
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F2EFE9" strokeWidth={thick}/>
      {segments.filter(s=>s.value>0).map((seg,i)=>{
        const pct=seg.value/total, offset=circ*(1-cum), dash=circ*pct
        cum+=pct
        return <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={seg.color} strokeWidth={thick} strokeDasharray={`${dash} ${circ-dash}`} strokeDashoffset={offset} style={{transform:'rotate(-90deg)',transformOrigin:`${cx}px ${cy}px`}}><title>{seg.label}: {fmtPct(pct*100)}</title></circle>
      })}
    </svg>
  )
}

function FunnelChart({ steps=[] }) {
  if (!steps.length) return null
  const max=steps[0].value||1
  return (
    <div style={{display:'flex',flexDirection:'column',gap:'4px'}}>
      {steps.map((s,i)=>{
        const pct=Math.min(100,(s.value/max)*100)
        const conv=i>0&&steps[i-1].value>0?(s.value/steps[i-1].value*100).toFixed(1):null
        return(
          <div key={i}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'3px'}}>
              <span style={{fontSize:'12px',fontWeight:600,color:NAVY,display:'flex',alignItems:'center',gap:'6px'}}>
                <span style={{fontSize:'14px'}}>{s.icon}</span>{s.label}
              </span>
              <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                {conv&&<span style={{fontSize:'11px',color:GREEN,fontWeight:600}}>{conv}% →</span>}
                <span style={{fontSize:'13px',fontWeight:800,color:NAVY,fontVariantNumeric:'tabular-nums'}}>{fmtNum(s.value,true)}</span>
              </div>
            </div>
            <div style={{height:'28px',borderRadius:'4px',background:'#F2EFE9',overflow:'hidden',position:'relative'}}>
              <div style={{height:'100%',width:`${pct}%`,background:`linear-gradient(90deg, ${s.color||NAVY}, ${s.color||NAVY}cc)`,borderRadius:'4px',display:'flex',alignItems:'center',justifyContent:'flex-end',padding:'0 8px',transition:'width .4s ease'}}>
                <span style={{fontSize:'11px',fontWeight:700,color:'#fff',opacity:pct>20?1:0}}>{fmtPct(pct)}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function SparkLine({ values=[], color=NAVY }) {
  if (values.length<2) return null
  const max=Math.max(...values,1)
  const pts=values.map((v,i)=>`${(i/(values.length-1))*60},${18-(v/max)*16}`).join(' ')
  return <svg viewBox="0 0 60 18" style={{width:60,height:18,flexShrink:0}}><polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke"/></svg>
}

function EmptyChart({ height=80 }) {
  return <div style={{height,display:'flex',alignItems:'center',justifyContent:'center',color:'#9097A8',fontSize:'13px',background:'#FAFAF8',borderRadius:'6px'}}>No data yet</div>
}

// ─── KPI card ─────────────────────────────────────────────────────────────────
function Kpi({ label, value, sub, delta, icon, accent=NAVY, spark, onClick }) {
  const [hov,setHov]=React.useState(false)
  return (
    <div onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)} onClick={onClick}
      style={{background:'#fff',border:`1px solid ${hov&&onClick?NAVY:'#DDD8CE'}`,borderTop:`3px solid ${accent}`,borderRadius:'8px',padding:'16px 18px',cursor:onClick?'pointer':'default',boxShadow:hov&&onClick?`0 4px 14px rgba(27,45,79,0.12)`:'0 1px 3px rgba(27,45,79,0.05)',transition:'all .15s',display:'flex',flexDirection:'column',gap:'5px'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <span style={{fontSize:'11px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.08em',color:'#9097A8'}}>{label}</span>
        <span style={{fontSize:'15px',opacity:.45}}>{icon}</span>
      </div>
      <div style={{fontWeight:800,fontSize:'24px',color:NAVY,letterSpacing:'-.02em',lineHeight:1,fontVariantNumeric:'tabular-nums'}}>{value}</div>
      {sub&&<div style={{fontSize:'12px',color:'#9097A8',lineHeight:1.4}}>{sub}</div>}
      {delta!==undefined&&<div style={{fontSize:'11px',fontWeight:700,color:delta>=0?GREEN:RED,display:'flex',alignItems:'center',gap:'3px'}}>{delta>=0?'▲':'▼'} {Math.abs(delta).toFixed(1)}% MoM</div>}
      {spark&&<div style={{marginTop:'4px'}}>{spark}</div>}
    </div>
  )
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Sec({ title, sub, right, children }) {
  return (
    <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
      <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',gap:'12px'}}>
        <div>
          <h3 style={{fontFamily:serif,fontWeight:600,fontSize:'20px',color:NAVY,margin:0,letterSpacing:'-.01em'}}>{title}</h3>
          {sub&&<p style={{margin:'3px 0 0',fontSize:'13px',color:'#9097A8',lineHeight:1.5}}>{sub}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  )
}

// ─── Data table ───────────────────────────────────────────────────────────────
function DT({ cols, rows, empty='No data' }) {
  return (
    <div style={{background:'#fff',border:'1px solid #DDD8CE',borderRadius:'8px',overflow:'hidden'}}>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',minWidth:`${cols.length*100}px`}}>
          <thead>
            <tr>{cols.map(c=><th key={c.key} style={{padding:'10px 13px',textAlign:c.r?'right':'left',fontSize:'11px',fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:'rgba(255,255,255,.70)',background:NAVY,whiteSpace:'nowrap',borderBottom:'2px solid rgba(255,255,255,.08)'}}>{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length===0
              ?<tr><td colSpan={cols.length} style={{padding:'32px',textAlign:'center',color:'#9097A8',fontSize:'13px'}}>{empty}</td></tr>
              :rows.map((row,ri)=>(
                <tr key={ri} style={{background:ri%2===0?'#fff':'#FAFAF8',borderBottom:'1px solid #F2EFE9'}}>
                  {cols.map(c=><td key={c.key} style={{padding:'10px 13px',fontSize:'13px',textAlign:c.r?'right':'left',color:c.dim?'#9097A8':NAVY,fontWeight:c.bold?700:400,whiteSpace:c.wrap?'normal':'nowrap',fontVariantNumeric:'tabular-nums'}}>{row[c.key]??'—'}</td>)}
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Period selector ──────────────────────────────────────────────────────────
function PeriodSelect({ value, onChange }) {
  return (
    <select value={value} onChange={e=>onChange(e.target.value)}
      style={{padding:'7px 12px',borderRadius:'6px',border:'1px solid #DDD8CE',fontSize:'13px',fontFamily:sans,background:'#fff',cursor:'pointer',color:NAVY,fontWeight:600}}>
      <option value="7d">Last 7 days</option>
      <option value="30d">Last 30 days</option>
      <option value="90d">Last 90 days</option>
      <option value="365d">Last 365 days</option>
      <option value="all">All time</option>
    </select>
  )
}

// ─── Badge helpers ────────────────────────────────────────────────────────────
function RankBadge({ rank }) {
  const medals=['🥇','🥈','🥉']
  return <span style={{fontSize:'16px'}}>{medals[rank-1]||`#${rank}`}</span>
}

// ─── Stat row ─────────────────────────────────────────────────────────────────
function StatRow({ label, value, bar, color=NAVY, max=100 }) {
  const pct=Math.min(100,(Number(value)||0)/Math.max(1,Number(max))*100)
  return (
    <div style={{display:'flex',alignItems:'center',gap:'10px',padding:'6px 0',borderBottom:'1px solid #F2EFE9'}}>
      <span style={{fontSize:'13px',color:'#5C6070',flex:1}}>{label}</span>
      {bar&&<div style={{width:'80px',height:'5px',borderRadius:'2px',background:'#F2EFE9',overflow:'hidden',flexShrink:0}}>
        <div style={{height:'100%',width:`${pct}%`,background:color,borderRadius:'2px',transition:'width .4s'}}/>
      </div>}
      <span style={{fontSize:'13px',fontWeight:700,color:NAVY,fontVariantNumeric:'tabular-nums',minWidth:'48px',textAlign:'right'}}>{value}</span>
    </div>
  )
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────
function Skeleton({ h=20, w='100%', r=4 }) {
  return <div style={{height:h,width:w,background:'#F2EFE9',borderRadius:r,animation:'pulse 1.5s ease-in-out infinite'}}/>
}
function KpiSkeleton() {
  return <div style={{background:'#fff',border:'1px solid #DDD8CE',borderTop:`3px solid #F2EFE9`,borderRadius:'8px',padding:'16px 18px',display:'flex',flexDirection:'column',gap:'8px'}}>
    <Skeleton h={11} w="55%"/>
    <Skeleton h={28} w="40%"/>
    <Skeleton h={12} w="70%"/>
  </div>
}

// ─── Hook: fetch analytics endpoint ───────────────────────────────────────────
function useAnalytics(endpoint, params='') {
  const [data,setData]=React.useState(null)
  const [loading,setLoading]=React.useState(true)
  const [error,setError]=React.useState('')
  const load=React.useCallback(async()=>{
    setLoading(true);setError('')
    try{
      const res=await fetch(`/api/admin/analytics/${endpoint}${params?'?'+params:''}`,{credentials:'same-origin'})
      const json=await res.json().catch(()=>({}))
      if(!res.ok) throw new Error(json?.error?.message||json?.error||'Failed')
      setData(json?.data??json)
    }catch(e){setError(e.message)}finally{setLoading(false)}
  },[endpoint,params])
  React.useEffect(()=>{load()},[load])
  return {data,loading,error,reload:load}
}

// ─── Export CSV helper ────────────────────────────────────────────────────────
function exportCSV(rows, filename) {
  if(!rows?.length) return
  const keys=Object.keys(rows[0])
  const csv=[keys.join(','),...rows.map(r=>keys.map(k=>JSON.stringify(r[k]??'')).join(','))].join('\n')
  const a=document.createElement('a')
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}))
  a.download=filename;a.click()
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function AdminAnalyticsPro() {
  const [tab,setTab]=React.useState('overview')
  const [period,setPeriod]=React.useState('30d')
  const [exportMsg,setExportMsg]=React.useState('')

  const flash=(msg)=>{setExportMsg(msg);setTimeout(()=>setExportMsg(''),3000)}

  // ── Per-tab data hooks ─────────────────────────────────────────────────────
  const overview   =useAnalytics('overview')
  const revenue    =useAnalytics('revenue',   `period=${period}&granularity=day`)
  const users      =useAnalytics('users',     `period=${period}`)
  const marketplace=useAnalytics('marketplace')
  const orders     =useAnalytics('orders',    `period=${period}`)
  const providers  =useAnalytics('providers')

  // Re-fetch period-sensitive endpoints when period changes
  React.useEffect(()=>{
    revenue.reload(); users.reload(); orders.reload()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[period])

  // ── Overview derived ───────────────────────────────────────────────────────
  const ov=overview.data||{}

  // ── Revenue derived ────────────────────────────────────────────────────────
  const rv=revenue.data||{}
  const revSeries=(rv.time_series||[]).slice(-30)
  const revBarData=revSeries.map((d,i)=>({label:fmtDate(d.date),shortLabel:fmtDate(d.date).split(' ')[0],value:Number(d.gross)||0,highlight:i===revSeries.length-1}))
  const revLineData=revSeries.map(d=>({label:fmtDate(d.date),value:Number(d.gross)||0}))
  const cumulativeData=(rv.time_series||[]).map((d,i,arr)=>({label:fmtDate(d.date),value:arr.slice(0,i+1).reduce((s,x)=>s+Number(x.gross||0),0)}))

  // ── Users derived ──────────────────────────────────────────────────────────
  const ud=users.data||{}
  const growthSeries=(ud.growth_series||[]).map(d=>({label:fmtDate(d.date),value:Number(d.new_users)||0}))

  // ── Marketplace derived ────────────────────────────────────────────────────
  const md=marketplace.data||{}
  const funnel=md.funnel||{}
  const funnelSteps=[
    {label:'Impressions',value:funnel.impressions||0,icon:'👁',color:NAVY},
    {label:'Clicks',value:funnel.clicks||0,icon:'🖱',color:PURPLE},
    {label:'Saves',value:funnel.saves||0,icon:'♡',color:GOLD},
    {label:'Orders',value:funnel.orders||0,icon:'🛒',color:GREEN},
  ]

  // ── Orders derived ─────────────────────────────────────────────────────────
  const od=orders.data||{}
  const byStatus=od.by_status||{}

  // ── Providers derived ──────────────────────────────────────────────────────
  const pd=providers.data||{}
  const leaderboard=pd.leaderboard||[]

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{padding:'28px',display:'flex',flexDirection:'column',gap:'22px',fontFamily:sans,minHeight:'100vh',background:'#F7F5F0'}}>

      {/* Page header */}
      <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',gap:'12px',flexWrap:'wrap'}}>
        <div>
          <div style={{fontSize:'11px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.14em',color:'#9097A8',marginBottom:'4px'}}>Intelligence</div>
          <h2 style={{fontFamily:serif,fontWeight:600,fontSize:'34px',color:NAVY,margin:0,letterSpacing:'-.015em',lineHeight:1.1}}>Site Analytics</h2>
          <p style={{color:'#9097A8',fontSize:'13px',margin:'5px 0 0',lineHeight:1.5}}>
            Full-spectrum platform analytics — revenue, users, marketplace, orders, and provider performance.
          </p>
        </div>
        <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
          {exportMsg&&<span style={{fontSize:'12px',color:GREEN,fontWeight:600}}>{exportMsg}</span>}
          <PeriodSelect value={period} onChange={setPeriod}/>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{display:'flex',borderBottom:`1px solid #DDD8CE`,gap:0,overflowX:'auto',background:'#fff',borderRadius:'8px 8px 0 0',boxShadow:'0 1px 3px rgba(27,45,79,0.05)'}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{display:'inline-flex',alignItems:'center',gap:'5px',padding:'12px 18px',fontSize:'13px',fontWeight:tab===t.id?600:400,color:tab===t.id?NAVY:'#9097A8',background:'none',border:'none',borderBottom:tab===t.id?`2px solid ${NAVY}`:'2px solid transparent',cursor:'pointer',whiteSpace:'nowrap',fontFamily:sans,transition:'color .12s'}}>
            <span style={{opacity:tab===t.id?1:.6}}>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ────────────────────────────────────────────────────────── */}
      {tab==='overview'&&(
        <>
          {/* Primary KPIs */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(185px,1fr))',gap:'12px'}}>
            {overview.loading?[1,2,3,4,5,6].map(i=><KpiSkeleton key={i}/>):<>
              <Kpi label="Gross Revenue" value={fmtCurrency(ov.gross_revenue,true)} sub={`${fmtCurrency(ov.gross_30d,true)} last 30d`} accent={GREEN} icon="💰"
                spark={<SparkLine values={revSeries.map(d=>Number(d.gross)||0)} color={GREEN}/>}/>
              <Kpi label="Net Revenue" value={fmtCurrency(ov.net_revenue,true)} sub={`Platform share (${(ov.platform_fee_pct||30).toFixed(0)}%)`} accent={NAVY} icon="📊"
                spark={<SparkLine values={revSeries.map(d=>Number(d.net)||0)}/>}/>
              <Kpi label="Total Orders" value={fmtNum(ov.total_orders)} sub={`${fmtNum(ov.orders_30d)} last 30d`} accent={PURPLE} icon="📦"/>
              <Kpi label="Active Users" value={fmtNum((ov.by_role?.student||0)+(ov.by_role?.consultant||0)+(ov.by_role?.attorney||0))} sub={`${ov.new_users_30d||0} joined last 30d`} accent={GOLD} icon="👥"/>
              <Kpi label="Active Gigs" value={fmtNum(ov.active_gigs)} sub={`of ${fmtNum(ov.total_gigs)} total`} accent={AMBER} icon="🏬"/>
              <Kpi label="Completion Rate" value={fmtPct(ov.completion_rate)} sub={`${fmtPct(ov.cancellation_rate)} cancellation`} accent={ov.completion_rate>=70?GREEN:RED} icon="✅"/>
            </>}
          </div>

          {/* Revenue chart + KPI mix */}
          <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:'16px'}}>
            <Card style={{padding:'20px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px'}}>
                <div style={{fontFamily:serif,fontWeight:600,fontSize:'17px',color:NAVY}}>Revenue Trend</div>
                <button onClick={()=>exportCSV(rv.time_series,'revenue-series.csv')} style={{fontSize:'12px',color:'#9097A8',background:'none',border:'none',cursor:'pointer',fontFamily:sans}}>↓ CSV</button>
              </div>
              {revenue.loading?<Skeleton h={100}/>:<LineChart data={revLineData} height={100} showDots={revLineData.length<=30}/>}
            </Card>
            <Card style={{padding:'20px'}}>
              <div style={{fontFamily:serif,fontWeight:600,fontSize:'17px',color:NAVY,marginBottom:'14px'}}>Business Health</div>
              <div style={{display:'flex',flexDirection:'column',gap:'2px'}}>
                {[
                  {label:'Avg Order Value',value:fmtCurrency(ov.avg_order_value)},
                  {label:'MRR (30d gross)',value:fmtCurrency(ov.gross_30d)},
                  {label:'ARR (projected)',value:fmtCurrency((ov.gross_30d||0)*12,true)},
                  {label:'Platform Take',value:fmtPct(ov.platform_fee_pct||30)},
                  {label:'Cancellation Rate',value:fmtPct(ov.cancellation_rate)},
                  {label:'New Users (30d)',value:fmtNum(ov.new_users_30d)},
                ].map(r=><StatRow key={r.label} label={r.label} value={r.value}/>)}
              </div>
            </Card>
          </div>

          {/* User + gig split */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px'}}>
            <Card style={{padding:'20px'}}>
              <div style={{fontFamily:serif,fontWeight:600,fontSize:'17px',color:NAVY,marginBottom:'14px'}}>User Breakdown</div>
              <div style={{display:'flex',alignItems:'center',gap:'24px'}}>
                <DonutChart size={80} thick={12} segments={[
                  {label:'Students',value:ov.by_role?.student||0,color:NAVY},
                  {label:'Consultants',value:ov.by_role?.consultant||0,color:GOLD},
                  {label:'Attorneys',value:ov.by_role?.attorney||0,color:PURPLE},
                  {label:'Support',value:ov.by_role?.support||0,color:AMBER},
                ]}/>
                <div style={{flex:1}}>
                  {[{l:'Students',v:ov.by_role?.student||0,c:NAVY},{l:'Consultants',v:ov.by_role?.consultant||0,c:GOLD},{l:'Attorneys',v:ov.by_role?.attorney||0,c:PURPLE},{l:'Support',v:ov.by_role?.support||0,c:AMBER}].map(r=>(
                    <div key={r.l} style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'5px'}}>
                      <span style={{width:'8px',height:'8px',borderRadius:'2px',background:r.c,flexShrink:0}}/>
                      <span style={{fontSize:'12px',color:'#5C6070',flex:1}}>{r.l}</span>
                      <span style={{fontSize:'13px',fontWeight:700,color:NAVY}}>{fmtNum(r.v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
            <Card style={{padding:'20px'}}>
              <div style={{fontFamily:serif,fontWeight:600,fontSize:'17px',color:NAVY,marginBottom:'14px'}}>Order Status Split</div>
              {orders.loading?<Skeleton h={80}/>:(
                <div style={{display:'flex',flexDirection:'column',gap:'2px'}}>
                  {Object.entries(byStatus).slice(0,6).map(([k,v])=>(
                    <StatRow key={k} label={k.replace(/_/g,' ')} value={fmtNum(v)} bar max={ov.total_orders||1} color={k==='completed'?GREEN:k==='cancelled'?RED:NAVY}/>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}

      {/* ── REVENUE ─────────────────────────────────────────────────────────── */}
      {tab==='revenue'&&(
        <>
          <Sec title="Daily Revenue" sub={`Gross collected per day — ${period}`}
            right={<button onClick={()=>exportCSV(rv.time_series,'revenue-daily.csv')} style={{padding:'7px 14px',borderRadius:'6px',border:'1px solid #DDD8CE',background:'#fff',color:NAVY,cursor:'pointer',fontSize:'13px',fontWeight:600,fontFamily:sans}}>↓ Export CSV</button>}>
            <Card style={{padding:'20px'}}>
              {revenue.loading?<Skeleton h={140}/>:<BarChart data={revBarData} height={140} showValues/>}
            </Card>
          </Sec>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px'}}>
            <Sec title="Cumulative Revenue" sub="All-time gross collected">
              <Card style={{padding:'20px'}}>
                {revenue.loading?<Skeleton h={100}/>:<LineChart data={cumulativeData} height={100} color={GREEN} fill="rgba(26,107,69,0.07)"/>}
              </Card>
            </Sec>
            <Sec title="Revenue Split" sub="Platform vs provider vs escrow">
              <Card style={{padding:'20px'}}>
                <div style={{display:'flex',alignItems:'center',gap:'20px'}}>
                  <DonutChart size={90} thick={14} segments={[
                    {label:'Net Platform',value:rv.cumulative?.net||0,color:NAVY},
                    {label:'Provider Payouts',value:(rv.cumulative?.gross||0)-(rv.cumulative?.net||0),color:GOLD},
                  ]}/>
                  <div style={{flex:1}}>
                    {[
                      {l:'Gross Revenue',v:fmtCurrency(rv.cumulative?.gross,true),c:NAVY},
                      {l:`Net (${rv.fee_settings?.platform_fee_percent||30}% fee)`,v:fmtCurrency(rv.cumulative?.net,true),c:GREEN},
                      {l:'Provider Payouts',v:fmtCurrency((rv.cumulative?.gross||0)-(rv.cumulative?.net||0),true),c:GOLD},
                    ].map(r=>(
                      <div key={r.l} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid #F2EFE9'}}>
                        <span style={{fontSize:'12px',color:'#5C6070'}}>{r.l}</span>
                        <span style={{fontSize:'13px',fontWeight:700,color:r.c}}>{r.v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </Sec>
          </div>

          <Sec title="Revenue by Category" sub="Gross revenue per service category">
            <DT cols={[{key:'rank',label:'#',dim:true},{key:'category',label:'Category'},{key:'count',label:'Orders',r:true},{key:'gross',label:'Gross Revenue',r:true,bold:true},{key:'avg',label:'Avg Order',r:true},{key:'share',label:'% Share',r:true,dim:true}]}
              rows={(rv.by_category||[]).map((c,i)=>({rank:`#${i+1}`,category:c.category||'Uncategorised',count:fmtNum(c.count),gross:fmtCurrency(c.gross),avg:fmtCurrency(c.count?c.gross/c.count:0),share:fmtPct((c.gross/(rv.cumulative?.gross||1))*100)}))}
              empty="No category data"/>
          </Sec>

          <Sec title="Revenue by Provider Type">
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px'}}>
              {['attorney','consultant'].map(type=>{
                const d=rv.by_provider_type?.[type]||{}
                return(
                  <Card key={type} style={{padding:'18px 20px',borderTop:`3px solid ${type==='attorney'?NAVY:PURPLE}`}}>
                    <div style={{fontSize:'11px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.08em',color:'#9097A8',marginBottom:'8px'}}>
                      {type==='attorney'?'⚖️ Attorneys':'👤 Consultants'}
                    </div>
                    <div style={{fontWeight:800,fontSize:'26px',color:NAVY,marginBottom:'4px',fontVariantNumeric:'tabular-nums'}}>{fmtCurrency(d.gross,true)}</div>
                    <div style={{fontSize:'12px',color:'#9097A8'}}>{fmtNum(d.count)} orders</div>
                  </Card>
                )
              })}
            </div>
          </Sec>

          <Sec title="Full Daily Breakdown Table">
            <DT cols={[{key:'date',label:'Date'},{key:'gross',label:'Gross',r:true,bold:true},{key:'net',label:'Net (Platform)',r:true},{key:'orders',label:'Orders',r:true},{key:'aov',label:'AOV',r:true,dim:true}]}
              rows={[...(rv.time_series||[])].reverse().map(d=>({date:fmtDate(d.date),gross:fmtCurrency(d.gross),net:fmtCurrency(d.net),orders:fmtNum(d.order_count),aov:fmtCurrency(d.order_count?d.gross/d.order_count:0)}))}
              empty="No data for selected period"/>
          </Sec>
        </>
      )}

      {/* ── USERS ───────────────────────────────────────────────────────────── */}
      {tab==='users'&&(
        <>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(185px,1fr))',gap:'12px'}}>
            {users.loading?[1,2,3,4].map(i=><KpiSkeleton key={i}/>):<>
              <Kpi label="Total Users" value={fmtNum((ud.by_role?.student||0)+(ud.by_role?.consultant||0)+(ud.by_role?.attorney||0)+(ud.by_role?.support||0))} sub={`${ud.new_users_30d||0} new this month`} accent={NAVY} icon="👥"/>
              <Kpi label="Clients (Students)" value={fmtNum(ud.by_role?.student||0)} sub={`${fmtPct(ud.activation_rate||0)} activated`} accent={GREEN} icon="🎓"/>
              <Kpi label="Providers" value={fmtNum((ud.by_role?.consultant||0)+(ud.by_role?.attorney||0))} sub={`${ud.new_providers_30d||0} new last 30d`} accent={PURPLE} icon="⚖️"/>
              <Kpi label="Churn Risk" value={fmtNum(ud.churn_risk_count||0)} sub="No order in 60+ days" accent={ud.churn_risk_count>10?RED:AMBER} icon="📉"/>
            </>}
          </div>

          <Sec title="User Growth" sub={`New registrations per day — ${period}`}>
            <Card style={{padding:'20px'}}>
              {users.loading?<Skeleton h={110}/>:<BarChart data={growthSeries} height={110} color={NAVY}/>}
            </Card>
          </Sec>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px'}}>
            <Sec title="Account Status">
              <Card style={{padding:'20px'}}>
                <div style={{display:'flex',flexDirection:'column',gap:'2px'}}>
                  <StatRow label="Active" value={fmtNum(ud.by_status?.active||0)} bar max={(ud.by_status?.active||0)+(ud.by_status?.pending||0)+(ud.by_status?.suspended||0)} color={GREEN}/>
                  <StatRow label="Pending Approval" value={fmtNum(ud.by_status?.pending||0)} bar max={(ud.by_status?.active||0)+(ud.by_status?.pending||0)+(ud.by_status?.suspended||0)} color={AMBER}/>
                  <StatRow label="Suspended" value={fmtNum(ud.by_status?.suspended||0)} bar max={(ud.by_status?.active||0)+(ud.by_status?.pending||0)+(ud.by_status?.suspended||0)} color={RED}/>
                </div>
              </Card>
            </Sec>
            <Sec title="Top Countries">
              <Card style={{padding:'20px'}}>
                <div style={{display:'flex',flexDirection:'column',gap:'2px'}}>
                  {(ud.top_countries||[]).slice(0,8).map((c,i)=>(
                    <StatRow key={c.country} label={`${i+1}. ${c.country||'Unknown'}`} value={fmtNum(c.count)} bar max={ud.top_countries?.[0]?.count||1} color={NAVY}/>
                  ))}
                </div>
              </Card>
            </Sec>
          </div>
        </>
      )}

      {/* ── MARKETPLACE ─────────────────────────────────────────────────────── */}
      {tab==='marketplace'&&(
        <>
          <Sec title="Discovery Funnel" sub="Impressions → Clicks → Saves → Orders conversion">
            <Card style={{padding:'24px'}}>
              {marketplace.loading?<Skeleton h={160}/>:<FunnelChart steps={funnelSteps}/>}
            </Card>
          </Sec>

          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(185px,1fr))',gap:'12px'}}>
            {marketplace.loading?[1,2,3,4].map(i=><KpiSkeleton key={i}/>):<>
              <Kpi label="Total Impressions" value={fmtNum(funnel.impressions,true)} sub="All gig views" accent={NAVY} icon="👁"/>
              <Kpi label="Total Clicks" value={fmtNum(funnel.clicks,true)} sub={`${funnel.impressions?fmtPct(funnel.clicks/funnel.impressions*100):'0%'} CTR`} accent={PURPLE} icon="🖱"/>
              <Kpi label="Saved Gigs" value={fmtNum(funnel.saves,true)} sub="User favourites" accent={GOLD} icon="♡"/>
              <Kpi label="Avg Content Score" value={fmtPct(md.avg_content_score||0)} sub="Profile completeness" accent={md.avg_content_score>=70?GREEN:AMBER} icon="📋"/>
            </>}
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px'}}>
            <Sec title="Top Gigs by Impressions">
              <DT cols={[{key:'r',label:'#',dim:true},{key:'title',label:'Service',wrap:true},{key:'type',label:'Type'},{key:'imp',label:'Views',r:true,bold:true},{key:'ctr',label:'CTR',r:true,dim:true}]}
                rows={(md.top_gigs||[]).slice(0,8).map((g,i)=>({r:`#${i+1}`,title:g.title?.slice(0,32)+(g.title?.length>32?'…':''),type:g.provider_type==='attorney'?'⚖':'👤',imp:fmtNum(g.impressions),ctr:`${g.ctr||'0.0'}%`}))}
                empty="No gig data"/>
            </Sec>
            <Sec title="Rating Distribution">
              <Card style={{padding:'20px'}}>
                {marketplace.loading?<Skeleton h={120}/>:(
                  <div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
                    {[5,4,3,2,1].map(star=>{
                      const count=md.rating_distribution?.[star]||0
                      const total=Object.values(md.rating_distribution||{}).reduce((s,v)=>s+v,0)||1
                      return(
                        <div key={star} style={{display:'flex',alignItems:'center',gap:'8px'}}>
                          <span style={{fontSize:'13px',color:'#5C6070',width:'20px',textAlign:'right'}}>{star}★</span>
                          <div style={{flex:1,height:'16px',background:'#F2EFE9',borderRadius:'3px',overflow:'hidden'}}>
                            <div style={{height:'100%',width:`${(count/total)*100}%`,background:star>=4?GREEN:star===3?AMBER:RED,borderRadius:'3px',transition:'width .4s'}}/>
                          </div>
                          <span style={{fontSize:'12px',fontWeight:600,color:NAVY,width:'32px'}}>{fmtNum(count)}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Card>
            </Sec>
          </div>

          <Sec title="Category Performance">
            <DT cols={[{key:'cat',label:'Category'},{key:'gigs',label:'Gigs',r:true},{key:'imp',label:'Impressions',r:true,bold:true},{key:'clicks',label:'Clicks',r:true},{key:'ctr',label:'CTR',r:true,dim:true},{key:'rating',label:'Avg Rating',r:true}]}
              rows={(md.by_category||[]).map(c=>({cat:c.category||'Uncategorised',gigs:fmtNum(c.gig_count),imp:fmtNum(c.impressions),clicks:fmtNum(c.clicks),ctr:c.impressions?fmtPct(c.clicks/c.impressions*100):'0%',rating:c.avg_rating?Number(c.avg_rating).toFixed(1)+'★':'—'}))}
              empty="No category data"/>
          </Sec>
        </>
      )}

      {/* ── ORDERS ──────────────────────────────────────────────────────────── */}
      {tab==='orders'&&(
        <>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(185px,1fr))',gap:'12px'}}>
            {orders.loading?[1,2,3,4].map(i=><KpiSkeleton key={i}/>):<>
              <Kpi label="Total Orders" value={fmtNum(ov.total_orders)} sub={`${fmtNum(ov.orders_30d)} last 30d`} accent={NAVY} icon="📦"/>
              <Kpi label="Avg Order Value" value={fmtCurrency(od.avg_order_value)} accent={GREEN} icon="💰"/>
              <Kpi label="Completion Rate" value={fmtPct(od.completion_rate)} accent={od.completion_rate>=70?GREEN:RED} icon="✅"/>
              <Kpi label="Avg Days to Complete" value={`${Number(od.time_to_complete||0).toFixed(1)}d`} sub="From creation to completion" accent={GOLD} icon="🕐"/>
            </>}
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px'}}>
            <Sec title="By Status">
              <Card style={{padding:'20px'}}>
                {orders.loading?<Skeleton h={120}/>:(
                  <div style={{display:'flex',flexDirection:'column',gap:'2px'}}>
                    {Object.entries(byStatus).map(([k,v])=>(
                      <StatRow key={k} label={k.replace(/_/g,' ')} value={fmtNum(v)} bar max={ov.total_orders||1}
                        color={k==='completed'||k==='released'?GREEN:k.includes('cancel')||k.includes('refund')?RED:NAVY}/>
                    ))}
                  </div>
                )}
              </Card>
            </Sec>
            <Sec title="Escrow Health">
              <Card style={{padding:'20px'}}>
                {orders.loading?<Skeleton h={120}/>:(
                  <div style={{display:'flex',flexDirection:'column',gap:'2px'}}>
                    <StatRow label="Held (Liability)" value={fmtCurrency(od.escrow_health?.held_total)} color={AMBER}/>
                    <StatRow label="Held Orders" value={fmtNum(od.escrow_health?.held_count)} color={AMBER}/>
                    <StatRow label="Released (Revenue)" value={fmtCurrency(od.escrow_health?.released_total)} color={GREEN}/>
                    <StatRow label="Released Orders" value={fmtNum(od.escrow_health?.released_count)} color={GREEN}/>
                    <StatRow label="Liability Ratio" value={fmtPct(od.escrow_health?.held_total&&od.escrow_health?.released_total?(od.escrow_health.held_total/(od.escrow_health.held_total+od.escrow_health.released_total))*100:0)} color={AMBER}/>
                  </div>
                )}
              </Card>
            </Sec>
          </div>

          <Sec title="By Provider Type">
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px'}}>
              {['attorney','consultant'].map(type=>{
                const d=od.by_provider_type?.[type]||{}
                return(
                  <Card key={type} style={{padding:'18px 20px',borderTop:`3px solid ${type==='attorney'?NAVY:PURPLE}`}}>
                    <div style={{fontSize:'11px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.08em',color:'#9097A8',marginBottom:'8px'}}>{type==='attorney'?'⚖️ Attorney Orders':'👤 Consultant Orders'}</div>
                    <div style={{fontWeight:800,fontSize:'24px',color:NAVY,marginBottom:'4px'}}>{fmtNum(d.count)}</div>
                    <div style={{fontSize:'13px',color:GREEN,fontWeight:700}}>{fmtCurrency(d.gross,true)} gross</div>
                  </Card>
                )
              })}
            </div>
          </Sec>

          <Sec title="Recent Orders" right={<button onClick={()=>exportCSV(od.recent_orders,'recent-orders.csv')} style={{padding:'7px 14px',borderRadius:'6px',border:'1px solid #DDD8CE',background:'#fff',color:NAVY,cursor:'pointer',fontSize:'12px',fontWeight:600,fontFamily:sans}}>↓ CSV</button>}>
            <DT cols={[{key:'id',label:'ID',dim:true},{key:'service',label:'Service',wrap:true},{key:'student',label:'Client'},{key:'provider',label:'Provider'},{key:'amount',label:'Amount',r:true,bold:true},{key:'status',label:'Status'},{key:'date',label:'Date',dim:true}]}
              rows={(od.recent_orders||[]).map(o=>({id:o.id?.slice(0,8)+'…',service:(o.service_title||'Service').slice(0,28),student:o.student_name||'—',provider:o.consultant_name||'—',amount:fmtCurrency(o.total_amount),status:o.status,date:fmtDate(o.created_at)}))}
              empty="No recent orders"/>
          </Sec>
        </>
      )}

      {/* ── PROVIDERS ───────────────────────────────────────────────────────── */}
      {tab==='providers'&&(
        <>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(185px,1fr))',gap:'12px'}}>
            {providers.loading?[1,2,3].map(i=><KpiSkeleton key={i}/>):<>
              <Kpi label="Total Providers" value={fmtNum((pd.provider_count_by_role?.attorney||0)+(pd.provider_count_by_role?.consultant||0))} sub={`${pd.active_providers||0} with active gigs`} accent={NAVY} icon="⚖️"/>
              <Kpi label="Attorneys" value={fmtNum(pd.provider_count_by_role?.attorney||0)} accent={NAVY} icon="⚖️"/>
              <Kpi label="Consultants" value={fmtNum(pd.provider_count_by_role?.consultant||0)} accent={PURPLE} icon="👤"/>
            </>}
          </div>

          <Sec title="Provider Leaderboard" sub="Top earners ranked by gross revenue" right={<button onClick={()=>exportCSV(leaderboard,'provider-leaderboard.csv')} style={{padding:'7px 14px',borderRadius:'6px',border:'1px solid #DDD8CE',background:'#fff',color:NAVY,cursor:'pointer',fontSize:'12px',fontWeight:600,fontFamily:sans}}>↓ CSV</button>}>
            <DT
              cols={[{key:'rank',label:'Rank'},{key:'name',label:'Provider'},{key:'role',label:'Type'},{key:'orders',label:'Orders',r:true},{key:'gross',label:'Gross Earned',r:true,bold:true},{key:'rating',label:'Avg Rating',r:true},{key:'completion',label:'Completion',r:true,dim:true}]}
              rows={leaderboard.map((p,i)=>({rank:<RankBadge rank={i+1}/>,name:p.name||p.email||'—',role:p.role==='attorney'?'⚖️ Attorney':'👤 Consultant',orders:fmtNum(p.completed_orders),gross:fmtCurrency(p.gross_earnings,true),rating:p.avg_rating?`${Number(p.avg_rating).toFixed(1)}★`:'—',completion:p.completion_rate?fmtPct(p.completion_rate):'—'}))}
              empty="No provider data"/>
          </Sec>

          {pd.top_rated?.length>0&&(
            <Sec title="Top Rated Providers" sub="Highest average rating (min 2 reviews)">
              <DT
                cols={[{key:'rank',label:'#',dim:true},{key:'name',label:'Provider'},{key:'rating',label:'Rating',r:true,bold:true},{key:'reviews',label:'Reviews',r:true,dim:true}]}
                rows={(pd.top_rated||[]).map((p,i)=>({rank:`#${i+1}`,name:p.name||'—',rating:`${Number(p.avg_rating).toFixed(2)}★`,reviews:fmtNum(p.review_count)}))}
                empty="No rated providers"/>
            </Sec>
          )}
        </>
      )}

      {/* ── ENGAGEMENT ──────────────────────────────────────────────────────── */}
      {tab==='engagement'&&(
        <>
          <Sec title="Marketplace Funnel" sub="Full conversion path from discovery to purchase">
            <Card style={{padding:'24px'}}>
              {marketplace.loading?<Skeleton h={200}/>:<FunnelChart steps={funnelSteps}/>}
            </Card>
          </Sec>

          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(185px,1fr))',gap:'12px'}}>
            <Kpi label="Impression → Click" value={funnel.impressions?fmtPct(funnel.clicks/funnel.impressions*100):'—'} sub="CTR (click-through rate)" accent={PURPLE} icon="🖱"/>
            <Kpi label="Click → Save" value={funnel.clicks?fmtPct(funnel.saves/funnel.clicks*100):'—'} sub="Save rate" accent={GOLD} icon="♡"/>
            <Kpi label="Save → Order" value={funnel.saves?fmtPct(funnel.orders/funnel.saves*100):'—'} sub="Save conversion" accent={GREEN} icon="🛒"/>
            <Kpi label="Impression → Order" value={funnel.impressions?fmtPct(funnel.orders/funnel.impressions*100):'—'} sub="Overall funnel rate" accent={NAVY} icon="📊"/>
          </div>

          <Sec title="Gig Performance Matrix" sub="Impression, click, save and CTR per service">
            <DT
              cols={[{key:'title',label:'Service',wrap:true},{key:'type',label:'Type'},{key:'status',label:'Status'},{key:'imp',label:'Impressions',r:true,bold:true},{key:'clicks',label:'Clicks',r:true},{key:'saves',label:'Saves',r:true},{key:'ctr',label:'CTR',r:true,dim:true}]}
              rows={(md.top_gigs||[]).map(g=>({title:g.title?.slice(0,36)+(g.title?.length>36?'…':''),type:g.provider_type==='attorney'?'⚖️':'👤',status:g.status,imp:fmtNum(g.impressions),clicks:fmtNum(g.clicks),saves:fmtNum(g.saves||0),ctr:`${g.ctr||'0.0'}%`}))}
              empty="No gig performance data"/>
          </Sec>

          <Card style={{padding:'20px'}}>
            <div style={{fontFamily:serif,fontWeight:600,fontSize:'17px',color:NAVY,marginBottom:'12px'}}>Engagement Intelligence</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px'}}>
              <div>
                <div style={{fontSize:'13px',color:'#5C6070',lineHeight:1.7}}>
                  <strong style={{color:NAVY}}>Tracked signals:</strong> Impressions · Clicks · Saves · Shares · Purchases · Reviews · Ratings
                  <br/><strong style={{color:NAVY}}>Funnel stages:</strong> Discovery → Engagement → Intent → Conversion
                  <br/><strong style={{color:NAVY}}>Available per gig:</strong> All metrics above, with per-event granularity via <code>gig_metric_events</code>
                </div>
              </div>
              <div>
                <div style={{fontSize:'13px',color:'#5C6070',lineHeight:1.7}}>
                  <strong style={{color:AMBER}}>Gaps to build:</strong> Search query tracking · Filter usage · Session duration · Scroll depth · A/B test framework · UTM attribution · Cohort retention curves
                </div>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
