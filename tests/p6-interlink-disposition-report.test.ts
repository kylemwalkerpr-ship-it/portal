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
  P6_SOURCE_STALE_GATE_ACTOR,
  P6_SOURCE_STALE_GATE_REASONS,
  P6_SOURCE_STALE_REASON_HTTP_404,
  P6_SOURCE_STALE_REASON_HTTP_410,
  P6_SOURCE_STALE_REASON_UNSHIPPED_MISSION,
  buildP6DispositionReport,
  classifyP6Row,
  computeP6GateAccounting,
  fetchP6DispositionRows,
  fetchP6DispositionRowsWithTruncation,
  hasDurableVerificationProof,
  isAllowlistedSourceStaleRejection,
  isAuditedStaleRejection,
  p6ObservationFromLiveCheck,
  p6SourceStaleReasonForStatus,
  runP6DispositionReport,
  type P6InterlinkRow,
  type P6TargetObservation,
} from '../scripts/p6InterlinkDisposition'
import {
  P6_SOURCE_STALE_GATE_ACTOR as WRITER_GATE_ACTOR,
  P6_SOURCE_STALE_GATE_REASONS as WRITER_GATE_REASONS,
  P6_SOURCE_STALE_REASON_HTTP_404 as WRITER_REASON_HTTP_404,
  P6_SOURCE_STALE_REASON_HTTP_410 as WRITER_REASON_HTTP_410,
  P6_SOURCE_STALE_REASON_UNSHIPPED_MISSION as WRITER_REASON_UNSHIPPED,
} from '../scripts/p6SourceStaleRejection'

