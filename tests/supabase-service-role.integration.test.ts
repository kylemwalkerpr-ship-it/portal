import { createHmac, randomBytes } from 'node:crypto'
import { createSupabaseServiceRoleClient } from '@/lib/supabase'
import { enforceGate, loadGateRuns, recordJobQualityGate } from '@/lib/seoEngine/gate'
import {
  insertSignal,
  listSignals,
  parseSpecialistSignal,
  setSignalStatus,
} from '@/lib/seoFactory/specialistFeeds'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const ENV_NAMES = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_JWT', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'] as const
const originalEnv = new Map(ENV_NAMES.map((name) => [name, process.env[name]]))
let stackServiceRoleKey = ''

function jwt(role: string, secret: string): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const header = encode({ alg: 'HS256', typ: 'JWT' })
  const claims = encode({ aud: 'authenticated', role, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300 })
  const unsigned = `${header}.${claims}`
  const signature = createHmac('sha256', secret).update(unsigned).digest('base64url')
  return `${unsigned}.${signature}`
}

function setServiceKey(key?: string) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  if (key) process.env.SUPABASE_SERVICE_ROLE_JWT = key
  else delete process.env.SUPABASE_SERVICE_ROLE_JWT
}

async function rowCounts() {
  const db = createSupabaseServiceRoleClient()
  if (!db) throw new Error('local service-role client unavailable')
  const [gates, signals] = await Promise.all([
    db.from('seo_gate_runs').select('id', { count: 'exact', head: true }),
    db.from('studio_specialist_signals').select('id', { count: 'exact', head: true }),
  ])
  if (gates.error || signals.error) throw new Error('fixture row count query failed')
  return { gates: gates.count ?? 0, signals: signals.count ?? 0 }
}

beforeAll(() => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_JWT || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error('isolated Supabase CI environment is incomplete')
  }
  stackServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_JWT
})

afterAll(() => {
  for (const name of ENV_NAMES) {
    const value = originalEnv.get(name)
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

describe('real local Supabase service-role boundary', () => {
  it('persists gate and specialist operations with the stack-issued legacy service-role JWT', async () => {
    const gate = await enforceGate(
      { subjectType: 'draft', subjectId: 'ci-valid-gate', stage: 'studio_audit' },
      undefined,
      {},
      { ymyl_statutory: true, ymyl_disclaimer: true },
    )
    expect(gate.recorded).toBe(true)
    expect(await recordJobQualityGate({ jobId: 'ci-valid-studio-gate', score: 91, passed: true })).toBe(true)
    expect((await loadGateRuns()).runs.some((row) => row.subject_id === 'ci-valid-studio-gate')).toBe(true)

    const signal = await insertSignal(parseSpecialistSignal({
      role: 'lead_desk', region: 'US', priority: 2,
      payload: { intent: 'isolated service role integration fixture' },
    }))
    expect(signal.ok).toBe(true)
    expect(signal.id).toBeTruthy()
    const listed = await listSignals({ role: 'lead_desk', region: 'US', openOnly: true })
    expect(listed.some((row) => row.id === signal.id && row.status === 'new')).toBe(true)
    expect(await setSignalStatus(signal.id!, 'queued')).toEqual({ ok: true })
    expect((await listSignals({ status: 'queued', role: 'lead_desk' })).some((row) => row.id === signal.id)).toBe(true)
  })

  it('rejects a forged service_role claim with an invalid signature and leaves both tables unchanged', async () => {
    const before = await rowCounts()
    const validStackKey = process.env.SUPABASE_SERVICE_ROLE_JWT!
    setServiceKey(jwt('service_role', randomBytes(32).toString('hex')))

    // Preserve the gateway's known local API key while forwarding the forged
    // bearer JWT, so PostgREST's actual JWT signature verifier is exercised.
    const originalFetch = globalThis.fetch
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    const postgrestStatuses: number[] = []
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      headers.set('apikey', validStackKey)
      return originalFetch(input, { ...init, headers }).then((response) => {
        const url = input instanceof Request ? input.url : String(input)
        if (new URL(url).pathname.startsWith('/rest/v1/')) postgrestStatuses.push(response.status)
        return response
      })
    }) as typeof fetch
    try {
      expect(await recordJobQualityGate({ jobId: 'ci-forged-gate', score: 99, passed: true })).toBe(false)
      expect(postgrestStatuses).toEqual([401])
      console.info('Local PostgREST rejected the invalid JWT signature with HTTP 401; response body withheld.')
      postgrestStatuses.length = 0
      const deniedSignal = await insertSignal(parseSpecialistSignal({
        role: 'lead_desk', region: 'US', priority: 1,
        payload: { intent: 'must not persist forged service role' },
      }))
      expect(deniedSignal.ok).toBe(false)
      expect(postgrestStatuses).toEqual([401])
    } finally {
      globalThis.fetch = originalFetch
      warn.mockRestore()
      setServiceKey(validStackKey)
    }

    try {
      expect(await rowCounts()).toEqual(before)
    } finally {
      // Keep later integration cases on the stack-issued credential even if
      // the no-mutation invariant fails.
      setServiceKey(validStackKey)
    }
  })

  it.each(['missing', 'anon'] as const)('%s credentials fail closed without mutating either fixture table', async (mode) => {
    const before = await rowCounts()
    if (mode === 'missing') setServiceKey()
    else setServiceKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

    const originalFetch = globalThis.fetch
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    let outboundRequests = 0
    globalThis.fetch = ((...args: Parameters<typeof fetch>) => {
      outboundRequests += 1
      return originalFetch(...args)
    }) as typeof fetch
    try {
      expect(createSupabaseServiceRoleClient()).toBeNull()
      expect(await recordJobQualityGate({ jobId: `ci-${mode}-gate`, score: 88, passed: true })).toBe(false)
      expect(await insertSignal(parseSpecialistSignal({
        role: 'lead_desk', payload: { intent: `must not persist ${mode} credential` },
      }))).toMatchObject({ ok: false, error: 'service-role credential unavailable' })
      expect(outboundRequests).toBe(0)
    } finally {
      globalThis.fetch = originalFetch
      warn.mockRestore()
    }

    setServiceKey(stackServiceRoleKey)
    expect(await rowCounts()).toEqual(before)
  })
})
