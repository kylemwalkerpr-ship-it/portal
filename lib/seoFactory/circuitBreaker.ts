/**
 * portal-patch/lib/seoFactory/circuitBreaker.ts — P3 provider circuit-breaker (portal/Node)
 * Same thresholds as src/convex/circuitBreaker.ts. In-memory per isolate.
 */
export type Provider='xai'|'openai'|'nvidia'|'groq'|'anthropic'
const WINDOW_MS=5*60*1000, THRESHOLD=3
const fails=new Map<Provider,{count:number; lastAt:number}>()
export function recordFailure(p:Provider){ const cur=fails.get(p)??{count:0,lastAt:0}; fails.set(p,{count:cur.count+1, lastAt: Date.now()}) }
export function recordSuccess(p:Provider){ fails.delete(p) }
export function isOpen(p:Provider){ const cur=fails.get(p); if(!cur) return false; if(cur.count < THRESHOLD) return false; if(Date.now()-cur.lastAt > WINDOW_MS){ fails.delete(p); return false } return true }
export function breakerLabel(p:Provider){ if(!isOpen(p)) return null; const cur=fails.get(p)!; const left=Math.max(0, Math.ceil((WINDOW_MS-(Date.now()-cur.lastAt))/1000)); return `${p} circuit-open (${cur.count} fails, retry in ${left}s)` }
export function breakerStatus(){ const out: Array<{provider:Provider, fails:number, open:boolean, retryInSec:number}> =[]; for(const p of ['nvidia','groq','openai','anthropic'] as Provider[]){ const cur=fails.get(p); const open=isOpen(p); out.push({provider:p, fails:cur?.count??0, open, retryInSec: open? Math.ceil((WINDOW_MS-(Date.now()-cur!.lastAt))/1000):0 }) } return out }
