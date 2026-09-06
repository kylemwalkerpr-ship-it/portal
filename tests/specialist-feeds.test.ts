/**
 * Content Studio — Specialist Intel feeds: SSOT payload validators, prompt
 * block rendering, and the DB queue door (mocked Supabase chain), plus the
 * Authority Multiplexer hook.
 */
jest.mock('@supabase/supabase-js', () => {
  type Op = { op: string; table: string; args?: unknown[] }
  const ops: Op[] = []
  let rows: Array<Record<string, unknown>> = []
  let failMessage: string | null = null

  const makeBuilder = (
    table: string,
    state: { inserted?: boolean; predicates: Array<(row: Record<string, unknown>) => boolean> },
    onResolve: () => { data: unknown; error: { message: string } | null },
  ) => {
    const builder: Record<string, any> = {
      then: (resolve?: (v: unknown) => void) => {
        const value = onResolve()
        return resolve ? Promise.resolve(resolve(value)) : Promise.resolve(value)
      },
    }
    for (const m of [
      'select', 'eq', 'in', 'neq', 'single', 'maybeSingle', 'order', 'limit',
      'range', 'insert', 'update', 'delete', 'textSearch',
    ]) {
      builder[m] = (...args: unknown[]) => {
        ops.push({ op: m, table, args })
        if (m === 'insert') state.inserted = true
        if (m === 'eq' && args.length >= 2) {
          const [field, value] = args as [string, unknown]
          state.predicates.push((row) => row[field] === value)
        }
        if (m === 'in' && args.length >= 2) {
          const [field, values] = args as [string, unknown[]]
          state.predicates.push((row) => (values as unknown[]).includes(row[field]))
        }
        return builder
      }
    }
    return builder
  }

  return {
    __reset: (rowsVal: Array<Record<string, unknown>>) => {
      ops.length = 0
      rows = rowsVal
      failMessage = null
    },
    __fail: (message: string) => {
      failMessage = message
    },
    __getOps: () => ops,
    createClient: jest.fn(() => ({
      from: (table: string) => {
        const state: { inserted?: boolean; predicates: Array<(row: Record<string, unknown>) => boolean> } = {
          predicates: [],
        }
        return makeBuilder(
          table,
          state,
          () => {
            if (failMessage) return { data: null, error: { message: failMessage } }
            if (table === 'studio_specialist_signals' && state.inserted) {
              return { data: { id: 'signal-1' }, error: null }
            }
            if (table === 'studio_specialist_signals') {
              const filtered = state.predicates.length
                ? rows.filter((row) => state.predicates.every((p) => p(row)))
                : rows
              return { data: filtered, error: null }
            }
            return { data: [], error: null }
          },
        )
      },
    })),
  }
})

type MockSupabase = {
  __reset: (rows: Array<Record<string, unknown>>) => void
  __fail: (message: string) => void
  __getOps: () => Array<{ op: string; table: string; args?: unknown[] }>
}
const mockSupabase = jest.requireMock('@supabase/supabase-js') as MockSupabase

import {
  SPECIALIST_ROLES,
  buildSpecialistPromptBlock,
  enqueueAuthorityMultiplexerSignal,
  insertSignal,
  listSignals,
  loadOpenSignalsForTopic,
  normalizePriority,
  normalizeRegion,
  parseSpecialistSignal,
  setSignalStatus,
  signalsToOpportunityHints,
  specialistSignalBlob,
  specialistSignalSummary,
  validateSignalPayload,
  type SpecialistSignal,
} from '@/lib/seoFactory/specialistFeeds'

function signal(over: Partial<SpecialistSignal> = {}): SpecialistSignal {
  return {
    id: 'sig-1',
    role: 'policy_desk',
    region: 'US',
    priority: 1,
    payload: { title: 'USCIS fee rule change', sourceUrl: 'https://example.gov/news', summary: 'Fees change next quarter', cashCowIntents: ['eb2 niw'], urgency: 'high' },
    status: 'new',
    created_at: '2026-09-06T08:00:00.000Z',
    consumed_at: null,
    relatedJobId: null,
    ...over,
  }
}

