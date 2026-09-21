/**
 * P6 Batch A — historical jobless planned `seo_interlinks` stale rejection.
 *
 * Pins the authorized mutation contract: fresh 404/410 proof only, exact-row
 * CAS, dry-run by default with zero write calls, bounded deterministic apply,
 * idempotency, fail-closed reads/verification, and NO proof-field fabrication.
 */
import fs from 'node:fs'
import path from 'node:path'

import { p6TargetKey, type P6TargetObservation } from '../scripts/p6InterlinkDisposition'
import {
  decideP6BatchAApplyAuthority,
  resolveP6BatchAApplyAuthority,
} from '../scripts/p6BatchAApplyAuthority'
import {
  P6_BATCH_A_APPLY_CONFIRM_TOKEN,
  P6_BATCH_A_DEFAULT_LIMIT,
  P6_BATCH_A_GATE_ACTOR,
  P6_BATCH_A_GATE_REASON_404,
  P6_BATCH_A_GATE_REASON_410,
  P6_BATCH_A_HARD_MAX_ROWS,
  buildBatchACasFence,
  buildBatchAUpdatePatch,
  classifyBatchARow,
  isHistoricalJoblessNoProofCandidate,
  orderBatchACandidates,
  parseBatchAArgs,
  planBatchA,
  type P6BatchACandidateRow,
  type P6BatchAConfig,
} from '../scripts/p6BatchAStaleRejection'
import {
  runP6BatchARejection,
  type P6BatchAWrite,
  type P6BatchAWriteResult,
} from '../scripts/p6BatchAStaleRejectionRunner'

const DEAD_404 = 'https://legal.yousafeconsultancy.com/us/made-up-journey/'
const DEAD_410 = 'https://usa.yousafeconsultancy.com/gone-page/'
const LIVE = 'https://market.yousafeconsultancy.com/categories/study-permits'
const PORTAL = 'https://portal.yousafeconsultancy.com/marketplace/categories/study-permits'
const UNKNOWN = 'https://legal.yousafeconsultancy.com/us/unobserved/'

const observation = (
  status: number,
  ok: boolean = status >= 200 && status < 400,
): P6TargetObservation => ({ status, ok })

/** The observation key is the normalized target key (trailing slash dropped). */
const targetKey = (url: string): string => p6TargetKey(url)

const KEY_404 = targetKey(DEAD_404)
const KEY_410 = targetKey(DEAD_410)
const KEY_LIVE = targetKey(LIVE)
const KEY_PORTAL = targetKey(PORTAL)
const KEY_UNKNOWN = targetKey(UNKNOWN)

function row(overrides: Partial<P6BatchACandidateRow> = {}): P6BatchACandidateRow {
  return {
    id: 'row-1',
    source_slug: 'seo-us-schools-f1-checklist',
    target_url: DEAD_404,
    status: 'planned',
    source_url: null,
    source_job_id: null,
    verification_state: null,
    verified_at: null,
    verification_evidence: null,
    verification_attempted_at: null,
    staged_at: null,
    applied_at: null,
    created_at: '2026-09-19T00:00:00.000Z',
    ...overrides,
  }
}

const config = (overrides: Partial<P6BatchAConfig> = {}): P6BatchAConfig => ({
  apply: false,
  confirm: null,
  limit: P6_BATCH_A_DEFAULT_LIMIT,
  json: false,
  help: false,
  ...overrides,
})

