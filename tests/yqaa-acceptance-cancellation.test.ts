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
