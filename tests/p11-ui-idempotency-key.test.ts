import { getOrCreateP11ActionKey, P11_UI_KEY_NAMESPACES, settleP11ActionKey, type P11ActionKeyState } from '@/lib/seoEngine/p11UiIdempotencyKey'

class MemorySessionStorage {
  private values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}

describe('P11 UI idempotency-key lifecycle', () => {
  it('generates one key per human action and reuses it for pending, network-error, and retry paths', () => {
    const storage = new MemorySessionStorage()
    const generate = jest.fn(() => 'action-key-001')

    const firstAttempt = getOrCreateP11ActionKey(storage, P11_UI_KEY_NAMESPACES.single, generate)
    expect(firstAttempt).toBe('action-key-001')
    expect(generate).toHaveBeenCalledTimes(1)

    // Recoverable/pending responses and transport errors do not clear keys.
    const afterPending = getOrCreateP11ActionKey(storage, P11_UI_KEY_NAMESPACES.single, generate)
    const afterNetworkError = getOrCreateP11ActionKey(storage, P11_UI_KEY_NAMESPACES.single, generate)
    expect(afterPending).toBe(firstAttempt)
    expect(afterNetworkError).toBe(firstAttempt)
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it('clears only after completed response, so a later human action receives a fresh key', () => {
    const storage = new MemorySessionStorage()
    const generate = jest.fn().mockReturnValueOnce('first-action-key').mockReturnValueOnce('next-action-key')
    const completedKey = getOrCreateP11ActionKey(storage, P11_UI_KEY_NAMESPACES.single, generate)

    // A 409 or other HTTP error leaves the key available to show/retry the same command.
    expect(getOrCreateP11ActionKey(storage, P11_UI_KEY_NAMESPACES.single, generate)).toBe(completedKey)
    settleP11ActionKey(storage, P11_UI_KEY_NAMESPACES.single, 'completed')
    expect(getOrCreateP11ActionKey(storage, P11_UI_KEY_NAMESPACES.single, generate)).toBe('next-action-key')
    expect(generate).toHaveBeenCalledTimes(2)
  })

  it('keeps single audit, fan-out audit, and SSE actions in independent namespaces', () => {
    const storage = new MemorySessionStorage()
    const generate = jest.fn()
      .mockReturnValueOnce('single-action-key')
      .mockReturnValueOnce('fanout-action-key')
      .mockReturnValueOnce('stream-action-key')

    const single = getOrCreateP11ActionKey(storage, P11_UI_KEY_NAMESPACES.single, generate)
    const fanOut = getOrCreateP11ActionKey(storage, P11_UI_KEY_NAMESPACES.fanOut, generate)
    const stream = getOrCreateP11ActionKey(storage, P11_UI_KEY_NAMESPACES.stream, generate)

    expect(new Set([single, fanOut, stream]).size).toBe(3)
    expect(storage.getItem(P11_UI_KEY_NAMESPACES.single)).toBe(single)
    expect(storage.getItem(P11_UI_KEY_NAMESPACES.fanOut)).toBe(fanOut)
    expect(storage.getItem(P11_UI_KEY_NAMESPACES.stream)).toBe(stream)
    expect(generate).toHaveBeenCalledTimes(3)
  })

  it.each([
    ['single', P11_UI_KEY_NAMESPACES.single],
    ['fan-out', P11_UI_KEY_NAMESPACES.fanOut],
    ['stream', P11_UI_KEY_NAMESPACES.stream],
  ])('settles pending/error states by retaining keys and completed by clearing for %s', (_label, namespace) => {
    const storage = new MemorySessionStorage()
    const key = getOrCreateP11ActionKey(storage, namespace, () => `${_label}-key-001`)
    const retainStates: P11ActionKeyState[] = ['pending', 'recoverable', 'http_error', 'transport_error']

    for (const state of retainStates) {
      expect(settleP11ActionKey(storage, namespace, state)).toBe('retained')
      expect(storage.getItem(namespace)).toBe(key)
    }
    expect(settleP11ActionKey(storage, namespace, 'completed')).toBe('cleared')
    expect(storage.getItem(namespace)).toBeNull()
  })
})