describe('A) argv gating: dry-run default, explicit apply + confirm token only', () => {
  it('defaults to dry run with the small bounded limit', () => {
    const parsed = parseBatchAArgs([])
    expect(parsed).toEqual({
      ok: true,
      config: { apply: false, confirm: null, limit: P6_BATCH_A_DEFAULT_LIMIT, json: false, help: false },
    })
  })

  it('refuses --apply without the exact confirmation token', () => {
    expect(parseBatchAArgs(['--apply'])).toEqual({
      ok: false,
      error: `--apply requires --confirm ${P6_BATCH_A_APPLY_CONFIRM_TOKEN}`,
    })
    expect(parseBatchAArgs(['--apply', '--confirm', 'WRONG'])).toEqual({
      ok: false,
      error: `--apply requires --confirm ${P6_BATCH_A_APPLY_CONFIRM_TOKEN}`,
    })
  })

  it('refuses a confirmation token without --apply', () => {
    expect(parseBatchAArgs(['--confirm', P6_BATCH_A_APPLY_CONFIRM_TOKEN])).toEqual({
      ok: false,
      error: '--confirm is only valid together with --apply',
    })
  })

  it('enables apply only for the exact pair', () => {
    const parsed = parseBatchAArgs([
      '--apply',
      '--confirm',
      P6_BATCH_A_APPLY_CONFIRM_TOKEN,
    ])
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.config.apply).toBe(true)
  })

  it('bounds --limit at 1..hard-max and refuses garbage', () => {
    expect(parseBatchAArgs(['--limit', '200']).ok).toBe(true)
    expect(parseBatchAArgs(['--limit=201'])).toEqual({
      ok: false,
      error: `--limit 201 exceeds the hard maximum ${P6_BATCH_A_HARD_MAX_ROWS}`,
    })
    expect(parseBatchAArgs(['--limit', '0'])).toEqual({
      ok: false,
      error: '--limit must be >= 1 (got 0)',
    })
    expect(parseBatchAArgs(['--limit', 'abc']).ok).toBe(false)
    expect(parseBatchAArgs(['--limit', '1.5']).ok).toBe(false)
    expect(parseBatchAArgs(['--limit']).ok).toBe(false)
  })

  it('refuses unknown, duplicated and value-less flags', () => {
    expect(parseBatchAArgs(['--force']).ok).toBe(false)
    expect(parseBatchAArgs(['--json', '--json']).ok).toBe(false)
    expect(parseBatchAArgs(['--confirm']).ok).toBe(false)
  })

  it('help wins and never enables apply', () => {
    const parsed = parseBatchAArgs(['--help', '--apply'])
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.config.help).toBe(true)
      expect(parsed.config.apply).toBe(false)
    }
  })

  it('has no environment-only write switch', () => {
    const pure = fs.readFileSync(
      path.join(process.cwd(), 'scripts/p6BatchAStaleRejection.ts'),
      'utf8',
    )
    const runner = fs.readFileSync(
      path.join(process.cwd(), 'scripts/p6BatchAStaleRejectionRunner.ts'),
      'utf8',
    )
    const cli = fs.readFileSync(
      path.join(process.cwd(), 'scripts/p6-batch-a-stale-rejection.mts'),
      'utf8',
    )
    const authority = fs.readFileSync(
      path.join(process.cwd(), 'scripts/p6BatchAApplyAuthority.ts'),
      'utf8',
    )
    for (const source of [pure, runner, cli, authority]) {
      expect(source).not.toMatch(/process\.env\.P6_BATCH_A/i)
      expect(source).not.toMatch(/APPLY\s*[:=]\s*process\.env/i)
    }
  })
})

describe('B) subject fence and classification', () => {
  it('accepts only planned historical jobless no-proof rows with a nonblank target', () => {
    expect(isHistoricalJoblessNoProofCandidate(row())).toBe(true)
    expect(isHistoricalJoblessNoProofCandidate(row({ status: 'applied' }))).toBe(false)
    expect(isHistoricalJoblessNoProofCandidate(row({ status: 'rejected' }))).toBe(false)
    expect(isHistoricalJoblessNoProofCandidate(row({ status: 'manual' }))).toBe(false)
    expect(isHistoricalJoblessNoProofCandidate(row({ target_url: '' }))).toBe(false)
    expect(isHistoricalJoblessNoProofCandidate(row({ target_url: '   ' }))).toBe(false)
    for (const proofColumn of [
      'source_url',
      'source_job_id',
      'verification_state',
      'verified_at',
      'verification_evidence',
      'verification_attempted_at',
      'staged_at',
      'applied_at',
    ] as const) {
      const proofOverride = {
        [proofColumn]: 'x',
      } as unknown as Partial<P6BatchACandidateRow>
      expect(
        isHistoricalJoblessNoProofCandidate(row(proofOverride)),
      ).toBe(false)
    }
    // Non-null (even empty-string/jsonb) is NOT historical no-proof.
    expect(isHistoricalJoblessNoProofCandidate(row({ source_url: '' }))).toBe(false)
    expect(isHistoricalJoblessNoProofCandidate(row({ verification_evidence: {} }))).toBe(false)
  })

  it('classifies ONLY raw 404/410 as dead', () => {
    expect(classifyBatchARow(row({ target_url: DEAD_404 }), observation(404))).toBe('dead_404')
    expect(classifyBatchARow(row({ target_url: DEAD_410 }), observation(410))).toBe('dead_410')
    expect(classifyBatchARow(row(), observation(200))).toBe('live')
    expect(classifyBatchARow(row(), observation(301))).toBe('live')
  })

  it('keeps 401/403/405/429/0/5xx and other statuses UNKNOWN, never dead', () => {
    for (const status of [401, 403, 405, 429, 0, 500, 502, 503, 418, 400]) {
      expect(classifyBatchARow(row(), observation(status, false))).toBe('unknown')
    }
    expect(classifyBatchARow(row(), undefined)).toBe('unknown')
  })

  it('honours the authority-host exemption instead of calling a 403 dead', () => {
    expect(classifyBatchARow(row(), observation(403, true))).toBe('live')
  })

  it('never classifies a legacy Portal auth-wall row as dead even on 404', () => {
    expect(classifyBatchARow(row({ target_url: PORTAL }), observation(404))).toBe('legacy_auth_wall')
    expect(classifyBatchARow(row({ target_url: PORTAL }), observation(200))).toBe('legacy_auth_wall')
  })
})

