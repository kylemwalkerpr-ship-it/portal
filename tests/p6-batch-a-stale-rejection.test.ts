/**
 * P6 Batch A — historical jobless planned `seo_interlinks` stale rejection.
 *
 * Pins the authorized mutation contract:
 *   · subject: planned historical jobless/no-proof rows with a nonblank target;
 *   · ELIGIBILITY: only absolute http(s) targets; noncanonical/non-http
 *     targets are untouched and counted truthfully;
 *   · PROOF BINDING: proofs are bound to the EXACT trimmed stored
 *     `target_url` — never a normalized/synthesized key;
 *   · DEAD NECESSARILY REQUIRES BOTH a raw primary 404/410 AND an explicit GET
 *     re-confirmation of the same exact URL (HEAD 404/410 alone can never
 *     reject);
 *   · exact-row CAS on the RAW stored `target_url`;
 *   · dry-run by default with zero write calls, bounded deterministic apply,
 *     idempotency, fail-closed reads/probes/re-confirmation, Portal auth-wall
 *     exclusion, hard max 200, and no proof-field fabrication;
 *   · the executable CLI boundary (argv → authority → client → runner → exit
 *     code) is exercised with fakes instead of only static string assertions.
 */
import fs from 'node:fs'
import path from 'node:path'

import {
  classifyLiveStatus,
  verifyUrlsLive,
  verifyUrlsLiveGet,
} from '../lib/seoFactory/linkAudit'
import type { P6TargetObservation } from '../scripts/p6InterlinkDisposition'
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
  batchAExactTarget,
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
  runP6BatchACliBoundary,
  type P6BatchACliBoundaryDeps,
} from '../scripts/p6BatchACliBoundary'
import {
  runP6BatchARejection,
  type P6BatchAWrite,
  type P6BatchAWriteResult,
} from '../scripts/p6BatchAStaleRejectionRunner'

const DEAD_404 = 'https://legal.yousafeconsultancy.com/us/made-up-journey/'
/** Same URL without the trailing slash: a DIFFERENT exact Batch A target. */
const DEAD_404_UNSLASHED = 'https://legal.yousafeconsultancy.com/us/made-up-journey'
const DEAD_410 = 'https://usa.yousafeconsultancy.com/gone-page/'
const LIVE = 'https://market.yousafeconsultancy.com/categories/study-permits'
const PORTAL = 'https://portal.yousafeconsultancy.com/marketplace/categories/study-permits'
const UNKNOWN = 'https://legal.yousafeconsultancy.com/us/unobserved/'

const observation = (
  status: number,
  ok: boolean = status >= 200 && status < 400,
): P6TargetObservation => ({ status, ok })

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
    const boundary = fs.readFileSync(
      path.join(process.cwd(), 'scripts/p6BatchACliBoundary.ts'),
      'utf8',
    )
    const authority = fs.readFileSync(
      path.join(process.cwd(), 'scripts/p6BatchAApplyAuthority.ts'),
      'utf8',
    )
    for (const source of [pure, runner, cli, boundary, authority]) {
      expect(source).not.toMatch(/process\.env\.P6_BATCH_A/i)
      expect(source).not.toMatch(/APPLY\s*[:=]\s*process\.env/i)
    }
    // The argv/authority/client decision is executable without process.env.
    expect(boundary).not.toContain('process.env')
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

  it('classifies raw 404/410 as dead ONLY with an explicit GET re-confirmation', () => {
    expect(classifyBatchARow(row({ target_url: DEAD_404 }), observation(404), observation(404))).toBe('dead_404')
    expect(classifyBatchARow(row({ target_url: DEAD_410 }), observation(410), observation(410))).toBe('dead_410')
    // HEAD-only, GET-live, and GET-unknown are NEVER dead.
    expect(classifyBatchARow(row({ target_url: DEAD_404 }), observation(404))).toBe('head_dead_unconfirmed')
    expect(classifyBatchARow(row({ target_url: DEAD_404 }), observation(404), observation(200))).toBe('head_dead_unconfirmed')
    expect(classifyBatchARow(row({ target_url: DEAD_404 }), observation(404), observation(403, true))).toBe('head_dead_unconfirmed')
    expect(classifyBatchARow(row({ target_url: DEAD_404 }), observation(404), observation(0, false))).toBe('head_dead_unconfirmed')
    // The GET re-confirmation is the surviving proof, even across 404/410.
    expect(classifyBatchARow(row({ target_url: DEAD_404 }), observation(404), observation(410))).toBe('dead_410')
    expect(classifyBatchARow(row(), observation(200))).toBe('live')
    expect(classifyBatchARow(row(), observation(301))).toBe('live')
  })

  it('keeps 401/403/405/429/0/5xx and other statuses UNKNOWN, never dead', () => {
    for (const status of [401, 403, 405, 429, 0, 500, 502, 503, 418, 400]) {
      expect(classifyBatchARow(row(), observation(status, false))).toBe('unknown')
      expect(
        classifyBatchARow(row(), observation(status, false), observation(404)),
      ).toBe('unknown')
    }
    expect(classifyBatchARow(row(), undefined)).toBe('unknown')
  })

  it('honours the authority-host exemption instead of calling a 403 dead', () => {
    expect(classifyBatchARow(row(), observation(403, true))).toBe('live')
  })

  it('never classifies a legacy Portal auth-wall row as dead even on GET-confirmed 404', () => {
    expect(classifyBatchARow(row({ target_url: PORTAL }), observation(404))).toBe('legacy_auth_wall')
    expect(classifyBatchARow(row({ target_url: PORTAL }), observation(404), observation(404))).toBe('legacy_auth_wall')
    expect(classifyBatchARow(row({ target_url: PORTAL }), observation(200))).toBe('legacy_auth_wall')
  })
})

