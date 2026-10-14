jest.mock('@/lib/messengerAi', () => ({ resolveMessengerGrokAuth: jest.fn() }))
import { resolveMessengerGrokAuth } from '@/lib/messengerAi'
import { callSystemSuperGrok, resetSystemAssistantAuthCache } from '@/lib/superGrokAssistant'

const auth = resolveMessengerGrokAuth as jest.Mock
const originalFetch = global.fetch

afterEach(() => { jest.clearAllTimers(); global.fetch = originalFetch; resetSystemAssistantAuthCache(); jest.useRealTimers(); jest.clearAllMocks() })

test('cancels during authentication without waiting for the independent auth cap or starting inference', async () => {
  jest.useFakeTimers()
  auth.mockImplementation(() => new Promise(() => {}))
  global.fetch = jest.fn()
  const controller = new AbortController()
  const work = callSystemSuperGrok('Synthetic policy', [{ role: 'user', content: 'Synthetic question' }], { signal: controller.signal, timeoutMs: 1000 })
  controller.abort(new Error('synthetic parent cancellation'))
  await expect(work).rejects.toThrow('synthetic parent cancellation')
  expect(global.fetch).not.toHaveBeenCalled()
})

test('the complete attempt allowance includes authentication and leaves no late inference', async () => {
  jest.useFakeTimers()
  let finishAuth: (value: unknown) => void = () => {}
  auth.mockImplementation(() => new Promise(resolve => { finishAuth = resolve }))
  global.fetch = jest.fn()
  const work = callSystemSuperGrok('Synthetic policy', [{ role: 'user', content: 'Synthetic question' }], { timeoutMs: 100 })
  const rejected = expect(work).rejects.toThrow(/budget|timeout|exhausted/i)
  await jest.advanceTimersByTimeAsync(100)
  await rejected
  finishAuth({ apiKey: 'synthetic-secret', model: 'grok-4.6', authMode: 'supergrok', baseURL: 'https://provider.invalid/v1' })
  await jest.advanceTimersByTimeAsync(1)
  expect(global.fetch).not.toHaveBeenCalled()
})


test('attempt diagnostics expose finite metadata and omit secrets, prompts and provider bodies', async () => {
  auth.mockResolvedValue({ apiKey: 'synthetic-secret', model: 'grok-4.6', authMode: 'supergrok', baseURL: 'https://provider.invalid/v1' })
  global.fetch = jest.fn(async () => new Response(JSON.stringify({ output_text: 'synthetic-private-output' }), {status: 200}))
  const onAttempt = jest.fn()
  await callSystemSuperGrok('synthetic-private-system', [{role: 'user', content: 'synthetic-private-question'}], {timeoutMs: 1000, onAttempt})
  expect(onAttempt).toHaveBeenCalledTimes(1)
  expect(onAttempt.mock.calls[0][0]).toMatchObject({protocol: 'responses', model: 'grok-4.6', authMode: 'supergrok', status: 200, category: 'ok', outputPresent: true})
  expect(JSON.stringify(onAttempt.mock.calls)).not.toMatch(/synthetic-secret|synthetic-private/)
})

test('provider rejection bodies cannot escape in the final error', async () => {
  auth.mockResolvedValue({ apiKey: 'synthetic-secret', model: 'grok-4.6', authMode: 'supergrok', baseURL: 'https://provider.invalid/v1' })
  global.fetch = jest.fn(async () => new Response('synthetic-private-provider-body', {status: 400}))
  await expect(callSystemSuperGrok('synthetic policy', [{role: 'user', content: 'question'}], {timeoutMs: 1000})).rejects.toThrow(/responses=400 http_rejected; chat=400 http_rejected/)
})