describe('C) deterministic bounded planning', () => {
  it('orders candidates by (created_at, id) regardless of input order', () => {
    const a = row({ id: 'b', created_at: '2026-09-19T00:00:00.000Z' })
    const b = row({ id: 'a', created_at: '2026-09-19T00:00:00.000Z' })
    const c = row({ id: 'c', created_at: '2026-09-18T00:00:00.000Z' })
    expect(orderBatchACandidates([a, b, c]).map((r) => r.id)).toEqual(['c', 'a', 'b'])
    expect(orderBatchACandidates([c, b, a]).map((r) => r.id)).toEqual(['c', 'a', 'b'])
  })

  it('selects at most `limit` dead rows in deterministic order and counts the rest', () => {
    const rows = [
      row({ id: 'r5', target_url: DEAD_404, created_at: '2026-09-19T05:00:00.000Z' }),
      row({ id: 'r1', target_url: DEAD_404, created_at: '2026-09-19T01:00:00.000Z' }),
      row({ id: 'r3', target_url: DEAD_410, created_at: '2026-09-19T03:00:00.000Z' }),
      row({ id: 'r2', target_url: DEAD_404, created_at: '2026-09-19T02:00:00.000Z' }),
      row({ id: 'r4', target_url: DEAD_410, created_at: '2026-09-19T04:00:00.000Z' }),
    ]
    const observations = {
      [KEY_404]: observation(404),
      [KEY_410]: observation(410),
    }
    const plan = planBatchA(rows, observations, { limit: 2 })
    expect(plan.scannedRows).toBe(5)
    expect(plan.deadCandidateRows).toBe(5)
    expect(plan.deadRowsBeyondLimit).toBe(3)
    expect(plan.selected.map((r) => r.id)).toEqual(['r1', 'r2'])
    expect(plan.selected.map((r) => r.httpStatus)).toEqual([404, 404])
    expect(plan.selected.map((r) => r.gateReason)).toEqual([
      P6_BATCH_A_GATE_REASON_404,
      P6_BATCH_A_GATE_REASON_404,
    ])
    const plan410 = planBatchA(rows, observations, { limit: 5 })
    expect(plan410.selected.map((r) => r.gateReason)).toEqual([
      P6_BATCH_A_GATE_REASON_404,
      P6_BATCH_A_GATE_REASON_404,
      P6_BATCH_A_GATE_REASON_410,
      P6_BATCH_A_GATE_REASON_410,
      P6_BATCH_A_GATE_REASON_404,
    ])
  })

  it('leaves live, legacy auth-wall and unknown targets untouched', () => {
    const rows = [
      row({ id: 'live', target_url: LIVE }),
      row({ id: 'portal', target_url: PORTAL }),
      row({ id: 'unknown', target_url: UNKNOWN }),
      row({ id: 'dead', target_url: DEAD_404 }),
    ]
    const plan = planBatchA(rows, {
      [KEY_LIVE]: observation(200),
      [KEY_PORTAL]: observation(200),
      [KEY_404]: observation(404),
    })
    expect(plan.selected.map((r) => r.id)).toEqual(['dead'])
    expect(plan.liveUntouchedRows).toBe(1)
    expect(plan.legacyAuthWallRows).toBe(1)
    expect(plan.unknownUntouchedRows).toBe(1)
    expect(plan.observedStatusCounts).toEqual({ '200': 2, '404': 1 })
  })

  it('never selects anything when no target is dead', () => {
    const plan = planBatchA(
      [row({ target_url: LIVE }), row({ id: 'r2', target_url: UNKNOWN })],
      { [KEY_LIVE]: observation(200) },
    )
    expect(plan.selected).toEqual([])
    expect(plan.deadCandidateRows).toBe(0)
  })

  it('deduplicates rows by id and probes one key per distinct target', () => {
    const rows = [
      row({ id: 'a', target_url: DEAD_404 }),
      row({ id: 'a', target_url: DEAD_404 }),
      row({ id: 'b', target_url: `${DEAD_404}` }),
    ]
    const plan = planBatchA(rows, { [KEY_404]: observation(404) })
    expect(plan.scannedRows).toBe(2)
    expect(plan.distinctTargets).toBe(1)
    expect(plan.deadCandidateRows).toBe(2)
  })
})