beforeEach(() => {
  mockSupabase.__reset([])
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
})

describe('parseSpecialistSignal — role + contract validators', () => {
  it('accepts every SSOT role', () => {
    for (const role of SPECIALIST_ROLES as readonly string[]) {
      const payload =
        role === 'policy_desk'
          ? { title: 'T', sourceUrl: 'https://example.gov', summary: 'S' }
          : role === 'competitor_radar'
            ? { competitor: 'Boundless', changeType: 'pricing', url: 'https://a.com' }
            : role === 'overnight_ops'
              ? { rankingPriorities: ['eea', 'ubc'] }
              : role === 'authority_multiplexer'
                ? { sourceUrl: 'https://example.com' }
                : role === 'support_triage'
                  ? { pattern: 'spouse visa delay' }
                  : role === 'marketplace_scout'
                    ? { category: 'visa', priorityReason: 'no supply' }
                    : { intent: 'super visa', leadScoreHint: 4 }
      const parsed = parseSpecialistSignal({ role, region: 'CA', priority: 2, payload })
      expect(parsed.role).toBe(role)
      expect(parsed.region).toBe('CA')
      expect(parsed.priority).toBe(2)
    }
  })

  it('rejects an unknown role', () => {
    expect(() => parseSpecialistSignal({ role: 'not_a_role', payload: {} })).toThrow(/unknown role/)
  })

  it('rejects a missing required field with a field-precise message', () => {
    expect(() =>
      parseSpecialistSignal({ role: 'policy_desk', payload: { title: 'T' } }),
    ).toThrow(/sourceUrl/)
  })

  it('rejects a non-URL sourceUrl', () => {
    expect(() =>
      parseSpecialistSignal({
        role: 'policy_desk',
        payload: { title: 'T', sourceUrl: 'not-a-url', summary: 'S' },
      }),
    ).toThrow(/URL/)
  })

  it('rejects a non-null payload', () => {
    expect(() => parseSpecialistSignal({ role: 'lead_desk', payload: 'nope' })).toThrow(
      /payload must be an object/,
    )
  })

  it('drops malformed optional fields instead of rejecting the signal', () => {
    const parsed = parseSpecialistSignal({
      role: 'policy_desk',
      payload: {
        title: 'T', sourceUrl: 'https://example.gov', summary: 'S', cashCowIntents: 'oops-not-array', urgency: 'high',
      },
    })
    expect(parsed.payload.cashCowIntents).toBeUndefined()
    expect(parsed.payload.urgency).toBe('high')
  })

  it('drops out-of-range leadScoreHint (optional field) but keeps in-range', () => {
    const rejected = parseSpecialistSignal({ role: 'lead_desk', payload: { intent: 'x', leadScoreHint: 9 } })
    expect(rejected.payload.leadScoreHint).toBeUndefined()
    const parsed = parseSpecialistSignal({ role: 'lead_desk', payload: { intent: 'x', leadScoreHint: 3 } })
    expect(parsed.payload.leadScoreHint).toBe(3)
  })
})

describe('normalizeRegion / normalizePriority', () => {
  it('normalizes regions and nulls', () => {
    expect(normalizeRegion('us')).toBe('US')
    expect(normalizeRegion('AU')).toBe('AU')
    expect(normalizeRegion('')).toBeNull()
    expect(normalizeRegion(undefined)).toBeNull()
    expect(normalizeRegion('XX')).toBeNull()
  })
  it('clamps priority to 1..5 with default 3', () => {
    expect(normalizePriority(0)).toBe(1)
    expect(normalizePriority(9)).toBe(5)
    expect(normalizePriority(3.6)).toBe(4)
    expect(normalizePriority(undefined)).toBe(3)
    expect(normalizePriority('bogus')).toBe(3)
  })
})

