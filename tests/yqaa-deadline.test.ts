import {
  createYqaaDeadline,
  fetchYqaaJsonWithTimeout,
  YqaaDeadlineError,
  YQAA_DM_AUTOREPLY_RUNTIME_BUDGET_MS,
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
    expect(YQAA_DM_AUTOREPLY_RUNTIME_BUDGET_MS).toBe(24_000)
    expect(YQAA_DM_AUTOREPLY_RUNTIME_BUDGET_MS).toBeLessThan(30_000)

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

  it('records every missing scheduled reply and leaves an explicit stage when the runtime deadline expires', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'lib/messengerAi.ts'), 'utf8')
    const scheduler = source.slice(source.indexOf('export function scheduleAutoReply('))

    expect(scheduler).toContain('deadline.race(')
    expect(scheduler).toContain("ai_last_run_status: 'running'")
    expect(scheduler).toContain("ai_last_run_status: 'failed'")
    expect(scheduler).toContain("ai_last_skip: timeout ? 'runtime_deadline' : 'schedule_exception'")
    expect(scheduler).toContain('ai_last_error: timeout ? `runtime_deadline_${runtime.stage}` : failure')
    expect(scheduler).toContain('if (result?.replied) return result')
    expect(scheduler).toContain("ai_last_skip: skip || 'no_result'")
    expect(scheduler).toContain('runTriggerMessageId')
    expect(scheduler).toContain('AbortSignal.timeout(4_000)')
    expect(source).toContain('remainingMs: opts.runtime?.remainingMs')
    expect(source).toContain("db.rpc('patch_yqaa_runtime_diagnostic'")
    expect(source).not.toContain('ai_last_error: msg.slice')
  })
})
