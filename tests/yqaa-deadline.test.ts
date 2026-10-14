import {
  createYqaaDeadline,
  fetchYqaaJsonWithTimeout,
  YqaaDeadlineError,
  YQAA_DM_AUTOREPLY_RUNTIME_BUDGET_MS,
  YQAA_DM_REPLY_COMMIT_RESERVE_MS,
  YQAA_DM_DIAGNOSTIC_BUDGET_MS,
} from '@/lib/yqaaDeadline'
import fs from 'node:fs'
import path from 'node:path'

describe('YQAA end-to-end deadline', () => {
  afterEach(() => jest.useRealTimers())

  it('aborts in-flight upstream work and rejects the route race at the deadline', async () => {
    jest.useFakeTimers()
    const deadline = createYqaaDeadline(null, 100)
    let aborted = false
    const upstream = new Promise<void>((_resolve, reject) => {
      deadline.signal.addEventListener('abort', () => { aborted = true; reject(deadline.signal.reason) })
    })
    const raced = deadline.race(upstream)
    const assertion = expect(raced).rejects.toBeInstanceOf(YqaaDeadlineError)
    await jest.advanceTimersByTimeAsync(100)
    await assertion
    expect(aborted).toBe(true)
    deadline.close()
  })

  it('cancels work when the client disconnects', async () => {
    const client = new AbortController()
    const deadline = createYqaaDeadline(client.signal, 1000)
    client.abort()
    expect(deadline.signal.aborted).toBe(true)
    deadline.close()
  })

  it('keeps cancellation active until a stalled provider response body is consumed', async () => {
    const originalFetch = global.fetch
    const parent = new AbortController()
    let bodyCancelled = false
    global.fetch = jest.fn(async () => new Response(new ReadableStream<Uint8Array>({
      cancel() { bodyCancelled = true },
    }))) as typeof fetch
    try {
      const pending = fetchYqaaJsonWithTimeout('https://provider.invalid', {}, 1000, parent.signal)
      await Promise.resolve()
      parent.abort()
      await expect(pending).rejects.toBeDefined()
      expect(bodyCancelled).toBe(true)
    } finally {
      global.fetch = originalFetch
    }
  })

  it('ends scheduled DM work before the Cloudflare waitUntil lifetime and aborts its upstream request', async () => {
    jest.useFakeTimers()
    expect(YQAA_DM_AUTOREPLY_RUNTIME_BUDGET_MS).toBe(27_000)
    expect(YQAA_DM_AUTOREPLY_RUNTIME_BUDGET_MS + YQAA_DM_DIAGNOSTIC_BUDGET_MS).toBeLessThan(30_000)

    const deadline = createYqaaDeadline(null, YQAA_DM_AUTOREPLY_RUNTIME_BUDGET_MS)
    let aborted = false
    const work = new Promise<void>((_resolve, reject) => {
      deadline.signal.addEventListener('abort', () => {
        aborted = true
        reject(deadline.signal.reason)
      })
    })
    const result = deadline.race(work)
    const assertion = expect(result).rejects.toBeInstanceOf(YqaaDeadlineError)

    await jest.advanceTimersByTimeAsync(YQAA_DM_AUTOREPLY_RUNTIME_BUDGET_MS)
    await assertion
    expect(aborted).toBe(true)
    expect(deadline.remainingMs()).toBe(0)
    deadline.close()
  })

  it('allows measured inference after context preparation while retaining the commit reserve',async()=>{
    jest.useFakeTimers()
    const originalFetch=global.fetch
    const deadline=createYqaaDeadline(null,YQAA_DM_AUTOREPLY_RUNTIME_BUDGET_MS)
    try {
      jest.advanceTimersByTime(6000)
      global.fetch=jest.fn((_url,init)=>new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>resolve(Response.json({completed:true})),14000)
        init?.signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'))},{once:true})
      })) as typeof fetch
      let result:any=null
      const work=fetchYqaaJsonWithTimeout('https://provider.invalid',{},deadline.providerRemainingMs(),deadline.signal).then(value=>{result=value},()=>{result={failed:true}})
      await jest.advanceTimersByTimeAsync(14001)
      expect(result?.response?.status).toBe(200)
      expect(deadline.remainingMs()).toBeGreaterThan(YQAA_DM_REPLY_COMMIT_RESERVE_MS)
      await work
    } finally {deadline.close();global.fetch=originalFetch}
  })

  it('keeps a fixed commit reserve as model and polish retries consume the phase budget', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-13T15:24:26.707Z'))
    const deadline = createYqaaDeadline(null, YQAA_DM_AUTOREPLY_RUNTIME_BUDGET_MS)
    const originalDeadline = Date.now() + deadline.remainingMs()
    const providerBudget = () => deadline.providerRemainingMs()

    expect(deadline.remainingMs()).toBe(27_000)
    expect(providerBudget()).toBe(27_000 - YQAA_DM_REPLY_COMMIT_RESERVE_MS)
    jest.advanceTimersByTime(15_000)
    // A provider retry / polish regeneration reads the same shrinking phase budget.
    expect(providerBudget()).toBe(8_000)
    jest.advanceTimersByTime(1_001)
    expect(providerBudget()).toBe(6_999)
    expect(Date.now() + deadline.remainingMs()).toBe(originalDeadline)
    expect(deadline.remainingMs()).toBe(10_999)
    deadline.close()
  })

  it('records every missing scheduled reply and leaves an explicit stage when the runtime deadline expires', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'lib/messengerAi.ts'), 'utf8')
    const scheduler = source.slice(source.indexOf('export function scheduleAutoReply('))

    expect(scheduler).toContain('deadline.race(')
    expect(source).toContain('signal: opts.runtime?.signal ?? opts.signal')
    expect(scheduler).toContain("ai_last_run_status: 'running'")
    expect(scheduler).toContain("ai_last_run_status: 'failed'")
    expect(scheduler).toContain("ai_last_skip: timeout ? 'runtime_deadline' : 'schedule_exception'")
    expect(scheduler).toContain('ai_last_error: timeout ? `runtime_deadline_${runtime.stage}` : failure')
    expect(scheduler).toContain('if (result?.replied) return result')
    expect(scheduler).toContain("ai_last_skip: skip || 'no_result'")
    expect(scheduler).toContain('runTriggerMessageId')
    expect(scheduler).toContain('AbortSignal.timeout(YQAA_DM_DIAGNOSTIC_BUDGET_MS)')
    expect(scheduler).toContain('ai_last_error: result?.providerFailure ||')
    expect(source).toContain('remainingMs: opts.runtime?.providerRemainingMs')
    expect(source).toContain("db.rpc('patch_yqaa_runtime_diagnostic'")
    expect(source).not.toContain('ai_last_error: msg.slice')
  })

  it('returns paused threads before profile, history, pricing, or model work', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'lib/messengerAi.ts'), 'utf8')
    const reply = source.slice(source.indexOf('export async function maybeAutoReply('), source.indexOf('export function scheduleAutoReply('))
    const durableLookup = reply.indexOf('const loadCommittedReply')
    const pausedGate = reply.indexOf("if (aiMode !== 'auto' && !opts.force)")
    const profileLookup = reply.indexOf('resolveProviderAndClient(db, conv)')
    const historyLookup = reply.indexOf(".from('conversation_messages')")
    expect(durableLookup).toBeGreaterThanOrEqual(0)
    expect(pausedGate).toBeGreaterThan(durableLookup)
    expect(profileLookup).toBeGreaterThan(pausedGate)
    expect(historyLookup).toBeGreaterThan(profileLookup)
  })

  it('cancels the final RPC and sends its server-enforced runtime cutoff', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'lib/messengerAi.ts'), 'utf8')
    const commit = source.slice(source.indexOf('const commitRpc ='), source.indexOf('if (commitError || !committedReply?.reply_message_id)'))

    expect(commit).toContain("opts.runtime.stage = 'atomic_reply_commit'")
    expect(commit).not.toContain("await opts.runtime.markStage('atomic_reply_commit')")
    expect(commit).toContain("'commit_yqaa_reply_with_runtime_deadline'")
    expect(commit).toContain('p_deadline_at: new Date(Date.now() + opts.runtime.remainingMs()).toISOString()')
    expect(commit).toContain('rpc.abortSignal(opts.runtime.signal)')
    expect(commit).toContain('p_commit_rpc: commitRpc')
  })
})
