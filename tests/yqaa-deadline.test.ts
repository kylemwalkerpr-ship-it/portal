import { createYqaaDeadline, YqaaDeadlineError } from '@/lib/yqaaDeadline'

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
})