describe('buildSpecialistPromptBlock', () => {
  it('renders the block header with role/region/priority lines', () => {
    const block = buildSpecialistPromptBlock([signal()])
    expect(block).toContain('SPECIALIST INTEL FEEDS')
    expect(block).toContain('Policy Desk')
    expect(block).toContain('region US')
    expect(block).toContain('priority 1')
    expect(block).toContain('USCIS fee rule change')
  })

  it('renders an empty string for an empty feed', () => {
    expect(buildSpecialistPromptBlock([])).toBe('')
  })

  it('includes related job id when present', () => {
    const block = buildSpecialistPromptBlock([signal({ relatedJobId: 'aaaaaaaa-bbbb' })])
    expect(block).toContain('job aaaaaaaa')
  })
})

describe('specialistSignalBlob / specialistSignalSummary', () => {
  it('flattens array payload fields into one blob', () => {
    const s = signal({ payload: { cashCowIntents: ['eb2 niw', 'eb1a'], urgency: 'high' } })
    expect(specialistSignalBlob(s)).toContain('eb2 niw eb1a')
    expect(specialistSignalSummary(s)).toContain('Policy Desk · US')
  })
})

describe('signalsToOpportunityHints', () => {
  it('maps policy/competitor/lead signals to typed hints with provenance', () => {
    const hints = signalsToOpportunityHints([
      signal({ id: 'sig-a', role: 'policy_desk' }),
      signal({ id: 'sig-b', role: 'competitor_radar', payload: { competitor: 'Boundless', changeType: 'new tier', url: 'https://boundless.example' } }),
      signal({ id: 'sig-c', role: 'lead_desk', payload: { intent: 'super visa', leadScoreHint: 5, reason: 'high engagement' } }),
    ])
    expect(hints).toHaveLength(3)
    expect(hints[0].kind).toBe('policy')
    expect(hints[0].title).toContain('USCIS fee rule change')
    expect(hints[1].kind).toBe('competitor')
    expect(hints[1].title).toContain('Boundless')
    expect(hints[1].sourceUrl).toBe('https://boundless.example')
    expect(hints[2].kind).toBe('lead')
    expect(hints[2].title).toContain('5/5')
  })

  it('caps the output', () => {
    const many = Array.from({ length: 20 }, (_, i) => signal({ id: `sig-${i}` }))
    expect(signalsToOpportunityHints(many, 5)).toHaveLength(5)
  })
})

describe('insertSignal / listSignals / setSignalStatus (mocked supabase)', () => {
  it('inserts a new signal with status new and returns its id', async () => {
    const parsed = parseSpecialistSignal({
      role: 'policy_desk',
      payload: { title: 'T', sourceUrl: 'https://example.gov', summary: 'S' },
      region: 'US',
      priority: 1,
      relatedJobId: 'job-123',
    })
    const res = await insertSignal(parsed)
    expect(res.ok).toBe(true)
    expect(res.id).toBe('signal-1')
    const insertOp = mockSupabase.__getOps().find((o) => o.op === 'insert')!
    expect(insertOp.table).toBe('studio_specialist_signals')
    const row = insertOp.args?.[0] as Record<string, unknown>
    expect(row.status).toBe('new')
    expect(row.role).toBe('policy_desk')
    expect(row.region).toBe('US')
    expect(row.related_job_id).toBe('job-123')
  })

  it('fail-opens when the table is missing', async () => {
    mockSupabase.__fail('relation studio_specialist_signals does not exist')
    const res = await insertSignal(
      parseSpecialistSignal({ role: 'lead_desk', payload: { intent: 'x' } }),
    )
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/does not exist/)
  })

  it('lists signals mapped to the SpecialistSignal shape', async () => {
    mockSupabase.__reset([
      {
        id: 'sig-1', role: 'policy_desk', region: 'US', payload: { title: 'T' },
        status: 'new', priority: 1, related_job_id: null,
        created_at: '2026-09-06T08:00:00.000Z', consumed_at: null,
      },
    ])
    const rows = await listSignals({ openOnly: true, limit: 10 })
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('sig-1')
    expect(rows[0].role).toBe('policy_desk')
    expect(rows[0].status).toBe('new')
    expect(rows[0].payload).toEqual({ title: 'T' })
  })

  it('listSignals fail-opens to [] on error', async () => {
    mockSupabase.__fail('relation studio_specialist_signals does not exist')
    expect(await listSignals()).toEqual([])
  })

  it('setSignalStatus transitions and stamps consumed_at on consume', async () => {
    const updated = await setSignalStatus('sig-1', 'consumed')
    expect(updated.ok).toBe(true)
    const updateOp = mockSupabase.__getOps().find((o) => o.op === 'update')!
    const patch = updateOp.args?.[0] as Record<string, unknown>
    expect(patch.status).toBe('consumed')
    expect(patch.consumed_at).toBeTruthy()

    const queued = await setSignalStatus('sig-1', 'queued')
    expect(queued.ok).toBe(true)
  })

  it('rejects invalid status / missing id', async () => {
    const res = await setSignalStatus('sig-1', 'bogus' as never)
    expect(res.ok).toBe(false)
    const noId = await setSignalStatus('', 'queued')
    expect(noId.ok).toBe(false)
  })
})

