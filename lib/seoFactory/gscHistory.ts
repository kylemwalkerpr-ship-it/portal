/**
 * portal-patch/lib/seoFactory/gscHistory.ts — P1-1 Snapshot versioning (portal/Supabase)
 * Persists daily GSC payloads for decay-delta (latest vs 7-days-ago) so War Room
 * can prioritize defend plays. Identical contract to src/convex/gscHistory.ts.
 */
import { createSupabaseAdminClient } from '@/lib/supabase'
function dbc() { return createSupabaseAdminClient() }
export async function saveSnapshotVersion(siteUrl: string, dateKey: string, rows: number, payload: string) {
  const db = dbc()
  const parsed = JSON.parse(payload)
  const { data: existing, error: readErr } = await db.from('gsc_snapshots').select('id').eq('site_url', siteUrl).eq('date_key', dateKey).maybeSingle()
  if (readErr) throw new Error(readErr.message)
  if (existing) {
    const { error } = await db.from('gsc_snapshots').update({ rows, payload: parsed, created_at: new Date().toISOString() }).eq('id', existing.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await db.from('gsc_snapshots').insert({ site_url: siteUrl, date_key: dateKey, rows, payload: parsed })
    if (error) throw new Error(error.message)
  }
}
export async function listSnapshots(siteUrl: string, limit = 14) {
  const db = dbc()
  const { data } = await (db as any).from('gsc_snapshots').select('*').eq('site_url', siteUrl).order('date_key', { ascending:false }).limit(limit)
  return data ?? []
}
export async function decayDelta(siteUrl: string) {
  const snaps = await listSnapshots(siteUrl, 14)
  if (snaps.length < 2) return { compared:false as const, reason:'need 2 snapshots' }
  const latest = snaps[0], weekAgo = snaps.find((s:any)=> s.date_key !== latest.date_key) ?? snaps[1]
  try {
    const a = (typeof latest.payload === 'string' ? JSON.parse(latest.payload) : latest.payload) as { rows?: Array<{keys:string[], impressions:number, ctr:number, position:number}> }
    const b = (typeof weekAgo.payload === 'string' ? JSON.parse(weekAgo.payload) : weekAgo.payload) as { rows?: Array<{keys:string[], impressions:number, ctr:number, position:number}> }
    const mapB = new Map<string,{impressions:number, ctr:number, position:number}>()
    for (const r of b.rows ?? []) mapB.set((r.keys[0]??'').toLowerCase(), r)
    const decayed: Array<{query:string, deltaImpr:number, deltaCtr:number, deltaPos:number}>=[]
    for (const r of a.rows ?? []) {
      const q=(r.keys[0]??'').toLowerCase(); const prev=mapB.get(q); if(!prev) continue
      const dImpr=r.impressions-prev.impressions, dCtr=r.ctr-prev.ctr
      if (dImpr < -50 || dCtr < -0.3) decayed.push({ query:r.keys[0]!, deltaImpr:dImpr, deltaCtr:Number(dCtr.toFixed(2)), deltaPos:Number((r.position-prev.position).toFixed(1)) })
    }
    decayed.sort((x,y)=> x.deltaImpr - y.deltaImpr)
    return { compared:true as const, latestKey:latest.date_key, weekAgoKey:weekAgo.date_key, decayed: decayed.slice(0,20) }
  } catch { return { compared:false as const, reason:'parse error' } }
}