describe('D) exact CAS fence and no proof-field fabrication', () => {
  it('writes exactly the durable rejected disposition and nothing else', () => {
    const patch = buildBatchAUpdatePatch({ httpStatus: 404, nowIso: '2026-09-21T00:00:00.000Z' })
    expect(Object.keys(patch).sort()).toEqual([
      'gate_actor',
      'gate_reason',
      'gate_updated_at',
      'status',
    ])
    expect(patch).toEqual({
      status: 'rejected',
      gate_reason: P6_BATCH_A_GATE_REASON_404,
      gate_actor: P6_BATCH_A_GATE_ACTOR,
      gate_updated_at: '2026-09-21T00:00:00.000Z',
    })
    expect(buildBatchAUpdatePatch({ httpStatus: 410, nowIso: 'x' }).gate_reason).toBe(
      P6_BATCH_A_GATE_REASON_410,
    )
    const serialized = JSON.stringify(patch)
    for (const forbidden of [
      'source_url',
      'source_job_id',
      'verification_state',
      'verified_at',
      'verification_evidence',
      'verification_attempted_at',
      'staged_at',
      'applied_at',
    ]) {
      expect(serialized).not.toContain(forbidden)
    }
  })

  it('fences the exact row and every historical no-proof column', () => {
    expect(buildBatchACasFence(row({ id: 'row-9', target_url: DEAD_404 }))).toEqual([
      { op: 'eq', column: 'id', value: 'row-9' },
      { op: 'eq', column: 'status', value: 'planned' },
      { op: 'eq', column: 'target_url', value: DEAD_404 },
      { op: 'is', column: 'source_url', value: null },
      { op: 'is', column: 'source_job_id', value: null },
      { op: 'is', column: 'verification_state', value: null },
      { op: 'is', column: 'verified_at', value: null },
      { op: 'is', column: 'applied_at', value: null },
      { op: 'is', column: 'verification_evidence', value: null },
      { op: 'is', column: 'verification_attempted_at', value: null },
      { op: 'is', column: 'staged_at', value: null },
    ])
  })
})

describe('E) runner — dry run makes ZERO write calls', () => {
  const candidates = [
    row({ id: 'dead-1', target_url: DEAD_404, created_at: '2026-09-19T01:00:00.000Z' }),
    row({ id: 'dead-2', target_url: DEAD_410, created_at: '2026-09-19T02:00:00.000Z' }),
    row({ id: 'live-1', target_url: LIVE, created_at: '2026-09-19T03:00:00.000Z' }),
  ]
  const observations = {
    [KEY_404]: observation(404),
    [KEY_410]: observation(410),
    [KEY_LIVE]: observation(200),
  }

  it('reads, probes and plans without ever invoking the write dependency', async () => {
    const writeCalls: P6BatchAWrite[] = []
    const observedKeys: string[][] = []
    const summary = await runP6BatchARejection(config(), {
      readCandidates: async () => ({ rows: candidates, truncated: false }),
      observeTargets: async (keys) => {
        observedKeys.push(keys)
        return observations
      },
      applyRejection: async (write) => {
        writeCalls.push(write)
        return { affected: 1 }
      },
      countStatuses: async () => ({ planned: 100, rejected: 0, applied: 0 }),
    })

    expect(summary.mode).toBe('dry-run')
    expect(summary.apply).toBe(false)
    expect(summary.scannedRows).toBe(3)
    expect(summary.distinctTargetsProbed).toBe(3)
    expect(summary.deadCandidateRows).toBe(2)
    expect(summary.selectedForWrite).toBe(2)
    expect(summary.attemptedWrites).toBe(0)
    expect(summary.rejectedWrites).toBe(0)
    expect(summary.casSkips).toBe(0)
    expect(summary.writeResults).toEqual([])
    expect(writeCalls).toEqual([])
    expect(observedKeys).toEqual([[KEY_404, KEY_410, KEY_LIVE]])
    expect(summary.before).toEqual({ planned: 100, rejected: 0, applied: 0 })
    expect(summary.after).toEqual({ planned: 100, rejected: 0, applied: 0 })
    expect(summary.fatalErrors).toEqual([])
    expect(summary.failedClosed).toBe(false)
  })
})

