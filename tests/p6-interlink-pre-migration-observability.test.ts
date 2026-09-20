/**
 * P6 final repair — PRE-MIGRATION OBSERVABILITY + ADDITIVE ATTEMPT COLUMN.
 *
 * `loadEngineInterlinksForCell` selected `verification_state` (added by the
 * authored-but-unapplied P6 migration). A missing column made the whole read
 * return `[]` — indistinguishable from a genuinely empty cell. It now retries
 * the legacy select with an explicit warning (verdicts unknown) and any other
 * DB failure fails closed AND observable.
 *
 * The migration's new `verification_attempted_at` column must stay additive,
 * idempotent, backfill-free and OUT of the minimum applied-proof constraint.
 */
jest.mock('@/lib/supabase', () => ({ createSupabaseAdminClient: jest.fn() }))

import fs from 'node:fs'
import path from 'node:path'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { loadEngineInterlinksForCell } from '@/lib/seoEngine/interlink'

const createSupabaseAdminClientMock = jest.mocked(createSupabaseAdminClient)

const MIGRATION = 'supabase/migrations/20260920130000_seo_interlinks_verification_truth.sql'

interface ScriptedQuery {
  columns: string
  result: { data: unknown[] | null; error: { message: string } | null }
}

function scriptedClient(script: ScriptedQuery[]) {
  const seen: string[] = []
  let index = 0
  return {
    seen,
    client: {
      from() {
        const builder: Record<string, unknown> = {}
        for (const method of ['select', 'ilike', 'in', 'order', 'limit']) {
          builder[method] = (...args: unknown[]) => {
            if (method === 'select') seen.push(String(args[0] || ''))
            return builder
          }
        }
        builder.then = (resolve: (value: unknown) => unknown) => {
          const current = script[Math.min(index, script.length - 1)]
          index += 1
          return Promise.resolve(current?.result ?? { data: [], error: null }).then(resolve)
        }
        return builder
      },
    },
  }
}

const ROW = {
  target_url: 'https://legal.yousafeconsultancy.com/us/student-visas/',
  target_host: 'legal',
  anchor_text: 'US student visa guide',
  reason: 'journey_next',
  status: 'planned',
  verification_state: null,
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => jest.restoreAllMocks())

describe('A) pre-migration verification_state fallback', () => {
  it('retries the legacy select without verification_state and treats verdicts as unknown', async () => {
    const scripted = scriptedClient([
      {
        columns: '',
        result: {
          data: null,
          error: { message: 'column seo_interlinks.verification_state does not exist' },
        },
      },
      { columns: '', result: { data: [ROW], error: null } },
    ])
    createSupabaseAdminClientMock.mockReturnValue(scripted.client as never)

    const links = await loadEngineInterlinksForCell('schools', 'US', 5)

    expect(links.map((link) => link.url)).toEqual([ROW.target_url])
    expect(scripted.seen[0]).toContain('verification_state')
    expect(scripted.seen[1]).not.toContain('verification_state')
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringMatching(/verification_state unavailable/i),
      expect.stringMatching(/does not exist/),
    )
  })

  it('fails closed AND observable for any other DB failure (never a fake empty cell)', async () => {
    const scripted = scriptedClient([
      { columns: '', result: { data: null, error: { message: 'permission denied for table seo_interlinks' } } },
    ])
    createSupabaseAdminClientMock.mockReturnValue(scripted.client as never)

    const links = await loadEngineInterlinksForCell('schools', 'US', 5)

    expect(links).toEqual([])
    expect(scripted.seen).toHaveLength(1)
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringMatching(/loadEngineInterlinksForCell failed/i),
      expect.stringMatching(/permission denied/),
    )
  })

  it('still filters ineligible lifecycle verdicts after the fallback', async () => {
    const scripted = scriptedClient([
      {
        columns: '',
        result: {
          data: null,
          error: {
            message: "Could not find the 'verification_state' column of 'seo_interlinks' in the schema cache",
          },
        },
      },
      { columns: '', result: { data: [ROW], error: null } },
    ])
    createSupabaseAdminClientMock.mockReturnValue(scripted.client as never)

    const links = await loadEngineInterlinksForCell('schools', 'US', 5)

    expect(links).toHaveLength(1)
  })

  it('does NOT relabel a generic missing object as the verification_state state', async () => {
    // LOW fidelity: only an error that NAMES `verification_state` is the known
    // partial-migration state. Any other missing object stays a real,
    // fail-closed error instead of a mislabelled legacy retry.
    const scripted = scriptedClient([
      { columns: '', result: { data: null, error: { message: 'column seo_interlinks.legit_other does not exist' } } },
      { columns: '', result: { data: [ROW], error: null } },
    ])
    createSupabaseAdminClientMock.mockReturnValue(scripted.client as never)

    const links = await loadEngineInterlinksForCell('schools', 'US', 5)

    expect(links).toEqual([])
    expect(scripted.seen).toHaveLength(1)
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringMatching(/loadEngineInterlinksForCell failed/i),
      expect.stringMatching(/legit_other/),
    )
  })
})

describe('B) the additive attempt-marker column stays additive', () => {
  const sql = () => fs.readFileSync(path.join(process.cwd(), MIGRATION), 'utf8')

  it('adds verification_attempted_at timestamptz null with IF NOT EXISTS + a comment', () => {
    const lower = sql().toLowerCase()
    expect(lower).toContain('add column if not exists verification_attempted_at timestamptz null')
    expect(lower).toContain('comment on column public.seo_interlinks.verification_attempted_at is')
    expect(lower).toContain('not a verification verdict or proof')
  })

  it('is not part of the minimum applied-proof constraint', () => {
    const body = sql()
    const appliedIndex = body.indexOf('seo_interlinks_applied_requires_verification')
    expect(appliedIndex).toBeGreaterThan(0)
    const constraintBlock = body.slice(appliedIndex, body.indexOf('end $$;', appliedIndex))
    expect(constraintBlock).not.toContain('verification_attempted_at')
    expect(constraintBlock).toContain("verification_state = 'present'")
  })

  it('never backfills or mutates existing rows', () => {
    const lower = sql().toLowerCase()
    expect(lower).not.toMatch(/update\s+public\.seo_interlinks/)
    expect(lower).not.toMatch(/\bupdate\s+[a-z_."]*\s+set\b/)
    expect(lower).not.toMatch(/\bdelete\s+from\b/)
    expect(lower).not.toMatch(/\binsert\s+into\b/)
    expect(lower).not.toMatch(/\balter\s+table\b[^;]*\bdrop\s+column\b/)
  })
})
