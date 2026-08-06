/**
 * portal-patch/lib/seoFactory/crawlChecks.ts — P1-2 Crawl-budget + sitemap/llms drift (portal/Supabase)
 */
import { createClient } from '@supabase/supabase-js'
function dbc(){ return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth:{autoRefreshToken:false,persistSession:false}}) }
export type CheckType='sitemap'|'llms'|'crawl_budget'
export async function recordCheck(siteUrl:string, checkType:CheckType, status:'ok'|'drift'|'error', detail?:string){
  const db=dbc(); await (db as any).from('crawl_checks').insert({ site_url:siteUrl, check_type:checkType, status, detail, checked_at: new Date().toISOString() })
}
export async function latestChecks(siteUrl:string, limit=20){
  const db=dbc(); const {data}=await (db as any).from('crawl_checks').select('*').eq('site_url',siteUrl).order('checked_at',{ascending:false}).limit(limit); return data ?? []
}
export async function runAllChecks(siteUrl:string){
  const site=siteUrl.replace(/\/$/, '')
  const checks: Array<{type:CheckType,status:'ok'|'drift'|'error',detail?:string}>=[] 
  try{ const r=await fetch(`${site}/sitemap.xml`,{signal:AbortSignal.timeout(8000)}); const t=await r.text().catch(()=>''); if(!r.ok) checks.push({type:'sitemap',status:'error',detail:`sitemap ${r.status}`}); else if(!t.includes('<url') && !t.includes('<sitemap')) checks.push({type:'sitemap',status:'drift',detail:'sitemap empty or malformed'}); else checks.push({type:'sitemap',status:'ok',detail:`${(t.match(/<loc>/g)??[]).length} urls`}) }catch(e:any){ checks.push({type:'sitemap',status:'error',detail:String(e?.message??e).slice(0,200)}) }
  try{ const r=await fetch(`${site}/llms.txt`,{signal:AbortSignal.timeout(6000)}); if(r.status===404) checks.push({type:'llms',status:'drift',detail:'llms.txt missing — AI crawlers lack sitemap'}); else if(!r.ok) checks.push({type:'llms',status:'error',detail:`llms.txt ${r.status}`}); else{ const t=await r.text(); if(t.length<20) checks.push({type:'llms',status:'drift',detail:'llms.txt too short'}); else checks.push({type:'llms',status:'ok'}) } }catch(e:any){ checks.push({type:'llms',status:'error',detail:String(e?.message??e).slice(0,200)}) }
  try{ const db=dbc(); const {data:cfg}=await (db as any).from('gsc_tokens').select('site_url').limit(1).maybeSingle(); void cfg; // heuristic placeholder: rely on snapshot count via gsc_snapshots if present
    const { data: snaps }=await (db as any).from('gsc_snapshots').select('rows').eq('site_url', siteUrl).order('date_key',{ascending:false}).limit(1)
    const n = (snaps?.[0]?.rows ?? 0) as number
    if (n>80) checks.push({type:'crawl_budget',status:'drift',detail:`${n} queries — consider clustering thin pages`}); else checks.push({type:'crawl_budget',status:'ok',detail:`${n? n+' queries':'no snapshot yet'}`})
  }catch{ checks.push({type:'crawl_budget',status:'error',detail:'snapshot parse failed'}) }
  for(const c of checks) await recordCheck(siteUrl, c.type, c.status, c.detail)
  return checks
}