describe('F) runner — bounded apply with exact-row CAS', () => {
  it('attempts the selected rows in order, counts a zero-row CAS as a skip', async () => {
    const writes: P6BatchAWrite[] = []
    const summary = await runP6BatchARejection(
      config({ apply: true, confirm: P6_BATCH_A_APPLY_CONFIRM_TOKEN, limit: 2 }),
      {
        readCandidates: async () => ({
          rows: [
            row({ id: 'r2', target_url: DEAD_410, created_at: '2026-09-19T02:00:00.000Z' }),
            row({ id: 'r1', target_url: DEAD_404, created_at: '2026-09-19T01:00:00.000Z' }),
            row({ id: 'r3', target_url: DEAD_404, created_at: '2026-09-19T03:00:00.000Z' }),
          ],
          truncated: false,
        }),
        observeTargets: async () => ({ [KEY_404]: observation(404), [KEY_410]: observation(410) }),
        applyRejection: async (write) => {
          writes.push(write)
          return write.id === 'r1' ? { affected: 1 } : { affected: 0 }
        },
      },
    )

    expect(summary.mode).toBe('apply')
    expect(writes.map((w) => w.id)).toEqual(['r1', 'r2'])
    expect(summary.selectedForWrite).toBe(2)
    expect(summary.deadRowsBeyondLimit).toBe(1)
    expect(summary.attemptedWrites).toBe(2)
    expect(summary.rejectedWrites).toBe(1)
    expect(summary.casSkips).toBe(1)
    expect(summary.notAttemptedWrites).toBe(0)
    expect(summary.aborted).toBe(false)
    expect(summary.writeResults.map((r) => r.outcome)).toEqual(['rejected', 'cas_skip'])

    for (const write of writes) {
      expect(Object.keys(write.patch).sort()).toEqual([
        'gate_actor',
        'gate_reason',
        'gate_updated_at',
        'status',
      ])
      expect(write.fence.filter((entry) => entry.op === 'is')).toHaveLength(8)
      expect(write.fence.filter((entry) => entry.op === 'eq')).toHaveLength(3)
      expect(write.fence[0]).toEqual({ op: 'eq', column: 'id', value: write.id })
      expect(write.fence[2]).toEqual({ op: 'eq', column: 'target_url', value: write.target_url })
    }
  })

  it('fails closed on the first write error and never reports the rest as written', async () => {
    let calls = 0
    const summary = await runP6BatchARejection(
      config({ apply: true, confirm: P6_BATCH_A_APPLY_CONFIRM_TOKEN, limit: 3 }),
      {
        readCandidates: async () => ({
          rows: [
            row({ id: 'r1', target_url: DEAD_404, created_at: '2026-09-19T01:00:00.000Z' }),
            row({ id: 'r2', target_url: DEAD_404, created_at: '2026-09-19T02:00:00.000Z' }),
            row({ id: 'r3', target_url: DEAD_404, created_at: '2026-09-19T03:00:00.000Z' }),
          ],
          truncated: false,
        }),
        observeTargets: async () => ({ [KEY_404]: observation(404) }),
        applyRejection: async (): Promise<P6BatchAWriteResult> => {
          calls += 1
          return { affected: 0, error: 'permission denied' }
        },
      },
    )
    expect(calls).toBe(1)
    expect(summary.aborted).toBe(true)
    expect(summary.attemptedWrites).toBe(1)
    expect(summary.rejectedWrites).toBe(0)
    expect(summary.notAttemptedWrites).toBe(2)
    expect(summary.fatalErrors).toHaveLength(1)
    expect(summary.failedClosed).toBe(true)
    expect(summary.writeResults[0]).toMatchObject({ outcome: 'error', affected: null })
  })

  it('treats an unexpected affected-row count as a fatal error, never success', async () => {
    const summary = await runP6BatchARejection(
      config({ apply: true, confirm: P6_BATCH_A_APPLY_CONFIRM_TOKEN, limit: 1 }),
      {
        readCandidates: async () => ({ rows: [row({ id: 'r1' })], truncated: false }),
        observeTargets: async () => ({ [KEY_404]: observation(404) }),
        applyRejection: async () => ({ affected: 2 }),
      },
    )
    expect(summary.aborted).toBe(true)
    expect(summary.rejectedWrites).toBe(0)
    expect(summary.fatalErrors[0]).toMatch(/exactly 1/)
  })
})