describe('enqueueAuthorityMultiplexerSignal', () => {
  it('inserts an authority_multiplexer repurpose-pack signal', async () => {
    const res = await enqueueAuthorityMultiplexerSignal({
      sourceUrl: 'https://yousafeconsultancy.com/eb2-niw-guide/',
      relatedJobId: 'job-9',
    })
    expect(res.ok).toBe(true)
    const insertOp = mockSupabase.__getOps().find((o) => o.op === 'insert')!
    const row = insertOp.args?.[0] as Record<string, unknown>
    expect(row.role).toBe('authority_multiplexer')
    expect(row.priority).toBe(2)
    expect((row.payload as Record<string, unknown>).sourceUrl).toContain('eb2-niw-guide')
    expect(row.related_job_id).toBe('job-9')
  })

  it('refuses an empty sourceUrl', async () => {
    const res = await enqueueAuthorityMultiplexerSignal({ sourceUrl: '', relatedJobId: 'job-9' })
    expect(res.ok).toBe(false)
  })
})

describe('loadOpenSignalsForTopic', () => {
  it('folds open signals matching topic + region', async () => {
    mockSupabase.__reset([
      { id: 'sig-1', role: 'policy_desk', region: 'US', payload: { title: 'USCIS EB2 NIW priority date move', summary: 'pd moved' }, status: 'new', priority: 1, related_job_id: null, created_at: '2026-09-06T08:00:00.000Z', consumed_at: null },
      { id: 'sig-2', role: 'competitor_radar', region: 'CA', payload: { competitor: 'Boundless', changeType: 'x' }, status: 'new', priority: 1, related_job_id: null, created_at: '2026-09-06T07:00:00.000Z', consumed_at: null },
      { id: 'sig-3', role: 'lead_desk', region: 'US', payload: { intent: 'fishing permit' }, status: 'queued', priority: 4, related_job_id: null, created_at: '2026-09-06T09:00:00.000Z', consumed_at: null },
    ])
    const hits = await loadOpenSignalsForTopic({ topic: 'eb2 niw', region: 'US' })
    expect(hits.map((h) => h.id)).toEqual(['sig-1'])
  })

  it('ignores consumed/dismissed signals', async () => {
    mockSupabase.__reset([
      { id: 'sig-c', role: 'policy_desk', region: 'US', payload: { title: 'EB2', summary: 'x' }, status: 'consumed', priority: 1, related_job_id: null, created_at: '2026-09-06T08:00:00.000Z', consumed_at: null },
    ])
    expect(await loadOpenSignalsForTopic({ topic: 'eb2', region: 'US' })).toEqual([])
  })
})