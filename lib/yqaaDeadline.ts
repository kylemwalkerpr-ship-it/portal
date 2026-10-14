export class YqaaDeadlineError extends Error {
  constructor() {
    super('YQAA request deadline exceeded')
    this.name = 'YqaaDeadlineError'
  }
}

export const YQAA_DM_AUTOREPLY_RUNTIME_BUDGET_MS = 27_000
export const YQAA_DM_REPLY_COMMIT_RESERVE_MS = 4_000
export const YQAA_DM_DIAGNOSTIC_BUDGET_MS = 2_000

/** Keeps the request abort listener and timer alive through response body consumption. */
export async function fetchYqaaJsonWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<{ response: Response; text: string }> {
  const controller = new AbortController()
  const abortFromParent = () => controller.abort(parentSignal?.reason)
  if (parentSignal?.aborted) abortFromParent()
  else parentSignal?.addEventListener('abort', abortFromParent, { once: true })
  const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs))
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  const abortBody = () => { void reader?.cancel(controller.signal.reason).catch(() => {}) }
  controller.signal.addEventListener('abort', abortBody, { once: true })
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    let text = ''
    if (response.body) {
      reader = response.body.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (controller.signal.aborted) throw controller.signal.reason || new DOMException('Aborted', 'AbortError')
        if (done) break
        text += decoder.decode(value, { stream: true })
      }
      text += decoder.decode()
    }
    return { response, text }
  } finally {
    clearTimeout(timer)
    controller.signal.removeEventListener('abort', abortBody)
    parentSignal?.removeEventListener('abort', abortFromParent)
    try { reader?.releaseLock() } catch { /* the stream may have errored */ }
  }
}

/** Combines client disconnect with a bounded route deadline and rejects work at the deadline. */
export function createYqaaDeadline(parent: AbortSignal | null, timeoutMs: number) {
  const deadlineAt = Date.now() + Math.max(1, timeoutMs)
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
    remainingMs() { return Math.max(0, deadlineAt - Date.now()) },
    providerRemainingMs() {
      return Math.max(0, deadlineAt - Date.now() - YQAA_DM_REPLY_COMMIT_RESERVE_MS)
    },
    race<T>(work: Promise<T>): Promise<T> { return Promise.race([work, deadline]) },
    close() {
      if (timer) clearTimeout(timer)
      parent?.removeEventListener('abort', onParentAbort)
    },
  }
}
