export const P11_UI_KEY_NAMESPACES = {
  single: 'p11-audit-single-key',
  fanOut: 'p11-audit-fanout-key',
  stream: 'p11-audit-stream-key',
} as const

export interface P11KeyStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** Reuse an action's pending key, creating and persisting one only once. */
export function getOrCreateP11ActionKey(
  storage: Pick<P11KeyStorage, 'getItem' | 'setItem'>,
  namespace: string,
  generate: () => string,
): string {
  const existing = storage.getItem(namespace)
  if (existing) return existing
  const key = generate()
  storage.setItem(namespace, key)
  return key
}

/** Call only after the server confirms durable command completion. */
export function clearP11ActionKey(storage: Pick<P11KeyStorage, 'removeItem'>, namespace: string): void {
  storage.removeItem(namespace)
}

export type P11ActionKeyState = 'completed' | 'pending' | 'recoverable' | 'http_error' | 'transport_error'

/** Clear only when the server confirms durable completion; every other result is retryable. */
export function settleP11ActionKey(
  storage: P11KeyStorage,
  namespace: string,
  state: P11ActionKeyState,
): 'cleared' | 'retained' {
  if (state === 'completed') {
    clearP11ActionKey(storage, namespace)
    return 'cleared'
  }
  return 'retained'
}