describe('G) fail-closed reads and verification', () => {
  const baseDeps = () => ({
    readCandidates: async () => ({ rows: [row()], truncated: false }),
    observeTargets: async () => ({ [KEY_404]: observation(404) }),
  })

  it('refuses to plan or write when the candidate read is truncated', async () => {
    let writeCalls = 0
    const summary = await runP6BatchARejection(
      config({ apply: true, confirm: P6_BATCH_A_APPLY_CONFIRM_TOKEN }),
      {
        readCandidates: async () => ({ rows: [row()], truncated: true }),
        observeTargets: async () => ({ [KEY_404]: observation(404) }),
        applyRejection: async () => {
          writeCalls += 1
          return { affected: 1 }
        },
      },
    )
    expect(writeCalls).toBe(0)
    expect(summary.scannedRows).toBe(0)
    expect(summary.truncated).toBe(true)
    expect(summary.failedClosed).toBe(true)
    expect(summary.fatalErrors.join(' ')).toMatch(/truncated/)
  })

  it('refuses to write when the candidate read errored or threw', async () => {
    const errored = await runP6BatchARejection(config({ apply: true, confirm: P6_BATCH_A_APPLY_CONFIRM_TOKEN }), {
      readCandidates: async () => ({ rows: [], truncated: false, error: 'db down' }),
      observeTargets: async () => ({}),
      applyRejection: async () => ({ affected: 1 }),
    })
    expect(errored.failedClosed).toBe(true)
    expect(errored.attemptedWrites).toBe(0)
    const threw = await runP6BatchARejection(config({ apply: true, confirm: P6_BATCH_A_APPLY_CONFIRM_TOKEN }), {
      readCandidates: async () => {
        throw new Error('connection reset')
      },
      observeTargets: async () => ({}),
      applyRejection: async () => ({ affected: 1 }),
    })
    expect(threw.failedClosed).toBe(true)
    expect(threw.attemptedWrites).toBe(0)
  })

  it('refuses to write when the target verification authority fails globally', async () => {
    const thrown = await runP6BatchARejection(
      config({ apply: true, confirm: P6_BATCH_A_APPLY_CONFIRM_TOKEN }),
      {
        ...baseDeps(),
        observeTargets: async () => {
          throw new Error('authority down')
        },
        applyRejection: async () => ({ affected: 1 }),
      },
    )
    expect(thrown.failedClosed).toBe(true)
    expect(thrown.attemptedWrites).toBe(0)
    expect(thrown.fatalErrors.join(' ')).toMatch(/verification authority failed/)

    const empty = await runP6BatchARejection(
      config({ apply: true, confirm: P6_BATCH_A_APPLY_CONFIRM_TOKEN }),
      {
        ...baseDeps(),
        observeTargets: async () => ({}),
        applyRejection: async () => ({ affected: 1 }),
      },
    )
    expect(empty.failedClosed).toBe(true)
    expect(empty.attemptedWrites).toBe(0)
    expect(empty.fatalErrors.join(' ')).toMatch(/no observation/)
  })

  it('leaves only the unobserved target untouched while other dead rows are still rejected', async () => {
    const summary = await runP6BatchARejection(
      config({ apply: true, confirm: P6_BATCH_A_APPLY_CONFIRM_TOKEN, limit: 10 }),
      {
        readCandidates: async () => ({
          rows: [
            row({ id: 'observed', target_url: DEAD_404 }),
            row({ id: 'unobserved', target_url: DEAD_410 }),
            row({ id: 'fivexx', target_url: UNKNOWN }),
          ],
          truncated: false,
        }),
        observeTargets: async () => ({
          [KEY_404]: observation(404),
          [KEY_410]: undefined,
          [KEY_UNKNOWN]: observation(503, false),
        }),
        applyRejection: async () => ({ affected: 1 }),
      },
    )
    expect(summary.writeResults.map((r) => r.id)).toEqual(['observed'])
    expect(summary.unknownUntouchedRows).toBe(2)
    expect(summary.rejectedWrites).toBe(1)
    expect(summary.failedClosed).toBe(false)
  })

  it('re-validates the hard limit even when argv parsing is bypassed', async () => {
    let calls = 0
    const summary = await runP6BatchARejection(
      config({ apply: true, confirm: P6_BATCH_A_APPLY_CONFIRM_TOKEN, limit: 201 }),
      {
        ...baseDeps(),
        applyRejection: async () => {
          calls += 1
          return { affected: 1 }
        },
      },
    )
    expect(calls).toBe(0)
    expect(summary.failedClosed).toBe(true)
    expect(summary.fatalErrors.join(' ')).toMatch(/outside the allowed/)
  })

  it('records count-probe errors as telemetry without blocking the dry-run plan', async () => {
    const summary = await runP6BatchARejection(config(), {
      ...baseDeps(),
      countStatuses: async () => {
        throw new Error('count unavailable')
      },
    })
    expect(summary.failedClosed).toBe(false)
    // Both the before and after count probes failed and were reported truthfully.
    expect(summary.telemetryErrors).toHaveLength(2)
    expect(summary.before).toBeNull()
    expect(summary.after).toBeNull()
  })
})

describe('H) idempotency', () => {
  it('rerunning after a successful rejection never re-touches rejected rows', async () => {
    const db = [
      row({ id: 'r1', target_url: DEAD_404, created_at: '2026-09-19T01:00:00.000Z' }),
      row({ id: 'r2', target_url: DEAD_410, created_at: '2026-09-19T02:00:00.000Z' }),
    ]
    const writeIds: string[] = []
    const deps = {
      readCandidates: async () => ({
        rows: db.filter((entry) => entry.status === 'planned'),
        truncated: false,
      }),
      observeTargets: async () => ({ [KEY_404]: observation(404), [KEY_410]: observation(410) }),
      applyRejection: async (write: P6BatchAWrite) => {
        const target = db.find((entry) => entry.id === write.id)
        if (!target || target.status !== 'planned') return { affected: 0 }
        target.status = 'rejected'
        writeIds.push(write.id)
        return { affected: 1 }
      },
    }
    const first = await runP6BatchARejection(
      config({ apply: true, confirm: P6_BATCH_A_APPLY_CONFIRM_TOKEN, limit: 10 }),
      deps,
    )
    expect(first.rejectedWrites).toBe(2)
    const second = await runP6BatchARejection(
      config({ apply: true, confirm: P6_BATCH_A_APPLY_CONFIRM_TOKEN, limit: 10 }),
      deps,
    )
    expect(second.scannedRows).toBe(0)
    expect(second.selectedForWrite).toBe(0)
    expect(second.attemptedWrites).toBe(0)
    expect(second.rejectedWrites).toBe(0)
    expect(writeIds).toEqual(['r1', 'r2'])
  })
})