describe('B2) exact trimmed target binding and http(s)-only eligibility', () => {
  it('returns the exact trimmed stored value, never a normalized/synthesized key', () => {
    expect(batchAExactTarget(' https://Example.com/A/ ')).toBe('https://Example.com/A/')
    expect(batchAExactTarget(DEAD_404)).toBe(DEAD_404)
    // Trailing-slash and case spellings are DIFFERENT Batch A targets.
    expect(batchAExactTarget(DEAD_404)).not.toBe(batchAExactTarget(DEAD_404_UNSLASHED))
    expect(batchAExactTarget('https://Example.com/A')).not.toBe(
      batchAExactTarget('https://example.com/a'),
    )
    for (const ineligible of [
      '',
      '   ',
      '/relative/path',
      'example.com/no-scheme',
      'mailto:someone@example.com',
      'ftp://example.com/file',
      'javascript:alert(1)',
      'https://',
      'not a url',
    ]) {
      expect(batchAExactTarget(ineligible)).toBeNull()
    }
    expect(batchAExactTarget(null)).toBeNull()
    expect(batchAExactTarget(undefined)).toBeNull()
  })

  it('never rejects a row from another spelling\'s observation (exact binding)', () => {
    const rows = [
      row({ id: 'slashed', target_url: DEAD_404 }),
      row({ id: 'unslashed', target_url: DEAD_404_UNSLASHED }),
    ]
    const plan = planBatchA(
      rows,
      { [DEAD_404]: observation(404), [DEAD_404_UNSLASHED]: observation(404) },
      { [DEAD_404]: observation(404) },
    )
    expect(plan.selected.map((r) => r.id)).toEqual(['slashed'])
    expect(plan.selected[0].exactTarget).toBe(DEAD_404)
    expect(plan.deadCandidateRows).toBe(1)
    expect(plan.headDeadUnconfirmedRows).toBe(1)
    expect(plan.unknownUntouchedRows).toBe(1)
  })

  it('counts noncanonical/non-http targets untouched and never selects them', () => {
    const plan = planBatchA(
      [
        row({ id: 'relative', target_url: '/relative/target' }),
        row({ id: 'bare-host', target_url: 'legal.yousafeconsultancy.com/x' }),
        row({ id: 'mailto', target_url: 'mailto:someone@example.com' }),
        row({ id: 'dead', target_url: DEAD_404 }),
      ],
      { [DEAD_404]: observation(404) },
      { [DEAD_404]: observation(404) },
    )
    expect(plan.selected.map((r) => r.id)).toEqual(['dead'])
    expect(plan.noncanonicalTargetRows).toBe(3)
    expect(plan.deadCandidateRows).toBe(1)
    expect(classifyBatchARow(row({ target_url: '/relative/target' }), observation(404), observation(404)))
      .toBe('noncanonical_target')
    expect(classifyBatchARow(row({ target_url: 'mailto:someone@example.com' }), observation(410), observation(410)))
      .toBe('noncanonical_target')
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

  it('selects at most `limit` GET-confirmed dead rows in deterministic order and counts the rest', () => {
    const rows = [
      row({ id: 'r5', target_url: DEAD_404, created_at: '2026-09-19T05:00:00.000Z' }),
      row({ id: 'r1', target_url: DEAD_404, created_at: '2026-09-19T01:00:00.000Z' }),
      row({ id: 'r3', target_url: DEAD_410, created_at: '2026-09-19T03:00:00.000Z' }),
      row({ id: 'r2', target_url: DEAD_404, created_at: '2026-09-19T02:00:00.000Z' }),
      row({ id: 'r4', target_url: DEAD_410, created_at: '2026-09-19T04:00:00.000Z' }),
    ]
    const observations = {
      [DEAD_404]: observation(404),
      [DEAD_410]: observation(410),
    }
    const confirmations = {
      [DEAD_404]: observation(404),
      [DEAD_410]: observation(410),
    }
    const plan = planBatchA(rows, observations, confirmations, { limit: 2 })
    expect(plan.scannedRows).toBe(5)
    expect(plan.deadCandidateRows).toBe(5)
    expect(plan.headDeadUnconfirmedRows).toBe(0)
    expect(plan.deadRowsBeyondLimit).toBe(3)
    expect(plan.selected.map((r) => r.id)).toEqual(['r1', 'r2'])
    expect(plan.selected.map((r) => r.httpStatus)).toEqual([404, 404])
    expect(plan.selected.map((r) => r.gateReason)).toEqual([
      P6_BATCH_A_GATE_REASON_404,
      P6_BATCH_A_GATE_REASON_404,
    ])
    const plan410 = planBatchA(rows, observations, confirmations, { limit: 5 })
    expect(plan410.selected.map((r) => r.gateReason)).toEqual([
      P6_BATCH_A_GATE_REASON_404,
      P6_BATCH_A_GATE_REASON_404,
      P6_BATCH_A_GATE_REASON_410,
      P6_BATCH_A_GATE_REASON_410,
      P6_BATCH_A_GATE_REASON_404,
    ])
    expect(plan.confirmationStatusCounts).toEqual({ '404': 3, '410': 2 })
    expect(plan.observedStatusCounts).toEqual({ '404': 3, '410': 2 })
  })

  it('never selects HEAD-dead rows that lack a GET re-confirmation', () => {
    const plan = planBatchA(
      [
        row({ id: 'a', target_url: DEAD_404 }),
        row({ id: 'b', target_url: DEAD_410 }),
      ],
      { [DEAD_404]: observation(404), [DEAD_410]: observation(410) },
      {},
    )
    expect(plan.selected).toEqual([])
    expect(plan.deadCandidateRows).toBe(0)
    expect(plan.headDeadUnconfirmedRows).toBe(2)
    expect(plan.unknownUntouchedRows).toBe(2)
    expect(plan.confirmationStatusCounts).toEqual({})
  })

  it('leaves live, legacy auth-wall and unknown targets untouched', () => {
    const rows = [
      row({ id: 'live', target_url: LIVE }),
      row({ id: 'portal', target_url: PORTAL }),
      row({ id: 'unknown', target_url: UNKNOWN }),
      row({ id: 'dead', target_url: DEAD_404 }),
    ]
    const plan = planBatchA(
      rows,
      {
        [LIVE]: observation(200),
        [PORTAL]: observation(200),
        [DEAD_404]: observation(404),
      },
      { [DEAD_404]: observation(404) },
    )
    expect(plan.selected.map((r) => r.id)).toEqual(['dead'])
    expect(plan.liveUntouchedRows).toBe(1)
    expect(plan.legacyAuthWallRows).toBe(1)
    expect(plan.unknownUntouchedRows).toBe(1)
    expect(plan.observedStatusCounts).toEqual({ '200': 2, '404': 1 })
    expect(plan.confirmationStatusCounts).toEqual({ '404': 1 })
  })

  it('never selects anything when no target is dead', () => {
    const plan = planBatchA(
      [row({ target_url: LIVE }), row({ id: 'r2', target_url: UNKNOWN })],
      { [LIVE]: observation(200) },
    )
    expect(plan.selected).toEqual([])
    expect(plan.deadCandidateRows).toBe(0)
  })

  it('deduplicates rows by id and counts one exact target per distinct spelling', () => {
    const rows = [
      row({ id: 'a', target_url: DEAD_404 }),
      row({ id: 'a', target_url: DEAD_404 }),
      row({ id: 'b', target_url: DEAD_404 }),
    ]
    const plan = planBatchA(rows, { [DEAD_404]: observation(404) }, { [DEAD_404]: observation(404) })
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

  it('fences the RAW stored target_url exactly, never the trimmed proof binding', () => {
    const raw = `  ${DEAD_404}  `
    const fence = buildBatchACasFence(row({ id: 'row-raw', target_url: raw }))
    expect(fence[2]).toEqual({ op: 'eq', column: 'target_url', value: raw })
    expect(batchAExactTarget(raw)).toBe(DEAD_404)
  })
})

describe('E) runner — dry run makes ZERO write calls', () => {
  const candidates = [
    row({ id: 'dead-1', target_url: DEAD_404, created_at: '2026-09-19T01:00:00.000Z' }),
    row({ id: 'dead-2', target_url: DEAD_410, created_at: '2026-09-19T02:00:00.000Z' }),
    row({ id: 'live-1', target_url: LIVE, created_at: '2026-09-19T03:00:00.000Z' }),
    row({ id: 'noncanon-1', target_url: '/relative/target', created_at: '2026-09-19T04:00:00.000Z' }),
  ]
  const observations = {
    [DEAD_404]: observation(404),
    [DEAD_410]: observation(410),
    [LIVE]: observation(200),
  }
  const confirmations = {
    [DEAD_404]: observation(404),
    [DEAD_410]: observation(410),
  }

  it('reads, probes, re-confirms and plans without ever invoking the write dependency', async () => {
    const writeCalls: P6BatchAWrite[] = []
    const observedKeys: string[][] = []
    const confirmKeys: string[][] = []
    const summary = await runP6BatchARejection(config(), {
      readCandidates: async () => ({ rows: candidates, truncated: false }),
      observeTargets: async (exactTargets) => {
        observedKeys.push(exactTargets)
        return observations
      },
      confirmDeadTargets: async (exactTargets) => {
        confirmKeys.push(exactTargets)
        return confirmations
      },
      applyRejection: async (write) => {
        writeCalls.push(write)
        return { affected: 1 }
      },
      countStatuses: async () => ({ planned: 100, rejected: 0, applied: 0 }),
    })

    expect(summary.mode).toBe('dry-run')
    expect(summary.apply).toBe(false)
    expect(summary.scannedRows).toBe(4)
    expect(summary.distinctTargetsProbed).toBe(3)
    expect(summary.headDeadTargetsReconfirmed).toBe(2)
    expect(summary.deadCandidateRows).toBe(2)
    expect(summary.headDeadUnconfirmedRows).toBe(0)
    expect(summary.noncanonicalTargetRows).toBe(1)
    expect(summary.selectedForWrite).toBe(2)
    expect(summary.attemptedWrites).toBe(0)
    expect(summary.rejectedWrites).toBe(0)
    expect(summary.casSkips).toBe(0)
    expect(summary.writeResults).toEqual([])
    expect(writeCalls).toEqual([])
    // Only absolute http(s) targets are probed; the noncanonical row never is.
    expect(observedKeys).toEqual([[DEAD_404, DEAD_410, LIVE]])
    // Only head-dead, non-auth-wall targets are re-confirmed by GET.
    expect(confirmKeys).toEqual([[DEAD_404, DEAD_410]])
    expect(summary.confirmationStatusCounts).toEqual({ '404': 1, '410': 1 })
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
        observeTargets: async () => ({ [DEAD_404]: observation(404), [DEAD_410]: observation(410) }),
        confirmDeadTargets: async () => ({ [DEAD_404]: observation(404), [DEAD_410]: observation(410) }),
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

  it('binds the proof to the exact trimmed target while fencing the raw stored value', async () => {
    const raw = ` ${DEAD_404} `
    const writes: P6BatchAWrite[] = []
    const observed: string[][] = []
    const confirmed: string[][] = []
    const summary = await runP6BatchARejection(
      config({ apply: true, confirm: P6_BATCH_A_APPLY_CONFIRM_TOKEN, limit: 1 }),
      {
        readCandidates: async () => ({ rows: [row({ id: 'raw', target_url: raw })], truncated: false }),
        observeTargets: async (exactTargets) => {
          observed.push(exactTargets)
          return { [DEAD_404]: observation(404) }
        },
        confirmDeadTargets: async (exactTargets) => {
          confirmed.push(exactTargets)
          return { [DEAD_404]: observation(410) }
        },
        applyRejection: async (write) => {
          writes.push(write)
          return { affected: 1 }
        },
      },
    )
    expect(observed).toEqual([[DEAD_404]])
    expect(confirmed).toEqual([[DEAD_404]])
    expect(summary.selected[0].exactTarget).toBe(DEAD_404)
    expect(summary.selected[0].httpStatus).toBe(410)
    expect(writes[0].fence[2]).toEqual({ op: 'eq', column: 'target_url', value: raw })
    expect(writes[0].patch.gate_reason).toBe(P6_BATCH_A_GATE_REASON_410)
    expect(summary.rejectedWrites).toBe(1)
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
        observeTargets: async () => ({ [DEAD_404]: observation(404) }),
        confirmDeadTargets: async () => ({ [DEAD_404]: observation(404) }),
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
        observeTargets: async () => ({ [DEAD_404]: observation(404) }),
        confirmDeadTargets: async () => ({ [DEAD_404]: observation(404) }),
        applyRejection: async () => ({ affected: 2 }),
      },
    )
    expect(summary.aborted).toBe(true)
    expect(summary.rejectedWrites).toBe(0)
    expect(summary.fatalErrors[0]).toMatch(/exactly 1/)
  })
})

describe('G) fail-closed reads, probes and GET re-confirmation', () => {
  const baseDeps = () => ({
    readCandidates: async () => ({ rows: [row()], truncated: false }),
    observeTargets: async () => ({ [DEAD_404]: observation(404) }),
    confirmDeadTargets: async () => ({ [DEAD_404]: observation(404) }),
  })

  it('refuses to plan or write when the candidate read is truncated', async () => {
    let writeCalls = 0
    const summary = await runP6BatchARejection(
      config({ apply: true, confirm: P6_BATCH_A_APPLY_CONFIRM_TOKEN }),
      {
        readCandidates: async () => ({ rows: [row()], truncated: true }),
        observeTargets: async () => ({ [DEAD_404]: observation(404) }),
        confirmDeadTargets: async () => ({ [DEAD_404]: observation(404) }),
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

  it('refuses to write when the primary target verification authority fails globally', async () => {
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

  it('refuses to plan or write when a HEAD-dead target has no GET re-confirmation dependency', async () => {
    let writeCalls = 0
    const summary = await runP6BatchARejection(
      config({ apply: true, confirm: P6_BATCH_A_APPLY_CONFIRM_TOKEN }),
      {
        readCandidates: async () => ({ rows: [row({ id: 'r1', target_url: DEAD_404 })], truncated: false }),
        observeTargets: async () => ({ [DEAD_404]: observation(404) }),
        applyRejection: async () => {
          writeCalls += 1
          return { affected: 1 }
        },
      },
    )
    expect(writeCalls).toBe(0)
    expect(summary.selectedForWrite).toBe(0)
    expect(summary.attemptedWrites).toBe(0)
    expect(summary.failedClosed).toBe(true)
    expect(summary.fatalErrors.join(' ')).toMatch(/GET re-confirmation dependency/)
  })

  it('refuses to plan or write when GET re-confirmation returns nothing for every head-dead target', async () => {
    let writeCalls = 0
    const summary = await runP6BatchARejection(
      config({ apply: true, confirm: P6_BATCH_A_APPLY_CONFIRM_TOKEN }),
      {
        readCandidates: async () => ({ rows: [row({ id: 'r1', target_url: DEAD_404 })], truncated: false }),
        observeTargets: async () => ({ [DEAD_404]: observation(404) }),
        confirmDeadTargets: async () => ({}),
        applyRejection: async () => {
          writeCalls += 1
          return { affected: 1 }
        },
      },
    )
    expect(writeCalls).toBe(0)
    expect(summary.selectedForWrite).toBe(0)
    expect(summary.failedClosed).toBe(true)
    expect(summary.fatalErrors.join(' ')).toMatch(/GET re-confirmation returned no observation/)
  })

  it('refuses to plan or write when the GET re-confirmation authority throws', async () => {
    let writeCalls = 0
    const summary = await runP6BatchARejection(
      config({ apply: true, confirm: P6_BATCH_A_APPLY_CONFIRM_TOKEN }),
      {
        readCandidates: async () => ({ rows: [row({ id: 'r1', target_url: DEAD_404 })], truncated: false }),
        observeTargets: async () => ({ [DEAD_404]: observation(404) }),
        confirmDeadTargets: async () => {
          throw new Error('get probe down')
        },
        applyRejection: async () => {
          writeCalls += 1
          return { affected: 1 }
        },
      },
    )
    expect(writeCalls).toBe(0)
    expect(summary.attemptedWrites).toBe(0)
    expect(summary.failedClosed).toBe(true)
    expect(summary.fatalErrors.join(' ')).toMatch(/GET re-confirmation authority failed/)
  })

  it('leaves a HEAD-dead target with a non-404/410 GET verdict untouched while another confirmed row proceeds', async () => {
    const summary = await runP6BatchARejection(
      config({ apply: true, confirm: P6_BATCH_A_APPLY_CONFIRM_TOKEN, limit: 10 }),
      {
        readCandidates: async () => ({
          rows: [
            row({ id: 'confirmed', target_url: DEAD_404, created_at: '2026-09-19T01:00:00.000Z' }),
            row({ id: 'ambiguous', target_url: DEAD_410, created_at: '2026-09-19T02:00:00.000Z' }),
          ],
          truncated: false,
        }),
        observeTargets: async () => ({ [DEAD_404]: observation(404), [DEAD_410]: observation(410) }),
        confirmDeadTargets: async () => ({
          [DEAD_404]: observation(404),
          [DEAD_410]: observation(200),
        }),
        applyRejection: async () => ({ affected: 1 }),
      },
    )
    expect(summary.writeResults.map((r) => r.id)).toEqual(['confirmed'])
    expect(summary.rejectedWrites).toBe(1)
    expect(summary.headDeadUnconfirmedRows).toBe(1)
    expect(summary.deadCandidateRows).toBe(1)
    expect(summary.failedClosed).toBe(false)
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
          [DEAD_404]: observation(404),
          [DEAD_410]: undefined,
          [UNKNOWN]: observation(503, false),
        }),
        confirmDeadTargets: async () => ({ [DEAD_404]: observation(404) }),
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
      observeTargets: async () => ({ [DEAD_404]: observation(404), [DEAD_410]: observation(410) }),
      confirmDeadTargets: async () => ({ [DEAD_404]: observation(404), [DEAD_410]: observation(410) }),
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

describe('I) static and structural contracts', () => {
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

  it('the executable boundary parses argv, then resolves authority, then creates the client', () => {
    const source = read('scripts/p6BatchACliBoundary.ts')
    const parseIdx = source.indexOf('parseBatchAArgs(deps.argv)')
    const authorityIdx = source.indexOf('deps.resolveApplyAuthority()')
    const clientIdx = source.indexOf('deps.createClient(')
    expect(parseIdx).toBeGreaterThan(-1)
    expect(authorityIdx).toBeGreaterThan(parseIdx)
    expect(clientIdx).toBeGreaterThan(authorityIdx)
    // The boundary is dependency-injected: no env reads, no Supabase, no write verb.
    expect(source).not.toContain('process.env')
    expect(source).not.toContain('@supabase/supabase-js')
    expect(source).not.toMatch(/\.(update|upsert|insert|delete|rpc)\s*\(/)
  })

  it('the CLI shell wires the real authority incl. the explicit GET re-confirmation', () => {
    const source = read('scripts/p6-batch-a-stale-rejection.mts')
    expect(source).toContain('verifyUrlsLive')
    expect(source).toContain('classifyLiveStatus')
    expect(source).toContain('verifyUrlsLiveGet')
    expect(source).toContain('confirmDeadTargets')
    expect(source).toContain('runP6BatchACliBoundary')
    expect(source).toMatch(/classifyLiveStatus\(exact,\s*result\.status\)/)
    expect(source).toContain(P6_BATCH_A_APPLY_CONFIRM_TOKEN)
    expect(source).toContain('update(write.patch)')
    expect(source).not.toMatch(/\.upsert\s*\(/)
    expect(source).not.toMatch(/\.delete\s*\(/)
    expect(source).not.toMatch(/\.rpc\s*\(/)
    expect(source).not.toMatch(/method:\s*'HEAD'/)
    // No key normalization in the proof path.
    expect(source).not.toContain('p6TargetKey')
  })

  it('the runner re-checks the exact confirmation token before any IO', () => {
    const source = read('scripts/p6BatchAStaleRejectionRunner.ts')
    const gateIdx = source.indexOf('config.confirm !== P6_BATCH_A_APPLY_CONFIRM_TOKEN')
    expect(gateIdx).toBeGreaterThan(-1)
    for (const io of [
      'deps.countStatuses()',
      'deps.readCandidates()',
      'deps.observeTargets(',
      'deps.confirmDeadTargets(',
      'await applyRejection(write)',
    ]) {
      const ioIdx = source.indexOf(io)
      expect(ioIdx).toBeGreaterThan(-1)
      expect(ioIdx).toBeGreaterThan(gateIdx)
    }
  })

  it('the real CLI candidate read keeps the NULL fence, deterministic pagination and a truncation proof', () => {
    const source = read('scripts/p6-batch-a-stale-rejection.mts')
    // Subject fence: planned rows with a nonblank target only.
    expect(source).toContain("eq('status', 'planned')")
    expect(source).toContain("not('target_url', 'is', null)")
    // Deterministic total order across pages, so pagination can never reshuffle.
    expect(source).toContain("order('created_at', { ascending: true })")
    expect(source).toContain("order('id', { ascending: true })")
    expect(source).toContain('.range(')
    expect(source).toContain('P6_BATCH_A_PAGE_SIZE')
    expect(source).toContain('P6_BATCH_A_SCAN_LIMIT')
    // The read-time NULL fence covers exactly the eight historical no-proof columns.
    for (const column of [
      'source_url',
      'source_job_id',
      'verification_state',
      'verified_at',
      'verification_evidence',
      'verification_attempted_at',
      'staged_at',
      'applied_at',
    ]) {
      expect(source).toContain(`'${column}'`)
    }
    // A read that hits the cap is only complete when a probe row proves no more.
    expect(source).toContain('truncated')
    expect(source).toContain('probe')
  })
})

describe('J) programmatic apply authorization gate (defense in depth)', () => {
  const spyDeps = () => {
    const calls = { read: 0, observe: 0, confirm: 0, write: 0, counts: 0 }
    return {
      calls,
      deps: {
        readCandidates: async () => {
          calls.read += 1
          return { rows: [row()], truncated: false }
        },
        observeTargets: async () => {
          calls.observe += 1
          return { [DEAD_404]: observation(404) }
        },
        confirmDeadTargets: async () => {
          calls.confirm += 1
          return { [DEAD_404]: observation(404) }
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
    expect(calls).toEqual({ read: 0, observe: 0, confirm: 0, write: 0, counts: 0 })
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
      expect(calls).toEqual({ read: 0, observe: 0, confirm: 0, write: 0, counts: 0 })
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
    expect(calls.confirm).toBe(1)
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

describe('L) executable CLI boundary (argv to authority to client to runner)', () => {
  const makeDeps = (overrides: Partial<P6BatchACliBoundaryDeps> = {}) => {
    const calls = {
      authority: 0,
      readKey: 0,
      client: 0,
      read: 0,
      observe: 0,
      confirm: 0,
      write: 0,
      counts: 0,
    }
    const out: string[] = []
    const err: string[] = []
    const clientArgs: Array<{ url: string; key: string }> = []
    const deps: P6BatchACliBoundaryDeps = {
      argv: [],
      readSupabaseUrl: () => 'https://project.supabase.co',
      resolveReadKey: () => {
        calls.readKey += 1
        return 'anon-read-key'
      },
      resolveApplyAuthority: () => {
        calls.authority += 1
        return { ok: false, error: 'supabaseAuthMode()=degraded-anon' }
      },
      createClient: (url, key) => {
        calls.client += 1
        clientArgs.push({ url, key })
        return { url, key }
      },
      readCandidates: async () => {
        calls.read += 1
        return { rows: [row({ id: 'r1', target_url: DEAD_404 })], truncated: false }
      },
      observeTargets: async (exactTargets) => {
        calls.observe += 1
        return Object.fromEntries(exactTargets.map((target) => [target, observation(404)]))
      },
      confirmDeadTargets: async (exactTargets) => {
        calls.confirm += 1
        return Object.fromEntries(exactTargets.map((target) => [target, observation(404)]))
      },
      applyRejection: async () => {
        calls.write += 1
        return { affected: 1 }
      },
      countStatuses: async () => {
        calls.counts += 1
        return { planned: 1, rejected: 0, applied: 0 }
      },
      now: () => '2026-09-21T00:00:00.000Z',
      stdout: (line) => out.push(line),
      stderr: (line) => err.push(line),
      ...overrides,
    }
    return { deps, calls, clientArgs, out, err }
  }

  it('--help exits 0 with usage and resolves no authority/key and creates no client', async () => {
    const { deps, calls, out } = makeDeps({ argv: ['--help'] })
    const result = await runP6BatchACliBoundary(deps)
    expect(result.exitCode).toBe(0)
    expect(result.summary).toBeNull()
    expect(calls).toEqual({
      authority: 0,
      readKey: 0,
      client: 0,
      read: 0,
      observe: 0,
      confirm: 0,
      write: 0,
      counts: 0,
    })
    expect(out.join('\n')).toContain('P6 Batch A')
  })

  it('refuses invalid argv with exit 2 before any client or authority resolution', async () => {
    const { deps, calls, err } = makeDeps({ argv: ['--apply'] })
    const result = await runP6BatchACliBoundary(deps)
    expect(result.exitCode).toBe(2)
    expect(calls.client).toBe(0)
    expect(calls.authority).toBe(0)
    expect(calls.read).toBe(0)
    expect(err.join(' ')).toMatch(/requires --confirm/)
  })

  it('refuses an unknown flag with exit 2 before any authority or client', async () => {
    const { deps, calls, err } = makeDeps({ argv: ['--force'] })
    const result = await runP6BatchACliBoundary(deps)
    expect(result.exitCode).toBe(2)
    expect(result.summary).toBeNull()
    expect(calls.authority).toBe(0)
    expect(calls.readKey).toBe(0)
    expect(calls.client).toBe(0)
    expect(err.join(' ')).toMatch(/unknown flag/)
  })

  it('refuses apply without service-role authority: exit 1, ZERO clients and ZERO IO', async () => {
    const { deps, calls, err } = makeDeps({
      argv: ['--apply', '--confirm', P6_BATCH_A_APPLY_CONFIRM_TOKEN],
    })
    const result = await runP6BatchACliBoundary(deps)
    expect(result.exitCode).toBe(1)
    expect(calls.client).toBe(0)
    expect(calls.read).toBe(0)
    expect(calls.observe).toBe(0)
    expect(calls.confirm).toBe(0)
    expect(calls.write).toBe(0)
    expect(err.join(' ')).toMatch(/service-role/)
    expect(err.join(' ')).toMatch(/No Supabase client was created/)
  })

  it('refuses apply with service-role authority but a missing Supabase URL: zero clients', async () => {
    const { deps, calls, clientArgs } = makeDeps({
      argv: ['--apply', '--confirm', P6_BATCH_A_APPLY_CONFIRM_TOKEN],
      readSupabaseUrl: () => null,
      resolveApplyAuthority: () => {
        calls.authority += 1
        return { ok: true, key: 'eyJlegacy-service-role' }
      },
    })
    const result = await runP6BatchACliBoundary(deps)
    expect(result.exitCode).toBe(1)
    expect(result.summary).toBeNull()
    expect(calls.authority).toBe(1)
    expect(calls.readKey).toBe(0)
    expect(calls.client).toBe(0)
    expect(clientArgs).toEqual([])
    expect(calls.read).toBe(0)
    expect(calls.write).toBe(0)
  })

  it('dry run resolves only the read key, creates one client and never writes', async () => {
    const { deps, calls, out } = makeDeps()
    const result = await runP6BatchACliBoundary(deps)
    expect(result.exitCode).toBe(0)
    expect(calls.authority).toBe(0)
    expect(calls.readKey).toBe(1)
    expect(calls.client).toBe(1)
    expect(calls.read).toBe(1)
    expect(calls.observe).toBe(1)
    expect(calls.confirm).toBe(1)
    expect(calls.write).toBe(0)
    expect(result.summary!.mode).toBe('dry-run')
    expect(result.summary!.selectedForWrite).toBe(1)
    expect((JSON.parse(out.join('\n')) as { tool: string }).tool).toBe('p6-batch-a-stale-rejection')
  })

  it('builds the dry-run client from the read key and the apply client from the authority key', async () => {
    const dry = makeDeps()
    const dryResult = await runP6BatchACliBoundary(dry.deps)
    expect(dryResult.exitCode).toBe(0)
    expect(dry.calls.authority).toBe(0)
    expect(dry.clientArgs).toEqual([
      { url: 'https://project.supabase.co', key: 'anon-read-key' },
    ])

    const write = makeDeps({
      argv: ['--apply', '--confirm', P6_BATCH_A_APPLY_CONFIRM_TOKEN],
      resolveApplyAuthority: () => ({ ok: true, key: 'eyJlegacy-service-role' }),
    })
    const writeResult = await runP6BatchACliBoundary(write.deps)
    expect(writeResult.exitCode).toBe(0)
    expect(write.calls.readKey).toBe(0)
    expect(write.clientArgs).toEqual([
      { url: 'https://project.supabase.co', key: 'eyJlegacy-service-role' },
    ])
  })

  it('authorized apply with a GET-confirmed 404 creates one client and writes exactly once', async () => {
    const { deps, calls, out } = makeDeps({
      argv: ['--apply', '--confirm', P6_BATCH_A_APPLY_CONFIRM_TOKEN],
      resolveApplyAuthority: () => {
        calls.authority += 1
        return { ok: true, key: 'eyJlegacy-service-role' }
      },
    })
    const result = await runP6BatchACliBoundary(deps)
    expect(result.exitCode).toBe(0)
    expect(calls.authority).toBe(1)
    expect(calls.readKey).toBe(0)
    expect(calls.client).toBe(1)
    expect(calls.confirm).toBe(1)
    expect(calls.write).toBe(1)
    expect(result.summary!.mode).toBe('apply')
    expect(result.summary!.rejectedWrites).toBe(1)
    expect(result.summary!.fatalErrors).toEqual([])
    expect(result.summary!.writeResults[0].outcome).toBe('rejected')
    expect((JSON.parse(out.join('\n')) as { mode: string }).mode).toBe('apply')
  })

  it('exits 1 with zero writes when GET re-confirmation returns nothing (HEAD-only never rejects)', async () => {
    const { deps, calls } = makeDeps({
      argv: ['--apply', '--confirm', P6_BATCH_A_APPLY_CONFIRM_TOKEN],
      resolveApplyAuthority: () => {
        calls.authority += 1
        return { ok: true, key: 'eyJlegacy-service-role' }
      },
      confirmDeadTargets: async () => {
        calls.confirm += 1
        return {}
      },
    })
    const result = await runP6BatchACliBoundary(deps)
    expect(result.exitCode).toBe(1)
    expect(calls.write).toBe(0)
    expect(result.summary!.failedClosed).toBe(true)
    expect(result.summary!.attemptedWrites).toBe(0)
    expect(result.summary!.selectedForWrite).toBe(0)
    expect(result.summary!.fatalErrors.join(' ')).toMatch(/GET re-confirmation/)
  })

  it('exits 1 with zero writes when the GET re-confirmation authority throws', async () => {
    const { deps, calls } = makeDeps({
      confirmDeadTargets: async () => {
        calls.confirm += 1
        throw new Error('get authority down')
      },
    })
    const result = await runP6BatchACliBoundary(deps)
    expect(result.exitCode).toBe(1)
    expect(calls.write).toBe(0)
    expect(result.summary!.failedClosed).toBe(true)
    expect(result.summary!.fatalErrors.join(' ')).toMatch(/GET re-confirmation authority failed/)
  })

  it('is missing-env fail-closed with zero clients', async () => {
    const { deps, calls } = makeDeps({ readSupabaseUrl: () => null })
    const result = await runP6BatchACliBoundary(deps)
    expect(result.exitCode).toBe(1)
    expect(calls.client).toBe(0)
    expect(calls.read).toBe(0)
  })

  it('is missing-read-key fail-closed in dry run with zero clients', async () => {
    const { deps, calls, err } = makeDeps({
      resolveReadKey: () => {
        calls.readKey += 1
        return null
      },
    })
    const result = await runP6BatchACliBoundary(deps)
    expect(result.exitCode).toBe(1)
    expect(result.summary).toBeNull()
    expect(calls.readKey).toBe(1)
    expect(calls.client).toBe(0)
    expect(calls.read).toBe(0)
    expect(err.join(' ')).toMatch(/Missing Supabase env vars/)
  })

  it('turns a throwing client factory into exit 1, never an unhandled rejection', async () => {
    const { deps, calls } = makeDeps({
      createClient: () => {
        calls.client += 1
        throw new Error('client boom')
      },
    })
    const result = await runP6BatchACliBoundary(deps)
    expect(result.exitCode).toBe(1)
    expect(result.summary).toBeNull()
    expect(calls.read).toBe(0)
  })
})

describe('M) executed link authority: HEAD primary vs fresh same-target GET re-confirmation', () => {
  it('performs a fresh GET of the exact target, ignores the HEAD cache and refuses non-http(s)', async () => {
    const originalFetch = globalThis.fetch
    const calls: Array<{ url: string; method: string }> = []
    // Deterministic in-process authority stub: records the exact method + URL.
    // HEAD answers 404 (dead), GET answers 200 (recovered). No socket, no
    // external network, no dependency on a live estate.
    globalThis.fetch = (async (input: unknown, init?: { method?: string }) => {
      const method = String(init?.method || 'GET')
      calls.push({ url: String(input), method })
      return {
        status: method === 'HEAD' ? 404 : 200,
        url: String(input),
      } as unknown as Response
    }) as unknown as typeof fetch

    try {
      const exact = 'https://legal.yousafeconsultancy.com/us/head-dead-get-live/'
      // 1) primary probe = HEAD, cached as 404.
      const primary = await verifyUrlsLive([exact])
      expect(primary.get(exact)?.status).toBe(404)
      // 2) explicit re-confirmation = fresh GET that must NOT return the
      //    cached HEAD 404: only the raw GET verdict may justify rejection.
      const reconfirm = await verifyUrlsLiveGet([exact])
      expect(reconfirm.get(exact)?.status).toBe(200)
      expect(calls).toEqual([
        { url: exact, method: 'HEAD' },
        { url: exact, method: 'GET' },
      ])
      // 3) the primary probe is still cache-served: the GET neither replaced
      //    nor invalidated the cached HEAD entry.
      const cachedPrimary = await verifyUrlsLive([exact])
      expect(cachedPrimary.get(exact)?.status).toBe(404)
      expect(calls).toEqual([
        { url: exact, method: 'HEAD' },
        { url: exact, method: 'GET' },
      ])
      expect(classifyLiveStatus(exact, 404).ok).toBe(false)
      expect(
        classifyBatchARow(row({ target_url: exact }), primary.get(exact), reconfirm.get(exact)),
      ).toBe('head_dead_unconfirmed')

      // 4) a GET re-confirmation never populates the primary HEAD cache: a
      //    later primary probe of the same exact target must still fetch.
      const fresh = 'https://legal.yousafeconsultancy.com/us/get-first/'
      const getFirst = await verifyUrlsLiveGet([fresh])
      expect(getFirst.get(fresh)?.status).toBe(200)
      const headAfterGet = await verifyUrlsLive([fresh])
      expect(headAfterGet.get(fresh)?.status).toBe(404)
      expect(calls).toEqual([
        { url: exact, method: 'HEAD' },
        { url: exact, method: 'GET' },
        { url: fresh, method: 'GET' },
        { url: fresh, method: 'HEAD' },
      ])

      // 5) relative / non-http(s) inputs are refused with status 0 and never fetched.
      const refused = await verifyUrlsLiveGet([
        '/relative/target',
        'mailto:someone@example.com',
        'https://',
      ])
      expect(refused.get('/relative/target')).toEqual({
        ok: false,
        status: 0,
        finalUrl: '/relative/target',
      })
      expect(refused.get('mailto:someone@example.com')?.status).toBe(0)
      expect(refused.get('https://')?.status).toBe(0)
      expect(calls).toHaveLength(4)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
