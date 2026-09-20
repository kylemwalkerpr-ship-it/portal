/**
 * P6 — read-only disposition report.
 *
 * Classification must stay pure, keep unknown as unknown, and report the raw
 * backlog separately from the approved-useful denominator/numerator. The
 * report must be read-only by construction: SELECT only, no write verb.
 */
import fs from 'node:fs'
import path from 'node:path'

import {
  buildP6DispositionReport,
  classifyP6Row,
  fetchP6DispositionRows,
  fetchP6DispositionRowsWithTruncation,
  hasDurableVerificationProof,
  p6ObservationFromLiveCheck,
  runP6DispositionReport,
  type P6InterlinkRow,
  type P6TargetObservation,
} from '../scripts/p6InterlinkDisposition'

const LIVE = 'https://market.yousafeconsultancy.com/categories/study-permits'
const PORTAL = 'https://portal.yousafeconsultancy.com/dashboard'
const DEAD = 'https://legal.yousafeconsultancy.com/us/made-up-journey/'
const SOURCE = 'https://legal.yousafeconsultancy.com/us/student-visas/'

const observation = (status: number): P6TargetObservation => ({ status, ok: status >= 200 && status < 400 })

function row(overrides: Partial<P6InterlinkRow> = {}): P6InterlinkRow {
  return {
    id: 'row-1',
    source_slug: 'seo-us-schools-f1-checklist',
    target_url: LIVE,
    status: 'planned',
    source_url: null,
    verification_state: null,
    verified_at: null,
    verification_evidence: null,
    applied_at: null,
    ...overrides,
  }
}

const appliedRow = () =>
  row({
    id: 'row-applied',
    status: 'applied',
    source_url: SOURCE,
    verification_state: 'present',
    verified_at: '2026-09-20T00:00:00.000Z',
    verification_evidence: { proof: 'live_exact_href', source: SOURCE, target: LIVE },
    applied_at: '2026-09-20T00:00:00.000Z',
  })

describe('A) classifyP6Row', () => {
  it('classifies a fully proven applied row as applied_present', () => {
    expect(classifyP6Row(appliedRow(), observation(200))).toBe('applied_present')
  })

  it('keeps an unproven applied claim unknown', () => {
    expect(classifyP6Row(row({ status: 'applied', applied_at: '2026-09-20T00:00:00.000Z' }), observation(200))).toBe(
      'unknown',
    )
    expect(classifyP6Row(appliedRow(), undefined)).toBe('applied_present')
  })

  it('requires verification_evidence exactly like the DB applied constraint', () => {
    const proven = appliedRow()
    expect(hasDurableVerificationProof(proven)).toBe(true)
    for (const broken of [
      { ...proven, verification_evidence: null },
      { ...proven, verification_evidence: '   ' },
      { ...proven, verification_evidence: undefined },
      { ...proven, source_url: null },
      { ...proven, verification_state: 'absent' },
      { ...proven, verified_at: null },
      { ...proven, applied_at: null },
    ]) {
      expect(hasDurableVerificationProof(broken as P6InterlinkRow)).toBe(false)
    }
    // An applied row without evidence can never be re-labelled as verified.
    expect(
      classifyP6Row(row({ status: 'applied', applied_at: '2026-09-20T00:00:00.000Z', source_url: SOURCE, verification_state: 'present', verified_at: '2026-09-20T00:00:00.000Z' }), observation(200)),
    ).toBe('unknown')
  })

  it('classifies an observed 404/410 target as target_404', () => {
    expect(classifyP6Row(row({ target_url: DEAD }), observation(404))).toBe('target_404')
    expect(classifyP6Row(row({ target_url: DEAD }), observation(410))).toBe('target_404')
  })

  it('classifies a legacy Portal auth-wall target as legacy_auth_wall', () => {
    expect(classifyP6Row(row({ target_url: PORTAL }), observation(200))).toBe('legacy_auth_wall')
    expect(classifyP6Row(row({ target_url: PORTAL }), observation(307))).toBe('legacy_auth_wall')
  })

  it('splits live targets by durable source proof', () => {
    expect(
      classifyP6Row(
        row({ source_url: SOURCE, verification_state: 'present', verified_at: '2026-09-20T00:00:00.000Z' }),
        observation(200),
      ),
    ).toBe('live_target_source_verified')
    expect(classifyP6Row(row(), observation(200))).toBe('live_target_source_unverified')
  })

  it('keeps unknown unknown: no observation, or an unreachable target', () => {
    expect(classifyP6Row(row(), undefined)).toBe('unknown')
    expect(classifyP6Row(row({ target_url: DEAD }), observation(0))).toBe('unknown')
    expect(classifyP6Row(row({ target_url: DEAD }), observation(503))).toBe('unknown')
  })
})

