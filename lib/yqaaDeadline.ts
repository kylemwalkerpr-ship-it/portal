export class YqaaDeadlineError extends Error {
  constructor() {
    super('YQAA request deadline exceeded')
    this.name = 'YqaaDeadlineError'
  }
}

/** Combines client disconnect with a bounded route deadline and rejects work at the deadline. */
export function createYqaaDeadline(parent: AbortSignal | null, timeoutMs: number) {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | null = null
  let rejectDeadline: ((error: Error) => void) | null = null
  const deadline = new Promise<never>((_resolve, reject) => { rejectDeadline = reject })
  void deadline.catch(() => {})
  const abort = (reason?: unknown) => {
    if (!controller.signal.aborted) {
      controller.abort(reason)
      rejectDeadline?.(new YqaaDeadlineError())
    }
  }
  const onParentAbort = () => abort(parent?.reason)
  if (parent?.aborted) onParentAbort()
  else parent?.addEventListener('abort', onParentAbort, { once: true })
  timer = setTimeout(() => {
    abort(new YqaaDeadlineError())
  }, Math.max(1, timeoutMs))
  return {
    signal: controller.signal,
    race<T>(work: Promise<T>): Promise<T> { return Promise.race([work, deadline]) },
    close() {
      if (timer) clearTimeout(timer)
      parent?.removeEventListener('abort', onParentAbort)
    },
  }
}
