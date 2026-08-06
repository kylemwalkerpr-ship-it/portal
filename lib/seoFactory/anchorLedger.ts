/**
 * portal-patch/lib/seoFactory/anchorLedger.ts — P1-3 Anchor ledger (portal/Supabase)
 */
import { createClient } from '@supabase/supabase-js'
function dbc(){ return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth:{autoRefreshToken:false,persistSession:false}}) }
export async function recordAnchors(sourceSlug:string, sourceJobId:string|null, links: Array<{targetUrl:string, anchor:string, weight?:number}>){
  if(!links.length) return; const db=dbc(); const rows=links.map(l=>({ source_slug:sourceSlug, source_job_id: sourceJobId, target_url:l.targetUrl, anchor:l.anchor, weight:l.weight??null })); await (db as any).from('anchor_ledger').insert(rows)
}
export async function topTargets(limit=20){
  const db=dbc(); const {data}=await (db as any).from('anchor_ledger').select('target_url, anchor').order('created_at',{ascending:false}).limit(50)
  const byTarget=new Map<string,{count:number, anchors:string[]}>()
  for(const r of (data??[]) as Array<{target_url:string, anchor:string}>){ const e=byTarget.get(r.target_url)??{count:0, anchors:[]}; e.count+=1; if(!e.anchors.includes(r.anchor)) e.anchors.push(r.anchor); byTarget.set(r.target_url,e) }
  return [...byTarget.entries()].map(([url,v])=>({targetUrl:url,count:v.count, anchors:v.anchors.slice(0,5)})).sort((a,b)=> b.count-a.count).slice(0,20)
}
export async function anchorsForSource(sourceSlug:string, limit=50){
  const db=dbc(); const {data}=await (db as any).from('anchor_ledger').select('*').eq('source_slug',sourceSlug).order('created_at',{ascending:false}).limit(limit); return data ?? []
}