describe('B) report aggregation keeps raw backlog separate', () => {
  const rows = [
    appliedRow(),
    row({
      id: 'row-verified',
      source_url: SOURCE,
      verification_state: 'present',
      verified_at: '2026-09-19T00:00:00.000Z',
    }),
    row({ id: 'row-unverified' }),
    row({ id: 'row-dead', target_url: DEAD, status: 'rejected' }),
    row({ id: 'row-portal', target_url: PORTAL }),
    row({ id: 'row-unknown', target_url: 'https://legal.yousafeconsultancy.com/us/unobserved/' }),
  ]
  const observations: Record<string, P6TargetObservation> = {
    [LIVE]: observation(200),
    [DEAD]: observation(404),
    [PORTAL]: observation(200),
  }
  const report = buildP6DispositionReport(rows, observations)

  it('reports the raw backlog as its own field, never as the denominator', () => {
    expect(report.rawBacklog).toBe(6)
    expect(report.total).toBe(6)
  })

  it('counts each class exactly', () => {
    expect(report.classes).toEqual({
      applied_present: 1,
      target_404: 1,
      legacy_auth_wall: 1,
      live_target_source_verified: 1,
      live_target_source_unverified: 1,
      unknown: 1,
    })
  })

  it('derives the approved-useful denominator/numerator from live-target rows only', () => {
    expect(report.approvedUseful).toEqual({ denominator: 3, numerator: 2, unverified: 1 })
  })

  it('reports stale/rejected backlog separately and keeps the gate unevaluable', () => {
    expect(report.stale).toEqual({ target404: 1, legacyAuthWall: 1, rejected: 1 })
    expect(report.unknown).toBe(1)
    expect(report.gate.evaluated).toBe(false)
    expect(report.gate.note).toMatch(/read-only/i)
  })

  it('exposes truncation truth instead of silently treating a capped read as complete', () => {
    const complete = buildP6DispositionReport(rows, observations)
    expect(complete.truncated).toBe(false)
    expect(complete.rowLimit).toBe(5000)

    const capped = buildP6DispositionReport(rows, observations, { truncated: true, rowLimit: 6 })
    expect(capped.truncated).toBe(true)
    expect(capped.rowLimit).toBe(6)
    expect(capped.total).toBe(6)
  })
})

describe('D) link-authority observation projection', () => {
  it('carries the authority ok verdict and observed status through unchanged', () => {
    expect(p6ObservationFromLiveCheck(LIVE, { ok: true, status: 200, finalUrl: `${LIVE}/` })).toEqual({
      status: 200,
      ok: true,
      finalUrl: `${LIVE}/`,
    })
    // HEAD-hostile fallback already happened inside the authority: a target it
    // proved live after the GET retry is live here too.
    expect(p6ObservationFromLiveCheck(LIVE, { ok: true, status: 200 })).toEqual({
      status: 200,
      ok: true,
      finalUrl: LIVE,
    })
    // A network error / unreachable target stays unknown — never invented live.
    expect(p6ObservationFromLiveCheck(DEAD, { ok: false, status: 0 })).toMatchObject({ status: 0, ok: false })
    expect(classifyP6Row(row({ target_url: DEAD }), p6ObservationFromLiveCheck(DEAD, { ok: false, status: 0 }))).toBe(
      'unknown',
    )
  })

  it('the CLI uses the repository link authority (HEAD-hostile fallback), not a raw HEAD fetch', () => {
    const cli = fs.readFileSync(
      path.join(process.cwd(), 'scripts/p6-interlink-disposition.mts'),
      'utf8',
    )
    expect(cli).toContain('verifyUrlsLive')
    expect(cli).toContain('p6ObservationFromLiveCheck')
    expect(cli).not.toMatch(/method:\s*'HEAD'/)
    // The raw probe's `ok` is 2xx/3xx only: the authority-host exemptions live
    // in classifyLiveStatus, so the CLI must classify through it (a bare
    // `verifyUrlsLive` verdict would call a live 403 authority host dead).
    expect(cli).toContain('classifyLiveStatus')
    expect(cli).toMatch(/classifyLiveStatus\(url,\s*result\.status\)/)
  })
})