describe('I) static contracts', () => {
  const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), 'utf8')

  it('the pure planner contains no write verb and no IO', () => {
    const source = read('scripts/p6BatchAStaleRejection.ts')
    expect(source).not.toMatch(/\.update\s*\(/)
    expect(source).not.toMatch(/\.delete\s*\(/)
    expect(source).not.toMatch(/\.upsert\s*\(/)
    expect(source).not.toMatch(/\.insert\s*\(/)
    expect(source).not.toMatch(/\.rpc\s*\(/)
    expect(source).not.toContain('supabase')
    expect(source).not.toContain('fetch(')
  })

  it('the runner contains no write verb, no Supabase and returns before apply in dry run', () => {
    const source = read('scripts/p6BatchAStaleRejectionRunner.ts')
    expect(source).not.toMatch(/\.update\s*\(/)
    expect(source).not.toMatch(/\.delete\s*\(/)
    expect(source).not.toMatch(/\.upsert\s*\(/)
    expect(source).not.toMatch(/\.insert\s*\(/)
    expect(source).not.toMatch(/\.rpc\s*\(/)
    expect(source).not.toContain('@supabase/supabase-js')
    const dryRunIdx = source.indexOf('if (!config.apply)')
    const writeIdx = source.indexOf('await applyRejection(write)')
    expect(dryRunIdx).toBeGreaterThan(-1)
    expect(writeIdx).toBeGreaterThan(dryRunIdx)
  })

  it('the CLI uses the repository link authority with HEAD→GET and the classified verdict', () => {
    const source = read('scripts/p6-batch-a-stale-rejection.mts')
    expect(source).toContain('verifyUrlsLive')
    expect(source).toContain('classifyLiveStatus')
    expect(source).toMatch(/classifyLiveStatus\(key,\s*result\.status\)/)
    expect(source).toContain(P6_BATCH_A_APPLY_CONFIRM_TOKEN)
    expect(source).toContain('update(write.patch)')
    expect(source).not.toMatch(/\.upsert\s*\(/)
    expect(source).not.toMatch(/\.delete\s*\(/)
    expect(source).not.toMatch(/\.rpc\s*\(/)
    expect(source).not.toMatch(/method:\s*'HEAD'/)
  })

  it('the runner re-checks the exact confirmation token before any IO', () => {
    const source = read('scripts/p6BatchAStaleRejectionRunner.ts')
    const gateIdx = source.indexOf('config.confirm !== P6_BATCH_A_APPLY_CONFIRM_TOKEN')
    expect(gateIdx).toBeGreaterThan(-1)
    for (const io of [
      'deps.countStatuses()',
      'deps.readCandidates()',
      'deps.observeTargets(',
      'await applyRejection(write)',
    ]) {
      const ioIdx = source.indexOf(io)
      expect(ioIdx).toBeGreaterThan(-1)
      expect(ioIdx).toBeGreaterThan(gateIdx)
    }
  })

  it('the CLI parses argv, then resolves apply authority, then creates the client', () => {
    const source = read('scripts/p6-batch-a-stale-rejection.mts')
    const parseIdx = source.indexOf('parseBatchAArgs(process.argv.slice(2))')
    const authorityIdx = source.indexOf('resolveP6BatchAApplyAuthority()')
    const clientIdx = source.indexOf('createClient(')
    expect(parseIdx).toBeGreaterThan(-1)
    expect(authorityIdx).toBeGreaterThan(parseIdx)
    expect(clientIdx).toBeGreaterThan(authorityIdx)
    // Apply is gated on the service-role authority decision; dry run keeps the
    // repository read-capable fallback.
    expect(source).toMatch(/if \(parsed\.config\.apply\)/)
    expect(source).toContain('resolveP6BatchAApplyAuthority()')
    expect(source).toContain('resolveSupabaseKey()')
    const authority = read('scripts/p6BatchAApplyAuthority.ts')
    expect(authority).toContain('resolveSupabaseKey({ ...opts, allowAnonFallback: false })')
    expect(authority).toContain('supabaseAuthMode(opts)')
  })
})

describe('J) programmatic apply authorization gate (defense in depth)', () => {
  const spyDeps = () => {
    const calls = { read: 0, observe: 0, write: 0, counts: 0 }
    return {
      calls,
      deps: {
        readCandidates: async () => {
          calls.read += 1
          return { rows: [row()], truncated: false }
        },
        observeTargets: async () => {
          calls.observe += 1
          return { [KEY_404]: observation(404) }
        },
        applyRejection: async () => {
          calls.write += 1
          return { affected: 1 }
        },
        countStatuses: async () => {
          calls.counts += 1
          return { planned: 1, rejected: 0, applied: 0 }
        },
      },
    }
  }

  it('refuses a direct programmatic apply with a missing token and makes ZERO IO calls', async () => {
    const { calls, deps } = spyDeps()
    const summary = await runP6BatchARejection(config({ apply: true, confirm: null }), deps)
    expect(calls).toEqual({ read: 0, observe: 0, write: 0, counts: 0 })
    expect(summary.mode).toBe('apply')
    expect(summary.failedClosed).toBe(true)
    expect(summary.fatalErrors.join(' ')).toMatch(/confirmation token/)
    expect(summary.fatalErrors.join(' ')).toContain(P6_BATCH_A_APPLY_CONFIRM_TOKEN)
    expect(summary.attemptedWrites).toBe(0)
    expect(summary.selectedForWrite).toBe(0)
    expect(summary.writeResults).toEqual([])
  })

  it('refuses a direct programmatic apply with a wrong or near-miss token', async () => {
    const wrongTokens = [
      'WRONG',
      '',
      `${P6_BATCH_A_APPLY_CONFIRM_TOKEN} `,
      ` ${P6_BATCH_A_APPLY_CONFIRM_TOKEN}`,
      P6_BATCH_A_APPLY_CONFIRM_TOKEN.toLowerCase(),
      `${P6_BATCH_A_APPLY_CONFIRM_TOKEN}!`,
    ]
    for (const confirm of wrongTokens) {
      const { calls, deps } = spyDeps()
      const summary = await runP6BatchARejection(config({ apply: true, confirm }), deps)
      expect(calls).toEqual({ read: 0, observe: 0, write: 0, counts: 0 })
      expect(summary.failedClosed).toBe(true)
      expect(summary.attemptedWrites).toBe(0)
    }
  })

  it('still runs the authorized apply with the exact token (control)', async () => {
    const { calls, deps } = spyDeps()
    const summary = await runP6BatchARejection(
      config({ apply: true, confirm: P6_BATCH_A_APPLY_CONFIRM_TOKEN, limit: 1 }),
      deps,
    )
    expect(calls.read).toBe(1)
    expect(calls.observe).toBe(1)
    expect(calls.write).toBe(1)
    expect(summary.rejectedWrites).toBe(1)
    expect(summary.failedClosed).toBe(false)
  })

  it('leaves dry run untouched (no token needed, still zero writes)', async () => {
    const { calls, deps } = spyDeps()
    const summary = await runP6BatchARejection(config(), deps)
    expect(calls.write).toBe(0)
    expect(summary.mode).toBe('dry-run')
    expect(summary.failedClosed).toBe(false)
  })
})

describe('K) apply requires genuine service-role authority', () => {
  const LEGACY_SR = 'eyJhbGciOiJIUzI1NiJ9.service_role'
  const LEGACY_ANON = 'eyJhbGciOiJIUzI1NiJ9.anon'
  const SECRET_SR = 'sb_secret_current_dashboard_format'

  it('accepts service-role mode with a usable legacy JWT only', () => {
    expect(
      decideP6BatchAApplyAuthority({ authMode: 'service-role', key: LEGACY_SR }),
    ).toEqual({ ok: true, key: LEGACY_SR })
  })

  it('refuses the anon/degraded fallback the read path is allowed to use', () => {
    expect(
      decideP6BatchAApplyAuthority({ authMode: 'degraded-anon', key: LEGACY_ANON }).ok,
    ).toBe(false)
    expect(decideP6BatchAApplyAuthority({ authMode: 'missing', key: null }).ok).toBe(false)
  })

  it('refuses a secret-format or blank key even in service-role mode', () => {
    expect(
      decideP6BatchAApplyAuthority({ authMode: 'service-role', key: SECRET_SR }).ok,
    ).toBe(false)
    expect(
      decideP6BatchAApplyAuthority({ authMode: 'service-role', key: '   ' }).ok,
    ).toBe(false)
  })

  it('resolves through the shared key module with allowAnonFallback:false', () => {
    expect(
      resolveP6BatchAApplyAuthority({ serviceRoleKey: LEGACY_SR, anonKey: LEGACY_ANON }),
    ).toEqual({ ok: true, key: LEGACY_SR })
    // The exact production trap: new-format service key + usable legacy anon.
    expect(
      resolveP6BatchAApplyAuthority({ serviceRoleKey: SECRET_SR, anonKey: LEGACY_ANON }).ok,
    ).toBe(false)
    expect(
      resolveP6BatchAApplyAuthority({ serviceRoleKey: null, anonKey: LEGACY_ANON }).ok,
    ).toBe(false)
    expect(
      resolveP6BatchAApplyAuthority({ serviceRoleKey: null, anonKey: null }).ok,
    ).toBe(false)
  })
})
