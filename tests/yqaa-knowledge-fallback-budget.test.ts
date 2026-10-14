import { loadYqaaEvidence } from '@/lib/yqaaKnowledgeDb'
jest.mock('@/lib/yqaaTypesense',()=>({searchModalYqaaKnowledge:jest.fn(async()=>null)}))
jest.mock('@/lib/supabase',()=>({isServiceRoleAchieved:()=>false,getSupabaseAdminClient:jest.fn()}))
describe('public database fallback budget',()=>{
 afterEach(()=>jest.useRealTimers())
 it('clears its timer when the database completes promptly',async()=>{
 jest.useFakeTimers()
 const query:any={abortSignal:()=>query,then:(resolve:any,reject:any)=>Promise.resolve({data:[],error:null}).then(resolve,reject)}
 const pack=await loadYqaaEvidence({query:'provider service listing',db:{rpc:()=>query},databaseFallbackTimeoutMs:2000})
 expect(pack.source).toBe('bundled')
 expect(jest.getTimerCount()).toBe(0)
 })
 it('returns bundled evidence when the RPC ignores cancellation',async()=>{
 jest.useFakeTimers()
 const abortSignal=jest.fn(function(_signal:AbortSignal){return query})
 const query:any={abortSignal,then:()=>new Promise(()=>{})}
 const db={rpc:jest.fn(()=>query)}
 let result:any=null
 const work=loadYqaaEvidence({query:'provider service listing',db,databaseFallbackTimeoutMs:2000}).then(value=>{result=value})
 await jest.advanceTimersByTimeAsync(2001)
 expect(result?.source).toBe('bundled')
 expect(abortSignal.mock.calls[0]?.[0]?.aborted).toBe(true)
 await work
 })
})
