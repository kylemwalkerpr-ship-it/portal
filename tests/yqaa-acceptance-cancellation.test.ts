const { runWithDeadline, abortableDelay } = require('../scripts/yqaa-release-identity.cjs')
describe('acceptance cancellation and settlement',()=>{
 afterEach(()=>jest.useRealTimers())
 it('cancels and settles timed-out execution before returning to cleanup',async()=>{
  jest.useFakeTimers()
  const controller=new AbortController(),events:string[]=[]
  let rejectWork:(e:Error)=>void=()=>{}
  const work=new Promise((_,reject)=>{rejectWork=reject})
  const observed=runWithDeadline(()=>work,100,controller,async()=>{events.push('cancel');rejectWork(new Error('cancelled'))}).catch(()=>{events.push('settled')})
  await jest.advanceTimersByTimeAsync(101)
  await observed
  expect(controller.signal.aborted).toBe(true)
  expect(events).toEqual(['cancel','settled'])
 })
 it('allows successful execution but still shuts down its owned resources',async()=>{
  const cancel=jest.fn(),controller=new AbortController()
  expect(await runWithDeadline(async()=> 'done',1000,controller,cancel)).toBe('done')
  expect(cancel).toHaveBeenCalledTimes(1)
 })
 it('aborts quiet waits when the independent cleanup deadline expires',async()=>{
  jest.useFakeTimers()
  const controller=new AbortController()
  const observed=abortableDelay(45000,controller.signal).catch(()=> 'cancelled')
  controller.abort()
  expect(await observed).toBe('cancelled')
  expect(jest.getTimerCount()).toBe(0)
 })
})

 describe('serialized Clerk browser sign-in',()=>{
 it('runs its readiness waits without Node-only bindings',async()=>{
 const fs=require('node:fs'),path=require('node:path')
 const source=fs.readFileSync(path.join(__dirname,'../scripts/yqaa-live-acceptance.mjs'),'utf8')
 const body=source.split('const result = await page.evaluate(async ({ ticket, expectedUserId }) => {')[1].split('}, { ticket: token.token, expectedUserId: clerkUserId })')[0]
 const root:any={loaded:false,client:{signIn:{create:async()=>({createdSessionId:'session_fixture'})}},setActive:async()=>{},user:{id:'user_fixture'}}
 const windowFixture={Clerk:root}
 const setTimeoutFixture=(resolve:()=>void)=>{root.loaded=true;resolve();return 0}
 const invoke=new Function('window','setTimeout',`return async ({ticket,expectedUserId})=>{${body}}`)(windowFixture,setTimeoutFixture)
 await expect(invoke({ticket:'synthetic_ticket',expectedUserId:'user_fixture'})).resolves.toEqual({ok:true})
 })
 })