describe('C) SELECT-only fetch and read-only run', () => {
  function readOnlyClient(rows: P6InterlinkRow[], opts: { failAt?: number } = {}) {
    const calls: Array<{ table: string; columns: string; from: number; to: number }> = []
    let call = 0
    const client: any = {
      from(table: string) {
        let columns = ''
        const builder = {
          select(next: string) {
            columns = next
            return builder
          },
          order() {
            return builder
          },
          range(from: number, to: number) {
            calls.push({ table, columns, from, to })
            call += 1
            if (opts.failAt === call) {
              return Promise.resolve({ data: null, error: { message: 'db down' } })
            }
            return Promise.resolve({ data: rows.slice(from, to + 1), error: null })
          },
        }
        return builder
      },
    }
    return { calls, client }
  }

  it('paginates and reads every row with SELECT only', async () => {
    const rows = [row({ id: '1' }), row({ id: '2' }), row({ id: '3' })]
    const harness = readOnlyClient(rows)
    const fetched = await fetchP6DispositionRows(harness.client, { pageSize: 2, limit: 10 })

    expect(fetched).toHaveLength(3)
    expect(harness.calls.map((entry) => [entry.from, entry.to])).toEqual([
      [0, 1],
      [2, 3],
    ])
    expect(harness.calls[0].table).toBe('seo_interlinks')
    expect(harness.calls[0].columns).toContain('verification_state')
  })

  it('surfaces read errors instead of reporting an empty estate', async () => {
    const harness = readOnlyClient([row()], { failAt: 1 })
    await expect(fetchP6DispositionRows(harness.client)).rejects.toThrow(/read failed/)
  })

  it('proves truncation with one bounded probe row beyond the cap', async () => {
    const rows = [row({ id: '1' }), row({ id: '2' }), row({ id: '3' })]
    const harness = readOnlyClient(rows)
    const fetch = await fetchP6DispositionRowsWithTruncation(harness.client, { pageSize: 2, limit: 2 })

    expect(fetch.limit).toBe(2)
    expect(fetch.rows).toHaveLength(2)
    expect(fetch.truncated).toBe(true)
    // [0,1] fills the cap, then [2,2] proves a third row exists.
    expect(harness.calls.map((entry) => [entry.from, entry.to])).toEqual([
      [0, 1],
      [2, 2],
    ])
  })

  it('reports a capped-but-exactly-complete read as NOT truncated', async () => {
    const rows = [row({ id: '1' }), row({ id: '2' })]
    const harness = readOnlyClient(rows)
    const fetch = await fetchP6DispositionRowsWithTruncation(harness.client, { pageSize: 2, limit: 2 })

    expect(fetch.rows).toHaveLength(2)
    expect(fetch.truncated).toBe(false)
  })

  it('observes unique targets and classifies the report', async () => {
    const rows = [row({ id: '1', target_url: LIVE }), row({ id: '2', target_url: `${LIVE}/` })]
    const harness = readOnlyClient(rows)
    let observed: string[] = []

    const report = await runP6DispositionReport({
      supabase: harness.client,
      observeTargets: async (urls) => {
        observed = urls
        return { [LIVE]: observation(200) }
      },
    })

    expect(report.rawBacklog).toBe(2)
    expect(observed).toHaveLength(1)
    expect(report.classes.live_target_source_unverified).toBe(2)
  })

  it('is read-only by construction (no write verb exists in the module)', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'scripts/p6InterlinkDisposition.ts'),
      'utf8',
    )
    expect(source).not.toMatch(/\.update\s*\(/)
    expect(source).not.toMatch(/\.delete\s*\(/)
    expect(source).not.toMatch(/\.upsert\s*\(/)
    expect(source).not.toMatch(/\.insert\s*\(/)
    expect(source).not.toMatch(/\.rpc\s*\(/)
    expect(source).toContain('verification_evidence')
  })
})