/** A live-target row explicitly rejected by the P6 source-stale actor. */
function rejectedRow(reason: string, overrides: Partial<P6InterlinkRow> = {}): P6InterlinkRow {
  return row({
    status: 'rejected',
    gate_reason: reason,
    gate_actor: P6_SOURCE_STALE_GATE_ACTOR,
    ...overrides,
  })
}

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
    expect(report.approvedUseful).toMatchObject({
      denominator: 3,
      numerator: 2,
      unverified: 1,
      explicitlyRejected: 0,
      resolved: 2,
      resolvedByReason: {},
    })
    expect(report.approvedUseful.verifiedAppliedRatio).toBeCloseTo(2 / 3)
    expect(report.approvedUseful.resolvedRatio).toBeCloseTo(2 / 3)
    expect(report.approvedUseful.basis).toMatch(/ALLOWLISTED P6 source-stale/)
  })

  it('reports stale/rejected backlog separately and keeps the gate unevaluable', () => {
    expect(report.stale).toEqual({
      target404: 1,
      legacyAuthWall: 1,
      rejected: 1,
      rejectedWithAudit: 0,
      rejectedUnaudited: 1,
      rejectedByReason: { '(no gate_reason)': 1 },
      rejectedAllowlisted: 0,
      rejectedAuditedNonAllowlisted: 0,
    })
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

describe('E) gate credit is ALLOWLIST-ONLY (RED controls)', () => {
  const observations = { [LIVE]: observation(200) }

  it('credits only the allowlisted P6 source-stale actor + reasons', () => {
    for (const reason of [
      P6_SOURCE_STALE_REASON_UNSHIPPED_MISSION,
      P6_SOURCE_STALE_REASON_HTTP_404,
      P6_SOURCE_STALE_REASON_HTTP_410,
    ]) {
      expect(isAllowlistedSourceStaleRejection(rejectedRow(reason))).toBe(true)
      expect(isAuditedStaleRejection(rejectedRow(reason))).toBe(true)
    }
    expect(p6SourceStaleReasonForStatus(404)).toBe(P6_SOURCE_STALE_REASON_HTTP_404)
    expect(p6SourceStaleReasonForStatus(410)).toBe(P6_SOURCE_STALE_REASON_HTTP_410)
    for (const status of [0, 200, 301, 403, 500, 503]) {
      expect(p6SourceStaleReasonForStatus(status)).toBeNull()
    }
  })

  it('excludes an ARBITRARY audited reason even with the right actor', () => {
    const arbitrary = rejectedRow('looks-stale-to-me')
    expect(isAuditedStaleRejection(arbitrary)).toBe(true)
    expect(isAllowlistedSourceStaleRejection(arbitrary)).toBe(false)
    const report = buildP6DispositionReport([arbitrary], observations)
    expect(report.approvedUseful.explicitlyRejected).toBe(0)
    expect(report.approvedUseful.resolved).toBe(0)
    expect(report.stale.rejectedWithAudit).toBe(1)
    expect(report.stale.rejectedAuditedNonAllowlisted).toBe(1)
  })

  it('excludes the right reason written by the WRONG actor', () => {
    for (const actor of ['p6-batch-a-stale-rejection', 'someone-else', '', null]) {
      const wrongActor = rejectedRow(P6_SOURCE_STALE_REASON_HTTP_404, { gate_actor: actor })
      expect(isAllowlistedSourceStaleRejection(wrongActor)).toBe(false)
    }
    const report = buildP6DispositionReport(
      [rejectedRow(P6_SOURCE_STALE_REASON_HTTP_404, { gate_actor: 'p6-batch-a-stale-rejection' })],
      observations,
    )
    expect(report.approvedUseful.explicitlyRejected).toBe(0)
    expect(report.stale.rejectedAuditedNonAllowlisted).toBe(1)
  })

  it('excludes the Batch A TARGET-stale vocabulary even if artificially supplied', () => {
    for (const reason of ['stale_target_http_404', 'stale_target_http_410']) {
      const batchA = rejectedRow(reason, { gate_actor: 'p6-batch-a-stale-rejection' })
      expect(isAllowlistedSourceStaleRejection(batchA)).toBe(false)
      const report = buildP6DispositionReport([batchA], observations)
      expect(report.approvedUseful.explicitlyRejected).toBe(0)
      expect(report.approvedUseful.resolved).toBe(0)
      expect(report.approvedUseful.denominator).toBe(1)
      expect(report.stale.rejectedByReason[reason]).toBe(1)
    }
  })

  it('never credits an unaudited rejection, and keeps applied truth separate', () => {
    const unaudited = row({ status: 'rejected' })
    const report = buildP6DispositionReport([unaudited, appliedRow()], observations)
    expect(report.approvedUseful.numerator).toBe(1)
    expect(report.approvedUseful.explicitlyRejected).toBe(0)
    expect(report.approvedUseful.resolved).toBe(1)
    expect(report.stale.rejectedUnaudited).toBe(1)
  })

  it('counts allowlisted rejections per reason inside the cohort', () => {
    const report = buildP6DispositionReport(
      [
        rejectedRow(P6_SOURCE_STALE_REASON_HTTP_404),
        rejectedRow(P6_SOURCE_STALE_REASON_HTTP_404, { id: 'row-404b' }),
        rejectedRow(P6_SOURCE_STALE_REASON_HTTP_410, { id: 'row-410' }),
        rejectedRow(P6_SOURCE_STALE_REASON_UNSHIPPED_MISSION, { id: 'row-unshipped' }),
        // Outside the live-target cohort (dead target): resolved nothing.
        rejectedRow(P6_SOURCE_STALE_REASON_HTTP_404, { id: 'row-dead', target_url: DEAD }),
      ],
      { ...observations, [DEAD]: observation(404) },
    )
    // Five rejected rows, but only the FOUR live-target ones are cohort members.
    expect(report.approvedUseful.denominator).toBe(4)
    expect(report.approvedUseful.explicitlyRejected).toBe(4)
    expect(report.approvedUseful.resolvedByReason).toEqual({
      [P6_SOURCE_STALE_REASON_HTTP_404]: 2,
      [P6_SOURCE_STALE_REASON_HTTP_410]: 1,
      [P6_SOURCE_STALE_REASON_UNSHIPPED_MISSION]: 1,
    })
    expect(report.approvedUseful.resolved).toBe(4)
    // A target-stale row is never resurrected into the live cohort: the fifth
    // (404 target) row stays outside and contributes nothing.
    expect(report.approvedUseful.numerator).toBe(0)
    expect(report.classes.target_404).toBe(1)
    expect(report.stale.rejectedAllowlisted).toBe(5)
  })

  it('the writer and the gate share ONE allowlist (no drift possible)', () => {
    expect(WRITER_GATE_ACTOR).toBe(P6_SOURCE_STALE_GATE_ACTOR)
    expect([...WRITER_GATE_REASONS]).toEqual([...P6_SOURCE_STALE_GATE_REASONS])
    expect(WRITER_REASON_HTTP_404).toBe(P6_SOURCE_STALE_REASON_HTTP_404)
    expect(WRITER_REASON_HTTP_410).toBe(P6_SOURCE_STALE_REASON_HTTP_410)
    expect(WRITER_REASON_UNSHIPPED).toBe(P6_SOURCE_STALE_REASON_UNSHIPPED_MISSION)
    expect([...P6_SOURCE_STALE_GATE_REASONS]).not.toContain('stale_target_http_404')
    expect([...P6_SOURCE_STALE_GATE_REASONS]).not.toContain('stale_target_http_410')
  })
})

describe('F) literal spec gate arithmetic (59/73 passes, 58/73 fails)', () => {
  function cohortReport(resolvedRows: number, opts: { truncated?: boolean } = {}) {
    const rows = Array.from({ length: 73 }, (_, index) =>
      index < resolvedRows
        ? rejectedRow(P6_SOURCE_STALE_REASON_UNSHIPPED_MISSION, { id: `resolved-${index}` })
        : row({ id: `planned-${index}` }),
    )
    return buildP6DispositionReport(rows, { [LIVE]: observation(200) }, opts)
  }

  it('passes the literal resolved reading at 59/73 and fails the strict applied reading', () => {
    const accounting = computeP6GateAccounting(cohortReport(59))
    expect(accounting.approvedUseful).toBe(73)
    expect(accounting.verifiedApplied).toBe(0)
    expect(accounting.explicitlyRejected).toBe(59)
    expect(accounting.resolved).toBe(59)
    expect(accounting.resolvedRatio).toBeCloseTo(59 / 73)
    expect(accounting.evaluable).toBe(true)
    expect(accounting.notEvaluableReason).toBeNull()
    expect(accounting.resolvedGateMet).toBe(true)
    expect(accounting.verifiedAppliedGateMet).toBe(false)
    expect(accounting.appliedCountBasis).toBe('durable_proof_plus_live_target_classification')
  })

  it('fails at 58/73 and never renames a rejection as applied', () => {
    const accounting = computeP6GateAccounting(cohortReport(58))
    expect(accounting.resolved).toBe(58)
    expect(accounting.resolvedRatio).toBeCloseTo(58 / 73)
    expect(accounting.resolvedGateMet).toBe(false)
    expect(accounting.verifiedApplied).toBe(0)
    expect(accounting.verifiedAppliedGateMet).toBe(false)
  })

  it('a zero denominator is an EXPLICIT non-pass, not a pass by default', () => {
    const accounting = computeP6GateAccounting(buildP6DispositionReport([], {}))
    expect(accounting.approvedUseful).toBe(0)
    expect(accounting.evaluable).toBe(false)
    expect(accounting.notEvaluableReason).toMatch(/cohort is empty/i)
    expect(accounting.verifiedAppliedGateMet).toBe(false)
    expect(accounting.resolvedGateMet).toBe(false)
  })

  it('an unknown or truncated report can never claim an evaluable PASS', () => {
    const unknownRow = row({ id: 'row-unobserved', target_url: 'https://legal.yousafeconsultancy.com/us/never-probed/' })
    const withUnknown = computeP6GateAccounting(
      buildP6DispositionReport([...cohortReport(59).rows, unknownRow], { [LIVE]: observation(200) }),
    )
    expect(withUnknown.evaluable).toBe(false)
    expect(withUnknown.notEvaluableReason).toMatch(/unknown/i)
    expect(withUnknown.resolvedGateMet).toBe(false)

    const truncated = computeP6GateAccounting(cohortReport(59, { truncated: true }))
    expect(truncated.resolved).toBe(59)
    expect(truncated.evaluable).toBe(false)
    expect(truncated.notEvaluableReason).toMatch(/truncated/i)
    expect(truncated.resolvedGateMet).toBe(false)
    expect(truncated.verifiedAppliedGateMet).toBe(false)
  })

  it('a higher required ratio is honoured (and reported side by side)', () => {
    const accounting = computeP6GateAccounting(cohortReport(59), { requiredRatio: 0.9 })
    expect(accounting.requiredRatio).toBe(0.9)
    expect(accounting.resolvedGateMet).toBe(false)
  })
})
